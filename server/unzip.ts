// 받은 배포본 zip을 읽고 푸는 곳. 바깥 라이브러리 없이 Node 내장(zlib의 inflateRaw와 crc32)만으로 직접 읽는다.
//
// 푸는 것은 GitHub이 알려 준 지문(SHA-256)과 크기가 맞은 zip뿐이다(install.ts). 그래도 zip 안의 이름과 크기는 믿지 않는다:
// - 이름: 위로 올라가기(..), 절대 경로, 드라이브 문자(C:), 역슬래시, 윈도우 예약 이름(CON 같은), 끝의 점과 빈칸, 짧은 이름(DIST-N~1),
//   제어 문자, NFC가 아닌 이름, 대소문자만 다른 같은 이름, 파일과 폴더가 겹치는 이름은 받지 않는다.
// - 종류: 일반 파일과 폴더만. 심볼릭 링크와 장치 같은 항목, 윈도우의 재분석 지점(reparse point)은 받지 않는다.
// - 크기: 항목 수, 항목 하나, 풀린 전체의 상한을 먼저 보고, 풀면서도 알려 준 크기를 넘는 순간 멈춘다(zip 폭탄).
//   항목끼리 겹쳐 같은 바이트를 여러 번 쓰는 zip도 받지 않는다.
// - 꼴: 암호, 모르는 압축 방식, ZIP64, 여러 조각으로 나눈 zip은 받지 않는다. 배포본(scripts/zip.mjs)은 이것을 쓰지 않는다.
// - 내용: 항목마다 CRC-32와 크기가 맞아야 한다.
// 실패는 정해진 말(ZipError)로만 알린다. 이름과 경로는 내보내지 않는다.

import { createReadStream, createWriteStream, mkdirSync } from 'node:fs'
import { open, type FileHandle } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { crc32, createInflateRaw } from 'node:zlib'

export interface ZipLimits {
  entries: number
  /** 항목 하나가 풀린 크기 */
  entryBytes: number
  /** 풀린 전체 크기 */
  totalBytes: number
}

/** format: zip 꼴이 아니거나 이 읽기가 다루지 않는 꼴 / unsafe: 위험한 이름이나 종류 / too_big: 상한을 넘는다 */
type ZipError = 'format' | 'unsafe' | 'too_big'
/** 풀다가: space는 디스크가 찼다, write는 쓰지 못했다(권한, 막힘) */
type UnzipError = ZipError | 'space' | 'write'

export interface ZipEntry {
  name: string
  dir: boolean
  method: 0 | 8
  crc: number
  compressed: number
  size: number
  /** 압축된 내용이 시작하는 곳 */
  dataStart: number
  /** 유닉스에서 실행 권한이 붙은 파일(맥의 node, .command) */
  executable: boolean
}

const EOCD = 0x06054b50
const CENTRAL = 0x02014b50
const LOCAL = 0x04034b50
const UTF8 = 1 << 11
/** 데이터 기술자(3비트): 크기를 내용 뒤에 적는다. 중앙 목록의 크기를 쓰므로 받는다 */
const DESCRIPTOR = 1 << 3
/** 암호(0, 6비트), 패치 데이터(5비트), 가린 머리(13비트) */
const UNSUPPORTED = (1 << 0) | (1 << 5) | (1 << 6) | (1 << 13)
const MAX = 0xffffffff
/** 중앙 목록의 상한. 항목 수백 개의 배포본은 몇십 KB다 */
const MAX_CENTRAL = 16 * 1024 * 1024
const S_IFMT = 0o170000
const S_IFREG = 0o100000
const S_IFDIR = 0o040000
/** 윈도우 파일 속성: 폴더, 재분석 지점(링크) */
const DOS_DIR = 0x10
const DOS_REPARSE = 0x400

const RESERVED = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³]|conin\$|conout\$)(\.|$)/i

/**
 * zip 안의 이름이 이 PC의 어느 OS에서 풀어도 정한 폴더 안의 같은 자리 하나만 가리키는지.
 * /로만 나누고, 폴더 이름은 끝에 /가 붙는다
 */
export function safeName(name: string): boolean {
  if (!name || name.length > 240 || name !== name.normalize('NFC')) return false
  if (/[\\:*?"<>|\u0000-\u001f\u007f]/.test(name) || name.startsWith('/')) return false
  const parts = (name.endsWith('/') ? name.slice(0, -1) : name).split('/')
  // 윈도우의 짧은 이름(8.3, DIST-N~1)은 다른 폴더와 같은 자리를 가리킬 수 있다. 배포본 이름에는 ~가 없다
  return parts.every((p) => p !== '' && p !== '.' && p !== '..' && !/[. ]$/.test(p) && !RESERVED.test(p) && !/~\d/.test(p))
}

class Fail extends Error {
  constructor(readonly reason: UnzipError) {
    super(reason)
  }
}

async function readAt(fh: FileHandle, pos: number, len: number): Promise<Buffer> {
  const buf = Buffer.alloc(len)
  const { bytesRead } = await fh.read(buf, 0, len, pos)
  if (bytesRead !== len) throw new Fail('format')
  return buf
}

/** zip의 목록을 읽고 확인한다. 하나라도 약속과 다르면 정해진 말 */
export async function readZip(file: string, limits: ZipLimits): Promise<ZipEntry[] | ZipError> {
  let fh: FileHandle
  try {
    fh = await open(file, 'r')
  } catch {
    return 'format'
  }
  try {
    return await readEntries(fh, limits)
  } catch (e) {
    return e instanceof Fail && e.reason !== 'space' && e.reason !== 'write' ? e.reason : 'format'
  } finally {
    await fh.close()
  }
}

async function readEntries(fh: FileHandle, limits: ZipLimits): Promise<ZipEntry[] | ZipError> {
  const { size } = await fh.stat()
  if (size < 22) return 'format'
  // 끝 기록(EOCD)은 맨 끝에서 설명 글(최대 65535바이트) 앞에 있다. 설명 글 길이가 파일 끝과 꼭 맞는 것만
  const tailLen = Math.min(size, 22 + 0xffff)
  const tail = await readAt(fh, size - tailLen, tailLen)
  let at = -1
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tail.readUInt32LE(i) === EOCD && i + 22 + tail.readUInt16LE(i + 20) === tail.length) {
      at = i
      break
    }
  }
  if (at < 0) return 'format'
  const eocdPos = size - tailLen + at
  const [disk, cdDisk, onDisk, count] = [4, 6, 8, 10].map((o) => tail.readUInt16LE(at + o))
  const cdSize = tail.readUInt32LE(at + 12)
  const cdOffset = tail.readUInt32LE(at + 16)
  // ZIP64(0xFFFF, 0xFFFFFFFF로 적고 다른 기록을 본다)와 여러 조각 zip은 배포본에 없다
  if (disk || cdDisk || onDisk !== count || count === 0xffff || cdSize === MAX || cdOffset === MAX) return 'format'
  if (count === 0) return 'format'
  if (count > limits.entries || cdSize > MAX_CENTRAL) return 'too_big'
  // 목록은 끝 기록 바로 앞에 빈틈없이 있어야 한다
  if (cdOffset + cdSize !== eocdPos) return 'format'
  const cd = await readAt(fh, cdOffset, cdSize)

  const decoder = new TextDecoder('utf-8', { fatal: true })
  const found: { entry: ZipEntry; raw: Buffer; offset: number; flags: number }[] = []
  const keys = new Set<string>()
  let p = 0
  let total = 0
  for (let i = 0; i < count; i++) {
    if (p + 46 > cd.length || cd.readUInt32LE(p) !== CENTRAL) return 'format'
    const host = cd.readUInt16LE(p + 4) >> 8
    const flags = cd.readUInt16LE(p + 8)
    const method = cd.readUInt16LE(p + 10)
    const crc = cd.readUInt32LE(p + 16)
    const compressed = cd.readUInt32LE(p + 20)
    const usize = cd.readUInt32LE(p + 24)
    const nameLen = cd.readUInt16LE(p + 28)
    const extraLen = cd.readUInt16LE(p + 30)
    const commentLen = cd.readUInt16LE(p + 32)
    const diskStart = cd.readUInt16LE(p + 34)
    const external = cd.readUInt32LE(p + 38)
    const offset = cd.readUInt32LE(p + 42)
    const end = p + 46 + nameLen + extraLen + commentLen
    if (end > cd.length) return 'format'
    const raw = cd.subarray(p + 46, p + 46 + nameLen)
    p = end

    if (flags & UNSUPPORTED) return 'format'
    if (method !== 0 && method !== 8) return 'format'
    if (compressed === MAX || usize === MAX || offset === MAX || diskStart !== 0) return 'format'
    if (method === 0 && compressed !== usize) return 'format'
    let name: string
    try {
      name = decoder.decode(raw)
    } catch {
      return 'format'
    }
    // UTF-8 표시가 없는 이름은 옛 코드 페이지(CP437)라 뜻이 갈린다. 영문 이름만 받는다
    if (!(flags & UTF8) && /[^\x20-\x7e]/.test(name)) return 'format'
    if (!safeName(name)) return 'unsafe'
    const dir = name.endsWith('/')
    // 유닉스에서 만든 항목은 위 16비트가 파일 종류와 권한, 윈도우에서 만든 항목은 아래가 파일 속성
    const mode = host === 3 ? external >>> 16 : 0
    const kind = mode & S_IFMT
    if (kind && kind !== S_IFREG && kind !== S_IFDIR) return 'unsafe'
    if (host === 0 && external & DOS_REPARSE) return 'unsafe'
    // 종류와 이름(끝의 /)이 서로 다른 말을 하면 받지 않는다
    if ((kind === S_IFDIR && !dir) || (kind === S_IFREG && dir) || (host === 0 && external & DOS_DIR && !dir)) return 'unsafe'
    if (dir && usize !== 0) return 'format'
    if (usize > limits.entryBytes) return 'too_big'
    total += usize
    if (total > limits.totalBytes) return 'too_big'
    // 대소문자를 가리지 않는 윈도우, 맥에서 같은 자리가 되는 이름
    const key = (dir ? name.slice(0, -1) : name).toLowerCase()
    if (keys.has(key)) return 'unsafe'
    keys.add(key)
    const entry: ZipEntry = { name, dir, method: method as 0 | 8, crc, compressed, size: usize, dataStart: 0, executable: !dir && (mode & 0o111) !== 0 }
    found.push({ entry, raw, offset, flags })
  }
  if (p !== cd.length) return 'format'
  // 파일 이름이 다른 항목의 폴더 자리이면(a 와 a/b) 어느 OS에서는 덮이고 어느 OS에서는 실패한다
  const files = new Set(found.filter((f) => !f.entry.dir).map((f) => f.entry.name.toLowerCase()))
  for (const k of keys) {
    for (let i = k.indexOf('/'); i > 0; i = k.indexOf('/', i + 1)) if (files.has(k.slice(0, i))) return 'unsafe'
  }

  // 항목마다 앞 머리(local header)를 읽어 목록과 같은지, 내용이 서로 겹치지 않는지 본다
  found.sort((a, b) => a.offset - b.offset)
  let prevEnd = 0
  for (const f of found) {
    if (f.offset < prevEnd || f.offset + 30 > cdOffset) return 'format'
    const head = await readAt(fh, f.offset, 30)
    if (head.readUInt32LE(0) !== LOCAL) return 'format'
    const flags = head.readUInt16LE(6)
    const nameLen = head.readUInt16LE(26)
    const extraLen = head.readUInt16LE(28)
    if (head.readUInt16LE(8) !== f.entry.method || (flags & ~DESCRIPTOR) !== (f.flags & ~DESCRIPTOR)) return 'format'
    if (!(flags & DESCRIPTOR) && (head.readUInt32LE(14) !== f.entry.crc || head.readUInt32LE(18) !== f.entry.compressed || head.readUInt32LE(22) !== f.entry.size)) return 'format'
    if (nameLen !== f.raw.length || !(await readAt(fh, f.offset + 30, nameLen)).equals(f.raw)) return 'format'
    f.entry.dataStart = f.offset + 30 + nameLen + extraLen
    prevEnd = f.entry.dataStart + f.entry.compressed
    if (prevEnd > cdOffset) return 'format'
  }
  return found.map((f) => f.entry)
}

function failOf(e: unknown): UnzipError {
  if (e instanceof Fail) return e.reason
  const code = (e as NodeJS.ErrnoException | null)?.code ?? ''
  if (code === 'ENOSPC' || code === 'EDQUOT') return 'space'
  // zlib의 오류(Z_DATA_ERROR 같은): 압축된 내용이 망가졌다
  if (code.startsWith('Z_') || code.startsWith('ERR_ZLIB') || code === 'ERR_INVALID_STATE') return 'format'
  return 'write'
}

/** 한 항목을 풀어 쓴다. 알려 준 크기를 넘는 순간 멈추고, 다 쓰면 크기와 CRC-32를 맞춘다 */
async function writeEntry(file: string, e: ZipEntry, target: string, onBytes: (n: number) => void) {
  if (e.method === 8 && e.compressed === 0) throw new Fail('format')
  let count = 0
  let crc = 0
  const check = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      count += chunk.length
      if (count > e.size) return cb(new Fail('too_big'))
      crc = crc32(chunk, crc)
      onBytes(chunk.length)
      cb(null, chunk)
    },
  })
  const source = e.compressed > 0 ? createReadStream(file, { start: e.dataStart, end: e.dataStart + e.compressed - 1 }) : Readable.from([])
  // 'wx': 이미 있는 것은 덮지 않는다. 새로 만든 빈 폴더에만 푼다
  const out = createWriteStream(target, { flags: 'wx', mode: e.executable ? 0o755 : 0o644 })
  if (e.method === 8) await pipeline(source, createInflateRaw(), check, out)
  else await pipeline(source, check, out)
  if (count !== e.size || crc !== e.crc) throw new Fail('format')
}

/**
 * 고른 항목을 dest 안에 푼다. to는 dest 안의 자리(/로 나눔). dest는 부르는 쪽이 새로 만든 빈 폴더다.
 * 진행은 풀린 바이트로 알린다
 */
export async function extractZip(
  file: string,
  dest: string,
  items: { entry: ZipEntry; to: string }[],
  onProgress: (done: number) => void = () => {},
): Promise<'ok' | UnzipError> {
  const base = resolve(dest)
  let done = 0
  try {
    for (const { entry, to } of items) {
      if (!safeName(to)) throw new Fail('unsafe')
      const target = join(base, ...to.split('/').filter(Boolean))
      if (!resolve(target).startsWith(base + sep)) throw new Fail('unsafe')
      if (entry.dir) {
        mkdirSync(target, { recursive: true })
        continue
      }
      mkdirSync(dirname(target), { recursive: true })
      await writeEntry(file, entry, target, (n) => {
        done += n
        onProgress(done)
      })
    }
    return 'ok'
  } catch (e) {
    return failOf(e)
  }
}

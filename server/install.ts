// 받은 새 버전을 앱 폴더의 versions/X.Y.Z에 풀고 확인한다. 시작 프로그램(launch.ts)은 다 풀고 확인을 마친 폴더만 고른다.
//
// 1. zip을 versions 안의 제 사본(.part-….zip)으로 옮겨 적으며 SHA-256과 크기를 한 번 더 맞춘다. 이후로는 그 사본만 읽는다:
//    지문을 맞춘 파일과 푸는 파일이 같다(맞춘 뒤 '새 버전' 폴더의 zip이 바뀌어도 상관없다). 다 풀면 사본은 지운다.
// 2. zip을 읽어 모든 이름이 맨 위 폴더(gyeol-<버전>/) 안의 정해 둔 이름(PACKAGE_TOP)인지, 크기가 상한 안인지 본다(unzip.ts).
// 3. 디스크에 남은 자리를 보고, versions/.part-… 에 푼다. 앱 폴더 밖에는 쓰지 않는다.
// 4. 풀린 파일이 모두 그 크기로 남았는지(백신이 지우거나 막지 않았는지), 켜는 데 쓸 파일과 package.json의 버전이 맞는지 본다.
// 5. 준비 표시(.framo-ready, 풀린 파일마다의 크기)를 쓰고, 폴더째 versions/<버전>으로 이름을 바꾼다. 시작 프로그램은 이 이름과 표시를 보고,
//    켤 때마다 목록의 파일이 그대로 있는지도 본다.
// 하나라도 안 되면 푼 것을 지우고 정해진 말로 알린다. 화면은 사람이 직접 푸는 안내로 돌아간다.
//
// 맥: zip의 실행 권한(node, .command)을 그대로 남긴다. 이 서버(node)가 쓴 파일에는 격리 속성(com.apple.quarantine)이
// 붙지 않아(브라우저나 압축 풀기 앱만 붙인다) 따로 걷지 않는다. 함께 든 node는 nodejs.org의 서명, 공증을 받은 파일이다.

import { createHash, randomBytes } from 'node:crypto'
import { createReadStream, createWriteStream, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, statfsSync, type WriteStream } from 'node:fs'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { InstallError as UpdateInstallError } from '../src/update/protocol'
import { extractZip, readZip, type ZipLimits } from './unzip'
import { compareVersions, listVersions, requiredFiles, VERSION_NAME, VERSIONS_DIR, writeReady } from './versions'

/** 풀지 못한 까닭(약속은 화면과 같이 쓰는 protocol.ts). 'start'는 시작 프로그램이 정하는 것이라 여기서는 쓰지 않는다 */
type InstallError = Exclude<UpdateInstallError, 'start'>

/**
 * 배포본 zip의 맨 위 폴더 안에 둘 수 있는 이름. 지우거나 바꾸지 않는다: 이미 깔린 버전은 이 목록에 없는 이름이 든 새 zip을
 * 풀지 않고 사람이 푸는 안내로 돌아간다. 새 이름을 넣고 싶으면 dist나 dist-node 안에 둔다(scripts/pack.mjs가 확인한다)
 */
export const PACKAGE_TOP: readonly string[] = ['Framo.exe', 'Framo 시작.bat', 'Framo 시작.command', '사용법.txt', '오픈소스 라이선스.txt', 'package.json', 'dist', 'dist-node', 'node']

const MB = 1024 * 1024
/** 배포본은 항목 수백 개, 가장 큰 파일은 node(100MB 남짓), 풀면 맥용이 250MB 남짓이다. 넉넉히 잡되 디스크를 채우지 못하게 */
const ZIP_LIMITS: ZipLimits = { entries: 20_000, entryBytes: 400 * MB, totalBytes: 1024 * MB }
/** 풀고 나서도 남겨 둘 자리 */
const SPARE_BYTES = 64 * MB

function isFile(file: string): boolean {
  try {
    return lstatSync(file).isFile()
  } catch {
    return false
  }
}

function isDir(dir: string): boolean {
  try {
    return lstatSync(dir).isDirectory()
  } catch {
    return false
  }
}

/**
 * 받은 zip을 to(새로 만드는 제 사본, 이 사용자만 읽고 쓴다)로 옮겨 적으며 크기와 SHA-256을 맞춘다.
 * 맞으면 'ok', 다르거나 읽지 못하면 'verify'(사본은 지운다). 지문을 맞춘 바이트가 곧 풀 바이트다
 */
async function copyVerified(from: string, to: string, size: number, sha256: string): Promise<'ok' | 'verify' | 'space' | 'write'> {
  const hash = createHash('sha256')
  let n = 0
  const check = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      n += chunk.length
      if (n > size) return cb(new Error('too big'))
      hash.update(chunk)
      cb(null, chunk)
    },
  })
  let out: WriteStream
  try {
    out = createWriteStream(to, { flags: 'wx', mode: 0o600 })
  } catch {
    return 'write'
  }
  let wrote: NodeJS.ErrnoException | null = null
  out.on('error', (e) => (wrote = e))
  const result = await pipeline(createReadStream(from), check, out).then(
    () => (n === size && hash.digest('hex') === sha256 ? ('ok' as const) : ('verify' as const)),
    () => {
      const code = (wrote as NodeJS.ErrnoException | null)?.code
      return code === 'ENOSPC' || code === 'EDQUOT' ? ('space' as const) : wrote ? ('write' as const) : ('verify' as const)
    },
  )
  if (result !== 'ok') await rm(to, { force: true }).catch(() => {})
  return result
}

/** 남은 디스크 자리가 넉넉한지. 잴 수 없는 곳이면 쓰면서 알게 된다(ENOSPC) */
function roomFor(dir: string, bytes: number): boolean {
  try {
    const st = statfsSync(dir)
    return st.bavail * st.bsize >= bytes + SPARE_BYTES
  } catch {
    return true
  }
}

/** versions 폴더를 진짜 폴더로. 그 자리가 링크면(앱 폴더 밖을 가리킬 수 있다) 쓰지 않는다 */
function versionsFolder(home: string): string | null {
  const root = join(home, VERSIONS_DIR)
  try {
    mkdirSync(root, { recursive: true })
  } catch {
    return null
  }
  return isDir(root) ? root : null
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** 이름 바꾸기. 윈도우는 백신이 막 쓴 파일을 들여다보는 동안 폴더 이름을 바꾸지 못해(EPERM, EBUSY) 잠깐 기다렸다 다시 한다 */
async function renameSoon(from: string, to: string): Promise<boolean> {
  for (let i = 0; i < 20; i++) {
    try {
      renameSync(from, to)
      return true
    } catch {
      await sleep(250)
    }
  }
  return false
}

/** 버전 폴더를 치운다: 먼저 다른 이름으로 옮겨(시작 프로그램이 고르지 않게) 지운다. 쓰는 중이라 옮기지 못하면 false */
async function discard(root: string, dir: string): Promise<boolean> {
  const trash = join(root, `.trash-${randomBytes(4).toString('hex')}`)
  try {
    renameSync(dir, trash)
  } catch {
    return false
  }
  await rm(trash, { recursive: true, force: true }).catch(() => {})
  return true
}

function packageIs(dir: string, version: string): boolean {
  try {
    const v = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { name?: unknown; version?: unknown }
    return v.name === 'gyeol' && v.version === version
  } catch {
    return false
  }
}

interface InstallOptions {
  /** 받아서 지문을 맞춘 zip */
  zip: string
  size: number
  sha256: string
  /** 앱 폴더 */
  home: string
  version: string
  platform: NodeJS.Platform
  arch: string
  /** 풀린 바이트, 풀 전체 */
  onProgress?: (done: number, total: number) => void
}

export async function installVersion(o: InstallOptions): Promise<'ok' | InstallError> {
  if (!VERSION_NAME.test(o.version)) return 'layout'
  const root = versionsFolder(o.home)
  if (!root) return 'write'
  const existing = listVersions(o.home, o.platform, o.arch).find((v) => v.version === o.version)
  if (existing?.ready && !existing.failed) return 'ok'
  if (!roomFor(root, o.size)) return 'space'
  const copy = join(root, `.part-${o.version}-${randomBytes(4).toString('hex')}.zip`)
  const copied = await copyVerified(o.zip, copy, o.size, o.sha256)
  if (copied !== 'ok') return copied
  try {
    return await installFrom(copy, root, existing !== undefined, o)
  } finally {
    await rm(copy, { force: true }).catch(() => {})
  }
}

/** 지문을 맞춘 사본(zip)에서 푼다 */
async function installFrom(zip: string, root: string, existing: boolean, o: InstallOptions): Promise<'ok' | InstallError> {
  const final = join(root, o.version)
  const entries = await readZip(zip, ZIP_LIMITS)
  if (typeof entries === 'string') return 'layout'
  const top = `gyeol-${o.version}/`
  const items: { entry: (typeof entries)[number]; to: string }[] = []
  for (const entry of entries) {
    if (!entry.name.startsWith(top)) return 'layout'
    const to = entry.name.slice(top.length)
    if (!to) continue
    if (!PACKAGE_TOP.includes(to.split('/')[0])) return 'layout'
    items.push({ entry, to })
  }
  const total = items.reduce((n, i) => n + i.entry.size, 0)
  if (!roomFor(root, total)) return 'space'
  // 지난번에 다 풀지 못하고 남은 같은 버전 폴더는 치운다
  if (existing && !(await discard(root, final))) return 'blocked'

  const part = join(root, `.part-${o.version}-${randomBytes(4).toString('hex')}`)
  try {
    mkdirSync(part)
  } catch {
    return 'write'
  }
  const result = await (async (): Promise<'ok' | InstallError> => {
    const r = await extractZip(zip, part, items, (done) => o.onProgress?.(done, total))
    if (r !== 'ok') return r === 'space' || r === 'write' ? r : 'layout'
    // 백신이 그새 지우거나 비운 파일이 없는지
    for (const { entry, to } of items) {
      if (entry.dir) continue
      try {
        if (lstatSync(join(part, ...to.split('/'))).size !== entry.size) return 'blocked'
      } catch {
        return 'blocked'
      }
    }
    const need = requiredFiles(o.platform, o.arch)
    if (!need.every((f) => isFile(join(part, ...f.split('/'))))) return 'layout'
    // 맥, 리눅스: node에 실행 권한이 남았는지
    if (o.platform !== 'win32' && process.platform !== 'win32') {
      const node = need.find((f) => f.startsWith('node/'))
      if (node && !(lstatSync(join(part, ...node.split('/'))).mode & 0o100)) return 'layout'
    }
    if (!packageIs(part, o.version)) return 'layout'
    try {
      writeReady(part, o.version, Object.fromEntries(items.filter((i) => !i.entry.dir).map((i) => [i.to, i.entry.size])))
    } catch (e) {
      return (e as NodeJS.ErrnoException).code === 'ENOSPC' ? 'space' : 'write'
    }
    return (await renameSoon(part, final)) ? 'ok' : 'blocked'
  })()
  if (result !== 'ok') await rm(part, { recursive: true, force: true }).catch(() => {})
  return result
}

/** 지금 버전보다 새 버전 폴더. 받아 두고 아직 켜지 않았거나(ready), 켜 보았는데 켜지지 않은(failed) 것 */
export function newerVersion(home: string, current: string, platform: NodeJS.Platform, arch: string) {
  return listVersions(home, platform, arch).find((v) => compareVersions(v.version, current) > 0 && (v.ready || v.failed)) ?? null
}

/**
 * 쓰지 않을 버전 폴더를 지운다. 남기는 것: 지금 버전, 바로 앞 버전(켜지지 않으면 돌아갈 곳. 앱 폴더의 버전 base보다 새것만),
 * 지금보다 새 버전 가운데 가장 새것(받아 두고 아직 켜지 않았거나, 켜지지 않았다는 표시를 남겨 둘 것).
 * 풀다 만 폴더와 지우다 만 폴더도 치운다. 다른 프로그램(AI 연결의 MCP 서버)이 쓰고 있어 옮기지 못하는 폴더는 다음에 켤 때 다시 해 본다
 */
export async function cleanVersions(home: string, current: string, base: string, platform: NodeJS.Platform, arch: string): Promise<void> {
  const root = join(home, VERSIONS_DIR)
  if (!isDir(root)) return
  const all = listVersions(home, platform, arch)
  const keep = new Set([current])
  const newer = all.find((v) => compareVersions(v.version, current) > 0)
  if (newer) keep.add(newer.version)
  const prev = all.find((v) => compareVersions(v.version, current) < 0 && compareVersions(v.version, base) > 0 && v.ready && !v.failed)
  if (prev) keep.add(prev.version)
  for (const v of all) if (!keep.has(v.version)) await discard(root, v.dir)
  let names: string[] = []
  try {
    names = readdirSync(root)
  } catch {
    return
  }
  // 풀다 만 폴더, 지문을 맞춰 옮겨 둔 zip 사본, 지우다 만 폴더(링크면 링크만 지운다)
  for (const n of names) {
    if (/^\.(part|trash)-/.test(n)) await rm(join(root, n), { recursive: true, force: true }).catch(() => {})
  }
}

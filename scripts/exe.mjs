// 윈도우용 Framo.exe를 만든다. Node.js의 단일 실행 파일(SEA) 기능으로, 공식 node.exe에 launch/framo-exe.cjs를 넣는다.
//
// 1. 같은 판의 node로 framo-exe.cjs를 SEA 덩어리(blob)로 만든다. 코드 캐시, 스냅숏은 쓰지 않아서 맥에서 만든 덩어리도
//    윈도우 node.exe에 들어간다.
// 2. node.exe를 복사하고 Node.js의 서명을 걷어 낸다. 고친 파일에 남은 서명은 맞지 않는 서명이라, 서명이 없는 것보다
//    백신이 더 의심한다.
// 3. resedit로 아이콘(launch/framo.ico)과 파일 정보(Framo, 버전)를 바꾼다. 순수 JavaScript라 맥에서 묶어도 들어간다.
//    (예전에는 rcedit를 썼는데 윈도우 프로그램이라 맥에서는 아이콘 없는 exe가 됐고, npm에서 지원이 끝났다)
// 4. postject로 덩어리를 넣고, 그다음에 3을 한다(아래 buildExe의 차례).
//
// resedit, postject는 만들 때만 쓰는 도구다(devDependencies, MIT). 받는 사람 PC에는 들어가지 않는다.

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
/** Node.js가 SEA 덩어리가 들었는지 보는 표시. 넣으면 끝의 0이 1로 바뀐다 */
const SEA_FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2'

/**
 * PE(윈도우 실행 파일)에서 Authenticode 서명을 걷어 낸 새 Buffer. 서명이 없으면 그대로.
 * 서명은 파일 끝에 붙고 머리의 '보안' 목록 칸(데이터 디렉터리 4번)이 그 자리를 가리킨다. 칸을 비우고 끝을 자른다.
 * @param {Buffer} buf
 */
export function stripSignature(buf) {
  if (buf.length < 0x40 || buf.toString('latin1', 0, 2) !== 'MZ') throw new Error('윈도우 실행 파일이 아니에요')
  const pe = buf.readUInt32LE(0x3c)
  if (buf.toString('latin1', pe, pe + 4) !== 'PE\0\0') throw new Error('윈도우 실행 파일이 아니에요')
  const opt = pe + 4 + 20
  const magic = buf.readUInt16LE(opt)
  // PE32+(64비트)는 데이터 디렉터리가 112바이트 뒤, PE32는 96바이트 뒤
  const dirs = opt + (magic === 0x20b ? 112 : magic === 0x10b ? 96 : NaN)
  if (Number.isNaN(dirs)) throw new Error('윈도우 실행 파일이 아니에요')
  const entry = dirs + 4 * 8
  const at = buf.readUInt32LE(entry)
  const size = buf.readUInt32LE(entry + 4)
  if (size === 0) return buf
  // 서명은 8바이트로 맞춘 끝에만 붙는다. 다른 데 있으면 이 파일을 모르는 꼴로 보고 멈춘다
  if (at + size > buf.length || buf.length - (at + size) > 7) throw new Error('서명이 파일 끝에 있지 않아요')
  const out = Buffer.from(buf.subarray(0, at))
  out.writeUInt32LE(0, entry)
  out.writeUInt32LE(0, entry + 4)
  return out
}

/** 탐색기의 '자세히' 탭과 작업 관리자에 보이는 정보 */
export function exeInfo(version) {
  return {
    strings: {
      FileDescription: 'Framo',
      ProductName: 'Framo',
      CompanyName: 'Framo',
      InternalName: 'Framo',
      OriginalFilename: 'Framo.exe',
      // 고친 Node.js라서 Node.js의 저작권 표시도 남긴다 (라이선스 전문은 node\LICENSE.txt)
      LegalCopyright: 'Framo contributors. Built on Node.js (Copyright Node.js contributors). MIT license.',
      FileVersion: version,
      ProductVersion: version,
    },
    version,
  }
}

/**
 * exe의 아이콘과 파일 정보를 바꾼 새 Buffer. Node.js의 아이콘 묶음(첫 아이콘 그룹)을 Framo 아이콘으로 바꾸고,
 * 파일 정보는 Node.js가 넣어 둔 언어 그대로 글을 바꾼다(없으면 미국 영어, 유니코드)
 * @param {Buffer} buf
 * @param {Buffer} ico
 * @param {string} version
 */
async function setIconAndInfo(buf, ico, version) {
  const { NtExecutable, NtExecutableResource, Data, Resource } = await import('resedit')
  const exe = NtExecutable.from(buf, { ignoreCert: true })
  const res = NtExecutableResource.from(exe)
  const groups = Resource.IconGroupEntry.fromEntries(res.entries)
  const group = groups[0] ?? { id: 1, lang: 1033 }
  const icons = Data.IconFile.from(ico).icons.map((i) => i.data)
  Resource.IconGroupEntry.replaceIconsForResource(res.entries, group.id, group.lang, icons)
  const info = exeInfo(version)
  const vi = Resource.VersionInfo.fromEntries(res.entries)[0] ?? Resource.VersionInfo.createEmpty()
  const langs = vi.getAllLanguagesForStringValues()
  for (const lang of langs.length ? langs : [{ lang: 1033, codepage: 1200 }]) vi.setStringValues(lang, info.strings)
  const [a, b, c] = version.split('.').map(Number)
  vi.setFileVersion(a, b, c, 0, 1033)
  vi.setProductVersion(a, b, c, 0, 1033)
  vi.outputToResourceEntries(res.entries)
  res.outputResource(exe)
  return Buffer.from(exe.generate())
}

/**
 * @param {object} o
 * @param {string} o.nodeExe 공식 win-x64 node.exe
 * @param {string} o.blobNode 덩어리를 만들 node. nodeExe와 같은 판이어야 한다
 * @param {string} o.out 만들 Framo.exe
 * @param {string} o.work 잠깐 쓸 폴더
 * @param {string} o.version
 * @returns {Promise<{ icon: boolean }>}
 */
export async function buildExe({ nodeExe, blobNode, out, work, version }) {
  const config = join(work, 'sea-config.json')
  const blob = join(work, 'sea.blob')
  writeFileSync(
    config,
    JSON.stringify({ main: join(root, 'launch', 'framo-exe.cjs'), output: blob, disableExperimentalSEAWarning: true, useSnapshot: false, useCodeCache: false }),
  )
  execFileSync(blobNode, ['--experimental-sea-config', config], { cwd: work, stdio: 'inherit' })

  const ico = join(root, 'launch', 'framo.ico')
  writeFileSync(out, stripSignature(readFileSync(nodeExe)))
  const icon = true

  const { inject } = (await import('postject')).default
  await inject(out, 'NODE_SEA_BLOB', readFileSync(blob), { sentinelFuse: SEA_FUSE })
  // 아이콘과 파일 정보는 덩어리를 넣은 뒤에: resedit가 쓴 파일을 postject(LIEF)가 다시 읽으면 재배치 표가 깨졌다고
  // 알렸다. resedit는 리소스를 모두 읽어 다시 쓰므로 넣어 둔 덩어리(NODE_SEA_BLOB)도 그대로 남는다
  writeFileSync(out, await setIconAndInfo(readFileSync(out), readFileSync(ico), version))

  // 덩어리를 넣으며 리소스를 다시 쓰므로, 다 만든 파일에 덩어리와 아이콘이 남았는지 본다
  const exe = readFileSync(out)
  if (!exe.includes(`${SEA_FUSE}:1`)) throw new Error('Framo.exe에 SEA 덩어리가 들어가지 않았어요')
  if (icon && !icoImages(readFileSync(ico)).every((png) => exe.includes(png))) throw new Error('Framo.exe에 아이콘이 들어가지 않았어요')
  return { icon }
}

/** .ico 안의 그림들. 윈도우 리소스에는 그림이 그대로 들어가므로 exe에서 찾을 수 있다 */
export function icoImages(ico) {
  return Array.from({ length: ico.readUInt16LE(4) }, (_, i) => {
    const at = 6 + 16 * i
    const offset = ico.readUInt32LE(at + 12)
    return ico.subarray(offset, offset + ico.readUInt32LE(at + 8))
  })
}

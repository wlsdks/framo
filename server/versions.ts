// 앱 폴더 안의 버전 폴더(versions/X.Y.Z). 시작 프로그램(launch.ts), 로컬 서버, MCP 서버가 같이 쓴다.
//
//   <앱 폴더>/                    처음 푼 Framo. 시작 파일(Framo.exe, 'Framo 시작.bat', 'Framo 시작.command')과 그 버전의 dist, dist-node, node
//   ├─ AI 공유/, 새 버전/          버전이 바뀌어도 그대로 이어지는 것은 늘 앱 폴더에 둔다
//   └─ versions/
//      ├─ 0.9.0/                  새 버전을 받아 풀고 확인한 것 (zip 안의 gyeol-0.9.0/ 그대로)
//      │  └─ .framo-ready         다 풀고 확인을 마쳤다는 표시. 맨 마지막에 쓰고, 이것이 든 폴더째 이름을 바꿔 내놓는다
//      └─ .part-…, .trash-…       푸는 중, 지우는 중. 버전 이름 꼴이 아니라 고르지 않는다
//
// 이 파일의 약속(폴더 이름, 표시 파일, 끝 코드, 알림 말)은 이미 깔린 시작 프로그램에 들어 있다. 앱 폴더의 시작 프로그램은
// 처음 푼 버전 그대로 계속 쓰이므로, 뒤의 버전도 이 약속을 그대로 지켜야 한다. 바꾸지 말고 더하기만 한다.
// Node 내장만 쓴다(시작 프로그램이 이 파일을 묶어 간다).

import { lstatSync, readdirSync, readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

export const VERSIONS_DIR = 'versions'
/** 다 풀고 확인을 마친 버전 폴더의 표시 */
export const READY_FILE = '.framo-ready'
export const READY_FORMAT = 'framo/version'
/** 시작 프로그램이 켜 보았는데 켜지지 않은 버전의 표시. 이 버전은 다시 고르지 않는다 */
export const FAILED_FILE = '.framo-failed'

/** 서버가 이 코드로 끝나면 시작 프로그램이 가장 새 버전으로 다시 켠다 */
export const RESTART_CODE = 75
/** 서버가 까닭(포트를 다른 프로그램이 씀 같은)을 보이고 끝냈다. 버전 탓이 아니라 이전 버전으로 돌아가지 않는다 */
export const FAIL_CODE = 78
/** 시작 프로그램이 서버에 붙이는 환경 변수: 다시 켜 줄 시작 프로그램이 있다 */
export const LAUNCHER_ENV = 'FRAMO_LAUNCHER'
/** 다시 켠 서버: 브라우저 창을 새로 열지 않는다(열린 창이 같은 주소로 다시 붙는다) */
export const RESTARTED_ENV = 'FRAMO_RESTARTED'
/** 서버가 127.0.0.1에 자리를 잡았을 때 시작 프로그램에 보내는 말(IPC). 이 말을 보내기 전에 끝난 버전은 켜지지 않은 것이다 */
export const LISTENING = 'framo:listening'

/** 버전 폴더 이름: 앞에 0이 붙지 않은 X.Y.Z만 */
export const VERSION_NAME = /^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/

/** 'X.Y.Z'를 견준다. a가 새것이면 양수. 꼴이 틀리면 NaN이라 어느 비교도 참이 아니다(새 버전으로 보지 않는다) */
export function compareVersions(a: string, b: string): number {
  const pa = /^(\d+)\.(\d+)\.(\d+)$/.exec(a)
  const pb = /^(\d+)\.(\d+)\.(\d+)$/.exec(b)
  if (!pa || !pb) return NaN
  for (let i = 1; i <= 3; i++) {
    const d = Number(pa[i]) - Number(pb[i])
    if (d) return Math.sign(d)
  }
  return 0
}

/** 배포본 폴더 안의 node. 윈도우는 node\node.exe, 맥은 이 맥에 맞는 쪽(애플 실리콘 arm64, 인텔 x64). 배포본이 없는 OS는 null */
export function nodeIn(dir: string, platform: NodeJS.Platform, arch: string): string | null {
  if (platform === 'win32') return join(dir, 'node', 'node.exe')
  if (platform === 'darwin') return join(dir, 'node', arch === 'arm64' ? 'arm64' : 'x64', 'node')
  return null
}

/** 버전 폴더에서 켜는 데 꼭 있어야 하는 파일(앱 폴더 기준 상대 경로, /로) */
export function requiredFiles(platform: NodeJS.Platform, arch: string): string[] {
  const node = nodeIn('', platform, arch)
  return ['dist/index.html', 'dist-node/serve.mjs', 'dist-node/gyeol-mcp.mjs', ...(node ? [node.split(/[\\/]/).join('/')] : [])]
}

/**
 * 코드가 든 폴더에서 앱 폴더를 찾는다. <앱>/versions/X.Y.Z 안에서 돌면 <앱>, 아니면 그 폴더 자신.
 * 'AI 공유'와 받은 파일, AI에 등록한 MCP 서버 경로는 버전이 바뀌어도 그대로여야 해서 늘 앱 폴더를 쓴다.
 * 이름만 보지 않고 준비 표시(.framo-ready)가 있을 때만 버전 폴더로 본다: 사람이 zip을 versions\0.9.0 같은 곳에 직접 풀었으면
 * 그 위의 위는 앱 폴더가 아니다(그곳의 versions를 치우거나 받은 파일을 두면 앱 밖의 폴더를 건드린다)
 */
export function appHome(codeRoot: string): string {
  const parent = dirname(codeRoot)
  const inVersions = basename(parent) === VERSIONS_DIR && VERSION_NAME.test(basename(codeRoot)) && realFile(join(codeRoot, READY_FILE))
  return inVersions ? dirname(parent) : codeRoot
}

/** 링크가 아닌 진짜 파일인지. 링크를 따라가면 버전 폴더 밖의 것을 켜게 된다 */
function realFile(file: string): boolean {
  try {
    return lstatSync(file).isFile()
  } catch {
    return false
  }
}

function realDir(dir: string): boolean {
  try {
    return lstatSync(dir).isDirectory()
  } catch {
    return false
  }
}

/** 표시 파일이 이 버전을 말하는지. 작은 JSON 하나라 크면 읽지 않는다 */
function readyMark(dir: string, version: string): boolean {
  const file = join(dir, READY_FILE)
  try {
    const st = lstatSync(file)
    if (!st.isFile() || st.size > 4096) return false
    const v = JSON.parse(readFileSync(file, 'utf8')) as unknown
    return typeof v === 'object' && v !== null && (v as { format?: unknown }).format === READY_FORMAT && (v as { version?: unknown }).version === version
  } catch {
    return false
  }
}

interface VersionDir {
  version: string
  dir: string
  /** 다 풀고 확인을 마쳤고, 켜는 데 쓸 파일이 다 있다 */
  ready: boolean
  /** 켜 보았는데 켜지지 않았다 */
  failed: boolean
}

/** versions/ 안의 버전 폴더들. 새것부터. versions가 링크이거나 없으면 빈 목록 */
export function listVersions(home: string, platform: NodeJS.Platform, arch: string): VersionDir[] {
  const root = join(home, VERSIONS_DIR)
  if (!realDir(root)) return []
  let names: string[]
  try {
    names = readdirSync(root)
  } catch {
    return []
  }
  const need = requiredFiles(platform, arch)
  const hasNode = nodeIn('', platform, arch) !== null
  return names
    .filter((n) => VERSION_NAME.test(n) && realDir(join(root, n)))
    .sort((a, b) => compareVersions(b, a))
    .map((version) => {
      const dir = join(root, version)
      const ready = hasNode && readyMark(dir, version) && need.every((f) => realFile(join(dir, ...f.split('/'))))
      return { version, dir, ready, failed: existsMark(join(dir, FAILED_FILE)) }
    })
}

function existsMark(file: string): boolean {
  try {
    lstatSync(file)
    return true
  } catch {
    return false
  }
}

/** 켤 수 있는 새 버전들(앱 폴더의 버전 base보다 새것만, 켜지지 않았던 것은 빼고). 새것부터 */
export function readyVersions(home: string, base: string, platform: NodeJS.Platform, arch: string): VersionDir[] {
  return listVersions(home, platform, arch).filter((v) => v.ready && !v.failed && compareVersions(v.version, base) > 0)
}

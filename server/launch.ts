// 시작 프로그램. Framo.exe(launch/framo-exe.cjs), 'Framo 시작.bat', 'Framo 시작.command'가 모두 이 파일(dist-node/launch.mjs)로 켠다.
//
// 1. 켤 버전을 고른다: 받아서 풀고 확인을 마친 새 버전(versions/X.Y.Z) 가운데 가장 새것, 없으면 이 앱 폴더의 버전.
// 2. 그 버전의 node로 그 버전의 서버(dist-node/serve.mjs)를 자식으로 띄운다. 창(콘솔)은 이 프로그램의 것을 같이 쓴다.
// 3. 서버가 '다시 켜기' 코드(RESTART_CODE)로 끝나면 1부터 다시: '지금 다시 시작'을 누르면 새 버전으로 바뀐다.
// 4. 새 버전의 서버가 자리를 잡기 전에 끝나면(켜지지 않으면) 그 버전에 표시를 남기고 바로 앞 버전으로 켠다.
//
// 이 파일은 처음 푼 앱 폴더의 것을 계속 쓴다(Framo.exe에 든 시작 코드가 이 파일을 부른다). 새 버전이 나와도 바뀌지 않으므로
// 단순하게 두고, 서버와의 약속은 versions.ts의 것만 쓴다. 다른 곳에서 받은 실행 파일은 켜지 않는다:
// 켜는 것은 앱 폴더의 node, 아니면 받은 zip의 지문을 맞추고 다 풀어 확인을 마친 버전 폴더의 node뿐이다.

import { spawn } from 'node:child_process'
import { realpathSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { version as BASE } from '../package.json'
import { appHome, FAIL_CODE, FAILED_FILE, LAUNCHER_ENV, LISTENING, nodeIn, readyVersions, RESTART_CODE, RESTARTED_ENV } from './versions'

/** 켤 버전 하나 */
export interface Run {
  version: string
  /** 버전 폴더(앱 폴더 자신이거나 versions/X.Y.Z) */
  dir: string
  node: string
}

/** 서버 하나를 띄운 결과 */
export interface Ran {
  /** 127.0.0.1에 자리를 잡았다고 알려 왔다 */
  listening: boolean
  code: number | null
  signal: NodeJS.Signals | null
  /** node를 띄우지도 못했다(없거나 막혔다) */
  spawnFailed: boolean
}

interface SuperviseOptions {
  home: string
  /** 지금 켤 차례: 새것부터, 마지막은 앱 폴더의 버전. skip은 이번에 켜지지 않은 버전 */
  pick(skip: ReadonlySet<string>): Run[]
  run(run: Run, restarted: boolean): Promise<Ran>
  /** 켜지지 않은 버전에 표시를 남긴다 */
  markFailed(run: Run): void
  say(message: string): void
}

/** 버전 탓으로 켜지지 않았는지: 자리를 잡기 전에, 사람이 끄지 않았는데, 까닭을 보이지 않고 끝났다 */
function broken(r: Ran): boolean {
  if (r.listening) return false
  if (r.spawnFailed) return true
  return r.signal === null && r.code !== 0 && r.code !== FAIL_CODE
}

/** 서버를 켜고 지켜본다. 이 프로그램이 끝날 코드를 돌려준다 */
export async function supervise(o: SuperviseOptions): Promise<number> {
  const skip = new Set<string>()
  let restarted = false
  for (;;) {
    const run = o.pick(skip)[0]
    const r = await o.run(run, restarted)
    // 자리를 잡았던 서버만 다시 켠다. 켜자마자 이 코드로 끝나는 서버를 끝없이 다시 켜지 않게
    if (r.code === RESTART_CODE && r.listening) {
      restarted = true
      continue
    }
    if (broken(r) && run.dir !== o.home) {
      o.markFailed(run)
      skip.add(run.version)
      o.say(`새 버전(${run.version})을 켜지 못해서 이전 버전으로 켤게요.`)
      continue
    }
    if (r.code === FAIL_CODE) return 1
    if (broken(r) || r.code === RESTART_CODE) {
      o.say('Framo를 켜지 못했어요. 받은 zip 파일을 통째로 다시 풀어 주세요.')
      return 1
    }
    return r.code ?? 0
  }
}

/** 이 버전의 서버를 자식으로 띄운다. 창, 입력, 출력은 같이 쓰고, 자리를 잡았다는 말은 IPC로 받는다 */
export function runServer(run: Run, restarted: boolean): Promise<Ran> {
  return new Promise((resolve) => {
    const env: NodeJS.ProcessEnv = { ...process.env, [LAUNCHER_ENV]: '1' }
    if (restarted) env[RESTARTED_ENV] = '1'
    else delete env[RESTARTED_ENV]
    let listening = false
    const child = spawn(run.node, [join(run.dir, 'dist-node', 'serve.mjs')], { cwd: run.dir, env, stdio: ['inherit', 'inherit', 'inherit', 'ipc'] })
    child.on('message', (m) => {
      if (m === LISTENING) listening = true
    })
    child.once('error', () => resolve({ listening, code: null, signal: null, spawnFailed: true }))
    child.once('exit', (code, signal) => resolve({ listening, code, signal, spawnFailed: false }))
  })
}

/** 켜지지 않은 버전에 남기는 표시. 쓰지 못해도(막힌 폴더) 이번에는 건너뛰고, 다음에 켤 때 다시 해 본다 */
function markFailed(run: Run) {
  try {
    writeFileSync(join(run.dir, FAILED_FILE), JSON.stringify({ format: 'framo/failed', version: run.version, at: Date.now() }))
  } catch {
    // 그대로 둔다
  }
}

/**
 * 윈도우의 창은 끝나면 바로 닫혀 까닭을 볼 수 없다. 키를 누를 때까지 남긴다.
 * 서버는 시작 프로그램 아래에서 돌 때 기다리지 않고 FAIL_CODE로 끝나므로(serve.ts의 fail), 기다리는 곳은 여기 하나다
 */
function pause(): Promise<void> {
  if (process.platform !== 'win32' || !process.stdin.isTTY) return Promise.resolve()
  console.error('  아무 키나 누르면 이 창이 닫혀요.')
  process.stdin.setRawMode(true)
  process.stdin.resume()
  return new Promise((resolve) => process.stdin.once('data', () => resolve()))
}

interface MainOptions {
  /** 앱 폴더의 버전을 켤 node. Framo.exe는 옆의 node\node.exe를 넘긴다(Framo.exe 자신은 스크립트를 받지 않는다) */
  node?: string
}

export async function main({ node = process.execPath }: MainOptions = {}): Promise<never> {
  const here = dirname(fileURLToPath(import.meta.url))
  const home = appHome(join(here, '..'))
  const { platform, arch } = process
  const code = await supervise({
    home,
    pick: (skip) => [
      ...readyVersions(home, BASE, platform, arch)
        .filter((v) => !skip.has(v.version))
        .map((v) => ({ version: v.version, dir: v.dir, node: nodeIn(v.dir, platform, arch)! })),
      { version: BASE, dir: home, node },
    ],
    run: runServer,
    markFailed,
    say: (m) => console.error(`\n  ${m}\n`),
  })
  if (code !== 0) await pause()
  process.exit(code)
}

function isMain(): boolean {
  try {
    return !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}

if (isMain()) void main()

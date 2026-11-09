// 시작 프로그램. Framo.exe(launch/framo-exe.cjs), 'Framo 시작.bat', 'Framo 시작.command'가 모두 이 파일(dist-node/launch.mjs)로 켠다.
//
// 1. 켤 버전을 고른다: 받아서 풀고 확인을 마친 새 버전(versions/X.Y.Z) 가운데 가장 새것, 없으면 이 앱 폴더의 버전.
// 2. 그 버전의 node로 그 버전의 서버(dist-node/serve.mjs)를 자식으로 띄운다. 창(콘솔)은 이 프로그램의 것을 같이 쓴다.
// 3. 서버가 '다시 켜기' 코드(RESTART_CODE)로 끝나면 1부터 다시: '지금 다시 시작'을 누르면 새 버전으로 바뀐다.
// 4. 새 버전의 서버가 자리를 잡기 전에 끝나면(켜지지 않으면) 그 버전에 표시를 남기고 바로 앞 버전으로 켠다.
// 5. 새 버전이 자리를 잡은 뒤에도 얼마 못 가(TRIAL_MS) 비정상으로 끝나면 한 번은 다시 켜고, 두 번째면 켜지지 않은 것으로 본다.
//    그 시간을 넘겨 돌면 그 버전은 믿을 만하다고 보고 센 것을 지운다.
//
// 이 파일은 처음 푼 앱 폴더의 것을 계속 쓴다(Framo.exe에 든 시작 코드가 이 파일을 부른다). 새 버전이 나와도 바뀌지 않으므로
// 단순하게 두고, 서버와의 약속은 versions.ts의 것만 쓴다. 다른 곳에서 받은 실행 파일은 켜지 않는다:
// 켜는 것은 앱 폴더의 node, 아니면 받은 zip의 지문을 맞추고 다 풀어 확인을 마친 버전 폴더의 node뿐이다.

import { spawn } from 'node:child_process'
import { readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { version as BASE } from '../package.json'
import { appHome, FAIL_CODE, FAILED_FILE, LAUNCHER_ENV, LISTENING, nodeIn, readyVersions, RESTART_CODE, RESTARTED_ENV } from './versions'

/** 이만큼 돌기 전에 비정상으로 끝나면 새 버전 탓으로 센다 */
const TRIAL_MS = 3 * 60_000
/** 버전 폴더에 남기는, 자리를 잡은 뒤 얼마 못 가 멈춘 횟수. 시작 프로그램만 읽고 쓴다 */
const TRIAL_FILE = '.framo-trial'
/** 이만큼 멈추면 켜지지 않은 것으로 본다 */
const MAX_EARLY_CRASHES = 2

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
  /** 이 시작 프로그램이 든 버전 폴더. 돌아갈 마지막 자리라 켜지지 않았다는 표시를 남기지 않는다 */
  own: string
  /** 지금 켤 차례: 새것부터, 마지막은 앱 폴더의 버전. skip은 이번에 켜지지 않은 버전 */
  pick(skip: ReadonlySet<string>): Run[]
  /** onStable: 자리를 잡고 TRIAL_MS를 넘겨 돌고 있을 때 한 번 */
  run(run: Run, restarted: boolean, onStable: () => void): Promise<Ran>
  /** 켜지지 않은 버전에 표시를 남긴다 */
  markFailed(run: Run): void
  /** 그 버전이 자리를 잡은 뒤 얼마 못 가 멈춘 횟수 */
  crashes(run: Run): number
  setCrashes(run: Run, n: number): void
  say(message: string): void
}

/**
 * 버전 탓으로 켜지지 않았는지: 자리를 잡기 전에 까닭을 보이지 않고 끝났다.
 * 신호로 끝난 것도 넣는다: 사람이 창을 닫거나 Ctrl+C를 누르면 이 시작 프로그램도 같이 끝나 이 결과를 보지 못한다.
 * 이 프로그램은 살아 있는데 서버만 신호로 죽었으면(맥의 보안 검사나 백신이 SIGKILL로 막을 때) 그 버전이 켜지지 않는 것이다
 */
function broken(r: Ran): boolean {
  if (r.listening) return false
  if (r.spawnFailed || r.signal !== null) return true
  return r.code !== 0 && r.code !== FAIL_CODE
}

/** 자리를 잡은 뒤 비정상으로 끝났는지: 신호로 죽었거나 정해 둔 끝 코드(0, 다시 켜기, 까닭을 보임)가 아니다 */
function crashed(r: Ran): boolean {
  return r.listening && (r.signal !== null || (r.code !== 0 && r.code !== RESTART_CODE && r.code !== FAIL_CODE))
}

/** 서버를 켜고 지켜본다. 이 프로그램이 끝날 코드를 돌려준다 */
export async function supervise(o: SuperviseOptions): Promise<number> {
  const skip = new Set<string>()
  let restarted = false
  for (;;) {
    const run = o.pick(skip)[0]
    let stable = false
    const r = await o.run(run, restarted, () => {
      stable = true
      if (run.dir !== o.own) o.setCrashes(run, 0)
    })
    // 자리를 잡았던 서버만 다시 켠다. 켜자마자 이 코드로 끝나는 서버를 끝없이 다시 켜지 않게
    if (r.code === RESTART_CODE && r.listening) {
      restarted = true
      continue
    }
    // 새 버전이 자리를 잡고 얼마 못 가 멈췄다: 한 번은 다시 켜고, 또 그러면 앞 버전으로. 브라우저 창은 열려 있으니 새로 열지 않는다
    if (crashed(r) && !stable && run.dir !== o.own) {
      const n = o.crashes(run) + 1
      restarted = true
      if (n >= MAX_EARLY_CRASHES) {
        o.markFailed(run)
        skip.add(run.version)
        o.say(`새 버전(${run.version})이 자꾸 멈춰서 이전 버전으로 켤게요.`)
      } else {
        o.setCrashes(run, n)
        o.say('Framo가 갑자기 멈춰서 다시 켤게요.')
      }
      continue
    }
    if (broken(r) && run.dir !== o.own) {
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
export function runServer(run: Run, restarted: boolean, onStable: () => void = () => {}, trialMs = TRIAL_MS): Promise<Ran> {
  return new Promise((resolve) => {
    const env: NodeJS.ProcessEnv = { ...process.env, [LAUNCHER_ENV]: '1' }
    if (restarted) env[RESTARTED_ENV] = '1'
    else delete env[RESTARTED_ENV]
    let listening = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const child = spawn(run.node, [join(run.dir, 'dist-node', 'serve.mjs')], { cwd: run.dir, env, stdio: ['inherit', 'inherit', 'inherit', 'ipc'] })
    child.on('message', (m) => {
      if (m !== LISTENING || listening) return
      listening = true
      timer = setTimeout(onStable, trialMs)
    })
    const done = (r: Ran) => {
      clearTimeout(timer)
      resolve(r)
    }
    child.once('error', () => done({ listening, code: null, signal: null, spawnFailed: true }))
    child.once('exit', (code, signal) => done({ listening, code, signal, spawnFailed: false }))
  })
}

/** 그 버전이 자리를 잡은 뒤 얼마 못 가 멈춘 횟수. 읽지 못하면 0 */
function crashes(run: Run): number {
  try {
    const n = (JSON.parse(readFileSync(join(run.dir, TRIAL_FILE), 'utf8')) as { crashes?: unknown }).crashes
    return typeof n === 'number' && Number.isInteger(n) && n > 0 ? n : 0
  } catch {
    return 0
  }
}

/** 쓰지 못하면(막힌 폴더) 이번 횟수는 잊는다: 다음에 또 멈추면 다시 한 번 다시 켠다 */
function setCrashes(run: Run, n: number) {
  try {
    writeFileSync(join(run.dir, TRIAL_FILE), JSON.stringify({ crashes: n }))
  } catch {
    // 그대로 둔다
  }
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

/**
 * 켤 차례. 앱 폴더의 버전 폴더 가운데 이 시작 프로그램보다 새것(새것부터), 마지막은 이 시작 프로그램이 든 폴더 자신.
 * 보통은 앱 폴더의 것이 켜지지만, 사람이 versions 안의 Framo.exe를 직접 눌렀으면 그 버전 폴더(own)의 서버를 그 버전의 node로 켠다.
 * 앱 폴더의 서버를 다른 버전의 node로 켜지 않는다
 */
export function choices(own: string, base: string, node: string, platform: NodeJS.Platform, arch: string, skip: ReadonlySet<string>): Run[] {
  const home = appHome(own)
  return [
    ...readyVersions(home, base, platform, arch)
      .filter((v) => !skip.has(v.version))
      .map((v) => ({ version: v.version, dir: v.dir, node: nodeIn(v.dir, platform, arch)! })),
    { version: base, dir: own, node },
  ]
}

export async function main({ node = process.execPath }: MainOptions = {}): Promise<never> {
  const own = join(dirname(fileURLToPath(import.meta.url)), '..')
  const { platform, arch } = process
  const code = await supervise({
    own,
    pick: (skip) => choices(own, BASE, node, platform, arch, skip),
    run: runServer,
    markFailed,
    crashes,
    setCrashes,
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

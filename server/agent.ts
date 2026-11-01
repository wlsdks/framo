// 'AI에게 부탁'을 누르면 이 PC에 깔린 Claude Code를 앱 대신 띄워 부탁을 전한다.
// 사람이 터미널을 열고 Framo를 연결해 말을 거는 일을 버튼 하나로 줄인 것이다.
//
// 내용이 새지 않게 이렇게 띄운다.
// 1. 받는 것은 부탁 id(src/ai/asks.ts)와 해시 id뿐이다. AI에게 보내는 문장은 askPrompt가 정해진 말로 만든다.
// 2. Claude Code의 기본 도구(파일 읽기·쓰기, 명령 실행, 웹)를 모두 끄고(--tools ""), Framo MCP 서버(gyeol) 하나만
//    붙인다(--strict-mcp-config). MCP 서버는 늘 그렇듯 'AI 공유' 폴더 안에서만 움직이므로, AI는 모양 파일 말고는
//    아무것도 볼 수 없다. 사람이 직접 Claude Code를 쓸 때보다 좁다.
// 3. 사용자 설정 파일(훅, 플러그인, 다른 MCP 서버)을 읽지 않고(--restricted), 물어야 하는 권한은 모두 거절한다.
// 4. 부탁 문장은 명령줄이 아니라 stdin으로 넘긴다. 윈도우에서 .cmd를 거쳐도 문장이 명령으로 읽힐 일이 없다.
// 5. 부탁마다 만드는 빈 임시 폴더에서 띄우고 끝나면 지운다. 띄운 폴더 위에 놓인 CLAUDE.md 같은 지시를 받지 않게.
//
// 어디까지 했는지는 도구 이름으로만 보고, 제안은 늘 그렇듯 requests 폴더로 온다. AI가 쓴 답 글은 바꿀 게 없다고 할 때
// 그 까닭만 짧게 앱에 보여 준다 (AI → 앱 쪽이라 발표 내용이 나가는 길이 아니고, 화면에는 글자로만 그린다).

import { spawn, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { askFits, askOf, askPrompt, REASON_MAX, type AskError, type AskId, type AskRun, type AskState } from '../src/ai/asks'
import { MCP_SERVER_NAME, MCP_TOOLS } from '../src/ai/protocol'

/** 띄울 프로그램. args는 Framo가 붙이는 인자 앞에 온다 (시험에서 node 스크립트를 띄울 때) */
export interface AgentCommand {
  file: string
  args?: string[]
}

export interface AgentOptions {
  shareRoot: string
  mcpPath: string
  nodePath: string
  /** 이 발표의 모양 파일이 있고, 장 부탁이면 그 장이 있는지 */
  hasTarget(deck: string, slide: string | null): boolean
  /** 모양 파일에 있는 그 장의 레이아웃 (레이아웃이 정해진 부탁이 맞는 장인지 볼 때) */
  layoutOf?(deck: string, slide: string): string | null
  /** 이 발표에 와 있는 제안 id들 */
  requestIds(deck: string): string[]
  find?: () => AgentCommand | null
  timeoutMs?: number
}

export const ASK_RUN_ID = /^a[0-9a-f]{12}$/
const TIMEOUT_MS = 3 * 60 * 1000
const KEEP_MS = 10 * 60 * 1000
const TOOLS = MCP_TOOLS.map((t) => `mcp__${MCP_SERVER_NAME}__${t}`)

const isFile = (f: string) => {
  try {
    return statSync(f).isFile()
  } catch {
    return false
  }
}

/** 이 PC의 Claude Code. 바탕 화면에서 켠 서버는 PATH가 짧을 수 있어서 설치 프로그램이 쓰는 자리도 본다 */
export function findClaude(env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): AgentCommand | null {
  const win = platform === 'win32'
  const home = (win ? env.USERPROFILE : env.HOME) ?? ''
  const dirs = [
    ...(env.PATH ?? '').split(win ? ';' : ':'),
    home && join(home, '.local', 'bin'),
    ...(win ? [env.APPDATA ? join(env.APPDATA, 'npm') : ''] : [home && join(home, '.claude', 'local'), '/opt/homebrew/bin', '/usr/local/bin']),
  ].filter(Boolean)
  // 윈도우는 설치 프로그램이 만드는 claude.exe를 먼저, npm으로 깐 claude.cmd는 그다음
  for (const name of win ? ['claude.exe', 'claude.cmd'] : ['claude']) {
    for (const dir of dirs) {
      const file = join(dir, name)
      if (isFile(file)) return { file }
    }
  }
  return null
}

export function agentArgs(mcpConfig: string): string[] {
  return [
    '-p',
    '--restricted',
    '--tools',
    '',
    '--strict-mcp-config',
    '--mcp-config',
    mcpConfig,
    '--allowedTools',
    TOOLS.join(','),
    '--permission-prompts',
    'none',
    '--no-session-persistence',
    '--output-format',
    'stream-json',
    '--verbose',
  ]
}

/** .cmd는 cmd.exe를 거쳐야 뜬다. 인자는 모두 이 파일이 만든 값이라 따옴표만 씌운다 */
function launch(cmd: AgentCommand, args: string[], cwd: string): ChildProcess {
  const all = [...(cmd.args ?? []), ...args]
  if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(cmd.file)) {
    const line = [cmd.file, ...all].map((a) => `"${a.replace(/"/g, '')}"`).join(' ')
    return spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `"${line}"`], { cwd, windowsVerbatimArguments: true, windowsHide: true })
  }
  return spawn(cmd.file, all, { cwd, windowsHide: true })
}

function stop(child: ChildProcess) {
  if (child.exitCode !== null || child.pid === undefined) return
  // 윈도우에서 cmd.exe를 거쳤으면 그 아래 Claude Code까지 같이 끈다
  if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true })
  else child.kill('SIGTERM')
}

interface Running extends AskRun {
  reason?: string
  deck: string
  before: Set<string>
  endedAt?: number
  child?: ChildProcess
  timer?: NodeJS.Timeout
  /** Claude Code가 끝에 알려 준 결과. 화면에는 옮기지 않고 로그인 문제인지만 본다 */
  resultError?: boolean
  resultText?: string
}

/** 앱에 알려 주는 값만. 프로세스와 타이머는 밖으로 내지 않는다 */
const view = (r: Running): AskRun => ({ id: r.id, state: r.state, step: r.step, request: r.request, reason: r.reason, error: r.error })

/** 바꿀 게 없다는 까닭. 마크다운 기호를 걷고 짧게 자른다 */
export function reasonOf(text: string): string | undefined {
  const plain = text
    .replace(/[*_`#>]+/g, '')
    .replace(/^\s*[-•]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!plain) return undefined
  return plain.length > REASON_MAX ? `${plain.slice(0, REASON_MAX - 1).trimEnd()}…` : plain
}

export function createAgent(opts: AgentOptions) {
  const find = opts.find ?? (() => findClaude())
  const runs = new Map<string, Running>()

  const prune = () => {
    const now = Date.now()
    for (const [id, r] of runs) if (r.endedAt && now - r.endedAt > KEEP_MS) runs.delete(id)
  }

  const finish = (run: Running, state: AskState, error?: AskError) => {
    if (run.state !== 'running') return
    clearTimeout(run.timer)
    run.state = state
    run.error = error
    run.endedAt = Date.now()
    run.child = undefined
  }

  const onLine = (run: Running, line: string) => {
    let event: { type?: string; message?: { content?: { type?: string; name?: string }[] }; is_error?: boolean; result?: unknown }
    try {
      event = JSON.parse(line)
    } catch {
      return
    }
    if (event.type === 'assistant') {
      for (const c of event.message?.content ?? []) {
        if (c.type !== 'tool_use' || typeof c.name !== 'string') continue
        if (c.name.endsWith('propose_changes') || c.name.endsWith('check_changes')) run.step = 'proposing'
        else if (run.step === 'starting') run.step = 'looking'
      }
    }
    if (event.type === 'result') {
      run.resultError = event.is_error === true
      run.resultText = typeof event.result === 'string' ? event.result : ''
    }
  }

  return {
    available(): boolean {
      return existsSync(opts.mcpPath) && find() !== null
    },

    start(ask: AskId, deck: string, slide: string | null): AskRun | AskError {
      prune()
      if ([...runs.values()].some((r) => r.state === 'running')) return 'busy'
      if (!opts.hasTarget(deck, slide)) return 'not_shared'
      // 컴포넌트 장에만 맞는 부탁을 다른 장에 맡기면 AI는 할 일이 없다
      if (slide && !askFits(askOf(ask)!, opts.layoutOf?.(deck, slide) ?? null)) return 'bad_ask'
      const cmd = existsSync(opts.mcpPath) ? find() : null
      if (!cmd) return 'no_agent'

      const run: Running = { id: `a${randomBytes(6).toString('hex')}`, state: 'running', step: 'starting', deck, before: new Set(opts.requestIds(deck)) }
      runs.set(run.id, run)

      const dir = mkdtempSync(join(tmpdir(), 'gyeol-agent-'))
      const config = join(dir, 'mcp.json')
      writeFileSync(
        config,
        JSON.stringify({
          mcpServers: { [MCP_SERVER_NAME]: { type: 'stdio', command: opts.nodePath, args: [opts.mcpPath], env: { GYEOL_SHARE: opts.shareRoot } } },
        }),
      )
      const cleanup = () => rmSync(dir, { recursive: true, force: true })

      let child: ChildProcess
      try {
        // 빈 임시 폴더에서 띄운다. Claude Code는 띄운 폴더와 그 위 폴더들의 CLAUDE.md를 읽어서, 'AI 공유' 폴더에서 띄우면 그 위에
        // 놓인 지시(개발할 때는 이 저장소의 AGENTS.md)를 부탁과 함께 받았다. MCP 서버는 GYEOL_SHARE로 'AI 공유' 폴더를 안다
        child = launch(cmd, agentArgs(config), dir)
      } catch {
        cleanup()
        finish(run, 'failed', 'no_agent')
        return view(run)
      }
      run.child = child
      run.timer = setTimeout(() => {
        finish(run, 'failed', 'timeout')
        stop(child)
      }, opts.timeoutMs ?? TIMEOUT_MS)

      if (child.stdout) createInterface({ input: child.stdout }).on('line', (line) => onLine(run, line))
      child.stderr?.resume()
      child.on('error', () => {
        cleanup()
        finish(run, 'failed', 'no_agent')
      })
      child.on('close', (code) => {
        cleanup()
        const fresh = opts.requestIds(deck).find((id) => !run.before.has(id))
        if (fresh) {
          run.request = fresh
          return finish(run, 'done')
        }
        if (run.resultError || code !== 0) {
          const login = /log ?in|api key|auth/i.test(run.resultText ?? '')
          return finish(run, 'failed', login ? 'login' : 'failed')
        }
        run.reason = reasonOf(run.resultText ?? '')
        finish(run, 'no_change')
      })
      child.stdin?.on('error', () => {})
      child.stdin?.end(askPrompt(ask, deck, slide))
      return view(run)
    },

    get(id: string): AskRun | null {
      const r = runs.get(id)
      return r ? view(r) : null
    },

    cancel(id: string): boolean {
      const r = runs.get(id)
      if (!r) return false
      const child = r.child
      finish(r, 'cancelled')
      if (child) stop(child)
      return true
    },

    /** 서버를 끌 때 띄워 둔 Claude Code도 끈다 */
    stopAll() {
      for (const r of runs.values()) if (r.child) stop(r.child)
    },
  }
}

export type Agent = ReturnType<typeof createAgent>

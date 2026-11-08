import { existsSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { createServer, request, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ASKS, askPrompt, mcpPrompt } from '../src/ai/asks'
import { requestId } from '../src/ai/ops'
import { REQUEST_FORMAT, REQUEST_VERSION } from '../src/ai/protocol'
import { catalogStrings, toShape } from '../src/ai/share'
import { createSampleDeck } from '../src/deck/sample'
import { agentArgs, type AgentCommand } from './agent'
import { createAiHandler } from './ai'

// 진짜 Claude Code 대신 띄우는 가짜. 받은 인자와 부탁 문장을 적어 두고, 시킨 대로 제안을 남기거나 실패한다.
type Plan = 'propose' | 'nothing' | 'login' | 'hang'

const base = mkdtempSync(join(tmpdir(), 'gyeol-agent-'))
const share = join(base, 'AI 공유')
const mcpPath = join(base, 'gyeol-mcp.mjs')
const logFile = join(base, 'agent-log.json')
const deck = createSampleDeck()
const shape = toShape(deck)
let plan: Plan = 'propose'
let server: Server
let port: number

function fakeAgent(): AgentCommand {
  const script = join(base, `fake-${plan}.mjs`)
  const req = { format: REQUEST_FORMAT, version: REQUEST_VERSION, id: requestId(), deck: shape.deck, createdAt: Date.now(), note: '표지 다음 장을 빼요', ops: [{ op: 'set_hidden', slide: shape.slides[1].id, hidden: true }] }
  writeFileSync(
    script,
    `import { writeFileSync } from 'node:fs'
let stdin = ''
process.stdin.on('data', (c) => (stdin += c))
process.stdin.on('end', () => {
  writeFileSync(${JSON.stringify(logFile)}, JSON.stringify({ argv: process.argv.slice(2), stdin, cwd: process.cwd() }))
  const say = (e) => process.stdout.write(JSON.stringify(e) + '\\n')
  const plan = ${JSON.stringify(plan)}
  if (plan === 'hang') return setTimeout(() => {}, 60000)
  say({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'mcp__gyeol__get_shape' }] } })
  if (plan === 'propose') {
    writeFileSync(${JSON.stringify(join(share, 'requests', `${req.id}.json`))}, ${JSON.stringify(JSON.stringify(req))})
    say({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'mcp__gyeol__propose_changes' }] } })
  }
  say({ type: 'result', is_error: plan === 'login', result: plan === 'login' ? 'Not logged in · Please run /login' : '이 장은 **지금 모양이** 잘 맞아요.\\n- 빈 칸이 없어요.' })
  process.exit(plan === 'login' ? 1 : 0)
})
`,
  )
  return { file: process.execPath, args: [script] }
}

function call(path: string, method = 'GET', body?: unknown, headers: Record<string, string> = { 'X-HTML-Maker': '1' }): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method, headers: { Host: `127.0.0.1:${port}`, ...headers } }, (res) => {
      let text = ''
      res.on('data', (c) => (text += c))
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: text ? JSON.parse(text) : null }))
    })
    req.on('error', reject)
    req.end(body === undefined ? undefined : JSON.stringify(body))
  })
}

async function until(id: string) {
  for (let i = 0; i < 100; i++) {
    const res = await call(`/__html-maker/ai/asks/${id}`)
    if (res.body.state !== 'running') return res.body
    await new Promise((r) => setTimeout(r, 50))
  }
  throw new Error('끝나지 않았어요')
}

beforeAll(async () => {
  writeFileSync(mcpPath, '')
  const handle = createAiHandler(share, { mcpPath, findAgent: fakeAgent, agentTimeoutMs: 1500 })
  writeFileSync(join(share, 'decks', `${shape.deck}.json`), JSON.stringify(shape))
  server = createServer((req, res) => {
    handle(req, res).then((done) => {
      if (!done) res.writeHead(404).end()
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  port = (server.address() as AddressInfo).port
})

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

const target = { ask: 'slide_layout', deck: shape.deck, slide: shape.slides[0].id }

describe('AI에게 부탁', () => {
  it('부탁 문장은 정해진 말과 해시 id로만 만든다', () => {
    const known = catalogStrings()
    const texts = [...deck.slides.flatMap((s) => [s.purpose, s.notes, ...Object.values(s.fields), ...s.items.flatMap((it) => [it.title, it.body, it.value, it.meta])]), deck.title, deck.meta.org, deck.meta.presenter]
    for (const a of ASKS) {
      // MCP 프롬프트(prompts/get)로 고른 부탁의 문장도 같다
      for (const text of [askPrompt(a.id, shape.deck, a.scope === 'slide' ? shape.slides[0].id : null), mcpPrompt(a.id, shape.deck, a.scope === 'slide' ? 1 : null)])
        // 사람이 적은 글은 한 조각도 들어가지 않는다 (카탈로그에도 있는 짧은 말은 빼고 본다)
        for (const t of texts) if (t && t.length > 3 && !known.has(t)) expect(text).not.toContain(t)
    }
  })

  it('기본 도구를 모두 끄고 Framo MCP 서버 하나만 붙여 띄운다', () => {
    const args = agentArgs('/tmp/mcp.json')
    expect(args[args.indexOf('--tools') + 1]).toBe('')
    expect(args).toContain('--strict-mcp-config')
    expect(args).toContain('--restricted')
    expect(args[args.indexOf('--permission-prompts') + 1]).toBe('none')
    expect(args[args.indexOf('--allowedTools') + 1].split(',').every((t) => t.startsWith('mcp__gyeol__'))).toBe(true)
  })

  it('부탁을 전하고, AI가 남긴 제안 id를 알려 준다', async () => {
    plan = 'propose'
    const res = await call('/__html-maker/ai/asks', 'POST', target)
    expect(res.status).toBe(202)
    const run = await until(res.body.id)
    expect(run.state).toBe('done')
    expect(run.request).toMatch(/^r[0-9a-f]{12}$/)
    const log = JSON.parse(readFileSync(logFile, 'utf8'))
    // 부탁 문장은 명령줄이 아니라 stdin으로
    expect(log.stdin).toBe(askPrompt('slide_layout', shape.deck, shape.slides[0].id))
    expect(log.argv.join(' ')).not.toContain(shape.slides[0].id)
    // 'AI 공유' 폴더가 아니라 부탁마다 만드는 빈 임시 폴더에서 띄운다. Claude Code는 띄운 폴더와 그 위 폴더들의 CLAUDE.md를 읽어서,
    // 'AI 공유' 폴더에서 띄우면 그 위에 놓인 지시(개발할 때는 이 저장소의 AGENTS.md)를 부탁과 함께 받았다
    // 띄운 폴더는 끝나면 지워서 실제 경로를 다시 잴 수 없다. 받아 적은 경로(process.cwd())가 이미 실제 경로다
    const outside = (dir: string) => !String(log.cwd).normalize('NFC').startsWith(realpathSync(dir).normalize('NFC'))
    expect(outside(share)).toBe(true)
    expect(outside(base)).toBe(true)
    const config = log.argv[log.argv.indexOf('--mcp-config') + 1]
    expect(() => readFileSync(config)).toThrow() // 끝나면 설정 파일도 지운다
    expect(existsSync(log.cwd)).toBe(false) // 띄운 폴더도
  })

  it('제안 없이 끝나면 바꿀 게 없다고 알려 준다', async () => {
    plan = 'nothing'
    const res = await call('/__html-maker/ai/asks', 'POST', { ask: 'deck_flow', deck: shape.deck, slide: null })
    expect(await until(res.body.id)).toMatchObject({ state: 'no_change', reason: '이 장은 지금 모양이 잘 맞아요. 빈 칸이 없어요.' })
  })

  it('로그인이 안 돼 있으면 그렇게 알려 준다', async () => {
    plan = 'login'
    const res = await call('/__html-maker/ai/asks', 'POST', target)
    expect(await until(res.body.id)).toMatchObject({ state: 'failed', error: 'login' })
  })

  it('오래 걸리면 끄고, 그동안 다른 부탁은 받지 않는다', async () => {
    plan = 'hang'
    const res = await call('/__html-maker/ai/asks', 'POST', target)
    expect((await call('/__html-maker/ai/asks', 'POST', target)).body.error).toBe('busy')
    expect(await until(res.body.id)).toMatchObject({ state: 'failed', error: 'timeout' })
  })

  it('그만두기를 누르면 끈다', async () => {
    plan = 'hang'
    const res = await call('/__html-maker/ai/asks', 'POST', target)
    expect((await call(`/__html-maker/ai/asks/${res.body.id}`, 'DELETE')).status).toBe(204)
    expect((await call(`/__html-maker/ai/asks/${res.body.id}`)).body.state).toBe('cancelled')
  })

  it('정해진 부탁과 공유한 발표가 아니면 받지 않는다', async () => {
    const post = (b: unknown) => call('/__html-maker/ai/asks', 'POST', b)
    expect((await post({ ...target, ask: 'write_title' })).status).toBe(400)
    expect((await post({ ...target, text: '제목을 바꿔 줘' })).status).toBe(400) // 글은 받지 않는다
    expect((await post({ ...target, slide: null })).status).toBe(400) // 장 부탁에는 장이 있어야
    expect((await post({ ask: 'deck_flow', deck: shape.deck, slide: shape.slides[0].id })).status).toBe(400)
    expect((await post({ ...target, deck: 'd00000000' })).status).toBe(404)
    expect((await post({ ...target, slide: 's00000000' })).status).toBe(404)
    // 컴포넌트 장에만 맞는 부탁은 다른 장에 받지 않는다 (예시 발표의 표지)
    expect(shape.slides[0].layout).not.toBe('compose')
    expect((await post({ ...target, ask: 'slide_compose' })).status).toBe(400)
    // 다른 웹사이트는 머리글이 없어서 막힌다
    expect((await call('/__html-maker/ai/asks', 'POST', target, {})).status).toBe(403)
  })
})

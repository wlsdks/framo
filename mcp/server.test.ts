import { execFileSync, spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { linkSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, parse, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pkg from '../package.json'
import { ASK_IDS, mcpPrompt } from '../src/ai/asks'
import { OP_CODES, OP_KEYS } from '../src/ai/ops'
import { MCP_TOOLS, RESULT_FORMAT } from '../src/ai/protocol'
import { SECRET, secretDeck } from '../src/ai/secretDeck'
import { toShape } from '../src/ai/share'
import { autoPlace, makeBlock } from '../src/deck/blocks'
import { makeSlide } from '../src/deck/generate'
import { createSampleDeck } from '../src/deck/sample'
import { sandboxArgs, sandboxTight } from './server'

// 빌드한 MCP 서버를 실제로 띄워서 Claude Code처럼 이야기해 본다.
const repo = join(import.meta.dirname, '..')
const base = mkdtempSync(join(tmpdir(), 'gyeol-mcp-'))
const share = join(base, 'AI 공유')
// 빌드는 시험용 폴더에. 예전에는 진짜 dist-node를 비우고 다시 써서, 묶어 둔 결과가 시험 도중의 것으로 바뀌었다
const built = mkdtempSync(join(tmpdir(), 'gyeol-mcp-build-'))
const entry = join(built, 'gyeol-mcp.mjs')
let child: ChildProcessWithoutNullStreams
let serverInfo: unknown
let nextId = 1
const waiting = new Map<number, (v: { result?: { content: { text: string }[]; isError?: boolean } & Record<string, unknown>; error?: unknown }) => void>()
const raw: string[] = []

function rpc(method: string, params: Record<string, unknown> = {}) {
  const id = nextId++
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
  return new Promise<Parameters<NonNullable<ReturnType<typeof waiting.get>>>[0]>((resolve) => waiting.set(id, resolve))
}

/** 아무 줄이나 그대로 보내고 다음에 오는 답 한 줄을 받는다 */
function sendLine(line: string) {
  const at = raw.length
  child.stdin.write(line + '\n')
  return new Promise<unknown>((resolve) => {
    const check = () => (raw.length > at ? resolve(JSON.parse(raw[at])) : setTimeout(check, 10))
    check()
  })
}

async function tool(name: string, args: Record<string, unknown> = {}) {
  const res = await rpc('tools/call', { name, arguments: args })
  return { isError: !!res.result?.isError, value: JSON.parse(res.result!.content[0].text) }
}

beforeAll(async () => {
  execFileSync(process.execPath, [join(repo, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '-c', 'vite.node.config.ts', '--outDir', built, '--logLevel', 'error'], { cwd: repo })
  for (const d of ['decks', 'requests', 'results']) mkdirSync(join(share, d), { recursive: true })

  // 공유 폴더 옆에 작업 파일(.deck)이 있다고 치자. 비밀이 들어 있다.
  writeFileSync(join(base, '비밀 보고.deck'), JSON.stringify(secretDeck()))
  // 공유된 발표 하나 (비밀을 심은 덱에서 만든 모양)
  const example = secretDeck()
  example.slides[0].options.hideHead = true
  example.slides[0].options.hideFoot = true
  const decision = makeBlock('decision')
  const blocks = autoPlace([], {
    ...decision,
    fields: { label: SECRET, question: SECRET },
    hints: { label: SECRET, question: SECRET },
    items: decision.items.map((item) => ({ ...item, title: SECRET, body: SECRET })),
  })!
  example.slides.push({ ...makeSlide('compose'), fields: { title: SECRET }, blocks })
  const shape = toShape(example)
  writeFileSync(join(share, 'decks', `${shape.deck}.json`), JSON.stringify(shape))
  // 누가 공유 폴더 안에 폴더 밖 파일로 가는 링크를 만들어 둔 경우. 꼴이 맞는 모양 파일이라도 읽히면 안 된다.
  const outside = toShape(createSampleDeck())
  outside.deck = 'd00000000'
  writeFileSync(join(base, 'outside.json'), JSON.stringify(outside))
  symlinkSync(join(base, 'outside.json'), join(share, 'decks', 'd00000000.json'))
  // 하드 링크도 마찬가지. Node 권한 모델은 링크를 따라가므로 서버가 직접 거른다.
  const hard = { ...outside, deck: 'd11111111' }
  writeFileSync(join(base, 'outside-hard.json'), JSON.stringify(hard))
  linkSync(join(base, 'outside-hard.json'), join(share, 'decks', 'd11111111.json'))

  child = spawn(process.execPath, [entry], { env: { ...process.env, GYEOL_SHARE: share } })
  createInterface({ input: child.stdout }).on('line', (line) => {
    raw.push(line)
    const msg = JSON.parse(line)
    waiting.get(msg.id)?.(msg)
  })
  serverInfo = (await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } })).result?.serverInfo
}, 60000)

afterAll(() => {
  child?.kill()
  for (const dir of [built, base]) rmSync(dir, { recursive: true, force: true })
})

describe('MCP 서버', () => {
  it('도구는 모양을 다루는 여섯 개뿐이다', async () => {
    const res = await rpc('tools/list')
    const names = (res.result!.tools as { name: string }[]).map((t) => t.name)
    expect(names).toEqual(['list_decks', 'get_catalog', 'get_shape', 'check_changes', 'propose_changes', 'get_result'])
    // 'AI에게 부탁'이 Claude Code에 허락하는 도구도 이것뿐이다
    expect([...MCP_TOOLS]).toEqual(names)
  })

  it('이름과 판 번호는 Framo의 것이다', () => {
    expect(serverInfo).toEqual({ name: 'gyeol', version: pkg.version })
  })

  it('제안의 꼴은 앱이 받는 키와 같다', async () => {
    // 꼴에 없는 키는 AI가 보낼 수 없고(additionalProperties: false), 꼴에만 있는 키는 보내도 거절된다
    const res = await rpc('tools/list')
    const tools = res.result!.tools as { name: string; inputSchema: any }[]
    const propose = tools.find((t) => t.name === 'propose_changes')!
    // 미리 돌려 보기는 보낼 제안과 같은 꼴을 받는다
    expect(tools.find((t) => t.name === 'check_changes')!.inputSchema).toEqual(propose.inputSchema)
    const items = propose.inputSchema.properties.ops.items
    expect(items.additionalProperties).toBe(false)
    expect(Object.keys(items.properties).sort()).toEqual([...new Set(Object.values(OP_KEYS).flat())].sort())
    expect([...items.properties.op.enum].sort()).toEqual(Object.keys(OP_KEYS).sort())
  })

  it('공유 폴더 밖 파일로 가는 링크는 읽지 않는다', async () => {
    const { value } = await tool('list_decks')
    expect(value.decks.map((d: { deck: string }) => d.deck)).not.toContain('d00000000')
    expect(value.decks.map((d: { deck: string }) => d.deck)).not.toContain('d11111111')
    expect((await tool('get_shape', { deck: 'd00000000' })).isError).toBe(true)
    expect(value.decks).toHaveLength(1)
  })

  it('모양을 보여 주지만 비밀은 한 글자도 나가지 않는다', async () => {
    const { value: list } = await tool('list_decks')
    const { value: shape, isError } = await tool('get_shape', { deck: list.decks[0].deck })
    expect(isError).toBe(false)
    expect(shape.slides.length).toBeGreaterThan(5)
    await tool('get_catalog')
    await tool('get_shape', { deck: `../${SECRET}` })
    await tool('get_result', { request: SECRET })
    await tool('propose_changes', { deck: list.decks[0].deck, note: 'x', ops: [{ op: 'set_field', text: SECRET }] })
    expect(raw.join('\n')).not.toContain(SECRET)
    expect(raw.join('\n')).not.toContain('7731')
  })

  it('조건별 흐름도 실제 MCP 창구에서 모양만 보이고 질문과 경로의 글은 나가지 않는다', async () => {
    const { value: list } = await tool('list_decks')
    const result = await tool('get_shape', { deck: list.decks[0].deck })
    expect(result.isError).toBe(false)
    const block = result.value.slides.flatMap((slide: { blocks?: { type: string }[] }) => slide.blocks ?? []).find((b: { type: string }) => b.type === 'decision')
    expect(block).toBeDefined()
    expect(JSON.stringify(block)).not.toContain(SECRET)
    expect(raw.join('\n')).not.toContain(SECRET)
  })

  it('제안은 파일로만 남고, 사람이 보기 전에는 pending이다', async () => {
    const { value: list } = await tool('list_decks')
    const { value: shape } = await tool('get_shape', { deck: list.decks[0].deck })
    const { value, isError } = await tool('propose_changes', {
      deck: shape.deck,
      note: '목차를 빼고 위험과 대응을 넣었어요',
      ops: [
        { op: 'set_hidden', slide: shape.slides[2].id, hidden: true },
        { op: 'add_slide', after: shape.slides[1].id, role: '위험과 대응' },
      ],
    })
    expect(isError).toBe(false)
    expect(value.status).toBe('pending')
    const saved = JSON.parse(readFileSync(join(share, 'requests', `${value.request}.json`), 'utf8'))
    expect(saved.ops).toHaveLength(2)
    expect((await tool('get_result', { request: value.request })).value.status).toBe('pending')
  })

  it('부품 장의 부품을 해시 id로 가리켜 모양을 바꾸자고 할 수 있다', async () => {
    const { value: list } = await tool('list_decks')
    const { value: shape } = await tool('get_shape', { deck: list.decks[0].deck })
    const compose = shape.slides.find((x: { layout: string }) => x.layout === 'compose')
    const first = compose.blocks[0].id
    expect(first).toMatch(/^b[0-9a-f]{8}$/)
    // 판의 자리는 칸 수로 보인다
    expect(compose.blocks.every((b: Record<string, unknown>) => ['x', 'y', 'w', 'h'].every((k) => Number.isInteger(b[k])))).toBe(true)
    const { value, isError } = await tool('propose_changes', {
      deck: shape.deck,
      ops: [
        { op: 'add_block', slide: compose.id, type: 'number', edge: 'bottom', as: 'p1' },
        { op: 'set_block', slide: compose.id, block: 'p1', look: 'card' },
        { op: 'move_block', slide: compose.id, block: first, beside: 'p1', side: 'after' },
        { op: 'set_size', slide: compose.id, block: first, w: 6 },
        { op: 'move_block', slide: compose.id, block: first, swap: 'p1' },
        { op: 'set_link', slide: compose.id, block: 'p1', side: 'right', link: 'arrow' },
      ],
    })
    expect(isError).toBe(false)
    expect(value.status).toBe('pending')
    // 예전 줄로 가리키는 동작은 받지 않는다
    for (const op of [
      { op: 'set_spans', slide: compose.id, block: first, spans: [6, 6] },
      { op: 'set_row_grow', slide: compose.id, grow: [] },
      { op: 'add_block', slide: compose.id, type: 'number', row: 2 },
    ])
      expect((await tool('propose_changes', { deck: shape.deck, ops: [op] })).isError, op.op).toBe(true)
    // 부품의 글을 쓰려는 키는 받지 않는다
    const bad = await tool('propose_changes', { deck: shape.deck, ops: [{ op: 'set_block', slide: compose.id, block: first, text: '새 글' }] })
    expect(bad.isError).toBe(true)
  })

  it('장면은 모양에 맞는 것만 보이고, 고르자는 제안은 목록의 id나 null만 받는다', async () => {
    const { value: list } = await tool('list_decks')
    const { value: shape } = await tool('get_shape', { deck: list.decks[0].deck })
    // 비밀을 심은 덱: 표지의 맞는 장면만 나간다 (마지막 그물을 지난다)
    expect(shape.slides[0].options.scene).toBe('opening')
    expect(shape.slides.slice(1).every((x: { options: Record<string, unknown> }) => x.options.scene === undefined)).toBe(true)
    const { value: cat } = await tool('get_catalog')
    expect(cat.scenes.map((x: { id: string }) => x.id)).toEqual(['opening', 'answer', 'numbers', 'flow', 'compare', 'time', 'picture', 'closing'])
    const ok = await tool('propose_changes', {
      deck: shape.deck,
      note: '장마다 장면을 골랐어요',
      ops: [
        { op: 'set_options', slide: shape.slides[1].id, scene: 'answer' },
        { op: 'set_options', slide: shape.slides[0].id, scene: null },
      ],
    })
    expect(ok.isError).toBe(false)
    // 맞지 않는 장면은 받아 두고 앱이 적용할 때 건너뛴다(scene_unfit). 모르는 장면, 글자는 받지 않는다
    for (const scene of ['film', SECRET, 1])
      expect((await tool('propose_changes', { deck: shape.deck, ops: [{ op: 'set_options', slide: shape.slides[1].id, scene }] })).isError, String(scene)).toBe(true)
    expect(raw.join('\n')).not.toContain(SECRET)
  })

  it('제목과 아래 표시 설정은 참거짓만 공유하고 제안한다', async () => {
    const { value: list } = await tool('list_decks')
    const { value: shape, isError } = await tool('get_shape', { deck: list.decks[0].deck })
    expect(isError).toBe(false)
    expect(shape.slides[0].options).toMatchObject({ hideHead: true, hideFoot: true })
    const ok = await tool('propose_changes', { deck: shape.deck, ops: [{ op: 'set_options', slide: shape.slides[0].id, hideHead: false, hideFoot: false }] })
    expect(ok.isError).toBe(false)
    expect((await tool('propose_changes', { deck: shape.deck, ops: [{ op: 'set_options', slide: shape.slides[0].id, hideHead: SECRET }] })).isError).toBe(true)
    expect(raw.join('\n')).not.toContain(SECRET)
  })

  it('앱이 남긴 결과 코드는 모두 AI에게 알려 준다', async () => {
    // 정해진 말에 없는 코드가 하나라도 있으면 마지막 그물에 걸려 결과 대신 오류가 나간다
    const id = 'r00000000c0de'
    const results = OP_CODES.map((code) => ({ ok: code === 'applied', code }))
    writeFileSync(join(share, 'results', `${id}.json`), JSON.stringify({ format: RESULT_FORMAT, version: 1, request: id, status: 'applied', decidedAt: 1, results }))
    const { value, isError } = await tool('get_result', { request: id })
    expect(isError).toBe(false)
    expect(value.request).toBe(id)
    expect(value.status).toBe('applied')
    expect(value.results).toEqual(results)
    // 빠진 코드마다 무엇을 고치면 되는지 정해진 말이 붙는다
    expect(Object.keys(value.help).sort()).toEqual(OP_CODES.filter((c) => c !== 'applied').sort())
    expect(Object.values(value.help).every((t) => typeof t === 'string' && t.length > 10)).toBe(true)
  })

  it('미리 돌려 보기는 op마다 결과와 고칠 것을 알려 주고, 제안은 남기지 않는다', async () => {
    const { value: list } = await tool('list_decks')
    const { value: shape } = await tool('get_shape', { deck: list.decks[0].deck })
    const before = readdirSync(join(share, 'requests')).length
    const compose = shape.slides.find((x: { layout: string }) => x.layout === 'compose')
    const { value, isError } = await tool('check_changes', {
      deck: shape.deck,
      note: '흐름을 다듬었어요',
      ops: [
        { op: 'add_slide', after: shape.slides[1].id, role: '위험과 대응', as: 'n1' },
        { op: 'move_slide', slide: 'n1', after: null },
        { op: 'set_options', slide: shape.slides[1].id, scene: 'answer', highlight: 0 },
        { op: 'set_options', slide: shape.slides[3].id, scene: 'film' },
        { op: 'set_options', slide: 's00000000', tone: 'invert' },
        { op: 'set_block', slide: compose.id, block: compose.blocks[0].id, [SECRET]: 1 },
      ],
    })
    expect(isError).toBe(false)
    expect(readdirSync(join(share, 'requests'))).toHaveLength(before)
    expect(value.accepted).toBe(false)
    expect(value.applied).toBe(2)
    expect(value.skipped).toBe(4)
    expect(value.results.map((r: { code: string }) => r.code)).toEqual(['applied', 'applied', 'not_for_layout', 'invalid', 'no_slide', 'invalid'])
    expect(value.results[2].key).toBe('highlight')
    expect(value.results[3].key).toBe('scene')
    // AI가 지어낸 키 이름은 돌려보내지 않는다
    expect(value.results[5].key).toBeUndefined()
    expect(Object.keys(value.help).sort()).toEqual(['invalid', 'no_slide', 'not_for_layout'])
    expect(raw.join('\n')).not.toContain(SECRET)

    // 고친 것은 받아 준다
    const fixed = await tool('check_changes', { deck: shape.deck, ops: [{ op: 'set_options', slide: shape.slides[1].id, scene: 'answer' }] })
    expect(fixed.value).toMatchObject({ accepted: true, applied: 1, skipped: 0 })
    // 너무 긴 설명도 propose_changes가 받지 않으니 미리 알린다
    const long = await tool('check_changes', { deck: shape.deck, note: 'x'.repeat(301), ops: [{ op: 'set_hidden', slide: shape.slides[2].id, hidden: true }] })
    expect(long.value).toMatchObject({ accepted: false, note: 'invalid' })
    // 공유되지 않은 발표, 빈 ops는 정해진 말로만 답한다
    expect((await tool('check_changes', { deck: 'd00000000', ops: [{ op: 'set_theme', motion: 'calm' }] })).isError).toBe(true)
    expect((await tool('check_changes', { deck: shape.deck, ops: [] })).isError).toBe(true)
  })

  it('카탈로그는 거짓과 없음을 빼고, 발표 종류와 부품 목록을 골라 받을 수 있다', async () => {
    const size = (v: unknown) => JSON.stringify(v).length
    const { value: all } = await tool('get_catalog')
    expect(JSON.stringify(all)).not.toMatch(/:(false|null)[,}]/)
    expect(all.deckTypes.length).toBeGreaterThan(3)
    expect(all.blocks.length).toBeGreaterThan(10)
    // 강조할 항목이 없는 레이아웃은 그 키가 없다
    expect(all.layouts.find((l: { id: string }) => l.id === 'summary').highlight).toBeUndefined()
    expect(all.layouts.find((l: { id: string }) => l.id === 'pricing').highlight).toEqual(expect.any(String))

    const { value: list } = await tool('list_decks')
    const { value: one } = await tool('get_catalog', { deck: list.decks[0].deck, blocks: false })
    expect(one.deckTypes.map((t: { id: string }) => t.id)).toEqual([list.decks[0].type])
    expect(Object.keys(one).filter((k) => k.startsWith('block'))).toEqual([])
    expect(one.layouts).toEqual(all.layouts)
    expect(size(one)).toBeLessThan(size(all) / 2)
    expect((await tool('get_catalog', { deck: 'd00000000' })).isError).toBe(true)
  })

  it('앱의 부탁을 프롬프트로 고를 수 있고, 받은 값은 꼴이 맞을 때만 문장에 들어간다', async () => {
    const list = await rpc('prompts/list')
    const prompts = list.result!.prompts as { name: string; title: string; arguments: { name: string; required: boolean }[] }[]
    expect(prompts.map((p) => p.name)).toEqual([...ASK_IDS])
    // 장 부탁은 장 번호를 꼭 받는다. 사람이 장의 해시 id를 알 수는 없다
    for (const p of prompts) expect(p.arguments.find((a) => a.name === 'page')?.required ?? false, p.name).toBe(p.name.startsWith('slide_'))

    const { value: decks } = await tool('list_decks')
    const deck = decks.decks[0].deck
    const text = async (name: string, args: Record<string, unknown> = {}) => {
      const res = await rpc('prompts/get', { name, arguments: args })
      return res.error ? null : ((res.result!.messages as { content: { text: string } }[])[0].content.text)
    }
    expect(await text('deck_flow')).toBe(mcpPrompt('deck_flow', null, null))
    expect(await text('deck_scenes', { deck })).toBe(mcpPrompt('deck_scenes', deck, null))
    expect(await text('slide_layout', { page: '3', deck })).toBe(mcpPrompt('slide_layout', deck, 3))
    expect(await text('deck_flow')).toContain('check_changes')
    // 꼴이 틀린 값은 문장에 넣지 않고 정해진 오류로만 답한다
    for (const [name, args] of [
      ['deck_flow', { deck: SECRET }],
      ['deck_flow', { deck: `${deck} ${SECRET}` }],
      ['deck_flow', { page: '2' }],
      ['slide_layout', {}],
      ['slide_layout', { page: '0' }],
      ['slide_layout', { page: `3${SECRET}` }],
      ['slide_layout', { page: '301' }],
      [SECRET, {}],
    ] as const)
      expect(await text(name, args), `${name} ${JSON.stringify(args)}`).toBeNull()
    expect(raw.join('\n')).not.toContain(SECRET)
  })

  it('객체가 아닌 요청에는 틀린 요청이라고 답하고 꺼지지 않는다', async () => {
    const invalid = { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request' } }
    expect(await sendLine('null')).toEqual(invalid)
    expect(await sendLine('5')).toEqual(invalid)
    expect(await sendLine('[]')).toEqual(invalid)
    expect(await sendLine(JSON.stringify([null, { jsonrpc: '2.0', id: 'p1', method: 'ping' }]))).toEqual([invalid, { jsonrpc: '2.0', id: 'p1', result: {} }])
    expect((await rpc('ping')).result).toEqual({})
  })

  it('칸의 글을 쓰려는 제안은 받지 않는다', async () => {
    const { value: list } = await tool('list_decks')
    const before = readdirSync(join(share, 'requests')).length
    const { isError } = await tool('propose_changes', { deck: list.decks[0].deck, ops: [{ op: 'set_layout', slide: 's00000000', layout: 'points', text: '새 제목' }] })
    expect(isError).toBe(true)
    expect(readdirSync(join(share, 'requests'))).toHaveLength(before)
  })
})

describe('MCP 서버를 가두는 권한', () => {
  it('읽기는 공유 폴더와 서버 코드, 쓰기는 공유 폴더만 열고 다른 것은 열지 않는다', () => {
    const args = sandboxArgs('/s/AI 공유', '/app/dist-node', '/app/dist-node/gyeol-mcp.mjs')
    expect(args[0]).toBe('--permission')
    expect(args.at(-1)).toBe('/app/dist-node/gyeol-mcp.mjs')
    const flags = args.slice(0, -1)
    expect(flags.filter((f) => f.startsWith('--allow-fs-read=')).sort()).toEqual(['--allow-fs-read=/app/dist-node', '--allow-fs-read=/s/AI 공유'])
    expect(flags.filter((f) => f.startsWith('--allow-fs-write='))).toEqual(['--allow-fs-write=/s/AI 공유'])
    // 다른 프로그램 실행, worker, 애드온, WASI, 모든 경로(*)는 열지 않는다
    expect(flags.every((f) => f === '--permission' || f.startsWith('--allow-fs-'))).toBe(true)
    expect(flags.join(' ')).not.toContain('*')
  })

  it('공유 폴더 밖을 읽거나 다른 프로그램을 띄울 수 있으면 좁지 않다고 본다', () => {
    const only = (open: string[]) => ({ has: (scope: string, ref?: string) => open.includes(ref ? `${scope}:${ref}` : scope) })
    // 운영체제의 경로 꼴로 (윈도우에서는 '/s'가 'D:\s'가 된다)
    const s = resolve('/s')
    const inShare = join(s, 'AI 공유')
    const here = resolve('/app/dist-node')
    const argv = sandboxArgs(inShare, here, join(here, 'gyeol-mcp.mjs')).slice(0, -1)
    const tight = (open: string[], execArgv = argv, nodeOptions = '') => sandboxTight(only(open), inShare, here, execArgv, nodeOptions)
    expect(tight([`fs.read:${inShare}`])).toBe(true)
    expect(tight([`fs.read:${s}`])).toBe(false)
    expect(tight([`fs.write:${s}`])).toBe(false)
    // 드라이브 맨 위, 홈, 임시 폴더, 서버 코드의 위를 연 것(--allow-fs-read=* 같은)
    for (const p of [parse(s).root, homedir(), tmpdir(), dirname(here)]) expect(tight([`fs.read:${p}`]), p).toBe(false)
    // 다른 프로그램, worker, 네이티브 애드온, WASI, 디버거
    for (const scope of ['child', 'worker', 'addon', 'wasi', 'inspector']) expect(tight([scope]), scope).toBe(false)
    // 문서 폴더 하나만 더 연 것은 물어서는 알 수 없다. 받은 권한 인자로 본다(NODE_OPTIONS로 준 것은 execArgv에 없다)
    const docs = `--allow-fs-read=${resolve('/docs')}`
    expect(tight([], [...argv, docs])).toBe(false)
    expect(tight([], argv, docs)).toBe(false)
    expect(tight([], ['--max-old-space-size=512', ...argv], '--max-old-space-size=512')).toBe(true)
  })

  it('넓은 권한으로 띄우면 시작하지 않고, 경로도 말하지 않는다', () => {
    // 실제 경로로 띄운다. 맥의 임시 폴더(/var → /private/var)처럼 링크가 낀 경로는 권한 모델 안에서 모듈을 불러오다
    // 먼저 멈춰서(1로 끝난다) 권한 확인이 막았는지 가릴 수 없다
    const realShare = realpathSync.native(share)
    const realBuilt = realpathSync.native(built)
    const run = (flags: string[], env: Record<string, string> = {}) =>
      spawnSync(process.execPath, ['--permission', ...flags, join(realBuilt, 'gyeol-mcp.mjs')], { env: { ...process.env, ...env, GYEOL_SHARE: realShare }, input: '', encoding: 'utf8' })
    const own = [`--allow-fs-read=${realShare}`, `--allow-fs-write=${realShare}`, `--allow-fs-read=${realBuilt}`]
    // 스스로 다시 띄울 때와 같은 인자면 시작한다(입력이 끝나면 0으로 끝난다). 아래가 권한 확인 때문에 멈추는지 보려고
    expect(run(own).status).toBe(0)
    const other = `--allow-fs-read=${join(realpathSync.native(base), 'other')}`
    const wide: [string[], Record<string, string>?][] = [
      [['--allow-fs-read=*']],
      [[...own, '--allow-child-process']],
      // 공유 폴더 옆의 다른 폴더 하나만 더 연 것. 공유 폴더의 위를 물어서는 걸리지 않는다
      [[...own, other]],
      [own, { NODE_OPTIONS: other }],
    ]
    for (const [flags, env] of wide) {
      const res = run(flags, env)
      expect(res.status, flags.join(' ')).toBe(1)
      expect(res.stderr).toContain('권한이 넓게 열린 채로')
      expect(res.stdout).toBe('')
      expect(res.stderr).not.toContain(realShare)
    }
  })
})

import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { request, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createSampleDeck } from '../src/deck/sample'
import { OP_CODES } from '../src/ai/ops'
import { REQUEST_FORMAT, REQUEST_VERSION } from '../src/ai/protocol'
import { toShape } from '../src/ai/share'
import { CSP, CSP_META, HOST, createAppServer } from './serve'

let server: Server
let port: number
const base = mkdtempSync(join(tmpdir(), 'gyeol-serve-'))
const root = join(base, 'dist')
const share = join(base, 'AI 공유')

interface Res {
  status: number
  headers: Record<string, string | string[] | undefined>
  body: string
}

function call(path: string, { host, method = 'GET', headers = {}, body }: { host?: string; method?: string; headers?: Record<string, string>; body?: string } = {}): Promise<Res> {
  return new Promise((resolve, reject) => {
    const req = request({ host: HOST, port, path, method, headers: { Host: host ?? `${HOST}:${port}`, ...headers } }, (res) => {
      let text = ''
      res.on('data', (c) => (text += c))
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: text }))
    })
    req.on('error', reject)
    req.end(body)
  })
}

const AI = { 'X-HTML-Maker': '1' }

beforeAll(async () => {
  mkdirSync(join(root, 'assets'), { recursive: true })
  writeFileSync(join(root, 'index.html'), '<!doctype html><title>t</title>')
  writeFileSync(join(root, 'assets', 'app.js'), 'console.log(1)')
  writeFileSync(join(base, 'html-maker-secret.txt'), 'secret')
  server = createAppServer({ root, share })
  await new Promise<void>((resolve) => server.listen(0, HOST, resolve))
  port = (server.address() as AddressInfo).port
})

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

describe('로컬 서버', () => {
  it('127.0.0.1에만 묶인다', () => {
    expect((server.address() as AddressInfo).address).toBe('127.0.0.1')
  })

  it('화면 파일을 CSP와 함께 내준다', async () => {
    const res = await call('/')
    expect(res.status).toBe(200)
    expect(res.body).toContain('<title>t</title>')
    expect(res.headers['content-security-policy']).toContain("connect-src 'self'")
    expect(res.headers['content-security-policy']).toContain("default-src 'self'")
    expect((await call('/assets/app.js')).headers['content-type']).toContain('javascript')
  })

  it('CSP는 이 PC 밖으로 연결하지 못하게 하고, index.html에 넣는 것도 같다', () => {
    const rules = (csp: string) => new Map(csp.split('; ').map((r) => [r.split(' ')[0], r.split(' ').slice(1).join(' ')]))
    const header = rules(CSP)
    for (const [k, v] of Object.entries({ 'default-src': "'self'", 'script-src': "'self'", 'connect-src': "'self'", 'object-src': "'none'", 'base-uri': "'none'", 'form-action': "'none'", 'frame-ancestors': "'none'" })) {
      expect(header.get(k), k).toBe(v)
    }
    expect(CSP).not.toMatch(/https?:|\*|'unsafe-eval'/)
    // meta에서는 frame-ancestors가 무시되므로 그것만 빠지고 나머지는 같다
    const meta = rules(CSP_META)
    header.delete('frame-ancestors')
    expect(meta).toEqual(header)
  })

  it('다른 이름으로 들어온 요청은 막는다', async () => {
    expect((await call('/', { host: `evil.example:${port}` })).status).toBe(403)
    expect((await call('/', { host: `192.168.0.10:${port}` })).status).toBe(403)
  })

  it('localhost는 127.0.0.1 주소로 보낸다', async () => {
    const res = await call('/assets/app.js?v=1', { host: `localhost:${port}` })
    expect(res.status).toBe(302)
    expect(res.headers.location).toBe(`http://127.0.0.1:${port}/assets/app.js?v=1`)
  })

  it('화면 폴더 밖의 파일은 내주지 않는다', async () => {
    for (const path of ['/../html-maker-secret.txt', '/%2e%2e/html-maker-secret.txt', '/..%2fhtml-maker-secret.txt', '/..%5chtml-maker-secret.txt']) {
      const res = await call(path)
      expect(res.status).not.toBe(200)
      expect(res.body).not.toContain('secret')
    }
    expect((await call('/%E0%A4%A')).status).toBe(400)
  })

  it('화면 파일에는 읽기 말고는 받지 않는다', async () => {
    expect((await call('/', { method: 'POST' })).status).toBe(405)
  })
})

describe('AI 공유 창구', () => {
  const deck = createSampleDeck()
  const shape = toShape(deck)

  it('앱 머리글이 없거나 다른 사이트에서 오면 막는다', async () => {
    expect((await call('/__html-maker/ai/status')).status).toBe(403)
    expect((await call('/__html-maker/ai/status', { headers: { ...AI, Origin: 'https://evil.example' } })).status).toBe(403)
    expect((await call('/__html-maker/ai/status', { headers: { ...AI, Origin: `http://${HOST}:${port}` } })).status).toBe(200)
  })

  it('정해진 주소와 방법이 아니면 404로 답한다', async () => {
    const status = async (path: string, method = 'GET', body?: string) => (await call(`/__html-maker/ai/${path}`, { method, headers: AI, body })).status
    expect(await status('nope')).toBe(404)
    expect(await status('status/')).toBe(404)
    expect(await status('status', 'POST')).toBe(404)
    expect(await status('requests', 'DELETE')).toBe(404)
    expect(await status('asks')).toBe(404)
    expect(await status('asks/a000000000000')).toBe(404)
    expect(await status('asks/a000000000000', 'DELETE')).toBe(404)
    expect(await status('asks/a000000000000', 'POST')).toBe(404)
    expect(await status('asks/x')).toBe(404)
    expect(await status(`decks/${shape.deck}`)).toBe(404)
    expect(await status('decks/d123', 'PUT', JSON.stringify(shape))).toBe(404)
    expect(await status('decks/D00000000', 'DELETE')).toBe(404)
    expect(await status('requests/r0123456789ab/result')).toBe(404)
    expect(await status('requests/r0123456789ab', 'POST')).toBe(404)
    expect(await status('requests/r0123456789ab/result/x', 'POST')).toBe(404)
    // 꼴이 맞는 주소라도 몸통이 틀리면 400
    expect(await status('requests/r0123456789ab/result', 'POST', '{')).toBe(400)
    expect(await status('asks', 'POST', '[]')).toBe(400)
    expect(await status(`decks/${shape.deck}`, 'PUT', 'null')).toBe(400)
    // 머리글이 없으면 모르는 주소라도 403
    expect((await call('/__html-maker/ai/nope')).status).toBe(403)
  })

  it('모양 파일만 받고, 글이 섞이면 쓰지 않는다', async () => {
    const put = (body: unknown) => call(`/__html-maker/ai/decks/${shape.deck}`, { method: 'PUT', headers: AI, body: JSON.stringify(body) })
    expect((await put(shape)).status).toBe(204)
    const saved = readFileSync(join(share, 'decks', `${shape.deck}.json`), 'utf8')
    expect(JSON.parse(saved)).toEqual(shape)

    const leaky = structuredClone(shape) as unknown as { slides: Record<string, unknown>[]; title?: string }
    leaky.title = deck.title
    expect((await put(leaky)).status).toBe(400)
    const leaky2 = structuredClone(shape) as unknown as { slides: Record<string, unknown>[] }
    leaky2.slides[1].role = '한빛제조 품질 관리 사업'
    expect((await put(leaky2)).status).toBe(400)
    expect(readFileSync(join(share, 'decks', `${shape.deck}.json`), 'utf8')).toBe(saved)
  })

  it('제안을 넘겨주고, 결과를 남기면 제안은 지운다', async () => {
    const id = 'r0123456789ab'
    const req = { format: REQUEST_FORMAT, version: REQUEST_VERSION, id, deck: shape.deck, createdAt: 1, note: '목차를 뺐어요', ops: [{ op: 'set_hidden', slide: shape.slides[2].id, hidden: true }] }
    writeFileSync(join(share, 'requests', `${id}.json`), JSON.stringify(req))
    writeFileSync(join(share, 'requests', 'r111111111111.json'), JSON.stringify({ ...req, id: 'r111111111111', ops: [{ op: 'set_field', slide: shape.slides[2].id, text: 'x' }] }))

    const list = JSON.parse((await call('/__html-maker/ai/requests', { headers: AI })).body)
    expect(list.requests.map((r: { id: string }) => r.id)).toEqual([id])
    // 꼴이 맞지 않는 제안은 지우고 invalid로 남긴다
    expect(JSON.parse(readFileSync(join(share, 'results', 'r111111111111.json'), 'utf8')).status).toBe('invalid')

    const res = await call(`/__html-maker/ai/requests/${id}/result`, {
      method: 'POST',
      headers: AI,
      body: JSON.stringify({ status: 'applied', results: [{ ok: true, code: 'applied' }] }),
    })
    expect(res.status).toBe(204)
    expect(readdirSync(join(share, 'requests'))).toEqual([])
    expect(JSON.parse(readFileSync(join(share, 'results', `${id}.json`), 'utf8')).status).toBe('applied')
  })

  it('앱이 남기는 결과 코드는 모두 받는다', async () => {
    // 받지 않는 코드가 있으면 제안 파일이 남아 다시 뜨고, 같은 제안을 두 번 적용하게 된다
    const id = 'r0123456789cd'
    const req = { format: REQUEST_FORMAT, version: REQUEST_VERSION, id, deck: shape.deck, createdAt: 2, note: '', ops: [{ op: 'set_hidden', slide: shape.slides[2].id, hidden: true }] }
    writeFileSync(join(share, 'requests', `${id}.json`), JSON.stringify(req))
    const results = OP_CODES.map((code) => ({ ok: code === 'applied', code }))
    const res = await call(`/__html-maker/ai/requests/${id}/result`, { method: 'POST', headers: AI, body: JSON.stringify({ status: 'applied', results }) })
    expect(res.status).toBe(204)
    expect(readdirSync(join(share, 'requests'))).toEqual([])
    expect(JSON.parse(readFileSync(join(share, 'results', `${id}.json`), 'utf8')).results).toEqual(results)
  })

  it('공유를 끄면 모양 파일을 지운다', async () => {
    expect((await call(`/__html-maker/ai/decks/${shape.deck}`, { method: 'DELETE', headers: AI })).status).toBe(204)
    expect(readdirSync(join(share, 'decks'))).toEqual([])
  })
})

describe('AI 공유 폴더가 없어지거나 쓸 수 없을 때', () => {
  const shape = toShape(createSampleDeck())
  const put = () => call(`/__html-maker/ai/decks/${shape.deck}`, { method: 'PUT', headers: AI, body: JSON.stringify(shape) })

  it('폴더를 지워도 답하고, 다시 공유하면 폴더를 새로 만든다', async () => {
    // 폴더의 안내 파일이 지워도 된다고 한다
    rmSync(share, { recursive: true, force: true })
    expect((await call('/__html-maker/ai/status', { headers: AI })).status).toBe(200)
    expect(JSON.parse((await call('/__html-maker/ai/requests', { headers: AI })).body)).toEqual({ requests: [] })
    const result = { method: 'POST', headers: AI, body: JSON.stringify({ status: 'rejected', results: [] }) }
    expect((await call('/__html-maker/ai/requests/r0123456789ab/result', result)).status).toBe(404)
    expect((await call(`/__html-maker/ai/decks/${shape.deck}`, { method: 'DELETE', headers: AI })).status).toBe(204)
    expect((await put()).status).toBe(204)
    expect(existsSync(join(share, 'decks', `${shape.deck}.json`))).toBe(true)
    expect(existsSync(join(share, '읽어 주세요.txt'))).toBe(true)
  })

  it('쓰지 못하면 정해진 500으로 답하고 계속 돈다', async () => {
    // decks 자리에 파일이 있으면 폴더를 만들 수도, 그 안에 쓸 수도 없다
    rmSync(join(share, 'decks'), { recursive: true, force: true })
    writeFileSync(join(share, 'decks'), '')
    const res = await put()
    expect(res.status).toBe(500)
    expect(res.body).toBe('')
    expect((await call('/__html-maker/ai/status', { headers: AI })).status).toBe(200)
    expect((await call('/')).status).toBe(200)
    rmSync(join(share, 'decks'))
  })
})

describe('새 버전 창구', () => {
  it('서버에 달려 있고, 앱 머리글이 없거나 다른 사이트에서 오면 막는다', async () => {
    expect((await call('/__html-maker/update/status')).status).toBe(403)
    expect((await call('/__html-maker/update/download', { method: 'POST', headers: { ...AI, Origin: 'https://evil.example' } })).status).toBe(403)
    // 상태 보기는 GitHub에 묻지 않는다 (시험이 네트워크에 닿지 않는다)
    const res = await call('/__html-maker/update/status', { headers: AI })
    expect(res.status).toBe(200)
    expect(JSON.parse(res.body)).toMatchObject({ check: { state: 'unknown' }, download: { state: 'idle' } })
    expect(res.headers['content-security-policy']).toContain("connect-src 'self'")
  })
})

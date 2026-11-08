// 'AI 공유' 폴더를 다루는 로컬 서버 쪽 창구. 브라우저 앱과 MCP 서버는 이 폴더로만 이야기한다.
//
//   AI 공유/
//   ├─ 읽어 주세요.txt
//   ├─ decks/<덱 해시>.json     앱 → AI   발표의 모양 (글 없음)
//   ├─ requests/<요청 id>.json  AI → 앱   바꾸자는 제안 (사람이 보고 적용하거나 거절)
//   └─ results/<요청 id>.json   앱 → AI   제안을 어떻게 했는지
//
// 'AI에게 부탁'(asks)은 이 PC의 Claude Code를 띄워 부탁을 전한다. 띄우는 방법과 막는 것은 agent.ts에.
//
// 이 창구도 모양 파일을 받을 때 checkShape로 다시 확인한다. 글이 섞인 파일은 쓰지 않는다.

import { existsSync, lstatSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { dirname, join } from 'node:path'
import { validAsk, type AskError } from '../src/ai/asks'
import { isObj, onlyKeys } from '../src/ai/guards'
import { isOpCode, MAX_OPS, parseRequest, type ChangeRequest, type OpCode } from '../src/ai/ops'
import { AI_PREFIX, DECK_ID, deckOfFile, REQUEST_ID, RESULT_FORMAT, SHARE_SUBDIRS, type ResultStatus, type ShareSubdir } from '../src/ai/protocol'
import { checkShape, isPrivate } from '../src/ai/share'
import { ASK_RUN_ID, createAgent, type AgentCommand } from './agent'
import { fromApp } from './guard'
import { readJson, realDir } from './shareFiles'

const MAX_BODY = 512 * 1024
const KEEP_RESULTS_MS = 7 * 24 * 60 * 60 * 1000

const README = `이 폴더는 Framo가 AI(Claude Code, Codex)와 주고받는 곳이에요.

- decks: 공유를 켠 발표의 '모양'만 있어요. 장 순서, 레이아웃, 칸마다 글이 대략 몇 자인지(구간), 테마.
  제목, 적은 글, 이미지, 발표자 노트, 소속과 이름은 들어 있지 않아요. 파일을 열어 직접 확인해 보세요.
- requests: AI가 보낸 바꾸자는 제안이에요. 앱에서 보고 적용하거나 거절해요.
- results: 제안을 적용했는지 거절했는지 AI에게 알려 주는 기록이에요.

지워도 괜찮아요. 공유를 켠 발표를 다시 열면 새로 만들어져요.
`

export type ShareDirs = { root: string } & Record<ShareSubdir, string>

function shareDirs(root: string): ShareDirs {
  return { root, ...(Object.fromEntries(SHARE_SUBDIRS.map((d) => [d, join(root, d)])) as Record<ShareSubdir, string>) }
}

export function ensureShareDir(root: string): ShareDirs {
  const dirs = shareDirs(root)
  for (const d of SHARE_SUBDIRS) realFolder(dirs[d])
  const readme = join(root, '읽어 주세요.txt')
  // 윈도우 메모장이 한글을 바로 알아보게 BOM과 CRLF로 쓴다
  if (!existsSync(readme)) writeFileSync(readme, '\uFEFF' + README.replace(/\n/g, '\r\n'))
  return dirs
}

/**
 * 하위 폴더를 진짜 폴더로 만든다. 그 자리에 링크가 있으면 링크만 지운다(가리키던 곳은 그대로 둔다).
 * 링크를 따라 쓰면 폴더 밖에 파일이 생기고, 따라 지우면 밖의 파일이 지워진다(shareFiles.ts).
 * 그 자리에 파일이 있으면 지우지 않고 던진다. 처리기가 정해진 500으로 답한다.
 */
function realFolder(dir: string) {
  try {
    if (lstatSync(dir).isSymbolicLink()) unlinkSync(dir)
  } catch {
    // 없으면 아래에서 만든다. 링크를 지우지 못했으면 아래의 확인에서 걸린다
  }
  mkdirSync(dir, { recursive: true })
  if (!realDir(dir)) throw new Error('not a folder')
}

/** 폴더 안의 파일 하나를 지운다. 폴더가 링크면 따라가 밖의 파일을 지우게 되므로 지우지 않는다 */
function removeShared(file: string) {
  if (realDir(dirname(file))) rmSync(file, { force: true })
}

/**
 * 반쯤 쓴 파일을 읽지 않게, 임시 이름으로 쓴 뒤 바꾼다.
 * 'AI 공유' 폴더는 지워도 된다고 안내하므로 쓸 폴더부터 만든다. 바꾸지 못하면(윈도우에서 다른 프로그램이
 * 파일을 열고 있으면 EPERM) 임시 파일을 치우고 오류를 그대로 던진다. 처리기가 정해진 500으로 답한다.
 */
function writeJsonAtomic(file: string, value: unknown) {
  realFolder(dirname(file))
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(tmp, JSON.stringify(value, null, 2))
  try {
    renameSync(tmp, file)
  } catch (e) {
    rmSync(tmp, { force: true })
    throw e
  }
}

export function pruneResults(dirs: ShareDirs, now = Date.now()) {
  // 폴더가 링크면 따라가 밖의 오래된 파일을 모두 지우게 된다
  if (!realDir(dirs.results)) return
  for (const name of readdirSync(dirs.results)) {
    const file = join(dirs.results, name)
    try {
      if (now - statSync(file).mtimeMs > KEEP_RESULTS_MS) removeShared(file)
    } catch {
      // 다른 쪽이 먼저 지웠으면 그만
    }
  }
}

/** 모양 파일이 있는 발표. 폴더를 읽지 못하면 없는 것으로 친다 (앱은 공유가 꺼진 것으로 본다) */
function sharedDecks(dirs: ShareDirs): string[] {
  if (!realDir(dirs.decks)) return []
  try {
    return readdirSync(dirs.decks)
      .map(deckOfFile)
      .filter((d): d is string => d !== null)
  } catch {
    return []
  }
}

/** 기다리는 제안. 꼴이 맞지 않는 파일은 지우고 거절 기록을 남긴다. */
export function pendingRequests(dirs: ShareDirs): ChangeRequest[] {
  // 폴더가 링크면 읽지도 지우지도 않는다. 따라가면 밖의 JSON 파일을 꼴이 맞지 않는다며 지운다
  if (!realDir(dirs.requests)) return []
  const out: ChangeRequest[] = []
  for (const name of readdirSync(dirs.requests)) {
    if (!name.endsWith('.json')) continue
    const file = join(dirs.requests, name)
    const id = name.slice(0, -5)
    const request = parseRequest(readJson(file))
    if (request && request.id === id) {
      out.push(request)
      continue
    }
    // 지우지 못하는 것(같은 이름의 폴더)은 두고 넘어간다. 예전에는 여기서 던져 제안 목록이 늘 오류였다
    try {
      removeShared(file)
    } catch {
      continue
    }
    if (REQUEST_ID.test(id)) writeResult(dirs, id, 'invalid', [])
  }
  return out.sort((a, b) => a.createdAt - b.createdAt)
}

export function writeResult(dirs: ShareDirs, id: string, status: ResultStatus, results: { ok: boolean; code: OpCode }[]) {
  writeJsonAtomic(join(dirs.results, `${id}.json`), { format: RESULT_FORMAT, version: 1, request: id, status, decidedAt: Date.now(), results })
}

function parseResultBody(v: unknown): { status: ResultStatus; results: { ok: boolean; code: OpCode }[] } | null {
  if (!isObj(v) || !onlyKeys(v, ['status', 'results'])) return null
  if (v.status !== 'applied' && v.status !== 'rejected') return null
  if (!Array.isArray(v.results) || v.results.length > MAX_OPS) return null
  const ok = v.results.every((r) => isObj(r) && Object.keys(r).length === 2 && typeof r.ok === 'boolean' && isOpCode(r.code))
  return ok ? { status: v.status, results: v.results as { ok: boolean; code: OpCode }[] } : null
}

function readBody(req: IncomingMessage): Promise<string | null> {
  return new Promise((resolve) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > MAX_BODY) {
        resolve(null)
        req.destroy()
      } else chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', () => resolve(null))
  })
}

/** 몸통을 JSON으로 읽는다. 너무 크거나, 끊기거나, JSON이 아니면 undefined */
async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const body = await readBody(req)
  if (body === null) return undefined
  try {
    return JSON.parse(body)
  } catch {
    return undefined
  }
}

interface AiSetup {
  /** MCP 서버 파일의 경로. Claude Code, Codex 설정에 넣는다. */
  mcpPath: string
  /** MCP 서버를 띄울 node. 윈도우 배포본에는 node.exe가 들어 있어서 PATH의 node가 아닐 수 있다. */
  nodePath?: string
  /** 'AI에게 부탁'으로 띄울 프로그램을 찾는 방법. 시험에서만 바꾼다 */
  findAgent?: () => AgentCommand | null
  agentTimeoutMs?: number
}

const ASK_ERROR_STATUS: Record<AskError, number> = { bad_ask: 400, not_shared: 404, busy: 409, no_agent: 503, timeout: 500, login: 500, failed: 500 }

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(body))
}

function empty(res: ServerResponse, status: number) {
  res.writeHead(status, { 'Cache-Control': 'no-store' })
  res.end()
}

/** 주소의 한 마디: 정해진 말이거나, 꼴이 맞아야 하는 id */
type Segment = string | RegExp

interface Route {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  path: Segment[]
  /** id: 주소에서 꼴(RegExp)로 받은 마디. 없으면 빈 글자 */
  handle(req: IncomingMessage, res: ServerResponse, id: string): void | Promise<void>
}

/** 맞으면 주소에서 받은 id(없으면 빈 글자), 아니면 null */
function match(route: Route, method: string, path: string[]): string | null {
  if (route.method !== method || route.path.length !== path.length) return null
  let id = ''
  for (const [i, seg] of route.path.entries()) {
    if (typeof seg === 'string') {
      if (seg !== path[i]) return null
    } else if (seg.test(path[i])) id = path[i]
    else return null
  }
  return id
}

/**
 * /__html-maker/ai/ 요청을 처리한다. 처리했으면 true.
 *
 * 다른 웹사이트가 이 창구를 쓰지 못하게: 앱만 붙이는 머리글(X-HTML-Maker)이 있어야 하고,
 * Origin이 있으면 이 서버 주소와 같아야 한다. 머리글을 붙인 다른 사이트의 요청은 브라우저가
 * 먼저 허락을 묻는데(OPTIONS), 이 서버는 허락하지 않는다.
 */
export function createAiHandler(shareRoot: string, setup: AiSetup) {
  const dirs = ensureShareDir(shareRoot)
  pruneResults(dirs)
  const agent = createAgent({
    shareRoot,
    mcpPath: setup.mcpPath,
    nodePath: setup.nodePath ?? process.execPath,
    find: setup.findAgent,
    timeoutMs: setup.agentTimeoutMs,
    // AI에게 숨긴 장에는 장 부탁을 받지 않는다: AI가 그 장을 볼 수도 바꿀 수도 없다
    hasTarget(deck, slide) {
      const shape = readJson(join(dirs.decks, `${deck}.json`))
      return checkShape(shape) && shape.deck === deck && (slide === null || shape.slides.some((s) => s.id === slide && !isPrivate(s)))
    },
    layoutOf(deck, slide) {
      const shape = readJson(join(dirs.decks, `${deck}.json`))
      const s = checkShape(shape) && shape.deck === deck ? shape.slides.find((x) => x.id === slide) : undefined
      return s && !isPrivate(s) ? s.layout : null
    },
    // Claude Code가 끝날 때(요청 밖에서) 부르므로 여기서 던지면 서버가 꺼진다. 읽지 못하면 없는 것으로 친다
    requestIds(deck) {
      try {
        return pendingRequests(dirs).filter((r) => r.deck === deck).map((r) => r.id)
      } catch {
        return []
      }
    },
  })
  process.once('exit', () => agent.stopAll())

  function status(res: ServerResponse) {
    json(res, 200, { ok: true, shared: sharedDecks(dirs), mcpPath: setup.mcpPath, nodePath: setup.nodePath ?? process.execPath, agent: agent.available() })
  }

  /** 부탁 id와 해시 id만 받는다. 사람이 적은 글을 받는 칸은 없다 */
  async function startAsk(req: IncomingMessage, res: ServerResponse) {
    const v = await readJsonBody(req)
    if (!isObj(v) || !onlyKeys(v, ['ask', 'deck', 'slide']) || !validAsk(v.ask, v.deck, v.slide ?? null)) return json(res, 400, { error: 'bad_ask' })
    const run = agent.start(v.ask as Parameters<typeof agent.start>[0], v.deck as string, (v.slide as string | undefined) ?? null)
    if (typeof run === 'string') json(res, ASK_ERROR_STATUS[run], { error: run })
    else json(res, 202, run)
  }

  function askRun(res: ServerResponse, id: string) {
    const run = agent.get(id)
    if (run) json(res, 200, run)
    else empty(res, 404)
  }

  /** 모양 파일은 checkShape를 지난 것만 쓴다. 글이 섞인 파일은 쓰지 않는다 */
  async function putShape(req: IncomingMessage, res: ServerResponse, deck: string) {
    const shape = await readJsonBody(req)
    if (!checkShape(shape) || shape.deck !== deck) return empty(res, 400)
    // 폴더를 지웠으면 안내 파일까지 다시 만든다 (안내 파일이 그렇게 약속한다)
    ensureShareDir(shareRoot)
    writeJsonAtomic(join(dirs.decks, `${deck}.json`), shape)
    empty(res, 204)
  }

  function unshare(res: ServerResponse, deck: string) {
    removeShared(join(dirs.decks, `${deck}.json`))
    // 공유를 끄면 그 발표에 온 제안도 거절로 정리한다
    for (const r of pendingRequests(dirs)) {
      if (r.deck !== deck) continue
      removeShared(join(dirs.requests, `${r.id}.json`))
      writeResult(dirs, r.id, 'rejected', r.ops.map(() => ({ ok: false, code: 'not_reviewed' as const })))
    }
    empty(res, 204)
  }

  /** 사람이 적용하거나 거절한 결과를 남기고 제안을 지운다 */
  async function postResult(req: IncomingMessage, res: ServerResponse, id: string) {
    const file = join(dirs.requests, `${id}.json`)
    const parsed = parseResultBody(await readJsonBody(req))
    if (!parsed) return empty(res, 400)
    if (!existsSync(file)) return empty(res, 404)
    writeResult(dirs, id, parsed.status, parsed.results)
    removeShared(file)
    empty(res, 204)
  }

  const routes: Route[] = [
    { method: 'GET', path: ['status'], handle: (_req, res) => status(res) },
    { method: 'POST', path: ['asks'], handle: startAsk },
    { method: 'GET', path: ['asks', ASK_RUN_ID], handle: (_req, res, id) => askRun(res, id) },
    { method: 'DELETE', path: ['asks', ASK_RUN_ID], handle: (_req, res, id) => empty(res, agent.cancel(id) ? 204 : 404) },
    { method: 'PUT', path: ['decks', DECK_ID], handle: putShape },
    { method: 'DELETE', path: ['decks', DECK_ID], handle: (_req, res, id) => unshare(res, id) },
    { method: 'GET', path: ['requests'], handle: (_req, res) => json(res, 200, { requests: pendingRequests(dirs) }) },
    { method: 'POST', path: ['requests', REQUEST_ID, 'result'], handle: postResult },
  ]

  return async function handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    if (!url.pathname.startsWith(AI_PREFIX)) return false
    try {
      if (!fromApp(req)) {
        empty(res, 403)
        return true
      }
      const path = url.pathname.slice(AI_PREFIX.length).split('/')
      const method = req.method ?? 'GET'
      for (const route of routes) {
        const id = match(route, method, path)
        if (id === null) continue
        await route.handle(req, res, id)
        return true
      }
      empty(res, 404)
    } catch {
      // 폴더를 지웠거나 쓰지 못할 때. 예전에는 이 예외가 처리되지 않아 서버가 꺼졌다.
      // 오류 메시지에는 경로가 들어 있어서 내보내지 않는다
      if (!res.headersSent) empty(res, 500)
      else res.destroy()
    }
    return true
  }
}

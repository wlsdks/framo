// 브라우저 앱이 로컬 서버의 'AI 공유' 창구와 이야기하는 곳. 같은 PC의 127.0.0.1로만 간다.

import type { Deck } from '../deck/types'
import type { AskError, AskId, AskRun } from './asks'
import type { ChangeRequest, OpResult } from './ops'
import { AI_HEADER, AI_PREFIX } from './protocol'
import { shapeDeckId, toShape, type ShapeDeck } from './share'

/** 다른 웹사이트가 이 창구를 쓰지 못하게 서버가 확인하는 머리글 */
const HEADERS = { [AI_HEADER]: '1' }

export interface AiStatus {
  shared: string[]
  /** Claude Code, Codex 설정에 넣을 MCP 서버 파일 경로 */
  mcpPath: string
  /** MCP 서버를 띄울 node 프로그램 경로 */
  nodePath: string
  /** 이 PC에 Claude Code가 있어서 'AI에게 부탁'을 바로 할 수 있는지 */
  agent: boolean
}

/** Claude Code, Codex에 붙여 넣을 MCP 서버 실행 명령. 경로에 빈칸이 있어도 되게 따옴표로 감싼다. */
export function mcpCommand(status: AiStatus): string {
  return `"${status.nodePath || 'node'}" "${status.mcpPath}"`
}

async function call(path: string, init: RequestInit = {}): Promise<Response | null> {
  try {
    const res = await fetch(AI_PREFIX + path, { ...init, headers: { ...HEADERS, ...(init.headers ?? {}) }, cache: 'no-store' })
    return res
  } catch {
    return null
  }
}

/** ‘Framo 시작’ 파일로 켠 서버에서만 쓸 수 있다. 아니면 null */
export async function aiStatus(): Promise<AiStatus | null> {
  const res = await call('status')
  if (!res?.ok) return null
  try {
    const body = (await res.json()) as AiStatus & { ok?: boolean }
    return body.ok ? { shared: body.shared ?? [], mcpPath: body.mcpPath ?? '', nodePath: body.nodePath ?? '', agent: body.agent === true } : null
  } catch {
    return null
  }
}

export async function publishShape(shape: ShapeDeck): Promise<boolean> {
  const res = await call(`decks/${shape.deck}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(shape) })
  return res?.status === 204
}

export async function unshareDeck(deck: Pick<Deck, 'id'>): Promise<void> {
  await call(`decks/${shapeDeckId(deck)}`, { method: 'DELETE' })
}

export async function fetchRequests(): Promise<ChangeRequest[]> {
  const res = await call('requests')
  if (!res?.ok) return []
  try {
    return ((await res.json()) as { requests: ChangeRequest[] }).requests ?? []
  } catch {
    return []
  }
}

/**
 * 결과를 남긴다. 다시 보내도 소용없으면 true: 남겼거나(204), 이미 없는 제안(404)이거나, 받지 않는 꼴(400).
 * 서버에 닿지 못했거나 서버가 처리하지 못했으면(5xx) false라서, 부르는 쪽이 나중에 다시 보낸다.
 */
export async function sendResult(id: string, status: 'applied' | 'rejected', results: OpResult[]): Promise<boolean> {
  const res = await call(`requests/${id}/result`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, results }) })
  return !!res && res.status < 500
}

// ---------- AI에게 부탁 ----------
// 보내는 것은 부탁 id와 해시 id뿐. AI에게 갈 문장은 로컬 서버가 정해진 말로 만든다.

const ASK_ERRORS: AskError[] = ['busy', 'no_agent', 'not_shared', 'bad_ask', 'timeout', 'login', 'failed']

export async function startAsk(ask: AskId, deck: string, slide: string | null): Promise<AskRun | AskError> {
  const res = await call('asks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ask, deck, slide }) })
  if (!res) return 'failed'
  try {
    const body = (await res.json()) as AskRun & { error?: AskError }
    if (res.status === 202 && body.id) return body
    return body.error && ASK_ERRORS.includes(body.error) ? body.error : 'failed'
  } catch {
    return 'failed'
  }
}

export async function askRun(id: string, signal?: AbortSignal): Promise<AskRun | null> {
  const res = await call(`asks/${id}`, { signal })
  if (!res?.ok) return null
  try {
    return (await res.json()) as AskRun
  } catch {
    return null
  }
}

export async function cancelAsk(id: string): Promise<void> {
  await call(`asks/${id}`, { method: 'DELETE' })
}

/** 지금 덱을 공유하면 AI에게 보이는 그대로 */
export const shapeOf = (deck: Deck) => toShape(deck)

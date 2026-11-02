// 부품 사이의 이음표(화살표, 더하기, 결과, 견주기)와, 발표할 때 빈 부품을 빼고 그리는 판.
// 이음표는 부품의 오른쪽 선(link)이나 아래 선(linkBelow) 위, 그 부품의 가운데에 선다

import type { Block, BlockLink, BlockType } from '../types'
import { BOARD_COLS, BOARD_ROWS, type Fit, LOOSE, removeFromBoard } from './board'
import { BLOCKS } from './catalog'

export const BLOCK_LINKS: { id: BlockLink; name: string; description: string }[] = [
  { id: 'arrow', name: '화살표', description: '앞의 것이 뒤의 것으로 이어지거나 바뀌어요. 같은 컴포넌트끼리, 단계와 단계, 차트와 차트, 숫자와 숫자를 잇거나 숫자나 결론 한마디로 맺어요' },
  { id: 'plus', name: '더하기', description: '같은 컴포넌트 두 개를 함께 해요' },
  { id: 'equals', name: '결과', description: '앞의 것이 모여 뒤의 숫자나 결론 한마디가 돼요' },
  { id: 'versus', name: '견주기', description: '같은 컴포넌트 두 개를 맞대어 견줘요' },
]
export const BLOCK_LINK_IDS = BLOCK_LINKS.map((l) => l.id)

/** 이음표가 선 선 양쪽에서 부품이 비켜 주는 너비 (캔버스 px). 위아래는 칸 사이(48)와 합쳐 96px에 이음표(44)가 혼자 선다 */
export const LINK_PAD = 24

export const isLink = (v: unknown): v is BlockLink => typeof v === 'string' && (BLOCK_LINK_IDS as string[]).includes(v)

/** 이음표 자리: 부품(id)의 오른쪽 선(h) 또는 아래 선(v) */
export type LinkTarget = { id: string; dir: 'h' | 'v' }

export const sameLinkTarget = (a: LinkTarget | null | undefined, b: LinkTarget | null | undefined) => !!a && !!b && a.id === b.id && a.dir === b.dir

/** 부품의 그 쪽 선이 판 안쪽인지 (오른쪽 끝, 맨 아래 부품의 바깥 선에는 이음표가 서지 않는다) */
const inner = (b: Block, dir: 'h' | 'v') => !!b.at && (dir === 'h' ? b.at.x + b.at.w < BOARD_COLS : b.at.y + b.at.h < BOARD_ROWS)

/** 선 건너편에서 맞닿은 부품들 (오른쪽 선이면 오른쪽 이웃, 아래 선이면 아래 이웃) */
export function across(blocks: readonly Block[], b: Block, dir: 'h' | 'v'): Block[] {
  const a = b.at
  if (!a) return []
  return blocks.filter((o) => {
    const c = o.at
    if (!c || o.id === b.id) return false
    return dir === 'h' ? c.x === a.x + a.w && c.y < a.y + a.h && a.y < c.y + c.h : c.y === a.y + a.h && c.x < a.x + a.w && a.x < c.x + c.w
  })
}

/** 선 이쪽에서 맞닿은 부품들 (across의 거꾸로: 이 부품의 왼쪽이나 위에 있는 이웃) */
export function behind(blocks: readonly Block[], b: Block, dir: 'h' | 'v'): Block[] {
  return blocks.filter((o) => o.id !== b.id && across(blocks, o, dir).some((x) => x.id === b.id))
}

/** 그 자리의 이음표. 판 바깥 선에는 없다 */
export function linkAt(blocks: readonly Block[], t: LinkTarget): BlockLink | null {
  const b = blocks.find((x) => x.id === t.id)
  if (!b || !inner(b, t.dir)) return null
  const v = t.dir === 'h' ? b.link : b.linkBelow
  return isLink(v) ? v : null
}

/** 이음표를 놓을 수 있는 모든 자리 (읽는 차례대로): 부품마다 오른쪽 선과 아래 선 가운데 판 안쪽인 것 */
export function linkTargets(blocks: readonly Block[]): LinkTarget[] {
  const out: LinkTarget[] = []
  for (const b of [...blocks].sort((p, q) => (p.at?.y ?? 0) - (q.at?.y ?? 0) || (p.at?.x ?? 0) - (q.at?.x ?? 0))) {
    if (inner(b, 'h')) out.push({ id: b.id, dir: 'h' })
    if (inner(b, 'v')) out.push({ id: b.id, dir: 'v' })
  }
  return out
}

/** 그 자리에 이음표를 놓은(link가 null이면 뺀) 판 */
export function withLink(blocks: Block[], t: LinkTarget, link: BlockLink | null): Block[] {
  const key = t.dir === 'h' ? 'link' : 'linkBelow'
  return blocks.map((b) => {
    if (b.id !== t.id) return b
    const { [key]: _, ...rest } = b
    return link ? { ...rest, [key]: link } : rest
  })
}

/** 설 자리가 없어진 이음표(판 바깥 선 위)를 뺀다. 부품을 옮기거나 빼면 생긴다. 바뀐 것이 없으면 그대로 */
export function tidyLinks(blocks: Block[]): Block[] {
  if (!blocks.some((b) => (b.link && !inner(b, 'h')) || (b.linkBelow && !inner(b, 'v')))) return blocks
  return blocks.map((b) => {
    let out = b
    if (b.link && !inner(b, 'h')) {
      const { link: _, ...rest } = out
      out = rest
    }
    if (b.linkBelow && !inner(b, 'v')) {
      const { linkBelow: _, ...rest } = out
      out = rest
    }
    return out
  })
}

/**
 * 이음표마다 뜻이 서는 짝. 화살표(이어진다, 바뀐다)와 견주기, 더하기는 같은 갈래의 것끼리:
 * 숫자에서 숫자로, 목록과 목록, 차트와 차트. 결과(=)는 무엇이든 모여 숫자나 한마디가 된다.
 * 진행 막대와 시장 원을 견주거나, 와플에서 화면 캡처로 화살표를 그으면 무엇을 말하는지 알 수 없다
 */
type Kind = 'number' | 'words' | 'list' | 'chart' | 'flow' | 'table' | 'image'
const KINDS: Record<Kind, BlockType[]> = {
  number: ['number', 'delta', 'goal', 'ring', 'ratio', 'spark', 'stat', 'meter', 'range', 'tiles', 'calc', 'kpi'],
  words: ['message', 'text', 'callout', 'quote', 'heading', 'note', 'summary'],
  list: ['bullets', 'points', 'facts', 'risks', 'faq', 'checks', 'people', 'status', 'date', 'agenda'],
  chart: ['bars', 'bridge', 'trend', 'versus', 'share', 'funnel', 'pareto', 'attain', 'diverge', 'likert', 'stack', 'heat', 'sparks', 'market', 'split', 'merge', 'scorecard', 'progress'],
  flow: ['flow', 'decision', 'whys', 'cycle', 'network', 'process', 'timeline', 'gantt', 'steps'],
  table: ['table', 'compare', 'pricing', 'rating', 'matrix', 'position', 'swot'],
  image: ['image', 'logos'],
}
export const kindOf = (type: BlockType): Kind | null => (Object.keys(KINDS) as Kind[]).find((k) => KINDS[k].includes(type)) ?? null

/**
 * 이음표를 달지 않는 부품: 소제목은 아래 부품들의 이름이고 주석은 위 부품에 붙는 작은 글이라, 이음표로 이으면 무엇과 무엇의 관계인지
 * 읽히지 않는다(목표 대비 = 주석 기준 글, 소제목 '지금 방식' + 점 목록)
 */
const UNLINKED = new Set<BlockType>(['heading', 'note'])
/** 연결된 다른 부품에 딸린 글. 이음표가 향하는 별도의 대상으로 세지 않는다. */
export const isLinkCompanion = (type: BlockType) => UNLINKED.has(type)
/**
 * 결과(=)와 화살표가 맺는 곳: 답이 되는 숫자와 결론 한마디. 강조 상자는 결정 요청이나 꼭 알아야 할 것이라 앞의 것이 모인 답이
 * 아니다(단계 표시 = 결정 요청)
 */
const RESULTS = new Set<BlockType>(['number', 'delta', 'goal', 'ring', 'ratio', 'stat', 'kpi', 'message'])
/**
 * 모여서 답이 되는 것: 숫자, 차트, 흐름, 표, 요점을 적은 목록과 설명 글. 로고, 화면 캡처, 사람, 날짜, 상태, 결론과 결정 요청, 인용은
 * 모여 숫자가 되지 않는다(로고 모음 = 전기료 3.6억 원, 결정 요청 › 전과 후)
 */
const SOURCES = new Set<BlockType>([...KINDS.number, ...KINDS.chart, ...KINDS.flow, ...KINDS.table, 'bullets', 'points', 'facts', 'checks', 'risks', 'text', 'summary'])
/** 화살표로 다른 부품끼리 이을 수 있는 갈래: 흐름(단계에서 단계로), 차트(추이에서 막대로), 숫자, 그림 */
const CHAINS = new Set(['flow', 'chart', 'number', 'image'])

/**
 * 이 이음표로 이 두 부품(앞 → 뒤)을 이을 수 있는지. 갈래만 같으면 받던 때는 개요와 날짜를 견주고(둘 다 목록 갈래),
 * 이름이 다른 두 숫자 사이에 'vs'가 서서 무엇을 견주는지 알 수 없었다.
 * - 더하기, 견주기: 같은 부품끼리 (숫자와 숫자, 목록과 목록, 같은 차트끼리). 같은 꼴이어야 함께 하거나 맞대는 것이 읽힌다
 * - 결과(=): 앞의 것(숫자, 차트, 흐름, 표, 요점 목록, 설명 글)이 모여 숫자나 결론 한마디가 된다
 * - 화살표: 같은 부품끼리, 흐름, 차트, 숫자, 그림은 같은 갈래끼리(전 → 후, 단계 → 단계), 그리고 결과처럼 숫자나 결론 한마디로 맺을 때
 * 소제목과 주석에는 어떤 이음표도 달지 않는다
 */
export function linkFits(link: BlockLink, from: BlockType, to: BlockType): boolean {
  if (UNLINKED.has(from) || UNLINKED.has(to)) return false
  const same = from === to
  if (link === 'plus' || link === 'versus') return same
  const result = RESULTS.has(to) && SOURCES.has(from)
  if (link === 'equals') return result && !same
  const a = kindOf(from)
  return same || result || (a !== null && a === kindOf(to) && CHAINS.has(a))
}

/** 그 자리에 이 이음표를 놓을 수 없는 까닭: 선 건너편의 어떤 부품과도 뜻이 서지 않으면 그 둘. 놓을 수 있으면 null */
export function linkIssue(blocks: readonly Block[], t: LinkTarget, link: BlockLink): { from: BlockType; to: BlockType } | null {
  const b = blocks.find((x) => x.id === t.id)
  if (!b || !BLOCKS[b.type]) return null
  const all = across(blocks, b, t.dir)
  if (!all.length) return null
  // 건너편이 여럿이면(위아래로 쌓인 칸) 모두와 뜻이 서야 한다. 그 가운데 소제목과 주석은 옆 부품에 딸린 글이라 빼고 본다:
  // 하나만 맞으면 받던 때는 숫자와 주석이 쌓인 칸에 견주기가 서서 주석과도 견주는 것처럼 읽혔다
  const next = all.filter((o) => !isLinkCompanion(o.type))
  const bad = UNLINKED.has(b.type) ? all[0] : (next.length ? next : all).find((o) => !linkFits(link, b.type, o.type))
  return bad ? { from: b.type, to: bad.type } : null
}

/** 사람이 아무것도 적지 않은 부품: 칸의 글, 항목의 글, 그림이 모두 비었다 */
export function blockIsBlank(b: Block): boolean {
  const blank = (v: unknown) => typeof v !== 'string' || !v.trim()
  return Object.values(b.fields).every(blank) && b.items.every((it) => (['title', 'body', 'value', 'meta', 'image'] as const).every((k) => blank(it[k])))
}

/**
 * 부품을 뺀 판(removeFromBoard)에 이음표 정리까지: 뺀 부품에 닿아 있던 이음표는 뗀다.
 * 그대로 두면 옆 부품이 넓어져 다른 두 부품 사이에 서서 뜻이 바뀐다
 */
export function dropBlock(blocks: Block[], id: string, fit: Fit): Block[] {
  const gone = blocks.find((b) => b.id === id)
  if (!gone) return blocks
  const unlinkH = new Set(behind(blocks, gone, 'h').map((b) => b.id))
  const unlinkV = new Set(behind(blocks, gone, 'v').map((b) => b.id))
  const cut = blocks.map((b) => {
    let out = b
    if (unlinkH.has(b.id) && b.link) {
      const { link: _, ...rest } = out
      out = rest
    }
    if (unlinkV.has(b.id) && b.linkBelow) {
      const { linkBelow: _, ...rest } = out
      out = rest
    }
    return out
  })
  return keepLinkEnds(blocks, removeFromBoard(cut, id, fit))
}

/**
 * 판을 다시 나눈 뒤(빼기, 다시 놓기) 건너편이 달라진 이음표를 뗀 판. 다른 부품을 뺀 뒤 이웃이 넓어지거나 판을 다시 놓으면
 * 직접 닿지 않았던 이음표도 새 부품을 가리킬 수 있다. 같은 종류의 부품이라도 다른 내용을 뜻하므로, 예전 판(before)에서 잇던
 * 부품과 달라진 이음표는 남겨 두지 않는다. 판 바깥 선에 서게 된 이음표도 뗀다(tidyLinks)
 */
export function keepLinkEnds(before: readonly Block[], after: Block[]): Block[] {
  let out = tidyLinks(after)
  for (const t of linkTargets(before)) {
    const link = linkAt(before, t)
    if (!link || linkIssue(before, t, link) || !linkAt(out, t)) continue
    const from = before.find((b) => b.id === t.id)
    const next = out.find((b) => b.id === t.id)
    if (!from || !next) continue
    const ends = (bs: readonly Block[], b: Block) => across(bs, b, t.dir).filter((x) => !isLinkCompanion(x.type)).map((x) => x.id).sort()
    const oldEnds = ends(before, from)
    const newEnds = ends(out, next)
    if (oldEnds.length !== newEnds.length || oldEnds.some((end, i) => end !== newEnds[i])) out = withLink(out, t, null)
  }
  return out
}

/**
 * 발표할 때 그리는 판: 비워 둔 부품은 빼고, 옆 부품이 그 자리를 넓혀 덮는다. 편집할 때 옆에 둔 빈 부품이
 * 발표 화면에 구멍으로 남지 않게. 크기 규칙 없이 자리만 넓힌다. 넓어진 부품이 글자가 커져 더 높아지면(숫자 카드처럼)
 * 그리는 쪽(slides/fitBlocks.ts)이 장의 글자를 한 단계 줄여 맞춘다. 빈 부품의 자리를 비워 두거나 편집할 때와 다르게
 * 판을 다시 놓는 것보다 이쪽이 낫다(편집기 미리 보기에서 세 가지를 견주어 보았다)
 */
export function shownBlocks(blocks: Block[]): Block[] {
  if (!blocks.some(blockIsBlank)) return blocks
  let out = blocks
  for (const b of blocks) if (blockIsBlank(b)) out = dropBlock(out, b.id, LOOSE)
  return out
}

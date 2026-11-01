// 넣기, 빼기, 옮기기, 맞바꾸기, 놓을 자리(이미지는 비율에 맞는 자리)와 놓을 수 없는 까닭, 판의 선 끌기.
// 자리 계산은 판(board.ts)이 하고, 여기서는 장의 규칙(부품 수, 면, 이음표, 이미지)과 손으로 끄는 곳을 판의 자리로 읽는 일을 한다

import type { Block, BlockAt, BlockType } from '../types'
import {
  allSpots,
  autoInsert,
  BOARD_COLS,
  BOARD_ROWS,
  byReading,
  type Fit,
  type Gutter,
  gutterRange,
  guttersOf,
  insertBlock,
  insertGroup,
  LOOSE,
  moveGutter,
  needRows,
  needWith,
  rebuild,
  sameSpot,
  settle,
  type Side,
  type Spot,
  spotBlocks,
  swapBlocks,
  treeOf,
} from './board'
import { ARRANGE_MAX, arrangeBest, arrangeOrder, boardCost, isArranged } from './arrange'
import { aspectOf, fitImage, fitPlaced, misfit } from './images'
import { across, dropBlock, isLinkCompanion, keepLinkEnds, linkAt, linkIssue, linkTargets, tidyLinks } from './links'
import { BLOCK_COL_GAP, BLOCK_GAP, isSmall, isSolo, largeCount, MAX_BLOCKS, MAX_LARGE, settleLook } from './rules'
import { AREA_W, atRect, boardFit, heightIssue, overAlready, type Rect } from './sizing'

/** 놓을 자리: 판의 한 자리(spot)에 넣기, 또는 옮기는 부품을 다른 부품(with)과 맞바꾸기 */
export type DropTarget = { kind: 'spot'; spot: Spot } | { kind: 'swap'; with: string }

export const sameTarget = (a: DropTarget | null | undefined, b: DropTarget | null | undefined) => {
  if (!a || !b || a.kind !== b.kind) return false
  return a.kind === 'swap' ? a.with === (b as typeof a).with : sameSpot(a.spot, (b as typeof a).spot)
}

/** 판의 자리 하나를 놓을 자리로 */
export const spotTarget = (spot: Spot): DropTarget => ({ kind: 'spot', spot })
/** 맨 아래 새 줄 */
export const BOTTOM: DropTarget = spotTarget({ at: null, side: 'below' })

/**
 * 그 자리에 넣을 수 없는 까닭. 화면에 보이는 문구는 편집기가 이것으로 만든다 (screens/editor/noRoom.ts).
 * full: 한 장의 부품 수, large: 큰 부품 수, narrow: 그 자리에 끼우면 누군가 너무 좁아진다(span: 넣는 부품의 가장 좁은 너비),
 * height: 넣으면 판이 장보다 높아진다 (need: 잘리지 않는 데 드는 높이, room: 본문 높이, already: 넣기 전의 판부터 장보다 높다),
 * link: 넣으면 유효한 기존 연결의 대상이 바뀐다
 */
export type NoRoom =
  | { kind: 'full' }
  | { kind: 'narrow'; span: number }
  | { kind: 'height'; need: number; room: number; already?: true; noBody?: true }
  /** 판 너비를 혼자 쓰는 부품(type)과 나란히 놓으려 할 때 */
  | { kind: 'solo'; type: BlockType }
  /** 면을 바꿀 수 없을 때: 진한 면은 하나만, 진한 면과 옅은 면은 섞지 않고, 혼자 판 너비를 다 쓰는 작은 부품은 면 없이 */
  | { kind: 'look'; why: 'one-bold' | 'mix' | 'alone' | 'flat' | 'no-bold' }
  /** 작은 부품이 아닌 부품이 장에 MAX_LARGE개 찼다 */
  | { kind: 'large' }
  /** 기존 연결의 양 끝을 유지하며 자동으로 넣을 수 없다 */
  | { kind: 'link' }
  /** 옮기는 부품을 이 부품(type)과 맞바꾸면 한쪽이 상대 자리에 들어가지 않을 때 */
  | { kind: 'swap'; type: BlockType }

/** 부품 수가 넘치는지: 모든 부품(MAX_BLOCKS), 작은 부품이 아니면 큰 부품(MAX_LARGE)도 */
function crowdIssue(blocks: readonly Block[], adding: readonly Block[]): NoRoom | null {
  if (blocks.length + adding.length > MAX_BLOCKS) return { kind: 'full' }
  if (largeCount(blocks) + adding.filter((b) => !isSmall(b.type)).length > MAX_LARGE) return { kind: 'large' }
  return null
}

/**
 * 판의 크기 규칙. 본문 높이를 모르면(문서 보기, 시험) 높이는 따지지 않고 너비만 지킨다:
 * 표 옆에 목록을 두거나 로고 열 개를 좁은 칸에 넣는 것은 높이와 상관없이 안 된다
 */
const fitFor = (blocks: readonly Block[], areaH?: number): Fit => (areaH === undefined ? { ...boardFit(WIDTH_ONLY_H, blocks), minH: LOOSE.minH } : boardFit(areaH, blocks))
/** 너비만 따질 때 너비 규칙을 읽어 오는 높이 (너비 규칙은 높이와 상관없다) */
const WIDTH_ONLY_H = 1000

/** 부품을 넣은 뒤의 판 정리: 설 자리가 없어진 이음표를 빼고, 넣은 부품의 면을 장에 맞추고, 이미지는 비율에 맞춘다 */
const settled = (blocks: Block[], added: readonly Block[], areaH?: number): Block[] => {
  let out = tidyLinks(blocks)
  for (const b of added) out = settleLook(out, out.find((x) => x.id === b.id) ?? b)
  return added.length === 1 ? fitPlaced(out, added[0], areaH) : out
}

/**
 * 그 자리에 부품을 넣은 판. 넣을 수 없는 자리면 null.
 * 본문 높이(areaH)를 주면 부품마다 잘리지 않는 크기를 지킨다. 놓을 수 있는지 따질 때(whyNot)와 끄는 동안 보이는 모습,
 * 놓은 뒤가 같은 판을 주어야 서로 맞는다
 */
export function insertAt(blocks: Block[], spot: Spot, block: Block, areaH?: number): Block[] | null {
  return remember(INSERTED, blocks, block, spot, areaH, () => {
    if (crowdIssue(blocks, [block])) return null
    const next = insertBlock(blocks, block, spot, fitFor([...blocks, block], areaH))
    return next && settled(next, [block], areaH)
  })
}

/**
 * 판(blocks)과 넣는 부품(block) 객체마다 자리별 결과를 기억한다. 끄는 동안 판과 끄는 부품은 같은 객체인데, 손을 움직일 때마다
 * 놓을 수 있는 자리(validTargets), 놓을 수 없는 까닭(whyNot, placeIssue), 손 아래 자리(dropTarget)가 같은 자리를 몇 번씩
 * 다시 넣어 봤다. 자리가 하나도 없는 장에서는 손을 움직일 때마다 10ms 넘게 들었다.
 * 판과 부품은 고치지 않고 새로 만들기 때문에(불변) 객체가 같으면 결과도 같다. 판이 바뀌면 예전 판의 기억은 저절로 버려진다(WeakMap)
 */
type Memo<T> = WeakMap<Block[], WeakMap<Block, Map<string, T>>>
const INSERTED: Memo<Block[] | null> = new WeakMap()
const WHY_NOT: Memo<NoRoom | null> = new WeakMap()

function remember<T>(memo: Memo<T>, blocks: Block[], block: Block, spot: Spot, areaH: number | undefined, make: () => T): T {
  let byBlock = memo.get(blocks)
  if (!byBlock) memo.set(blocks, (byBlock = new WeakMap()))
  let bySpot = byBlock.get(block)
  if (!bySpot) byBlock.set(block, (bySpot = new Map()))
  const key = `${spot.at ?? ''}|${spot.side}|${spot.up ?? 0}|${areaH ?? ''}`
  if (bySpot.has(key)) return bySpot.get(key) as T
  const out = make()
  bySpot.set(key, out)
  return out
}

/**
 * 부품 묶음(내 컴포넌트)을 그 자리에 넣은 판. 묶음 안의 짜임(나란한 것, 쌓은 것)은 그대로다.
 * 부품 수가 넘치거나 장에 들어가지 않으면 null (까닭은 groupIssue)
 */
export function insertParts(blocks: Block[], spot: Spot, add: Block[], areaH?: number): Block[] | null {
  if (!add.length || crowdIssue(blocks, add)) return null
  const next = insertGroup(blocks, add, spot, fitFor([...blocks, ...add], areaH))
  return next && settled(next, add, areaH)
}

/** 부품 묶음을 이 장 맨 아래에 넣을 수 없는 까닭. 넣을 수 있으면 null */
export function groupIssue(blocks: Block[], add: Block[], areaH?: number): NoRoom | null {
  const crowd = crowdIssue(blocks, add)
  if (crowd) return crowd
  if (insertParts(blocks, { at: null, side: 'below' }, add, areaH)) return null
  return areaH === undefined ? { kind: 'full' } : heightIssue([...blocks, ...add], areaH, blocks)
}

/**
 * 부품을 뺀 판. 옆 부품들이 그 자리를 넓혀 덮고, 뺀 부품에 닿아 있던 이음표는 뗀다.
 * 판에 이미지가 있으면 그 이미지에 다시 맞춘다(장 높이를 알 때): 똑같이 나눈 너비로 돌아가면 화면 캡처가 반 칸에 눌렸다
 */
export function removeBlock(blocks: Block[], blockId: string, areaH?: number): Block[] {
  const next = dropBlock(blocks, blockId, fitFor(blocks, areaH))
  if (areaH === undefined) return next
  // 알아서 짠 판(짜임 틀 고르기)에서 빼면 남은 부품들로 다시 고른다: 넣을 때와 같은 규칙이라 넣고 빼면 원래 판으로 돌아간다
  if (next.length >= 2 && blocks.length <= ARRANGE_MAX && isArranged(blocks, fitFor(blocks, areaH), areaH, aspectOf)) {
    const best = arrangeBest(arrangeOrder(next), fitFor(next, areaH), areaH, aspectOf)
    if (best) {
      const byId = new Map(best.blocks.map((b) => [b.id, b]))
      return tidyLinks(next.map((b) => byId.get(b.id) ?? b))
    }
  }
  let out = overAlready(next, areaH) ? (refit(blocks, next, areaH) ?? next) : next
  for (const img of out.filter((b) => aspectOf(b))) out = fitImage(out, img.id, aspectOf(img)!, areaH)
  return out
}

/**
 * 뺀 판이 장에 들어가지 않을 때 다시 놓은 판. 옆 부품이 그 자리를 넓혀 덮는데, 넓어지면 글자가 커져 더 높아지는 부품이 있다(숫자 카드,
 * 막대 차트): 선을 끌어 짠 판에서 한 줄의 둘 가운데 하나를 빼면 남은 것이 판 너비를 다 받아 판보다 높아졌고, 편집기는 '자리가 모자라요'를
 * 띄우며 컴포넌트를 잠갔다. 넷까지면 짜임 틀을 견줘 가장 보기 좋은 판을(arrange.ts), 틀로 견줄 수 없으면 읽는 차례대로 눌러서 넣을 때처럼
 * 다시 놓는다(차례대로 넣으면 숫자 아래에 목록을 쌓고 막대를 옆 칸 위에 홀로 세워 아래가 크게 빈 판이 나왔다).
 * 그래도 들어가지 않으면 null (뺀 판 그대로 두고 편집기가 '자리가 모자라요'를 알린다)
 */
function refit(before: Block[], next: Block[], areaH: number): Block[] | null {
  const fit = fitFor(next, areaH)
  const best = arrangeBest(arrangeOrder(next), fit, areaH, aspectOf)
  const byId = best && new Map(best.blocks.map((b) => [b.id, b]))
  const again = byId ? next.map((b) => byId.get(b.id) ?? b) : rebuild(next, fit)
  return again && !overAlready(again, areaH) ? keepLinkEnds(before, again) : null
}

/**
 * 옮기는 동안 자리를 찾는 판: 옮기는 부품을 뺀 판을 옮기기(moveAt)가 보는 그대로. 빼기(removeBlock)처럼 남은 부품으로 짜임을 다시
 * 고르지 않는다: 다시 고른 판으로 자리를 찾으면 그 판에서는 들어가는 자리가 옮기기에서는 들어가지 않아, 놓아도 아무 일이 없었다
 */
export function movingBase(blocks: Block[], blockId: string, areaH?: number): Block[] {
  return dropBlock(blocks, blockId, fitFor(blocks, areaH))
}

/** 판 너비를 혼자 쓰는 부품이 그 자리에서 옆에 서게 되는지: 넣는 부품이 그런 부품이거나, 옆에 서는 묶음에 그런 부품이 있으면 그 부품 */
function soloBeside(blocks: Block[], spot: Spot, block: Block): BlockType | null {
  if (spot.side !== 'left' && spot.side !== 'right') return null
  if (isSolo(block.type)) return block.type
  return spotBlocks(blocks, spot).find((b) => isSolo(b.type))?.type ?? null
}

/** 그 자리에 넣을 수 없는 까닭. 넣을 수 있으면 null */
export function whyNot(blocks: Block[], target: DropTarget, block: Block, areaH?: number): NoRoom | null {
  if (target.kind === 'swap') return null
  return remember(WHY_NOT, blocks, block, target.spot, areaH, () => spotIssue(blocks, target.spot, block, areaH))
}

function spotIssue(blocks: Block[], spot: Spot, block: Block, areaH?: number): NoRoom | null {
  const crowd = crowdIssue(blocks, [block])
  if (crowd) return crowd
  // 제목과 부제가 본문을 다 차지하면 너비가 아니라 높이가 없는 것이다.
  if (areaH !== undefined && Number.isFinite(areaH) && areaH <= 0) return { kind: 'height', need: 1, room: 0, noBody: true, ...(blocks.length ? { already: true } : {}) }
  if (insertAt(blocks, spot, block, areaH)) return null
  const solo = blocks.length ? soloBeside(blocks, spot, block) : null
  if (solo) return { kind: 'solo', type: solo }
  if (areaH === undefined) return { kind: 'narrow', span: boardFit(1000).minW(block) }
  const fit = boardFit(areaH, [...blocks, block])
  const need = needWith(blocks, block, spot, fit)
  if (need === null || !Number.isFinite(need)) return { kind: 'narrow', span: fit.minW(block) }
  return { kind: 'height', need: Math.round(rowsPx(need, areaH)), room: Math.round(areaH), ...(overAlready(blocks, areaH) ? { already: true as const } : {}) }
}

/** 판의 칸 수를 px 높이로 (칸 사이를 뺀 것) */
const rowsPx = (rows: number, areaH: number) => atRect({ x: 0, y: 0, w: 1, h: rows }, { w: AREA_W, h: areaH }).h

/** 넣을 수 있는 모든 자리 (읽는 차례대로). 본문 높이를 주면 넣고 나서도 잘리지 않는 자리만 */
export function validTargets(blocks: Block[], block: Block, areaH?: number): DropTarget[] {
  return allSpots(blocks)
    .map(spotTarget)
    .filter((t) => !whyNot(blocks, t, block, areaH))
}

/**
 * 이 장 어디에도 넣을 수 없을 때 그 까닭 하나. 넣을 수 있으면 null.
 * 높이만 모자란 자리가 있으면 그 가운데 가장 덜 모자란 것(무엇을 줄이면 되는지 알려 줄 수 있어서), 아니면 너비
 */
export function placeIssue(blocks: Block[], block: Block, areaH?: number): NoRoom | null {
  const crowd = crowdIssue(blocks, [block])
  if (crowd) return crowd
  // 들어가는 자리를 하나 찾으면 나머지는 재지 않는다 (부품 고르기는 카드마다 이것을 재서, 거의 모든 카드가 들어가는 장이 가장 흔하다)
  const all: NoRoom[] = []
  const linked = blocks.some((b) => b.link || b.linkBelow)
  let breaksLink = false
  for (const s of allSpots(blocks)) {
    const w = whyNot(blocks, spotTarget(s), block, areaH)
    if (!w) {
      const next = linked ? insertAt(blocks, s, block, areaH) : null
      if (!linked || (next && keepsLinkEnds(blocks, next))) return null
      breaksLink = true
      continue
    }
    all.push(w)
  }
  if (breaksLink) return { kind: 'link' }
  const tall = all.filter((w) => w.kind === 'height').sort((a, b) => a.need - b.need)[0]
  return tall ?? all.find((w) => w.kind === 'narrow') ?? all[0] ?? { kind: 'full' }
}

/**
 * 눌러서 넣은 판: 판이 알아서 고른 자리(board.ts의 autoInsert)에. 이미지가 든 이미지 부품(붙여 넣은 이미지)은
 * 이미지 비율에 가장 잘 맞는 자리(imagePlace). 넣을 수 없으면 null (까닭은 placeIssue)
 */
export function autoPlace(blocks: Block[], block: Block, areaH?: number): Block[] | null {
  if (crowdIssue(blocks, [block])) return null
  if (areaH !== undefined && aspectOf(block)) {
    const t = imagePlace(blocks, block, areaH)
    return t?.kind === 'spot' ? insertAt(blocks, t.spot, block, areaH) : null
  }
  return remember(AUTO, blocks, block, { at: null, side: 'below' }, areaH, () => {
    const next = slotIn(blocks, block, areaH)
    return next && areaH !== undefined ? arranged(blocks, next, areaH, block) : next
  })
}

const AUTO: Memo<Block[] | null> = new WeakMap()

/** 사람이 요청했을 때 지금 내용으로 다시 배치한다. 연결 기호나 소제목은 묶음의 뜻을 자동으로 알 수 없어 그대로 둔다. */
export function rearrangeBlocks(blocks: Block[], areaH: number): Block[] | null {
  if (blocks.length < 2 || blocks.length > ARRANGE_MAX || blocks.some((b) => b.link || b.linkBelow || b.type === 'heading')) return null
  if (new Set(blocks.map((b) => b.id)).size !== blocks.length || !treeOf(blocks)) return null
  // 이미 만들어 둔 슬라이드의 읽는 차례는 사용자가 정한 뜻이다. 저장 배열 순서나 새 결론 우선 규칙으로 바꾸지 않는다.
  const order = byReading(blocks)
  const fit = fitFor(blocks, areaH)
  const tight = needRows(blocks, fit) > BOARD_ROWS
  const candidates: { blocks: Block[]; cost: number }[] = []
  arrangeBest(order, fit, areaH, aspectOf, candidates)
  const best = candidates
    .filter((c) => byReading(c.blocks).every((b, i) => b.id === order[i].id))
    .sort((a, b) => a.cost - b.cost)
    .find((c) => c.cost < 1000 && needRows(c.blocks, fit) <= BOARD_ROWS)
  // 현재 판이 들어갈 때만 후보가 없어도 그대로 유지할 수 있다. 들어가지 않으면 실패를 알려야 한다.
  if (!best) return tight ? null : blocks
  // 현재 판이 너무 높으면 보기 점수보다 공간에 들어가는 것이 먼저다.
  // 후보에 없는 사람이 정한 비율이 더 나을 수도 있다. 더 나쁜 후보로 바꾸지 않는다.
  if (!tight && best.cost >= boardCost(blocks, fit, areaH) - 0.5) return blocks
  const byId = new Map(best.blocks.map((b) => [b.id, b.at]))
  return blocks.map((b) => ({ ...b, at: byId.get(b.id) ?? b.at }))
}

/**
 * 짜임 틀 고르기(arrange.ts): 컴포넌트가 넷까지인 장에서, 지금 판이 알아서 고른 판 그대로면(사람이 옮기거나 선을 끌지 않았으면)
 * 끼워 넣은 판(next) 대신 같은 부품들로 짤 수 있는 틀 가운데 가장 보기 좋은 판. 끼운 판이 더 나으면 그대로.
 * 읽는 차례는 끼운 판의 것을 따른다(결론은 근거 위, 소제목은 그 아래 부품 위).
 * 장의 첫 결론(added가 핵심 한 줄, 강조 상자)은 끼운 자리가 어디든 맨 앞에 두고 짠다: 긴 목록 아래에 차트를 쌓은 장은 맨 위에도
 * 첫 부품 왼쪽에도 높이나 너비가 모자라(slotFirst) 판이 맨 아래나 옆에 끼웠고, 틀도 그 차례대로 골라 결론이 근거 밑에 깔렸다.
 * 목록과 차트를 나란히 두면 결론이 위에 들어간다. 그런 틀이 있으면 끼운 판보다 점수가 나빠도 그것을 쓴다(결론부터)
 */
function arranged(blocks: Block[], next: Block[], areaH: number, added: Block): Block[] {
  if (next.length > ARRANGE_MAX || !isArranged(blocks, fitFor(blocks, areaH), areaH, aspectOf)) return next
  const fit = fitFor(next, areaH)
  const lead = LEADS.has(added.type) && !blocks.some((b) => LEADS.has(b.type)) && byReading(next)[0].id !== added.id ? next.find((b) => b.id === added.id) : undefined
  const order = arrangeOrder(next)
  const best = arrangeBest(lead ? [lead, ...order.filter((b) => b !== lead)] : order, fit, areaH, aspectOf)
  // 결론을 앞에 둔 틀도 판 너비를 혼자 쓰는 부품을 좁히는 것처럼 틀이 깨지면(1000점) 끼운 판과 그냥 견준다
  if (!best || (best.cost >= boardCost(next, fit, areaH) - 0.5 && !(lead && best.cost < 1000))) return next
  const byId = new Map(best.blocks.map((b) => [b.id, b]))
  return tidyLinks(next.map((b) => byId.get(b.id) ?? b))
}

/**
 * 판이 알아서 고른 자리에 끼운 판. 그 자리가 기존 연결의 대상을 바꾸면 대상을 지키는 자리 가운데 점수가 가장 좋은 자리에 놓는다.
 * 그런 자리가 없으면 넣지 않는다.
 */
function slotIn(blocks: Block[], block: Block, areaH?: number): Block[] | null {
  const next = slotFirst(blocks, block, areaH)
  if (!next || keepsLinkEnds(blocks, next)) return next
  let best: { blocks: Block[]; cost: number } | null = null
  for (const spot of allSpots(blocks).reverse()) {
    const other = insertAt(blocks, spot, block, areaH)
    if (!other || !keepsLinkEnds(blocks, other)) continue
    if (areaH === undefined) return other
    const cost = boardCost(other, fitFor(other, areaH), areaH)
    if (!best || cost < best.cost) best = { blocks: other, cost }
  }
  return best?.blocks ?? null
}

/**
 * 넣기 전에 뜻이 서던 이음표가 넣은 뒤에도 그 자리에서 뜻이 서는지 (links.ts의 linkIssue). 판이 고른 자리가 이음표 선의 건너편이면
 * 새 부품도 그 이음표로 이어진다: '핵심 포인트 = 큰 숫자, 숫자 한 줄'의 아래 줄 끝에 범위가 들어가 결과(=)가 범위로도 맺어
 * 뜻이 서지 않았다(결과는 숫자나 결론 한마디로 맺는다)
 */
function keepsLinks(before: Block[], after: Block[]): boolean {
  return linkTargets(before).every((t) => {
    const link = linkAt(before, t)
    return !link || !!linkIssue(before, t, link) || (linkAt(after, t) === link && !linkIssue(after, t, link))
  })
}

/** 자동 삽입은 유효한 기존 연결의 양 끝도 보존한다. 같은 종류의 부품으로 연결 대상이 바뀌어도 다른 뜻이 된다. */
function keepsLinkEnds(before: Block[], after: Block[]): boolean {
  if (!before.some((b) => b.link || b.linkBelow)) return true
  if (!keepsLinks(before, after)) return false
  return linkTargets(before).every((t) => {
    const link = linkAt(before, t)
    if (!link || linkIssue(before, t, link)) return true
    const a = before.find((b) => b.id === t.id)
    const b = after.find((b) => b.id === t.id)
    if (!a || !b) return false
    // 소제목과 주석은 linkIssue에서도 다른 부품에 딸린 글로 보므로 연결 대상에 더하지 않는다.
    const oldEnds = across(before, a, t.dir).filter((x) => !isLinkCompanion(x.type)).map((x) => x.id).sort()
    const newEnds = across(after, b, t.dir).filter((x) => !isLinkCompanion(x.type)).map((x) => x.id).sort()
    return oldEnds.length === newEnds.length && oldEnds.every((id, i) => id === newEnds[i])
  })
}

/** 판이 알아서 고른 자리 (slotIn의 첫 고르기) */
function slotFirst(blocks: Block[], block: Block, areaH?: number): Block[] | null {
  const fit = fitFor([...blocks, block], areaH)
  // 소제목 바로 다음에 넣는 부품은 그 소제목 아래에: 소제목은 아래 부품들의 이름이다. 판이 알아서 고르면(autoInsert) 마지막 줄의
  // 옆이나 판 오른쪽에 들어가, 소제목이 묶을 것 없이 맨 아래에 혼자 남았다(소제목, 목록, 소제목, 할 일 차례로 넣은 장)
  // 마지막에 넣은 부품 (blocks는 넣은 차례다. 읽는 차례로는 나란한 묶음에서 왼쪽 단의 아래 부품이 마지막이 된다)
  const last = blocks.at(-1)
  if (last?.type === 'heading' && block.type !== 'heading') {
    const under = insertBlock(blocks, block, { at: last.id, side: 'below' }, fit)
    if (under) return settled(under, [block], areaH)
  }
  // 소제목 묶음(소제목과 그 아래 부품들) 다음에 넣는 소제목은 그 묶음 옆에 나란히: 두 묶음이 같은 꼴로 서서 견주어 읽힌다.
  // 판이 알아서 고르면 맨 아래 새 줄에 들어가 다음 부품이 그 아래에 들어갈 높이가 없어, 소제목만 아래에 혼자 남았다
  if (block.type === 'heading' && last && last.type !== 'heading') {
    const head = [...blocks].reverse().find((b) => b.type === 'heading')
    const from = head ? blocks.indexOf(head) : -1
    const group = new Set(blocks.slice(from).map((b) => b.id))
    if (head)
      for (const spot of [{ at: head.id, side: 'right', up: 1 }, { at: null, side: 'right' }] as Spot[]) {
        const covers = spotBlocks(blocks, spot)
        if (!covers.length || !covers.every((b) => group.has(b.id))) continue
        const beside = insertBlock(blocks, block, spot, fit)
        if (beside) return settled(beside, [block], areaH)
      }
  }
  // 결론을 말하는 부품(핵심 한 줄, 강조 상자)은 근거 위에: 보고는 결론부터라, 숫자나 목록을 넣은 뒤에 결론을 눌러 넣으면
  // 판이 알아서 고른 맨 아래에 들어가 결론이 근거 밑에 깔려 차례가 뒤집혀 보였다. 이미 결론 부품이 있으면 그 장은 사람이 짠
  // 차례가 있는 것이라 판에 맡긴다. 알아서 고를 때(눌러 넣기, AI가 자리 없이 넣기)만이고, 끌어 놓은 자리는 그대로 둔다
  // 맨 위 새 줄에 들어갈 높이가 없으면 맨 처음 읽는 부품의 왼쪽에(그래도 가장 먼저 읽힌다)
  if (LEADS.has(block.type) && blocks.length && !blocks.some((b) => LEADS.has(b.type))) {
    const first = byReading(blocks)[0]
    for (const spot of [{ at: null, side: 'above' }, { at: first.id, side: 'left' }] as Spot[]) {
      const top = insertBlock(blocks, block, spot, fit)
      if (top) return settled(top, [block], areaH)
    }
  }
  const next = autoInsert(blocks, block, fit)
  return next && settled(next, [block], areaH)
}

/** 결론을 말하는 부품: 알아서 넣으면 근거보다 위에 (autoPlace) */
const LEADS = new Set<BlockType>(['message', 'callout'])

/**
 * 부품을 옮긴 판. 자리(spot)면 빼고 그 자리에 다시 넣고, 맞바꾸기(swap)면 두 부품의 자리를 바꾼다.
 * 차례(발표할 때 나오는 차례를 따로 정하지 않았을 때 읽는 차례가 된다)는 그대로. 옮길 수 없으면 null
 */
export function moveAt(blocks: Block[], blockId: string, target: DropTarget, areaH?: number): Block[] | null {
  // 끄는 동안 손을 움직일 때마다 같은 판에서 같은 자리를 몇 번씩 옮겨 본다(놓을 자리 고르기, 경계 확인, 가까운 자리 찾기). 판은 고치지 않고
  // 새로 만들어서(불변) 판이 같으면 결과도 같다 (insertAt의 remember와 같은 까닭)
  let memo = MOVED.get(blocks)
  if (!memo) MOVED.set(blocks, (memo = new Map()))
  const key = `${blockId}|${target.kind === 'swap' ? `=${target.with}` : `${target.spot.at ?? ''}|${target.spot.side}|${target.spot.up ?? 0}`}|${areaH ?? ''}`
  if (!memo.has(key)) memo.set(key, moveNow(blocks, blockId, target, areaH))
  return memo.get(key)!
}

const MOVED = new WeakMap<Block[], Map<string, Block[] | null>>()

function moveNow(blocks: Block[], blockId: string, target: DropTarget, areaH?: number): Block[] | null {
  const fit = fitFor(blocks, areaH)
  const self = blocks.find((b) => b.id === blockId)
  if (!self) return null
  let next: Block[] | null
  if (target.kind === 'swap') {
    // 이음표는 자리에 남는다: 맞바꾼 두 부품이 서로의 이음표를 갖는다 ('앞 → 뒤'를 맞바꿔도 화살표는 그 사이에)
    const other = blocks.find((b) => b.id === target.with)
    if (!other) return null
    const links = (b: Block) => ({ link: b.link, linkBelow: b.linkBelow })
    const bare = ({ link: _, linkBelow: __, ...b }: Block) => b
    const traded = blocks.map((b) => (b.id === blockId ? { ...bare(b), ...clean(links(other)) } : b.id === other.id ? { ...bare(b), ...clean(links(self)) } : b))
    next = swapBlocks(traded, blockId, other.id, fit)
  } else {
    // 옆 부품과 잇던 이음표는 두고 간다 (새 자리의 옆 부품과는 이어지지 않는다)
    const { link: _, linkBelow: __, ...bare } = self
    const placed = insertBlock(dropBlock(blocks, blockId, fit), bare, target.spot, fit)
    const byId = placed && new Map(placed.map((b) => [b.id, b]))
    next = byId ? blocks.map((b) => byId.get(b.id)).filter((b): b is Block => !!b) : null
  }
  return next && settled(next, [], areaH)
}

/** 값이 없는 키는 빼고 (이음표를 옮길 때) */
const clean = <T extends object>(o: T): Partial<T> => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>

/** 판 둘레에서 이만큼(본문 px) 안쪽까지는 판의 그 쪽 끝 (맨 위·아래 새 줄, 맨 왼쪽·오른쪽 새 칸) */
const BOARD_EDGE = 32
/** 선(칸 사이) 둘레로 이만큼(본문 px)까지는 그 선 위에 넣기: 칸 사이만으로는 손으로 맞히기 어렵다 */
const LINE_EDGE = 20
/** 옮길 때 부품 가운데의 이 몫(가로, 세로 저마다)은 맞바꾸기 */
const SWAP_CORE = 0.5

/**
 * 손 아래에서 바라는 자리들 (먼저 바라는 차례대로).
 * 판 둘레는 판의 그 쪽 끝, 선 둘레는 그 선 위, 부품 안이면 가장 가까운 변 쪽(그 부품 옆, 그다음 그 부품이 든 묶음 옆).
 * 옮기는 중이면(moving) 부품 가운데는 그 부품과 맞바꾸기
 */
function wantedTargets(blocks: Block[], p: { x: number; y: number }, size: { w: number; h: number }, moving?: string): DropTarget[] {
  if (!blocks.length) return [BOTTOM]
  const edge: DropTarget[] = []
  if (p.y < BOARD_EDGE) edge.push(spotTarget({ at: null, side: 'above' }))
  if (p.y > size.h - BOARD_EDGE) edge.push(spotTarget({ at: null, side: 'below' }))
  if (p.x < BOARD_EDGE) edge.push(spotTarget({ at: null, side: 'left' }))
  if (p.x > size.w - BOARD_EDGE) edge.push(spotTarget({ at: null, side: 'right' }))
  // 선 위: 선(칸 사이의 가운데)에서 가장 가까운 것
  const lines = guttersOf(blocks)
    .map((g) => ({ g, d: lineDistance(g, p, size) }))
    .filter((x) => x.d !== null && x.d <= LINE_EDGE)
    .sort((a, b) => a.d! - b.d! || b.g.depth - a.g.depth)
    .map((x) => spotTarget(x.g.spot))
  // 손 아래의 부품 (칸 사이에 있으면 가장 가까운 부품)
  let under: Block | null = null
  let r: Rect | null = null
  let best = Infinity
  for (const b of blocks) {
    const br = atRect(b.at!, size)
    const d = Math.hypot(Math.max(br.x - p.x, 0, p.x - (br.x + br.w)), Math.max(br.y - p.y, 0, p.y - (br.y + br.h)))
    if (d < best) {
      best = d
      under = b
      r = br
    }
  }
  const inside: DropTarget[] = []
  if (under && r) {
    const u = (p.x - r.x) / r.w
    const v = (p.y - r.y) / r.h
    const core = (1 - SWAP_CORE) / 2
    if (moving && under.id !== moving && u > core && u < 1 - core && v > core && v < 1 - core) inside.push({ kind: 'swap', with: under.id })
    // 변까지의 거리 (px). 가까운 변 차례로: 그 부품 옆, 그 부품이 든 묶음 옆
    const sides = (
      [
        ['left', p.x - r.x],
        ['right', r.x + r.w - p.x],
        ['above', p.y - r.y],
        ['below', r.y + r.h - p.y],
      ] as const
    )
      .slice()
      .sort((a, b) => a[1] - b[1])
    for (const [side] of sides.slice(0, 2)) for (let up = 0; up < 4; up++) inside.push(spotTarget({ at: under.id, side, ...(up ? { up } : {}) }))
  }
  return [...edge, ...lines, ...inside]
}

/** 끄는 동안 화면에 보이는 컴포넌트 하나 (본문 상자 기준 캔버스 px): 칸 상자와, 그린 것을 두른 테두리(편집 화면의 테두리와 같은 상자) */
export interface ShownCell {
  cell: Rect
  ink: Rect
}

/**
 * 끄는 동안 화면에 보이는 판. 판을 맞춘 뒤(줄을 앞 줄 아래로 올려 붙이고 눈높이로 내린 뒤)의 자리라 판의 칸(atRect)과 다르다.
 * cells는 끄는 컴포넌트를 뺀 컴포넌트마다, slot은 끄는 컴포넌트가 놓일 자리로 흐리게 보이는 칸(없으면 null)
 */
export interface Shown {
  cells: Map<string, ShownCell>
  slot: ShownCell | null
}

const inRect = (r: Rect, p: { x: number; y: number }) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h
const rectDistance = (r: Rect, p: { x: number; y: number }) => Math.hypot(Math.max(r.x - p.x, 0, p.x - (r.x + r.w)), Math.max(r.y - p.y, 0, p.y - (r.y + r.h)))

/**
 * 손이 놓일 자리(흐린 미리 보기) 위에 있는지: 그 테두리 안, 또는 그 칸 안이면서 가장 가까운 테두리가 그것일 때.
 * 맞춘 판의 칸은 서로 겹친다(아래 줄을 위 줄의 글 바로 아래로 올려 붙여서): 짧은 글의 칸은 아래 줄의 큰 숫자 사이 빈틈까지 덮어,
 * 칸 안이기만 하면 놓일 자리 위로 치니 숫자 사이에 놓아도 까닭 없이 제자리였다
 */
export function overSlot(shown: Shown, p: { x: number; y: number }): boolean {
  const s = shown.slot
  if (!s) return false
  if (inRect(s.ink, p)) return true
  if (!inRect(s.cell, p)) return false
  const d = rectDistance(s.ink, p)
  return Array.from(shown.cells.values()).every((c) => rectDistance(c.ink, p) > d)
}

/**
 * 손 아래에서 바라는 자리들을 화면에 보이는 대로 (먼저 바라는 차례대로). 자리는 base(옮기는 컴포넌트를 뺀 판)의 자리로 낸다.
 * 예전에는 base의 칸으로 쟀는데, base는 화면에 보이지 않는 판이고(옮기는 컴포넌트가 빠지면 옆 칸이 그 자리까지 커진다) 짧은 글은
 * 칸보다 훨씬 작게 그려져서, 글 오른쪽 빈 곳에 놓았는데 칸의 위 변이 가까워 그 위로 가거나 엉뚱한 컴포넌트 옆으로 갔다.
 * - 보이는 내용 전체보다 위나 아래(판 둘레 포함)면 판의 그 쪽 끝, 판의 왼쪽·오른쪽 둘레면 그 쪽 끝
 * - 그린 것 밖이면서 두 묶음 사이에 보이는 빈 띠 위면 그 선 위 (줄 사이면 그 묶음 너비의 새 줄)
 * - 아니면 손 아래 컴포넌트(칸이 손을 품은 것 가운데 그린 것이 가장 가까운 것, 없으면 그린 것이 가장 가까운 것) 옆:
 *   그린 것 밖이면 손이 있는 쪽, 안이면 가까운 변 쪽. 옮기는 중이면 그린 것의 가운데는 맞바꾸기
 * 잴 수 없는 컴포넌트가 있으면 null (부르는 쪽이 판의 칸으로 잰다)
 */
function shownTargets(base: Block[], shown: Shown, p: { x: number; y: number }, size: { w: number; h: number }, moving?: string): DropTarget[] | null {
  if (!base.length) return [BOTTOM]
  const cells = base.map((b) => ({ b, c: shown.cells.get(b.id) }))
  if (cells.some((x) => !x.c)) return null
  const all = cells as { b: Block; c: ShownCell }[]
  const edge: DropTarget[] = []
  const top = Math.min(...all.map((x) => x.c.ink.y))
  const bottom = Math.max(...all.map((x) => x.c.ink.y + x.c.ink.h))
  if (p.y < Math.max(BOARD_EDGE, top)) edge.push(spotTarget({ at: null, side: 'above' }))
  if (p.y > Math.min(size.h - BOARD_EDGE, bottom)) edge.push(spotTarget({ at: null, side: 'below' }))
  if (p.x < BOARD_EDGE) edge.push(spotTarget({ at: null, side: 'left' }))
  if (p.x > size.w - BOARD_EDGE) edge.push(spotTarget({ at: null, side: 'right' }))
  const onInk = all.some((x) => inRect(x.c.ink, p))
  // 선: 판의 선마다 그 앞뒤에 닿은 컴포넌트들이 보이는 자리로. 줄 사이(v)는 위 줄의 그린 것 아래 끝과 아래 줄의 그린 것 위 끝 사이의 빈 띠,
  // 단 사이(h)는 두 칸 사이 (그린 것은 칸 왼쪽에 붙어 있어 오른쪽이 늘 비니 그린 것으로 재면 단 하나가 다 빈 띠가 된다)
  const lines: { t: DropTarget; d: number; depth: number }[] = []
  if (!onInk)
    for (const g of guttersOf(base)) {
      const touch = (b: Block, front: boolean) => {
        const a = b.at!
        const [lo, len, c0, cl] = g.dir === 'v' ? [a.y, a.h, a.x, a.w] : [a.x, a.w, a.y, a.h]
        return c0 >= g.from && c0 + cl <= g.to && (front ? lo + len === g.at : lo === g.at)
      }
      const fore = all.filter((x) => touch(x.b, true))
      const aft = all.filter((x) => touch(x.b, false))
      if (!fore.length || !aft.length) continue
      const span = [...fore, ...aft]
      if (g.dir === 'v') {
        const x0 = Math.min(...span.map((x) => x.c.cell.x))
        const x1 = Math.max(...span.map((x) => x.c.cell.x + x.c.cell.w))
        const y0 = Math.max(...fore.map((x) => x.c.ink.y + x.c.ink.h))
        const y1 = Math.min(...aft.map((x) => x.c.ink.y))
        if (p.x < x0 || p.x > x1 || y1 <= y0) continue
        // 빈 띠의 가운데 둘레만: 띠 전체를 선으로 보면 위 줄 글 바로 아래 오른쪽에 놓아도(그 글 옆에 두려는 것) 줄 사이 새 줄로 읽었다
        const mid = (y0 + y1) / 2
        const reach = Math.max(LINE_EDGE, (y1 - y0) / 4)
        if (Math.abs(p.y - mid) <= reach) lines.push({ t: spotTarget(g.spot), d: Math.abs(p.y - mid), depth: g.depth })
      } else {
        const y0 = Math.min(...span.map((x) => x.c.ink.y))
        const y1 = Math.max(...span.map((x) => x.c.ink.y + x.c.ink.h))
        const x0 = Math.max(...fore.map((x) => x.c.cell.x + x.c.cell.w))
        const x1 = Math.min(...aft.map((x) => x.c.cell.x))
        if (p.y < y0 || p.y > y1) continue
        const mid = (x0 + x1) / 2
        if (Math.abs(p.x - mid) <= Math.max(LINE_EDGE, (x1 - x0) / 2)) lines.push({ t: spotTarget(g.spot), d: Math.abs(p.x - mid), depth: g.depth })
      }
    }
  lines.sort((a, b) => a.d - b.d || b.depth - a.depth)
  // 손 아래의 컴포넌트: 줄을 올려 붙이면 칸 상자끼리 겹치므로(위 칸의 빈 아래쪽에 아래 줄이 올라선다) 칸이 손을 품은 것 가운데 그린 것이 가장 가까운 것
  const holding = all.filter((x) => inRect(x.c.cell, p))
  const pool = holding.length ? holding : all
  let under = pool[0]
  for (const x of pool) if (rectDistance(x.c.ink, p) < rectDistance(under.c.ink, p)) under = x
  const r = under.c.ink
  const inside: DropTarget[] = []
  const ox = Math.max(r.x - p.x, 0, p.x - (r.x + r.w))
  const oy = Math.max(r.y - p.y, 0, p.y - (r.y + r.h))
  const hs: Side = p.x < r.x + r.w / 2 ? 'left' : 'right'
  const vs: Side = p.y < r.y + r.h / 2 ? 'above' : 'below'
  let sides: Side[]
  if (ox || oy) sides = ox > oy ? [hs, vs] : [vs, hs]
  else {
    const u = (p.x - r.x) / r.w
    const v = (p.y - r.y) / r.h
    const core = (1 - SWAP_CORE) / 2
    if (moving && under.b.id !== moving && u > core && u < 1 - core && v > core && v < 1 - core) inside.push({ kind: 'swap', with: under.b.id })
    sides = (
      [
        ['left', p.x - r.x],
        ['right', r.x + r.w - p.x],
        ['above', p.y - r.y],
        ['below', r.y + r.h - p.y],
      ] as const
    )
      .slice()
      .sort((a, b) => a[1] - b[1])
      .slice(0, 2)
      .map((x) => x[0])
  }
  for (const side of sides) for (let up = 0; up < 4; up++) inside.push(spotTarget({ at: under.b.id, side, ...(up ? { up } : {}) }))
  return [...edge, ...lines.map((x) => x.t), ...inside]
}

/** 손에서 선까지의 거리 (선이 그어진 범위 밖이면 null) */
function lineDistance(g: Gutter, p: { x: number; y: number }, size: { w: number; h: number }): number | null {
  const cp = (size.w + BLOCK_COL_GAP) / BOARD_COLS
  const rp = (size.h + BLOCK_GAP) / BOARD_ROWS
  if (g.dir === 'h') {
    const x = g.at * cp - BLOCK_COL_GAP / 2
    return p.y >= g.from * rp && p.y <= g.to * rp - BLOCK_GAP ? Math.abs(p.x - x) : null
  }
  const y = g.at * rp - BLOCK_GAP / 2
  return p.x >= g.from * cp && p.x <= g.to * cp - BLOCK_COL_GAP ? Math.abs(p.y - y) : null
}

/** 이 자리에 놓으면 그 부품이 들어갈 자리 (장 본문 px) */
export function slotRect(base: Block[], target: DropTarget, block: Block, size: { w: number; h: number }, moving?: Block[]): Rect | null {
  const next = target.kind === 'swap' ? (moving ? moveAt(moving, block.id, target, size.h) : null) : insertAt(base, target.spot, block, size.h)
  const at = next?.find((b) => b.id === block.id)?.at
  return at ? atRect(at, size) : null
}

/**
 * 끌고 있는 곳에서 놓을 자리. 새 부품이면 지금 판(base)에, 옮기는 부품이면(moving: 옮기기 전의 판) 그 부품을 뺀 판(base)에 넣는다.
 * 손 아래에서 바라는 자리가 안 되면 다음으로 바라는 자리, 그래도 안 되면 새 부품은 넣을 수 있는 자리 가운데 놓일 자리가 가장
 * 가까운 곳(그래서 대충 놓아도 늘 정해진 자리에 들어간다), 옮기는 부품은 null(제자리). 지금 보이는 자리(current) 위에서 손을 움직이면
 * 바꾸지 않는다
 */
export function dropTarget(
  base: Block[],
  block: Block,
  p: { x: number; y: number },
  size: { w: number; h: number },
  current?: DropTarget | null,
  moving?: Block[],
  shown?: Shown | null,
): DropTarget | null {
  // 옮기는 중이면 옮기기 그대로 해 본다 (넣을 수 있다고 고른 자리가 놓는 순간 옮기기에서 막히지 않게)
  const fits = (t: DropTarget) => (moving ? !!moveAt(moving, block.id, t, size.h) : t.kind === 'spot' && !!insertAt(base, t.spot, block, size.h))
  if (current && fits(current)) {
    if (shown?.slot ? overSlot(shown, p) : inRect(slotRect(base, current, block, size, moving) ?? { x: 0, y: 0, w: -1, h: -1 }, p)) return current
  }
  // 손 아래는 화면에 보이는 판(shown)으로 본다. 잴 수 없으면(아직 부품 장으로 바뀌기 전) 옮기는 부품을 뺀 판(base)의 칸으로
  const wanted = (shown && shownTargets(base, shown, p, size, moving ? block.id : undefined)) ?? wantedTargets(base, p, size, moving ? block.id : undefined)
  for (const t of wanted) if (fits(t)) return t
  // 옮기는 중이면 여기서 그친다(부르는 쪽이 제자리에 둔다): 손이 고르지 않은 먼 자리로 옮겨 가면 무엇을 한 것인지 알 수 없었다
  if (moving) return null
  // 새 컴포넌트는 그 둘레에 자리가 없으면 넣을 수 있는 자리 가운데 놓일 자리가 가장 가까운 곳
  let found: DropTarget | null = null
  let bestD = Infinity
  for (const t of validTargets(base, block, size.h)) {
    const r = slotRect(base, t, block, size)
    if (!r) continue
    const d = Math.hypot(p.x - (r.x + r.w / 2), p.y - (r.y + r.h / 2))
    if (d < bestD) {
      found = t
      bestD = d
    }
  }
  return found
}

/**
 * 손 아래의 자리 (넣을 수 있는지와 상관없이). 끄는 동안 '여기는 왜 안 되는지'를 알려 줄 때.
 * 옮기는 중이면(moving: 옮기는 부품의 id) 다른 부품의 가운데는 맞바꾸기다 (맞바꿀 수 없을 때도 까닭을 알리게)
 */
export function pointerTarget(base: Block[], p: { x: number; y: number }, size: { w: number; h: number }, shown?: Shown | null, moving?: string): DropTarget {
  return ((shown && shownTargets(base, shown, p, size, moving)) ?? wantedTargets(base, p, size, moving)).find((t) => !!moving || t.kind === 'spot') ?? BOTTOM
}

/** 판의 선을 더 끌 수 없는 까닭: 줄어드는 쪽에서 가장 먼저 잘리는 부품(type). minSpan은 그 부품의 가장 좁은 너비(옆으로 끌 때), 위아래로 끌 때는 null */
export type SpanLimit = { kind: 'block'; type: BlockType; minSpan: number | null }

/** 판의 선을 to(칸 수)까지 끌었는데 끝까지 가지 못하면 그 까닭. 갈 수 있으면 null */
export function gutterLimit(blocks: Block[], g: Gutter, to: number, areaH: number): SpanLimit | null {
  const fit = boardFit(areaH, blocks)
  const range = gutterRange(blocks, g, fit)
  if (!range || (to >= range.lo && to <= range.hi)) return null
  // 줄어드는 쪽: 선 앞(왼쪽, 위)으로 끌면 앞쪽 부품들, 뒤로 끌면 뒤쪽 부품들
  const front = to < range.lo
  const side = blocks.filter((b) => {
    const a = b.at!
    const lo = g.dir === 'h' ? a.x : a.y
    const hi = lo + (g.dir === 'h' ? a.w : a.h)
    const cross = g.dir === 'h' ? [a.y, a.y + a.h] : [a.x, a.x + a.w]
    return cross[0] >= g.from && cross[1] <= g.to && (front ? hi <= g.at : lo >= g.at)
  })
  // 가장 먼저 잘리는 것: 옆으로 끌면 가장 좁은 너비가 가장 넓은 부품, 위아래면 지금 너비에서 가장 높아야 하는 부품
  const worst = [...side].sort((a, b) => (g.dir === 'h' ? fit.minW(b) - fit.minW(a) : fit.minH(b, b.at!.w) - fit.minH(a, a.at!.w)))[0]
  return worst ? { kind: 'block', type: worst.type, minSpan: g.dir === 'h' ? fit.minW(worst) : null } : null
}

/** 판의 선을 to(칸 수)로 옮긴 판. 이미지가 있으면 사람이 정한 크기를 그대로 둔다. 한 칸도 못 옮기면 null */
export function dragGutter(blocks: Block[], g: Gutter, to: number, areaH: number): Block[] | null {
  return moveGutter(blocks, g, to, boardFit(areaH, blocks))
}

/**
 * 부품의 너비(dir 'w')나 높이('h')를 size 칸으로 바꾼 판: 그 부품의 오른쪽(아래) 선, 판 끝이면 왼쪽(위) 선을 옮긴다.
 * 부품에 가장 가까운 선(그 부품과 바로 옆 묶음 사이)을 옮겨서 멀리 있는 부품은 그대로다.
 * 그 크기가 되지 않으면(이웃이 잘리거나 이 부품이 잘리면) null. AI 제안(set_size)이 쓴다
 */
export function resizeBlock(blocks: Block[], blockId: string, dir: 'w' | 'h', size: number, areaH?: number): Block[] | null {
  const self = blocks.find((b) => b.id === blockId)?.at
  if (!self) return null
  const fit = fitFor(blocks, areaH)
  const h = dir === 'w'
  const [lo, len, cross0, crossLen] = h ? [self.x, self.w, self.y, self.h] : [self.y, self.h, self.x, self.w]
  if (size === len) return blocks
  // 이 부품을 끼고 있는 선 가운데 범위가 가장 좁은 것 (가장 가까운 묶음 사이)
  const near = (at: number) =>
    guttersOf(blocks)
      .filter((g) => g.dir === (h ? 'h' : 'v') && g.at === at && g.from <= cross0 && g.to >= cross0 + crossLen)
      .sort((a, b) => a.to - a.from - (b.to - b.from))[0]
  const after = near(lo + len)
  const before = near(lo)
  const tries = [after && { g: after, to: lo + size }, before && { g: before, to: lo + len - size }].filter((t): t is { g: Gutter; to: number } => !!t)
  for (const { g, to } of tries) {
    const next = moveGutter(blocks, g, to, fit)
    const at = next?.find((b) => b.id === blockId)?.at
    if (next && at && (h ? at.w : at.h) === size) return settled(next, [], areaH)
  }
  return null
}

/** 읽는 차례대로 한 칸 앞이나 뒤의 부품과 자리를 바꾼다 (끌기 어려울 때). 바꿀 수 없으면(서로의 자리에 들어가지 않으면) 그대로 */
export function shiftBlock(blocks: Block[], blockId: string, dir: -1 | 1, areaH?: number): Block[] {
  const order = byReading(blocks)
  const i = order.findIndex((b) => b.id === blockId)
  const other = order[i + dir]
  if (i < 0 || !other) return blocks
  return reorderPair(blocks, blockId, other.id, areaH) ?? moveAt(blocks, blockId, { kind: 'swap', with: other.id }, areaH) ?? blocks
}

/**
 * shiftBlock이 자리를 바꿀 수 없는 까닭: 읽는 차례의 맨 앞('first')이나 맨 뒤('last')이거나, 서로의 자리에 들어가지 않거나('stuck').
 * 바꿀 수 있으면 null. 메뉴가 못 하는 항목을 잠그고 까닭을 보이게 (예전에는 눌러도 아무 일 없이 무시됐다)
 */
export function shiftIssue(blocks: Block[], blockId: string, dir: -1 | 1, areaH?: number): 'first' | 'last' | 'stuck' | null {
  const order = byReading(blocks)
  const i = order.findIndex((b) => b.id === blockId)
  if (i < 0) return 'stuck'
  if (!order[i + dir]) return dir < 0 ? 'first' : 'last'
  return shiftBlock(blocks, blockId, dir, areaH) === blocks ? 'stuck' : null
}

/**
 * 같은 줄에 옆으로(또는 같은 단에 위아래로) 붙어 선 두 부품의 차례를 바꾼다. 저마다의 너비(높이)는 그대로, 이음표는 맞바꾸기처럼 자리에 남는다.
 * 화살표 키로 옮길 때 쓴다: 끌어서 가운데에 놓을 때처럼 자리를 통째로 맞바꾸면 좁은 자리에 간 부품이 가장 좁은 너비까지 넓어져서
 * (점 목록 9칸과 큰 숫자 3칸이 8칸과 4칸으로) →를 누른 뒤 ←를 눌러도 처음으로 돌아오지 않았다.
 * 붙어 서지 않았거나 바꾼 판을 나무로 읽을 수 없으면 null
 */
function reorderPair(blocks: Block[], a: string, b: string, areaH?: number): Block[] | null {
  const A = blocks.find((x) => x.id === a)
  const B = blocks.find((x) => x.id === b)
  if (!A?.at || !B?.at) return null
  const row = A.at.y === B.at.y && A.at.h === B.at.h
  const [p, pa, q, qa] = (row ? A.at.x < B.at.x : A.at.y < B.at.y) ? [A, A.at, B, B.at] : [B, B.at, A, A.at]
  let to: { p: BlockAt; q: BlockAt }
  if (row && pa.x + pa.w === qa.x) to = { q: { ...qa, x: pa.x }, p: { ...pa, x: pa.x + qa.w } }
  else if (!row && pa.x === qa.x && pa.w === qa.w && pa.y + pa.h === qa.y) to = { q: { ...qa, y: pa.y }, p: { ...pa, y: pa.y + qa.h } }
  else return null
  const links = (x: Block) => ({ link: x.link, linkBelow: x.linkBelow })
  const bare = ({ link: _, linkBelow: __, ...x }: Block) => x
  const next = blocks.map((x) =>
    x.id === p.id ? { ...bare(x), ...clean(links(q)), at: to.p } : x.id === q.id ? { ...bare(x), ...clean(links(p)), at: to.q } : x,
  )
  if (!treeOf(next)) return null
  const fitted = settle(next, fitFor(next, areaH))
  return fitted && settled(fitted, [], areaH)
}

/**
 * 이미지가 든 이미지 부품을 넣을 자리: 넣을 수 있는 자리마다 선을 이미지에 맞춰 본 뒤 이미지 비율에 가장 잘 맞는 곳.
 * 세로 사진은 옆 칸으로, 넓은 화면 캡처는 넓은 줄로 간다. 위치를 받으면(끌어다 놓은 자리) 비슷하게 맞는 자리 가운데 가까운 곳.
 * 아래 새 줄에 놓아 세로 사진이 장 너비의 낮은 띠가 되면 가운데만 남거나 양옆이 크게 비었다
 */
export function imagePlace(blocks: Block[], block: Block, areaH: number, near?: { x: number; y: number }): DropTarget | null {
  const aspect = aspectOf(block)
  if (!aspect) return null
  let best: DropTarget | null = null
  let bestScore = Infinity
  let bestKeeps = false
  const valid = validTargets(blocks, block, areaH)
  for (const [k, t] of valid.entries()) {
    if (t.kind !== 'spot') continue
    const placed = insertAt(blocks, t.spot, block, areaH)
    if (!placed) continue
    // 판의 다른 이미지도 함께 본다: 새 이미지가 잘 맞아도 옆의 화면 캡처가 좁은 칸에 눌리면 좋은 자리가 아니다
    const off = placed.reduce((a, b) => {
      const ar = b.id === block.id ? aspect : aspectOf(b)
      return ar ? a + misfit(placed, b.id, ar, areaH) : a
    }, 0)
    if (!Number.isFinite(off)) continue
    // 비율이 거의 같으면(로그 차 0.1은 10%쯤) 놓은 자리에 가까운 곳. 거리는 장 너비에 견준 몫
    const at = placed.find((b) => b.id === block.id)?.at
    const r = near && at ? atRect(at, { w: AREA_W, h: areaH }) : null
    const far = r && near ? Math.hypot(r.x + r.w / 2 - near.x, r.y + r.h / 2 - near.y) / AREA_W : 0
    // 놓은 자리가 없으면(붙여 넣기) 비슷하게 맞는 자리끼리는 읽는 차례에서 뒤쪽: 앞에 끼우면 이미 쓴 내용의 차례가 밀린다
    const score = off + far * 0.25 + (near ? 0 : (valid.length - 1 - k) * 0.01)
    // 자동 삽입은 기존 연결의 대상을 보존하는 자리가 있으면 이미지 비율보다 우선한다.
    // 끌어다 놓기는 사람이 가리킨 자리를 따른다.
    const keeps = near ? true : keepsLinkEnds(blocks, placed)
    if (!best || (keeps && !bestKeeps) || (keeps === bestKeeps && score < bestScore)) {
      best = t
      bestScore = score
      bestKeeps = keeps
    }
  }
  return near || bestKeeps ? best : null
}

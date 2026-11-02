// 부품의 크기: 부품마다 잰 높이(blockHeights.ts), 판에서 차지할 칸 수(boardFit), 판의 칸을 캔버스 px로, 본문 상자 높이 어림

import { BLOCK_HEIGHTS } from '../blockHeights'
import { FRAME, HEAD, TEXT_SCALE } from '../frame'
import { hintFor, logoColumns } from '../layouts'
import { laneRows } from '../status'
import { type Glyphs, headLook } from '../themes'
import type { Block, BlockAt, BlockLook, BlockType, Deck, Slide } from '../types'
import { BOARD_COLS, BOARD_ROWS, boardSig, type Fit, needRows, settle } from './board'
import { BLOCK_GROUPS, BLOCKS } from './catalog'
import { blockItems, mapBlock, variantOfBlock } from './cells'
import { LINK_PAD } from './links'
import type { NoRoom } from './place'
import { BLOCK_COL_GAP, BLOCK_GAP, isSmall, lookIssue, shownLook, withLook } from './rules'

/** 부품 장 본문 상자의 너비 (장 너비에서 좌우 틀을 뺀 것) */
export const AREA_W = 1920 - 2 * FRAME.x

/**
 * 이 부품이 들어갈 가장 좁은 칸. 로고 모음은 로고가 많을수록 넓어야 한다: 칸 너비를 로고 수로 나눠 쓰므로
 * 좁은 칸에 여럿이면 글자는 안 잘려도 로고 하나하나를 알아볼 수 없게 작아진다 (다섯 개부터 3분의 2, 아홉 개부터 한 줄)
 */
export function minSpanOf(block: Block): number {
  const base = BLOCKS[block.type].minSpan
  if (block.type !== 'logos') return base
  const n = block.items.length
  return Math.max(base, n > 8 ? 12 : n > 4 ? 8 : 6)
}

/** 갤러리에서 잰 칸 너비 (blockHeights.ts) */
const SPANS = [3, 4, 6, 8, 12]
/** blockHeights.ts에서 그 너비로는 860px로도 안 되는 것 */
export const NO_FIT = 999

/**
 * 잘리지는 않아도 너무 낮으면 보기 나쁜 부품의 바닥 높이. 차트는 막대와 선이 납작해지고, 원과 그림은 띠처럼 작아진다.
 * 잰 높이(blockHeights.ts)는 '잘리지 않는' 높이라서 이것과 견줘 큰 쪽을 쓴다
 */
const FLOOR: Partial<Record<BlockType, (variant: string) => number>> = {
  // 세로 막대는 숫자와 이름 자리를 빼고 남는 높이가 막대라서, 낮으면 글은 멀쩡해도 막대가 거의 사라진다
  bars: (v) => (v === 'columns' ? 340 : 0),
  // 선 차트는 낮으면 선이 납작한 띠가 되고, 점 위아래의 숫자가 이름 줄로 내려앉는다
  versus: (v) => (v === 'lines' ? 420 : 360),
  bridge: () => 380,
  trend: () => 380,
  // 도넛과 100칸은 낮으면 고리(칸)가 작아져 조각이 읽히지 않는다. 100칸은 칸 하나가 1%라서 칸이 점처럼 작아지면 셀 수 없다
  share: (v) => (v === 'donut' || v === 'units' ? 380 : 320),
  ring: () => 220,
  ratio: () => 220,
  spark: () => 240,
  matrix: () => 380,
  // 점과 이름표가 판 위에 흩어져서, 낮으면 이름표끼리 비킬 자리가 없다 (편집할 때는 점수 줄까지 붙는다)
  position: () => 460,
  swot: () => 420,
  // 이미지는 낮으면 화면 캡처가 글씨를 알아볼 수 없는 작은 그림이 된다(설명 한 줄을 빼면 이미지는 220px 남짓)
  image: () => 280,
  // 겹친 원은 낮으면 안쪽 원(목표)이 점처럼 작아진다
  market: () => 340,
  // 세로 막대 차트: 숫자와 이름 자리를 빼고 남는 높이가 막대라서 낮으면 막대가 납작해진다
  pareto: () => 380,
  attain: () => 380,
  stack: () => 380,
  // 색 표는 낮으면 칸이 띠처럼 납작해져 색이 면으로 읽히지 않는다
  heat: () => 300,
  // 지표 흐름표는 낮으면 줄마다의 선이 납작한 줄이 되어 오르내림이 보이지 않는다
  sparks: () => 280,
}
/** 항목이 셋 이상인 부품: 칸이 이보다 낮으면 줄 사이가 붙어 빽빽해진다. 로고는 그림이라 빼고 */
const LIST_FLOOR = 240

/**
 * 잰 높이에 더하는 여유. 잰 높이는 글이 딱 들어가는 높이(10px 단위)라, 같은 부품을 다른 때 다른 창에서 다시 재면 10~20px씩 달랐다
 * (줄바꿈이 갈리는 자리의 글자 폭이 그리는 환경마다 조금씩 다르다). 윈도우의 글자 그리기는 맥과 또 달라서, 딱 맞춘 칸은
 * 다른 창에서 글자를 한 단계 줄이거나 두 단계까지 줄였다(조합 시험: 구성비의 칸 모양이 440px에서 넘쳐 0.7로)
 */
const HEIGHT_SLACK = 10

/**
 * 선 차트는 한 줄을 다 쓰면(1680px) 바닥 높이를 이만큼 낮춘다. 납작해 보이는 것은 높이가 아니라 너비와 높이의
 * 비율이라, 넓은 칸에서는 낮아도 선의 오르내림이 보인다. 이 덕에 핵심 숫자 한 줄 아래에 추이 한 줄이 들어간다.
 * 막대 차트는 낮추지 않는다: 막대 위 숫자, 아래 이름과 증감 같은 글 자리는 너비와 상관없이 그대로라 낮춘 만큼이
 * 다 막대에서 빠진다. 원, 점 판, 네 칸은 높이가 곧 크기라 그대로
 */
const WIDE_CUT = 80
const lineChart = (type: BlockType, variant: string) => type === 'trend' || (type === 'versus' && variant === 'lines')

/** 로고 모음: 로고 판 한 줄이 150px는 되어야 로고를 알아본다. 그림은 칸에 맞춰 줄어서 글처럼 잘리지 않으니 잰 높이로는 모른다 */
const logoFloor = (n: number) => {
  const rows = Math.ceil(n / logoColumns(n))
  return rows * 150 + (rows - 1) * 20
}

/**
 * 잰 너비가 아닌 칸(5칸, 7칸, 9~11칸)의 높이: 양옆의 잰 너비 가운데 높은 쪽. 좁을수록 글이 더 꺾여 높아지지만,
 * 넓은 칸에서 짜임을 눕히는 부품(전과 후 같은)은 넓은 쪽이 더 높기도 해서 둘 다 본다.
 * 가장 좁게 잰 너비보다 좁으면 잰 것이 없어 넣지 않는다(NO_FIT)
 */
function measuredAt(table: Partial<Record<number, number[]>> | undefined, span: number, n: number): number | undefined {
  if (!table) return undefined
  const at = (x: number) => {
    const hs = table[x]
    return hs?.length ? hs[Math.min(n, hs.length - 1)] : undefined
  }
  if (table[span]) return at(span)
  const lower = [...SPANS].reverse().find((x) => x < span && table[x])
  const upper = SPANS.find((x) => x > span && table[x])
  if (lower === undefined) return upper === undefined ? undefined : NO_FIT
  const lo = at(lower)!
  const hi = upper === undefined ? lo : at(upper)!
  return Math.max(lo, hi)
}

/**
 * 부품을 이 너비(12칸 중 몇 칸)에 놓을 때 잘리지 않는 가장 낮은 높이(캔버스 px).
 * 모양, 바탕(그대로 / 카드와 강조색 면), 항목 수, 너비마다 갤러리에서 잰 값(blockHeights.ts)에 보기 좋은 바닥을 더한다.
 * 그 너비로 안 되면 NO_FIT 이상
 */
export function blockMinH(block: Block, span: number): number {
  const spec = BLOCKS[block.type]
  const variant = variantOfBlock(block)
  const n = spec.items ? heightCount(block, variant) : 0
  // 그려지는 면으로 본다: 판 너비를 다 쓰면 혼자인 줄이라 고른 면이 있어도 바탕 없이 그려진다 (shownLook)
  const plain = shownLook(block, span >= BOARD_COLS) === 'plain'
  const table = BLOCK_HEIGHTS[`${block.type}.${variant}.${plain ? 'plain' : 'card'}`]
  // 아직 재지 않은 부품 (새로 만들고 갤러리에서 재기 전): 넉넉하게
  const found = measuredAt(table, span, n)
  if (found !== undefined && found >= NO_FIT) return found
  // 좁은 강조 상자는 명조에서 글이 카드 안쪽 여백까지 넘을 수 있다.
  // 보통 글자에서 잰 높이에 여유를 더해 아래 줄의 자리를 먼저 확보한다.
  const slack = block.type === 'callout' && !plain && span <= 4 ? 30 : HEIGHT_SLACK
  const measured = (found ?? 400) + slack
  const base = block.type === 'logos' ? logoFloor(n) : (FLOOR[block.type]?.(variant) ?? 0)
  const floor = span >= 12 && base && lineChart(block.type, variant) ? base - WIDE_CUT : base
  // 항목이 옆으로 늘어서는 너비(항목 수가 늘어도 높이가 같은 너비)에서는 줄 사이가 붙을 일이 없어 바닥을 두지 않는다.
  // 한 줄을 다 쓰는 점 목록 셋은 한 줄로 100px인데 바닥 240을 받아 판에서 칸 높이의 절반을 가져갔다
  const sideways = (found ?? 400) <= (measuredAt(table, span, 1) ?? 0)
  return Math.max(measured, floor, n >= 3 && block.type !== 'logos' && !sideways ? LIST_FLOOR : 0)
}

/**
 * 잰 높이를 찾는 항목 수. 진행 현황의 상태별은 과제가 상태마다 한 단에 쌓여서 가장 많이 모인 단의 과제 수다
 * (잰 표도 그 수로 잰다: measureBlocks.ts의 lane). 항목 수로 찾으면 과제가 한 단에 몰릴 때 칸이 모자라 글자를 줄였다.
 * 진행률과 상태를 다 비웠으면 편집할 때는 예시(안내 문구)로, 발표할 때는 확인 필요 단에 그려지므로 둘 중 많은 쪽으로 센다
 */
function heightCount(block: Block, variant: string): number {
  const items = blockItems(block)
  if (block.type !== 'progress' || variant !== 'board') return items.length
  const rows = laneRows(items.map((it) => ({ state: it.body, value: it.value })))
  if (!items.every((it) => !it.value.trim() && !it.body.trim())) return rows
  const hint = (k: 'value' | 'body', i: number) => hintFor('progress', block.hints ?? {}, k, k, i)
  return Math.max(rows, laneRows(items.map((_, i) => ({ state: hint('body', i), value: hint('value', i) }))))
}

/** 부품 고르기 그림처럼 놓일 너비를 모를 때: 보기 좋은 너비에 놓았을 때 */
export const blockPrefH = (block: Block) => blockMinH(block, BLOCKS[block.type].prefSpan)

/**
 * 높이를 받으면 커지는 부품: 차트, 그림, 표처럼 칸 높이를 다 쓰는 것. 판에서 남는 높이는 이 부품이 먼저 받는다.
 * 글과 숫자는 높이를 더 받아도 칸 안이 빌 뿐이다
 */
const STRETCHY = new Set<BlockType>([
  ...(BLOCK_GROUPS.find((g) => g.short === '차트')?.types ?? []),
  'ring',
  'ratio',
  'spark',
  'gantt',
  'matrix',
  'position',
  'swot',
  'table',
  'image',
  'logos',
  // 순환은 높이를 받으면 세로 목록에서 고리로 짜임을 바꾸고 고리가 칸 높이만큼 커진다(cycle.css)
  'cycle',
])
export const isStretchy = (type: BlockType) => STRETCHY.has(type)

/** 판의 세로 한 칸(칸 사이 하나를 더한 것)의 높이, 캔버스 px */
export const rowPitch = (areaH: number) => (areaH + BLOCK_GAP) / BOARD_ROWS

/** 이 높이(px)가 드는 세로 칸 수 */
export const rowsFor = (px: number, areaH: number) =>
  !Number.isFinite(areaH) || areaH <= 0 ? Infinity : Math.max(1, Math.ceil((px + BLOCK_GAP) / rowPitch(areaH) - 1e-6))

/** 이음표가 선 쪽은 이음표가 설 자리만큼 비켜 준다 (위아래로만 높이에서 빠진다. 옆은 칸 사이가 넓어 이음표가 들어간다) */
function linkRoom(b: Block, blocks: readonly Block[]): number {
  let px = b.linkBelow ? LINK_PAD : 0
  const a = b.at
  if (a && blocks.some((o) => o.linkBelow && o.at && o.at.y + o.at.h === a.y && o.at.x < a.x + a.w && a.x < o.at.x + o.at.w)) px += LINK_PAD
  return px
}

/**
 * 판의 크기 규칙 (deck/blocks/board.ts). 본문 상자 높이(areaH)에서 세로 칸의 높이를 정하고, 부품마다 잰 높이를 칸 수로 바꾼다.
 * blocks를 주면 그 판의 이음표가 비켜 주는 높이까지 센다. 모르는 부품(새 버전의 부품)은 자리만 지킨다
 */
export function boardFit(areaH: number, blocks: readonly Block[] = []): Fit {
  // 판 하나를 나누는 동안 같은 부품을 수백 번 물어서 부품마다 적어 둔다 (부품은 바뀌면 새 객체라 적어 둔 값이 낡지 않는다)
  const widths = new WeakMap<Block, number>()
  const heights = new WeakMap<Block, number[]>()
  const minW = (b: Block) => {
    if (!BLOCKS[b.type]) return 1
    let w = widths.get(b)
    if (w === undefined) {
      w = Infinity
      for (let x = minSpanOf(b); x <= BOARD_COLS; x++)
        if (blockMinH(b, x) < NO_FIT) {
          w = x
          break
        }
      widths.set(b, w)
    }
    return w
  }
  return {
    minW,
    minH: (b, w) => {
      if (!BLOCKS[b.type]) return 1
      if (w < minW(b)) return Infinity
      let hs = heights.get(b)
      if (!hs) heights.set(b, (hs = []))
      if (hs[w] === undefined) {
        const px = blockMinH(b, w)
        hs[w] = px >= NO_FIT ? Infinity : rowsFor(px + linkRoom(b, blocks), areaH)
      }
      return hs[w]
    },
    // 항목이 많은 목록은 300px 이하에서 글자 단계가 작아진다. 자동 배치에 여유가 있을 때만 이 높이를 먼저 확보한다.
    readableH: (b) => b.type === 'bullets' && blockItems(b).length >= 5 ? rowsFor(320 + linkRoom(b, blocks), areaH) : 0,
    prefW: (b) => (BLOCKS[b.type] ? Math.min(BOARD_COLS, Math.max(minW(b), BLOCKS[b.type].prefSpan)) : 1),
    stretchy: (b) => STRETCHY.has(b.type),
    // 그려지는 면으로 본다: 판 너비를 다 쓰는 부품은 고른 면이 있어도 바탕 없이 그려진다(shownLook)
    fills: (b) => !!BLOCKS[b.type] && shownLook(b, b.at?.w === BOARD_COLS) !== 'plain',
    small: (b) => !!BLOCKS[b.type] && isSmall(b.type),
  }
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** 판의 자리를 본문 상자 안의 px로 (그려지는 상자: 칸 사이를 뺀 것) */
export function atRect(at: BlockAt, size: { w: number; h: number }): Rect {
  const cp = (size.w + BLOCK_COL_GAP) / BOARD_COLS
  const rp = (size.h + BLOCK_GAP) / BOARD_ROWS
  return { x: at.x * cp, y: at.y * rp, w: at.w * cp - BLOCK_COL_GAP, h: at.h * rp - BLOCK_GAP }
}

/** 부품 하나를 바꾼 판: 바뀐 부품이 커지면(항목, 모양, 바탕) 옆에서 자리를 받는다. 장에 들어가지 않으면 null */
export function changeBlocks(blocks: Block[], blockId: string, fn: (b: Block) => Block, areaH: number): Block[] | null {
  const next = mapBlock(blocks, blockId, fn)
  return settle(next, boardFit(areaH, next))
}

/** 판의 모든 부품이 잘리지 않는 데 드는 높이 (본문 px). 너비로 안 되면 본문의 두 배로 친다 */
export function needRowsPx(blocks: Block[], areaH: number): number {
  if (!blocks.length) return 0
  if (!Number.isFinite(areaH) || areaH <= 0) return Infinity
  const rows = needRows(blocks, boardFit(areaH, blocks))
  return Number.isFinite(rows) ? rows * rowPitch(areaH) - BLOCK_GAP : areaH * 2
}

// 부품 고르기는 카드마다 판의 모든 자리를 재서, 같은 판을 수백 번 묻는다
const OVER = new WeakMap<Block[], Map<number, boolean>>()

/**
 * 넣거나 바꾸기 전부터 장보다 높은 판인지. 글자 크기를 키우거나 제목이 두 줄이 되어 본문이 낮아지면 그렇게 된다.
 * 그런 장에 '넣으면 장 높이를 넘어요'라고 하면 지금은 들어가는 줄 알고, 작은 것 하나를 빼도 그대로 잠겨 있었다
 */
export function overAlready(blocks: Block[], areaH: number): boolean {
  let byH = OVER.get(blocks)
  if (!byH) OVER.set(blocks, (byH = new Map()))
  let over = byH.get(areaH)
  if (over === undefined) byH.set(areaH, (over = blocks.length > 0 && needRowsPx(blocks, areaH) > areaH + 0.5))
  return over
}

/** 이 판이 장에 들어가지 않을 때의 까닭 (잘리지 않는 데 드는 높이와 본문 높이, px). before: 넣거나 바꾸기 전의 판 */
export function heightIssue(blocks: Block[], areaH: number, before?: Block[]): NoRoom {
  if (Number.isFinite(areaH) && areaH <= 0) return { kind: 'height', need: 1, room: 0, noBody: true, ...(before?.length ? { already: true } : {}) }
  const already = before && overAlready(before, areaH) ? { already: true as const } : {}
  return { kind: 'height', need: Math.round(needRowsPx(blocks, areaH)), room: Math.round(areaH), ...already }
}

/** 부품 하나를 바꾸면(항목 더하기, 모양이나 바탕 바꾸기) 장에 들어가지 않을 때 그 까닭. 들어가면 null */
export function changeIssue(blocks: Block[], blockId: string, fn: (b: Block) => Block, areaH: number): NoRoom | null {
  return changeBlocks(blocks, blockId, fn, areaH) ? null : heightIssue(mapBlock(blocks, blockId, fn), areaH, blocks)
}

/**
 * 면을 이것으로 바꿀 수 없는 까닭: 면의 규칙(lookIssue), 그리고 나란한 묶음이 함께 바뀐 뒤(withLook)에도 장에 들어가는지.
 * 옅은 면은 안쪽 여백만큼 높아져서, 고른 부품만 보면 옆 부품까지 바뀌어 넘치는 것을 놓친다
 */
export function lookChangeIssue(blocks: Block[], blockId: string, look: BlockLook, areaH?: number): NoRoom | null {
  const why = lookIssue(blocks, blockId, look)
  if (why || areaH === undefined) return why
  const next = withLook(blocks, blockId, look)
  return settle(next, boardFit(areaH, next)) ? null : heightIssue(next, areaH, blocks)
}

/** 부품 하나를 바꿔도(항목 더하기, 모양 바꾸기) 장에 들어가는지 */
export function fitsWith(blocks: Block[], blockId: string, fn: (b: Block) => Block, areaH: number): boolean {
  return !changeIssue(blocks, blockId, fn, areaH)
}

/** 글의 폭 (글자 크기의 몫) */
export function widthOf(text: string, g: Glyphs): number {
  let w = 0
  for (const ch of text) {
    if (/[ㄱ-ㆎ가-힣一-鿿]/.test(ch)) w += g.hangul
    else if (/\s/.test(ch)) w += g.space
    else if (/[0-9]/.test(ch)) w += g.digit
    else if (/[A-Z]/.test(ch)) w += g.upper
    else if (/[a-z]/.test(ch)) w += g.lower
    else if (/[.,:;'!|]/.test(ch)) w += g.narrow
    else if (ch === '%') w += g.wide
    else w += g.other
  }
  return w
}

/**
 * 이 크기의 글이 이 너비에서 몇 줄인지. 장 머리는 띄어쓰기에서만 줄을 바꾸고(word-break: keep-all) 한 줄보다 긴 낱말은 그 안에서
 * 꺾인다(overflow-wrap). 글자 수에 평균 폭을 곱하던 때는 끝 낱말이 다음 줄로 넘어가는 것을 놓쳤다
 */
function lineCount(text: string, fs: number, width: number, g: Glyphs): number {
  let lines = 1
  let x = 0
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const w = widthOf(word, g) * fs
    const at = x ? x + g.space * fs : 0
    if (x && at + w > width) {
      lines++
      x = w
    } else x = at + w
    for (; x > width; x -= width) lines++
  }
  return lines
}

/**
 * 부품 장 본문 상자의 높이 어림 (발표 화면 기준: 비운 제목과 부제는 자리를 차지하지 않는다. edit면 편집 화면 기준).
 * 슬라이드가 그려져 있지 않아 잴 수 없을 때(문서 보기, 시험, 판 나누기) 쓴다. 제목은 길이에 따라 글자가 작아지고(fields.tsx의 fit, 24자와 40자)
 * 머리 너비(HEAD.titleW)를 넘으면 줄이 바뀐다. 부제 너비, 제목과 부제 사이, 머리 아래 FRAME.gap도 틀(frame.ts)의 값이다. 발표 설정(글자 크기, 보내는 자료)도 본다.
 * 장의 틀(frame.ts)에서 제목은 글자 윗선을 맞추느라 조금 올라간다
 */
export function composeAreaH(slide: Pick<Slide, 'fields' | 'hints'> & Partial<Pick<Slide, 'options'>>, look?: { meta?: { method?: string }; theme?: { id?: string; font?: string; size?: string } }, edit?: boolean): number {
  // 편집 화면은 비운 제목에도 안내를 보여서 그만큼 본문이 낮다. 비운 부제의 안내는 제목 아래 여백 위에 겹쳐 두어
  // 자리를 밀지 않는다(edit.css)
  const title = slide.options?.hideHead === true ? '' : slide.fields.title?.trim() || (edit ? hintFor('compose', slide.hints ?? {}, 'title') : '')
  const lead = slide.options?.hideHead === true ? '' : slide.fields.lead?.trim() ?? ''
  const type = look?.meta?.method === 'send' ? HEAD.read : HEAD.present
  const scale = look?.theme?.size === 'small' ? TEXT_SCALE.small : look?.theme?.size === 'large' ? TEXT_SCALE.large : 1
  const n = [...title].length
  const tfs = type.title * scale * (n > 40 ? 0.7 : n > 24 ? 0.84 : 1)
  const lfs = type.lead * scale
  const g = headLook(look?.theme)
  const titleH = title ? lineCount(title, tfs, HEAD.titleW, g.title) * tfs * HEAD.titleLine : 0
  const leadH = lead ? lineCount(lead, lfs, HEAD.leadW, g.lead) * lfs * HEAD.leadLine : 0
  const head = titleH - (title ? tfs * g.trim : 0) + leadH + (title && lead ? HEAD.between : 0)
  return Math.floor(1080 - FRAME.y - (slide.options?.hideFoot === true ? FRAME.y : FRAME.bottom) - (head ? head + FRAME.gap : 0))
}

/** 판을 나누는 데 쓰는 본문 높이: 편집 화면 기준(비운 제목의 안내도 자리를 차지한다). 발표 화면은 이보다 넓어서 잘리지 않는다 */
export const boardAreaH = (slide: Pick<Slide, 'fields' | 'hints'> & Partial<Pick<Slide, 'options'>>, look?: Parameters<typeof composeAreaH>[1]) => composeAreaH(slide, look, true)

/**
 * 바뀐 부품 장의 판을 다시 맞춘다: 부품이 커졌거나(항목, 모양, 바탕), 제목이 길어져 본문이 낮아졌거나, 글자 크기를 바꿨으면
 * 모자란 부품이 옆에서 자리를 받는다. 바뀌지 않은 장과 이미 맞는 판은 그대로(같은 객체). 들어가지 않으면 그대로 두고
 * 편집기가 '자리가 모자라요'를 알린다(boardTight). 편집기의 모든 고침(deckStore의 commit)이 거친다
 */
export function settleDeck(next: Deck, prev?: Deck): Deck {
  const lookChanged = !prev || prev.theme !== next.theme || prev.meta !== next.meta
  let changed = false
  const slides = next.slides.map((s) => {
    if (s.layout !== 'compose' || !s.blocks?.length) return s
    if (!lookChanged && prev?.slides.includes(s)) return s
    const fit = boardFit(boardAreaH(s, next), s.blocks)
    const out = settle(s.blocks, fit)
    if (!out || out.every((b, i) => b === s.blocks![i])) return s
    changed = true
    // 알아서 짠 판을 다시 맞춘 자리도 알아서 짠 판이다(사람이 옮긴 것이 아니다): 표시가 자리를 따라가야 다음에 넣을 때 판을 다시 고른다
    const auto = s.arranged !== undefined && s.arranged === boardSig(s.blocks)
    return { ...s, blocks: out, ...(auto ? { arranged: boardSig(out) } : {}) }
  })
  return changed ? { ...next, slides } : next
}

/**
 * 이 장의 판이 장에 들어가지 않는지 (제목이 길어지거나 글자를 키워 모든 부품이 잘리지 않을 자리가 없을 때).
 * areaH: 그려진 본문 상자에서 잰 높이. 편집기는 컴포넌트 잠금과 같은 잰 높이로 본다(없으면 어림)
 */
export function boardTight(slide: Pick<Slide, 'layout' | 'blocks' | 'fields' | 'hints'>, look?: Parameters<typeof composeAreaH>[1], areaH?: number): boolean {
  if (slide.layout !== 'compose' || !slide.blocks?.length) return false
  const h = areaH ?? boardAreaH(slide, look)
  return needRows(slide.blocks, boardFit(h, slide.blocks)) > BOARD_ROWS
}

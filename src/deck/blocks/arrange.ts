// 짜임 틀 고르기: 컴포넌트가 적은 장(넷까지)을 알아서 짤 때, 판이 칸을 기계적으로 자르지 않고 짜임 틀 몇 가지를 견줘 가장 보기 좋은 것을 고른다.
//
// 예전에는 눌러 넣을 때마다 마지막 줄 옆이나 맨 아래 새 줄에 끼웠다(board.ts의 autoInsert). 그래서 로고 모음 아래에 숫자 둘이 작은 띠로
// 붙거나(로고가 남는 높이를 다 받는다), 숫자 둘이 서로 다른 줄로 갈라지거나, 한쪽만 길게 비는 짜임이 그대로 남았다.
// 디자이너는 같은 부품들로 둘이면 '나란히 내용 비율대로' 또는 '위 하나 + 아래 하나', 셋이면 '한 줄 셋', '큰 하나 + 옆에 둘 쌓기',
// '위 하나 + 아래 둘' 같은 틀을 견줘 고른다. 여기서도 같은 부품, 같은 읽는 차례로 만들 수 있는 판(끝에서 끝까지 자른 꼴, board.ts)을
// 모두 만들어 보고, 그려질 모습을 어림한 점수(채움, 한쪽 빔, 너비, 같은 말투)로 고른다. 점수의 기준은 개발용 검사(screens/assembly.ts)와 같다.
//
// 사람이 직접 놓은 자리는 바꾸지 않는다. 저장 형식(Block.at)에는 '알아서 놓은 것'이라는 표시가 없어서, 지금 판이 이 규칙이 그 부품들로
// 고를 판과 같을 때만(사람이 옮기거나 선을 끌지 않았을 때만) 새 부품을 넣으며 다시 고른다. 다르면 예전처럼 끼운다(place.ts의 autoPlace).

import type { Block, BlockType } from '../types'
import { headLook } from '../themes'
import { readPercent } from '../percent'
import { BOARD_COLS, byReading, type Fit, layTree, leaf, sameArea, split, type Tree, treeOf } from './board'
import { BLOCK_GROUPS } from './catalog'
import { blockItems, variantOfBlock } from './cells'
import { aspectOf, fitImage } from './images'
import { BLOCK_COL_GAP, isAlone, isSolo, shownLook } from './rules'
import { AREA_W, atRect, blockMinH, isStretchy, widthOf } from './sizing'

/**
 * 글 끝이 들쭉날쭉한 부품(글이 칸 너비가 아니라 제 길이나 글 폭에서 끝난다). 이것이 옆 칸 앞에 서면 칸이 넓을수록 글 끝과 옆 칸 사이가 빈다
 */
const RAGGED = new Set<BlockType>(['bullets', 'text', 'message', 'callout', 'facts', 'quote', 'points'])
/** 나란한 칸 사이가 옆 칸 사이(BLOCK_COL_GAP)보다 본문 너비의 이만큼 넘게 비면 남는 너비를 한 칸이 다 받은 것 */
const HOLE = 0.2
/**
 * 주석 앞의 구멍은 더 좁게(본문의 5%, 84px): 주석은 앞의 것에 이어 읽는 덧붙임이라 멀리 떨어지면 따로 선 글이 된다.
 * 다른 칸처럼 20%까지 두면 비율 원(150%)과 기준 글 사이가 340px 비고 기준 글은 오른쪽 4칸에서 두 줄로 꺾였다(검수)
 */
const NOTE_HOLE = 0.05

/** 틀을 견주는 가장 많은 부품 수. 더 많으면 사람이 짠 차례가 짜임의 뜻이라 판에 맡긴다 */
export const ARRANGE_MAX = 4

/** 틀의 내용 높이를 견줄 때 쓰는 묶음 사이. 그리는 쪽은 자리가 남으면 이보다 넓힌다(slides/fitBlocks.ts). */
const BAND_GAP = 72
const HEAD_GAP = 32
/** 잰 높이에 더한 여유(sizing.ts의 HEIGHT_SLACK). 내용의 높이를 어림할 때 뺀다 */
const SLACK = 10

/**
 * 한 줄로 서는 결론 글의 가장 긴 줄 (캔버스 px): 글 폭(--measure, 24em) × 장 제목 아래의 글자 크기(44). 잰 높이로는 한 줄을 다 쓰는 칸에서
 * 한 줄로 들어가 그보다 좁으면 두 줄로 꺾이니 판 너비를 다 쓰는 것으로 보이지만, 글은 글 폭에서 꺾여 본문 너비의 63%에서 끝난다.
 * 그 아래에 좁은 목록을 쌓으면 오른쪽 37%가 통째로 비었다(결론 한 줄 + 개요). 제목과 글의 본문도 24em에서 꺾이므로
 * 큰 숫자와 위아래로 놓으면 짧은 두 내용이 왼쪽에 몰리고 오른쪽이 비었다. 다만 소제목이 있으면 넓은 칸에서 소제목과 본문이
 * 나란히 서서 너비를 다 쓴다(styles/blocks/text.css).
 */
const MEASURE_W: Partial<Record<BlockType, number>> = { message: 24 * 44, callout: 24 * 44 }

/**
 * 그려지는 가장 넓은 너비를 글 폭으로 어림할 수 있는 부품 (캔버스 px. 없으면 Infinity). 개요는 한 단이면(셋까지, 또는 두 단으로 나누지 않는
 * 1300px 밑의 칸) 이름(이름만큼, 100px 남짓)과 사이(40), 글 폭에서 꺾이는 내용(24em × 30px)까지다: 넓은 칸에서 한 줄로 들어가 넓게 보였지만
 * 본문의 절반에서 끝났다(blocks/facts.css)
 */
function measureW(b: Block, w: number): number {
  // 넓은 칸도 소제목과 본문이 화면 끝까지 차는 것은 아니다. 소제목은 글 길이만큼(최대 30%), 본문은 읽기 폭까지만 그려진다.
  // 칸 너비 전체로 세면 짧은 글과 목록 둘을 위아래로 쌓고 오른쪽 3분의 1을 비우는 판을 나란한 판보다 좋다고 골랐다.
  if (b.type === 'bullets' && b.items.length <= 3 && w >= 1300 && b.fields.heading?.trim()) {
    const heading = Math.min(w * 0.3, [...b.fields.heading.trim()].length * 44)
    // 띄어쓰기와 영문은 한글보다 좁다. 모든 글자를 한글 한 칸으로 세면 짧은 목록이 실제보다 넓게 그려진다고 보아
    // 결론 아래에 쌓고 오른쪽을 비우는 배치를 고른다.
    const longest = Math.max(1, ...b.items.flatMap((item) => [item.title, item.body].map((s) => widthOf(s, headLook().lead))))
    return heading + 72 + 58 + Math.min(24 * 30, longest * 30)
  }
  if ((b.type === 'text' || b.type === 'bullets') && w >= 1300 && b.fields.heading?.trim()) return Math.min(w * 0.3, [...b.fields.heading.trim()].length * 44) + 48 + 24 * 30
  if (b.type === 'text') return 24 * 30
  if (b.type === 'facts' && (b.items.length <= 3 || w < 1300)) return 140 + 24 * 30
  // 주석은 글 폭 없이 칸 너비에서 꺾여서 한 줄에 드는 너비까지 그려진다: 이름 + 사이(16) + 가장 긴 줄, 작은 글(26px)을 한 단계 키운 크기로
  if (b.type === 'note') {
    const kind = b.fields.kind?.trim() ?? ''
    const text = Math.max(0, ...(b.fields.text ?? '').split('\n').map((line) => widthOf(line, headLook().lead)))
    return (kind ? widthOf(kind, headLook().lead) * NOTE_PX + 16 : 0) + text * NOTE_PX
  }
  return MEASURE_W[b.type] ?? Infinity
}

/** 주석 글자의 너비를 어림하는 글자 크기 (캔버스 px): 작은 글 26px을 판이 한 단계(1.2) 키운 크기에 굵은 이름과 자간 몫을 더한다 */
const NOTE_PX = 32

/**
 * 핵심 숫자가 좁은 칸에서 바꾸는 짜임의 높이 (캔버스 px, styles/blocks/kpi.css와 같은 값: arrange.test.ts가 맞춰 본다).
 * 둘·셋은 1200px 밑의 칸이 이만큼 높으면 숫자 옆에 이름을 둔 줄로 쌓고(--kp-stack), 넷은 900px 밑에서는 늘, 1200px 밑에서는
 * 이만큼 높으면 둘씩 두 줄로 둔다(--kp-pair). [나란히, 카드] × [설명 없음, 설명 있음]
 */
export const KPI_NARROW: Record<2 | 3 | 4, { base: [number, number]; cards: [number, number] }> = {
  2: { base: [200, 240], cards: [280, 320] },
  3: { base: [300, 360], cards: [380, 440] },
  4: { base: [400, 520], cards: [460, 580] },
}

/**
 * 핵심 숫자가 이 칸에서 좁은 칸의 짜임(줄로 쌓기, 둘씩 두 줄)으로 그려지는지. 그러면 반 칸(가장 좁은 너비)이 보기 좋은 너비다:
 * 쌓은 줄은 숫자 옆에 이름이 바로 붙고 숫자는 글자 크기 단계에서 멈춰서, 3분의 2 칸(1096px)을 주어도 숫자는 그대로이고 오른쪽이 빌 뿐이다.
 * 보기 좋은 너비(prefSpan 12)는 숫자를 한 줄에 나란히 둘 때의 판 너비라, 쌓는 칸에서도 그 너비로 세면 핵심 숫자에 8칸을 주고
 * 옆 목록을 4칸으로 눌렀다(가운데가 크게 비고 목록의 첫 줄이 꺾였다). 판보다 좁은 칸은 옆에 다른 컴포넌트가 있어서, 1000px 넘는 칸의 둘은 나란히 선다(.is-shared)
 */
function narrowKpi(b: Block, r: { w: number; h: number }): boolean {
  if (b.type !== 'kpi' || r.w > 1200) return false
  const items = blockItems(b)
  const n = items.length
  const variant = variantOfBlock(b)
  if ((n !== 2 && n !== 3 && n !== 4) || (variant !== 'base' && variant !== 'cards')) return false
  if (n === 2 && r.w >= 1000) return false
  if (n === 4 && r.w <= 900) return true
  return r.h >= KPI_NARROW[n][variant][items.some((it) => it.body.trim()) ? 1 : 0]
}

/** 같은 말투로 맞출 숫자 부품: 한 장에 둘 이상이면 나란히 한 줄에 서야 크기와 이름표 자리를 맞출 수 있다 */
export const NUMBER_TYPES = new Set<BlockType>(['number', 'stat', 'delta', 'goal', 'ring', 'ratio'])

/**
 * 틀을 견줄 읽는 차례: 넣은 차례(장의 부품 차례) 그대로. 판을 읽은 차례로 하면 소제목 묶음 둘이 나란한 판(소제목 둘이 같은 줄)은
 * 소제목, 소제목, 목록, 목록으로 읽혀 소제목 둘이 위아래로 붙은 틀이 나왔다. 다만 맨 위에 선 결론(핵심 한 줄, 강조 상자: place.ts의
 * autoPlace가 근거 위로 올린다)은 맨 앞에, 로고 모음 다음에 넣은 숫자는 로고 앞에(answersFirst), 차트 다음에 숫자만 넣었으면
 * 그 숫자는 차트 앞에(chartAnswersFirst)
 */
export function arrangeOrder(blocks: Block[]): Block[] {
  const first = byReading(blocks)[0]
  const lead = first && LEADS.has(first.type) ? [first] : []
  return chartAnswersFirst(answersFirst([...lead, ...blocks.filter((b) => !lead.includes(b))]))
}

/** 결론을 말하는 부품 (place.ts의 LEADS) */
const LEADS = new Set<BlockType>(['message', 'callout'])

/**
 * 로고 모음 다음에 넣은 숫자는 로고 위로(숫자가 장의 답이고 로고는 그 근거). 넣은 차례대로 두면 로고 모음이
 * 위 절반을 차지하고 숫자 둘이 그 아래 작은 띠로 붙어, 상관없는 숫자가 로고 밑에 깔린 것처럼 보였다(docs/VISUAL-RULES.md 6)
 */
function answersFirst(order: Block[]): Block[] {
  const i = order.findIndex((b) => b.type === 'logos')
  if (i < 0) return order
  const late = order.slice(i + 1).filter((b) => NUMBER_TYPES.has(b.type))
  if (!late.length) return order
  return [...order.slice(0, i), ...late, ...order.slice(i).filter((b) => !late.includes(b))]
}

/** 숫자의 근거로 서는 데이터 차트 (catalog.ts의 '차트' 묶음) */
const CHARTS = new Set<BlockType>(BLOCK_GROUPS.find((g) => g.short === '차트')?.types ?? [])
/** 차트 앞으로 올리는 숫자: 칸 높이를 받지 않는 것. 비율 원, 몇 중 몇은 그 자체로 높이를 받는 차트라 올리지 않는다 */
const isAnswer = (b: Block) => NUMBER_TYPES.has(b.type) && !isStretchy(b.type)

/**
 * 차트 다음에 숫자만 넣었으면 숫자를 차트 앞으로(숫자가 장의 답이고 차트는 그 근거). 넣은 차례대로 두면 차트가 위를 다 쓰고
 * 숫자가 그 아래 띠의 왼쪽에 각주처럼 혼자 붙어, 띠의 오른쪽이 통째로 비었다. 차트 다음에 목록이나 글도 넣었으면 숫자가 그것과
 * 한 줄에 서므로 그대로 둔다. 소제목 다음의 부품은 그 소제목의 묶음이라 소제목까지만 본다
 */
function chartAnswersFirst(order: Block[]): Block[] {
  const i = order.findIndex((b) => CHARTS.has(b.type))
  if (i < 0) return order
  const after = order.slice(i + 1)
  const end = after.findIndex((b) => b.type === 'heading')
  const late = end < 0 ? after : after.slice(0, end)
  if (!late.length || !late.every(isAnswer)) return order
  return [...order.slice(0, i), ...late, order[i], ...after.slice(late.length)]
}

/** 이 부품들(읽는 차례)을 끝에서 끝까지 잘라 만들 수 있는 모든 나무. 같은 쪽 가지 안에 같은 쪽 가지는 없다(board.ts의 tidy) */
function shapes(items: Block[], dir: 'h' | 'v' | null): Tree[] {
  if (items.length === 1) return [leaf(items[0])]
  const out: Tree[] = []
  for (const d of dir ? [dir] : (['v', 'h'] as const)) {
    // items를 차례대로 둘 이상의 묶음으로 나누는 모든 방법
    const cuts = (from: number): Block[][][] => {
      if (from === items.length) return [[]]
      const res: Block[][][] = []
      for (let to = from + 1; to <= items.length; to++) for (const rest of cuts(to)) res.push([items.slice(from, to), ...rest])
      return res
    }
    for (const groups of cuts(0)) {
      if (groups.length < 2) continue
      const kids = groups.map((g) => shapes(g, d === 'v' ? 'h' : 'v'))
      // 묶음마다의 나무를 곱해 모든 짝
      let combos: Tree[][] = [[]]
      for (const ks of kids) combos = combos.flatMap((c) => ks.map((k) => [...c, k]))
      for (const c of combos) out.push(split(d, c))
    }
  }
  return out
}

/** 옆으로 나눈 가지마다 너비를 나눠 보는 몇 가지 (합이 width): 보기 좋은 너비의 비율, 고르게, 둘이면 3:9부터 9:3까지 */
function widthOptions(prefs: number[], width: number): number[][] {
  const n = prefs.length
  const fix = (ws: number[]) => {
    const r = ws.map((x) => Math.max(1, Math.round(x)))
    r[r.length - 1] += width - r.reduce((a, x) => a + x, 0)
    return r.every((x) => x >= 1) ? r : null
  }
  const sum = prefs.reduce((a, x) => a + x, 0)
  const out = [fix(prefs.map((p) => (p * width) / sum)), fix(prefs.map(() => width / n))]
  if (n === 2) for (let a = 3; a <= width - 3; a++) out.push([a, width - a])
  if (n === 3) for (let i = 0; i < 3; i++) out.push(fix(prefs.map((_, j) => (j === i ? width / 2 : width / 4))))
  const seen = new Set<string>()
  return out.filter((x): x is number[] => !!x && !seen.has(x.join()) && !!seen.add(x.join()))
}

const prefOf = (t: Tree, fit: Fit): number => (t.kind === 'leaf' ? Math.max(fit.minW(t.block), fit.prefW(t.block)) : t.dir === 'h' ? t.kids.reduce((a, k) => a + prefOf(k, fit), 0) : Math.max(...t.kids.map((k) => prefOf(k, fit))))

/** 나무마다 너비를 나눠 보는 몇 가지: 옆으로 나눈 가지의 자식에 바라는 너비(want)를 단다. 위아래로 쌓은 가지는 판이 가장 낮은 높이부터 나눈다 */
function sized(t: Tree, width: number, fit: Fit): Tree[] {
  if (t.kind === 'leaf') return [{ ...t, want: 0 }]
  if (t.dir === 'v') {
    let combos: Tree[][] = [[]]
    for (const k of t.kids) {
      const ks = sized(k, width, fit)
      combos = combos.flatMap((c) => ks.map((x) => [...c, { ...x, want: 0 }]))
    }
    return combos.map((kids) => ({ ...t, kids }))
  }
  const out: Tree[] = []
  for (const ws of widthOptions(
    t.kids.map((k) => prefOf(k, fit)),
    width,
  )) {
    let combos: Tree[][] = [[]]
    t.kids.forEach((k, i) => {
      const ks = sized(k, ws[i], fit)
      combos = combos.flatMap((c) => ks.map((x) => [...c, { ...x, want: ws[i] }]))
    })
    out.push(...combos.map((kids) => ({ ...t, kids })))
  }
  return out
}

/** 놓은 판을 다시 나무로 읽기 위한 잎의 자리 (부품 id로) */
type Laid = Map<string, Block>

/**
 * 부품이 실제로 쓰는 너비(칸 수): 그보다 넓혀도 높이가 줄지 않는 가장 좁은 너비. 글은 글 폭에서 줄을 꺾고, 목록과 숫자는 제 너비만
 * 쓰므로 칸이 넓어도 오른쪽이 빈다. 넓을수록 단을 나누거나 옆으로 눕히는 부품은 넓힐수록 낮아져 판 너비를 다 쓴다.
 * 좁은 너비도 이 칸에 그려지는 바탕의 높이로 견준다: 판 너비를 혼자 쓰는 부품은 카드를 골랐어도 바탕 없이 그려지는데(shownLook),
 * 좁은 너비를 카드의 높이(안쪽 여백만큼 늘 높다)로 견주면 판 너비를 다 쓴다고 보아, 카드 부품 아래에 목록을 쌓고 두 내용이
 * 왼쪽 절반에만 그려진 판을 나란한 판보다 좋다고 골랐다
 */
function naturalSpan(b: Block): number {
  const drawn: Block = { ...b, look: shownLook(b, isAlone(b)) }
  const full = blockMinH(drawn, BOARD_COLS)
  for (const w of [3, 4, 6, 8]) if (blockMinH(drawn, w) <= full * 1.05 + SLACK) return w
  return BOARD_COLS
}

/**
 * 이미지가 든 이미지 부품이 이 칸에 그려지는 크기 (캔버스 px, 설명 한 줄 포함). 이미지가 없으면 null.
 * 이미지는 비율을 지켜 칸 안에 들어가므로(전체 보이기), 넓은 화면 캡처를 낮은 띠에 두면 칸 가운데에 작게 서고 양옆이 빈다(images.ts의 imageBox와 같은 셈)
 */
function picture(b: Block, r: { w: number; h: number }): { w: number; h: number } | null {
  const aspect = aspectOf(b)
  if (!aspect) return null
  const card = shownLook(b, isAlone(b)) !== 'plain'
  const cap = b.fields.caption?.trim() ? 56 : 0
  const w = r.w - (card ? 104 : 0)
  const h = r.h - (card ? 88 : 0) - cap
  if (w <= 0 || h <= 0) return { w: 0, h: 0 }
  const iw = Math.min(w, h * aspect)
  return { w: iw + (card ? 104 : 0), h: iw / aspect + cap + (card ? 88 : 0) }
}

/** 비율로 읽을 수 없는 값(150%, 10건)을 적은 비율 원: 원 없이 숫자 옆에 이름과 덧붙임을 둔다(styles/blocks/ring.css) */
const unknownRing = (b: Block): boolean => b.type === 'ring' && readPercent(b.fields.value ?? '') === null

/**
 * 원을 그리지 않는 비율 원이 그리는 너비 (캔버스 px). 넓은 칸(700px 이상)에서는 숫자(칸의 55%까지) + 사이 64 + 이름과 덧붙임 중 긴 것.
 * 칸 전체를 쓴다고 계산하면 그 아래에 다른 부품을 쌓고 본문 오른쪽 29%를 비운 판을 골랐다(검수).
 * 좁은 칸에서는 이름, 숫자, 덧붙임을 위아래로 쌓아서(styles/blocks/ring.css) 그중 넓은 것까지다: 넓은 칸의 셈으로 보면 5칸에 쌓은
 * 숫자 뒤의 빈 곳을 몰라, 옆 주석과 사이가 290px 빈 판을 골랐다
 */
function unknownRingW(b: Block, w = AREA_W): number {
  const number = widthOf(b.fields.value ?? '', headLook().lead) * 154
  const text = Math.max(220, widthOf(b.fields.label ?? '', headLook().lead) * 44, widthOf(b.fields.note ?? '', headLook().lead) * 36)
  if (w < 700) return Math.min(w, Math.max(number, text))
  return Math.min(w * 0.55, number) + 64 + text
}

/** 짜임 하나의 점수 (작을수록 좋다). 그려질 모습을 어림한다: 글자를 몇 단계까지 키울 수 있는지, 쌓은 뒤 본문을 얼마나 채우는지, 나란한 칸 한쪽이 얼마나 비는지 */
export function arrangeCost(t: Tree, laid: Laid, fit: Fit, areaH: number, last?: string): number {
  const size = { w: AREA_W, h: areaH }
  const rect = (b: Block) => atRect(laid.get(b.id)!.at!, size)
  const base = (b: Block) => Math.max(0, blockMinH(laid.get(b.id)!, laid.get(b.id)!.at!.w) - SLACK)
  const leaves = (n: Tree): Block[] => (n.kind === 'leaf' ? [n.block] : n.kids.flatMap(leaves))
  const all = leaves(t)
  // 그려진 높이: 차트처럼 칸 높이를 다 쓰는 부품은 칸 높이, 글과 숫자는 잰 높이에 글자 단계를 곱한 것
  // 차트도 칸 높이를 끝없이 쓰지는 않는다(흐름, 원, 로고는 비율을 지킨다): 잰 높이의 두 배까지만
  // 이미지가 든 이미지 부품은 칸 안에 이미지 비율대로 들어간 크기(가운데에 선다).
  // 좁은 칸의 짜임으로 그려지는 핵심 숫자(narrowKpi)도 줄 사이가 남는 높이를 따라 넓어져(kpi.css의 사이 줄) 잰 높이보다 크게 그려진다:
  // 잰 높이로 세면 판 높이 전체에 쌓은 숫자 옆에 짧은 글을 두고 글 아래가 통째로 비는 판을 나쁘지 않다고 보았다
  const drawn = (b: Block, s: number) => {
    const img = picture(laid.get(b.id)!, rect(b))
    if (img) return img.h
    return isStretchy(b.type) || narrowKpi(laid.get(b.id)!, rect(b)) ? Math.min(rect(b).h, base(b) * 2 * s) : base(b) * s
  }
  const pack = (n: Tree, s: number): number => {
    if (n.kind === 'leaf') return drawn(n.block, s)
    const hs = n.kids.map((k) => pack(k, s))
    if (n.dir === 'h') return Math.max(...hs)
    return hs.reduce((a, h, i) => a + h + (i ? (n.kids[i - 1].kind === 'leaf' && (n.kids[i - 1] as { block: Block }).block.type === 'heading' ? HEAD_GAP : BAND_GAP) : 0), 0)
  }
  // 글자 단계: 모든 칸이 한 단계(1.2) 키워 들어가면 1.2, 그러고도 본문의 60%를 못 채우고 두 단계(1.44)로 쌓아도 본문에 들면 1.44
  const fits = (s: number) => all.every((b) => isStretchy(b.type) || base(b) * s <= rect(b).h + 4)
  let s = fits(1.2) ? 1.2 : 1
  if (s === 1.2 && pack(t, 1.2) < 0.6 * areaH && pack(t, 1.44) <= areaH && all.every((b) => isStretchy(b.type) || laid.get(b.id)!.look === undefined || laid.get(b.id)!.look === 'plain' || base(b) * 1.44 <= rect(b).h)) s = 1.44
  const fill = pack(t, s) / areaH
  let cost = (1.44 - s) * 20
  if (fill < 0.6) cost += (0.6 - fill) * 100
  if (fill < 0.8) cost += (0.8 - fill) * 30
  if (fill > 0.95) cost += (fill - 0.95) * 100
  // 칸 안에 그려지는 너비: 주석은 한 줄에 드는 너비까지라(measureW), 칸 너비로 세면 짧은 주석 옆의 빈 곳을 주석 아래의 빈 곳으로 한 번 더
  // 쳐서 주석을 좁은 칸에 밀어 넣었다(비율 원 옆 주석이 4칸에서 두 줄로 꺾이고 둘 사이가 340px 비었다). 칸 오른쪽의 빈 곳은 아래 '가로로
  // 빈 곳'이 센다
  const drawnW = (b: Block) => (b.type === 'note' ? Math.min(rect(b).w, measureW(b, rect(b).w)) : rect(b).w)
  // 한쪽 빔: 나란한 칸 가운데 짧은 칸 아래로 비는 넓이 (본문 넓이에 견준 몫)
  const walk = (n: Tree) => {
    if (n.kind === 'leaf') return
    if (n.dir === 'h') {
      const hs = n.kids.map((k) => pack(k, s))
      const top = Math.max(...hs)
      // 이미지 옆의 글은 이미지 윗선에 맞춰 서는 것이 사람이 짠 꼴이다(화면 캡처 옆의 설명): 이미지 높이는 비율이 정해서 글 아래가 비는 것을
      // 차트 옆처럼 세게 치면, 캡처를 4칸에 작게 두고 글을 8칸에 둔 판이 캡처를 크게 둔 판보다 나았다
      const beside = n.kids.some((k) => k.kind === 'leaf' && aspectOf(laid.get(k.block.id)!)) ? 0.5 : 1
      n.kids.forEach((k, i) => {
        const w = leaves(k).reduce((a, b) => Math.max(a, rect(b).x + drawnW(b)), 0) - Math.min(...leaves(k).map((b) => rect(b).x))
        cost += (((top - hs[i]) * w) / (areaH * AREA_W)) * 150 * beside
      })
    }
    n.kids.forEach(walk)
  }
  walk(t)
  for (const b of all) {
    const at = laid.get(b.id)!.at!
    // 보기 좋은 너비보다 좁은 칸은 짜임이 눌린다. 숫자는 가장 좁은 너비에서도 한 줄로 서서(숫자 셋이 4·4·4) 덜 친다.
    // 좁은 칸의 짜임으로 그려지는 핵심 숫자는 반 칸이 보기 좋은 너비다(narrowKpi)
    const narrow = narrowKpi(laid.get(b.id)!, rect(b))
    // 원을 그리지 않는 비율 원은 숫자와 이름 너비만큼이 보기 좋은 너비다(그보다 넓히면 옆 칸 앞이 빈다)
    const lone = unknownRing(b) ? Math.max(fit.minW(b), Math.ceil((unknownRingW(laid.get(b.id)!) + BLOCK_COL_GAP) / ((AREA_W + BLOCK_COL_GAP) / BOARD_COLS))) : 0
    const want = narrow ? fit.minW(b) : lone || fit.prefW(b)
    cost += Math.max(0, want - at.w) * (NUMBER_TYPES.has(b.type) ? 1 : 3)
    // 줄로 쌓은 둘·셋은 반 칸에 맞춘 짜임이라 그보다 넓히면 이름 오른쪽이 비고 옆 칸만 좁아진다 (둘씩 두 줄인 넷은 넓힌 만큼 두 단이 쓴다)
    if (narrow && blockItems(b).length <= 3) cost += Math.max(0, at.w - want) * 3
    // 보기 좋은 너비의 두 배보다 넓으면 내용이 왼쪽에 붙고 오른쪽이 빈다(한 줄을 다 쓰는 숫자 한 줄)
    if (!isStretchy(b.type)) cost += Math.max(0, at.w - 2 * want) * 2
    // 차트와 그림이 낮은 띠가 되면 읽히지 않는다
    if (isStretchy(b.type) && rect(b).h < 0.4 * areaH) cost += ((0.4 * areaH - rect(b).h) / areaH) * 60
    // 이미지가 칸을 다 쓰지 못하고 가운데에 작게 서면 칸의 남는 몫만큼 빈다 (화면 캡처를 넓고 낮은 띠에 둔 판)
    const img = picture(laid.get(b.id)!, rect(b))
    if (img) cost += (1 - (img.w * img.h) / (rect(b).w * rect(b).h)) * ((rect(b).w * rect(b).h) / (areaH * AREA_W)) * 100
    // 판 너비를 혼자 쓰는 부품(표, 일정)은 한 줄을 다 써야 한다
    if (isSolo(b.type) && at.w < BOARD_COLS) cost += 1000
  }
  // 핵심 문장과 짧은 목록이 나란하면 한 칸이 한 칸 차이로 더 넓은 판(7:5)도 점수가 거의 같을 수 있다.
  // 문장이 두 줄로 꺾이면 넓은 왼쪽 칸의 끝이 비어 두 내용이 멀어지므로, 차이가 작을 때는 같은 너비를 먼저 견준다.
  if (all.length === 2 && all.map((b) => b.type).sort().join(',') === 'bullets,message') {
    const a = laid.get(all[0].id)!.at!
    const b = laid.get(all[1].id)!.at!
    if (a.y === b.y && a.h === b.h) cost += Math.abs(a.w - b.w) * 0.5
  }
  // 짧은 목록과 원을 나란히 둘 때 원의 넓은 칸만 우선하면 목록이 불필요하게 여러 줄로 꺾인다.
  // 다른 점수가 비슷한 판에서는 두 칸의 균형을 먼저 견준다.
  if (all.length === 2 && all.map((b) => b.type).sort().join(',') === 'bullets,ring') {
    const a = laid.get(all[0].id)!.at!
    const b = laid.get(all[1].id)!.at!
    if (a.y === b.y && a.h === b.h) cost += Math.abs(a.w - b.w)
  }
  // 한 장의 숫자 둘 이상은 같은 말투: 한 줄에 나란히 서야 크기와 이름표 자리가 맞는다
  const nums = all.filter((b) => NUMBER_TYPES.has(b.type))
  if (nums.length > 1) {
    const ys = new Set(nums.map((b) => laid.get(b.id)!.at!.y))
    const hs = new Set(nums.map((b) => laid.get(b.id)!.at!.h))
    if (ys.size > 1 || hs.size > 1) cost += 25
    // 한 줄에 선 숫자들의 칸 너비도 같아야 한다: 3 · 6 · 3으로 나누면 가운데 숫자 칸만 넓어 숫자 사이가 고르지 않았다(왼쪽 둘은 붙고 셋째만 멀리)
    else if (new Set(nums.map((b) => laid.get(b.id)!.at!.w)).size > 1) cost += 15
  }
  // 가로로 빈 곳: 그려진 것의 오른쪽 끝(naturalSpan). 본문 오른쪽이 20% 넘게 비면 판이 너비를 고르게 나누지 못한 것(screens/assembly.ts의 sides)
  /** 그려진 것의 오른쪽 끝 (캔버스 px) */
  const inkRight = (b: Block): number => {
    const r = rect(b)
    const img = picture(laid.get(b.id)!, r)
    // 칸보다 좁은 이미지는 칸 가운데에 선다
    if (img) return r.x + (r.w + img.w) / 2
    // 몇 중 몇은 넓은 칸에서 숫자 옆에 점을 놓지만, 점은 최대 32px이라 칸 전체로 늘어나지 않는다.
    // 전체가 20 이하인 정수일 때는 최대 열 개와 이름·설명의 폭으로 그려질 끝을 어림한다.
    // 값이 불명확하거나 백분율 점 100개인 경우는 가득 쓰는 쪽으로 보수적으로 둔다.
    const placed = laid.get(b.id)!
    // 낮고 넓은 비율 원은 원을 높이만큼만 그리고 그 옆에 이름을 둔다. 차트처럼 칸 전체를 채운다고 계산하면
    // 짧은 목록 아래 작은 원을 쌓고 오른쪽 대부분을 비운 판이 가장 좋다고 잘못 고른다.
    if (b.type === 'ring' && shownLook(placed, isAlone(placed)) === 'plain' && readPercent(placed.fields.value ?? '') !== null && r.w >= 700 && r.h <= 440 && r.w / r.h >= 1.5) {
      const circle = placed.variant === 'gauge' ? Math.min(r.h * 100 / 72, r.w * 0.5) : Math.min(r.h, r.w * 0.44)
      const text = Math.max(220, widthOf(placed.fields.label ?? '', headLook().lead) * 44, widthOf(placed.fields.note ?? '', headLook().lead) * 36)
      return r.x + Math.min(r.w, circle + 64 + text)
    }
    // 비율로 읽을 수 없는 값(150%, 10건)은 원 없이 숫자 옆에 이름과 덧붙임을 둔다(styles/blocks/ring.css). 칸 전체를 쓴다고 계산하면
    // 그 아래에 다른 부품을 쌓고 본문 오른쪽 29%를 비운 판을 골랐다(검수)
    if (unknownRing(b)) return r.x + Math.min(r.w, unknownRingW(placed, r.w))
    const total = placed.fields.total?.trim() ?? ''
    if (b.type === 'ratio' && r.w >= 900 && /^\d+$/.test(total) && Number(total) > 0 && Number(total) <= 20) {
      const words = Math.max(1, ...[placed.fields.label, placed.fields.note].map((s) => [...(s ?? '')].length)) * 26
      const number = [...(placed.fields.value ?? '')].length * 72
      const text = Math.min(r.w * 0.44, Math.max(words, number))
      const dots = Math.min(10, Number(total)) * 32 * 1.3 - 9.6
      return r.x + Math.min(r.w, text + 72 + dots)
    }
    // 한 줄에 나란히 선 핵심 숫자는 칸을 숫자 수만큼 똑같이 나눠 쓴다: 마지막 숫자의 단에서 숫자와 이름(440px 남짓)까지 그려진다.
    // 잰 높이로 어림하면(naturalSpan) 반 칸에서도 높이가 같아 반 칸만 쓴다고 보아, 한 줄을 다 쓰는 숫자 셋을 '오른쪽 절반이 빈다'고 쳤다
    // (갤러리에서 잰 끝: 판 너비의 둘 76%, 셋 93~98%, 넷 거의 100%)
    if (b.type === 'kpi' && !narrowKpi(placed, r)) {
      const n = Math.max(1, blockItems(placed).length)
      return r.x + r.w - r.w / n + Math.min(r.w / n, 440)
    }
    // 주석은 잰 높이가 글이 꺾여도 그대로라(가장 낮은 높이) 잰 높이로 어림하면(naturalSpan) 늘 3칸만 쓴다고 보았다: 한 줄에 드는 너비로
    if (b.type === 'note') return r.x + drawnW(b)
    const w = isStretchy(b.type) ? r.w : Math.min(atRect({ x: 0, y: 0, w: naturalSpan(laid.get(b.id)!), h: 1 }, size).w, measureW(b, r.w))
    return r.x + Math.min(r.w, w)
  }
  const right = Math.max(...all.map(inkRight))
  const empty = 1 - right / AREA_W
  if (empty > 0.2) cost += (empty - 0.2) * 400
  // 나란한 칸 사이의 구멍: 오른쪽 끝의 빈 곳만 세면, 짧은 목록 옆의 숫자를 오른쪽 끝으로 밀고 남는 너비를 목록 칸에 다 주는 판(9 : 3)이
  // 가장 좋았다. 빈 곳이 오른쪽 끝에서 목록 글과 숫자 사이로 옮겨 갈 뿐이라, 핵심 한 줄 아래 목록 글은 본문의 3분의 1에서 끝나고 숫자는
  // 오른쪽 끝에 붙어 둘 사이가 본문의 절반 가까이 비었다(docs/VISUAL-RULES.md 6: 남는 너비는 양 끝과 칸 사이에 고르게).
  // 같은 띠에 선(위아래가 겹치는) 글 끝이 들쭉날쭉한 부품과 그 오른쪽 칸 사이마다 본다. 면이 있는 부품은 면이 칸 끝까지 그려져 빠진다.
  // 숫자끼리는 같은 너비가 먼저라(같은 말투) 숫자 뒤의 빈 곳은 세지 않는다
  const inkLeft = (b: Block): number => {
    const r = rect(b)
    const img = picture(laid.get(b.id)!, r)
    return img ? r.x + (r.w - img.w) / 2 : r.x
  }
  // 원을 그리지 않는 비율 원(150%, 10건)도 글처럼 제 길이에서 끝난다: 넓은 칸을 주면 숫자와 이름 뒤로 옆 칸까지 빈다
  const ragged = (b: Block) => (RAGGED.has(b.type) || unknownRing(b)) && shownLook(laid.get(b.id)!, isAlone(laid.get(b.id)!)) === 'plain'
  const holes = (n: Tree) => {
    if (n.kind === 'leaf') return
    if (n.dir === 'h')
      for (let i = 1; i < n.kids.length; i++) {
        let worst = 0
        for (const a of leaves(n.kids[i - 1]).filter(ragged))
          for (const b of leaves(n.kids[i])) {
            const ra = laid.get(a.id)!.at!
            const rb = laid.get(b.id)!.at!
            if (ra.y >= rb.y + rb.h || rb.y >= ra.y + ra.h) continue
            const hole = (inkLeft(b) - inkRight(a) - BLOCK_COL_GAP) / AREA_W
            worst = Math.max(worst, hole - (b.type === 'note' ? NOTE_HOLE : HOLE))
          }
        if (worst > 0) cost += worst * 200
      }
    n.kids.forEach(holes)
  }
  holes(t)
  // 소제목이 그 아래 부품 위에 서지 않은 판 (사람이 끌어다 놓은 판을 견줄 때)
  if (!headsOk(t, last)) cost += 100
  // 숫자가 로고 모음 아래에 깔리면 답이 근거 밑으로 간다 (answersFirst)
  for (const lg of all.filter((b) => b.type === 'logos')) if (nums.some((b) => laid.get(b.id)!.at!.y > laid.get(lg.id)!.at!.y)) cost += 20
  // 숫자가 차트 바로 아래 띠를 혼자 차지하면(차트 너비를 다 덮고 그 아래) 답이 근거 밑에 각주처럼 붙는다 (chartAnswersFirst)
  for (const c of all.filter((b) => CHARTS.has(b.type))) {
    const r = laid.get(c.id)!.at!
    for (const b of all.filter(isAnswer)) {
      const a = laid.get(b.id)!.at!
      if (a.y >= r.y + r.h && a.x <= r.x && a.x + a.w >= r.x + r.w) cost += 20
    }
  }
  return cost
}

/**
 * 소제목은 그 아래 부품들의 이름이라 위아래로 쌓은 가지에서 다음 자식(소제목이 아닌) 위에 선다.
 * 마지막에 넣은 소제목(last)은 아래 부품을 아직 넣지 않아 혼자 서도 되지만, 다른 소제목 바로 위에는 서지 않는다
 */
function headsOk(t: Tree, last?: string): boolean {
  const head = (k: Tree | undefined) => !!k && k.kind === 'leaf' && k.block.type === 'heading'
  if (t.kind === 'leaf') return !head(t) || t.block.id === last
  return t.kids.every((k, i) => {
    if (!head(k)) return headsOk(k, last)
    if (head(t.kids[i + 1]) && t.dir === 'v') return false
    return (k as { block: Block }).block.id === last || (t.dir === 'v' && i < t.kids.length - 1)
  })
}

/**
 * 이 부품들(읽는 차례)로 고른 가장 보기 좋은 판과 그 점수. 틀을 견줄 수 없는 장(부품이 많거나, 이음표나 소제목이 있는 장)이면 null.
 * 부품의 차례는 blocks 그대로 돌려준다
 */
export function arrangeBest(blocks: Block[], fit: Fit, areaH: number, aspect: (b: Block) => number | null, seen?: { blocks: Block[]; cost: number }[]): { blocks: Block[]; cost: number } | null {
  if (blocks.length < 2 || blocks.length > ARRANGE_MAX) return null
  // 소제목이 든 장은 소제목 묶음의 규칙(place.ts의 autoPlace: 소제목 아래에, 다음 소제목은 묶음 옆에)이 짠다. 아래 부품을 아직 넣지 않은
  // 소제목은 어디에 둘지 틀로는 알 수 없어서, 견주면 맨 아래에 붙어 다음 부품이 그 아래에 들어가지 못했다
  // 이미지가 든 이미지 부품은 판을 놓은 뒤 이미지에 닿은 선을 이미지 비율에 맞춰(fitImage) 견준다: 화면 캡처와 요점 둘을 위아래로
  // 쌓으면 캡처가 넓고 낮은 띠의 가운데에 작게 서고 요점은 그 위에 찢어져, 캡처를 크게 옆에 두는 판보다 나빴는데 견줄 수 없었다
  if (blocks.some((b) => b.link || b.linkBelow || b.type === 'heading')) return null
  let best: { blocks: Block[]; cost: number } | null = null
  for (const shape of shapes(blocks, null)) {
    for (const t of sized(shape, BOARD_COLS, fit)) {
      let out = layTree(t, fit)
      if (!out) continue
      for (const img of out.filter((b) => aspect(b))) out = fitImage(out, img.id, aspect(img)!, areaH)
      const laid: Laid = new Map(out.map((b) => [b.id, b]))
      const cost = arrangeCost(t, laid, fit, areaH)
      seen?.push({ blocks: blocks.map((b) => laid.get(b.id)!), cost })
      if (!best || cost < best.cost - 1e-9) best = { blocks: blocks.map((b) => laid.get(b.id)!), cost }
    }
  }
  return best
}

/** 지금 판이 이 규칙이 고를 판과 같은지 (사람이 옮기거나 선을 끌지 않았는지). 부품이 하나면 늘 참 */
export function isArranged(blocks: Block[], fit: Fit, areaH: number, aspect: (b: Block) => number | null): boolean {
  if (blocks.length <= 1) return true
  const best = arrangeBest(arrangeOrder(blocks), fit, areaH, aspect)
  if (!best) return false
  const byId = new Map(best.blocks.map((b) => [b.id, b.at!]))
  return blocks.every((b) => !!b.at && !!byId.get(b.id) && sameArea(b.at, byId.get(b.id)!))
}

/** 지금 판의 점수 (나무로 읽을 수 없으면 Infinity). blocks는 넣은 차례(마지막 부품이 막 넣은 것) */
export function boardCost(blocks: Block[], fit: Fit, areaH: number): number {
  const t = treeOf(blocks)
  return t ? arrangeCost(t, new Map(blocks.map((b) => [b.id, b])), fit, areaH, blocks.at(-1)?.id) : Infinity
}

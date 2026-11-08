// 부품 하나를 다루는 도우미: 새 부품, 보이는 항목, 부품을 장처럼 그리기, 비어 있는 칸, 항목 더하기, 복사

import { withOneMore } from '../edits'
import { emptyItem, uid, withDefaultOptions } from '../generate'
import type { Block, BlockEffect, BlockFrom, BlockSpeed, BlockType, BlockWhen, Item, Slide } from '../types'
import { byReading } from './board'
import { BLOCK_EFFECT_IDS, BLOCK_FROM_IDS, BLOCK_SPEED_IDS, BLOCK_WHEN_IDS, BLOCKS, EFFECT_FROM } from './catalog'

export const effectOf = (b: Pick<Block, 'effect'>): BlockEffect => (b.effect && BLOCK_EFFECT_IDS.includes(b.effect) ? b.effect : 'auto')
export const whenOf = (b: Pick<Block, 'when'>): BlockWhen => (b.when && BLOCK_WHEN_IDS.includes(b.when) ? b.when : 'after')
export const speedOf = (b: Pick<Block, 'speed'>): BlockSpeed => (b.speed && BLOCK_SPEED_IDS.includes(b.speed) ? b.speed : 'normal')
/** 들어오는 쪽. 쪽을 고를 수 없는 움직임이면 null */
export function fromOf(b: Pick<Block, 'effect' | 'from'>): BlockFrom | null {
  const base = EFFECT_FROM[effectOf(b)]
  if (!base) return null
  return b.from && BLOCK_FROM_IDS.includes(b.from) ? b.from : base
}

/**
 * 부품 장에서 발표할 때 부품이 나오는 차례. 장에 정한 차례(options.order)에 있는 부품이 먼저, 나머지는 읽는 차례로.
 * 없는 부품의 id는 건너뛴다(지운 부품이 남아 있어도 된다)
 */
export function playOrder(slide: Pick<Slide, 'blocks' | 'options'>): Block[] {
  const all = allBlocks(slide.blocks ?? [])
  const byId = new Map(all.map((b) => [b.id, b]))
  const first = [...new Set(slide.options.order ?? [])].map((id) => byId.get(id)).filter((b): b is Block => !!b)
  return [...first, ...all.filter((b) => !first.includes(b))]
}

export function makeBlock(type: BlockType): Block {
  const spec = BLOCKS[type]
  const count = spec.items?.default ?? 0
  // 레이아웃 부품은 그 레이아웃의 장을 새로 만들 때와 같은 기본값 (안 비교는 가운데 안을 추천으로)
  const highlight = spec.layout ? withDefaultOptions(spec.layout, {}, count).highlight : undefined
  return { id: uid(), type, fields: {}, items: Array.from({ length: count }, emptyItem), ...(highlight !== undefined ? { highlight } : {}) }
}

/** 장의 모든 부품, 읽는 차례대로 (위에서 아래로, 같은 높이면 왼쪽부터) */
export const allBlocks = (blocks: readonly Block[]): Block[] => byReading([...blocks])

/** 부품 하나를 바꾼 판. 자리는 그대로 (커진 부품에 자리를 주는 것은 sizing.ts의 changeBlocks) */
export function mapBlock(blocks: Block[], blockId: string, fn: (b: Block) => Block): Block[] {
  return blocks.some((b) => b.id === blockId) ? blocks.map((b) => (b.id === blockId ? fn(b) : b)) : blocks
}

/** 부품 장의 부품이 보이는 항목. 최대 개수를 넘는 항목은 지우지 않고 숨긴다 */
export function blockItems(block: Block): Item[] {
  return block.items.slice(0, BLOCKS[block.type].items?.max ?? 0)
}

/** 부품의 칸 안내. 부품 장만의 부품은 부품마다 정한 안내를 깔고, 사람이나 AI가 고친 안내를 덮는다 */
function nativeHints(block: Block): Record<string, string> {
  const spec = BLOCKS[block.type]
  const out: Record<string, string> = {}
  for (const f of spec.fields) out[f.key] = f.hint
  for (const f of spec.items?.fields ?? []) {
    out[`items.${f.key}`] = f.hint
    // 자리마다 다른 안내 (개요의 기간, 예산...). 사람이 그 칸의 안내를 고쳤으면 고친 것을 쓴다
    if (!block.hints?.[`items.${f.key}`]) f.hints?.forEach((h, i) => (out[`items.${i}.${f.key}`] = h))
  }
  return { ...out, ...block.hints }
}

/**
 * 부품 하나를 장처럼 보이게 한 것. 슬라이드의 칸 그리기(T, IT, 그림 칸)와 레이아웃 그리기를 그대로 쓰려고
 * 부품의 칸과 항목을 장의 칸과 항목 자리에 놓는다. 레이아웃 부품은 그 레이아웃의 장이 된다.
 */
export function blockSlide(outer: Slide, block: Block): Slide {
  const layout = BLOCKS[block.type].layout
  return {
    ...outer,
    layout: layout ?? 'compose',
    fields: block.fields,
    items: block.items,
    hints: layout ? (block.hints ?? {}) : nativeHints(block),
    variant: block.variant,
    options: { ...outer.options, highlight: block.highlight },
    blocks: undefined,
  }
}

export function variantOfBlock(block: Block): string {
  const variants = BLOCKS[block.type].variants
  if (!variants?.length) return 'base'
  return variants.some((v) => v.id === block.variant) ? block.variant! : variants[0].id
}

/**
 * 부품에서 비어 있으면 편집할 때도 접어 두는 칸: 채우지 않아도 되는 칸. 항목 칸은 키가 'items.키'.
 * 부품은 발표할 때의 높이에 맞춰 놓으므로, 편집할 때 빈 안내를 다 펼치면 이웃 부품을 덮는다.
 * 고른 부품의 '칸 더하기'로 연다. 발표 전체의 값($소속 같은)은 부품 밖에서 적으므로 뺀다
 */
export function foldableFields(type: BlockType): { key: string; label: string; item: boolean; use: string }[] {
  const spec = BLOCKS[type]
  const use = (key: string) => FOLD_USES[type]?.[key] ?? FOLD_USE_BY_KEY[key] ?? ''
  return [
    ...spec.fields
      .filter((f) => f.optional && !f.named && !f.shown && !f.image && !f.key.startsWith('$'))
      .map((f) => ({ key: f.key, label: f.label, item: false, use: use(f.key) })),
    ...(spec.items?.fields ?? []).filter((f) => f.optional && !f.shown && !f.image).map((f) => ({ key: `items.${f.key}`, label: f.label, item: true, use: use(`items.${f.key}`) })),
  ]
}

/**
 * '칸 더하기' 메뉴에서 접어 둔 칸마다 무엇에 쓰는 칸인지 한 줄. 칸 이름('덧붙임', '단위')만으로는 꺼내면 어디에 무엇이 생기는지 알 수 없다.
 * 항목마다 생기는 칸은 무엇마다인지 앞에 적는다. 적는 값에 따라 모양이 바뀌는 칸(몇 중 몇의 단위)은 그것도 적는다.
 * 같은 이름이 여러 부품에서 같은 일을 하면 FOLD_USE_BY_KEY 하나로 (테스트가 모든 접는 칸에 있는지 본다)
 */
const FOLD_USE_BY_KEY: Record<string, string> = {
  heading: '맨 위에 굵게 적는 한 줄',
  unit: '숫자 뒤에 붙는 단위 (예: 억 원, 건)',
  note: '숫자 아래 짧은 설명',
}

const FOLD_USES: Partial<Record<BlockType, Record<string, string>>> = {
  message: { sub: '핵심 문장 아래 작은 글 한 줄' },
  text: { label: '소제목 위의 작은 이름표 (예: 대상)', heading: '글 위에 굵게 적는 요점 한 줄' },
  bullets: { 'items.body': '줄마다 요점 아래 덧붙이는 설명' },
  callout: { label: '강조할 내용 위의 이름표 (예: 주의할 점)' },
  delta: { note: '전과 후를 잰 기준이나 기간' },
  goal: { unit: '지금과 목표 뒤에 붙는 단위', note: '막대 아래 짧은 설명' },
  ratio: { unit: '센 것의 단위. ‘명’이나 ‘분’이면 점이 사람 모양이 돼요' },
  spark: { note: '숫자 아래 기간이나 기준' },
  checks: { 'items.meta': '할 일마다 누가, 언제까지' },
  gantt: { now: '지금인 기간을 띠로 짚어요 (예: 12월)', 'items.meta': '할 일마다 맡은 팀이나 사람' },
  people: { 'items.body': '사람마다 맡은 일 한 줄' },
  image: { caption: '그림 아래 한 줄 설명' },
  rating: { pick: '추천하는 안을 강조색으로 짚어요 (예: B안)', 'items.meta': '기준마다 한 줄 설명' },
  market: { 'items.body': '원마다 어떤 시장인지 한 줄' },
  diverge: { basis: '무엇과 견준 증감인지 (예: 작년 대비)' },
  likert: { scale: '답의 단계 이름을 바꿔요 (예: 매우 불만, 불만, 보통, 만족, 매우 만족). 비우면 단계 수에 맞는 이름', basis: '응답 수나 조사한 때 (예: 응답 140명, 10월)' },
  whys: { 'items.meta': '원인마다 그 아래에 적는 확인한 사실 (예: 12개 부서 중 9곳)' },
  cycle: { center: '고리 가운데에 적는 이 순환의 이름 (예: 한 달 주기)', 'items.meta': '단계마다 이름 아래에 적는 짧은 설명 (예: 목표와 방법을 정해요)' },
  sparks: { period: '흐름을 본 기간 (예: 4월~9월)', 'items.meta': '지표마다 지금 값 뒤에 붙는 단위' },
  gather: { note: '이름 옆 짧은 한 줄 (예: 흩어진 것을 한 곳에)', 'items.meta': '모인 것마다 어디에 있던 것인지 (예: 메일함)' },
  search: { result: '수 아래 결과 한 줄 (예: 그래도 없으면 사람에게 물어요)', 'items.meta': '곳마다 찾기 어려운 이유 (예: 대화에 묻힘)' },
  layers: { 'items.meta': '층마다 그 층에 있는 것 (예: 사내 포털, 메신저)' },
  gate: { dropped: '거르는 관문 아래 걸러지는 것 (예: 빠진 서류는 돌려보냄)', 'items.meta': '관문마다 하는 일 (예: 누가 냈는지)' },
  hub: { note: '가운데 아래에 짧은 한 줄 (예: 한 곳에서 찾아요)', 'items.meta': '곳마다 무엇이 오가는지 (예: 주문과 결제)' },
  flow: { what: '무엇이 오가는지 맨 위에 한 줄 (예: 신청 데이터)', 'items.meta': '단계마다 어느 시스템, 누가 맡는지', 'items.value': '단계마다 오가는 양 (예: 320건)' },
  decision: { label: '질문 위에 확인할 기준을 짧게 적어요' },
  network: { 'items.meta': '이어진 것마다 무엇을 주고받는지 (예: 결재선)' },
  split: { total: '합계를 직접 적어요 (비우면 조각을 더한 값이 보여요)', unit: '값 뒤에 붙는 단위 (예: 억 원)' },
  merge: { total: '합계를 직접 적어요 (비우면 값을 더한 값이 보여요)', unit: '값 뒤에 붙는 단위 (예: 억 원)' },
  calc: { note: '결과 아래 셈의 기준 (예: 시급은 평균 인건비)', 'items.meta': '값 앞의 셈 기호. 비우면 곱하기(×), 더하기는 +, 빼기는 -, 나누기는 /' },
  tiles: { of: '전체가 100이 아닐 때 (예: 60명). 100까지면 칸 하나가 하나예요', note: '숫자 아래 짧은 설명 (예: 남은 사람은 11월까지 마쳐요)' },
  heading: { note: '소제목 옆(좁으면 아래)에 작게 덧붙이는 한 줄' },
  stat: { change: '숫자 옆에 얼마나 달라졌는지 (예: 12% 늘었어요)', note: '숫자 아래 기준이나 기간' },
  meter: {
    of: '숫자가 %가 아닐 때 막대 끝의 값 (예: 5억 원)',
    target: '막대 위에 눈금으로 긋는 목표나 기준',
    targetName: '눈금 아래 이름을 목표 말고 다른 말로 (예: 작년, 기준)',
  },
  note: { kind: '주석 앞에 굵게 거는 이름 (예: 출처, 기준, 주의)' },
  date: { note: '날짜와 하는 일 아래 보충 설명 (예: 남은 기간 2주)' },
  steps: { label: '점 줄 위에 무엇의 단계인지 (예: 새 근태 시스템 도입)' },
  status: { meta: '할 일 아래 언제까지, 누가 (예: 11월 둘째 주 · 인사팀)' },
  range: { mark: '띠 위에 고리로 찍는 지금 값', markName: '고리 아래 값 앞의 이름 (예: 지금, 지난주 최고)', note: '그림 아래 기준이나 출처' },
  kpi: { 'items.body': '숫자마다 아래 짧은 설명' },
  scorecard: { 'items.body': '지표마다 짧은 설명이나 원인' },
  bars: { 'items.meta': '막대마다 짧은 설명' },
  bridge: { 'items.meta': '요인마다 짧은 설명' },
  trend: { target: '이 값에 목표 가로선을 그어요' },
  share: { 'items.meta': '항목마다 짧은 설명' },
  funnel: { 'items.meta': '단계마다 짧은 설명' },
  progress: { 'items.meta': '과제마다 누가, 언제까지', 'items.body': '과제마다 완료, 진행 중, 지연, 예정' },
  process: { 'items.meta': '단계마다 누가, 얼마나 걸리는지', 'items.body': '단계마다 하는 일 한 줄' },
  timeline: { 'items.body': '단계마다 하는 일 한 줄' },
  position: { 'items.body': '점마다 짧은 설명' },
  pricing: { 'items.meta': '안마다 기간, 인력 같은 조건' },
  table: {
    h2: '표 맨 위, 둘째 칸의 이름 (예: 담당)',
    h3: '표 맨 위, 셋째 칸의 이름 (예: 기한)',
    h4: '표 맨 위, 넷째 칸의 이름 (예: 비고)',
    'items.meta': '줄마다 둘째 칸에 적는 내용',
    'items.value': '줄마다 셋째 칸에 적는 내용',
    'items.body': '줄마다 넷째 칸에 적는 내용',
  },
  logos: { 'items.title': '로고마다 회사 이름' },
}

/** 칸에 붙이는 data-field 앞머리. 같은 장의 다른 부품과 칸 이름이 겹치지 않게 */
export const blockFieldPrefix = (blockId: string) => `b.${blockId}.`

export interface BlockMissing {
  block: string
  key: string
  item?: number
  label: string
}

/** 이 부품에서 비어 있는 꼭 채울 칸. name은 같은 장에 같은 부품이 둘 이상일 때 자리를 붙인 이름 (blockNames) */
export function blockMissing(block: Block, name = BLOCKS[block.type].name): BlockMissing[] {
  const spec = BLOCKS[block.type]
  const out: BlockMissing[] = []
  for (const f of spec.fields) {
    if (f.optional || f.key.startsWith('$')) continue
    if (!(block.fields[f.key] ?? '').trim()) out.push({ block: block.id, key: f.key, label: `${name}의 ${f.label}` })
  }
  if (spec.items) {
    // '예상 질문 질문 1'처럼 부품 이름이 항목 이름으로 끝나면 항목 이름은 한 번만
    const label = spec.items.label
    const itemName = (i: number) => (name.endsWith(label) ? `${name} ${i + 1}` : `${name} ${label} ${i + 1}`)
    blockItems(block).forEach((item, i) => {
      for (const f of spec.items!.fields) {
        if (f.optional) continue
        if (!item[f.key].trim()) out.push({ block: block.id, key: f.key, item: i, label: `${itemName(i)}의 ${f.label}` })
      }
    })
  }
  return out
}

/** 항목을 하나 더한 부품. 보이는 항목 수(max) 뒤에 숨은 항목이 있으면 그 앞에 넣는다 */
export function withItem(b: Block): Block {
  const items = withOneMore(b.items, BLOCKS[b.type].items?.max ?? 0)
  return items === b.items ? b : { ...b, items }
}

/** 같은 내용의 부품 (새 id). 그 부품 하나만: 자리와 이음표는 따라가지 않는다 (놓을 자리에서 다시 정한다) */
export function copyBlock(b: Block): Block {
  const { at: _, link: __, linkBelow: ___, ...rest } = b
  return { ...rest, id: uid(), fields: { ...b.fields }, items: b.items.map((it) => ({ ...it, id: uid() })), hints: b.hints && { ...b.hints } }
}

/** 같은 내용의 판: 자리와 이음표까지, 모두 새 id (장을 복사할 때) */
export const copyBlocks = (blocks: Block[]): Block[] =>
  blocks.map((b) => ({ ...copyBlock(b), ...(b.at ? { at: { ...b.at } } : {}), ...(b.link ? { link: b.link } : {}), ...(b.linkBelow ? { linkBelow: b.linkBelow } : {}) }))

// 부품 목록: 부품마다의 정의(BLOCKS), 부품 고르기의 묶음, 면과 움직임의 이름. 레이아웃 부품은 레이아웃 정의에서 만든다

import { type FieldSpec, LAYOUTS, type LayoutSpec, type VariantSpec } from '../layouts'
import type { BlockEffect, BlockFrom, BlockLook, BlockSpeed, BlockType, BlockWhen, Item, LayoutBlockType, NativeBlockType, BlockReveal } from '../types'
import { NATIVE } from './native'

export interface BlockSpec {
  type: BlockType
  name: string
  description: string
  /** 발표할 때 저절로 움직이는 모습. 부품 고르기 카드에 보인다 */
  motion: string
  /** 레이아웃 부품이면 그 레이아웃. 칸, 안내, 그리기, 움직임을 그 레이아웃 것 그대로 쓴다 */
  layout?: LayoutBlockType
  fields: FieldSpec[]
  items?: LayoutSpec['items']
  variants?: VariantSpec[]
  highlight?: LayoutSpec['highlight']
  /** 칸 너비(12 기준). 이보다 좁은 칸에는 넣지 않는다. 12면 한 줄을 혼자 쓴다(표, 일정처럼 넓게 짜인 부품은 옆에 무엇을 두면 둘 다 좁아진다) */
  minSpan: number
  /** 이만큼은 되어야 보기 좋은 너비. 알아서 놓을 때와 비율을 고를 때 쓴다 */
  prefSpan: number
  look?: BlockLook
  /**
   * 작은 부품(소제목, 숫자 한 줄, 주석 같은): 칸 안에 다른 부품과 쌓고, 넷까지 한 줄에 나란히 놓는다.
   * 한 장에 큰 부품을 넣는 수(MAX_LARGE)에 세지 않는다
   */
  small?: boolean
  /** 부품 고르기 그림과 장 모음 예시에 쓰는 지어낸 내용. variant는 예시가 가장 잘 보이는 모양(없으면 첫째). 레이아웃 부품은 장 모음의 예시 장에서 가져온다 */
  sample?: { fields: Record<string, string>; items?: Partial<Item>[]; variant?: string }
}

/** 장의 머리(제목, 부제, 출처). 레이아웃 부품에서는 빼고, 부품 장의 머리로 쓴다 */
export const HEAD_KEYS = ['title', 'lead', 'source']

/** 레이아웃 부품의 칸 크기와 움직임. 칸은 그 레이아웃의 것에서 머리(제목, 부제, 출처)만 뺀다 */
const FROM_LAYOUT: Record<LayoutBlockType, { minSpan: number; prefSpan: number; motion: string; look?: BlockLook }> = {
  summary: { minSpan: 12, prefSpan: 12, motion: '줄마다 차례로 들어와요' },
  points: { minSpan: 8, prefSpan: 12, motion: '하나씩 차례로 올라와요' },
  kpi: { minSpan: 6, prefSpan: 12, motion: '숫자가 자리마다 굴러가 맞춰져요' },
  scorecard: { minSpan: 12, prefSpan: 12, motion: '실적 막대가 목표까지 자라요' },
  bars: { minSpan: 6, prefSpan: 8, motion: '막대가 차례로 자라요' },
  versus: { minSpan: 6, prefSpan: 8, motion: '두 막대가 나란히 자라고, 선은 차례로 그려져요' },
  bridge: { minSpan: 12, prefSpan: 12, motion: '막대가 하나씩 쌓여요' },
  trend: { minSpan: 6, prefSpan: 8, motion: '바닥선을 긋고 선이 그려지며, 선이 닿는 차례로 점과 이름이 나와요' },
  share: { minSpan: 6, prefSpan: 8, motion: '조각이 차례로 채워져요' },
  funnel: { minSpan: 6, prefSpan: 8, motion: '단계마다 줄어들며 내려와요' },
  progress: { minSpan: 12, prefSpan: 12, motion: '진행 막대가 차올라요' },
  process: { minSpan: 12, prefSpan: 12, motion: '점이 맺히고 다음 단계로 선이 이어져요' },
  timeline: { minSpan: 12, prefSpan: 12, motion: '선을 따라 차례로 나타나요' },
  compare: { minSpan: 12, prefSpan: 12, motion: '두 면이 차례로 들어와요' },
  matrix: { minSpan: 6, prefSpan: 8, motion: '네 칸이 차례로 나타나요' },
  position: { minSpan: 12, prefSpan: 12, motion: '점이 하나씩 제자리에 내려앉아요' },
  pricing: { minSpan: 12, prefSpan: 12, motion: '안마다 차례로 올라와요' },
  table: { minSpan: 12, prefSpan: 12, motion: '줄마다 차례로 들어와요' },
  logos: { minSpan: 6, prefSpan: 12, motion: '로고가 차례로 나타나요' },
  agenda: { minSpan: 6, prefSpan: 8, motion: '항목이 차례로 들어와요' },
}

export const LAYOUT_BLOCKS = Object.keys(FROM_LAYOUT) as LayoutBlockType[]

// in이 아니라 hasOwn: in은 'constructor' 같은 Object의 이름도 받아서, 파일에서 읽은 부품 종류가 그런 이름이면 레이아웃 부품으로 보았다
export const isLayoutBlock = (type: string): type is LayoutBlockType => Object.hasOwn(FROM_LAYOUT, type)

function layoutBlockSpec(type: LayoutBlockType): BlockSpec {
  const l = LAYOUTS[type]
  return {
    type,
    name: l.name,
    description: l.description,
    layout: type,
    fields: l.fields.filter((f) => !HEAD_KEYS.includes(f.key)),
    items: l.items,
    variants: l.variants,
    highlight: l.highlight,
    ...FROM_LAYOUT[type],
  }
}

export const BLOCKS: Record<BlockType, BlockSpec> = {
  ...(Object.fromEntries(Object.entries(NATIVE).map(([type, spec]) => [type, { type, ...spec }])) as Record<NativeBlockType, BlockSpec>),
  ...(Object.fromEntries(LAYOUT_BLOCKS.map((t) => [t, layoutBlockSpec(t)])) as Record<LayoutBlockType, BlockSpec>),
}

export const BLOCK_TYPES = Object.keys(BLOCKS) as BlockType[]

/** 부품 고르기의 묶음. 모든 부품이 꼭 한 번씩 (테스트가 확인). short는 묶음 단추(한 줄에 다 들어가게 짧게), description은 묶음 제목 밑의 한 줄 */
export const BLOCK_GROUPS: { name: string; short: string; description: string; types: BlockType[] }[] = [
  { name: '글과 메시지', short: '글', description: '결론 한 줄, 설명, 목록, 인용, 예상 질문', types: ['message', 'text', 'bullets', 'quote', 'callout', 'faq', 'summary', 'points'] },
  // 좁은 칸, 낮은 줄에 여럿 쌓거나 나란히 두는 작은 것들. 넓은 칸에서는 늘이지 않고 한 줄로 눕힌다
  { name: '작은 컴포넌트', short: '작게', description: '소제목, 숫자 한 줄, 막대 하나, 범위, 상태, 단계 표시, 날짜, 주석', types: ['heading', 'stat', 'meter', 'range', 'status', 'steps', 'date', 'note'] },
  { name: '숫자', short: '숫자', description: '큰 숫자, 전과 후, 목표 대비, 비율, 계산식', types: ['number', 'delta', 'goal', 'ring', 'ratio', 'spark', 'calc', 'kpi', 'scorecard'] },
  {
    name: '차트',
    short: '차트',
    description: '막대, 두 값 비교, 추이, 지표 흐름, 비중, 증감, 설문 결과, 달성, 원인 순위, 색 표, 깔때기, 시장 규모',
    types: ['bars', 'versus', 'attain', 'stack', 'trend', 'sparks', 'share', 'bridge', 'diverge', 'likert', 'pareto', 'heat', 'funnel', 'market'],
  },
  { name: '흐름과 일정', short: '일정', description: '할 일, 일정표, 단계, 진행률, 순서', types: ['checks', 'gantt', 'process', 'timeline', 'progress', 'agenda'] },
  // 발표할 때의 움직임이 내용을 말하는 컴포넌트: 데이터가 건너가고, 갈라지고, 모이고, 조립된다. 다 보인 모습도 그 자체로 읽히는 그림이다
  { name: '움직이는 컴포넌트', short: '움직이는', description: '모이고 퍼지기, 흐름, 조건별 흐름, 원인 캐기, 순환, 연결도, 나누기, 모으기, 칸 조립, 대화, 바뀌기, 흩어진 것 모으기, 여기저기 찾기, 층, 관문, 겹친 수고, 같은 대상, 다른 이름', types: ['hub', 'flow', 'decision', 'whys', 'cycle', 'network', 'split', 'merge', 'tiles', 'chat', 'wipe', 'gather', 'search', 'layers', 'gate', 'dupes', 'aliases'] },
  { name: '비교와 표', short: '비교', description: '표, 두 안 비교, 평가표, 우선순위, 위치, 가격안', types: ['facts', 'risks', 'swot', 'compare', 'rating', 'matrix', 'position', 'pricing', 'table'] },
  { name: '이미지와 사람', short: '이미지', description: '화면 캡처, 사진, 담당자, 로고', types: ['image', 'people', 'logos'] },
]

export const BLOCK_LOOKS: { id: BlockLook; name: string }[] = [
  { id: 'plain', name: '바탕 없음' },
  // 예전 '옅은 면'. 지면의 말투(괘선)로 바꾸며 칠하지 않고 위 머리 괘선과 아래 줄 선으로 묶는다(docs/DESIGN.md)
  { id: 'card', name: '들여 쓰기' },
  { id: 'bold', name: '강조' },
]

export const BLOCK_EFFECTS: { id: BlockEffect; name: string; description: string }[] = [
  { id: 'auto', name: '기본', description: '컴포넌트에 맞게: 숫자는 올라가고, 막대는 자라고, 선은 그려져요' },
  { id: 'rise', name: '올라오기', description: '아래에서 살짝 올라와요' },
  { id: 'fade', name: '나타나기', description: '제자리에서 천천히 보여요' },
  { id: 'wipe', name: '펼치기', description: '왼쪽에서 오른쪽으로 걷히듯' },
  { id: 'slide', name: '밀려오기', description: '오른쪽에서 밀려 들어와요' },
  { id: 'pop', name: '튀어나오기', description: '조금 작게 시작해 제 크기로 자리 잡아요' },
  { id: 'zoom', name: '다가오기', description: '조금 크게 시작해 제자리로 다가와요' },
  { id: 'flip', name: '세우기', description: '살짝 기울어 있다가 바로 서요' },
  { id: 'blur', name: '초점 맞추기', description: '흐릿했다가 또렷해져요' },
  { id: 'letters', name: '한 글자씩', description: '글이 읽는 차례로 한 글자씩 차분히 내려앉아요. 핵심 한 줄이나 인용에 어울려요' },
  { id: 'none', name: '없음', description: '처음부터 보여요' },
]

/** 언제 나오는지. 이름과 설명은 움직임 탭과 AI 카탈로그에 함께 쓴다 */
export const BLOCK_WHENS: { id: BlockWhen; name: string; description: string }[] = [
  { id: 'after', name: '이어서', description: '앞 컴포넌트가 나온 뒤에 이어서 나와요' },
  { id: 'with', name: '함께', description: '앞 컴포넌트와 같은 때에 나와요' },
  { id: 'click', name: '누르면', description: '발표할 때 다음 키를 누르면 나와요. 하나씩 짚어 가며 말할 때 좋아요' },
]

/** 부품 안의 항목이 나오는 때. 항목이 있는 부품만 고른다 */
export const BLOCK_REVEALS: { id: BlockReveal; name: string; description: string }[] = [
  { id: 'all', name: '한꺼번에', description: '항목이 짜 둔 차례대로 이어서 나와요' },
  { id: 'each', name: '하나씩', description: '발표할 때 누를 때마다 다음 항목이 나와요. 단계를 짚어 가며 설명할 때 좋아요' },
]

export const BLOCK_SPEEDS: { id: BlockSpeed; name: string; description: string }[] = [
  { id: 'fast', name: '빠르게', description: '짧게 움직여요' },
  { id: 'normal', name: '보통', description: '모션 세기에 맞춘 빠르기예요' },
  { id: 'slow', name: '천천히', description: '길게 움직여 눈길을 끌어요' },
]

export const BLOCK_FROMS: { id: BlockFrom; name: string }[] = [
  { id: 'below', name: '아래에서' },
  { id: 'above', name: '위에서' },
  { id: 'left', name: '왼쪽에서' },
  { id: 'right', name: '오른쪽에서' },
]

/** 들어오는 쪽을 고를 수 있는 움직임과 그 기본 쪽 */
export const EFFECT_FROM: Partial<Record<BlockEffect, BlockFrom>> = { rise: 'below', slide: 'right', wipe: 'left' }

export const BLOCK_LOOK_IDS = BLOCK_LOOKS.map((l) => l.id)
export const BLOCK_EFFECT_IDS = BLOCK_EFFECTS.map((e) => e.id)
export const BLOCK_WHEN_IDS = BLOCK_WHENS.map((w) => w.id)
export const BLOCK_SPEED_IDS = BLOCK_SPEEDS.map((w) => w.id)
export const BLOCK_REVEAL_IDS = BLOCK_REVEALS.map((w) => w.id)
export const BLOCK_FROM_IDS = BLOCK_FROMS.map((w) => w.id)

// 두 컴포넌트가 어떻게 이어지는지를 칸 사이에 끼우는 표시. 칸을 차지하지 않고 칸 사이에 서서,
// 칸 너비 비율, 한 줄의 칸 수, 잘리지 않는 높이 같은 자리 규칙을 그대로 둔다.
// 이음표가 선 칸 사이는 양쪽 칸이 LINK_PAD만큼 비켜 이음표가 혼자 서는 자리를 낸다. 칸의 가장자리에 걸치면 깨져 보인다

// 컴포넌트 찾기와 추천. AI를 부르지 않고 카탈로그의 낱말, 발표 종류, 현재 장의 역할과 글로 정한다.
// 예순 개 넘는 카드를 묶음 칩으로만 고르면, 무엇을 보여 주고 싶은지는 알아도 그것이 어느 묶음에 있는지 몰라 끝까지 굴려 봐야 했다

import { CINE_PRESETS } from '../cine'
import type { BlockType, CinePresetId, DeckType, Slide } from '../types'
import { BLOCK_GROUPS, BLOCKS } from './catalog'

/**
 * 찾는 말을 넓히는 비슷한 말. 사람은 '순서'라고 찾는데 카드는 '단계', '흐름'이라고 적혀 있을 때가 많다.
 * 왼쪽 말이 찾는 말에 들어 있으면 오른쪽 말 가운데 하나만 맞아도 찾은 것으로 본다
 */
const ALIKE: [RegExp, string[]][] = [
  [/순서|차례|절차|과정/, ['순서', '차례', '단계', '절차']],
  [/비교|대비|vs|차이/i, ['비교', '대비', '전과 후', '두 값', '두 안', '차이']],
  [/숫자|수치|지표/, ['숫자', '지표', '수치']],
  [/%|퍼센트|비율/, ['비율', '%']],
  [/일정|계획|로드맵|기간/, ['일정', '계획', '단계', '진행', '날짜']],
  [/그래프|차트|도표/, ['차트', '막대', '추이', '비중']],
  [/변화|추이|증감|늘|줄/, ['추이', '증감', '전과 후', '바뀌', '흐름']],
  [/사람|담당|팀|조직/, ['사람', '담당자', '대화']],
  [/사진|그림|화면|캡처|이미지/, ['이미지', '사진', '화면 캡처', '로고']],
  [/결론|핵심|메시지|요약/, ['결론', '핵심', '메시지', '요약', '강조']],
  [/표|목록|리스트/, ['표', '목록', '평가표']],
]

/**
 * 카드 하나를 찾을 때 보는 글: 이름, 설명, 묶음. 움직임 설명('줄마다 차례로 들어와요')은 보지 않는다: '순서'로 찾으면 차례로
 * 움직이는 카드가 모두 걸려 마흔 개 넘게 나왔다
 */
const INDEX = BLOCK_GROUPS.flatMap((g) =>
  g.types.map((t) => ({ type: t, name: BLOCKS[t].name.toLowerCase(), text: BLOCKS[t].description.toLowerCase(), group: `${g.name} ${g.short}`.toLowerCase() })),
)

/**
 * 찾는 말에 맞는 컴포넌트. 띄어 쓴 말은 모두 맞아야 한다. 비슷한 말(ALIKE)도 맞는 것으로 본다.
 * 이름에 맞은 것, 설명에 맞은 것, 묶음에만 맞은 것 차례로 (같으면 묶음 차례)
 */
const alike = (w: string) => [w, ...ALIKE.filter(([test]) => test.test(w)).flatMap(([, list]) => list.map((a) => a.toLowerCase()))]

export function findBlocks(query: string): BlockType[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return []
  const scored = INDEX.map((c) => {
    let score = 0
    for (const w of words) {
      const forms = alike(w)
      const hit = (text: string) => forms.some((a) => text.includes(a))
      // 찾는 말 그대로 이름에 있으면 가장 먼저
      const s = c.name.includes(w) ? 4 : hit(c.name) ? 3 : hit(c.text) ? 2 : hit(c.group) ? 1 : 0
      if (!s) return { type: c.type, score: 0 }
      score += s
    }
    return { type: c.type, score }
  })
  return scored
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((c) => c.type)
}

/** 모션 그래픽 틀을 찾을 때 보는 글: 묶음의 이름과 비슷한 말, 틀의 이름, 움직임, 어울리는 장 */
const CINE_INDEX = CINE_PRESETS.map((p) => ({ id: p.id, text: `모션 그래픽 영화 장면 타이틀 애니메이션 ${p.name} ${p.description} ${p.fits}`.toLowerCase() }))

/** 찾는 말에 맞는 모션 그래픽 틀. 띄어 쓴 말은 모두 맞아야 한다(비슷한 말도). 틀의 차례대로 */
export function findCines(query: string): CinePresetId[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return []
  return CINE_INDEX.filter((c) => words.every((w) => alike(w).some((a) => c.text.includes(a)))).map((c) => c.id)
}

/** 장에 적힌 글의 낱말과 어울리는 모션 그래픽 틀. 앞의 것이 먼저 (DESIGN.md '모션 그래픽'의 틀마다 어울리는 장) */
const CINE_WORDS: [RegExp, CinePresetId][] = [
  [/고른|골랐|선택|추천|대안|[A-D]안|안 가운데|집중/, 'fork'],
  [/누적|모은|모아 온|쌓|합계|모두 합/, 'fill'],
  [/에서\s*\S+\s*(으)?로|→|전후|바뀌|바꾼|줄었|줄어|줄인|늘었|단축|개선/, 'stroke'],
  [/확산|퍼지|퍼졌|퍼져|가입|사용자|도입|성장|늘어/, 'diffuse'],
  [/결론|하나로|통합|한곳|모으|모았/, 'gather'],
  [/출시|새로운|새 이름|소개|시작|런칭|오픈/, 'light'],
]

/** 글이 없어도 짜임으로 어울리는 틀: 고르는 장은 갈림길, 바뀐 값은 그어지는 선, 큰 숫자는 확산, 한 문장은 모여 맺힘 */
const CINE_SHAPES: [ReadonlySet<string>, CinePresetId][] = [
  [new Set(['versus', 'compare', 'decision', 'pricing']), 'fork'],
  [new Set(['delta', 'wipe', 'rank']), 'stroke'],
  [new Set(['number', 'stat', 'kpi', 'ring', 'goal', 'attain']), 'diffuse'],
  [new Set(['statement', 'message', 'callout']), 'gather'],
]

/**
 * 이 장에 어울리는 모션 그래픽 틀 하나(없으면 null). 장의 글(제목, 칸, 항목, 컴포넌트의 글)에 있는 낱말이 먼저이고, 맞는 낱말이
 * 없으면 레이아웃과 컴포넌트의 짜임으로 본다. 대표 기능인 모션 그래픽이 '내 컴포넌트' 안에만 있어 찾지 못했다(처음 쓰는 사람 검수)
 */
export function suggestCine(slide: Slide): CinePresetId | null {
  const blocks = slide.blocks ?? []
  if (blocks.some((b) => b.type === 'cine')) return null
  const text = [
    ...Object.values(slide.fields ?? {}),
    ...(slide.items ?? []).flatMap((i) => [i.title, i.body, i.value]),
    ...blocks.flatMap((b) => [...Object.values(b.fields ?? {}), ...(b.items ?? []).flatMap((i) => [i.title, i.body, i.value])]),
  ].join(' ')
  const word = CINE_WORDS.find(([test]) => test.test(text))
  if (word) return word[1]
  const kinds = new Set<string>([slide.layout, ...blocks.map((b) => b.type)])
  return CINE_SHAPES.find(([set]) => [...kinds].some((k) => set.has(k)))?.[1] ?? null
}

/** 장에 적힌 글의 낱말과 어울리는 컴포넌트. 앞에 둔 것일수록 먼저. 셋째 값은 무게(없으면 1): 숫자는 어느 글에나 흔해서 가볍게 */
const RULES: [RegExp, BlockType[], number?][] = [
  [/할 일|일정|계획|로드맵|분기|마일스톤|언제까지|착수|오픈/, ['gantt', 'timeline', 'checks']],
  [/진행|현황|완료|상태/, ['progress', 'status', 'checks']],
  [/숫자|수치|지표|실적/, ['sparks', 'kpi', 'bars']],
  [/단계|절차|과정|프로세스|흐름|순서/, ['process', 'flow', 'steps']],
  [/비교|대비|차이|전후|바뀌|vs\b|A안|B안/i, ['compare', 'versus', 'delta']],
  [/원인|이유|왜/, ['whys', 'pareto']],
  [/위험|리스크|우려|걱정/, ['risks']],
  [/비중|구성|점유|차지/, ['share', 'ratio']],
  [/추이|변화|증가|감소|늘었|줄었|늘어|줄어/, ['trend', 'delta', 'spark']],
  [/목표|달성/, ['goal', 'attain']],
  [/담당|조직|역할|맡은/, ['people']],
  [/질문|문의|Q&A|FAQ/i, ['faq']],
  [/설문|만족|응답/, ['likert']],
  [/결론|제안|요청|핵심|결정/, ['message', 'callout']],
  [/\d/, ['number', 'kpi', 'bars'], 0.5],
]

/** 장에 아무것도 맞지 않을 때: 보고에서 가장 많이 쓰는 것 (앞의 넷이 먼저, 이미 들었거나 넣을 수 없으면 뒤의 것으로 채운다) */
const USUAL: BlockType[] = ['message', 'number', 'bars', 'process', 'delta', 'compare', 'timeline', 'bullets']

/** 글을 쓰기 전에도 발표 종류에서 출발한다. 작성한 글의 낱말이 맞으면 그쪽이 먼저다. */
const BY_TYPE: Record<DeckType, readonly BlockType[]> = {
  business: ['market', 'kpi', 'number', 'timeline'],
  improve: ['delta', 'compare', 'process', 'bars'],
  decide: ['compare', 'rating', 'risks', 'table'],
  deal: ['message', 'compare', 'kpi', 'timeline'],
  proposal: ['compare', 'number', 'timeline', 'people'],
  plan: ['gantt', 'goal', 'people', 'checks'],
  weekly: ['progress', 'sparks', 'gantt', 'summary'],
  report: ['progress', 'kpi', 'risks', 'checks'],
  result: ['kpi', 'delta', 'bars', 'trend'],
  issue: ['whys', 'timeline', 'progress', 'facts'],
  kickoff: ['timeline', 'people', 'goal', 'checks'],
  research: ['bars', 'compare', 'table', 'message'],
  study: ['process', 'image', 'points', 'checks'],
  intro: ['people', 'timeline', 'kpi', 'image'],
  blank: [],
}

/** 그림으로 말하는 컴포넌트(차트 묶음). 이것만 있는 장에는 결론 한 줄을 먼저 권한다 */
const CHARTS = new Set<BlockType>(BLOCK_GROUPS.find((g) => g.short === '차트')?.types ?? [])

/**
 * 이 장에 어울리는 컴포넌트 n개. 장의 제목, 부제, 칸과 항목의 글에 있는 낱말로 고르고(RULES), 이미 든 컴포넌트는 빼고,
 * 차트만 있는 장에는 결론 한 줄을 먼저. 글을 쓰기 전에는 발표 종류와 장의 역할을 참고하고, 모자라면 흔히 쓰는 것으로 채운다.
 * 넣을 수 없는 것(blocked)은 고르지 않는다. 이 판단은 PC 안에서만 하고 AI 공유에는 넣지 않는다.
 */
export function suggestBlocks(slide: Slide, n = 4, blocked: (t: BlockType) => boolean = () => false, type: DeckType = 'blank'): BlockType[] {
  const blocks = slide.blocks ?? []
  const text = [
    ...Object.values(slide.fields ?? {}),
    ...(slide.items ?? []).flatMap((i) => [i.title, i.body, i.value]),
    ...blocks.flatMap((b) => [...Object.values(b.fields ?? {}), ...(b.items ?? []).flatMap((i) => [i.title, i.body, i.value])]),
  ].join(' ')
  const has = new Set(blocks.map((b) => b.type))
  if (Object.hasOwn(BLOCKS, slide.layout)) has.add(slide.layout as BlockType)
  const score = new Map<BlockType, number>()
  const add = (t: BlockType, s: number) => score.set(t, (score.get(t) ?? 0) + s)
  for (const [test, types, weight = 1] of RULES) if (test.test(text)) types.forEach((t, i) => add(t, (3 - i * 0.5) * weight))
  for (const [test, types, weight = 1] of RULES) if (test.test(slide.purpose)) types.forEach((t, i) => add(t, (3 - i * 0.5) * weight * 0.35))
  const usualForType = BY_TYPE[type] ?? []
  usualForType.forEach((t, i) => add(t, 1.6 - i * 0.2))
  if (blocks.length && blocks.every((b) => CHARTS.has(b.type))) add('message', 4)
  USUAL.forEach((t, i) => add(t, 0.4 - i * 0.04))
  return [...score]
    .filter(([t]) => !has.has(t) && Object.hasOwn(BLOCKS, t) && !blocked(t))
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([t]) => t)
}

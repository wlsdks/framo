// 컴포넌트 고르기의 '찾기'와 '이 슬라이드에 어울리는 것'. AI를 부르지 않고 이름, 설명, 묶음의 낱말과 장에 적힌 글의 낱말로만 정한다.
// 예순 개 넘는 카드를 묶음 칩으로만 고르면, 무엇을 보여 주고 싶은지는 알아도 그것이 어느 묶음에 있는지 몰라 끝까지 굴려 봐야 했다

import type { BlockType, Slide } from '../types'
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
export function findBlocks(query: string): BlockType[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return []
  const alike = (w: string) => [w, ...ALIKE.filter(([test]) => test.test(w)).flatMap(([, list]) => list.map((a) => a.toLowerCase()))]
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

/** 장에 적힌 글의 낱말과 어울리는 컴포넌트. 앞에 둔 것일수록 먼저. 셋째 값은 무게(없으면 1): 숫자는 어느 글에나 흔해서 가볍게 */
const RULES: [RegExp, BlockType[], number?][] = [
  [/일정|계획|로드맵|분기|마일스톤|언제까지|착수|오픈/, ['gantt', 'timeline', 'checks']],
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

/** 그림으로 말하는 컴포넌트(차트 묶음). 이것만 있는 장에는 결론 한 줄을 먼저 권한다 */
const CHARTS = new Set<BlockType>(BLOCK_GROUPS.find((g) => g.short === '차트')?.types ?? [])

/**
 * 이 장에 어울리는 컴포넌트 n개. 장의 제목, 부제, 칸과 항목의 글에 있는 낱말로 고르고(RULES), 이미 든 컴포넌트는 빼고,
 * 차트만 있는 장에는 결론 한 줄을 먼저. 맞는 것이 모자라면 흔히 쓰는 것으로 채운다. 넣을 수 없는 것(blocked)은 고르지 않는다
 */
export function suggestBlocks(slide: Slide, n = 4, blocked: (t: BlockType) => boolean = () => false): BlockType[] {
  const blocks = slide.blocks ?? []
  const text = [
    ...Object.values(slide.fields ?? {}),
    ...(slide.items ?? []).flatMap((i) => [i.title, i.body, i.value]),
    ...blocks.flatMap((b) => [...Object.values(b.fields ?? {}), ...(b.items ?? []).flatMap((i) => [i.title, i.body, i.value])]),
  ].join(' ')
  const has = new Set(blocks.map((b) => b.type))
  const score = new Map<BlockType, number>()
  const add = (t: BlockType, s: number) => score.set(t, (score.get(t) ?? 0) + s)
  for (const [test, types, weight = 1] of RULES) if (test.test(text)) types.forEach((t, i) => add(t, (3 - i * 0.5) * weight))
  if (blocks.length && blocks.every((b) => CHARTS.has(b.type))) add('message', 4)
  USUAL.forEach((t, i) => add(t, 0.4 - i * 0.04))
  return [...score]
    .filter(([t]) => !has.has(t) && Object.hasOwn(BLOCKS, t) && !blocked(t))
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([t]) => t)
}

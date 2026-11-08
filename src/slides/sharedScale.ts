// 이어 움직이는 이웃 장이 같이 쓰는 막대의 잣대.
//
// 막대는 장마다 가장 큰 값을 끝까지 그린다. 같은 차트의 값만 바꾼 두 장을 이어 움직이기로 넘기면, 두 장의 잣대가 달라서 값이 그대로인
// 막대(2에서 2)도 길이가 바뀌고, 오른 값의 막대가 줄어들기도 했다(감성 검수: 막대가 숫자와 거꾸로 움직였다). 화면에 축이 없어
// 듣는 분에게는 잣대가 바뀐 것이 아니라 '줄었다'로 읽힌다. 그래서 이어 움직이기로 이어지는 같은 막대 차트는 처음부터 한 잣대(그 장들의
// 가장 큰 값)로 그린다. 넘길 때 막대는 바뀐 만큼만 자라거나 줄고, 그대로인 값은 가만히 있다. 앞 장만 따로 보면 가장 큰 막대가 끝까지
// 차지 않지만, 견주는 그림은 같은 잣대가 맞다.
//
// 편집 화면, 발표, 내보낸 HTML, PDF와 PPT, 목록 그림이 모두 같은 값을 쓰도록 장 차례 정보(PageInfo) 하나에서 셈한다(SlideCanvas의 pageProps).
// 짝은 엔진의 이어 움직이기(motion/engine.ts의 morphKeys)와 같은 생각으로 데이터에서 고른다: 다음 장의 장 넘기기가 이어 움직이기이고,
// 두 장의 막대 차트가 같은 모양, 같은 항목 이름, 같은 단위일 때. 이어 움직이기가 셋 넘게 이어지면 그 모두가 한 잣대다.

import type { PageInfo } from '../deck/fields'
import { variantOf } from '../deck/layouts'
import { transitionOf } from '../deck/themes'
import type { Item, Slide } from '../deck/types'
import { seriesIn } from './numbers'

/** 장 id → (차트 자리 → 잣대의 끝 값). 차트 자리는 레이아웃 장이면 '', 부품 장이면 부품 id */
export type SharedScales = Map<string, Map<string, number>>

/** 막대 차트 하나: 잣대를 견줄 열쇠(모양, 항목 이름, 단위)와 제 가장 큰 값 */
interface Chart {
  slide: string
  key: string
  match: string
  max: number
  suffix: string
}

/** 막대 차트의 가장 큰 값. 견줄 수 없는 값(단위가 섞임, 음수)이 있으면 잣대를 같이 쓰지 않는다 */
function chartOf(slide: string, key: string, variant: string, items: Item[], unit: string): Chart | null {
  const series = seriesIn(
    items.map((it) => it.value),
    unit,
  )
  if (!series.ok || series.values.some((v, i) => (v === null ? !!items[i].value.trim() : v < 0))) return null
  const max = Math.max(0, ...series.values.map((v) => v ?? 0))
  if (!(max > 0)) return null
  const names = items.map((it) => it.title.trim()).join('\n')
  return { slide, key, match: [variant, unit.trim(), names].join('\u0000'), max, suffix: series.suffix }
}

/** 장 하나의 막대 차트들 (레이아웃 장의 막대 비교, 부품 장의 막대 비교 부품) */
function chartsOf(s: Slide): Chart[] {
  if (s.layout === 'bars') {
    const c = chartOf(s.id, '', variantOf(s), s.items, s.fields.unit ?? '')
    return c ? [c] : []
  }
  if (s.layout !== 'compose') return []
  return (s.blocks ?? [])
    .filter((b) => b.type === 'bars')
    .map((b) => chartOf(s.id, b.id, b.variant ?? 'base', b.items, b.fields.unit ?? ''))
    .filter((c): c is Chart => !!c)
}

const memo = new WeakMap<PageInfo, SharedScales>()

/** 이어 움직이기로 이어지는 같은 막대 차트들이 같이 쓰는 잣대. 같이 쓰지 않는 차트는 없다(제 값으로 그린다) */
export function sharedScales(info: PageInfo): SharedScales {
  const hit = memo.get(info)
  if (hit) return hit
  const out: SharedScales = new Map()
  const slides = info.visible ?? []
  // 이어진 차트끼리 묶는다(셋 넘게 이어지면 하나로)
  const parent = new Map<Chart, Chart>()
  const root = (c: Chart): Chart => {
    let r = c
    while (parent.get(r) !== r) r = parent.get(r)!
    return r
  }
  let prev: Chart[] = []
  slides.forEach((s, i) => {
    const now = chartsOf(s)
    for (const c of now) parent.set(c, c)
    const morph = i > 0 && (info.look ? transitionOf(info.look, s) === 'morph' : s.options.transition === 'morph')
    if (morph)
      for (const c of now) {
        // 열쇠가 같은 앞 장의 차트가 하나뿐일 때만(어느 것이 짝인지 알 수 있을 때)
        const same = prev.filter((p) => p.match === c.match && p.suffix === c.suffix)
        if (same.length === 1 && now.filter((x) => x.match === c.match).length === 1) parent.set(root(c), root(same[0]))
      }
    prev = now
  })
  const groups = new Map<Chart, Chart[]>()
  for (const c of parent.keys()) {
    const r = root(c)
    groups.set(r, [...(groups.get(r) ?? []), c])
  }
  for (const list of groups.values()) {
    if (list.length < 2) continue
    const max = Math.max(...list.map((c) => c.max))
    for (const c of list) {
      const m = out.get(c.slide) ?? new Map<string, number>()
      m.set(c.key, max)
      out.set(c.slide, m)
    }
  }
  memo.set(info, out)
  return out
}

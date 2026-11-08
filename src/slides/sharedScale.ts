// 이어 움직이는 이웃 장이 같이 쓰는 차트의 잣대(막대 비교, 추이).
//
// 차트는 장마다 제 값에 맞춘 잣대로 그린다(막대는 가장 큰 값을 끝까지, 추이는 값의 범위를 위아래 끝까지). 같은 차트의 값만 바꾼 두 장을
// 이어 움직이기로 넘기면 두 장의 잣대가 달라서, 값이 그대로인 막대(2에서 2)도 길이가 바뀌고 오른 값의 막대가 줄거나, 추이의 답이
// 131에서 144로 오르는데 점은 내려갔다(감성 검수: 막대가 숫자와 거꾸로 움직였다). 화면에 축이 없어 듣는 분에게는 잣대가 바뀐 것이 아니라
// 값이 그렇게 바뀐 것으로 읽힌다. 그래서 이어 움직이기로 이어지는 같은 차트는 처음부터 한 잣대(그 장들의 값을 다 담는 잣대)로 그린다.
// 넘길 때 막대와 점은 바뀐 만큼, 바뀐 쪽으로만 움직이고 그대로인 값은 가만히 있다. 앞 장만 따로 보면 차트가 잣대를 다 채우지 않지만,
// 견주는 그림은 같은 잣대가 맞다.
//
// 문턱: 값이 크게 뛰어(1에서 10) 한 잣대로 그리면 어느 장의 가장 높은 값이 잣대의 40%에도 닿지 못하는 짝은 묶지 않는다(그 장이 너무
// 휑해진다). 재는 법은 막대와 추이가 같다: 그려지는 잣대의 바닥에서 가장 높은 값까지(막대는 0부터, 추이는 Trend.tsx와 같은 축의 바닥부터).
// 오르내림 폭으로 재던 때는 131에서 183으로 오르는 추이가 묶이지 않아, 같은 발표의 막대와 말투가 달랐다(4차 감성 검수).
// 막대의 잣대는 0부터, 추이의 잣대는 두 장의 값 범위에 여유만 둔다(0으로 내리지 않는다, numbers.ts의 lineAxis). 추이를 0부터 그리던 때는
// 값이 낮은 장의 선이 높이의 16%만 쓰며 가운데 떠 납작했다(5차 감성 검수).
// 묶지 않은 짝은 장마다 제 잣대로 그리고, 넘길 때 엔진이 새 값으로 처음 나올 때처럼 다시 자라게 한다(motion/engine.ts의 carry).
// 셋 넘게 이어지면 읽는 차례로 묶어 가다가, 다음 장을 더하면 묶음의 어느 장이 문턱 밑이 될 때 그 장부터 새 묶음을 시작한다
// (가운데 장은 앞 장과 먼저 묶인다).
//
// 편집 화면, 발표, 내보낸 HTML, PDF와 PPT, 목록 그림이 모두 같은 값을 쓰도록 장 차례 정보(PageInfo) 하나에서 셈한다(SlideCanvas의 pageProps).
// 짝은 엔진의 이어 움직이기(motion/engine.ts의 morphKeys)와 같은 생각으로 데이터에서 고른다: 다음 장의 장 넘기기가 이어 움직이기이고,
// 두 장의 차트가 같은 종류, 같은 모양, 같은 항목 이름, 같은 단위일 때.

import type { PageInfo } from '../deck/fields'
import { variantOf } from '../deck/layouts'
import { transitionOf } from '../deck/themes'
import type { Item, Slide } from '../deck/types'
import { lineAxis, seriesIn } from './numbers'

/** 같이 쓰는 잣대가 담는 값의 범위(막대는 lo가 0이다)와, 어느 이웃과 같이 쓰는지(편집 화면의 안내) */
export interface Scale {
  lo: number
  hi: number
  with: 'prev' | 'next' | 'both'
}

/** 장 id → (차트 자리 → 잣대). 차트 자리는 레이아웃 장이면 '', 부품 장이면 부품 id */
type SharedScales = Map<string, Map<string, Scale>>

/** 한 잣대로 그렸을 때 차트의 가장 높은 값이 잣대의 이만큼에는 닿아야 묶는다. 엔진(carry)도 같은 값으로 다시 자랄지 고른다 */
const SHARE_MIN = 0.4

type Kind = 'bars' | 'trend'

/** 차트 하나: 짝을 견줄 열쇠(종류, 모양, 항목 이름, 단위)와 제 값의 범위 */
interface Chart {
  slide: string
  key: string
  kind: Kind
  match: string
  lo: number
  hi: number
  /** 추이의 시기 수(축은 시기 수와 상관없지만 lineAxis가 받는다) */
  n: number
}

/** 차트의 값 범위. 견줄 수 없는 값(단위가 섞임, 막대의 음수)이 있으면 잣대를 같이 쓰지 않는다 */
function chartOf(slide: string, key: string, kind: Kind, variant: string, items: Item[], unit: string, target: string): Chart | null {
  const texts = items.map((it) => it.value)
  const series = seriesIn(texts, unit)
  if (!series.ok) return null
  if (kind === 'bars' && series.values.some((v, i) => (v === null ? !!items[i].value.trim() : v < 0))) return null
  const known = series.values.filter((v): v is number => v !== null)
  if (!known.length) return null
  // 추이의 잣대에는 목표도 든다(Trend.tsx와 같게: 목표의 단위가 맞을 때만)
  const withTarget = kind === 'trend' && target.trim() ? seriesIn([...texts, target], unit) : null
  const goal = withTarget && withTarget.ok ? withTarget.values[items.length] : null
  const all = goal === null || goal === undefined ? known : [...known, goal]
  const lo = kind === 'bars' ? 0 : Math.min(...all)
  const hi = Math.max(...all)
  if (kind === 'bars' && !(hi > 0)) return null
  const names = items.map((it) => it.title.trim()).join('\n')
  return { slide, key, kind, match: [kind, variant, unit.trim(), series.suffix, names].join('\u0000'), lo, hi, n: items.length }
}

/** 장 하나의 차트들 (레이아웃 장의 막대 비교와 추이, 부품 장의 그 부품) */
function chartsOf(s: Slide): Chart[] {
  if (s.layout === 'bars' || s.layout === 'trend') {
    const c = chartOf(s.id, '', s.layout, variantOf(s), s.items, s.fields.unit ?? '', s.fields.target ?? '')
    return c ? [c] : []
  }
  if (s.layout !== 'compose') return []
  return (s.blocks ?? [])
    .filter((b) => b.type === 'bars' || b.type === 'trend')
    .map((b) => chartOf(s.id, b.id, b.type as Kind, b.variant ?? 'base', b.items, b.fields.unit ?? '', b.fields.target ?? ''))
    .filter((c): c is Chart => !!c)
}

/** 묶음의 잣대로 그렸을 때 차트의 가장 높은 값이 닿는 높이(잣대의 바닥부터, 0~1). 막대는 0부터, 추이는 그려질 같은 잣대(lineAxis의 shared)의 바닥부터 */
function reach(c: Chart, lo: number, hi: number): number {
  const { floor, ceil } = c.kind === 'trend' ? lineAxis([lo, hi], c.n, true) : { floor: 0, ceil: hi }
  return ceil > floor ? (c.hi - floor) / (ceil - floor) : 1
}

const join = (list: Chart[]) => ({ lo: Math.min(...list.map((c) => c.lo)), hi: Math.max(...list.map((c) => c.hi)) })

const memo = new WeakMap<PageInfo, SharedScales>()

/** 이어 움직이기로 이어지는 같은 차트들이 같이 쓰는 잣대. 같이 쓰지 않는 차트는 없다(제 값으로 그린다) */
export function sharedScales(info: PageInfo): SharedScales {
  const hit = memo.get(info)
  if (hit) return hit
  const out: SharedScales = new Map()
  const slides = info.visible ?? []
  // 이어진 차트들의 줄(앞 장 → 다음 장). 차트마다 앞 장의 짝은 많아야 하나라 줄은 곧게 이어진다
  const next = new Map<Chart, Chart>()
  const heads: Chart[] = []
  let prev: Chart[] = []
  slides.forEach((s, i) => {
    const now = chartsOf(s)
    const morph = i > 0 && (info.look ? transitionOf(info.look, s) === 'morph' : s.options.transition === 'morph')
    for (const c of now) {
      // 열쇠가 같은 앞 장의 차트가 하나뿐이고 이 장에도 하나뿐일 때만(어느 것이 짝인지 알 수 있을 때)
      const same = morph ? prev.filter((p) => p.match === c.match) : []
      if (same.length === 1 && now.filter((x) => x.match === c.match).length === 1 && !next.has(same[0])) next.set(same[0], c)
      else heads.push(c)
    }
    prev = now
  })
  for (const head of heads) {
    // 읽는 차례로 묶다가, 다음 차트를 더하면 묶음의 어느 차트가 문턱 밑이 될 때 그 차트부터 새 묶음
    let group: Chart[] = [head]
    const groups: Chart[][] = [group]
    for (let c = next.get(head); c; c = next.get(c)) {
      const wider = join([...group, c])
      if ([...group, c].every((x) => reach(x, wider.lo, wider.hi) >= SHARE_MIN)) group.push(c)
      else groups.push((group = [c]))
    }
    for (const g of groups) {
      if (g.length < 2) continue
      const { lo, hi } = join(g)
      g.forEach((c, i) => {
        const m = out.get(c.slide) ?? new Map<string, Scale>()
        m.set(c.key, { lo, hi, with: i === 0 ? 'next' : i === g.length - 1 ? 'prev' : 'both' })
        out.set(c.slide, m)
      })
    }
  }
  memo.set(info, out)
  return out
}

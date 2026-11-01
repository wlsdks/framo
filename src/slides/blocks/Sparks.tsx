// 부품: 지표 흐름표 (sparks). 모양은 styles/blocks/sparks.css

import { BLOCKS } from '../../deck/blocks'
import { hintFor } from '../../deck/layouts'
import { cx } from '../../lib/cx'
import { demoOf, useSlide } from '../context'
import { IT, ItemTools, T } from '../fields'
import { amountPair, formatNumber, seriesIn } from '../numbers'
import { Numeral, tokensOf } from './parts'

/** 숫자 글의 소수 자리 수 */
const decimalsOf = (t: string) => /\.(\d+)/.exec(t)?.[1].length ?? 0

/** 지표 흐름표의 바뀐 만큼: 지금 값(뒤 값)의 자리와 단위로 센 차이. 단위가 %면 %p. 견줄 수 없는 단위끼리면 null */
function stepOf(from: string, to: string, unit: string): { text: string; dir: number } | null {
  const p = amountPair(from, to, unit)
  if (!p) return null
  // 소수 자리는 적은 값을 따른다. 두 값의 자리가 다르면('9,500만 → 1.2억'은 0.25억) 둘째 자리까지
  const k = 10 ** (p.a.scale === p.b.scale ? Math.min(2, Math.max(decimalsOf(from), decimalsOf(to))) : 2)
  const d = Math.round(((p.b.base - p.a.base) / p.b.scale) * k) / k
  // 단위 칸이 비었으면 지금 값에 붙여 쓴 자리와 단위('58억')를 그대로
  return { text: `${formatNumber(Math.abs(d))}${p.kind === '%' ? '%p' : unit || p.b.suffix}`, dir: Math.sign(d) }
}

/**
 * 지표 흐름표: 지표마다 그동안의 흐름을 작은 선으로 긋고, 지금 값(흐름의 마지막)과 바뀐 만큼을 나란히 둔다. 선은 지표마다 제 눈금이라
 * 크기와 단위가 다른 지표(억 원, %)를 한 표에 둔다. 강조색은 지금(선 끝의 점과 지금 값)에만. 오른 것이 좋은지(매출) 나쁜지(불량률)는
 * 지표마다 달라서 바뀐 만큼은 색 없이 ▲▼로. 칸은 줄마다 같은 자리에 오게 표 하나의 격자를 나눠 쓴다(subgrid, blocks.css)
 */
export function Sparks() {
  const { slide, mode, folds } = useSlide()
  const items = slide.items.slice(0, BLOCKS.sparks.items!.max)
  const demo = demoOf(mode, items)
  const first = slide.variant === 'first'
  // 단위 칸은 편집할 때 지금 값 옆에서 적는다. 모두 비어 접혀 있으면(칸 더하기로 연다) 적은 단위나 예시 단위를 그대로 보인다
  const unitField = mode === 'edit' && !folds?.has('items.meta')
  return (
    <div className={cx('bk-sx', demo && 'is-demo')}>
      <T k="heading" as="h3" className="bk-h" fit={[18, 32]} multiline />
      <div className="bk-sx-table">
        <div className="bk-sx-head">
          <span />
          <T k="period" as="span" className="bk-sx-hk bk-sx-period" />
          <span className="bk-sx-hk is-now">지금</span>
          <span className="bk-sx-hk is-chg">{first ? '처음보다' : '바로 앞보다'}</span>
        </div>
        {/* 넓은 칸에서 두 단으로 흘릴 때 오른쪽 단의 머리 (blocks.css). 기간은 왼쪽 머리에서만 고친다 */}
        <div className="bk-sx-head is-more" aria-hidden="true">
          <span />
          <span className="bk-sx-hk bk-sx-period">{slide.fields.period?.trim()}</span>
          <span className="bk-sx-hk is-now">지금</span>
          <span className="bk-sx-hk is-chg">{first ? '처음보다' : '바로 앞보다'}</span>
        </div>
        <ul className="bk-sx-list" data-n={items.length}>
          {items.map((it, i) => {
            const toks = tokensOf(demo ? hintFor(slide.layout, slide.hints, 'value', 'value', i) : it.value).slice(-24)
            const unit = it.meta.trim() || (demo ? hintFor(slide.layout, slide.hints, 'meta', 'meta', i) : '')
            // 줄 안에서 자리를 섞어 적었으면('9,500만, 1.2억') 한 기준으로 맞춰 선을 긋는다
            const series = seriesIn(toks, unit)
            const invalid = !series.ok || series.values.some((v) => v === null)
            const vs = invalid ? toks.map(() => null) : series.values
            const pts = toks.flatMap((t, j) => {
              const v = vs[j]
              return v === null ? [] : [{ j, v, t }]
            })
            const lo = Math.min(...pts.map((p) => p.v))
            const hi = Math.max(...pts.map((p) => p.v))
            // 위아래 끝의 점이 칸 밖으로 나가지 않게 조금 띄운다. 값이 빠지거나 단위가 섞이면 선 대신 원문을 둔다.
            const at = pts.map((p) => ({ x: (p.j / Math.max(1, toks.length - 1)) * 100, y: hi === lo ? 50 : 88 - ((p.v - lo) / (hi - lo)) * 76 }))
            const line = at.map((p, k) => `${k ? 'L' : 'M'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ')
            const last = pts[pts.length - 1]
            const base = first ? pts[0] : pts[pts.length - 2]
            const step = last && base && base !== last ? stepOf(base.t, last.t, unit) : null
            const end = at[at.length - 1]
            return (
              <li key={it.id} className="it bk-sx-row">
                <IT i={i} k="title" className="bk-sx-name" />
                <div className="bk-sx-plot">
                  {pts.length > 1 && (
                    <svg className="bk-sx-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                      <path d={line} />
                    </svg>
                  )}
                  {end && <span className="bk-sx-dot" style={{ '--x': end.x.toFixed(2), '--y': end.y.toFixed(2) }} aria-hidden="true" />}
                  {/* 흐름 숫자는 선 자리에서 고친다 (올리거나 누르면 숫자가 보인다) */}
                  {mode === 'edit' && <IT i={i} k="value" className="bk-sx-in on-chart" oneLine />}
                  {mode !== 'edit' && invalid && <IT i={i} k="value" className="bk-sx-in" />}
                </div>
                <span className="bk-sx-now">
                  {last && (
                    <span className="bk-sx-v">
                      <Numeral text={last.t} />
                    </span>
                  )}
                  {/* 단위는 숫자보다 두 단계 작게 */}
                  {unitField ? <IT i={i} k="meta" as="span" className="bk-sx-u" /> : unit && last && <span className="bk-sx-u">{unit}</span>}
                </span>
                <span className="bk-sx-chg">{mode === 'edit' && invalid ? '값 확인' : step && (step.dir === 0 ? '그대로' : `${step.dir > 0 ? '▲' : '▼'} ${step.text}`)}</span>
                <ItemTools i={i} />
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

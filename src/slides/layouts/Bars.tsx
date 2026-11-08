// 레이아웃: 막대 비교 (bars). 모양은 styles/bars.css

import { readField } from '../../deck/fields'
import { highlightOf, hintFor } from '../../deck/layouts'
import type { Slide } from '../../deck/types'
import { cx } from '../../lib/cx'
import { demoOf, useSlide } from '../context'
import { IT, ItemTools, T } from '../fields'
import { readNumber, seriesIn, unfitValues } from '../numbers'
import { Head, useItems, useUnitOpen } from './parts'

/** 숫자를 넣기 전, 편집할 때 흐리게 보여 줄 예시 길이. 어떤 모양의 장인지 알아보게만 한다. */
const DEMO_BARS = [64, 78, 100, 86, 72, 92]

/** 예시 숫자가 막대마다 있으면 그 비율로, 없으면 정해 둔 길이로. 안내 글의 숫자와 막대 길이가 맞아야 덜 어색하다. */
function demoBars(slide: Slide, n: number): number[] {
  const hinted = Array.from({ length: n }, (_, i) => readNumber(hintFor(slide.layout, slide.hints, 'value', 'value', i)) ?? 0)
  const top = Math.max(0, ...hinted)
  if (top > 0 && hinted.every((v) => v > 0)) return hinted.map((v) => (v / top) * 100)
  return Array.from({ length: n }, (_, i) => DEMO_BARS[i % DEMO_BARS.length])
}

export function Bars() {
  const { slide, meta, mode, scale } = useSlide()
  const items = useItems()
  const unit = readField(slide, meta, 'unit').trim()
  const unitOpen = useUnitOpen(unit)
  // 막대끼리 길이를 견주므로 한 기준으로 ('1.2억', '9,500만')
  const series = seriesIn(
    items.map((it) => it.value),
    unit,
  )
  // 음수나 서로 다른 단위, 읽을 수 없는 입력을 0으로 바꾸면 실제 값과 다른 막대가 된다.
  // 비어 있는 항목은 작성 중인 칸이므로 나머지 비교를 막지 않는다.
  const comparable = series.ok && series.values.every((v, i) => v === null ? !items[i].value.trim() : v >= 0)
  const values = series.values
  // 견줄 수 없는 값이 어느 칸인지 (편집할 때만 밑줄로 보인다)
  const unfit = mode === 'edit' && !comparable ? unfitValues(items.map((it) => it.value), unit) : []
  // 이어 움직이기로 이어지는 이웃 장과는 한 잣대로(sharedScale.ts): 넘길 때 막대가 바뀐 만큼만 자라고 그대로인 값은 가만히 있게
  const max = Math.max(0, ...values.map((v) => v ?? 0), comparable && scale ? scale.hi : 0)
  const demo = demoOf(mode, items)
  const demoP = demo ? demoBars(slide, items.length) : []
  const highlight = highlightOf(slide)
  return (
    <>
      <Head lead />
      <div className="s-body br-wrap">
        {mode === 'edit' && !comparable && <p className="br-unit ed-warn" role="status">같은 단위의 0 이상 숫자를 적어 주세요.</p>}
        {unitOpen && (
          <p className="br-top">
            <span className="br-unit">
              단위: <T k="unit" as="span" oneLine />
            </span>
          </p>
        )}
        <div className="br" data-n={items.length}>
          {items.map((it, i) => {
            const value = values[i]
            const pct = demo ? demoP[i] : comparable && max > 0 && value !== null && value > 0 ? Math.max(2, (value / max) * 100) : 0
            const known = demo || (comparable && value !== null)
            return (
              // 길이는 --p(0~100)로만 넘긴다. 가로 막대는 너비, 세로 막대는 높이로 쓴다.
              <div
                key={it.id}
                className={cx('it br-row', highlight === i && 'is-hl', demo && 'is-demo')}
                style={{ '--p': pct.toFixed(2) }}
              >
                <div className="br-label">
                  <IT i={i} k="title" className="br-name" />
                  <IT i={i} k="meta" className="br-meta" />
                </div>
                {/* 막대와 숫자. 가로 막대에서는 묶음 없이(contents) 줄의 칸에, 세로 막대에서는 바닥 줄 위의 한 칸에 */}
                <div className="br-bar">
                  <div className="br-track">
                    {known && <div className="br-fill" />}
                  </div>
                  <IT i={i} k="value" className={cx('br-value', unfit[i] && 'is-unfit')} />
                </div>
                <ItemTools i={i} />
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}

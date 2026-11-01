// 레이아웃: 증감 요인 (bridge). 모양은 styles/bridge.css

import { isBlankItem, readField } from '../../deck/fields'
import { hintFor } from '../../deck/layouts'
import { cx } from '../../lib/cx'
import { demoOf, useSlide } from '../context'
import { IT, ItemTools, minusSigns, T } from '../fields'
import { formatNumber, seriesIn } from '../numbers'
import { Head, Label, useItems } from './parts'

/**
 * 증감 요인(폭포): 처음 값 → 요인마다 더하고 뺀 만큼 뜬 막대 → 끝 값. 끝 값은 계산한다(따로 적으면 서로 안 맞을 수 있어서).
 * 세로(기본)는 막대를 바닥에서 위로, 가로는 왼쪽 축에서 오른쪽으로 세운다(요인 이름이 길거나 요인이 많을 때).
 * 처음과 끝이 증감보다 훨씬 크면 바닥부터 세운 막대 때문에 증감이 안 보이므로, 바닥을 올리고 처음과 끝 막대 아래에 축을 끊은 표시(//)를 둔다.
 */
export function Bridge() {
  const { slide, meta, mode } = useSlide()
  const items = useItems()
  const startText = readField(slide, meta, 'startValue')
  const unit = readField(slide, meta, 'unit').trim()
  // 편집할 때 숫자가 하나도 없으면 안내 문구의 예시 숫자로 흐리게 그린다
  const demo = demoOf(mode, items) && !startText.trim()
  // 처음 값과 증감을 한 기준으로 더한다 ('1.2억'에 '+3,000만'은 1.5억). 단위가 서로 다른 값이 섞였으면 끝 값을 말하지 않는다
  const series = seriesIn(
    [demo ? hintFor(slide.layout, slide.hints, 'startValue') : startText, ...items.map((it, i) => (demo ? hintFor(slide.layout, slide.hints, 'value', 'value', i) : it.value))],
    unit,
  )
  // 빈 요인이나 읽을 수 없는 값을 0으로 세면 끝 값과 막대의 높이가 실제 입력과 달라진다.
  const known = demo || (!!startText.trim() && series.values[0] !== null && series.ok && items.every((it, i) => isBlankItem(it) || series.values[i + 1] !== null))
  const start = known ? series.values[0] ?? 0 : 0
  const deltas = series.values.slice(1).map((v) => known ? v ?? 0 : 0)
  const levels = deltas.reduce((acc, d) => [...acc, acc[acc.length - 1] + d], [start])
  const end = levels[levels.length - 1]
  const lo = Math.min(...levels)
  const hi = Math.max(...levels)
  const span = hi - lo || Math.abs(hi) || 1
  const cut = lo > 0 && lo - span * 1.5 > 0
  const floor = cut ? lo - span * 1.5 : Math.min(0, lo)
  const top = Math.max(hi, 0)
  const pct = (v: number) => (((v - floor) / (top - floor || 1)) * 100).toFixed(2)
  const base = cut ? floor : 0
  const col = (a: number, b: number, link?: number) =>
    ({ '--lo': pct(Math.min(a, b)), '--hi': pct(Math.max(a, b)), ...(link !== undefined ? { '--link': pct(link) } : {}) })
  // 끝 값의 단위: 단위 칸이 비었으면 처음 값에 붙여 쓴 자리와 단위('117억'이면 억)
  const endUnit = unit || (demo ? hintFor(slide.layout, slide.hints, 'unit') : series.suffix)
  return (
    <>
      <Head />
      <div className={cx('s-body wf', demo && 'is-demo', cut && 'is-cut', !known && 'is-incomplete')} data-n={items.length + 2} style={{ '--n': items.length + 2 }}>
        <div className="wf-col wf-total" style={col(base, start, start)}>
          <div className="wf-plot">
            <span className="wf-bar" />
            {cut && <span className="wf-cut" aria-hidden="true" />}
            <span className="wf-val">
              <T k="startValue" as="span" className="wf-num" oneLine />
              {(unit || mode !== 'final') && <T k="unit" as="span" className="wf-unit" oneLine />}
            </span>
          </div>
          <Label k="startTitle" fallback="시작" className="wf-title" />
        </div>
        {items.map((it, i) => (
          <div
            key={it.id}
            className={cx('it wf-col', deltas[i] < 0 ? 'wf-down' : 'wf-up', !demo && !it.value.trim() && 'is-blank')}
            style={col(levels[i], levels[i + 1], levels[i + 1])}
          >
            <div className="wf-plot">
              <span className="wf-bar" />
              <span className="wf-val">
                <IT i={i} k="value" as="span" className="wf-num" oneLine />
              </span>
            </div>
            <div className="wf-label">
              <IT i={i} k="title" className="wf-title" />
              <IT i={i} k="meta" className="wf-meta" />
            </div>
            <ItemTools i={i} />
          </div>
        ))}
        <div className="wf-col wf-total wf-end" style={col(base, end)}>
          <div className="wf-plot">
            <span className="wf-bar" />
            {cut && <span className="wf-cut" aria-hidden="true" />}
            <span className="wf-val">
              <span className="wf-num">{known ? minusSigns(formatNumber(end)) : '–'}</span>
              {known && endUnit && <span className="wf-unit">{endUnit}</span>}
            </span>
          </div>
          <Label k="endTitle" fallback="결과" className="wf-title" />
        </div>
      </div>
    </>
  )
}

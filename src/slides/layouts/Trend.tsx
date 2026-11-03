// 레이아웃: 추이 (trend). 모양은 styles/trend.css

import { useEffect, useLayoutEffect, useRef } from 'react'
import { readField } from '../../deck/fields'
import { highlightOf, hintFor } from '../../deck/layouts'
import { cx } from '../../lib/cx'
import { demoOf, useSlide } from '../context'
import { IT, ItemTools, T } from '../fields'
import { placeLabels } from '../fitBlocks'
import { lineAxis, lineRuns, seriesIn } from '../numbers'
import { Head, useItems, useUnitOpen } from './parts'

/**
 * 추이: 시기마다 점을 찍고 선으로 잇는다. 흐름을 보는 장이라 모두 0보다 크고 폭이 좁으면 0부터 그리지 않는다.
 * 값 이름표는 점 위에, 양옆보다 낮은 점은 선에 가리지 않게 점 아래에 둔다.
 */
export function Trend() {
  const { slide, meta, mode } = useSlide()
  const items = useItems()
  const highlight = highlightOf(slide)
  const final = mode === 'final'
  // 편집할 때 숫자가 하나도 없으면 안내 문구의 예시 숫자로 흐리게 그린다
  const demo = demoOf(mode, items)
  // 목표를 비워 두면 선을 긋지 않는다. 예시로 그릴 때만 예시 목표값에 흐리게
  const unit = readField(slide, meta, 'unit').trim()
  const unitOpen = useUnitOpen(unit)
  const targetField = readField(slide, meta, 'target')
  const targetText = !targetField.trim() && demo ? hintFor(slide.layout, slide.hints, 'target') : targetField
  // 시기마다의 값과 목표를 한 기준으로 ('1.2억'과 '9,500만'의 높이가 맞게)
  const texts = items.map((it, i) => (demo ? hintFor(slide.layout, slide.hints, 'value', 'value', i) : it.value))
  const dataSeries = seriesIn(texts, unit)
  const withTarget = seriesIn([...texts, targetText], unit)
  // 서로 다른 단위는 한 축에 놓을 수 없다. 목표 단위만 다르면 데이터 선은 살리고 목표선만 빼 둔다.
  const values = dataSeries.ok ? dataSeries.values : texts.map(() => null)
  const target = dataSeries.ok && withTarget.ok ? withTarget.values[items.length] : null
  const invalidTarget = !!targetField.trim() && (!withTarget.ok || withTarget.values[items.length] === null)
  const known = values.filter((v): v is number => v !== null)
  const { floor, y, x } = lineAxis(target === null ? known : [...known, target], items.length)
  const pts = values.map((v, i) => (v === null ? null : { x: x(i), y: y(v) }))
  // 값이 없는 시기를 건너뛰어 선을 이으면 그 사이에도 측정값이 있는 것처럼 보인다.
  // 이어진 값만 각각 선과 면으로 만들고, 하나뿐인 값은 점으로만 남긴다.
  const segments = lineRuns(pts)
  // 골짜기의 숫자는 점 아래에. 바닥에 붙은 골짜기는 아래 시기 이름과 부딪혀서 위에 둔다
  const dip = (i: number) => {
    const [a, v, b] = [values[i - 1], values[i], values[i + 1]]
    return i !== highlight && v !== null && a != null && b != null && v < a && v < b && y(v) > 30
  }
  const at = (p: { x: number; y: number }) => ({ '--x': p.x.toFixed(2), '--y': p.y.toFixed(2) })
  // 어림한 자리를 그려진 크기로 다시 고른다(선이 숫자를 지나가면 비킨다). 글꼴이 늦게 오면 한 번 더 (부품 장 안이면 fitBlocks도 한다)
  const canvas = useRef<HTMLDivElement | null>(null)
  useLayoutEffect(() => {
    if (canvas.current) placeLabels(canvas.current)
  })
  useEffect(() => {
    let on = true
    document.fonts?.ready.then(() => on && canvas.current && placeLabels(canvas.current))
    return () => {
      on = false
    }
  }, [])
  return (
    <>
      <Head lead />
      <div className={cx('s-body tn', demo && 'is-demo')} style={{ '--n': items.length }}>
        {/* 단위와 목표는 그래프 위 따로 둔 줄에. 선 끝에 이름표를 달면 최근 시기의 점(대개 강조한 점)과 부딪힌다 */}
        {(unitOpen || target !== null || invalidTarget || (mode === 'edit' && !dataSeries.ok)) && (
          <div className="tn-meta">
            <span className="tn-unit">
              {unitOpen && (
                <>
                  단위: <T k="unit" as="span" oneLine />
                </>
              )}
            </span>
            {(target !== null || invalidTarget || !final) && (
              <span className={cx('tn-unit', (target !== null || invalidTarget) && 'tn-legend')}>
                {target !== null && <i className="tn-legend-line" aria-hidden="true" />}
                {target !== null || invalidTarget ? '목표 ' : '목표선: '}
                <T k="target" as="span" oneLine />
              </span>
            )}
            {mode === 'edit' && (!dataSeries.ok || invalidTarget) && <span className="tn-unit ed-warn" role="status">값과 목표를 같은 단위의 숫자로 적어 주세요.</span>}
          </div>
        )}
        <div className="tn-plot">
          {/* 목표선의 높이(--ty)를 점의 숫자도 알아야 숫자가 목표선에 걸칠 때 선 위로 비켜 선다(trend.css) */}
          <div className="tn-canvas" ref={canvas} style={target !== null ? { '--ty': y(target).toFixed(2) } : undefined}>
            {floor < 0 && <span className="tn-zero" style={{ '--y': y(0).toFixed(2) }} />}
            {target !== null && (
              <div className="tn-target" style={{ '--y': y(target).toFixed(2) }} />
            )}
            <svg className="tn-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              {segments.filter((s) => s.length > 1).map((s) => {
                const line = s.map((p) => `${p.x.toFixed(2)},${(100 - p.y).toFixed(2)}`).join(' ')
                const area = `${s[0].x.toFixed(2)},100 ${line} ${s[s.length - 1].x.toFixed(2)},100`
                return <g key={s[0].x}><polygon className="tn-area" points={area} /><polyline className="tn-line" points={line} /></g>
              })}
            </svg>
            {items.map((it, i) => {
              const p = pts[i]
              // 발표할 때 숫자가 없는 시기는 점을 찍지 않는다. 편집할 때는 바닥에 칸을 둬서 채울 수 있게
              if (!p && final) return null
              return (
                <div
                  key={it.id}
                  className={cx('tn-pt', i === highlight && 'is-hl', dip(i) && 'is-below', !p && 'is-blank')}
                  data-index={i}
                  data-tn-side={dip(i) ? 'is-below' : undefined}
                  style={at(p ?? { x: x(i), y: 0 })}
                >
                  <span className="tn-dot" />
                  <span className="tn-val">
                    <IT i={i} k="value" as="span" className="tn-num" oneLine />
                  </span>
                </div>
              )
            })}
          </div>
        </div>
        {/* 시기 이름은 점과 같은 칸(--n등분)에서 가운데. 한 줄로 묶지 않는다: 칸보다 긴 이름('10월 1주')이 한 줄로 넘치면
            넘친 줄은 칸 왼쪽에 붙어 점보다 오른쪽으로 밀리고 옆 이름과 겹쳤다. 칸 안에서 띄어쓰기로 줄을 바꾼다 */}
        <div className="tn-x">
          {items.map((it, i) => (
            <div key={it.id} className={cx('it tn-col', i === highlight && 'is-hl')}>
              <IT i={i} k="title" className="tn-name" />
              {/* 숫자로 읽을 수 없는 값(예: 미정)도 발표에서 잃지 않는다. 점은 찍지 않고 시기 아래에 원문을 둔다. */}
              {final && !pts[i] && !!it.value.trim() && <IT i={i} k="value" className="tn-unit" />}
              <ItemTools i={i} />
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

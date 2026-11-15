// 부품: 여정 곡선 (journey). 모양은 styles/blocks/journey.css, 움직임은 motion/engine.ts의 nativeAuto, 셈은 slides/journey.ts

import type { CSSProperties } from 'react'
import { BLOCKS } from '../../deck/blocks'
import { hintFor } from '../../deck/layouts'
import { cx } from '../../lib/cx'
import { useSlide } from '../context'
import { IT, ItemTools, T } from '../fields'
import { JOURNEY_BOX, journeyFigure } from '../journey'
import { seriesIn } from '../numbers'

/**
 * 여정 곡선: 일이 지나가는 단계를 왼쪽에서 오른쪽으로 두고, 단계마다의 체감(만족도, 점수)을 부드러운 곡선의 높낮이로 그린다.
 * 이 그림의 답은 '어디가 가장 낮은가'라, 가장 낮은 곳의 점과 이름만 강조색이고 나머지는 글자색의 농담이다. 곡선도 내려갈수록 짙어져
 * 골짜기가 가장 무겁다. 추이(시기마다의 값을 꺾은선으로)와 달리 축도 바닥줄도 없다: 단계의 이름과 그 단계에서 있는 일이 곡선 바로
 * 아래에 매달려 곡선을 따라 오르내리고(가장 낮은 단계의 글이 가장 아래에 선다), 값은 곡선 위에 얹힌다. 글은 곡선이 그 너비 안에서
 * 가장 낮게 내려오는 높이 아래에 서서(journey.ts의 under) 어떤 값에서도 곡선과 겹치지 않는다.
 * 사람이 적는 것은 글뿐이다(이름, 값, 덧붙임): 높낮이도 가장 낮은 곳도 값에서 읽는다. 값을 읽을 수 없으면 평평한 선에 강조 없이.
 * 편집할 때 알리는 글과 틀린 칸의 밑줄은 차트들과 같은 것(edit.css의 .ed-warn, .is-unfit)이라 장의 글과 섞이지 않는다
 */
export function Journey() {
  const { slide, mode } = useSlide()
  const items = slide.items.slice(0, BLOCKS.journey.items!.max)
  const n = items.length
  // 편집할 때 아직 적지 않은 값은 안내의 예시 값으로 그린다(넣자마자 어떤 그림인지 보이게). 예시 값이 섞인 그림은 옅게
  const demo = mode !== 'final' && items.some((it) => !it.value.trim())
  const texts = items.map((it, i) => it.value.trim() || (mode !== 'final' ? hintFor(slide.layout, slide.hints, 'value', 'value', i).trim() : ''))
  // 값을 한 잣대로 읽는다: 단위를 붙인 값('4.2점')도, 하나만 단위가 달라('40%') 견줄 수 없는 것도 가려낸다
  const series = seriesIn(texts)
  const known = series.ok && series.values.every((v) => v !== null)
  const figure = journeyFigure(known ? series.values : items.map(() => null))

  // 다 적었는데 높낮이를 읽을 수 없을 때만 알린다(쓰는 중인 칸을 두고 재촉하지 않게). 편집할 때만: 발표할 때는 평평한 선에 적은 글이 선다
  const wrong = mode === 'edit' && !demo && !known
  const unfit = items.map((_, i) => wrong && series.values[i] === null)
  const warning = wrong ? (unfit.some(Boolean) ? '밑줄 친 값을 숫자로 적어 주세요. (예: 3.5)' : '값을 모두 같은 단위로 적어 주세요.') : ''

  const pct = (v: number) => (v * 100).toFixed(2)
  return (
    <div className={cx('bk-jr', demo && 'is-demo', !known && 'is-flat')} data-n={n} style={{ '--n': n } as CSSProperties}>
      <T k="heading" as="h3" className="bk-h" fit={[18, 32]} multiline />
      {warning && <p className="bk-jr-warn ed-warn" role="status">{warning}</p>}
      <div className="bk-jr-plot">
        <div className="bk-jr-band" aria-hidden="true">
          <div className="bk-jr-ink">
            <svg className="bk-jr-svg" viewBox={`0 0 ${JOURNEY_BOX} ${JOURNEY_BOX}`} preserveAspectRatio="none">
              <path className="bk-jr-line" d={figure.d} />
            </svg>
          </div>
        </div>
        {items.map((it, i) => (
          <div
            key={it.id}
            className={cx('it bk-jr-st', figure.low[i] && 'is-low')}
            style={
              {
                gridColumn: i + 1,
                '--y': pct(figure.pts[i].y),
                '--un': pct(figure.under[i].narrow),
                '--uw': pct(figure.under[i].wide),
                '--lean': figure.lean[i].toFixed(3),
                '--on': pct(figure.over[i].narrow),
                '--ow': pct(figure.over[i].wide),
              } as CSSProperties
            }
          >
            <div className="bk-jr-at">
              <span className="bk-jr-dot" aria-hidden="true" />
              <div className="bk-jr-val">
                <IT i={i} k="value" className={cx('bk-jr-v', unfit[i] && 'is-unfit')} oneLine />
              </div>
            </div>
            <div className="bk-jr-lab">
              <IT i={i} k="title" className="bk-jr-t" />
              <IT i={i} k="meta" className="bk-jr-m" multiline />
            </div>
            <ItemTools i={i} />
          </div>
        ))}
      </div>
    </div>
  )
}

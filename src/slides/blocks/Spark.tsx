// 부품: 숫자와 흐름 (spark). 모양은 styles/blocks/spark.css

import { hintFor } from '../../deck/layouts'
import { cx } from '../../lib/cx'
import { useSlide } from '../context'
import { minusSigns, T } from '../fields'
import { seriesIn } from '../numbers'
import { tokensOf, useDemo } from './parts'

/**
 * 흐름 칸의 숫자들. 쉼표나 띄어쓰기로 나눈다. '1,200'처럼 천 단위 쉼표가 든 숫자는 하나로 본다
 * (그래서 천 단위 숫자를 이어 적을 때는 쉼표 뒤를 띄어 쓴다: 1,200, 1,500). 단위를 섞어 적었으면('9,500만, 1.2억') 같은 자리로 맞춘다
 */
export function seriesOf(text: string): number[] {
  return pointsOf(text).map((p) => p.v)
}

/** 흐름 칸의 숫자와 그 숫자를 적은 글(선의 처음 값을 적은 그대로 보이려고) */
function pointsOf(text: string): { v: number; t: string }[] {
  const toks = tokensOf(text)
  const series = seriesIn(toks)
  // 단위가 다르거나 빠진 값이 있으면 선의 높낮이나 빠진 시점을 임의로 만들지 않는다.
  if (!series.ok || series.values.some((v) => v === null)) return []
  const vs = series.values
  return toks.flatMap((t, i) => {
    const v = vs[i]
    return v === null ? [] : [{ v, t }]
  })
}

/**
 * 숫자와 흐름: 지금 숫자를 크게, 그동안의 흐름은 작은 선으로. 선 끝(강조색 점)이 지금 숫자이고, 선 처음에는 처음 값을 작게 적는다.
 * 처음 값이 없으면 선의 높낮이만 보여서, 넓은 칸에서는 선이 무엇에서 무엇으로 왔는지 모르는 장식처럼 보였다
 */
export function Spark() {
  const { mode, slide } = useSlide()
  const { demo, read } = useDemo(['value', 'series'])
  // 흐름 칸만 비었으면(지금 숫자를 먼저 적은 때) 편집할 때는 안내 문구의 흐름을 옅게 그린다. 두 칸이 다 빌 때만 그리던 때는
  // 숫자를 적는 순간 선이 통째로 사라져, 숫자 아래에 빈 자리만 남고 흐름을 어디에 적는지 보이지 않았다
  const ghost = !demo && mode !== 'final' && !read('series').trim()
  const seriesText = ghost ? hintFor(slide.layout, slide.hints, 'series') : read('series')
  const pts = pointsOf(seriesText).slice(-24)
  const invalid = !!seriesText.trim() && tokensOf(seriesText).length > 0 && pts.length < 2
  const vs = pts.map((p) => p.v)
  const lo = Math.min(...vs)
  const hi = Math.max(...vs)
  // 위아래 끝의 점이 잘리지 않게 띄우는 것은 그림 상자가 한다 (spark.css의 .bk-sp-svg): 여기서는 위아래를 다 쓴다
  const at = vs.map((v, i) => ({ x: (i / Math.max(1, vs.length - 1)) * 100, y: hi === lo ? 50 : 100 - ((v - lo) / (hi - lo)) * 100 }))
  const line = at.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ')
  const first = at[0]
  const last = at[at.length - 1]
  return (
    <div className={cx('bk-sp', (demo || ghost) && 'is-demo')}>
      <div className="bk-sp-text">
        <T k="label" className="bk-sp-l" />
        <T k="value" className="bk-sp-v" oneLine numeral />
        <T k="note" className="bk-sp-n" />
        {mode === 'edit' && invalid && <p className="bk-sp-n">흐름은 같은 단위의 숫자를 두 개 이상 적어 주세요.</p>}
      </div>
      <div className="bk-sp-chart">
        {pts.length >= 2 && (
          <>
            {/* 처음 값: 선 처음 점의 왼쪽, 그 점과 같은 높이에 (작은 글자, 옅은 색) */}
            <span className="bk-sp-from" style={{ '--y': first.y }} aria-hidden="true">
              {minusSigns(pts[0].t)}
            </span>
            <div className="bk-sp-plot">
              <svg className="bk-sp-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                <path d={line} />
              </svg>
              <span className="bk-sp-start" style={{ '--y': first.y }} aria-hidden="true" />
              <span className="bk-sp-dot" style={{ '--x': last.x, '--y': last.y }} aria-hidden="true" />
            </div>
          </>
        )}
        {/* 흐름 숫자는 편집할 때 그림 자리에서 고친다(올리거나 누르면 숫자가 보인다). 발표 화면에는 선만.
            그림 아래에 줄을 따로 두면 편집 화면에서만 부품이 높아져 글자가 작아진다 */}
        {mode === 'edit' && <T k="series" className="bk-sp-s on-chart" />}
        {mode !== 'edit' && invalid && <T k="series" className="bk-sp-s" />}
      </div>
    </div>
  )
}

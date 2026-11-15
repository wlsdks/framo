// 부품: 겹침 (overlap). 모양은 styles/blocks/overlap.css, 움직임은 motion/engine.ts의 nativeAuto, 셈은 slides/overlap.ts

import type { CSSProperties } from 'react'
import { readField } from '../../deck/fields'
import { hintFor } from '../../deck/layouts'
import { cx } from '../../lib/cx'
import { useSlide } from '../context'
import { numberUnits, T, textUnits } from '../fields'
import { seriesIn, unfitValues } from '../numbers'
import { lensPath, overlapBox, overlapFigure, overlapShare } from '../overlap'
import { pctText } from './parts'

/** 그림(viewBox)에서 큰 원의 반지름 */
const R = 100
/** 양옆 이름표의 글 폭(em): 이보다 긴 이름은 꺾이고, 긴 숫자는 이 폭에 맞춰 준다. overlap.css의 --ov-name과 같은 값 */
const NAME_EM = 8
/** 집단의 크기는 이름보다 두 단계 큰 글자(overlap.css: 36 ÷ 26): 이름표의 폭을 어림할 때 이만큼 더 센다 */
const VALUE_K = 36 / 26
const VALUE_KEYS = ['leftValue', 'rightValue', 'bothValue'] as const

/**
 * 겹침: 두 집단을 원 둘로, 둘 다에 드는 것을 겹친 부분으로. 원의 넓이는 집단의 크기에, 겹친 부분의 넓이는 겹친 수에 비례한다
 * (slides/overlap.ts): 눈대중으로 겹쳐 그린 그림은 10%가 겹쳤는지 40%가 겹쳤는지 말하지 못한다. 이 그림의 답은 겹친 부분이라
 * 그곳만 강조색이고, 그 수를 큰 숫자로 따로 말한다(넓은 칸은 그림 왼쪽, 아니면 그림 아래). 두 원은 같은 옅은 농담이다:
 * 집단마다 색을 달리하면 겹친 곳이 셋째 색이 되어 답이 색 셋 가운데 하나가 된다. 집단의 이름과 크기는 원 바깥 양옆에 선다:
 * 원 안에 적으면 한쪽이 작거나 거의 다 겹칠 때 글이 설 자리가 없다.
 * 그림의 크기는 CSS가 칸에서 양옆 이름표를 뺀 자리로 정한다. 이름표의 폭은 여기서 글자 수로 어림해 넘긴다(--ov-lw).
 * 편집할 때 알리는 글과 틀린 칸의 밑줄은 차트들과 같은 것(edit.css의 .ed-warn, .is-unfit)이라 장의 글과 섞이지 않는다
 */
export function Overlap() {
  const { slide, meta, mode } = useSlide()
  const own = (k: string) => readField(slide, meta, k).trim()
  const hint = (k: string) => (mode !== 'final' ? hintFor(slide.layout, slide.hints, k).trim() : '')
  // 편집할 때 아직 적지 않은 값은 안내의 예시 값으로 그린다(넣자마자 어떤 그림인지 보이게). 예시 값이 섞인 그림은 옅게
  const demo = mode !== 'final' && VALUE_KEYS.some((k) => !own(k))
  const texts = VALUE_KEYS.map((k) => own(k) || hint(k))
  // 세 값을 한 잣대로 읽는다: 단위를 붙인 값('320명')도, 하나만 단위가 달라('40%') 견줄 수 없는 것도 가려낸다
  const series = seriesIn(texts)
  const [a, b, both] = series.ok ? series.values : [null, null, null]
  const figure = overlapFigure(a, b, both)
  // 다 적었는데 그릴 수 없을 때만 알린다(쓰는 중인 칸을 두고 재촉하지 않게). 편집할 때만: 발표할 때는 그림 없이 적은 글만 선다
  const wrong = mode === 'edit' && !demo && !figure
  // 셋 다 읽혔는데 그릴 수 없으면 겹치는 수가 작은 쪽보다 큰 것이다(overlapFigure가 null인 남은 까닭)
  const tooBig = wrong && a !== null && b !== null && both !== null && Math.min(a, b, both) >= 0 && Math.max(a, b) > 0
  // 어느 칸을 고치면 되는지: 겹치는 수, 아니면 읽을 수 없거나 단위가 다른 칸 (edit.css의 물결 밑줄)
  const unfit = !wrong ? [] : tooBig ? [false, false, true] : unfitValues(texts)
  // 틀린 값을 적는 동안에도 그림 자리는 지킨다: 값 하나를 고쳐 치는 사이('320'을 지우고 '3'을 친 때)마다 그림이 사라지고 글이 왼쪽
  // 위로 몰려, 숫자 하나를 잘못 쳤는데 컴포넌트가 망가진 것으로 보였다(검수). 겹치는 수가 큰 것은 작은 쪽이 다 든 그림으로,
  // 읽을 수 없는 값은 안내의 예시 값으로 옅게 그린다
  const example = () => {
    const s = seriesIn(VALUE_KEYS.map(hint))
    return s.ok ? overlapFigure(s.values[0], s.values[1], s.values[2]) : null
  }
  const sketch = !wrong ? null : tooBig ? overlapFigure(a, b, Math.min(a!, b!)) : example()
  const drawn = figure ?? sketch
  const smaller = tooBig && a! <= b! ? (['left', 'leftValue', '왼쪽'] as const) : (['right', 'rightValue', '오른쪽'] as const)
  const warning = !wrong
    ? ''
    : tooBig
      ? `겹치는 수는 ${own(smaller[0]) || smaller[2]}(${own(smaller[1])})보다 클 수 없어요.`
      : unfit.some(Boolean)
        ? '밑줄 친 값을 다른 값과 같은 단위의 0 이상 숫자로 적어 주세요.'
        : '두 크기 가운데 하나는 0보다 크게 적어 주세요.'
  const box = drawn && overlapBox(drawn)
  const ox = box ? -box.left * R : 0
  const oy = box ? (box.height * R) / 2 : 0
  // 발표할 때 두 원이 물러나 있다가 다가오는 거리(engine.ts): 서로 떨어져 보일 만큼(큰 원 반지름의 3할 틈). 닿을 듯한 자리에서
  // 떠나면 따로 있던 둘이 만나는 것이 아니라 붙어 있던 둘이 포개지는 것으로 보였다(필름). 떨어져 선 그림도 조금은 다가온다
  const from = drawn ? Math.max(0.25, (drawn.ra + drawn.rb + 0.3 - drawn.d) / 2) * R : 0

  // 겹친 수가 집단마다 얼마만큼인지: 이름을 적은 집단만, 겹친 것이 있을 때만 (예시 값으로 셈한 몫은 적지 않는다)
  const shares = demo || !figure || !(both! > 0) ? [] : (['left', 'right'] as const).flatMap((k, i) => {
    const p = overlapShare(both, i === 0 ? a : b)
    return own(k) && p !== null ? [{ k, name: own(k), pct: pctText(p) }] : []
  })
  const answered = mode !== 'final' || !!own('both') || !!own('bothValue')

  // 양옆 이름표의 폭(em)을 글자 수로 어림한다: 이름(길면 꺾인다)과 크기 가운데 넓은 쪽
  const labelW = (name: string, value: string) => Math.min(NAME_EM, Math.max(textUnits(own(name) || hint(name)), numberUnits(own(value) || hint(value) || '0') * VALUE_K)) * 1.05 + 0.3
  const vars = { '--ov-ar': box ? (box.width / box.height).toFixed(4) : '1', '--ov-lw': (labelW('left', 'leftValue') + labelW('right', 'rightValue')).toFixed(2) } as CSSProperties

  return (
    <div className={cx('bk-ov', (demo || !!sketch) && 'is-demo', !drawn && 'is-unknown')} style={vars}>
      <T k="heading" as="h3" className="bk-h" fit={[18, 32]} multiline />
      {warning && <p className="bk-ov-warn ed-warn" role="status">{warning}</p>}
      <div className="bk-ov-plot">
        <div className="bk-ov-g is-a">
          <T k="left" className="bk-ov-n" />
          <T k="leftValue" className={cx('bk-ov-v', unfit[0] && 'is-unfit')} oneLine numeral />
        </div>
        {drawn && box && (
          <div className="bk-ov-fig">
            <svg className="bk-ov-svg" viewBox={`0 0 ${(box.width * R).toFixed(2)} ${(box.height * R).toFixed(2)}`} data-from={from.toFixed(2)} aria-hidden="true">
              {drawn.ra > 0 && <circle className="bk-ov-c is-a" cx={ox.toFixed(2)} cy={oy.toFixed(2)} r={(drawn.ra * R).toFixed(2)} />}
              {drawn.rb > 0 && <circle className="bk-ov-c is-b" cx={(ox + drawn.d * R).toFixed(2)} cy={oy.toFixed(2)} r={(drawn.rb * R).toFixed(2)} />}
              {drawn.kind !== 'apart' && <path className="bk-ov-lens" d={lensPath(drawn, R, ox, oy)} />}
            </svg>
          </div>
        )}
        <div className="bk-ov-g is-b">
          <T k="right" className="bk-ov-n" />
          <T k="rightValue" className={cx('bk-ov-v', unfit[1] && 'is-unfit')} oneLine numeral />
        </div>
      </div>
      {answered && (
        <div className="bk-ov-ans">
          <div className="bk-ov-a">
            <T k="both" className="bk-ov-k" />
            <T k="bothValue" className={cx('bk-ov-bv', unfit[2] && 'is-unfit')} oneLine numeral />
          </div>
          {shares.length > 0 && (
            <p className="bk-ov-r">
              {shares.map((s) => (
                <span key={s.k} className="bk-ov-ri">
                  {s.name}의 <b>{s.pct}</b>
                </span>
              ))}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

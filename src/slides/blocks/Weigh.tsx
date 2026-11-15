// 부품: 저울 (weigh). 모양은 styles/blocks/weigh.css, 움직임은 motion/engine.ts의 nativeAuto, 셈은 slides/weigh.ts

import type { CSSProperties } from 'react'
import { hintFor } from '../../deck/layouts'
import { cx } from '../../lib/cx'
import { useSlide } from '../context'
import { IT, ItemTools, T } from '../fields'
import { seriesIn, unfitValues } from '../numbers'
import { weighAngle, weighFigure, weighGap } from '../weigh'

/**
 * 저울: 두 쪽(드는 것과 얻는 것, 지금 방식과 새 방식)에 무게를 올리면 저울대가 무거운 쪽으로 기운다. 이 그림의 답은
 * '어느 쪽이 얼마나 더 무거운가'라, 무거운 쪽의 숫자만 강조색이고 차이는 받침대 아래에서 한 번 말한다(비워 두면 셈한 값).
 * 한 쪽은 위에서부터 이름, 근거, 숫자다(품목과 합계처럼): 숫자가 저울대 바로 위에 앉아야 숫자의 높낮이가 곧 기울기다.
 * 숫자 아래에 근거를 두었을 때는 근거가 많은 쪽의 숫자가 더 높이 떠서, 수평인 저울에서도 한쪽이 가벼워 보였다(감성 검수).
 * 접시도 사슬도 눈금도 없다: 가는 저울대 하나와 받침대 하나, 그 위에 선 글뿐이다. 저울대는 무거운 쪽으로 갈수록 짙어진다.
 * 글은 기울지 않는다: 저울대만 기울고, 두 쪽의 글 묶음은 제 자리 아래의 저울대를 따라 위아래로만 움직인다. 묶음 아래의 사이는
 * 묶음 너비의 절반만큼 저울대가 올라오는 높이라(weigh.css의 .bk-wg-gapper), 글이 길어도 기운 저울대에 닿지 않는다.
 * 사람이 적는 것은 글뿐이다(이름, 숫자, 근거): 기울기도 무거운 쪽도 값에서 읽는다. 값을 읽을 수 없으면 수평에 강조 없이.
 * 편집할 때 알리는 글과 틀린 칸의 밑줄은 차트들과 같은 것(edit.css의 .ed-warn, .is-unfit)이라 장의 글과 섞이지 않는다
 */
export function Weigh() {
  const { slide, mode } = useSlide()
  const items = slide.items.slice(0, 2)
  // 편집할 때 아직 적지 않은 값은 안내의 예시 값으로 기울인다(넣자마자 어떤 그림인지 보이게). 예시 값이 섞인 그림은 옅게
  const demo = mode !== 'final' && items.some((it) => !it.value.trim())
  const texts = items.map((it, i) => it.value.trim() || (mode !== 'final' ? hintFor(slide.layout, slide.hints, 'value', 'value', i).trim() : ''))
  // 두 값을 한 잣대로 읽는다: 단위를 붙인 값('6시간')도, 단위가 달라('3건'과 '40%') 견줄 수 없는 것도 가려낸다
  const series = seriesIn(texts)
  const [a = null, b = null] = series.ok && items.length === 2 ? series.values : []
  const figure = weighFigure(a, b)

  // 다 적었는데 무게를 읽을 수 없을 때만 알린다(쓰는 중인 칸을 두고 재촉하지 않게). 편집할 때만: 발표할 때는 수평인 저울에 적은 글이 선다
  const wrong = mode === 'edit' && !demo && !figure
  const unfit = wrong ? unfitValues(texts) : []
  const warning = wrong ? (unfit.some(Boolean) ? '밑줄 친 값을 0 이상의 숫자로 적어 주세요. (예: 6시간)' : '두 값을 같은 단위로 적어 주세요.') : ''

  const tilt = figure?.tilt ?? 0
  // 예시 값으로 기울인 저울은 차이도 그 값에서 셈해 옅게 보인다: 이 자리가 저절로 채워진다는 것이 넣자마자 보인다
  const gap = figure ? weighGap(a!, b!, series.suffix) : ''
  const vars = { '--wg-t': tilt.toFixed(4), '--wg-abs': Math.abs(tilt).toFixed(4), '--wg-a': `${weighAngle(tilt).toFixed(3)}deg` } as CSSProperties

  return (
    <div className={cx('bk-wg', demo && 'is-demo', figure?.heavy === 0 && 'is-left', figure?.heavy === 1 && 'is-right')} style={vars}>
      <T k="heading" as="h3" className="bk-h" fit={[18, 32]} multiline />
      {warning && <p className="bk-wg-warn ed-warn" role="status">{warning}</p>}
      <div className="bk-wg-plot" data-tilt={tilt.toFixed(4)} data-first={figure?.first ?? 0}>
        {items.map((it, i) => (
          <div key={it.id} className={cx('it bk-wg-side', i === 0 ? 'is-a' : 'is-b', figure?.heavy === i && 'is-heavy')}>
            <IT i={i} k="title" className="bk-wg-n" />
            <IT i={i} k="body" className="bk-wg-m" multiline />
            <IT i={i} k="value" className={cx('bk-wg-v', unfit[i] && 'is-unfit')} oneLine numeral />
            <span className="bk-wg-gapper" />
            <ItemTools i={i} />
          </div>
        ))}
        <div className="bk-wg-foot">
          <span className="bk-wg-beam" aria-hidden="true">
            <span className="bk-wg-ink" />
          </span>
          <span className="bk-wg-post" aria-hidden="true" />
          <T k="gap" className="bk-wg-gap" auto={gap || undefined} oneLine />
        </div>
      </div>
    </div>
  )
}

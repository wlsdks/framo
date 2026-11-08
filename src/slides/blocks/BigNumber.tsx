// 부품: 큰 숫자 (number). 모양은 styles/blocks/number.css

import { readField } from '../../deck/fields'
import { useSlide } from '../context'
import { T } from '../fields'

/** 짧은 값(띄어쓰기를 빼고 세 글자까지: 'D', '7', '3배'): 넓고 높은 칸에서 칸 높이를 따라 크게 그린다(number.css) */
const SHORT = 3

export function BigNumber() {
  const { slide, meta } = useSlide()
  const value = readField(slide, meta, 'value').replace(/\s/g, '')
  return (
    <div className="bk-num" data-short={value && [...value].length <= SHORT ? '' : undefined}>
      <T k="label" className="bk-num-l" />
      <T k="value" className="bk-num-v" oneLine numeral />
      <T k="note" className="bk-num-n" multiline />
    </div>
  )
}

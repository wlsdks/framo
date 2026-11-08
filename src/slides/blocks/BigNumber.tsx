// 부품: 큰 숫자 (number). 모양은 styles/blocks/number.css

import { shortNumber } from '../../deck/blocks'
import { readField } from '../../deck/fields'
import { useSlide } from '../context'
import { T } from '../fields'

export function BigNumber() {
  const { slide, meta } = useSlide()
  // 짧은 값은 넓고 높은 칸에서 칸 높이를 따라 크게 그린다(number.css)
  return (
    <div className="bk-num" data-short={shortNumber(readField(slide, meta, 'value')) ? '' : undefined}>
      <T k="label" className="bk-num-l" />
      <T k="value" className="bk-num-v" oneLine numeral />
      <T k="note" className="bk-num-n" multiline />
    </div>
  )
}

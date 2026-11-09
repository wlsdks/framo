// 부품: 걱정과 대책 (risks). 모양은 styles/blocks/risks.css

import type { CSSProperties } from 'react'
import { BLOCKS } from '../../deck/blocks'
import { ArrowMark } from '../arrow'
import { useSlide } from '../context'
import { IT, ItemTools, T, textUnits } from '../fields'

/** 걱정과 대책: 걱정되는 점 옆에 막는 방법. 대책이 '답'이라 강조색은 대책 쪽에만 */
export function Risks() {
  const { slide } = useSlide()
  const items = slide.items.slice(0, BLOCKS.risks.items!.max)
  // 가장 긴 걱정의 너비(본문 글자 em, 줄을 바꿔 적었으면 가장 긴 줄). 넓은 칸은 걱정 단을 이만큼만 잡아 대책을 걱정 가까이 둔다(risks.css)
  const worry = Math.max(0, ...items.flatMap((it) => it.title.split('\n').map((line) => (line.trim() ? textUnits(line.trim()) : 0))))
  return (
    <div className="bk-rk" style={worry ? ({ '--rk-tw': worry.toFixed(2) } as CSSProperties) : undefined}>
      <T k="heading" as="h3" className="bk-h" fit={[18, 32]} multiline />
      <div className="bk-rk-head" aria-hidden="true">
        <span className="bk-rk-hk">걱정되는 점</span>
        <span className="bk-rk-hk is-fix">대책</span>
      </div>
      <ul className="bk-rk-list" data-n={items.length}>
        {items.map((it, i) => (
          <li key={it.id} className="it bk-rk-row">
            <IT i={i} k="title" className="bk-rk-t" multiline />
            <span className="bk-rk-arrow" aria-hidden="true">
              <ArrowMark />
            </span>
            <IT i={i} k="body" className="bk-rk-b" multiline />
            <ItemTools i={i} pair />
          </li>
        ))}
      </ul>
    </div>
  )
}

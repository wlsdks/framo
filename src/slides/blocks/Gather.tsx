// 부품: 흩어진 것 모으기 (gather). 모양은 styles/blocks/gather.css, 움직임은 motion/engine.ts의 nativeAuto

import type { CSSProperties } from 'react'
import { BLOCKS } from '../../deck/blocks'
import { isBlankItem } from '../../deck/fields'
import { useSlide } from '../context'
import { IT, ItemTools, T } from '../fields'

/**
 * 흩어진 것 모으기: 여러 곳에 흩어진 것이 한 이름 아래 정돈되는 장면. 다 보인 모습은 위에 모이는 곳의 이름(크게)과 그 아래 가는 선,
 * 선 아래에 모인 것들이 고르게 줄 선 목록. 모이고 퍼지기(가운데 원과 곡선)와 달리 '어지러운 것이 정리된다'가 주인공이라,
 * 발표할 때 조각들이 장 여기저기에 흩어져 나타났다가 제자리로 날아와 줄을 선다(engine.ts)
 */
export function Gather() {
  const { slide, mode } = useSlide()
  const all = slide.items.slice(0, BLOCKS.gather.items!.max).map((it, i) => ({ it, i }))
  const shown = mode === 'final' ? all.filter(({ it }) => !isBlankItem(it)) : all
  return (
    <div className="bk-gt2" data-n={shown.length} style={{ '--n': shown.length } as CSSProperties}>
      <div className="bk-gt2-head">
        <T k="center" className="bk-gt2-c" multiline />
        <T k="note" className="bk-gt2-n" multiline />
      </div>
      <ol className="bk-gt2-list">
        {shown.map(({ it, i }, k) => (
          <li key={it.id} className="it bk-gt2-it" style={{ '--k': k } as CSSProperties}>
            <IT i={i} k="title" className="bk-gt2-t" multiline />
            <IT i={i} k="meta" className="bk-gt2-m" multiline />
            <ItemTools i={i} />
          </li>
        ))}
      </ol>
    </div>
  )
}

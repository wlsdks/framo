// 부품: 바뀌기 (wipe). 모양은 styles/blocks/wipe.css, 움직임은 motion/engine.ts의 nativeAuto

import type { CSSProperties } from 'react'
import { BLOCKS } from '../../deck/blocks'
import { isBlankItem } from '../../deck/fields'
import { useSlide } from '../context'
import { IT, ItemTools, T } from '../fields'

/**
 * 바뀌기: 지금의 모습이 바뀐 뒤의 모습으로 넘어가는 장면. 줄마다 지금(옅은 글, 가는 취소선)과 바뀐 뒤(크고 굵게)를 한 줄에 둔다.
 * 비교(두 단의 표)와 달리 '넘어간다'가 주인공이라, 발표할 때 세로 선 하나가 왼쪽에서 오른쪽으로 훑고 지나가며 지금에 줄을 긋고
 * 바뀐 뒤를 드러낸다(engine.ts). 다 보인 모습에서도 취소선과 크기로 앞뒤가 읽힌다
 */
export function Wipe() {
  const { slide, mode } = useSlide()
  const all = slide.items.slice(0, BLOCKS.wipe.items!.max).map((it, i) => ({ it, i }))
  const shown = mode === 'final' ? all.filter(({ it }) => !isBlankItem(it)) : all
  return (
    <div className="bk-wp" data-n={shown.length}>
      <div className="bk-wp-head">
        <T k="from" className="bk-wp-hf" oneLine />
        <T k="to" className="bk-wp-ht" oneLine />
      </div>
      <ol className="bk-wp-list">
        {shown.map(({ it, i }, k) => (
          <li key={it.id} className="it bk-wp-row" style={{ '--k': k } as CSSProperties}>
            <span className="bk-wp-was">
              <IT i={i} k="title" className="bk-wp-old" multiline />
            </span>
            <IT i={i} k="body" className="bk-wp-new" multiline />
            <ItemTools i={i} />
          </li>
        ))}
      </ol>
      <span className="bk-wp-bar" aria-hidden="true" />
    </div>
  )
}

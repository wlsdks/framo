// 부품: 여기저기 찾기 (search). 모양은 styles/blocks/search.css, 움직임은 motion/engine.ts의 nativeAuto

import type { CSSProperties } from 'react'
import { BLOCKS } from '../../deck/blocks'
import { isBlankItem } from '../../deck/fields'
import { useSlide } from '../context'
import { IT, ItemTools, T } from '../fields'

/**
 * 여기저기 찾기: 하나를 찾으려고 여러 곳을 차례로 뒤지는 장면. 왼쪽에 뒤진 곳의 수(크게, 01 02 …), 오른쪽에 곳들이 자의 눈금처럼
 * 한 줄로 선다. 발표할 때 강조색 커서가 곳에서 곳으로 건너뛰고, 건너뛸 때마다 수가 하나씩 오르며 지나간 곳은 옅어진다(engine.ts).
 * 수는 적힌 곳의 수 그대로라 지어낸 숫자가 아니다
 */
export function Search() {
  const { slide, mode } = useSlide()
  const all = slide.items.slice(0, BLOCKS.search.items!.max).map((it, i) => ({ it, i }))
  const shown = mode === 'final' ? all.filter(({ it }) => !isBlankItem(it)) : all
  const n = shown.length
  return (
    <div className="bk-sr" data-n={n} style={{ '--n': n } as CSSProperties}>
      <div className="bk-sr-count">
        <T k="heading" className="bk-sr-l" multiline />
        <p className="bk-sr-num">
          <span className="bk-sr-k">{n}</span>
          <T k="unit" as="span" className="bk-sr-u" oneLine />
        </p>
        <T k="result" className="bk-sr-r" multiline />
      </div>
      <ol className="bk-sr-list">
        {shown.map(({ it, i }, k) => (
          <li key={it.id} className="it bk-sr-it" style={{ '--k': k } as CSSProperties}>
            <IT i={i} k="title" className="bk-sr-t" multiline />
            <IT i={i} k="meta" className="bk-sr-m" multiline />
            <ItemTools i={i} />
          </li>
        ))}
      </ol>
    </div>
  )
}

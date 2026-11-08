// 부품: 같은 대상, 다른 이름 (aliases). 모양은 styles/blocks/aliases.css, 움직임은 motion/engine.ts의 nativeAuto

import type { CSSProperties } from 'react'
import { BLOCKS } from '../../deck/blocks'
import { isBlankItem } from '../../deck/fields'
import { useSlide } from '../context'
import { IT, ItemTools, T } from '../fields'

/**
 * 같은 대상, 다른 이름: 하나를 곳마다 다르게 부르는 모습. 위에 대상(크게), 아래에 곳마다 부르는 이름(이름과 그 이름을 쓰는 곳)을
 * 한 줄로. 발표할 때 위의 대상 글자가 곳마다 부르는 이름으로 차례로 바뀌고(그 이름이 아래에서 밝아진다), 마지막에 원래 이름으로
 * 돌아온다(engine.ts). '같은 것인데 이름만 다르다'가 움직임으로 보인다
 */
export function Aliases() {
  const { slide, mode } = useSlide()
  const all = slide.items.slice(0, BLOCKS.aliases.items!.max).map((it, i) => ({ it, i }))
  const shown = mode === 'final' ? all.filter(({ it }) => !isBlankItem(it)) : all
  return (
    <div className="bk-al" data-n={shown.length} style={{ '--n': shown.length } as CSSProperties}>
      <div className="bk-al-head">
        <T k="label" className="bk-al-l" oneLine />
        <T k="center" className="bk-al-c" oneLine />
        <T k="note" className="bk-al-n" multiline />
      </div>
      <ol className="bk-al-list">
        {shown.map(({ it, i }, k) => (
          <li key={it.id} className="it bk-al-it" style={{ '--k': k } as CSSProperties}>
            <IT i={i} k="title" className="bk-al-t" oneLine />
            <IT i={i} k="meta" className="bk-al-m" oneLine />
            <ItemTools i={i} />
          </li>
        ))}
      </ol>
    </div>
  )
}

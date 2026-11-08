// 부품: 관문 (gate). 모양은 styles/blocks/gate.css, 움직임은 motion/engine.ts의 nativeAuto

import type { CSSProperties } from 'react'
import { BLOCKS } from '../../deck/blocks'
import { isBlankItem } from '../../deck/fields'
import { cx } from '../../lib/cx'
import { useSlide } from '../context'
import { IT, ItemTools, T } from '../fields'

/** 거르는 관문: 고른 것이 있으면 그것, 없으면 가운데쯤 */
export function gateDrop(chosen: number | undefined, n: number): number {
  if (Number.isInteger(chosen) && chosen! >= 0 && chosen! < n) return chosen!
  return Math.min(n - 1, Math.floor(n / 2))
}

/**
 * 관문: 들어온 것이 관문을 하나씩 지나 나간다. 가운데 가는 통로(가로선) 위에 관문마다 통로를 가로지르는 높은 눈금, 관문 이름은 위,
 * 하는 일은 아래. 왼쪽 끝에 들어오는 것, 오른쪽 끝에 나가는 것. 거르는 관문 하나는 눈금이 강조색이고 그 아래에 걸러지는 것을 적는다.
 * 발표할 때 조각이 통로를 따라 관문을 지나고, 거르는 관문에서 몇 개는 아래로 떨어진다(engine.ts)
 */
export function Gate() {
  const { slide, mode } = useSlide()
  const all = slide.items.slice(0, BLOCKS.gate.items!.max).map((it, i) => ({ it, i }))
  const shown = mode === 'final' ? all.filter(({ it }) => !isBlankItem(it)) : all
  const drop = gateDrop(slide.options.highlight, shown.length)
  return (
    <div className="bk-gw" data-n={shown.length} style={{ '--n': shown.length } as CSSProperties}>
      <T k="from" className="bk-gw-in" multiline />
      <ol className="bk-gw-list">
        {shown.map(({ it, i }, k) => (
          <li key={it.id} className={cx('it bk-gw-g', k === drop && 'is-drop')} style={{ '--k': k } as CSSProperties}>
            <IT i={i} k="title" className="bk-gw-t" multiline />
            <div className="bk-gw-below">
              <IT i={i} k="meta" className="bk-gw-m" multiline />
              {k === drop && <T k="dropped" className="bk-gw-x" multiline />}
            </div>
            <ItemTools i={i} />
          </li>
        ))}
      </ol>
      <T k="to" className="bk-gw-out" multiline />
    </div>
  )
}

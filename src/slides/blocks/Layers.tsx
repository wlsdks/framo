// 부품: 층 (layers). 모양은 styles/blocks/layers.css, 움직임은 motion/engine.ts의 nativeAuto

import type { CSSProperties } from 'react'
import { BLOCKS } from '../../deck/blocks'
import { isBlankItem } from '../../deck/fields'
import { useSlide } from '../context'
import { IT, ItemTools, T } from '../fields'

/**
 * 층: 위에서 아래로 쌓인 층(쓰는 것 → 잇는 것 → 바탕). 층마다 이름(크게)과 무엇이 있는지(옆에), 층 사이는 가는 선, 왼쪽에 층을 꿰는
 * 세로 축과 층마다 눈금. 흐름(가로 상자)과 달리 '위가 아래에 기대어 선다'가 주인공이라, 발표할 때 층이 위에서부터 쌓이고 요청 조각이
 * 축을 타고 맨 아래까지 내려갔다가 답으로 올라온다(engine.ts)
 */
export function Layers() {
  const { slide, mode } = useSlide()
  const all = slide.items.slice(0, BLOCKS.layers.items!.max).map((it, i) => ({ it, i }))
  const shown = mode === 'final' ? all.filter(({ it }) => !isBlankItem(it)) : all
  return (
    <div className="bk-ly" data-n={shown.length}>
      <T k="heading" as="h3" className="bk-h" fit={[18, 32]} multiline />
      <ol className="bk-ly-list">
        {shown.map(({ it, i }, k) => (
          <li key={it.id} className="it bk-ly-row" style={{ '--k': k } as CSSProperties}>
            <IT i={i} k="title" className="bk-ly-t" multiline />
            <IT i={i} k="meta" className="bk-ly-m" multiline />
            <ItemTools i={i} />
          </li>
        ))}
      </ol>
    </div>
  )
}

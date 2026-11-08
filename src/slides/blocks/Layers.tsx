// 부품: 층 (layers). 모양은 styles/blocks/layers.css, 움직임은 motion/engine.ts의 nativeAuto

import type { CSSProperties } from 'react'
import { BLOCKS } from '../../deck/blocks'
import { isBlankItem } from '../../deck/fields'
import { cx } from '../../lib/cx'
import { useSlide } from '../context'
import { IT, ItemTools, T } from '../fields'

/** 강조할 층: 고른 것이 있으면 그것, 없으면 강조 없음(-1). 층에는 정해진 답이 없어서 둘째 층을 기본으로 칠하면 뜻 없는 강조가 됐다 */
function layersHighlight(chosen: number | undefined, n: number): number {
  return Number.isInteger(chosen) && chosen! >= -1 && chosen! < n ? chosen! : -1
}

/**
 * 층: 글자 위계와 여백으로 쌓은 지층. 층마다 이름(소제목 단계)과 무엇이 있는지(본문 단계)를 한 줄에 두고, 위층일수록 왼쪽을
 * 들여 아래가 넓게 받치는 계단이 된다. 넓은 칸에서는 층마다 그 층 너비만큼의 옅은 1px 선을 글 아래에 깔아 아래로 갈수록 넓어지는
 * 지층의 단면으로 읽힌다(styles/blocks/layers.css). 강조할 층 하나만 글자와 선이 강조색이다.
 * 예전에는 이름 | 설명 두 단의 줄 선 표(예전 PPT 규격), 그다음은 비스듬히 본 입체 판(PPT 도형 모음처럼 읽혔다)이었다(검수).
 * 발표할 때는 맨 아래 선부터 그어지고 위로 한 층씩 쌓이며 글이 맺힌다(engine.ts)
 */
export function Layers() {
  const { slide, mode } = useSlide()
  const all = slide.items.slice(0, BLOCKS.layers.items!.max).map((it, i) => ({ it, i }))
  const shown = mode === 'final' ? all.filter(({ it }) => !isBlankItem(it)) : all
  const hl = layersHighlight(slide.options.highlight, shown.length)
  return (
    <div className="bk-ly" data-n={shown.length} style={{ '--n': shown.length } as CSSProperties}>
      <T k="heading" as="h3" className="bk-h" fit={[18, 32]} multiline />
      <ol className="bk-ly-list">
        {shown.map(({ it, i }, k) => (
          <li key={it.id} className={cx('it bk-ly-row', k === hl && 'is-hl')} style={{ '--k': k } as CSSProperties}>
            <div className="bk-ly-txt">
              <IT i={i} k="title" className="bk-ly-t" multiline />
              <IT i={i} k="meta" className="bk-ly-m" multiline />
            </div>
            {/* 지층 선: 그려진 그림(aria-hidden)이라 맞추기와 검사가 칸의 너비를 이 선까지 센다(가상 요소면 글만 세어 오른쪽이 빈 것으로 봤다) */}
            <span className="bk-ly-rule" aria-hidden="true" />
            <ItemTools i={i} />
          </li>
        ))}
      </ol>
    </div>
  )
}

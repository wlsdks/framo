// 부품: 층 (layers). 모양은 styles/blocks/layers.css, 움직임은 motion/engine.ts의 nativeAuto

import type { CSSProperties } from 'react'
import { BLOCKS } from '../../deck/blocks'
import { isBlankItem } from '../../deck/fields'
import { cx } from '../../lib/cx'
import { useSlide } from '../context'
import { IT, ItemTools, T } from '../fields'

/** 강조할 층: 고른 것이 있으면 그것(-1은 강조 없음), 없으면 둘째 층(쓰는 화면과 바탕 사이, 대개 새로 놓는 층). 층이 하나면 그것 */
function layersHighlight(chosen: number | undefined, n: number): number {
  if (Number.isInteger(chosen) && chosen! >= -1 && chosen! < n) return chosen!
  return Math.min(1, n - 1)
}

/**
 * 층: 위에서 비스듬히 본 얇은 판이 사이를 두고 포개진 그림. 맨 위가 쓰는 쪽, 맨 아래가 받치는 바탕이다. 판은 옅은 농담과 1px 선으로
 * 그리고(글은 판 안이 아니라 옆에) 층 이름과 무엇이 있는지는 판 옆에 글자 위계로 둔다. 강조할 층 하나만 판과 이름이 강조색이다.
 * 예전에는 이름 | 설명 두 단의 줄 선 표라서, 판을 혼자 쓰면 빽빽한 세 줄 표로만 보이고 '층'이 읽히지 않았다(사용자: 예전 PPT 규격 같다).
 * 발표할 때는 맨 아래 판부터 차례로 내려앉아 쌓이고 글은 제자리에서 나타난다(engine.ts)
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
            {/* 판: 비스듬히 본 얇은 판. 윗면과 두께(앞면, 옆면)를 옅은 농담으로 칠해 속이 빈 테두리가 아니라 놓인 판으로 읽힌다.
                늘이는 그림이라 선 굵기는 그대로(non-scaling-stroke) */}
            <svg className="bk-ly-plate" viewBox="0 0 100 112" preserveAspectRatio="none" aria-hidden="true">
              <polygon className="bk-ly-top" points="24,0.5 99.5,0.5 76,99.5 0.5,99.5" vectorEffect="non-scaling-stroke" />
              <polygon className="bk-ly-front" points="0.5,99.5 76,99.5 76,111.5 0.5,111.5" vectorEffect="non-scaling-stroke" />
              <polygon className="bk-ly-side" points="76,99.5 99.5,0.5 99.5,12.5 76,111.5" vectorEffect="non-scaling-stroke" />
            </svg>
            <div className="bk-ly-txt">
              <IT i={i} k="title" className="bk-ly-t" multiline />
              <IT i={i} k="meta" className="bk-ly-m" multiline />
            </div>
            <ItemTools i={i} />
          </li>
        ))}
      </ol>
    </div>
  )
}

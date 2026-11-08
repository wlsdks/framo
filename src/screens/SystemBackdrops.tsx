import { useMemo } from 'react'
import { BACKDROPS, baseBackdrop } from '../deck/backdrops'
import type { Deck, LayoutId, Slide } from '../deck/types'
import { backdrops } from '../slides/Backdrop'
import type { SlideMode } from '../slides/context'
import { ScaledSlide, SlideCanvas } from '../slides/SlideCanvas'

// 장 모음의 '배경 모션': 배경마다 어울리는 장 하나에 깔아 보인다. 마우스를 올리면 발표할 때처럼 한 번 들어온다(생동감).
// 장 모음이 보이는 테마와 강조색을 그대로 따른다

const played = new WeakMap<Element, number>()

export function SystemBackdrops({ deck, examples, mode, width, cols, gap }: { deck: Deck; examples: Map<LayoutId, Slide>; mode: SlideMode; width: number; cols: number; gap: number }) {
  const slides = useMemo(
    () =>
      BACKDROPS.flatMap((b) => {
        const s = examples.get(b.showOn)
        return s ? [{ spec: b, slide: { ...s, id: `bd-${b.id}`, backdrop: baseBackdrop(s, b.id) } }] : []
      }),
    [examples],
  )
  const play = (card: HTMLElement) => {
    const el = card.querySelector<HTMLElement>('.s-bd')
    const now = performance.now()
    // 움직이는 중에 다시 올려도 처음부터 다시 하지 않는다
    if (!el || now - (played.get(el) ?? -1e9) < 3400) return
    played.set(el, now)
    backdrops.play(el, 'calm', 0)
  }
  return (
    <div className="sys-thumbs" style={{ '--cols': cols, '--gap': `${gap}px` }}>
      {slides.map(({ spec, slide }) => (
        <figure key={spec.id} className="sys-thumb" onPointerEnter={(e) => play(e.currentTarget)}>
          <ScaledSlide width={width} decorative>
            <SlideCanvas deck={deck} slide={slide} mode={mode} />
          </ScaledSlide>
          <figcaption>
            <b>{spec.name}</b>
            <span>{spec.description}</span>
            <span>어울리는 슬라이드: {spec.fits}</span>
          </figcaption>
        </figure>
      ))}
    </div>
  )
}

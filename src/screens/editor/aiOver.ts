// AI에게 알릴 넘침. 모양(src/ai/share.ts)은 발표 모델만으로 만들어서 글이 화면에서 넘쳤는지 모른다.
// 그래서 편집기가 그려 둔 장을 재서 넘겨준다. 모양에는 넘쳤는지(참거짓)만 해시 id에 붙어 나간다.

import type { ShapeOver } from '../../ai/share'
import type { Deck } from '../../deck/types'
import { overBoxes } from '../../slides/overflow'

/**
 * 글이 넘친 장과 컴포넌트(원래 id). 왼쪽 목록의 작은 그림(실제 크기로 그린 장을 줄여 보인 것)을 편집기의 '글이 넘쳤어요'와 같은 잣대로 잰다
 * (발표 전 확인 presentLaunch.tsx의 presentCheck와 같은 그림). 따로 그려 재면 장마다 다시 그리느라 느리다.
 * 그림이 없는 장(목록을 접은 좁은 창, 아직 그리지 않은 그림)은 모르니 넘치지 않은 것으로 둔다
 */
export function measureOver(deck: Deck): ShapeOver {
  const slides = new Set<string>()
  const blocks = new Set<string>()
  for (const s of deck.slides) {
    const root = document.getElementById(`thumb-${s.id}`)?.querySelector<HTMLElement>('.slide')
    if (!root) continue
    const { wide, tall } = overBoxes(root)
    if (wide || tall.length) slides.add(s.id)
    // 넘친 상자가 컴포넌트 안이면 그 컴포넌트도 (컴포넌트의 안쪽 .bk-in, 레이아웃 컴포넌트의 본문 칸)
    for (const box of tall) {
      const id = box.closest<HTMLElement>('.bk[data-block]')?.dataset.block
      if (id) blocks.add(id)
    }
  }
  return { slides, blocks }
}

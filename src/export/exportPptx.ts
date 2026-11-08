// PPT로 내보내기(그림): 장마다 발표할 때 모습 그대로의 그림 한 장, 노트 칸에는 발표자 노트.
// 글은 그림이라 PowerPoint에서 고칠 수 없다. 사용자가 고른 방식이다(고칠 수 있는 PPT는 레이아웃을 PowerPoint 도형으로 다시 짜야 한다).
// 노트가 들어가므로 HTML 발표 파일과 달리 남에게 보내기 전에 확인해야 한다(메뉴 설명에 적어 둔다).

import type { Deck } from '../deck/types'
import { safeFileName } from '../store/deckFile'
import { deckToPptx, PPTX_TYPE } from './pptx'
import { createSlideRasterizer } from './rasterize'

function pptxFileName(title: string): string {
  return `${safeFileName(title, '발표')}.pptx`
}

/** PPT 파일을 만들어 내려받는다. onProgress(지금 장, 모든 장)는 장을 그리기 시작할 때마다 */
export async function downloadPptx(deck: Deck, onProgress?: (done: number, total: number) => void): Promise<void> {
  const r = createSlideRasterizer(deck)
  let bytes: Uint8Array<ArrayBuffer>
  try {
    bytes = await deckToPptx(deck, async (slide, i, total) => {
      onProgress?.(i + 1, total)
      return new Uint8Array(await (await r.shoot(slide)).arrayBuffer())
    })
  } finally {
    r.close()
  }
  const url = URL.createObjectURL(new Blob([bytes], { type: PPTX_TYPE }))
  const a = document.createElement('a')
  a.href = url
  a.download = pptxFileName(deck.title)
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 2000)
}

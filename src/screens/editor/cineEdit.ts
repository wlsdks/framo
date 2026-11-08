// 편집기에서 모션 그래픽을 다루는 일: 넣기(틀이나 내 라이브러리에서), 손잡이 바꾸기, 새 버전으로 남기기(봉인).
// 레시피는 발표가 품는다(deck.cines). 부품은 버전 id만 가리키고(block.cine), 레시피와 부품은 한 고침에 같이 들어간다(stageCine).
// 모션 편집에서 고친 것은 바로 라이브러리에 쌓지 않고 편집을 닫거나 장을 옮길 때 한 버전으로 남긴다: 손잡이를 누를 때마다 버전이 생기면
// v17 같은 번호만 늘고 어느 것이 쓰던 것인지 알 수 없다

import { canCompose, makeBlock } from '../../deck/blocks'
import { presetSpec, withKnob, type CineKnob } from '../../deck/cine'
import type { Block, CineRecipe, Deck, Slide } from '../../deck/types'
import { sealCine } from '../../store/cines'
import { stageCine, useDeck } from '../../store/deckStore'
import type { BlockEditing } from './BlockEditor'

/** 모션 편집을 열어 달라는 알림(고를 부품 id). 넣자마자 장면을 보이고 손잡이를 고르게 */
export const OPEN_STUDIO = 'framo-open-studio'

/** 고친 모션 그래픽: 부품 id → 처음 고치기 전의 버전 id(새로 넣은 틀이면 없다) */
const dirty = new Map<string, string | undefined>()

/**
 * 이 장에 넣는다. 컴포넌트를 넣지 않는 장(표지, 섹션)이거나 이미 모션 그래픽이 있거나 자리가 없으면 이 장 다음에 새 컴포넌트 장을 만들어 넣는다(물어보고 기다리게 하지
 * 않는다: 모션 그래픽은 판을 다 쓰는 장면이라 새 장이 대개 맞다). 넣은 부품 id
 */
export function insertCine(recipe: CineRecipe, blocks: BlockEditing, slide: Slide, fresh: boolean): string {
  const id = stageCine(recipe)
  // 칸에는 틀의 지어낸 예시 글을 넣는다: 빈 칸이면 발표 모습(모션 편집의 무대)에 그릴 글자가 없어 장면이 비었다. 슬라이드 위에서 바로 고쳐 쓴다
  const sample = presetSpec(recipe.preset).sample as Record<string, string>
  const block: Block = { ...makeBlock('cine'), fields: { ...sample }, cine: id, examples: Object.keys(sample) }
  if (fresh) dirty.set(block.id, undefined)
  const closed = slide.layout !== 'compose' && !canCompose(slide.layout)
  // 한 장에 모션 그래픽은 하나(장면의 무대는 하나다): 이미 있으면 새 장에
  const taken = (slide.blocks ?? []).some((b) => b.type === 'cine') && slide.layout === 'compose'
  if (closed || taken || blocks.issueFor(block)) blocks.insertNew(block)
  else blocks.insertBlock(block)
  requestAnimationFrame(() => window.dispatchEvent(new CustomEvent(OPEN_STUDIO, { detail: block.id })))
  return block.id
}

/** 손잡이 하나를 바꾼다: 새 레시피(새 버전 id)로 부품을 바꾸고, 다음 봉인 때 남길 것으로 적어 둔다 */
export function setKnob(slideId: string, block: Block, recipe: CineRecipe, knob: CineKnob, value: string | boolean): void {
  const id = stageCine(withKnob(recipe, knob, value))
  if (id === block.cine) return
  if (!dirty.has(block.id)) dirty.set(block.id, block.cine)
  useDeck.getState().updateBlock(slideId, block.id, (b) => ({ ...b, cine: id }), `cine.${block.id}`)
}

/** 다른 버전(라이브러리의 새 버전)으로 바꾼다. 칸의 글은 그대로다(없어진 칸의 글도 지우지 않는다) */
export function switchVersion(slideId: string, block: Block, recipe: CineRecipe): void {
  const id = stageCine(recipe)
  useDeck.getState().updateBlock(slideId, block.id, (b) => ({ ...b, cine: id }))
}

/** 고친 모션 그래픽을 라이브러리에 새 버전으로 남긴다(모션 편집을 닫거나 장을 옮길 때) */
export async function sealDirty(deck: Deck | null): Promise<void> {
  if (!deck || !dirty.size) return
  const list = [...dirty]
  dirty.clear()
  for (const [blockId, parent] of list) {
    const block = deck.slides.flatMap((s) => s.blocks ?? []).find((b) => b.id === blockId)
    const recipe = block?.cine ? deck.cines?.[block.cine] : undefined
    if (recipe) await sealCine(recipe, parent)
  }
}

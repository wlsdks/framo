// 편집기에서 모션 그래픽을 다루는 일: 넣기(틀이나 내 라이브러리에서), 손잡이 바꾸기, 새 버전으로 남기기(봉인).
// 레시피는 발표가 품는다(deck.cines). 부품은 버전 id만 가리키고(block.cine), 레시피와 부품은 한 고침에 같이 들어간다(stageCine).
// 모션 편집에서 고친 것은 바로 라이브러리에 쌓지 않고 편집을 닫거나 장을 옮길 때 한 버전으로 남긴다: 손잡이를 누를 때마다 버전이 생기면
// v17 같은 번호만 늘고 어느 것이 쓰던 것인지 알 수 없다

import { asCompose, canCompose, HEAD_KEYS, makeBlock, WHOLE } from '../../deck/blocks'
import { presetSpec, withKnob, type CineKnob } from '../../deck/cine'
import { isBlankItem } from '../../deck/fields'
import type { Block, CineRecipe, Deck, Slide } from '../../deck/types'
import { sealCine } from '../../store/cines'
import { stageCine, stageHead, useDeck } from '../../store/deckStore'
import { undoAction, type Toast } from '../ui'

/** 모션 편집을 열어 달라는 알림(고를 부품 id). 넣자마자 장면을 보이고 손잡이를 고르게 */
export const OPEN_STUDIO = 'framo-open-studio'

/**
 * 고친 모션 그래픽: 부품 id → 처음 고치기 전의 버전 id(새로 넣은 틀이면 없다). 손잡이를 바꾼 것만 남긴다: 틀을 넣고 그대로 닫은 것까지
 * 남기던 때는, 넣었다가 되돌린 틀도 내 컴포넌트에 '버전 1'로 쌓여 넣지 않은 것이 왜 있는지 헷갈렸다(틀은 언제든 컴포넌트의 '모션 그래픽'에 있다)
 */
const dirty = new Map<string, string | undefined>()

/** 틀에서 새로 넣은 부품 id. 손잡이를 처음 바꿀 때 고치기 전 버전이 없는(새 갈래의) 것으로 남긴다 */
const fresh = new Set<string>()

/**
 * 모션 그래픽을 이 장에 두지 않고 다음에 새 장을 만들어 넣는지. 장면은 장 하나를 통째로 쓸 때 장면이 되므로, 장에 다른 내용(머리 밖의
 * 글이나 컴포넌트)이 있으면 새 장이다: 핵심 숫자 장에 넣으면 숫자들 아래 작은 상자로 끼었다(처음 쓰는 사람 검수). 컴포넌트를 넣지 않는 장
 * (표지, 섹션)도 새 장이다. 장 제목과 부제는 내용으로 보지 않는다(장면에 제목 칸이 있으면 넣을 때 숨긴다)
 */
export function cineGoesNext(slide: Slide): boolean {
  if (slide.layout !== 'compose' && !canCompose(slide.layout)) return true
  if ((slide.blocks ?? []).length) return true
  if (Object.entries(slide.fields).some(([k, v]) => !HEAD_KEYS.includes(k) && v?.trim())) return true
  return slide.items.some((it) => !isBlankItem(it))
}

/**
 * 넣을 모션 그래픽 부품(판 가득). 레시피는 맡겨 두어(stageCine) 부품을 넣는 고침에 같이 들어간다. isFresh: 틀에서 새로 넣는 것
 * (손잡이를 바꾸면 새 갈래로 남는다. 바꾸지 않으면 라이브러리에 남기지 않는다)
 */
function cineBlock(recipe: CineRecipe, isFresh: boolean): Block {
  const id = stageCine(recipe)
  // 칸에는 틀의 지어낸 예시 글을 넣는다: 빈 칸이면 발표 모습(모션 편집의 무대)에 그릴 글자가 없어 장면이 비었다. 슬라이드 위에서 바로 고쳐 쓴다
  const sample = presetSpec(recipe.preset).sample as Record<string, string>
  const block: Block = { ...makeBlock('cine'), fields: { ...sample }, cine: id, examples: Object.keys(sample), at: WHOLE }
  if (isFresh) fresh.add(block.id)
  // 장에 혼자 서고 레시피에 제목 칸이 있으면 장 제목은 숨긴다(장면의 제목이 장의 제목이다). 제목 칸이 없는 장면은 장 제목 아래에 선다
  if (recipe.texts?.some((t) => t.key === 'title')) stageHead(block.id)
  return block
}

/** 넣은 모션 그래픽을 모션 편집에서 연다 (넣은 고침이 그려진 다음에) */
function openStudio(blockId: string): void {
  requestAnimationFrame(() => window.dispatchEvent(new CustomEvent(OPEN_STUDIO, { detail: blockId })))
}

/**
 * 모션 그래픽을 넣는다: 빈 장이면 이 장에 판 가득, 다른 내용이 있으면 이 장 다음에 새 컴포넌트 장을 만들어 판 가득(cineGoesNext. 물어보고
 * 기다리게 하지 않는다). 넣는 고침은 하나라 되돌리기 한 번에 원래대로다. 넣은 부품 id
 */
export function insertCine(recipe: CineRecipe, slide: Slide, isFresh: boolean, toast: Toast): string {
  const block = cineBlock(recipe, isFresh)
  const store = useDeck.getState()
  if (cineGoesNext(slide)) {
    store.addComposeSlide([block], slide.id)
    toast.show('모션 그래픽은 슬라이드 한 장을 다 써서, 바로 뒤에 새 슬라이드로 넣었어요', undoAction(toast), 6000)
  } else if (slide.layout === 'compose') {
    store.setBlocks(slide.id, [block])
  } else {
    // 빈 레이아웃 장: 컴포넌트 장으로 바꿔 판 가득(머리와 고른 바탕, 움직임은 그대로. 옮길 글이 없어 빈 레이아웃 컴포넌트는 두지 않는다)
    store.replaceSlide(slide.id, { ...asCompose(slide), blocks: [block] })
    toast.show('이 슬라이드에 모션 그래픽을 넣었어요', undoAction(toast), 6000)
  }
  openStudio(block.id)
  return block.id
}

/**
 * '슬라이드 추가'에서 고른 모션 그래픽 틀: 늘 afterId 다음에 새 슬라이드를 만들어 판 가득 넣는다(고른 장이 비었어도 그 장을 쓰지 않는다:
 * 슬라이드를 더하려고 누른 것이라). 다른 슬라이드를 더할 때처럼 새 슬라이드를 고르고, 컴포넌트에서 넣을 때처럼 모션 편집을 연다.
 * 더하는 고침은 하나라 되돌리기 한 번에 사라진다. 넣은 부품 id
 */
export function addCineSlide(recipe: CineRecipe, afterId?: string): string {
  const block = cineBlock(recipe, true)
  useDeck.getState().addComposeSlide([block], afterId)
  openStudio(block.id)
  return block.id
}

/** 손잡이 하나를 바꾼다: 새 레시피(새 버전 id)로 부품을 바꾸고, 다음 봉인 때 남길 것으로 적어 둔다 */
export function setKnob(slideId: string, block: Block, recipe: CineRecipe, knob: CineKnob, value: string | boolean): void {
  const id = stageCine(withKnob(recipe, knob, value))
  if (id === block.cine) return
  if (!dirty.has(block.id)) dirty.set(block.id, fresh.has(block.id) ? undefined : block.cine)
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

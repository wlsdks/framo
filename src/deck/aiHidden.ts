// AI에게 숨긴 슬라이드와 컴포넌트. 사람이 슬라이드 메뉴와 컴포넌트의 '더 보기'에서 고른다(기본은 보임).
// 숨긴 것은 AI의 모양(ai/share.ts)에 자리만 보이고, AI의 제안(ai/ops.ts)은 그것을 바꾸거나 옮기지 못한다.
// 값은 장의 옵션에 둔다(SlideOptions.aiHidden, aiHiddenBlocks의 주석에 까닭).

import type { Slide, SlideOptions } from './types'

/** 이 장을 통째로 AI에게 숨겼는지 */
export const slideAiHidden = (slide: Pick<Slide, 'options'>): boolean => slide.options.aiHidden === true

/** 이 장에서 AI에게 숨긴 컴포넌트의 id. 장에 있는 것만 (지운 컴포넌트의 id가 남아 있어도 뺀다) */
export function aiHiddenIds(slide: Pick<Slide, 'options' | 'blocks'>): Set<string> {
  const ids = slide.options.aiHiddenBlocks
  if (!Array.isArray(ids) || !ids.length) return new Set()
  return new Set((slide.blocks ?? []).filter((b) => ids.includes(b.id)).map((b) => b.id))
}

/**
 * 장(block이 없으면)이나 컴포넌트 하나를 숨기거나 보이게 하는 옵션. 편집 상태의 setOptions에 넘긴다.
 * 숨긴 컴포넌트 목록은 장에 놓인 차례로 다시 적는다(지운 컴포넌트의 id는 이때 털어 낸다)
 */
export function aiHiddenPatch(slide: Pick<Slide, 'options' | 'blocks'>, hidden: boolean, block?: string): SlideOptions {
  if (block === undefined) return { aiHidden: hidden || undefined }
  const ids = aiHiddenIds(slide)
  if (hidden) ids.add(block)
  else ids.delete(block)
  const list = (slide.blocks ?? []).filter((b) => ids.has(b.id)).map((b) => b.id)
  return { aiHiddenBlocks: list.length ? list : undefined }
}

/** 장을 복사해 컴포넌트 id가 바뀌었을 때(장 복제) 숨긴 컴포넌트 목록을 새 id로. 숨긴 것이 사본에서 보이게 되지 않게 */
export function copiedAiHidden(options: SlideOptions, ids: ReadonlyMap<string, string>): SlideOptions {
  if (!options.aiHiddenBlocks) return options
  const next = options.aiHiddenBlocks.flatMap((id) => ids.get(id) ?? [])
  return { ...options, aiHiddenBlocks: next.length ? next : undefined }
}

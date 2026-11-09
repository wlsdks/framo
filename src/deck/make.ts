// 새 id, 새 항목, 새 장. 부품 장(blocks/)도 쓰는 가장 아래의 만들기라 구성 만들기(generate.ts)와 나눠 둔다:
// 구성 만들기가 구성의 부품 장을 짜려고 blocks를 가져오면, blocks가 generate를 가져올 때 순환이 된다(architecture.test.ts).
// 바깥(편집기, 저장, 화면)은 generate.ts에서 그대로 가져온다

import type { Recipe } from './blueprints/recipes'
import { LAYOUTS } from './layouts'
import type { Item, LayoutId, Slide, SlideOptions } from './types'

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

export function emptyItem(): Item {
  return { id: uid(), title: '', body: '', value: '', meta: '', image: '' }
}

/** 빈 장. 구성의 장(recipe)을 주면 그 역할, 안내, 미리 넣는 이름표로. 부품 장의 부품은 generate.ts의 recipeSlide가 짠다 */
export function makeSlide(layout: LayoutId, recipe?: Partial<Recipe>): Slide {
  const spec = LAYOUTS[layout]
  const count = recipe?.items ?? spec.items?.default ?? 0
  return {
    id: uid(),
    layout,
    purpose: recipe?.purpose ?? spec.name,
    section: recipe?.section ?? '',
    fields: { ...(recipe?.fields ?? {}) },
    items: Array.from({ length: count }, (_, i) => ({ ...emptyItem(), ...recipe?.prefill?.[i] })),
    hints: { ...(recipe?.hints ?? {}) },
    guide: recipe?.guide ?? spec.description,
    notes: '',
    options: withDefaultOptions(layout, { ...recipe?.options }, count),
    ...(recipe?.variant ? { variant: recipe.variant } : {}),
    ...(layout === 'compose' ? { blocks: [] } : {}),
  }
}

/** 레이아웃마다 처음 정해 두는 옵션. 이미 고른 값은 그대로 둔다. */
export function withDefaultOptions(layout: LayoutId, options: SlideOptions, itemCount: number): SlideOptions {
  if (layout === 'pricing' && options.highlight === undefined) return { ...options, highlight: itemCount >= 3 ? 1 : -1 }
  // 제품 화면 캡처가 대부분이라 잘리지 않게 전체를 보여 주는 쪽이 기본이다.
  if (layout === 'imageText' && options.contain === undefined) return { ...options, contain: true }
  return options
}

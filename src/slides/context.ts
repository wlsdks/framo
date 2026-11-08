import { createContext, useContext } from 'react'
import type { Block, CineRecipe, DeckMeta, ItemKey, Slide, SlideOptions } from '../deck/types'
import type { LayoutSpec } from '../deck/layouts'
import type { Scale } from './sharedScale'

/**
 * edit: 슬라이드 위에서 바로 입력
 * preview: 읽기 전용, 빈칸은 안내 문구를 흐리게 보여준다 (목록, 미리보기)
 * final: 발표와 내보내기, 빈칸은 비워 둔다
 */
export type SlideMode = 'edit' | 'preview' | 'final'

/**
 * 차트를 예시로 그릴지: 편집하거나 미리 볼 때 숫자가 들어가는 항목 칸(keys)이 모두 비었으면, 칸 안내의 예시 값으로
 * 옅게 그려 무엇이 그려질지 보여 준다. 다 만든 발표(final)는 빈 차트 그대로. 차트마다 숫자 칸이 다르다(값과 이전 값 같은)
 */
export function demoOf(mode: SlideMode, items: readonly { [K in ItemKey]: string }[], keys: readonly ItemKey[] = ['value']): boolean {
  return mode !== 'final' && items.every((it) => keys.every((k) => !it[k].trim()))
}

export interface SlideActions {
  setField(key: string, value: string): void
  setItem(index: number, key: ItemKey, value: string): void
  /** 여러 줄을 붙여 넣으면 항목마다 한 줄씩. 나눌 수 없으면 false (칸 하나에 붙인다). 부품 안의 항목은 아직 없다 */
  pasteItems?(index: number, key: ItemKey, lines: string[]): boolean
  removeItem(index: number): void
  /** 항목 순서 바꾸기 (끌어 옮길 때). key가 같으면 되돌리기 한 단계로 묶는다 */
  moveItem?(from: number, to: number, key?: string): void
  /** 장의 고르는 값(옆 판의 자리와 너비 같은). key가 같으면 되돌리기 한 단계로 묶는다 */
  setOptions?(options: SlideOptions, key?: string): void
  setVariant?(variant: string, key?: string): void
  /** 부품 장: 부품 하나를 고친다. key가 같으면 되돌리기 한 단계로 묶는다 */
  updateBlock?(blockId: string, fn: (b: Block) => Block, key?: string): void
  /** 부품 장: 이미지 부품에 이미지를 넣는다. 이미지에 맞춰 보이는 법과 그 줄의 칸 너비를 함께 고른다 */
  placeImage?(blockId: string, url: string): void
}

interface SlideCtx {
  slide: Slide
  meta: DeckMeta
  mode: SlideMode
  actions?: SlideActions
  canRemoveItem: boolean
  /** 발표의 단락 이름들과 이 장이 속한 단락 (0부터, 없으면 -1) */
  sections: readonly string[]
  sectionIndex: number
  /** 부품 장의 부품 안: 칸 id(data-field) 앞머리. 같은 장의 다른 부품과 겹치지 않게 */
  fieldPrefix?: string
  /**
   * 부품 안에서 비어 있으면 편집할 때도 접어 두는 칸(채우지 않아도 되는 칸). 항목 칸은 'items.키'.
   * 부품 칸은 발표할 때의 높이에 맞춰 놓으므로, 빈 안내를 다 펼치면 이웃 부품을 덮는다. 고른 부품의 '칸 더하기'로 연다
   */
  folds?: ReadonlySet<string>
  /** 부품 장의 부품 안: 칸 이름을 찾을 정의(부품 정의). 없으면 장의 레이아웃 */
  labels?: Pick<LayoutSpec, 'fields' | 'items'>
  /** 부품 장의 부품 안: 칸 너비 (12 기준). 자리를 어림해야 하는 그림(위치 비교의 이름표)이 쓴다 */
  span?: number
  /**
   * 이 차트가 이어 움직이는 이웃 장과 같이 쓰는 잣대(담는 값의 범위, 차트의 값과 같은 단위). 없으면 제 값으로 그린다(sharedScale.ts).
   * 부품 장에서는 장의 scales에서 부품마다 꺼낸다(blocks.tsx)
   */
  scale?: Scale
  /** 장 하나의 잣대들(차트 자리 → 잣대). 레이아웃 장은 '', 부품 장은 부품 id */
  scales?: ReadonlyMap<string, Scale>
  /** 발표가 품은 모션 그래픽의 레시피(deck.cines) */
  cines?: Readonly<Record<string, CineRecipe>>
  /** 모션 그래픽 부품 안: 그 부품이 쓰는 레시피의 버전 id */
  cineId?: string
}

export const SlideContext = createContext<SlideCtx | null>(null)

export function useSlide(): SlideCtx {
  const ctx = useContext(SlideContext)
  if (!ctx) throw new Error('SlideContext가 없어요')
  return ctx
}

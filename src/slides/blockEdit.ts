import { createContext, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import type { Gutter, LinkTarget } from '../deck/blocks'
import type { Block, BlockLink } from '../deck/types'

/**
 * 편집기가 부품 장에 넣어 주는 것. 슬라이드 그리기는 이것이 있을 때만 (편집 화면에서만) 끌기 손잡이,
 * 고른 부품의 테두리, 판을 나누는 선의 손잡이, 놓일 자리를 그린다. 발표와 내보낸 파일에는 없다.
 */
export interface BlockEdit {
  /** 끌고 있는 동안 보여 줄 판 (놓일 자리를 넣은 모습). 없으면 장에 저장된 판 */
  blocks: Block[] | null
  /** 끌고 있는 부품. 그 칸은 놓일 자리로 그린다 */
  dragId: string | null
  selected: string | null
  /** AI에게 숨긴 부품(deck/aiHidden.ts). 편집 화면에서만 작은 자물쇠로 알린다 */
  aiHidden: ReadonlySet<string>
  /** '칸 더하기'로 연 칸: '부품id 칸키'. 비어 있어도 그린다 */
  opened: ReadonlySet<string>
  onCellPointerDown(e: PointerEvent<HTMLElement>, block: Block): void
  /** 판을 나누는 선을 끌어 양쪽의 너비나 높이를 바꾼다 */
  onGutterPointerDown(e: PointerEvent<HTMLElement>, gutter: Gutter): void
  onGutterKeyDown(e: KeyboardEvent<HTMLElement>, gutter: Gutter): void
  /** 끄고 있는 선 (dir + key). 그 손잡이를 진하게 그린다 */
  resizing?: string | null
  /** 고른 이음표의 자리 */
  selectedLink: LinkTarget | null
  /** 이음표를 끄는 동안 놓일 자리와 모양. 그 자리에 흐리게 미리 세운다 */
  linkPreview: { target: LinkTarget; link: BlockLink } | null
  onLinkPointerDown(e: PointerEvent<HTMLElement>, target: LinkTarget): void
  /** 부품이 하나도 없을 때 가운데에 보이는 것 */
  empty(): ReactNode
  areaRef(el: HTMLDivElement | null): void
}

export const BlockEditContext = createContext<BlockEdit | null>(null)

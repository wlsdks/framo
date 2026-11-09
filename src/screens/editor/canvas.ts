import { BLOCK_COL_GAP, WHOLE } from '../../deck/blocks'
import { FRAME } from '../../deck/frame'
import type { Block, Slide } from '../../deck/types'

/** 장 캔버스. 슬라이드는 늘 이 크기로 그리고 화면에 맞춰 줄인다 */
export const CANVAS = { w: 1920, h: 1080 } as const

/** 장 본문의 12칸 격자에서 한 칸 너비 (본문 너비는 캔버스에서 좌우 틀을 뺀 것) */
export const COL_W = (CANVAS.w - FRAME.x * 2 - 11 * BLOCK_COL_GAP) / 12

/**
 * 부품 하나만 그린 장 (끌고 있는 부품, 부품 고르기 카드, 바꾸기 메뉴의 그림). 편집기(BlockEditor)와 그림 카드(BlockLibrary)가 같이 써서
 * 둘 아래의 이 파일에 둔다: 편집기에 두면 편집기 → 도구 줄 → 그림 카드 → 편집기로 순환이 생긴다
 */
export function soloSlide(block: Block): Slide {
  return { id: `solo-${block.id}`, layout: 'compose', purpose: '', section: '', fields: {}, items: [], hints: {}, guide: '', notes: '', options: {}, blocks: [{ ...block, at: WHOLE }] }
}

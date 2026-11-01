// 자리 규칙(한 장의 부품 수, 큰 부품 수)과 칸 사이, 면(옅은 면, 짙은 면)의 규칙.
// 줄 수나 한 줄의 칸 수는 따로 세지 않는다: 판(board.ts)이 부품마다 잘리지 않는 크기로만 나누어 그 안에서 정해진다

import type { Block, BlockLook, BlockType } from '../types'
import { BOARD_COLS, bandOf } from './board'
import { BLOCK_LOOK_IDS, BLOCKS } from './catalog'
import type { NoRoom } from './place'

/** 한 장의 모든 부품 (작은 것까지) */
export const MAX_BLOCKS = 10
/** 한 장의 큰 부품 (작은 부품이 아닌 것). 이보다 많으면 장이 빽빽해져 어디를 봐야 할지 흐려진다 */
export const MAX_LARGE = 6
/** 줄 사이 간격 (1920 기준 px). CSS의 --bk-gap과 같다. 한 칸 안에 쌓은 부품 사이도 같은 간격이라 쌓은 칸이 옆 줄과 맞는다.
 *  제목 아래 간격(--body-gap, 72)보다 좁아야 제목과 본문, 본문 안의 줄이 다른 사이로 읽힌다 */
export const BLOCK_GAP = 48
/** 옆 칸 사이 간격 (1920 기준 px). CSS의 --bk-col-gap과 같다. 줄 사이와 같은 48이면 나란한 두 부품이 붙어 보였다:
 *  오른쪽 끝에 붙은 숫자 바로 옆에서 다음 칸의 글이 시작했다. 장의 큰 사이(--body-gap)와 같은 값이다 */
export const BLOCK_COL_GAP = 72

export const isSmall = (type: BlockType) => !!BLOCKS[type].small

/** 한 장의 큰 부품 수 */
export const largeCount = (blocks: readonly Block[]) => blocks.filter((b) => !isSmall(b.type)).length

// 가져온 파일에는 아무 값이나 있을 수 있어서 정해진 값이 아니면 기본값으로 읽는다
export const lookOf = (b: Pick<Block, 'type' | 'look'>): BlockLook => (b.look && BLOCK_LOOK_IDS.includes(b.look) ? b.look : (BLOCKS[b.type].look ?? 'plain'))

/** 한 줄을 혼자 쓰는 부품 (minSpan 12) */
export const isSolo = (type: BlockType) => BLOCKS[type].minSpan >= 12

/**
 * 안에 이미 칸이나 면이 있는 부품. 면을 깔면 상자 안에 상자가 된다.
 * 소제목도 면 없이만: 묶음의 이름인데 면을 깔면 그 자체가 칸 하나로 읽혀 묶는 힘이 사라진다.
 * 주석도: 본문보다 물러나 있어야 하는 글이라, 면을 깔면 위의 표나 그림보다 먼저 눈에 띈다
 */
const FLAT: BlockType[] = ['logos', 'compare', 'pricing', 'matrix', 'agenda', 'image', 'flow', 'decision', 'network', 'heading', 'note']
/** 강조(bold)를 고를 수 있는 부품: 한 장의 결론이 되는 숫자와 말. 목록이나 그림까지 강조하면 어디가 결론인지 흐려진다 */
const BOLD_OK: BlockType[] = ['callout', 'number', 'delta', 'goal', 'ring', 'ratio', 'spark', 'quote', 'text', 'message']

/** 이 부품에 고를 수 있는 면. 한 줄을 혼자 쓰는 부품(표, 일정 같은)과 안에 칸이 있는 부품은 면 없이만 */
export function looksFor(type: BlockType): BlockLook[] {
  if (isSolo(type) || FLAT.includes(type)) return ['plain']
  return BOLD_OK.includes(type) ? ['plain', 'card', 'bold'] : ['plain', 'card']
}

/**
 * 면을 깔면 상자만 커 보이는 자리: 혼자 판 너비를 다 쓰는 부품. 넓은 면 안에 글이 한쪽에만 있어 비어 보이고, 면이 없어도 줄이 이미 한 덩어리로 읽힌다.
 * 면은 나란한 부품들이 같은 꼴의 칸(타일)으로 읽힐 때 쓴다. 강조 상자는 띠처럼 길게 써도 된다
 */
const looksEmptyAlone = (b: Pick<Block, 'type'>, alone: boolean) => alone && b.type !== 'callout'

/** 부품이 혼자 판 너비를 다 쓰는지 (옆에 나란한 부품이 없다) */
export const isAlone = (b: Pick<Block, 'at'>) => (b.at?.w ?? BOARD_COLS) >= BOARD_COLS

/** 그려지는 면. 혼자 판 너비를 다 쓰는 부품과 그 면을 쓸 수 없는 부품(예전 파일)은 고른 면이 있어도 바탕 없이 (옆에 부품을 놓으면 다시 보인다) */
export const shownLook = (b: Pick<Block, 'type' | 'look'>, alone: boolean): BlockLook =>
  looksEmptyAlone(b, alone) || !looksFor(b.type).includes(lookOf(b)) ? 'plain' : lookOf(b)

/**
 * 이 부품의 바탕을 이것으로 바꿀 수 없는 까닭. 한 장에는 바탕 한 가지만 쓴다: 들여 쓰기끼리, 또는 강조 하나와 바탕 없는 부품들.
 * 강조와 들여 쓰기가 섞이면 묶는 방식 두 가지가 눈길을 나눠 갖고, 강조가 둘이면 어느 쪽이 결론인지 흐려진다
 */
export function lookIssue(blocks: readonly Block[], blockId: string, look: BlockLook): NoRoom | null {
  if (look === 'plain') return null
  const self = blocks.find((b) => b.id === blockId)
  if (self && !looksFor(self.type).includes(look)) return { kind: 'look', why: look === 'bold' && looksFor(self.type).includes('card') ? 'no-bold' : 'flat' }
  const others = blocks.filter((b) => b.id !== blockId).map(lookOf)
  if (look === 'bold' && others.includes('bold')) return { kind: 'look', why: 'one-bold' }
  if (others.includes(look === 'bold' ? 'card' : 'bold')) return { kind: 'look', why: 'mix' }
  if (self && looksEmptyAlone(self, isAlone(self))) return { kind: 'look', why: 'alone' }
  return null
}

/**
 * 부품의 면을 바꾼 판. 옅은 면과 바탕 없음은 나란한 묶음(bandOf)의 부품이 함께 바뀐다: 나란한 칸에 면이 있는 것과 없는 것이
 * 섞이면 칸 높이와 여백이 달라 보여 한쪽이 덜 된 것처럼 보인다. 진한 면은 그 부품 하나만(한 장의 결론 하나)
 */
export function withLook(blocks: Block[], blockId: string, look: BlockLook): Block[] {
  const band = new Set(bandOf(blocks, blockId).map((b) => b.id))
  const together = (b: Block) => b.id === blockId || (band.has(b.id) && look !== 'bold' && lookOf(b) !== 'bold' && looksFor(b.type).includes(look))
  return blocks.map((b) => (together(b) ? { ...b, look } : b))
}

/** 넣은 부품의 면이 장의 다른 면과 어긋나면(진한 면이 둘, 진한 면과 옅은 면) 바탕 없이. 강조 상자는 처음에 진한 면이라 흔하다 */
export function settleLook(blocks: Block[], block: Block): Block[] {
  const why = lookIssue(blocks, block.id, lookOf(block))
  // 혼자 판 너비를 쓰는 자리는 고른 면을 그대로 둔다: 그릴 때만 바탕 없이, 옆에 부품이 오면 다시 보인다
  if (!why || why.kind !== 'look' || why.why === 'alone') return blocks
  return blocks.map((b) => (b.id === block.id ? { ...b, look: 'plain' as const } : b))
}

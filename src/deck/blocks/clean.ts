// 파일에서 읽은 부품 장 바로잡기: 정해진 꼴로 맞추고, 모르는 부품은 빼되 글은 지우지 않는다

import { isCineId } from '../cine'
import { uid } from '../generate'
import type { Block, BlockEffect, BlockFrom, BlockLook, BlockSpeed, BlockType, BlockWhen, Item, Slide, BlockReveal } from '../types'
import { type Fit, isArea, LOOSE, normalize, removeFromBoard } from './board'
import { BLOCK_EFFECT_IDS, BLOCK_FROM_IDS, BLOCK_LOOK_IDS, BLOCK_REVEAL_IDS, BLOCK_SPEED_IDS, BLOCK_TYPES, BLOCK_WHEN_IDS, BLOCKS } from './catalog'
import { isLink, tidyLinks } from './links'
import { isSmall, MAX_BLOCKS, MAX_LARGE } from './rules'

const ITEM_KEYS = ['title', 'body', 'value', 'meta', 'image'] as const
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const strings = (v: unknown): Record<string, string> =>
  isRecord(v) ? Object.fromEntries(Object.entries(v).filter((e): e is [string, string] => typeof e[1] === 'string')) : {}

/** 이 버전이 아는 부품의 값. 이 밖의 값은 새 버전에서 더한 것이라, 예전 버전이 고치면 빠진다 */
const BLOCK_KEYS = ['id', 'type', 'fields', 'items', 'hints', 'look', 'effect', 'when', 'speed', 'reveal', 'from', 'variant', 'highlight', 'link', 'linkBelow', 'at', 'cine', 'examples']

/**
 * 부품 하나를 정해진 꼴로. 모르는 부품이거나 개수(count: 남은 수와 남은 큰 부품 수)가 넘치면 null.
 * lost를 주면 버린 것 가운데 사람이 넣었을 것(모르는 부품, 모양, 움직임, 칸, 넘치는 부품)을 센다
 */
export function cleanBlock(b: Record<string, unknown>, count: { left: number; large?: number }, lost?: { n: number }): Block | null {
  const drop = (n = 1) => lost && (lost.n += n)
  const type = b.type as BlockType
  if (typeof b.id !== 'string' || count.left <= 0 || !(BLOCK_TYPES as unknown[]).includes(b.type) || (!isSmall(type) && (count.large ?? MAX_LARGE) <= 0)) {
    drop()
    return null
  }
  const items = Array.isArray(b.items)
    ? b.items.filter(isRecord).map((it) => {
        const item = { id: typeof it.id === 'string' ? it.id : uid() } as Item
        for (const k of ITEM_KEYS) item[k] = typeof it[k] === 'string' ? (it[k] as string) : ''
        drop(Object.keys(it).filter((k) => k !== 'id' && !(ITEM_KEYS as readonly string[]).includes(k)).length)
        return item
      })
    : []
  const block: Block = { id: b.id, type, fields: strings(b.fields), items }
  if (isRecord(b.hints)) block.hints = strings(b.hints)
  if ((BLOCK_LOOK_IDS as unknown[]).includes(b.look)) block.look = b.look as BlockLook
  else if (b.look !== undefined) drop()
  if ((BLOCK_EFFECT_IDS as unknown[]).includes(b.effect)) block.effect = b.effect as BlockEffect
  else if (b.effect !== undefined) drop()
  if ((BLOCK_WHEN_IDS as unknown[]).includes(b.when)) block.when = b.when as BlockWhen
  else if (b.when !== undefined) drop()
  if ((BLOCK_SPEED_IDS as unknown[]).includes(b.speed)) block.speed = b.speed as BlockSpeed
  else if (b.speed !== undefined) drop()
  if ((BLOCK_REVEAL_IDS as unknown[]).includes(b.reveal)) block.reveal = b.reveal as BlockReveal
  else if (b.reveal !== undefined) drop()
  if ((BLOCK_FROM_IDS as unknown[]).includes(b.from)) block.from = b.from as BlockFrom
  else if (b.from !== undefined) drop()
  if (typeof b.variant === 'string' && BLOCKS[type].variants?.some((v) => v.id === b.variant)) block.variant = b.variant
  else if (b.variant !== undefined) drop()
  if (Number.isInteger(b.highlight)) block.highlight = b.highlight as number
  if (isLink(b.link)) block.link = b.link
  else if (b.link !== undefined) drop()
  if (isLink(b.linkBelow)) block.linkBelow = b.linkBelow
  else if (b.linkBelow !== undefined) drop()
  // 모션 그래픽이 쓰는 레시피의 버전 id (해시 꼴만)
  if (type === 'cine' && isCineId(b.cine)) block.cine = b.cine
  else if (b.cine !== undefined) drop()
  // 예시 글인 칸: 글이 있는 칸 이름만. 표시일 뿐이라 버려도 세지 않는다(글은 칸에 그대로 있다)
  if (Array.isArray(b.examples)) {
    const keys = b.examples.filter((k, i, a): k is string => typeof k === 'string' && a.indexOf(k) === i && !!block.fields[k])
    if (keys.length) block.examples = keys
  }
  // 자리는 바로잡을 수 있는 값이라 버려도 세지 않는다 (판을 다시 나눈다)
  if (isArea(b.at)) block.at = { x: b.at.x, y: b.at.y, w: b.at.w, h: b.at.h }
  drop(Object.keys(b).filter((k) => !BLOCK_KEYS.includes(k)).length)
  count.left--
  if (!isSmall(type) && count.large !== undefined) count.large--
  return block
}

/** 부품 목록을 정해진 꼴로 (자리는 고치지 않는다): 모르는 부품은 빼고, 개수는 정한 만큼만, 같은 id는 한 번만 */
export function cleanList(blocks: unknown, lost?: { n: number }): Block[] {
  if (!Array.isArray(blocks)) return []
  const count = { left: MAX_BLOCKS, large: MAX_LARGE }
  const seen = new Set<string>()
  const out: Block[] = []
  for (const b of blocks) {
    if (!isRecord(b) || typeof b.id !== 'string' || seen.has(b.id)) continue
    const block = cleanBlock(b, count, lost)
    if (!block) continue
    seen.add(block.id)
    out.push(block)
  }
  return out
}

/**
 * 가져온 파일이나 저장본의 판을 정해진 꼴로 맞춘다(cleanList). 자리(at)가 판을 빈틈없이 덮지 않으면(손으로 고친 파일)
 * 읽는 차례대로 다시 나눈다. 글은 지우지 않는다: 꼴이 맞지 않는 값만 버린다. 그래서 몇 번을 거쳐도 결과가 같다.
 * fit은 그 장의 크기 규칙(모르면 크기를 따지지 않고 자리만)
 */
export function cleanBlocks(blocks: unknown, lost?: { n: number }, fit: Fit = LOOSE): Block[] {
  return tidyLinks(normalize(cleanList(blocks, lost), fit))
}

/**
 * 발표를 열 때: 부품 장의 판을 바로잡는다. 부품 장에서 다른 레이아웃으로 바꾼 장도 판을 남겨 둔다
 * (부품 장으로 되돌리면 다시 보이게. 사람이 적은 글을 버리지 않는다). fitOf는 장마다의 크기 규칙
 */
export function cleanDeckBlocks<T extends { slides: Slide[] }>(deck: T, fitOf: (s: Slide) => Fit = () => LOOSE): T {
  if (!deck.slides.some((s) => s.layout === 'compose' || s.blocks !== undefined)) return deck
  return { ...deck, slides: deck.slides.map((s) => (s.layout === 'compose' || s.blocks !== undefined ? { ...s, blocks: cleanBlocks(s.blocks, undefined, fitOf(s)) } : s)) }
}

/**
 * 그릴 수 있는 부품만. 새 버전에서 만든 발표의 모르는 부품은 그리지 않고, 그 자리는 옆 부품이 덮는다
 * (그런 발표는 편집기가 열지 않지만, 내 발표 목록의 작은 그림은 그린다)
 */
export function knownBlocks(blocks: Block[]): Block[] {
  let out = blocks
  for (const b of blocks) if (!BLOCK_TYPES.includes(b.type)) out = removeFromBoard(out, b.id, LOOSE)
  return out
}

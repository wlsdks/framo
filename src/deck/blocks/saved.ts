// 내 컴포넌트: 사람이 조립해 둔 컴포넌트 하나, 한 줄, 장 하나를 저장해 두고 다른 장, 다른 발표에 다시 넣는다.
// 저장한 것은 발표 밖(이 PC의 브라우저와 보관 폴더, store/saved.ts)에 두고 AI에게 보내지 않는다.
// 발표에 넣은 뒤에는 보통 부품이라, AI 공유 모양에도 다른 부품처럼 고른 값만 들어간다.

import { makeSlide, uid } from '../make'
import { MOTIONS, TONES, TRANSITIONS } from '../themes'
import type { Block, BlockAt, Motion, Slide, SlideOptions, Tone, Transition } from '../types'
import { bandOf, BOARD_COLS, tiles } from './board'
import { BLOCKS } from './catalog'
import { allBlocks } from './cells'
import { cleanBlocks, cleanList } from './clean'
import { boardFromRows } from './legacy'
import { across } from './links'
import { MAX_BLOCKS } from './rules'
import { boardFit } from './sizing'

/** 무엇을 저장했는지: 컴포넌트 하나, 나란한 묶음 하나(예전의 한 줄), 장 하나(제목 칸과 장 설정까지) */
export type SavedKind = 'block' | 'row' | 'slide'

export interface SavedPart {
  id: string
  /** 목록에 보이는 이름. 처음에는 컴포넌트 이름으로 지어 두고 사람이 바꾼다 */
  name: string
  kind: SavedKind
  /** 저장한 부품들. 자리(at)는 묶음 안의 자리(왼쪽 위가 0): 넣을 때 묶음 안의 짜임을 그대로 두고 새 자리에 맞춘다 */
  blocks: Block[]
  /** 장 하나를 저장했을 때: 제목 칸과 장 설정(바탕, 움직임, 장 넘기기, 나오는 차례) */
  slide?: { fields: Record<string, string>; options: SlideOptions }
  /**
   * 컴포넌트 하나, 나란한 묶음: 저장할 때 장에서 차지한 크기(캔버스 px). 목록의 작은 그림을 그때의 비율로 그린다.
   * 칸이 높이에 따라 짜임을 바꾸는 컴포넌트(숫자 여럿 같은)가 다른 높이로 그려지면 저장한 모습과 달라 보여서
   */
  size?: { w: number; h: number }
  savedAt: number
}

/** 이름은 이만큼만 (목록 카드 한 줄, 파일 안의 값) */
export const SAVED_NAME_MAX = 40

/** 장이 정해지지 않은 판(내 컴포넌트 파일)을 나눌 때 쓰는 본문 높이: 제목 한 줄과 부제 한 줄인 부품 장 */
const STANDARD_AREA_H = 640

/** 장에 따라 가는 설정 가운데 부품 장이 쓰는 것 */
const SLIDE_OPTION_KEYS = ['tone', 'motion', 'transition', 'order', 'hideHead', 'hideFoot'] as const

/** 처음에 지어 두는 이름: 컴포넌트 이름들 (셋이 넘으면 앞의 둘과 '외 n') */
export function savedName(blocks: Block[]): string {
  const names = allBlocks(blocks).map((b) => BLOCKS[b.type].name)
  const text = names.length > 3 ? `${names.slice(0, 2).join(' + ')} 외 ${names.length - 2}` : names.join(' + ')
  return text.slice(0, SAVED_NAME_MAX)
}

/** 부품들의 자리를 묶음 안의 자리로 (왼쪽 위를 0으로). 묶음 밖으로 이어지던 이음표는 뗀다 */
function framed(blocks: Block[]): Block[] {
  const x = Math.min(...blocks.map((b) => b.at?.x ?? 0))
  const y = Math.min(...blocks.map((b) => b.at?.y ?? 0))
  const moved = blocks.map((b) => (b.at ? { ...structuredClone(b), at: { ...b.at, x: b.at.x - x, y: b.at.y - y } } : structuredClone(b)))
  return moved.map((b) => {
    const out = { ...b }
    if (out.link && !across(moved, b, 'h').length) delete out.link
    if (out.linkBelow && !across(moved, b, 'v').length) delete out.linkBelow
    return out
  })
}

/**
 * 장에서 저장할 것을 떼어 낸다. block은 그 부품 하나, row는 그 부품이 든 나란한 묶음(bandOf), slide는 장 전체.
 * 묶음 밖으로 이어지던 이음표는 뗀다. 없는 부품이거나 부품 장이 아니면 null
 */
export function partFrom(slide: Slide, kind: SavedKind, blockId: string | null, size?: { w: number; h: number }): SavedPart | null {
  const blocks = slide.layout === 'compose' ? (slide.blocks ?? []) : []
  let picked: Block[]
  if (kind === 'slide') picked = blocks
  else {
    const block = blocks.find((b) => b.id === blockId)
    if (!block) return null
    picked = kind === 'block' ? [block] : bandOf(blocks, block.id)
  }
  if (!picked.length) return null
  picked = framed(picked)
  const part: SavedPart = { id: uid(), name: savedName(picked), kind, blocks: picked, savedAt: Date.now() }
  if (kind !== 'slide' && size && isSize(size)) part.size = { w: Math.round(size.w), h: Math.round(size.h) }
  if (kind === 'slide') {
    const options: SlideOptions = {}
    for (const k of SLIDE_OPTION_KEYS) if (slide.options[k] !== undefined) (options as Record<string, unknown>)[k] = structuredClone(slide.options[k])
    part.slide = { fields: { ...slide.fields }, options }
  }
  return part
}

/** 넣을 때마다 새 id (같은 것을 두 번 넣어도, 다른 발표에 넣어도 겹치지 않게). 옛 id → 새 id */
export function freshBlocks(blocks: Block[]): { blocks: Block[]; ids: Map<string, string> } {
  const ids = new Map<string, string>()
  const out = blocks.map((b) => {
    const id = uid()
    ids.set(b.id, id)
    return { ...structuredClone(b), id, items: b.items.map((it) => ({ ...it, id: uid() })) }
  })
  return { blocks: out, ids }
}

/** 장 하나를 저장한 것으로 새 부품 장을 만든다 (제목 칸과 장 설정까지, 나오는 차례는 새 id로). 자리는 장 전체로 */
export function slideFromPart(part: SavedPart): Slide {
  const { blocks, ids } = freshBlocks(part.blocks)
  const whole = tiles(blocks) ? blocks : cleanBlocks(blocks.map(({ at: _, ...b }) => b), undefined, boardFit(STANDARD_AREA_H))
  const slide = { ...makeSlide('compose'), blocks: whole }
  if (!part.slide) return slide
  const { order, ...options } = part.slide.options
  const mapped = order?.map((id) => ids.get(id)).filter((id): id is string => !!id)
  return { ...slide, fields: { ...slide.fields, ...part.slide.fields }, options: { ...slide.options, ...options, ...(mapped?.length ? { order: mapped } : {}) } }
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
/** 장 안에 들어가는 크기인지 (파일에는 아무 값이나 있을 수 있다) */
const isSize = (v: unknown): v is { w: number; h: number } =>
  isRecord(v) && typeof v.w === 'number' && typeof v.h === 'number' && v.w >= 100 && v.w <= 1920 && v.h >= 50 && v.h <= 1080
const oneOf = <T extends string>(list: { id: T }[], v: unknown): v is T => typeof v === 'string' && list.some((x) => x.id === v)

/** 묶음 안의 자리가 빈틈없는 꼴인지 (왼쪽 위가 0인 상자를 덮는다) */
function framedTiles(blocks: Block[]): boolean {
  if (!blocks.every((b) => b.at)) return false
  const w = Math.max(...blocks.map((b) => b.at!.x + b.at!.w))
  const h = Math.max(...blocks.map((b) => b.at!.y + b.at!.h))
  const frame: BlockAt = { x: 0, y: 0, w, h }
  return w <= BOARD_COLS && tiles(blocks, frame)
}

/**
 * 파일에서 읽은 내 컴포넌트 하나를 정해진 꼴로 맞춘다. 부품은 발표 파일과 같은 규칙(cleanBlocks)으로, 예전 파일의 줄(rows)은
 * 판으로 바꿔서(legacy.ts) 읽고, 모르는 값은 버린다(lost에 센다). 부품이 하나도 남지 않으면 null
 */
export function cleanPart(v: unknown, lost?: { n: number }): SavedPart | null {
  if (!isRecord(v)) return null
  const kind: SavedKind = v.kind === 'block' || v.kind === 'row' || v.kind === 'slide' ? v.kind : 'row'
  // 묶음 안의 자리는 판 전체가 아니라서 판 규칙으로 바로잡지 않고, 빈틈없는 꼴이 아닐 때만 장 하나로 다시 나눈다.
  // 예전 파일의 줄은 판으로 바꿔 읽는다
  const list = v.blocks === undefined && v.rows !== undefined ? boardFromRows(v.rows, boardFit(STANDARD_AREA_H), lost) : cleanList(v.blocks, lost)
  const blocks = framedTiles(list) ? list : cleanBlocks(list.map(({ at: _, ...b }) => b), undefined, boardFit(STANDARD_AREA_H))
  // 컴포넌트 하나라고 적혀 있는데 더 많으면 묶음으로 읽는다 (그래도 넣는 규칙은 같다)
  const shape: SavedKind = kind === 'block' && blocks.length > 1 ? 'row' : kind
  if (!blocks.length || blocks.length > MAX_BLOCKS) return null
  const name = typeof v.name === 'string' && v.name.trim() ? v.name.trim().slice(0, SAVED_NAME_MAX) : savedName(blocks)
  // id는 읽을 때마다 새로: 같은 파일을 두 번 읽거나 남의 파일을 읽어도 목록에서 겹치지 않게
  const part: SavedPart = { id: uid(), name, kind: shape, blocks, savedAt: typeof v.savedAt === 'number' && Number.isFinite(v.savedAt) ? v.savedAt : Date.now() }
  if (shape === kind && shape !== 'slide' && isSize(v.size)) part.size = { w: Math.round(v.size.w), h: Math.round(v.size.h) }
  if (shape === 'slide' && isRecord(v.slide)) {
    const fields = isRecord(v.slide.fields) ? Object.fromEntries(Object.entries(v.slide.fields).filter((e): e is [string, string] => typeof e[1] === 'string')) : {}
    const o = isRecord(v.slide.options) ? v.slide.options : {}
    const known = new Set(blocks.map((b) => b.id))
    const options: SlideOptions = {}
    if (o.hideHead === true) options.hideHead = true
    if (o.hideFoot === true) options.hideFoot = true
    if (oneOf<Tone>(TONES, o.tone)) options.tone = o.tone
    if (oneOf<Motion>(MOTIONS, o.motion)) options.motion = o.motion
    if (oneOf<Transition>(TRANSITIONS, o.transition)) options.transition = o.transition
    if (Array.isArray(o.order)) {
      const order = [...new Set(o.order.filter((id): id is string => typeof id === 'string' && known.has(id)))]
      if (order.length) options.order = order
    }
    part.slide = { fields, options }
  }
  return part
}

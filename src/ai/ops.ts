// AI가 보내는 변경 요청. 모양만 바꿀 수 있고, 사람이 적은 글은 쓰지도 지우지도 못한다.
//
// - 칸의 글(fields, items의 글)을 쓰는 동작은 아예 없다.
// - 지우는 동작은 빈 장, 빈 항목, 빈 부품만. 내용이 있는 장은 '발표에서 빼기'(숨기기)만 된다.
// - 부품 장도 모양은 바꿀 수 있다: 빈 부품 넣기, 부품 옮기기와 맞바꾸기, 크기, 모양, 바탕, 움직임(나오는 차례와 때 포함), 항목 수, 이음표. 부품 안의 글은 그대로 따라간다.
// - AI가 적을 수 있는 글은 세 가지뿐이고 모두 사람에게 보이는 안내다: 제안 설명, 장 안내, 칸 안내 문구.

import {
  asCompose,
  autoArranged,
  autoPlace,
  BLOCK_EFFECT_IDS,
  BLOCK_FROM_IDS,
  BLOCK_LOOK_IDS,
  BLOCK_SPEED_IDS,
  BLOCK_WHEN_IDS,
  BLOCK_TYPES,
  BLOCKS,
  BOARD_COLS,
  BOARD_ROWS,
  blockItems,
  boardAreaH,
  boardSig,
  boardFit,
  canCompose,
  effectOf,
  fromOf,
  insertAt,
  isLink,
  linkAt,
  linkIssue,
  linkTargets,
  lookIssue,
  lookOf,
  makeBlock,
  mapBlock,
  MAX_BLOCKS,
  moveAt,
  needRows,
  playOrder,
  removeBlock,
  resizeBlock,
  sameLinkTarget,
  settle,
  settleDeck,
  speedOf,
  unwrapCompose,
  variantOfBlock,
  whenOf,
  whyNot,
  withLink,
  withLook,
  type DropTarget,
  type LinkTarget,
  type Spot, revealOf, BLOCK_REVEAL_IDS
} from '../deck/blocks'
import { BLUEPRINTS } from '../deck/blueprints'
import { relayout, withVisibleCount } from '../deck/edits'
import { makeSlide } from '../deck/generate'
import { BOLD_LAYOUTS, LAYOUTS, LAYOUT_ORDER, panesOf, variantIds, variantOf } from '../deck/layouts'
import { isScene, sceneFits } from '../deck/scenes'
import { FONTS, FOOTERS, MOTIONS, PLACES, TEXT_SIZES, THEME_ORDER, TONES, TRANSITIONS } from '../deck/themes'
import type { Block, BlockEffect, BlockFrom, BlockLink, BlockLook, BlockSpeed, BlockType, BlockWhen, Deck, FontId, FooterMode, Item, ItemKey, LayoutId, Motion, Place as TitlePlace, SceneId, Slide, TextSize, ThemeId, Tone, Transition, BlockReveal } from '../deck/types'
import { HEX, isInt, isObj, isOneOf, onlyKeys } from './guards'
import { DECK_ID, HIGHLIGHT_MAX, HIGHLIGHT_MIN, MAX_ITEMS, REQUEST_FORMAT, REQUEST_ID, REQUEST_VERSION } from './protocol'
import { shapeBlockId, shapeDeckId, shapeSlideId } from './share'

export const MAX_OPS = 40
export const NOTE_MAX = 300
const GUIDE_MAX = 200
const HINT_MAX = 80
export const ROLE_MAX = 24

/** 장을 가리키는 값: 모양 파일의 장 id(s로 시작) 또는 같은 요청에서 새로 만든 장의 이름(n1, n2...) */
type SlideRef = string
/** 부품을 가리키는 값: 모양 파일의 부품 id(b로 시작) 또는 같은 요청에서 새로 넣은 부품의 이름(p1, p2...) */
type BlockRef = string

/**
 * 부품을 놓을 자리. beside가 있으면 그 부품의 왼쪽(before), 오른쪽(after), 위(above), 아래(below)에 (그 부품이 자리를 나눠 준다),
 * edge가 있으면 판의 맨 위(top)나 맨 아래(bottom)에 장 너비로. 둘 다 없으면 편집기에서 '넣기'를 누를 때처럼 알아서
 */
interface Place {
  beside?: BlockRef
  side?: 'before' | 'after' | 'above' | 'below'
  edge?: 'top' | 'bottom'
}

export type Op =
  | { op: 'add_slide'; after: SlideRef | null; layout?: LayoutId; role?: string; as?: string }
  | { op: 'remove_slide'; slide: SlideRef }
  | { op: 'move_slide'; slide: SlideRef; after: SlideRef | null }
  | { op: 'set_layout'; slide: SlideRef; layout: LayoutId; variant?: string }
  | { op: 'set_hidden'; slide: SlideRef; hidden: boolean }
  | { op: 'set_item_count'; slide: SlideRef; count: number }
  /** motion, transition: null이면 발표 전체 설정을 따르게 되돌린다 */
  /** flip, pane: 두 판으로 나뉜 장(LayoutSpec.panes)의 옆 판 자리와 너비. pane이 null이면 기본 너비 */
  /** scene: 장면(카탈로그 scenes) 하나. 그 장에 맞는 것만 되고(scene_unfit), null이면 장면을 끈다. 고르는 값 하나라 글에 닿지 않는다 */
  | {
      op: 'set_options'
      slide: SlideRef
      highlight?: number
      flip?: boolean
      pane?: number | null
      contain?: boolean
      motion?: Motion | null
      tone?: Tone
      place?: TitlePlace | null
      transition?: Transition | null
      scene?: SceneId | null
      hideHead?: boolean
      hideFoot?: boolean
    }
  /** font: null이면 테마의 글꼴로 */
  | {
      op: 'set_theme'
      theme?: ThemeId
      accent?: string | null
      motion?: Motion
      font?: FontId | null
      size?: TextSize
      footer?: FooterMode
      transition?: Transition
    }
  | { op: 'set_guide'; slide: SlideRef; text: string }
  /** block이 있으면 부품 장의 그 부품 칸 */
  | { op: 'set_hint'; slide: SlideRef; block?: BlockRef; field: string; item?: number; text: string }
  /** 부품 장에 빈 부품 넣기 */
  | ({ op: 'add_block'; slide: SlideRef; type: BlockType; variant?: string; look?: BlockLook; effect?: BlockEffect; as?: string } & Place)
  /** 빈 부품만 뺀다 */
  | { op: 'remove_block'; slide: SlideRef; block: BlockRef }
  /** 자리(beside나 edge) 또는 swap(그 부품과 자리를 맞바꾸기) 가운데 하나. 자리는 옮기는 부품을 뺀 판에서 센다 */
  | ({ op: 'move_block'; slide: SlideRef; block: BlockRef; swap?: BlockRef } & Place)
  /** count는 항목 수(줄일 때는 끝의 빈 항목만), highlight는 강조할 항목(-1은 없음) */
  /** when, speed, reveal, from: 언제 나오는지, 빠르기, 항목이 나오는 때(항목이 있는 부품만), 들어오는 쪽(쪽이 있는 움직임만) */
  | {
      op: 'set_block'
      slide: SlideRef
      block: BlockRef
      variant?: string
      look?: BlockLook
      effect?: BlockEffect
      when?: BlockWhen
      speed?: BlockSpeed
      reveal?: BlockReveal
      from?: BlockFrom
      count?: number
      highlight?: number
    }
  /** 부품 장의 부품이 나오는 차례. 앞에 둘 부품부터 (빠진 부품은 그 뒤에 놓인 차례대로). 빈 배열이면 놓인 차례로 */
  | { op: 'set_order'; slide: SlideRef; order: BlockRef[] }
  /** 부품의 너비(w)와 높이(h)를 판의 칸 수로. 그 부품에 닿은 선을 옮겨서 이웃이 크기를 주고받는다 */
  | { op: 'set_size'; slide: SlideRef; block: BlockRef; w?: number; h?: number }
  /**
   * 이음표(카탈로그 blockLinks): right는 그 부품의 오른쪽 선, below는 아래 선에 서서 선 건너편의 부품과 잇는다.
   * link가 null이면 뺀다. 이음표는 글이 아니라 표시라서 사람이 적은 것을 바꾸지 않는다
   */
  | { op: 'set_link'; slide: SlideRef; block: BlockRef; side: 'right' | 'below'; link: BlockLink | null }

type OpName = Op['op']
export const OP_NAMES: OpName[] = [
  'add_slide',
  'remove_slide',
  'move_slide',
  'set_layout',
  'set_hidden',
  'set_item_count',
  'set_options',
  'set_theme',
  'set_guide',
  'set_hint',
  'add_block',
  'remove_block',
  'move_block',
  'set_block',
  'set_size',
  'set_link',
  'set_order',
]

export interface ChangeRequest {
  format: typeof REQUEST_FORMAT
  version: typeof REQUEST_VERSION
  id: string
  deck: string
  createdAt: number
  note: string
  ops: Op[]
}

/** 요청 하나하나의 결과. AI에게 돌려주는 말은 이 코드뿐이다. */
export type OpCode =
  | 'applied'
  | 'no_slide'
  | 'has_content'
  | 'out_of_range'
  | 'not_for_layout'
  | 'last_slide'
  | 'unknown_role'
  | 'no_change'
  | 'not_reviewed'
  | 'no_block'
  | 'no_room'
  /** 한 장에는 면 한 가지만: 진한 면은 하나, 진한 면과 옅은 면은 섞지 않고, 혼자 장 너비를 다 쓰는 작은 부품은 면 없이 */
  | 'look_clash'
  /** 이음표가 잇는 두 부품의 뜻이 서지 않는다 (진행 막대와 시장 원을 견주기 같은. 카탈로그 blocks[].kind) */
  | 'link_clash'
  /** 그 장에 맞지 않는 장면 (카탈로그 scenes[].layouts, blocks). not_for_layout과 나눠야 AI가 장면만 다시 고른다 */
  | 'scene_unfit'

/**
 * 결과 파일에 쓸 수 있는 코드. 로컬 서버가 앱이 보낸 결과를 받을 때 이것으로 확인한다.
 * 예전에는 서버가 목록을 따로 들고 있어서 새 코드(no_block 등)가 빠졌고, 그 결과를 받지 않아 제안이 다시 떴다.
 * Record라서 OpCode에 코드를 더하면 여기도 채워야 컴파일된다.
 */
const OP_CODE_SET = {
  applied: true,
  no_slide: true,
  has_content: true,
  out_of_range: true,
  not_for_layout: true,
  last_slide: true,
  unknown_role: true,
  no_change: true,
  not_reviewed: true,
  no_block: true,
  no_room: true,
  look_clash: true,
  link_clash: true,
  scene_unfit: true,
} as const satisfies Record<OpCode, true>
export const OP_CODES = Object.keys(OP_CODE_SET) as OpCode[]
export const isOpCode = (v: unknown): v is OpCode => typeof v === 'string' && Object.hasOwn(OP_CODE_SET, v)

export interface OpResult {
  ok: boolean
  code: OpCode
}

const REF = /^(s[0-9a-f]{8}|n[0-9]{1,2})$/
const NEW_REF = /^n[0-9]{1,2}$/
const BLOCK_REF = /^(b[0-9a-f]{8}|p[0-9]{1,2})$/
const NEW_BLOCK = /^p[0-9]{1,2}$/

/** 한 줄 안내 글. 줄바꿈과 보이지 않는 제어 문자는 받지 않는다. */
function cleanText(v: unknown, max: number, multiline = false): string | null {
  if (typeof v !== 'string') return null
  const text = v.replace(/\r\n?/g, '\n').trim()
  if (!text || text.length > max) return null
  if (/[\u0000-\u0008\u000b-\u001f\u007f‪-‮⁦-⁩]/.test(text)) return null
  if (!multiline && text.includes('\n')) return null
  return text
}

function refOrNull(v: unknown): SlideRef | null | undefined {
  if (v === null) return null
  return typeof v === 'string' && REF.test(v) ? v : undefined
}

const isLayout = (v: unknown): v is LayoutId => typeof v === 'string' && LAYOUT_ORDER.includes(v as LayoutId)
const blockRef = (v: unknown): BlockRef | undefined => (typeof v === 'string' && BLOCK_REF.test(v) ? v : undefined)

/**
 * op마다 받는 키. parseOp가 이것으로 모르는 키를 거르고, MCP 서버가 AI에게 보여 주는 꼴(inputSchema)도 이것과 같아야 한다(시험이 확인).
 * 예전에는 두 곳에 따로 적어서 줄 높이 op의 값이 꼴에서 빠졌고, 설명대로 보낸 제안이 거절됐다.
 */
export const OP_KEYS = {
  add_slide: ['op', 'after', 'layout', 'role', 'as'],
  remove_slide: ['op', 'slide'],
  move_slide: ['op', 'slide', 'after'],
  set_layout: ['op', 'slide', 'layout', 'variant'],
  set_hidden: ['op', 'slide', 'hidden'],
  set_item_count: ['op', 'slide', 'count'],
  set_options: ['op', 'slide', 'highlight', 'flip', 'pane', 'contain', 'motion', 'tone', 'place', 'transition', 'scene', 'hideHead', 'hideFoot'],
  set_theme: ['op', 'theme', 'accent', 'motion', 'font', 'size', 'footer', 'transition'],
  set_guide: ['op', 'slide', 'text'],
  set_hint: ['op', 'slide', 'block', 'field', 'item', 'text'],
  add_block: ['op', 'slide', 'type', 'variant', 'look', 'effect', 'as', 'beside', 'side', 'edge'],
  remove_block: ['op', 'slide', 'block'],
  move_block: ['op', 'slide', 'block', 'beside', 'side', 'edge', 'swap'],
  set_block: ['op', 'slide', 'block', 'variant', 'look', 'effect', 'when', 'speed', 'reveal', 'from', 'count', 'highlight'],
  set_size: ['op', 'slide', 'block', 'w', 'h'],
  set_link: ['op', 'slide', 'block', 'side', 'link'],
  set_order: ['op', 'slide', 'order'],
} as const satisfies { [K in OpName]: readonly (keyof Extract<Op, { op: K }>)[] }

/** 놓을 자리. 꼴이 틀리면 null, 없으면 빈 자리({}) */
function parsePlace(v: Record<string, unknown>): Place | null {
  if (v.edge !== undefined && v.edge !== 'top' && v.edge !== 'bottom') return null
  if (v.beside !== undefined && !blockRef(v.beside)) return null
  if (v.side !== undefined && !['before', 'after', 'above', 'below'].includes(v.side as string)) return null
  if (v.edge !== undefined && v.beside !== undefined) return null
  if (v.side !== undefined && v.beside === undefined) return null
  return { beside: v.beside as string | undefined, side: v.side as Place['side'], edge: v.edge as Place['edge'] }
}

/** 부품의 모양 값 (variant는 부품 종류를 알아야 확인할 수 있어서 적용할 때 본다) */
function parseLooks(v: Record<string, unknown>): boolean {
  if (v.variant !== undefined && !(typeof v.variant === 'string' && /^[a-z][a-zA-Z0-9]{0,23}$/.test(v.variant))) return false
  if (v.look !== undefined && !BLOCK_LOOK_IDS.includes(v.look as BlockLook)) return false
  if (v.effect !== undefined && !BLOCK_EFFECT_IDS.includes(v.effect as BlockEffect)) return false
  return true
}

/** 부품이 나오는 때와 빠르기, 들어오는 쪽 */
function parseTiming(v: Record<string, unknown>): boolean {
  if (v.when !== undefined && !BLOCK_WHEN_IDS.includes(v.when as BlockWhen)) return false
  if (v.speed !== undefined && !BLOCK_SPEED_IDS.includes(v.speed as BlockSpeed)) return false
  if (v.reveal !== undefined && !BLOCK_REVEAL_IDS.includes(v.reveal as BlockReveal)) return false
  if (v.from !== undefined && !BLOCK_FROM_IDS.includes(v.from as BlockFrom)) return false
  return true
}

function parseBlockOp(v: Record<string, unknown>): Op | null {
  const slide = refOrNull(v.slide)
  if (!slide) return null
  switch (v.op) {
    case 'add_block': {
      if (!onlyKeys(v, OP_KEYS.add_block)) return null
      if (!BLOCK_TYPES.includes(v.type as BlockType) || !parseLooks(v)) return null
      if (v.as !== undefined && !(typeof v.as === 'string' && NEW_BLOCK.test(v.as))) return null
      const place = parsePlace(v)
      if (!place) return null
      return {
        op: 'add_block',
        slide,
        type: v.type as BlockType,
        variant: v.variant as string | undefined,
        look: v.look as BlockLook | undefined,
        effect: v.effect as BlockEffect | undefined,
        as: v.as as string | undefined,
        ...place,
      }
    }
    case 'remove_block': {
      const block = blockRef(v.block)
      return onlyKeys(v, OP_KEYS.remove_block) && block ? { op: 'remove_block', slide, block } : null
    }
    case 'move_block': {
      const block = blockRef(v.block)
      if (!onlyKeys(v, OP_KEYS.move_block) || !block) return null
      const place = parsePlace(v)
      if (!place) return null
      // 자리와 맞바꾸기 가운데 꼭 하나
      if (v.swap !== undefined) {
        const swap = blockRef(v.swap)
        return swap && place.beside === undefined && place.edge === undefined && swap !== block ? { op: 'move_block', slide, block, swap } : null
      }
      if (place.beside === undefined && place.edge === undefined) return null
      return { op: 'move_block', slide, block, ...place }
    }
    case 'set_block': {
      const block = blockRef(v.block)
      if (!onlyKeys(v, OP_KEYS.set_block) || !block || !parseLooks(v) || !parseTiming(v)) return null
      if (v.count !== undefined && !isInt(v.count, 0, MAX_ITEMS)) return null
      if (v.highlight !== undefined && !isInt(v.highlight, HIGHLIGHT_MIN, HIGHLIGHT_MAX)) return null
      if ([v.variant, v.look, v.effect, v.when, v.speed, v.reveal, v.from, v.count, v.highlight].every((x) => x === undefined)) return null
      return {
        op: 'set_block',
        slide,
        block,
        variant: v.variant as string | undefined,
        look: v.look as BlockLook | undefined,
        effect: v.effect as BlockEffect | undefined,
        when: v.when as BlockWhen | undefined,
        speed: v.speed as BlockSpeed | undefined,
        reveal: v.reveal as BlockReveal | undefined,
        from: v.from as BlockFrom | undefined,
        count: v.count as number | undefined,
        highlight: v.highlight as number | undefined,
      }
    }
    case 'set_size': {
      const block = blockRef(v.block)
      if (!onlyKeys(v, OP_KEYS.set_size) || !block) return null
      if (v.w !== undefined && !isInt(v.w, 1, BOARD_COLS)) return null
      if (v.h !== undefined && !isInt(v.h, 1, BOARD_ROWS)) return null
      if (v.w === undefined && v.h === undefined) return null
      return { op: 'set_size', slide, block, w: v.w as number | undefined, h: v.h as number | undefined }
    }
    case 'set_link': {
      const block = blockRef(v.block)
      if (!onlyKeys(v, OP_KEYS.set_link) || !block) return null
      if (v.side !== 'right' && v.side !== 'below') return null
      if (v.link !== null && !isLink(v.link)) return null
      return { op: 'set_link', slide, block, side: v.side, link: v.link as BlockLink | null }
    }
    case 'set_order': {
      if (!onlyKeys(v, OP_KEYS.set_order) || !Array.isArray(v.order) || v.order.length > MAX_BLOCKS) return null
      const order = v.order.map(blockRef)
      if (!order.every((x): x is BlockRef => !!x) || new Set(order).size !== order.length) return null
      return { op: 'set_order', slide, order }
    }
  }
  return null
}

/** 정해진 꼴이 아니면 null. 모르는 키가 하나라도 있으면 받지 않는다. */
export function parseOp(v: unknown): Op | null {
  if (!isObj(v) || typeof v.op !== 'string') return null
  switch (v.op) {
    case 'add_block':
    case 'remove_block':
    case 'move_block':
    case 'set_block':
    case 'set_size':
    case 'set_link':
    case 'set_order':
      return parseBlockOp(v)
    case 'add_slide': {
      if (!onlyKeys(v, OP_KEYS.add_slide)) return null
      const after = refOrNull(v.after ?? null)
      if (after === undefined) return null
      if (v.layout !== undefined && !isLayout(v.layout)) return null
      const role = v.role === undefined ? undefined : cleanText(v.role, ROLE_MAX)
      if (role === null) return null
      if (v.layout === undefined && role === undefined) return null
      if (v.as !== undefined && !(typeof v.as === 'string' && NEW_REF.test(v.as))) return null
      return { op: 'add_slide', after, layout: v.layout as LayoutId | undefined, role, as: v.as as string | undefined }
    }
    case 'remove_slide':
    case 'set_layout':
    case 'set_hidden':
    case 'set_item_count':
    case 'set_guide':
    case 'move_slide':
    case 'set_options':
    case 'set_hint': {
      const slide = refOrNull(v.slide)
      if (!slide) return null
      if (v.op === 'remove_slide') return onlyKeys(v, OP_KEYS.remove_slide) ? { op: v.op, slide } : null
      if (v.op === 'set_layout') {
        if (!onlyKeys(v, OP_KEYS.set_layout) || !isLayout(v.layout)) return null
        if (v.variant !== undefined && !variantIds(v.layout).includes(v.variant as string)) return null
        return { op: v.op, slide, layout: v.layout, variant: v.variant as string | undefined }
      }
      if (v.op === 'set_hidden') {
        return onlyKeys(v, OP_KEYS.set_hidden) && typeof v.hidden === 'boolean' ? { op: v.op, slide, hidden: v.hidden } : null
      }
      if (v.op === 'set_item_count') {
        return onlyKeys(v, OP_KEYS.set_item_count) && isInt(v.count, 0, MAX_ITEMS)
          ? { op: v.op, slide, count: v.count as number }
          : null
      }
      if (v.op === 'set_guide') {
        const text = cleanText(v.text, GUIDE_MAX, true)
        return onlyKeys(v, OP_KEYS.set_guide) && text ? { op: v.op, slide, text } : null
      }
      if (v.op === 'move_slide') {
        const after = refOrNull(v.after ?? null)
        return onlyKeys(v, OP_KEYS.move_slide) && after !== undefined ? { op: v.op, slide, after } : null
      }
      if (v.op === 'set_options') {
        if (!onlyKeys(v, OP_KEYS.set_options)) return null
        if (v.pane !== undefined && v.pane !== null && !isInt(v.pane, 1, 12)) return null
        if (v.highlight !== undefined && !isInt(v.highlight, HIGHLIGHT_MIN, HIGHLIGHT_MAX)) return null
        if (v.flip !== undefined && typeof v.flip !== 'boolean') return null
        if (v.contain !== undefined && typeof v.contain !== 'boolean') return null
        if (v.hideHead !== undefined && typeof v.hideHead !== 'boolean') return null
        if (v.hideFoot !== undefined && typeof v.hideFoot !== 'boolean') return null
        if (v.motion !== undefined && v.motion !== null && !isOneOf(MOTIONS, v.motion)) return null
        if (v.tone !== undefined && !isOneOf(TONES, v.tone)) return null
        if (v.place !== undefined && v.place !== null && !isOneOf(PLACES, v.place)) return null
        if (v.transition !== undefined && v.transition !== null && !isOneOf(TRANSITIONS, v.transition)) return null
        // 모르는 장면은 꼴부터 틀린 것 (요청을 통째로 받지 않는다). 맞지 않는 장면은 적용할 때 장을 보고 건너뛴다
        if (v.scene !== undefined && v.scene !== null && !isScene(v.scene)) return null
        if ([v.highlight, v.flip, v.pane, v.contain, v.motion, v.tone, v.place, v.transition, v.scene, v.hideHead, v.hideFoot].every((x) => x === undefined)) return null
        return {
          op: v.op,
          slide,
          highlight: v.highlight as number | undefined,
          flip: v.flip as boolean | undefined,
          pane: v.pane as number | null | undefined,
          contain: v.contain as boolean | undefined,
          motion: v.motion as Motion | null | undefined,
          tone: v.tone as Tone | undefined,
          place: v.place as TitlePlace | null | undefined,
          transition: v.transition as Transition | null | undefined,
          scene: v.scene as SceneId | null | undefined,
          hideHead: v.hideHead as boolean | undefined,
          hideFoot: v.hideFoot as boolean | undefined,
        }
      }
      // set_hint
      if (!onlyKeys(v, OP_KEYS.set_hint)) return null
      const text = cleanText(v.text, HINT_MAX)
      if (!text || typeof v.field !== 'string' || !/^[a-zA-Z]{1,20}$/.test(v.field)) return null
      if (v.item !== undefined && !isInt(v.item, 0, MAX_ITEMS - 1)) return null
      if (v.block !== undefined && !blockRef(v.block)) return null
      return { op: 'set_hint', slide, ...(v.block !== undefined ? { block: v.block as string } : {}), field: v.field, item: v.item as number | undefined, text }
    }
    case 'set_theme': {
      if (!onlyKeys(v, OP_KEYS.set_theme)) return null
      if (v.theme !== undefined && !THEME_ORDER.includes(v.theme as ThemeId)) return null
      if (v.accent !== undefined && v.accent !== null && !(typeof v.accent === 'string' && HEX.test(v.accent))) return null
      if (v.motion !== undefined && !isOneOf(MOTIONS, v.motion)) return null
      if (v.font !== undefined && v.font !== null && !isOneOf(FONTS, v.font)) return null
      if (v.size !== undefined && !isOneOf(TEXT_SIZES, v.size)) return null
      if (v.footer !== undefined && !isOneOf(FOOTERS, v.footer)) return null
      if (v.transition !== undefined && !isOneOf(TRANSITIONS, v.transition)) return null
      if ([v.theme, v.accent, v.motion, v.font, v.size, v.footer, v.transition].every((x) => x === undefined)) return null
      return {
        op: 'set_theme',
        theme: v.theme as ThemeId | undefined,
        accent: v.accent as string | null | undefined,
        motion: v.motion as Motion | undefined,
        font: v.font as FontId | null | undefined,
        size: v.size as TextSize | undefined,
        footer: v.footer as FooterMode | undefined,
        transition: v.transition as Transition | undefined,
      }
    }
    default:
      return null
  }
}

/** 제안 설명. 비었으면 '', 꼴이 틀리면(너무 길거나 제어 문자) null */
export const cleanNote = (v: unknown): string | null => (v === '' ? '' : cleanText(v, NOTE_MAX, true))

/** 요청 파일 전체를 확인한다. 하나라도 어긋나면 요청을 통째로 받지 않는다. */
export function parseRequest(v: unknown): ChangeRequest | null {
  if (!isObj(v) || !onlyKeys(v, ['format', 'version', 'id', 'deck', 'createdAt', 'note', 'ops'])) return null
  if (v.format !== REQUEST_FORMAT || v.version !== REQUEST_VERSION) return null
  if (typeof v.id !== 'string' || !REQUEST_ID.test(v.id)) return null
  if (typeof v.deck !== 'string' || !DECK_ID.test(v.deck)) return null
  if (!Number.isInteger(v.createdAt)) return null
  const note = cleanNote(v.note)
  if (note === null) return null
  if (!Array.isArray(v.ops) || !v.ops.length || v.ops.length > MAX_OPS) return null
  const ops = v.ops.map(parseOp)
  if (ops.some((o) => !o)) return null
  return { format: REQUEST_FORMAT, version: REQUEST_VERSION, id: v.id, deck: v.deck, createdAt: v.createdAt as number, note, ops: ops as Op[] }
}

// ---------- 적용 ----------

/** 보고 구성이 미리 넣는 이름표 (예상 위험, A안, 배경...). 사람이 적은 글로 치지 않는다. */
let prefilled: Set<string> | null = null
function prefilledWords(): Set<string> {
  if (!prefilled) {
    prefilled = new Set()
    for (const r of Object.values(BLUEPRINTS).flatMap((b) => b.recipes)) {
      Object.values(r.fields ?? {}).forEach((v) => prefilled!.add(v))
      r.prefill?.forEach((p) => Object.values(p).forEach((v) => v && prefilled!.add(v)))
    }
  }
  return prefilled
}

const blank = (v: string | undefined) => !(v ?? '').trim() || prefilledWords().has(v!.trim())
const ITEM_KEYS: ItemKey[] = ['title', 'body', 'value', 'meta', 'image']
const itemEmpty = (it: Item) => ITEM_KEYS.every((k) => blank(it[k]))
/** 사람이 적은 것이 하나도 없는 부품인지. 숨은 항목(최대 개수 뒤)도 본다 */
const blockEmpty = (b: Block) => Object.values(b.fields).every(blank) && b.items.every(itemEmpty)
const blockVariantIds = (type: BlockType) => (BLOCKS[type].variants ?? [{ id: 'base' }]).map((v) => v.id)
/** 바꾼 판이 장에 들어가지 않는데 바꾸기 전보다 높아지면 (이미 넘치던 장을 줄이는 것은 받는다) */
function grows(before: Block[], after: Block[], areaH: number): boolean {
  const need = needRows(after, boardFit(areaH, after))
  return need > BOARD_ROWS && need > needRows(before, boardFit(areaH, before))
}

/** 발표에 사람이 적은 글: 장과 부품의 칸, 항목, 노트. 가려 둔 칸과 항목도 넣는다. 미리 넣은 이름표는 빈 것으로 친다(blank) */
function writtenText(slides: Slide[]): Map<string, number> {
  const out = new Map<string, number>()
  const add = (v: string | undefined) => {
    if (!blank(v)) out.set(v!, (out.get(v!) ?? 0) + 1)
  }
  const take = (fields: Record<string, string>, items: Item[]) => {
    Object.values(fields).forEach(add)
    for (const it of items) ITEM_KEYS.forEach((k) => add(it[k]))
  }
  for (const s of slides) {
    take(s.fields, s.items)
    for (const b of s.blocks ?? []) take(b.fields, b.items)
    add(s.notes)
  }
  return out
}

/** 앞의 글이 뒤에 하나도 빠짐없이 남았는지 (같은 글이 둘이면 둘 다) */
const keepsText = (before: Map<string, number>, after: Map<string, number>) => [...before].every(([v, n]) => (after.get(v) ?? 0) >= n)

/** 사람이 적은 것이 하나도 없는 장인지. 노트도 내용이다. */
export function slideEmpty(slide: Slide): boolean {
  // 부품 장의 부품에 적은 글도 사람이 적은 글이다. 부품이 하나라도 있으면 빈 장이 아니다
  const blocks = slide.blocks ?? []
  return Object.values(slide.fields).every(blank) && slide.items.every(itemEmpty) && !slide.notes.trim() && !blocks.length
}

/** 보고 구성에 있는 역할이면 그 장의 안내와 미리 넣는 이름표까지 같이 쓴다. */
function recipeFor(deck: Deck, role: string) {
  const own = BLUEPRINTS[deck.meta.type]?.recipes ?? []
  const all = Object.values(BLUEPRINTS).flatMap((b) => b.recipes)
  return own.find((r) => r.purpose === role) ?? all.find((r) => r.purpose === role)
}

export interface Applied {
  deck: Deck
  results: OpResult[]
  /** 새로 생기거나 바뀐 장 (원래 id) */
  touched: Set<string>
  /** add_slide의 as 이름 → 새 장의 id */
  named: Map<string, string>
}

/** 요청을 차례로 덱에 적용한다. 되지 않는 것은 건너뛰고 이유를 남긴다. 덱은 고치지 않고 새로 만든다. */
export function applyOps(deck: Deck, ops: Op[]): Applied {
  let slides = deck.slides.map((s) => s)
  let theme = { ...deck.theme }
  let motion = deck.motion
  const named = new Map<string, string>()
  const touched = new Set<string>()
  /** add_block의 as 이름 → 새 부품의 id */
  const blockNamed = new Map<string, string>()

  const find = (ref: SlideRef): number => {
    const id = NEW_REF.test(ref) ? named.get(ref) : undefined
    if (id) return slides.findIndex((s) => s.id === id)
    const hits = slides.flatMap((s, i) => (shapeSlideId(s) === ref ? [i] : []))
    return hits.length === 1 ? hits[0] : -1
  }
  const put = (i: number, s: Slide) => {
    // 부품 장은 편집기에서 고칠 때(deckStore의 commit)처럼 판을 다시 맞춘다: 면을 바꾸거나 이음표를 끼워
    // 부품이 커지면 옆에서 자리를 받는다. 맞추지 않으면 다음 제안과 미리 보기가 잘린 판 위에서 돈다
    const fitted = s.layout === 'compose' && s.blocks?.length ? settle(s.blocks, boardFit(areaOf(s), s.blocks)) : null
    const next = fitted ? { ...s, blocks: fitted } : s
    slides = slides.map((x, j) => (j === i ? next : x))
    touched.add(s.id)
  }
  /** 장 안의 부품. 모양 파일의 id가 둘 이상 맞으면 찾지 못한 것으로 친다 */
  const findBlock = (s: Slide, ref: BlockRef): Block | undefined => {
    const blocks = s.blocks ?? []
    if (NEW_BLOCK.test(ref)) return blocks.find((b) => b.id === blockNamed.get(ref))
    const hits = blocks.filter((b) => shapeBlockId(b) === ref)
    return hits.length === 1 ? hits[0] : undefined
  }
  /** 놓을 자리. 알아서 고르면 null, 옆에 둘 부품이 없으면(옮기는 부품 자신도) 'no_block' */
  const spotFor = (s: Slide, base: Block[], p: Place): Spot | null | 'no_block' => {
    if (p.edge) return { at: null, side: p.edge === 'top' ? 'above' : 'below' }
    if (p.beside === undefined) return null
    const next = findBlock(s, p.beside)
    if (!next || !base.some((b) => b.id === next.id)) return 'no_block'
    const side = p.side === 'before' ? 'left' : p.side === 'above' ? 'above' : p.side === 'below' ? 'below' : 'right'
    return { at: next.id, side }
  }
  // 부품 장의 본문 높이: 잴 수 없으니 제목, 부제 길이와 발표 설정(글자 크기, 보내는 자료)으로 어림한다 (편집기와 같은 높이)
  const areaOf = (s: Slide) => boardAreaH(s, { meta: deck.meta, theme })

  const step = (op: Op): OpResult => {
    const fail = (code: OpCode): OpResult => ({ ok: false, code })
    const done: OpResult = { ok: true, code: 'applied' }

    if (op.op === 'set_theme') {
      const next = { ...theme }
      if (op.theme) next.id = op.theme
      if (op.accent !== undefined) next.accent = op.accent === null ? undefined : op.accent.toLowerCase()
      if (op.font !== undefined) next.font = op.font ?? undefined
      if (op.size) next.size = op.size
      if (op.footer) next.footer = op.footer
      if (op.transition) next.transition = op.transition
      const nextMotion = op.motion ?? motion
      const same = (Object.keys({ ...theme, ...next }) as (keyof typeof next)[]).every((k) => theme[k] === next[k])
      if (same && (nextMotion ?? 'calm') === (motion ?? 'calm')) return fail('no_change')
      theme = next
      motion = nextMotion
      return done
    }

    if (op.op === 'add_slide') {
      let at = 0
      if (op.after !== null) {
        const i = find(op.after)
        if (i < 0) return fail('no_slide')
        at = i + 1
      }
      const recipe = op.role ? recipeFor(deck, op.role) : undefined
      const layout = op.layout ?? recipe?.layout
      if (!layout) return fail('unknown_role')
      const slide = makeSlide(layout, recipe && recipe.layout === layout ? recipe : { purpose: op.role ?? LAYOUTS[layout].name })
      const prev = slides[at - 1]
      if (prev && !recipe?.section) slide.section = prev.section
      slides = [...slides.slice(0, at), slide, ...slides.slice(at)]
      if (op.as) named.set(op.as, slide.id)
      touched.add(slide.id)
      return done
    }

    const i = find(op.slide)
    if (i < 0) return fail('no_slide')
    const s = slides[i]
    const spec = LAYOUTS[s.layout]

    switch (op.op) {
      case 'remove_slide':
        if (!slideEmpty(s)) return fail('has_content')
        if (slides.length <= 1) return fail('last_slide')
        slides = slides.filter((_, j) => j !== i)
        return done
      case 'move_slide': {
        const rest = slides.filter((_, j) => j !== i)
        let at = 0
        if (op.after !== null) {
          const target = rest.findIndex((x) => x.id === slides[find(op.after!)]?.id)
          if (target < 0) return fail('no_slide')
          at = target + 1
        }
        slides = [...rest.slice(0, at), s, ...rest.slice(at)]
        return done
      }
      case 'set_layout': {
        if (s.layout === 'compose' || op.layout === 'compose') {
          if (s.layout === op.layout) return fail('no_change')
          // 부품 장으로: 글을 하나도 버리지 않고 같은 모습의 부품으로 옮긴다 (표지, 단락 장은 안 된다).
          // 예전에 부품 장이었던 장은 남겨 둔 판을 되살린다(asCompose)
          if (op.layout === 'compose') {
            if (!canCompose(s.layout)) return fail('not_for_layout')
            put(i, asCompose(s))
            return done
          }
          // 부품 장에서: 그 레이아웃의 부품 하나뿐일 때만. 다른 부품이 있으면 되돌리면서 버리게 된다
          const back = unwrapCompose(s, op.layout)
          if (!back) return fail('not_for_layout')
          const variant = op.variant ?? variantOf(back)
          put(i, { ...back, variant: variant === variantIds(op.layout)[0] ? undefined : variant })
          return done
        }
        const variant = op.variant ?? (op.layout === s.layout ? variantOf(s) : variantIds(op.layout)[0])
        if (op.layout === s.layout && variant === variantOf(s)) return fail('no_change')
        put(i, relayout(s, op.layout, variant === variantIds(op.layout)[0] ? undefined : variant))
        return done
      }
      case 'set_hidden':
        if (!!s.hidden === op.hidden) return fail('no_change')
        put(i, { ...s, hidden: op.hidden })
        return done
      case 'set_item_count': {
        if (!spec.items) return fail('not_for_layout')
        if (op.count < spec.items.min || op.count > spec.items.max) return fail('out_of_range')
        if (op.count === Math.min(s.items.length, spec.items.max)) return fail('no_change')
        const items = withVisibleCount(s.items, spec.items.max, op.count, itemEmpty)
        if (!items) return fail('has_content')
        put(i, { ...s, items })
        return done
      }
      case 'set_options': {
        const options = { ...s.options }
        if (op.hideHead !== undefined) options.hideHead = op.hideHead || undefined
        if (op.hideFoot !== undefined) options.hideFoot = op.hideFoot || undefined
        if (op.highlight !== undefined) {
          if (!spec.highlight) return fail('not_for_layout')
          if (op.highlight >= Math.min(s.items.length, spec.items?.max ?? 0)) return fail('out_of_range')
          options.highlight = op.highlight
        }
        if (op.flip !== undefined || op.pane !== undefined) {
          // 옆 판을 옮기거나 너비를 고를 수 있는 장, 모양에서만 (표지의 아래 띠, 색 면은 안 된다)
          const panes = panesOf(s)
          if (!panes) return fail('not_for_layout')
          if (op.pane !== undefined && op.pane !== null && !panes.sides.includes(op.pane)) return fail('out_of_range')
          if (op.flip !== undefined) options.flip = op.flip || undefined
          if (op.pane !== undefined) options.pane = op.pane === null || op.pane === panes.base ? undefined : op.pane
        }
        if (op.contain !== undefined) {
          if (s.layout !== 'imageText') return fail('not_for_layout')
          options.contain = op.contain
        }
        if (op.motion !== undefined) options.motion = op.motion ?? undefined
        // 장마다의 '움직임에 맞춰'는 발표 전체 설정을 따르는 것과 같다
        if (op.transition !== undefined) options.transition = op.transition === null || op.transition === 'auto' ? undefined : op.transition
        if (op.tone !== undefined) {
          // 색 면 장(표지, 섹션, 마지막 장)은 바탕을 바꾸지 않는다
          if (BOLD_LAYOUTS.includes(s.layout)) return fail('not_for_layout')
          options.tone = op.tone === 'base' ? undefined : op.tone
        }
        if (op.place !== undefined) {
          // 제목 덩어리를 옮길 수 있는 장(표지, 섹션)만. 기본 자리는 값을 지운다
          if (!spec.place) return fail('not_for_layout')
          options.place = op.place === null || op.place === spec.place.base ? undefined : op.place
        }
        if (op.scene !== undefined) {
          // 맞는지는 지금 장으로 본다: 같은 제안에서 레이아웃을 먼저 바꿨으면 바꾼 장으로
          if (op.scene !== null && !sceneFits(s, op.scene)) return fail('scene_unfit')
          // 장면 하나만 바꾸자는데 이미 그 장면이면, 바뀌는 것으로 세지 않는다 (미리 보기의 '바꾸는 것' 수가 부풀지 않게)
          const only = Object.keys(op).every((k) => k === 'op' || k === 'slide' || k === 'scene' || op[k as keyof typeof op] === undefined)
          if (only && (op.scene ?? undefined) === s.options.scene) return fail('no_change')
          options.scene = op.scene ?? undefined
        }
        put(i, { ...s, options })
        return done
      }
      case 'set_guide':
        put(i, { ...s, guide: op.text })
        return done
      case 'add_block':
      case 'move_block': {
        if (s.layout !== 'compose') return fail('not_for_layout')
        const blocks = s.blocks ?? []
        const area = areaOf(s)
        if (op.op === 'move_block') {
          const moving = findBlock(s, op.block)
          if (!moving) return fail('no_block')
          let target: DropTarget
          if (op.swap !== undefined) {
            const other = findBlock(s, op.swap)
            if (!other || other.id === moving.id) return fail('no_block')
            target = { kind: 'swap', with: other.id }
          } else {
            // 편집기에서 끌 때처럼 옮기는 부품을 뺀 판에서 자리를 센다
            const spot = spotFor(s, removeBlock(blocks, moving.id), op)
            if (spot === 'no_block') return fail('no_block')
            if (!spot) return fail('out_of_range')
            target = { kind: 'spot', spot }
          }
          const placed = moveAt(blocks, moving.id, target, area)
          if (!placed) return fail('no_room')
          if (placed.every((b) => { const was = blocks.find((x) => x.id === b.id)?.at; return was && b.at && was.x === b.at.x && was.y === b.at.y && was.w === b.at.w && was.h === b.at.h })) return fail('no_change')
          put(i, { ...s, blocks: placed })
          return done
        }
        if (op.variant !== undefined && !blockVariantIds(op.type).includes(op.variant)) return fail('not_for_layout')
        const variant = op.variant === blockVariantIds(op.type)[0] ? undefined : op.variant
        const block: Block = { ...makeBlock(op.type), ...(variant ? { variant } : {}), ...(op.look ? { look: op.look } : {}), ...(op.effect ? { effect: op.effect } : {}) }
        const spot = spotFor(s, blocks, op)
        if (spot === 'no_block') return fail('no_block')
        if (spot && whyNot(blocks, { kind: 'spot', spot }, block, area)) return fail('no_room')
        // 자리를 정하지 않으면 편집기의 눌러 넣기와 같다: 알아서 짠 판이면 판을 다시 고르고, 그 판도 알아서 짠 판으로 남긴다.
        // 자리를 정한 것은 사람이 끌어 놓은 것과 같다(표시와 자리가 달라져 사람이 짠 판이 된다)
        const auto = !spot && autoArranged(blocks, s.arranged, area)
        const placed = spot ? insertAt(blocks, spot, block, area) : autoPlace(blocks, block, area, auto)
        if (!placed) return fail('no_room')
        // 장의 다른 면과 어긋나는 면은 넣을 때 바탕 없이 바뀐다. AI가 그 면을 골랐으면 알린다
        if (op.look && placed.some((b) => b.id === block.id && lookOf(b) !== op.look)) return fail('look_clash')
        put(i, { ...s, blocks: placed, ...(auto ? { arranged: boardSig(placed) } : {}) })
        if (op.as) blockNamed.set(op.as, block.id)
        return done
      }
      case 'remove_block': {
        if (s.layout !== 'compose') return fail('not_for_layout')
        const b = findBlock(s, op.block)
        if (!b) return fail('no_block')
        if (!blockEmpty(b)) return fail('has_content')
        const before = s.blocks ?? []
        const auto = autoArranged(before, s.arranged, areaOf(s))
        const left = removeBlock(before, b.id, areaOf(s), auto)
        put(i, { ...s, blocks: left, ...(auto ? { arranged: boardSig(left) } : {}) })
        return done
      }
      case 'set_block': {
        if (s.layout !== 'compose') return fail('not_for_layout')
        const b = findBlock(s, op.block)
        if (!b) return fail('no_block')
        const bs = BLOCKS[b.type]
        const next: Block = { ...b }
        if (op.variant !== undefined) {
          const ids = blockVariantIds(b.type)
          if (!ids.includes(op.variant)) return fail('not_for_layout')
          next.variant = op.variant === ids[0] ? undefined : op.variant
        }
        if (op.look) {
          if (lookIssue(s.blocks ?? [], b.id, op.look)) return fail('look_clash')
          next.look = op.look
        }
        if (op.effect) next.effect = op.effect
        if (op.when) next.when = op.when === 'after' ? undefined : op.when
        if (op.speed) next.speed = op.speed === 'normal' ? undefined : op.speed
        if (op.reveal) {
          if (!bs.items) return fail('not_for_layout')
          next.reveal = op.reveal === 'all' ? undefined : op.reveal
        }
        if (op.from) {
          // 들어오는 쪽은 쪽이 있는 움직임(올라오기, 밀려오기, 펼치기)에만
          if (!fromOf({ ...next, from: op.from })) return fail('not_for_layout')
          next.from = op.from
        }
        if (op.count !== undefined) {
          if (!bs.items) return fail('not_for_layout')
          if (op.count < bs.items.min || op.count > bs.items.max) return fail('out_of_range')
          const items = withVisibleCount(b.items, bs.items.max, op.count, itemEmpty)
          if (!items) return fail('has_content')
          next.items = items
        }
        if (op.highlight !== undefined) {
          if (!bs.layout || !LAYOUTS[bs.layout].highlight) return fail('not_for_layout')
          if (op.highlight >= blockItems(next).length) return fail('out_of_range')
          next.highlight = op.highlight
        }
        const same =
          variantOfBlock(next) === variantOfBlock(b) &&
          lookOf(next) === lookOf(b) &&
          effectOf(next) === effectOf(b) &&
          whenOf(next) === whenOf(b) &&
          speedOf(next) === speedOf(b) &&
          revealOf(next) === revealOf(b) &&
          fromOf(next) === fromOf(b) &&
          next.items.length === b.items.length &&
          next.highlight === b.highlight
        if (same) return fail('no_change')
        const blocks = s.blocks ?? []
        const changed = mapBlock(blocks, b.id, () => next)
        // 옅은 면과 바탕 없음은 나란한 부품이 함께 바뀐다 (편집기와 같은 규칙)
        const after = op.look ? withLook(changed, b.id, op.look) : changed
        if (grows(blocks, after, areaOf(s))) return fail('no_room')
        put(i, { ...s, blocks: after })
        return done
      }
      case 'set_size': {
        if (s.layout !== 'compose') return fail('not_for_layout')
        const b = findBlock(s, op.block)
        if (!b?.at) return fail('no_block')
        if ((op.w ?? b.at.w) === b.at.w && (op.h ?? b.at.h) === b.at.h) return fail('no_change')
        // 너비, 높이 차례로. 그 크기가 되지 않으면(이웃이나 이 부품이 잘리면) 건너뛴다
        let blocks: Block[] | null = s.blocks ?? []
        if (op.w !== undefined) blocks = resizeBlock(blocks, b.id, 'w', op.w, areaOf(s))
        if (blocks && op.h !== undefined) blocks = resizeBlock(blocks, b.id, 'h', op.h, areaOf(s))
        if (!blocks) return fail('no_room')
        put(i, { ...s, blocks })
        return done
      }
      case 'set_link': {
        if (s.layout !== 'compose') return fail('not_for_layout')
        const b = findBlock(s, op.block)
        if (!b) return fail('no_block')
        const blocks = s.blocks ?? []
        const t: LinkTarget = { id: b.id, dir: op.side === 'right' ? 'h' : 'v' }
        // 판 끝(오른쪽 끝, 맨 아래)에는 이을 부품이 없어 이음표가 설 데가 없다
        if (!linkTargets(blocks).some((x) => sameLinkTarget(x, t))) return fail('out_of_range')
        if (linkAt(blocks, t) === op.link) return fail('no_change')
        // 뜻이 서지 않는 짝은 잇지 않는다 (편집기에서 놓을 때와 같은 규칙)
        if (op.link && linkIssue(blocks, t, op.link)) return fail('link_clash')
        const after = withLink(blocks, t, op.link)
        // 이음표가 선 자리는 양쪽 부품이 비켜 나는 만큼 높이가 더 든다
        if (grows(blocks, after, areaOf(s))) return fail('no_room')
        put(i, { ...s, blocks: after })
        return done
      }
      case 'set_order': {
        if (s.layout !== 'compose') return fail('not_for_layout')
        const picked = op.order.map((ref) => findBlock(s, ref))
        if (!picked.every((b): b is Block => !!b)) return fail('no_block')
        const order = picked.length ? picked.map((b) => b.id) : undefined
        const now = playOrder(s).map((b) => b.id)
        const next = playOrder({ ...s, options: { ...s.options, order } }).map((b) => b.id)
        if (now.join() === next.join() && !!order === !!s.options.order) return fail('no_change')
        put(i, { ...s, options: { ...s.options, order } })
        return done
      }
      case 'set_hint': {
        if (op.block !== undefined) {
          if (s.layout !== 'compose') return fail('not_for_layout')
          const b = findBlock(s, op.block)
          if (!b) return fail('no_block')
          const bs = BLOCKS[b.type]
          let key = op.field
          if (op.item !== undefined || !bs.fields.some((f) => f.key === op.field && !f.key.startsWith('$') && !f.image)) {
            if (!bs.items?.fields.some((f) => f.key === op.field && !f.image)) return fail('not_for_layout')
            if (op.item !== undefined && op.item >= blockItems(b).length) return fail('out_of_range')
            key = op.item === undefined ? `items.${op.field}` : `items.${op.item}.${op.field}`
          }
          put(i, { ...s, blocks: mapBlock(s.blocks ?? [], b.id, (x) => ({ ...x, hints: { ...x.hints, [key]: op.text } })) })
          return done
        }
        if (op.item === undefined && spec.fields.some((f) => f.key === op.field && !f.key.startsWith('$') && !f.image)) {
          put(i, { ...s, hints: { ...s.hints, [op.field]: op.text } })
          return done
        }
        const itemField = spec.items?.fields.find((f) => f.key === op.field && !f.image)
        if (!itemField) return fail('not_for_layout')
        if (op.item !== undefined && op.item >= Math.min(s.items.length, spec.items!.max)) return fail('out_of_range')
        const key = op.item === undefined ? `items.${op.field}` : `items.${op.item}.${op.field}`
        put(i, { ...s, hints: { ...s.hints, [key]: op.text } })
        return done
      }
    }
  }

  // 마지막 그물: 어느 제안도 사람이 적은 글을 지우지 못한다. 모양만 바꾸는 동작이 글을 잃으면(레이아웃을 바꾸며 가려 둔 칸을
  // 부품 장으로 옮기지 않고 버리던 것처럼) 그 동작만 되돌리고 적용하지 않는다
  const results = ops.map((op): OpResult => {
    const before = { slides, theme, motion, touched: new Set(touched) }
    const text = writtenText(slides)
    const result = step(op)
    if (!result.ok || keepsText(text, writtenText(slides))) return result
    slides = before.slides
    theme = before.theme
    motion = before.motion
    touched.clear()
    before.touched.forEach((id) => touched.add(id))
    return { ok: false, code: 'has_content' }
  })

  // 글자 크기나 보내는 자료를 바꾸면 본문 높이가 달라져서 모든 부품 장을 다시 맞춘다 (편집기와 같은 규칙)
  return { deck: settleDeck({ ...deck, theme, motion, slides }, deck), results, touched, named }
}

/** 요청이 이 덱을 향한 것인지 */
export const requestFor = (deck: Deck, request: Pick<ChangeRequest, 'deck'>) => request.deck === shapeDeckId(deck)

/** 다음 요청 id */
export function requestId(): string {
  const bytes = new Uint8Array(6)
  crypto.getRandomValues(bytes)
  return `r${[...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')}`
}

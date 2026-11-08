// AI(MCP)에게 보여 주는 발표의 '모양'. 사람이 적은 글은 한 글자도 넣지 않는다.
//
// 지키는 방법은 빼는 쪽이 아니라 고르는 쪽이다. 덱에서 필요한 값만 골라 새로 만들고,
// 글자는 카탈로그(레이아웃 이름, 장 역할 같은 이 앱에 원래 있는 말)에 있는 것만 넣는다.
// 그리고 앱, 로컬 서버, MCP 서버가 각각 checkShape로 다시 확인한다.

import {
  blockItems,
  BLOCK_EFFECTS,
  BLOCK_EFFECT_IDS,
  BLOCK_FROMS,
  BLOCK_FROM_IDS,
  BLOCK_LINKS,
  BLOCK_LOOKS,
  BLOCK_LOOK_IDS,
  BLOCK_SPEEDS,
  BLOCK_SPEED_IDS,
  BLOCK_TYPES,
  BLOCK_WHENS,
  BLOCK_WHEN_IDS,
  BLOCKS,
  BOARD_COLS,
  BOARD_ROWS,
  byReading,
  cleanBlocks,
  effectOf,
  fromOf,
  isArea,
  isLink,
  kindOf,
  lookOf,
  looksFor,
  MAX_BLOCKS,
  MAX_LARGE,
  speedOf,
  tiles,
  variantOfBlock,
  whenOf, revealOf,
  BLOCK_REVEALS,
} from '../deck/blocks'
import { AUDIENCES, BLUEPRINTS, DECK_TYPES, DURATIONS, METHODS } from '../deck/blueprints'
import { readField, visibleItems } from '../deck/fields'
import { LAYOUTS, LAYOUT_ORDER, placeOf, variantIds, variantOf } from '../deck/layouts'
import { isScene, SCENES, sceneFits, sceneOf } from '../deck/scenes'
import { ACCENT_COMBOS, FONTS, FOOTERS, footerOf, MOTIONS, PLACES, TEXT_SIZES, THEMES, THEME_ORDER, TONES, TRANSITIONS } from '../deck/themes'
import type { Audience, Block, BlockEffect, BlockFrom, BlockLink, BlockLook, BlockSpeed, BlockType, BlockWhen, Deck, DeckType, FontId, FooterMode, LayoutId, Method, Motion, Place, SceneId, Slide, TextSize, ThemeId, Tone, Transition, BlockReveal } from '../deck/types'
import { hasKey, HEX, isInt, isObj, isOneOf, onlyKeys } from './guards'
import { HIGHLIGHT_MAX, HIGHLIGHT_MIN, OPAQUE_ID, REQUEST_ID, SHAPE_FORMAT, SHAPE_VERSION } from './protocol'

/**
 * 칸의 글이 얼마나 긴지. 글자 수를 그대로 알려 주지 않고 구간만 알려 준다: 구간이 같으면 모양도 같아서, 모양으로 글을 맞혀 볼 수 없다.
 * 예전에는 비었다, 찼다, 길다(40자, 여러 줄 칸은 140자 넘게) 셋뿐이라 AI가 '이 칸은 길어서 넓은 자리로'를 가늠할 수 없었다
 */
export const TEXT_LENGTHS = ['1-10', '11-20', '21-40', '41-80', '81-140', '141-280', '281+'] as const
const LENGTH_TOPS = [10, 20, 40, 80, 140, 280, Infinity]
/** 여러 줄로 쓰는 칸(multiline)에 두 줄 넘게 쓴 줄 수의 구간 */
export const TEXT_LINES = ['2', '3-4', '5-8', '9+'] as const
const LINE_TOPS = [2, 4, 8, Infinity]
type TextLength = (typeof TEXT_LENGTHS)[number]
type TextLines = (typeof TEXT_LINES)[number]

/**
 * 칸의 상태. 글 칸은 비었으면 'empty', 아니면 글자 수 구간('21-40')이고, 여러 줄로 쓰는 칸에 두 줄 넘게 썼으면 줄 수 구간이 붙는다('81-140, 3-4 lines').
 * 이미지 칸은 있는지('filled')만: 이미지의 길이(데이터 크기)는 뜻이 없다
 */
export type FieldState = 'empty' | 'filled' | TextLength | `${TextLength}, ${TextLines} lines`
/** 글 칸의 상태로 나올 수 있는 모든 말. MCP 서버의 마지막 그물(정해진 말)에도 넣는다 */
export const TEXT_STATES: readonly FieldState[] = ['empty', ...TEXT_LENGTHS, ...TEXT_LENGTHS.flatMap((n) => TEXT_LINES.map((l) => `${n}, ${l} lines` as const))]

export interface ShapeSlide {
  /** 장의 원래 id가 아니라 그 해시. 원래 id는 가져온 파일에서 아무 글자나 될 수 있어서다. */
  id: string
  layout: LayoutId
  /** 이 장의 역할. 카탈로그에 있는 말이 아니면 null */
  role: string | null
  /** 단락 이름. 카탈로그에 있는 말이 아니면 null */
  section: string | null
  hidden: boolean
  /** 레이아웃 때문에 숨은 항목 수 (지우지 않고 남겨 둔 것) */
  hiddenItems: number
  fields: Record<string, FieldState>
  items: Record<string, FieldState>[]
  /**
   * transition: 이 장으로 넘어올 때(발표 전체 설정을 따르면 빠진다). order: 부품 장의 부품이 나오는 차례(부품 해시 id, 정했을 때만).
   * scene: 골라 둔 장면(카탈로그 scenes). 지금 장에 맞을 때만 나온다: 맞지 않는 장면은 발표할 때 쉬어서 AI가 헷갈린다
   */
  options: { highlight?: number; flip?: boolean; pane?: number; contain?: boolean; motion?: Motion; tone?: Tone; place?: Place; transition?: Transition; order?: string[]; scene?: SceneId; hideHead?: boolean; hideFoot?: boolean }
  /** 레이아웃 안의 모양 id. 카탈로그 layouts[].variants 중 하나, 한 가지뿐이면 'base' */
  variant: string
  /** 부품 장(layout 'compose')만: 판(12×12)에 놓인 부품들, 읽는 차례(위에서 아래, 왼쪽에서 오른쪽)로. 부품의 종류, 자리, 바탕, 움직임과 칸의 글 길이만 */
  blocks?: ShapeBlock[]
  /** 편집기가 그린 이 장에서 글이 넘쳤으면 true (편집기의 '글이 넘쳤어요'와 같은 잣대). 넘치지 않았거나 재지 못했으면 빠진다 */
  over?: true
}

/**
 * 편집기가 그린 장에서 잰 넘침: 글이 넘친 장과 부품의 원래 id. 모양은 글을 모르고 그리지도 않아서(발표 모델만으로 만든다)
 * 넘쳤는지는 화면이 재서 넘겨준다(screens/editor/aiOver.ts). 모양에는 해시 id에 붙은 참거짓으로만 나간다
 */
export interface ShapeOver {
  slides: ReadonlySet<string>
  blocks: ReadonlySet<string>
}
const NO_OVER: ShapeOver = { slides: new Set(), blocks: new Set() }

export interface ShapeBlock {
  /** 부품을 가리키는 해시 id (b로 시작). 예전 앱이 쓴 모양 파일에는 없다 */
  id?: string
  type: BlockType
  /** 판의 자리: 왼쪽 위 칸(x, y, 0부터)과 너비, 높이(칸 수). 판은 가로 12칸, 세로 12칸이고 부품들이 빈틈없이 나눠 덮는다 */
  x: number
  y: number
  w: number
  h: number
  look: BlockLook
  effect: BlockEffect
  /** 아래 셋은 기본값이 아닐 때만: 언제 나오는지(blockWhens), 빠르기(blockSpeeds), 들어오는 쪽(blockFroms, 쪽이 있는 움직임만) */
  when?: BlockWhen
  speed?: BlockSpeed
  /** 항목이 누를 때마다 하나씩 나오면 'each'(blockReveals). 기본(한꺼번에)이면 없다 */
  reveal?: BlockReveal
  from?: BlockFrom
  /** 카탈로그 blocks[].variants 중 하나, 한 가지뿐이면 'base' */
  variant: string
  /** 강조할 항목을 고를 수 있는 부품만 (카탈로그 blocks[].highlight) */
  highlight?: number
  /** 오른쪽 선(link)과 아래 선(linkBelow)에 선 이음표 (카탈로그 blockLinks). 선 건너편의 부품과 잇는다. 없으면 빠진다 */
  link?: BlockLink
  linkBelow?: BlockLink
  fields: Record<string, FieldState>
  items: Record<string, FieldState>[]
  /** 이 부품의 글이 넘쳤으면 true (ShapeSlide.over와 같다) */
  over?: true
}

export interface ShapeDeck {
  format: typeof SHAPE_FORMAT
  version: typeof SHAPE_VERSION
  deck: string
  type: DeckType
  audience: Audience
  duration: number
  method: Method
  theme: ThemeId
  accent: string | null
  motion: Motion
  /** 아래 넷은 나중에 생겨서, 예전 앱이 쓴 모양 파일에는 없을 수 있다 */
  font?: FontId | null
  size?: TextSize
  footer?: FooterMode
  transition?: Transition
  updatedAt: number
  slides: ShapeSlide[]
}

const ALL_TYPES: DeckType[] = [...DECK_TYPES, 'blank']

/** FNV-1a 32비트. 원래 id를 드러내지 않고 다시 찾을 수 있게 한다. */
function fnv(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

export const shapeSlideId = (slide: Pick<Slide, 'id'>) => `s${fnv(`slide:${slide.id}`)}`
export const shapeDeckId = (deck: Pick<Deck, 'id'>) => `d${fnv(`deck:${deck.id}`)}`
export const shapeBlockId = (block: Pick<Block, 'id'>) => `b${fnv(`block:${block.id}`)}`

// ---------- 카탈로그: 앱에 원래 있는 말. AI에게 보여 줘도 되는 글자는 이것뿐이다. ----------

export function catalog() {
  return {
    layouts: LAYOUT_ORDER.map((id) => {
      const spec = LAYOUTS[id]
      return {
        id,
        name: spec.name,
        description: spec.description,
        variants: (spec.variants ?? [{ id: 'base', name: spec.name }]).map((v) => ({ id: v.id, name: v.name })),
        highlight: spec.highlight?.label ?? null,
        // 두 판으로 나뉜 장: 옆 판의 이름, 고를 수 있는 너비(장 너비를 12로 나눈 칸 수), 기본 너비, 고를 수 있는 모양
        panes: spec.panes ? { name: spec.panes.name, sides: spec.panes.sides, base: spec.panes.base, variants: spec.panes.variants ?? null } : null,
        // 제목 덩어리를 위, 가운데, 아래로 옮길 수 있는 장: 덩어리의 이름과 기본 자리 (고를 값은 places)
        place: spec.place ? { name: spec.place.name, base: spec.place.base } : null,
        fields: spec.fields.map((f) => ({ key: f.key, label: f.label, optional: !!f.optional, image: !!f.image })),
        items: spec.items
          ? {
              label: spec.items.label,
              min: spec.items.min,
              max: spec.items.max,
              fields: spec.items.fields.map((f) => ({ key: f.key, label: f.label, optional: !!f.optional, image: !!f.image })),
            }
          : null,
      }
    }),
    deckTypes: ALL_TYPES.map((id) => {
      const bp = BLUEPRINTS[id]
      return {
        id,
        name: bp.name,
        description: bp.description,
        storyline: bp.storyline,
        roles: bp.recipes.map((r) => ({
          role: r.layout === 'section' ? (r.section ?? r.purpose) : r.purpose,
          layout: r.layout,
          section: r.section ?? null,
          priority: r.priority,
        })),
      }
    }),
    audiences: AUDIENCES.map((a) => ({ id: a.id, name: a.name, description: a.description })),
    durations: DURATIONS.map((d) => ({ minutes: d.minutes, name: d.name })),
    methods: METHODS.map((m) => ({ id: m.id, name: m.name, description: m.description })),
    themes: THEME_ORDER.map((id) => ({ id, name: THEMES[id].name, description: THEMES[id].description, accent: THEMES[id].accent })),
    // 강조색을 바꾸자고 할 때는 여기서 고른다. 짝으로 맞춰 본 색이라 아무 색보다 잘 어울린다
    accents: ACCENT_COMBOS.map((c) => ({ name: c.name, accent: c.accent.toLowerCase() })),
    motions: MOTIONS.map((m) => ({ id: m.id, name: m.name, description: m.description })),
    fonts: FONTS.map((m) => ({ id: m.id, name: m.name, description: m.description })),
    textSizes: TEXT_SIZES.map((m) => ({ id: m.id, name: m.name, description: m.description })),
    footers: FOOTERS.map((m) => ({ id: m.id, name: m.name, description: m.description })),
    slideDisplay: [
      { id: 'hideHead', name: '제목과 부제 숨기기', description: '이 슬라이드의 제목과 부제를 감추고 본문에 자리를 돌려줘요.' },
      { id: 'hideFoot', name: '출처와 아래 표시 숨기기', description: '이 슬라이드의 출처와 아래 표시를 감추고 본문에 자리를 돌려줘요.' },
    ],
    transitions: TRANSITIONS.map((m) => ({ id: m.id, name: m.name, description: m.description })),
    tones: TONES.map((m) => ({ id: m.id, name: m.name, description: m.description })),
    places: PLACES.map((m) => ({ id: m.id, name: m.name, description: m.description })),
    blocks: BLOCK_TYPES.map((type) => {
      const spec = BLOCKS[type]
      return {
        type,
        name: spec.name,
        description: spec.description,
        motion: spec.motion,
        // 가장 좁은 너비(판의 칸 수). 12면 장 너비를 혼자 쓴다
        minSpan: spec.minSpan,
        // 작은 부품: 큰 부품 수(blockRules.maxLarge)에 세지 않는다
        small: !!spec.small,
        // 이음표로 이을 때의 갈래 (number, words, list, chart, flow, table, image). 같은 갈래끼리 잇는다
        kind: kindOf(type),
        looks: looksFor(type),
        variants: (spec.variants ?? [{ id: 'base', name: spec.name }]).map((v) => ({ id: v.id, name: v.name })),
        highlight: (spec.layout && LAYOUTS[spec.layout].highlight?.label) || null,
        fields: blockFieldSpecs(type).map((f) => ({ key: f.key, label: f.label, optional: !!f.optional, image: !!f.image })),
        items: spec.items
          ? {
              label: spec.items.label,
              min: spec.items.min,
              max: spec.items.max,
              fields: spec.items.fields.map((f) => ({ key: f.key, label: f.label, optional: !!f.optional, image: !!f.image })),
            }
          : null,
      }
    }),
    // 부품 장의 판: 가로, 세로 칸 수, 한 장의 부품 수와 그 가운데 작은 부품(blocks[].small)이 아닌 부품 수
    blockRules: { cols: BOARD_COLS, rows: BOARD_ROWS, maxBlocks: MAX_BLOCKS, maxLarge: MAX_LARGE },
    blockLooks: BLOCK_LOOKS.map((m) => ({ id: m.id, name: m.name })),
    blockEffects: BLOCK_EFFECTS.map((m) => ({ id: m.id, name: m.name, description: m.description })),
    // 부품이 언제 나오는지(이어서, 함께, 누르면), 빠르기, 들어오는 쪽(올라오기, 밀려오기, 펼치기만)
    blockWhens: BLOCK_WHENS.map((m) => ({ id: m.id, name: m.name, description: m.description })),
    blockSpeeds: BLOCK_SPEEDS.map((m) => ({ id: m.id, name: m.name })),
    // 항목이 있는 부품의 항목이 나오는 때: 한꺼번에, 하나씩(발표할 때 누를 때마다 다음 항목)
    blockReveals: BLOCK_REVEALS.map((m) => ({ id: m.id, name: m.name, description: m.description })),
    blockFroms: BLOCK_FROMS.map((m) => ({ id: m.id, name: m.name })),
    // 부품 사이의 선에 끼우는 표시: 부품의 오른쪽 선(link) 또는 아래 선(linkBelow)
    blockLinks: BLOCK_LINKS.map((m) => ({ id: m.id, name: m.name, description: m.description })),
    // 장면: 장 하나를 처음부터 끝까지 한 번에 짠 움직임. 맞는 장에만 고를 수 있다: layouts의 장, 또는 부품 장(compose)에 blocks의 부품이 하나라도 있을 때
    // (비교 드러내기는 나란히 선 두 부품뿐인 부품 장에도 맞는다)
    scenes: SCENES.map((m) => ({ id: m.id, name: m.name, description: m.description, layouts: [...m.layouts], blocks: [...m.blocks] })),
  }
}

/** 부품의 칸 가운데 부품마다 적는 것 ($로 시작하는 발표 전체의 값은 빼고) */
const blockFieldSpecs = (type: BlockType) => BLOCKS[type].fields.filter((f) => !f.key.startsWith('$'))

function collectStrings(value: unknown, out: Set<string>) {
  if (typeof value === 'string') out.add(value)
  else if (Array.isArray(value)) value.forEach((v) => collectStrings(v, out))
  else if (value && typeof value === 'object') Object.entries(value).forEach(([k, v]) => (out.add(k), collectStrings(v, out)))
}

let catalogWords: Set<string> | null = null
/** 카탈로그에 나오는 모든 글자 (키 포함) */
export function catalogStrings(): Set<string> {
  if (!catalogWords) {
    catalogWords = new Set()
    collectStrings(catalog(), catalogWords)
    for (const bp of Object.values(BLUEPRINTS)) {
      for (const r of bp.recipes) {
        catalogWords.add(r.purpose)
        if (r.section) catalogWords.add(r.section)
      }
    }
  }
  return catalogWords
}

/** 장 역할이나 단락 이름으로 보여 줘도 되는 말: 보고 구성에 원래 있는 역할, 단락, 레이아웃 이름 */
let roleWords: Set<string> | null = null
function roleStrings(): Set<string> {
  if (!roleWords) {
    roleWords = new Set(Object.values(LAYOUTS).map((l) => l.name))
    for (const bp of Object.values(BLUEPRINTS)) {
      for (const r of bp.recipes) {
        roleWords.add(r.purpose)
        if (r.section) roleWords.add(r.section)
      }
    }
  }
  return roleWords
}

const fromCatalog = (text: string): string | null => (roleStrings().has(text) ? text : null)

// ---------- 덱에서 모양만 골라 만들기 ----------

/** 칸 하나의 꼴: 글자 수의 구간을 셀 칸인지(여러 줄로 쓰는 칸이면 줄 수도), 있는지만 볼 이미지 칸인지 */
type FieldKind = { key: string; multiline?: boolean; image?: boolean }

/**
 * 칸의 상태. 글자 수는 줄바꿈과 줄 앞뒤의 빈칸을 빼고 센다(이모지 같은 글자도 하나로).
 * 줄 수는 여러 줄로 쓰는 칸에서만, 빈 줄은 빼고 센다. 둘 다 구간만 내보낸다
 */
function stateOf(text: string, field: FieldKind): FieldState {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').map((l) => l.trim()).filter(Boolean)
  if (!lines.length) return 'empty'
  if (field.image) return 'filled'
  const n = [...lines.join('')].length
  const len = TEXT_LENGTHS[LENGTH_TOPS.findIndex((top) => n <= top)]
  if (!field.multiline || lines.length < 2) return len
  return `${len}, ${TEXT_LINES[LINE_TOPS.findIndex((top) => lines.length <= top)]} lines`
}

/** over: 편집기가 그린 장에서 잰 넘침. 없으면(그리지 않는 곳, 시험) 넘침을 알리지 않는다 */
export function toShape(deck: Deck, over: ShapeOver = NO_OVER): ShapeDeck {
  return {
    format: SHAPE_FORMAT,
    version: SHAPE_VERSION,
    deck: shapeDeckId(deck),
    type: ALL_TYPES.includes(deck.meta.type) ? deck.meta.type : 'blank',
    audience: AUDIENCES.some((a) => a.id === deck.meta.audience) ? deck.meta.audience : 'mixed',
    duration: Number.isFinite(deck.meta.duration) ? Math.max(0, Math.min(240, Math.round(deck.meta.duration))) : 0,
    method: METHODS.some((m) => m.id === deck.meta.method) ? deck.meta.method : 'live',
    theme: THEME_ORDER.includes(deck.theme.id) ? deck.theme.id : 'white',
    accent: deck.theme.accent && HEX.test(deck.theme.accent) ? deck.theme.accent.toLowerCase() : null,
    motion: MOTIONS.some((m) => m.id === deck.motion) ? deck.motion! : 'calm',
    font: isOneOf(FONTS, deck.theme.font) ? deck.theme.font : null,
    size: isOneOf(TEXT_SIZES, deck.theme.size) ? deck.theme.size : 'normal',
    footer: footerOf(deck),
    transition: isOneOf(TRANSITIONS, deck.theme.transition) ? deck.theme.transition : 'auto',
    updatedAt: Math.round(deck.updatedAt) || 0,
    slides: deck.slides.filter((s) => hasKey(LAYOUTS, s.layout)).map((s) => shapeSlide(deck, s, over)),
  }
}

function shapeSlide(deck: Deck, slide: Slide, over: ShapeOver): ShapeSlide {
  const spec = LAYOUTS[slide.layout]
  const fields: Record<string, FieldState> = {}
  for (const f of spec.fields) fields[f.key] = stateOf(readField(slide, deck.meta, f.key), f)
  const visible = visibleItems(slide)
  const items = spec.items
    ? visible.map((item) => {
        const out: Record<string, FieldState> = {}
        for (const f of spec.items!.fields) out[f.key] = stateOf(item[f.key] ?? '', f)
        return out
      })
    : []
  const options: ShapeSlide['options'] = {}
  const o = slide.options ?? {}
  if (o.hideHead === true) options.hideHead = true
  if (o.hideFoot === true) options.hideFoot = true
  // 가져온 파일이면 아무 수나 있을 수 있다. 범위 밖의 수를 그대로 넣으면 모양 전체가 꼴 확인에서 버려진다
  if (spec.highlight && isInt(o.highlight, HIGHLIGHT_MIN, HIGHLIGHT_MAX)) options.highlight = o.highlight
  // 두 판으로 나뉜 장: 옆 판의 자리와 너비 (고를 수 있는 값일 때만)
  const panes = LAYOUTS[slide.layout].panes
  if (panes) {
    options.flip = !!o.flip
    if (Number.isInteger(o.pane) && panes.sides.includes(o.pane as number)) options.pane = o.pane
  }
  if (slide.layout === 'imageText') options.contain = !!o.contain
  if (isOneOf(MOTIONS, o.motion)) options.motion = o.motion
  if (isOneOf(TRANSITIONS, o.transition) && o.transition !== 'auto') options.transition = o.transition
  if (isOneOf(TONES, o.tone) && o.tone !== 'base') options.tone = o.tone
  const place = placeOf(slide)
  if (place) options.place = place
  // 부품 장은 모양에 보이는 부품(꼴을 맞춘 것)으로 맞는지 본다. 가져온 파일의 모르는 부품 때문에 맞는다고 보지 않게
  const blocks = slide.layout === 'compose' ? byReading(cleanBlocks(slide.blocks)) : undefined
  const scene = sceneOf({ layout: slide.layout, blocks, options: o })
  if (scene) options.scene = scene
  const out: ShapeSlide = {
    id: shapeSlideId(slide),
    layout: slide.layout,
    role: fromCatalog(slide.purpose ?? ''),
    section: fromCatalog(slide.section ?? ''),
    hidden: !!slide.hidden,
    hiddenItems: Math.max(0, slide.items.length - visible.length),
    fields,
    items,
    options,
    variant: variantOf(slide),
  }
  if (blocks) {
    // 가져온 파일일 수 있어서 꼴부터 맞춘다 (모르는 부품, 넘치는 개수는 빼고, 판을 덮지 않는 자리는 다시 나눈다)
    out.blocks = blocks.map((b) => shapeBlock(b, over))
    // 나오는 차례는 장에 있는 부품의 해시 id로만 (지운 부품의 id가 남아 있으면 뺀다)
    const byId = new Map(blocks.map((b) => [b.id, b]))
    const order = [...new Set(Array.isArray(o.order) ? o.order : [])].filter((id) => byId.has(id)).map((id) => shapeBlockId(byId.get(id)!))
    if (order.length) options.order = order
  }
  if (over.slides.has(slide.id)) out.over = true
  return out
}

function shapeBlock(block: Block, over: ShapeOver): ShapeBlock {
  const spec = BLOCKS[block.type]
  const fields: Record<string, FieldState> = {}
  for (const f of blockFieldSpecs(block.type)) fields[f.key] = stateOf(block.fields[f.key] ?? '', f)
  const items = spec.items
    ? blockItems(block).map((item) => {
        const o: Record<string, FieldState> = {}
        for (const f of spec.items!.fields) o[f.key] = stateOf(item[f.key] ?? '', f)
        return o
      })
    : []
  const { x, y, w, h } = block.at!
  const out: ShapeBlock = { id: shapeBlockId(block), type: block.type, x, y, w, h, look: lookOf(block), effect: effectOf(block), variant: variantOfBlock(block), fields, items }
  if (isLink(block.link)) out.link = block.link
  if (isLink(block.linkBelow)) out.linkBelow = block.linkBelow
  if (whenOf(block) !== 'after') out.when = whenOf(block)
  if (speedOf(block) !== 'normal') out.speed = speedOf(block)
  if (revealOf(block) !== 'all') out.reveal = revealOf(block)
  if (block.from && fromOf(block)) out.from = fromOf(block)!
  if (spec.layout && LAYOUTS[spec.layout].highlight && isInt(block.highlight, HIGHLIGHT_MIN, HIGHLIGHT_MAX)) out.highlight = block.highlight
  if (over.blocks.has(block.id)) out.over = true
  return out
}

// ---------- 확인: 모양 파일이 정해진 꼴 그대로인지. 하나라도 어긋나면 통째로 버린다. ----------

const IMAGE_STATES: readonly FieldState[] = ['empty', 'filled']
/** 한 줄로 쓰는 칸의 상태: 줄 수가 붙지 않는다 */
const LINE_STATES: readonly FieldState[] = ['empty', ...TEXT_LENGTHS]

/** 칸마다 그 칸의 꼴에 맞는 상태인지: 이미지 칸은 있는지만, 한 줄 칸은 줄 수 없이. 칸은 정해진 것이 빠짐없이, 그것만 */
function checkStates(v: unknown, fields: readonly FieldKind[]): boolean {
  if (!isObj(v) || Object.keys(v).length !== fields.length) return false
  return fields.every((f) => (f.image ? IMAGE_STATES : f.multiline ? TEXT_STATES : LINE_STATES).includes(v[f.key] as FieldState))
}

function checkBlock(v: unknown): boolean {
  if (!isObj(v) || !onlyKeys(v, ['id', 'type', 'x', 'y', 'w', 'h', 'look', 'effect', 'when', 'speed', 'reveal', 'from', 'variant', 'highlight', 'link', 'linkBelow', 'fields', 'items', 'over'])) return false
  if (v.over !== undefined && v.over !== true) return false
  // 자리는 판 안의 칸이고, 이음표는 선 건너편에 부품이 있는 쪽에만 (판 끝에는 이을 부품이 없다)
  if (!isArea({ x: v.x, y: v.y, w: v.w, h: v.h })) return false
  if (v.link !== undefined && (!isLink(v.link) || (v.x as number) + (v.w as number) >= BOARD_COLS)) return false
  if (v.linkBelow !== undefined && (!isLink(v.linkBelow) || (v.y as number) + (v.h as number) >= BOARD_ROWS)) return false
  if (v.when !== undefined && !BLOCK_WHEN_IDS.includes(v.when as BlockWhen)) return false
  if (v.speed !== undefined && !BLOCK_SPEED_IDS.includes(v.speed as BlockSpeed)) return false
  if (v.reveal !== undefined && v.reveal !== 'each') return false
  if (v.from !== undefined && !BLOCK_FROM_IDS.includes(v.from as BlockFrom)) return false
  if (v.id !== undefined && !(typeof v.id === 'string' && OPAQUE_ID.test(v.id) && v.id[0] === 'b')) return false
  if (v.highlight !== undefined && !isInt(v.highlight, HIGHLIGHT_MIN, HIGHLIGHT_MAX)) return false
  if (!BLOCK_TYPES.includes(v.type as BlockType)) return false
  const spec = BLOCKS[v.type as BlockType]
  if (!BLOCK_LOOK_IDS.includes(v.look as BlockLook) || !BLOCK_EFFECT_IDS.includes(v.effect as BlockEffect)) return false
  if (!(spec.variants ?? [{ id: 'base' }]).some((x) => x.id === v.variant)) return false
  if (!checkStates(v.fields, blockFieldSpecs(v.type as BlockType))) return false
  if (!Array.isArray(v.items) || v.items.length > (spec.items?.max ?? 0)) return false
  return v.items.every((it) => checkStates(it, spec.items?.fields ?? []))
}

function checkSlide(v: unknown): boolean {
  if (!isObj(v)) return false
  if (!onlyKeys(v, ['id', 'layout', 'role', 'section', 'hidden', 'hiddenItems', 'fields', 'items', 'options', 'variant', 'blocks', 'over'])) return false
  if (v.over !== undefined && v.over !== true) return false
  let at: Block[] = []
  if (v.blocks !== undefined) {
    if (v.layout !== 'compose' || !Array.isArray(v.blocks) || v.blocks.length > MAX_BLOCKS || !v.blocks.every((b) => checkBlock(b))) return false
    // 부품들이 판을 빈틈없이, 겹치지 않게 나눠 덮는다 (빈 장은 부품이 없다)
    at = (v.blocks as ShapeBlock[]).map((b, i) => ({ id: String(i), type: b.type, fields: {}, items: [], at: { x: b.x, y: b.y, w: b.w, h: b.h } }))
    if (at.length && !tiles(at)) return false
  }
  if (typeof v.id !== 'string' || !OPAQUE_ID.test(v.id) || v.id[0] !== 's') return false
  if (!hasKey(LAYOUTS, v.layout)) return false
  const spec = LAYOUTS[v.layout as LayoutId]
  if (!variantIds(v.layout as LayoutId).includes(v.variant as string)) return false
  if (v.role !== null && !(typeof v.role === 'string' && roleStrings().has(v.role))) return false
  if (v.section !== null && !(typeof v.section === 'string' && roleStrings().has(v.section))) return false
  if (typeof v.hidden !== 'boolean' || !isInt(v.hiddenItems, 0, 1000)) return false
  if (!checkStates(v.fields, spec.fields)) return false
  if (!Array.isArray(v.items) || v.items.length > (spec.items?.max ?? 0)) return false
  if (!v.items.every((it) => checkStates(it, spec.items?.fields ?? []))) return false
  const o = v.options
  if (!isObj(o) || !onlyKeys(o, ['highlight', 'flip', 'pane', 'contain', 'motion', 'tone', 'place', 'transition', 'order', 'scene', 'hideHead', 'hideFoot'])) return false
  if (o.hideHead !== undefined && typeof o.hideHead !== 'boolean') return false
  if (o.hideFoot !== undefined && typeof o.hideFoot !== 'boolean') return false
  // 장면은 목록의 id이고 이 장에 맞는 것만 (toShape도 맞을 때만 넣는다)
  if (o.scene !== undefined && !(isScene(o.scene) && sceneFits({ layout: v.layout as LayoutId, blocks: at }, o.scene))) return false
  if (o.transition !== undefined && !(isOneOf(TRANSITIONS, o.transition) && o.transition !== 'auto')) return false
  if (o.order !== undefined) {
    if (v.layout !== 'compose' || !Array.isArray(o.order) || !o.order.length || o.order.length > MAX_BLOCKS) return false
    if (!o.order.every((id) => typeof id === 'string' && OPAQUE_ID.test(id) && id[0] === 'b') || new Set(o.order).size !== o.order.length) return false
  }
  if (o.place !== undefined && !isOneOf(PLACES, o.place)) return false
  if (o.pane !== undefined && !isInt(o.pane, 1, 12)) return false
  if (o.highlight !== undefined && !isInt(o.highlight, HIGHLIGHT_MIN, HIGHLIGHT_MAX)) return false
  if (o.motion !== undefined && !isOneOf(MOTIONS, o.motion)) return false
  if (o.tone !== undefined && !isOneOf(TONES, o.tone)) return false
  if (o.flip !== undefined && typeof o.flip !== 'boolean') return false
  if (o.contain !== undefined && typeof o.contain !== 'boolean') return false
  return true
}

export function checkShape(v: unknown): v is ShapeDeck {
  if (!isObj(v)) return false
  if (!onlyKeys(v, ['format', 'version', 'deck', 'type', 'audience', 'duration', 'method', 'theme', 'accent', 'motion', 'font', 'size', 'footer', 'transition', 'updatedAt', 'slides']))
    return false
  if (v.format !== SHAPE_FORMAT || v.version !== SHAPE_VERSION) return false
  if (typeof v.deck !== 'string' || !OPAQUE_ID.test(v.deck) || v.deck[0] !== 'd') return false
  if (!ALL_TYPES.includes(v.type as DeckType)) return false
  if (!AUDIENCES.some((a) => a.id === v.audience)) return false
  if (!METHODS.some((m) => m.id === v.method)) return false
  if (!isInt(v.duration, 0, 240) || !isInt(v.updatedAt, 0, Number.MAX_SAFE_INTEGER)) return false
  if (!THEME_ORDER.includes(v.theme as ThemeId)) return false
  if (v.accent !== null && !(typeof v.accent === 'string' && HEX.test(v.accent))) return false
  if (!MOTIONS.some((m) => m.id === v.motion)) return false
  if (v.font !== undefined && v.font !== null && !isOneOf(FONTS, v.font)) return false
  if (v.size !== undefined && !isOneOf(TEXT_SIZES, v.size)) return false
  if (v.footer !== undefined && !isOneOf(FOOTERS, v.footer)) return false
  if (v.transition !== undefined && !isOneOf(TRANSITIONS, v.transition)) return false
  if (!Array.isArray(v.slides) || v.slides.length > 300 || !v.slides.every(checkSlide)) return false
  return new Set((v.slides as ShapeSlide[]).map((s) => s.id)).size === v.slides.length
}

/**
 * 마지막 그물: 값 안의 모든 글자가 카탈로그, 정해진 말(extra), 해시 id, 색 코드 중 하나인지.
 * MCP 서버가 응답을 내보내기 직전에 쓴다. 키도 확인한다.
 */
export function onlyKnownStrings(value: unknown, extra: Iterable<string> = []): boolean {
  const known = catalogStrings()
  const more = new Set(extra)
  const ok = (s: string) => known.has(s) || more.has(s) || OPAQUE_ID.test(s) || HEX.test(s) || REQUEST_ID.test(s)
  const walk = (v: unknown): boolean => {
    if (typeof v === 'string') return ok(v)
    if (v === null || typeof v === 'number' || typeof v === 'boolean') return true
    if (Array.isArray(v)) return v.every(walk)
    if (isObj(v)) return Object.entries(v).every(([k, x]) => ok(k) && walk(x))
    return false
  }
  return walk(value)
}

// 제안을 보내기 전에 미리 돌려 보기. MCP 서버의 check_changes가 쓴다.
//
// MCP 서버에는 모양 파일뿐이라 진짜 발표가 없다. 그래서 모양으로 '대역 발표'를 세운다: 칸이 찼으면 그 글자 수 구간만큼 지어낸 글자로,
// 비었으면 비운 채로, 판의 자리와 고른 값은 모양 그대로. 그 위에 앱과 같은 applyOps를 돌려 op마다 결과 코드를 얻는다.
// 대역의 글자는 이 파일이 만든 같은 글자의 되풀이라 사람이 적은 글이 들어올 길이 없고, 밖으로 나가는 것도 코드뿐이다.
//
// 앱에서 적용할 때와 다를 수 있는 것: 모양에 없는 것(노트, 글의 정확한 길이, 보고 구성이 미리 넣은 이름표)에 기대는 판단.
// 노트만 있는 장은 대역에서 빈 장이고, 미리 넣은 이름표만 있는 칸은 대역에서 찬 칸이다.

import { LAYOUTS } from '../deck/layouts'
import type { Block, Deck, Item, ItemKey, Slide } from '../deck/types'
import { isObj } from './guards'
import { applyOps, OP_KEYS, parseOp, type Op, type OpCode } from './ops'
import { shapeBlockId, shapeSlideId, TEXT_LENGTHS, TEXT_LINES, type FieldState, type ShapeBlock, type ShapeDeck, type ShapeSlide } from './share'

/** 글자 수 구간마다 대역에 적는 글자 수: 구간 안의 흔한 길이 (281자 넘으면 320자) */
const LENGTH_FILL = [8, 16, 32, 64, 120, 220, 320]
/** 줄 수 구간마다 대역의 줄 수 */
const LINE_FILL = [2, 4, 6, 10]

/**
 * 대역의 글자. 모양이 말하는 구간의 길이와 줄 수로 같은 글자를 되풀이한다(그 칸이 차지할 높이를 앱과 비슷하게 어림하려고).
 * 이미지 칸은 있는지만 알아서 짧은 글자로
 */
function fill(state: FieldState | undefined): string {
  if (!state || state === 'empty') return ''
  if (state === 'filled') return '가'.repeat(16)
  const [len, lines] = state.split(', ')
  const top = TEXT_LENGTHS.indexOf(len as (typeof TEXT_LENGTHS)[number])
  const n = lines ? LINE_FILL[TEXT_LINES.indexOf(lines.replace(' lines', '') as (typeof TEXT_LINES)[number])] : 1
  // 줄마다 한 글자는 있어야 줄로 센다 ('1-10, 9+ lines'는 열 줄에 한 글자씩)
  const total = Math.max(LENGTH_FILL[top], n)
  return Array.from({ length: n }, (_, i) => '가'.repeat(Math.floor((total * (i + 1)) / n) - Math.floor((total * i) / n))).join('\n')
}

function fillFields(states: Record<string, FieldState>): Record<string, string> {
  return Object.fromEntries(Object.entries(states).flatMap(([k, v]) => (v === 'empty' ? [] : [[k, fill(v)]])))
}

function fillItem(states: Record<string, FieldState>, i: number): Item {
  const it: Item = { id: `i${i}`, title: '', body: '', value: '', meta: '', image: '' }
  for (const [k, v] of Object.entries(states)) if (k in it && k !== 'id') it[k as ItemKey] = fill(v)
  return it
}

function standInBlock(b: ShapeBlock, i: number): Block {
  const id = b.id ?? `x${i}`
  return {
    id,
    type: b.type,
    fields: fillFields(b.fields),
    items: b.items.map(fillItem),
    look: b.look,
    effect: b.effect,
    ...(b.when ? { when: b.when } : {}),
    ...(b.speed ? { speed: b.speed } : {}),
    ...(b.from ? { from: b.from } : {}),
    ...(b.variant !== 'base' ? { variant: b.variant } : {}),
    ...(b.highlight !== undefined ? { highlight: b.highlight } : {}),
    at: { x: b.x, y: b.y, w: b.w, h: b.h },
    ...(b.link ? { link: b.link } : {}),
    ...(b.linkBelow ? { linkBelow: b.linkBelow } : {}),
  }
}

function standInSlide(s: ShapeSlide): Slide {
  // 레이아웃이 숨긴 항목(최대 수 너머)은 모양에 수만 있다. 지우지 않고 남겨 둔 것이라 찬 항목으로 둔다
  const spec = LAYOUTS[s.layout]
  const hidden = Array.from({ length: s.hiddenItems }, (_, j) =>
    fillItem(Object.fromEntries((spec.items?.fields ?? []).map((f) => [f.key, f.image ? ('filled' as const) : ('11-20' as const)])), s.items.length + j),
  )
  return {
    // 대역의 원래 id는 모양의 해시 id 그대로. 그래서 op가 가리키는 해시 id를 대역의 해시로 옮겨 적는다 (refsFor)
    id: s.id,
    layout: s.layout,
    purpose: s.role ?? '',
    section: s.section ?? '',
    fields: fillFields(s.fields),
    items: [...s.items.map(fillItem), ...hidden],
    hints: {},
    guide: '',
    notes: '',
    options: { ...s.options },
    ...(s.variant !== 'base' ? { variant: s.variant } : {}),
    ...(s.hidden ? { hidden: true } : {}),
    ...(s.blocks ? { blocks: s.blocks.map(standInBlock) } : {}),
  }
}

/** 모양으로 세운 대역 발표 */
export function standInDeck(shape: ShapeDeck): Deck {
  // 발표 전체의 값($org 같은 칸)은 장마다 같은 값이 보인다. 어느 장에서든 찼으면 찬 것으로
  const meta: Record<string, string> = { org: '', presenter: '', date: '', contact: '', logo: '' }
  for (const s of shape.slides)
    for (const [k, v] of Object.entries(s.fields)) if (k.startsWith('$') && k.slice(1) in meta && !meta[k.slice(1)]) meta[k.slice(1)] = fill(v)
  return {
    id: shape.deck,
    version: 2,
    title: '',
    createdAt: 0,
    updatedAt: shape.updatedAt,
    meta: { type: shape.type, audience: shape.audience, duration: shape.duration, method: shape.method, org: meta.org, presenter: meta.presenter, date: meta.date, contact: meta.contact, logo: meta.logo },
    theme: {
      id: shape.theme,
      ...(shape.accent ? { accent: shape.accent } : {}),
      ...(shape.font ? { font: shape.font } : {}),
      ...(shape.size ? { size: shape.size } : {}),
      ...(shape.footer ? { footer: shape.footer } : {}),
      ...(shape.transition ? { transition: shape.transition } : {}),
    },
    motion: shape.motion,
    slides: shape.slides.map(standInSlide),
  }
}

/** op가 가리키는 모양의 해시 id를 대역의 해시 id로. 모르는 id는 그대로 두어 앱처럼 no_slide, no_block이 난다 */
function refsFor(shape: ShapeDeck) {
  const slides = new Map(shape.slides.map((s) => [s.id, shapeSlideId({ id: s.id })]))
  const blocks = new Map(shape.slides.flatMap((s) => (s.blocks ?? []).flatMap((b) => (b.id ? [[b.id, shapeBlockId({ id: b.id })] as const] : []))))
  const slide = (v: unknown) => (typeof v === 'string' ? (slides.get(v) ?? v) : v)
  const block = (v: unknown) => (typeof v === 'string' ? (blocks.get(v) ?? v) : v)
  return (op: Op): Op => {
    const o = { ...op } as Record<string, unknown>
    if ('slide' in o) o.slide = slide(o.slide)
    if ('after' in o) o.after = slide(o.after)
    for (const k of ['block', 'beside', 'swap']) if (k in o) o[k] = block(o[k])
    if (Array.isArray(o.order)) o.order = o.order.map(block)
    return o as unknown as Op
  }
}

/**
 * 고르는 값의 키. 한 op에 여럿을 담으면 하나만 안 돼도 op가 통째로 빠지므로, 빠질 때 어느 키 때문인지 찾는다.
 * 장, 부품, 자리를 가리키는 키는 넣지 않는다 (빼면 다른 것을 가리키게 된다)
 */
const SETTABLE: Partial<Record<Op['op'], readonly string[]>> = {
  add_slide: ['layout', 'role'],
  set_layout: ['variant'],
  set_options: ['highlight', 'flip', 'pane', 'contain', 'motion', 'tone', 'place', 'transition', 'scene', 'hideHead', 'hideFoot'],
  set_theme: ['theme', 'accent', 'motion', 'font', 'size', 'footer', 'transition'],
  add_block: ['variant', 'look', 'effect'],
  set_block: ['variant', 'look', 'effect', 'when', 'speed', 'from', 'count', 'highlight'],
  set_size: ['w', 'h'],
}

/** check_changes의 op 하나의 결과. invalid는 꼴부터 틀려 propose_changes가 제안을 통째로 받지 않는 op */
interface OpCheck {
  op: Op['op'] | null
  ok: boolean
  code: OpCode | 'invalid'
  /** 빠진 까닭이 된 키 (OP_KEYS에 있는 이름만) */
  key?: string
}

const KNOWN_KEYS = new Set<string>(Object.values(OP_KEYS).flat())
const opName = (v: unknown): Op['op'] | null => (isObj(v) && typeof v.op === 'string' && Object.hasOwn(OP_KEYS, v.op) ? (v.op as Op['op']) : null)

/** 고르는 값이 하나는 있어야 꼴이 맞는 op에서, 틀린 키를 빼고 대신 넣어 볼 맞는 값 (둘 중 뺀 키가 아닌 것) */
const STAND_IN_VALUE: Partial<Record<Op['op'], readonly [string, unknown][]>> = {
  set_options: [['contain', false], ['flip', false]],
  set_theme: [['motion', 'calm'], ['size', 'normal']],
  set_block: [['count', 1], ['when', 'after']],
  set_size: [['w', 6], ['h', 6]],
}

/**
 * 꼴이 틀린 op에서 어느 키가 틀렸는지: 그 키 하나를 빼면 꼴이 맞는 키. 이 op에 없는 키는 바로 그 키다.
 * 다른 op의 키 이름(OP_KEYS)일 때만 알려 준다: AI가 지어낸 키 이름을 그대로 돌려보내지 않는다
 */
function badKey(v: unknown): string | undefined {
  const name = opName(v)
  if (!isObj(v)) return undefined
  if (!name) return 'op'
  const own: readonly string[] = OP_KEYS[name]
  for (const k of Object.keys(v)) {
    if (k === 'op') continue
    if (!own.includes(k)) return KNOWN_KEYS.has(k) ? k : undefined
    const rest: Record<string, unknown> = { ...v }
    delete rest[k]
    const settable = SETTABLE[name] ?? []
    if (settable.includes(k) && !settable.some((s) => rest[s] !== undefined)) {
      const [key, value] = STAND_IN_VALUE[name]?.find(([s]) => s !== k) ?? []
      if (key) rest[key] = value
    }
    if (parseOp(rest)) return k
  }
  return undefined
}

/**
 * op마다 앱에서 적용하면 어떻게 될지 미리 본다. ops는 받은 그대로(꼴을 확인하기 전). 앞의 op가 적용된 위에서 다음 op를 본다.
 * 꼴이 틀린 op는 invalid로 알리고 나머지는 그 op 없이 돌린다
 */
export function checkOps(shape: ShapeDeck, raw: unknown[]): OpCheck[] {
  const deck = standInDeck(shape)
  const mapRefs = refsFor(shape)
  const parsed = raw.map(parseOp)
  const ops = parsed.filter((o): o is Op => !!o).map(mapRefs)
  const results = applyOps(deck, ops).results
  let n = 0
  return raw.map((v, i): OpCheck => {
    const op = parsed[i]
    if (!op) {
      const key = badKey(v)
      return { op: opName(v), ok: false, code: 'invalid', ...(key ? { key } : {}) }
    }
    const at = n++
    const r = results[at]
    if (r.ok || r.code === 'no_change') return { op: op.op, ok: r.ok, code: r.code }
    const key = culprit(deck, ops.slice(0, at), ops[at], r.code)
    return { op: op.op, ok: false, code: r.code, ...(key ? { key } : {}) }
  })
}

/** 고르는 값을 둘 넘게 담은 op가 빠졌으면, 그 키 하나만 뺐을 때 되는 키 */
function culprit(deck: Deck, before: Op[], op: Op, code: OpCode): string | undefined {
  const keys = (SETTABLE[op.op] ?? []).filter((k) => (op as unknown as Record<string, unknown>)[k] !== undefined)
  if (keys.length < 2) return undefined
  for (const k of keys) {
    const rest = { ...op } as Record<string, unknown>
    delete rest[k]
    const r = applyOps(deck, [...before, rest as unknown as Op]).results.at(-1)!
    if (r.code !== code) return k
  }
  return undefined
}


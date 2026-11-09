// 컴포넌트를 같은 일을 다른 그림으로 말하는 컴포넌트로 바꾸기(편집기의 '바꾸기'). 사람이 적은 글은 하나도 버리지 않는다.
// 예전에는 컴포넌트를 바꾸려면 지우고 새로 넣어 글을 다시 써야 했고, 장의 '레이아웃 바꾸기'를 고르면 컴포넌트의 글이 장의 가려진 칸으로 숨었다.
// 사람만 쓴다: AI 제안(ai/ops.ts)에는 이 동작이 없다(AGENTS.md '꼭 지킬 것' 3)

import { emptyItem } from '../make'
import type { Block, BlockType, ItemKey } from '../types'
import { type Fit, settle } from './board'
import { BLOCKS } from './catalog'
import { mapBlock } from './cells'
import type { NoRoom } from './place'
import { isSmall, largeCount, lookOf, looksFor, MAX_LARGE, settleLook } from './rules'
import { boardFit, changeBlocks, heightIssue, minSpanOf } from './sizing'

/** 칸 하나의 자리: 컴포넌트의 칸('label') 또는 첫 항목의 칸('0.title'). 숫자 하나와 숫자 여럿(핵심 숫자)을 오가게 */
type Slot = string

interface SwapRoles {
  /** 역할 → 칸. 같은 역할의 칸끼리 글이 옮겨 간다 */
  fields?: Record<string, Slot>
  /** 역할 → 항목의 칸. 모든 항목에서 같이 옮긴다(항목의 칸끼리 맞바꾸기라 되돌리면 그대로 돌아온다) */
  items?: Record<string, ItemKey>
}

interface SwapGroup {
  /** 바꾸기 메뉴의 머리: 이 묶음이 무엇을 보여 주는지 */
  name: string
  /** 묶음의 컴포넌트(메뉴의 차례)와 칸의 역할. 이름이 같은 칸은 적지 않아도 그대로 따라간다 */
  types: Partial<Record<BlockType, SwapRoles>>
}

/**
 * 바꿀 수 있는 묶음: 같은 일(숫자 하나, 목록, 단계, 둘을 짝지은 비교 …)을 다른 그림으로 말하는 컴포넌트끼리.
 * 꼭 채울 칸은 꼭 채울 칸끼리 잇는다(핵심 문장, 글, 인용할 말). 뜻이 다른 칸을 억지로 잇지 않는다: 이을 칸이 없는 글은 그 컴포넌트에
 * 가려 두었다가 다시 바꾸면 돌아온다. 모션 그래픽(내 컴포넌트), 이미지, 표처럼 짜임이 하나뿐인 컴포넌트는 묶지 않는다
 */
export const SWAP_GROUPS: SwapGroup[] = [
  {
    name: '한 문장을 보여 주는 컴포넌트',
    types: {
      message: { fields: { main: 'text', sub: 'sub' } },
      text: { fields: { main: 'body', head: 'heading', label: 'label' } },
      quote: { fields: { main: 'quote', by: 'by' } },
      callout: { fields: { main: 'text', label: 'label' } },
      heading: { fields: { main: 'text', sub: 'note' } },
      note: { fields: { main: 'text', label: 'kind' } },
    },
  },
  {
    name: '목록을 보여 주는 컴포넌트',
    types: { bullets: {}, points: {}, summary: {}, facts: {}, faq: {}, agenda: {} },
  },
  {
    name: '둘을 짝지어 견주는 컴포넌트',
    types: {
      compare: { fields: { left: 'leftTitle', right: 'rightTitle' } },
      wipe: { fields: { left: 'from', right: 'to' } },
      risks: {},
    },
  },
  {
    name: '숫자 하나를 보여 주는 컴포넌트',
    types: {
      number: {},
      kpi: { fields: { label: '0.title', value: '0.value', note: '0.body' } },
      delta: { fields: { value: 'after' } },
      stat: {},
      ring: {},
      spark: {},
      goal: {},
      ratio: { fields: { whole: 'total' } },
      tiles: { fields: { whole: 'of' } },
      meter: { fields: { whole: 'of' } },
    },
  },
  { name: '목표와 실적, 두 값을 견주는 차트', types: { versus: {}, attain: {}, scorecard: {} } },
  { name: '항목마다 값을 보여 주는 차트', types: { bars: {}, share: {}, funnel: {}, pareto: {}, trend: {}, diverge: {} } },
  {
    name: '단계와 흐름을 보여 주는 컴포넌트',
    types: {
      process: { items: { name: 'title', side: 'meta', desc: 'body' } },
      timeline: { items: { name: 'title', side: 'meta', desc: 'body' } },
      steps: { fields: { head: 'label' }, items: { name: 'title' } },
      cycle: { fields: { head: 'heading' }, items: { name: 'title', desc: 'meta' } },
      flow: { fields: { head: 'what' }, items: { name: 'title', side: 'meta', amount: 'value' } },
    },
  },
  { name: '가운데와 둘레를 보여 주는 도식', types: { hub: {}, network: {}, gather: {}, aliases: {} } },
  { name: '나누고 모으는 도식', types: { split: {}, merge: {} } },
  { name: '네 칸으로 나눈 컴포넌트', types: { swot: {}, matrix: {} } },
  { name: '할 일의 진행을 보여 주는 컴포넌트', types: { checks: {}, progress: {} } },
]

const ITEM_KEYS: ItemKey[] = ['title', 'body', 'value', 'meta']

const groupOf = (type: BlockType) => SWAP_GROUPS.find((g) => g.types[type])

/** 이 컴포넌트를 바꿀 수 있는 컴포넌트(메뉴의 차례). 묶음이 없으면 빈 목록 */
export function swapChoices(type: BlockType): BlockType[] {
  const g = groupOf(type)
  return g ? (Object.keys(g.types) as BlockType[]).filter((t) => t !== type) : []
}

/** 바꾸기 메뉴의 머리 */
export const swapGroupName = (type: BlockType): string => groupOf(type)?.name ?? ''

/**
 * 묶음의 모든 역할에 칸을 정한 것. 그 컴포넌트에 없는 역할은 쉬는 칸(그 역할을 가장 많이 쓰는 칸 이름, 항목은 남는 칸)에 둔다:
 * 숫자 한 줄 → 큰 숫자 → 몇 중 몇처럼 여러 번 바꿔도 앞에서 가려 둔 글이 제 역할의 칸을 찾아간다
 */
function rolesOf(g: SwapGroup, type: BlockType): { fields: Record<string, Slot>; items: Record<string, ItemKey> } {
  const owns = (Object.keys(g.types) as BlockType[]).map((t) => ownFields(g, t))
  const fields = ownFields(g, type)
  const shown = new Set(BLOCKS[type].fields.map((f) => f.key))
  for (const role of new Set(owns.flatMap(Object.keys))) {
    if (fields[role]) continue
    // 쉬는 칸은 컴포넌트의 칸 이름으로만(첫 항목에 두면 그 항목의 글과 섞인다). 이 컴포넌트가 보여 주는 칸이나 다른 역할이 쓰는 칸에는
    // 두지 않는다(그 칸의 글을 덮는다)
    const slot = commonest(owns.map((r) => r[role]).filter((s) => !!s && !isItemSlot(s)))
    if (slot && !shown.has(slot) && !Object.values(fields).includes(slot)) fields[role] = slot
  }
  const all = Object.values(g.types)
  const items: Record<string, ItemKey> = { ...g.types[type]?.items }
  for (const role of new Set(all.flatMap((r) => Object.keys(r.items ?? {})))) {
    if (items[role]) continue
    const used = new Set(Object.values(items))
    const want = commonest(all.map((r) => r.items?.[role])) as ItemKey | undefined
    const key = want && !used.has(want) ? want : ITEM_KEYS.find((k) => !used.has(k))
    if (key) items[role] = key
  }
  return { fields, items }
}

/** 컴포넌트가 정한 칸의 역할. 적지 않은 칸은 칸 이름이 곧 역할이다('label', 'value', 'note'처럼 이름이 같으면 같은 일을 한다) */
function ownFields(g: SwapGroup, type: BlockType): Record<string, Slot> {
  const fields: Record<string, Slot> = { ...g.types[type]?.fields }
  const used = new Set(Object.values(fields))
  for (const f of BLOCKS[type].fields) if (!(f.key in fields) && !used.has(f.key)) fields[f.key] = f.key
  return fields
}

/** 가장 많이 쓰는 값(같으면 앞의 것) */
function commonest(values: (string | undefined)[]): string | undefined {
  const n = new Map<string, number>()
  for (const v of values) if (v) n.set(v, (n.get(v) ?? 0) + 1)
  let best: string | undefined
  for (const [v, c] of n) if (best === undefined || c > n.get(best)!) best = v
  return best
}

/**
 * 항목의 칸 바꾸기: from의 역할 칸 → to의 같은 역할 칸, 나머지는 남는 칸끼리 차례대로. 맞바꾸기라 한 칸도 겹치지 않고,
 * 거꾸로 바꾸면 거꾸로 맞바꾸어 그대로 돌아온다
 */
function itemMap(from: Record<string, ItemKey>, to: Record<string, ItemKey>): Record<ItemKey, ItemKey> {
  const map = {} as Record<ItemKey, ItemKey>
  for (const [role, k] of Object.entries(from)) if (to[role]) map[k] = to[role]
  const taken = new Set(Object.values(map))
  const restFrom = ITEM_KEYS.filter((k) => !(k in map))
  const restTo = ITEM_KEYS.filter((k) => !taken.has(k))
  restFrom.forEach((k, i) => (map[k] = restTo[i]))
  return map
}

const isItemSlot = (slot: Slot) => slot.startsWith('0.')

/**
 * 같은 묶음의 다른 컴포넌트로 바꾼 컴포넌트. 사람이 적은 글은 하나도 버리지 않는다: 같은 역할의 칸으로 옮기고, 옮길 칸이 없는 글은
 * 그 칸 그대로 두어(이 컴포넌트에서는 가려진 칸) 다시 바꾸면 돌아온다. 옮길 칸에 이미 글(앞에서 가려 둔 글)이 있으면 옮기지 않는다.
 * 넘치는 항목은 지우지 않고 숨긴다(레이아웃 바꾸기와 같다). 자리, 이음표, 움직임은 그대로이고, 모양은 같은 이름이 있을 때만,
 * 바탕은 그 컴포넌트가 쓸 수 있을 때만 남긴다. 같은 묶음이 아니면 받은 컴포넌트 그대로
 */
export function swapBlock(b: Block, to: BlockType): Block {
  const g = groupOf(b.type)
  if (!g?.types[to] || b.type === to) return b
  const from = rolesOf(g, b.type)
  const dest = rolesOf(g, to)
  const im = itemMap(from.items, dest.items)
  const fields: Record<string, string> = { ...b.fields }
  const items = b.items.map((it) => ({ ...it, ...Object.fromEntries(ITEM_KEYS.map((k) => [im[k], it[k]])) }))
  const hints: Record<string, string> = Object.fromEntries(
    Object.entries(b.hints ?? {}).map(([k, v]) => {
      const m = /^items\.(?:(\d+)\.)?(title|body|value|meta)$/.exec(k)
      return [m ? `items.${m[1] ? `${m[1]}.` : ''}${im[m[2] as ItemKey]}` : k, v]
    }),
  )
  // 칸 옮기기: 첫 항목의 칸은 항목의 칸을 바꾼 뒤의 자리로 읽는다
  const at = (slot: Slot): Slot => (isItemSlot(slot) ? `0.${im[slot.slice(2) as ItemKey]}` : slot)
  let moves = Object.entries(from.fields)
    .filter(([role, slot]) => dest.fields[role] && at(slot) !== dest.fields[role])
    .map(([role, slot]) => ({ src: at(slot), dst: dest.fields[role] }))
  const read = (slot: Slot) => (isItemSlot(slot) ? (items[0]?.[slot.slice(2) as ItemKey] ?? '') : (fields[slot] ?? ''))
  moves = moves.filter((m) => read(m.src).trim())
  // 옮길 칸에 남은 글이 있으면(그 칸도 비켜 가지 않으면) 옮기지 않는다. 비켜 가지 않게 된 칸으로 옮기던 것도 다시 본다
  for (let changed = true; changed; ) {
    const leaving = new Set(moves.map((m) => m.src))
    const kept = moves.filter((m) => !read(m.dst).trim() || leaving.has(m.dst))
    changed = kept.length !== moves.length
    moves = kept
  }
  const values = moves.map((m) => read(m.src))
  const examples = new Set(b.examples ?? [])
  const write = (slot: Slot, v: string) => {
    if (isItemSlot(slot)) {
      if (!items.length) items.push(emptyItem())
      items[0] = { ...items[0], [slot.slice(2) as ItemKey]: v }
    } else if (v) fields[slot] = v
    else delete fields[slot]
  }
  for (const m of moves) write(m.src, '')
  moves.forEach((m, i) => {
    write(m.dst, values[i])
    // 안내도 칸을 따라간다 (첫 항목의 칸은 'items.0.title' 꼴)
    const hint = (s: Slot) => (isItemSlot(s) ? `items.${s}` : s)
    if (hints[hint(m.src)] !== undefined && hints[hint(m.dst)] === undefined) {
      hints[hint(m.dst)] = hints[hint(m.src)]
      delete hints[hint(m.src)]
    }
    // 예시 글 표시는 칸을 따라간다(항목으로 간 글은 표시 없이)
    if (examples.delete(m.src) && !isItemSlot(m.dst)) examples.add(m.dst)
  })
  const spec = BLOCKS[to]
  while (spec.items && items.length < spec.items.min) items.push(emptyItem())
  const { variant, look, hints: _, examples: __, ...rest } = b
  return {
    ...rest,
    type: to,
    fields,
    items,
    ...(Object.keys(hints).length ? { hints } : {}),
    ...(variant && spec.variants?.some((v) => v.id === variant) ? { variant } : {}),
    ...(look && looksFor(to).includes(lookOf(b)) ? { look } : {}),
    ...(examples.size ? { examples: [...examples] } : {}),
  }
}

/** 컴포넌트 하나를 바꾼 판: 바뀐 컴포넌트가 커지면 옆에서 자리를 받고, 장에 맞지 않는 바탕은 바탕 없이. 장에 들어가지 않으면 null */
export function swapIn(blocks: Block[], blockId: string, to: BlockType, areaH: number): Block[] | null {
  const next = changeBlocks(blocks, blockId, (b) => swapBlock(b, to), areaH)
  const self = next?.find((b) => b.id === blockId)
  return next && self ? settleLook(next, self) : null
}

/**
 * 이 컴포넌트로 바꿀 수 없는 까닭. 바꿀 수 있으면 null. 작은 컴포넌트를 큰 컴포넌트로 바꾸면 큰 컴포넌트 수를 넘을 수 있고,
 * 넓어야 하는 컴포넌트(단계 흐름, 표)는 옆 컴포넌트 때문에 그만큼 넓힐 수 없으면, 그 밖에는 장 높이를 넘으면 바꾸지 않는다
 */
export function swapIssue(blocks: Block[], blockId: string, to: BlockType, areaH: number): NoRoom | null {
  const b = blocks.find((x) => x.id === blockId)
  if (!b) return null
  if (isSmall(b.type) && !isSmall(to) && largeCount(blocks) + 1 > MAX_LARGE) return { kind: 'large' }
  if (swapIn(blocks, blockId, to, areaH)) return null
  const next = mapBlock(blocks, blockId, (x) => swapBlock(x, to))
  const fit = boardFit(areaH, next)
  // 높이를 따지지 않아도 들어가지 않으면 너비가 모자란 것이다
  const wide: Fit = { ...fit, minH: (x, w) => (w < fit.minW(x) ? Infinity : 1) }
  if (!settle(next, wide)) {
    const span = minSpanOf(next.find((x) => x.id === blockId)!)
    return span >= 12 ? { kind: 'solo', type: to } : { kind: 'narrow', span }
  }
  return heightIssue(next, areaH, blocks)
}

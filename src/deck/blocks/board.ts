// 부품 장의 판. 본문 상자를 가로 12칸, 세로 12칸으로 나누고, 부품은 그 가운데 네모꼴 자리(Block.at)를 차지한다.
// 가로 한 칸은 레이아웃 장의 12칸 격자와 같고, 세로 두 칸이 가로 한 칸과 거의 같은 네모라서 편집 화면에서는 네모 판으로 보인다.
//
// 부품들은 늘 판 전체를 빈틈없이 덮는다. 넣을 때는 옆 부품의 자리를 나눠 받고, 뺄 때는 옆 부품이 그 자리를 넓혀 덮는다.
// 그래서 사람은 칸 단위로 자리와 크기를 정하지만 빈 곳은 생기지 않고, 크기는 부품마다 잘리지 않는 크기(Fit) 밑으로 내려가지 않는다.
//
// 판은 끝에서 끝까지 긋는 선으로 거듭 나눈 꼴이다(나무, Tree). 줄(위아래로 나눔) 안에 칸(옆으로 나눔), 칸 안에 다시 줄 …
// 넣기가 늘 자리 하나를 둘로 가르는 것이라 이 꼴이 지켜지고, 저장은 부품마다의 자리(at)로만 한다. 나무는 자리에서 다시 읽는다.
// 크기를 나눌 때는 지금 크기를 바라는 크기로 보고, 모자란 부품에게 여유가 큰 부품부터 한 칸씩 내준다. 그래서 바꾸지 않은 곳은 그대로다.
//
// 이 파일은 부품의 내용을 모른다. 부품마다 가장 좁은 너비, 그 너비에서 가장 낮은 높이는 Fit으로 받는다(sizing.ts의 boardFit).

import type { Block, BlockAt } from '../types'

export const BOARD_COLS = 12
export const BOARD_ROWS = 12

/** 판 전체 */
export const WHOLE: BlockAt = { x: 0, y: 0, w: BOARD_COLS, h: BOARD_ROWS }

/** 부품마다의 크기 규칙. 판 계산은 이것만 보고 부품의 글은 모른다 */
export interface Fit {
  /** 가장 좁은 너비 (칸 수) */
  minW(b: Block): number
  /** 이 너비에서 잘리지 않는 가장 낮은 높이 (칸 수). 그 너비로는 높이가 아무리 높아도 안 되면 Infinity */
  minH(b: Block, w: number): number
  /** 여유가 있을 때 확보할 읽기 좋은 높이. 들어가지 않으면 minH로 다시 놓는다 */
  readableH?(b: Block, w: number): number
  /** 보기 좋은 너비 (칸 수). 옆에 넣을 때 이만큼 받기를 바란다 */
  prefW(b: Block): number
  /** 높이를 받으면 커지는 부품(차트, 표, 그림). 남는 자리는 이것들이 먼저 받는다 */
  stretchy(b: Block): boolean
  /** 면이 있는 부품(강조 상자, 카드 면). 높이를 받으면 면이 같이 커져 빈 자리로 보이지 않아서 차트 다음으로 남는 자리를 받는다 */
  fills(b: Block): boolean
  /** 작은 부품(숫자 한 줄, 상태 같은). 같은 것을 잇달아 넣으면 아래에 쌓는다 */
  small(b: Block): boolean
}

/** 크기를 따지지 않는 규칙: 자리만 다시 나눌 때(발표할 때 빈 부품을 빼고 그리기). 빼기는 남은 부품을 넓히기만 해서 잘리지 않는다 */
export const LOOSE: Fit = { minW: () => 1, minH: () => 1, prefW: () => 1, stretchy: () => false, fills: () => false, small: () => false }

/** 판을 나눈 나무의 마디. 가지는 같은 쪽으로 늘어선 자식들(h: 왼쪽에서 오른쪽, v: 위에서 아래), 잎은 부품 하나 */
export type Tree = Leaf | Split
export type Leaf = { kind: 'leaf'; block: Block; want: number }
export type Split = { kind: 'split'; dir: 'h' | 'v'; kids: Tree[]; want: number }

export const leaf = (block: Block, want = 0): Leaf => ({ kind: 'leaf', block, want })
export const split = (dir: 'h' | 'v', kids: Tree[], want = 0): Split => ({ kind: 'split', dir, kids, want })

/** 넣을 쪽 */
export type Side = 'left' | 'right' | 'above' | 'below'

/**
 * 넣을 자리: 부품(at) 옆의 한쪽. up은 그 부품에서 몇 단계 위의 묶음 옆인지(0이면 부품 바로 옆, 1이면 부품이 든 줄이나 칸 옆).
 * at이 null이면 판 전체의 한쪽(맨 위나 맨 아래의 새 줄, 맨 왼쪽이나 오른쪽의 새 칸)
 */
export interface Spot {
  at: string | null
  side: Side
  up?: number
}

export const sameSpot = (a: Spot | null | undefined, b: Spot | null | undefined) => !!a && !!b && a.at === b.at && a.side === b.side && (a.up ?? 0) === (b.up ?? 0)

const axis = (side: Side): 'h' | 'v' => (side === 'left' || side === 'right' ? 'h' : 'v')
const before = (side: Side) => side === 'left' || side === 'above'
const along = (r: BlockAt, dir: 'h' | 'v') => (dir === 'h' ? r.w : r.h)

export const sameArea = (a: BlockAt, b: BlockAt) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h
export const overlaps = (a: BlockAt, b: BlockAt) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
export const isArea = (v: unknown, cols = BOARD_COLS, rows = BOARD_ROWS): v is BlockAt => {
  const a = v as BlockAt
  return !!a && [a.x, a.y, a.w, a.h].every((n) => Number.isInteger(n)) && a.w > 0 && a.h > 0 && a.x >= 0 && a.y >= 0 && a.x + a.w <= cols && a.y + a.h <= rows
}

/** 부품들이 그 자리(r, 없으면 판 전체)를 빈틈없이, 겹치지 않고 덮는지 (부품이 없으면 참) */
export function tiles(blocks: Block[], r: BlockAt = WHOLE): boolean {
  if (!blocks.length) return true
  if (!blocks.every((b) => isArea(b.at, r.x + r.w, r.y + r.h) && b.at.x >= r.x && b.at.y >= r.y)) return false
  if (blocks.reduce((n, b) => n + b.at!.w * b.at!.h, 0) !== r.w * r.h) return false
  for (let i = 0; i < blocks.length; i++) for (let j = i + 1; j < blocks.length; j++) if (overlaps(blocks[i].at!, blocks[j].at!)) return false
  return true
}

/**
 * 자리들을 나무로 읽는다. 줄(위아래로 나누는 선)부터 찾아서 줄로 읽히게 하고, 없으면 칸(옆으로 나누는 선).
 * 어느 쪽으로도 끝에서 끝까지 자를 수 없으면(손으로 고친 파일) null
 */
function read(blocks: Block[], r: BlockAt): Tree | null {
  if (blocks.length === 1) return leaf(blocks[0])
  for (const dir of ['v', 'h'] as const) {
    const lo = dir === 'v' ? r.y : r.x
    const hi = lo + along(r, dir)
    const start = (a: BlockAt) => (dir === 'v' ? a.y : a.x)
    const end = (a: BlockAt) => start(a) + along(a, dir)
    // 어떤 부품도 가로지르지 않는 선
    const cuts: number[] = []
    for (let c = lo + 1; c < hi; c++) if (blocks.every((b) => end(b.at!) <= c || start(b.at!) >= c)) cuts.push(c)
    if (!cuts.length) continue
    const edges = [lo, ...cuts, hi]
    const kids: Tree[] = []
    for (let i = 0; i + 1 < edges.length; i++) {
      const sub: BlockAt = dir === 'v' ? { x: r.x, y: edges[i], w: r.w, h: edges[i + 1] - edges[i] } : { x: edges[i], y: r.y, w: edges[i + 1] - edges[i], h: r.h }
      const kid = read(
        blocks.filter((b) => start(b.at!) >= edges[i] && end(b.at!) <= edges[i + 1]),
        sub,
      )
      if (!kid) return null
      kid.want = along(sub, dir)
      kids.push(kid)
    }
    return split(dir, kids)
  }
  return null
}

/** 판의 나무. 부품이 없거나, 판을 덮지 않거나, 나무로 읽을 수 없으면 null (그런 판은 normalize로 먼저 바로잡는다) */
export function treeOf(blocks: Block[]): Tree | null {
  return blocks.length && tiles(blocks) ? read(blocks, WHOLE) : null
}

/** 판을 덮는 꼴로 바로잡은 부품들: 이미 맞으면 그대로, 아니면 읽는 차례(위에서 아래, 왼쪽에서 오른쪽)대로 하나씩 다시 넣는다 */
export function normalize(blocks: Block[], fit: Fit): Block[] {
  if (!blocks.length || treeOf(blocks)) return blocks
  // 어디에도 들어가지 않으면(예전 파일에 더 높아진 부품) 크기를 따지지 않고라도 넣는다: 글을 버리지 않는다
  return refill(blocks, fit, true)!
}

/**
 * 처음부터 다시 놓은 판: 읽는 차례대로 하나씩, 눌러서 넣을 때처럼(autoInsert) 넣는다. 자리는 새로, 차례는 그대로.
 * 크기 규칙대로 들어가지 않는 부품이 있으면 null (loose면 그 부품은 크기를 따지지 않고 넣는다)
 */
function refill(blocks: Block[], fit: Fit, loose: boolean): Block[] | null {
  let placed: Block[] = []
  for (const b of byReading(blocks)) {
    const bare: Block = { ...b, at: undefined }
    const next = autoInsert(placed, bare, fit) ?? (loose ? (autoInsert(placed, bare, LOOSE) ?? placed) : null)
    if (!next) return null
    placed = next
  }
  // 자리를 다시 정했어도 차례는 파일 그대로
  const byId = new Map(placed.map((p) => [p.id, p]))
  return blocks.map((b) => byId.get(b.id)).filter((b): b is Block => !!b)
}

/** 부품들을 처음부터 다시 놓은 판(refill). 크기 규칙대로 모두 들어가지 않으면 null. 빼고 난 판이 들어가지 않을 때(place.ts의 removeBlock) */
export const rebuild = (blocks: Block[], fit: Fit): Block[] | null => refill(blocks, fit, false)

const leaves = (t: Tree): Block[] => (t.kind === 'leaf' ? [t.block] : t.kids.flatMap(leaves))

/**
 * 크기 재기. 마디가 이 너비와 높이에 들어가는지, 그리고 한쪽 크기를 정했을 때 다른 쪽으로 가장 작은 크기.
 * 판이 12×12라 모든 경우를 다 따져도 가볍다. 같은 계산을 거듭하지 않게 마디마다 적어 둔다
 */
class Measure {
  private memo = new WeakMap<Tree, Map<number, boolean>>()
  constructor(readonly fit: Fit) {}

  fits(t: Tree, w: number, h: number): boolean {
    let m = this.memo.get(t)
    if (!m) this.memo.set(t, (m = new Map()))
    const key = w * 1000 + h
    const known = m.get(key)
    if (known !== undefined) return known
    let ok: boolean
    if (t.kind === 'leaf') ok = w >= this.fit.minW(t.block) && this.fit.minH(t.block, w) <= h
    else if (t.dir === 'h') {
      const lows = t.kids.map((k) => this.least(k, 'h', h, w))
      const spare = w - lows.reduce((a, x) => a + x, 0)
      // 거의 늘 한 자식이 남는 너비를 다 받아도 들어간다. 아닐 때만 모든 나눔을 따진다
      ok = spare >= 0 && (t.kids.some((k, i) => this.fits(k, lows[i] + spare, h)) || sizesFor(t.kids, w, (i, n) => this.fits(t.kids[i], n, h), lows) !== null)
    }
    else {
      // 높이는 늘려도 늘 들어가서(더 높은 칸은 늘 괜찮다) 가장 작은 높이의 합만 견주면 된다
      let sum = 0
      for (const k of t.kids) {
        sum += this.least(k, 'v', w, h)
        if (sum > h) break
      }
      ok = sum <= h
    }
    m.set(key, ok)
    return ok
  }

  /** dir 쪽으로 가장 작은 크기 (다른 쪽 크기 cross를 정했을 때). most까지 안 되면 Infinity */
  least(t: Tree, dir: 'h' | 'v', cross: number, most: number): number {
    if (dir === 'h') {
      // 너비는 넓힌다고 늘 들어가지 않아서(넓을수록 더 높아지는 부품) 좁은 쪽부터 하나씩
      for (let n = 1; n <= most; n++) if (this.fits(t, n, cross)) return n
      return Infinity
    }
    // 높이는 높일수록 늘 들어가서 반씩 나눠 찾는다
    if (!this.fits(t, cross, most)) return Infinity
    let lo = 1
    let hi = most
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (this.fits(t, cross, mid)) hi = mid
      else lo = mid + 1
    }
    return lo
  }

  stretchy(t: Tree): boolean {
    return leaves(t).some((b) => this.fit.stretchy(b))
  }

  /** 남는 길이를 받는 차례: 2 차트처럼 커지는 부품이 든 마디, 1 면이 있는 부품이 든 마디, 0 글과 숫자뿐 */
  takes(t: Tree): number {
    const bs = leaves(t)
    return bs.some((b) => this.fit.stretchy(b)) ? 2 : bs.some((b) => this.fit.fills(b)) ? 1 : 0
  }
}

/**
 * 길이 total을 자식들에게 나눈다. 바라는 크기(wants)의 합이 total이고 모두 가장 작은 크기(mins) 이상이면 그대로.
 * 아니면 바라는 크기의 비율대로 늘이거나 줄인 뒤, 모자란 자식에게 여유가 큰 자식부터 하나씩 내준다.
 * 남는 길이는 받는 차례(takes, 차트 2 > 면 1 > 글과 숫자 0)가 가장 높은 자식들이 받는다: 글 목록이 남는 높이를 받으면
 * 글 위아래가 비지만, 차트는 커지고 면은 면째 커진다. 모두 0이면 모두가 바라는 크기의 비율대로.
 * pile이면(위아래로 쌓은 가지) 먼저 자식마다 글자를 키울 자리(GROW)를 주고, 그러고도 남는 길이는 모두 0일 때 끝 자식이 다 받는다: 글과 숫자만 쌓은 장에서 비율대로 나누면
 * 칸마다 내용 아래가 조금씩 비어 부품 사이가 칸마다 들쭉날쭉 벌어졌다(부제 아래 200px, 핵심 한 줄과 인용 사이 130px).
 * 사람이 짠 장처럼 이어진 내용은 붙여 두고 남는 자리는 맨 아래 한곳에 모은다(그리는 쪽의 위에서부터 쌓기, slides/fitBlocks.ts)
 * 가장 작은 크기의 합이 total보다 크면 null
 */
export function share(total: number, mins: number[], wants: number[], takes: number[], pile = false): number[] | null {
  if (mins.some((m) => m === Infinity) || mins.reduce((a, m) => a + m, 0) > total) return null
  const w = wants.map((x, i) => Math.max(1, Math.round(x) || mins[i]))
  const sum = w.reduce((a, x) => a + x, 0)
  let s: number[]
  if (sum === total) s = [...w]
  else if (sum < total) {
    s = [...w]
    let left = total - sum
    // 위아래로 쌓은 가지는 먼저 자식마다 키울 자리(바라는 높이의 GROW 몫)를 바라는 높이의 비율대로 나눈다. 바라는 높이는 보통 글자에서
    // 잘리지 않는 가장 낮은 높이라, 남는 높이를 차트나 맨 아래 자식이 다 받으면 나머지 칸은 글자를 한 단계도 키울 수 없었다
    // (그리는 쪽이 모든 칸을 같이 키우므로 칸 하나만 모자라도 장 전체가 작은 글자로 남았다: 로고 모음이 9줄, 그 아래 숫자 둘이 3줄).
    // 쌓기(slides/fitBlocks.ts의 pack)가 그려진 것끼리 붙이고 남는 높이는 아래에 모으므로 칸이 내용보다 높아도 사이가 벌어지지 않는다
    if (pile) {
      const room = w.map((x) => Math.ceil(x * GROW))
      const give = Math.min(left, room.reduce((a, x) => a + x, 0))
      const add = new Array<number>(w.length).fill(0)
      spread(add, give, room)
      add.forEach((x, i) => (s[i] += x))
      left -= give
    }
    // 남는 길이: 받는 차례가 가장 높은 자식들이, 모두 0이면 모두가 바라는 크기의 비율대로
    const top = Math.max(0, ...takes)
    const takers = takes.map((t, i) => (top === 0 ? !pile || i === takes.length - 1 : t === top))
    spread(
      s,
      left,
      w.map((x, i) => (takers[i] ? x : 0)),
    )
  } else {
    s = w.map((x) => Math.floor((x * total) / sum))
    spread(
      s,
      total - s.reduce((a, x) => a + x, 0),
      w.map((x, i) => (x * total) / sum - s[i]),
    )
  }
  // 모자란 자식에게 여유가 가장 큰 자식이 하나씩 내준다
  for (let i = 0; i < s.length; i++) {
    while (s[i] < mins[i]) {
      let give = -1
      for (let j = 0; j < s.length; j++) if (j !== i && s[j] > mins[j] && (give < 0 || s[j] - mins[j] > s[give] - mins[give])) give = j
      if (give < 0) return null
      s[give]--
      s[i]++
    }
  }
  return s
}

/** 위아래로 쌓을 때 자식마다 먼저 더 주는 높이의 몫: 그리는 쪽이 글자를 키우는 끝 단계(1.44, fitBlocks.ts)까지 들 자리 */
const GROW = 0.44

/** n을 무게(weights)의 비율대로 하나씩 나눠 더한다. 나머지는 몫의 끝수가 큰 자식부터, 같으면 앞의 자식부터 */
function spread(s: number[], n: number, weights: number[]): void {
  const total = weights.reduce((a, x) => a + x, 0)
  if (n <= 0) return
  if (total <= 0) {
    s[s.length - 1] += n
    return
  }
  const exact = weights.map((x) => (x * n) / total)
  const base = exact.map(Math.floor)
  base.forEach((b, i) => (s[i] += b))
  let left = n - base.reduce((a, b) => a + b, 0)
  const order = exact.map((x, i) => [x - base[i], i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1])
  for (const [, i] of order) {
    if (left <= 0) break
    s[i]++
    left--
  }
}

/** 나무를 그 자리(r)에 놓은 부품들을 out에 더한다. 들어가지 않으면 false */
function lay(t: Tree, r: BlockAt, m: Measure, out: Block[]): boolean {
  if (t.kind === 'leaf') {
    if (!m.fits(t, r.w, r.h)) return false
    out.push(t.block.at && sameArea(t.block.at, r) ? t.block : { ...t.block, at: { ...r } })
    return true
  }
  const total = along(r, t.dir)
  const cross = t.dir === 'h' ? r.h : r.w
  const sizes = share(
    total,
    t.kids.map((k) => m.least(k, t.dir, cross, total)),
    t.kids.map((k) => k.want),
    t.kids.map((k) => m.takes(k)),
    t.dir === 'v',
  )
  if (!sizes) return false
  const ok = (i: number, n: number) => (t.dir === 'h' ? m.fits(t.kids[i], n, r.h) : m.fits(t.kids[i], r.w, n))
  // 나눈 크기에 모두 들어가면 그대로, 아니면 들어가는 나눔 가운데 가장 덜 다른 것
  const fixed = sizes.every((n, i) => ok(i, n))
    ? sizes
    : sizesFor(
        t.kids,
        total,
        ok,
        t.kids.map((k) => m.least(k, t.dir, cross, total)),
        sizes,
        t.kids.map((k) => m.takes(k)),
      )
  if (!fixed) return false
  let at = t.dir === 'h' ? r.x : r.y
  for (let i = 0; i < t.kids.length; i++) {
    const sub: BlockAt = t.dir === 'h' ? { x: at, y: r.y, w: fixed[i], h: r.h } : { x: r.x, y: at, w: r.w, h: fixed[i] }
    if (!lay(t.kids[i], sub, m, out)) return false
    at += fixed[i]
  }
  return true
}

/**
 * 자식마다 들어가는 크기(ok)로 합이 total이 되게 나눈 크기. 바라는 크기(near, share가 나눈 것)를 주면 그와 가장 덜 다른 것,
 * 같으면 남는 길이를 받는 차례(takes)가 높은 자식이 더 받는 것. 나눌 수 없으면 null.
 * 가장 작은 크기의 합만 견주면 안 된다: 글자 단계가 칸 너비로도 커져서 넓을수록 더 높아지는 부품이 있다(3칸에서 4줄이면 되는
 * 숫자 카드가 4칸에서는 5줄, 구성비 띠는 6~8칸에서 7줄, 9칸부터 8줄). 그런 부품 하나만 든 줄은 판 너비를 다 써야 해서
 * '6칸이면 7줄에 든다'고 7줄을 주면 놓지 못했다(예전 줄을 판으로 바꿀 때 크기를 따지지 않고 놓아 띠가 한 줄로 찌그러졌다).
 * 판이 12칸이라 모든 나눔을 따져도 가볍다 (자식 수 × total²). 크기는 가장 작은 크기(lows)와 남는 길이 사이만 본다
 */
function sizesFor(kids: Tree[], total: number, ok: (i: number, n: number) => boolean, lows: number[], near?: number[], takes?: number[]): number[] | null {
  // 자식마다 따져 볼 크기: 가장 작은 크기(lows)부터, 다른 자식들이 가장 작은 크기를 받고 남는 만큼까지
  const low = lows.reduce((a, x) => a + x, 0)
  if (low > total) return null
  // best[i][a]: 앞의 자식 i개에 a를 나눴을 때 가장 작은 값, from[i][a]: 그때 i번째 자식의 크기
  const best: number[][] = [Array.from({ length: total + 1 }, (_, a) => (a === 0 ? 0 : Infinity))]
  const from: number[][] = []
  for (let i = 0; i < kids.length; i++) {
    const row = new Array<number>(total + 1).fill(Infinity)
    const pick = new Array<number>(total + 1).fill(0)
    for (let n = lows[i]; n <= total - (low - lows[i]); n++) {
      if (!ok(i, n)) continue
      // 바라는 크기에서 한 칸 다를 때마다 100, 더 받을 때는 받는 차례가 낮을수록 조금 더
      const cost = near ? Math.abs(n - near[i]) * 100 + (n > near[i] ? 2 - (takes?.[i] ?? 0) : 0) : 0
      for (let a = n; a <= total; a++) {
        const v = best[i][a - n] + cost
        if (v < row[a]) {
          row[a] = v
          pick[a] = n
        }
      }
    }
    best.push(row)
    from.push(pick)
  }
  if (best[kids.length][total] === Infinity) return null
  const out = new Array<number>(kids.length)
  for (let i = kids.length - 1, a = total; i >= 0; i--) {
    out[i] = from[i][a]
    a -= out[i]
  }
  return out
}

/** 나무를 판에 놓은 부품들 (차례는 blocks 그대로, 새로 넣은 부품은 끝에). 들어가지 않으면 null */
function place(blocks: Block[], t: Tree, fit: Fit): Block[] | null {
  const out: Block[] = []
  if (!lay(t, WHOLE, new Measure(fit), out)) return null
  const byId = new Map(out.map((b) => [b.id, b]))
  const known = new Set(blocks.map((b) => b.id))
  return [...blocks.filter((b) => byId.has(b.id)).map((b) => byId.get(b.id)!), ...out.filter((b) => !known.has(b.id))]
}

/** 자동 배치에는 읽기 좋은 높이를 먼저 시도한다. 자리가 부족해도 기존 조합은 놓을 수 있게 최소 높이로 다시 시도한다. */
function placeReadable(blocks: Block[], t: Tree, fit: Fit): Block[] | null {
  const readable = fit.readableH
  if (!readable || !leaves(t).some((b) => readable(b, fit.prefW(b)) > 0)) return place(blocks, t, fit)
  const preferred = { ...fit, minH: (b: Block, w: number) => Math.max(fit.minH(b, w), readable(b, w)) }
  return place(blocks, t, preferred) ?? place(blocks, t, fit)
}

/** 나무를 판에 놓은 부품들 (나무의 차례). 예전 줄을 판으로 바꿀 때(legacy.ts). 들어가지 않으면 null */
export const layTree = (t: Tree, fit: Fit): Block[] | null => place([], t, fit)

/** 지금 나무 그대로 다시 놓은 판: 부품이 커져(항목을 더하거나 모양을 바꿔) 모자란 자리를 옆에서 받는다. 들어가지 않으면 null */
export function settle(blocks: Block[], fit: Fit): Block[] | null {
  if (!blocks.length) return blocks
  const t = treeOf(normalize(blocks, fit))
  return t ? place(blocks, t, fit) : null
}

/** 모든 부품이 잘리지 않는 데 드는 가장 낮은 높이 (칸 수). 판의 12칸을 넘을 수 있다. 너비로 안 되면 Infinity */
export function needRows(blocks: Block[], fit: Fit): number {
  const t = treeOf(normalize(blocks, fit))
  return t ? new Measure(fit).least(t, 'v', BOARD_COLS, 60) : Infinity
}

/** 나무에서 부품(id)까지의 길: 마디들 (뿌리부터 잎까지) */
function pathTo(t: Tree, id: string): Tree[] | null {
  if (t.kind === 'leaf') return t.block.id === id ? [t] : null
  for (const k of t.kids) {
    const p = pathTo(k, id)
    if (p) return [t, ...p]
  }
  return null
}

const clone = (t: Tree): Tree => (t.kind === 'leaf' ? { ...t } : { ...t, kids: t.kids.map(clone) })

/** 자식이 하나뿐인 가지는 그 자식으로, 같은 쪽 가지 안의 같은 쪽 가지는 펼친다 */
function tidy(t: Tree): Tree {
  if (t.kind === 'leaf') return t
  const kids = t.kids.map(tidy).flatMap((k) => (k.kind === 'split' && k.dir === t.dir ? scaleKids(k) : [k]))
  if (kids.length === 1) return { ...kids[0], want: t.want }
  return { ...t, kids }
}

/** 펼쳐 올리는 가지의 자식들: 가지의 바라는 크기를 자식들의 몫대로 나눠 갖는다 */
function scaleKids(k: Split): Tree[] {
  const sum = k.kids.reduce((a, x) => a + x.want, 0)
  return sum > 0 ? k.kids.map((x) => ({ ...x, want: (x.want * k.want) / sum })) : k.kids
}

/** 마디의 지금 자리 (판의 칸 수) */
function areaOf(t: Tree): BlockAt {
  const bs = leaves(t).map((b) => b.at!)
  const x = Math.min(...bs.map((a) => a.x))
  const y = Math.min(...bs.map((a) => a.y))
  return { x, y, w: Math.max(...bs.map((a) => a.x + a.w)) - x, h: Math.max(...bs.map((a) => a.y + a.h)) - y }
}

/** 마디의 보기 좋은 너비: 부품은 보기 좋은 너비, 옆으로 늘어선 가지는 그 합, 위아래로 쌓은 가지는 가장 넓은 것 */
function prefOf(t: Tree, fit: Fit): number {
  if (t.kind === 'leaf') return Math.max(fit.minW(t.block), fit.prefW(t.block))
  const ps = t.kids.map((k) => prefOf(k, fit))
  return t.dir === 'h' ? ps.reduce((a, p) => a + p, 0) : Math.max(...ps)
}

/** 옆에 큰 부품 하나와 둘뿐이면 가장 좁은 너비만 받는 짧은 글 부품 (inserted) */
const BRIEF = new Set<string>(['note', 'status', 'date'])

/** 그 자리에 마디(add)를 넣은 나무. 그 부품이 없으면 null. 크기는 아직 나누지 않았다(place가 나눈다) */
function inserted(root: Tree, add: Tree, spot: Spot, fit: Fit): Tree | null {
  const t = clone(root)
  const dir = axis(spot.side)
  let node: Tree = t
  let parent: Split | null = null
  if (spot.at !== null) {
    const path = pathTo(t, spot.at)
    if (!path) return null
    const k = path.length - 1 - (spot.up ?? 0)
    if (k < 0) return null
    node = path[k]
    parent = k > 0 ? (path[k - 1] as Split) : null
  }
  const area = areaOf(node)
  // 새 마디가 드는 가지: 같은 쪽으로 늘어선 부모가 있으면 그 안에, 없으면 그 마디와 새 마디를 새 가지로 묶는다
  let group: Split
  let cross: number
  if (parent && parent.dir === dir) {
    const i = parent.kids.indexOf(node)
    cross = dir === 'h' ? areaOf(parent).h : areaOf(parent).w
    parent.kids.splice(before(spot.side) ? i : i + 1, 0, add)
    group = parent
  } else if (!parent && node.kind === 'split' && node.dir === dir) {
    // 판 전체가 이미 같은 쪽으로 나뉘어 있으면 그 끝에 (맨 아래 새 줄, 맨 오른쪽 새 칸)
    cross = dir === 'h' ? area.h : area.w
    node.kids.splice(before(spot.side) ? 0 : node.kids.length, 0, add)
    group = node
  } else {
    group = split(dir, before(spot.side) ? [add, node] : [node, add], node.want)
    cross = dir === 'h' ? area.h : area.w
    if (parent) parent.kids[parent.kids.indexOf(node)] = group
  }
  // 그 가지의 자식들은 지금 크기가 아니라 저마다 알맞은 크기에서 다시 나눈다(줄에 칸을 더할 때 칸 너비를 다시 고르던 것과 같다).
  // 옆으로는 보기 좋은 너비, 위아래로는 가장 낮은 높이: 남는 높이는 차트처럼 커지는 부품이 받는다. 그래서 숫자 셋이 4·4·4로 나뉜다
  const m = new Measure(fit)
  for (const k of group.kids) k.want = dir === 'h' ? prefOf(k, fit) : Math.min(BOARD_ROWS, m.least(k, 'v', cross, BOARD_ROWS))
  // 옆으로 둘뿐이고 하나가 작은 부품(주석, 날짜, 상태 같은)이면 작은 것은 들어가는 가장 좁은 너비, 나머지는 큰 것이 받는다
  // (docs/VISUAL-RULES.md 6: 둘이면 내용 비율로). 보기 좋은 너비로 나누면 모으기(4칸) 옆 주석 한 줄이 8칸을 받아 그림이 왼쪽 좁은 칸에
  // 작게 서고 주석 칸은 텅 비었다
  if (dir === 'h' && group.kids.length === 2) {
    // 둘뿐인 가지는 늘 새로 묶은 것이라(부모의 가지는 셋 이상) 그 너비는 넣기 전 마디의 너비다
    const span = along(area, 'h')
    // 글 한두 줄로 끝나는 작은 부품만: 숫자 한 줄(stat)은 옆 목록과 2 : 1이 보기 좋다
    const smallOf = (k: Tree) => k.kind === 'leaf' && fit.small(k.block) && BRIEF.has(k.block.type)
    const [a, b] = group.kids
    if (smallOf(a) !== smallOf(b)) {
      const sm = smallOf(a) ? a : b
      const big = sm === a ? b : a
      const least = m.least(sm, 'h', cross, span)
      if (Number.isFinite(least) && prefOf(big, fit) < span - least) {
        sm.want = least
        big.want = span - least
      }
    }
  }
  return tidy(parent || group === node ? t : group)
}

/**
 * 그 자리에 부품을 넣은 판. 넣을 수 없는 자리(그 부품이 없거나, 넣으면 누군가 잘리는 크기가 되면) null.
 * 빈 판이면 자리와 상관없이 판 전체에
 */
export function insertBlock(blocks: Block[], block: Block, spot: Spot, fit: Fit): Block[] | null {
  return insertTree(blocks, leaf({ ...block, at: undefined }), spot, fit)
}

/**
 * 부품 묶음(내 컴포넌트의 한 줄이나 장 하나)을 그 자리에 넣은 판. 묶음 안의 자리(at)는 묶음끼리의 자리라서
 * 묶음 안의 짜임(나란한 것, 쌓은 것)은 그대로 두고 크기만 새 자리에 맞춰 나눈다. 묶음이 빈틈없는 꼴이 아니면 하나씩 넣는다
 */
export function insertGroup(blocks: Block[], group: Block[], spot: Spot, fit: Fit): Block[] | null {
  if (!group.length) return blocks
  if (group.length === 1) return insertBlock(blocks, group[0], spot, fit)
  const xs = group.map((b) => b.at?.x ?? 0)
  const ys = group.map((b) => b.at?.y ?? 0)
  const frame: BlockAt = {
    x: Math.min(...xs),
    y: Math.min(...ys),
    w: Math.max(...group.map((b) => (b.at?.x ?? 0) + (b.at?.w ?? 0))) - Math.min(...xs),
    h: Math.max(...group.map((b) => (b.at?.y ?? 0) + (b.at?.h ?? 0))) - Math.min(...ys),
  }
  const t = frame.w > 0 && frame.h > 0 && tiles(group, frame) ? read(group, frame) : null
  if (t) return insertTree(blocks, t, spot, fit)
  let next: Block[] | null = blocks
  for (const b of group) next = next && (next.length ? insertBlock(next, b, spot, fit) : insertBlock(next, b, { at: null, side: 'below' }, fit))
  return next
}

function insertTree(blocks: Block[], add: Tree, spot: Spot, fit: Fit): Block[] | null {
  if (!blocks.length) return place([], add, fit)
  const root = treeOf(normalize(blocks, fit))
  const t = root && inserted(root, add, spot, fit)
  return t ? placeReadable(blocks, t, fit) : null
}

/** 그 자리가 가리키는 묶음의 부품들 (그 자리에 넣으면 나란히 서거나 위아래로 붙는 것들). 자리가 없으면 빈 목록 */
export function spotBlocks(blocks: Block[], spot: Spot): Block[] {
  const t = treeOf(blocks)
  if (!t) return []
  if (spot.at === null) return leaves(t)
  const path = pathTo(t, spot.at)
  const k = path ? path.length - 1 - (spot.up ?? 0) : -1
  return path && k >= 0 ? leaves(path[k]) : []
}

/**
 * 그 자리에 넣으면 모든 부품이 잘리지 않는 데 드는 높이(칸 수, 판의 12칸을 넘을 수 있다).
 * 너비로 안 되면(어느 부품이 너무 좁아진다) Infinity, 그런 자리가 없으면 null. 넣을 수 없는 까닭을 알릴 때
 */
export function needWith(blocks: Block[], block: Block, spot: Spot, fit: Fit): number | null {
  const add = leaf({ ...block, at: undefined })
  const root = blocks.length ? treeOf(normalize(blocks, fit)) : null
  const t = root ? inserted(root, add, spot, fit) : blocks.length ? null : add
  return t ? new Measure(fit).least(t, 'v', BOARD_COLS, 60) : null
}

/**
 * 부품을 뺀 판: 옆 부품들이 그 자리를 바라는 크기의 비율대로 나눠 덮는다(차트처럼 커지는 부품이 있으면 그것이 먼저).
 * 나무는 그대로라 옮기기(moveBlock)는 이 판에서 다시 넣을 자리를 찾는다. 남은 부품이 이 나무로는 들어가지 않으면(넓어진 부품이
 * 글자가 커져 더 높아질 때, 더 높아진 부품이 있던 예전 파일) 크기를 따지지 않고 자리만 넓힌다. 빼기는 그런 판을 다시 놓는다(place.ts의 removeBlock)
 */
export function removeFromBoard(blocks: Block[], id: string, fit: Fit): Block[] {
  const left = blocks.filter((b) => b.id !== id)
  if (left.length === blocks.length) return blocks
  if (!left.length) return []
  const root = treeOf(normalize(blocks, fit))
  if (!root) return normalize(left, fit)
  const t = clone(root)
  const path = pathTo(t, id)!
  const parent = path.at(-2) as Split
  parent.kids = parent.kids.filter((k) => k !== path.at(-1))
  return place(left, tidy(t), fit) ?? place(left, tidy(t), LOOSE) ?? left
}

/** 부품을 그 자리로 옮긴 판 (빼고 다시 넣는다). 넣을 수 없으면 null */
export function moveBlock(blocks: Block[], id: string, spot: Spot, fit: Fit): Block[] | null {
  const self = blocks.find((b) => b.id === id)
  if (!self || spot.at === id) return null
  const next = insertBlock(removeFromBoard(blocks, id, fit), self, spot, fit)
  if (!next) return null
  // 차례는 그대로 (옮긴 부품이 끝으로 가지 않게)
  const byId = new Map(next.map((b) => [b.id, b]))
  return blocks.map((b) => byId.get(b.id)!)
}

/** 두 부품의 자리를 맞바꾼 판. 서로의 자리에 들어가지 않으면 null (맞바꾼 뒤 둘레가 조금씩 내주어 들어가면 그렇게) */
export function swapBlocks(blocks: Block[], a: string, b: string, fit: Fit): Block[] | null {
  const A = blocks.find((x) => x.id === a)
  const B = blocks.find((x) => x.id === b)
  if (!A?.at || !B?.at || a === b) return null
  return settle(
    blocks.map((x) => (x.id === a ? { ...x, at: B.at } : x.id === b ? { ...x, at: A.at } : x)),
    fit,
  )
}

/**
 * 판을 나누는 선 하나(가지 안의 두 자식 사이). 끌어서 두 쪽의 크기를 바꾸고, 그 선 위에 부품을 넣을 수 있다.
 * dir: 선이 나누는 쪽(h면 세로 선으로 옆을 나눈다), at: 선의 자리(칸 수), from·to: 선이 그어진 범위
 */
export interface Gutter {
  dir: 'h' | 'v'
  at: number
  from: number
  to: number
  /** 선 앞쪽 자식의 첫 부품 (선을 다시 찾을 때) */
  key: string
  /** 이 선 위에 부품을 넣는 자리: 선 앞쪽 자식의 뒤 */
  spot: Spot
  /** 나무의 몇째 단계 선인지 (0이면 판 전체를 나누는 선) */
  depth: number
}

/** 판의 모든 선 */
export function guttersOf(blocks: Block[]): Gutter[] {
  const t = treeOf(blocks)
  const out: Gutter[] = []
  const walk = (n: Tree, depth: number) => {
    if (n.kind === 'leaf') return
    const r = areaOf(n)
    for (let i = 0; i + 1 < n.kids.length; i++) {
      const a = areaOf(n.kids[i])
      const key = leaves(n.kids[i])[0].id
      const spot = spotAt(t!, n.kids[i], n.dir === 'h' ? 'right' : 'below')
      out.push(n.dir === 'h' ? { dir: 'h', at: a.x + a.w, from: r.y, to: r.y + r.h, key, spot, depth } : { dir: 'v', at: a.y + a.h, from: r.x, to: r.x + r.w, key, spot, depth })
    }
    n.kids.forEach((k) => walk(k, depth + 1))
  }
  if (t) walk(t, 0)
  return out
}

function findGutter(blocks: Block[], g: Pick<Gutter, 'dir' | 'at' | 'key'>): { root: Tree; n: Split; i: number } | null {
  const root = treeOf(blocks)
  if (!root) return null
  const t = clone(root)
  let found: { n: Split; i: number } | null = null
  const walk = (n: Tree) => {
    if (found || n.kind === 'leaf') return
    for (let i = 0; i + 1 < n.kids.length; i++) {
      const a = areaOf(n.kids[i])
      if (n.dir === g.dir && leaves(n.kids[i])[0].id === g.key && (n.dir === 'h' ? a.x + a.w : a.y + a.h) === g.at) found = { n, i }
    }
    n.kids.forEach(walk)
  }
  walk(t)
  return found ? { root: t, ...(found as { n: Split; i: number }) } : null
}

/** 선을 옮길 수 있는 범위 (선 앞뒤의 두 자식이 잘리지 않는 데까지, 칸 수). 찾지 못하면 null */
export function gutterRange(blocks: Block[], g: Pick<Gutter, 'dir' | 'at' | 'key'>, fit: Fit): { lo: number; hi: number } | null {
  const found = findGutter(blocks, g)
  if (!found) return null
  const { n, i } = found
  const a = areaOf(n.kids[i])
  const b = areaOf(n.kids[i + 1])
  const start = g.dir === 'h' ? a.x : a.y
  const end = g.dir === 'h' ? b.x + b.w : b.y + b.h
  const m = new Measure(fit)
  const cross = g.dir === 'h' ? a.h : a.w
  return { lo: start + m.least(n.kids[i], g.dir, cross, end - start), hi: end - m.least(n.kids[i + 1], g.dir, cross, end - start) }
}

/**
 * 선을 to로 옮긴 판. 선 앞뒤의 두 자식이 크기를 주고받고, 그 안의 부품들은 비율대로 나눠 갖는다.
 * 어느 쪽이 잘리는 크기가 되면 들어가는 데까지만 옮긴다. 한 칸도 못 옮기면 null
 */
export function moveGutter(blocks: Block[], g: Pick<Gutter, 'dir' | 'at' | 'key'>, to: number, fit: Fit): Block[] | null {
  const found = findGutter(blocks, g)
  const range = gutterRange(blocks, g, fit)
  if (!found || !range || range.lo > range.hi) return null
  const at = Math.min(range.hi, Math.max(range.lo, Math.round(to)))
  if (at === g.at) return null
  const { root, n, i } = found
  const start = g.dir === 'h' ? areaOf(n.kids[i]).x : areaOf(n.kids[i]).y
  const end = g.at + along(areaOf(n.kids[i + 1]), g.dir)
  n.kids.forEach((k) => (k.want = along(areaOf(k), g.dir)))
  n.kids[i].want = at - start
  n.kids[i + 1].want = end - at
  return place(blocks, root, fit)
}

/** 마디를 가리키는 자리: 그 마디의 첫 부품에서 몇 단계 위인지로 적는다 */
function spotAt(t: Tree, node: Tree, side: Side): Spot {
  if (node === t) return { at: null, side }
  const first = leaves(node)[0]
  const path = pathTo(t, first.id)!
  const up = path.length - 1 - path.indexOf(node)
  return { at: first.id, side, ...(up ? { up } : {}) }
}

/** 넣을 수 있는 모든 자리 (읽는 차례대로): 판의 네 쪽, 그리고 부품마다와 그 부품이 든 묶음마다의 네 쪽 */
export function allSpots(blocks: Block[]): Spot[] {
  const t = treeOf(blocks)
  if (!t) return [{ at: null, side: 'below' }]
  const out: Spot[] = [
    { at: null, side: 'above' },
    { at: null, side: 'left' },
  ]
  for (const b of byReading(leaves(t))) {
    const depth = pathTo(t, b.id)!.length - 1
    for (let up = 0; up < depth; up++) for (const side of ['left', 'right', 'above', 'below'] as const) out.push({ at: b.id, side, ...(up ? { up } : {}) })
  }
  out.push({ at: null, side: 'right' }, { at: null, side: 'below' })
  return out
}

/** 읽는 차례: 위에서 아래로, 같은 높이면 왼쪽부터 */
export const byReading = (blocks: Block[]): Block[] => [...blocks].sort((a, b) => (a.at?.y ?? 0) - (b.at?.y ?? 0) || (a.at?.x ?? 0) - (b.at?.x ?? 0))

/**
 * 부품이 나란히 선 묶음: 위에서부터 내려와 처음 만나는 옆으로 나눈 가지의 모든 부품(그 안에 쌓은 것까지). 옆으로 나눈 가지가 없으면(혼자 한 줄) 그 부품 하나.
 * 예전의 '한 줄'과 같다: 면을 같이 바꾸고, 소제목 윗선을 맞추고, 글자 단계를 맞추는 묶음이다
 */
export function bandOf(blocks: Block[], id: string): Block[] {
  const t = treeOf(blocks)
  const path = t && pathTo(t, id)
  if (!path) return blocks.filter((b) => b.id === id)
  const band = path.slice(0, -1).find((n) => n.kind === 'split' && n.dir === 'h')
  return band ? leaves(band) : [(path.at(-1) as Leaf).block]
}

/** 나란한 묶음 안에서 위아래로 쌓인 부품인지 (예전의 '한 칸에 쌓은 부품'): 묶음과 부품 사이에 위아래로 나눈 가지가 있다 */
export function isStacked(blocks: Block[], id: string): boolean {
  return !!boardInfo(blocks).get(id)?.stacked
}

/** 부품마다의 자리 정보: 나란한 묶음(band, 읽는 차례의 번호)과 그 묶음의 부품 수, 묶음 안에서 위아래로 쌓였는지. 그릴 때 한 번에 */
export function boardInfo(blocks: Block[]): Map<string, { band: number; size: number; stacked: boolean }> {
  const out = new Map<string, { band: number; size: number; stacked: boolean }>()
  const t = treeOf(blocks)
  if (!t) return out
  let n = 0
  const walk = (node: Tree, inBand: boolean, stacked: boolean) => {
    if (node.kind === 'leaf') {
      out.set(node.block.id, { band: n++, size: 1, stacked: false })
      return
    }
    if (node.dir === 'h' && !inBand) {
      const band = n++
      const members = leaves(node)
      const set = (k: Tree, st: boolean): void => {
        if (k.kind === 'leaf') out.set(k.block.id, { band, size: members.length, stacked: st })
        else k.kids.forEach((x) => set(x, st || k.dir === 'v'))
      }
      node.kids.forEach((k) => set(k, false))
      return
    }
    node.kids.forEach((k) => walk(k, inBand, stacked))
  }
  walk(t, false, false)
  return out
}

/**
 * 눌러서 넣을 때 알아서 고르는 판 (예전 autoTarget과 같은 차례).
 * 1. 마지막 줄의 끝: 그 줄의 부품들이 보기 좋은 너비를 지키고, 글이나 숫자가 차트 옆에서 위아래로 크게 비지 않으면.
 *    같은 작은 부품을 잇달아 넣을 때는 좁아져도 옆에(나란히 견줄 숫자가 갈라지지 않게)
 * 2. 작은 부품을 같은 작은 부품 다음에 넣으면 그 아래에 쌓는다(숫자 한 줄을 잇달아 넣으면 목록처럼)
 * 3. 맨 아래 새 줄. 4. 좁아져도 마지막 줄의 끝. 5. 넣을 수 있는 자리 가운데 읽는 차례에서 가장 뒤. 어디에도 안 되면 null
 */
export function autoInsert(blocks: Block[], block: Block, fit: Fit): Block[] | null {
  if (!blocks.length) return insertBlock(blocks, block, { at: null, side: 'below' }, fit)
  const base = normalize(blocks, fit)
  const t = treeOf(base)
  if (!t) return null
  // 마지막 줄: 판이 줄로 나뉘었으면 맨 아래 줄, 아니면 판 전체. 그 줄의 오른쪽 끝에 넣는 자리
  const row = t.kind === 'split' && t.dir === 'v' ? t.kids.at(-1)! : t
  const end = row.kind === 'split' && row.dir === 'h' ? spotAt(t, row.kids.at(-1)!, 'right') : spotAt(t, row, 'right')
  const beside = insertBlock(base, block, end, fit)
  const prev = byReading(leaves(row)).at(-1)!
  if (beside) {
    const added = beside.find((b) => b.id === block.id)!.at!
    const inRow = beside.filter((b) => b.at!.y < added.y + added.h && added.y < b.at!.y + b.at!.h)
    const roomy = inRow.every((b) => b.at!.w >= Math.min(fit.prefW(b), BOARD_COLS))
    // 차트 옆에 놓인 글과 숫자는 줄 높이를 차트만큼 받아 위아래가 빈다: 절반 넘게 비면 옆이 아니라 아래 새 줄이 낫다
    const tall = inRow.some((b) => fit.stretchy(b)) && inRow.some((b) => !fit.stretchy(b) && fit.minH(b, b.at!.w) * 2 < b.at!.h)
    if (roomy && !tall) return beside
    if (fit.prefW(block) <= 4 && prev.type === block.type && !tall) return beside
  }
  if (fit.small(block) && prev.type === block.type) {
    const under = insertBlock(base, block, { at: prev.id, side: 'below' }, fit)
    if (under) return under
  }
  const below = insertBlock(base, block, { at: null, side: 'below' }, fit)
  if (below) return below
  if (beside) return beside
  for (const s of allSpots(base).reverse()) {
    const next = insertBlock(base, block, s, fit)
    if (next) return next
  }
  return null
}

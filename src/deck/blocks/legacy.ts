// 예전(0.4까지) 부품 장의 줄을 판으로. 줄(rows) 안의 칸, 칸 안에 쌓은 부품(stack)을 판의 나무로 그대로 옮긴다:
// 줄은 위아래로 나눈 가지, 칸은 옆으로 나눈 가지, 쌓은 부품은 다시 위아래로 나눈 가지. 칸 너비(spans)와 줄 높이 비중(grow)은 바라는 크기로.
// 이음표도 따라간다: 칸 사이의 것은 왼쪽 칸 맨 위 부품의 오른쪽 선, 줄 사이의 것은 그 줄에서 판 가운데를 덮는 부품의 아래 선.
// 발표를 열 때(migrate.ts)와 예전 내 컴포넌트 파일을 읽을 때(saved.ts) 부른다. 글은 하나도 버리지 않는다

import type { Block, BlockLink } from '../types'
import { BOARD_COLS, type Fit, layTree, leaf, LOOSE, split, type Tree } from './board'
import { cleanBlock } from './clean'
import { isLink } from './links'
import { MAX_BLOCKS } from './rules'

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** 예전 줄 하나: 칸마다 위에서부터 쌓은 부품들, 칸 너비, 줄 높이 비중, 아래 줄과의 이음표 */
interface OldRow {
  cells: { blocks: Block[]; link?: BlockLink }[]
  spans?: number[]
  grow?: number
  link?: BlockLink
}

/** 예전 줄들을 읽는다. 모르는 부품과 값은 빼고(lost에 센다), 부품 수는 정한 만큼만 */
function readRows(rows: unknown, lost?: { n: number }): OldRow[] {
  if (!Array.isArray(rows)) return []
  const count = { left: MAX_BLOCKS }
  const out: OldRow[] = []
  for (const r of rows) {
    if (!isRecord(r) || !Array.isArray(r.blocks)) continue
    const cells: OldRow['cells'] = []
    for (const c of r.blocks) {
      if (!isRecord(c) || typeof c.id !== 'string') continue
      const { stack, link, ...top } = c
      const members = [top, ...(Array.isArray(stack) ? stack.filter(isRecord) : [])]
      const blocks = members.map((m) => cleanBlock({ ...m, link: undefined }, count, lost)).filter((b): b is Block => !!b)
      if (!blocks.length) continue
      cells.push({ blocks, ...(isLink(link) ? { link } : {}) })
    }
    if (!cells.length) continue
    const spans = Array.isArray(r.spans) && r.spans.length === cells.length && r.spans.every((n) => Number.isInteger(n) && n > 0) ? (r.spans as number[]) : undefined
    const grow = typeof r.grow === 'number' && r.grow >= 1 && r.grow <= 100 ? r.grow : undefined
    out.push({ cells, spans, grow, ...(isLink(r.link) ? { link: r.link } : {}) })
  }
  return out
}

/**
 * 예전 줄들을 판의 부품들로. 장에 들어가지 않으면(예전에 잘린 채 저장된 장) 크기를 따지지 않고 자리만 나눈다.
 * fit은 그 장의 크기 규칙(sizing.ts의 boardFit)
 */
export function boardFromRows(rows: unknown, fit: Fit, lost?: { n: number }): Block[] {
  const old = readRows(rows, lost)
  if (!old.length) return []
  const allGrow = old.every((r) => r.grow !== undefined)
  // keep이면 예전 칸 너비(spans)와 줄 높이 비중(grow)을 바라는 크기로, 아니면 부품마다 보기 좋은 너비와 가장 낮은 높이에서 다시 나눈다
  const treeOf = (keep: boolean): Tree =>
    split(
      'v',
      old.map((r) =>
        split(
          'h',
          r.cells.map((c, i) => {
            const want = (keep ? r.spans?.[i] : undefined) ?? Math.max(fit.minW(c.blocks[0]), fit.prefW(c.blocks[0]))
            return c.blocks.length === 1 ? leaf(c.blocks[0], want) : split('v', c.blocks.map((b) => leaf(b)), want)
          }),
          keep && allGrow ? r.grow : 0,
        ),
      ),
    )
  // 예전 너비와 높이 비중으로 들어가지 않으면(부품의 잘리지 않는 높이를 다시 재어 커졌다) 그것을 버리고 다시 나눠 본다. 그래도 안 되면
  // 잘리지 않는 높이를 같은 비율로 줄여 가며 나눈다(그리는 쪽이 글자를 한두 단계 줄여 맞춘다). 바로 크기를 따지지 않는 나눔(LOOSE)으로
  // 가면 숫자 줄이 판 한 줄(60px)에 눌려 글이 아래 차트 위로 넘쳐 그려졌다. 그래도 안 되면 자리만 나눈다
  const scaled = (k: number): Fit => ({
    ...fit,
    minH: (b, w) => {
      const h = fit.minH(b, w)
      return Number.isFinite(h) ? Math.max(1, Math.floor(h * k)) : h
    },
  })
  let laid = layTree(treeOf(true), fit) ?? layTree(treeOf(false), fit)
  for (const k of [0.9, 0.8, 0.7]) laid ??= layTree(treeOf(false), scaled(k))
  laid ??= layTree(treeOf(true), LOOSE)
  if (!laid) return []
  // 이음표: 칸 사이의 것은 그 칸 맨 위 부품의 오른쪽 선에, 줄 사이의 것은 그 줄 맨 아래에서 판 가운데를 덮는(없으면 첫) 부품의 아래 선에
  const at = new Map(laid.map((b) => [b.id, b]))
  const links = new Map<string, Partial<Pick<Block, 'link' | 'linkBelow'>>>()
  old.forEach((r, ri) => {
    r.cells.forEach((c, ci) => {
      if (c.link && ci < r.cells.length - 1) links.set(c.blocks[0].id, { ...links.get(c.blocks[0].id), link: c.link })
    })
    if (r.link && ri < old.length - 1) {
      const bottoms = r.cells.map((c) => at.get(c.blocks.at(-1)!.id)!).filter((b) => b.at)
      const mid = BOARD_COLS / 2
      const pick = bottoms.find((b) => b.at!.x < mid && b.at!.x + b.at!.w > mid) ?? bottoms[0]
      if (pick) links.set(pick.id, { ...links.get(pick.id), linkBelow: r.link })
    }
  })
  return laid.map((b) => ({ ...b, ...links.get(b.id) }))
}

import { BLOCKS, BLOCK_COL_GAP, BLOCK_TYPES, LINK_PAD } from '../deck/blocks'
import { FONTS } from '../deck/themes'
import type { BlockType } from '../deck/types'
import { blockFigures, blockOverflows, blockTextLines, fitBlocks } from '../slides/fitBlocks'
import { innerProblems } from './comboChecks'

/*
 * 부품의 잘리지 않는 높이(deck/blockHeights.ts)를 재는 개발용 도구. 갤러리에서 브라우저 콘솔로 부른다:
 *   #/gallery?set=blocks   →   copy(heightsSource(await measureAllFonts()))
 *   →   deck/blockHeights.ts에 붙여 넣기 (고를 수 있는 글꼴 짝마다 재어 가장 높은 쪽)
 *   글꼴 하나만 더했으면 그 글꼴로만 재어 지금 표와 합친다:
 *   copy(heightsSource(mergeHeights((await import('/src/deck/blockHeights.ts')).BLOCK_HEIGHTS, (await measureAll(undefined, 'font=suit')).table)))
 * 부품마다, 모양마다, 바탕(그대로, 카드)마다, 항목 수마다, 들어갈 수 있는 칸 너비마다 잰다.
 * 글자는 칸 크기에 따라 단계로 줄고(--bk-w, --bk-h) 칸 모양에 따라 배치가 바뀌어서, 가장 좁은 칸에서만 재거나
 * 넘치지 않는 첫 높이만 찾으면 그보다 넓거나 높은 칸에서 넘치는 것을 놓친다. 그래서 위에서부터 내려오며
 * '이 높이부터 위로는 어디서도 괜찮은' 가장 낮은 높이를 찾는다.
 */

const AREA_W = 1920 - 120 * 2
const COL = (AREA_W - 11 * BLOCK_COL_GAP) / 12
/** 12칸 격자에서 span칸을 쓰는 부품의 너비 */
export const spanWidth = (span: number) => span * COL + (span - 1) * BLOCK_COL_GAP
/** 부품 장에서 나올 수 있는 칸 너비 (blocks.ts의 COMBOS) */
export const SPANS = [3, 4, 6, 8, 12]
const TOP = 860
const STEP = 10
/**
 * 잴 높이들: 10px마다, 그리고 글자 크기 단계(blocks.css의 --bk-h: 300)가 바뀌는 바로 위.
 * 단계 바로 위(301)는 글자가 한 단계 큰데 자리는 가장 적어서, 10px마다만 재면 310은 되는데 305는 안 되는 것을 놓친다
 */
const HEIGHTS = [...new Set([...Array.from({ length: (TOP - 100) / STEP + 1 }, (_, i) => TOP - i * STEP), 301])].sort((a, b) => b - a)

type Box = { left: number; right: number; top: number; bottom: number }

/** 칸 안의 글 줄마다 글자가 그려지는 자리. 화면에서 맞출 때(fitBlocks)와 같은 것으로 본다 */
function textLines(cell: HTMLElement): { r: Box; n: Node }[] {
  const el = inner(cell)
  return el ? blockTextLines(el).map((q) => ({ n: q.n, r: { left: q.l, right: q.r, top: q.t, bottom: q.b } })) : []
}

const name = (n: Node) => `${(n.parentElement?.className ?? '').split(' ')[0]}「${n.textContent?.trim().slice(0, 10)}」`

/** 카드와 강조색 면의 안쪽 여백까지 글이 들어가도 되는 깊이 (캔버스 px). 이보다 깊으면 여백이 무너져 보인다 */
const PAD_SLACK = 8

/** 글이 들어가야 하는 상자: 안쪽(.bk-in)의 여백을 뺀 자리. 갤러리는 장을 줄여 그려서 화면 px로 바꾼다 */
function contentBox(cell: HTMLElement): Box {
  const el = inner(cell) ?? cell
  const r = el.getBoundingClientRect()
  const k = el.offsetWidth ? r.width / el.offsetWidth : 1
  const cs = getComputedStyle(el)
  const pad = (v: string) => Math.max(0, parseFloat(v) - PAD_SLACK) * k
  return { left: r.left + pad(cs.paddingLeft), right: r.right - pad(cs.paddingRight), top: r.top + pad(cs.paddingTop), bottom: r.bottom - pad(cs.paddingBottom) }
}

/** 글을 잘라 내는 조상(overflow가 보이지 않는 상자)에 잘린 줄. 안쪽 목록이 넘침을 숨기면 칸 전체로는 넘치지 않아 보인다 */
function clippedBy(n: Node, r: Box, cell: HTMLElement, cache: Map<Element, Box | null>): boolean {
  for (let el = n.parentElement; el && el !== cell; el = el.parentElement) {
    let box = cache.get(el)
    if (box === undefined) {
      const cs = getComputedStyle(el)
      const clips = cs.overflowX !== 'visible' || cs.overflowY !== 'visible'
      box = clips ? el.getBoundingClientRect() : null
      cache.set(el, box)
    }
    if (box && (r.top < box.top - 1 || r.bottom > box.bottom + 1 || r.left < box.left - 1 || r.right > box.right + 1)) return true
  }
  return false
}

/**
 * 글이 칸 밖(카드면 안쪽 여백 안)으로 나가거나, 잘리거나, 다른 글과 겹치는 곳. 줄 사이가 모자라 다음 줄에 올라타는 것은
 * 칸 전체 높이(scrollHeight)로는 보이지 않아서, 글 줄마다의 상자로 본다
 */
/**
 * 글이 없는 그림의 가장 작은 크기 (캔버스 px, [가로, 세로]). 그림은 칸에 맞춰 줄어들 뿐 넘치지 않아서 글만 보면 놓친다:
 * 낮은 칸에서 목표 대비의 막대가 높이 0으로 사라지고, 비율 원이 지름 50px대로 줄어 안의 숫자가 10px가 됐다.
 * 세로 막대는 가장 긴 막대(--p 100)가 60px는 되어야 한다: 낮은 줄에서 막대 자리를 숫자가 다 가져가 막대가 납작한 띠가 되거나 사라졌다.
 * 로고 모음의 로고는 48px는 되어야 한다
 */
const FIGURE_MIN: [string, number, number][] = [
  ['.bk-gl-bar', 0, 16],
  ['.va-columns .br-row[style*="--p: 100."] .br-track', 0, 60],
  // 로고 모음의 판이 줄 수만큼 나뉘어 낮아지면 로고가 알아볼 수 없게 작아진다
  ['.bk-layout .lg-img', 0, 48],
  ['.bk-rg:not(.is-gauge):not(.is-unknown) .bk-rg-sq', 120, 120],
  // 원인 순위의 막대와 누적 비율 선 자리(100%까지의 높이): 면 위의 좁은 칸에 원인을 여덟 넣으면 40px로 줄어 막대가 띠가 됐다
  ['.bk-pa-canvas', 0, 100],
  // 쌓은 막대의 가장 높은 막대: 면 위의 좁은 칸에 기간을 여섯 넣으면 50px대로 줄어 칸이 실처럼 가늘어지고 칸 숫자가 다 숨었다
  ['.bk-st .bk-cc-col[style*="--p: 100."] .bk-st-stack', 0, 100],
  ['.bk-rg.is-gauge:not(.is-unknown) .bk-rg-sq', 160, 0],
]

function clashList(cell: HTMLElement, all: boolean): string[] {
  const box = contentBox(cell)
  const lines = textLines(cell)
  const cache = new Map<Element, Box | null>()
  const out: string[] = []
  for (const { r, n } of lines) {
    if (r.left < box.left - 1 || r.right > box.right + 1 || r.top < box.top - 1 || r.bottom > box.bottom + 1) {
      out.push(`칸 밖: ${name(n)}`)
      if (!all) return out
    } else if (clippedBy(n, r, cell, cache)) {
      out.push(`잘림: ${name(n)}`)
      if (!all) return out
    }
  }
  // 글이 없는 그림(몇 중 몇의 점, 차트)도 칸 안에 들어야 한다. 글만 보면 카드 안의 점 칸이 카드의 안쪽 여백을 지나
  // 칸 밖으로 46px 나가도 넘치지 않은 것으로 보아서, 카드의 높이를 낮게 잡았다
  const el = inner(cell)
  for (const fig of el ? blockFigures(el) : []) {
    const r = fig.getBoundingClientRect()
    if (r.bottom > box.bottom + 1 || r.top < box.top - 1 || r.right > box.right + 1 || r.left < box.left - 1) {
      out.push(`그림이 칸 밖: ${fig.getAttribute('class')?.split(' ')[0] ?? fig.tagName}`)
      if (!all) return out
    }
  }
  for (const [sel, w, h] of FIGURE_MIN) {
    for (const fig of cell.querySelectorAll<HTMLElement>(sel)) {
      if (fig.offsetWidth < w || fig.offsetHeight < h) {
        out.push(`그림이 너무 작음: ${sel} ${fig.offsetWidth}×${fig.offsetHeight}`)
        if (!all) return out
      }
    }
  }
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[i].n === lines[j].n) continue
      const [a, b] = [lines[i].r, lines[j].r]
      if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2) {
        out.push(`겹침: ${name(lines[i].n)} / ${name(lines[j].n)}`)
        if (!all) return out
      }
    }
  }
  return out
}

const inner = (cell: HTMLElement) => cell.querySelector<HTMLElement>(':scope > .bk-in')

// fitBlocks가 줄일지 볼 때(over)와 같은 4px: 다르면 화면에서는 그대로 둔 글자를 여기서는 넘쳤다고 본다
const scrollOver = (el: HTMLElement) => el.scrollHeight > el.clientHeight + 4 || el.scrollWidth > el.clientWidth + 4

/** 한 칸에서 넘치거나 겹친 글 (진단용). 칸 크기를 바꾼 뒤 부른다 */
export function clashes(cell: HTMLElement): string[] {
  const el = inner(cell)
  const out: string[] = []
  // 편집 화면에서도 fitBlocks처럼 편집 표시(빈칸의 면, 단추, 그림 위에 겹친 칸)는 빼고 잰다
  const area = cell.closest<HTMLElement>('.bk-area')
  const was = area?.classList.contains('is-fitting')
  area?.classList.add('is-fitting')
  if (el && scrollOver(el)) {
    if (el.scrollHeight > el.clientHeight + 4) out.push(`세로로 ${el.scrollHeight - el.clientHeight}px 넘침`)
    if (el.scrollWidth > el.clientWidth + 4) out.push(`가로로 ${el.scrollWidth - el.clientWidth}px 넘침`)
  }
  if (el && !out.length && blockOverflows(el)) out.push('글자를 줄여야 함 (여백, 겹침, 옆 항목)')
  const list = clashList(cell, true)
  if (!was) area?.classList.remove('is-fitting')
  return [...out, ...new Set(list)]
}

/**
 * 이 크기에서 괜찮은지: 화면처럼 fitBlocks로 맞춘 뒤, 글자를 줄이지 않았고(칸 크기로 정한 단계 그대로)
 * 넘치거나 잘리거나 겹친 글이 없어야 한다 (fitBlocks가 보지 않는 '잘림'도 여기서 본다).
 * 칸 안이 깨진 것(글이 줄 선에 닿는 것, 항목의 글이 줄 밖으로 나가는 것, 면 안 아래 여백이 붙은 것, comboChecks.ts)도 본다:
 * 조합 검사(checkCombos)가 깨졌다고 보는 높이를 편집기가 허락하지 않게. 칸이 높을수록 늘 더 비는 것(fill)은 높이로 고칠 일이 아니라 뺀다
 */
function fine(cell: HTMLElement, el: HTMLElement): boolean {
  const area = cell.closest<HTMLElement>('.bk-area')
  if (area) fitBlocks(area)
  const k = Number(cell.style.getPropertyValue('--bk-fit') || 1)
  // 다른 컴포넌트와의 겹침(cross)은 보지 않는다: 재는 칸은 갤러리 판의 자리에서 빼내 너비와 높이를 바꿔 가며 재서, 옆 칸과의 자리는 실제 판과
  // 상관없다. 보면 한 줄 너비로 넓힌 점 목록의 둘째 요점이 갤러리에서 옆에 놓인 글 칸과 겹쳐, 넓은 칸의 높이를 하나도 재지 못했다
  return k >= 1 && !scrollOver(el) && clashList(cell, false).length === 0 && innerProblems(cell, { fill: false, covered: false, cross: false }).length === 0
}

/** 진단용: 이 너비에서 860부터 100까지 10px마다 재어 안 되는 높이를 모두 (위에서 끊기지 않고). 높이 사이에 구멍이 있는지 볼 때 */
export function failingHeights(cell: HTMLElement, span: number): number[] {
  const el = inner(cell)
  if (!el) return []
  const saved = cell.getAttribute('style')
  cell.style.alignSelf = 'start'
  cell.style.justifySelf = 'start'
  cell.style.width = `${measuredWidth(span)}px`
  const out: number[] = []
  for (const h of HEIGHTS) {
    cell.style.height = `${h}px`
    if (!fine(cell, el)) out.push(h)
  }
  cell.setAttribute('style', saved ?? '')
  return out
}

/** 재는 칸 너비: 한 줄을 다 쓰지 않는 칸은 옆 칸과의 사이에 이음표가 설 수 있어서, 한쪽이 비켜 준 너비(LINK_PAD만큼 좁게)로 잰다 */
export const measuredWidth = (span: number) => spanWidth(span) - (span < 12 ? LINK_PAD : 0)

/**
 * 이 너비에서 이 높이부터 위로는 늘 괜찮은 가장 낮은 높이. 맨 위(860)도 안 되면 Infinity.
 * 한 줄을 다 쓰지 않는 칸은 이음표가 비켜 준 너비와 온 너비 둘 다 잰다: 칸 너비로 크기가 정해지는 한 줄 숫자(큰 숫자의 값)는
 * 넓을수록 커서 더 높이 든다. 좁은 너비로만 재던 때는 3칸 숫자 카드가 온 너비에서 잰 높이로는 넘쳐 글자를 두 단계 줄였다
 */
function lowest(cell: HTMLElement, el: HTMLElement, span: number): number {
  // 한 줄을 다 쓰지 않는 칸은 늘 다른 부품과 한 줄에 있다(blocks.css의 .is-shared: 글자 단계가 다르다)
  cell.classList.toggle('is-shared', span < 12)
  let ok = Infinity
  for (const w of new Set([measuredWidth(span), spanWidth(span)])) {
    cell.style.width = `${w}px`
    let here = Infinity
    for (const h of HEIGHTS) {
      if (ok !== Infinity && h < ok) break
      cell.style.height = `${h}px`
      if (!fine(cell, el)) break
      here = h
    }
    // 둘째 너비는 첫 너비의 높이까지만 잰다: 그보다 낮은 높이는 어차피 쓰지 않는다
    ok = ok === Infinity ? here : here === Infinity ? Infinity : Math.max(ok, here)
    if (ok === Infinity) break
  }
  return ok
}

/**
 * 갤러리에 그려진 부품마다 칸 너비별로 잰다: { 부품: { 너비: 높이 } }.
 * look을 주면 그 바탕으로 그려진 칸을 먼저 잰다: 혼자 한 줄을 다 쓰는 칸은 고른 면이 있어도 바탕 없이 그려져서(shownLook)
 * 맨 앞 칸만 재면 카드 높이가 바탕 없는 높이로 잡힌다. 그렇게 그려진 칸이 없는 부품(늘 혼자 쓰는 부품)은 그려지는 대로
 */
export async function measureBlocks(look?: 'plain' | 'card'): Promise<Partial<Record<BlockType, Record<number, number>>>> {
  await document.fonts.ready
  const out: Partial<Record<BlockType, Record<number, number>>> = {}
  for (const area of document.querySelectorAll<HTMLElement>('.bk-area')) area.style.removeProperty('--bk-sq')
  // 다른 부품의 장에 함께 놓은 부품(갤러리의 fill-)은 예시 그대로라 항목 수가 다르다
  const all = Array.from(document.querySelectorAll<HTMLElement>('.bk')).filter((c) => !c.dataset.block?.includes('-fill-'))
  const cells = look ? [...all.filter((c) => c.classList.contains(`bk-look-${look}`)), ...all] : all
  for (const cell of cells) {
    const type = BLOCK_TYPES.find((t) => cell.classList.contains(`bk-${t}`))
    const el = inner(cell)
    if (!type || !el || out[type]) continue
    const saved = cell.getAttribute('style')
    // 칸 높이에 맞춰 커지는 부품(큰 숫자)이 있어서, 안쪽 높이를 auto로 풀어 재면 안 된다
    cell.style.alignSelf = 'start'
    cell.style.justifySelf = 'start'
    const result: Record<number, number> = {}
    const shared = cell.classList.contains('is-shared')
    for (const span of SPANS) if (span >= BLOCKS[type].minSpan) result[span] = lowest(cell, el, span)
    out[type] = result
    cell.classList.toggle('is-shared', shared)
    cell.setAttribute('style', saved ?? '')
  }
  return out
}

const frame = () => new Promise((r) => requestAnimationFrame(() => r(null)))

/** 갤러리 주소를 바꾸고 그 부품들이 다 그려질 때까지 기다린다 */
async function show(query: string, types: BlockType[]) {
  location.hash = `#/gallery?${query}`
  for (let i = 0; i < 200; i++) {
    await frame()
    if (location.hash.endsWith(query) && types.every((t) => document.querySelector(`.bk.bk-${t}`))) break
  }
  await document.fonts.ready
  // 그린 뒤 fitBlocks가 한 번 돌고 나서 잰다
  await new Promise((r) => setTimeout(r, 120))
}

export type HeightTable = Record<string, Record<number, number[]>>

/**
 * 모든 부품(only를 주면 그 부품만, 새 부품 하나를 더했을 때) × 모양 × 바탕 × 항목 수 × 칸 너비. 열쇠는 '부품.모양.바탕'(바탕: plain, card — 강조색 면은 카드와 안쪽 여백이 같다),
 * 값은 { 칸 너비: [항목 수마다의 높이] } (항목이 없는 부품은 [0]에). source는 blockHeights.ts에 그대로 붙여 넣을 글
 */
export async function measureAll(
  log: (s: string) => void = console.info,
  extra = '',
  looks: readonly ('plain' | 'card')[] = ['plain', 'card'],
  only: readonly BlockType[] = BLOCK_TYPES,
): Promise<{ table: HeightTable; fails: string[]; source: string }> {
  const table: HeightTable = {}
  const fails: string[] = []
  const t0 = performance.now()
  for (const look of looks) {
    // 모양마다: 기본 모양(첫째)은 모든 부품을 한 번에, 다른 모양은 그 모양이 있는 부품만
    const variantIds = [null, ...new Set(only.flatMap((t) => (BLOCKS[t].variants ?? []).slice(1).map((v) => v.id)))]
    for (const bv of variantIds) {
      const withV = only.filter((t) => (bv === null ? true : BLOCKS[t].variants?.slice(1).some((v) => v.id === bv)))
      const most = Math.max(1, ...withV.map((t) => BLOCKS[t].items?.max ?? 1))
      for (let n = 1; n <= most; n++) {
        // 항목 수가 n일 수 있는 부품만 (항목이 없는 부품은 한 번만)
        const types = withV.filter((t) => {
          const it = BLOCKS[t].items
          return it ? n >= it.min && n <= it.max : n === 1
        })
        if (!types.length) continue
        // 진행 현황의 상태별은 항목 수가 아니라 한 단에 모인 과제 수로 잰다: 과제를 모두 한 단에 (blocks/sizing.ts의 heightCount)
        const lane = bv === 'board' ? '&lane=1' : ''
        await show(`set=blocks&mode=final&bl=${look}&fill=${n}${bv ? `&bv=${bv}` : ''}${lane}${extra ? `&${extra}` : ''}&types=${types.join(',')}`, types)
        const m = await measureBlocks(look)
        for (const t of types) {
          const v = bv ?? BLOCKS[t].variants?.[0].id ?? 'base'
          const key = `${t}.${v}.${look}`
          const idx = BLOCKS[t].items ? n : 0
          for (const [span, h] of Object.entries(m[t] ?? {})) {
            const row = ((table[key] ??= {})[Number(span)] ??= [])
            row[idx] = h
            if (!Number.isFinite(h)) fails.push(`${key} 항목 ${idx} 너비 ${span}`)
          }
        }
      }
      log(`${look} ${bv ?? '기본 모양'} ${Math.round((performance.now() - t0) / 1000)}초`)
    }
  }
  return { table, fails, source: heightsSource(table) }
}

/** 두 번 잰 것(글꼴 짝 둘)에서 자리마다 높은 쪽. 어느 글꼴을 골라도 잘리지 않게 */
export function mergeHeights(a: HeightTable, b: HeightTable): HeightTable {
  const out: HeightTable = structuredClone(a)
  for (const [key, spans] of Object.entries(b)) {
    for (const [span, hs] of Object.entries(spans)) {
      const row = ((out[key] ??= {})[Number(span)] ??= [])
      hs.forEach((h, i) => {
        if (h !== undefined) row[i] = Math.max(row[i] ?? 0, h)
      })
    }
  }
  return out
}

/** 고를 수 있는 글꼴 짝(themes.ts의 FONTS)마다 모두 재어 자리마다 가장 높은 쪽. 글꼴마다 2분쯤 걸린다 */
export async function measureAllFonts(log: (s: string) => void = console.info): Promise<HeightTable> {
  let table: HeightTable = {}
  for (const f of FONTS) {
    log(`글꼴: ${f.name}`)
    table = mergeHeights(table, (await measureAll(log, `font=${f.id}`)).table)
  }
  return table
}

/** 잰 값을 blockHeights.ts의 글로. 항목 수가 최소보다 적은 자리는 최소의 값으로 채워 둔다 (배열 자리 = 항목 수) */
export function heightsSource(table: HeightTable): string {
  const lines = Object.keys(table)
    .sort()
    .map((key) => {
      const spans = Object.entries(table[key])
        .map(([span, hs]) => {
          const first = hs.findIndex((h) => h !== undefined)
          const full = Array.from(hs, (h, i) => (i < first ? hs[first] : h))
          return `${span}: [${full.map((h) => (h !== undefined && Number.isFinite(h) ? h : 999)).join(', ')}]`
        })
        .join(', ')
      return `  '${key}': { ${spans} },`
    })
  return `${HEIGHTS_HEAD}export const BLOCK_HEIGHTS: Record<string, Partial<Record<number, number[]>>> = {\n${lines.join('\n')}\n}\n`
}

const HEIGHTS_HEAD = `/*
 * 부품이 잘리지 않는 가장 낮은 칸 높이(캔버스 px). 갤러리에서 잰 값이라 손으로 고치지 않는다.
 * 다시 재기: npm run dev → #/gallery?set=blocks 에서 브라우저 콘솔에 (screens/measureBlocks.ts)
 *   copy(heightsSource(await measureAllFonts()))
 * 고를 수 있는 글꼴 짝(themes.ts의 FONTS)마다 재어 가장 높은 쪽을 쓴다.
 *
 * 열쇠는 '부품.모양.바탕'(plain: 그대로, card: 카드와 강조색 면), 값은 { 칸 너비(12칸 중): [항목 수마다의 높이] }.
 * 항목이 없는 부품은 [0]에. 999는 그 너비에서 860px로도 안 되는 것 (그런 너비에는 놓지 않는다).
 * 칸 크기로 정한 글자 단계(--bk-w, --bk-h) 그대로, 더 줄이지 않고 잘리거나 겹치지 않는 높이다.
 * 한 줄을 다 쓰지 않는 칸은 한쪽에 이음표가 선 너비(LINK_PAD만큼 좁게)로 잰다.
 */
`

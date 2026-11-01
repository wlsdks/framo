import { blockFigures, blockTextLines } from '../slides/fitBlocks'

/*
 * 개발용: 부품 칸 안이 깨졌는지 보는 검사 (combos.ts의 checkCombos가 칸마다 부른다).
 * clashes(measureBlocks.ts)는 글이 칸 밖으로 나가거나 글끼리 겹치는 것만 봐서, 아래 셋을 놓쳤다:
 * - 줄 선: 줄이 내용보다 낮게 눌려(격자의 minmax(0, 1fr)) 이름과 설명이 줄 선 위에 올라타도 글끼리는 겹치지 않았다.
 *   글이 줄 선에 닿거나 걸치는 것, 항목의 글이 그 항목의 상자 밖(다음 줄의 자리)으로 나가는 것을 본다
 * - 가림: 그림(점, 막대, 면)이 글 위에 그려져 글을 덮는 것
 * - 면의 여백: 옅은 면, 진한 면, 레이아웃 안의 면(비교의 두 면 같은)에서 위 여백은 넓은데 마지막 줄이 면 바닥에 붙었다.
 *   글이 그려진 선(잉크)에서 면 끝까지를 위와 아래에서 재어 견준다
 * 길이는 모두 캔버스 px(1920×1080 기준). 갤러리와 편집 화면은 장을 줄여 그려서 화면 px를 바꿔 잰다.
 */

type Box = { l: number; t: number; r: number; b: number }

/** 글이 줄 선과 이만큼은 떨어져야 한다. 줄이 눌린 비교, 하나 크게의 줄은 3~5px였다. 좋은 장의 가장 좁은 곳은 10px 남짓 */
const RULE_GAP = 6
/** 항목의 글이 항목 상자 밖으로 이만큼까지는 봐준다 (글꼴의 잉크가 상자 끝에 걸치는 정도) */
const SPILL = 2
/** 면 안의 위 여백과 아래 여백이 이만큼 넘게 다르면 눈에 다르게 보인다. 여백이 넓으면 그 10%까지 (넓은 여백에서는 같은 차이가 덜 보인다) */
const PAD_TOL = 12
const PAD_TOL_K = 0.1
/** 면 끝과 글 사이가 이보다 좁으면 붙어 보인다 */
const PAD_MIN = 16
/** 여백을 견줄 만한 면: 이보다 작은 면(점, 막대, 이름표)은 여백을 따로 정하지 않는다 */
const PANEL_W = 160
const PANEL_H = 96

const EDIT_UI = '.ed-halo, .it-remove, .it-grip, .pn-tools, .img-tools, .bk-handle, .bk-gutter'

const shown = (el: Element) => el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) && !el.closest(EDIT_UI)

/** 색의 불투명도 (계산된 색 글: rgb(), rgba(), color(srgb … / a), transparent) */
function alpha(c: string): number {
  if (!c || c === 'transparent') return 0
  const slash = /\/\s*([\d.]+)(%?)\s*\)$/.exec(c)
  if (slash) return Number(slash[1]) / (slash[2] ? 100 : 1)
  const rgba = /^rgba\(([^)]+)\)$/.exec(c)
  if (rgba) return Number(rgba[1].split(',')[3] ?? 1)
  return 1
}

const filled = (cs: CSSStyleDeclaration) => alpha(cs.backgroundColor) > 0.02 || cs.backgroundImage !== 'none'

interface Paint {
  /** 그려진 상자 (화면 px) */
  box: Box
  cs: CSSStyleDeclaration
  /** 이 상자를 그린 요소 (가상 요소면 그 주인) */
  el: Element
  name: string
}

const nameOf = (el: Element, pseudo = '') =>
  `${(typeof el.className === 'string' && el.className ? el.className.split(' ').find((c) => c !== 'it' && c !== 'ed') ?? el.className.split(' ')[0] : el.tagName.toLowerCase())}${pseudo}`

/**
 * 가상 요소(::before, ::after)로 그린 상자. 줄 선과 면을 가상 요소로 긋는 레이아웃이 많아서(비교의 두 면, 하나 크게의 나누는 줄)
 * 요소만 보면 놓친다. 자리를 정해 그린 것(position: absolute)만: 주인 상자에서 top, left와 너비, 높이로 자리를 낸다
 */
function pseudoPaint(el: HTMLElement, which: '::before' | '::after'): Paint | null {
  const cs = getComputedStyle(el, which)
  if (cs.content === 'none' || cs.content === 'normal' || cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return null
  if (cs.position !== 'absolute') return null
  const own = getComputedStyle(el)
  if (own.position === 'static') return null
  const r = el.getBoundingClientRect()
  const k = el.offsetWidth ? r.width / el.offsetWidth : 1
  const px = (v: string) => parseFloat(v) || 0
  const left = parseFloat(cs.left)
  const top = parseFloat(cs.top)
  const w = parseFloat(cs.width) + px(cs.paddingLeft) + px(cs.paddingRight) + px(cs.borderLeftWidth) + px(cs.borderRightWidth)
  const h = parseFloat(cs.height) + px(cs.paddingTop) + px(cs.paddingBottom) + px(cs.borderTopWidth) + px(cs.borderBottomWidth)
  if (![left, top, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return null
  // 옮겨 그린 것(transform)은 자리를 알 수 없어서 뺀다
  if (cs.transform && cs.transform !== 'none') return null
  const x0 = r.left + (px(own.borderLeftWidth) + left) * k
  const y0 = r.top + (px(own.borderTopWidth) + top) * k
  return { box: { l: x0, t: y0, r: x0 + w * k, b: y0 + h * k }, cs, el, name: nameOf(el, which) }
}

/** 칸 안에서 그려진 상자(요소와 가상 요소) 가운데 면이나 선이 있는 것 */
function paints(inner: HTMLElement): Paint[] {
  const out: Paint[] = []
  for (const el of [inner, ...inner.querySelectorAll<HTMLElement>('*')]) {
    if (el instanceof SVGElement || !shown(el)) continue
    const cs = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    if (r.width > 0 && r.height > 0) out.push({ box: { l: r.left, t: r.top, r: r.right, b: r.bottom }, cs, el, name: nameOf(el) })
    for (const w of ['::before', '::after'] as const) {
      const p = pseudoPaint(el, w)
      if (p) out.push(p)
    }
  }
  return out
}

interface Rule {
  box: Box
  dir: 'h' | 'v'
  name: string
  el: Element
}

/** 줄 선: 테두리 한 변, 또는 얇게 칠한 상자(가로선, 세로선). k는 캔버스 1px의 화면 px */
function rulesOf(list: Paint[], k: number): Rule[] {
  const out: Rule[] = []
  for (const { box, cs, name, el } of list) {
    const side = (s: 'Top' | 'Right' | 'Bottom' | 'Left') => {
      const w = parseFloat(cs[`border${s}Width`])
      return w > 0 && cs[`border${s}Style`] !== 'none' && cs[`border${s}Style`] !== 'hidden' && alpha(cs[`border${s}Color`]) > 0.02 ? w * k : 0
    }
    // 네 변이 다 있는 상자(테두리를 두른 칩, 강조 칸)는 줄 선이 아니라 면이다: 면의 여백으로 본다
    const [t, r, b, l] = [side('Top'), side('Right'), side('Bottom'), side('Left')]
    if (!(t && r && b && l)) {
      if (t) out.push({ box: { ...box, b: box.t + t }, dir: 'h', name: `${name} 위 선`, el })
      if (b) out.push({ box: { ...box, t: box.b - b }, dir: 'h', name: `${name} 아래 선`, el })
      if (l) out.push({ box: { ...box, r: box.l + l }, dir: 'v', name: `${name} 왼쪽 선`, el })
      if (r) out.push({ box: { ...box, l: box.r - r }, dir: 'v', name: `${name} 오른쪽 선`, el })
    }
    if (!filled(cs)) continue
    const w = box.r - box.l
    const h = box.b - box.t
    if (h <= 6 * k && w >= 16 * k) out.push({ box, dir: 'h', name, el })
    else if (w <= 6 * k && h >= 16 * k) out.push({ box, dir: 'v', name, el })
  }
  return out
}

interface Line extends Box {
  n: Node
  el: Element
}

/** 칸 안의 글 줄(글자가 그려진 자리, 화면 px). 편집 표시의 글은 뺀다 */
function linesOf(inner: HTMLElement): Line[] {
  return blockTextLines(inner)
    .map((q) => ({ ...q, el: q.n.parentElement! }))
    .filter((q) => q.el && !q.el.closest(EDIT_UI))
}

const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0)
const text = (q: Line) => `「${(q.n.textContent ?? '').trim().slice(0, 12)}」`

/**
 * 글이 불투명한 바탕을 깐 상자 안에 있고 그 상자가 줄 선보다 나중에(위에) 그려지면, 줄 선은 그 상자 밑으로 지나가 글에 닿아 보이지 않는다
 * (위치 비교의 이름표는 판의 바탕색을 깔아 가운데 점선을 가린다). 그 상자가 줄 선을 품고 있으면 줄 선이 위에 그려진다
 */
function hiddenUnder(q: Line, rule: Rule, stop: Element): boolean {
  for (let x: Element | null = q.el; x && x !== stop; x = x.parentElement) {
    if (x.contains(rule.el)) return false
    if (alpha(getComputedStyle(x).backgroundColor) < 0.95) continue
    if (!(rule.el.compareDocumentPosition(x) & Node.DOCUMENT_POSITION_FOLLOWING)) return false
    const z = getComputedStyle(rule.el).zIndex
    return z === 'auto' || z === '0'
  }
  return false
}

/** 글이 줄 선에 걸치거나 닿는 곳 */
function ruleHits(lines: Line[], rules: Rule[], k: number, stop: Element): string[] {
  const out: string[] = []
  for (const q of lines) {
    for (const rule of rules) {
      const g = rule.box
      if (hiddenUnder(q, rule, stop)) continue
      if (rule.dir === 'h') {
        if (overlap(q.l, q.r, g.l, g.r) <= 2 * k) continue
        const d = Math.max(g.t - q.b, q.t - g.b) / k
        if (d < RULE_GAP) out.push(`글이 줄 선에 ${d < 0 ? '걸쳐요' : `붙어요(${Math.round(d)}px)`}: ${text(q)} / ${rule.name}`)
      } else {
        if (overlap(q.t, q.b, g.t, g.b) <= 2 * k) continue
        const d = Math.max(g.l - q.r, q.l - g.r) / k
        if (d < RULE_GAP) out.push(`글이 세로 선에 ${d < 0 ? '걸쳐요' : `붙어요(${Math.round(d)}px)`}: ${text(q)} / ${rule.name}`)
      }
    }
  }
  return out
}

/** el에서 항목(it)까지 사이에 자리를 정해 그린(position: absolute) 상자가 있는지 */
function placed(el: Element, it: Element): boolean {
  for (let x: Element | null = el; x && x !== it; x = x.parentElement) if (getComputedStyle(x).position === 'absolute') return true
  return false
}

/**
 * 항목의 글이 그 항목의 상자 밖, 옆 항목의 자리로 나간 곳: 줄이 내용보다 낮게 눌려 다음 줄의 자리에 올라탄다.
 * 아무 항목도 없는 쪽(칸의 여백)으로 나간 것은 보지 않는다: 큰 숫자는 줄 높이를 1보다 낮게 잡아 글자가 줄 상자 위아래로 나오고,
 * 칸 밖으로 나간 것은 clashes가 본다
 */
function itemSpills(inner: HTMLElement, lines: Line[], k: number): string[] {
  const out: string[] = []
  const items = [...inner.querySelectorAll<HTMLElement>('.it')].filter((it) => shown(it) && it.offsetWidth && it.offsetHeight)
  const boxes = items.map((it) => it.getBoundingClientRect())
  items.forEach((it, i) => {
    const r = boxes[i]
    for (const q of lines) {
      if (!it.contains(q.n)) continue
      // 항목 안에서 자리를 정해 밖에 둔 글(막대 위 숫자 같은)은 그 항목의 상자를 넘어도 된다
      if (placed(q.el, it)) continue
      const over = Math.max(r.top - q.t, q.b - r.bottom) / k
      if (over <= SPILL) continue
      const into = items.some((o, j) => j !== i && !o.contains(it) && !it.contains(o) && overlap(q.l, q.r, boxes[j].left, boxes[j].right) > 2 * k && overlap(q.t, q.b, boxes[j].top, boxes[j].bottom) > SPILL * k)
      if (into) out.push(`항목의 글이 줄 밖, 옆 항목의 자리로 ${Math.round(over)}px 나가요: ${text(q)} (${nameOf(it)})`)
    }
  })
  return out
}

/** 글 위에 다른 것이 그려져 글을 덮는 곳. 글 줄의 가운데 몇 점에서 맨 위에 그려진 것을 본다 (화면 안에 있어야 잴 수 있다) */
function covered(cell: HTMLElement, lines: Line[]): string[] {
  const out: string[] = []
  const vw = innerWidth
  const vh = innerHeight
  for (const q of lines) {
    const y = (q.t + q.b) / 2
    if (y < 0 || y > vh) continue
    for (const f of [0.2, 0.5, 0.8]) {
      const x = q.l + (q.r - q.l) * f
      if (x < 0 || x > vw) continue
      const stack = document.elementsFromPoint(x, y)
      const at = stack.findIndex((e) => e === q.el || e.contains(q.el))
      // 글이 맞히기에서 빠지면(pointer-events: none) 알 수 없다
      if (at < 0) continue
      const above = stack.slice(0, at).find((e) => {
        if (!cell.contains(e) || e.contains(q.el) || q.el.contains(e) || e.closest(EDIT_UI)) return false
        if (e instanceof SVGElement) return ['path', 'rect', 'circle', 'line', 'polyline', 'polygon', 'ellipse'].includes(e.tagName.toLowerCase())
        const cs = getComputedStyle(e)
        return filled(cs) || e.tagName === 'IMG'
      })
      if (above) {
        out.push(`글이 가려져요: ${text(q)} 위에 ${nameOf(above)}`)
        break
      }
    }
  }
  return out
}

/**
 * 면(옅은 면, 진한 면, 레이아웃 안의 면)의 여백: 면 안 내용의 잉크에서 면 끝까지, 위와 아래가 같아야 한다.
 * 내용은 면 안에 가운데가 든 글 줄, 그림, 줄 선, 작은 면. 위가 넓고 아래가 붙은 면(아래로 밀린 내용)과 끝에 닿은 면을 찾는다.
 * 위에 붙고 아래가 빈 면(내용이 면보다 짧은)은 따로 적는다: 칸을 채우는 일(fitBlocks의 줄 사이 넓히기, 가운데로 내리기)이다
 */
function panelGaps(cell: HTMLElement, inner: HTMLElement, list: Paint[], all: Line[], k: number, fill: boolean): string[] {
  const out: string[] = []
  // 숫자 옆 단위 글자(.u)는 숫자 줄의 일부로 본다: 한글 단위는 숫자 바닥선 아래로 조금 내려오지만(명조의 큰 숫자에서 17px)
  // 눈은 큰 숫자의 바닥선을 묶음의 끝으로 읽는다
  const lines = all.filter((q) => !q.el.closest('.u'))
  const cellBox = cell.getBoundingClientRect()
  const panels: Paint[] = []
  // 칸 자체의 면 (옅은 면, 진한 면): 칸에 칠해진 바탕
  const ccs = getComputedStyle(cell)
  if (filled(ccs)) panels.push({ box: { l: cellBox.left, t: cellBox.top, r: cellBox.right, b: cellBox.bottom }, cs: ccs, el: cell, name: '칸의 면' })
  // 칸 밑에 깔린 바탕색: 칸에 면이 없으면 장의 바탕까지 올라가 본다. 그 색을 깐 상자(위치 비교의 이름표)는 보이는 면이 아니다
  let bg = ''
  for (let x: Element | null = cell; x && !bg; x = x.parentElement) {
    const c = getComputedStyle(x).backgroundColor
    if (alpha(c) > 0.02) bg = c
  }
  for (const p of list) {
    const w = (p.box.r - p.box.l) / k
    const h = (p.box.b - p.box.t) / k
    if (w < PANEL_W || h < PANEL_H || !filled(p.cs) || p.el === inner) continue
    // 칸과 같은 색의 상자는 면이 아니다 (바탕을 다시 깐 것)
    if (bg && p.cs.backgroundColor === bg) continue
    // 그림 판(차트의 칠한 자리, 이미지)은 면이 아니다: 글이 든 면만
    if (p.cs.backgroundImage !== 'none' && alpha(p.cs.backgroundColor) <= 0.02) continue
    panels.push(p)
  }
  const figs = blockFigures(inner).map((el) => {
    const r = el.getBoundingClientRect()
    return { el, box: { l: r.left, t: r.top, r: r.right, b: r.bottom } }
  })
  const rules = rulesOf(list, k)
  for (const p of panels) {
    const b = p.box
    const inside = (q: Box) => {
      const cx = (q.l + q.r) / 2
      const cy = (q.t + q.b) / 2
      return cx > b.l && cx < b.r && cy > b.t && cy < b.b
    }
    // 면의 내용은 그 면을 그린 요소 안의 것만: 여러 줄에 걸쳐 깐 띠(일정의 '지금' 띠, 평가표의 고른 열)는 안에 든 글이 제 것이 아니다.
    // 가상 요소로 그린 면은 주인 요소 안에서 면 자리에 든 것
    const mine = (el: Element) => p.el.contains(el)
    const own = lines.filter((q) => mine(q.el) && inside(q))
    if (!own.length) continue
    // 면 안의 더 작은 면(칸 안의 카드)도 내용이다. 면 자신과 면을 다 덮는 상자는 빼고
    const smaller = panels.filter((o) => o !== p && mine(o.el) && inside(o.box) && o.box.b - o.box.t < b.b - b.t - 2 * k).map((o) => o.box)
    // 면보다 작게 칠한 상자(색 표의 칸, 막대, 표시 점)도 눈에는 내용의 끝이다: 색 표 마지막 줄의 칸은 칸 안 숫자보다 23px 아래까지
    // 칠해져, 숫자만 재면 아래가 그만큼 더 비어 보였다. 면을 다 덮는 칠(고른 열의 띠)과 바탕색을 다시 깐 상자는 빼고
    const shapes = list
      .filter((o) => o.el !== p.el && mine(o.el) && filled(o.cs) && o.cs.backgroundColor !== bg && inside(o.box) && o.box.b - o.box.t < b.b - b.t - 2 * k)
      .map((o) => o.box)
    // 면 끝에 붙여 긋는 선(면의 테두리, 면 맨 위의 머리 선)은 내용이 아니다
    const edge = (q: Box) => Math.abs(q.t - b.t) < 2 * k || Math.abs(q.b - b.b) < 2 * k
    // 두 면이 항목의 줄을 같이 쓰면(비교의 두 면) 그 줄은 두 면에 걸친 한 묶음이다: 한쪽 글이 두 줄이면 다른 쪽의 한 줄 글은
    // 줄 가운데에 서서 그 면만 아래가 반 줄 더 빈다. 그 줄의 다른 면 글도 같이 넣어 줄째 잰다
    const rows = new Set(own.map((q) => q.el.closest('.it')).filter((it): it is Element => !!it && it !== p.el && mine(it)))
    const paired = lines.filter((q) => !own.includes(q) && rows.has(q.el.closest('.it')!)).map((q) => ({ ...q, l: b.l, r: b.r }))
    // 나란히 선 같은 높이의 면들(단계 흐름의 칸, 안 비교의 안)은 한 줄을 같이 쓴다: 내용이 가장 긴 면의 위아래가 같으면 되고,
    // 짧은 면은 그만큼 아래가 더 비는 것이 맞다(글을 면마다 가운데에 두면 번호와 이름의 윗선이 면마다 어긋난다)
    const same = (o: Paint) => o.el !== p.el && o.el.parentElement === p.el.parentElement && Math.abs(o.box.t - b.t) < 2 * k && Math.abs(o.box.b - b.b) < 2 * k
    const sibling = panels
      .filter(same)
      .flatMap((o) => lines.filter((q) => o.el.contains(q.el)).map((q) => ({ ...q, l: b.l, r: b.r })))
    const content = [
      ...own,
      ...paired,
      ...sibling,
      // 면을 다 덮는 그림(색 표의 고리처럼 칸에 겹쳐 그린 틀)은 내용이 아니다
      ...figs.filter((f) => mine(f.el) && inside(f.box) && !(Math.abs(f.box.t - b.t) < 2 * k && Math.abs(f.box.b - b.b) < 2 * k)).map((f) => f.box),
      ...rules.filter((g) => mine(g.el) && inside(g.box) && !edge(g.box)).map((g) => g.box),
      ...smaller,
      ...shapes,
    ]
    const top = (Math.min(...content.map((q) => q.t)) - b.t) / k
    const bottom = (b.b - Math.max(...content.map((q) => q.b))) / k
    const what = `${p.name} ${Math.round((b.r - b.l) / k)}×${Math.round((b.b - b.t) / k)}`
    // 둥근 면(카드)만 면으로 본다: 모서리가 없는 칠(2×2의 고른 칸, 표의 머리 줄)은 격자의 한 칸이라 글을 위에 붙여 두는 짜임이다
    const card = p.el === cell || parseFloat(p.cs.borderTopLeftRadius) >= 4
    const tol = Math.max(PAD_TOL, PAD_TOL_K * Math.max(top, bottom))
    if (Math.min(top, bottom) < PAD_MIN) out.push(`${what}: 내용이 면 끝에 붙어요 (위 ${Math.round(top)}, 아래 ${Math.round(bottom)})`)
    else if (!card) continue
    else if (top - bottom > tol) out.push(`${what}: 아래 여백이 위보다 ${Math.round(top - bottom)}px 좁아요 (위 ${Math.round(top)}, 아래 ${Math.round(bottom)})`)
    // 위아래 선(card)은 두 줄 선 사이의 단락이라 위에서부터 그리고 남는 높이는 아래에 둔다(blocks/base.css)
    else if (fill && bottom - top > tol && !(p.el === cell && cell.classList.contains('bk-look-card'))) out.push(`${what}: 아래가 비어요 (위 ${Math.round(top)}, 아래 ${Math.round(bottom)})`)
  }
  return out
}

/**
 * 칸의 꾸밈 선(::before)이 흐름 안에 선 것(position: static, 칸 맨 위의 선): 자리를 계산된 값으로 낸다. pseudoPaint는 자리를 정해
 * 그린 것만 보아서, 흐름 안의 선(예전 소제목의 머리 선 같은)은 다른 칸의 글 위로 지나가도 몰랐다
 */
function flowPaint(el: HTMLElement): Paint | null {
  const cs = getComputedStyle(el, '::before')
  if (cs.content === 'none' || cs.content === 'normal' || cs.display === 'none' || cs.display.startsWith('inline') || cs.position !== 'static') return null
  const own = getComputedStyle(el)
  const r = el.getBoundingClientRect()
  const k = el.offsetWidth ? r.width / el.offsetWidth : 1
  const px = (v: string) => parseFloat(v) || 0
  const h = px(cs.height)
  const w = Number.isFinite(parseFloat(cs.width)) ? parseFloat(cs.width) : el.clientWidth - px(own.paddingLeft) - px(own.paddingRight)
  if (h <= 0 || w <= 0) return null
  const x0 = r.left + (px(own.borderLeftWidth) + px(own.paddingLeft) + px(cs.marginLeft)) * k
  const y0 = r.top + (px(own.borderTopWidth) + px(own.paddingTop) + px(cs.marginTop)) * k
  return { box: { l: x0, t: y0, r: x0 + w * k, b: y0 + h * k }, cs, el, name: nameOf(el, '::before') }
}

/** 칸이 그린 선: 칸 안쪽의 것과 칸 자신의 가상 요소(칸 밖 위에 긋는 선 같은) */
function cellRules(cell: HTMLElement, inner: HTMLElement, k: number): Rule[] {
  const list = paints(inner)
  for (const w of ['::before', '::after'] as const) {
    const p = pseudoPaint(cell, w)
    if (p) list.push(p)
  }
  for (const el of [inner, ...inner.querySelectorAll<HTMLElement>('*')]) {
    if (el instanceof SVGElement || !shown(el)) continue
    const p = flowPaint(el)
    if (p) list.push(p)
  }
  return rulesOf(list, k)
}

/**
 * 칸끼리: 이 칸의 글이 다른 칸의 글과 겹치거나, 다른 칸이 그은 선이 이 칸의 글을 지나가거나 붙는 곳 (docs/VISUAL-RULES.md 5).
 * 칸 안만 보는 검사는 칸이 쌓기(fitBlocks의 pack)로 올라가거나 내용이 칸 밖으로 넘쳐 다른 칸 위에 그려진 것을 놓쳤다
 * ('지금 방식' 소제목의 덧붙임을 아래 칸의 선이 긋고, 소제목이 아래 컴포넌트 이름 위에 겹쳐 그려졌다).
 * 글끼리의 겹침은 두 칸 가운데 앞 칸에서 한 번만 적는다. 편집할 때 그림 위에 일부러 띄우는 입력 칸(.on-chart)은 뺀다
 */
function crossHits(cell: HTMLElement, lines: Line[], k: number): string[] {
  const area = cell.parentElement
  if (!area?.classList.contains('bk-area')) return []
  const out: string[] = []
  const mine = lines.filter((q) => !q.el.closest('.on-chart'))
  const cells = [...area.querySelectorAll<HTMLElement>(':scope > .bk')]
  const at = cells.indexOf(cell)
  cells.forEach((other, j) => {
    if (other === cell || !other.offsetWidth) return
    const inner = other.querySelector<HTMLElement>(':scope > .bk-in')
    if (!inner) return
    const what = `${other.dataset.type}`
    if (j > at) {
      for (const q of mine) {
        for (const o of linesOf(inner)) {
          if (o.el.closest('.on-chart')) continue
          if (overlap(q.l, q.r, o.l, o.r) > 2 * k && overlap(q.t, q.b, o.t, o.b) > 2 * k) out.push(`글이 다른 컴포넌트(${what})의 글과 겹쳐요: ${text(q)} / ${text(o)}`)
        }
      }
    }
    for (const g of cellRules(other, inner, k)) {
      for (const q of mine) {
        if (g.dir === 'h') {
          if (overlap(q.l, q.r, g.box.l, g.box.r) <= 2 * k) continue
          const d = Math.max(g.box.t - q.b, q.t - g.box.b) / k
          if (d < RULE_GAP) out.push(`다른 컴포넌트(${what})의 선이 글에 ${d < 0 ? '걸쳐요' : `붙어요(${Math.round(d)}px)`}: ${text(q)} / ${g.name}`)
        } else {
          if (overlap(q.t, q.b, g.box.t, g.box.b) <= 2 * k) continue
          const d = Math.max(g.box.l - q.r, q.l - g.box.r) / k
          if (d < RULE_GAP) out.push(`다른 컴포넌트(${what})의 세로 선이 글에 ${d < 0 ? '걸쳐요' : `붙어요(${Math.round(d)}px)`}: ${text(q)} / ${g.name}`)
        }
      }
    }
  })
  return out
}

export interface InnerOptions {
  /** 면 안에서 내용이 위에 붙고 아래가 빈 것도 (칸 높이를 바꿔 가며 잴 때는 뺀다: 칸이 높을수록 늘 더 빈다) */
  fill?: boolean
  /** 글이 가려진 것도 (화면 안으로 옮겨 재야 해서 느리다) */
  covered?: boolean
  /** 다른 칸의 글, 선과 겹치는 것도 (칸 하나만 재는 높이 재기에서는 볼 것이 없다) */
  cross?: boolean
}

/**
 * 칸 하나 안이 깨진 곳. 가림은 화면 안에서만 잴 수 있어서 칸을 화면 안으로 옮겨 잰다.
 * 편집 화면에서도 fitBlocks처럼 편집 표시는 빼고 잰다
 */
export function innerProblems(cell: HTMLElement, { fill = true, covered: cover = true, cross = true }: InnerOptions = {}): string[] {
  const inner = cell.querySelector<HTMLElement>(':scope > .bk-in')
  if (!inner || !cell.offsetWidth) return []
  const r0 = cell.getBoundingClientRect()
  // 장은 overflow: clip으로 내부 스크롤을 막는다. 칸을 화면에 가져와도 제목은 움직이지 않는다.
  if (cover && (r0.top < 0 || r0.bottom > innerHeight)) cell.scrollIntoView({ block: 'center' })
  const area = cell.closest<HTMLElement>('.bk-area')
  const was = area?.classList.contains('is-fitting')
  area?.classList.add('is-fitting')
  const k = cell.getBoundingClientRect().width / cell.offsetWidth
  const list = paints(inner)
  const lines = linesOf(inner)
  const out = [
    ...ruleHits(lines, rulesOf(list, k), k, inner),
    ...itemSpills(inner, lines, k),
    ...(cover ? covered(cell, lines) : []),
    ...panelGaps(cell, inner, list, lines, k, fill),
    ...(cross ? crossHits(cell, lines, k) : []),
  ]
  if (!was) area?.classList.remove('is-fitting')
  return [...new Set(out)]
}

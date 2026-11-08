/*
 * 편집 화면에서 부품의 테두리(올렸을 때, 골랐을 때)를 그 부품이 실제로 그린 것에 맞춘다.
 * 칸은 격자가 나눈 자리라서 차트 옆의 짧은 글, 가운데로 내린 숫자처럼 내용이 칸보다 작으면 테두리만 크게 떠 보였다.
 * 그래서 칸 안의 글자 줄, 그림, 면과 선이 그려진 자리를 모아 그 둘레에 테두리를 두른다(--fr-t, --fr-r, --fr-b, --fr-l: 칸에서 안쪽으로의 거리,
 * 캔버스 px, 음수면 칸 밖). 면이 있는 바탕(옅은 면, 진한 면)은 면이 곧 부품이라 칸 그대로.
 * 발표 화면과 내보낸 파일에는 테두리가 없어서 쓰지 않는다 (fitBlocks가 맞춘 뒤에 편집 화면만).
 */

/** 테두리를 내용에서 띄우는 너비 (캔버스 px). 예전 outline-offset(14)과 비슷하게. 끄는 동안 손 아래를 잴 때도 쓴다(BlockEditor) */
export const FRAME_PAD = 14

/** 칸 안의 그린 것을 모을 때 건너뛰는 편집 표시 (칸 밖으로 나온 단추, 올렸을 때만 깔리는 빈칸의 면) */
const SKIP = '.it-remove, .it-grip, .img-tools, .ed-halo, .bk-handle'

/** 보이는 색인지 (계산된 색 글: rgb(), rgba(), color(srgb … / a), transparent) */
const seen = (c: string) => !!c && c !== 'transparent' && !/rgba\(.*,\s*0\)$/.test(c) && !/\/\s*0\)$/.test(c)

/**
 * 요소가 칠한 자리 (화면 px): 면이면 상자째, 선만 있으면 선이 그어진 변만.
 * 상자째 세면 아래 줄 선 하나만 보이는 항목(예상 질문의 첫 질문은 위 선을 투명하게 둔다)의 위 여백까지 그린 것으로 쳐서,
 * 테두리 위가 첫 글보다 40px 넘게 떠 있었다. 투명한 선(자리만 맞추려고 둔 선)도 그린 것이 아니다
 */
function paintRects(el: Element, r: DOMRect): DOMRect[] {
  const s = getComputedStyle(el)
  if (s.visibility === 'hidden' || Number(s.opacity) === 0) return []
  // 손을 올린 항목의 옅은 면(edit.css의 background-image)은 편집 표시다: 그린 것으로 세면 항목에 손을 올린 채 다시 맞출 때
  // 테두리가 항목 상자 끝까지 커졌고, 그 테두리에 맞춰 서는 항목 도구가 누르는 사이에 옆으로 옮겨 가 ✕가 눌리지 않았다
  const tint = el.matches('.bk-area.is-live .it:hover')
  // 그림자로 그은 선(흐름 단계 상자의 옅은 테, 추진 일정의 지금 선)도 상자째: 세지 않을 때는 테두리가 단계 상자의 오른쪽 400px과
  // 지금 선의 끝을 잘랐다. 색은 그림자마다 앞에 온다
  const shadow = s.boxShadow !== 'none' && (s.boxShadow.match(/(?:rgba?|hsla?|color|oklch|oklab|lch|lab|hwb)\([^)]*\)/g) ?? []).some(seen)
  if (seen(s.backgroundColor) || (s.backgroundImage !== 'none' && !tint) || shadow) return [r]
  const out: DOMRect[] = []
  const k = (el as HTMLElement).offsetWidth ? r.width / (el as HTMLElement).offsetWidth : 1
  for (const side of ['top', 'right', 'bottom', 'left'] as const) {
    const w = parseFloat(s.getPropertyValue(`border-${side}-width`)) * k
    if (!(w > 0) || s.getPropertyValue(`border-${side}-style`) === 'none' || !seen(s.getPropertyValue(`border-${side}-color`))) continue
    if (side === 'top') out.push(new DOMRect(r.left, r.top, r.width, w))
    if (side === 'bottom') out.push(new DOMRect(r.left, r.bottom - w, r.width, w))
    if (side === 'left') out.push(new DOMRect(r.left, r.top, w, r.height))
    if (side === 'right') out.push(new DOMRect(r.right - w, r.top, w, r.height))
  }
  return out
}

/**
 * ::before, ::after가 그린 자리 (화면 px). 글자로 그리는 것(점 목록의 01, 02 같은 번호, 따옴표)은 글 마디가 아니라서 글자 줄로는
 * 잡히지 않아 요소 상자째 센다: 세지 않을 때는 점 목록을 고르면 테두리가 번호를 빼고 요점 글에만 둘러졌다.
 * 빈 글에 면이나 선을 칠한 것(일정과 단계 흐름의 축, 범위의 줄, 원인 순위의 80% 선)은 자리를 잡은 것이면 그 자리를 잰다:
 * 세지 않을 때는 테두리가 축을 잘라 선이 테두리 밖으로 100px 넘게 삐져나왔다
 */
function pseudoRects(el: Element, r: DOMRect, k: number): DOMRect[] {
  const out: DOMRect[] = []
  const host = getComputedStyle(el)
  if (Number(host.opacity) === 0) return out
  for (const w of ['::before', '::after']) {
    const s = getComputedStyle(el, w)
    if (s.content === 'none' || s.content === 'normal' || s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) continue
    if (s.content !== '""') {
      out.push(r)
      continue
    }
    const sides = ['top', 'right', 'bottom', 'left'].filter(
      (side) => parseFloat(s.getPropertyValue(`border-${side}-width`)) > 0 && s.getPropertyValue(`border-${side}-style`) !== 'none' && seen(s.getPropertyValue(`border-${side}-color`)),
    )
    if (!seen(s.backgroundColor) && s.backgroundImage === 'none' && !sides.length) continue
    // 흐름 안의 것(격자 칸에 놓인 세로 일정의 줄 선)은 자리를 따로 잴 수 없어 요소의 안쪽 상자에서 어림한다(flowRect): 요소 상자 안에
    // 놓이는데, 글과 함께 잡힌다고 보고 세지 않던 때는 줄 선이 테두리 오른쪽 밖으로 160px 넘게 삐져나왔다
    if (s.position === 'static' || s.position === 'relative') {
      out.push(flowRect(host, s, r, k))
      continue
    }
    // 자리를 잡은 것은 계산된 left, top, width, height가 그려진 자리다
    if (s.position !== 'absolute' || host.position === 'static') continue
    const [x, y, width, height] = [s.left, s.top, s.width, s.height].map(parseFloat)
    if (![x, y, width, height].every(Number.isFinite)) continue
    const edge = (side: string) => parseFloat(s.getPropertyValue(`border-${side}-width`)) + parseFloat(s.getPropertyValue(`padding-${side}`)) || 0
    const outer = s.boxSizing === 'border-box' ? [width, height] : [width + edge('left') + edge('right'), height + edge('top') + edge('bottom')]
    out.push(new DOMRect(r.left + (parseFloat(host.borderLeftWidth) + x) * k, r.top + (parseFloat(host.borderTopWidth) + y) * k, outer[0] * k, outer[1] * k))
  }
  return out
}

/**
 * 흐름 안의 ::before, ::after(격자에 놓인 줄 선, 체계도의 잇는 선)가 놓인 자리의 어림 (화면 px). 요소의 안쪽 상자에서, 격자의 줄과 단에
 * 놓였으면 그 칸만 남기고, 여백(margin)만큼 줄인다(음수 여백은 그만큼 밖으로). 안쪽 상자째 치던 때는 체계도 가운데의 짧은 잇는 선 때문에
 * 테두리가 칸 너비 끝까지 넓어져 사람 글 양옆이 250px씩 비어 있었다
 */
function flowRect(host: CSSStyleDeclaration, s: CSSStyleDeclaration, r: DOMRect, k: number): DOMRect {
  const px = (v: string) => parseFloat(v) || 0
  const inset = (side: string) => (px(host.getPropertyValue(`padding-${side}`)) + px(host.getPropertyValue(`border-${side}-width`))) * k
  let [left, right, top, bottom] = [r.left + inset('left'), r.right - inset('right'), r.top + inset('top'), r.bottom - inset('bottom')]
  // 격자의 줄과 단에 자리를 정해 놓은 축 (자리가 정해지지 않은 축은 어디에 놓였는지 몰라 안쪽 상자 그대로 둔다)
  let placed = { x: false, y: false }
  if (host.display.endsWith('grid')) {
    // 칸 자리(격자 선 번호, span)를 그 축의 칸 크기로 바꾼다. 자리가 정해지지 않았으면(auto) 그 축은 안쪽 상자 그대로
    const area = (tracks: string, gap: string, start: string, end: string, from: number, to: number, place: string): [number, number] | null => {
      const t = tracks.split(/\s+/).filter((x) => x.endsWith('px')).map(parseFloat)
      const n = t.length
      const line = (v: string) => (/^-?\d+$/.test(v) ? (Number(v) < 0 ? n + 2 + Number(v) : Number(v)) : NaN)
      const span = (v: string) => (v.startsWith('span') ? Number(v.slice(4)) || 1 : 1)
      let a = line(start)
      let b = line(end)
      if (!Number.isFinite(a) && Number.isFinite(b)) a = b - span(start)
      if (!Number.isFinite(b) && Number.isFinite(a)) b = a + span(end)
      if (!n || !(a >= 1 && b <= n + 1 && b > a)) return null
      const g = px(gap)
      const pos = (at: number) => t.slice(0, at - 1).reduce((x, y) => x + y, 0) + (at - 1) * g
      // 칸들이 안쪽 상자보다 좁으면 가운데나 끝으로 모인다 (justify-content, align-content)
      const extra = (to - from) / k - (pos(n + 1) - g)
      const shift = extra > 0 ? (place === 'center' ? extra / 2 : /end$/.test(place) ? extra : 0) : 0
      return [from + (shift + pos(a)) * k, from + (shift + pos(b) - g) * k]
    }
    const x = area(host.gridTemplateColumns, host.columnGap, s.gridColumnStart, s.gridColumnEnd, left, right, host.justifyContent)
    const y = area(host.gridTemplateRows, host.rowGap, s.gridRowStart, s.gridRowEnd, top, bottom, host.alignContent)
    if (x) [left, right] = x
    if (y) [top, bottom] = y
    placed = { x: !!x, y: !!y }
  }
  left += px(s.marginLeft) * k
  right -= px(s.marginRight) * k
  top += px(s.marginTop) * k
  bottom -= px(s.marginBottom) * k
  // 격자 칸 안에서는 그린 크기(계산된 width, height)와 맞춤(justify-self, align-self)으로 더 좁힌다: 단계 흐름의 마지막 세로 선은
  // 위에서 점까지만 긋는데(align-self: start), 칸 끝까지로 치면 테두리가 마지막 단계 아래로 단계 사이 여백(30~48px)만큼 더 내려갔다
  const fit = (lo: number, hi: number, size: string, self: string, edges: string[]): [number, number] => {
    const n = (parseFloat(size) + (s.boxSizing === 'border-box' ? 0 : edges.reduce((a, e) => a + px(s.getPropertyValue(e)), 0))) * k
    if (!Number.isFinite(n) || n >= hi - lo) return [lo, hi]
    if (/(^|[ -])start$/.test(self)) return [lo, lo + n]
    if (/(^|[ -])end$/.test(self)) return [hi - n, hi]
    if (self.endsWith('center')) return [(lo + hi - n) / 2, (lo + hi + n) / 2]
    return [lo, hi]
  }
  const self = (v: string, items: string) => (v === 'auto' ? items : v)
  if (placed.x) [left, right] = fit(left, right, s.width, self(s.justifySelf, host.justifyItems), ['padding-left', 'padding-right', 'border-left-width', 'border-right-width'])
  if (placed.y) [top, bottom] = fit(top, bottom, s.height, self(s.alignSelf, host.alignItems), ['padding-top', 'padding-bottom', 'border-top-width', 'border-bottom-width'])
  return new DOMRect(left, top, Math.max(0, right - left), Math.max(0, bottom - top))
}

/** 칸 안에 그려진 것(글자 줄, 그림, 면과 선)을 모두 덮는 네모 (화면 px). 그린 것이 없으면 null */
function inkBox(cell: HTMLElement): { left: number; top: number; right: number; bottom: number } | null {
  const inner = cell.querySelector<HTMLElement>(':scope > .bk-in')
  if (!inner) return null
  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity
  const add = (r: DOMRect) => {
    if (!r.width || !r.height) return
    left = Math.min(left, r.left)
    top = Math.min(top, r.top)
    right = Math.max(right, r.right)
    bottom = Math.max(bottom, r.bottom)
  }
  const range = document.createRange()
  const walk = document.createTreeWalker(inner, NodeFilter.SHOW_TEXT)
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    if (!n.nodeValue?.trim() || n.parentElement?.closest(SKIP)) continue
    range.selectNodeContents(n)
    for (const r of range.getClientRects()) add(r)
  }
  for (const el of inner.querySelectorAll<HTMLElement | SVGElement>('*')) {
    if (el.closest(SKIP)) continue
    // 그림은 통째로, 그 안의 도형은 보지 않는다 (svg의 네모가 곧 그림의 자리)
    if (el instanceof SVGElement && el.ownerSVGElement) continue
    const r = el.getBoundingClientRect()
    if (el.matches('svg, img, canvas')) add(r)
    else paintRects(el, r).forEach(add)
    if (el instanceof HTMLElement) pseudoRects(el, r, el.offsetWidth ? r.width / el.offsetWidth : 1).forEach(add)
  }
  return Number.isFinite(left) ? { left, top, right, bottom } : null
}

/**
 * 칸이 면을 칠했는지 (면이 곧 부품이라 테두리를 칸 그대로 두른다). 들여 쓰기와 강조는 이제 면도 선도 없이 안쪽 여백만 두어서(looks.css),
 * 바탕 이름으로 칸 그대로 두르던 때는 테두리가 그린 것에서 위아래 60px, 옆 100px 넘게 떠 있었다
 */
const faced = (cell: HTMLElement) => {
  const inner = cell.querySelector<HTMLElement>(':scope > .bk-in')
  return [cell, inner].some((el) => {
    if (!el) return false
    const s = getComputedStyle(el)
    return seen(s.backgroundColor) || s.backgroundImage !== 'none' || (s.boxShadow !== 'none' && !el.classList.contains('bk'))
  })
}

/** 이 부품 장의 칸마다 테두리 자리를 정한다. 편집 화면(.is-live)이 아니면 아무것도 하지 않는다 */
export function frameCells(area: HTMLElement): void {
  if (!area.classList.contains('is-live')) return
  // 모든 칸을 먼저 재고 그다음에 한꺼번에 적는다. 칸마다 재고 적기를 번갈아 하면 적을 때마다(이 값은 칸 안의 이름표가 물려받는다)
  // 다음 칸을 재기 전에 칸 안 전체의 스타일을 다시 계산해서, 글자 하나 칠 때마다 칸 수만큼 되풀이했다. 이 값은 칸 안의 그린 것에
  // 닿지 않아(테두리와 이름표만 쓴다) 잰 값은 같다. 값이 그대로인 칸은 적지 않는다
  const cells = Array.from(area.querySelectorAll<HTMLElement>(':scope > .bk, :scope > .bk-stack > .bk'))
  const frames = cells.map((cell) => {
    const box = cell.getBoundingClientRect()
    const k = cell.offsetWidth ? box.width / cell.offsetWidth : 1
    const ink = !k || faced(cell) ? null : inkBox(cell)
    // 면이 있거나 그린 것이 없으면(빈 이미지 칸 같은) 칸 그대로
    const at = (inside: number) => `${Math.round(inside - FRAME_PAD)}px`
    const t = ink ? Math.max(0, (ink.top - box.top) / k) : 0
    const b = ink ? Math.max(0, (box.bottom - ink.bottom) / k) : 0
    const l = ink ? Math.max(0, (ink.left - box.left) / k) : 0
    const r = ink ? Math.max(0, (box.right - ink.right) / k) : 0
    return [at(t), at(b), at(l), at(r)]
  })
  cells.forEach((cell, i) => {
    ;['--fr-t', '--fr-b', '--fr-l', '--fr-r'].forEach((name, j) => {
      if (cell.style.getPropertyValue(name) !== frames[i][j]) cell.style.setProperty(name, frames[i][j])
    })
  })
}

/** 칸의 테두리가 그려진 네모 (화면 px). 고른 부품 위에 도구를 띄울 때 테두리 바로 위에 두려고 */
export function frameRect(cell: HTMLElement): DOMRect {
  const box = cell.getBoundingClientRect()
  const k = cell.offsetWidth ? box.width / cell.offsetWidth : 1
  // 0px도 값이다: 그린 것이 칸 끝에서 꼭 FRAME_PAD만큼 안쪽이면 0이 되는데, || 로 읽던 때는 빈 값으로 보고 칸 밖 FRAME_PAD에 두었다
  const v = (name: string) => {
    const n = parseFloat(cell.style.getPropertyValue(name))
    return (Number.isFinite(n) ? n : -FRAME_PAD) * k
  }
  const left = box.left + v('--fr-l')
  const top = box.top + v('--fr-t')
  return new DOMRect(left, top, box.right - v('--fr-r') - left, box.bottom - v('--fr-b') - top)
}

/** 연결 기호 둘레에서 손잡이를 비우는 여유 (캔버스 px) */
const LINK_CLEAR = 10

/**
 * 칸 사이 선의 손잡이(.bk-line-grip)를 그 선 위에 선 연결 기호 자리에서 비운다. 연결 기호는 선 위 가운데에 서서, 선에 손을 올리거나
 * 고른 컴포넌트 곁의 옅은 손잡이가 보일 때 파란 막대가 화살표 동그라미를 가로질렀다. 비운 자리 밖의 손잡이로는 그대로 크기를 바꾼다
 * (연결 기호가 선보다 위에 있어 그 자리를 누르면 연결 기호를 고른다). 편집 화면(.is-live)만
 */
export function clearLinks(area: HTMLElement): void {
  if (!area.classList.contains('is-live')) return
  const links = [...area.querySelectorAll<HTMLElement>(':scope > .bk-link:not(.is-preview)')].map((l) => l.getBoundingClientRect())
  for (const grip of area.querySelectorAll<HTMLElement>(':scope > .bk-line > .bk-line-grip')) {
    // 세로 손잡이(옆 칸 사이)는 위아래로, 가로 손잡이(줄 사이)는 옆으로 길다. 길이 쪽은 줄이지 않아 칸과 같은 배율이다
    const tall = grip.parentElement!.classList.contains('is-h')
    const g = grip.getBoundingClientRect()
    const k = tall ? (grip.offsetHeight ? g.height / grip.offsetHeight : 0) : grip.offsetWidth ? g.width / grip.offsetWidth : 0
    const hit = links.find((l) =>
      tall ? l.left < g.right + 2 && g.left - 2 < l.right && l.top < g.bottom && g.top < l.bottom : l.top < g.bottom + 2 && g.top - 2 < l.bottom && l.left < g.right && g.left < l.right,
    )
    if (!hit || !k) {
      grip.style.removeProperty('--cut-a')
      grip.style.removeProperty('--cut-b')
      continue
    }
    const from = tall ? (hit.top - g.top) / k : (hit.left - g.left) / k
    const to = tall ? (hit.bottom - g.top) / k : (hit.right - g.left) / k
    grip.style.setProperty('--cut-a', `${Math.round(from - LINK_CLEAR)}px`)
    grip.style.setProperty('--cut-b', `${Math.round(to + LINK_CLEAR)}px`)
  }
}

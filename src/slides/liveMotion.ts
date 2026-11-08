/**
 * 편집 화면에서 다시 맞춘 자리로 부드럽게: 쓰는 동안 장이 조립되는 모습이 보이게.
 *
 * 글을 쓰면 칸이 한 줄 늘어 아래 항목이 밀리고, 맞추기(fitBlocks.ts)가 글자 단계(--bk-fit), 줄 사이(--fill-air, --bk-air),
 * 칸 안의 자리(--bk-content-shift)를 다시 정한다. 예전에는 그때마다 한 번에 튀어서, 쓰는 동안 장이 깜빡이듯 바뀌었고
 * 무엇이 어디로 갔는지 눈으로 따라가지 못했다. 그래서 바뀌기 직전에 보이던 자리를 재 두고(liveBefore), 다시 맞춘 뒤 옛 자리에서
 * 새 자리로 미끄러지게 한다(liveAfter, FLIP). 글자 단계가 바뀐 글 칸은 옛 크기에서 새 크기로 줄거나 커진다(글 상자째 scale).
 *
 * - 옛 자리는 키가 들어가기 직전(beforeinput: 레이아웃 장은 글이 늘면 그리기 전에 이미 아래 항목이 밀려 있다)이나 그리기 전에 잰다.
 *   움직이는 중이면 움직이는 중의 자리(보이는 그대로)라서, 새로 맞추면 그 자리에서 이어서 미끄러진다.
 * - 새 자리는 움직임을 끝 시각으로 잠깐 옮겨 잰다(liveStill). 맞추기(blockFitter)도 같은 일을 스스로 한다: 움직이는 중의 자리로
 *   재면 글자 단계와 쌓기가 엉뚱하게 나온다.
 * - 끝자리가 그대로인 것은 움직이던 대로 둔다(글자 하나 칠 때마다 처음부터 다시 돌지 않게).
 * - 감싼 것(항목, 본문)과 그 안의 것(글 칸)이 함께 움직이면 안의 것은 감싼 것에 대한 몫만 옮긴다.
 * - 부품 장의 칸(.bk)은 blocks.tsx의 useFlip이 움직인다(빠지는 칸, 새 칸, 끄는 동안 놓일 자리까지). 여기서는 재기만 해서,
 *   칸 안의 것을 칸에 대한 몫만 옮긴다.
 * - 다른 움직임(항목 끌기, 판 옮기기, 모션 미리 보기)이 도는 것과 끄는 동안은 건드리지 않는다. '동작 줄이기'면 움직이지 않는다.
 * 발표 화면과 내보낸 HTML은 쓰지 않는다(편집 화면만 부른다).
 */

/** 다시 맞춘 자리로 옮기는 시간과 곡선(앱의 --ease-out). 부품 칸의 FLIP(blocks.tsx)도 같은 값이다 */
export const LIVE_MS = 300
export const LIVE_EASING = 'cubic-bezier(0.2, 0.8, 0.2, 1)'
/** 이 움직임의 이름(Animation.id). 맞추기(fitBlocks.ts)는 소스째 내보낸 HTML에 들어가 이 파일을 가져오지 못해 같은 글자를 따로 적는다 */
export const LIVE_ID = 'ed-live'

/** 옮겨 보일 것: 본문과 그 줄, 부품의 안쪽과 그 첫 상자, 항목, 이음표, 글 칸, 그림. 부품 칸(.bk)은 재기만 한다 */
const PIECES = '.bk, .bk-in, .bk-in > *, .s-body, .s-body > *, .cs-story, .cs-results, .it, .bk-link, .ed, img, svg'
/** 장의 내용이 아닌 편집 표시와 사라지는 중인 칸 */
const NOT_PIECES = '.ed-halo, .it-remove, .it-grip, .pn-tools, .img-tools, .bk-handle, .bk-leaving, .bk-line, button'
/** 끄거나 크기를 바꾸는 동안(그 일의 움직임이 따로 있다) */
const BUSY = '.is-item-dragging, .is-pane-moving, .is-pane-sizing, .is-block-dragging, .is-block-resizing, .is-row-resizing'

interface Rect {
  x: number
  y: number
  w: number
  h: number
  /** 글 칸의 글자 크기 (px) */
  fs: number
}

interface State {
  /** 바뀌기 직전에 보이던 자리 (화면 px) */
  snap: Map<Element, Rect> | null
  /** 잰 때의 장(장 id와 레이아웃). 다른 장으로 넘어갔으면 움직이지 않는다: 같은 요소를 다른 장의 글에 다시 쓰기도 한다 */
  scope: string
  /** 지난번에 맞춘 끝자리 (화면 px). 그대로면 움직이던 대로 둔다 */
  targets: WeakMap<Element, Rect>
}

const states = new WeakMap<Element, State>()

const quiet = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** root 안의 이 움직임들 */
function liveAnimations(root: Element): Animation[] {
  return typeof root.getAnimations === 'function' ? root.getAnimations({ subtree: true }).filter((a) => a.id === LIVE_ID) : []
}

/**
 * fn을 이 움직임이 다 끝난 모습에서 돌린다(움직임을 끝 시각으로 잠깐 옮겼다가 되돌린다. 보이는 움직임은 그대로).
 * 자리를 재는 일(넘침 알림, 칸 둘레의 테, 부품 테두리)이 움직이는 중의 자리를 끝자리로 알지 않게
 */
export function liveStill<T>(root: Element, fn: () => T): T {
  const runs = liveAnimations(root)
  const times = runs.map((a) => a.currentTime)
  for (const a of runs) {
    const end = a.effect?.getComputedTiming().endTime
    if (typeof end === 'number') a.currentTime = end
  }
  try {
    return fn()
  } finally {
    runs.forEach((a, i) => (a.currentTime = times[i]))
  }
}

/** root 안에서 이 움직임이 도는 중인지 (넘침 알림은 다 움직인 뒤에 본다) */
export function liveMoving(root: Element): boolean {
  return liveAnimations(root).some((a) => a.playState === 'running')
}

function piecesOf(root: Element): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement | SVGSVGElement>(PIECES)).filter(
    (el): el is HTMLElement => !(el.parentElement?.closest('svg')) && !el.closest(NOT_PIECES),
  )
}

function measure(list: Element[]): Map<Element, Rect> {
  const out = new Map<Element, Rect>()
  for (const el of list) {
    const r = el.getBoundingClientRect()
    if (!r.width && !r.height) continue
    out.set(el, { x: r.left, y: r.top, w: r.width, h: r.height, fs: el.classList.contains('ed') ? parseFloat(getComputedStyle(el).fontSize) || 0 : 0 })
  }
  return out
}

/** 편집 화면에서 장을 줄여 그린 배율 (화면 px ÷ 캔버스 px) */
function scaleOf(root: Element): number {
  const slide = root.closest<HTMLElement>('.slide')
  return slide?.offsetWidth ? slide.getBoundingClientRect().width / slide.offsetWidth : 0
}

/**
 * 지금 보이는 자리를 재 둔다. 이미 재 둔 것이 있으면 그대로(키가 들어가기 직전에 잰 것이 그린 뒤에 잰 것보다 앞선다).
 * 쓰이지 않은 채 다음 그리기가 오면 버린다(값이 그대로라 다시 그리지 않은 키)
 */
export function liveBefore(root: Element | null | undefined, scope: string): void {
  if (!root?.isConnected || quiet()) return
  let st = states.get(root)
  if (!st) states.set(root, (st = { snap: null, scope, targets: new WeakMap() }))
  if (st.snap) return
  const snap = measure(piecesOf(root))
  st.snap = snap
  st.scope = scope
  const s = st
  requestAnimationFrame(() => {
    if (s.snap === snap) s.snap = null
  })
}

/** 재 둔 자리에서 본 칸마다의 자리 (캔버스 px, 지금 본문 상자 기준). 부품 칸의 FLIP(useFlip)이 옛 자리로 쓴다. 없으면 undefined */
export function liveFirst(area: HTMLElement, scope: string): Map<string, { x: number; y: number; w: number; h: number }> | undefined {
  const st = states.get(area)
  const snap = st?.scope === scope ? st.snap : null
  const k = scaleOf(area)
  if (!snap || !k) return undefined
  const a = area.getBoundingClientRect()
  const out = new Map<string, { x: number; y: number; w: number; h: number }>()
  // 그 사이 빠진 칸도 (빠진 칸은 옛 자리에서 옅어진다)
  for (const [cell, r] of snap) {
    const id = cell instanceof HTMLElement && cell.classList.contains('bk') ? cell.dataset.block : undefined
    if (id) out.set(id, { x: (r.x - a.left) / k, y: (r.y - a.top) / k, w: r.w / k, h: r.h / k })
  }
  return out
}

/** 이 움직임이 아닌 것이 도는 중인지 (항목 끌기, 판 옮기기 같은. 색이 바뀌는 CSS 전환은 자리에 닿지 않는다) */
function foreign(a: Animation): boolean {
  return a.id !== LIVE_ID && a.playState === 'running' && !(typeof CSSTransition === 'function' && a instanceof CSSTransition)
}

/**
 * 옛 자리에서 새 자리로 옮기는 값: 왼쪽 위 끝이 옛 자리에 오는 translate(캔버스 px)와 크기 배율.
 * 글 칸은 글자 크기가 바뀌었을 때만, 그림은 가로세로가 같은 비율로 바뀌었을 때만 크기를 바꾼다(다르게 늘이면 찌그러져 보인다).
 * 크기는 요소의 transform-origin을 축으로 바뀌므로 그만큼 translate를 고쳐 왼쪽 위 끝이 곧게 미끄러지게 한다
 */
export function liveStep(
  b: Rect,
  f: Rect,
  parent: { dx: number; dy: number },
  k: number,
  origin: [number, number],
): { tx: number; ty: number; s: number } {
  let s = 1
  if (b.fs && f.fs) s = b.fs / f.fs
  else if (!f.fs && f.w && f.h && Math.abs(b.w / f.w - b.h / f.h) < 0.02) s = b.w / f.w
  if (Math.abs(s - 1) < 0.01) s = 1
  const dx = (b.x - f.x - parent.dx) / k
  const dy = (b.y - f.y - parent.dy) / k
  return { tx: dx - origin[0] * (1 - s), ty: dy - origin[1] * (1 - s), s }
}

/**
 * 다시 맞춘 뒤(맞추기가 끝난 layout effect): 재 둔 옛 자리에서 새 자리로 미끄러지게 한다. 재 둔 것이 없거나 그 사이 다른 장으로
 * 넘어갔으면 하지 않는다
 */
export function liveAfter(root: Element | null | undefined, scope: string): void {
  const st = root ? states.get(root) : undefined
  const snap = st?.snap
  if (!root || !st || !snap) return
  st.snap = null
  if (st.scope !== scope || !root.isConnected || quiet() || document.body.matches(BUSY) || root.closest('[data-mo-play]') || root.querySelector('[data-mo-play]')) return
  const k = scaleOf(root)
  if (!k) return
  const list = piecesOf(root)
  const finals = liveStill(root, () => measure(list))
  const set = new Set<Element>(list)
  // 요소마다 도는 움직임 (한 번에 모은다: 요소마다 물으면 그때마다 스타일을 다시 계산한다)
  const anims = new Map<Element, Animation[]>()
  for (const a of root.getAnimations({ subtree: true })) {
    const t = a.effect instanceof KeyframeEffect ? a.effect.target : null
    if (t) anims.set(t, [...(anims.get(t) ?? []), a])
  }
  // 감싼 것이 옮겨 보이는 몫(화면 px). null이면 다른 움직임이 도는 것이라 그 안까지 건너뛴다
  const zero = { dx: 0, dy: 0 }
  const moved = new Map<Element, { dx: number; dy: number } | null>()
  // 먼저 다 읽고 정한 뒤에 한꺼번에 움직임을 건다 (읽기와 쓰기가 번갈아 스타일을 여러 번 다시 계산하지 않게)
  const plays: { el: Element; own: Animation[]; tx: number; ty: number; s: number }[] = []
  for (const el of list) {
    let up = el.parentElement
    while (up && up !== root && !set.has(up)) up = up.parentElement
    const parent = up && up !== root ? (moved.get(up) ?? zero) : zero
    const f = finals.get(el)
    const b = snap.get(el)
    const all = anims.get(el) ?? []
    if (parent === null || all.some(foreign)) {
      moved.set(el, null)
      continue
    }
    // 상자가 없는 것(감싸기만 하는 것)은 감싼 것의 몫을 그대로 물려준다. 새로 생긴 것은 제자리에서
    if (!f) {
      moved.set(el, parent)
      continue
    }
    if (!b) {
      moved.set(el, parent)
      st.targets.set(el, f)
      continue
    }
    const was = st.targets.get(el)
    st.targets.set(el, f)
    // 부품 칸은 useFlip이 움직인다: 보이는 몫만 안의 것에 물려준다
    if (el.classList.contains('bk')) {
      moved.set(el, { dx: b.x - f.x, dy: b.y - f.y })
      continue
    }
    const own = all.filter((a) => a.id === LIVE_ID)
    // 끝자리가 그대로면 움직이던 대로 (보이는 몫은 지금 옛 자리와 끝자리의 차이 그대로)
    if (own.length && was && Math.abs(was.x - f.x) < 0.5 && Math.abs(was.y - f.y) < 0.5 && Math.abs(was.fs - f.fs) < 0.1 && Math.abs(was.w - f.w) < 0.5) {
      moved.set(el, { dx: b.x - f.x, dy: b.y - f.y })
      continue
    }
    const cs = getComputedStyle(el)
    // 글 줄 안의 칸(그림이 아닌 inline)은 옮길 수 없다: 감싼 것과 같이 간다
    if ((cs.display === 'inline' && !(el instanceof SVGSVGElement || el instanceof HTMLImageElement)) || cs.display === 'contents') {
      moved.set(el, parent)
      plays.push({ el, own, tx: 0, ty: 0, s: 1 })
      continue
    }
    const origin = cs.transformOrigin.split(' ').map((v) => parseFloat(v) || 0) as [number, number]
    const step = liveStep(b, f, parent, k, origin)
    moved.set(el, Math.abs(step.tx) < 0.5 && Math.abs(step.ty) < 0.5 && step.s === 1 ? parent : { dx: b.x - f.x, dy: b.y - f.y })
    plays.push({ el, own, ...step })
  }
  for (const { el, own, tx, ty, s } of plays) {
    own.forEach((a) => a.cancel())
    if (Math.abs(tx) < 0.5 && Math.abs(ty) < 0.5 && s === 1) continue
    el.animate(
      [
        { translate: `${tx}px ${ty}px`, scale: String(s) },
        { translate: '0px 0px', scale: '1' },
      ],
      { duration: LIVE_MS, easing: LIVE_EASING, composite: 'add', id: LIVE_ID },
    )
  }
}

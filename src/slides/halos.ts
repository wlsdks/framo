import { useLayoutEffect, type RefObject } from 'react'
import { liveStill } from './liveMotion'

/**
 * 편집할 때 칸마다 두르는 면과 점선(.ed-halo)의 넓이를 칸 사이 틈에 맞춘다.
 * 늘 같은 넓이(위아래, 옆 12px)로 두르면 제목과 설명처럼 바짝 붙은 칸끼리 면이 겹쳐서 어느 칸이 어느 칸인지 알 수 없다.
 * 그래서 이웃한 칸과의 틈을 재서, 틈의 절반에서 조금 뺀 만큼만 두른다 (틈이 넉넉하면 정한 넓이까지).
 */

/** 두르고 싶은 넓이(캔버스 px): 옆은 넉넉히, 위아래는 조금 */
const WANT = { x: 14, y: 10 }
/** 이웃한 두 칸의 면 사이에 남길 틈 */
const KEEP = 6
/**
 * 항목(.it)과 부품 칸(.bk) 밖으로 나가도 되는 넓이. 항목의 구분선 끝보다 면이 한참 삐져나오거나,
 * 부품을 고르면 칸 둘레 14px 밖에 생기는 테두리에 면이 닿지 않게. 0이면 글자가 면 끝에 붙어 답답해서 조금은 둔다
 */
const CELL_OUT = 7
/**
 * 쓰는 칸의 테는 이웃 칸 쪽으로 이만큼(캔버스 px)까지 넓어질 수 있다. 쓰는 동안에는 그 칸의 테 하나만 보여서 이웃의 테와 나눠 가질
 * 틈이 아니라, 이웃 칸의 글에서 KEEP만큼 떨어진 곳까지 쓴다(edit.css의 --ed-ft, -fr, -fb, -fl). 늘 두르는 넓이(WANT)로는 테가 글에
 * 바짝 붙어 쓰는 칸이 좁아 보였다
 */
const FOCUS_MAX = 48
/** 글에 맞춘 테(쓰는 칸, 손을 올린 칸)가 항목과 부품 칸 밖으로 나가도 되는 넓이: 항목 끝에 붙은 글(줄의 이름)에서 테가 1~2px로 붙지 않게 */
const FIT_OUT = 24
/** 빈칸의 테는 적어도 글자 크기의 이만큼 넓게: '80%'처럼 짧은 안내 글의 빈칸이 글자만 한 테로 칸처럼 보이지 않았다 */
const EMPTY_MIN = 3

interface Box {
  el: HTMLElement
  t: number
  r: number
  b: number
  l: number
  /** 두를 넓이: 위, 오른쪽, 아래, 왼쪽 */
  h: [number, number, number, number]
  /** 쓰는 중에 넓힐 수 있는 끝: 위, 오른쪽, 아래, 왼쪽 */
  f: [number, number, number, number]
}

/**
 * 이 안의 편집 칸(.ed)마다 --ed-t, --ed-r, --ed-b, --ed-l을 정한다. 다 정한 칸 상자를 돌려준다 (점검용).
 * 칸과 항목이 다시 맞춘 자리로 미끄러지는 중이면(liveMotion.ts) 끝자리로 잰다: 칸마다 옮겨 보이는 몫이 달라 틈을 잘못 잰다
 */
export function placeHalos(slide: HTMLElement): Box[] {
  return liveStill(slide, () => placeHalosNow(slide))
}

function placeHalosNow(slide: HTMLElement): Box[] {
  const s = slide.getBoundingClientRect()
  // 편집 화면은 장을 줄여 그린다. 캔버스 px로 바꿔 잰다
  const k = slide.offsetWidth ? s.width / slide.offsetWidth : 1
  if (!k) return []
  const boxes: Box[] = []
  for (const el of slide.querySelectorAll<HTMLElement>('.ed')) {
    const q = el.getBoundingClientRect()
    if (!q.width && !q.height) continue
    const box: Box = {
      el,
      t: (q.top - s.top) / k,
      r: (q.right - s.left) / k,
      b: (q.bottom - s.top) / k,
      l: (q.left - s.left) / k,
      h: [WANT.y, WANT.x, WANT.y, WANT.x],
      f: [FOCUS_MAX, FOCUS_MAX, FOCUS_MAX, FOCUS_MAX],
    }
    // 장 끝 밖으로는 넓히지 않는다
    box.f = [Math.min(FOCUS_MAX, box.t), Math.min(FOCUS_MAX, slide.offsetWidth - box.r), Math.min(FOCUS_MAX, slide.offsetHeight - box.b), Math.min(FOCUS_MAX, box.l)]
    for (const wrap of [el.parentElement?.closest('.it'), el.closest('.bk')]) {
      const c = wrap?.getBoundingClientRect()
      if (!c) continue
      const room = (d: number, out = CELL_OUT) => Math.max(0, d / k + out)
      const cell = [room(q.top - c.top), room(c.right - q.right), room(c.bottom - q.bottom), room(q.left - c.left)]
      box.h = box.h.map((v, i) => Math.min(v, cell[i])) as Box['h']
      // 글에 맞춘 테는 칸 상자보다 작아서 항목 끝 밖으로 조금 더 나가도 된다
      const focus = [room(q.top - c.top, FIT_OUT), room(c.right - q.right, FIT_OUT), room(c.bottom - q.bottom, FIT_OUT), room(q.left - c.left, FIT_OUT)]
      box.f = box.f.map((v, i) => Math.min(v, focus[i])) as Box['f']
    }
    boxes.push(box)
  }
  const room = (gap: number) => Math.max(0, (gap - KEEP) / 2)
  // 쓰는 칸 하나만 넓힐 때는 틈을 나누지 않는다
  const reach = (gap: number) => Math.max(0, gap - KEEP)
  for (let i = 0; i < boxes.length; i++) {
    const a = boxes[i]
    for (let j = i + 1; j < boxes.length; j++) {
      const b = boxes[j]
      // 가로 틈과 세로 틈 (겹치면 음수)
      const gx = Math.max(b.l - a.r, a.l - b.r)
      const gy = Math.max(b.t - a.b, a.t - b.b)
      // 쓰는 중에 넓혀도 닿지 않는 칸은 건너뛴다
      if (gx >= FOCUS_MAX + KEEP || gy >= FOCUS_MAX + KEEP) continue
      // 면을 다 둘러도 닿지 않는 칸이면 늘 두르는 넓이는 그대로
      const near = gx < WANT.x * 2 + KEEP && gy < WANT.y * 2 + KEEP
      // 나란히 있으면 옆을, 위아래로 있으면 위아래를 줄인다. 비스듬히 있으면 틈이 넓은 쪽을 (덜 줄여도 된다).
      // 칸끼리 조금 겹치면(줄여 그린 글자의 반올림 같은) 덜 겹친 쪽을 0으로
      const side = gx < 0 && gy < 0 ? gx >= gy : gy < 0 || (gx >= 0 && gx >= gy)
      if (side) {
        const left = a.l + a.r <= b.l + b.r ? [a, b] : [b, a]
        if (near) {
          left[0].h[1] = Math.min(left[0].h[1], room(gx))
          left[1].h[3] = Math.min(left[1].h[3], room(gx))
        }
        left[0].f[1] = Math.min(left[0].f[1], reach(gx))
        left[1].f[3] = Math.min(left[1].f[3], reach(gx))
      } else {
        const top = a.t + a.b <= b.t + b.b ? [a, b] : [b, a]
        if (near) {
          top[0].h[2] = Math.min(top[0].h[2], room(gy))
          top[1].h[0] = Math.min(top[1].h[0], room(gy))
        }
        top[0].f[2] = Math.min(top[0].f[2], reach(gy))
        top[1].f[0] = Math.min(top[1].f[0], reach(gy))
      }
    }
  }
  for (const box of boxes) {
    const st = box.el.style
    const put = (name: string, v: number) => {
      const px = `${Math.floor(v)}px`
      if (st.getPropertyValue(name) !== px) st.setProperty(name, px)
    }
    ;(['t', 'r', 'b', 'l'] as const).forEach((side, i) => {
      put(`--ed-${side}`, box.h[i])
      // 쓰는 중의 끝은 늘 두르는 넓이보다 좁아지지 않는다
      put(`--ed-f${side}`, Math.max(box.h[i], box.f[i]))
    })
  }
  return boxes
}

/**
 * 칸 상자 안에서 그려진 글(빈칸은 안내 글)이 차지한 네모: 칸 상자 끝에서 안쪽으로 든 거리(캔버스 px, 글이 상자 밖으로 나오면 음수).
 * 왼쪽, 오른쪽, 위, 아래. 쓰는 칸의 테를 칸 상자가 아니라 글에 맞추려고(edit.css): 제목 칸은 칸이 장 너비만큼 넓어서 테가 글 오른쪽으로
 * 한참 빈 채 장 끝까지 늘어났다. 위아래는 줄 상자가 아니라 그려지는 글자 모양으로: 줄 높이가 글자보다 낮은 큰 숫자는 글자가 칸 상자
 * 위아래로 나와서 상자에 맞춘 테가 '억', '원'을 가로질렀다. 읽기만 한다(쓰기는 writeGlyph)
 */
function readGlyph(ed: HTMLElement): number[] | null {
  const slide = ed.closest<HTMLElement>('.slide')
  if (!slide?.offsetWidth) return null
  const k = slide.getBoundingClientRect().width / slide.offsetWidth
  const input = ed.querySelector(':scope > .ed-input')
  const text = input?.textContent ? input : ed.querySelector(':scope > .ed-hint')
  if (!k || !text?.textContent?.trim()) return null
  const r = document.createRange()
  r.selectNodeContents(text)
  const lines = [...r.getClientRects()].filter((x) => x.width > 0.5 && x.height)
  if (!lines.length) return null
  const q = ed.getBoundingClientRect()
  const ink = inkOf(text)
  let left = Infinity
  let right = -Infinity
  let top = Infinity
  let bottom = -Infinity
  for (const x of lines) {
    left = Math.min(left, x.left)
    right = Math.max(right, x.right)
    top = Math.min(top, x.top)
    bottom = Math.max(bottom, x.bottom)
  }
  // 테(.ed-halo)는 칸의 안쪽 여백 상자에 대어 놓으므로 테두리 두께만큼 빼고 잰다(한 문장 장의 부제는 위에 선이 있다)
  const bx = ed.clientWidth ? [ed.clientLeft, ed.offsetWidth - ed.clientLeft - ed.clientWidth, ed.clientTop, ed.offsetHeight - ed.clientTop - ed.clientHeight] : [0, 0, 0, 0]
  const v = [(left - q.left) / k - bx[0], (q.right - right) / k - bx[1], (top - q.top) / k + ink.top - bx[2], (q.bottom - bottom) / k + ink.bottom - bx[3]]
  // 빈칸은 안내 글이 짧아도 칸으로 보이게 적어도 EMPTY_MIN em 넓게. 글이 선 쪽(text-align)을 두고 반대쪽으로, 칸 상자 안에서만 넓힌다
  if (text !== input) {
    const cs = getComputedStyle(text)
    const lack = EMPTY_MIN * (Number.parseFloat(cs.fontSize) || 0) - (right - left) / k
    if (lack > 0) {
      const align = cs.textAlign
      const share = align === 'center' ? [0.5, 0.5] : align === 'right' || align === 'end' ? [1, 0] : [0, 1]
      v[0] = Math.max(Math.min(v[0], 0), v[0] - lack * share[0])
      v[1] = Math.max(Math.min(v[1], 0), v[1] - lack * share[1])
    }
  }
  return v
}

const GLYPH_VARS = ['--ed-gx0', '--ed-gx1', '--ed-gy0', '--ed-gy1'] as const

/** readGlyph로 잰 네모를 --ed-gx0, --ed-gx1, --ed-gy0, --ed-gy1에. 값이 같으면 건드리지 않는다(스타일을 다시 계산하지 않게) */
function writeGlyph(ed: HTMLElement, v: number[] | null) {
  const st = ed.style
  GLYPH_VARS.forEach((name, i) => {
    const want = v ? `${Math.round(v[i] * 10) / 10}px` : ''
    if (st.getPropertyValue(name) === want) return
    if (want) st.setProperty(name, want)
    else st.removeProperty(name)
  })
}

/**
 * 글 네모는 테가 보이는 칸(손을 올린 칸, 쓰는 칸)만, 다음 그리기 직전(rAF) 한 번에 잰다: 바뀐 칸을 모아 다 읽은 뒤에
 * 다 쓴다(읽기와 쓰기가 번갈아 레이아웃을 여러 번 하지 않게). 장의 모든 칸을 그릴 때마다 재지 않는다
 */
const glyphQueue = new Set<HTMLElement>()
let glyphRaf = 0
function refitGlyph(ed: HTMLElement) {
  glyphQueue.add(ed)
  if (glyphRaf) return
  glyphRaf = requestAnimationFrame(() => {
    glyphRaf = 0
    const eds = [...glyphQueue].filter((e) => e.isConnected)
    glyphQueue.clear()
    // 글 칸이 옛 크기에서 줄거나 커지는 중이면(liveMotion.ts) 끝 모습으로 잰다
    const vs = eds.map((e) => liveStill(e.closest('.slide') ?? e, () => readGlyph(e)))
    eds.forEach((e, i) => writeGlyph(e, vs[i]))
  })
}

let pen: CanvasRenderingContext2D | null | undefined
/** 줄 상자의 위아래 끝에서 그려지는 글자까지의 빈 키(캔버스 px) */
function inkOf(el: Element): { top: number; bottom: number } {
  pen ??= document.createElement('canvas').getContext('2d')
  if (!pen) return { top: 0, bottom: 0 }
  const cs = getComputedStyle(el)
  pen.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
  const m = pen.measureText(el.textContent ?? '')
  return {
    top: Math.max(0, m.fontBoundingBoxAscent - m.actualBoundingBoxAscent),
    bottom: Math.max(0, m.fontBoundingBoxDescent - m.actualBoundingBoxDescent),
  }
}

/**
 * 편집하는 장의 칸 면을 그릴 때마다 맞춘다. 글을 쓰면 칸이 커지고, 부품을 옮기면 칸이 움직이고,
 * 글꼴이 늦게 오면 글 폭이 바뀌어서, 그리고 나서와 움직임이 끝날 즈음에 한 번 더 잰다
 */
export function useHalos(ref: RefObject<HTMLElement | null>, on: boolean) {
  useLayoutEffect(() => {
    const el = ref.current
    if (!on || !el) return
    placeHalos(el)
    const later = setTimeout(() => placeHalos(el), 700)
    let alive = true
    if (document.fonts?.status === 'loading') document.fonts.ready.then(() => alive && placeHalos(el))
    const ro = new ResizeObserver(() => placeHalos(el))
    ro.observe(el)
    // 테가 보이는 칸만 글 네모를 잰다: 손을 올린 칸, 쓰기 시작한 칸, 쓰는 동안 글 폭이 바뀐 칸(칸 상자는 그대로라
    // ResizeObserver가 못 본다). 장이 다시 그려지면 쓰는 칸 하나만
    const fit = (e: Event) => {
      const ed = (e.target as Element | null)?.closest?.<HTMLElement>('.ed')
      if (ed && el.contains(ed)) refitGlyph(ed)
    }
    const off = new AbortController()
    for (const type of ['pointerover', 'focusin', 'input']) el.addEventListener(type, fit, { signal: off.signal })
    const a = document.activeElement?.closest?.<HTMLElement>('.ed')
    if (a && el.contains(a)) refitGlyph(a)
    return () => {
      alive = false
      clearTimeout(later)
      ro.disconnect()
      off.abort()
    }
  })
}

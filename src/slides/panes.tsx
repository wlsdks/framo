import { useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { flushSync } from 'react-dom'
import { LAYOUTS, PANE_UNIT, sideOf, variantOf } from '../deck/layouts'
import type { Slide } from '../deck/types'
import { cx } from '../lib/cx'
import { gestureKey } from '../lib/pointerSession'
import { useSlide } from './context'

/**
 * 두 판으로 나뉜 장(표지, 사례, 이미지와 설명, 결정 요청)의 편집 도구. 편집할 때만 장 위에 겹쳐 그린다.
 *
 * - 옆 판 왼쪽 위의 이름표를 끌면 판이 손을 따라오고, 장의 반을 넘으면 반대쪽으로 옮겨 앉는다(options.flip).
 *   표지는 아래쪽으로 끌면 아래 띠 모양이 되고, 위로 끌면 옆으로 돌아온다.
 * - 두 판 사이를 끌면 너비가 정해진 단계(options.pane)에 붙는다. 두 번 누르면 기본 너비로.
 *
 * 사람은 상자를 아무 데나 놓지 않는다: 놓을 수 있는 자리와 너비는 레이아웃이 정해 두었고, 끄는 동안 바로 그 모습으로
 * 바뀌어 보인다(되돌리기는 끈 한 번이 한 단계). 글자 크기와 여백은 레이아웃이 알아서 맞춘다.
 */

export type Zone = 'start' | 'end' | 'below'

interface Box {
  x: number
  y: number
  w: number
  h: number
}

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches
const SETTLE =
  'linear(0, 0.0861, 0.2602, 0.4453, 0.6081, 0.7349, 0.8271, 0.8923, 0.9373, 0.9673, 0.9862, 0.9973, 1.0029, 1.005, 1.0049, 1.0036, 1.002, 1.0007, 1)'

/**
 * 끌기 시작한 손잡이로 초점을 옮긴다. 글이 골라지지 않게 누르기의 기본 동작을 막으면 초점이 쓰던 칸에 남아,
 * 판을 옮기거나 너비를 바꾼 뒤 누른 Ctrl+Z가 칸으로 가서 아무것도 되돌리지 않았다 (제목 자리 옮기기, 항목 이름표와 같다).
 * 도구 막대의 이름에서 넘겨받은 손짓(isTrusted가 아님)은 막대가 이미 초점을 옮겼다
 */
function holdFocus(e: ReactPointerEvent<HTMLElement>) {
  if (e.nativeEvent.isTrusted) e.currentTarget.focus({ preventScroll: true })
}

/** 너비 단계의 이름: 기본 너비에서 몇 단계 떨어졌는지 */
export function sideName(n: number, base: number): string {
  const d = n - base
  return d <= -2 ? '아주 좁게' : d === -1 ? '좁게' : d === 0 ? '보통' : d === 1 ? '넓게' : '아주 넓게'
}

/** 옆 판이 지금 장의 어느 쪽에 있는지 */
export function zoneOf(slide: Slide): Zone {
  const spec = LAYOUTS[slide.layout].panes!
  if (spec.below && variantOf(slide) === spec.below) return 'below'
  return sideZone(slide)
}

/** 옆 판이 서는 쪽. 아래 띠로 깔아 둔 동안에도 좌우(options.flip)는 남아서, 옆으로 세우면 깔기 전의 쪽으로 돌아간다 */
export function sideZone(slide: Slide): 'start' | 'end' {
  const spec = LAYOUTS[slide.layout].panes!
  const flip = !!slide.options.flip
  return spec.start ? (flip ? 'end' : 'start') : flip ? 'start' : 'end'
}

/** 판의 자리를 이 쪽으로 바꾸는 값 (모양과 좌우) */
export function placeFor(slide: Slide, zone: Zone): { variant?: string; flip: boolean } {
  const spec = LAYOUTS[slide.layout].panes!
  const variants = LAYOUTS[slide.layout].variants ?? []
  if (zone === 'below') return { variant: spec.below, flip: !!slide.options.flip }
  const flip = spec.start ? zone === 'end' : zone === 'start'
  // 아래 띠에서 옆으로 돌아오면 첫째 모양(옆에 놓는 모양)
  const back = spec.below && variantOf(slide) === spec.below ? (spec.variants?.[0] ?? variants[0]?.id) : undefined
  return { variant: back, flip }
}

export function PaneTools() {
  const { slide, mode, actions } = useSlide()
  const ref = useRef<HTMLDivElement>(null)
  const slideRef = useRef(slide)
  slideRef.current = slide
  const [box, setBox] = useState<Box | null>(null)
  const [hover, setHover] = useState(false)
  const [busy, setBusy] = useState<'move' | 'size' | null>(null)
  const spec = LAYOUTS[slide.layout].panes
  const zone = spec ? zoneOf(slide) : 'end'
  const side = sideOf(slide)
  const setOptions = actions?.setOptions
  const setVariant = actions?.setVariant

  // 판의 자리를 잰다: 그릴 때마다, 그리고 판의 크기가 바뀔 때(너비가 단계 사이를 오가는 동안)
  useLayoutEffect(() => {
    const el = ref.current
    const slideEl = el?.closest<HTMLElement>('.slide')
    const pane = spec && slideEl?.querySelector<HTMLElement>(spec.el)
    if (!slideEl || !pane) {
      setBox(null)
      return
    }
    const measure = () => {
      const s = slideEl.getBoundingClientRect()
      const k = slideEl.offsetWidth ? s.width / slideEl.offsetWidth : 1
      const r = pane.getBoundingClientRect()
      const next = { x: (r.left - s.left) / k, y: (r.top - s.top) / k, w: r.width / k, h: r.height / k }
      setBox((b) => (b && Math.abs(b.x - next.x) < 0.5 && Math.abs(b.y - next.y) < 0.5 && Math.abs(b.w - next.w) < 0.5 && Math.abs(b.h - next.h) < 0.5 ? b : next))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(pane)
    // 판 위에 손이 있는지 (도구는 손을 막지 않게 겹쳐 그려서 :hover로 알 수 없다)
    const onMove = (e: PointerEvent) => {
      const r = pane.getBoundingClientRect()
      setHover(e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom)
    }
    const onLeave = () => setHover(false)
    slideEl.addEventListener('pointermove', onMove)
    slideEl.addEventListener('pointerleave', onLeave)
    return () => {
      ro.disconnect()
      slideEl.removeEventListener('pointermove', onMove)
      slideEl.removeEventListener('pointerleave', onLeave)
    }
  })

  const below = zone === 'below'
  // 판을 옮길 수 있는 모양에서만 (표지의 색 면은 판이 장 전체라 옮길 데가 없다)
  if (mode !== 'edit' || !spec || !setOptions || (side === null && !below)) return null
  // 판을 재기 전: 재려면 장 안에 붙어 있어야 해서 빈 상자만 둔다
  if (!box) return <div ref={ref} className="pn-tools" hidden />
  // 판 사이: 판이 오른쪽에 있으면 판의 왼쪽 끝, 왼쪽에 있으면 오른쪽 끝
  const right = box.x + box.w / 2 > 960

  /** 끄는 동안 바뀌는 장의 요소들: 옛 자리에서 새 자리로 미끄러지게 */
  const flipParts = (slideEl: HTMLElement, except: HTMLElement) =>
    [...slideEl.querySelectorAll<HTMLElement>(':scope > :not(.pn-tools), :scope > .ix > *')].filter((x) => x !== except && !x.contains(except))

  const apply = (to: Zone, key: string) => {
    const s = slideRef.current
    const p = placeFor(s, to)
    flushSync(() => {
      if (p.variant !== undefined && p.variant !== variantOf(s)) setVariant?.(p.variant, key)
      if (p.flip !== !!s.options.flip) setOptions({ flip: p.flip || undefined }, key)
    })
  }

  const startMove = (e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    holdFocus(e)
    const slideEl = ref.current?.closest<HTMLElement>('.slide')
    const pane = slideEl?.querySelector<HTMLElement>(spec.el)
    if (!slideEl || !pane) return
    // 한 번 끄는 동안은 되돌리기 한 단계 (손을 멈췄다 움직여도). 처음 자리로 돌아오면 단계를 남기지 않는다
    const key = gestureKey('pane.move')
    const first = zoneOf(slideRef.current)
    let cur = first
    const sr = slideEl.getBoundingClientRect()
    const k = slideEl.offsetWidth ? sr.width / slideEl.offsetWidth : 1
    const pr = pane.getBoundingClientRect()
    // 잡은 자리 (판 안의 비율). 판의 꼴이 바뀌어도(옆 ↔ 아래 띠) 손 아래의 같은 쪽을 잡고 있게
    const grab = { x: (e.clientX - pr.left) / pr.width, y: (e.clientY - pr.top) / pr.height }
    let tx = 0
    let ty = 0
    let pointer = { x: e.clientX, y: e.clientY }
    setBusy('move')
    pane.classList.add('pn-lifted')
    document.body.classList.add('is-pane-moving')

    const follow = () => {
      const r = pane.getBoundingClientRect()
      const lx = r.left - tx * k
      const ly = r.top - ty * k
      tx = (pointer.x - grab.x * r.width - lx) / k
      ty = (pointer.y - grab.y * r.height - ly) / k
      // 판은 장 밖으로 나가지 않는다
      const w = r.width / k
      const h = r.height / k
      const bx = (lx - sr.left) / k
      const by = (ly - sr.top) / k
      tx = Math.max(-bx, Math.min(1920 - w - bx, tx))
      ty = Math.max(-by, Math.min(1080 - h - by, ty))
      pane.style.translate = `${tx}px ${ty}px`
    }
    const zoneAt = (x: number, y: number): Zone => {
      const lx = (x - sr.left) / k
      const ly = (y - sr.top) / k
      if (spec.below && ly > 1080 * 0.72) return 'below'
      return lx < 960 ? 'start' : 'end'
    }
    const go = (to: Zone) => {
      if (to === cur) return
      const parts = flipParts(slideEl, pane)
      const before = new Map(parts.map((x) => [x, x.getBoundingClientRect()]))
      apply(to, key)
      cur = to
      follow()
      if (reduced()) return
      for (const x of parts) {
        const a = before.get(x)
        if (!a || !x.isConnected) continue
        const b = x.getBoundingClientRect()
        const dx = (a.left - b.left) / k
        const dy = (a.top - b.top) / k
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue
        x.getAnimations().forEach((an) => an.cancel())
        x.animate([{ transform: `translate(${dx}px, ${dy}px)`, opacity: 0.55 }, { transform: 'none', opacity: 1 }], { duration: 280, easing: 'cubic-bezier(0.2, 0, 0, 1)' })
      }
    }
    const onMove = (ev: PointerEvent) => {
      pointer = { x: ev.clientX, y: ev.clientY }
      follow()
      go(zoneAt(ev.clientX, ev.clientY))
    }
    const end = (cancel: boolean) => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('keydown', onKey, true)
      if (cancel) go(first)
      document.body.classList.remove('is-pane-moving')
      setBusy(null)
      const done = () => pane.classList.remove('pn-lifted')
      if (reduced() || (Math.abs(tx) < 1 && Math.abs(ty) < 1)) {
        pane.style.translate = ''
        done()
        return
      }
      const a = pane.animate([{ translate: `${tx}px ${ty}px` }, { translate: '0px 0px' }], { duration: 360, easing: SETTLE })
      pane.style.translate = ''
      a.finished.then(done, done)
    }
    const onUp = () => end(false)
    const onCancel = () => end(true)
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape') return
      ev.preventDefault()
      ev.stopPropagation()
      end(true)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('keydown', onKey, true)
  }

  const sizeTo = (n: number, key?: string) => {
    const s = slideRef.current
    if (n === sideOf(s)) return
    setOptions({ pane: n === spec.base ? undefined : n }, key)
  }

  const startSize = (e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    holdFocus(e)
    const slideEl = ref.current?.closest<HTMLElement>('.slide')
    if (!slideEl) return
    // 한 번 끄는 동안은 되돌리기 한 단계. Esc는 처음 너비로 (같은 손짓이라 단계를 남기지 않는다)
    const key = gestureKey('pane.side')
    const first = sideOf(slideRef.current)
    const sr = slideEl.getBoundingClientRect()
    const k = slideEl.offsetWidth ? sr.width / slideEl.offsetWidth : 1
    // 판 바깥쪽 끝(장의 가장자리)에서 손까지가 판의 너비. 판이 장 가장자리에서 떨어져 있으면(결정 요청 장) 그만큼 뺀다
    const gap = right ? 1920 - (box.x + box.w) : box.x
    setBusy('size')
    document.body.classList.add('is-pane-sizing')
    const onMove = (ev: PointerEvent) => {
      const lx = (ev.clientX - sr.left) / k
      const w = (right ? 1920 - lx : lx) - gap
      const n = spec.sides.reduce((a, b) => (Math.abs(b * PANE_UNIT - w) < Math.abs(a * PANE_UNIT - w) ? b : a))
      sizeTo(n, key)
    }
    const end = (cancel: boolean) => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('keydown', onKey, true)
      if (cancel && first !== null) sizeTo(first, key)
      document.body.classList.remove('is-pane-sizing')
      setBusy(null)
    }
    const onUp = () => end(false)
    const onCancel = () => end(true)
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape') return
      ev.preventDefault()
      ev.stopPropagation()
      end(true)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('keydown', onKey, true)
  }

  const onHandleKey = (e: ReactKeyboardEvent) => {
    const to: Zone | null = e.key === 'ArrowLeft' ? 'start' : e.key === 'ArrowRight' ? 'end' : e.key === 'ArrowDown' && spec.below ? 'below' : e.key === 'ArrowUp' && below ? (right ? 'end' : 'start') : null
    if (!to || to === zone) return
    e.preventDefault()
    apply(to, `pane.key.${Date.now()}`)
  }
  const onEdgeKey = (e: ReactKeyboardEvent) => {
    if (side === null || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return
    e.preventDefault()
    // 왼쪽 화살표는 판 사이를 왼쪽으로: 오른쪽 판은 넓어지고 왼쪽 판은 좁아진다
    const grow = (e.key === 'ArrowLeft') === right
    const i = spec.sides.indexOf(side) + (grow ? 1 : -1)
    if (i >= 0 && i < spec.sides.length) sizeTo(spec.sides[i])
  }

  const canSize = !below && side !== null
  return (
    <div
      ref={ref}
      className={cx('pn-tools', (hover || busy) && 'is-on', busy && `is-${busy}`)}
      style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
    >
      <button
        type="button"
        className="pn-handle"
        title={below ? '끌어서 옆으로 옮겨요' : spec.below ? '끌어서 반대쪽이나 아래로 옮겨요' : '끌어서 반대쪽으로 옮겨요'}
        aria-label={`${spec.name} 옮기기. 화살표 키로도 옮겨요`}
        onPointerDown={startMove}
        onKeyDown={onHandleKey}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01" />
        </svg>
        {spec.name}
      </button>
      {canSize && (
        <div
          className={cx('pn-edge', right ? 'is-start' : 'is-end')}
          role="separator"
          aria-orientation="vertical"
          aria-label={`${spec.name} 너비: ${sideName(side, spec.base)}. 화살표 키로 바꿔요`}
          aria-valuenow={side}
          aria-valuemin={spec.sides[0]}
          aria-valuemax={spec.sides[spec.sides.length - 1]}
          tabIndex={0}
          title="끌어서 너비 바꾸기 (더블클릭하면 처음 너비)"
          onPointerDown={startSize}
          onDoubleClick={() => sizeTo(spec.base)}
          onKeyDown={onEdgeKey}
        >
          <span className="pn-edge-grip" />
          {busy === 'size' && <span className="pn-edge-tip">{sideName(side, spec.base)}</span>}
        </div>
      )}
      {/* 너비를 고르는 동안: 붙을 수 있는 자리를 옅은 선으로 */}
      {busy === 'size' &&
        spec.sides.map((n) => (
          // 판의 바깥쪽 끝은 그대로이고 안쪽 끝만 움직인다
          <span key={n} className={cx('pn-guide', n === side && 'is-on')} style={{ left: right ? box.w - n * PANE_UNIT : n * PANE_UNIT }} aria-hidden="true" />
        ))}
    </div>
  )
}

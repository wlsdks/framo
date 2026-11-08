import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { cx } from '../lib/cx'
import { keys } from '../lib/keys'
import { LIST_DRAGGING } from '../lib/listDrag'
import { undoLast, useDeck } from '../store/deckStore'

/**
 * 앱 이름 Framo(frame: 화면의 틀, 영화의 한 컷). 표시는 카메라 뷰파인더의 네 귀퉁이와 그 안의 줄 하나.
 * 가운데 줄만 강조색: 틀 안에 제자리를 잡은 답 하나, 장마다 답 하나에만 강조색을 쓰는 것처럼
 */
function BrandMark({ className }: { className?: string }) {
  return (
    <svg className={cx('brand-mark', className)} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="1" y="1" width="22" height="22" rx="6.5" fill="#191c22" />
      <path d="M6 9.5v-2A1.5 1.5 0 0 1 7.5 6h2M14.5 6h2A1.5 1.5 0 0 1 18 7.5v2M18 14.5v2a1.5 1.5 0 0 1-1.5 1.5h-2M9.5 18h-2A1.5 1.5 0 0 1 6 16.5v-2" stroke="#fff" />
      <path d="M9.5 12h5" stroke="#5b86ff" />
    </svg>
  )
}

export function Brand() {
  return (
    <a className="brand" href="#/" aria-label="Framo 처음 화면">
      <BrandMark />
      <span className="brand-name">Framo</span>
    </a>
  )
}

export function Icon({ d, className }: { d: string; className?: string }) {
  return (
    <svg className={cx('icon', className)} viewBox="0 0 24 24" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}

export const ChevronIcon = () => <Icon className="icon-chevron" d="M9 6l6 6-6 6" />
export const BackIcon = () => <Icon d="M15 6l-6 6 6 6" />
export const PlusIcon = () => <Icon d="M12 5v14M5 12h14" />
export const PlayIcon = () => <Icon className="icon-fill" d="M8 5.5v13l10-6.5z" />
export const UndoIcon = () => <Icon d="M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3" />
export const RedoIcon = () => <Icon d="M15 14l5-5-5-5M20 9H10a6 6 0 000 12h3" />
export const CopyIcon = () => <Icon d="M9 9h10v10H9zM5 15V5h10" />
export const BookmarkIcon = () => <Icon d="M7 4h10v16l-5-3.8L7 20z" />
export const ShapesIcon = () => <Icon d="M4 4h7v7H4zM13 13h7v7h-7zM16.5 4a3.5 3.5 0 110 7 3.5 3.5 0 010-7zM4 20l3.5-6 3.5 6z" />
export const TrashIcon = () => <Icon d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
export const EyeOffIcon = () => <Icon d="M3 3l18 18M10.6 6.1A9.8 9.8 0 0112 6c5 0 9 6 9 6a17 17 0 01-3.2 3.7M6.2 7.6A17 17 0 003 12s4 6 9 6a9 9 0 004.1-1M9.9 9.9a3 3 0 004.2 4.2" />
export const ScreenIcon = () => <Icon d="M3.5 5h17v11.5h-17zM8.5 20h7M12 16.5V20" />
export const EyeIcon = () => <Icon d="M3 12s4-6 9-6 9 6 9 6-4 6-9 6-9-6-9-6zM12 15a3 3 0 100-6 3 3 0 000 6z" />
export const MoreIcon = () => <Icon className="icon-fill" d="M5 10.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zm7 0a1.5 1.5 0 110 3 1.5 1.5 0 010-3zm7 0a1.5 1.5 0 110 3 1.5 1.5 0 010-3z" />
export const DownloadIcon = () => <Icon d="M12 4v11M7 10l5 5 5-5M5 20h14" />
export const UploadIcon = () => <Icon d="M12 20V9M7 14l5-5 5 5M5 4h14" />
export const CheckIcon = () => <Icon d="M5 12.5l4.5 4.5L19 7.5" />
export const HistoryIcon = () => <Icon d="M4 12a8 8 0 102.3-5.6L4 8.7M4 4v4.7h4.7M12 8v4.5l3 2" />
export const FolderIcon = () => <Icon d="M3 7.5A1.5 1.5 0 014.5 6H9l2 2.2h8.5A1.5 1.5 0 0121 9.7v8.8a1.5 1.5 0 01-1.5 1.5h-15A1.5 1.5 0 013 18.5z" />
export const AlertIcon = () => <Icon d="M12 4l9 16H3zM12 10v4.5M12 17.2v.3" />
export const CloseIcon = () => <Icon d="M6 6l12 12M18 6L6 18" />
export const LockIcon = () => <Icon d="M6.5 11h11v9h-11zM8.5 11V8a3.5 3.5 0 017 0v3" />
export const BlocksIcon = () => <Icon d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM16.5 13v7M13 16.5h7" />
export const GripIcon = () => <Icon className="icon-fill" d="M9 5.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zm6 0a1.5 1.5 0 110 3 1.5 1.5 0 010-3zm-6 5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zm6 0a1.5 1.5 0 110 3 1.5 1.5 0 010-3zm-6 5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zm6 0a1.5 1.5 0 110 3 1.5 1.5 0 010-3z" />
export const MotionIcon = () => <Icon d="M3.5 8h6M2.5 12h8M3.5 16h6M14 6.5l5.5 5.5-5.5 5.5" />
const InfoIcon = () => <Icon d="M12 21a9 9 0 100-18 9 9 0 000 18zM12 11v5.5M12 7.6v.4" />
export const SlidersIcon = () => <Icon d="M4 7h16M4 17h16M9 4.5v5M15 14.5v5" />
/**
 * AI에게 부탁하는 단추의 그림: 말풍선 안에 Framo 표시의 가운데 줄 하나. AI가 하는 일은 '바꾸자고 말하는 것'이고 고치는 것은 사람이라 말풍선이다.
 * 예전의 반짝이 그림은 흔한 AI 제품의 표시라 보고 도구의 조용한 위 막대에서 혼자 들떠 보였다
 */
export const AskIcon = () => <Icon d="M5 5h14a1.5 1.5 0 011.5 1.5v8.5a1.5 1.5 0 01-1.5 1.5h-7.5L7 20v-3.5H5a1.5 1.5 0 01-1.5-1.5V6.5A1.5 1.5 0 015 5zM9 11h6" />

/**
 * (i) 단추: 늘 펼쳐 둘 필요 없는 안내를 접어 둔다. 마우스를 올리거나 눌러서(키보드로 옮겨 와도) 보인다.
 * 말풍선은 단추 밑에 붙는다. align: 단추의 어느 쪽 끝에 말풍선 끝을 맞출지 (칸 오른쪽 끝의 단추는 end)
 */
/** 말풍선과 단추 사이, 창 가장자리와의 틈 */
const INFO_GAP = 6
const INFO_EDGE = 8

/**
 * (i) 단추와 그 설명. 설명은 body에 붙여 창 기준(fixed)으로 띄운다: 메뉴나 오른쪽 칸 안에 두면 그 상자의
 * overflow에 갇혀, 메뉴 아래 끝의 설명이 잘렸다.
 * 아래에 자리가 없으면 위로 뒤집고, 좌우는 창 안에 들게 민다. align은 단추의 어느 쪽 끝에 맞출지(end: 오른쪽).
 */
export function Info({ label, children, align = 'end' }: { label: string; children: ReactNode; align?: 'start' | 'end' }) {
  const id = useId()
  const btn = useRef<HTMLButtonElement>(null)
  const tip = useRef<HTMLSpanElement>(null)
  const [hover, setHover] = useState(false)
  const [focus, setFocus] = useState(false)
  const open = hover || focus
  const [pos, setPos] = useState<{ left: number; top: number; side: 'below' | 'above' } | null>(null)

  useLayoutEffect(() => {
    if (!open) return setPos(null)
    const b = btn.current?.getBoundingClientRect()
    const t = tip.current
    if (!b || !t) return
    const w = t.offsetWidth
    const h = t.offsetHeight
    const vw = document.documentElement.clientWidth
    const vh = document.documentElement.clientHeight
    const below = b.bottom + INFO_GAP + h <= vh - INFO_EDGE || b.top - INFO_GAP - h < INFO_EDGE
    const top = below ? b.bottom + INFO_GAP : b.top - INFO_GAP - h
    const want = align === 'end' ? b.right + 2 - w : b.left - 2
    const left = Math.min(Math.max(INFO_EDGE, want), vw - INFO_EDGE - w)
    setPos({ left: Math.round(left), top: Math.round(top), side: below ? 'below' : 'above' })
  }, [open, align])

  // 띄운 채 스크롤하거나 Esc를 누르면 걷는다 (단추에서 멀어진 말풍선이 남지 않게)
  useEffect(() => {
    if (!open) return
    const close = () => {
      setHover(false)
      setFocus(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    document.addEventListener('scroll', close, true)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('scroll', close, true)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  return (
    <span className={cx('info', `info-${align}`, open && 'is-open')} onPointerEnter={() => setHover(true)} onPointerLeave={() => setHover(false)}>
      <button
        ref={btn}
        type="button"
        className="info-btn"
        aria-label={label}
        aria-describedby={id}
        onFocus={(e) => setFocus(e.currentTarget.matches(':focus-visible'))}
        onBlur={() => setFocus(false)}
      >
        <InfoIcon />
      </button>
      {createPortal(
        <span
          ref={tip}
          role="tooltip"
          id={id}
          className={cx('info-tip', pos && 'is-on')}
          data-side={pos?.side}
          style={pos ? { left: pos.left, top: pos.top } : undefined}
        >
          {children}
        </span>,
        document.body,
      )}
    </span>
  )
}

export function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track" aria-hidden="true" />
      <span>{label}</span>
    </label>
  )
}

/** 고르는 단추 하나. description은 마우스를 올리면 보이는 설명 (themes.ts의 값 목록을 그대로 넘길 수 있게 같은 이름) */
export interface SegmentOption<T> {
  id: T
  name: ReactNode
  description?: string
  style?: CSSProperties
}

/**
 * 몇 가지 가운데 하나를 고르는 단추 줄. 고른 단추에 is-on과 aria-pressed를 단다.
 * 보통은 붙어 있는 단추(.seg: 오른쪽 칸, 테마 메뉴, 장 모음)이고 label이 그 묶음의 이름이다.
 * chips면 떨어진 알약 단추(.chip: 프레임 잡기). 그때는 둘레의 fieldset과 legend가 이름을 맡아서 label 없이 쓴다
 */
export function Segmented<T extends string | number | undefined>({
  label,
  options,
  value,
  onPick,
  className,
  chips = false,
}: {
  label?: string
  options: readonly SegmentOption<T>[]
  value: T
  onPick: (id: T) => void
  /** 둘레에 더할 class (seg-full은 칸 너비를 다 쓰고, seg-fill은 단추가 많으면 줄을 바꾼다) */
  className?: string
  chips?: boolean
}) {
  return (
    <div className={cx(!chips && 'seg', className)} role={label ? 'group' : undefined} aria-label={label}>
      {options.map((o) => {
        const on = o.id === value
        return (
          <button
            key={String(o.id)}
            type="button"
            className={cx(chips ? 'chip' : 'seg-btn', on && 'is-on')}
            style={o.style}
            title={o.description}
            aria-pressed={on}
            onClick={() => onPick(o.id)}
          >
            {o.name}
          </button>
        )
      })}
    </div>
  )
}

/**
 * 버튼 아래에 붙는 작은 창. 바깥을 누르거나 Esc로 닫힌다 (메뉴가 든 칸보다 먼저: useEscape).
 * flip: 스크롤되는 상자 안의 단추라서 아래로 열면 잘릴 수 있을 때. 아래에 자리가 없고 위에 있으면 위로 연다
 * (버전 기록 맨 아래 버전의 메뉴가 낮은 노트북 화면에서 잘리지 않게)
 */
export function Popover({
  button,
  children,
  align = 'right',
  className,
  flip = false,
}: {
  button: (props: { open: boolean; toggle: () => void }) => ReactNode
  children: (close: () => void) => ReactNode
  align?: 'left' | 'right'
  className?: string
  flip?: boolean
}) {
  const [open, setOpen] = useState(false)
  // 닫히는 중: 빠르게 흐려진 뒤에 뺀다. 열 때만 움직이고 닫을 때 툭 사라지면 손에 걸리는 느낌이 났다
  const [closing, setClosing] = useState(false)
  const [up, setUp] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const timer = useRef(0)
  const close = () => {
    if (!open || closing) return
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return setOpen(false)
    setClosing(true)
    // animationend는 숨은 탭에서 오지 않을 수 있어 시간으로 (--t-fast)
    timer.current = window.setTimeout(() => {
      setOpen(false)
      setClosing(false)
    }, 120)
  }
  const toggle = () => {
    window.clearTimeout(timer.current)
    if (closing) return setClosing(false)
    if (open) close()
    else setOpen(true)
  }
  useEffect(() => () => window.clearTimeout(timer.current), [])

  // 그리기 전에 재서 정한다 (아래로 열렸다가 위로 튀지 않게)
  useLayoutEffect(() => {
    const wrap = ref.current
    const pop = popRef.current
    if (!flip || !open || !wrap || !pop) return
    // 스크롤되는 상자만이 아니라 넘친 것을 잘라 내는 상자(overflow: hidden)도 본다. 장 아래 도구는 장을 맞추는 칸(.fit-area) 안에
    // 있어서, 창 아래에 자리가 남는 큰 화면(1440×900, 1920×1080)에서는 아래로 열렸다가 그 칸에 잘려 '이 장 지우기'가 보이지 않았다.
    // 화면에 붙은 막대(position: fixed) 안이면 그 바깥 상자는 이 창을 자르지 않는다
    let box = wrap.parentElement
    while (box && getComputedStyle(box).overflowY === 'visible') box = getComputedStyle(box).position === 'fixed' ? null : box.parentElement
    const area = box ? box.getBoundingClientRect() : { top: 0, bottom: window.innerHeight }
    const at = wrap.getBoundingClientRect()
    const h = pop.offsetHeight + 6
    setUp(at.bottom + h > Math.min(area.bottom, window.innerHeight) && at.top - h >= Math.max(area.top, 0))
  }, [flip, open])

  // close가 그릴 때마다 새로 만들어져서 늘 다시 건다 (열려 있을 때만)
  useEffect(() => {
    if (!open || closing) return
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) close()
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  })
  useEscape(close, { active: open && !closing })

  return (
    <div className="pop-wrap" ref={ref}>
      {button({ open: open && !closing, toggle })}
      {open && (
        <div ref={popRef} className={cx('pop', `pop-${align}`, flip && up && 'pop-up', closing && 'is-closing', className)}>
          {children(close)}
        </div>
      )}
    </div>
  )
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]'

/** 대화 창(aria-modal)이 떠 있는지. 떠 있으면 뒤쪽 화면의 단축키(지우기, Esc로 닫기)는 쉰다 */
export function dialogOpen(): boolean {
  return !!document.querySelector('[aria-modal="true"]')
}

/** 글 칸(입력 칸, 글 상자, 슬라이드의 칸)에서 온 키인지. 그때는 지우기, Esc 같은 화면의 단축키를 쉬고 글쓰기에 맡긴다 */
export function isTyping(e: Event): boolean {
  return !!(e.target as HTMLElement | null)?.closest?.('input, textarea, [contenteditable]')
}

/**
 * Esc로 닫히는 것(메뉴, 버전 기록, 띄운 오른쪽 칸, 이 장 미리보기, 레이아웃 바꾸기)을 연 차례대로 쌓아 두고,
 * Esc 한 번에 맨 나중에 연 것 하나만 닫는다.
 * 예전에는 저마다 document에 Esc를 걸어서 먼저 건 쪽이 먼저 받았다: 버전 기록 안의 ⋯ 메뉴에서 Esc를 누르면
 * 메뉴보다 먼저 열린 버전 기록이 받아 둘이 같이 닫혔다.
 * 대화 창(useDialog)과 슬라이드의 글 칸은 같은 Esc를 먼저 받아 preventDefault로 표시하니 건너뛴다.
 * 닫으면 preventDefault로 표시한다: window에 건 뒤쪽의 Esc(컴포넌트 고르기 끝내기, 컴포넌트 칸 닫기)가 같은 Esc를 또 쓰지 않게.
 * 끄는 중(컴포넌트, 이음표)의 Esc는 끌기를 멈추는 키라서 여기에 넣지 않는다.
 */
interface EscapeLayer {
  close: () => void
  typing: boolean
}
const escapeLayers: EscapeLayer[] = []

function onEscapeKey(e: KeyboardEvent) {
  if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing || dialogOpen()) return
  const top = escapeLayers[escapeLayers.length - 1]
  if (!top || (!top.typing && isTyping(e))) return
  e.preventDefault()
  top.close()
}

/**
 * active인 동안 Esc를 받는다. onClose는 그릴 때마다 새로 만들어져도 된다 (한 번만 쌓고 늘 최근 것을 부른다.
 * 다시 쌓으면 뒤에 연 메뉴보다 위로 올라가 버린다).
 * typing: false면 글 칸에서 누른 Esc는 받지 않는다 (입력 칸이 든 오른쪽 칸처럼, 글을 쓰다 누른 Esc로 칸이 닫히지 않게)
 */
export function useEscape(onClose: () => void, { active = true, typing = true }: { active?: boolean; typing?: boolean } = {}) {
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    if (!active) return
    const layer: EscapeLayer = { close: () => close.current(), typing }
    // 받는 곳은 하나만: React가 그리는 화면(#root)보다 위인 document의 거품 단계.
    // 입력 칸이 onKeyDown에서 stopPropagation으로 막은 Esc(버전 이름 쓰기 취소)는 여기까지 오지 않는다
    if (!escapeLayers.length) document.addEventListener('keydown', onEscapeKey)
    escapeLayers.push(layer)
    return () => {
      escapeLayers.splice(escapeLayers.indexOf(layer), 1)
      if (!escapeLayers.length) document.removeEventListener('keydown', onEscapeKey)
    }
  }, [active, typing])
}

/**
 * 대화 창의 초점: 열 때 안으로 옮기고([data-autofocus]가 있으면 그것. 창 자체에 있으면 창), Tab은 창 안에서만 돌고,
 * 닫으면 창을 연 단추로 돌려준다. Esc는 맨 위의 창 하나만 닫는다.
 * Esc는 다른 단축키보다 먼저(잡는 단계에서) 받아 preventDefault로 표시한다. 그래야 뒤쪽 화면이 같은 Esc로
 * 컴포넌트 고르기를 닫거나 고른 컴포넌트를 놓지 않는다 (창은 그 사이에 이미 닫혀 있을 수 있어서 dialogOpen만으로는 모른다).
 * onClose는 그릴 때마다 새로 만들어져도 된다: 한 번만 걸어 두고 늘 최근 것을 부른다
 * (예전에는 다시 그릴 때마다 초점을 돌려줬다가 다시 옮겨서, Tab으로 옮겨 둔 초점이 첫 단추로 튀었다).
 */
export function useDialog(ref: RefObject<HTMLElement | null>, onClose: () => void) {
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const prev = document.activeElement as HTMLElement | null
    const start = el.hasAttribute('data-autofocus') ? el : (el.querySelector<HTMLElement>('[data-autofocus]') ?? el.querySelector<HTMLElement>(FOCUSABLE) ?? el)
    start.focus({ preventScroll: true })
    // 창 위에 또 창이 뜨면(버전 미리 보기 위의 '되돌릴까요?') 맨 위 창만 키를 받는다
    const isTop = () => {
      const all = document.querySelectorAll('[aria-modal="true"]')
      return all[all.length - 1] === el
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing || !isTop()) return
      if (e.key === 'Escape') {
        // 창 안의 목록을 끄는 중이면 그 Esc는 끌기만 그만둔다 (움직임 편집의 시간표: 창이 먼저 받아 창이 닫혔다)
        if (document.body.classList.contains(LIST_DRAGGING)) return
        e.preventDefault()
        close.current()
        return
      }
      if (e.key !== 'Tab') return
      const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.getClientRects().length > 0)
      const active = document.activeElement
      if (!items.length) {
        e.preventDefault()
        el.focus()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      if (!el.contains(active)) {
        e.preventDefault()
        ;(e.shiftKey ? last : first).focus()
      } else if (e.shiftKey && (active === first || active === el)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      // 연 단추가 아직 화면에 있으면 그리로 (메뉴 안의 단추였으면 메뉴와 함께 사라졌을 수 있다)
      if (prev?.isConnected) prev.focus({ preventScroll: true })
    }
  }, [ref])
}

export function Modal({
  title,
  children,
  actions,
  onClose,
  focusSelf = false,
  className,
}: {
  title: string
  children?: ReactNode
  actions: ReactNode
  onClose: () => void
  /** 열 때 초점을 단추가 아니라 창 자체에 둔다 (단추에 테가 두 겹으로 보이지 않게. Tab을 누르면 단추로 간다) */
  focusSelf?: boolean
  /** 창에 더할 이름(넓은 창 같은) */
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  useDialog(ref, onClose)
  return (
    <div className="modal-back" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={cx('modal', className)} role="dialog" aria-modal="true" aria-label={title} ref={ref} tabIndex={-1} data-autofocus={focusSelf || undefined}>
        <h2 className="modal-title">{title}</h2>
        {children && <div className="modal-body">{children}</div>}
        <div className="modal-actions">{actions}</div>
      </div>
    </div>
  )
}

/** 이 브라우저에 저장하지 못했을 때 덧붙이는 말. IndexedDB가 거절하는 것은 거의 저장 공간이 모자랄 때다 */
/**
 * 보관 폴더를 정하지 않았을 때 왜 정하는지. 발표가 든 브라우저 저장소(IndexedDB)가 실제로 지워지는 때를
 * 크롬과 엣지의 메뉴 이름 그대로 말한다 (‘인터넷 사용 기록 삭제’의 한 칸)
 */
export const FOLDER_WHY = '브라우저에서 ‘쿠키 및 기타 사이트 데이터’를 지우면 발표도 함께 지워져요.'

export const SAVE_HELP = '브라우저 저장 공간이 모자라면 저장되지 않아요. 쓰지 않는 발표를 지우거나 큰 이미지를 줄인 뒤 다시 해 주세요.'

// 화면을 옮긴 뒤에 보일 알림 (내 발표에서 파일을 열고 편집기로 갈 때처럼, 보낸 화면은 그 사이에 사라진다)
let pendingNotice: string | null = null
export function noticeAfterGo(text: string) {
  pendingNotice = text
}
export function takeNotice(): string | null {
  const text = pendingNotice
  pendingNotice = null
  return text
}

type ToastAction = {
  label: string
  run: () => void
  /** 할 일이 이미 쓸모없어졌는지 (발표가 바뀔 때마다 본다). 그러면 알림을 닫는다 */
  stale?: () => boolean
}

/** 알림을 띄우는 쪽. 편집기의 도우미(컴포넌트 끌기, 이미지 넣기)는 알림 자리를 몰라도 이것만 받아 알린다 */
export interface Toast {
  show(text: string, action?: ToastAction, ms?: number): void
}

/**
 * 알림의 '되돌리기' 단추. 바꾼 바로 뒤에 만든다.
 * 알림이 떠 있는 사이에 다른 것을 고쳤으면 엉뚱한 것을 되돌리지 않고, 위쪽 되돌리기로 하라고 알린다
 */
export function undoAction(toast: Toast): ToastAction {
  const undo = undoLast()
  const at = useDeck.getState().past.length
  return {
    label: '되돌리기',
    run: () => {
      if (!undo()) toast.show(`그 뒤에 고친 것이 있어서 여기서는 되돌리지 않았어요. 위쪽의 되돌리기(${keys('mod+Z')})로 차례로 되돌려 주세요.`, undefined, 6000)
    },
    // Ctrl+Z나 위쪽 되돌리기로 이미 되돌렸으면 닫는다: 남겨 두면 되돌린 것을 또 되돌릴 수 있는 것처럼 보였다
    stale: () => useDeck.getState().past.length < at,
  }
}

/**
 * 화면 아래에 잠깐 떴다 사라지는 알림.
 * show는 늘 같은 함수다: 효과(useEffect)나 끌기 도우미가 처음 받은 show를 오래 들고 있어도 그대로 쓸 수 있다.
 * 돌려주는 묶음도 알림이 바뀔 때만 새로 만든다 (그릴 때마다 바뀌면 이것을 받은 도우미의 함수가 매번 다시 만들어진다)
 */
export function useToast(): Toast & { node: ReactNode } {
  const [toast, setToast] = useState<{ text: string; action?: ToastAction; out?: boolean } | null>(null)
  const timer = useRef<number>(0)
  const show = useCallback((text: string, action?: ToastAction, ms = 4000) => {
    setToast({ text, action })
    window.clearTimeout(timer.current)
    // 때가 되면 흐려지며 내려간 뒤에 뺀다(--t-fast). 나타날 때만 움직이고 툭 사라지면 화면이 끊겨 보였다.
    // 손으로 닫을 때(할 일 단추, 쓸모없어진 되돌리기)는 바로 뺀다
    timer.current = window.setTimeout(() => {
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return setToast(null)
      setToast((t) => t && { ...t, out: true })
      timer.current = window.setTimeout(() => setToast(null), 120)
    }, ms)
  }, [])
  // 할 일이 쓸모없어지면(되돌리기 단추인데 이미 되돌렸으면) 바로 닫는다
  useEffect(() => {
    const stale = toast?.action?.stale
    if (!stale) return
    return useDeck.subscribe(() => {
      if (!stale()) return
      window.clearTimeout(timer.current)
      setToast(null)
    })
  }, [toast])
  const node = useMemo(
    () =>
      toast ? (
        <div className={cx('toast', toast.out && 'is-out')} role="status">
          {toast.text}
          {toast.action && (
            <button
              type="button"
              className="toast-action"
              onClick={() => {
                // 먼저 닫고 할 일을 한다: 할 일이 새 알림을 띄우면 그것이 남게
                window.clearTimeout(timer.current)
                setToast(null)
                toast.action!.run()
              }}
            >
              {toast.action.label}
            </button>
          )}
        </div>
      ) : null,
    [toast],
  )
  return useMemo(() => ({ show, node }), [show, node])
}

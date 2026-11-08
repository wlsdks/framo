import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { visibleItems } from '../../deck/fields'
import { highlightOf, LAYOUTS, panesOf, placeOf, sideOf, variantOf } from '../../deck/layouts'
import { PLACES } from '../../deck/themes'
import type { Place, Slide } from '../../deck/types'
import { cx } from '../../lib/cx'
import { gestureKey, usePointerSessions } from '../../lib/pointerSession'
import { josa } from '../../lib/josa'
import { placeFor, sideName, sideZone, zoneOf } from '../../slides/panes'
import { useDeck } from '../../store/deckStore'
import { CopyIcon, Icon, TrashIcon, useEscape } from '../ui'
import { moving, useTrackRect } from './useTrackRect'

/**
 * 장 위에서 고른 것과 그 도구. 레이아웃 장에서 칸을 누르면 그 칸이 든 항목(카드, 줄, 단계)이나 옆 판, 제목 덩어리를 고른다.
 * 고른 것에는 옅은 면 하나만 깔고(쓰는 칸의 실선이 유일한 테), 할 수 있는 일은 장 아래 도구 줄에 이름과 함께 보인다:
 * 앞뒤로, 강조, 복제, 지우기 / 반대쪽으로, 좁게·넓게, 아래로 / 제목 자리. 끌어 옮기기는 항목 왼쪽 여백의 손잡이로 한다.
 *
 * 예전에는 고른 것 바로 위에 막대를 띄웠다. 줄 사이가 막대보다 좁아 막대가 윗줄이나 아랫줄의 글을 덮었고, 고른 항목의 테와
 * 쓰는 칸의 테가 두 겹으로 둘렀다. 부품 장(.bk)의 도구는 BlockTools가 만들고 같은 자리에 그린다(StageSlot).
 */

type Target =
  | { kind: 'item'; el: HTMLElement; index: number; across: boolean }
  | { kind: 'pane'; el: HTMLElement }
  /** 위아래로 옮길 수 있는 제목 덩어리(표지, 섹션) */
  | { kind: 'field'; el: HTMLElement; label: string }

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

const ArrowIcon = ({ dir }: { dir: 'left' | 'right' | 'up' | 'down' }) => (
  <Icon d={{ left: 'M15 6l-6 6 6 6', right: 'M9 6l6 6-6 6', up: 'M6 15l6-6 6 6', down: 'M6 9l6 6 6-6' }[dir]} />
)
const StarIcon = () => <Icon d="M12 4.5l2.3 4.7 5.2.8-3.8 3.7.9 5.2-4.6-2.4-4.6 2.4.9-5.2L4.5 10l5.2-.8z" />
const SwapIcon = () => <Icon d="M7 7h11l-3-3M17 17H6l3 3" />
const NarrowIcon = () => <Icon d="M4 12h6M7 9l3 3-3 3M20 12h-6M17 9l-3 3 3 3" />
const WideIcon = () => <Icon d="M10 12H4M7 9l-3 3 3 3M14 12h6M17 9l3 3-3 3" />
const BelowIcon = () => <Icon d="M4 5h16v9H4zM4 17.5h16" />
/** 제목 자리: 장 틀 안의 위, 가운데, 아래 줄 */
const PlaceIcon = ({ at }: { at: Place }) => <Icon d={`M5 4h14v16H5zM8.5 ${at === 'top' ? 8 : at === 'middle' ? 12 : 16}h7`} />

/** 제목 덩어리의 면을 덩어리 밖으로 넓히는 너비(화면 px) */
const GROUP_PAD = 10
/** 면이 없는 항목의 면을 옆으로 넓히는 너비(화면 px) */
const ITEM_PAD = 8

/** 두 네모가 겹친 곳 (겹치지 않으면 너비나 높이가 0 이하) */
const overlap = (a: DOMRect, b: DOMRect) => {
  const left = Math.max(a.left, b.left)
  const top = Math.max(a.top, b.top)
  return new DOMRect(left, top, Math.min(a.right, b.right) - left, Math.min(a.bottom, b.bottom) - top)
}

/**
 * 컴포넌트 슬라이드에서 고른 컴포넌트(이음표도)의 도구를 슬라이드 아래 도구 줄(StageTools의 .stage-sel)에 그린다. 레이아웃 슬라이드의
 * 항목 도구와 같은 자리, 같은 생김새다. 예전에는 고른 컴포넌트 바로 위에 막대를 띄웠는데, 컴포넌트 사이가 막대보다 좁아 이웃 컴포넌트의
 * 글(점 목록의 아랫줄, 표의 마지막 줄)을 덮었다. 슬라이드 위에는 고른 테와 끌어 옮기는 이름표(.bk-handle)만 남는다
 */
export function StageSlot({ canvasRef, children }: { canvasRef: RefObject<HTMLDivElement | null>; children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  // 도구 줄은 같은 무대 안에서 장 아래에 그려지고, 미리 보기를 켜고 끄면 다시 만들어진다
  useLayoutEffect(() => {
    const s = canvasRef.current?.querySelector<HTMLElement>('.stage-sel') ?? null
    setSlot((p) => (p === s ? p : s))
  })
  return slot ? createPortal(children, slot) : null
}

/** 누른 곳에서 고를 것을 찾는다: 항목이 먼저, 아니면 옆 판 */
function targetAt(node: Element, slide: Slide): Target | null {
  const slideEl = node.closest<HTMLElement>('.slide')
  if (!slideEl || node.closest('.bk, .pn-tools, .it-grip, .it-remove')) return null
  const item = node.closest<HTMLElement>('.it')
  if (item && slideEl.contains(item) && LAYOUTS[slide.layout].items) {
    const list = [...(item.parentElement?.children ?? [])].filter((c): c is HTMLElement => c instanceof HTMLElement && c.classList.contains('it'))
    const grip = item.querySelector<HTMLElement>(':scope > .it-grip')
    const index = grip?.dataset.i ? Number(grip.dataset.i) : list.indexOf(item)
    // 가로로 놓인 목록(카드, 단계)은 왼쪽·오른쪽, 세로로 쌓인 목록(줄)은 위·아래
    let across = true
    if (list.length > 1) {
      const a = list[0].getBoundingClientRect()
      const b = list[1].getBoundingClientRect()
      across = Math.abs(b.left - a.left) > Math.abs(b.top - a.top)
    }
    if (index >= 0) return { kind: 'item', el: item, index, across }
  }
  const panes = panesOf(slide)
  const pane = panes && slideEl.querySelector<HTMLElement>(panes.el)
  if (pane && pane.contains(node) && (sideOf(slide) !== null || zoneOf(slide) === 'below')) return { kind: 'pane', el: pane }
  // 제목 덩어리를 옮길 수 있는 장(표지, 섹션): 제목이나 부제를 누르면 덩어리를 고른다
  const place = LAYOUTS[slide.layout].place
  const group = place && slideEl.querySelector<HTMLElement>(place.el)
  if (group && group.contains(node)) return { kind: 'field', el: group, label: place.name }
  // 그 밖의 칸은 고르지 않는다. 예전에는 칸 이름과 '모양'만 든 막대를 띄웠는데, 모양은 오른쪽 '이 장 설정'에 늘 있다
  return null
}

export function SelectionBar({ slide, canvasRef }: { slide: Slide; canvasRef: RefObject<HTMLDivElement | null> }) {
  // 할 일(액션)만 쓴다. 저장소 전체를 구독하면 고칠 때마다 다시 그린다
  const store = useDeck.getState()
  // 끄는 동안 창에 건 처리기. 도구가 사라지면(다른 장, 미리 보기) 끝나지 않은 끌기를 거둔다
  const startSession = usePointerSessions()
  const [target, setTarget] = useState<Target | null>(null)
  const [ring, setRing] = useState<Rect | null>(null)
  const [dragging, setDragging] = useState(false)
  // 도구를 그릴 장 아래 도구 줄의 자리 (StageTools의 .stage-sel)
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  const slideRef = useRef(slide)
  slideRef.current = slide

  // 다른 장으로 가면 고른 것을 놓는다
  useEffect(() => setTarget(null), [slide.id])
  // Esc로도 놓는다(컴포넌트 장의 고르기와 같게): 글을 쓰다 누른 첫 Esc는 쓰기를 끝내고 다음 Esc가 고른 것을 놓는다.
  // 예전에는 Esc를 몇 번 눌러도 항목의 테와 도구 막대가 그대로 남았다
  useEscape(() => setTarget(null), { active: !!target, typing: false })

  // 칸에 들어가거나(키보드도) 항목을 누르면 고르고, 슬라이드 밖을 누르면 놓는다
  useEffect(() => {
    const root = canvasRef.current
    if (!root) return
    const pick = (t: EventTarget | null) => {
      if (!(t instanceof Element) || t.closest('.stage-sel')) return
      if (!t.closest('.slide')) return setTarget(null)
      setTarget(targetAt(t, slideRef.current))
    }
    const onFocus = (e: FocusEvent) => pick(e.target)
    const onDown = (e: PointerEvent) => {
      // 항목의 손잡이나 판의 이름표로 끄는 동안은 옅은 면을 걷는다 (항목이 손을 따라 움직인다)
      if (e.target instanceof Element && e.target.closest('.it-grip, .pn-tools')) {
        // 손잡이로 끌기 시작하면 그 항목을 고른다: 손잡이는 고른 항목에만 늘 보이지만, 손을 올린 다른 항목에서도 잡을 수 있다
        const grip = e.target.closest('.it-grip')
        if (grip) pick(grip.closest('.it')?.querySelector('.ed-input') ?? grip)
        setDragging(true)
        const session = startSession()
        session.on(
          'pointerup',
          () => {
            setDragging(false)
            session.end()
          },
          true,
        )
        return
      }
      pick(e.target)
    }
    const onOutside = (e: PointerEvent) => {
      if (e.target instanceof Node && !root.contains(e.target)) setTarget(null)
    }
    root.addEventListener('focusin', onFocus)
    root.addEventListener('pointerdown', onDown)
    document.addEventListener('pointerdown', onOutside, true)
    return () => {
      root.removeEventListener('focusin', onFocus)
      root.removeEventListener('pointerdown', onDown)
      document.removeEventListener('pointerdown', onOutside, true)
    }
  }, [canvasRef, startSession])

  // 고른 것의 자리를 따라간다 (글을 적어 카드가 커지거나 순서를 바꿔 옮겨 가도)
  useTrackRect(
    () => canvasRef.current,
    () => {
      const s = canvasRef.current?.querySelector<HTMLElement>('.stage-sel') ?? null
      setSlot((p) => (p === s ? p : s))
      if (!target) return setRing(null)
      if (!target.el.isConnected) return setTarget(null)
      const box = target.el.getBoundingClientRect()
      // 제목 덩어리는 쓰는 중인 칸의 테가 면 안에 들게 조금 넓게 깐다
      const pad = target.kind === 'field' ? GROUP_PAD : 0
      // 면이 없는 항목(줄로 나뉜 목록의 한 줄)은 글이 상자 끝에서 시작해서, 면을 상자에 딱 깔면 이름 글자가 면 끝에 붙었다.
      // 옆으로만 조금 띄운다(위아래는 줄 선이라 띄우면 옆 줄을 덮는다). 옮길 수 있는 판(마지막 장의 요청 목록) 안이면 판의 면이
      // 같은 너비로 깔려 있어서, 띄우면 두 면이 엇갈린다
      const paneSel = panesOf(slideRef.current)?.el
      const inPane = !!paneSel && !!target.el.closest(paneSel)
      const flat = target.kind === 'item' && !target.across && !inPane && getComputedStyle(target.el).backgroundColor === 'rgba(0, 0, 0, 0)'
      const padX = flat ? ITEM_PAD : pad
      // 장 안까지만: 글이 넘친 항목은 상자가 장 밖(머리줄)까지 걸쳐서 면이 편집기 화면을 덮었다
      const frame = target.el.closest('.slide')?.getBoundingClientRect()
      const full = new DOMRect(box.left - padX, box.top - pad, box.width + padX * 2, box.height + pad * 2)
      const r = frame ? overlap(full, frame) : full
      setRing((p) => (p && p.x === r.left && p.y === r.top && p.w === r.width && p.h === r.height ? p : { x: r.left, y: r.top, w: r.width, h: r.height }))
      return moving(target.el)
    },
  )

  // 옆 판을 고르면 판에 옅은 면과 판 사이 손잡이를 켜 둔다. 항목을 고르면 항목 모서리의 빼기 단추를 숨기고(장 아래 도구 줄에 같은 일이 있다)
  // 끌기 손잡이를 항목 왼쪽 여백에 늘 보인다. edit.css
  useEffect(() => {
    if (!target || target.kind === 'field') return
    const el = target.kind === 'pane' ? target.el.closest<HTMLElement>('.slide') : target.el
    if (!el) return
    el.dataset.sel = target.kind
    if (target.kind === 'item') el.dataset.selAxis = target.across ? 'x' : 'y'
    return () => {
      delete el.dataset.sel
      delete el.dataset.selAxis
    }
  }, [target])

  if (!target) return null
  const spec = LAYOUTS[slide.layout]
  // 고른 것은 테 없이 옅은 면 하나로: 쓰는 칸의 실선과 고른 항목의 테가 두 겹으로 둘러 어느 것이 무엇인지 어지러웠다.
  // 판은 판의 도구(.pn-tools)가 면을 깐다
  const soft =
    ring && !dragging && target.kind !== 'pane' ? (
      <div className="sel-ring" style={{ translate: `${ring.x}px ${ring.y}px`, width: ring.w, height: ring.h }} aria-hidden="true" />
    ) : null

  // 도구는 장 아래 도구 줄에 그린다. 장 위에 띄우던 때는 막대가 아랫줄이나 윗줄의 글을 덮었고(진행 현황의 줄 사이는 막대보다 좁다),
  // 파란 이름표가 단추처럼 보여 눌러 보게 됐다. 이름은 단추가 아닌 글자로, 무엇의 도구인지만 말한다
  const bar = (name: string, tools: ReactNode) =>
    slot &&
    createPortal(
      <div className="sel-tools" role="toolbar" aria-label={`${name} 도구`}>
        <span className="sel-name">{name}</span>
        {tools}
      </div>,
      slot,
    )

  if (target.kind === 'item' && spec.items) {
    const i = target.index
    const n = visibleItems(slide).length
    const highlight = spec.highlight
    const on = highlight && highlightOf(slide) === i
    // 옮긴 뒤에도 같은 항목을 고른 채로 둔다: 새 자리의 항목을 다시 찾는다
    const moveTo = (to: number) => {
      const list = target.el.parentElement
      store.moveItem(slide.id, i, to)
      requestAnimationFrame(() => {
        const items = [...(list?.children ?? [])].filter((c): c is HTMLElement => c instanceof HTMLElement && c.classList.contains('it'))
        const el = items[to]
        if (el) setTarget({ ...target, el, index: to })
      })
    }
    const back = target.across ? '왼쪽으로' : '위로'
    const fwd = target.across ? '오른쪽으로' : '아래로'
    // 끝이라 옮길 수 없으면 단추는 잠그고 까닭을 (컴포넌트의 '앞으로 옮기기'와 같게)
    const first = `${target.across ? '맨 왼쪽' : '맨 위'} ${josa(spec.items.label, '이에요', '예요')}`
    const last = `${target.across ? '맨 오른쪽' : '맨 아래'} ${josa(spec.items.label, '이에요', '예요')}`
    return (
      <>
        {soft}
        {bar(
          `${spec.items.label} ${i + 1}`,
          <>
            <button type="button" className="btn btn-ghost btn-sm sel-btn" title={i <= 0 ? first : back} aria-label={back} disabled={i <= 0} onClick={() => moveTo(i - 1)}>
              <ArrowIcon dir={target.across ? 'left' : 'up'} />
            </button>
            <button type="button" className="btn btn-ghost btn-sm sel-btn" title={i >= n - 1 ? last : fwd} aria-label={fwd} disabled={i >= n - 1} onClick={() => moveTo(i + 1)}>
              <ArrowIcon dir={target.across ? 'right' : 'down'} />
            </button>
            {highlight && (
              <button
                type="button"
                className={cx('btn btn-ghost btn-sm', on && 'is-on')}
                aria-pressed={!!on}
                title={on ? `${highlight.label} 끄기` : `이 ${josa(spec.items.label, '을', '를')} ${highlight.label}`}
                onClick={() => store.setOptions(slide.id, { highlight: on ? -1 : i })}
              >
                <StarIcon />
                <span className="btn-t">강조</span>
              </button>
            )}
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              title={n >= spec.items.max ? `${josa(spec.items.label, '은', '는')} ${spec.items.max}개까지예요` : `이 ${josa(spec.items.label, '을', '를')} 바로 뒤에 하나 더`}
              disabled={n >= spec.items.max}
              onClick={() => store.duplicateItem(slide.id, i)}
            >
              <CopyIcon />
              <span className="btn-t">복제</span>
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              title={n <= spec.items.min ? `${josa(spec.items.label, '은', '는')} ${spec.items.min}개 아래로 줄일 수 없어요` : `이 ${josa(spec.items.label, '을', '를')} 지워요`}
              disabled={n <= spec.items.min}
              onClick={() => {
                store.removeItem(slide.id, i)
                setTarget(null)
              }}
            >
              <TrashIcon />
              <span className="btn-t">지우기</span>
            </button>
          </>,
        )}
      </>
    )
  }

  if (target.kind === 'field') {
    const placeSpec = spec.place
    const current = placeOf(slide)
    if (!placeSpec || !current) return null
    const setPlace = (p: Place) => store.setOptions(slide.id, { place: p === placeSpec.base ? undefined : p })
    return (
      <>
        {soft}
        {bar(
          `${target.label} 자리`,
          PLACES.map((p) => (
            <button
              key={p.id}
              type="button"
              className={cx('btn btn-ghost btn-sm', current === p.id && 'is-on')}
              aria-pressed={current === p.id}
              title={p.description}
              onClick={() => setPlace(p.id)}
            >
              <PlaceIcon at={p.id} />
              <span className="btn-t">{p.name}</span>
            </button>
          )),
        )}
      </>
    )
  }

  if (target.kind === 'pane' && spec.panes) {
    const panes = panesOf(slide) ?? spec.panes
    const zone = zoneOf(slide)
    const side = sideOf(slide)
    const at = panes.sides.indexOf(side ?? panes.base)
    const place = (to: 'start' | 'end' | 'below') => {
      const p = placeFor(slide, to)
      // 모양과 좌우는 되돌리기 한 단계로 (판을 끌어 옮길 때와 같이, panes.tsx): 따로 남기면 옆으로 세운 것이 두 단계라
      // Ctrl+Z 한 번에 아래 띠로 돌아오지 않았다
      const key = gestureKey('pane.place')
      if (p.variant !== undefined && p.variant !== variantOf(slide)) store.setVariant(slide.id, p.variant, key)
      if (p.flip !== !!slide.options.flip) store.setOptions(slide.id, { flip: p.flip || undefined }, key)
    }
    const setSide = (k: number) => {
      const n = panes.sides[k]
      store.setOptions(slide.id, { pane: n === panes.base ? undefined : n })
    }
    return bar(
      panes.name,
      <>
        {zone !== 'below' && (
          <button type="button" className="btn btn-ghost btn-sm" title="반대쪽으로 옮기기" onClick={() => place(zone === 'start' ? 'end' : 'start')}>
            <SwapIcon />
            <span className="btn-t">{zone === 'start' ? '오른쪽으로' : '왼쪽으로'}</span>
          </button>
        )}
        {spec.panes.below && (
          <button type="button" className="btn btn-ghost btn-sm" title={zone === 'below' ? '옆으로 세우기' : '슬라이드 아래에 띠로 깔기'} onClick={() => place(zone === 'below' ? sideZone(slide) : 'below')}>
            <BelowIcon />
            <span className="btn-t">{zone === 'below' ? '옆으로' : '아래로'}</span>
          </button>
        )}
        {side !== null && zone !== 'below' && (
          <>
            <button
              type="button"
              className="btn btn-ghost btn-sm sel-btn"
              title={at > 0 ? `좁게 (${sideName(panes.sides[at - 1], panes.base)})` : '더 좁게 할 수 없어요'}
              aria-label="좁게"
              disabled={at <= 0}
              onClick={() => setSide(at - 1)}
            >
              <NarrowIcon />
            </button>
            <span className="sel-val">{sideName(side, panes.base)}</span>
            <button
              type="button"
              className="btn btn-ghost btn-sm sel-btn"
              title={at < panes.sides.length - 1 ? `넓게 (${sideName(panes.sides[at + 1], panes.base)})` : '더 넓게 할 수 없어요'}
              aria-label="넓게"
              disabled={at >= panes.sides.length - 1}
              onClick={() => setSide(at + 1)}
            >
              <WideIcon />
            </button>
          </>
        )}
      </>,
    )
  }
  return null
}

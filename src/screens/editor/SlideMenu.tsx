import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { slideName } from '../../deck/blocks'
import type { Deck, Slide } from '../../deck/types'
import { onMenuKeys } from '../../lib/menuKeys'
import { useDeck } from '../../store/deckStore'
import { useEscape } from '../ui'

/**
 * 슬라이드 하나의 메뉴: 복제, 발표에서 빼기, 지우기. 슬라이드 아래 '더 보기'(⋯)와 왼쪽 목록의 오른쪽 클릭이 같이 쓴다.
 * 두 곳의 글과 막는 규칙(하나뿐인 슬라이드는 지우지 않는다)이 따로 놀지 않게 한 곳에 둔다
 */
export function SlideMenuItems({ deck, slide, close, onRemove }: { deck: Deck; slide: Slide; close: () => void; onRemove: (s: Slide) => void }) {
  const store = useDeck.getState()
  return (
    <>
      <button
        type="button"
        role="menuitem"
        className="menu-item"
        onClick={() => {
          close()
          store.duplicateSlide(slide.id)
        }}
      >
        복제하기
      </button>
      <button
        type="button"
        role="menuitem"
        className="menu-item"
        onClick={() => {
          close()
          store.setHidden(slide.id, !slide.hidden)
        }}
      >
        <span className="menu-item-t">
          {slide.hidden ? '발표에 다시 넣기' : '발표에서 빼기'}
          <span className="menu-item-desc">{slide.hidden ? '발표할 때 이 슬라이드를 다시 보여요' : '지우지 않고 발표할 때만 건너뛰어요'}</span>
        </span>
      </button>
      <div className="menu-sep" role="separator" />
      <button
        type="button"
        role="menuitem"
        className="menu-item is-danger"
        // 막아 둔 일은 왜 안 되는지를 말한다
        title={deck.slides.length <= 1 ? '슬라이드가 하나뿐이라 지울 수 없어요' : undefined}
        disabled={deck.slides.length <= 1}
        onClick={() => {
          close()
          onRemove(slide)
        }}
      >
        이 슬라이드 지우기
      </button>
    </>
  )
}

/** 화면 가장자리에서 띄울 거리 (px) */
const EDGE = 8

/**
 * 왼쪽 목록에서 슬라이드를 오른쪽 클릭하면 뜨는 메뉴. PowerPoint에서 오는 분은 목록의 슬라이드를 오른쪽 클릭해 복제하고 지운다.
 * 예전에는 브라우저의 메뉴(뒤로, 새로고침, 인쇄, 검사)가 떠서 무엇을 해야 할지 몰랐다.
 * 누른 자리에 열고(창 밖으로 나가면 안쪽으로 당긴다), 바깥을 누르거나 Esc, 스크롤이면 닫고 초점을 그 슬라이드로 돌려준다
 */
export function SlideContextMenu({
  deck,
  slide,
  at,
  onClose,
  onRemove,
}: {
  deck: Deck
  slide: Slide
  at: { x: number; y: number }
  onClose: () => void
  onRemove: (s: Slide) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState(at)
  // 그리기 전에 재서 창 안으로 (아래나 오른쪽 끝에서 열면 메뉴가 잘렸다)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const { offsetWidth: w, offsetHeight: h } = el
    setPos({
      x: Math.max(EDGE, Math.min(at.x, window.innerWidth - w - EDGE)),
      y: Math.max(EDGE, at.y + h > window.innerHeight - EDGE ? at.y - h : at.y),
    })
    el.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus({ preventScroll: true })
  }, [at])
  const close = () => {
    onClose()
    document.getElementById(`thumb-${slide.id}`)?.focus({ preventScroll: true })
  }
  useEscape(close)
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const onScroll = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('scroll', onScroll, true)
    window.addEventListener('blur', onClose)
    window.addEventListener('resize', onClose)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('blur', onClose)
      window.removeEventListener('resize', onClose)
    }
  }, [onClose])
  return (
    <div
      ref={ref}
      className="pop slide-ctx"
      style={{ left: pos.x, top: pos.y }}
      // 메뉴 위의 오른쪽 클릭은 브라우저 메뉴 대신 그냥 둔다
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="menu stage-menu" role="menu" aria-label={`‘${slideName(slide)}’ 슬라이드 메뉴`} onKeyDown={onMenuKeys}>
        <SlideMenuItems deck={deck} slide={slide} close={close} onRemove={onRemove} />
      </div>
    </div>
  )
}

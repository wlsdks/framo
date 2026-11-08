import { useCallback, useEffect, useRef } from 'react'

// 누르고 끄는 동안만 창(window)에 거는 처리기 묶음 (컴포넌트 끌기, 칸 너비, 줄 높이, 이음표, 제목 자리).
// 예전에는 곳마다 addEventListener와 removeEventListener를 짝지어 적었고, 끄는 사이에 화면이 사라지면(주소를 바꾸거나
// 다른 화면으로 가면) 뗄 사람이 없었다. body에 남은 is-block-dragging 때문에 다음 편집기의 넘침 확인(useOverflow)이
// 300ms마다 미루기만 했다. AbortController 하나로 묶어 끝낼 때 한꺼번에 뗀다.

/** 한 번 끄는 동안 고친 것의 되돌리기 이름(gestureKey)의 머리. deckStore의 commit이 이것으로 알아본다 */
export const GESTURE_KEY = 'gesture:'
let gestures = 0

/**
 * 한 번 끄는 동안(선, 항목, 제목 자리) 고친 것을 되돌리기 한 단계로 묶는 이름. 끄기를 시작할 때마다 새로 만든다.
 * 이 이름으로 고친 것은 손을 멈췄다 움직여도 한 단계이고, 끄기 전 모습으로 돌아오면(제자리, Esc) 단계를 남기지 않는다.
 * 예전에는 같은 이름을 1.2초 안에 다시 고쳤는지로만 묶어서, 끄다가 쉬면 끄는 중간 모습이 기록에 남고
 * 곧바로 다시 끈 것은 앞의 끌기와 한 단계로 합쳐졌다
 */
export function gestureKey(what: string): string {
  return `${GESTURE_KEY}${what}:${++gestures}`
}

export interface PointerSession {
  /** 이 끌기 동안만 창에서 듣는다. capture면 잡는 단계에서 (다른 Esc보다 먼저 받을 때) */
  on<K extends keyof WindowEventMap>(type: K, fn: (e: WindowEventMap[K]) => void, capture?: boolean): void
  /** 끝날 때 할 정리 (기다리는 requestAnimationFrame 거두기 같은) */
  onEnd(fn: () => void): void
  /** 처리기를 모두 떼고 body의 class를 거둔다. 여러 번 불러도 한 번만 */
  end(): void
}

/** bodyClass: 끄는 동안 body에 붙여 둘 class (is-block-dragging처럼 화면 전체의 커서나 다른 일을 쉬게 하는 표시) */
function pointerSession(bodyClass?: string): PointerSession {
  const ctrl = new AbortController()
  const cleanups: (() => void)[] = []
  // 끄는 동안 화면 전체를 덮는 빈 막. 커서(잡은 손, 너비 화살표)를 이 막 하나에만 준다. 예전에는 body 아래 모든 요소(*)에
  // !important 커서를 걸어서, 끌기를 시작하고 놓을 때마다 문서 전체(컴포넌트 목록의 작은 슬라이드까지 3,000개 남짓)의 스타일을
  // 다시 계산했다(CPU 4배 느림에서 한 번에 45ms). 손 아래 요소의 :hover와 올림 표시도 끄는 동안 쉬게 된다
  const cover = bodyClass ? document.createElement('div') : null
  if (bodyClass) document.body.classList.add(bodyClass)
  if (cover) {
    cover.className = 'drag-cover'
    cover.setAttribute('aria-hidden', 'true')
    document.body.appendChild(cover)
    // 끄는 동안 글이 골라지지 않게 (body에 user-select를 걸면 물려받는 모든 요소의 스타일을 다시 계산한다)
    window.addEventListener('selectstart', (e) => e.preventDefault(), { capture: true, signal: ctrl.signal })
  }
  return {
    on(type, fn, capture = false) {
      window.addEventListener(type, fn, { capture, signal: ctrl.signal })
    },
    onEnd(fn) {
      cleanups.push(fn)
    },
    end() {
      if (ctrl.signal.aborted) return
      ctrl.abort()
      if (bodyClass) document.body.classList.remove(bodyClass)
      cover?.remove()
      for (const fn of cleanups) fn()
    },
  }
}

/**
 * 이 컴포넌트(훅)가 연 끌기. 컴포넌트가 사라질 때 아직 끝나지 않은 것을 끝낸다: 처리기와 body의 class만 거두고,
 * 놓기(고친 것을 저장하기)는 하지 않는다. 사라진 화면의 발표를 끄는 도중의 모습으로 고치지 않게
 */
export function usePointerSessions(): (bodyClass?: string) => PointerSession {
  const live = useRef(new Set<PointerSession>())
  useEffect(() => {
    const sessions = live.current
    return () => {
      for (const s of sessions) s.end()
      sessions.clear()
    }
  }, [])
  return useCallback((bodyClass?: string) => {
    const s = pointerSession(bodyClass)
    live.current.add(s)
    s.onEnd(() => live.current.delete(s))
    return s
  }, [])
}

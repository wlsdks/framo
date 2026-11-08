import { useEffect, useMemo, useRef, useState } from 'react'
import type { Deck } from '../../deck/types'

/** 장을 그리는 데 필요한 발표 전체의 설정: 발표 정보, 테마, 발표 이름(아래 표시), 움직임, 모션 그래픽의 레시피. SlideCanvas의 deck에 넘긴다 */
export type Look = Pick<Deck, 'meta' | 'theme' | 'title' | 'motion' | 'cines'>

/**
 * 발표의 Look. 칸의 글을 고칠 때마다 발표는 새로 만들어지지만 이 다섯은 그대로라서, 다섯 가운데 하나가 바뀔 때만 새로 만든다.
 * 그래야 memo로 감싼 그림(컴포넌트 카드, 레이아웃 그림)과 넘침 확인(useOverflow)이 글자 하나 칠 때마다 다시 돌지 않는다
 */
export function useLook(deck: Deck): Look {
  const { meta, theme, title, motion, cines } = deck
  return useMemo(() => ({ meta, theme, title, motion, cines }), [meta, theme, title, motion, cines])
}

/** 이어 치는 것으로 보는 사이(ms). 앞 고침에서 이만큼 안에 또 고치면 손을 쉴 때까지(이만큼 조용할 때까지) 그림을 미룬다 */
const QUIET = 400

/**
 * 화면에 그려진 다음에야 바뀌는 값. 고치는 장 말고 같은 장을 한 번 더 그리는 그림(왼쪽 목록, 오른쪽 칸의 장 그림)에 쓴다.
 * 글자 하나 칠 때마다 그 그림까지 같이 그리면(레이아웃 장은 채움 맞추기, 컴포넌트 장은 넘치는 컴포넌트 맞추기까지) 친 글자가 그만큼 늦게 보인다.
 * React의 useDeferredValue는 늦춘 그리기를 바로 다음 일로 해서 화면에 그려지기 전에 끝나 버려, 글자가 보이는 때는 그대로였다.
 * 한 번 누르는 바꾸기는 다음 화면이 그려진 뒤(requestAnimationFrame 다음의 setTimeout) 바로 보인다. 이어 치는 동안에는 그림을 고치지 않고,
 * 손을 쉬면(QUIET ms 조용하면) 브라우저가 한가할 때(requestIdleCallback) 한 번 고친다: 300ms마다 한 번씩 고치던 때는 느린 PC에서
 * 그 글자만 늦게 받아져 치는 중에 걸리는 느낌이 났다
 */
export function useAfterPaint<T>(value: T): T {
  const [shown, setShown] = useState(value)
  const changed = useRef(Number.NEGATIVE_INFINITY)
  useEffect(() => {
    if (Object.is(value, shown)) return
    const now = performance.now()
    const burst = now - changed.current < QUIET
    changed.current = now
    const apply = () => setShown(() => value)
    let f = 0
    let t = 0
    let idle = 0
    if (!burst) f = requestAnimationFrame(() => (t = window.setTimeout(apply)))
    else
      t = window.setTimeout(() => {
        if (typeof requestIdleCallback === 'function') idle = requestIdleCallback(apply, { timeout: 300 })
        else apply()
      }, QUIET)
    return () => {
      cancelAnimationFrame(f)
      window.clearTimeout(t)
      if (idle) cancelIdleCallback(idle)
    }
  }, [value, shown])
  return shown
}


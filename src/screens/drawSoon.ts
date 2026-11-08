import { useEffect, useLayoutEffect, useState, type RefObject } from 'react'
import { flushSync } from 'react-dom'

// 작은 장 그림을 화면이 그려진 뒤에 차례로 그리기. 편집기(목록 그림, 새 슬라이드 창)와 프레임 잡기(구성 미리 보기)가 같이 쓴다

/** 그림을 그릴 차례를 기다리는 것들 (먼저 온 것부터) */
const soon: (() => void)[] = []
let pumping = false
/** 한 일(task)에 그림을 그리는 시간의 끝(ms). 넘으면 나머지는 다음 일로 넘겨 화면이 그 사이에 그려지고 손을 받는다 */
const SLICE = 12

function pump() {
  const t0 = performance.now()
  while (soon.length && performance.now() - t0 < SLICE) flushSync(soon.shift()!)
  if (soon.length) window.setTimeout(pump)
  else pumping = false
}

/**
 * 작은 장 그림을 지금 그릴지. now면 처음부터 그린다. 아니면 화면이 한 번 그려진 뒤 차례대로, 한 일에 SLICE ms까지 그린다.
 * 장 그림 하나는 장을 그리고 글을 맞추느라(fitBlocks) 느린 PC에서 20~50ms가 든다. 새 슬라이드 창의 그림 아홉 장이나 새로 더한 장의
 * 목록 그림까지 누른 그 일에서 한꺼번에 그리면 창이 0.3초 동안 뜨지 않았다. 먼저 창과 고치는 장을 보이고 그림은 바로 뒤따라 채운다
 */
export function useDrawSoon(now = false, seen?: RefObject<HTMLElement | null>): boolean {
  const [ready, setReady] = useState(now)
  // seen을 주면 처음 그릴 때 화면(굴리는 상자)에 보이는 그림은 기다리지 않고 이 그림에서 그린다: 보이는 그림이 한 번 빈 채로 그려지지 않게
  useLayoutEffect(() => {
    const el = seen?.current
    if (!ready && el && inView(el)) setReady(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    if (ready) return
    const wake = () => setReady(true)
    soon.push(wake)
    if (!pumping) {
      pumping = true
      requestAnimationFrame(() => window.setTimeout(pump))
    }
    return () => {
      const i = soon.indexOf(wake)
      if (i >= 0) soon.splice(i, 1)
    }
  }, [ready])
  return ready
}

/** 굴리는 상자(없으면 창) 안에 보이는지 */
function inView(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect()
  let box = { top: 0, bottom: window.innerHeight }
  for (let p = el.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY
    if (o === 'auto' || o === 'scroll') {
      box = p.getBoundingClientRect()
      break
    }
  }
  return r.bottom > box.top && r.top < box.bottom && r.height > 0
}

import { memo, useEffect, useLayoutEffect, useRef, type CSSProperties, type RefObject } from 'react'
import { BACKDROP_CELL, backdropOf } from '../deck/backdrops'
import { BOARD_COLS, BOARD_ROWS } from '../deck/blocks'
import type { Slide } from '../deck/types'
import { backdropMotion } from '../motion/backdrop'
import { drawKit } from '../motion/draw'

// 장의 배경(글과 컴포넌트 뒤의 그래픽). 늘 끝 모습을 SVG로 그려 두고(편집 화면, 목록, PDF, PPT, 내보낸 HTML),
// 발표할 때는 엔진이 장을 움직이며 보내는 알림(mo-backdrop)을 받아 같은 그림을 캔버스로 움직인다(motion/backdrop.ts).
// 알림을 받는 곳은 문서에 하나다: 앱은 여기서, 내보낸 HTML은 뷰어가 같은 함수로 연다

export const backdrops = backdropMotion(drawKit())
if (typeof document !== 'undefined') backdrops.listen(document)

/**
 * 마스크 두 가지를 겹친다(둘 다 보이는 곳만 보인다): 글 둘레의 흐린 구멍(--bd-clear, motion/backdrop.ts의 clear가 글의 자리를 재서
 * 넣는다. 아직 재지 않았으면 다 보이는 판)과, 장 가장자리에 닿지 않는 쪽이 서서히 옅어지는 기울기(자리의 네모 끝이 선처럼 보이지 않게.
 * 닿는 쪽은 장 밖까지 이어진 것처럼 그대로)
 */
function maskOf(x: number, y: number, w: number, h: number, W: number, H: number): CSSProperties {
  const L = x > 0 ? Math.min(220, W * 0.24) : 0
  const R = x + w < BOARD_COLS ? Math.min(220, W * 0.24) : 0
  const T = y > 0 ? Math.min(180, H * 0.24) : 0
  const B = y + h < BOARD_ROWS ? Math.min(180, H * 0.24) : 0
  // 곧은 기울기는 끝에서 꺾여 보여서, 처음과 끝을 눕힌 곡선(0, 0.15, 0.55, 1)으로 잇는다
  const ramp = (dir: string, a: number, b: number) =>
    `linear-gradient(${dir}, transparent 0, rgb(0 0 0 / 0.15) ${a * 0.3}px, rgb(0 0 0 / 0.55) ${a * 0.6}px, #000 ${a}px, #000 calc(100% - ${b}px), rgb(0 0 0 / 0.55) calc(100% - ${b * 0.6}px), rgb(0 0 0 / 0.15) calc(100% - ${b * 0.3}px), transparent 100%)`
  const layers = ['var(--bd-clear, linear-gradient(#000, #000))']
  if (L || R) layers.push(ramp('to right', L, R))
  if (T || B) layers.push(ramp('to bottom', T, B))
  const mask = layers.join(', ')
  return { maskImage: mask, WebkitMaskImage: mask, maskComposite: 'intersect', WebkitMaskComposite: 'source-in' }
}

/**
 * 글이 놓인 자리가 바뀌면(쓰기, 글자 맞추기, 글꼴이 늦게 옴, 다른 장 크기) 글 둘레를 다시 비운다. 한 프레임에 한 번만 재고,
 * 장이 움직이는 동안(엔진의 data-mo-play: 글이 옮겨지는 중)에는 기다렸다가 끝나면(mo-end) 잰다
 */
function useClear(ref: RefObject<HTMLDivElement | null>) {
  useLayoutEffect(() => {
    const slide = ref.current?.parentElement
    if (slide) backdrops.clear(slide)
  })
  useEffect(() => {
    const el = ref.current
    const slide = el?.parentElement
    if (!el || !slide) return
    let raf = 0
    const later = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        if (!slide.hasAttribute('data-mo-play')) backdrops.clear(slide)
      })
    }
    const mo =
      typeof MutationObserver === 'function'
        ? new MutationObserver((records) => {
            if (records.some((r) => !el.contains(r.target))) later()
          })
        : null
    mo?.observe(slide, { subtree: true, childList: true, characterData: true, attributes: true })
    slide.addEventListener('mo-end', later)
    document.fonts?.addEventListener?.('loadingdone', later)
    later()
    return () => {
      mo?.disconnect()
      slide.removeEventListener('mo-end', later)
      document.fonts?.removeEventListener?.('loadingdone', later)
      cancelAnimationFrame(raf)
    }
  }, [ref])
}

export const Backdrop = memo(function Backdrop({ value }: { value: Slide['backdrop'] }) {
  const b = backdropOf({ backdrop: value })
  return b ? <Drawn b={b} /> : null
})

function Drawn({ b }: { b: NonNullable<ReturnType<typeof backdropOf>> }) {
  const ref = useRef<HTMLDivElement>(null)
  useClear(ref)
  const { x, y, w, h } = b.at
  const W = w * BACKDROP_CELL.w
  const H = h * BACKDROP_CELL.h
  const style: CSSProperties = { left: x * BACKDROP_CELL.w, top: y * BACKDROP_CELL.h, width: W, height: H, ...maskOf(x, y, w, h, W, H) }
  return (
    <div ref={ref} className="s-bd" data-bd={b.kind} data-w={W} data-h={H} data-x={x} data-y={y} data-strength={b.strength} style={style} aria-hidden="true">
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} dangerouslySetInnerHTML={{ __html: backdrops.still(b.kind, W, H, b.strength) }} />
    </div>
  )
}

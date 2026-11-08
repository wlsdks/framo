import { memo, useEffect, useId, useLayoutEffect, useRef, type CSSProperties, type RefObject } from 'react'
import { BACKDROP_CELL, backdropOf } from '../deck/backdrops'
import type { BackdropStrength, Slide } from '../deck/types'
import { backdropMotion } from '../motion/backdrop'
import { drawKit } from '../motion/draw'

// 장의 배경(글과 컴포넌트 뒤의 그래픽). 늘 끝 모습을 SVG로 그려 두고(편집 화면, 목록, PDF, PPT, 내보낸 HTML),
// 발표할 때는 엔진이 장을 움직이며 보내는 알림(mo-backdrop)을 받아 같은 그림을 캔버스로 움직인다(motion/backdrop.ts).
// 알림을 받는 곳은 문서에 하나다: 앱은 여기서, 내보낸 HTML은 뷰어가 같은 함수로 연다

export const backdrops = backdropMotion(drawKit())
if (typeof document !== 'undefined') backdrops.listen(document)

/**
 * 검은 바탕은 한 단계 짙게 그린다. 같은 짙기로는 프로젝터 3~5m에서 검은 바탕의 배경이 사실상 보이지 않았다(검수: 흐름이 가장 밝은
 * 곳도 12/255). 흰 바탕의 회색 선은 같은 짙기로도 보인다
 */
const DARK_UP: Record<BackdropStrength, string> = { soft: 'base', base: 'strong', strong: 'vivid' }

/**
 * PDF와 PPT 그림은 한 단계 옅게(styles/backdrop.css의 @media print와 같은 값). 종이와 PPT는 화면보다 진하게 읽혀서
 * 결정했다(검수: 같은 배경이 화면보다 PDF, PPT에서 무거웠다)
 */
const PRINT_OPACITY = '0.7'

/**
 * 글이 놓인 자리가 바뀌면(쓰기, 글자 맞추기, 글꼴이 늦게 옴, 다른 장 크기) 배경을 장에 다시 맞춘다(구멍, 본문 띠, 장의 답).
 * 한 프레임에 한 번만 재고, 장이 움직이는 동안(엔진의 data-mo-play: 글이 옮겨지는 중)에는 기다렸다가 끝나면(mo-end) 잰다
 */
function useFit(ref: RefObject<HTMLDivElement | null>) {
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

/** 장을 그림으로 옮기기 직전(PPT): 다 맞춘 자리로 배경을 맞추고 한 단계 옅게 */
export function settleForPrint(slide: Element) {
  backdrops.clear(slide)
  const el = slide.querySelector<HTMLElement>(':scope > .s-bd')
  if (el) el.style.opacity = PRINT_OPACITY
}

export const Backdrop = memo(function Backdrop({ value, dark }: { value: Slide['backdrop']; dark?: boolean }) {
  const b = backdropOf({ backdrop: value })
  return b ? <Drawn b={b} dark={dark === true} /> : null
})

function Drawn({ b, dark }: { b: NonNullable<ReturnType<typeof backdropOf>>; dark: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  // 마스크 id: 한 문서에 장이 여럿(목록, 내보낸 HTML)이라 장마다 달라야 한다
  const mid = `bd${useId().replace(/[^\w-]/g, '')}`
  useFit(ref)
  const { x, y, w, h } = b.at
  const W = w * BACKDROP_CELL.w
  const H = h * BACKDROP_CELL.h
  const strength = dark ? DARK_UP[b.strength] : b.strength
  const cells = [x, y, w, h]
  // 움직이는 캔버스에 씌우는 마스크(가장자리의 옅어짐. 재고 나면 구멍도). 끝 모습의 SVG는 마스크를 안에 갖는다
  const mask = backdrops.maskUrl(W, H, cells)
  const style = { left: x * BACKDROP_CELL.w, top: y * BACKDROP_CELL.h, width: W, height: H, ...(mask ? { '--bd-mask': mask } : {}) } as CSSProperties
  return (
    <div ref={ref} className="s-bd" data-bd={b.kind} data-w={W} data-h={H} data-x={x} data-y={y} data-strength={strength} data-mid={mid} style={style} aria-hidden="true">
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} dangerouslySetInnerHTML={{ __html: backdrops.still(b.kind, W, H, strength, { cells, id: mid }) }} />
    </div>
  )
}

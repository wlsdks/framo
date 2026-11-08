import { memo, type CSSProperties } from 'react'
import { BACKDROP_CELL, backdropOf } from '../deck/backdrops'
import { BOARD_COLS, BOARD_ROWS } from '../deck/blocks'
import type { Slide } from '../deck/types'
import { backdropMotion } from '../motion/backdrop'

// 장의 배경(글과 컴포넌트 뒤의 그래픽). 늘 끝 모습을 SVG로 그려 두고(편집 화면, 목록, PDF, PPT, 내보낸 HTML),
// 발표할 때는 엔진이 장을 움직이며 보내는 알림(mo-backdrop)을 받아 같은 그림을 캔버스로 움직인다(motion/backdrop.ts).
// 알림을 받는 곳은 문서에 하나다: 앱은 여기서, 내보낸 HTML은 뷰어가 같은 함수로 연다

export const backdrops = backdropMotion()
if (typeof document !== 'undefined') backdrops.listen(document)

/** 장 가장자리에 닿지 않는 쪽은 그림이 서서히 옅어진다(자리의 네모 끝이 선처럼 보이지 않게). 닿는 쪽은 장 밖까지 이어진 것처럼 그대로 */
function fadeMask(x: number, y: number, w: number, h: number, W: number, H: number): CSSProperties {
  const L = x > 0 ? Math.min(220, W * 0.24) : 0
  const R = x + w < BOARD_COLS ? Math.min(220, W * 0.24) : 0
  const T = y > 0 ? Math.min(180, H * 0.24) : 0
  const B = y + h < BOARD_ROWS ? Math.min(180, H * 0.24) : 0
  if (!L && !R && !T && !B) return {}
  // 곧은 기울기는 끝에서 꺾여 보여서, 처음과 끝을 눕힌 곡선(0, 0.15, 0.55, 1)으로 잇는다
  const ramp = (dir: string, a: number, b: number) =>
    `linear-gradient(${dir}, transparent 0, rgb(0 0 0 / 0.15) ${a * 0.3}px, rgb(0 0 0 / 0.55) ${a * 0.6}px, #000 ${a}px, #000 calc(100% - ${b}px), rgb(0 0 0 / 0.55) calc(100% - ${b * 0.6}px), rgb(0 0 0 / 0.15) calc(100% - ${b * 0.3}px), transparent 100%)`
  const mask = `${ramp('to right', L, R)}, ${ramp('to bottom', T, B)}`
  return { maskImage: mask, WebkitMaskImage: mask, maskComposite: 'intersect', WebkitMaskComposite: 'source-in' }
}

export const Backdrop = memo(function Backdrop({ value }: { value: Slide['backdrop'] }) {
  const b = backdropOf({ backdrop: value })
  if (!b) return null
  const { x, y, w, h } = b.at
  const W = w * BACKDROP_CELL.w
  const H = h * BACKDROP_CELL.h
  const style: CSSProperties = { left: x * BACKDROP_CELL.w, top: y * BACKDROP_CELL.h, width: W, height: H, ...fadeMask(x, y, w, h, W, H) }
  return (
    <div className="s-bd" data-bd={b.kind} data-w={W} data-h={H} data-x={x} data-y={y} data-strength={b.strength} style={style} aria-hidden="true">
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} dangerouslySetInnerHTML={{ __html: backdrops.still(b.kind, W, H, b.strength) }} />
    </div>
  )
})

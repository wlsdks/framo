// 부품: 퍼짐 (spread). 모양은 styles/blocks/spread.css, 움직임은 motion/engine.ts의 nativeAuto

import type { CSSProperties } from 'react'
import { BLOCKS } from '../../deck/blocks'
import { cx } from '../../lib/cx'
import { useSlide } from '../context'
import { IT, ItemTools, T } from '../fields'

/** 사람 하나를 눈금 하나로: 100개가 곧 100% */
export const SPREAD_N = 100
export const SPREAD_COLS = 20
const ROWS = SPREAD_N / SPREAD_COLS

/** '2.5%', '16', '50 %' 같은 글에서 몫(0~100)을 읽는다. 못 읽으면 null */
export function spreadShare(text: string): number | null {
  const m = text.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/)
  if (!m) return null
  const v = Number(m[0])
  return Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : null
}

/**
 * 눈금의 차례: 왼쪽 가운데(씨앗)에서 가까운 차례. 퍼짐이 물결처럼 번지는 모양이 되고, 같은 거리는 위쪽 먼저(정해진 차례라
 * 발표할 때마다 같은 그림). 세로 거리는 칸 높이만큼(눈금 칸이 세로로 길다) 늘려 잰다
 */
export const SPREAD_ORDER: number[] = (() => {
  const cells = Array.from({ length: SPREAD_N }, (_, i) => {
    const c = i % SPREAD_COLS
    const r = Math.floor(i / SPREAD_COLS)
    const dx = c
    const dy = (r - (ROWS - 1) / 2) * 1.6
    return { i, d: Math.hypot(dx, dy), r }
  })
  cells.sort((a, b) => a.d - b.d || a.r - b.r)
  const order = new Array<number>(SPREAD_N)
  cells.forEach((c, k) => (order[c.i] = k))
  return order
})()

/**
 * 눈금마다 기울기(도): 아직 퍼지지 않은 사람은 저마다 다른 쪽을 본다. 정해진 값이라(무작위가 아니라) 발표할 때마다 같은 그림.
 * -32도 ~ 32도 사이에 고르게 흩어진다(더 기울면 옆 눈금과 맞닿아 지그재그로 엉켜 보였다)
 */
export const SPREAD_TILT: number[] = Array.from({ length: SPREAD_N }, (_, i) => {
  const h = Math.sin((i + 1) * 12.9898) * 43758.5453
  return Math.round((h - Math.floor(h)) * 64 - 32)
})

/** 단계마다 몫(누적, 0~100). 읽지 못한 값은 앞 단계와 같게(뒤로 가지 않게) */
export function spreadStops(values: string[]): number[] {
  let prev = 0
  return values.map((v) => {
    const s = spreadShare(v)
    prev = s === null ? prev : Math.max(prev, s)
    return prev
  })
}

/**
 * 퍼짐: 사람 하나를 가는 눈금 하나로 놓은 100개의 판(20 × 5). 아직 퍼지지 않은 눈금은 저마다 다른 쪽으로 기울어 있고(옅게),
 * 퍼진 눈금은 똑바로 서서 같은 쪽을 본다(결이 맞춰진다). 눈금은 왼쪽 가운데의 씨앗에서 가까운 차례로 서서 물결처럼 번진 모양이 된다. 지난 단계의 눈금은 강조색 농담, 지금 단계까지 새로 퍼진 눈금은 강조색,
 * 남은 눈금은 옅게. 옆에는 단계마다 이름과 몫. 점과 고리는 흔한 그림이라 쓰지 않는다(눈금은 사람 수를 세는 표시).
 * 발표할 때는 단계마다 눈금이 씨앗에서부터 번져 나가고 그 단계의 이름과 몫이 올라온다. '하나씩'이면 단계마다 멈춘다(engine.ts)
 */
export function Spread() {
  const { slide } = useSlide()
  const items = slide.items.slice(0, BLOCKS.spread.items!.max)
  const stops = spreadStops(items.map((it) => it.meta))
  const n = items.length
  const now = Number.isInteger(slide.options.highlight) ? Math.max(0, Math.min(n - 1, slide.options.highlight as number)) : n - 1
  /** 눈금 k(번지는 차례)가 몇째 단계에 칠해지는지. 어느 단계에도 들지 않으면 -1 */
  const stageOf = (k: number) => stops.findIndex((s) => k < Math.round(s))
  return (
    <div className="bk-spr" data-n={n}>
      <div className="bk-spr-field">
        <T k="label" className="bk-spr-l" oneLine />
        <div className="bk-spr-grid" aria-hidden="true">
          {Array.from({ length: SPREAD_N }, (_, i) => {
            const k = SPREAD_ORDER[i]
            const st = stageOf(k)
            return (
              <span
                key={i}
                className={cx('bk-spr-m', st >= 0 && st < now && 'is-past', st === now && 'is-now')}
                data-st={st}
                style={{ '--o': k, '--r': `${SPREAD_TILT[i]}deg` } as CSSProperties}
              />
            )
          })}
        </div>
        <T k="note" className="bk-spr-n" multiline />
      </div>
      <ol className="bk-spr-list">
        {items.map((it, i) => (
          <li key={it.id} className={cx('it bk-spr-it', i === now && 'is-now', i > now && 'is-next')}>
            <IT i={i} k="meta" className="bk-spr-v" oneLine />
            <IT i={i} k="title" className="bk-spr-t" multiline />
            <ItemTools i={i} keepBlank />
          </li>
        ))}
      </ol>
    </div>
  )
}

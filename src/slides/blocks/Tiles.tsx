// 부품: 칸 조립 (tiles). 모양은 styles/blocks/tiles.css, 움직임은 motion/engine.ts의 nativeAuto

import type { CSSProperties } from 'react'
import { cx } from '../../lib/cx'
import { useSlide } from '../context'
import { T } from '../fields'
import { amountPair } from '../numbers'
import { pctText, useDemo } from './parts'

/** 칸 사이: 칸 한 변에 대한 비율(tiles.css의 --tl-g와 같은 값) */
const GAP = 0.3

/**
 * 칸을 몇 줄 몇 칸으로 놓을지: 줄 수(r)를 √n 부근에서 고르되, 빈자리(r×c − n)가 가장 적은 것, 같으면 더 네모난 것.
 * 열 개까지는 한 줄. 60이면 6줄 10칸, 48이면 6줄 8칸(7줄 7칸은 한 자리가 빈다)
 */
export function tileGrid(n: number): { r: number; c: number } {
  if (n <= 10) return { r: 1, c: Math.max(1, n) }
  const top = Math.floor(Math.sqrt(n))
  let best = { r: top, c: Math.ceil(n / top) }
  for (let r = top - 1; r >= Math.ceil(top / 2); r--) {
    const c = Math.ceil(n / r)
    if (r * c - n < best.r * best.c - n) best = { r, c }
  }
  return best
}

/** 줄을 반으로 줄여 옆으로 눕힌 배치가 칸을 더 크게 그리는 상자의 가로세로 비율(0.5 단계로 올림, tiles.css의 @container) */
function flatAt(r: number, c: number): { rf: number; cf: number; at: number } {
  const rf = Math.max(1, Math.ceil(r / 2))
  const cf = Math.ceil((r * c) / rf)
  const span = (k: number) => k + (k - 1) * GAP
  // 눕힌 배치가 너비에 걸리는 칸 크기(W / cf)가 세운 배치가 높이에 걸리는 크기(H / r)보다 커지는 곳
  return { rf, cf, at: Math.min(6, Math.ceil((span(cf) / span(r)) * 2) / 2) }
}

/**
 * 칸 조립: 비율을 작은 네모 칸으로. 전체가 100까지의 정수면 칸 하나가 하나(60명 중 48명이면 칸 60개), 아니면 칸 100개로 백분율.
 * 채운 칸은 왼쪽 단부터 아래에서 위로 쌓는다(단 하나가 10%). 몇 중 몇(ratio)이 점을 차례로 맺는 것과 달리, 발표할 때 흩어져 있던
 * 칸이 날아와 한 판으로 맞춰지고 채운 칸이 차례로 물든다
 */
export function Tiles() {
  const { mode, folds } = useSlide()
  const { demo, read } = useDemo(['value'])
  const valueText = read('value').trim()
  const ofText = read('of').trim()
  const pair = amountPair(valueText, ofText || '100')
  const per = pair ? pair.b.scale / pair.b.place : 1
  const value = pair ? pair.a.base / per : null
  const total = pair ? pair.b.base / per : null
  const ok = value !== null && total !== null && total > 0 && value >= 0 && value <= total
  // 10개 중 4.5개를 다섯 칸으로 반올림하면 다른 수가 된다. 정수가 아니면 100칸의 비율로 그린다.
  const exact = ok && Number.isInteger(value) && Number.isInteger(total) && total >= 1 && total <= 100 && pair!.kind !== '%'
  const n = !ok ? 0 : exact ? total : 100
  const share = ok ? Math.min(1, Math.max(0, value / total)) : 0
  const on = !ok ? 0 : exact ? Math.round(Math.min(Math.max(value, 0), total)) : Math.round(share * 100)
  const { r, c } = tileGrid(n)
  const flat = flatAt(r, c)
  // 몫: 값이 백분율이 아닐 때만(‘72%’ 옆에 ‘72%’를 또 쓰지 않게)
  const pct = ok && pair!.kind !== '%' && !valueText.includes('%') ? pctText(share * 100) : ''
  // 전체는 고를 때만 여는 칸: 비우면 100이라 백분율에는 필요 없다
  const ofField = !!ofText || (mode !== 'final' && !folds?.has('of'))
  return (
    <div className={cx('bk-tl', demo && 'is-demo')}>
      <div className="bk-tl-text">
        <T k="label" as="p" className="bk-tl-l" />
        <T k="value" as="p" className="bk-tl-v" numeral />
        {(ofField || pct) && (
          <p className="bk-tl-of">
            {ofField && (
              <span className="bk-tl-whole">
                <span className="bk-tl-k">전체</span>
                <T k="of" as="span" className="bk-tl-t" oneLine />
              </span>
            )}
            {pct && <span className="bk-tl-pct">{pct}</span>}
          </p>
        )}
        <T k="note" as="p" className="bk-tl-n" multiline />
        {mode === 'edit' && !demo && !!valueText && !ok && <p className="bk-tl-n">0 이상이고 전체보다 크지 않은 숫자를 적어 주세요.</p>}
      </div>
      {n > 0 && (
        <div className="bk-tl-box" aria-hidden="true" style={{ '--r': r, '--c': c, '--rf': flat.rf, '--cf': flat.cf } as CSSProperties}>
          <div className="bk-tl-grid" data-flat={flat.at} data-n={n}>
            {Array.from({ length: n }, (_, i) => (
              <span key={i} className={cx('bk-tl-sq', i < on && 'is-on')} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

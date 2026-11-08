// 부품: 확산 곡선 (adoption). 모양은 styles/blocks/adoption.css, 움직임은 motion/engine.ts의 nativeAuto

import type { CSSProperties } from 'react'
import { BLOCKS } from '../../deck/blocks'
import { cx } from '../../lib/cx'
import { useSlide } from '../context'
import { IT, ItemTools, T } from '../fields'

/** Rogers의 다섯 무리가 차지하는 몫(%). 표준편차 경계(평균 −2σ, −σ, 평균, +σ)로 나눈 종 모양 곡선의 넓이다 */
export const ROGERS = [2.5, 13.5, 34, 34, 16]
/** 경계(σ): 첫 무리의 왼쪽 끝과 마지막 무리의 오른쪽 끝은 −3σ, +3σ로 그린다 */
const EDGES = [-3, -2, -1, 0, 1, 3]
export const ADOPT_W = 1000
export const ADOPT_H = 400

const pdf = (z: number) => Math.exp((-z * z) / 2)
/** 표준 정규 누적 분포(근사, Abramowitz–Stegun 7.1.26) */
function cdf(z: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2)
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp((-z * z) / 2)
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2
}
const X = (z: number) => ((z + 3) / 6) * ADOPT_W
/** 종 모양은 높이의 위 10%를 남기고, S자 누적은 바닥에서 위 끝까지 */
const BELL_Y = (z: number) => ADOPT_H - pdf(z) * ADOPT_H * 0.9
const S_Y = (z: number) => ADOPT_H - ((cdf(z) - cdf(-3)) / (cdf(3) - cdf(-3))) * ADOPT_H * 0.96
const r1 = (v: number) => Math.round(v * 10) / 10

function line(from: number, to: number, y: (z: number) => number, steps: number): string {
  const pts: string[] = []
  for (let k = 0; k <= steps; k++) {
    const z = from + ((to - from) * k) / steps
    pts.push(`${r1(X(z))} ${r1(y(z))}`)
  }
  return pts.join(' L ')
}

/** 무리 k의 종 아래 넓이(닫힌 모양) */
function band(k: number): string {
  const a = EDGES[k]
  const b = EDGES[k + 1]
  return `M ${r1(X(a))} ${ADOPT_H} L ${line(a, b, BELL_Y, 24)} L ${r1(X(b))} ${ADOPT_H} Z`
}

/** 경계마다의 누적 몫(%): 2.5, 16, 50, 84, 100 */
export const CUMULATIVE = ROGERS.reduce<number[]>((acc, v) => [...acc, (acc[acc.length - 1] ?? 0) + v], [])

/**
 * 확산 곡선: 새 기술이 퍼지는 차례(Everett Rogers, 1962). 새로 받아들인 사람 수의 종 모양 곡선을 다섯 무리로 나누고(2.5, 13.5, 34,
 * 34, 16%), 같은 데이터의 누적인 S자 곡선을 겹친다. 지금 단계(highlight)의 무리는 강조색, 지난 무리는 강조색 농담, 남은 무리는
 * 옅게. 바닥선 아래에 경계마다 누적 몫(2.5% → 16% → 50% → 84%)을
 * 적는다. 발표할 때는 세로선(시간)이 왼쪽부터 훑으며 무리가 차오르고 S자가 같이 자란 뒤, 지금 무리가 한 번 밝아진다(engine.ts)
 */
export function Adoption() {
  const { slide } = useSlide()
  const items = slide.items.slice(0, BLOCKS.adoption.items!.max)
  const n = Math.min(items.length, ROGERS.length)
  const now = Number.isInteger(slide.options.highlight) ? Math.max(-1, Math.min(n - 1, slide.options.highlight as number)) : 0
  const pct = (v: number) => `${r1((v / ADOPT_W) * 100)}%`
  return (
    <div className="bk-ad" data-n={n} style={{ '--now': now } as CSSProperties}>
      <div className="bk-ad-head">
        <T k="label" className="bk-ad-l" oneLine />
        <T k="note" className="bk-ad-n" multiline />
      </div>
      <div className="bk-ad-stage">
        <div className="bk-ad-fill">
          <svg className="bk-ad-svg" viewBox={`0 0 ${ADOPT_W} ${ADOPT_H}`} preserveAspectRatio="none" aria-hidden="true">
            {ROGERS.slice(0, n).map((_, k) => (
              <path key={k} className={cx('bk-ad-band', k < now && 'is-past', k === now && 'is-now')} d={band(k)} />
            ))}
            <path className="bk-ad-s" d={`M ${line(-3, 3, S_Y, 96)}`} pathLength={100} />
          </svg>
        </div>
        <svg className="bk-ad-svg bk-ad-frame" viewBox={`0 0 ${ADOPT_W} ${ADOPT_H}`} preserveAspectRatio="none" aria-hidden="true">
          {EDGES.slice(1, n).map((z) => (
            <line key={z} className="bk-ad-edge" x1={X(z)} x2={X(z)} y1={BELL_Y(z)} y2={ADOPT_H} />
          ))}
          <path className="bk-ad-bell" d={`M ${line(-3, 3, BELL_Y, 96)}`} pathLength={100} />
          <line className="bk-ad-base" x1="0" x2={ADOPT_W} y1={ADOPT_H} y2={ADOPT_H} />
        </svg>
        <T k="total" className="bk-ad-sl" oneLine />
        <T k="curve" className="bk-ad-bl" oneLine />
        <span className="bk-ad-sweep" aria-hidden="true" />
      </div>
      {/* 경계마다 누적 몫: 이 선을 넘으면 몇 %가 쓰는지. 바닥선 아래의 눈금 글이라 곡선과 겹치지 않는다 */}
      <div className="bk-ad-scale" aria-hidden="true">
        {CUMULATIVE.slice(0, n - 1).map((v, k) => (
          <span key={k} className="bk-ad-cum" style={{ left: pct(X(EDGES[k + 1])) }}>
            {v}%
          </span>
        ))}
      </div>
      {/* 항목 칸은 곡선의 무리와 같은 너비: 경계(σ)가 같은 간격이라 앞 넷은 1, 마지막(+1σ~+3σ)은 2 */}
      <ol className="bk-ad-list" style={{ gridTemplateColumns: EDGES.slice(0, n).map((z, k) => `${EDGES[k + 1] - z}fr`).join(' ') }}>
        {items.slice(0, n).map((it, i) => (
          <li key={it.id} className={cx('it bk-ad-it', i === now && 'is-now', i < now && 'is-past')}>
            <IT i={i} k="title" className="bk-ad-t" multiline />
            <IT i={i} k="meta" className="bk-ad-m" multiline />
            <ItemTools i={i} keepBlank />
          </li>
        ))}
      </ol>
    </div>
  )
}

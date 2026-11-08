// 부품: 모이고 퍼지기 (hub). 모양은 styles/blocks/hub.css, 움직임은 motion/engine.ts의 nativeAuto

import type { CSSProperties } from 'react'
import { BLOCKS } from '../../deck/blocks'
import { isBlankItem } from '../../deck/fields'
import { cx } from '../../lib/cx'
import { useSlide } from '../context'
import { IT, ItemTools, T } from '../fields'

/**
 * 선을 긋는 좌표계(SVG viewBox). 무대는 칸을 가득 채우고 이 좌표계는 무대 크기대로 늘어난다(preserveAspectRatio="none"):
 * 비율을 고정하면 넓고 낮은 칸이나 옆에 다른 컴포넌트가 선 칸에서 그림이 가운데에 작게 떠 한쪽이 25% 넘게 비었다(checkAssembly).
 * 늘어나도 선 굵기는 그대로(vector-effect)이고, 둥글어야 하는 것(점, 가운데 원, 빛)은 SVG가 아니라 HTML로 얹어 찌그러지지 않는다
 */
export const HUB_W = 1000
export const HUB_H = 560

export interface HubSpot {
  x: number
  y: number
  /** 이 곳에서 가운데로(모이기), 가운데에서 이 곳으로(퍼지기) 흐르는 길. 데이터 조각이 이 길을 따라간다 */
  d: string
}

const r = (v: number) => Math.round(v * 10) / 10

/**
 * 곳들의 자리와 길. 모이기는 곳들을 왼쪽 호에, 가운데를 오른쪽에 두고, 퍼지기는 거꾸로. 곳의 이름이 점 바깥쪽에 붙어 그림의
 * 무게가 그쪽으로 넓어서, 이름까지 셈해 가운데가 맞게 가운데 원은 0.69쯤, 곳들은 0.36쯤에 둔다. 호는 가운데 쪽으로 불룩하다.
 * 길은 곳에서 가로로 나와 가운데로 부드럽게 휘어 든다(2차 곡선). 끝은 가운데 원 밑으로 들어가 원이 덮는다
 */
export function hubSpots(n: number, out: boolean): { center: { x: number; y: number }; spots: HubSpot[] } {
  // 가운데 원은 무게가 커서, 곳들과 이름표까지 셈한 그림의 좌우 끝을 맞춰도 원 쪽으로 기울어 보였다(사용자: 퍼지기에서 원이 왼쪽으로
  // 치우친다). 원을 안쪽으로 조금 들이고 곳들도 그만큼 원 쪽으로 당겨, 원과 이름 묶음이 본문 가운데를 사이에 두고 마주 선다
  const center = { x: out ? 310 : 690, y: HUB_H / 2 }
  const top = 56
  const span = HUB_H - top * 2
  const spots = Array.from({ length: n }, (_, i) => {
    const f = n === 1 ? 0.5 : i / (n - 1)
    const bulge = Math.sin(Math.PI * f) * 70
    const x = out ? 640 - bulge : 360 + bulge
    const y = top + span * f
    const mid = (x + center.x) / 2
    const from = out ? center : { x, y }
    const to = out ? { x, y } : center
    return { x, y, d: `M ${r(from.x)} ${r(from.y)} Q ${r(mid)} ${r(y)} ${r(to.x)} ${r(to.y)}` }
  })
  return { center, spots }
}

const pct = (v: number, of: number) => `${r((v / of) * 100)}%`

/**
 * 모이고 퍼지기: 여러 곳의 것이 가운데로 모여들거나(모이기), 가운데에서 여러 곳으로 퍼져 나간다(퍼지기).
 * 선과 흐르는 조각은 SVG, 점과 가운데 계기판은 HTML 위의 SVG, 글은 그 위의 HTML(글자 크기 단계를 그대로 쓰려고).
 * 번짐 빛과 칠한 원, 네온처럼 빛나는 조각은 쓰지 않는다: 흔한 'AI 대시보드' 모양이다(사용자). 가는 선과 눈금, 강조색은 데이터가 닿는 순간에만.
 * 발표할 때 선이 그어진 뒤 데이터 조각이 쉬지 않고 흐르고, 닿을 때마다 가운데 테와 끝점이 잠깐 강조색으로 밝아진다(engine.ts).
 * 멈춰 있는 그림(편집, PDF, PPT)에서는 조각을 감춘다
 */
export function Hub() {
  const { slide, mode } = useSlide()
  const out = slide.variant === 'out'
  const shown = slide.items
    .slice(0, BLOCKS.hub.items!.max)
    .map((it, i) => ({ it, i }))
    .filter(({ it }) => mode !== 'final' || !isBlankItem(it))
  const { center, spots } = hubSpots(shown.length, out)
  const at = (p: { x: number; y: number }) => ({ left: pct(p.x, HUB_W), top: pct(p.y, HUB_H) })
  return (
    <div className={cx('bk-hb', out ? 'is-out' : 'is-in')} data-n={shown.length}>
      <div className="bk-hb-stage">
        <svg className="bk-hb-svg" viewBox={`0 0 ${HUB_W} ${HUB_H}`} preserveAspectRatio="none" aria-hidden="true">
          {spots.map((p, k) => (
            <g key={shown[k].it.id} className="bk-hb-way">
              <path className="bk-hb-line" d={p.d} pathLength={100} />
              {/* 길마다 조각 둘(머리와 꼬리): 반 주기 엇갈려 흘러 길이 늘 무엇인가 나르고 있는 것처럼 보인다 */}
              {[0, 1].map((j) => (
                <g key={j} className="bk-hb-bit">
                  <path className="bk-hb-tail" d={p.d} pathLength={100} />
                  <path className="bk-hb-pk" d={p.d} pathLength={100} />
                </g>
              ))}
            </g>
          ))}
        </svg>
        {spots.map((p, k) => (
          <span key={shown[k].it.id} className="bk-hb-spot" style={at(p)} aria-hidden="true">
            <span className="bk-hb-dot" />
          </span>
        ))}
        <div className="bk-hb-core" style={at(center)}>
          {/* 계기판: 바깥 눈금 고리와 안쪽의 가는 테. 칠한 원에 번짐을 두른 흔한 모양 대신 Framo의 지면 말투(가는 선, 정확한 눈금)로 */}
          <svg className="bk-hb-dial" viewBox="0 0 100 100" aria-hidden="true">
            <circle className="bk-hb-ticks" cx="50" cy="50" r="47" pathLength={120} />
            <circle className="bk-hb-rim" cx="50" cy="50" r="41" />
            {/* 데이터가 닿을 때 밝아지는 테: 길마다 하나(engine.ts가 그 길의 조각과 같은 때에 맞춘다) */}
            {spots.map((_, k) => (
              <circle key={k} className="bk-hb-hit" cx="50" cy="50" r="41" />
            ))}
          </svg>
          <div className="bk-hb-hub">
            <T k="center" as="p" className="bk-hb-c" />
            <T k="note" as="p" className="bk-hb-n" />
          </div>
        </div>
        {shown.map(({ it, i }, k) => {
          const p = spots[k]
          return (
            <div
              key={it.id}
              className="it bk-hb-node"
              style={{ top: pct(p.y, HUB_H), ...(out ? { left: `calc(${pct(p.x, HUB_W)} + 34px)` } : { right: `calc(${pct(HUB_W - p.x, HUB_W)} + 34px)` }) } as CSSProperties}
            >
              <IT i={i} k="title" className="bk-hb-t" />
              <IT i={i} k="meta" className="bk-hb-m" />
              <ItemTools i={i} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

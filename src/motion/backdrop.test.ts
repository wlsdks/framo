import { describe, expect, it } from 'vitest'
import { BACKDROP_IDS } from '../deck/backdrops'
import { backdropMotion } from './backdrop'
import { drawKit } from './draw'

const bd = backdropMotion(drawKit())
const SIZES = [
  [1920, 1080],
  [1120, 720],
  [1920, 630],
  [480, 270],
]
/** 그림의 짙기 합(선과 점의 stroke-opacity를 더한 것): 얼마나 보이는지 견주는 잣대 */
const ink = (svg: string) => [...svg.matchAll(/stroke-opacity="([\d.]+)"[^>]*d="([^"]*)"/g)].reduce((s, m) => s + Number(m[1]) * m[2].split('M').length, 0)
/** 들어오기 가운데 한 순간(뜻이 보이는 칸) */
const mid = (kind: string, w: number, h: number) => bd.endOf(kind, w, h) * 0.55

describe('배경의 그림과 움직임', () => {
  it('바깥의 아무것도 참조하지 않아서 소스만으로 다시 만들 수 있다 (내보낸 HTML에 소스가 그대로 들어간다)', () => {
    const kit = (new Function(`return (${drawKit.toString()})`)() as typeof drawKit)()
    const rebuilt = (new Function(`return (${backdropMotion.toString()})`)() as typeof backdropMotion)(kit)
    expect(rebuilt.kinds).toEqual(bd.kinds)
    expect(rebuilt.still('diffuse', 640, 360, 'base', { e: 900 })).toBe(bd.still('diffuse', 640, 360, 'base', { e: 900 }))
  })

  it('배경 목록(deck/backdrops.ts)의 모든 배경을 그린다', () => {
    expect([...bd.kinds].sort()).toEqual([...BACKDROP_IDS].sort())
  })

  it('들어오는 동안의 그림은 크기마다 같고, 수가 아닌 값이 없고, 가볍다', () => {
    for (const kind of bd.kinds)
      for (const [w, h] of SIZES) {
        const e = mid(kind, w, h)
        const svg = bd.still(kind, w, h, 'base', { e })
        expect(svg, `${kind} ${w}×${h}`).toMatch(/^<path /)
        expect(svg).not.toMatch(/NaN|Infinity|undefined/)
        expect(backdropMotion(drawKit()).still(kind, w, h, 'base', { e })).toBe(svg)
        expect(svg.length, `${kind} ${w}×${h}`).toBeLessThan(80_000)
      }
  })

  it('크게 지나가고 거의 남지 않는다: 끝 모습은 들어오는 동안의 10분의 1보다 옅고, 처음 한순간은 비어 있다 (2차 감성 검수의 결정)', () => {
    for (const kind of bd.kinds) {
      const during = ink(bd.still(kind, 1920, 1080, 'base', { e: mid(kind, 1920, 1080) }))
      expect(during, kind).toBeGreaterThan(0)
      expect(ink(bd.still(kind, 1920, 1080)), kind).toBeLessThan(during * 0.1)
      expect(ink(bd.still(kind, 1920, 1080, 'base', { e: 0 })), kind).toBe(0)
    }
  })

  it('색은 글자색 하나이고 옅다 (강조색은 장의 답에만 쓴다)', () => {
    for (const kind of bd.kinds)
      for (const f of [0.3, 0.45, 0.6, 0.75]) {
        const svg = bd.still(kind, 1920, 1080, 'strong', { e: bd.endOf(kind, 1920, 1080) * f })
        expect(svg).not.toMatch(/#[0-9a-f]{3,6}|rgb\(|class=/i)
        // 또렷하게로도 0.45보다 옅게: 밝기의 정점이 장의 제목보다 낮다
        const op = [...svg.matchAll(/stroke-opacity="([\d.]+)"/g)].map((m) => Number(m[1]))
        expect(Math.max(0, ...op), `${kind} ${f}`).toBeLessThanOrEqual(0.45)
      }
  })

  it('짙기는 같은 그림을 옅게, 또렷하게 한다', () => {
    for (const kind of bd.kinds) {
      const e = mid(kind, 1920, 1080)
      expect(ink(bd.still(kind, 1920, 1080, 'soft', { e })), kind).toBeLessThan(ink(bd.still(kind, 1920, 1080, 'base', { e })))
      expect(ink(bd.still(kind, 1920, 1080, 'strong', { e })), kind).toBeGreaterThan(ink(bd.still(kind, 1920, 1080, 'base', { e })))
    }
  })

  it('들어오기는 2초 남짓에 끝난다(장의 글보다 늦게 끝나 마지막 박자를 가져가지 않게, docs/MOTION.md 4절과 9절)', () => {
    for (const kind of bd.kinds)
      for (const [w, h] of SIZES) {
        const end = bd.endOf(kind, w, h)
        expect(end, `${kind} ${w}×${h}`).toBeGreaterThan(900)
        expect(end, `${kind} ${w}×${h}`).toBeLessThanOrEqual(2200)
      }
  })

  it('모르는 배경은 그리지 않는다', () => {
    expect(bd.still('aurora', 1920, 1080)).toBe('')
    expect(bd.still('link', 1920, 1080)).toBe('')
    expect(bd.still('toString', 1920, 1080)).toBe('')
  })
})

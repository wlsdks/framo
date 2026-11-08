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

describe('배경의 그림과 움직임', () => {
  it('바깥의 아무것도 참조하지 않아서 소스만으로 다시 만들 수 있다 (내보낸 HTML에 소스가 그대로 들어간다)', () => {
    const kit = (new Function(`return (${drawKit.toString()})`)() as typeof drawKit)()
    const rebuilt = (new Function(`return (${backdropMotion.toString()})`)() as typeof backdropMotion)(kit)
    expect(rebuilt.kinds).toEqual(bd.kinds)
    expect(rebuilt.still('diffuse', 640, 360)).toBe(bd.still('diffuse', 640, 360))
  })

  it('배경 목록(deck/backdrops.ts)의 모든 배경을 그린다', () => {
    expect([...bd.kinds].sort()).toEqual([...BACKDROP_IDS].sort())
  })

  it('끝 모습은 자리 크기마다 같은 그림이고, 수가 아닌 값이 없다', () => {
    for (const kind of bd.kinds)
      for (const [w, h] of SIZES) {
        const svg = bd.still(kind, w, h)
        expect(svg, `${kind} ${w}×${h}`).toMatch(/^<path /)
        expect(svg).not.toMatch(/NaN|Infinity|undefined/)
        expect(backdropMotion(drawKit()).still(kind, w, h)).toBe(svg)
        // 장 그림(목록, 내보낸 HTML)에 들어가니 가볍게
        expect(svg.length, `${kind} ${w}×${h}`).toBeLessThan(60_000)
      }
  })

  it('색은 글자색과 강조색(bd-a) 둘뿐이고 옅다', () => {
    for (const kind of bd.kinds) {
      const svg = bd.still(kind, 1920, 1080)
      expect(svg).not.toMatch(/#[0-9a-f]{3,6}|rgb\(/i)
      expect(svg.match(/class="([^"]+)"/g)?.every((c) => c === 'class="bd-a"') ?? true).toBe(true)
      // 글자색은 0.45보다 옅게(점과 가는 선). 강조색은 씨앗, 닫는 점 같은 한 곳이라 짙어도 된다
      const ink = [...svg.matchAll(/<path (?!class)[^>]*stroke-opacity="([\d.]+)"/g)].map((m) => Number(m[1]))
      expect(Math.max(...ink), kind).toBeLessThanOrEqual(0.45)
    }
  })

  it('들어오기의 처음은 거의 비어 있다가 끝에서 끝 모습이 된다', () => {
    for (const kind of bd.kinds) {
      const first = bd.still(kind, 1920, 1080, 'base', { e: 0 })
      const last = bd.still(kind, 1920, 1080)
      expect(first.length, kind).toBeLessThan(last.length * 0.5)
      expect(bd.still(kind, 1920, 1080, 'base', { e: 60_000 }).length).toBeGreaterThan(0)
    }
  })

  it('짙기는 같은 그림을 옅게, 또렷하게 한다', () => {
    const opacity = (svg: string) => [...svg.matchAll(/stroke-opacity="([\d.]+)"/g)].reduce((s, m) => s + Number(m[1]), 0)
    for (const kind of bd.kinds) {
      expect(opacity(bd.still(kind, 1920, 1080, 'soft')), kind).toBeLessThan(opacity(bd.still(kind, 1920, 1080)))
      expect(opacity(bd.still(kind, 1920, 1080, 'strong')), kind).toBeGreaterThan(opacity(bd.still(kind, 1920, 1080)))
    }
  })

  it('들어오기는 3초 남짓에 끝난다(장 전체가 3초 안에 자리 잡는다, docs/MOTION.md 4절)', () => {
    for (const kind of bd.kinds)
      for (const [w, h] of SIZES) {
        const end = bd.endOf(kind, w, h)
        expect(end, `${kind} ${w}×${h}`).toBeGreaterThan(1500)
        expect(end, `${kind} ${w}×${h}`).toBeLessThanOrEqual(3300)
      }
  })

  it('모르는 배경은 그리지 않는다', () => {
    expect(bd.still('aurora', 1920, 1080)).toBe('')
    expect(bd.still('toString', 1920, 1080)).toBe('')
  })
})

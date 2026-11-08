import { describe, expect, it } from 'vitest'
import { drawKit } from './draw'

const kit = drawKit()

describe('모션 그래픽을 그리는 도구', () => {
  it('바깥의 아무것도 참조하지 않아서 소스만으로 다시 만들 수 있다 (내보낸 HTML에 소스가 그대로 들어간다)', () => {
    const rebuilt = (new Function(`return (${drawKit.toString()})`)() as typeof drawKit)()
    expect(Object.keys(rebuilt)).toEqual(Object.keys(kit))
    expect(rebuilt.ease.out(0.3)).toBe(kit.ease.out(0.3))
  })

  it('이징은 0에서 0, 1에서 1이고 넘치지 않는다', () => {
    for (const [name, f] of Object.entries(kit.ease)) {
      expect(f(0), name).toBe(0)
      expect(f(1), name).toBe(1)
      for (let x = 0; x <= 1; x += 0.01) expect(f(x), `${name} ${x}`).toBeLessThanOrEqual(1.0001)
    }
  })

  it('느린 흐름은 0에서 움직이지 않고 시작한다(들어오기 끝과 이어진다)', () => {
    expect(kit.amp(0)).toBe(0)
    expect(kit.clock(0)).toBe(0)
    // 시계는 처음에 멈춰 있다가(빠르기 0) ramp가 지나면 제 빠르기
    expect(kit.clock(10) - kit.clock(0)).toBeLessThan(0.1)
    expect(kit.clock(10_010) - kit.clock(10_000)).toBeCloseTo(10)
    expect(Math.abs(kit.sway(0, 20_000, 0))).toBe(1)
  })

  it('드문 일은 주기마다 한 번, 정해진 길이 동안만', () => {
    expect(kit.every(1000, 3000, 13_000, 4000)).toBeNull()
    expect(kit.every(3000, 3000, 13_000, 4000)).toEqual([0, 0])
    expect(kit.every(8000, 3000, 13_000, 4000)).toBeNull()
    expect(kit.every(16_000 + 2000, 3000, 13_000, 4000)).toEqual([1, 0.5])
  })

  it('같은 씨앗의 난수는 늘 같다', () => {
    const a = kit.rng(7)
    const b = kit.rng(7)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })

  it('SVG 그리기는 같은 짙기와 굵기를 한 길로 모으고, 강조색은 class 하나로 가른다', () => {
    const P = kit.svgPaint(1)
    P.dot(10, 10, 2, 0, 0.2)
    P.dot(20, 10, 2, 0, 0.2)
    P.dot(30, 10, 2, 1, 0.9)
    P.to(0, 0)
    P.to(10, 10)
    P.stroke(1, 0, 0.1)
    const svg = P.markup()
    expect(svg.match(/<path/g)).toHaveLength(3)
    // 선만 이음(stroke-linejoin)을 갖는다: 작은 그림이 선만 골라 화면 1px로 그릴 수 있게
    expect(svg.match(/stroke-linejoin/g)).toHaveLength(1)
    expect(svg).toContain('M10 10h0M20 10h0')
    expect(svg.match(/class="mo-a"/g)).toHaveLength(1)
    // 짙기 배율을 곱하되 0.95를 넘지 않는다. 강조색의 class는 쓰는 쪽이 정할 수 있다
    // 평평한 끝(flat)은 따로 모이고 강조색 class는 그대로
    const F = kit.svgPaint(1)
    F.to(0, 0)
    F.to(10, 0)
    F.stroke(1, 1, 0.5, false, true)
    expect(F.markup()).toMatch(/class="mo-a"[^>]*stroke-linecap="butt"/)
    const Q = kit.svgPaint(2, 'cine-a')
    Q.dot(0, 0, 1, 1, 0.6)
    expect(Q.markup()).toMatch(/class="cine-a"[^>]*stroke-opacity="0.95"/)
  })
})

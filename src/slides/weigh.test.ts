import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { weighAngle, weighFigure, weighGap } from './weigh'

describe('저울의 셈', () => {
  it('무거운 쪽으로 기운다: 오른쪽이 무거우면 양수, 왼쪽이 무거우면 음수', () => {
    expect(weighFigure(6, 22)).toMatchObject({ heavy: 1 })
    expect(weighFigure(6, 22)!.tilt).toBeGreaterThan(0)
    expect(weighFigure(30, 9)).toMatchObject({ heavy: 0 })
    expect(weighFigure(30, 9)!.tilt).toBeLessThan(0)
    // 좌우만 바꾸면 기울기의 크기는 같다
    expect(weighFigure(22, 6)!.tilt).toBeCloseTo(-weighFigure(6, 22)!.tilt, 10)
  })

  it('세 배부터는 끝까지 기울고 더 기울지 않는다', () => {
    expect(weighFigure(10, 30)!.tilt).toBe(1)
    expect(weighFigure(10, 300)!.tilt).toBe(1)
    expect(weighFigure(0, 5)!.tilt).toBe(1)
    expect(weighFigure(10, 20)!.tilt).toBeLessThan(1)
  })

  it('조금만 달라도 기운 것이 보이고, 차이가 클수록 더 기운다', () => {
    const near = weighFigure(100, 102)!
    expect(near.heavy).toBe(1)
    // 끝까지 기운 것의 3할: 저울대 끝이 수평에서 2도 남짓 벗어난다
    expect(near.tilt).toBeGreaterThanOrEqual(0.3)
    expect(near.tilt).toBeLessThan(0.32)
    expect(weighFigure(100, 150)!.tilt).toBeGreaterThan(near.tilt)
    expect(weighFigure(100, 250)!.tilt).toBeGreaterThan(weighFigure(100, 150)!.tilt)
  })

  it('두 값이 같으면 수평이고 무거운 쪽이 없다', () => {
    expect(weighFigure(8, 8)).toEqual({ tilt: 0, heavy: null, first: -1 })
    expect(weighFigure(0, 0)).toEqual({ tilt: 0, heavy: null, first: 0 })
  })

  it('모르는 값이나 0보다 작은 값으로는 재지 않는다', () => {
    expect(weighFigure(null, 5)).toBeNull()
    expect(weighFigure(5, null)).toBeNull()
    expect(weighFigure(-1, 5)).toBeNull()
    expect(weighFigure(5, Infinity)).toBeNull()
    expect(weighFigure(NaN, 5)).toBeNull()
  })

  it('왼쪽만 올린 동안에는 왼쪽이 끝까지 내려가 있다(왼쪽이 0이면 수평 그대로)', () => {
    expect(weighFigure(6, 22)!.first).toBe(-1)
    expect(weighFigure(0, 22)!.first).toBe(0)
  })

  it('저울대의 각도는 CSS의 기울기(--wg-slope)와 같은 값에서 나온다', () => {
    // 글 묶음이 오르내리는 만큼과 저울대 끝이 내려가는 만큼은 CSS가, 저울대의 각도는 여기서 셈한다: 두 값이 어긋나면 글이 저울대에 닿는다
    const css = readFileSync(new URL('./styles/blocks/weigh.css', import.meta.url), 'utf8')
    const slope = Number(/--wg-slope:\s*([\d.]+)/.exec(css)?.[1])
    expect(slope).toBeGreaterThan(0)
    expect(Math.tan((weighAngle(1) * Math.PI) / 180)).toBeCloseTo(slope, 10)
    expect(weighAngle(-1)).toBeCloseTo(-weighAngle(1), 10)
    expect(weighAngle(0)).toBe(0)
  })
})

describe('저울이 말하는 차이', () => {
  it('두 배부터는 몇 배인지 말한다', () => {
    expect(weighGap(6, 22, '시간')).toBe('3.7배')
    expect(weighGap(22, 6, '시간')).toBe('3.7배')
    expect(weighGap(10, 20, '건')).toBe('2배')
    expect(weighGap(3, 100, '건')).toBe('33배')
  })

  it('두 배가 안 되면 얼마나 더 큰지를 단위와 함께 말한다', () => {
    expect(weighGap(2900, 3400, '만 원')).toBe('+500만 원')
    expect(weighGap(1.2, 0.95, '억')).toBe('+0.25억')
    expect(weighGap(100, 104, '')).toBe('+4')
  })

  it('%끼리의 차이는 %p다', () => {
    expect(weighGap(40, 52, '%')).toBe('+12%p')
  })

  it('같거나 가벼운 쪽이 0이면 말하지 않는다', () => {
    expect(weighGap(8, 8, '시간')).toBe('')
    expect(weighGap(0, 8, '시간')).toBe('')
    expect(weighGap(8, 0, '시간')).toBe('')
    // 반올림하면 0인 차이
    expect(weighGap(100, 100.001, '')).toBe('')
  })
})

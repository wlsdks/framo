import { describe, expect, it } from 'vitest'
import { JOURNEY_BOX, journeyFigure } from './journey'

/** 길(d)의 삼차 구간마다 양 끝과 조절점의 높이(0~1) */
function segments(d: string): number[][] {
  return [...d.matchAll(/C ([^C L]+) ([^,]+), (\S+) ([^,]+), (\S+) (\S+)/g)].map((m) => [m[2], m[4], m[6]].map((v) => Number(v) / JOURNEY_BOX))
}

/** 구간마다 곡선이 지나는 높이를 촘촘히 */
function heights(d: string, starts: number[]): number[][] {
  return segments(d).map(([c1, c2, end], k) => {
    const start = starts[k]
    return Array.from({ length: 41 }, (_, i) => {
      const t = i / 40
      const u = 1 - t
      return u * u * u * start + 3 * u * u * t * c1 + 3 * u * t * t * c2 + t * t * t * end
    })
  })
}

describe('여정 곡선의 셈', () => {
  it('가장 높은 값이 위 끝, 가장 낮은 값이 바닥이고 단계는 제 칸의 가운데에 선다', () => {
    const f = journeyFigure([4.2, 3.4, 1.9, 3.7, 4.5])
    expect(f.pts.map((p) => p.x)).toEqual([0.1, 0.3, 0.5, 0.7, 0.9])
    expect(f.pts[4].y).toBe(0)
    expect(f.pts[2].y).toBe(1)
    expect(f.low).toEqual([false, false, true, false, false])
  })

  it('별 차이 없는 값은 골짜기로 부풀리지 않는다', () => {
    const f = journeyFigure([4.2, 4.0, 4.1])
    // 차이 0.2는 가장 큰 값의 35%(1.47)에 한참 못 미친다: 가장 낮은 곳도 판의 위쪽에 머문다
    expect(f.pts[1].y).toBeCloseTo(0.2 / (0.35 * 4.2), 6)
    expect(f.pts[1].y).toBeLessThan(0.2)
    // 그래도 가장 낮은 곳은 가장 낮은 곳이다
    expect(f.low).toEqual([false, true, false])
  })

  it('가장 낮은 값이 여럿이면 모두 가장 낮은 곳이다', () => {
    expect(journeyFigure([1.2, 4.8, 4.6, 1.2, 4.9]).low).toEqual([true, false, false, true, false])
  })

  it('값이 모두 같으면 평평한 선에 강조가 없다', () => {
    const f = journeyFigure([4, 4, 4, 4])
    expect(f.pts.every((p) => p.y === 0)).toBe(true)
    expect(f.low).toEqual([false, false, false, false])
    expect(journeyFigure([0, 0, 0]).pts.every((p) => p.y === 0)).toBe(true)
  })

  it('값을 하나라도 모르면 높낮이를 그리지 않는다', () => {
    for (const values of [[4, null, 2], [4, Number.NaN, 2], [4, Number.POSITIVE_INFINITY, 2]]) {
      const f = journeyFigure(values)
      expect(f.pts.every((p) => p.y === 0)).toBe(true)
      expect(f.low).toEqual([false, false, false])
      expect(f.d).not.toMatch(/NaN|Infinity/)
    }
  })

  it('음수가 섞여도 높낮이가 판 안에 든다', () => {
    const f = journeyFigure([-2, 3, -5, 1])
    expect(f.pts.every((p) => p.y >= 0 && p.y <= 1)).toBe(true)
    expect(f.low).toEqual([false, false, true, false])
  })

  it('곡선은 판의 왼쪽 끝에서 오른쪽 끝까지 평평하게 들어오고 나간다', () => {
    const f = journeyFigure([5, 4, 3, 2, 1])
    expect(f.d.startsWith('M 0 0 L 100 0')).toBe(true)
    expect(f.d.endsWith(`L ${JOURNEY_BOX} ${JOURNEY_BOX}`)).toBe(true)
  })

  it('곡선은 점과 점 사이에서 넘치지 않는다: 값보다 깊은 골짜기도 높은 봉우리도 그리지 않는다', () => {
    const cases = [
      [4.2, 3.4, 1.9, 3.7, 4.5],
      [1, 5, 1, 5, 1, 5],
      [1, 1.1, 5, 5.1, 1],
      [5, 4.9, 1, 0.9, 5],
      [3, 100, 2.9],
      [5, 4, 3, 2, 1],
    ]
    for (const values of cases) {
      const f = journeyFigure(values)
      const ys = f.pts.map((p) => p.y)
      expect(segments(f.d)).toHaveLength(values.length - 1)
      heights(f.d, ys).forEach((seg, k) => {
        const [lo, hi] = [Math.min(ys[k], ys[k + 1]), Math.max(ys[k], ys[k + 1])]
        // 길에 적는 자리는 소수 한 자리(판 1000)라 그만큼의 어긋남은 본다
        for (const y of seg) {
          expect(y).toBeGreaterThanOrEqual(lo - 0.0002)
          expect(y).toBeLessThanOrEqual(hi + 0.0002)
        }
      })
    }
  })

  it('이름표는 제 너비 안에서 곡선이 가장 낮게 내려오는 곳 아래에, 값은 가장 높이 올라가는 곳 위에 선다', () => {
    const f = journeyFigure([4.2, 3.4, 1.9, 3.7, 4.5])
    f.pts.forEach((p, i) => {
      for (const width of ['narrow', 'wide'] as const) {
        expect(f.under[i][width]).toBeGreaterThanOrEqual(p.y - 1e-9)
        expect(f.over[i][width]).toBeLessThanOrEqual(p.y + 1e-9)
        expect(f.under[i][width]).toBeLessThanOrEqual(1)
        expect(f.over[i][width]).toBeGreaterThanOrEqual(0)
      }
      // 좁은 칸의 이름표가 더 넓어서 곡선이 더 내려와 있다
      expect(f.under[i].narrow).toBeGreaterThanOrEqual(f.under[i].wide - 1e-9)
    })
    // 골짜기의 이름표는 바닥 바로 아래, 봉우리의 값은 위 끝 바로 위
    expect(f.under[2].narrow).toBe(1)
    expect(f.over[4].wide).toBe(0)
  })

  it('비탈에 선 단계의 이름표는 오르막 쪽으로 기대고, 봉우리와 골짜기는 가운데에 선다', () => {
    const f = journeyFigure([4.2, 3.4, 1.9, 3.7, 4.5])
    // 장비 받기(내리막 가운데)는 왼쪽이 오르막, 업무 교육(오르막 가운데)은 오른쪽이 오르막
    expect(f.lean[1]).toBeLessThan(0)
    expect(f.lean[3]).toBeGreaterThan(0)
    expect(f.lean[2]).toBe(0)
    // 이웃 이름표와 닿지 않는 만큼만(journey.ts의 LEAN_MAX)
    expect(f.lean.every((s) => Math.abs(s) <= 0.12 + 1e-9)).toBe(true)
    // 평평한 선에서는 아무도 기대지 않는다
    expect(journeyFigure([3, 3, 3]).lean).toEqual([0, 0, 0])
  })
})

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { autoPlace, makeBlock } from '../deck/blocks'
import { makeSlide } from '../deck/generate'
import { createSampleDeck } from '../deck/sample'
import { lensPath, overlapBox, overlapFigure, overlapShare } from './overlap'
import { SlideCanvas } from './SlideCanvas'

/**
 * 겹친 부분의 넓이를 셈과 따로 잰다: 겹친 띠를 세로로 잘게 썰어 두 원이 함께 덮는 높이를 더한다.
 * 셈(overlap.ts)과 같은 식을 쓰면 식이 틀려도 같이 틀린다
 */
function measuredLens(ra: number, rb: number, d: number): number {
  const from = Math.max(-ra, d - rb)
  const to = Math.min(ra, d + rb)
  if (to <= from) return 0
  const n = 40000
  const dx = (to - from) / n
  let sum = 0
  for (let i = 0; i < n; i++) {
    const x = from + (i + 0.5) * dx
    sum += 2 * Math.min(Math.sqrt(Math.max(0, ra * ra - x * x)), Math.sqrt(Math.max(0, rb * rb - (x - d) * (x - d)))) * dx
  }
  return sum
}

describe('겹침의 셈', () => {
  it('원의 넓이는 집단의 크기에 비례하고 큰 원의 반지름이 1이다', () => {
    const f = overlapFigure(320, 210, 134)!
    expect(f.ra).toBe(1)
    expect((f.rb * f.rb) / (f.ra * f.ra)).toBeCloseTo(210 / 320, 9)
    // 오른쪽이 더 커도 같다
    const g = overlapFigure(50, 200, 10)!
    expect(g.rb).toBe(1)
    expect(g.ra * g.ra).toBeCloseTo(50 / 200, 9)
  })

  it('겹친 부분의 넓이는 겹친 수에 비례한다(따로 잰 넓이와 0.1% 안)', () => {
    const cases: [number, number, number][] = [
      [320, 210, 134],
      [100, 100, 50],
      [100, 100, 10],
      [1000, 90, 60],
      [40, 400, 38],
      [7, 5, 4.5],
    ]
    for (const [a, b, both] of cases) {
      const f = overlapFigure(a, b, both)!
      expect(f.kind).toBe('cross')
      const want = (Math.PI * both) / Math.max(a, b)
      expect(Math.abs(measuredLens(f.ra, f.rb, f.d) - want) / want).toBeLessThan(0.001)
      // 걸쳐 겹친 것: 떨어지지도, 한쪽이 다 들어가지도 않았다
      expect(f.d).toBeLessThan(f.ra + f.rb)
      expect(f.d).toBeGreaterThan(Math.abs(f.ra - f.rb))
    }
  })

  it('많이 겹칠수록 두 원이 가까워진다', () => {
    const ds = [10, 40, 80, 120, 160].map((both) => overlapFigure(200, 180, both)!.d)
    for (let i = 1; i < ds.length; i++) expect(ds[i]).toBeLessThan(ds[i - 1])
  })

  it('겹친 수가 0이면 맞닿지 않고 멀리서도 보일 틈을 두고 떨어져 선다', () => {
    const f = overlapFigure(320, 210, 0)!
    expect(f.kind).toBe('apart')
    // 큰 원 반지름의 4분의 1 넘게: 그보다 좁으면 3~5m에서 맞닿은 것으로 보였다
    expect(f.d - (f.ra + f.rb)).toBeGreaterThan(0.25)
    expect(lensPath(f, 100, 0, 0)).toBe('')
    const box = overlapBox(f)
    expect(box.left).toBe(-1)
    expect(box.width).toBeCloseTo(f.d + f.rb + 1, 9)
    expect(box.height).toBe(2)
  })

  it('한쪽이 다른 쪽에 다 들어가면 작은 원이 큰 원 안에 서고, 그 원이 통째로 겹친 부분이다', () => {
    const f = overlapFigure(320, 90, 90)!
    expect(f.kind).toBe('inside')
    // 큰 원의 테두리에 닿지 않는다
    expect(f.d + f.rb).toBeLessThan(f.ra)
    expect(overlapBox(f)).toEqual({ left: -1, width: 2, height: 2 })
    // 겹친 부분의 테두리는 안쪽 원 한 바퀴(가운데 d, 반지름 rb)
    const r = Math.round(f.rb * 100 * 1000) / 1000
    expect(lensPath(f, 100, 100, 100)).toContain(`A${r} ${r} 0 1 1`)
    // 왼쪽 집단이 작아도 같다: 왼쪽 원이 오른쪽 큰 원의 왼쪽 안에 선다
    const g = overlapFigure(90, 320, 90)!
    expect(g.kind).toBe('inside')
    expect(g.d).toBeGreaterThan(0)
    expect(g.d + g.ra).toBeLessThan(g.rb)
    expect(overlapBox(g).width).toBe(2)
    // 크기가 같고 다 겹치면 한 원이다
    expect(overlapFigure(50, 50, 50)).toEqual({ ra: 1, rb: 1, d: 0, kind: 'inside' })
  })

  it('한쪽이 0이면 남은 원 하나만 선다', () => {
    const f = overlapFigure(0, 80, 0)!
    expect(f).toEqual({ ra: 0, rb: 1, d: 0, kind: 'apart' })
    expect(overlapBox(f)).toEqual({ left: -1, width: 2, height: 2 })
    expect(overlapFigure(80, 0, 0)).toEqual({ ra: 1, rb: 0, d: 0, kind: 'apart' })
  })

  it('그릴 수 없으면 null: 읽지 못한 값, 음수, 둘 다 0, 겹친 수가 집단보다 큰 것', () => {
    expect(overlapFigure(null, 210, 134)).toBeNull()
    expect(overlapFigure(320, null, 134)).toBeNull()
    expect(overlapFigure(320, 210, null)).toBeNull()
    expect(overlapFigure(Number.NaN, 210, 134)).toBeNull()
    expect(overlapFigure(Number.POSITIVE_INFINITY, 210, 134)).toBeNull()
    expect(overlapFigure(-5, 210, 0)).toBeNull()
    expect(overlapFigure(0, 0, 0)).toBeNull()
    expect(overlapFigure(320, 210, 211)).toBeNull()
    expect(overlapFigure(0, 210, 5)).toBeNull()
  })

  it('아주 작은 집단과 아주 조금 겹친 것도 보일 만큼은 그린다', () => {
    // 0.01%인 집단도 반지름 8%
    expect(overlapFigure(10000, 1, 0)!.rb).toBeCloseTo(0.08, 9)
    // 0.1%만 겹쳐도 렌즈의 폭이 6%: 떨어진 것(틈)과 구별된다
    const thin = overlapFigure(1000, 1000, 1)!
    expect(thin.kind).toBe('cross')
    expect(thin.ra + thin.rb - thin.d).toBeCloseTo(0.06, 9)
    // 작은 원에서는 렌즈가 그 원의 반지름의 3할을 넘지 않는다
    const tiny = overlapFigure(10000, 64, 1)!
    expect(tiny.ra + tiny.rb - tiny.d).toBeCloseTo(0.3 * tiny.rb, 9)
  })

  it('겹친 부분의 테두리: 두 원이 만나는 위아래 점을 두 호로 잇고, 작은 원이 거의 다 들어가면 그 원의 호가 반 바퀴보다 길다', () => {
    // 같은 크기의 두 원이 반지름만큼 떨어지면 x = d / 2에서 만난다
    const even = { ra: 1, rb: 1, d: 1, kind: 'cross' as const }
    expect(lensPath(even, 100, 100, 100)).toBe('M150 13.397A100 100 0 0 1 150 186.603A100 100 0 0 1 150 13.397Z')
    // 작은 오른쪽 원의 가운데가 만나는 줄보다 왼쪽에 있다: 오른쪽 원의 호가 큰 호
    const deep = overlapFigure(320, 90, 80)!
    expect(lensPath(deep, 100, 100, 100)).toMatch(/^M[\d.]+ [\d.]+A100 100 0 0 1 [\d.]+ [\d.]+A[\d.]+ [\d.]+ 0 1 1 /)
  })

  it('겹친 수가 집단에서 차지하는 몫', () => {
    expect(overlapShare(134, 320)).toBeCloseTo(41.875, 9)
    expect(overlapShare(90, 90)).toBe(100)
    expect(overlapShare(0, 90)).toBe(0)
    expect(overlapShare(5, 0)).toBeNull()
    expect(overlapShare(null, 90)).toBeNull()
    expect(overlapShare(91, 90)).toBeNull()
  })
})

type Fields = Partial<Record<'heading' | 'left' | 'leftValue' | 'right' | 'rightValue' | 'both' | 'bothValue', string>>

const SAMPLE: Fields = { left: '온라인 교육', leftValue: '320명', right: '현장 실습', rightValue: '210명', both: '둘 다 들은 사람', bothValue: '134명' }

function render(fields: Fields, mode: 'final' | 'edit' = 'final'): string {
  const block = makeBlock('overlap')
  const blocks = autoPlace([], { ...block, fields: { ...block.fields, ...fields } })!
  const slide = { ...makeSlide('compose'), blocks }
  return renderToStaticMarkup(createElement(SlideCanvas, { deck: createSampleDeck(), slide, mode }))
}

describe('겹침의 그림', () => {
  it('단위를 붙인 값도 읽어 원 둘과 겹친 부분 하나를 그리고, 집단마다의 몫을 덧붙인다', () => {
    const html = render(SAMPLE)
    expect(html.match(/class="bk-ov-c /g)).toHaveLength(2)
    expect(html.match(/class="bk-ov-lens"/g)).toHaveLength(1)
    expect(html).toContain('온라인 교육의 <b>42%</b>')
    expect(html).toContain('현장 실습의 <b>64%</b>')
    expect(html).not.toContain('is-demo')
    expect(html).not.toContain('is-unknown')
    // 단위를 한 값에만 적어도 같은 그림이다
    const bare = render({ ...SAMPLE, rightValue: '210', bothValue: '134' })
    expect(bare.match(/<svg class="bk-ov-svg"[^>]*>.*?<\/svg>/)?.[0]).toBe(html.match(/<svg class="bk-ov-svg"[^>]*>.*?<\/svg>/)?.[0])
  })

  it('겹친 수가 0이면 원 둘만, 한쪽이 0이면 원 하나만 그리고 몫은 적지 않는다', () => {
    const apart = render({ ...SAMPLE, bothValue: '0명' })
    expect(apart.match(/class="bk-ov-c /g)).toHaveLength(2)
    expect(apart).not.toContain('bk-ov-lens')
    expect(apart).not.toContain('bk-ov-r')
    const one = render({ ...SAMPLE, leftValue: '0명', bothValue: '0명' })
    expect(one.match(/class="bk-ov-c /g)).toHaveLength(1)
    expect(one).toContain('bk-ov-c is-b')
  })

  it('이름을 비운 집단의 몫은 적지 않는다', () => {
    const html = render({ ...SAMPLE, left: '' })
    expect(html).not.toContain('의 <b>42%</b>')
    expect(html).toContain('현장 실습의 <b>64%</b>')
  })

  it('읽을 수 없거나 단위가 섞였거나 겹친 수가 집단보다 크면 발표할 때는 그림 없이 적은 글만 세운다', () => {
    for (const bad of [{ bothValue: '미정' }, { rightValue: '40%' }, { bothValue: '300명' }]) {
      const html = render({ ...SAMPLE, ...bad })
      expect(html).not.toContain('bk-ov-svg')
      expect(html).toContain('is-unknown')
      expect(html).not.toContain('bk-ov-r')
      // 편집할 때만의 알림과 밑줄은 없다
      expect(html).not.toContain('bk-ov-warn')
      expect(html).not.toContain('is-unfit')
    }
    // 적은 글은 그대로 보인다
    expect(render({ ...SAMPLE, bothValue: '미정' })).toContain('미정')
  })

  it('편집할 때 틀린 값을 적어도 그림 자리는 지키고(옅게), 어느 칸을 어떻게 고칠지 알린다', () => {
    const unfit = (html: string) => [...html.matchAll(/class="[^"]*\b(bk-ov-v|bk-ov-bv)\b[^"]*"/g)].map((m) => m[0].includes('is-unfit'))
    // 겹치는 수가 작은 쪽보다 크다: 작은 쪽이 다 든 그림을 옅게, 겹치는 수 칸에 밑줄, 견줄 쪽을 이름과 값으로 짚는다
    const big = render({ ...SAMPLE, bothValue: '300명' }, 'edit')
    expect(big).toContain('bk-ov-svg')
    expect(big).toContain('is-demo')
    expect(big).not.toContain('is-unknown')
    expect(big).toContain('겹치는 수는 현장 실습(210명)보다 클 수 없어요.')
    expect(unfit(big)).toEqual([false, false, true])
    // 틀린 수로 셈한 몫은 적지 않는다
    expect(big).not.toContain('bk-ov-r')
    // 왼쪽이 작으면 왼쪽을, 이름을 비웠으면 자리로 짚는다
    expect(render({ ...SAMPLE, left: '', leftValue: '3명' }, 'edit')).toContain('겹치는 수는 왼쪽(3명)보다 클 수 없어요.')
    // 읽을 수 없는 값, 다른 단위: 그 칸에 밑줄, 그림은 안내의 예시 값으로 옅게
    const word = render({ ...SAMPLE, bothValue: '미정' }, 'edit')
    expect(word).toContain('bk-ov-svg')
    expect(word).toContain('is-demo')
    expect(word).toContain('밑줄 친 값을 다른 값과 같은 단위의 0 이상 숫자로 적어 주세요.')
    expect(unfit(word)).toEqual([false, false, true])
    // 셋 다 0이면 틀린 칸이 따로 없다: 무엇이 모자란지 말한다
    const zero = render({ ...SAMPLE, leftValue: '0명', rightValue: '0명', bothValue: '0명' }, 'edit')
    expect(zero).toContain('두 크기 가운데 하나는 0보다 크게 적어 주세요.')
    expect(unfit(zero)).toEqual([false, false, false])
    expect(unfit(render({ ...SAMPLE, rightValue: '40%' }, 'edit'))).toEqual([false, true, false])
    // 알림은 장의 글과 다른 말투(편집 화면의 경고 색)다
    expect(word).toMatch(/class="bk-ov-warn ed-warn"/)
  })

  it('편집할 때 아직 적지 않은 값은 안내의 예시 값으로 옅게 그리고, 발표할 때는 그리지 않는다', () => {
    const blank: Fields = { left: '', leftValue: '', right: '', rightValue: '', both: '', bothValue: '' }
    const demo = render(blank, 'edit')
    expect(demo).toContain('is-demo')
    expect(demo).toContain('bk-ov-lens')
    // 예시 값으로 셈한 몫은 적지 않고, 쓰는 중에는 알리지 않는다
    expect(demo).not.toContain('bk-ov-r')
    expect(demo).not.toContain('bk-ov-warn')
    // 하나만 적어도 나머지는 예시 값으로 이어 그린다
    const some = render({ ...blank, leftValue: '500명' }, 'edit')
    expect(some).toContain('is-demo')
    expect(some).toContain('bk-ov-svg')
    const final = render(blank)
    expect(final).not.toContain('bk-ov-svg')
    // 겹친 것의 이름과 수를 모두 비웠으면 답 자리도 없다
    expect(final).not.toContain('bk-ov-ans')
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { overflowAt } from './overflow'

// 실제 줄바꿈의 측정값을 흉내 내 넘친 줄과 그 앞에서 밀어낸 줄을 구분한다.
function slide(heights: number[], tops: number[], overflow = true): HTMLElement {
  const inputs = heights.map((height, i) => ({
    dataset: { field: `row-${i + 1}` },
    offsetHeight: height,
    getAttribute: () => `줄 ${i + 1}`,
    parentElement: {
      classList: { contains: () => false },
      getBoundingClientRect: () => ({ width: 200, height, right: 200, bottom: tops[i] + height }),
    },
  }))
  const box = {
    clientHeight: 100,
    scrollHeight: overflow ? 140 : 100,
    getBoundingClientRect: () => ({ bottom: 100 }),
    contains: (input: unknown) => inputs.includes(input as (typeof inputs)[number]),
  }
  return {
    classList: { add: () => {}, remove: () => {} },
    clientWidth: 1000,
    scrollWidth: 1000,
    clientHeight: 1000,
    scrollHeight: 1000,
    getBoundingClientRect: () => ({ right: 1000 }),
    querySelectorAll: (selector: string) => (selector.startsWith('.ed >') ? inputs : [box]),
  } as unknown as HTMLElement
}

describe('글이 넘친 칸', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('길이가 같은 줄이 함께 밀어내면 모두 고를 수 있다', () => {
    vi.stubGlobal('getComputedStyle', () => ({ lineHeight: '20px', fontSize: '20px' }))
    const result = overflowAt(slide([40, 40, 40], [0, 40, 80]))
    expect(result).toEqual({ over: true, pushed: true, fields: [
      { id: 'row-1', label: '줄 1' }, { id: 'row-2', label: '줄 2' }, { id: 'row-3', label: '줄 3' },
    ] })
  })

  it('한 줄만 길어서 뒤의 줄이 밀리면 그 줄만 고른다', () => {
    vi.stubGlobal('getComputedStyle', () => ({ lineHeight: '20px', fontSize: '20px' }))
    expect(overflowAt(slide([80, 20, 20], [0, 80, 100]))).toEqual({
      over: true, pushed: true, fields: [{ id: 'row-1', label: '줄 1' }],
    })
  })

  it('내용이 들어가면 긴 줄이 있어도 경고하지 않는다', () => {
    expect(overflowAt(slide([40, 40], [0, 40], false))).toEqual({ over: false, pushed: false, fields: [] })
  })
})

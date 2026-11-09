import { describe, expect, it } from 'vitest'
import { marketSizes } from './blocks/Market'

describe('시장 규모의 원 크기', () => {
  it('규모를 읽을 수 있으면 원의 넓이가 규모에 비례한다 (지름은 제곱근)', () => {
    // 3,200억 원은 2.4조 원의 13.3%: 지름 36.5%면 넓이 13.3%. 정해 둔 46%는 넓이 21%로 보였다
    const [outer, inner] = marketSizes(['2.4조 원', '3,200억 원'])
    expect(outer).toBe(1)
    expect(inner * inner).toBeCloseTo(3200 / 24000, 2)
  })

  it('아주 작은 목표도 보이게 안쪽 원은 지름 14%까지만, 그 바깥 원은 그 두 배까지만 줄인다', () => {
    const sizes = marketSizes(['2.4조 원', '3,200억 원', '180억 원'])
    expect(sizes[2]).toBe(0.14)
    expect(sizes[1]).toBeCloseTo(Math.sqrt(3200 / 24000), 2)
    const tiny = marketSizes(['999,999억 원', '10억 원', '1억 원'])
    expect(tiny).toEqual([1, 0.28, 0.14])
  })

  it('읽을 수 없거나 단위가 다르거나 안쪽이 더 크면 정해 둔 크기', () => {
    expect(marketSizes(['', '3,200억 원'])).toEqual([1, 0.46])
    expect(marketSizes(['2.4조 원', '120만 명'])).toEqual([1, 0.46])
    expect(marketSizes(['100억 원', '300억 원', '50억 원'])).toEqual([1, 0.64, 0.32])
    expect(marketSizes(['큰 시장', '작은 시장', '목표'])).toEqual([1, 0.64, 0.32])
  })
})

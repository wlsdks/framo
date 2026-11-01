import { describe, expect, it } from 'vitest'
import { rangeOf } from './blocks/Range'

describe('범위의 눈금', () => {
  it('서로 견줄 수 있는 값과 표시를 놓는다', () => {
    const result = rangeOf('10건', '20건', '15건')!
    expect(result.lo).toBeCloseTo(100 / 6)
    expect(result.hi).toBeCloseTo(500 / 6)
    expect(result.m).toBe(50)
  })

  it('계산 범위를 넘어 위치가 정해지지 않으면 그림을 만들지 않는다', () => {
    const big = '1' + '0'.repeat(308)
    expect(rangeOf(`-${big}`, big, '')).toBeNull()
  })

  it('양 끝을 역순으로 적으면 값을 서로 바꿔 놓지 않는다', () => {
    expect(rangeOf('20건', '10건', '15건')).toBeNull()
  })
})

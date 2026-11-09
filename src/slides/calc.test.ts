import { describe, expect, it } from 'vitest'
import { calcNeed } from './calc'

describe('계산식을 한 줄로 둘 칸 너비', () => {
  it('숫자가 많고 길수록 넓은 칸이 있어야 한 줄, 가장 넓어도 모자라면 쌓기', () => {
    const two = Number(calcNeed(['1,200시간', '4,800만 원']))
    const three = Number(calcNeed(['1,200시간', '4만 원', '10명', '4.8억 원']))
    expect(two).toBeLessThan(three)
    expect(three).toBeLessThanOrEqual(1680)
    expect(calcNeed(['123,456,789,012원', '987,654,321,098원', '123,456,789,012원', '987,654,321,098원', '1,234,567,890,123,456원'])).toBe('stack')
  })

  it('짧은 숫자는 제 폭만큼만 차지한다 (가장 긴 숫자의 폭으로 모두 같게 잡지 않는다)', () => {
    // 긴 숫자 하나에 짧은 숫자 셋: 칸마다 가장 긴 폭으로 잡으면 1680에도 들지 않던 셈
    expect(calcNeed(['1,234,567시간', '2명', '3일', '9,999억 원'])).not.toBe('stack')
  })
})

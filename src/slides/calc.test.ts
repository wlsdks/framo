import { describe, expect, it } from 'vitest'
import { calcCheck, calcNeed, opOf } from './calc'

describe('계산식의 셈 기호', () => {
  it('비우면 곱하기, 자판에 있는 기호와 말도 읽는다', () => {
    expect(opOf('')).toBe('×')
    expect(['x', 'X', '*', '×', '곱하기'].map(opOf)).toEqual(['×', '×', '×', '×', '×'])
    expect(['/', '÷', '나누기'].map(opOf)).toEqual(['÷', '÷', '÷'])
    expect(['+', '＋', '더하기'].map(opOf)).toEqual(['+', '+', '+'])
    expect(['-', '−', '–', '빼기'].map(opOf)).toEqual(['−', '−', '−', '−'])
  })

  it('읽을 수 없는 글은 null(적은 그대로 보인다)', () => {
    expect(opOf('≈')).toBeNull()
    expect(opOf('그리고')).toBeNull()
  })
})

describe('계산식의 결과 확인', () => {
  it('곱한 값이 적은 결과와 맞으면 ok', () => {
    expect(calcCheck(['1,200시간', '4만 원', '10명'], [null, '×', '×'], '4.8억 원')).toMatchObject({ ok: true })
    // 반올림해 적은 결과: 적은 자리의 반까지는 맞는 것으로
    expect(calcCheck(['1,234시간', '4만 원', '10명'], [null, '×', '×'], '4.9억 원')).toMatchObject({ ok: true })
    expect(calcCheck(['1,234시간', '4만 원', '10명'], [null, '×', '×'], '5억 원')).toMatchObject({ ok: true })
    // 퍼센트는 백분의 일로 곱한다
    expect(calcCheck(['2만 명', '3%'], [null, '×'], '600명')).toMatchObject({ ok: true })
  })

  it('틀린 결과는 셈한 값을 결과의 자리로 알려 준다', () => {
    const c = calcCheck(['1,200시간', '4만 원', '10명'], [null, '×', '×'], '4.2억 원')
    expect(c).toMatchObject({ ok: false, expect: '4.8억 원' })
  })

  it('셈한 값이 결과의 자리와 크게 다르면 맞는 자리로 (0.01억 원이 아니라 72만 원)', () => {
    expect(calcCheck(['5시간', '12,000원', '12곳'], [null, '×', '×'], '2.6억 원')).toMatchObject({ ok: false, expect: '72만 원' })
    expect(calcCheck(['5시간', '12,000원', '12곳', '365일'], [null, '×', '×', '×'], '2.6억 원')).toMatchObject({ ok: true })
    expect(calcCheck(['3', '4'], [null, '×'], '5만')).toMatchObject({ ok: false, expect: '12' })
  })

  it('더하기와 빼기는 같은 무리의 단위끼리 (시간과 분도)', () => {
    expect(calcCheck(['1.2억 원', '8,000만 원'], [null, '+'], '2억 원')).toMatchObject({ ok: true })
    expect(calcCheck(['1시간', '30분'], [null, '+'], '1.5시간')).toMatchObject({ ok: true })
    expect(calcCheck(['5억 원', '1.5억 원'], [null, '−'], '3억 원')).toMatchObject({ ok: false, expect: '3.5억 원' })
  })

  it('셈할 수 없으면 null: 곱과 합이 섞임, 읽을 수 없는 값이나 기호, 0으로 나누기, 단위가 다른 합', () => {
    expect(calcCheck(['3만 원', '10명', '5만 원'], [null, '×', '+'], '35만 원')).toBeNull()
    expect(calcCheck(['3~5일', '10명'], [null, '×'], '40일')).toBeNull()
    expect(calcCheck(['3', '4'], [null, null], '12')).toBeNull()
    expect(calcCheck(['3', '0'], [null, '÷'], '1')).toBeNull()
    expect(calcCheck(['3명', '4시간'], [null, '+'], '7')).toBeNull()
    expect(calcCheck(['3', '4'], [null, '×'], '')).toBeNull()
  })
})

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

import { describe, expect, it } from 'vitest'
import { blockMissing, makeBlock } from './blocks'
import { calcAuto, calcAutoOf, calcCheck, opOf } from './calc'
import { emptyItem } from './make'

describe('결과를 비운 계산식의 결과', () => {
  const x = (...v: string[]) => calcAuto(v, v.map((_, i) => (i ? '×' : null)))

  it('곱한 값에 돈이 하나 있으면 돈으로, 값에 자리를 적었으면 결과도 자리로', () => {
    expect(x('2.4시간', '500건', '4만 원')).toBe('4,800만 원')
    expect(x('1,200시간', '4만 원', '10명')).toBe('4.8억 원')
    expect(x('5시간', '12,000원', '12곳', '365일')).toBe('262,800,000원')
    // 자리와 단위를 붙여 쓴 값
    expect(x('1.5억원', '3')).toBe('4.5억 원')
  })

  it('돈이 없으면 시간 같은 잴 수 있는 단위, 그것도 없으면 하나뿐인 세는 단위, %는 몫으로', () => {
    expect(x('500건', '2.4시간')).toBe('1,200시간')
    expect(x('2만 명', '3%')).toBe('600명')
    expect(x('3', '4')).toBe('12')
    expect(x('40%', '50%')).toBe('20%')
    // 세는 단위가 여럿이면 어느 것인지 몰라 단위 없이
    expect(x('12곳', '10명')).toBe('120')
  })

  it('나누기는 나누는 값의 단위를 붙이지 않고, 같은 단위끼리는 지운다', () => {
    expect(calcAuto(['4.8억 원', '12개월'], [null, '÷'])).toBe('4,000만 원')
    expect(calcAuto(['1,200시간', '10명'], [null, '÷'])).toBe('120시간')
    expect(calcAuto(['3억 원', '12억 원'], [null, '÷'])).toBe('0.25')
    expect(calcAuto(['2시간', '30분'], [null, '÷'])).toBe('4')
  })

  it('더하기와 빼기는 같은 무리의 단위끼리, 결과는 첫 값의 단위로', () => {
    expect(calcAuto(['1.2억 원', '8,000만 원'], [null, '+'])).toBe('2억 원')
    expect(calcAuto(['1시간', '30분'], [null, '+'])).toBe('1.5시간')
    expect(calcAuto(['5억 원', '1.5억 원'], [null, '−'])).toBe('3.5억 원')
    expect(calcAuto(['30%', '12%'], [null, '+'])).toBe('42%')
  })

  it('셈할 수 없으면 아무것도 지어내지 않는다', () => {
    // 곱과 합이 섞임, 읽을 수 없는 값이나 기호, 0으로 나누기, 단위가 다른 합, 돈끼리나 시간끼리 곱하기, 빈 값, 값 하나
    expect(calcAuto(['3만 원', '10명', '5만 원'], [null, '×', '+'])).toBeNull()
    expect(x('3~5일', '10명')).toBeNull()
    expect(calcAuto(['3', '4'], [null, null])).toBeNull()
    expect(calcAuto(['3', '0'], [null, '÷'])).toBeNull()
    expect(calcAuto(['3명', '4시간'], [null, '+'])).toBeNull()
    expect(x('4만 원', '3만 원')).toBeNull()
    expect(x('2시간', '30분')).toBeNull()
    expect(x('미정', '10명')).toBeNull()
    expect(x('', '10명')).toBeNull()
    expect(x('1,200시간')).toBeNull()
  })

  it('계산식의 항목으로: 셈 기호를 비우면 곱하기, 칸을 하나도 채우지 않은 항목은 발표할 때처럼 빼고 셈한다', () => {
    const item = (value: string, title = '', meta = '') => ({ ...emptyItem(), value, title, meta })
    expect(calcAutoOf([item('2.4시간', '건마다'), item('500건', '한 해'), item('4만 원', '시간마다', 'x')])).toBe('4,800만 원')
    expect(calcAutoOf([item('1.2억 원'), item('8,000만 원', '', '+'), emptyItem()])).toBe('2억 원')
    // 이름만 적고 값을 비운 항목은 발표에도 남으므로 셈하지 않는다
    expect(calcAutoOf([item('1.2억 원'), item('8,000만 원', '', '+'), item('', '아직 모름')])).toBeNull()
  })

  it('셈해 보이는 결과는 빈칸으로 세지 않고, 셈할 수 없으면 센다', () => {
    const item = (value: string, title: string) => ({ ...emptyItem(), value, title })
    const b = { ...makeBlock('calc'), fields: { label: '한 해 아끼는 돈' }, items: [item('1,200시간', '시간'), item('4만 원', '인건비'), item('10명', '사람')] }
    expect(blockMissing(b).map((m) => m.key)).not.toContain('result')
    const unread = { ...b, items: [item('3~5일', '기간'), item('4만 원', '인건비')] }
    expect(blockMissing(unread).map((m) => m.key)).toContain('result')
  })
})

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

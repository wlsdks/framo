import { describe, expect, it } from 'vitest'
import { cssSource } from './cssSource'
import { gluedParts, minusSigns, numberUnits, pastedText, splitNumber, textUnits, UNIT_K } from './fields'

// 숫자의 꼴은 그릴 때만 바꾼다 (docs/DESIGN.md '숫자의 꼴'). 저장한 글은 이 함수들을 거치지 않는다
describe('숫자의 꼴', () => {
  it('큰 숫자는 숫자와 단위로 나눈다', () => {
    expect(splitNumber('40%')).toEqual({ num: '40', unit: '%' })
    expect(splitNumber('3.6시간')).toEqual({ num: '3.6', unit: '시간' })
    expect(splitNumber('1,200시간')).toEqual({ num: '1,200', unit: '시간' })
    expect(splitNumber('4.8억 원')).toEqual({ num: '4.8', unit: '억 원' })
    expect(splitNumber('−3%')).toEqual({ num: '−3', unit: '%' })
    expect(splitNumber('+12%p')).toEqual({ num: '+12', unit: '%p' })
    expect(splitNumber('2~3배')).toEqual({ num: '2~3', unit: '배' })
  })

  it('숫자 앞에 띄어 쓴 짧은 덧말도 단위처럼 뗀다', () => {
    expect(splitNumber('하루 10분')).toEqual({ pre: '하루 ', num: '10', unit: '분' })
    expect(splitNumber('약 30억 원')).toEqual({ pre: '약 ', num: '30', unit: '억 원' })
    expect(splitNumber('월 1.2억 원')).toEqual({ pre: '월 ', num: '1.2', unit: '억 원' })
    expect(splitNumber('약 30')).toEqual({ pre: '약 ', num: '30', unit: '' })
    // 덧말이 길거나 숫자가 둘이면 그대로
    expect(splitNumber('작년보다 −12.5%')).toBeNull()
    expect(splitNumber('하루 3시간 20분')).toBeNull()
  })

  it('숫자 하나와 단위의 꼴이 아니면 나누지 않는다', () => {
    expect(splitNumber('1200')).toBeNull()
    expect(splitNumber('3년 6개월')).toBeNull()
    expect(splitNumber('미정')).toBeNull()
    expect(splitNumber('')).toBeNull()
  })

  it('숫자 앞의 붙임표만 빼기 기호로 바꾼다', () => {
    expect(minusSigns('-3%')).toBe('−3%')
    expect(minusSigns('작년보다 -12.5%')).toBe('작년보다 −12.5%')
    expect(minusSigns('(-3)')).toBe('(−3)')
    expect(minusSigns('–2')).toBe('−2')
    // 날짜, 번호, 범위의 붙임표와 숫자가 아닌 말 앞의 붙임표는 그대로
    expect(minusSigns('2026-10-25')).toBe('2026-10-25')
    expect(minusSigns('A-1 라인')).toBe('A-1 라인')
    expect(minusSigns('3-4월')).toBe('3-4월')
    expect(minusSigns('- 목록')).toBe('- 목록')
  })

  it('단위를 작게 그리면 폭도 그만큼 좁게 어림한다', () => {
    expect(numberUnits('1,200시간')).toBeLessThan(textUnits('1,200시간'))
    expect(numberUnits('1200')).toBe(textUnits('1200'))
    // 단위가 작아진 만큼만 줄어든다: 숫자 폭 + 단위 폭 × 비율
    const whole = textUnits('40%')
    const num = textUnits('40')
    expect(numberUnits('40%')).toBeCloseTo(num + (whole - num) * UNIT_K, 5)
  })

  it('단위의 크기가 CSS와 같다', () => {
    const css = cssSource(new URL('./slides.css', import.meta.url))
    const rule = /\.slide \.u \{[^}]*font-size: calc\(1em \/ ([\d.]+)\);/.exec(css)
    expect(rule).not.toBeNull()
    expect(1 / Number(rule![1])).toBeCloseTo(UNIT_K, 6)
  })
})

describe('줄을 꺾지 않는 낱말', () => {
  it('숫자 뒤 기호에 붙은 조사는 한 낱말로 묶고, 글자는 그대로 둔다', () => {
    const parts = gluedParts('본부 평균 18%보다 높아요')
    expect(parts).toEqual(['본부 평균 ', { nb: '18%보다' }, ' 높아요'])
    expect(parts!.map((p) => (typeof p === 'string' ? p : p.nb)).join('')).toBe('본부 평균 18%보다 높아요')
    expect(gluedParts('기온 3℃나 올랐고 습도 40%도')).toEqual(['기온 ', { nb: '3℃나' }, ' 올랐고 습도 ', { nb: '40%도' }])
  })

  it('묶을 것이 없으면 그대로', () => {
    expect(gluedParts('본부 평균 18% 높아요')).toBeNull()
    expect(gluedParts('첫해 구축비, 3개 라인 기준')).toBeNull()
  })
})

describe('붙여 넣은 글', () => {
  it('PowerPoint와 Word의 줄 나눔(세로 탭, 쪽 나눔, 줄 구분 문자)은 줄바꿈으로, 그 밖의 제어 문자는 뺀다', () => {
    // PowerPoint 글상자에서 Shift+Enter로 나눈 줄은 U+000B로 복사된다. 그대로 붙이면 줄이 붙어 보이고 PPT 내보내기가 늘 실패했다
    expect(pastedText('첫 줄\u000b둘째 줄', true)).toBe('첫 줄\n둘째 줄')
    expect(pastedText('가\u000c나\u2028다\u2029라\u0085마', true)).toBe('가\n나\n다\n라\n마')
    expect(pastedText('제어\u0000\u0001\u0008\u000e\u001f\u007f\u0090문자', true)).toBe('제어문자')
    expect(pastedText('한 줄\u000b칸', false)).toBe('한 줄 칸')
  })

  it('윈도우의 줄 끝, 엑셀 칸 사이의 탭과 끝의 줄바꿈, 붙지 않는 빈칸은 예전처럼 보통 글로', () => {
    expect(pastedText('가\r\n나\r다', true)).toBe('가\n나\n다')
    expect(pastedText('칸1\t칸2\u00a0끝\r\n', true)).toBe('칸1 칸2 끝')
    expect(pastedText('\n\n가\n\n나\n\n', false)).toBe('가 나')
    expect(pastedText('그림 문자 👍 그대로', true)).toBe('그림 문자 👍 그대로')
  })
})

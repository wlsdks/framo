import { describe, expect, it } from 'vitest'
import { amountPair, changeOf, colsOf, dateParts, formatNumber, gradeOf, gradesOf, isNumericCell, lineAxis, lowerIsBetter, optionIndex, periodRest, readAmount, readNumber, scoreOf, seriesIn, spanIn, statusOf, unitAfter } from './numbers'

describe('숫자 읽기', () => {
  it('표현 범위를 넘는 숫자는 무한대로 계산하지 않는다', () => {
    const huge = '9'.repeat(400)
    expect(readNumber(huge)).toBeNull()
    expect(readAmount(`${huge}억 원`)).toBeNull()
    expect(seriesIn([huge, '1']).values).toEqual([null, 1])
    const finite = `1${'0'.repeat(308)}`
    expect(readAmount(finite, '억 원')).toBeNull()
    expect(changeOf(finite, `-${finite}`)).toBeNull()
    // 유한한 초를 밀리초로 바꾸는 과정에서도 표현 범위를 넘을 수 있다.
    expect(seriesIn([`${finite}초`, '1ms'], 'ms').values).toEqual([null, 1])
  })
  it('값에 단위나 자리를 이미 썼으면 같은 것을 다시 붙이지 않는다', () => {
    expect(unitAfter('8', '명')).toBe('명')
    expect(unitAfter('8명', '명')).toBe('')
    expect(unitAfter('60분', '시간')).toBe('')
    expect(unitAfter('2.4억', '억 원')).toBe('원')
    expect(unitAfter('8,000만', '억 원')).toBe('원')
    expect(unitAfter('2.4억 원', '억 원')).toBe('')
    expect(unitAfter('확인 중', '건')).toBe('')
  })
  it('단위와 쉼표가 붙은 값에서 적은 숫자를 읽는다', () => {
    expect(readNumber('131억 원')).toBe(131)
    expect(readNumber('1,200억 원')).toBe(1200)
    expect(readNumber('15.2억 원')).toBe(15.2)
    expect(readNumber('93%')).toBe(93)
    expect(readNumber('1시간 30분')).toBe(1.5)
    expect(readNumber('')).toBe(null)
    expect(readNumber('미정')).toBe(null)
  })

  it('증감은 보고서에서 쓰는 더하기, 빼기 표기를 모두 받는다', () => {
    expect(readNumber('+9')).toBe(9)
    expect(readNumber('9')).toBe(9)
    expect(readNumber('▲9')).toBe(9)
    expect(readNumber('-2')).toBe(-2)
    expect(readNumber('−2')).toBe(-2)
    expect(readNumber('△2')).toBe(-2)
    expect(readNumber('▼ 1.5억 원')).toBe(-1.5)
    expect(readNumber('(-3)')).toBe(-3)
    // 붙임표가 낱말 안에 있으면 빼기가 아니다
    expect(readNumber('A-3')).toBe(3)
  })

  it('단위까지 읽어 무리의 기준 값으로 바꾼다', () => {
    const read = (t: string, unit?: string) => {
      const a = readAmount(t, unit)
      return a && { base: a.base, kind: a.kind }
    }
    expect(read('6분')).toEqual({ base: 360, kind: 'time' })
    expect(read('40초')).toEqual({ base: 40, kind: 'time' })
    expect(read('1시간 30분')).toEqual({ base: 5400, kind: 'time' })
    expect(read('2년 6개월')?.base).toBeCloseTo(2.5 * 365 * 86400)
    expect(read('3일 이내')).toEqual({ base: 3 * 86400, kind: 'time' })
    expect(read('1.2억 원')).toEqual({ base: 120_000_000, kind: '원' })
    expect(read('8,000만 원')).toEqual({ base: 80_000_000, kind: '원' })
    expect(read('8,000만원')).toEqual({ base: 80_000_000, kind: '원' })
    expect(read('1억 2,000만 원')).toEqual({ base: 120_000_000, kind: '원' })
    expect(read('3억5천만원')).toEqual({ base: 350_000_000, kind: '원' })
    expect(read('3천만 원')).toEqual({ base: 30_000_000, kind: '원' })
    expect(read('1조')).toEqual({ base: 1e12, kind: '' })
    expect(read('93%')).toEqual({ base: 93, kind: '%' })
    expect(read('+3%p')).toEqual({ base: 3, kind: '%' })
    expect(read('120건 이상')).toEqual({ base: 120, kind: '건' })
    expect(read('$1,200')).toEqual({ base: 1200, kind: '달러' })
    expect(read('▼ 1.5억 원')).toEqual({ base: -150_000_000, kind: '원' })
    // 단위 칸이 따로 있으면 숫자만 적은 값은 그 단위로, 자리만 적은 값은 그 단위 무리로
    expect(read('7.2', '억 원')).toEqual({ base: 720_000_000, kind: '원' })
    expect(read('8,000만', '억 원')).toEqual({ base: 80_000_000, kind: '원' })
    expect(read('40초', '분')).toEqual({ base: 40, kind: 'time' })
  })

  it("'분기', '년도', '주차'처럼 몇째인지 적은 말은 기간의 길이로 읽지 않는다", () => {
    expect(readAmount('3분기')?.kind).toBe('분기')
    expect(readAmount('2025년도')?.kind).toBe('년도')
    expect(readAmount('2주차')?.kind).toBe('주차')
  })

  it('어느 숫자인지 모르면 읽지 않는다', () => {
    for (const t of ['', '미정', '3~5일', '2024년 120억', '120건(전년 100건)', '2억 5,000']) expect(readAmount(t), t).toBe(null)
  })

  it('전과 후의 증감은 단위를 같은 기준으로 바꿔 센다', () => {
    const pct = (a: string, b: string) => {
      const c = changeOf(a, b)
      return c && { value: Math.round(c.value * 10) / 10, pp: c.pp }
    }
    expect(pct('6분', '40초')).toEqual({ value: -88.9, pp: false })
    expect(pct('1.2억 원', '8,000만 원')).toEqual({ value: -33.3, pp: false })
    expect(pct('1.2억', '8,000만 원')).toEqual({ value: -33.3, pp: false })
    expect(pct('1시간 30분', '45분')).toEqual({ value: -50, pp: false })
    expect(pct('18개월', '1년')).toEqual({ value: -33.3, pp: false })
    expect(pct('3.2%', '1.1%')).toEqual({ value: -2.1, pp: true })
    expect(pct('120', '150건')).toEqual({ value: 25, pp: false })
    expect(pct('120', '150')).toEqual({ value: 25, pp: false })
  })

  it('견줄 수 없는 단위끼리는 증감을 말하지 않는다', () => {
    for (const [a, b] of [
      ['3건', '40%'],
      ['2명', '5대'],
      ['6분', '40'],
      ['1.2억', '8,000'],
      ['5일', '3건'],
      ['0', '5'],
    ])
      expect(changeOf(a, b), `${a} → ${b}`).toBe(null)
  })

  it('목표와 실적은 단위 칸과 따로 적은 자리, 단위를 같이 읽는다', () => {
    const rate = (v: string, t: string, unit?: string) => {
      const p = amountPair(v, t, unit)
      return p && Math.round((p.a.base / p.b.base) * 1000) / 10
    }
    expect(rate('7.2', '10', '억 원')).toBe(72)
    expect(rate('7,200만', '1억')).toBe(72)
    expect(rate('7,200만 원', '1.2억 원')).toBe(60)
    expect(rate('6분 30초', '7분 이하')).toBe(92.9)
    expect(rate('50분', '2시간')).toBe(41.7)
    expect(rate('4곳', '5곳')).toBe(80)
    expect(rate('40%', '5건')).toBe(null)
  })

  it('계산한 값은 천 단위 쉼표와 소수 둘째 자리까지', () => {
    expect(formatNumber(131)).toBe('131')
    expect(formatNumber(1234.567)).toBe('1,234.57')
    expect(formatNumber(-1.5)).toBe('-1.5')
  })

  it("반올림해 0이 되는 작은 음수는 '-0'이 아니라 '0'이다", () => {
    // 더하고 뺀 끝 값의 부동소수 찌꺼기(0.3 - 0.1 - 0.2 = -2.8e-17)나 소수 둘째 자리 아래의 음수가 '−0'으로 그려졌다
    expect(formatNumber(0.3 - 0.1 - 0.2)).toBe('0')
    expect(formatNumber(-0.004)).toBe('0')
    expect(formatNumber(-0)).toBe('0')
    expect(formatNumber(-0.005)).toBe('-0.01')
  })

  it('표에서 오른쪽에 맞출 숫자 칸은 금액, 비율, 건수만', () => {
    for (const v of ['4.8억 원', '1,200', '22%', '+3%p', '15곳', '2배', '120건', '3,000만 원', '▲9']) expect(isNumericCell(v), v).toBe(true)
    for (const v of ['11월', '3분기', '12월 1주', '영업기획팀', '약 3억', '']) expect(isNumericCell(v), v).toBe(false)
  })

  it('과제 상태는 적은 글을 먼저 읽고, 비었으면 진행률로 짐작해요', () => {
    expect(statusOf('완료', 60)).toBe('done')
    expect(statusOf('2주 지연', 40)).toBe('late')
    expect(statusOf('진행 중', 40)).toBe('doing')
    expect(statusOf('시작 전', null)).toBe('todo')
    expect(statusOf('검토 중', 50)).toBe(null)
    expect(statusOf('미완료', 100)).toBe(null)
    expect(statusOf('완료 안 됨', null)).toBe(null)
    expect(statusOf('완료 예정', null)).toBe('todo')
    expect(statusOf('완료 예정, 2주 지연', null)).toBe('late')
    expect(statusOf('미완료, 2주 지연', null)).toBe('late')
    expect(statusOf('지연 없음', null)).toBe(null)
    expect(statusOf('', 100)).toBe('done')
    expect(statusOf('', 0)).toBe('todo')
    expect(statusOf('', 35)).toBe('doing')
    expect(statusOf('', null)).toBe(null)
  })
})

describe('한 그림의 값', () => {
  const round = (vs: (number | null)[]) => vs.map((v) => (v === null ? null : Math.round(v * 1000) / 1000))

  it('자리와 단위를 섞어 적은 값을 기준 값의 자리로 맞춘다', () => {
    expect(round(seriesIn(['1.2억', '8,000만', '9,500만 원']).values)).toEqual([1.2, 0.8, 0.95])
    expect(round(seriesIn(['6분', '40초', '1시간']).values)).toEqual([6, 0.667, 60])
    expect(seriesIn(['58억', '42억', '31억']).suffix).toBe('억')
  })

  it('단위 칸이 있으면 그 단위가 기준이다', () => {
    const s = seriesIn(['117', '+9', '-2', '+3,000만'], '억 원')
    expect(round(s.values)).toEqual([117, 9, -2, 0.3])
    expect(s.suffix).toBe('억 원')
    expect(round(seriesIn(['8,000만', '1.2'], '억 원').values)).toEqual([0.8, 1.2])
    expect(round(seriesIn(['40초', '2'], '분').values)).toEqual([0.667, 2])
  })

  it('숫자만 적은 값은 한 그림의 단위로 읽는다 (증감 요인의 끝 값)', () => {
    const s = seriesIn(['117억', '+9', '-2'])
    expect(s.values).toEqual([117, 9, -2])
    expect(s.suffix).toBe('억')
    expect(seriesIn(['117', '+9억', '-2억']).values).toEqual([117, 9, -2])
  })

  it('깔때기의 단계 사이 전환율', () => {
    const { values } = seriesIn(['1.2만 명', '8,000명', '1,200명'])
    expect(Math.round((values[1]! / values[0]!) * 1000) / 10).toBe(66.7)
    expect(Math.round((values[2]! / values[1]!) * 1000) / 10).toBe(15)
  })

  it('단위 무리가 섞이면 합이나 비율을 계산하지 않는다', () => {
    expect(seriesIn(['3건', '40%']).ok).toBe(false)
    expect(seriesIn(['2명', '5대', '7']).ok).toBe(false)
    expect(seriesIn(['3만', '2시간']).ok).toBe(false)
    // 막대는 그리도록 적은 숫자 그대로
    expect(seriesIn(['3건', '40%']).values).toEqual([3, 40])
    expect(seriesIn(['120', '', '미정', '150건']).values).toEqual([120, null, null, 150])
  })

  it('값끼리 같은 단위여도 따로 적은 단위와 다르면 계산하지 않는다', () => {
    expect(seriesIn(['10원', '20원'], '건').ok).toBe(false)
    expect(amountPair('10원', '20원', '건')).toBeNull()
    expect(seriesIn(['40초', '2분'], '분').ok).toBe(true)
    expect(amountPair('40초', '2분', '분')).not.toBeNull()
  })
})

describe('추진 일정의 기간', () => {
  const cols = colsOf('11월 12월 1월 2월 3월')

  it('기간 칸은 띄어 쓰기나 쉼표로 나눈다', () => {
    expect(cols).toEqual(['11월', '12월', '1월', '2월', '3월'])
    expect(colsOf('1분기, 2분기,3분기')).toEqual(['1분기', '2분기', '3분기'])
    expect(colsOf('')).toEqual([])
    expect(colsOf(' \n ')).toEqual([])
    expect(colsOf('첫째, , 셋째')).toEqual(['첫째', '', '셋째'])
    expect(spanIn('셋째', colsOf('첫째, , 셋째'))).toEqual([2, 2])
    expect(spanIn('없는 이름', colsOf('첫째, , 셋째'))).toBeNull()
  })

  it('적은 기간의 처음 칸과 끝 칸을 찾는다', () => {
    expect(spanIn('12월~2월', cols)).toEqual([1, 3])
    expect(spanIn('11월부터 1월까지', cols)).toEqual([0, 2])
    expect(spanIn('3월', cols)).toEqual([4, 4])
    expect(spanIn('12월 2주 ~ 2월 1주', cols)).toEqual([1, 3])
  })

  it('앞쪽 단위를 생략한 구간도 처음부터 끝까지 찾는다', () => {
    expect(spanIn('12~2월', cols)).toEqual([1, 3])
    expect(spanIn('2~3주', colsOf('1주 2주 3주 4주'))).toEqual([1, 2])
    expect(spanIn('10월 2~3주', colsOf('10월 1주 2주 3주 4주'))).toEqual([1, 2])
    expect(periodRest('10월 2~3주', colsOf('10월 1주 2주 3주 4주'))).toBe('')
    expect(spanIn('1~3분기', colsOf('1분기 2분기 3분기 4분기'))).toEqual([0, 2])
    expect(periodRest('12~2월', cols)).toBe('')
  })

  it("'1월'을 '11월'이나 '12월' 안에서 잡지 않는다", () => {
    expect(spanIn('11월', cols)).toEqual([0, 0])
    expect(spanIn('12월', cols)).toEqual([1, 1])
    expect(spanIn('1', colsOf('1 2 12'))).toEqual([0, 0])
  })

  it("띄어쓰기로만 적어도 '10월 1주'처럼 큰 기간 뒤의 작은 기간은 한 칸이다", () => {
    expect(colsOf('10월 1주 10월 2주 10월 3주')).toEqual(['10월 1주', '10월 2주', '10월 3주'])
    expect(colsOf('3월 상순 3월 중순 3월 하순')).toEqual(['3월 상순', '3월 중순', '3월 하순'])
    expect(colsOf('1분기 말 2분기 말')).toEqual(['1분기 말', '2분기 말'])
    expect(colsOf('2026년 1분기 2분기 3분기')).toEqual(['2026년 1분기', '2분기', '3분기'])
    expect(colsOf('10월 1주 2주 3주 4주 11월 1주')).toEqual(['10월 1주', '2주', '3주', '4주', '11월 1주'])
    expect(colsOf('1주 2주 3주')).toEqual(['1주', '2주', '3주'])
    expect(colsOf('상순 중순 하순')).toEqual(['상순', '중순', '하순'])
    expect(colsOf('A안 B안 C안')).toEqual(['A안', 'B안', 'C안'])
  })

  it('쉼표나 줄바꿈이 있으면 그것으로만 나눈다', () => {
    expect(colsOf('10월 1주, 10월 2주, 10월 3주')).toEqual(['10월 1주', '10월 2주', '10월 3주'])
    expect(colsOf('준비 기간, 시범 운영, 전체 적용')).toEqual(['준비 기간', '시범 운영', '전체 적용'])
    expect(colsOf('준비 기간\n시범 운영')).toEqual(['준비 기간', '시범 운영'])
    expect(colsOf('\n준비 기간\n시범 운영\n')).toEqual(['준비 기간', '시범 운영'])
    expect(colsOf('기획·설계, 개발, 시험')).toEqual(['기획·설계', '개발', '시험'])
    expect(colsOf('A안/B안/C안')).toEqual(['A안', 'B안', 'C안'])
    expect(colsOf('현행 유지 / 신규 도입')).toEqual(['현행 유지', '신규 도입'])
    // 날짜 안의 빗금으로는 나누지 않는다
    expect(colsOf('10/1 10/8 10/15')).toEqual(['10/1', '10/8', '10/15'])
  })

  it('칸 이름에 기간이 여럿이어도 사람이 적은 기간을 찾는다', () => {
    const weeks = colsOf('10월 1주 10월 2주 10월 3주 10월 4주 11월 1주 11월 2주')
    expect(spanIn('10월 2주~11월 1주', weeks)).toEqual([1, 4])
    expect(spanIn('10월 2주 ~ 10월 3주', weeks)).toEqual([1, 2])
    expect(spanIn('10월2주', weeks)).toEqual([1, 1])
    // 큰 기간만 적으면 그 기간의 칸 모두
    expect(spanIn('11월', weeks)).toEqual([4, 5])
    expect(spanIn('10월 3주~11월', weeks)).toEqual([2, 5])
    // 앞 칸에서 이어받은 기간까지 보고 찾는다 ('11월 2주'를 10월의 '2주' 칸에서 잡지 않는다)
    const short = colsOf('10월 1주 2주 3주 4주 11월 1주 2주')
    expect(spanIn('11월 2주', short)).toEqual([5, 5])
    expect(spanIn('10월 2주~3주', short)).toEqual([1, 2])
    expect(spanIn('10월', short)).toEqual([0, 3])
    const halves = colsOf('3월 상순 3월 중순 3월 하순 4월 상순')
    expect(spanIn('3월 하순', halves)).toEqual([2, 2])
    expect(spanIn('3월 중순~4월 상순', halves)).toEqual([1, 3])
    const quarters = colsOf('2026년 1분기 2분기 3분기 4분기')
    expect(spanIn('2분기~3분기', quarters)).toEqual([1, 2])
    // 칸보다 잘게 적은 때는 그 큰 기간의 칸 모두
    expect(spanIn('10월 중', weeks)).toEqual([0, 3])
    expect(spanIn('13월', colsOf('11월 12월'))).toBeNull()
  })

  it('기간 글에서 칸 이름 말고 더 적은 것이 있는지', () => {
    const weeks = colsOf('10월 1주 2주 3주 4주')
    expect(periodRest('10월 2주~3주', weeks)).toBe('')
    expect(periodRest('10월 2주부터 4주까지', weeks)).toBe('')
    expect(periodRest('12월~2월', cols)).toBe('')
    expect(periodRest('12월 2주 ~ 2월 1주', cols)).toBe('2주1주')
    expect(periodRest('내년 상반기', cols)).toBe('내년상반기')
    expect(periodRest('10월 말', weeks)).toBe('10월말')
  })

  it('칸 이름이 없으면 막대를 그리지 않는다', () => {
    expect(spanIn('내년 상반기', cols)).toBe(null)
    expect(spanIn('', cols)).toBe(null)
    expect(spanIn('11월', [])).toBe(null)
  })
})

describe('평가표 읽기', () => {
  it('이름이 겹치는 대안은 정확하게 일치한 안만 추천한다', () => {
    expect(optionIndex('현행 개선', ['현행', '현행 개선', '신규'])).toBe(1)
    expect(optionIndex('AA안', ['A안', 'AA안', 'B안'])).toBe(1)
    expect(optionIndex('현행 개선을 추천', ['현행', '현행 개선', '신규'])).toBe(-1)
    expect(optionIndex('첫째', ['첫째', '첫째'])).toBe(-1)
    expect(optionIndex('B안 추천', ['A안', 'B안', 'C안'])).toBe(1)
    expect(optionIndex('B안을 추천', ['A안', 'B안', 'C안'])).toBe(1)
    expect(optionIndex('BA안 추천', ['A안', 'C안'])).toBe(-1)
    expect(optionIndex('', ['', 'A안'])).toBe(-1)
  })
  it('좋음 보통 나쁨과 기호를 읽고, 모르는 글은 그대로 둔다', () => {
    expect(gradesOf('좋음 보통, 나쁨').map(gradeOf)).toEqual(['good', 'mid', 'bad'])
    expect(gradesOf('○ △ ×').map(gradeOf)).toEqual(['good', 'mid', 'bad'])
    expect(gradesOf('상 중 하').map(gradeOf)).toEqual(['good', 'mid', 'bad'])
    expect(gradeOf('1.9억')).toBeNull()
    expect(gradesOf('')).toEqual([])
  })

  it('빈 평가와 확인 중인 글 뒤의 평가는 원래 안에 남긴다', () => {
    expect(gradesOf('좋음, , 나쁨')).toEqual(['좋음', '', '나쁨'])
    expect(gradesOf('좋음,,나쁨')).toEqual(['좋음', '', '나쁨'])
    expect(gradesOf('좋음，，나쁨')).toEqual(['좋음', '', '나쁨'])
    expect(gradesOf('좋음, 확인 중, 나쁨')).toEqual(['좋음', '확인 중', '나쁨'])
    expect(gradesOf(', 보통,')).toEqual(['', '보통', ''])
  })
})

describe('낮을수록 좋은 목표', () => {
  it('이하, 이내, 미만, ≤로 적은 목표를 알아본다', () => {
    for (const t of ['7분 이하', '3일 이내', '불량률 0.5% 미만', '≤ 2건', '<10%']) expect(lowerIsBetter(t), t).toBe(true)
    for (const t of ['117억 원', '90%', '5곳 이상']) expect(lowerIsBetter(t), t).toBe(false)
  })
})

describe('선 그래프의 세로 축', () => {
  it('0에서 먼 값들은 바닥을 가장 작은 값 아래로 잡는다 (흐름이 납작하지 않게)', () => {
    const { floor, y } = lineAxis([110, 114, 118], 3)
    expect(floor).toBe(106)
    expect(y(110)).toBeGreaterThan(30)
    expect(y(118)).toBeLessThan(100)
  })

  it('0에 가까우면 0부터, 0보다 작은 값이 있으면 0 아래까지', () => {
    expect(lineAxis([2, 5, 9], 3).floor).toBe(0)
    const neg = lineAxis([-4, 6], 2)
    expect(neg.floor).toBeLessThan(-4)
    expect(neg.y(0)).toBeGreaterThan(0)
  })

  it('차례는 칸 가운데에 놓는다', () => {
    const { x } = lineAxis([1, 2], 4)
    expect([0, 1, 2, 3].map(x)).toEqual([12.5, 37.5, 62.5, 87.5])
  })

  it('값이 하나거나 없어도 0으로 나누지 않는다', () => {
    expect(Number.isFinite(lineAxis([5], 1).y(5))).toBe(true)
    expect(Number.isFinite(lineAxis([], 1).y(0))).toBe(true)
  })
})

describe('날짜 나누기', () => {
  it('적은 꼴의 달까지는 그대로 두고 일의 숫자와 요일을 뗀다', () => {
    expect(dateParts('11월 8일')).toEqual({ head: '11월', day: '8', weekday: '' })
    expect(dateParts('2026년 11월 8일 (금)')).toEqual({ head: '2026년 11월', day: '8', weekday: '(금)' })
    expect(dateParts('11월 22일 금요일')).toEqual({ head: '11월', day: '22', weekday: '금요일' })
    expect(dateParts('2026. 11. 8.')).toEqual({ head: '2026. 11.', day: '8', weekday: '' })
    expect(dateParts('2026-11-08')).toEqual({ head: '2026-11', day: '8', weekday: '' })
    expect(dateParts('11/8')).toEqual({ head: '11월', day: '8', weekday: '' })
  })

  it('날짜 하나로 읽히지 않으면 나누지 않는다', () => {
    expect(dateParts('11월 둘째 주')).toBe(null)
    expect(dateParts('11월 8일 ~ 10일')).toBe(null)
    expect(dateParts('연말')).toBe(null)
    expect(dateParts('13월 2일')).toBe(null)
    expect(dateParts('11월 32일')).toBe(null)
    expect(dateParts('3.5')).toBe(null)
    expect(dateParts('')).toBe(null)
  })
})

describe('목표 대비 실적 한 줄 (scoreOf)', () => {
  it('높을수록 좋은 지표는 목표 이상이면 달성, 달성률은 실적 ÷ 목표', () => {
    const s = scoreOf('117억 원', '131억 원')
    expect(s).toMatchObject({ known: true, met: true })
    expect(s.rate).toBeCloseTo(131 / 117, 5)
    expect(scoreOf('5곳', '4곳').met).toBe(false)
  })

  it('낮을수록 좋은 지표(이하, 이내)는 목표 이하면 달성, 달성률은 목표 ÷ 실적', () => {
    const s = scoreOf('5일 이하', '4.2일')
    expect(s.met).toBe(true)
    expect(s.rate).toBeCloseTo(5 / 4.2, 5)
    expect(scoreOf('7분 이하', '7분 30초').met).toBe(false)
  })

  it('견줄 수 없는 단위, 빈 실적, 0인 목표는 셈하지 않는다', () => {
    expect(scoreOf('3건', '40%').known).toBe(false)
    expect(scoreOf('5곳', '').known).toBe(false)
    expect(scoreOf('0건', '3건').known).toBe(false)
    expect(scoreOf('3건', '40%').rate).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import { likertHead, likertLevels, likertNames, likertRow, likertSides, likertSpan } from './likert'

describe('설문 결과의 단계', () => {
  it('단계 이름을 비우면 단계 수에 맞는 흔한 이름', () => {
    expect(likertNames('', 5)).toEqual(['전혀 아니다', '아니다', '보통', '그렇다', '매우 그렇다'])
    expect(likertNames('', 4)).toEqual(['전혀 아니다', '아니다', '그렇다', '매우 그렇다'])
    expect(likertNames('매우 불만, 불만, 보통, 만족, 매우 만족', 5)).toEqual(['매우 불만', '불만', '보통', '만족', '매우 만족'])
  })

  it('적은 이름이 단계 수보다 적으면 모자란 자리는 흔한 이름으로 (색 표시와 막대 칸 수가 어긋나지 않게)', () => {
    expect(likertNames('만족', 2)).toEqual(['만족', '그렇다'])
    expect(likertNames('', 2)).toHaveLength(2)
  })

  it('합계 칸의 머리: 강조하는 쪽에서 가운데에 가장 가까운 단계 이름 + 이상(긍정), 이하(부정)', () => {
    const five = likertNames('', 5)
    expect(likertHead(five, 'pos')).toBe('그렇다 이상')
    expect(likertHead(five, 'neg')).toBe('아니다 이하')
    expect(likertHead(likertNames('매우 불만, 불만, 보통, 만족, 매우 만족', 5), 'pos')).toBe('만족 이상')
    // 그쪽 단계가 하나뿐이면 그 이름
    expect(likertHead(likertNames('', 3), 'pos')).toBe('그렇다')
    expect(likertHead(likertNames('', 2), 'neg')).toBe('아니다')
  })

  it('단계 수: 적은 이름이 있으면 그 수, 없으면 질문들의 값 수(가장 많은 것), 둘 다 없으면 5', () => {
    expect(likertLevels('불만, 보통, 만족', [[1, 2, 3, 4, 5]])).toBe(3)
    expect(likertLevels('', [[10, 20, 30, 40], [5, 15, 40, 40], []])).toBe(4)
    expect(likertLevels('', [])).toBe(5)
    // 2~7단계까지만
    expect(likertLevels('', [[1, 1, 1, 1, 1, 1, 1, 1, 1]])).toBe(7)
  })

  it('부정, 보통, 긍정 쪽: 홀수면 가운데가 보통, 짝수면 반으로', () => {
    expect(likertSides(5)).toEqual(['neg', 'neg', 'neu', 'pos', 'pos'])
    expect(likertSides(4)).toEqual(['neg', 'neg', 'pos', 'pos'])
    expect(likertSides(7)).toEqual(['neg', 'neg', 'neg', 'neu', 'pos', 'pos', 'pos'])
  })
})

describe('설문 결과의 한 질문', () => {
  it('비율을 합 100으로 맞추고 부정, 보통, 긍정의 합을 낸다 (응답 수로 적어도 된다)', () => {
    const row = likertRow([4, 8, 20, 43, 25], 5)!
    expect(row.shares).toEqual([4, 8, 20, 43, 25])
    expect(row).toMatchObject({ neg: 12, neu: 20, pos: 68 })
    const counts = likertRow([7, 14, 35, 56, 28], 5)!
    expect(counts.pos).toBeCloseTo(60, 5)
    expect(counts.shares.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 5)
  })

  it('단계 수와 값 수가 다르거나, 음수, 읽을 수 없는 값, 합이 0이면 null', () => {
    expect(likertRow([10, 20, 70], 5)).toBeNull()
    expect(likertRow([10, -5, 20, 40, 35], 5)).toBeNull()
    expect(likertRow([10, null, 20, 40, 30], 5)).toBeNull()
    expect(likertRow([0, 0, 0, 0, 0], 5)).toBeNull()
  })
})

describe('설문 결과의 가운데 선', () => {
  it('모든 질문이 같은 가운데 선을 쓴다: 왼쪽(부정 + 보통의 반)과 오른쪽(긍정 + 보통의 반)으로 가장 긴 몫', () => {
    const rows = [likertRow([4, 8, 20, 43, 25], 5), likertRow([20, 30, 10, 30, 10], 5), null]
    expect(likertSpan(rows)).toEqual({ left: 55, right: 78 })
  })

  it('질문이 모두 비었으면 반반', () => {
    expect(likertSpan([null, null])).toEqual({ left: 50, right: 50 })
  })
})

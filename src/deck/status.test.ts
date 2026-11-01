import { describe, expect, it } from 'vitest'
import { laneOf, laneRows } from './status'

describe('상태별 모양의 단 (laneOf, laneRows)', () => {
  it('상태 글을 우선하고 모르는 상태는 짐작하지 않는다', () => {
    expect(laneOf('2주 지연', 40)).toBe('late')
    expect(laneOf('지연 없이 진행 중', 40)).toBe('doing')
    expect(laneOf('지연 없이 진행 중이에요', 40)).toBe('doing')
    expect(laneOf('지연 없이 진행 중이 아니에요', 40)).toBe('unknown')
    expect(laneOf('지연되지 않았어요', 40)).toBe('unknown')
    expect(laneOf('검토 중', 100)).toBe('unknown')
    expect(laneOf('', 0)).toBe('todo')
    expect(laneOf('', null)).toBe('unknown')
  })

  it('가장 많이 모인 단의 과제 수', () => {
    const doing = { state: '', value: '50%' }
    expect(laneRows([doing, doing, doing, { state: '완료', value: '' }])).toBe(3)
    expect(laneRows([{ state: '완료', value: '' }, { state: '지연', value: '' }])).toBe(1)
    expect(laneRows([])).toBe(1)
    expect(laneRows([{ state: '', value: '150%' }, { state: '', value: '10건' }, { state: '검토 중', value: '100%' }])).toBe(3)
    expect(laneRows([
      { state: '완료', value: '100%' }, { state: '진행 중', value: '50%' }, { state: '진행 중', value: '40%' },
      { state: '지연', value: '30%' }, { state: '예정', value: '0%' }, { state: '검토 중', value: '10건' },
    ])).toBe(4)
  })
})

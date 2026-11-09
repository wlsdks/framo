import { describe, expect, it } from 'vitest'
import { BLUEPRINTS } from './blueprints'

describe('대외 제안의 안내 예시', () => {
  it('비용과 조건의 예상 기간은 진행 일정 예시의 마지막 주와 같다', () => {
    // 진행 일정 예시는 1주 현황 확인부터 7주 결과 점검까지인데, 비용과 조건 예시는 '예상 기간 8주(준비부터 결과 공유까지)'라
    // 한 발표 안의 예시끼리 말이 맞지 않았다
    const recipes = BLUEPRINTS.proposal.recipes
    const cost = recipes.find((r) => r.purpose === '비용과 조건')!.hints!
    // 진행 일정은 주마다의 기간 막대(추진 일정 컴포넌트)라 마지막 기간 칸이 마지막 주다
    const plan = recipes.find((r) => r.purpose === '진행 일정')!.blocks![0].hints!
    const weeks = plan.cols.split(',').map((w) => w.trim())
    expect(cost['items.1.title']).toBe('예상 기간')
    expect(cost['items.1.value']).toBe(weeks.at(-1))
  })
})

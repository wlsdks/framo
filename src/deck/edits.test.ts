import { describe, expect, it } from 'vitest'
import { listLines, pastedItems, relayout, withOneMore, withVisibleCount } from './edits'
import { emptyItem, makeSlide } from './generate'
import type { Item } from './types'

const item = (title: string): Item => ({ ...emptyItem(), title })
const empty = (it: Item) => !it.title.trim()

describe('항목 수 바꾸기 (편집기와 AI 제안이 같이 쓴다)', () => {
  it('늘릴 때는 숨은 항목 앞에 빈 항목을 넣는다 (숨은 항목은 그대로 뒤에)', () => {
    const items = [item('가'), item('나'), item('숨은 항목')]
    const next = withVisibleCount(items, 2, 3, empty)!
    expect(next.map((it) => it.title)).toEqual(['가', '나', '', '숨은 항목'])
  })

  it('줄일 때는 보이는 끝에서 빼고, 뺄 항목에 글이 있으면 하지 않는다', () => {
    expect(withVisibleCount([item('가'), item(''), item('')], 3, 1, empty)!.map((it) => it.title)).toEqual(['가'])
    expect(withVisibleCount([item('가'), item('나')], 2, 1, empty)).toBeNull()
  })

  it('하나 더하기는 이미 다 보이면 받은 목록 그대로', () => {
    const items = [item('가'), item('나')]
    expect(withOneMore(items, 2)).toBe(items)
    expect(withOneMore(items, 3)).toHaveLength(3)
  })
})

describe('레이아웃 바꾸기', () => {
  it('글은 그대로 두고 새 레이아웃의 최소 항목 수를 채우며 모양은 고른 것(없으면 기본)으로', () => {
    const slide = { ...makeSlide('statement'), items: [], variant: 'bold', fields: { title: '그대로' } }
    const next = relayout(slide, 'kpi')
    expect(next.layout).toBe('kpi')
    expect(next.fields.title).toBe('그대로')
    expect(next.variant).toBeUndefined()
    expect(next.items.length).toBeGreaterThanOrEqual(1)
    expect(relayout(slide, 'kpi', 'cards').variant).toBe('cards')
  })
})

describe('여러 줄 붙여 넣기를 항목마다 나누기', () => {
  it('줄마다 글머리표를 떼고 빈 줄은 뺀다', () => {
    expect(listLines('• 한 팀에서 먼저\r\n\n- 매주 점검\n1. 신입과 함께\n② 둘째\n가. 가나다\n(3) 셋')).toEqual(['한 팀에서 먼저', '매주 점검', '신입과 함께', '둘째', '가나다', '셋'])
  })

  it('숫자로 시작하는 글은 번호로 보지 않는다 (3월, 1.2억, -5%)', () => {
    expect(listLines('3월에 시작\n1.2억 원 절감\n-5% 감소')).toEqual(['3월에 시작', '1.2억 원 절감', '-5% 감소'])
  })

  it('지금 항목부터 채우고 모자라면 늘린다', () => {
    const items = [item(''), item('')]
    const next = pastedItems(items, 5, 0, 'title', ['가', '나', '다'])!
    expect(next.map((it) => it.title)).toEqual(['가', '나', '다'])
  })

  it('사람이 적은 글은 덮지 않는다', () => {
    expect(pastedItems([item(''), item('적은 글'), item('')], 5, 0, 'title', ['가', '나'])).toBeNull()
  })

  it('최대 항목 수를 넘으면 나누지 않는다', () => {
    expect(pastedItems([item(''), item('')], 3, 1, 'title', ['가', '나', '다'])).toBeNull()
  })

  it('한 줄이면 나누지 않는다', () => {
    expect(pastedItems([item('')], 3, 0, 'title', ['가'])).toBeNull()
  })
})

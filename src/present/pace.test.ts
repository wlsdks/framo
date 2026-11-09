import { describe, expect, it } from 'vitest'
import { withLayout } from '../deck/blocks'
import { emptyItem, makeSlide } from '../deck/generate'
import { createSampleDeck } from '../deck/sample'
import type { Slide } from '../deck/types'
import { holdMs, recordSeconds, recordTime, slideHoldMs } from './pace'

describe('영상에서 장마다 머무는 시간', () => {
  it('글이 많은 장일수록 오래 머문다. 글이 없어도 훑어볼 만큼은 둔다', () => {
    expect(holdMs(0, false)).toBe(2500)
    expect(holdMs(40, false)).toBeGreaterThan(holdMs(10, false))
    // 네 줄짜리 요약(140자 남짓)은 10초 넘게: 예전에는 모션이 끝나고 1.8초 만에 넘어가 읽을 수 없었다
    expect(holdMs(140, false)).toBeGreaterThan(10_000)
  })

  it('글이 아주 많아도 15초를 넘기지 않는다', () => {
    expect(holdMs(1000, false)).toBe(15_000)
  })

  it('마지막 장은 더 오래, 적어도 5초 머문다', () => {
    expect(holdMs(0, true)).toBe(5000)
    expect(holdMs(100, true)).toBe(holdMs(100, false) + 2000)
  })

  it('장의 글은 보이는 글만 센다: 노트는 듣는 분께 보이지 않는다', () => {
    const deck = createSampleDeck()
    const slide: Slide = { ...makeSlide('points'), fields: { title: '세 가지' }, items: [{ ...emptyItem(), title: '하나' }] }
    expect(slideHoldMs(deck, { ...slide, notes: '아주 긴 노트 '.repeat(40) }, false)).toBe(slideHoldMs(deck, slide, false))
  })
})

describe('녹화를 묻는 창의 걸리는 시간', () => {
  const deck = createSampleDeck()
  const slides = deck.slides.filter((s) => !s.hidden)

  it('녹화가 장마다 머무는 시간(slideHoldMs)과 같은 셈으로 어림한다', () => {
    // 한 장의 글을 늘리면 어림도 그 장이 더 머무는 만큼 늘어난다
    const i = slides.findIndex((s) => s.layout === 'section')
    const longer = slides.map((s, k) => (k === i ? { ...s, fields: { ...s.fields, lead: '이 섹션에서 다룰 내용을 조금 더 길게 적었어요' } } : s))
    const more = slideHoldMs(deck, longer[i], false) - slideHoldMs(deck, slides[i], false)
    expect(more).toBeGreaterThan(0)
    expect((recordSeconds(deck, longer) - recordSeconds(deck, slides)) * 1000).toBeCloseTo(more)
    // 어림에는 장마다 머무는 시간이 모두 들어 있다 (마지막 장은 더 길게)
    const holds = slides.reduce((n, s, k) => n + slideHoldMs(deck, s, k === slides.length - 1), 0)
    expect(recordSeconds(deck, slides) * 1000).toBeGreaterThan(holds)
  })

  it('예시 발표(15장)는 2분쯤: 장마다 글을 읽을 만큼 머문다', () => {
    expect(slides).toHaveLength(15)
    expect(recordTime(recordSeconds(deck, slides))).toBe('2분')
  })

  it('누르면 나오는 컴포넌트가 있으면 그만큼 더 걸린다', () => {
    const base = withLayout({ ...makeSlide('points'), fields: { title: '제목' }, items: [{ ...emptyItem(), title: '하나' }, { ...emptyItem(), title: '둘' }] }, 'compose')
    const [first] = base.blocks!
    const two = { ...base, blocks: [first, { ...first, id: 'b-next' }] }
    const clicks = { ...base, blocks: [first, { ...first, id: 'b-next', when: 'click' as const }] }
    expect(recordSeconds(deck, [clicks])).toBeGreaterThan(recordSeconds(deck, [two]))
  })

  it('걸리는 시간을 말로: 1분 아래는 10초 단위, 넘으면 분', () => {
    expect(recordTime(12)).toBe('10초')
    expect(recordTime(38)).toBe('40초')
    expect(recordTime(70)).toBe('1분')
    expect(recordTime(163)).toBe('3분')
  })
})

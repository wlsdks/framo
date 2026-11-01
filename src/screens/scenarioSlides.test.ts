import { describe, expect, it } from 'vitest'
import { tiles } from '../deck/blocks'
import { createSampleDeck } from '../deck/sample'
import { unknownParts } from '../deck/compat'
import { decodeDeckFile, encodeDeckFile } from '../store/deckFile'
import { scenarioSlides } from './scenarioSlides'
import { salesScenarios } from './salesScenarios'
import { visualScenarios } from './visualScenarios'
import { colsOf, gradeOf, gradesOf, readAmount, spanIn } from '../slides/numbers'

describe('가상 발표 상황', () => {
  it('서로 다른 상황의 컴포넌트가 각 테마와 글자 크기에서 빠짐없이 놓인다', () => {
    for (const id of ['white', 'navy', 'serif'] as const) {
      for (const size of [undefined, 'large'] as const) {
        const slides = scenarioSlides({ theme: { id, size } })
        expect(slides.map((s) => s.id)).toEqual([...['sales', 'development', 'team', 'lecture', 'external', 'report', 'community', 'research'], ...salesScenarios.map((s) => s.id), ...visualScenarios.map((s) => s.id)].map((s) => `scenario-${s}`))
        for (const slide of slides) {
          expect(slide.fields.title).toContain('가상')
          expect(slide.blocks!.length).toBeGreaterThanOrEqual(2)
          expect(tiles(slide.blocks!)).toBe(true)
        }
      }
    }
  })

  it('가상 일정과 평가, 예산은 실제 컴포넌트가 읽는 방식으로도 뜻이 맞는다', () => {
    const plan = visualScenarios.find((s) => s.id === 'visual-plan')!.blocks.find((b) => b.type === 'gantt')!
    const periods = colsOf(plan.fields.cols)
    expect(periods).toEqual(['1월', '2월', '3월', '4월'])
    expect(plan.items!.map((item) => spanIn(item.body!, periods))).toEqual([[0, 0], [0, 1], [1, 2], [3, 3]])
    const rating = visualScenarios.find((s) => s.id === 'visual-alternatives')!.blocks.find((b) => b.type === 'rating')!
    const options = colsOf(rating.fields.opts)
    expect(options).toEqual(['작게 시작', '한 번에 확대'])
    expect(spanIn(rating.fields.pick, options)).toEqual([0, 0])
    expect(rating.items!.every((item) => gradesOf(item.body!).length === options.length && gradesOf(item.body!).every(gradeOf))).toBe(true)
    const budget = visualScenarios.find((s) => s.id === 'visual-budget')!.blocks.find((b) => b.type === 'split')!
    const total = readAmount(budget.fields.total, budget.fields.unit)!
    const parts = budget.items!.map((item) => readAmount(item.value!, budget.fields.unit)!)
    expect(parts.every((part) => part.kind === total.kind)).toBe(true)
    expect(parts.reduce((sum, part) => sum + part.base, 0)).toBe(total.base)
    const donut = scenarioSlides().find((s) => s.id === 'scenario-visual-sales-donut')!.blocks!.find((b) => b.type === 'share')!
    expect(donut.variant).toBe('donut')
    expect(donut.items.reduce((sum, item) => sum + Number(item.value), 0)).toBe(100)
    const comparison = scenarioSlides().find((s) => s.id === 'scenario-visual-sales-two-lines')!.blocks!.find((b) => b.type === 'versus')!
    expect(comparison.variant).toBe('lines')
    expect([comparison.fields.metaTitle, comparison.fields.valueTitle]).toEqual(['작년 문의', '올해 문의'])
    expect(comparison.items.every((item) => Number(item.value) > Number(item.meta))).toBe(true)
    const market = visualScenarios.find((s) => s.id === 'visual-sales-market')!.blocks.find((b) => b.type === 'market')!
    const sizes = market.items!.map((item) => readAmount(item.value!)!.base)
    expect(sizes).toEqual([1000, 200, 10])
    expect(sizes[2] / sizes[1]).toBe(0.05)
    const titleless = scenarioSlides().find((s) => s.id === 'scenario-visual-titleless-result')!
    expect(titleless.options).toMatchObject({ hideHead: true, hideFoot: true })
    expect(titleless.fields.title).toContain('가상')
    expect(titleless.blocks?.map((block) => block.type)).toEqual(['number', 'bullets'])
  })

  it('가상 상황들을 작업 파일로 저장하고 다시 열어도 슬라이드와 내용이 보존된다', () => {
    const deck = createSampleDeck()
    deck.slides = scenarioSlides(deck)
    const back = decodeDeckFile(encodeDeckFile(deck))!
    expect(back.slides).toEqual(deck.slides)
    expect(unknownParts(back)).toBe(0)
    expect(back.slides.find((slide) => slide.id === 'scenario-visual-titleless-result')!.options).toMatchObject({ hideHead: true, hideFoot: true })
  })
})

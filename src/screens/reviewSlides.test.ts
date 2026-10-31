import { describe, expect, it } from 'vitest'
import { reviewSlides } from './reviewSlides'

describe('대표 조합', () => {
  it('테마와 글자 크기가 달라도 의도한 컴포넌트를 모두 담는다', () => {
    const expected: Record<string, string[]> = {
      user: ['message', 'quote'],
      text: ['message', 'text', 'text'],
      number: ['number', 'number', 'text'],
      chart: ['message', 'trend'],
      quote: ['quote', 'bullets'],
      three: ['text', 'text', 'text'],
      bare: ['message', 'quote'],
      dense: ['number', 'delta', 'goal', 'bullets', 'callout'],
      callout: ['callout', 'bullets'],
      heading: ['heading', 'bullets', 'heading', 'checks'],
      'lead-late': ['bullets', 'trend', 'message'],
      'timeline-facts': ['timeline', 'facts'],
      'pareto-number': ['pareto', 'number'],
      'pair-chart': ['bullets', 'callout', 'trend'],
      'message-list': ['message', 'bullets'],
      'market-long': ['market', 'text'],
      'funnel-stat': ['funnel', 'stat', 'text'],
      'chart-summary': ['diverge', 'summary'],
      'goal-stack': ['ring', 'stat', 'goal', 'stack'],
      'number-ring': ['number', 'ring', 'number', 'bars'],
      'linked-numbers': ['number', 'number', 'number', 'stack'],
      'spark-kpi-list': ['spark', 'kpi', 'bullets'],
      'stacked-checks': ['delta', 'checks', 'callout'],
    }
    for (const id of ['white', 'navy', 'serif'] as const) {
      for (const size of [undefined, 'large'] as const) {
        for (const slide of reviewSlides({ theme: { id, size } })) {
          expect(slide.blocks?.map((b) => b.type), `${id} ${size ?? 'normal'} ${slide.id}`).toEqual(expected[slide.id.replace('review-', '')])
          if (slide.id === 'review-pair-chart') {
            const [list, callout, chart] = slide.blocks!
            expect(list.at?.y).toBe(callout.at?.y)
            expect(chart.at?.y).toBeGreaterThan(list.at!.y)
            expect([chart.at?.x, chart.at?.w]).toEqual([0, 12])
          }
          if (slide.id === 'review-funnel-stat') {
            const [funnel, stat, text] = slide.blocks!
            expect(funnel.at).toEqual({ x: 0, y: 0, w: 8, h: 12 })
            expect(stat.at).toEqual({ x: 8, y: 0, w: 4, h: 5 })
            expect(text.at).toEqual({ x: 8, y: 5, w: 4, h: 7 })
          }
          if (slide.id === 'review-chart-summary') {
            const [chart, summary] = slide.blocks!
            expect(chart.at).toEqual({ x: 0, y: 0, w: 12, h: 5 })
            expect(summary.at).toEqual({ x: 0, y: 5, w: 12, h: 7 })
            expect(summary.items).toHaveLength(4)
          }
          if (slide.id === 'review-goal-stack') {
            const [ring, stat, goal, stack] = slide.blocks!
            expect(ring.at).toEqual({ x: 4, y: 0, w: 8, h: 5 })
            expect(stat.at).toEqual({ x: 0, y: 0, w: 4, h: 5 })
            expect(goal.at).toEqual({ x: 0, y: 5, w: 5, h: 7 })
            expect(stack.at).toEqual({ x: 5, y: 5, w: 7, h: 7 })
          }
          if (slide.id === 'review-number-ring') {
            const [first, ring, second, bars] = slide.blocks!
            expect(first.at).toEqual({ x: 0, y: 0, w: 4, h: 5 })
            expect(ring.at).toEqual({ x: 8, y: 5, w: 4, h: 7 })
            expect(second.at).toEqual({ x: 4, y: 0, w: 8, h: 5 })
            expect(bars.at).toEqual({ x: 0, y: 5, w: 8, h: 7 })
          }
          if (slide.id === 'review-linked-numbers') {
            const [first, second, third, chart] = slide.blocks!
            expect([first.look, first.link, second.look, third.look]).toEqual(['card', 'arrow', 'plain', 'plain'])
            expect([first.at, second.at, third.at, chart.at]).toEqual([
              { x: 0, y: 0, w: 4, h: 6 }, { x: 4, y: 0, w: 4, h: 6 },
              { x: 8, y: 0, w: 4, h: 6 }, { x: 0, y: 6, w: 12, h: 6 },
            ])
          }
          if (slide.id === 'review-spark-kpi-list') {
            const [spark, kpi, list] = slide.blocks!
            expect([spark.at, kpi.at, list.at]).toEqual([
              { x: 0, y: 0, w: 12, h: 5 }, { x: 0, y: 5, w: 8, h: 7 }, { x: 8, y: 5, w: 4, h: 7 },
            ])
            expect([kpi.look, list.look, kpi.items.length, list.items.length]).toEqual(['card', 'card', 2, 3])
          }
          if (slide.id === 'review-stacked-checks') {
            const [delta, checks, callout] = slide.blocks!
            expect([delta.at, checks.at, callout.at]).toEqual([
              { x: 0, y: 4, w: 6, h: 8 }, { x: 6, y: 0, w: 6, h: 12 }, { x: 0, y: 0, w: 6, h: 4 },
            ])
            expect(checks.items).toHaveLength(3)
          }
        }
      }
    }
  })

  it('여백을 견줄 두 조합은 항목 수와 차트의 총건수가 맞는다', () => {
    const slides = reviewSlides()
    const timeline = slides.find((s) => s.id === 'review-timeline-facts')!
    expect(timeline.blocks?.map((b) => b.items.length)).toEqual([3, 2])

    const pareto = slides.find((s) => s.id === 'review-pareto-number')!.blocks![0]
    expect(pareto.variant).toBe('rows')
    expect(pareto.items).toHaveLength(4)
    const total = pareto.items.reduce((sum, item) => sum + Number(item.value), 0)
    expect(pareto.fields.heading).toContain(`${total}건`)
  })
})

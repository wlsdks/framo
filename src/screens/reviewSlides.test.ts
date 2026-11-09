import { describe, expect, it } from 'vitest'
import { composeAreaH, rearrangeBlocks } from '../deck/blocks'
import { reviewSlides } from './reviewSlides'

describe('대표 조합', () => {
  it('짧은 목록과 핵심 문장을 다시 놓으면 두 칸의 너비가 치우치지 않는다', () => {
    const slide = reviewSlides().find((s) => s.id === 'review-message-stack-2')!
    const arranged = rearrangeBlocks(slide.blocks!, composeAreaH(slide, undefined, true))!
    expect(arranged.map((b) => b.at?.w)).toEqual([6, 6])
    expect(arranged.map((b) => b.at?.x)).toEqual([0, 6])
  })

  it('띄어쓰기가 많은 목록도 실제 글 폭을 어림해 결론 옆에 놓는다', () => {
    const slide = reviewSlides().find((s) => s.id === 'review-message-stack-2-long')!
    const arranged = rearrangeBlocks(slide.blocks!, composeAreaH(slide, undefined, true))!
    expect(arranged.map((b) => [b.at?.x, b.at?.y, b.at?.w])).toEqual([[0, 0, 6], [6, 0, 6]])
  })

  it('목록과 비율 원을 다시 놓을 때 목록이 지나치게 좁아지지 않는다', () => {
    const slide = reviewSlides().find((s) => s.id === 'review-list-ring')!
    const arranged = rearrangeBlocks(slide.blocks!, composeAreaH(slide, undefined, true))!
    expect(arranged.map((b) => [b.at?.x, b.at?.y, b.at?.w])).toEqual([[0, 0, 6], [6, 0, 6]])
    expect(arranged[0].items.map((item) => item.title)).toEqual(slide.blocks![0].items.map((item) => item.title))
    expect(arranged[1].fields.value).toBe('72%')
  })

  it('테마와 글자 크기가 달라도 의도한 컴포넌트를 모두 담는다', () => {
    const expected: Record<string, string[]> = {
      'list-note-short': ['bullets', 'note'],
      'list-note-long': ['bullets', 'note'],
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
      'pair-chart-wide': ['bullets', 'callout', 'trend'],
      'message-list': ['message', 'bullets'],
      ...Object.fromEntries([2, 3, 4, 5, 6].flatMap((n) => [[`message-stack-${n}`, ['message', 'bullets']], [`message-stack-${n}-long`, ['message', 'bullets']]])),
      ...Object.fromEntries(['base', 'lines', 'dots'].map((variant) => [`mixed-versus-${variant}`, ['versus', 'note']])),
      ...Object.fromEntries(['base', 'gap'].map((variant) => [`mixed-attain-${variant}`, ['attain', 'note']])),
      'missing-rating': ['rating', 'note'],
      'uncertain-progress': ['progress', 'note'],
      'five-lane-progress': ['progress'],
      'list-ring': ['bullets', 'ring'],
      'list-ring-long': ['bullets', 'ring'],
      'list-ring-very-long': ['bullets', 'ring'],
      ...Object.fromEntries(['base', 'gauge'].flatMap((variant) => [[`ring-range-${variant}`, ['ring', 'note']], [`ring-unit-${variant}`, ['ring', 'note']]])),
      'market-long': ['market', 'text'],
      'wipe-long': ['wipe'],
      'wipe-short': ['wipe'],
      'funnel-stat': ['funnel', 'stat', 'text'],
      'chart-summary': ['diverge', 'summary'],
      'goal-stack': ['ring', 'stat', 'goal', 'stack'],
      'number-ring': ['number', 'ring', 'number', 'bars'],
      'linked-numbers': ['number', 'number', 'number', 'stack'],
      'spark-kpi-list': ['spark', 'kpi', 'bullets'],
      'kpi-next-actions': ['kpi', 'bullets'],
      'kpi-next-actions-long': ['kpi', 'bullets'],
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

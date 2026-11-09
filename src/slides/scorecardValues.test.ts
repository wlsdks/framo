import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { emptyItem, makeSlide } from '../deck/generate'
import { createSampleDeck } from '../deck/sample'
import { SlideCanvas } from './SlideCanvas'

function render(target: string, value: string): string {
  const slide = { ...makeSlide('scorecard'), items: [{ ...emptyItem(), id: 'row', title: '가상의 지표', meta: target, value }] }
  return renderToStaticMarkup(createElement(SlideCanvas, { deck: createSampleDeck(), slide, mode: 'final' }))
}

describe('목표 대비 실적', () => {
  it('0도 입력한 실적이면 달성률 0%로 표시한다', () => {
    expect(render('10건', '0건')).toContain('>0%</span>')
    const lower = render('10건 이하', '0건')
    expect(lower).toContain('is-met')
    expect(lower).not.toContain('Infinity')
  })

  it('음수 실적은 원문을 남기고 음수 막대나 달성 판정을 만들지 않는다', () => {
    const html = render('10건', '-2건')
    expect(html).toContain('−2')
    expect(html).not.toContain('is-miss')
    expect(html).not.toContain('is-met')
    expect(html).not.toMatch(/--a:-/)
  })

  it('막대는 달성률을 그려 낮을수록 좋은 지표를 이루면 목표 줄을 넘는다', () => {
    const bar = (html: string) => {
      const m = /--a:([\d.]+);--t:([\d.]+)/.exec(html)
      return m ? { a: Number(m[1]), t: Number(m[2]) } : null
    }
    // 6.5주 이하를 6주로: 108%라 막대가 목표 줄을 넘는다(값으로 그리면 92%에서 끝나 못 미친 줄과 같아 보였다)
    const met = bar(render('6.5주 이하', '6주'))!
    expect(met.a).toBeGreaterThan(met.t)
    // 5분 이하를 6분으로: 못 미쳐 목표 줄 앞에서 끝난다
    const miss = bar(render('5분 이하', '6분'))!
    expect(miss.a).toBeLessThan(miss.t)
    // 높을수록 좋은 지표는 값으로 그린 것과 같다: 80%에 72%면 90%에서 끝난다
    expect(bar(render('80%', '72%'))).toEqual({ a: 90, t: 100 })
  })

  it('계산 범위를 넘는 달성률은 무한대로 표시하지 않는다', () => {
    const html = render(`${'1' + '0'.repeat(307)}건 이하`, '0.00000001건')
    expect(html).not.toContain('Infinity')
    expect(html).not.toContain('NaN')
  })
})

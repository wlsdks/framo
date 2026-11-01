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

  it('계산 범위를 넘는 달성률은 무한대로 표시하지 않는다', () => {
    const html = render(`${'1' + '0'.repeat(307)}건 이하`, '0.00000001건')
    expect(html).not.toContain('Infinity')
    expect(html).not.toContain('NaN')
  })
})

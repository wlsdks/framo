import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { emptyItem, makeSlide } from '../deck/generate'
import { createSampleDeck } from '../deck/sample'
import { SlideCanvas } from './SlideCanvas'

function render(values: string[], unit = ''): string {
  const slide = { ...makeSlide('funnel'), fields: { unit }, items: values.map((value, i) => ({ ...emptyItem(), id: `item-${i}`, title: `단계 ${i + 1}`, value })) }
  return renderToStaticMarkup(createElement(SlideCanvas, { deck: createSampleDeck(), slide, mode: 'final' }))
}

describe('깔때기의 막대와 전환율', () => {
  it('같은 단위의 감소하는 값은 처음부터 끝까지의 비율을 보여 준다', () => {
    const html = render(['120건', '48건', '24건'])
    expect(html).toContain('20%')
    expect(html).toContain('fn-total')
  })

  it('마지막 값이 처음보다 크면 전체 전환율로 말하지 않는다', () => {
    const html = render(['120건', '48건', '150건'])
    expect(html).not.toContain('125%')
    expect(html).not.toContain('fn-total')
    expect(html).toContain('150')
  })

  it.each([['120건', '48%', '24건'], ['120건', '-2건', '24건']])('단위가 다르거나 음수면 잘못된 막대 길이를 보여 주지 않는다: %s', (...values) => {
    const html = render(values)
    expect(html).not.toContain('fn-total')
    expect(html.match(/class="it fn-row[^\"]*is-blank/g)).toHaveLength(3)
    for (const value of values) expect(html).toContain(value.replace('건', '').replace('%', ''))
  })

  it('값에 적힌 단위와 단위 칸이 같아도 한 번만 보인다', () => {
    const text = render(['120건', '48건', '24건'], '건').replace(/<[^>]*>/g, '').replace(/\s/g, '')
    expect(text).toContain('120건')
    expect(text).not.toContain('건건')
  })
})

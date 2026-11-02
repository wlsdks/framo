import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { emptyItem, makeSlide } from '../deck/generate'
import { createSampleDeck } from '../deck/sample'
import { SlideCanvas } from './SlideCanvas'

function render(values: string[], unit = '건', mode: 'edit' | 'final' = 'final', startValue = '100') {
  const slide = { ...makeSlide('bridge'), fields: { startValue, unit }, items: values.map((value, i) => ({ ...emptyItem(), id: `factor-${i}`, title: `요인 ${i + 1}`, value })) }
  return renderToStaticMarkup(createElement(SlideCanvas, { deck: createSampleDeck(), slide, mode }))
}

describe('증감 요인의 끝 값', () => {
  it('모든 값을 알고 단위가 같으면 끝 값을 계산한다', () => {
    const html = render(['+10', '-5'])
    expect(html).not.toContain('is-incomplete')
    expect(html).toContain('105')
  })

  it("더하고 빼서 0이 되면 끝 값은 '0'이다 ('−0'이 아니다)", () => {
    // 0.3억에서 0.1억과 0.2억을 빼면 부동소수로 -2.8e-17이라 끝 값이 '−0'으로 그려졌다
    const html = render(['-0.1', '-0.2'], '억 원', 'final', '0.3')
    expect(html).toMatch(/wf-end[\s\S]*?class="wf-num">0</)
    expect(html).not.toMatch(/[−-]0</)
  })

  it.each([['+10', ''], ['+10', '확인 중'], ['+10건', '-5%']])('값이 없거나 비교할 수 없으면 0으로 간주하지 않는다: %s', (...values) => {
    const html = render(values)
    expect(html).toContain('is-incomplete')
    expect(html).not.toContain('>110<')
    expect(html).toContain('–')
    expect(render(values, '건', 'edit')).toContain('is-incomplete')
  })
})

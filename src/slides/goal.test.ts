import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { autoPlace, makeBlock } from '../deck/blocks'
import { makeSlide } from '../deck/generate'
import { createSampleDeck } from '../deck/sample'
import { SlideCanvas } from './SlideCanvas'

function render(value: string, target: string, unit: string, mode: 'final' | 'edit' = 'final'): string {
  const block = makeBlock('goal')
  const fields = { ...block.fields, value, target, unit }
  const blocks = autoPlace([], { ...block, fields })!
  return renderToStaticMarkup(createElement(SlideCanvas, { deck: createSampleDeck(), slide: { ...makeSlide('compose'), blocks }, mode }))
}

describe('목표 대비 단위', () => {
  it.each([
    ['8명', '10명', '명', '8명/목표10명'],
    ['8', '10', '명', '8명/목표10명'],
    ['8,000만', '1억', '억 원', '8,000만원/목표1억원'],
  ])('각 값에 적은 단위와 단위 칸을 한 번만 보여 준다', (value, target, unit, expected) => {
    const text = render(value, target, unit).replace(/<[^>]*>/g, '').replace(/\s/g, '')
    expect(text).toContain(expected)
  })

  it('편집 중에는 단위 칸을 유지한다', () => {
    expect(render('8명', '10명', '명', 'edit')).toContain('bk-gl-u')
  })

  it('음수나 계산 범위를 넘는 값은 입력을 남기고 달성률과 막대를 만들지 않는다', () => {
    for (const [value, target] of [['-1', '10'], ['1' + '0'.repeat(307), '0.00000001']]) {
      const html = render(value, target, '건')
      expect(html).not.toContain('Infinity')
      expect(html).not.toContain('NaN')
      expect(html).not.toContain('class="bk-gl-bar"')
      expect(html).toContain('bk-gl-v')
      expect(html).toContain('bk-gl-t')
    }
  })
})

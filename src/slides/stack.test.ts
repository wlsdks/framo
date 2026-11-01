import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { autoPlace, makeBlock } from '../deck/blocks'
import { makeSlide } from '../deck/generate'
import { createSampleDeck } from '../deck/sample'
import { SlideCanvas } from './SlideCanvas'

function render(values: string[], variant: 'sum' | 'pct', mode: 'edit' | 'final' = 'final'): string {
  const block = makeBlock('stack')
  const items = values.map((value, i) => ({ ...block.items[i % block.items.length], id: `item-${i}`, title: `기간 ${i + 1}`, value }))
  const blocks = autoPlace([], { ...block, fields: { parts: '기획, 운영, 지원' }, items, variant })!
  return renderToStaticMarkup(createElement(SlideCanvas, { deck: createSampleDeck(), slide: { ...makeSlide('compose'), blocks }, mode }))
}

describe('쌓은 막대의 조각', () => {
  it.each(['sum', 'pct'] as const)('%s: 모든 조각에 수가 있으면 그린다', (variant) => {
    const html = render(['10, 5, 2', '12, 6, 3'], variant)
    expect(html).toContain('bk-st-seg')
    expect(html).toContain('기간 1')
  })

  it.each(['sum', 'pct'] as const)('%s: 빈 조각이나 다른 단위는 뒤의 값을 다른 색으로 옮기지 않는다', (variant) => {
    for (const value of ['10, -, 5', '10건, 5%, 2건', '10, -2, 5', '10, 5', '10, 5, 2, 1']) {
      const html = render([value, '12, 6, 3'], variant)
      expect(html, value).not.toContain('bk-st-seg')
      expect(html, value).toContain('기간 1')
      expect(html, value).toContain(value.replace(/-(?=\d)/g, '−'))
      expect(render([value, '12, 6, 3'], variant, 'edit')).toContain('나눈 것마다 0 이상 숫자를 하나씩')
    }
  })

  it.each(['sum', 'pct'] as const)('%s: 모두 0인 줄도 작성한 값을 보여 준다', (variant) => {
    const html = render(['0, 0, 0', '12, 6, 3'], variant)
    expect(html).toContain('0, 0, 0')
    expect(html).toContain('bk-st-seg')
  })

  it.each(['sum', 'pct'] as const)('%s: 합이 계산 범위를 넘으면 막대를 만들지 않는다', (variant) => {
    const huge = '9'.repeat(308)
    const html = render([`${huge}, ${huge}, ${huge}`, '12, 6, 3'], variant)
    expect(html).not.toContain('bk-st-seg')
    expect(html).not.toContain('∞')
  })
})

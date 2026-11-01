import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { autoPlace, makeBlock } from '../deck/blocks'
import { makeSlide } from '../deck/generate'
import { createSampleDeck } from '../deck/sample'
import { SlideCanvas } from './SlideCanvas'

function render(type: 'split' | 'merge', values: string[], total = '', mode: 'final' | 'edit' = 'final', unit = ''): string {
  const block = makeBlock(type)
  const items = values.map((value, i) => ({ ...block.items[i % block.items.length], id: `item-${i}`, title: `항목 ${i + 1}`, value }))
  const blocks = autoPlace([], { ...block, fields: { ...block.fields, total, unit }, items })!
  return renderToStaticMarkup(createElement(SlideCanvas, { deck: createSampleDeck(), slide: { ...makeSlide('compose'), blocks }, mode }))
}

describe('조각의 합계와 비율', () => {
  it.each(['split', 'merge'] as const)('%s: 같은 단위의 수는 합계를 계산한다', (type) => {
    const html = render(type, ['60만 원', '40만 원'])
    expect(html).toContain('100')
    expect(html).not.toContain('is-blank')
  })

  it.each(['split', 'merge'] as const)('%s: 비교할 수 없는 값은 합계와 조각을 만들지 않고 이름과 값을 남긴다', (type) => {
    for (const values of [['60건', '40%'], ['60건', ''], ['60건', '알 수 없음'], ['60건', '-2건']]) {
      const html = render(type, values)
      expect(html, values.join(',')).toContain('is-blank')
      expect(html, values.join(',')).toContain('항목 1')
      expect(html, values.join(',')).toContain('항목 2')
      expect(html, values.join(',')).toContain('60')
      expect(html, values.join(',')).not.toContain(type === 'split' ? 'bk-sg-seg' : 'bk-mg-seg')
      if (type === 'split') expect(html, values.join(',')).not.toContain('is-none')
    }
  })

  it.each(['split', 'merge'] as const)('%s: 직접 쓴 합계가 다르면 막대 대신 입력한 값을 그대로 보여 준다', (type) => {
    for (const total of ['120만 원', '100건', '확인 필요']) {
      const html = render(type, ['60만 원', '40만 원'], total)
      expect(html).toContain('is-blank')
      expect(html).toContain('항목 1')
      expect(html).not.toContain(type === 'split' ? 'bk-sg-seg' : 'bk-mg-seg')
      expect(render(type, ['60만 원', '40만 원'], total, 'edit')).toContain('같도록 확인해 주세요')
    }
    expect(render(type, ['60만 원', '40만 원'], '100만 원')).not.toContain('is-blank')
    expect(render(type, ['6,000만 원', '4,000만 원'], '1억 원')).not.toContain('is-blank')
  })

  it.each(['split', 'merge'] as const)('%s: 값에 적힌 단위를 따로 또 붙이지 않는다', (type) => {
    const text = render(type, ['60만 원', '40만 원'], '100만 원', 'final', '만 원').replace(/<[^>]*>/g, '').replace(/\s/g, '')
    expect(text).toContain('60만원')
    expect(text).not.toContain('60만원만원')
  })

  it.each(['split', 'merge'] as const)('%s: 합이 계산 범위를 넘으면 조각과 합계를 만들지 않는다', (type) => {
    const huge = '9'.repeat(308)
    const html = render(type, [huge, huge], huge)
    expect(html).toContain('is-blank')
    expect(html).not.toContain(type === 'split' ? 'bk-sg-seg' : 'bk-mg-seg')
    expect(html).not.toContain('∞')
  })

  it('나누기의 0인 조각도 이름과 0%를 목록에 남긴다', () => {
    const html = render('split', ['60건', '0건'])
    expect(html).toContain('data-need="list"')
    expect(html).toContain('항목 2')
    expect(html).toContain('0%')
    expect(html).not.toContain('is-none')
  })
})

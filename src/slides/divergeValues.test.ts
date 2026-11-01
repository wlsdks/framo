import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { autoPlace, makeBlock } from '../deck/blocks'
import { emptyItem, makeSlide } from '../deck/generate'
import { createSampleDeck } from '../deck/sample'
import { SlideCanvas } from './SlideCanvas'

function render(values: string[], mode: 'edit' | 'final' = 'final'): string {
  const block = makeBlock('diverge')
  const items = values.map((value, i) => ({ ...emptyItem(), id: `item-${i}`, title: `항목 ${i + 1}`, value }))
  const blocks = autoPlace([], { ...block, items })!
  return renderToStaticMarkup(createElement(SlideCanvas, { deck: createSampleDeck(), slide: { ...makeSlide('compose'), blocks }, mode }))
}

describe('항목별 증감의 입력', () => {
  it('같은 단위의 양수와 음수는 방향과 크기를 그린다', () => {
    const html = render(['+10건', '-5건'])
    expect(html.match(/class="bk-dv-bar"/g)).toHaveLength(2)
  })

  it('서로 다른 단위는 입력을 남기고 막대로 비교하지 않는다', () => {
    const html = render(['+10건', '-5%'])
    expect(html).not.toContain('class="bk-dv-bar"')
    expect(html.replace(/<[^>]*>/g, '').replaceAll('−', '-')).toContain('+10건')
    expect(html.replace(/<[^>]*>/g, '').replaceAll('−', '-')).toContain('-5%')
    expect(render(['+10건', '-5%'], 'edit')).toContain('같은 단위의 숫자로 적어 주세요.')
  })
})

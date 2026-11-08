import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { emptyItem, makeSlide } from '../deck/generate'
import { createSampleDeck } from '../deck/sample'
import { SlideCanvas } from './SlideCanvas'

function render(values: string[], mode: 'edit' | 'final' = 'final', variant = 'base'): string {
  const slide = { ...makeSlide('bars'), variant, items: values.map((value, i) => ({ ...emptyItem(), id: `item-${i}`, title: `항목 ${i + 1}`, value })) }
  return renderToStaticMarkup(createElement(SlideCanvas, { deck: createSampleDeck(), slide, mode }))
}

describe('막대 비교의 값', () => {
  it('같은 단위의 값과 빈 칸은 적은 값만 비교한다', () => {
    const html = render(['20건', '', '10건'])
    expect(html.match(/class="br-fill"/g)).toHaveLength(2)
    expect(html).toContain('--p:100.00')
    expect(html).toContain('--p:50.00')
  })

  it.each([['20건', '10%'], ['20건', '-2건'], ['20건', '미정']])('견줄 수 없는 입력은 글을 남기고 막대와 점을 그리지 않는다: %s', (...values) => {
    for (const variant of ['base', 'columns']) {
      const html = render(values, 'final', variant)
      expect(html).not.toContain('class="br-fill"')
      expect(html).not.toContain('class="br-dot"')
      for (const value of values) expect(html.replace(/<[^>]*>/g, '').replaceAll('−', '-')).toContain(value)
      expect(render(values, 'edit', variant)).toContain('같은 단위의 0 이상 숫자를 적어 주세요.')
    }
  })

  it('편집할 때 견줄 수 없는 칸에만 표시를 한다 (발표할 때는 없다)', () => {
    const edit = render(['20건', '-2건', '', '10%'], 'edit')
    expect(edit.match(/is-unfit/g)).toHaveLength(2)
    expect(render(['20건', '-2건'], 'final')).not.toContain('is-unfit')
    expect(render(['20건', '10건'], 'edit')).not.toContain('is-unfit')
  })

  it('사용자가 0을 적었으면 편집 중에도 임의의 예시 막대로 바꾸지 않는다', () => {
    const html = render(['0', '0'], 'edit')
    expect(html).not.toContain('is-demo')
    expect(html.match(/--p:0\.00/g)).toHaveLength(2)
  })
})

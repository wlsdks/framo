import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { autoPlace, makeBlock } from '../deck/blocks'
import { makeSlide } from '../deck/generate'
import { createSampleDeck } from '../deck/sample'
import { SlideCanvas } from './SlideCanvas'

function render(type: 'ratio' | 'tiles', value: string, total: string, mode: 'final' | 'edit' = 'final', unit = ''): string {
  const block = makeBlock(type)
  const fields = { ...block.fields, label: '가상의 참여자', value, unit, [type === 'ratio' ? 'total' : 'of']: total }
  const blocks = autoPlace([], { ...block, fields })!
  return renderToStaticMarkup(createElement(SlideCanvas, { deck: createSampleDeck(), slide: { ...makeSlide('compose'), blocks }, mode }))
}

describe('몇 중 몇과 칸 조립', () => {
  it.each(['ratio', 'tiles'] as const)('%s: 정수는 하나에 하나씩 그린다', (type) => {
    const html = render(type, '4', '10')
    const mark = type === 'ratio' ? 'bk-rt-d' : 'bk-tl-sq'
    expect(html.match(new RegExp(`class="${mark}(?: is-on)?"`, 'g'))).toHaveLength(10)
    expect(html.match(new RegExp(`class="${mark} is-on"`, 'g'))).toHaveLength(4)
  })

  it.each(['ratio', 'tiles'] as const)('%s: 소수는 가까운 정수로 바꾸지 않고 백분율 그림을 쓴다', (type) => {
    const html = render(type, '4.5', '10')
    const mark = type === 'ratio' ? 'bk-rt-d' : 'bk-tl-sq'
    expect(html.match(new RegExp(`class="${mark}(?: is-on)?"`, 'g'))).toHaveLength(100)
    expect(html.match(new RegExp(`class="${mark} is-on"`, 'g'))).toHaveLength(45)
    expect(html).toContain('4.5')
  })

  it.each(['ratio', 'tiles'] as const)('%s: 음수이거나 전체보다 크면 입력은 두고 오해할 그림을 만들지 않는다', (type) => {
    for (const value of ['12', '-2']) {
      const html = render(type, value, '10')
      expect(html).toContain(value === '-2' && type === 'tiles' ? '2' : value)
      expect(html).not.toContain(type === 'ratio' ? 'bk-rt-dots' : 'bk-tl-grid')
      expect(html).not.toContain('NaN')
      expect(render(type, value, '10', 'edit')).toContain('0 이상이고 전체보다 크지 않은 숫자')
    }
  })

  it('백분율로 적은 칸 조립은 전체 100칸 중 해당 칸을 채운다', () => {
    const html = render('tiles', '75%', '100')
    expect(html.match(/class="bk-tl-sq(?: is-on)?"/g)).toHaveLength(100)
    expect(html.match(/class="bk-tl-sq is-on"/g)).toHaveLength(75)
  })

  it('몇 중 몇은 숫자에 이미 단위를 적었어도 중복하지 않는다', () => {
    const text = render('ratio', '8명', '10명', 'final', '명').replace(/<[^>]*>/g, '').replace(/\s/g, '')
    expect(text).toContain('10명중8명')
    expect(text).not.toContain('명명')
  })
})

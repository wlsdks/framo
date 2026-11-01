import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { emptyItem, makeSlide } from '../deck/generate'
import { createSampleDeck } from '../deck/sample'
import { SlideCanvas } from './SlideCanvas'

function render(values: string[], variant = 'base', target = '', mode: 'edit' | 'final' = 'final'): string {
  const slide = { ...makeSlide('trend'), variant, fields: { target }, items: values.map((value, i) => ({ ...emptyItem(), id: `item-${i}`, title: `${i + 1}월`, value })) }
  return renderToStaticMarkup(createElement(SlideCanvas, { deck: createSampleDeck(), slide, mode }))
}

describe('추이에서 빠진 값', () => {
  it.each(['base', 'area'])('%s: 값이 빠진 시기는 선이나 면으로 건너뛰지 않는다', (variant) => {
    const html = render(['10', '20', '', '40', '50'], variant)
    expect(html.match(/class="tn-line"/g)).toHaveLength(2)
    expect(html.match(/class="tn-area"/g)).toHaveLength(2)
    expect(html).toContain('data-index="0"')
    expect(html).toContain('data-index="4"')
    expect(html).not.toContain('data-index="2"')
  })

  it('서로 떨어진 값은 점만 남긴다', () => {
    const html = render(['10', '', '30'])
    expect(html).not.toContain('class="tn-line"')
    expect(html).not.toContain('class="tn-area"')
    expect(html.match(/class="tn-dot"/g)).toHaveLength(2)
  })

  it('숫자로 읽을 수 없는 글은 점 대신 시기 아래에 남긴다', () => {
    const html = render(['10', '확인 중', '30'])
    expect(html).not.toContain('class="tn-line"')
    expect(html).toContain('확인 중')
    expect(html).not.toContain('data-index="1"')
  })

  it('서로 다른 단위의 값은 한 선에 놓지 않고 입력을 남긴다', () => {
    const html = render(['10건', '20%'])
    expect(html).not.toContain('class="tn-line"')
    expect(html).not.toContain('class="tn-dot"')
    expect(html.replace(/<[^>]*>/g, '')).toContain('10건')
    expect(html.replace(/<[^>]*>/g, '')).toContain('20%')
    expect(render(['10건', '20%'], 'base', '', 'edit')).toContain('값과 목표를 같은 단위의 숫자로 적어 주세요.')
  })

  it('목표만 다른 단위라면 값의 선은 보이고 목표선은 숨긴다', () => {
    const html = render(['10건', '20건'], 'base', '5%')
    expect(html).toContain('class="tn-line"')
    expect(html).not.toContain('class="tn-target"')
    expect(html.replace(/<[^>]*>/g, '')).toContain('목표 5%')
  })

  it('값을 아직 적지 않았어도 사용자가 적은 목표 글을 예시 숫자로 대체하지 않는다', () => {
    const html = render(['', ''], 'base', '확인 중', 'edit')
    expect(html).toContain('확인 중')
    expect(html).not.toContain('class="tn-target"')
    expect(html).toContain('값과 목표를 같은 단위의 숫자로 적어 주세요.')
  })
})

describe('두 선 비교에서 빠진 값', () => {
  it('한쪽만 빠져도 그 선만 끊고 다른 선은 이어 둔다', () => {
    const slide = {
      ...makeSlide('versus'), variant: 'lines',
      items: ['10', '20', '', '40', '50'].map((meta, i) => ({ ...emptyItem(), id: `pair-${i}`, title: `${i + 1}월`, meta, value: String(12 + i * 10) })),
    }
    const html = renderToStaticMarkup(createElement(SlideCanvas, { deck: createSampleDeck(), slide, mode: 'final' }))
    const a = html.match(/<svg class="vs-svg is-a"[^>]*>(.*?)<\/svg>/)?.[1] ?? ''
    const b = html.match(/<svg class="vs-svg is-b"[^>]*>(.*?)<\/svg>/)?.[1] ?? ''
    expect(a.match(/class="vs-line"/g)).toHaveLength(2)
    expect(b.match(/class="vs-line"/g)).toHaveLength(1)
  })
})

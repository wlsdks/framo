import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { autoPlace, makeBlock } from '../deck/blocks'
import { emptyItem, makeSlide } from '../deck/generate'
import { createSampleDeck } from '../deck/sample'
import { SlideCanvas } from './SlideCanvas'

function render(period: string, mode: 'edit' | 'final'): string {
  const block = makeBlock('gantt')
  const items = [{ ...emptyItem(), id: 'row', title: '가상의 준비', body: period }]
  const blocks = autoPlace([], { ...block, fields: { cols: '11월, 12월, 1월, 2월, 3월' }, items })!
  return renderToStaticMarkup(createElement(SlideCanvas, { deck: createSampleDeck(), slide: { ...makeSlide('compose'), blocks }, mode }))
}

describe('추진 일정의 막대', () => {
  it.each(['edit', 'final'] as const)('단위를 생략한 기간도 처음과 끝을 모두 표시한다: %s', (mode) => {
    const html = render('12~2월', mode)
    expect(html).toContain('class="bk-gt-bar" style="--s:1;--e:4"')
    if (mode === 'edit') expect(html).toContain('12~2월')
  })
})

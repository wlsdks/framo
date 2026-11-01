import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { autoPlace, makeBlock } from '../deck/blocks'
import { emptyItem, makeSlide } from '../deck/generate'
import { createSampleDeck } from '../deck/sample'
import { SlideCanvas } from './SlideCanvas'

describe('준비 상황의 상태', () => {
  it('미완료를 완료 건수에 넣지 않고 작성한 글을 남긴다', () => {
    const block = makeBlock('checks')
    const items = [
      { ...emptyItem(), id: 'first', title: '가상의 첫 과제', body: '미완료' },
      { ...emptyItem(), id: 'second', title: '가상의 둘째 과제', body: '완료' },
    ]
    const blocks = autoPlace([], { ...block, items })!
    const html = renderToStaticMarkup(createElement(SlideCanvas, { deck: createSampleDeck(), slide: { ...makeSlide('compose'), blocks }, mode: 'final' }))
    expect(html).toContain('2개 중 <b>1개</b> 완료')
    expect(html).toContain('미완료')
  })
})

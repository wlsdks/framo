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

  it('편집할 때 빈 준비 상황에도 줄마다 상태 칸이 보인다: 표시가 이 칸의 글을 따르니 접어 두면 어디에 적는지 모른다', () => {
    const blocks = autoPlace([], makeBlock('checks'))!
    const html = renderToStaticMarkup(createElement(SlideCanvas, { deck: createSampleDeck(), slide: { ...makeSlide('compose'), blocks }, mode: 'edit' }))
    expect(html.match(/class="bk-ck-s[ "]/g)?.length).toBe(4)
    expect(html).toContain('진행 중')
    // 담당과 기한은 덧붙이는 칸이라 그대로 접어 두고 '칸 더하기'로 연다
    expect(html).not.toMatch(/class="bk-ck-m[ "]/)
  })
})

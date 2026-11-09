import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { autoPlace, makeBlock } from '../deck/blocks'
import { emptyItem, makeSlide } from '../deck/generate'
import { createSampleDeck } from '../deck/sample'
import { SlideCanvas } from './SlideCanvas'

function render(variant: string, mode: 'edit' | 'final', value = '50%', state = '검토 중') {
  const block = makeBlock('progress')
  const items = [
    { ...emptyItem(), id: 'a', title: '가상의 준비', body: state, value: '100%' },
    { ...emptyItem(), id: 'b', title: '가상의 조사', value: '150%' },
    { ...emptyItem(), id: 'c', title: '가상의 확인', value: '10건' },
    { ...emptyItem(), id: 'd', title: '가상의 실행', value },
  ]
  const blocks = autoPlace([], { ...block, variant, items })!
  return renderToStaticMarkup(createElement(SlideCanvas, { deck: createSampleDeck(), slide: { ...makeSlide('compose'), blocks }, mode }))
}

describe('진행 현황의 상태와 진행률', () => {
  it.each(['base', 'board'])('진행률의 소수점을 막대에도 보존한다: %s', (variant) => {
    expect(render(variant, 'final', '0.04%')).toContain('--p:0.04')
    expect(render(variant, 'final', '99.96%')).toContain('--p:99.96')
  })

  it.each([['지연 없이 진행 중', 'doing'], ['지연되지 않았어요', 'unknown']])('지연이 아니라고 적은 상태를 지연 단에 두지 않는다: %s', (state, lane) => {
    const html = render('board', 'final', '50%', state)
    expect(html).toContain(state)
    expect(html).toContain(`ps-lane is-${lane}`)
    if (lane === 'doing') expect(html).toContain('has-detail')
    expect(html).not.toContain('ps-lane is-late')
  })

  it.each(['edit', 'final'] as const)('읽을 수 없는 진행률의 막대를 숨기고 원문을 남긴다: %s', (mode) => {
    const html = render('base', mode)
    expect(html.match(/ps-track is-unknown/g)).toHaveLength(2)
    expect(html).toContain('150%')
    expect(html).toContain('10건')
    expect(html).toContain('검토 중')
  })

  it.each([false, true])('상태를 비운 과제는 편집할 때도 진행률로 짐작한 상태를 세고 보인다 (컴포넌트: %s)', (inBlock) => {
    const items = [
      { ...emptyItem(), id: 'a', title: '가상의 준비', value: '100%' },
      { ...emptyItem(), id: 'b', title: '가상의 실행', value: '30%' },
    ]
    const slide = inBlock
      ? { ...makeSlide('compose'), blocks: autoPlace([], { ...makeBlock('progress'), variant: 'base', items })! }
      : { ...makeSlide('progress'), items }
    const html = (mode: 'edit' | 'final') => renderToStaticMarkup(createElement(SlideCanvas, { deck: createSampleDeck(), slide, mode }))
    const sum = (h: string) => /class="ps-sum">(.*?)<\/p>/.exec(h)?.[1]
    // 편집할 때만 짐작하지 않으면 머리줄의 상태별 수에서 그 과제가 빠져 발표 모습과 달랐다
    expect(sum(html('edit'))).toBe(sum(html('final')))
    expect(sum(html('edit'))).toContain('ps-count is-doing')
    expect(html('edit')).toContain('진행 중')
  })

  it.each(['edit', 'final'] as const)('알 수 없는 상태를 다른 상태로 잘못 분류하지 않는다: %s', (mode) => {
    const html = render('board', mode)
    expect(html).toContain('ps-lane is-unknown')
    expect(html).toContain('확인 필요')
    expect(html).toContain('검토 중')
    expect(html).not.toContain('ps-lane is-done')
    expect(html).not.toContain('ps-lane is-todo')
  })
})

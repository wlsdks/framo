import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { autoPlace, makeBlock } from '../deck/blocks'
import { emptyItem, makeSlide } from '../deck/generate'
import { createSampleDeck } from '../deck/sample'
import { seriesOf } from './blocks/Spark'
import { SlideCanvas } from './SlideCanvas'

function render(series: string, mode: 'edit' | 'final' = 'final'): string {
  const block = makeBlock('spark')
  const blocks = autoPlace([], { ...block, fields: { label: '가상의 지표', value: '20건', series } })!
  return renderToStaticMarkup(createElement(SlideCanvas, { deck: createSampleDeck(), slide: { ...makeSlide('compose'), blocks }, mode }))
}

describe('숫자와 흐름의 입력', () => {
  it('같은 단위의 값으로 흐름을 그린다', () => {
    expect(seriesOf('10건, 15건, 20건')).toEqual([10, 15, 20])
    expect(render('10건, 15건, 20건')).toContain('bk-sp-svg')
  })

  it.each(['10건, 20%', '10, -, 20', '확인 중', '10'])('견줄 수 없는 흐름은 원문을 두고 선을 생략한다: %s', (value) => {
    expect(render(value)).not.toContain('bk-sp-svg')
    expect(render(value).replace(/<[^>]*>/g, '')).toContain(value)
    expect(render(value, 'edit')).toContain('같은 단위의 숫자를 두 개 이상 적어 주세요.')
  })
})

describe('지표 흐름표의 입력', () => {
  function table(value: string, mode: 'edit' | 'final' = 'final'): string {
    const block = makeBlock('sparks')
    const items = [{ ...emptyItem(), title: '가상의 지표', value }]
    const blocks = autoPlace([], { ...block, items })!
    return renderToStaticMarkup(createElement(SlideCanvas, { deck: createSampleDeck(), slide: { ...makeSlide('compose'), blocks }, mode }))
  }

  it('같은 단위의 흐름은 선과 마지막 값을 그린다', () => {
    const html = table('10건, 15건, 20건')
    expect(html).toContain('bk-sx-svg')
    expect(html).toContain('20')
  })

  it.each(['10건, 20%', '10, -, 20', '확인 중'])('견줄 수 없으면 선 대신 원문을 보여 준다: %s', (value) => {
    const html = table(value)
    expect(html).not.toContain('bk-sx-svg')
    expect(html.replace(/<[^>]*>/g, '')).toContain(value)
    expect(table(value, 'edit')).toContain('값 확인')
  })
})

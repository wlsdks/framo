import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { autoPlace, makeBlock } from '../deck/blocks'
import { makeSlide } from '../deck/generate'
import { createSampleDeck } from '../deck/sample'
import { SlideCanvas } from './SlideCanvas'
import { meterOf } from './blocks/Meter'

describe('막대 하나의 비율', () => {
  it('견줄 수 있는 값은 실제 비율과 목표를 그린다', () => {
    expect(meterOf('3억 원', '5억 원', '4억 원')).toEqual({ p: 0.6, t: 0.8 })
    expect(meterOf('80%', '', '90%')).toEqual({ p: 0.8, t: 0.9 })
    expect(meterOf('120건', '', '100건')).toEqual({ p: 1, t: 100 / 120 })
  })

  it('범위를 벗어난 값을 0이나 100으로 잘라 다른 그림을 만들지 않는다', () => {
    expect(meterOf('120%', '', '')).toBeNull()
    expect(meterOf('-5%', '', '')).toBeNull()
    expect(meterOf('6건', '5건', '')).toBeNull()
    expect(meterOf('-1건', '5건', '')).toBeNull()
    expect(meterOf('2건', '5건', '6건')).toEqual({ p: 0.4, t: null })
  })

  it.each(['edit', 'final'] as const)('범위 밖 값도 작성한 글로 남긴다: %s', (mode) => {
    const block = { ...makeBlock('meter'), fields: { label: '가상의 값', value: '120%' } }
    const blocks = autoPlace([], block)!
    const html = renderToStaticMarkup(createElement(SlideCanvas, { deck: createSampleDeck(), slide: { ...makeSlide('compose'), blocks }, mode }))
    expect(html).toContain('120')
    expect(html).not.toContain('class="bk-mt-bar"')
  })
})

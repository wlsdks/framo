import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { autoPlace, makeBlock } from '../deck/blocks'
import { makeSlide } from '../deck/generate'
import { createSampleDeck } from '../deck/sample'
import { SlideCanvas } from './SlideCanvas'

function render(value: string, variant: string, mode: 'edit' | 'final'): string {
  const block = { ...makeBlock('ring'), variant, fields: { label: '가상의 비율', value } }
  const blocks = autoPlace([], block)!
  return renderToStaticMarkup(createElement(SlideCanvas, { deck: createSampleDeck(), slide: { ...makeSlide('compose'), blocks }, mode }))
}

describe('비율 원과 반원의 값', () => {
  it.each(['base', 'gauge'])('%s 모양은 0~100의 숫자와 백분율을 그린다', (variant) => {
    for (const value of ['0', '0%', '35.5%', '100%', '80']) {
      const html = render(value, variant, 'final')
      expect(html, value).toContain('bk-rg-track')
      expect(html, value).toContain(value.replace('%', ''))
    }
    expect(render('0.5%', variant, 'final')).toContain('--p:0.5')
    expect(render('.5%', variant, 'final')).toContain('--p:0.5')
    expect(render('0.04%', variant, 'final')).toContain('--p:0.04')
    expect(render('99.96%', variant, 'final')).toContain('--p:99.96')
  })

  it.each(['base', 'gauge'])('%s 모양은 맞지 않는 단위와 범위를 임의의 비율로 그리지 않는다', (variant) => {
    for (const mode of ['edit', 'final'] as const) for (const value of ['150%', '-5%', '10건', '80kg', '80% 이상', '확인 중']) {
      const html = render(value, variant, mode)
      expect(html, `${mode}: ${value}`).not.toContain('bk-rg-track')
      expect(html, `${mode}: ${value}`).not.toContain('bk-rg-arc')
      expect(html, `${mode}: ${value}`).not.toContain('bk-rg-knob')
      expect(html.replace(/<[^>]*>/g, ''), `${mode}: ${value}`).toContain(value.replace('-', '−'))
      expect(html, `${mode}: ${value}`).toContain('bk-rg-v')
    }
  })
})

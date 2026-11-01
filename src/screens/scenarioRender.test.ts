import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createSampleDeck } from '../deck/sample'
import { SlideCanvas } from '../slides/SlideCanvas'
import { scenarioSlides } from './scenarioSlides'

describe('가상 발표를 그리는 경우', () => {
  it('모든 상황이 세 테마와 두 글자 크기의 편집·발표 화면에서 숫자 오류 없이 그려진다', () => {
    let rendered = 0
    for (const id of ['white', 'navy', 'serif'] as const) for (const size of [undefined, 'large'] as const) {
      const sample = createSampleDeck()
      const deck = { ...sample, theme: { ...sample.theme, id, size } }
      for (const slide of scenarioSlides(deck)) for (const mode of ['edit', 'final'] as const) {
        const html = renderToStaticMarkup(createElement(SlideCanvas, { deck, slide, mode }))
        const context = `${id} ${size ?? 'normal'} ${mode} ${slide.id}`
        expect(html, context).toContain('slide')
        expect(html, context).not.toMatch(/(?:NaN|Infinity)(?:px|%)/)
        expect(html, context).not.toMatch(/--[a-z0-9-]+:(?:NaN|Infinity)(?:;|")/)
        rendered++
      }
    }
    expect(rendered).toBeGreaterThan(400)
  }, 30000)
})

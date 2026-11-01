import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { autoPlace, makeBlock } from '../deck/blocks'
import { makeSlide } from '../deck/generate'
import { createSampleDeck } from '../deck/sample'
import { SlideCanvas } from './SlideCanvas'

function render(values: string[], variant?: string, mode: 'final' | 'edit' = 'final', blank: number[] = []): string {
  const block = makeBlock('pareto')
  const items = values.map((value, i) => ({ ...block.items[i % block.items.length], id: `item-${i}`, title: blank.includes(i) ? '' : `원인 ${i + 1}`, value }))
  const blocks = autoPlace([], { ...block, items, variant })!
  const slide = { ...makeSlide('compose'), blocks }
  return renderToStaticMarkup(createElement(SlideCanvas, { deck: createSampleDeck(), slide, mode }))
}

describe('원인 순위의 비율', () => {
  it.each([undefined, 'rows'])('같은 단위의 수는 누적 비율을 보여 준다 (%s)', (variant) => {
    const html = render(['50건', '30건', '20건'], variant)
    expect(html).toContain('80%')
    expect(html).toContain(variant === 'rows' ? 'bk-pr-fill' : 'bk-pa-canvas')
  })

  it.each([undefined, 'rows'])('단위가 섞이거나 값이 없거나 음수면 가짜 비율을 만들지 않는다 (%s)', (variant) => {
    for (const values of [['10건', '20%'], ['10건', ''], ['10건', '알 수 없음'], ['10건', '-2건'], ['0건', '0건']]) {
      const html = render(values, variant)
      expect(html, values.join(',')).toContain('원인 1')
      expect(html, values.join(',')).toContain(values[0])
      expect(html, values.join(',')).not.toContain('100%')
      expect(html, values.join(',')).not.toContain('bk-pa-canvas')
      expect(html, values.join(',')).not.toContain('bk-pr-fill')
      expect(html, values.join(',')).not.toContain('bk-cc-fill')
    }
  })

  it.each([undefined, 'rows'])('입력할 때만 숫자를 고칠 방법을 안내한다 (%s)', (variant) => {
    expect(render(['10건', '20%'], variant, 'edit')).toContain('모든 값을 같은 단위의 0 이상 숫자로 채워 주세요')
    expect(render(['10건', '20%'], variant)).not.toContain('모든 값을 같은 단위의 0 이상 숫자로 채워 주세요')
  })

  it.each([undefined, 'rows'])('합이 계산 범위를 넘으면 누적 비율을 만들지 않는다 (%s)', (variant) => {
    const huge = '9'.repeat(308)
    const html = render([huge, huge], variant)
    expect(html).not.toContain('bk-pa-canvas')
    expect(html).not.toContain('bk-pr-fill')
    expect(html).not.toContain('bk-cc-fill')
    expect(html).not.toContain('∞')
  })

  it.each([undefined, 'rows'])('큰 수 순서가 아니면 입력한 순서와 누적 비율은 유지하고 우선순위라고 부르지 않는다 (%s)', (variant) => {
    const html = render(['60건', '5건', '20건', '15건'], variant)
    expect(html.indexOf('원인 1')).toBeLessThan(html.indexOf('원인 2'))
    expect(html).toContain(variant === 'rows' ? 'bk-pr-fill' : 'bk-pa-canvas')
    expect(html).not.toContain('상위 3개가')
    expect(html).not.toContain('is-hl')
    expect(render(['60건', '5건', '20건', '15건'], variant, 'edit')).toContain('큰 값부터 순서를 바꾸면 먼저 살필 원인을 표시해요')
  })

  it.each([undefined, 'rows'])('편집 중 가운데 빈 항목은 상위 원인 개수에 넣지 않는다 (%s)', (variant) => {
    const html = render(['50건', '', '30건', '20건'], variant, 'edit', [1])
    expect(html).toContain('상위 2개가')
    expect(html).not.toContain('상위 3개가')
  })
})

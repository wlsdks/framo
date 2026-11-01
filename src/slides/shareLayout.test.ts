import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { makeSlide } from '../deck/generate'
import { createSampleDeck } from '../deck/sample'
import { SlideCanvas } from './SlideCanvas'

function render(values: string[], variant: string, mode: 'final' | 'edit' = 'final', unit = ''): string {
  const slide = makeSlide('share')
  const items = values.map((value, i) => ({ ...slide.items[i % slide.items.length], id: `item-${i}`, title: `항목 ${i + 1}`, value }))
  return renderToStaticMarkup(createElement(SlideCanvas, { deck: createSampleDeck(), slide: { ...slide, variant, fields: { ...slide.fields, unit }, items }, mode }))
}

describe('구성비의 그림', () => {
  it.each(['base', 'donut', 'units'])('같은 단위의 정상 값은 비율을 그린다 (%s)', (variant) => {
    const html = render(['50건', '30건', '20건'], variant)
    expect(html).toContain('50%')
    expect(html).toContain('30%')
    expect(html).toContain(variant === 'base' ? 'sh-seg' : variant === 'donut' ? 'sh-arc' : 'class="sh-u" style=')
  })

  it.each(['base', 'donut', 'units'])('단위 불일치, 빈 값, 음수는 입력을 유지하고 비율을 그리지 않는다 (%s)', (variant) => {
    for (const values of [['10건', '20%'], ['10건', ''], ['10건', '-2건'], ['0건', '0건']]) {
      const html = render(values, variant)
      expect(html).toContain('항목 1')
      expect(html).toContain(values[0])
      expect(html).not.toContain('class="sh-seg"')
      expect(html).not.toContain('class="sh-arc"')
      expect(html).not.toContain('class="sh-u" style=')
      expect(render(values, variant, 'edit')).toContain('모든 값을 같은 단위의 0 이상 숫자로 채워 주세요')
    }
  })

  it.each(['base', 'donut', 'units'])('합이 100이 아닌 백분율은 원래 숫자를 보이되 전체처럼 채우지 않는다 (%s)', (variant) => {
    for (const [values, unit] of [[['30%', '20%'], ''], [['30', '20'], '%']] as const) {
      const html = render([...values], variant, 'final', unit)
      expect(html).toContain('30')
      expect(html).toContain('20')
      expect(html).not.toContain('class="sh-seg"')
      expect(html).not.toContain('class="sh-arc"')
      expect(html).not.toContain('class="sh-u" style=')
      expect(render([...values], variant, 'edit', unit)).toContain('백분율의 합을 100%로 맞춰 주세요')
    }
  })

  it('값이 0인 조각을 건너뛰어도 원은 원래 항목 번호를 지킨다', () => {
    const html = render(['0건', '60건', '40건'], 'donut')
    expect(html).not.toContain('class="sh-arc" data-index="0"')
    expect(html).toContain('class="sh-arc" data-index="1"')
    expect(html).toContain('class="sh-arc" data-index="2"')
  })

  it.each(['base', 'donut', 'units'])('표시 자릿수의 반올림으로 생긴 작은 합계 차이는 허용한다 (%s)', (variant) => {
    const html = render(['33.3%', '33.3%', '33.3%'], variant)
    expect(html).toContain(variant === 'base' ? 'sh-seg' : variant === 'donut' ? 'sh-arc' : 'class="sh-u" style=')
    expect(render(['33.3%', '33.3%', '32.3%'], variant, 'edit')).toContain('백분율의 합을 100%로 맞춰 주세요')
  })

  it('값에 적힌 단위는 구성비 목록에 한 번만 보인다', () => {
    const text = render(['60건', '40건'], 'base', 'final', '건').replace(/<[^>]*>/g, '').replace(/\s/g, '')
    expect(text).toContain('60건')
    expect(text).not.toContain('건건')
  })

  it.each(['base', 'donut', 'units'])('합이 계산 범위를 넘으면 비율을 만들지 않는다 (%s)', (variant) => {
    const huge = '9'.repeat(308)
    const html = render([huge, huge], variant)
    expect(html).not.toContain('class="sh-seg"')
    expect(html).not.toContain('class="sh-arc"')
    expect(html).not.toContain('class="sh-u" style=')
    expect(html).not.toContain('∞')
  })

  it('값의 단위와 단위 칸이 다르면 다른 단위의 합계를 만들지 않는다', () => {
    const html = render(['10원', '20원'], 'base', 'final', '건')
    expect(html).not.toContain('class="sh-seg"')
    expect(html).not.toContain('합계 30건')
    expect(html).toContain('10원')
    expect(html).toContain('20원')
  })

  it('단위 칸에 %를 쓴 경우도 발표 화면에서 같은 비율을 두 번 반복하지 않는다', () => {
    const text = render(['60', '40'], 'base', 'final', '%').replace(/<[^>]*>/g, '').replace(/\s/g, '')
    expect(text.match(/60%/g)).toHaveLength(1)
    expect(text.match(/40%/g)).toHaveLength(1)
    expect(text).not.toContain('합계100%')
    const invalid = render(['30', '20'], 'base', 'final', '%').replace(/<[^>]*>/g, '').replace(/\s/g, '')
    expect(invalid).toContain('30%')
    expect(invalid).toContain('20%')
    const precise = render(['33.3', '33.3', '33.3'], 'base', 'final', '%').replace(/<[^>]*>/g, '').replace(/\s/g, '')
    expect(precise.match(/33\.3%/g)).toHaveLength(3)
  })
})

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { emptyItem, makeSlide } from '../deck/generate'
import { createSampleDeck } from '../deck/sample'
import { SlideCanvas } from './SlideCanvas'

function render(pairs: [string, string][], variant: string, mode: 'edit' | 'final' = 'final') {
  const slide = { ...makeSlide('versus'), variant, items: pairs.map(([meta, value], i) => ({ ...emptyItem(), id: `pair-${i}`, title: `항목 ${i + 1}`, meta, value })) }
  return renderToStaticMarkup(createElement(SlideCanvas, { deck: createSampleDeck(), slide, mode }))
}

describe('두 값 비교의 입력', () => {
  it.each(['base', 'lines', 'dots'])('%s: 단위가 다르면 두 값을 남기고 비교 그림을 그리지 않는다', (variant) => {
    const html = render([['10건', '20%'], ['5건', '10%']], variant)
    const text = html.replace(/<[^>]*>/g, '')
    expect(html).toContain('vs-rows is-text')
    expect(html).not.toContain('class="vs-line"')
    expect(html).not.toContain('class="vs-fill"')
    expect(html).not.toContain('class="vs-d is-a"')
    expect(text).toContain('10건')
    expect(text).toContain('20%')
    expect(render([['10건', '20%']], variant, 'edit')).toContain('같은 단위의 숫자를 적어 주세요.')
  })

  it('세로 막대의 음수는 0으로 그리지 않고 원문을 보여 준다', () => {
    const html = render([['-5', '10'], ['2', '4']], 'base')
    expect(html).toContain('vs-rows is-text')
    expect(html.replace(/<[^>]*>/g, '').replaceAll('−', '-')).toContain('-5')
    expect(html).not.toContain('class="vs-fill"')
  })

  it('선과 점은 음수를 제대로 비교할 수 있다', () => {
    expect(render([['-5', '10'], ['2', '4']], 'lines')).toContain('class="vs-line"')
    expect(render([['-5', '10'], ['2', '4']], 'dots')).toContain('class="vs-d is-a"')
  })

  it('숫자가 아닌 글도 발표 화면에 남긴다', () => {
    const html = render([['확인 중', '10'], ['2', '4']], 'lines')
    expect(html).toContain('vs-rows is-text')
    expect(html).toContain('확인 중')
    expect(html).not.toContain('class="vs-line"')
  })

  it.each(['base', 'lines', 'dots'])('%s: 비교할 수 없는 줄의 빈 값 자리를 표시한다', (variant) => {
    const html = render([['', '5%'], ['10건', '']], variant)
    expect(html).toContain('vs-rows is-text')
    expect(html).toContain('class="vs-num is-a">—</span>')
    expect(html).toContain('class="vs-num is-b">—</span>')
  })

  it.each([['base', 'vs-bars'], ['lines', 'vs-canvas'], ['dots', 'vs-rows']])('%s: 편집 중 입력이 잠시 올바르지 않아도 입력 칸의 짜임을 유지한다', (variant, wrapper) => {
    const good = render([['10건', '20건'], ['5건', '8건']], variant, 'edit')
    const editing = render([['10건', '20%'], ['5건', '8건']], variant, 'edit')
    expect(good).toContain(`class="${wrapper}`)
    expect(editing).toContain(`class="${wrapper}`)
    expect(editing).not.toContain('vs-rows is-text')
  })

  it('백분율끼리의 변화는 상대 증가율이 아니라 %p 차이로 보여 준다', () => {
    const html = render([['20%', '30%'], ['0%', '5%']], 'base')
    const text = html.replace(/<[^>]*>/g, '')
    expect(text).toContain('▲ 10%p')
    expect(text).toContain('▲ 5%p')
    expect(text).not.toContain('▲ 50%')
  })

  it('일부 값에만 쓴 공통 백분율 단위도 숫자만 적은 값에 적용한다', () => {
    const html = render([['20', '30'], ['40%', '50%']], 'base')
    const text = html.replace(/<[^>]*>/g, '')
    expect(text.match(/▲ 10%p/g)).toHaveLength(2)
  })

  it('일반 숫자는 앞 값에 대한 상대 변화율로 보여 준다', () => {
    const text = render([['20', '30'], ['10', '10']], 'base').replace(/<[^>]*>/g, '')
    expect(text).toContain('▲ 50%')
    expect(text).toContain('0%')
  })
})

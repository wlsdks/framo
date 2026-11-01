import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { autoPlace, makeBlock } from '../deck/blocks'
import { emptyItem, makeSlide } from '../deck/generate'
import { createSampleDeck } from '../deck/sample'
import { SlideCanvas } from './SlideCanvas'

function render(pairs: [string, string][], variant: 'base' | 'gap', mode: 'edit' | 'final' = 'final') {
  const block = makeBlock('attain')
  const items = pairs.map(([value, meta], i) => ({ ...emptyItem(), id: `item-${i}`, title: `기간 ${i + 1}`, value, meta }))
  const blocks = autoPlace([], { ...block, fields: { heading: '가상의 달성 현황', unit: '' }, items, variant })!
  return renderToStaticMarkup(createElement(SlideCanvas, { deck: createSampleDeck(), slide: { ...makeSlide('compose'), blocks }, mode }))
}

describe('기간별 달성의 실적과 목표', () => {
  it.each(['base', 'gap'] as const)('%s: 같은 단위는 실적과 목표를 비교한다', (variant) => {
    const html = render([['10건', '5건'], ['20건', '25건']], variant)
    expect(html).not.toContain('bk-tg-text')
    expect(html).toContain(variant === 'base' ? 'bk-cc-fill' : 'bk-ag-fill')
  })

  it.each(['base', 'gap'] as const)('%s: 낮을수록 좋은 목표는 목표보다 작을 때 달성이다', (variant) => {
    const html = render([['30분', '40분 이하'], ['50분', '40분 이하']], variant)
    expect(html).toMatch(/bk-cc-col[^\"]*is-hl/)
    expect(html).toMatch(/bk-cc-col[^\"]*is-miss/)
    expect(html).toContain('2번 중')
    if (variant === 'base') expect(html).toContain('133%')
    else expect(html).toMatch(/is-hl[^\"]*is-down/)
  })

  it.each(['base', 'gap'] as const)('%s: 견줄 수 없는 값은 원문을 남기고 차트를 그리지 않는다', (variant) => {
    for (const pairs of [
      [['10건', '5%'], ['20건', '15%']],
      [['10건', '확인 중'], ['20건', '15건']],
      [['-10건', '5건'], ['20건', '15건']],
    ] as [string, string][][]) {
      const html = render(pairs, variant)
      expect(html).toContain('bk-tg-text')
      expect(html).not.toContain('bk-cc-fill')
      expect(html).not.toContain('bk-tg-goal')
      expect(html).not.toContain('bk-ag-fill')
      for (const pair of pairs) for (const value of pair) expect(html.replace(/<[^>]*>/g, '').replaceAll('−', '-')).toContain(value)
      const editing = render(pairs, variant, 'edit')
      expect(editing).toContain('같은 단위의 0 이상 숫자를 적어 주세요.')
      expect(editing).not.toContain('bk-tg-text')
    }
  })

  it.each(['base', 'gap'] as const)('%s: 계산 범위를 넘는 비율은 그대로 글로 보여 준다', (variant) => {
    const html = render([['1' + '0'.repeat(300), '0.' + '0'.repeat(299) + '1'], ['2', '1']], variant)
    expect(html).toContain('bk-tg-text')
    expect(html).not.toMatch(/NaN|Infinity/)
  })

  it.each(['base', 'gap'] as const)('%s: 입력할 수 있는 여덟 기간 모두의 값을 남긴다', (variant) => {
    const pairs: [string, string][] = Array.from({ length: 8 }, (_, i) => [`${i + 1}건`, `${i + 11}%`])
    const html = render(pairs, variant)
    const text = html.replace(/<[^>]*>/g, '')
    for (let i = 0; i < pairs.length; i++) {
      expect(text).toContain(`기간 ${i + 1}`)
      expect(text).toContain(pairs[i][0])
      expect(text).toContain(pairs[i][1])
    }
  })

  it.each(['base', 'gap'] as const)('%s: 실적이 빈 줄도 목표가 실적 칸으로 밀리지 않는다', (variant) => {
    const html = render([['', '5%'], ['20건', '10%']], variant)
    const row = html.match(/<li class="bk-tg-text-row">([\s\S]*?)<\/li>/)?.[1] ?? ''
    expect(row.replace(/<[^>]*>/g, '')).toBe('기간 1—5%')
  })
})

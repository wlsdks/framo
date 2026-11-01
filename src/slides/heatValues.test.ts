import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { autoPlace, makeBlock } from '../deck/blocks'
import { emptyItem, makeSlide } from '../deck/generate'
import { createSampleDeck } from '../deck/sample'
import { SlideCanvas } from './SlideCanvas'

function render(rows: string[], variant = 'all', mode: 'edit' | 'final' = 'final', cols = '첫째, 둘째'): string {
  const block = makeBlock('heat')
  const items = rows.map((value, i) => ({ ...emptyItem(), id: `row-${i}`, title: `항목 ${i + 1}`, value }))
  const blocks = autoPlace([], { ...block, variant, fields: { cols }, items })!
  return renderToStaticMarkup(createElement(SlideCanvas, { deck: createSampleDeck(), slide: { ...makeSlide('compose'), blocks }, mode }))
}

describe('색 표의 값', () => {
  it('단위가 섞인 표는 숫자를 남기고 잘못된 색 비교를 하지 않는다', () => {
    const html = render(['10건, 20건', '30%, 40%'])
    expect(html.match(/class="bk-hm-cell is-empty"/g)).toHaveLength(4)
    expect(html).not.toMatch(/--t:[0-9]/)
    expect(html.replace(/<[^>]*>/g, '')).toContain('10건')
    expect(html.replace(/<[^>]*>/g, '')).toContain('30%')
    expect(render(['10건, 20건', '30%, 40%'], 'all', 'edit')).toContain('같은 범위의 값은 같은 단위로 적어 주세요.')
  })

  it('줄마다 비교할 때는 서로 다른 줄의 단위를 허용한다', () => {
    const html = render(['10건, 20건', '30%, 40%'], 'rows')
    expect(html.match(/--t:[0-9]/g)).toHaveLength(4)
  })

  it('숫자가 아닌 값도 원래 칸에 남긴다', () => {
    const html = render(['?, 20', '30, 40'])
    expect(html).toContain('?')
    expect(html).toContain('bk-hm-cell is-empty')
  })

  it('확인 중인 값 뒤의 숫자를 다음 칸에 남긴다', () => {
    const html = render(['10, 확인 중, 20'])
    const row = html.match(/<li class="it bk-hm-row">([\s\S]*?)<\/li>/)?.[1] ?? ''
    const cells = [...row.matchAll(/<span class="bk-hm-cell[^\"]*"[^>]*>([\s\S]*?)<\/span>\s*<\/span>/g)].map((m) => m[1].replace(/<[^>]*>/g, ''))
    expect(cells).toEqual(['10', '확인 중', '20'])
  })

  it('이름 없는 열이 있어도 다음 열의 이름과 값을 당기지 않는다', () => {
    const html = render(['10, 20, 30'], 'all', 'final', '첫째, , 셋째')
    const head = html.match(/<div class="bk-hm-head[^\"]*">([\s\S]*?)<\/div>/)?.[1] ?? ''
    const headers = [...head.matchAll(/<span class="bk-hm-cn">([\s\S]*?)<\/span>(?:<\/span>)?/g)].map((m) => m[1].replace(/<[^>]*>/g, ''))
    expect(headers).toEqual(['첫째', '', '셋째'])
    const row = html.match(/<li class="it bk-hm-row">([\s\S]*?)<\/li>/)?.[1] ?? ''
    const cells = [...row.matchAll(/<span class="bk-hm-cell[^\"]*"[^>]*>([\s\S]*?)<\/span>\s*<\/span>/g)].map((m) => m[1].replace(/<[^>]*>/g, ''))
    expect(cells).toEqual(['10', '20', '30'])
  })

  it('확인하지 않은 칸이 있으면 전체에서 가장 높거나 낮다고 단정하지 않는다', () => {
    for (const rows of [['10, 확인 중', '30, 40'], ['10, ', '30, 40']]) {
      const html = render(rows)
      expect(html).not.toContain('가장 높은 곳')
      expect(html).not.toContain('가장 낮은 곳')
      expect(html).not.toContain('is-max')
      expect(html).not.toContain('is-min')
    }
    expect(render(['10, 20', '30, 40'])).toContain('가장 높은 곳')
  })
})

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { autoPlace, makeBlock } from '../deck/blocks'
import { emptyItem, makeSlide } from '../deck/generate'
import { createSampleDeck } from '../deck/sample'
import { SlideCanvas } from './SlideCanvas'

function render(value: string, opts = '첫째, 둘째, 셋째', pick = ''): string {
  const block = makeBlock('rating')
  const items = [{ ...emptyItem(), id: 'row', title: '가상의 평가 기준', body: value }]
  const blocks = autoPlace([], { ...block, fields: { opts, pick }, items })!
  return renderToStaticMarkup(createElement(SlideCanvas, { deck: createSampleDeck(), slide: { ...makeSlide('compose'), blocks }, mode: 'final' }))
}

function cells(value: string, opts = '첫째, 둘째, 셋째'): string[] {
  const html = render(value, opts)
  const row = html.match(/<li class="it bk-ev-row[^\"]*">([\s\S]*?)<\/li>/)?.[1] ?? ''
  return row.split(/<span class="bk-ev-cell[^\"]*">/).slice(1)
}

describe('평가표의 안과 평가', () => {
  it('중간이 비어도 마지막 평가를 마지막 안에 표시한다', () => {
    const parts = cells('좋음, , 나쁨')
    expect(parts).toHaveLength(3)
    expect(parts[0]).toContain('<svg')
    expect(parts[0]).toContain('role="img" aria-label="좋음"')
    expect(parts[1]).not.toContain('<svg')
    expect(parts[2]).toContain('<svg')
    expect(parts[2]).toContain('role="img" aria-label="나쁨"')
  })

  it.each([
    ['', '보통', '나쁨'],
    ['좋음', '', '나쁨'],
    ['좋음', '보통', ''],
  ])('세 안 중 어느 평가가 비어도 다른 평가의 열을 유지한다', (...values) => {
    const parts = cells(values.join(', '))
    expect(parts).toHaveLength(3)
    values.forEach((value, i) => {
      if (value) expect(parts[i]).toContain(`aria-label="${value}"`)
      else expect(parts[i]).not.toContain('<svg')
    })
  })

  it('확인 중이라는 작성 글을 한 안에 남기고 다음 평가를 밀지 않는다', () => {
    const parts = cells('좋음, 확인 중, 나쁨')
    expect(parts).toHaveLength(3)
    expect(parts[1]).toContain('확인 중')
    expect(parts[2]).toContain('<svg')
  })

  it('대안 이름이 비어도 그 열을 유지한다', () => {
    const parts = cells('좋음, 보통, 나쁨', '첫째, , 셋째')
    expect(parts).toHaveLength(3)
    expect(parts[1]).toContain('aria-label="보통"')
    expect(parts[2]).toContain('aria-label="나쁨"')
  })

  it('이름이 겹쳐도 추천한 대안의 제목만 강조한다', () => {
    const html = render('좋음, 보통, 나쁨', '현행, 현행 개선, 신규', '현행 개선')
    const headings = [...html.matchAll(/<span class="bk-ev-c( is-pick)?">([\s\S]*?)<\/span>\s*<\/span>/g)]
    expect(headings).toHaveLength(3)
    expect(headings.map((m) => !!m[1])).toEqual([false, true, false])
    expect(headings[1][2]).toContain('현행 개선')
  })
})

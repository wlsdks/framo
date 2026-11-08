import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { autoPlace, makeBlock } from '../deck/blocks'
import { makeSlide } from '../deck/generate'
import { createSampleDeck } from '../deck/sample'
import { rankMove, rankOf, rankSlots } from './blocks/Rank'
import { SlideCanvas } from './SlideCanvas'

function render(rows: [string, string][], mode: 'final' | 'edit' = 'final', highlight?: number): string {
  const block = makeBlock('rank')
  const items = rows.map(([title, meta], i) => ({ ...block.items[0], id: `item-${i}`, title, meta }))
  const blocks = autoPlace([], { ...block, items, highlight })!
  const slide = { ...makeSlide('compose'), blocks }
  return renderToStaticMarkup(createElement(SlideCanvas, { deck: createSampleDeck(), slide, mode }))
}

describe('순위 바뀌기', () => {
  it('지난 순위는 글에서 1 이상의 정수를 읽고, 못 읽으면 처음 든 항목으로 본다', () => {
    expect(rankOf('3')).toBe(3)
    expect(rankOf(' 3위 ')).toBe(3)
    expect(rankOf('')).toBeNull()
    expect(rankOf('새로')).toBeNull()
    expect(rankOf('0')).toBeNull()
  })

  it('바뀐 만큼은 오르면 ▲, 내리면 ▼, 같으면 –, 처음이면 새로', () => {
    expect(rankMove(4, 1)).toEqual({ text: '▲3', dir: 'up' })
    expect(rankMove(1, 2)).toEqual({ text: '▼1', dir: 'down' })
    expect(rankMove(2, 2)).toEqual({ text: '–', dir: 'same' })
    expect(rankMove(null, 5)).toEqual({ text: '새로', dir: 'new' })
  })

  it('지난 목록은 적은 순위의 차례로 위에서부터 채운다(빠진 순위가 있어도 줄을 비우지 않고, 같으면 지금 순서대로)', () => {
    // 지금 1위는 지난 4위, 2위는 지난 1위, 3위는 처음, 4위는 지난 7위
    expect(rankSlots([4, 1, null, 7])).toEqual([1, 0, null, 2])
    expect(rankSlots([2, 2, 1])).toEqual([1, 2, 0])
  })

  it('항목마다 지난 자리에서 지금 자리로 선을 하나 긋고, 처음 든 항목은 선 없이 새로', () => {
    const html = render([
      ['회의록 양식', '4'],
      ['휴가 신청', '1'],
      ['출장비 기준', '2'],
      ['보안 수칙', '3'],
      ['새 결재 안내', ''],
    ])
    expect(html.match(/class="bk-ra-ln/g)).toHaveLength(4)
    // 지난 4위(지난 목록의 넷째 줄, 가운데 35)에서 지금 1위(첫 줄, 가운데 5)로
    expect(html).toContain('d="M 0 35 C 50 35, 50 5, 100 5"')
    expect(html).toContain('▲3')
    expect(html).toContain('새로')
    // 지난 목록은 지난 순위의 차례: 휴가 신청이 맨 위
    const was = html.slice(html.indexOf('bk-ra-was'), html.indexOf('bk-ra-links'))
    expect(was.indexOf('휴가 신청')).toBeLessThan(was.indexOf('회의록 양식'))
  })

  it('강조할 항목은 기본이 지금 1위, -1이면 없다', () => {
    const rows: [string, string][] = [
      ['회의록 양식', '4'],
      ['휴가 신청', '1'],
    ]
    expect(render(rows).match(/bk-ra-ln is-hl/g)).toHaveLength(1)
    expect(render(rows, 'final', 1)).toMatch(/bk-ra-it is-hl[^>]*>.*휴가 신청/)
    expect(render(rows, 'final', -1)).not.toContain('is-hl')
  })

  it('편집할 때는 바뀐 만큼 자리에 지난 순위 칸을 둔다', () => {
    const html = render([
      ['회의록 양식', '4'],
      ['휴가 신청', '1'],
    ], 'edit')
    expect(html).toContain('bk-ra-mk')
    expect(html).not.toContain('▲3')
  })
})

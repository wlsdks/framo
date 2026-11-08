import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { makeBlock } from '../deck/blocks'
import { pageInfo } from '../deck/fields'
import { emptyItem, makeSlide } from '../deck/generate'
import { createSampleDeck } from '../deck/sample'
import type { Slide } from '../deck/types'
import { pageProps, SlideCanvas } from './SlideCanvas'
import { sharedScales } from './sharedScale'

const names = ['주간 회의', '점검 회의', '협의', '그 밖']
const bars = (id: string, values: string[], morph = false): Slide => ({
  ...makeSlide('bars'),
  id,
  items: values.map((value, i) => ({ ...emptyItem(), id: `${id}-${i}`, title: names[i], value })),
  options: morph ? { transition: 'morph' } : {},
})
const deck = createSampleDeck()

describe('이어 움직이는 이웃 장의 막대 잣대', () => {
  it('이어 움직이기로 이어지는 같은 막대 차트는 두 장이 한 잣대(가장 큰 값)로 그린다', () => {
    const a = bars('a', ['3.5', '2.5', '2', '1'])
    const b = bars('b', ['5.0', '3.0', '2', '1'], true)
    const info = pageInfo([a, b], deck)
    expect(sharedScales(info).get('a')?.get('')).toBe(5)
    expect(sharedScales(info).get('b')?.get('')).toBe(5)
    // 앞 장의 가장 큰 막대는 70%, 그대로인 값(2)은 두 장에서 같은 길이
    const html = (s: Slide) => renderToStaticMarkup(createElement(SlideCanvas, { deck, slide: s, mode: 'final', ...pageProps(info, s.id) }))
    expect(html(a)).toContain('--p:70.00')
    expect(html(a)).toContain('--p:40.00')
    expect(html(b)).toContain('--p:40.00')
    expect(html(b)).toContain('--p:100.00')
  })

  it('이어 움직이기가 아니거나, 항목 이름이나 단위가 다르면 제 값으로 그린다', () => {
    const a = bars('a', ['3.5', '2.5', '2', '1'])
    expect(sharedScales(pageInfo([a, bars('b', ['5', '3', '2', '1'])], deck)).size).toBe(0)
    const other = { ...bars('b', ['5', '3', '2', '1'], true), items: bars('b', ['5', '3', '2', '1']).items.map((it, i) => ({ ...it, title: `다른 ${i}` })) }
    expect(sharedScales(pageInfo([a, other], deck)).size).toBe(0)
    const unit = { ...bars('b', ['5', '3', '2', '1'], true), fields: { unit: '건' } }
    expect(sharedScales(pageInfo([a, unit], deck)).size).toBe(0)
  })

  it('셋 넘게 이어지면 모두 한 잣대, 숨긴 장은 건너뛴다', () => {
    const a = bars('a', ['2', '1', '1', '1'])
    const hidden = { ...bars('h', ['9', '9', '9', '9']), hidden: true }
    const b = bars('b', ['4', '1', '1', '1'], true)
    const c = bars('c', ['3', '1', '1', '1'], true)
    const s = sharedScales(pageInfo([a, hidden, b, c], deck))
    expect([s.get('a')?.get(''), s.get('b')?.get(''), s.get('c')?.get('')]).toEqual([4, 4, 4])
    expect(s.get('h')).toBeUndefined()
  })

  it('부품 장의 막대 비교 부품도 부품끼리 짝을 지어 한 잣대로 그린다', () => {
    const block = (id: string, values: string[]) => ({
      ...makeBlock('bars'),
      id,
      items: values.map((value, i) => ({ ...emptyItem(), id: `${id}-${i}`, title: names[i], value })),
    })
    const a: Slide = { ...makeSlide('compose'), id: 'a', blocks: [block('x', ['3.5', '2.5', '2', '1'])] }
    const b: Slide = { ...makeSlide('compose'), id: 'b', blocks: [block('y', ['5.0', '3.0', '2', '1'])], options: { transition: 'morph' } }
    const s = sharedScales(pageInfo([a, b], deck))
    expect(s.get('a')?.get('x')).toBe(5)
    expect(s.get('b')?.get('y')).toBe(5)
  })

  it('발표 전체의 장 넘기기가 이어 움직이기면 장마다 고르지 않아도 짝이 된다', () => {
    const a = bars('a', ['3.5', '2.5', '2', '1'])
    const b = bars('b', ['5.0', '3.0', '2', '1'])
    const look = { ...deck, theme: { ...deck.theme, transition: 'morph' as const } }
    expect(sharedScales(pageInfo([a, b], look)).get('a')?.get('')).toBe(5)
  })
})

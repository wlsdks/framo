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
    expect(sharedScales(info).get('a')?.get('')?.hi).toBe(5)
    expect(sharedScales(info).get('b')?.get('')?.hi).toBe(5)
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
    const a = bars('a', ['2.5', '1', '1', '1'])
    const hidden = { ...bars('h', ['9', '9', '9', '9']), hidden: true }
    const b = bars('b', ['4', '1', '1', '1'], true)
    const c = bars('c', ['3', '1', '1', '1'], true)
    const s = sharedScales(pageInfo([a, hidden, b, c], deck))
    expect([s.get('a')?.get('')?.hi, s.get('b')?.get('')?.hi, s.get('c')?.get('')?.hi]).toEqual([4, 4, 4])
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
    expect(s.get('a')?.get('x')?.hi).toBe(5)
    expect(s.get('b')?.get('y')?.hi).toBe(5)
  })

  it('발표 전체의 장 넘기기가 이어 움직이기면 장마다 고르지 않아도 짝이 된다', () => {
    const a = bars('a', ['3.5', '2.5', '2', '1'])
    const b = bars('b', ['5.0', '3.0', '2', '1'])
    const look = { ...deck, theme: { ...deck.theme, transition: 'morph' as const } }
    expect(sharedScales(pageInfo([a, b], look)).get('a')?.get('')?.hi).toBe(5)
  })

  it('값이 크게 뛰어 한 잣대로는 어느 장이 잣대의 40%도 채우지 못하면 묶지 않는다(장마다 제 잣대)', () => {
    const a = bars('a', ['1', '0.8', '0.5', '0.2'])
    const b = bars('b', ['10', '8', '5', '2'], true)
    expect(sharedScales(pageInfo([a, b], deck)).size).toBe(0)
    // 문턱 바로 위(40%)는 묶는다
    const c = bars('c', ['4', '0.8', '0.5', '0.2'])
    expect(sharedScales(pageInfo([c, b], deck)).get('c')?.get('')?.hi).toBe(10)
  })

  it('셋 넘게 이어질 때 가운데 장은 앞 장과 먼저 묶이고, 다음 장을 더해 문턱 밑이 되는 장부터 새 묶음이다', () => {
    const a = bars('a', ['3', '1', '1', '1'])
    const b = bars('b', ['6', '1', '1', '1'], true)
    const c = bars('c', ['12', '1', '1', '1'], true)
    const d = bars('d', ['10', '1', '1', '1'], true)
    const s = sharedScales(pageInfo([a, b, c, d], deck))
    // a(3)와 b(6)는 6의 잣대에서 50%라 묶이고, c(12)를 더하면 a가 25%라 c부터 새 묶음(c와 d는 12의 잣대)
    expect([s.get('a')?.get('')?.hi, s.get('b')?.get('')?.hi, s.get('c')?.get('')?.hi, s.get('d')?.get('')?.hi]).toEqual([6, 6, 12, 12])
  })

  it('추이도 이어 움직이는 장끼리 두 장의 값(목표까지)을 다 담는 한 잣대로 그린다', () => {
    const trend = (id: string, values: string[], target: string, morph = false): Slide => ({
      ...makeSlide('trend'),
      id,
      fields: { target },
      items: values.map((value, i) => ({ ...emptyItem(), id: `${id}-${i}`, title: `${i + 1}월`, value })),
      options: morph ? { transition: 'morph' } : {},
    })
    const a = trend('a', ['96', '101', '99', '131'], '115')
    const b = trend('b', ['134', '111', '139', '144'], '115', true)
    const info = pageInfo([a, b], deck)
    expect(sharedScales(info).get('a')?.get('')).toEqual({ lo: 96, hi: 144, with: 'next' })
    expect(sharedScales(info).get('b')?.get('')).toEqual({ lo: 96, hi: 144, with: 'prev' })
    // 두 장의 목표선(115)이 같은 높이에 그려진다
    const html = (s: Slide) => renderToStaticMarkup(createElement(SlideCanvas, { deck, slide: s, mode: 'final', ...pageProps(info, s.id) }))
    const ty = (s: Slide) => /--ty:([\d.]+)/.exec(html(s))?.[1]
    expect(ty(a)).toBeDefined()
    expect(ty(a)).toBe(ty(b))
  })

  it('추이의 문턱도 막대처럼 잣대의 바닥부터 가장 높은 값까지로 잰다(오르내림 폭이 아니라)', () => {
    const trend = (id: string, values: string[], morph = false, target = '115'): Slide => ({
      ...makeSlide('trend'),
      id,
      fields: { target },
      items: values.map((value, i) => ({ ...emptyItem(), id: `${id}-${i}`, title: `${i + 1}월`, value })),
      options: morph ? { transition: 'morph' } : {},
    })
    // 96~131에서 86~183으로: 폭으로 재면 36%라 묶이지 않았지만, 두 장을 담는 축(0부터)에서 131은 70% 높이라 묶는다
    const a = trend('a', ['96', '101', '99', '108', '117', '131'])
    const b = trend('b', ['125', '86', '119', '119', '88', '183'], true)
    expect(sharedScales(pageInfo([a, b], deck)).get('a')?.get('')?.hi).toBe(183)
    // 1에서 10처럼 크게 뛰면 묶지 않는다(목표 없이)
    const c = trend('c', ['1', '1.2', '1.1', '1.3', '1', '1.2'], false, '')
    const d = trend('d', ['10', '12', '11', '13', '10', '12'], true, '')
    expect(sharedScales(pageInfo([c, d], { ...deck })).size).toBe(0)
  })

  it('편집 화면의 안내를 위해 어느 이웃과 같은 잣대인지 적는다(앞, 뒤, 앞뒤)', () => {
    const a = bars('a', ['3', '1', '1', '1'])
    const b = bars('b', ['4', '1', '1', '1'], true)
    const c = bars('c', ['5', '1', '1', '1'], true)
    const s = sharedScales(pageInfo([a, b, c], deck))
    expect([s.get('a')?.get('')?.with, s.get('b')?.get('')?.with, s.get('c')?.get('')?.with]).toEqual(['next', 'both', 'prev'])
  })
})

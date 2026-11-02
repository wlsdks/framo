import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { autoPlace, makeBlock } from '../deck/blocks'
import { makeSlide } from '../deck/generate'
import { createSampleDeck } from '../deck/sample'
import { cssSource } from './cssSource'
import { SlideCanvas } from './SlideCanvas'

function render(causes: string[], opts: { variant?: string; mode?: 'final' | 'edit'; problem?: string } = {}): string {
  const block = makeBlock('whys')
  const items = causes.map((title, i) => ({ ...block.items[i % block.items.length], id: `item-${i}`, title, meta: '' }))
  const blocks = autoPlace([], { ...block, fields: { ...block.fields, problem: opts.problem ?? '월간 보고가 매달 이틀 늦어요' }, items, variant: opts.variant })!
  const slide = { ...makeSlide('compose'), blocks }
  return renderToStaticMarkup(createElement(SlideCanvas, { deck: createSampleDeck(), slide, mode: opts.mode ?? 'final' }))
}

const count = (html: string, text: string) => html.split(text).length - 1

describe('원인 캐기', () => {
  it('문제에서 시작해 원인을 차례로 잇고, 마지막 원인을 근본 원인으로 짚는다', () => {
    const html = render(['부서 숫자가 마감 뒤에 모여요', '부서마다 양식이 달라요', '양식을 맡은 곳이 없어요'])
    expect(html).toContain('월간 보고가 매달 이틀 늦어요')
    expect(html.indexOf('부서 숫자가')).toBeLessThan(html.indexOf('부서마다 양식이'))
    expect(html.indexOf('부서마다 양식이')).toBeLessThan(html.indexOf('양식을 맡은 곳이'))
    expect(count(html, '왜?')).toBe(2)
    expect(count(html, '근본 원인')).toBe(1)
    // 근본 원인 표시는 마지막 원인 줄에만
    expect(html.indexOf('is-root')).toBeGreaterThan(html.indexOf('부서마다 양식이'))
    expect(html.indexOf('is-root')).toBeLessThan(html.indexOf('양식을 맡은 곳이'))
  })

  it('발표할 때 빈 원인은 건너뛰고, 채운 것 가운데 마지막이 근본 원인이다 (계단도 빈 단 없이 이어진다)', () => {
    const html = render(['부서 숫자가 마감 뒤에 모여요', '', '양식을 맡은 곳이 없어요', ''])
    expect(count(html, '왜?')).toBe(1)
    expect(count(html, '근본 원인')).toBe(1)
    expect(html.indexOf('is-root')).toBeLessThan(html.indexOf('양식을 맡은 곳이'))
    expect(html.indexOf('is-root')).toBeGreaterThan(html.indexOf('부서 숫자가'))
    // 단의 깊이: 첫 원인 1, 다음 채운 원인 2 (빈 원인이 깊이를 차지하지 않는다)
    expect(html).toMatch(/--wy-d:\s*1[^0-9][\s\S]*부서 숫자가[\s\S]*--wy-d:\s*2[^0-9][\s\S]*양식을 맡은 곳이/)
    expect(html).not.toMatch(/--wy-d:\s*3[^0-9]/)
  })

  it('편집할 때는 빈 원인도 안내와 함께 보이고, 맨 끝 줄이 근본 원인 자리다', () => {
    const html = render(['부서 숫자가 마감 뒤에 모여요', '', ''], { mode: 'edit' })
    expect(count(html, '왜?')).toBe(2)
    expect(count(html, '근본 원인')).toBe(1)
  })

  it('원인을 하나도 채우지 않고 발표하면 문제만 보이고 근본 원인이라고 부르지 않는다', () => {
    const html = render(['', '', ''])
    expect(html).toContain('월간 보고가 매달 이틀 늦어요')
    expect(html).not.toContain('근본 원인')
    expect(html).not.toContain('왜?')
  })

  it('단 사이는 장이 덜 찰 때 넓히는 줄 사이(--bk-air)를 받지 않는다', () => {
    // 단 사이(--wy-gap)는 앞 단에서 갈고리가 꺾여 들어올 자리라 이미 글 높이의 1.3배쯤이다. 장이 덜 차서 맞추기(fitBlocks)가 줄 사이를
    // 12px 넓히면 그대로 더해져, 그려진 글 사이가 글 높이의 두 배를 넘었다(docs/VISUAL-RULES.md 6. 강조 상자 4칸 옆 원인 캐기 8칸에서
    // 글 27px, 사이 59px). 명조 제목처럼 글자가 낮은 글꼴은 반만 더해도 넘어서 받지 않는다
    const css = cssSource(new URL('./styles/blocks/whys.css', import.meta.url)).replace(/\/\*[\s\S]*?\*\//g, '')
    const gaps = [...css.matchAll(/--wy-gap:\s*([^;]+);/g)].map((m) => m[1])
    expect(gaps.length).toBeGreaterThan(0)
    for (const gap of gaps) expect(gap).not.toContain('--bk-air')
  })

  it('가로 모양은 같은 차례로 그리고 모양 표시만 다르다', () => {
    const html = render(['부서 숫자가 마감 뒤에 모여요', '양식을 맡은 곳이 없어요'], { variant: 'across' })
    expect(html).toContain('is-across')
    expect(html.indexOf('부서 숫자가')).toBeLessThan(html.indexOf('양식을 맡은 곳이'))
    expect(count(html, '근본 원인')).toBe(1)
  })
})

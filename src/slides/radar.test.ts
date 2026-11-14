import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { autoPlace, makeBlock } from '../deck/blocks'
import { makeSlide } from '../deck/generate'
import { createSampleDeck } from '../deck/sample'
import { radarAxes, radarBox, radarMax, radarPick, radarPoints, radarRatio } from './radar'
import { SlideCanvas } from './SlideCanvas'

type Row = [title: string, value: string, meta?: string]

function render(rows: Row[], opts: { mode?: 'final' | 'edit'; highlight?: number; variant?: string; max?: string } = {}): string {
  const block = makeBlock('radar')
  const items = rows.map(([title, value, meta = ''], i) => ({ ...block.items[0], id: `item-${i}`, title, value, meta }))
  const blocks = autoPlace([], { ...block, fields: { ...block.fields, max: opts.max ?? '' }, items, highlight: opts.highlight, variant: opts.variant })!
  const slide = { ...makeSlide('compose'), blocks }
  return renderToStaticMarkup(createElement(SlideCanvas, { deck: createSampleDeck(), slide, mode: opts.mode ?? 'final' }))
}

const FIVE: Row[] = [
  ['안내 자료', '4.4'],
  ['실습', '3.8'],
  ['멘토링', '2.6'],
  ['일정', '4.1'],
  ['도구 준비', '3.5'],
]

describe('방사형 비교의 셈', () => {
  it('첫 축은 맨 위에 서고 시계 방향으로 고르게 돈다', () => {
    const four = radarAxes(4)
    expect(four[0]).toEqual({ x: 0, y: -1 })
    expect(four[1]).toEqual({ x: 1, y: 0 })
    expect(four[2]).toEqual({ x: 0, y: 1 })
    expect(four[3]).toEqual({ x: -1, y: 0 })
    for (const a of radarAxes(7)) expect(Math.hypot(a.x, a.y)).toBeCloseTo(1, 5)
  })

  it('그림 상자는 바깥 틀에 딱 맞는다: 셋이면 아래로 반지름의 반, 옆으로 0.87', () => {
    const three = radarBox(radarAxes(3))
    expect(three.ym).toBeCloseTo(0.5, 5)
    expect(three.xm).toBeCloseTo(Math.sqrt(3) / 2, 5)
    expect(radarBox(radarAxes(4))).toEqual({ xm: 1, ym: 1 })
    // 다섯이면 맨 아래 꼭짓점이 없어 아래로 cos 36°
    expect(radarBox(radarAxes(5)).ym).toBeCloseTo(Math.cos(Math.PI / 5), 5)
  })

  it('만점은 적은 값이 먼저, 비우면 가장 큰 값을 담는 흔한 만점(1, 5, 10, 100)', () => {
    expect(radarMax([4.4, 2.6], null)).toBe(5)
    expect(radarMax([0.4, 0.9], null)).toBe(1)
    expect(radarMax([7, 9.5], null)).toBe(10)
    expect(radarMax([64, 91], null)).toBe(100)
    expect(radarMax([120, 340], null)).toBe(500)
    expect(radarMax([1200], null)).toBe(2000)
    expect(radarMax([], null)).toBe(1)
    expect(radarMax([4.4, 2.6], 7)).toBe(7)
    // 0이나 음수 만점은 만점이 아니다
    expect(radarMax([4.4], 0)).toBe(5)
  })

  it('만점을 넘는 값은 틀까지만, 음수는 가운데', () => {
    expect(radarRatio(2.5, 5)).toBe(0.5)
    expect(radarRatio(6, 5)).toBe(1)
    expect(radarRatio(-1, 5)).toBe(0)
    expect(radarRatio(3, 0)).toBe(0)
  })

  it('강조할 기준: 고른 것이 먼저, 고르지 않으면 가장 낮은(또는 높은) 기준, 값이 모두 같으면 없다', () => {
    const values = [4.4, 3.8, 2.6, 4.1, 2.6]
    expect(radarPick(values, 'low', undefined)).toBe(2)
    expect(radarPick(values, 'high', undefined)).toBe(0)
    expect(radarPick(values, 'low', 3)).toBe(3)
    expect(radarPick(values, 'low', -1)).toBe(-1)
    expect(radarPick(values, 'low', 9)).toBe(-1)
    expect(radarPick([3, 3, 3], 'low', undefined)).toBe(-1)
    expect(radarPick([3, null, 3], 'high', undefined)).toBe(-1)
  })

  it('다각형의 꼭짓점은 가운데 (xm × 100, 100)에서 축마다 몫만큼', () => {
    const axes = radarAxes(4)
    expect(radarPoints(axes, [1, 0.5, 0, 0.25], 1)).toBe('100,0 150,100 100,100 75,100')
  })
})

describe('방사형 비교의 그림', () => {
  it('기준마다 축과 이름표가 하나씩, 값의 다각형 하나. 가장 낮은 기준의 축과 이름표만 강조한다', () => {
    const html = render(FIVE)
    expect(html.match(/class="bk-rdr-spoke"/g)).toHaveLength(5)
    expect(html.match(/class="it bk-rdr-it /g)).toHaveLength(5)
    expect(html.match(/class="bk-rdr-area"/g)).toHaveLength(1)
    expect(html.match(/bk-rdr-it [a-z-]+ is-hl/g)).toHaveLength(1)
    expect(html).toMatch(/bk-rdr-it is-right is-hl[^>]*>(?:<[^>]+>)*멘토링/)
    expect(html).toContain('가장 낮은 기준')
    // 견줄 값을 적지 않았으면 점선 다각형도 견줄 대상의 이름도 없다
    expect(html).not.toContain('bk-rdr-base')
    expect(html).not.toContain('bk-rdr-lk')
    // 만점은 비워도 값에 맞는 만점이 보인다
    expect(html).toMatch(/만점 <span[^>]*>5<\/span>/)
  })

  it('강한 곳 강조면 가장 높은 기준, 고른 기준이 있으면 그 기준, -1이면 강조하지 않는다', () => {
    expect(render(FIVE, { variant: 'high' })).toMatch(/bk-rdr-it is-top is-hl/)
    expect(render(FIVE, { variant: 'high' })).toContain('가장 높은 기준')
    const chosen = render(FIVE, { highlight: 3 })
    expect(chosen).toMatch(/bk-rdr-it is-left is-hl[^>]*>(?:<[^>]+>)*일정/)
    // 고른 기준은 가장 낮은 기준이 아닐 수 있어서 그 말을 붙이지 않는다
    expect(chosen).not.toContain('가장 낮은 기준')
    const none = render(FIVE, { highlight: -1 })
    expect(none).not.toContain('is-hl')
    expect(none).not.toContain('bk-rdr-ans')
  })

  it('견줄 값을 모든 기준에 적으면 점선 다각형과 견줄 대상의 이름(비우면 목표)이 생긴다', () => {
    const all = render(FIVE.map(([t, v]) => [t, v, '4']))
    expect(all.match(/class="bk-rdr-base"/g)).toHaveLength(1)
    expect(all).toMatch(/bk-rdr-lk"><i aria-hidden="true"><\/i><span[^>]*>목표</)
    // 하나라도 비면 닫힌 다각형이 되지 않아 그리지 않는다
    const some = render(FIVE.map(([t, v], i) => [t, v, i < 3 ? '4' : '']))
    expect(some).not.toContain('bk-rdr-base')
  })

  it('만점을 적으면 그 만점으로 그리고, 단위가 섞이거나 음수면 다각형을 그리지 않는다', () => {
    // 만점 10이면 5는 축의 절반: 넷 가운데 첫 축(위)의 꼭짓점은 (100, 50)
    const html = render(
      [
        ['가', '5'],
        ['나', '10'],
        ['다', '0'],
        ['라', '2.5'],
      ],
      { max: '10' },
    )
    expect(html).toContain('points="100,50 200,100 100,100 75,100"')
    const mixed = render([
      ['가', '4.2'],
      ['나', '80%'],
      ['다', '3건'],
    ])
    expect(mixed).not.toContain('bk-rdr-area')
    expect(mixed).not.toContain('is-hl')
    const negative = render([
      ['가', '4'],
      ['나', '-2'],
      ['다', '3'],
    ])
    expect(negative).not.toContain('bk-rdr-area')
  })

  it('편집할 때 읽을 수 없는 값이 있으면 어떻게 적는지 알리고, 아직 적지 않은 기준은 예시로 옅게 그린다', () => {
    const wrong = render(
      [
        ['가', '4.2'],
        ['나', '미정'],
        ['다', '3'],
      ],
      { mode: 'edit' },
    )
    expect(wrong).toContain('bk-rdr-warn')
    const blank: Row[] = [
      ['', ''],
      ['', ''],
      ['', ''],
    ]
    const demo = render(blank, { mode: 'edit' })
    expect(demo).toContain('is-demo')
    expect(demo).toContain('bk-rdr-area')
    // 이름만 적고 값은 아직인 기준도 예시 값으로 이어 그린다: 이름을 하나 적는 순간 다각형이 사라지지 않게
    const named: Row[] = [
      ['응답 속도', ''],
      ['', ''],
      ['', ''],
    ]
    expect(render(named, { mode: 'edit' })).toContain('bk-rdr-area')
    expect(render(named, { mode: 'edit' })).toContain('is-demo')
    // 발표할 때는 적지 않은 것을 그리지 않는다
    expect(render(blank)).not.toContain('bk-rdr-area')
    expect(render(named)).not.toContain('bk-rdr-area')
  })

  it('기준이 일곱 이상이면 위아래 이름표도 이름 아래 값으로 쌓는다', () => {
    const rows: Row[] = Array.from({ length: 8 }, (_, i) => [`기준 ${i + 1}`, String(i + 1)])
    expect(render(rows)).toContain('is-stacked')
    expect(render(rows.slice(0, 6))).not.toContain('is-stacked')
  })
})

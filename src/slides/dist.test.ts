import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { autoPlace, makeBlock } from '../deck/blocks'
import { makeSlide } from '../deck/generate'
import { createSampleDeck } from '../deck/sample'
import type { Block } from '../deck/types'
import { cutIndex, distFigure, distPct } from './dist'
import { SlideCanvas } from './SlideCanvas'

const DAYS = ['1일', '2일', '3일', '4일', '5일 이상']

describe('분포의 기준 찾기', () => {
  it('구간 이름을 그대로 적으면 그 구간이다(띄어쓰기와 대소문자는 가리지 않는다)', () => {
    expect(cutIndex('3일', DAYS)).toBe(2)
    expect(cutIndex(' 5일  이상 ', DAYS)).toBe(4)
    expect(cutIndex('a등급', ['A등급', 'B등급', 'C등급'])).toBe(0)
  })

  it('글 안에 든 구간 이름을 읽는다(조사와 뒷말이 붙어도)', () => {
    expect(cutIndex('약속한 3일 안', DAYS)).toBe(2)
    expect(cutIndex('3일까지', DAYS)).toBe(2)
    expect(cutIndex('80점대부터', ['60점 미만', '60점대', '70점대', '80점대', '90점대'])).toBe(3)
  })

  it('이름의 앞머리만 적어도 그 구간 하나면 읽는다', () => {
    expect(cutIndex('5일', DAYS)).toBe(4)
    expect(cutIndex('3', DAYS)).toBe(2)
  })

  it('숫자가 이어 붙은 자리는 다른 구간이다', () => {
    const many = ['1일', '5일', '10일', '11일', '15일']
    expect(cutIndex('1일', many)).toBe(0)
    expect(cutIndex('11일 안', many)).toBe(3)
    expect(cutIndex('1', many)).toBe(0)
    expect(cutIndex('30', ['20대', '30대', '130대'])).toBe(1)
  })

  it('글 안에 구간 이름이 여럿이면 가장 긴 이름이다', () => {
    expect(cutIndex('3일 초과분', ['3일', '3일 초과', '7일 초과'])).toBe(1)
  })

  it('가리키는 구간이 없거나 둘 이상에 똑같이 걸치면 짐작하지 않는다', () => {
    expect(cutIndex('', DAYS)).toBe(-1)
    expect(cutIndex('일주일', DAYS)).toBe(-1)
    expect(cutIndex('일', DAYS)).toBe(-1)
    expect(cutIndex('1일과 2일', DAYS)).toBe(-1)
    expect(cutIndex('3일', ['3일', '3일', '4일'])).toBe(-1)
    // 이름을 비운 구간은 어느 글과도 맞지 않는다
    expect(cutIndex('3일', ['', '', ''])).toBe(-1)
  })
})

describe('분포의 셈', () => {
  it('기준까지: 처음부터 기준 구간까지가 안이고, 몫은 그 합 ÷ 전체다', () => {
    const f = distFigure([58, 46, 27, 12, 17], 2)!
    expect(f.inside).toEqual([true, true, true, false, false])
    expect(f.sum).toBe(131)
    expect(f.total).toBe(160)
    expect(f.pct).toBeCloseTo(81.875, 9)
    // 기준선은 기준 구간 바로 뒤(넷째 구간의 앞)
    expect(f.edge).toBe(3)
  })

  it('기준부터: 기준 구간부터 끝까지가 안이다', () => {
    const f = distFigure([4, 11, 30, 38, 17], 3, true)!
    expect(f.inside).toEqual([false, false, false, true, true])
    expect(f.sum).toBe(55)
    expect(f.pct).toBeCloseTo(55, 9)
    expect(f.edge).toBe(3)
  })

  it('막대는 가장 큰 구간이 100이고 값에 비례한다', () => {
    const f = distFigure([10, 40, 20], 0)!
    expect(f.bars).toEqual([25, 100, 50])
  })

  it('안과 밖의 몫을 더하면 100이다', () => {
    const values = [3, 0, 14, 7, 21, 2, 9, 1]
    for (let cut = 0; cut < values.length - 1; cut++) {
      const upto = distFigure(values, cut)!
      const from = distFigure(values, cut + 1, true)!
      expect(upto.pct! + from.pct!).toBeCloseTo(100, 9)
      expect(upto.edge).toBe(from.edge)
    }
  })

  it('모든 구간이 기준 안이면 가를 것이 없어 기준선이 없다', () => {
    const last = distFigure([5, 3, 2], 2)!
    expect(last.pct).toBe(100)
    expect(last.edge).toBeNull()
    const first = distFigure([5, 3, 2], 0, true)!
    expect(first.pct).toBe(100)
    expect(first.edge).toBeNull()
    // 첫 구간까지, 마지막 구간부터는 선이 선다
    expect(distFigure([5, 3, 2], 0)!.edge).toBe(1)
    expect(distFigure([5, 3, 2], 2, true)!.edge).toBe(2)
  })

  it('기준이 없으면 막대만 있고 몫과 기준선은 없다', () => {
    for (const cut of [-1, 5, 1.5, Number.NaN]) {
      const f = distFigure([5, 3, 2], cut)!
      expect(f.inside).toEqual([false, false, false])
      expect(f.pct).toBeNull()
      expect(f.edge).toBeNull()
      expect(f.bars).toEqual([100, 60, 40])
    }
  })

  it('0인 구간은 막대가 0이고 몫에 더해지지 않는다', () => {
    const f = distFigure([58, 0, 27, 0, 15], 1)!
    expect(f.bars[1]).toBe(0)
    expect(f.sum).toBe(58)
    expect(f.pct).toBeCloseTo(58, 9)
  })

  it('읽지 못한 값, 음수가 있거나 모두 0이면 셈하지 않는다', () => {
    expect(distFigure([5, null, 2], 0)).toBeNull()
    expect(distFigure([5, -1, 2], 0)).toBeNull()
    expect(distFigure([5, Number.NaN, 2], 0)).toBeNull()
    expect(distFigure([5, Infinity, 2], 0)).toBeNull()
    expect(distFigure([0, 0, 0], 0)).toBeNull()
    expect(distFigure([], 0)).toBeNull()
  })

  it('밖에 남은 것이 있으면 반올림으로 100%가 되지 않는다', () => {
    expect(distPct(distFigure([997, 2, 1], 1)!)).toBe(99)
    expect(distPct(distFigure([997, 2, 1], 2)!)).toBe(100)
    expect(distPct(distFigure([58, 46, 27, 12, 17], 2)!)).toBeCloseTo(81.875, 9)
    expect(distPct(distFigure([5, 3, 2], -1)!)).toBeNull()
  })
})

type Row = [title: string, value: string]
const SAMPLE: Row[] = [
  ['1일', '58건'],
  ['2일', '46건'],
  ['3일', '27건'],
  ['4일', '12건'],
  ['5일 이상', '17건'],
]

function render(rows: Row[], fields: Record<string, string> = { cut: '3일' }, mode: 'final' | 'edit' = 'final', more: Partial<Block> = {}) {
  const block = makeBlock('dist')
  const made: Block = { ...block, ...more, fields, items: rows.map(([title, value], i) => ({ ...block.items[0], id: `d${i}`, title, value })) }
  const slide = { ...makeSlide('compose'), blocks: autoPlace([], made)! }
  return renderToStaticMarkup(createElement(SlideCanvas, { deck: createSampleDeck(), slide, mode }))
}

const cols = (html: string) => [...html.matchAll(/class="it bk-ds-col([^"]*)"/g)].map((m) => m[1].trim())
const answer = (html: string) => html.match(/<p class="bk-ds-v">(.*?)<\/p>/)?.[1].replace(/<[^>]+>/g, '')

describe('분포의 그림', () => {
  it('기준 안의 막대만 켜고, 몫을 값에서 셈해 말하고, 기준 구간 뒤에 기준선을 하나 긋는다', () => {
    const html = render(SAMPLE)
    expect(cols(html)).toEqual(['is-in', 'is-in', 'is-in is-cut', '', ''])
    expect(answer(html)).toBe('82%')
    expect(html).toContain('160건 가운데 <b>131건</b>')
    expect(html.match(/class="bk-ds-line"/g)).toHaveLength(1)
    expect(html.match(/class="bk-ds-fill"/g)).toHaveLength(5)
    expect(html).not.toContain('is-demo')
    // 기준 이름을 비우면 기준 구간의 이름으로
    expect(html).toContain('3일까지')
    // 단위를 한 값에만 적어도 같은 몫이다
    expect(answer(render(SAMPLE.map(([t, v], i): Row => [t, i ? v.replace('건', '') : v])))).toBe('82%')
  })

  it('기준부터 모양은 기준 구간부터 끝까지를 센다', () => {
    const html = render(SAMPLE, { cut: '4일' }, 'final', { variant: 'from' })
    expect(cols(html)).toEqual(['', '', '', 'is-in is-cut', 'is-in'])
    expect(answer(html)).toBe('18%')
    expect(html).toContain('4일부터')
  })

  it('기준 이름을 적으면 그 이름을 쓰고, 이름 안의 구간으로도 기준을 찾는다', () => {
    const html = render(SAMPLE, { cut: '약속한 3일 안', label: '약속을 지킨 요청' })
    expect(html).toContain('약속을 지킨 요청')
    expect(html).not.toContain('3일까지')
    expect(answer(html)).toBe('82%')
  })

  it('모든 구간이 기준 안이면 100%이고 기준선은 없다', () => {
    const html = render(SAMPLE, { cut: '5일 이상' })
    expect(answer(html)).toBe('100%')
    expect(html).not.toContain('bk-ds-line')
  })

  it('값이 %면 셈의 바탕을 되풀이하지 않는다', () => {
    const html = render([['20대', '18%'], ['30대', '42%'], ['40대', '40%']], { cut: '30대' })
    expect(answer(html)).toBe('60%')
    expect(html).not.toContain('가운데')
  })

  it('기준이 없으면 발표할 때 막대만 서고 답 자리는 없다', () => {
    for (const fields of [{}, { cut: '일주일' }] as Record<string, string>[]) {
      const html = render(SAMPLE, fields)
      expect(cols(html)).toEqual(['', '', '', '', ''])
      expect(html.match(/class="bk-ds-fill"/g)).toHaveLength(5)
      expect(html).not.toContain('bk-ds-v')
      expect(html).not.toContain('bk-ds-ans')
      expect(html).toContain('is-bare')
      // 편집할 때만의 알림과 기준 칸은 없다
      expect(html).not.toContain('bk-ds-warn')
      expect(html).not.toContain('bk-ds-cut')
    }
  })

  it('읽을 수 없거나 단위가 섞였으면 발표할 때는 막대 없이 적은 글만 세우고 몫을 말하지 않는다', () => {
    for (const bad of ['미정', '40%', '-3건']) {
      const html = render(SAMPLE.map(([t, v], i): Row => [t, i === 1 ? bad : v]))
      expect(html).not.toContain('bk-ds-fill')
      expect(html).not.toContain('bk-ds-v')
      expect(html).toContain('is-unknown')
      expect(html).not.toContain('bk-ds-warn')
      expect(html).not.toContain('is-unfit')
      expect(html).toContain(bad.replace('-', '−'))
    }
  })

  it('편집할 때 틀린 값을 적어도 그림 자리는 지키고(옅게), 어느 칸을 어떻게 고칠지 알린다', () => {
    const unfit = (html: string) => [...html.matchAll(/class="[^"]*\bbk-ds-num\b[^"]*"/g)].map((m) => m[0].includes('is-unfit'))
    const word = render(SAMPLE.map(([t, v], i): Row => [t, i === 1 ? '미정' : v]), { cut: '3일' }, 'edit')
    // 읽힌 값의 막대는 그대로, 틀린 구간만 빈다
    expect(word.match(/class="bk-ds-fill"/g)).toHaveLength(5)
    expect(word).toContain('--p:0.00')
    expect(word).toContain('--p:100.00')
    expect(word).toContain('is-demo')
    expect(word).not.toContain('is-unknown')
    expect(word).toContain('밑줄 친 값을 다른 값과 같은 단위의 0 이상 숫자로 적어 주세요.')
    expect(unfit(word)).toEqual([false, true, false, false, false])
    // 틀린 값이 섞인 채로 셈한 몫은 말하지 않는다
    expect(word).not.toContain('bk-ds-v')
    expect(word).not.toContain('가운데')
    expect(unfit(render(SAMPLE.map(([t, v], i): Row => [t, i === 3 ? '40%' : v]), { cut: '3일' }, 'edit'))).toEqual([false, false, false, true, false])
    // 모두 0이면 틀린 칸이 따로 없다: 무엇이 모자란지 말한다
    const zero = render(SAMPLE.map(([t]): Row => [t, '0건']), { cut: '3일' }, 'edit')
    expect(zero).toContain('구간 가운데 하나는 0보다 크게 적어 주세요.')
    expect(unfit(zero)).toEqual([false, false, false, false, false])
    // 알림은 장의 글과 다른 말투(편집 화면의 경고 색)다
    expect(word).toMatch(/class="bk-ds-warn ed-warn"/)
  })

  it('편집할 때 기준이 어느 구간도 가리키지 않으면 기준 칸에 밑줄을 긋고 구간 이름을 예로 든다', () => {
    const html = render(SAMPLE, { cut: '일주일' }, 'edit')
    expect(html).toContain('기준에는 구간 이름 하나를 그대로 적어 주세요. (예: 3일)')
    expect(html).toMatch(/class="[^"]*bk-ds-cv[^"]*is-unfit/)
    expect(html).not.toContain('bk-ds-v')
    // 기준을 아직 적지 않았으면 알리지 않는다
    const blank = render(SAMPLE, {}, 'edit')
    expect(blank).not.toContain('bk-ds-warn')
    expect(blank).toContain('bk-ds-cut')
    // 구간 이름을 다 적기 전에도 재촉하지 않는다
    expect(render(SAMPLE.map(([t, v], i): Row => [i === 4 ? '' : t, v]), { cut: '일주일' }, 'edit')).not.toContain('bk-ds-warn')
  })

  it('편집할 때 아직 적지 않은 값은 안내의 예시 값으로 옅게 그리고, 발표할 때는 그리지 않는다', () => {
    const blank: Row[] = SAMPLE.map((): Row => ['', ''])
    const demo = render(blank, {}, 'edit')
    expect(demo).toContain('is-demo')
    expect(demo.match(/class="bk-ds-fill"/g)).toHaveLength(5)
    // 안내의 구간 이름과 기준으로 어떤 그림인지 보인다. 예시 값으로 셈한 수는 덧붙이지 않고, 쓰는 중에는 알리지 않는다
    expect(cols(demo)).toEqual(['is-in', 'is-in', 'is-in is-cut', '', ''])
    expect(demo).not.toContain('가운데')
    expect(demo).not.toContain('bk-ds-warn')
    // 하나만 적어도 나머지는 예시 값으로 이어 그린다. 단위가 달라 섞어 셈할 수 없으면 예시 그림 그대로
    for (const first of ['90건', '90명']) {
      const some = render(blank.map((r, i): Row => (i ? r : ['1일', first])), {}, 'edit')
      expect(some).toContain('is-demo')
      expect(some.match(/class="bk-ds-fill"/g)).toHaveLength(5)
      expect(some).not.toContain('bk-ds-warn')
    }
    expect(render(blank)).not.toContain('bk-ds-fill')
  })
})

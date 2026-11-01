// 컴포넌트를 빼면 옆 컴포넌트가 그 자리를 넓혀 덮는다. 그런데 넓어지면 글자가 커져 더 높아지는 컴포넌트가 있어서(숫자 카드, 막대 차트),
// 한 줄에서 하나를 빼고 남은 것이 판 너비를 다 받으면 판보다 높아졌다(편집기가 '이미 넘쳤어요'로 컴포넌트를 모두 잠그고,
// 그리는 쪽은 장의 글자를 줄여 맞췄다). 다시 놓으면 제 크기로 들어가는데도 그랬다
import { describe, expect, it } from 'vitest'
import { sampleBlock } from '../blockSamples'
import type { Block, BlockAt, BlockType } from '../types'
import { tiles } from './board'
import { dropBlock } from './links'
import { removeBlock } from './place'
import { boardFit, overAlready } from './sizing'

const put = (type: BlockType, id: string, at: BlockAt): Block => ({ ...sampleBlock(type), id, at })

// 위에 인용과 숫자 카드, 아래에 목록과 막대 차트. 인용을 빼면 숫자 카드가 판 너비를 다 받아 한 줄 더 높아진다
const quoteRow = () => [put('quote', 'q', { x: 0, y: 0, w: 4, h: 5 }), put('kpi', 'k', { x: 4, y: 0, w: 8, h: 5 }), put('bullets', 'b', { x: 0, y: 5, w: 6, h: 7 }), put('bars', 'r', { x: 6, y: 5, w: 6, h: 7 })]
// 위에 목록, 아래에 숫자 카드와 막대 차트. 숫자 카드를 빼면 막대 차트가 판 너비를 다 받아 한 줄 더 높아진다(본문이 낮은 장)
const kpiRow = () => [put('bullets', 'b', { x: 0, y: 0, w: 12, h: 5 }), put('kpi', 'k', { x: 0, y: 5, w: 6, h: 7 }), put('bars', 'r', { x: 6, y: 5, w: 6, h: 7 })]

describe('컴포넌트를 빼서 옆 컴포넌트가 넓어지면', () => {
  it.each([
    ['인용', quoteRow, 'q', 705],
    ['숫자 카드', kpiRow, 'k', 650],
  ] as const)('%s 컴포넌트를 빼도 남은 컴포넌트가 잘리지 않게 다시 놓는다', (_, make, gone, h) => {
    const bs = make()
    expect(overAlready(bs, h)).toBe(false)
    // 옆 컴포넌트가 그대로 넓어지기만 하면 판보다 높다 (이 시험이 보는 경우)
    expect(overAlready(dropBlock(bs, gone, boardFit(h, bs)), h)).toBe(true)
    const after = removeBlock(bs, gone, h)
    expect(overAlready(after, h)).toBe(false)
    expect(tiles(after)).toBe(true)
    expect(after.map((b) => b.id)).toEqual(bs.filter((b) => b.id !== gone).map((b) => b.id))
  })
})

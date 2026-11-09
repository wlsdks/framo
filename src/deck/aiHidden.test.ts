import { describe, expect, it } from 'vitest'
import { aiHiddenIds, aiHiddenPatch, copiedAiHidden, slideAiHidden } from './aiHidden'
import { asCompose, autoPlace, makeBlock, unwrapCompose } from './blocks'
import { unknownParts } from './compat'
import { makeSlide } from './generate'
import { migrateDeck } from './migrate'
import { createSampleDeck, layoutSampleDeck } from './sample'
import type { Block, Slide } from './types'

const b = (type: Block['type'], id: string): Block => ({ ...makeBlock(type), id })
const compose = (...blocks: Block[]): Slide => ({ ...makeSlide('compose'), blocks: blocks.reduce<Block[]>((out, x) => autoPlace(out, x)!, []) })

describe('AI에게 숨기기', () => {
  it('켜고 끄면 장에 있는 컴포넌트만, 놓인 차례로 남긴다', () => {
    let s = compose(b('number', 'a'), b('text', 'c'), b('quote', 'q'))
    const set = (hidden: boolean, block?: string) => (s = { ...s, options: { ...s.options, ...aiHiddenPatch(s, hidden, block) } })
    set(true, 'q')
    set(true, 'a')
    expect(s.options.aiHiddenBlocks).toEqual(['a', 'q'])
    // 지운 컴포넌트의 id는 세지 않고, 다음에 고칠 때 털어 낸다
    s = { ...s, blocks: s.blocks!.filter((x) => x.id !== 'q') }
    expect([...aiHiddenIds(s)]).toEqual(['a'])
    set(true, 'c')
    expect(s.options.aiHiddenBlocks).toEqual(['a', 'c'])
    set(false, 'a')
    set(false, 'c')
    expect(s.options.aiHiddenBlocks).toBeUndefined()
    // 장 하나
    expect(slideAiHidden(s)).toBe(false)
    set(true)
    expect(slideAiHidden(s)).toBe(true)
    set(false)
    expect(s.options.aiHidden).toBeUndefined()
  })

  it('복사한 장의 새 id로 옮겨 적는다', () => {
    expect(copiedAiHidden({ aiHiddenBlocks: ['a', 'gone'] }, new Map([['a', 'A']]))).toEqual({ aiHiddenBlocks: ['A'] })
    expect(copiedAiHidden({ aiHiddenBlocks: ['gone'] }, new Map()).aiHiddenBlocks).toBeUndefined()
    expect(copiedAiHidden({ tone: 'invert' }, new Map())).toEqual({ tone: 'invert' })
  })

  it('레이아웃을 바꿔도 숨긴 채다: 숨긴 장은 컴포넌트 장이 되어도, 숨긴 컴포넌트 하나뿐인 장은 되돌려도', () => {
    const points = { ...layoutSampleDeck().slides.find((s) => s.layout === 'points')! }
    const hidden = asCompose({ ...points, options: { ...points.options, aiHidden: true } })
    expect(hidden.layout).toBe('compose')
    expect(slideAiHidden(hidden)).toBe(true)
    // 컴포넌트 하나뿐인 장의 그 컴포넌트를 숨겼으면, 되돌린 장을 숨긴다 (같은 글이 장으로 옮겨 온다)
    const one = asCompose(points)
    const shut = { ...one, options: { ...one.options, aiHiddenBlocks: [one.blocks![0].id] } }
    expect(slideAiHidden(unwrapCompose(shut, 'points')!)).toBe(true)
    expect(slideAiHidden(unwrapCompose(one, 'points')!)).toBe(false)
  })

  it('예전 버전도 막지 않고 값을 그대로 둔다 (장의 옵션이라 모르는 값으로 세지 않는다)', () => {
    const s = compose(b('number', 'a'), b('text', 'c'))
    const deck = { ...createSampleDeck(), slides: [{ ...s, options: { aiHiddenBlocks: ['a'] } }, { ...makeSlide('statement'), options: { aiHidden: true } }] }
    expect(unknownParts(deck)).toBe(0)
    const opened = migrateDeck(deck)
    expect(opened.slides[0].options.aiHiddenBlocks).toEqual(['a'])
    expect(opened.slides[1].options.aiHidden).toBe(true)
  })
})

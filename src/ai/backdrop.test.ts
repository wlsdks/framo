import { describe, expect, it } from 'vitest'
import { BACKDROP_IDS, baseBackdrop } from '../deck/backdrops'
import { createSampleDeck } from '../deck/sample'
import type { Deck, Slide } from '../deck/types'
import { applyOps, parseOp, type Op } from './ops'
import { secretDeck, SECRET } from './secretDeck'
import { catalog, checkShape, onlyKnownStrings, shapeSlideId, TEXT_STATES, toShape } from './share'

// 배경: AI는 모양(고른 배경 id, 자리, 짙기)만 보고, 고르는 값만 바꾼다

const deck: Deck = createSampleDeck()
const cover = deck.slides.findIndex((s) => s.layout === 'cover')
/** 모양의 장 하나의 배경 (AI에게 숨긴 장이면 배경이 없다) */
const bdOf = (s: unknown) => (s as { backdrop?: unknown }).backdrop
const withBackdrop = (d: Deck, i: number, backdrop: Slide['backdrop']): Deck => ({ ...d, slides: d.slides.map((s, j) => (j === i ? { ...s, backdrop } : s)) })

describe('배경의 모양', () => {
  it('고른 배경은 id, 자리, 짙기(보통이 아닐 때)만 나가고 모양 확인을 지난다', () => {
    const shape = toShape(withBackdrop(deck, cover, { kind: 'diffuse', at: { x: 0, y: 0, w: 8, h: 8 }, strength: 'strong' }))
    expect(bdOf(shape.slides[cover])).toEqual({ id: 'diffuse', x: 0, y: 0, w: 8, h: 8, strength: 'strong' })
    expect(checkShape(shape)).toBe(true)
    // 자리를 고르지 않았으면 장 전체, 보통이면 짙기는 빠진다
    expect(bdOf(toShape(withBackdrop(deck, cover, { kind: 'flow' })).slides[cover])).toEqual({ id: 'flow', x: 0, y: 0, w: 12, h: 12 })
  })

  it('이 버전이 모르는 배경(더 새 버전의 것)은 모양에 나가지 않는다', () => {
    const shape = toShape(withBackdrop(deck, cover, { kind: 'aurora' as never }))
    expect(bdOf(shape.slides[cover])).toBeUndefined()
    expect(checkShape(shape)).toBe(true)
  })

  it('꼴이 틀린 배경이 든 모양은 통째로 버린다', () => {
    const shape = toShape(withBackdrop(deck, cover, { kind: 'diffuse' }))
    const bad = (backdrop: unknown) => {
      const copy = structuredClone(shape) as unknown as { slides: Record<string, unknown>[] }
      copy.slides[cover].backdrop = backdrop
      return checkShape(copy)
    }
    expect(bad({ id: 'diffuse', x: 0, y: 0, w: 12, h: 12 })).toBe(true)
    expect(bad({ id: 'diffuse', x: 0, y: 0, w: 2, h: 12 })).toBe(false)
    expect(bad({ id: 'diffuse', x: 6, y: 0, w: 7, h: 12 })).toBe(false)
    expect(bad({ id: 'diffuse', x: 0, y: 0, w: 12, h: 12, strength: 'base' })).toBe(false)
    expect(bad({ id: 'nope', x: 0, y: 0, w: 12, h: 12 })).toBe(false)
    expect(bad({ id: 'diffuse', x: 0, y: 0, w: 12, h: 12, note: 'x' })).toBe(false)
  })

  it('배경 자리에 비밀을 심어도 모양에는 정해진 말과 수만 나간다', () => {
    const shape = toShape(secretDeck())
    expect(JSON.stringify(shape)).not.toContain(SECRET)
    expect(checkShape(shape)).toBe(true)
    // 표지(아는 배경, 비밀이 든 자리와 짙기)는 장 전체, 보통으로 그려지고 그대로 나간다
    expect(bdOf(shape.slides[0])).toEqual({ id: 'diffuse', x: 0, y: 0, w: 12, h: 12 })
    expect(bdOf(shape.slides[1])).toBeUndefined()
    expect(onlyKnownStrings(shape, ['format', 'version', 'deck', 'type', 'audience', 'duration', 'method', 'theme', 'accent', 'motion', 'font', 'size', 'footer', 'transition', 'tone', 'updatedAt', 'slides', 'id', 'layout', 'role', 'section', 'hidden', 'hiddenItems', 'fields', 'items', 'options', 'highlight', 'flip', 'contain', 'place', 'variant', 'base', 'filled', ...TEXT_STATES, 'html-maker/shape', 'blocks', 'x', 'y', 'w', 'h', 'look', 'effect', 'when', 'speed', 'from', 'order', 'link', 'linkBelow', 'scene', 'over', 'backdrop', 'strength'])).toBe(true)
  })

  it('카탈로그에 배경 셋과 짙기, 자주 쓰는 자리가 있다', () => {
    const c = catalog()
    expect(c.backdrops.map((b) => b.id)).toEqual([...BACKDROP_IDS])
    expect(c.backdrops.every((b) => b.name && b.fits)).toBe(true)
    expect(c.backdropStrengths.map((s) => s.id)).toEqual(['soft', 'base', 'strong'])
    expect(c.backdropPlaces.find((p) => p.id === 'full')).toMatchObject({ x: 0, y: 0, w: 12, h: 12 })
  })
})

describe('배경 제안(set_backdrop)', () => {
  const sid = shapeSlideId(deck.slides[cover])

  it('고르는 값만 받는다: 아는 배경이나 null, 자리는 넷을 함께, 짙기는 목록에서', () => {
    expect(parseOp({ op: 'set_backdrop', slide: sid, backdrop: 'gather' })).not.toBeNull()
    expect(parseOp({ op: 'set_backdrop', slide: sid, backdrop: null })).not.toBeNull()
    expect(parseOp({ op: 'set_backdrop', slide: sid, backdrop: 'gather', x: 0, y: 0, w: 6, h: 12, strength: 'soft' })).not.toBeNull()
    expect(parseOp({ op: 'set_backdrop', slide: sid, backdrop: 'aurora' })).toBeNull()
    // 뺀 배경은 고를 수 없다
    expect(parseOp({ op: 'set_backdrop', slide: sid, backdrop: 'depth' })).toBeNull()
    expect(parseOp({ op: 'set_backdrop', slide: sid, backdrop: 'link' })).toBeNull()
    expect(parseOp({ op: 'set_backdrop', slide: sid })).toBeNull()
    expect(parseOp({ op: 'set_backdrop', slide: sid, backdrop: 'gather', x: 0, y: 0 })).toBeNull()
    expect(parseOp({ op: 'set_backdrop', slide: sid, backdrop: 'gather', x: 10, y: 0, w: 6, h: 12 })).toBeNull()
    expect(parseOp({ op: 'set_backdrop', slide: sid, backdrop: 'gather', strength: 'loud' })).toBeNull()
    expect(parseOp({ op: 'set_backdrop', slide: sid, backdrop: null, strength: 'soft' })).toBeNull()
    expect(parseOp({ op: 'set_backdrop', slide: sid, backdrop: 'gather', text: '글' })).toBeNull()
  })

  it('처음 고르면 그 장의 처음 자리에, 다시 고르면 자리와 짙기는 그대로 종류만 바뀐다', () => {
    const first = applyOps(deck, [{ op: 'set_backdrop', slide: sid, backdrop: 'diffuse' }])
    expect(first.results[0].ok).toBe(true)
    expect(first.deck.slides[cover].backdrop).toEqual(baseBackdrop(deck.slides[cover], 'diffuse'))
    const moved: Op = { op: 'set_backdrop', slide: sid, backdrop: 'diffuse', x: 2, y: 2, w: 8, h: 8, strength: 'soft' }
    const second = applyOps(first.deck, [moved, { op: 'set_backdrop', slide: sid, backdrop: 'gather' }])
    expect(second.results.map((r) => r.ok)).toEqual([true, true])
    expect(second.deck.slides[cover].backdrop).toEqual({ kind: 'gather', at: { x: 2, y: 2, w: 8, h: 8 }, strength: 'soft' })
  })

  it('같은 것을 다시 고르거나 없는 배경을 빼면 바뀌는 것이 없다', () => {
    const on = applyOps(deck, [{ op: 'set_backdrop', slide: sid, backdrop: 'flow' }]).deck
    expect(applyOps(on, [{ op: 'set_backdrop', slide: sid, backdrop: 'flow' }]).results[0].code).toBe('no_change')
    expect(applyOps(deck, [{ op: 'set_backdrop', slide: sid, backdrop: null }]).results[0].code).toBe('no_change')
    const off = applyOps(on, [{ op: 'set_backdrop', slide: sid, backdrop: null }])
    expect(off.results[0].ok).toBe(true)
    expect('backdrop' in off.deck.slides[cover]).toBe(false)
  })

  it('사람이 적은 글은 그대로다', () => {
    const ops: Op[] = deck.slides.map((s, i) => ({ op: 'set_backdrop', slide: shapeSlideId(s), backdrop: BACKDROP_IDS[i % BACKDROP_IDS.length] }))
    const after = applyOps(deck, ops).deck
    const text = (d: Deck) => JSON.stringify(d.slides.map((s) => [s.fields, s.items, s.notes, s.blocks]))
    expect(text(after)).toBe(text(deck))
  })
})

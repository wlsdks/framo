import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BACKDROP_PLACES, BACKDROPS, backdropOf, baseBackdrop, isBackdropArea, tidyBackdrop, withBackdropKind, WHOLE_SLIDE } from './backdrops'
import { asCompose } from './blocks'
import { knownOnly, unknownParts } from './compat'
import { makeSlide } from './generate'
import { relayout } from './edits'
import { migrateDeck } from './migrate'
import { createSampleDeck } from './sample'
import type { Backdrop, Deck, Slide } from './types'

const withSlides = (...slides: Slide[]): Deck => ({ ...createSampleDeck(), slides })

describe('배경의 값', () => {
  it('배경 이름은 모션 기준(docs/MOTION.md 9절)의 분위기 셋과 같다', () => {
    const doc = readFileSync(join(process.cwd(), 'docs', 'MOTION.md'), 'utf8')
    const table = doc.slice(doc.indexOf('| 분위기 |'), doc.indexOf('### 10.'))
    const moods = [...table.matchAll(/^\| ([^|]+?) \| /gm)].map((m) => m[1]).filter((n) => n !== '분위기' && !n.startsWith('---'))
    expect(BACKDROPS.map((b) => b.name)).toEqual(moods)
  })

  it('그릴 배경: 모르는 종류는 그리지 않고, 틀린 자리와 짙기는 기본값으로 그린다(값은 고치지 않는다)', () => {
    expect(backdropOf({})).toBeNull()
    expect(backdropOf({ backdrop: { kind: 'aurora' } as unknown as Backdrop })).toBeNull()
    expect(backdropOf({ backdrop: { kind: 'flow' } })).toEqual({ kind: 'flow', at: WHOLE_SLIDE, strength: 'base' })
    const odd = { kind: 'flow', at: { x: 10, y: 0, w: 6, h: 12 }, strength: 'loud' } as unknown as Backdrop
    expect(backdropOf({ backdrop: odd })).toEqual({ kind: 'flow', at: WHOLE_SLIDE, strength: 'base' })
    expect(isBackdropArea({ x: 0, y: 0, w: 2, h: 12 })).toBe(false)
    expect(BACKDROP_PLACES.every((p) => isBackdropArea(p.at))).toBe(true)
  })

  it('저장할 때는 기본값(장 전체, 보통)을 빼고 적는다', () => {
    expect(tidyBackdrop({ kind: 'gather', at: WHOLE_SLIDE, strength: 'base' })).toEqual({ kind: 'gather' })
    expect(tidyBackdrop({ kind: 'gather', at: { x: 5, y: 0, w: 7, h: 12 }, strength: 'soft' })).toEqual({ kind: 'gather', at: { x: 5, y: 0, w: 7, h: 12 }, strength: 'soft' })
  })

  it('처음 고를 때는 장 전체에(표지는 옆 면 밖의 판 전체에) 놓는다', () => {
    const cover = makeSlide('cover')
    expect(baseBackdrop(cover, 'diffuse').at).toEqual({ x: 0, y: 0, w: 8, h: 12 })
    expect(baseBackdrop({ ...cover, options: { flip: true } }, 'diffuse').at).toEqual({ x: 4, y: 0, w: 8, h: 12 })
    expect(baseBackdrop(makeSlide('points'), 'flow')).toEqual({ kind: 'flow' })
    expect(baseBackdrop(makeSlide('statement'), 'gather')).toEqual({ kind: 'gather', strength: 'strong' })
    // 종류를 바꾸면 고른 자리와 짙기는 그대로
    const chosen = { ...cover, backdrop: { kind: 'diffuse', at: { x: 2, y: 2, w: 8, h: 8 }, strength: 'soft' } as Backdrop }
    expect(withBackdropKind(chosen, 'flow')).toEqual({ kind: 'flow', at: { x: 2, y: 2, w: 8, h: 8 }, strength: 'soft' })
  })
})

describe('배경과 예전 파일', () => {
  const deck = withSlides({ ...makeSlide('cover'), backdrop: { kind: 'diffuse', at: { x: 0, y: 0, w: 8, h: 8 } } }, { ...makeSlide('points'), backdrop: { kind: 'aurora' } as unknown as Backdrop })

  it('뺀 배경(깊이, 구조, 여운, 연결)은 그리지 않고 값은 남는다', () => {
    for (const kind of ['depth', 'structure', 'linger', 'link']) {
      const slide = { ...makeSlide('points'), backdrop: { kind } as unknown as Backdrop }
      expect(backdropOf(slide), kind).toBeNull()
      const d = withSlides(slide)
      expect(unknownParts(d)).toBe(0)
      expect(migrateDeck(d).slides[0].backdrop).toEqual({ kind })
    }
  })

  it('모르는 배경(더 새 버전의 것)은 발표를 막지 않고, 열고 고쳐도 값이 남는다', () => {
    expect(unknownParts(deck)).toBe(0)
    expect(knownOnly(deck).slides[1].backdrop).toEqual({ kind: 'aurora' })
    expect(migrateDeck(deck).slides.map((s) => s.backdrop)).toEqual(deck.slides.map((s) => s.backdrop))
  })

  it('레이아웃을 바꾸거나 컴포넌트 장으로 바꿔도 배경은 남는다', () => {
    const s = deck.slides[0]
    const points = { ...makeSlide('points'), backdrop: s.backdrop }
    expect(relayout(points, 'compare').backdrop).toEqual(s.backdrop)
    expect(asCompose(points).backdrop).toEqual(s.backdrop)
  })
})

import { describe, expect, it } from 'vitest'
import { useDeck } from '../store/deckStore'
import { autoPlace, BLOCK_EFFECT_IDS, BLOCK_FROM_IDS, BLOCK_LOOK_IDS, BLOCK_SPEED_IDS, BLOCK_TYPES, BLOCK_WHEN_IDS, BLOCKS, MAX_LARGE } from './blocks'
import { sampleBlock } from './blockSamples'
import { DECK_TYPES } from './blueprints'
import { knownOnly, unknownParts } from './compat'
import { createDeck, makeSlide } from './generate'
import { createSampleDeck } from './sample'
import { showcaseSlides } from './showcase'
import { FONTS, fontOf } from './themes'
import type { Block, Deck, FontId, Slide } from './types'

/** 차례대로 눌러 넣은 부품 장. 아는 부품이 아니면(모르는 부품, 모양) 자리를 정하지 않고 그대로 둔다 */
const compose = (...blocks: Block[]): Slide => ({
  ...makeSlide('compose'),
  blocks: blocks.reduce<Block[]>((out, b) => (BLOCK_TYPES.includes(b.type) && (autoPlace(out, b) ?? null)) || [...out, b], []),
})
/** 손으로 적은 판 (꼴을 따지지 않는다) */
const boardOf = (...blocks: Record<string, unknown>[]) => withSlides({ ...makeSlide('compose'), blocks: blocks as unknown as Block[] })
const withSlides = (...slides: Slide[]): Deck => ({ ...createSampleDeck(), slides })

describe('새 버전에서 만든 발표 알아보기', () => {
  it('이 버전이 만드는 발표는 모두 그대로 연다', () => {
    expect(unknownParts(createSampleDeck())).toBe(0)
    expect(unknownParts(withSlides(...showcaseSlides()))).toBe(0)
    for (const type of DECK_TYPES) {
      const deck = createDeck({ type, audience: 'mixed', minutes: 30, method: 'live', title: '', org: '', presenter: '', theme: 'white' })
      expect(unknownParts(deck), type).toBe(0)
    }
    // 모든 부품의 모든 모양, 바탕, 움직임
    for (const type of BLOCK_TYPES) {
      const b = sampleBlock(type)
      for (const variant of BLOCKS[type].variants?.map((v) => v.id) ?? [undefined]) {
        for (const look of BLOCK_LOOK_IDS) {
          for (const effect of BLOCK_EFFECT_IDS) expect(unknownParts(withSlides(compose({ ...b, variant, look, effect }))), type).toBe(0)
        }
      }
    }
    // 나오는 때, 빠르기, 들어오는 쪽
    const t = sampleBlock('text')
    for (const when of BLOCK_WHEN_IDS) for (const speed of BLOCK_SPEED_IDS) for (const from of BLOCK_FROM_IDS) expect(unknownParts(withSlides(compose({ ...t, effect: 'rise', when, speed, from })))).toBe(0)
  })

  it('모르는 부품, 모양, 움직임, 장, 저장 형식을 센다', () => {
    const text = sampleBlock('text')
    const raw = (b: Record<string, unknown>) => b as unknown as Block
    expect(unknownParts(withSlides(compose(text, raw({ id: 'x', type: 'hologram', fields: { body: '글' }, items: [] }))))).toBe(1)
    expect(unknownParts(withSlides(compose(raw({ ...text, effect: 'spiral', look: 'glass' }))))).toBe(2)
    expect(unknownParts(withSlides(compose(raw({ ...text, when: 'later', speed: 'warp' }))))).toBe(2)
    expect(unknownParts(withSlides(compose(raw({ ...sampleBlock('bullets'), variant: 'cards3d' }))))).toBe(1)
    expect(unknownParts(withSlides(compose(raw({ ...sampleBlock('bullets'), items: [{ id: 'i', title: '하나', color: 'red' }] }))))).toBe(1)
    expect(unknownParts(withSlides({ ...makeSlide('kpi'), layout: 'roadmap' as Slide['layout'] }))).toBe(1)
    expect(unknownParts({ ...createSampleDeck(), version: 3 as 2 })).toBe(1)
    expect(unknownParts({ ...createSampleDeck(), theme: { id: 'forest' as 'white' } })).toBe(1)
    // 정한 개수(큰 부품 MAX_LARGE)를 넘는 부품: 예전 버전이면 빼고 저장한다
    const whole = { x: 0, y: 0, w: 12, h: 12 }
    expect(unknownParts(boardOf(...Array.from({ length: MAX_LARGE + 1 }, (_, n) => ({ ...text, id: `t${n}`, at: whole }))))).toBe(1)
    // 부품에 새로 더한 값: 예전 버전이 고치면 빼고 저장하게 된다. 자리는 바로잡을 수 있는 값이라 세지 않는다
    expect(unknownParts(withSlides(compose(raw({ ...text, glow: true }))))).toBe(1)
    expect(unknownParts(boardOf({ ...text, at: { x: 0, y: 0, w: 99, h: -1 } }))).toBe(0)
    // 이음표는 이 버전이 아는 모양만
    expect(unknownParts(boardOf({ ...text, at: { x: 0, y: 0, w: 6, h: 12 }, link: 'arrow' }, { ...text, id: 't2', at: { x: 6, y: 0, w: 6, h: 12 } }))).toBe(0)
    expect(unknownParts(boardOf({ ...text, at: { x: 0, y: 0, w: 6, h: 12 }, link: 'spiral' }, { ...text, id: 't2', at: { x: 6, y: 0, w: 6, h: 12 } }))).toBe(1)
    // 판 전(0.4까지)의 줄로 적은 발표도 연다: 열 때 판으로 바꾼다. 줄에 있던 모르는 값은 센다
    const rowsOf = (...rows: Record<string, unknown>[]) => withSlides({ ...makeSlide('compose'), ...({ rows } as object) })
    expect(unknownParts({ ...rowsOf({ id: 'r1', blocks: [{ ...text, link: 'arrow' }, { ...text, id: 't2' }], link: 'plus', grow: 40 }, { id: 'r2', blocks: [{ ...text, id: 't3' }], grow: 60 }), version: 1 as 2 })).toBe(0)
    // 줄 안의 모르는 부품은 글을 잃으니 센다 (이음표 같은 값은 예전 버전이 쓴 그대로라 따지지 않는다)
    expect(unknownParts(rowsOf({ id: 'r1', blocks: [text, { id: 'x', type: 'hologram', fields: { body: '글' }, items: [] }] }))).toBe(1)
    // 꼴이 망가진 값은 사람이 넣은 것이 아니라 세지 않는다
    expect(unknownParts(withSlides(compose(raw({ ...text, fields: { body: '글', bad: 3 } }))))).toBe(0)
  })

  it('모르는 발표 종류와 듣는 사람은 세지 않는다', () => {
    // 종류와 듣는 사람은 장을 처음 만들 때만 쓰고, 예전 버전도 고쳐 저장할 때 값을 그대로 둔다(잃는 글이 없다).
    // 이름은 내 발표 목록에서 비고, AI에게는 빈 발표와 '여러 분이 함께'로 보인다(share.test.ts)
    const meta = { ...createSampleDeck().meta, type: 'townhall', audience: 'board' } as unknown as Deck['meta']
    expect(unknownParts({ ...createSampleDeck(), meta })).toBe(0)
  })

  it('아는 것만 남긴 사본은 그대로 열리고, 아는 부품의 글은 다 남는다', () => {
    const text = { ...sampleBlock('text'), fields: { body: '남을 글' } }
    const deck = withSlides(
      makeSlide('cover'),
      compose(text, { id: 'x', type: 'hologram', fields: { body: '새 부품' }, items: [] } as unknown as Block),
      { ...makeSlide('kpi'), layout: 'roadmap' as Slide['layout'] },
    )
    const before = structuredClone(deck)
    const known = knownOnly(deck)
    expect(unknownParts(known)).toBe(0)
    expect(known.slides.map((s) => s.layout)).toEqual(['cover', 'compose'])
    expect(known.slides[1].blocks?.map(({ at: _, ...b }) => b)).toEqual([text].map(({ at: _, ...b }) => b))
    expect(deck).toEqual(before)
  })

  it('모르는 글꼴은 세지 않는다: 기본 글꼴로 그리고, 값은 고칠 때까지 그대로 남는다', () => {
    // 글꼴은 그리는 법만 바뀌고 글이나 장을 잃지 않는다. 열지 못하게 막을 까닭이 없다
    for (const f of FONTS) expect(unknownParts({ ...createSampleDeck(), theme: { id: 'white', font: f.id } }), f.id).toBe(0)
    const newer = { ...createSampleDeck(), theme: { id: 'navy' as const, font: 'nanum' as FontId } }
    expect(unknownParts(newer)).toBe(0)
    expect(fontOf(newer.theme)).toBe('sans')
    expect(fontOf({ id: 'white', font: 'constructor' as FontId })).toBe('sans')
    useDeck.getState().open(newer)
    expect(useDeck.getState().deck?.theme.font).toBe('nanum')
    useDeck.getState().close()
  })

  it('내 PC 글꼴은 세지 않는다: 그 글꼴이 없는 PC와 예전 버전은 고른 짝의 글꼴로 그리고, 이름은 저장해도 남는다', () => {
    // 이름 하나라 잃을 글이 없다. 예전 버전은 localFont를 모르고 테마를 통째로 옮겨 적어서 값이 그대로 남는다
    const deck = { ...createSampleDeck(), theme: { id: 'white' as const, font: 'serif' as FontId, localFont: '회사 고딕' } }
    expect(unknownParts(deck)).toBe(0)
    useDeck.getState().open(deck)
    useDeck.getState().setLook({ size: 'large' })
    expect(useDeck.getState().deck?.theme).toMatchObject({ font: 'serif', localFont: '회사 고딕', size: 'large' })
    useDeck.getState().close()
  })

  it('편집기는 그런 발표를 열지 않고 들고만 있다', () => {
    const newer = withSlides(compose({ id: 'x', type: 'hologram', fields: { body: '새 부품' }, items: [] } as unknown as Block))
    useDeck.getState().open(newer)
    expect(useDeck.getState().deck).toBeNull()
    expect(useDeck.getState().newer).toBe(newer)
    const sample = createSampleDeck()
    useDeck.getState().open(sample)
    expect(useDeck.getState().deck?.id).toBe(sample.id)
    expect(useDeck.getState().newer).toBeNull()
    useDeck.getState().close()
  })
})

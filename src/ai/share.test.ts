import { describe, expect, it } from 'vitest'
import { autoPlace, insertAt, makeBlock, tiles, withLink } from '../deck/blocks'
import { AUDIENCES, BLUEPRINTS, DECK_TYPES } from '../deck/blueprints'
import { createDeck, makeSlide } from '../deck/generate'
import { createSampleDeck } from '../deck/sample'
import { SCENE_IDS, sceneFits, sceneOf, withScenes } from '../deck/scenes'
import { LAYOUTS } from '../deck/layouts'
import type { Block, LayoutId } from '../deck/types'
import { parseOp } from './ops'
import { HIGHLIGHT_MAX, HIGHLIGHT_MIN } from './protocol'
import { SECRET, secretDeck } from './secretDeck'
import { checkShape, onlyKnownStrings, toShape } from './share'

describe('모양만 고르기', () => {
  it('적은 글, 제목, 이름, 노트, 이미지, 원래 id가 하나도 들어가지 않는다', () => {
    const text = JSON.stringify(toShape(secretDeck()))
    expect(text).not.toContain(SECRET)
    // 숫자 비밀은 해시 id와 시각 숫자에 우연히 들어 있을 수 있어서 그것만 지우고 본다
    const plain = text.replace(/[sdbx][0-9a-f]{8}/g, '').replace(/"(updatedAt|createdAt)":\d+/g, '')
    expect(plain).not.toContain('7731')
  })

  it('카탈로그에 없는 역할과 단락 이름은 null로 둔다', () => {
    const shape = toShape(secretDeck())
    expect(shape.slides.every((s) => s.role === null && s.section === null)).toBe(true)
    expect(shape.accent).toBeNull()
  })

  it('부품 장은 부품의 종류, 판의 자리, 바탕, 움직임과 칸 상태만 보인다', () => {
    const shape = toShape(secretDeck())
    const compose = shape.slides.find((x) => x.layout === 'compose')!
    const blocks = compose.blocks!
    // 모르는 종류, 예전 꼴의 쌓은 부품과 줄(rows)은 빠진다
    expect(blocks.map((b) => b.type).sort()).toEqual(['bullets', 'kpi', 'message', 'number'])
    expect(blocks.every((b) => /^b/.test(b.id!))).toBe(true)
    // 자리에 심은 비밀은 버리고 판을 다시 나눈다: 빈틈없이, 칸 수로만
    expect(tiles(blocks.map((b, i) => ({ ...makeBlock(b.type), id: String(i), at: { x: b.x, y: b.y, w: b.w, h: b.h } })))).toBe(true)
    expect(blocks.every((b) => [b.x, b.y, b.w, b.h].every(Number.isInteger))).toBe(true)
    const message = blocks.find((b) => b.type === 'message')!
    expect(message).toMatchObject({ look: 'plain', effect: 'auto', variant: 'base', fields: { text: 'filled' } })
    // 이음표는 카탈로그의 말만: 맞지 않는 값과 설 데가 없는 것(판의 끝)은 빠진다
    expect(blocks.map((b) => b.link ?? null).filter(Boolean)).toEqual(['arrow'])
    expect(blocks.every((b) => b.linkBelow === undefined)).toBe(true)
    expect(checkShape(shape)).toBe(true)
  })

  it('판의 자리와 두 쪽 이음표는 칸 수와 카탈로그의 말로 보인다', () => {
    const b = (type: Block['type'], id: string): Block => ({ ...makeBlock(type), id })
    let blocks = insertAt(autoPlace([], b('number', 'n'))!, { at: 'n', side: 'right' }, b('delta', 'd'))!
    blocks = withLink(withLink(insertAt(blocks, { at: null, side: 'below' }, b('text', 't'))!, { id: 'n', dir: 'h' }, 'plus'), { id: 'n', dir: 'v' }, 'equals')
    const deck = { ...createSampleDeck(), slides: [{ ...makeSlide('compose'), blocks }] }
    const shown = toShape(deck).slides[0].blocks!
    expect(shown.map((x) => [x.type, x.x, x.y, x.w, x.h, x.link ?? null, x.linkBelow ?? null])).toEqual(
      blocks.map((x) => [x.type, x.at!.x, x.at!.y, x.at!.w, x.at!.h, x.link ?? null, x.linkBelow ?? null]),
    )
    expect(checkShape(toShape(deck))).toBe(true)
  })

  it('원래 덱에서는 장 역할과 칸 상태가 보인다', () => {
    const shape = toShape(createSampleDeck())
    expect(shape.slides[1]).toMatchObject({ layout: 'summary', role: '한 장 요약', fields: { title: 'filled' } })
    expect(shape.slides[1].items).toHaveLength(4)
    expect(shape.slides.find((s) => s.layout === 'kpi')?.items[0]).toEqual({ value: 'filled', title: 'filled', body: 'filled' })
    expect(checkShape(shape)).toBe(true)
  })

  it('비밀을 심은 덱에서 만든 모양도 꼴은 맞다', () => {
    const shape = toShape(secretDeck())
    expect(checkShape(shape)).toBe(true)
    // 모르는 종류, 듣는 사람, 방식은 정해진 값으로 바꾼다
    expect([shape.type, shape.audience, shape.method]).toEqual(['blank', 'mixed', 'live'])
  })

  it('조건별 흐름의 질문과 경로 내용도 AI에게 보내지 않는다', () => {
    const decision = makeBlock('decision')
    const hidden = {
      ...decision,
      id: SECRET,
      fields: { label: SECRET, question: SECRET },
      items: decision.items.map((item) => ({ ...item, title: SECRET, body: SECRET })),
      hints: { question: SECRET, 'items.title': SECRET },
    }
    const blocks = autoPlace([], hidden)!
    const shape = toShape({ ...createSampleDeck(), slides: [{ ...makeSlide('compose'), blocks }] })
    expect(checkShape(shape)).toBe(true)
    expect(JSON.stringify(shape)).not.toContain(SECRET)
    expect(shape.slides[0].blocks![0]).toMatchObject({
      type: 'decision',
      fields: { label: 'filled', question: 'filled' },
      items: [{ title: 'filled', body: 'filled' }, { title: 'filled', body: 'filled' }],
    })
  })

  it('모든 발표 종류와 듣는 사람의 구성이 꼴 확인과 마지막 그물을 지난다', () => {
    const words = ['format', 'version', 'deck', 'type', 'audience', 'duration', 'method', 'theme', 'accent', 'motion', 'font', 'size', 'footer', 'transition', 'tone', 'updatedAt', 'slides', 'id', 'layout', 'role', 'section', 'hidden', 'hiddenItems', 'fields', 'items', 'options', 'highlight', 'flip', 'pane', 'contain', 'place', 'variant', 'base', 'empty', 'filled', 'long', 'html-maker/shape']
    for (const type of [...DECK_TYPES, 'blank' as const]) {
      for (const { id: audience } of AUDIENCES) {
        const shape = toShape(createDeck({ type, audience, minutes: 30, method: 'send', title: SECRET, org: SECRET, presenter: SECRET, ask: SECRET, theme: 'white' }))
        expect(shape.type, type).toBe(type)
        expect(shape.audience).toBe(audience)
        expect(checkShape(shape), `${type} ${audience}`).toBe(true)
        expect(onlyKnownStrings(shape, words), `${type} ${audience}`).toBe(true)
        // 장 역할과 단락 이름은 구성에 있는 말이라 그대로 보인다
        expect(shape.slides.every((s) => s.role !== null), type).toBe(true)
        expect(JSON.stringify(shape)).not.toContain(SECRET)
      }
    }
  })

  it('정해진 꼴에서 하나라도 벗어나면 받지 않는다', () => {
    const shape = toShape(createSampleDeck())
    const bad = (fn: (v: Record<string, unknown> & { slides: Record<string, unknown>[] }) => void) => {
      const copy = structuredClone(shape) as unknown as Record<string, unknown> & { slides: Record<string, unknown>[] }
      fn(copy)
      return checkShape(copy)
    }
    expect(bad((v) => (v.title = SECRET))).toBe(false)
    expect(bad((v) => (v.slides[0].role = SECRET))).toBe(false)
    expect(bad((v) => (v.slides[0].note = SECRET))).toBe(false)
    expect(bad((v) => ((v.slides[0].fields as Record<string, string>).title = SECRET))).toBe(false)
    expect(bad((v) => ((v.slides[1].items as Record<string, string>[])[0].body = SECRET))).toBe(false)
    expect(bad((v) => (v.slides[0].id = SECRET))).toBe(false)
    expect(bad((v) => (v.accent = SECRET))).toBe(false)
    expect(bad((v) => (v.deck = 'd' + SECRET))).toBe(false)
    // 부품 장이 아닌 장에 부품, 모르는 부품, 모르는 바탕
    expect(bad((v) => (v.slides[1].blocks = []))).toBe(false)
    const withBlocks = toShape(secretDeck())
    const badBlocks = (fn: (b: Record<string, unknown>) => void) => {
      const copy = structuredClone(withBlocks) as unknown as { slides: { layout: string; blocks?: Record<string, unknown>[] }[] }
      fn(copy.slides.find((x) => x.layout === 'compose')!.blocks![0])
      return checkShape(copy)
    }
    expect(badBlocks(() => {})).toBe(true)
    expect(badBlocks((b) => (b.type = SECRET))).toBe(false)
    expect(badBlocks((b) => (b.look = SECRET))).toBe(false)
    expect(badBlocks((b) => (b.x = 13))).toBe(false)
    expect(badBlocks((b) => (b.w = 0))).toBe(false)
    expect(badBlocks((b) => (b.h = SECRET))).toBe(false)
    expect(badBlocks((b) => (b.note = SECRET))).toBe(false)
    expect(badBlocks((b) => ((b.fields as Record<string, string>).text = SECRET))).toBe(false)
    // 부품 id는 해시 id(b로 시작)만. 원래 id나 글이면 버린다. 예전 앱이 쓴 모양 파일처럼 없으면 받는다
    expect(badBlocks((b) => (b.id = SECRET))).toBe(false)
    expect(badBlocks((b) => (b.id = 's12345678'))).toBe(false)
    expect(badBlocks((b) => delete b.id)).toBe(true)
    expect(badBlocks((b) => (b.highlight = SECRET))).toBe(false)
    expect(badBlocks((b) => (b.when = SECRET))).toBe(false)
    expect(badBlocks((b) => (b.speed = SECRET))).toBe(false)
    expect(badBlocks((b) => (b.from = SECRET))).toBe(false)
    // 예전 꼴(쌓은 부품, 칸 너비)은 받지 않는다
    expect(badBlocks((b) => (b.stack = []))).toBe(false)
    expect(badBlocks((b) => (b.span = 4))).toBe(false)
    // 판: 겹치거나 빈 곳이 있는 자리, 판 끝의 이음표, 넘치는 부품 수
    const badBoard = (fn: (bs: Record<string, unknown>[]) => void) => {
      const copy = structuredClone(withBlocks) as unknown as { slides: { layout: string; blocks?: Record<string, unknown>[] }[] }
      fn(copy.slides.find((x) => x.layout === 'compose')!.blocks!)
      return checkShape(copy)
    }
    expect(badBoard(() => {})).toBe(true)
    expect(badBoard((bs) => (bs[1].x = bs[0].x))).toBe(false)
    expect(badBoard((bs) => bs.pop())).toBe(false)
    expect(badBoard((bs) => (bs.find((b) => (b.x as number) + (b.w as number) === 12)!.link = 'arrow'))).toBe(false)
    expect(badBoard((bs) => (bs[0].linkBelow = 'arrow'))).toBe(false)
    expect(badBoard((bs) => (bs[0].link = SECRET))).toBe(false)
    expect(badBoard((bs) => bs.push(...Array.from({ length: 10 }, () => structuredClone(bs[0]))))).toBe(false)
    // 나오는 차례는 부품 장에만, 해시 id로만
    const badCompose = (fn: (o: Record<string, unknown>) => void) => {
      const copy = structuredClone(withBlocks) as unknown as { slides: { layout: string; options: Record<string, unknown> }[] }
      fn(copy.slides.find((x) => x.layout === 'compose')!.options)
      return checkShape(copy)
    }
    expect(badCompose((o) => (o.order = [SECRET]))).toBe(false)
    expect(badCompose((o) => (o.transition = SECRET))).toBe(false)
    expect(bad((v) => ((v.slides[1].options as Record<string, unknown>).order = ['b12345678']))).toBe(false)
  })

  it('비밀을 심은 덱의 나오는 차례는 있는 부품의 해시 id만 남는다', () => {
    const shape = toShape(secretDeck())
    const compose = shape.slides.find((x) => x.layout === 'compose')!
    const id = (type: string) => compose.blocks!.find((b) => b.type === type)!.id
    // 심은 차례: 없는 id, 셋째 부품(핵심 숫자), 첫째 부품(한마디) → 그 둘의 해시 id
    expect(compose.options.order).toEqual([id('kpi'), id('message')])
    expect(compose.options.transition).toBeUndefined()
    for (const s of shape.slides.filter((x) => x.layout !== 'compose')) expect(s.options.order).toBeUndefined()
  })

  it('장면은 목록에 있고 그 장에 맞을 때만 보인다', () => {
    const shape = toShape(secretDeck())
    // 비밀을 심은 덱: 표지의 맞는 장면만 남고, 한 장 요약의 맞지 않는 장면(숫자가 말한다)과 비밀은 빠진다
    expect(shape.slides[0].options.scene).toBe('opening')
    expect(shape.slides.slice(1).every((s) => s.options.scene === undefined)).toBe(true)
    expect(checkShape(shape)).toBe(true)
    // 맞는 장면을 모두 입힌 발표도 꼴이 맞고, 장마다 고른 장면 그대로 보인다
    const scened = withScenes(createSampleDeck(), true)
    const shown = toShape(scened)
    expect(shown.slides.map((s) => s.options.scene ?? null)).toEqual(scened.slides.map((s) => sceneOf(s)))
    expect(shown.slides.filter((s) => s.options.scene).length).toBeGreaterThan(3)
    expect(checkShape(shown)).toBe(true)
    // 꼴 확인: 모르는 장면, 그 장에 맞지 않는 장면은 받지 않는다. 장면이 없는 예전 모양 파일은 받는다
    const copy = () => structuredClone(shown)
    const at = shown.slides.findIndex((s) => s.options.scene)
    const unknown = copy()
    unknown.slides[at].options.scene = SECRET as never
    expect(checkShape(unknown)).toBe(false)
    const unfit = copy()
    unfit.slides[at].options.scene = SCENE_IDS.find((id) => !sceneFits(scened.slides[at], id))
    expect(checkShape(unfit)).toBe(false)
    const old = copy()
    for (const s of old.slides) delete s.options.scene
    expect(checkShape(old)).toBe(true)
  })

  it('Object.prototype의 이름을 레이아웃으로 써도 예외 없이 거른다', () => {
    // `in`으로 찾으면 constructor, toString도 레이아웃으로 알아서, 꼴 확인이 false 대신 예외를 던졌다
    const shape = toShape(createSampleDeck())
    for (const name of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      const copy = structuredClone(shape) as unknown as { slides: Record<string, unknown>[] }
      copy.slides[1].layout = name
      expect(() => checkShape(copy), name).not.toThrow()
      expect(checkShape(copy), name).toBe(false)
      const deck = createSampleDeck()
      deck.slides[1] = { ...deck.slides[1], layout: name as LayoutId }
      expect(() => toShape(deck), name).not.toThrow()
      expect(toShape(deck).slides).toHaveLength(deck.slides.length - 1)
    }
  })

  it('강조할 항목 번호는 제안과 모양이 같은 범위를 받는다', () => {
    const deck = createSampleDeck()
    const at = deck.slides.findIndex((s) => LAYOUTS[s.layout].highlight)
    const shape = toShape(deck)
    for (const n of [HIGHLIGHT_MIN - 1, HIGHLIGHT_MIN, 0, HIGHLIGHT_MAX, HIGHLIGHT_MAX + 1]) {
      const copy = structuredClone(shape)
      copy.slides[at].options.highlight = n
      const proposed = parseOp({ op: 'set_options', slide: shape.slides[at].id, highlight: n }) !== null
      expect(checkShape(copy), String(n)).toBe(proposed)
    }
    // 가져온 파일의 범위 밖 번호는 모양에 넣지 않는다. 넣으면 모양 전체가 꼴 확인에서 버려진다
    deck.slides[at] = { ...deck.slides[at], options: { ...deck.slides[at].options, highlight: 99 } }
    expect(toShape(deck).slides[at].options.highlight).toBeUndefined()
    expect(checkShape(toShape(deck))).toBe(true)
  })

  it('마지막 그물은 모르는 글자를 잡는다', () => {
    const shape = toShape(createSampleDeck())
    const words = ['format', 'version', 'deck', 'type', 'audience', 'duration', 'method', 'theme', 'accent', 'motion', 'font', 'size', 'footer', 'transition', 'tone', 'updatedAt', 'slides', 'id', 'layout', 'role', 'section', 'hidden', 'hiddenItems', 'fields', 'items', 'options', 'highlight', 'flip', 'contain', 'place', 'variant', 'base', 'empty', 'filled', 'long', 'html-maker/shape', 'blocks', 'x', 'y', 'w', 'h', 'look', 'effect', 'when', 'speed', 'from', 'order', 'link', 'linkBelow', 'scene', 'backdrop', 'strength']
    expect(onlyKnownStrings(shape, words)).toBe(true)
    expect(onlyKnownStrings(toShape(withScenes(createSampleDeck(), true)), words)).toBe(true)
    expect(onlyKnownStrings(toShape(secretDeck()), words)).toBe(true)
    expect(onlyKnownStrings({ ...shape, extra: SECRET }, [...words, 'extra'])).toBe(false)
    expect(onlyKnownStrings({ [SECRET]: 1 }, words)).toBe(false)
  })
})

describe('장 역할 이름 (저장한 발표, 모양 파일, AI 제안이 장을 부르는 말)', () => {
  // 장의 역할(slide.purpose)은 사람이 고치지 않는 정해진 말이라, 모양 파일의 role과 제안(add_slide의 role)이 장을 찾는 데 쓴다.
  // 이름을 바꾸면 예전에 만든 발표의 장이 역할을 잃고(모양 파일에 role: null), 예전 이름으로 온 제안은 unknown_role로 거절된다.
  // 일부러 바꿨으면 이 기록을 고치고(vitest -u), 예전 이름을 새 이름으로 읽는 길(deck/migrate.ts의 RENAMED_ROLES)을 더한다
  it('바뀌면 일부러 바꾼 것이다', () => {
    const roles = Object.fromEntries(Object.entries(BLUEPRINTS).map(([type, bp]) => [type, bp.recipes.map((r) => (r.section ? `${r.purpose} (${r.section})` : r.purpose))]))
    expect({ layouts: Object.values(LAYOUTS).map((l) => l.name), roles }).toMatchSnapshot()
  })
})

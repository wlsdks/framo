import { describe, expect, it } from 'vitest'
import { autoPlace, insertAt, makeBlock, tiles, withLink } from '../deck/blocks'
import { AUDIENCES, BLUEPRINTS, DECK_TYPES } from '../deck/blueprints'
import { createDeck, makeSlide } from '../deck/generate'
import { createSampleDeck } from '../deck/sample'
import { SCENE_IDS, sceneFits, sceneOf, withScenes } from '../deck/scenes'
import { LAYOUTS } from '../deck/layouts'
import type { Block, LayoutId, Slide } from '../deck/types'
import { parseOp } from './ops'
import { HIGHLIGHT_MAX, HIGHLIGHT_MIN } from './protocol'
import { SECRET, secretDeck } from './secretDeck'
import { checkShape, isPrivate, onlyKnownStrings, shapeBlockId, shapeSlideId, TEXT_STATES, toShape as shapeOf, type ShapeBlock, type ShapeDeck, type ShapeSlide } from './share'

/** 숨긴 장과 부품이 없는 발표의 모양: 장마다 레이아웃과 칸을 바로 읽는다 (숨긴 것은 share.test.ts의 'AI에게 숨기기'에서 본다) */
type OpenShape = Omit<ShapeDeck, 'slides'> & { slides: (Omit<ShapeSlide, 'blocks'> & { blocks?: ShapeBlock[] })[] }
const toShape = (...a: Parameters<typeof shapeOf>) => shapeOf(...a) as unknown as OpenShape

/** 모양 파일의 키와 정해진 값 (MCP 서버의 PROTOCOL_WORDS 가운데 모양에 나오는 것) */
const SHAPE_WORDS = ['format', 'version', 'deck', 'type', 'audience', 'duration', 'method', 'theme', 'accent', 'motion', 'font', 'size', 'footer', 'transition', 'tone', 'updatedAt', 'slides', 'id', 'layout', 'role', 'section', 'hidden', 'hiddenItems', 'fields', 'items', 'options', 'highlight', 'flip', 'contain', 'place', 'variant', 'base', 'filled', ...TEXT_STATES, 'html-maker/shape', 'blocks', 'x', 'y', 'w', 'h', 'look', 'effect', 'when', 'speed', 'from', 'order', 'link', 'linkBelow', 'scene', 'over', 'backdrop', 'strength']

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
    // 칸에 심은 비밀(기밀7731-bf, 10자)은 글자 수 구간으로만 보인다
    expect(message).toMatchObject({ look: 'plain', effect: 'auto', variant: 'base', fields: { text: '1-10' } })
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
    expect(shape.slides[1]).toMatchObject({ layout: 'summary', role: '한 장 요약', fields: { title: '21-40' } })
    expect(shape.slides[1].items).toHaveLength(4)
    expect(shape.slides.find((s) => s.layout === 'kpi')?.items[0]).toEqual({ value: '1-10', title: '11-20', body: '11-20' })
    // 비운 이미지 칸은 empty (이미지 칸은 있는지만 보인다)
    expect(shape.slides[0].fields.$logo).toBe('empty')
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
      fields: { label: '1-10', question: '1-10' },
      items: [{ title: '1-10', body: '1-10' }, { title: '1-10', body: '1-10' }],
    })
  })

  it('모든 발표 종류와 듣는 사람의 구성이 꼴 확인과 마지막 그물을 지난다', () => {
    const words = ['format', 'version', 'deck', 'type', 'audience', 'duration', 'method', 'theme', 'accent', 'motion', 'font', 'size', 'footer', 'transition', 'tone', 'updatedAt', 'slides', 'id', 'layout', 'role', 'section', 'hidden', 'hiddenItems', 'fields', 'items', 'options', 'highlight', 'flip', 'pane', 'contain', 'place', 'variant', 'base', 'filled', ...TEXT_STATES, 'html-maker/shape']
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
    const words = SHAPE_WORDS
    expect(onlyKnownStrings(shape, words)).toBe(true)
    expect(onlyKnownStrings(toShape(withScenes(createSampleDeck(), true)), words)).toBe(true)
    expect(onlyKnownStrings(toShape(secretDeck()), words)).toBe(true)
    const secret = secretDeck()
    expect(onlyKnownStrings(toShape(secret, { slides: new Set(secret.slides.map((x) => x.id)), blocks: new Set(secret.slides.flatMap((x) => (x.blocks ?? []).map((b) => b.id))) }), words)).toBe(true)
    expect(onlyKnownStrings({ ...shape, extra: SECRET }, [...words, 'extra'])).toBe(false)
    expect(onlyKnownStrings({ [SECRET]: 1 }, words)).toBe(false)
  })
})

describe('칸의 글 길이 (글자 수 구간)', () => {
  // 한 장 요약: 장의 결론(title)과 항목의 내용(body)은 여러 줄로 쓰는 칸, 항목의 이름(title)은 한 줄 칸
  const summaryWith = (title: string, name: string, body: string) => {
    const deck = createSampleDeck()
    const at = deck.slides.findIndex((s) => s.layout === 'summary')
    const s = deck.slides[at]
    deck.slides[at] = { ...s, fields: { ...s.fields, title }, items: s.items.map((it, i) => (i ? it : { ...it, title: name, body })) }
    return { deck, at }
  }
  const shown = (title: string, name = '', body = '') => {
    const { deck, at } = summaryWith(title, name, body)
    const s = toShape(deck).slides[at]
    return { title: s.fields.title, name: s.items[0].title, body: s.items[0].body }
  }

  it('글자 수는 구간으로만, 경계는 구간의 끝까지 그 구간이다', () => {
    const at = (n: number) => shown('가'.repeat(n)).title
    expect([0, 1, 10, 11, 20, 21, 40, 41, 80, 81, 140, 141, 280, 281, 5000].map(at)).toEqual([
      'empty', '1-10', '1-10', '11-20', '11-20', '21-40', '21-40', '41-80', '41-80', '81-140', '81-140', '141-280', '141-280', '281+', '281+',
    ])
    // 앞뒤 빈칸, 줄바꿈만 있는 칸은 빈칸. 이모지는 한 글자로 센다
    expect(shown('  \n \n ').title).toBe('empty')
    expect(shown('👍'.repeat(10)).title).toBe('1-10')
  })

  it('여러 줄로 쓰는 칸만 줄 수 구간이 붙고, 빈 줄은 세지 않는다', () => {
    const lines = (n: number) => Array.from({ length: n }, () => '가나다').join('\n')
    expect([1, 2, 3, 4, 5, 8, 9, 30].map((n) => shown(lines(n)).title)).toEqual([
      '1-10', '1-10, 2 lines', '1-10, 3-4 lines', '11-20, 3-4 lines', '11-20, 5-8 lines', '21-40, 5-8 lines', '21-40, 9+ lines', '81-140, 9+ lines',
    ])
    expect(shown('가나다\n\n\r\n   \n가나다').title).toBe('1-10, 2 lines')
    // 항목의 내용(여러 줄 칸)과 이름(한 줄 칸): 가져온 파일의 한 줄 칸에 줄바꿈이 있어도 줄 수는 붙지 않는다
    expect(shown('', lines(3), lines(3))).toMatchObject({ name: '1-10', body: '1-10, 3-4 lines' })
  })

  it('같은 구간의 다른 글은 모양이 같다: 정확한 글자 수와 글이 새지 않는다', () => {
    // 길이도 줄 수도 비밀과 함께 심는다. 구간 안에서 글과 길이가 달라도 모양은 한 글자도 다르지 않아야 한다
    // 결론 1233자, 이름 13자, 내용 3줄 24자 ↔ 결론 400자, 이름 20자, 내용 4줄 28자
    const a = summaryWith(`${SECRET}${'가'.repeat(1227)}`, `${SECRET}${'가'.repeat(7)}`, `${SECRET}-1\n${SECRET}-2\n${SECRET}-3`)
    const b = summaryWith('나'.repeat(400), '다'.repeat(20), Array.from({ length: 4 }, () => '라'.repeat(7)).join('\n'))
    // 발표마다 다른 해시 id와 고친 시각만 지우고 견준다
    const plain = (d: typeof a.deck) => JSON.stringify(toShape(d)).replace(/"[sdb][0-9a-f]{8}"/g, '"#"').replace(/"updatedAt":\d+/, '')
    expect(plain(a.deck)).toBe(plain(b.deck))
    expect(plain(a.deck)).not.toContain(SECRET)
    expect(plain(a.deck)).not.toContain('1233')
    const at = toShape(a.deck).slides[a.at]
    expect([at.fields.title, at.items[0]]).toEqual(['281+', { title: '11-20', body: '21-40, 3-4 lines' }])
  })

  it('칸의 꼴에 맞지 않는 상태는 받지 않는다', () => {
    const shape = toShape(createSampleDeck())
    const at = shape.slides.findIndex((s) => s.layout === 'summary')
    const cover = shape.slides.findIndex((s) => s.layout === 'cover')
    const bad = (fn: (s: { fields: Record<string, string>; items: Record<string, string>[] }[]) => void) => {
      const copy = structuredClone(shape) as unknown as { slides: { fields: Record<string, string>; items: Record<string, string>[] }[] }
      fn(copy.slides)
      return checkShape(copy)
    }
    expect(bad(() => {})).toBe(true)
    // 여러 줄 칸의 줄 수는 받는다
    expect(bad((s) => (s[at].fields.title = '81-140, 3-4 lines'))).toBe(true)
    expect(bad((s) => (s[at].items[0].body = '281+, 9+ lines'))).toBe(true)
    // 한 줄 칸의 줄 수, 글 칸의 filled, 이미지 칸의 글자 수, 예전 판의 long, 정확한 수, 모르는 구간
    expect(bad((s) => (s[at].items[0].title = '1-10, 2 lines'))).toBe(false)
    expect(bad((s) => (s[at].fields.title = 'filled'))).toBe(false)
    expect(bad((s) => (s[cover].fields.$logo = '281+'))).toBe(false)
    expect(bad((s) => (s[at].fields.title = 'long'))).toBe(false)
    expect(bad((s) => (s[at].fields.title = '37'))).toBe(false)
    expect(bad((s) => (s[at].fields.title = '1-5'))).toBe(false)
    expect(bad((s) => (s[at].fields.title = '81-140, 1 lines'))).toBe(false)
    expect(bad((s) => (s[at].fields.title = 37 as unknown as string))).toBe(false)
    expect(bad((s) => (s[cover].fields.$logo = 'filled'))).toBe(true)
  })

  it('편집기가 잰 넘침은 그 장과 부품에 참으로만 붙는다', () => {
    const deck = secretDeck()
    const compose = deck.slides.find((s) => s.layout === 'compose')!
    const message = compose.blocks!.find((b) => b.type === 'message')!
    const over = { slides: new Set([deck.slides[1].id, compose.id, SECRET]), blocks: new Set([message.id, SECRET]) }
    const shape = toShape(deck, over)
    expect(shape.slides.flatMap((s, i) => (s.over ? [i] : []))).toEqual([1, deck.slides.indexOf(compose)])
    const blocks = shape.slides.find((s) => s.layout === 'compose')!.blocks!
    expect(blocks.filter((b) => b.over).map((b) => b.type)).toEqual(['message'])
    expect(checkShape(shape)).toBe(true)
    expect(JSON.stringify(shape)).not.toContain(SECRET)
    // 넘침을 모르면(그리지 않는 곳) 붙지 않는다
    expect(JSON.stringify(toShape(deck))).not.toContain('"over"')
    // 참 말고는 받지 않는다
    for (const v of [false, 'yes', 1]) {
      const a = structuredClone(shape) as unknown as { slides: Record<string, unknown>[] }
      a.slides[1].over = v
      expect(checkShape(a), String(v)).toBe(false)
      const b = structuredClone(shape) as unknown as { slides: { layout: string; blocks?: Record<string, unknown>[] }[] }
      b.slides.find((s) => s.layout === 'compose')!.blocks![0].over = v
      expect(checkShape(b), String(v)).toBe(false)
    }
  })

  it('예전 판(2판)의 모양 파일은 받지 않는다', () => {
    // 2판은 칸이 empty, filled, long 셋이었다. 앱이 발표를 열면 3판으로 다시 쓴다
    const old = { ...toShape(createSampleDeck()), version: 2 }
    expect(checkShape(old)).toBe(false)
  })
})

describe('AI에게 숨기기', () => {
  // 숫자(n) 옆에 인용(d), 그 아래 장 너비의 글(t). 숫자에 비밀을 적고 AI에게 숨긴다
  const board = () => {
    const b = (type: Block['type'], id: string, fields: Record<string, string> = {}): Block => ({ ...makeBlock(type), id, fields })
    let blocks = insertAt(autoPlace([], b('number', 'n', { label: SECRET, value: `${SECRET}억 원`, note: SECRET.repeat(30) }))!, { at: 'n', side: 'right' }, b('quote', 'd', { quote: '인용할 말' }))!
    blocks = withLink(insertAt(blocks, { at: null, side: 'below' }, b('text', 't', { body: '가나다' }))!, { id: 'n', dir: 'h' }, 'arrow')
    return blocks
  }
  const deckWith = (options: Slide['options'], extra: Partial<Slide> = {}) => {
    const deck = createSampleDeck()
    const slide = { ...makeSlide('compose'), id: 'c1', blocks: board(), options: { order: ['t', 'n', 'd'], ...options }, ...extra }
    return { ...deck, slides: [...deck.slides, slide] }
  }

  it('숨긴 컴포넌트는 판의 자리만 보이고 종류, 칸, 바탕, 넘침, id, 나오는 차례는 보이지 않는다', () => {
    const deck = deckWith({ aiHiddenBlocks: ['n'] })
    const shape = shapeOf(deck, { slides: new Set(), blocks: new Set(['n', 'd']) })
    const slide = shape.slides.at(-1) as ShapeSlide
    const n = board().find((b) => b.id === 'n')!.at!
    expect(slide.blocks![0]).toEqual({ private: true, x: n.x, y: n.y, w: n.w, h: n.h })
    // 보이는 컴포넌트는 그대로 (숫자 옆의 이음표도 숫자의 것이라 보이지 않는다)
    expect(slide.blocks!.slice(1).map((b) => !isPrivate(b) && [b.type, b.over ?? false])).toEqual([['quote', true], ['text', false]])
    // 나오는 차례에서 숨긴 컴포넌트의 해시 id는 빠진다
    expect(slide.options.order).toEqual([shapeBlockId({ id: 't' }), shapeBlockId({ id: 'd' })])
    const text = JSON.stringify(slide)
    for (const word of [SECRET, 'number', shapeBlockId({ id: 'n' }), 'arrow', '281+']) expect(text).not.toContain(word)
    expect(checkShape(shape)).toBe(true)
    expect(onlyKnownStrings(shape, [...SHAPE_WORDS, 'private'])).toBe(true)
  })

  it('숨긴 컴포넌트 때문에만 맞는 장면은 보이지 않는다', () => {
    // 숫자 장면은 숫자 컴포넌트가 있어야 맞는다: 숫자를 숨기면 그 장면을 보이는 것이 숫자가 있다고 알리는 셈이다
    const open = shapeOf(deckWith({ scene: 'numbers' })).slides.at(-1) as ShapeSlide
    expect(open.options.scene).toBe('numbers')
    const shut = shapeOf(deckWith({ scene: 'numbers', aiHiddenBlocks: ['n'] }))
    expect((shut.slides.at(-1) as ShapeSlide).options.scene).toBeUndefined()
    expect(checkShape(shut)).toBe(true)
  })

  it('숨긴 슬라이드는 해시 id와 발표에서 뺐는지만 보인다', () => {
    const deck = deckWith({ aiHidden: true, aiHiddenBlocks: ['n'] }, { hidden: true, purpose: '한 장 요약', fields: { title: SECRET } })
    const shape = shapeOf(deck, { slides: new Set(['c1']), blocks: new Set(['n']) })
    expect(shape.slides.at(-1)).toEqual({ id: shapeSlideId({ id: 'c1' }), private: true, hidden: true })
    expect(JSON.stringify(shape.slides.at(-1))).not.toContain('compose')
    expect(checkShape(shape)).toBe(true)
    expect(onlyKnownStrings(shape, [...SHAPE_WORDS, 'private'])).toBe(true)
    // 숨긴 슬라이드도 차례의 자리는 그대로다 (다른 장을 그 뒤에 넣을 수 있게)
    expect(shape.slides).toHaveLength(deck.slides.length)
  })

  it('숨긴 것에 꼴 밖의 값이 붙으면 받지 않는다', () => {
    const shape = shapeOf(deckWith({ aiHiddenBlocks: ['n'] }))
    const at = shape.slides.length - 1
    const bad = (fn: (b: Record<string, unknown>, s: Record<string, unknown>) => void) => {
      const copy = structuredClone(shape) as unknown as { slides: (Record<string, unknown> & { blocks: Record<string, unknown>[] })[] }
      fn(copy.slides[at].blocks[0], copy.slides[0])
      return checkShape(copy)
    }
    expect(bad(() => {})).toBe(true)
    expect(bad((b) => (b.type = 'number'))).toBe(false)
    expect(bad((b) => (b.fields = {}))).toBe(false)
    expect(bad((b) => (b.id = 'b12345678'))).toBe(false)
    expect(bad((b) => (b.over = true))).toBe(false)
    expect(bad((b) => (b.private = false))).toBe(false)
    expect(bad((b) => (b.w = 13))).toBe(false)
    // 숨긴 컴포넌트도 판을 덮는다: 자리를 빼거나 겹치면 받지 않는다
    expect(bad((b) => (b.x = 6))).toBe(false)
    // 숨긴 슬라이드: 해시 id와 hidden 말고는 받지 않는다
    expect(bad((_, s) => ((s.private = true), delete s.layout))).toBe(false)
    expect(bad((_, s) => { for (const k of Object.keys(s)) if (k !== 'id') delete s[k]; Object.assign(s, { private: true, hidden: false }) })).toBe(true)
    expect(bad((_, s) => { for (const k of Object.keys(s)) if (k !== 'id') delete s[k]; Object.assign(s, { private: true, hidden: false, layout: 'cover' }) })).toBe(false)
    expect(bad((_, s) => { for (const k of Object.keys(s)) if (k !== 'id') delete s[k]; Object.assign(s, { private: true, hidden: SECRET }) })).toBe(false)
  })

  it('없는 컴포넌트의 id, 꼴이 틀린 값은 숨긴 것으로 치지 않는다 (가져온 파일)', () => {
    const shape = shapeOf(deckWith({ aiHiddenBlocks: [SECRET, 3, 'gone'] as unknown as string[], aiHidden: 'yes' as unknown as boolean }))
    const slide = shape.slides.at(-1) as ShapeSlide
    expect(slide.blocks!.every((b) => !isPrivate(b))).toBe(true)
    expect(JSON.stringify(shape)).not.toContain(SECRET)
    expect(checkShape(shape)).toBe(true)
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

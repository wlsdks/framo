import { describe, expect, it } from 'vitest'
import { autoArranged, autoPlace, BLOCKS, boardAreaH, boardSig, canCompose, insertAt, makeBlock, resizeBlock, settleDeck, tiles } from '../deck/blocks'
import { makeSlide } from '../deck/generate'
import { createSampleDeck, layoutSampleDeck } from '../deck/sample'
import type { Block, Deck, Item, LayoutId, Slide } from '../deck/types'
import { applyOps, parseOp, parseRequest, slideEmpty, type Op } from './ops'
import { REQUEST_FORMAT, REQUEST_VERSION } from './protocol'
import { checkShape, shapeBlockId, shapeSlideId, toShape as shapeOf, type ShapeBlock, type ShapeDeck, type ShapeSlide } from './share'

/** 숨긴 장과 부품이 없는 발표의 모양: 장마다 레이아웃과 칸을 바로 읽는다 (숨긴 것은 share.test.ts의 'AI에게 숨기기'에서 본다) */
type OpenShape = Omit<ShapeDeck, 'slides'> & { slides: (Omit<ShapeSlide, 'blocks'> & { blocks?: ShapeBlock[] })[] }
const toShape = (...a: Parameters<typeof shapeOf>) => shapeOf(...a) as unknown as OpenShape

// 장의 차례와 레이아웃(한 장 요약, 핵심 숫자 …)에 기대는 시험이라 예시 발표를 레이아웃 장으로 짠 판을 쓴다
const deck = layoutSampleDeck()
const shape = toShape(deck)
const sid = (i: number) => shape.slides[i].id
const run = (...ops: Op[]) => applyOps(deck, ops)

/** 사람이 적은 글만 모은다. 적용 전후로 같아야 한다(지운 빈 장 제외). */
function writtenText(d: typeof deck) {
  return d.slides
    .filter((s) => !slideEmpty(s))
    .map((s) => JSON.stringify([s.id, s.fields, s.items.filter((it) => it.title || it.body || it.value || it.meta || it.image).map((it) => [it.id, it.title, it.body, it.value, it.meta, it.image]), s.notes]))
    .sort()
}

describe('제안 읽기', () => {
  it('칸의 글을 쓰는 동작은 없다', () => {
    expect(parseOp({ op: 'set_field', slide: sid(0), key: 'title', text: 'x' })).toBeNull()
    expect(parseOp({ op: 'set_item', slide: sid(0), item: 0, key: 'body', text: 'x' })).toBeNull()
    expect(parseOp({ op: 'set_title', text: 'x' })).toBeNull()
  })

  it('모르는 키가 섞이면 받지 않는다', () => {
    expect(parseOp({ op: 'set_layout', slide: sid(1), layout: 'points', fields: { title: 'x' } })).toBeNull()
    expect(parseOp({ op: 'add_slide', after: null, layout: 'points', fields: { title: 'x' } })).toBeNull()
    expect(parseOp({ op: 'set_layout', slide: sid(1), layout: 'points' })).not.toBeNull()
  })

  it('안내 글은 짧은 한 줄만, 제어 문자는 받지 않는다', () => {
    expect(parseOp({ op: 'set_hint', slide: sid(1), field: 'title', text: 'a'.repeat(81) })).toBeNull()
    expect(parseOp({ op: 'set_hint', slide: sid(1), field: 'title', text: '한 줄\n두 줄' })).toBeNull()
    expect(parseOp({ op: 'set_hint', slide: sid(1), field: 'title', text: '방향‮바꾸기' })).toBeNull()
    expect(parseOp({ op: 'set_hint', slide: sid(1), field: 'title', text: '결론을 한 줄로' })).not.toBeNull()
  })

  it('요청 파일은 통째로 확인한다', () => {
    const base = { format: REQUEST_FORMAT, version: REQUEST_VERSION, id: 'r0123456789ab', deck: shape.deck, createdAt: 1, note: '', ops: [{ op: 'set_hidden', slide: sid(2), hidden: true }] }
    expect(parseRequest(base)).not.toBeNull()
    expect(parseRequest({ ...base, ops: [...base.ops, { op: 'nope' }] })).toBeNull()
    expect(parseRequest({ ...base, ops: [] })).toBeNull()
    expect(parseRequest({ ...base, extra: 1 })).toBeNull()
    expect(parseRequest({ ...base, id: '../../x' })).toBeNull()
    // 판 전(줄로 가리키던 때)의 요청은 받지 않는다: 같은 말이 다른 자리를 가리킨다
    expect(parseRequest({ ...base, version: 1 })).toBeNull()
  })
})

describe('제안 적용', () => {
  it('머리와 아래 표시를 감추거나 다시 보여도 사람이 쓴 글은 그대로 남는다', () => {
    const { deck: next, results } = run({ op: 'set_options', slide: sid(1), hideHead: true, hideFoot: true })
    expect(results[0].ok).toBe(true)
    expect(writtenText(next)).toEqual(writtenText(deck))
    expect(checkShape(toShape(next))).toBe(true)
    expect(toShape(next).slides[1].options).toMatchObject({ hideHead: true, hideFoot: true })
    const back = applyOps(next, [{ op: 'set_options', slide: sid(1), hideHead: false, hideFoot: false }]).deck
    expect(writtenText(back)).toEqual(writtenText(deck))
    expect(back.slides[1].options.hideHead).toBeUndefined()
    expect(back.slides[1].options.hideFoot).toBeUndefined()
    expect(parseOp({ op: 'set_options', slide: sid(1), hideHead: '비밀' })).toBeNull()
  })
  it('레이아웃, 순서, 숨김, 테마를 바꿔도 적은 글은 그대로다', () => {
    const kpi = shape.slides.findIndex((s) => s.layout === 'kpi')
    const { deck: next, results } = run(
      { op: 'set_layout', slide: sid(kpi), layout: 'bars' },
      { op: 'move_slide', slide: sid(3), after: sid(6) },
      { op: 'set_hidden', slide: sid(2), hidden: true },
      { op: 'set_theme', theme: 'navy', accent: '#FF6600' },
      { op: 'set_hint', slide: sid(1), field: 'body', item: 0, text: '배경을 숫자 하나로' },
      { op: 'set_guide', slide: sid(1), text: '결론부터 쓰세요' },
    )
    expect(results.every((r) => r.ok)).toBe(true)
    expect(writtenText(next)).toEqual(writtenText(deck))
    expect(next.theme).toEqual({ id: 'navy', accent: '#ff6600' })
    expect(next.slides.find((s) => shapeSlideId(s) === sid(kpi))?.layout).toBe('bars')
    expect(next.slides[1].hints['items.0.body']).toBe('배경을 숫자 하나로')
  })

  it('내용이 있는 장과 항목은 지우지 못한다', () => {
    const { deck: next, results } = run({ op: 'remove_slide', slide: sid(1) }, { op: 'set_item_count', slide: sid(1), count: 2 })
    expect(results.map((r) => r.code)).toEqual(['has_content', 'has_content'])
    expect(next.slides).toEqual(deck.slides)
  })

  it('새로 넣은 빈 장은 지울 수 있고, 같은 제안 안에서 이름으로 가리킬 수 있다', () => {
    const { deck: next, results } = run(
      { op: 'add_slide', after: sid(1), role: '위험과 대응', as: 'n1' },
      { op: 'set_hint', slide: 'n1', field: 'title', text: '가장 큰 위험 하나' },
      { op: 'set_item_count', slide: 'n1', count: 4 },
    )
    expect(results.every((r) => r.ok)).toBe(true)
    const added = next.slides[2]
    expect(added.layout).toBe('compare')
    expect(added.purpose).toBe('위험과 대응')
    expect(added.fields.leftTitle).toBe('예상 위험')
    expect(added.items).toHaveLength(4)
    expect(added.hints.title).toBe('가장 큰 위험 하나')
    const removed = applyOps(next, [{ op: 'remove_slide', slide: shapeSlideId(added) }])
    expect(removed.results[0].ok).toBe(true)
    expect(removed.deck.slides).toHaveLength(deck.slides.length)
  })

  it('구성의 그림 장을 역할로 넣으면 빈 컴포넌트와 안내가 같이 들어오고, 그 컴포넌트는 빈 것으로 지울 수 있다', () => {
    // 개선 제안 구성의 '바뀌는 모습'은 바뀌기 컴포넌트 하나를 넣은 부품 장이다. 미리 넣는 이름표(지금, 개선 후)는 사람이 적은 글이 아니다
    const { deck: next, results } = run({ op: 'add_slide', after: sid(1), role: '바뀌는 모습', as: 'n1' })
    expect(results.every((r) => r.ok)).toBe(true)
    const added = next.slides[2]
    expect(added.layout).toBe('compose')
    expect(added.blocks!.map((b) => b.type)).toEqual(['wipe'])
    expect(added.blocks![0].fields).toEqual({ from: '지금', to: '개선 후' })
    expect(added.blocks![0].items.every((it) => !it.title && !it.body)).toBe(true)
    expect(added.blocks![0].hints?.['items.0.title']).toBeTruthy()
    const shaped = toShape(next).slides[2]
    const cleared = applyOps(next, [
      { op: 'remove_block', slide: shaped.id, block: shaped.blocks![0].id! },
      { op: 'remove_slide', slide: shaped.id },
    ])
    expect(cleared.results.map((r) => r.code)).toEqual(['applied', 'applied'])
    expect(cleared.deck.slides).toHaveLength(deck.slides.length)
  })

  it('맞지 않는 옵션은 건너뛴다', () => {
    const { results } = run({ op: 'set_options', slide: sid(0), highlight: 1 }, { op: 'set_options', slide: 's00000000', flip: true })
    expect(results.map((r) => r.code)).toEqual(['not_for_layout', 'no_slide'])
  })

  it('장면은 목록의 id로만, 그 장에 맞을 때만 고르고, 글은 그대로다', () => {
    const kpi = shape.slides.findIndex((s) => s.layout === 'kpi')
    const { deck: next, results } = run(
      { op: 'set_options', slide: sid(kpi), scene: 'numbers' },
      // 핵심 숫자 장에 첫 장면은 맞지 않는다
      { op: 'set_options', slide: sid(0), scene: 'numbers' },
      { op: 'set_options', slide: sid(0), scene: 'opening' },
      // 이미 그 장면이면 바뀌는 것으로 세지 않는다
      { op: 'set_options', slide: sid(kpi), scene: 'numbers' },
    )
    expect(results.map((r) => r.code)).toEqual(['applied', 'scene_unfit', 'applied', 'no_change'])
    expect([next.slides[kpi].options.scene, next.slides[0].options.scene]).toEqual(['numbers', 'opening'])
    expect(toShape(next).slides[kpi].options.scene).toBe('numbers')
    expect(checkShape(toShape(next))).toBe(true)
    expect(writtenText(next)).toEqual(writtenText(deck))
    // 맞지 않아 건너뛴 op는 같이 적은 다른 값도 바꾸지 않는다
    expect(applyOps(deck, [{ op: 'set_options', slide: sid(kpi), scene: 'compare', tone: 'invert' }]).deck.slides[kpi].options.tone).toBeUndefined()
    // null이면 장면을 끈다
    const off = applyOps(next, [{ op: 'set_options', slide: sid(kpi), scene: null }])
    expect(off.results[0].code).toBe('applied')
    expect(off.deck.slides[kpi].options.scene).toBeUndefined()
    // 같은 제안에서 레이아웃을 바꾸면 바꾼 장으로 맞는지 본다
    const relaid = run({ op: 'set_layout', slide: sid(kpi), layout: 'compare' }, { op: 'set_options', slide: sid(kpi), scene: 'compare' })
    expect(relaid.results.map((r) => r.code)).toEqual(['applied', 'applied'])
    // 모르는 장면, 글자, 숫자는 꼴부터 틀린 것
    for (const scene of ['film', '기밀', 3, true, {}]) expect(parseOp({ op: 'set_options', slide: sid(kpi), scene }), String(scene)).toBeNull()
    expect(parseOp({ op: 'set_options', slide: sid(kpi), scene: null })).not.toBeNull()
  })

  it('제목 자리는 표지와 섹션에서만, 정해진 세 자리로만 옮긴다', () => {
    const body = shape.slides.findIndex((s) => s.layout === 'kpi')
    expect(shape.slides[0].options.place).toBe('bottom')
    expect(shape.slides[body].options.place).toBeUndefined()
    const { deck: next, results } = run(
      { op: 'set_options', slide: sid(0), place: 'top' },
      { op: 'set_options', slide: sid(body), place: 'top' },
    )
    expect(results.map((r) => r.code)).toEqual(['applied', 'not_for_layout'])
    expect(next.slides[0].options.place).toBe('top')
    expect(toShape(next).slides[0].options.place).toBe('top')
    expect(checkShape(toShape(next))).toBe(true)
    expect(writtenText(next)).toEqual(writtenText(deck))
    // 기본 자리로 돌리면 값을 지운다
    expect(applyOps(next, [{ op: 'set_options', slide: sid(0), place: null }]).deck.slides[0].options.place).toBeUndefined()
    expect(applyOps(next, [{ op: 'set_options', slide: sid(0), place: 'bottom' }]).deck.slides[0].options.place).toBeUndefined()
    expect(parseOp({ op: 'set_options', slide: sid(0), place: 'left' })).toBeNull()
  })

  it('장마다 바탕과 움직임, 발표 전체의 글꼴과 전환을 정해진 값으로만 바꾼다', () => {
    const body = shape.slides.findIndex((s) => s.layout === 'kpi')
    const { deck: next, results } = run(
      { op: 'set_options', slide: sid(body), tone: 'invert', motion: 'lively' },
      { op: 'set_options', slide: sid(0), tone: 'accent' },
      { op: 'set_theme', font: 'serif', size: 'large', footer: 'page', transition: 'zoom' },
      { op: 'set_theme', font: 'serif', size: 'large' },
    )
    expect(results.map((r) => r.code)).toEqual(['applied', 'not_for_layout', 'applied', 'no_change'])
    expect(next.slides[body].options).toMatchObject({ tone: 'invert', motion: 'lively' })
    expect(next.theme).toMatchObject({ font: 'serif', size: 'large', footer: 'page', transition: 'zoom' })
    expect(writtenText(next)).toEqual(writtenText(deck))

    const back = applyOps(next, [{ op: 'set_options', slide: sid(body), tone: 'base', motion: null }]).deck
    expect(back.slides[body].options.tone).toBeUndefined()
    expect(back.slides[body].options.motion).toBeUndefined()

    expect(parseOp({ op: 'set_options', slide: sid(body), tone: 'neon' })).toBeNull()
    expect(parseOp({ op: 'set_theme', font: 'Comic Sans' })).toBeNull()
    // 글꼴 짝은 카탈로그에 있는 것 모두
    for (const font of ['sans', 'suit', 'serif', 'myeongjo']) {
      const op = parseOp({ op: 'set_theme', font })
      expect(op, font).not.toBeNull()
      expect(applyOps(deck, [op!]).deck.theme.font).toBe(font)
    }
    expect(parseOp({ op: 'set_theme', transition: 'spin' })).toBeNull()
    // 사람이 고른 이 PC 글꼴이 있어도 글꼴 제안을 적용하면 그 글꼴로 보인다 (남겨 두면 앞에 서서 바뀐 것이 보이지 않았다)
    const mine = { ...deck, theme: { ...deck.theme, localFont: '회사 고딕' } }
    expect(applyOps(mine, [parseOp({ op: 'set_theme', font: 'suit' })!]).deck.theme).toMatchObject({ font: 'suit' })
    expect(applyOps(mine, [parseOp({ op: 'set_theme', font: 'suit' })!]).deck.theme.localFont).toBeUndefined()
    expect(applyOps(mine, [parseOp({ op: 'set_theme', size: 'large' })!]).deck.theme.localFont).toBe('회사 고딕')
  })

  it('두 판으로 나뉜 장은 옆 판의 자리와 너비를 정해진 값으로만 바꾼다. 글은 그대로', () => {
    const cover = shape.slides.findIndex((s) => s.layout === 'cover')
    const closing = shape.slides.findIndex((s) => s.layout === 'closing')
    const kpi = shape.slides.findIndex((s) => s.layout === 'kpi')
    const { deck: next, results } = run(
      { op: 'set_options', slide: sid(cover), flip: true, pane: 5 },
      { op: 'set_options', slide: sid(closing), pane: 9 },
      { op: 'set_options', slide: sid(kpi), flip: true },
    )
    expect(results.map((r) => r.code)).toEqual(['applied', 'out_of_range', 'not_for_layout'])
    expect(next.slides[cover].options).toMatchObject({ flip: true, pane: 5 })
    expect(writtenText(next)).toEqual(writtenText(deck))
    // 모양에 옆 판의 자리와 너비가 숫자와 참거짓으로만 실린다
    const s = toShape(next).slides[cover]
    expect(s.options).toMatchObject({ flip: true, pane: 5 })
    expect(checkShape(toShape(next))).toBe(true)
    // 기본 너비로 되돌리면 값이 남지 않는다
    const back = applyOps(next, [{ op: 'set_options', slide: sid(cover), pane: null, flip: false }]).deck
    expect(back.slides[cover].options.pane).toBeUndefined()
    expect(back.slides[cover].options.flip).toBeUndefined()
    // 아래 띠 모양의 표지는 판이 아래에 있어서 좌우와 너비가 없다
    const band = applyOps(deck, [{ op: 'set_layout', slide: sid(cover), layout: 'cover', variant: 'band' }]).deck
    expect(applyOps(band, [{ op: 'set_options', slide: sid(cover), flip: true }]).results[0].code).toBe('not_for_layout')
    expect(parseOp({ op: 'set_options', slide: sid(cover), pane: 1.5 })).toBeNull()
    expect(parseOp({ op: 'set_options', slide: sid(cover), pane: '4' })).toBeNull()
  })
})

describe('부품 장', () => {
  const block = (id: string, fields: Record<string, string> = {}, at = { x: 0, y: 0, w: 12, h: 12 }): Block => ({ id, type: 'text', fields, items: [], at })
  const withCompose = (fields: Record<string, string>) => {
    const d = createSampleDeck()
    const slide = { ...d.slides[1], id: 'compose-1', layout: 'compose' as const, fields: {}, items: [], notes: '', blocks: [block('b', fields)] }
    return { ...d, slides: [...d.slides, slide] }
  }

  /** 발표의 모든 글 (장의 칸과 항목, 부품의 칸과 항목, 노트). 모양만 바꾸는 제안 전후로 같아야 한다 */
  function allText(d: Deck): string[] {
    const out: string[] = []
    const keys = ['title', 'body', 'value', 'meta', 'image'] as const
    const take = (fields: Record<string, string>, items: Item[]) => {
      for (const v of Object.values(fields)) if (v.trim()) out.push(v)
      for (const it of items) for (const k of keys) if (it[k]?.trim()) out.push(it[k]!)
    }
    for (const s of d.slides) {
      take(s.fields, s.items)
      for (const b of s.blocks ?? []) take(b.fields, b.items)
      if (s.notes.trim()) out.push(s.notes)
    }
    return out.sort()
  }

  // 예시 발표에서 항목이 있고 부품 장으로 바꿀 수 있는 첫 장을 부품 장으로 바꾼 것
  const at = deck.slides.findIndex((s) => canCompose(s.layout) && s.layout !== 'statement' && s.layout !== 'imageText' && s.layout !== 'case' && s.items.length > 0)
  const composed = applyOps(deck, [{ op: 'set_layout', slide: sid(at), layout: 'compose' }]).deck
  const cshape = () => toShape(composed).slides[at]
  /** 판의 자리 (모양 파일의 id로) */
  const areaIn = (d: Deck, id: string) => {
    const sh = toShape(d).slides[at].blocks!.find((b) => b.id === id)!
    return { x: sh.x, y: sh.y, w: sh.w, h: sh.h }
  }
  const boardOf = (d: Deck, i = at) => d.slides[i].blocks ?? []

  it('장을 부품 장으로 바꿔도 글은 하나도 잃지 않고, 부품에 해시 id가 붙는다', () => {
    const { deck: next, results } = applyOps(deck, [{ op: 'set_layout', slide: sid(at), layout: 'compose' }])
    expect(results[0]).toEqual({ ok: true, code: 'applied' })
    expect(next.slides[at].layout).toBe('compose')
    expect(allText(next)).toEqual(allText(deck))
    const ids = cshape().blocks!.map((b) => b.id)
    expect(ids.every((id) => /^b[0-9a-f]{8}$/.test(id!))).toBe(true)
    expect(tiles(boardOf(next))).toBe(true)
    expect(checkShape(toShape(next))).toBe(true)
  })

  it('예전에 부품 장이었던 장을 다시 부품 장으로 바꾸면 남겨 둔 판을 되살린다 (덮어쓰면 그 안의 글이 지워진다)', () => {
    // 편집기에서 부품 둘인 부품 장을 다른 레이아웃으로 바꾸면 판은 장에 남겨 둔다
    const kept = [block('b1', { text: '남겨 둔 판의 글' }, { x: 0, y: 0, w: 6, h: 12 }), block('b2', { text: '두 번째 부품의 글' }, { x: 6, y: 0, w: 6, h: 12 })]
    const withKept = { ...deck, slides: deck.slides.map((s, i) => (i === at ? { ...s, blocks: kept } : s)) }
    const { deck: next, results } = applyOps(withKept, [{ op: 'set_layout', slide: sid(at), layout: 'compose' }])
    expect(results[0]).toEqual({ ok: true, code: 'applied' })
    expect(next.slides[at].layout).toBe('compose')
    expect(allText(next)).toEqual(allText(withKept))
  })

  it('표지와 단락 장은 부품 장으로 바꾸지 않는다', () => {
    const cover = deck.slides.findIndex((s) => s.layout === 'cover')
    expect(applyOps(deck, [{ op: 'set_layout', slide: sid(cover), layout: 'compose' }]).results[0]).toEqual({ ok: false, code: 'not_for_layout' })
  })

  it('그 레이아웃의 부품 하나뿐인 부품 장만 다시 그 레이아웃으로 되돌린다', () => {
    const layout = deck.slides[at].layout
    const back = applyOps(composed, [{ op: 'set_layout', slide: cshape().id, layout }])
    expect(back.results[0]).toEqual({ ok: true, code: 'applied' })
    expect(back.deck.slides[at].layout).toBe(layout)
    expect(allText(back.deck)).toEqual(allText(deck))
    // 부품이 더 있으면 되돌리면서 그 부품을 버리게 되므로 하지 않는다
    const more = applyOps(composed, [{ op: 'add_block', slide: cshape().id, type: 'callout', edge: 'bottom' }]).deck
    expect(applyOps(more, [{ op: 'set_layout', slide: cshape().id, layout }]).results[0]).toEqual({ ok: false, code: 'not_for_layout' })
  })

  it('어느 레이아웃을 거쳐 부품 장으로 바꿨다가 되돌려도 가려 둔 글까지 하나도 잃지 않는다', () => {
    // 요약 → 핵심 한 줄 → 부품 장: 핵심 한 줄이 가려 둔 요약의 항목을 부품 장으로 옮기지 않고 버렸다
    for (let i = 0; i < deck.slides.length; i++) {
      for (const via of ['statement', 'imageText', 'case', 'closing', 'table'] as const) {
        let d = deck
        for (const layout of [via, 'compose', deck.slides[i].layout] as LayoutId[]) d = applyOps(d, [{ op: 'set_layout', slide: sid(i), layout }]).deck
        expect(allText(d), `${deck.slides[i].layout} → ${via} → 부품 장 → ${deck.slides[i].layout}`).toEqual(allText(deck))
      }
    }
  })

  it('빈 부품을 넣고 같은 제안 안에서 이름으로 가리켜 모양, 크기, 자리를 바꾼다. 글은 그대로', () => {
    const sh = cshape()
    const { deck: next, results } = applyOps(composed, [
      { op: 'add_block', slide: sh.id, type: 'number', edge: 'bottom', as: 'p1' },
      { op: 'add_block', slide: sh.id, type: 'callout', beside: 'p1', side: 'after', as: 'p2' },
      { op: 'set_size', slide: sh.id, block: 'p1', w: 5 },
      { op: 'set_block', slide: sh.id, block: 'p2', look: 'card', effect: 'rise' },
      { op: 'move_block', slide: sh.id, block: 'p2', beside: 'p1', side: 'before' },
      // 이미 그 자리면 바꾸지 않는다
      { op: 'move_block', slide: sh.id, block: 'p2', beside: 'p1', side: 'before' },
    ])
    expect(results.map((r) => r.code)).toEqual(['applied', 'applied', 'applied', 'applied', 'applied', 'no_change'])
    const bs = boardOf(next)
    expect(tiles(bs)).toBe(true)
    const [num, call] = ['number', 'callout'].map((t) => bs.find((b) => b.type === t)!)
    // 아래 묶음: 강조 상자가 왼쪽, 숫자가 오른쪽 (옮긴 부품은 새 자리의 규칙대로 크기를 다시 받는다)
    expect(call.at!.x + call.at!.w).toBe(num.at!.x)
    expect(call.at!.y).toBe(num.at!.y)
    expect(call).toMatchObject({ look: 'card', effect: 'rise', fields: {} })
    expect(allText(next)).toEqual(allText(composed))
    // 처음 있던 부품(글이 든 것)도 옮길 수 있고, 글은 부품과 함께 간다
    const first = sh.blocks![0].id!
    const moved = applyOps(next, [{ op: 'move_block', slide: sh.id, block: first, edge: 'bottom' }])
    expect(moved.results[0]).toEqual({ ok: true, code: 'applied' })
    const firstAt = areaIn(moved.deck, first)
    expect([firstAt.w, firstAt.y + firstAt.h]).toEqual([12, 12])
    expect(allText(moved.deck)).toEqual(allText(composed))
  })

  /** 새 부품 장에 숫자(왼쪽)와 강조 상자(오른쪽) */
  const pair = (...more: Op[]) =>
    applyOps(deck, [
      { op: 'add_slide', after: sid(0), layout: 'compose', as: 'n1' },
      { op: 'add_block', slide: 'n1', type: 'number', as: 'p1' },
      { op: 'add_block', slide: 'n1', type: 'callout', beside: 'p1', side: 'after', as: 'p2' },
      ...more,
    ])

  it('두 부품의 자리와 크기를 맞바꾼다', () => {
    const { deck: next, results } = pair({ op: 'set_size', slide: 'n1', block: 'p1', w: 8 }, { op: 'move_block', slide: 'n1', block: 'p1', swap: 'p2' })
    expect(results.map((r) => r.code)).toEqual(['applied', 'applied', 'applied', 'applied', 'applied'])
    const bs = boardOf(next, 1)
    expect(tiles(bs)).toBe(true)
    const [n, c] = ['number', 'callout'].map((t) => bs.find((b) => b.type === t)!.at!)
    expect([c.x, c.w, n.x, n.w]).toEqual([0, 8, 8, 4])
    // 자리와 맞바꾸기를 같이 주거나, 자기 자신과 맞바꾸면 받지 않는다
    const id = toShape(next).slides[1].blocks![0].id!
    expect(parseOp({ op: 'move_block', slide: sid(1), block: id, swap: 'p2', edge: 'top' })).toBeNull()
    expect(parseOp({ op: 'move_block', slide: sid(1), block: id, swap: id })).toBeNull()
  })

  it('맨 위, 맨 아래에 넣으면 장 너비로 들어간다', () => {
    const sh = cshape()
    const { deck: next, results } = applyOps(composed, [{ op: 'add_block', slide: sh.id, type: 'message', edge: 'top', as: 'm' }])
    expect(results[0].ok).toBe(true)
    const m = boardOf(next).find((b) => b.type === 'message')!.at!
    expect([m.x, m.y, m.w]).toEqual([0, 0, 12])
  })

  it('크기는 판의 칸 수로만, 이웃이나 그 부품이 잘리는 크기는 건너뛴다', () => {
    const { deck: next, results } = pair(
      { op: 'set_size', slide: 'n1', block: 'p1', w: 8 },
      { op: 'set_size', slide: 'n1', block: 'p1', w: 8 },
      { op: 'set_size', slide: 'n1', block: 'p1', w: 1 },
    )
    expect(results.slice(3).map((r) => r.code)).toEqual(['applied', 'no_change', 'no_room'])
    expect(boardOf(next, 1).map((b) => b.at!.w)).toEqual([8, 4])
    const id = toShape(next).slides[1].blocks![0].id!
    expect(parseOp({ op: 'set_size', slide: sid(1), block: id, w: 13 })).toBeNull()
    expect(parseOp({ op: 'set_size', slide: sid(1), block: id, w: 0 })).toBeNull()
    expect(parseOp({ op: 'set_size', slide: sid(1), block: id, w: 2.5 })).toBeNull()
    expect(parseOp({ op: 'set_size', slide: sid(1), block: id })).toBeNull()
  })

  it('이음표를 부품의 오른쪽 선과 아래 선에 끼우고 바꾸고 뺀다. 뜻이 서지 않는 짝은 잇지 않는다. 글은 그대로', () => {
    const { deck: next, results } = applyOps(deck, [
      { op: 'add_slide', after: sid(0), layout: 'compose', as: 'n1' },
      { op: 'add_block', slide: 'n1', type: 'number', as: 'p1' },
      { op: 'add_block', slide: 'n1', type: 'number', beside: 'p1', side: 'after', as: 'p2' },
      { op: 'add_block', slide: 'n1', type: 'message', edge: 'bottom', as: 'p3' },
      { op: 'set_link', slide: 'n1', block: 'p1', side: 'right', link: 'plus' },
      { op: 'set_link', slide: 'n1', block: 'p1', side: 'right', link: 'plus' },
      { op: 'set_link', slide: 'n1', block: 'p1', side: 'below', link: 'arrow' },
      // 숫자와 결론 한마디는 견줄 수 없다 (견주기는 같은 컴포넌트끼리)
      { op: 'set_link', slide: 'n1', block: 'p2', side: 'below', link: 'versus' },
      // 판의 오른쪽 끝, 맨 아래에는 설 데가 없다
      { op: 'set_link', slide: 'n1', block: 'p2', side: 'right', link: 'plus' },
      { op: 'set_link', slide: 'n1', block: 'p3', side: 'below', link: 'plus' },
    ])
    expect(results.map((r) => r.code)).toEqual(['applied', 'applied', 'applied', 'applied', 'applied', 'no_change', 'applied', 'link_clash', 'out_of_range', 'out_of_range'])
    const bs = boardOf(next, 1)
    const p1 = bs.find((b) => b.type === 'number' && b.at!.x === 0)!
    expect([p1.link, p1.linkBelow]).toEqual(['plus', 'arrow'])
    const shaped = toShape(next).slides[1]
    const sp1 = shaped.blocks!.find((b) => b.type === 'number' && b.x === 0)!
    expect([sp1.link, sp1.linkBelow]).toEqual(['plus', 'arrow'])
    expect(checkShape(toShape(next))).toBe(true)
    expect(allText(next)).toEqual(allText(deck))
    const off = applyOps(next, [{ op: 'set_link', slide: shaped.id, block: sp1.id!, side: 'right', link: null }])
    expect(off.results[0]).toEqual({ ok: true, code: 'applied' })
    expect(boardOf(off.deck, 1).find((b) => b.id === p1.id)).not.toHaveProperty('link')
    // 오른쪽 부품을 빼면 설 데가 없어진 이음표도 빠진다
    const p2 = shaped.blocks!.find((b) => b.type === 'number' && b.x > 0)!.id!
    const gone = applyOps(next, [{ op: 'remove_block', slide: shaped.id, block: p2 }])
    expect(gone.results[0]).toEqual({ ok: true, code: 'applied' })
    expect(boardOf(gone.deck, 1).find((b) => b.id === p1.id)).not.toHaveProperty('link')
    // 카탈로그에 없는 이음표, 모르는 자리는 받지 않는다
    expect(parseOp({ op: 'set_link', slide: shaped.id, block: sp1.id!, side: 'right', link: 'spiral' })).toBeNull()
    expect(parseOp({ op: 'set_link', slide: shaped.id, block: sp1.id!, side: 'left', link: 'arrow' })).toBeNull()
    expect(parseOp({ op: 'set_link', slide: shaped.id, block: sp1.id!, side: 'right', link: 'arrow', text: 'x' })).toBeNull()
  })

  it('빈 부품만 빼고, 글이 있는 부품은 빼지 않는다', () => {
    const sh = cshape()
    const { deck: next, results } = applyOps(composed, [
      { op: 'add_block', slide: sh.id, type: 'number', edge: 'bottom', as: 'p1' },
      { op: 'remove_block', slide: sh.id, block: 'p1' },
      { op: 'remove_block', slide: sh.id, block: sh.blocks![0].id! },
    ])
    expect(results.map((r) => r.code)).toEqual(['applied', 'applied', 'has_content'])
    expect(boardOf(next)).toHaveLength(boardOf(composed).length)
    expect(tiles(boardOf(next))).toBe(true)
  })

  it('항목 수는 정한 범위에서, 줄일 때는 끝의 빈 항목만', () => {
    const sh = cshape()
    const b = boardOf(composed)[0]
    const n = b.items.length
    const { results } = applyOps(composed, [
      { op: 'set_block', slide: sh.id, block: sh.blocks![0].id!, count: n - 1 },
      { op: 'set_block', slide: sh.id, block: sh.blocks![0].id!, count: 99 },
    ])
    expect(results.map((r) => r.code)).toEqual(['has_content', 'out_of_range'])
  })

  it('빈 부품을 다른 부품 위아래에 놓는다. 이웃이 잘리는 자리는 건너뛴다', () => {
    const { deck: next, results } = applyOps(deck, [
      { op: 'add_slide', after: sid(0), layout: 'compose', as: 'n1' },
      { op: 'add_block', slide: 'n1', type: 'number', as: 'p1' },
      { op: 'add_block', slide: 'n1', type: 'bars', beside: 'p1', side: 'after' },
      { op: 'add_block', slide: 'n1', type: 'delta', beside: 'p1', side: 'below', as: 'p2' },
      { op: 'set_block', slide: 'n1', block: 'p2', effect: 'rise' },
    ])
    expect(results.map((r) => r.code)).toEqual(['applied', 'applied', 'applied', 'applied', 'applied'])
    const bs = boardOf(next, 1)
    const [n, d] = ['number', 'delta'].map((t) => bs.find((b) => b.type === t)!)
    expect([d.at!.x, d.at!.w]).toEqual([n.at!.x, n.at!.w])
    expect(d.at!.y).toBe(n.at!.y + n.at!.h)
    expect(d.effect).toBe('rise')
    // 표는 장 너비를 혼자 쓰니 숫자 옆에는 놓지 않는다
    const shaped = toShape(next).slides[1]
    const sn = shaped.blocks!.find((b) => b.type === 'number')!.id!
    expect(applyOps(next, [{ op: 'add_block', slide: shaped.id, type: 'table', beside: sn, side: 'before' }]).results[0]).toEqual({ ok: false, code: 'no_room' })
    expect(parseOp({ op: 'add_block', slide: shaped.id, type: 'number', beside: sn, side: 'under' })).toBeNull()
  })

  it('자리가 모자라면 넣지 않는다', () => {
    const sh = cshape()
    const ops: Op[] = Array.from({ length: 12 }, () => ({ op: 'add_block' as const, slide: sh.id, type: 'number' as const }))
    const { deck: next, results } = applyOps(composed, ops)
    expect(results.some((r) => r.code === 'no_room')).toBe(true)
    expect(boardOf(next).length).toBeLessThanOrEqual(10)
    expect(tiles(boardOf(next))).toBe(true)
  })

  it('없는 부품, 부품 장이 아닌 장은 건너뛴다', () => {
    const sh = cshape()
    const { results } = applyOps(composed, [
      { op: 'set_block', slide: sh.id, block: 'b00000000', look: 'card' },
      { op: 'set_size', slide: sh.id, block: 'b00000000', w: 6 },
      { op: 'move_block', slide: sh.id, block: sh.blocks![0].id!, beside: 'b00000000', side: 'after' },
      { op: 'add_block', slide: sid(0), type: 'number' },
    ])
    expect(results.map((r) => r.code)).toEqual(['no_block', 'no_block', 'no_block', 'not_for_layout'])
  })

  it('부품의 칸 안내 문구를 바꾼다 (글은 그대로)', () => {
    const sh = cshape()
    const id = sh.blocks![0].id!
    const type = boardOf(composed)[0].type
    const field = BLOCKS[type].items?.fields[0].key ?? BLOCKS[type].fields[0].key
    const { deck: next, results } = applyOps(composed, [
      { op: 'set_hint', slide: sh.id, block: id, field, text: '숫자부터 적어 주세요' },
      { op: 'set_hint', slide: sh.id, block: id, field: 'nothing', text: '안내' },
    ])
    expect(results.map((r) => r.code)).toEqual(['applied', 'not_for_layout'])
    expect(Object.values(boardOf(next)[0].hints ?? {})).toContain('숫자부터 적어 주세요')
    expect(allText(next)).toEqual(allText(composed))
  })

  it('부품의 글을 쓰는 키, 예전 줄로 가리키는 키는 받지 않는다', () => {
    const sh = cshape()
    const id = sh.blocks![0].id!
    expect(parseOp({ op: 'add_block', slide: sh.id, type: 'text', fields: { body: 'x' } })).toBeNull()
    expect(parseOp({ op: 'set_block', slide: sh.id, block: id, fields: { body: 'x' } })).toBeNull()
    expect(parseOp({ op: 'set_block', slide: sh.id, block: id, items: [{ title: 'x' }] })).toBeNull()
    expect(parseOp({ op: 'move_block', slide: sh.id, block: id })).toBeNull()
    expect(parseOp({ op: 'add_block', slide: sh.id, type: 'text', row: 0 })).toBeNull()
    expect(parseOp({ op: 'set_spans', slide: sh.id, block: id, spans: [6, 6] })).toBeNull()
    expect(parseOp({ op: 'set_row_grow', slide: sh.id, grow: [50, 50] })).toBeNull()
    expect(parseOp({ op: 'add_block', slide: sh.id, type: 'text', beside: id, edge: 'top' })).toBeNull()
  })

  it('빈 부품 장을 새로 만들 수 있다', () => {
    const { deck: next, results } = applyOps(deck, [
      { op: 'add_slide', after: sid(0), layout: 'compose', as: 'n1' },
      { op: 'add_block', slide: 'n1', type: 'number' },
      { op: 'add_block', slide: 'n1', type: 'number' },
    ])
    expect(results.map((r) => r.code)).toEqual(['applied', 'applied', 'applied'])
    expect(next.slides[1].layout).toBe('compose')
    expect(boardOf(next, 1)).toHaveLength(2)
    expect(tiles(boardOf(next, 1))).toBe(true)
  })

  it('부품이 나오는 때, 빠르기, 들어오는 쪽, 차례와 장 넘기기를 정해진 값으로만 바꾼다. 글은 그대로', () => {
    const two = applyOps(composed, [{ op: 'add_block', slide: cshape().id, type: 'callout', edge: 'bottom' }]).deck
    const sh = toShape(two).slides[at]
    const [first, second] = sh.blocks!.map((b) => b.id!)
    const { deck: next, results } = applyOps(two, [
      { op: 'set_block', slide: sh.id, block: second, when: 'click', speed: 'slow', effect: 'slide', from: 'left' },
      { op: 'set_block', slide: sh.id, block: first, effect: 'fade', from: 'left' },
      { op: 'set_block', slide: sh.id, block: second, when: 'click' },
      { op: 'set_order', slide: sh.id, order: [second] },
      { op: 'set_order', slide: sh.id, order: ['b00000000'] },
      { op: 'set_options', slide: sh.id, transition: 'morph' },
    ])
    expect(results.map((r) => r.code)).toEqual(['applied', 'not_for_layout', 'no_change', 'applied', 'no_block', 'applied'])
    const ns = toShape(next).slides[at]
    expect(checkShape(toShape(next))).toBe(true)
    const moved = ns.blocks!.find((b) => b.id === second)!
    expect([moved.when, moved.speed, moved.from, moved.effect]).toEqual(['click', 'slow', 'left', 'slide'])
    // 차례는 해시 id로만 나간다 (원래 id는 모양 파일에 없다)
    expect(ns.options.order).toEqual([second])
    expect(JSON.stringify(toShape(next))).not.toContain(boardOf(next).find((b) => b.type === 'callout')!.id)
    expect(ns.options.transition).toBe('morph')
    expect(allText(next)).toEqual(allText(two))
    // 되돌리기: 기본값은 지운다
    const back = applyOps(next, [
      { op: 'set_block', slide: sh.id, block: second, when: 'after', speed: 'normal' },
      { op: 'set_order', slide: sh.id, order: [] },
      { op: 'set_options', slide: sh.id, transition: null },
    ])
    expect(back.results.map((r) => r.code)).toEqual(['applied', 'applied', 'applied'])
    const bs = toShape(back.deck).slides[at]
    expect(bs.options.order).toBeUndefined()
    expect(bs.options.transition).toBeUndefined()
    expect(bs.blocks!.find((b) => b.id === second)!.when).toBeUndefined()
    // 정해지지 않은 값, 겹친 차례, 부품 장이 아닌 장은 받지 않는다
    expect(parseOp({ op: 'set_block', slide: sh.id, block: second, when: 'later' })).toBeNull()
    expect(parseOp({ op: 'set_order', slide: sh.id, order: [second, second] })).toBeNull()
    expect(parseOp({ op: 'set_options', slide: sh.id, transition: 'spin' })).toBeNull()
    expect(applyOps(deck, [{ op: 'set_order', slide: sid(0), order: [] }]).results[0]).toEqual({ ok: false, code: 'not_for_layout' })
  })

  it('부품이 있는 장은 글을 비워 둬도 빈 장이 아니라서 지우지 못한다', () => {
    const d = withCompose({})
    expect(slideEmpty(d.slides[d.slides.length - 1])).toBe(false)
    const id = shapeSlideId(d.slides[d.slides.length - 1])
    const { deck: next, results } = applyOps(d, [{ op: 'remove_slide', slide: id }])
    expect(results[0]).toEqual({ ok: false, code: 'has_content' })
    expect(next.slides).toHaveLength(d.slides.length)
  })
})

describe('알아서 짠 판의 표시', () => {
  // 예전 규칙으로 알아서 짠 판(숫자 칸 4): 지금 규칙(숫자 칸 3)과 달라 표시가 없으면 사람이 짠 판으로 보인다
  const i = deck.slides.findIndex((s) => canCompose(s.layout))
  const s0: Slide = { ...deck.slides[i], layout: 'compose', blocks: [] }
  const h = boardAreaH(s0, deck)
  const now = (['number', 'bullets', 'trend'] as const).reduce<Block[]>((out, type) => autoPlace(out, { ...makeBlock(type), id: type }, h) ?? out, [])
  const old = resizeBlock(now, 'number', 'w', 4, h)!
  const withBoard = (arranged?: string): Deck => ({ ...deck, slides: deck.slides.map((s, j) => (j === i ? { ...s0, blocks: old, ...(arranged ? { arranged } : {}) } : s)) })
  const ats = (d: Deck) => d.slides[i].blocks!.map((b) => b.at)

  it('자리를 정하지 않고 넣으면, 표시가 맞는 판은 지금 규칙으로 다시 고르고 표시를 남긴다. 빼면 원래 판으로', () => {
    expect(autoArranged(old, undefined, h)).toBe(false)
    const marked = withBoard(boardSig(old))
    const slide = toShape(marked).slides[i].id
    const add = applyOps(marked, [{ op: 'add_block', slide, type: 'text', as: 'p1' }])
    expect(add.results[0]).toEqual({ ok: true, code: 'applied' })
    const legacy = applyOps(withBoard(), [{ op: 'add_block', slide, type: 'text' }]).deck
    expect(ats(add.deck)).not.toEqual(ats(legacy))
    expect(add.deck.slides[i].arranged).toBe(boardSig(add.deck.slides[i].blocks!))
    expect(legacy.slides[i].arranged).toBeUndefined()
    const back = applyOps(marked, [{ op: 'add_block', slide, type: 'text', as: 'p1' }, { op: 'remove_block', slide, block: 'p1' }])
    expect(back.results.map((r) => r.code)).toEqual(['applied', 'applied'])
    expect(ats(back.deck)).toEqual(now.map((b) => b.at))
    expect(back.deck.slides[i].arranged).toBe(boardSig(back.deck.slides[i].blocks!))
  })
})

describe('AI에게 숨긴 것', () => {
  // 숫자(n) 옆에 인용(q), 그 아래 장 너비의 글(t). 숫자를 AI에게 숨긴다. 편집기처럼 판을 맞춰 둔 발표에서 본다
  const b = (type: Block['type'], id: string, fields: Record<string, string> = {}): Block => ({ ...makeBlock(type), id, fields })
  const board = () => {
    const top = insertAt(autoPlace([], b('number', 'n', { label: '절감액', value: '3.6억 원' }))!, { at: 'n', side: 'right' }, b('quote', 'q'))!
    return insertAt(top, { at: null, side: 'below' }, b('text', 't'))!
  }
  const base = createSampleDeck()
  const hiddenDeck = settleDeck({
    ...base,
    slides: [
      ...base.slides,
      { ...makeSlide('compose'), id: 'c1', blocks: board(), options: { aiHiddenBlocks: ['n'] } },
      { ...makeSlide('statement'), id: 'p1', fields: {}, options: { aiHidden: true } },
    ],
  })
  const C = shapeSlideId({ id: 'c1' })
  const P = shapeSlideId({ id: 'p1' })
  // 모양에는 숨긴 컴포넌트의 id가 없지만, 숨기기 전에 받은 모양의 id로 올 수 있다
  const N = shapeBlockId({ id: 'n' })
  const Q = shapeBlockId({ id: 'q' })
  const T = shapeBlockId({ id: 't' })
  const hiddenOf = (d: Deck) => JSON.stringify([d.slides.find((s) => s.id === 'p1'), d.slides.find((s) => s.id === 'c1')!.blocks!.find((x) => x.id === 'n')])
  const apply = (d: Deck, ops: Op[]) => {
    const out = applyOps(d, ops)
    return { ...out, codes: out.results.map((r) => r.code) }
  }

  it('숨긴 컴포넌트를 가리키는 op는 모두 건너뛴다 (빈 컴포넌트라도 빼지 않는다)', () => {
    const empty = settleDeck({ ...hiddenDeck, slides: hiddenDeck.slides.map((s) => (s.id === 'c1' ? { ...s, blocks: s.blocks!.map((x) => (x.id === 'n' ? { ...x, fields: {} } : x)) } : s)) })
    const ops: Op[] = [
      { op: 'set_block', slide: C, block: N, effect: 'rise' },
      { op: 'set_size', slide: C, block: N, w: 4 },
      { op: 'set_link', slide: C, block: N, side: 'right', link: 'plus' },
      { op: 'set_hint', slide: C, block: N, field: 'label', text: '무엇의 숫자인지' },
      { op: 'move_block', slide: C, block: N, edge: 'bottom' },
      { op: 'move_block', slide: C, block: T, swap: N },
      { op: 'move_block', slide: C, block: T, beside: N, side: 'after' },
      { op: 'add_block', slide: C, type: 'note', beside: N, side: 'below' },
      { op: 'set_order', slide: C, order: [N] },
      { op: 'remove_block', slide: C, block: N },
    ]
    for (const d of [hiddenDeck, empty]) {
      const out = apply(d, ops)
      expect(out.codes).toEqual(ops.map(() => 'private'))
      expect(hiddenOf(out.deck)).toBe(hiddenOf(d))
    }
  })

  it('다른 컴포넌트를 바꾸다 숨긴 컴포넌트의 자리, 크기, 나오는 차례가 바뀌면 되돌린다', () => {
    const { codes, deck: next } = apply(hiddenDeck, [
      // 인용을 넓히면 숫자가 좁아진다
      { op: 'set_size', slide: C, block: Q, w: 9 },
      // 맨 위에 장 너비로 넣으면 숫자가 낮아지거나 내려간다
      { op: 'add_block', slide: C, type: 'callout', edge: 'top' },
      // 글을 맨 위로 옮기면 숫자가 내려간다
      { op: 'move_block', slide: C, block: T, edge: 'top' },
      // 인용을 먼저 나오게 하면 숫자가 둘째로 밀린다 (읽는 차례로 숫자, 인용, 글)
      { op: 'set_order', slide: C, order: [Q] },
    ])
    expect(codes).toEqual(['private', 'private', 'private', 'private'])
    expect(hiddenOf(next)).toBe(hiddenOf(hiddenDeck))
  })

  it('숨긴 컴포넌트에 닿지 않는 op는 그대로 된다', () => {
    const { codes, deck: next } = apply(hiddenDeck, [
      { op: 'set_block', slide: C, block: Q, effect: 'rise', when: 'click' },
      { op: 'set_block', slide: C, block: T, speed: 'slow' },
      { op: 'set_options', slide: C, tone: 'invert' },
      { op: 'set_hint', slide: C, block: T, field: 'body', text: '설명을 두세 문장으로' },
    ])
    expect(codes).toEqual(['applied', 'applied', 'applied', 'applied'])
    expect(hiddenOf(next)).toBe(hiddenOf(hiddenDeck))
  })

  it('숨긴 슬라이드는 바꾸지도 옮기지도 못하지만, 그 뒤에 넣거나 옮길 수는 있다', () => {
    const ops: Op[] = [
      { op: 'set_options', slide: P, tone: 'invert' },
      { op: 'set_layout', slide: P, layout: 'points' },
      { op: 'set_hidden', slide: P, hidden: true },
      { op: 'set_guide', slide: P, text: '안내' },
      { op: 'set_hint', slide: P, field: 'title', text: '안내' },
      { op: 'remove_slide', slide: P },
      { op: 'move_slide', slide: P, after: null },
    ]
    const out = apply(hiddenDeck, ops)
    expect(out.codes).toEqual(ops.map(() => 'private'))
    expect(out.deck.slides.map((s) => s.id)).toEqual(hiddenDeck.slides.map((s) => s.id))
    const around = apply(hiddenDeck, [
      { op: 'add_slide', after: P, layout: 'points', as: 'n1' },
      { op: 'move_slide', slide: shapeSlideId(hiddenDeck.slides[1]), after: P },
    ])
    expect(around.codes).toEqual(['applied', 'applied'])
    // 숨긴 슬라이드 바로 뒤에 옮긴 장, 그 뒤에 새 장
    expect(around.deck.slides.slice(-3, -1).map((s) => s.id)).toEqual(['p1', hiddenDeck.slides[1].id])
    expect(hiddenOf(around.deck)).toBe(hiddenOf(hiddenDeck))
  })

  it('숨긴 것이 없는 발표에는 아무 영향이 없다', () => {
    const open = { ...hiddenDeck, slides: hiddenDeck.slides.map((s) => ({ ...s, options: { ...s.options, aiHidden: undefined, aiHiddenBlocks: undefined } })) }
    const { codes } = apply(open, [
      { op: 'set_size', slide: C, block: Q, w: 9 },
      { op: 'set_order', slide: C, order: [Q] },
      { op: 'set_options', slide: P, tone: 'invert' },
    ])
    expect(codes).toEqual(['applied', 'applied', 'applied'])
  })
})

describe('모션 그래픽 (사람이 내 라이브러리에서 넣는 장면)', () => {
  const cineSlide: Slide = { ...makeSlide('compose'), id: 'cine-s', blocks: [{ ...makeBlock('cine'), id: 'cine-b', fields: { glyph: 'Q' }, at: { x: 0, y: 0, w: 12, h: 12 } }] }
  const withCine: Deck = { ...deck, slides: [cineSlide, ...deck.slides] }
  const S = shapeSlideId(cineSlide)
  const B = shapeBlockId(cineSlide.blocks![0])

  it('AI는 모션 그래픽을 넣지 못한다(레시피를 만들 수 없다): 그런 op는 꼴이 맞지 않는 것으로 거른다', () => {
    expect(parseOp({ op: 'add_block', slide: S, type: 'cine' })).toBeNull()
    expect(parseOp({ op: 'add_block', slide: S, type: 'text' })).not.toBeNull()
  })

  it('모양에는 종류와 칸의 상태만 보이고, 나타나는 모습은 장면(기본)이나 없음만 고를 수 있다', () => {
    const shown = toShape(withCine).slides[0].blocks![0]
    expect(shown.type).toBe('cine')
    expect(JSON.stringify(shown)).not.toContain('"Q"')
    expect(applyOps(withCine, [{ op: 'set_block', slide: S, block: B, effect: 'rise' }]).results[0].code).toBe('not_for_layout')
    expect(applyOps(withCine, [{ op: 'set_block', slide: S, block: B, effect: 'none' }]).results[0].code).toBe('applied')
  })
})

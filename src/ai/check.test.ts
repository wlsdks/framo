import { describe, expect, it } from 'vitest'
import { asCompose, autoPlace, insertAt, makeBlock, settleDeck } from '../deck/blocks'
import { makeSlide } from '../deck/generate'
import type { Block } from '../deck/types'
import { createSampleDeck } from '../deck/sample'
import { checkOps, standInDeck } from './check'
import { applyOps, parseOp, type Op } from './ops'
import { SECRET, secretDeck } from './secretDeck'
import { shapeBlockId, shapeSlideId, toShape as shapeOf, type ShapeBlock, type ShapeDeck, type ShapeSlide } from './share'

/** 숨긴 장과 부품이 없는 발표의 모양: 장마다 레이아웃과 칸을 바로 읽는다 (숨긴 것은 share.test.ts의 'AI에게 숨기기'에서 본다) */
type OpenShape = Omit<ShapeDeck, 'slides'> & { slides: (Omit<ShapeSlide, 'blocks'> & { blocks?: ShapeBlock[] })[] }
const toShape = (...a: Parameters<typeof shapeOf>) => shapeOf(...a) as unknown as OpenShape

// 예시 발표에 부품 장 둘(점 목록, 핵심 숫자를 부품 장으로 바꾼 것)을 두고 본다
const deck = createSampleDeck()
const at = (layout: string) => deck.slides.findIndex((s) => s.layout === layout)
const POINTS = at('points')
const KPI = at('kpi')
const PRICING = at('pricing')
const COMPARE = at('compare')
const TIMELINE = at('timeline')
deck.slides[POINTS] = asCompose(deck.slides[POINTS])
deck.slides[KPI] = asCompose(deck.slides[KPI])
const shape = toShape(deck)
const sid = (i: number) => shape.slides[i].id
const bid = (i: number, j = 0) => shape.slides[i].blocks![j].id!

/** 대역에서 모양을 다시 만들면 id만 빼고 처음 모양과 같아야 한다 */
const withoutIds = (s: OpenShape) => ({
  ...s,
  deck: '',
  slides: s.slides.map(({ id: _, options, blocks, ...rest }) => ({
    ...rest,
    options: { ...options, order: options.order?.length },
    blocks: blocks?.map(({ id: _b, ...b }) => b),
  })),
})

describe('미리 돌려 보기', () => {
  it('모양으로 세운 대역은 같은 모양이 된다', () => {
    expect(withoutIds(toShape(standInDeck(shape)))).toEqual(withoutIds(shape))
  })

  it('대역에는 사람이 적은 글이 한 글자도 없다', () => {
    const text = JSON.stringify(standInDeck(toShape(secretDeck())))
    expect(text).not.toContain(SECRET)
    // 숫자 비밀은 해시 id(s, d, b + 16진 8자리)와 시각 숫자에 우연히 들어 있을 수 있어서 그것만 지우고 본다
    // (맥에서 한 번 'db3f5008c' 같은 해시와 겹쳐 실패했다)
    const plain = text.replace(/[sdbx][0-9a-f]{8}/g, '').replace(/"(updatedAt|createdAt)":\d+/g, '')
    expect(plain).not.toContain('7731')
  })

  it('op마다 앱에서 적용할 때와 같은 결과 코드가 나온다', () => {
    const ops: unknown[] = [
      { op: 'set_options', slide: sid(0), tone: 'invert' },
      { op: 'set_options', slide: sid(1), scene: 'answer' },
      { op: 'set_options', slide: sid(1), scene: 'numbers' },
      { op: 'set_options', slide: sid(PRICING), highlight: 1, scene: 'numbers' },
      { op: 'set_item_count', slide: sid(1), count: 2 },
      { op: 'set_item_count', slide: sid(2), count: 5 },
      { op: 'add_slide', after: sid(TIMELINE), role: '위험과 대응', as: 'n1' },
      { op: 'add_slide', after: 'n1', role: '지어낸 역할' },
      { op: 'move_slide', slide: 'n1', after: sid(1) },
      { op: 'set_layout', slide: sid(COMPARE), layout: 'compose' },
      { op: 'set_layout', slide: sid(3), layout: 'compose' },
      { op: 'set_hint', slide: sid(TIMELINE), field: 'title', item: 9, text: '단계 이름' },
      { op: 'add_block', slide: sid(POINTS), type: 'number', beside: bid(POINTS), side: 'after', as: 'p1' },
      { op: 'set_block', slide: sid(POINTS), block: 'p1', look: 'card' },
      { op: 'set_link', slide: sid(POINTS), block: bid(POINTS), side: 'right', link: 'arrow' },
      { op: 'set_size', slide: sid(POINTS), block: bid(POINTS), w: 9 },
      { op: 'add_block', slide: sid(POINTS), type: 'trend', edge: 'bottom' },
      { op: 'set_block', slide: sid(KPI), block: bid(KPI), look: 'bold' },
      { op: 'set_size', slide: sid(KPI), block: bid(KPI), h: 2 },
      { op: 'remove_block', slide: sid(KPI), block: bid(KPI) },
      { op: 'set_block', slide: sid(KPI), block: 'b00000000', count: 2 },
      { op: 'set_options', slide: sid(KPI), scene: 'numbers' },
      { op: 'set_order', slide: sid(POINTS), order: ['p1', bid(POINTS)] },
      { op: 'set_theme', theme: shape.theme },
      { op: 'set_theme', motion: 'lively', size: 'large' },
    ]
    const real = applyOps(deck, ops.map((o) => parseOp(o)!) as Op[]).results.map((r) => r.code)
    const checked = checkOps(shape, ops)
    expect(checked.map((r) => r.code)).toEqual(real)
    // 고르는 일이 골고루 들어갔는지 (모두 되거나 모두 안 되면 이 시험이 아무것도 보지 않는다)
    expect(new Set(real).size).toBeGreaterThan(5)
  })

  it('여러 값을 담은 op가 빠지면 까닭이 된 키를 알려 준다', () => {
    const [summary, pricing] = checkOps(shape, [
      { op: 'set_options', slide: sid(1), scene: 'answer', highlight: 0 },
      { op: 'set_options', slide: sid(PRICING), scene: 'answer', highlight: 1 },
    ])
    expect(summary).toEqual({ op: 'set_options', ok: false, code: 'not_for_layout', key: 'highlight' })
    expect(pricing).toEqual({ op: 'set_options', ok: false, code: 'scene_unfit', key: 'scene' })
  })

  it('꼴이 틀린 op는 invalid로 알리고 나머지는 그대로 본다', () => {
    const res = checkOps(shape, [
      { op: 'set_options', slide: sid(KPI), scene: 'film' },
      { op: 'set_block', slide: sid(POINTS), block: bid(POINTS), text: '새 글' },
      { op: 'set_block', slide: sid(POINTS), block: bid(POINTS), [SECRET]: 1 },
      { op: 'set_field', slide: sid(1), text: 'x' },
      { op: 'set_hidden', slide: sid(2), hidden: true },
    ])
    expect(res).toEqual([
      { op: 'set_options', ok: false, code: 'invalid', key: 'scene' },
      { op: 'set_block', ok: false, code: 'invalid', key: 'text' },
      // 지어낸 키 이름은 돌려보내지 않는다
      { op: 'set_block', ok: false, code: 'invalid' },
      { op: null, ok: false, code: 'invalid', key: 'op' },
      { op: 'set_hidden', ok: true, code: 'applied' },
    ])
  })
})

describe('미리 돌려 보기: AI에게 숨긴 것', () => {
  // 숫자(n, 숨김) 옆에 인용(q), 그 아래 장 너비의 글(t), 그리고 통째로 숨긴 장(p1)
  const b = (type: Block['type'], id: string, fields: Record<string, string> = {}): Block => ({ ...makeBlock(type), id, fields })
  const top = insertAt(autoPlace([], b('number', 'n', { label: SECRET, value: SECRET }))!, { at: 'n', side: 'right' }, b('quote', 'q', { quote: '인용할 말' }))!
  const blocks = insertAt(top, { at: null, side: 'below' }, b('text', 't', { body: '글' }))!
  const base = createSampleDeck()
  const real = settleDeck({
    ...base,
    slides: [
      ...base.slides,
      { ...makeSlide('compose'), id: 'c1', fields: { title: '제목' }, blocks, options: { aiHiddenBlocks: ['n'] } },
      { ...makeSlide('statement'), id: 'p1', fields: { title: SECRET }, options: { aiHidden: true } },
    ],
  })
  const hidden = shapeOf(real)
  const C = shapeSlideId({ id: 'c1' })
  const P = shapeSlideId({ id: 'p1' })
  const Q = shapeBlockId({ id: 'q' })
  const T = shapeBlockId({ id: 't' })

  it('대역도 숨긴 것을 숨긴 채로 세우고, 다시 모양을 만들면 같다', () => {
    const stand = standInDeck(hidden)
    expect(JSON.stringify(stand)).not.toContain(SECRET)
    // 해시 id(대역은 모양의 해시를 원래 id로 쓴다)와 나오는 차례(그 id로 적는다)만 빼고 견준다
    const strip = (s: ShapeDeck) => ({
      ...s,
      deck: '',
      slides: s.slides.map(({ id: _, ...x }) =>
        'blocks' in x && x.blocks ? { ...x, blocks: x.blocks.map((y) => ('id' in y ? { ...y, id: '' } : y)), options: { ...x.options, order: undefined } } : x,
      ),
    })
    expect(strip(shapeOf(stand))).toEqual(strip(hidden))
  })

  it('숨긴 것에 닿는 op와 닿지 않는 op를 앱과 같게 가른다', () => {
    const ops: Op[] = [
      { op: 'set_block', slide: C, block: Q, effect: 'rise' },
      { op: 'set_block', slide: C, block: T, speed: 'slow' },
      { op: 'set_options', slide: C, tone: 'invert' },
      { op: 'set_size', slide: C, block: Q, w: 9 },
      { op: 'add_block', slide: C, type: 'callout', edge: 'top' },
      { op: 'set_order', slide: C, order: [Q] },
      { op: 'set_options', slide: P, tone: 'invert' },
      { op: 'add_slide', after: P, layout: 'points' },
    ]
    const app = applyOps(real, ops).results.map((r) => r.code)
    expect(app).toEqual(['applied', 'applied', 'applied', 'private', 'private', 'private', 'private', 'applied'])
    expect(checkOps(hidden, ops).map((r) => r.code)).toEqual(app)
  })
})

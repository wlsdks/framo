import { describe, expect, it, vi } from 'vitest'
import { createSampleDeck } from '../deck/sample'
import { applyOps } from './ops'
import { toShape } from './share'

// 마지막 그물이 정말 걸러 내는지 보려고 레이아웃 바꾸기가 항목을 버리게 만든다.
// 지금의 동작은 글을 잃지 않아서(ops.test.ts) 그물에 걸릴 일이 없으니, 그물만 따로 확인한다
vi.mock('../deck/edits', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../deck/edits')>()
  return { ...orig, relayout: (...args: Parameters<typeof orig.relayout>) => ({ ...orig.relayout(...args), items: [] }) }
})

describe('제안의 마지막 그물', () => {
  it('사람이 적은 글을 잃는 동작은 되돌리고 적은 내용이 있다고 알린다. 다음 동작은 그대로 한다', () => {
    const deck = createSampleDeck()
    const i = deck.slides.findIndex((s) => s.layout !== 'statement' && s.layout !== 'compose' && s.items.some((it) => it.title.trim()))
    const id = toShape(deck).slides[i].id
    const { deck: next, results, touched } = applyOps(deck, [
      { op: 'set_layout', slide: id, layout: 'statement' },
      { op: 'set_hidden', slide: id, hidden: true },
    ])
    expect(results).toEqual([
      { ok: false, code: 'has_content' },
      { ok: true, code: 'applied' },
    ])
    expect(next.slides[i].layout).toBe(deck.slides[i].layout)
    expect(next.slides[i].items).toEqual(deck.slides[i].items)
    expect(next.slides[i].hidden).toBe(true)
    expect(touched.has(deck.slides[i].id)).toBe(true)
  })

  it('되돌린 동작만 있으면 바뀐 장으로 치지 않는다', () => {
    const deck = createSampleDeck()
    const i = deck.slides.findIndex((s) => s.layout !== 'statement' && s.layout !== 'compose' && s.items.some((it) => it.title.trim()))
    const { deck: next, results, touched } = applyOps(deck, [{ op: 'set_layout', slide: toShape(deck).slides[i].id, layout: 'statement' }])
    expect(results).toEqual([{ ok: false, code: 'has_content' }])
    expect(touched.size).toBe(0)
    expect(next.slides[i]).toEqual(deck.slides[i])
  })
})

// 알아서 짠 판의 표시(Slide.arranged). 판이 지금 규칙이 고를 판과 같은지로만 알아서 짠 판인지 보면, 짜임 규칙을 고칠 때마다
// 예전 규칙으로 짠 판이 사람이 옮긴 판으로 보여 컴포넌트를 넣어도 판을 다시 고르지 않고 끼우기만 했다
import { describe, expect, it } from 'vitest'
import { arrangeBest, arrangeOrder, arrangeRequest, autoArranged, autoPlace, BLOCKS, boardAreaH, boardFit, boardSig, composeAreaH, copyBlocks, isArranged, makeBlock, moveAt, removeBlock, resizeBlock, settleDeck } from '../blocks'
import { sampleBlock } from '../blockSamples'
import { createDeck, makeSlide } from '../generate'
import { aspectOf } from './images'
import type { Block, BlockType, Deck, Slide } from '../types'

const H = composeAreaH({ fields: { title: '제목' } } as unknown as Slide)
const block = (type: BlockType, id: string = type): Block => ({ ...makeBlock(type), id })
/** 차례대로 눌러 넣은 판 (편집기의 '넣기') */
const board = (...bs: Block[]): Block[] => bs.reduce<Block[]>((out, b) => autoPlace(out, b, H) ?? out, [])
const ats = (bs: Block[]) => bs.map((b) => b.at)
const fit = (bs: Block[]) => boardFit(H, bs)

/** 예전 규칙이 골랐을 판: 같은 부품, 같은 차례로 짤 수 있는 틀 가운데 지금 규칙의 첫째가 아닌 것 */
function olderBoard(bs: Block[]): Block[] {
  const seen: { blocks: Block[]; cost: number }[] = []
  arrangeBest(arrangeOrder(bs), fit(bs), H, aspectOf, seen)
  return seen
    .filter((c) => c.cost < 1000)
    .sort((a, b) => a.cost - b.cost)
    .map((c) => c.blocks)
    .find((c) => !isArranged(c, fit(c), H, aspectOf))!
}

describe('알아서 짠 판의 표시', () => {
  const now = board(block('number', 'n'), block('bullets', 'l'), block('trend', 't'))
  const old = olderBoard(now)

  it('규칙이 바뀌어 지금 규칙이 고를 판과 달라도, 표시가 맞으면 넣고 뺄 때 판을 지금 규칙으로 다시 고른다', () => {
    expect(isArranged(old, fit(old), H, aspectOf)).toBe(false)
    const mark = boardSig(old)
    expect(autoArranged(old, mark, H)).toBe(true)
    const add = block('text', 'x')
    expect(ats(autoPlace(old, add, H, true)!)).toEqual(ats(autoPlace(now, add, H)!))
    expect(ats(removeBlock(old, 'l', H, true))).toEqual(ats(removeBlock(now, 'l', H)))
  })

  it('표시가 없는 예전 장은 지금처럼 지금 규칙의 판과 견줘 보고, 사람이 짠 판이면 끼우기만 한다', () => {
    expect(autoArranged(now, undefined, H)).toBe(true)
    expect(autoArranged(old, undefined, H)).toBe(false)
    const add = block('text', 'x')
    expect(ats(autoPlace(old, add, H, false)!)).toEqual(ats(autoPlace(old, add, H)!))
    expect(ats(autoPlace(old, add, H)!)).not.toEqual(ats(autoPlace(now, add, H)!))
    expect(ats(removeBlock(old, 'l', H, false))).toEqual(ats(removeBlock(old, 'l', H)))
  })

  it('사람이 옮기거나 크기를 바꾸면 표시와 자리가 달라져 사람이 짠 판이 된다. 제자리로 돌리면 다시 알아서 짠 판', () => {
    const mark = boardSig(now)
    const moved = moveAt(now, 'n', { kind: 'spot', spot: { at: null, side: 'right' } }, H)!
    expect(autoArranged(moved, mark, H)).toBe(false)
    const wider = resizeBlock(now, 'n', 'w', 4, H)!
    expect(autoArranged(wider, mark, H)).toBe(false)
    expect(autoArranged(resizeBlock(wider, 'n', 'w', 3, H)!, mark, H)).toBe(true)
  })

  it('예전 버전에서 고쳐 표시가 남은 채 자리가 바뀐 판은 사람이 짠 판으로 본다', () => {
    // 예전 버전은 표시를 모르고 그대로 저장한다: 부품을 하나 뺐거나 옮겼으면 표시가 맞지 않는다
    expect(autoArranged(removeBlock(now, 't'), boardSig(now), H)).toBe(false)
  })

  it('장을 복사해 부품 id가 바뀌어도 표시가 맞는다 (차례와 자리로 본다)', () => {
    expect(boardSig(copyBlocks(now))).toBe(boardSig(now))
  })

  it("'자동으로 다시 배치'를 누르면 나은 판이 없어 그대로 두는 판도 알아서 짠 판으로 남긴다", () => {
    // 선을 끌어 숫자 칸을 4로 넓힌 판: 지금 규칙의 판(3)과 점수가 거의 같아 다시 짤 것이 없다
    const manual = resizeBlock(now, 'n', 'w', 4, H)!
    expect(autoArranged(manual, boardSig(now), H)).toBe(false)
    expect(arrangeRequest(manual, boardSig(now), H)).toEqual({ blocks: manual, moved: false, mark: true })
    // 이미 알아서 짠 판이면 남길 것이 없다 (되돌리기 단계를 남기지 않는다)
    expect(arrangeRequest(now, boardSig(now), H)).toEqual({ blocks: now, moved: false, mark: false })
    // 위아래로 쌓아 둔 짧은 글 둘은 나란히 다시 짜고 알아서 짠 판으로 남긴다
    const stacked = [
      { ...block('message', 'm'), at: { x: 0, y: 0, w: 12, h: 6 } },
      { ...block('bullets', 'b'), at: { x: 0, y: 6, w: 12, h: 6 } },
    ]
    const again = arrangeRequest(stacked, undefined, H)!
    expect(again.moved).toBe(true)
    expect(again.mark).toBe(true)
  })

  it('컴포넌트가 하나 이하면 늘 알아서 짠 판이다 (판 전체를 덮어 옮길 데가 없다)', () => {
    expect(autoArranged([], 'x', H)).toBe(true)
    expect(autoArranged(board(block('number', 'n')), 'x', H)).toBe(true)
  })
})

describe('판을 다시 맞출 때의 표시 (settleDeck)', () => {
  const base = createDeck({ type: 'report', audience: 'mixed', minutes: 20, method: 'live', title: '가상의 보고', org: '기획팀', presenter: '김하나', theme: 'white' })
  const empty: Slide = { ...makeSlide('compose'), fields: { title: '제목' } }
  const areaH = boardAreaH(empty, base)
  const blocks = (['text', 'bars', 'number'] as const).map((t) => ({ ...sampleBlock(t), id: t })).reduce<Block[]>((out, b) => autoPlace(out, b, areaH) ?? out, [])
  /** 항목을 다 채운 판: 막대 차트와 숫자 사이를 다시 나눈다 (9:3 → 8:4) */
  const grown = blocks.map((b) => {
    const max = BLOCKS[b.type].items?.max ?? 0
    return max > b.items.length ? { ...b, items: [...b.items, ...Array.from({ length: max - b.items.length }, (_, k) => ({ ...b.items[0], id: `more-${k}` }))] } : b
  })
  const deckWith = (s: Slide): Deck => ({ ...base, slides: [s] })

  it('항목이 늘어 판을 다시 맞춰도 알아서 짠 판은 표시가 바뀐 자리를 따라간다', () => {
    const prev = deckWith({ ...empty, blocks, arranged: boardSig(blocks) })
    const out = settleDeck(deckWith({ ...prev.slides[0], blocks: grown }), prev).slides[0]
    expect(ats(out.blocks!)).not.toEqual(ats(blocks))
    expect(out.arranged).toBe(boardSig(out.blocks!))
  })

  it('사람이 짠 판(표시와 자리가 다른 판)과 표시가 없는 판은 다시 맞춰도 표시를 고치지 않는다', () => {
    const prev = deckWith({ ...empty, blocks, arranged: 'manual' })
    const out = settleDeck(deckWith({ ...prev.slides[0], blocks: grown }), prev).slides[0]
    expect(ats(out.blocks!)).not.toEqual(ats(blocks))
    expect(out.arranged).toBe('manual')
    const unmarked = deckWith({ ...empty, blocks })
    expect(settleDeck(deckWith({ ...unmarked.slides[0], blocks: grown }), unmarked).slides[0].arranged).toBeUndefined()
  })
})

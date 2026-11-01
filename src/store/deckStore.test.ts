import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDeck, emptyItem, makeSlide } from '../deck/generate'
import { sampleBlock } from '../deck/blockSamples'
import { autoPlace, boardAreaH, boardTight, playOrder, rearrangeBlocks, removeBlock } from '../deck/blocks'
import { LAYOUTS, variantOf } from '../deck/layouts'
import { gestureKey } from '../lib/pointerSession'
import type { Slide } from '../deck/types'
import { undoLast, useDeck } from './deckStore'

const deck = () =>
  createDeck({ type: 'report', audience: 'mixed', minutes: 20, method: 'live', title: '분기 실적 보고', org: '기획팀', presenter: '이서연', theme: 'white' })

describe('되돌리기', () => {
  beforeEach(() => useDeck.getState().open({ ...deck(), aiShare: true }))

  it('AI 공유를 끈 뒤 되돌리기, 다시 하기를 해도 꺼진 채로', () => {
    useDeck.getState().setTitle('바꾼 제목')
    useDeck.getState().setAiShare(false)
    useDeck.getState().undo()
    expect(useDeck.getState().deck?.title).toBe('분기 실적 보고')
    expect(useDeck.getState().deck?.aiShare).toBe(false)
    useDeck.getState().redo()
    expect(useDeck.getState().deck?.title).toBe('바꾼 제목')
    expect(useDeck.getState().deck?.aiShare).toBe(false)
  })

  it('색 고르기 창을 끄는 동안 바뀐 강조색은 되돌리기 한 번으로 돌아온다', () => {
    const before = useDeck.getState().deck?.theme.accent
    for (const c of ['#112233', '#223344', '#334455', '#445566']) useDeck.getState().setAccent(c)
    expect(useDeck.getState().past).toHaveLength(1)
    useDeck.getState().undo()
    expect(useDeck.getState().deck?.theme.accent).toBe(before)
  })

  it('알림의 되돌리기는 그 뒤에 다른 것을 고쳤으면 되돌리지 않는다', () => {
    const id = useDeck.getState().deck!.slides[1].id
    useDeck.getState().removeSlide(id)
    const undo = undoLast()
    useDeck.getState().setTitle('바꾼 제목')
    expect(undo()).toBe(false)
    expect(useDeck.getState().deck?.title).toBe('바꾼 제목')
    expect(useDeck.getState().deck?.slides.some((s) => s.id === id)).toBe(false)
  })

  it('컴포넌트를 빼며 연결이 달라졌을 때 알림의 되돌리기로 연결까지 복원한다', () => {
    const current = useDeck.getState().deck!
    const slide = current.slides[1]
    const places = [
      { x: 0, y: 0, w: 6, h: 6 }, { x: 6, y: 0, w: 6, h: 6 },
      { x: 0, y: 6, w: 7, h: 6 }, { x: 7, y: 6, w: 5, h: 6 },
    ]
    const blocks = ['a', 'b', 'c', 'd'].map((id, i) => ({ ...sampleBlock('number'), id, at: places[i], ...(i === 0 ? { linkBelow: 'arrow' as const } : {}) }))
    useDeck.getState().open({ ...current, slides: current.slides.map((s) => s.id === slide.id ? { ...s, layout: 'compose', blocks } : s) })
    const original = useDeck.getState().deck!.slides.find((s) => s.id === slide.id)!.blocks!
    const next = removeBlock(original, 'b', 800)
    expect(next.find((b) => b.id === 'a')?.linkBelow).toBeUndefined()
    useDeck.getState().setBlocks(slide.id, next)
    expect(undoLast()()).toBe(true)
    expect(useDeck.getState().deck!.slides.find((s) => s.id === slide.id)!.blocks).toEqual(original)
  })

  it('알림의 되돌리기는 기록에 남지 않는 설정이 바뀌어도 방금 바꾼 것을 되돌린다', () => {
    const id = useDeck.getState().deck!.slides[1].id
    useDeck.getState().removeSlide(id)
    const undo = undoLast()
    useDeck.getState().setAiShare(false)
    expect(undo()).toBe(true)
    expect(useDeck.getState().deck?.slides.some((s) => s.id === id)).toBe(true)
  })

  it('AI 공유를 켠 뒤 되돌려도 켜 둔 대로', () => {
    useDeck.getState().setAiShare(false)
    useDeck.getState().setTitle('바꾼 제목')
    useDeck.getState().setAiShare(true)
    useDeck.getState().undo()
    expect(useDeck.getState().deck?.aiShare).toBe(true)
  })

  it('자동으로 다시 배치한 슬라이드는 한 번에 원래 자리로 되돌린다', () => {
    const current = useDeck.getState().deck!
    const slide = current.slides[1]
    const blocks = [
      { ...sampleBlock('message'), id: 'message', at: { x: 0, y: 0, w: 12, h: 6 } },
      { ...sampleBlock('bullets'), id: 'list', at: { x: 0, y: 6, w: 12, h: 6 } },
    ]
    useDeck.getState().open({ ...current, slides: current.slides.map((s) => s.id === slide.id ? { ...s, layout: 'compose', blocks } : s) })
    const original = useDeck.getState().deck!.slides.find((s) => s.id === slide.id)!
    const next = rearrangeBlocks(original.blocks!, boardAreaH(original, current))!
    expect(next.map((b) => b.at)).not.toEqual(original.blocks!.map((b) => b.at))
    useDeck.getState().setBlocks(slide.id, next)
    expect(useDeck.getState().past).toHaveLength(1)
    useDeck.getState().undo()
    expect(useDeck.getState().deck!.slides.find((s) => s.id === slide.id)!.blocks).toEqual(original.blocks)
    useDeck.getState().redo()
    expect(useDeck.getState().deck!.slides.find((s) => s.id === slide.id)!.blocks?.map((b) => b.at)).toEqual(next.map((b) => b.at))
  })

  it('긴 제목으로 넘친 슬라이드도 다시 배치한 뒤 한 번에 되돌린다', () => {
    const current = useDeck.getState().deck!
    const slide = current.slides[1]
    const first = autoPlace([], { ...sampleBlock('message'), id: 'message' }, 705)!
    const blocks = autoPlace(first, { ...sampleBlock('facts'), id: 'facts' }, 705)!
    const title = '가상의 긴 제목을 확인해요 '.repeat(25)
    useDeck.getState().open({ ...current, slides: current.slides.map((s) => s.id === slide.id ? { ...s, layout: 'compose', fields: { title }, blocks } : s) })
    const original = useDeck.getState().deck!.slides.find((s) => s.id === slide.id)!
    const look = useDeck.getState().deck!
    expect(boardTight(original, look)).toBe(true)
    const next = rearrangeBlocks(original.blocks!, boardAreaH(original, look))!
    expect(next).not.toBeNull()
    useDeck.getState().setBlocks(slide.id, next)
    expect(boardTight(useDeck.getState().deck!.slides.find((s) => s.id === slide.id)!, look)).toBe(false)
    useDeck.getState().undo()
    expect(useDeck.getState().deck!.slides.find((s) => s.id === slide.id)!.blocks).toEqual(original.blocks)
    useDeck.getState().redo()
    expect(useDeck.getState().deck!.slides.find((s) => s.id === slide.id)!.blocks?.map((b) => b.at)).toEqual(next.map((b) => b.at))
  })

  it('제목과 아래 표시를 감추고 다시 켜도 작성한 글은 남는다', () => {
    const current = useDeck.getState().deck!
    const id = current.slides[1].id
    const fields = { ...current.slides[1].fields, title: '가상의 제목', lead: '가상의 부제', source: '가상의 출처' }
    useDeck.getState().open({ ...current, slides: current.slides.map((s) => s.id === id ? { ...s, fields } : s) })
    useDeck.getState().setOptions(id, { hideHead: true, hideFoot: true })
    expect(useDeck.getState().deck!.slides.find((s) => s.id === id)!.fields).toEqual(fields)
    useDeck.getState().setOptions(id, { hideHead: undefined, hideFoot: undefined })
    const slide = useDeck.getState().deck!.slides.find((s) => s.id === id)!
    expect(slide.fields).toEqual(fields)
    expect(slide.options.hideHead).toBeUndefined()
    expect(slide.options.hideFoot).toBeUndefined()
  })
})

describe('되돌리기 단위', () => {
  beforeEach(() => useDeck.getState().open(deck()))
  afterEach(() => vi.restoreAllMocks())
  const slides = () => useDeck.getState().deck!.slides
  const ids = (i: number) => slides()[i].items.map((it) => it.id)

  it('아무것도 바뀌지 않는 고침은 되돌리기 단계를 남기지 않는다', () => {
    const s = slides()[1]
    useDeck.getState().moveItem(s.id, 0, 0)
    useDeck.getState().setOptions(s.id, { highlight: s.options.highlight })
    useDeck.getState().setTitle(useDeck.getState().deck!.title)
    // 고른 적 없는 첫째 모양을 다시 고르기
    const v = slides().find((x) => (LAYOUTS[x.layout].variants?.length ?? 0) > 1 && x.variant === undefined)!
    useDeck.getState().setVariant(v.id, variantOf(v))
    expect(useDeck.getState().past).toHaveLength(0)
    expect(slides().find((x) => x.id === v.id)!.variant).toBeUndefined()
  })

  it('한 번 끄는 동안 고친 것은 손을 멈췄다가 움직여도 되돌리기 한 단계', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
    const s = slides()[1]
    const before = ids(1)
    const key = gestureKey('items')
    useDeck.getState().moveItem(s.id, 0, 1, key)
    now.mockReturnValue(1_005_000)
    useDeck.getState().moveItem(s.id, 1, 2, key)
    expect(useDeck.getState().past).toHaveLength(1)
    useDeck.getState().undo()
    expect(ids(1)).toEqual(before)
  })

  it('끄다가 제자리로 돌아오거나 그만두면 되돌리기 단계를 남기지 않는다', () => {
    const s = slides()[1]
    const before = ids(1)
    const key = gestureKey('items')
    useDeck.getState().moveItem(s.id, 0, 2, key)
    useDeck.getState().moveItem(s.id, 2, 0, key)
    expect(useDeck.getState().past).toHaveLength(0)
    expect(ids(1)).toEqual(before)
    // 다시 끌어 옮기면 그때부터 한 단계
    useDeck.getState().moveItem(s.id, 0, 1, key)
    expect(useDeck.getState().past).toHaveLength(1)
  })

  it('따로 두 번 끈 것은 곧바로 이어 끌어도 되돌리기 두 단계', () => {
    const s = slides()[1]
    useDeck.getState().moveItem(s.id, 0, 1, gestureKey('items'))
    useDeck.getState().moveItem(s.id, 0, 1, gestureKey('items'))
    expect(useDeck.getState().past).toHaveLength(2)
  })

  it('칸을 나가며 글의 앞뒤 빈칸만 다듬은 것은 되돌리기 단계를 따로 남기지 않는다', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
    const s = slides()[1]
    const was = s.fields.title ?? ''
    useDeck.getState().setField(s.id, 'title', `${was} 정리 `)
    // 쓰고 쉬었다가, 다른 것을 고친 뒤에 칸을 나가도
    now.mockReturnValue(1_005_000)
    useDeck.getState().moveItem(s.id, 0, 1)
    useDeck.getState().setField(s.id, 'title', `${was} 정리`.trim())
    expect(useDeck.getState().past).toHaveLength(2)
    expect(slides()[1].fields.title).toBe(`${was} 정리`.trim())
    useDeck.getState().undo()
    useDeck.getState().undo()
    expect(slides()[1].fields.title ?? '').toBe(was)
  })

  it('쓴 글을 곧바로 지우면 되돌리기 단계를 남기지 않는다', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
    const s = slides()[1]
    useDeck.getState().setField(s.id, 'title', '보고 제목')
    now.mockReturnValue(1_005_000)
    useDeck.getState().setField(s.id, 'title', '보고 제목 초안')
    now.mockReturnValue(1_005_400)
    useDeck.getState().setField(s.id, 'title', '보고 제목')
    expect(useDeck.getState().past).toHaveLength(1)
    // 이어 쓰면 새 단계
    useDeck.getState().setField(s.id, 'title', '보고 제목 정리')
    expect(useDeck.getState().past).toHaveLength(2)
  })

  it('칸 안의 Ctrl+Z로 쓴 글을 지운 뒤 칸을 나가면, 빈칸만 남은 단계를 지운다', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
    const s = slides()[1]
    const was = s.fields.title
    useDeck.getState().setField(s.id, 'title', '보고 제목 하나')
    now.mockReturnValue(1_003_000)
    useDeck.getState().setField(s.id, 'title', '보고 제목 하나 둘')
    // 칸 안의 Ctrl+Z(브라우저)가 '둘'을 지우고 빈칸을 남겼다. 칸을 나가며 다듬는다
    now.mockReturnValue(1_003_500)
    useDeck.getState().setField(s.id, 'title', '보고 제목 하나 ')
    now.mockReturnValue(1_004_000)
    useDeck.getState().setField(s.id, 'title', '보고 제목 하나')
    expect(useDeck.getState().past).toHaveLength(1)
    // 칸 밖의 첫 Ctrl+Z가 보이게 되돌린다
    useDeck.getState().undo()
    expect(slides()[1].fields.title).toBe(was)
  })

  it('빈칸을 치는 것은 기록해서, 끝까지 되돌리면 처음과 같다', () => {
    const s = slides()[1]
    const was = s.fields.title
    useDeck.getState().setField(s.id, 'title', `${was ?? ''} `)
    expect(useDeck.getState().past).toHaveLength(1)
    useDeck.getState().undo()
    expect(slides()[1].fields.title).toBe(was)
  })
})

describe('알림의 되돌리기', () => {
  beforeEach(() => useDeck.getState().open(deck()))
  const slides = () => useDeck.getState().deck!.slides

  it('Ctrl+Z로 되돌린 뒤 새로 고친 것은 되돌리지 않는다', () => {
    useDeck.getState().removeSlide(slides()[3].id)
    const undo = undoLast()
    useDeck.getState().undo()
    useDeck.getState().setTitle('되돌린 뒤 바꾼 제목')
    expect(undo()).toBe(false)
    expect(useDeck.getState().deck?.title).toBe('되돌린 뒤 바꾼 제목')
  })

  it('Ctrl+Z, Ctrl+Y로 그대로 돌아온 뒤에는 되돌린다', () => {
    const id = slides()[3].id
    useDeck.getState().removeSlide(id)
    const undo = undoLast()
    useDeck.getState().undo()
    useDeck.getState().redo()
    expect(undo()).toBe(true)
    expect(slides().some((s) => s.id === id)).toBe(true)
  })

  it('이미 되돌린 것을 한 번 더 되돌리지 않는다', () => {
    useDeck.getState().setTitle('먼저 바꾼 제목')
    useDeck.getState().removeSlide(slides()[3].id)
    const undo = undoLast()
    useDeck.getState().undo()
    expect(undo()).toBe(true)
    expect(useDeck.getState().deck?.title).toBe('먼저 바꾼 제목')
    expect(useDeck.getState().past).toHaveLength(1)
  })

  it('바꾼 것이 없었으면 그 앞에 고친 것을 되돌리지 않는다', () => {
    useDeck.getState().setTitle('먼저 바꾼 제목')
    const s = slides()[1]
    useDeck.getState().setOptions(s.id, { highlight: s.options.highlight })
    const undo = undoLast()
    expect(undo()).toBe(true)
    expect(useDeck.getState().deck?.title).toBe('먼저 바꾼 제목')
  })
})

describe('되돌린 뒤 보는 장', () => {
  beforeEach(() => useDeck.getState().open(deck()))
  const slides = () => useDeck.getState().deck!.slides

  it('다른 장을 보다가 되돌리거나 다시 하면 바뀐 장으로 간다', () => {
    const [, , third, , , sixth] = slides()
    useDeck.getState().select(third.id)
    useDeck.getState().setField(third.id, 'title', '바꾼 제목')
    useDeck.getState().select(sixth.id)
    useDeck.getState().undo()
    expect(useDeck.getState().selectedId).toBe(third.id)
    useDeck.getState().select(sixth.id)
    useDeck.getState().redo()
    expect(useDeck.getState().selectedId).toBe(third.id)
  })

  it('넣은 장을 되돌리면 맨 앞 장이 아니라 그 앞 장을 고르고, 다시 하면 넣은 장을 고른다', () => {
    const at = slides()[4]
    useDeck.getState().addSlide('points', at.id)
    const added = useDeck.getState().selectedId
    useDeck.getState().undo()
    expect(useDeck.getState().selectedId).toBe(at.id)
    useDeck.getState().redo()
    expect(useDeck.getState().selectedId).toBe(added)
  })

  it('다른 장을 보다가 넣은 장을 되돌리면 넣은 자리의 앞 장으로 간다', () => {
    const at = slides()[4]
    useDeck.getState().addSlide('points', at.id)
    useDeck.getState().select(slides()[0].id)
    useDeck.getState().undo()
    expect(useDeck.getState().selectedId).toBe(at.id)
    // 곁의 장을 보고 있었으면 그대로
    useDeck.getState().redo()
    useDeck.getState().select(at.id)
    useDeck.getState().undo()
    expect(useDeck.getState().selectedId).toBe(at.id)
  })

  it('다른 장을 보다가 장 옮기기를 되돌리면 옮긴 장으로 가고, 옮긴 장을 보며 다시 하면 그대로', () => {
    const moved = slides()[5]
    useDeck.getState().moveSlide(5, 2)
    useDeck.getState().select(slides()[0].id)
    useDeck.getState().undo()
    expect(useDeck.getState().selectedId).toBe(moved.id)
    useDeck.getState().redo()
    expect(useDeck.getState().selectedId).toBe(moved.id)
  })

  it('테마를 되돌려도 보던 장 그대로', () => {
    const s = slides()[3]
    useDeck.getState().setTheme('navy')
    useDeck.getState().select(s.id)
    useDeck.getState().undo()
    expect(useDeck.getState().selectedId).toBe(s.id)
  })
})

describe('항목 빼기와 복제, 장 복제', () => {
  const item = (title: string) => ({ ...emptyItem(), title })
  const open = (slide: Slide) => {
    const d = deck()
    useDeck.getState().open({ ...d, slides: [d.slides[0], slide] })
    return slide.id
  }
  const slide = (i = 1) => useDeck.getState().deck!.slides[i]
  const titles = () => slide().items.map((it) => it.title)

  it('항목을 빼면 고른 강조는 그 항목을 따라가고, 강조한 항목을 빼면 강조도 없어진다 (다음 항목으로 옮겨 가지 않는다)', () => {
    const id = open({ ...makeSlide('process'), items: ['가', '나', '다', '라'].map(item), options: { highlight: 2 } })
    useDeck.getState().removeItem(id, 0)
    expect(titles()).toEqual(['나', '다', '라'])
    expect(slide().options.highlight).toBe(1)
    useDeck.getState().removeItem(id, 1)
    expect(titles()).toEqual(['나', '라'])
    expect(slide().options.highlight).toBe(-1)
  })

  it('항목을 복제하면 바로 뒤에 새 id로 (같은 id가 둘이면 화면과 AI가 두 항목을 하나로 여긴다)', () => {
    const id = open({ ...makeSlide('process'), items: ['가', '나'].map(item) })
    useDeck.getState().duplicateItem(id, 0)
    expect(titles()).toEqual(['가', '가', '나'])
    expect(new Set(slide().items.map((it) => it.id)).size).toBe(3)
  })

  it('장을 복제하면 정해 둔 컴포넌트 나오는 차례도 복제한 장의 컴포넌트를 따른다', () => {
    const places = [{ x: 0, y: 0, w: 4, h: 12 }, { x: 4, y: 0, w: 4, h: 12 }, { x: 8, y: 0, w: 4, h: 12 }]
    const blocks = (['number', 'message', 'quote'] as const).map((type, i) => ({ ...sampleBlock(type), id: `b${i}`, at: places[i] }))
    const id = open({ ...makeSlide('compose'), blocks, options: { order: ['b2', 'b0'] } })
    useDeck.getState().duplicateSlide(id)
    const [source, copy] = [slide(1), slide(2)]
    expect(copy.blocks!.map((b) => b.id).some((b) => source.blocks!.some((s) => s.id === b))).toBe(false)
    expect(playOrder(copy).map((b) => b.type)).toEqual(['quote', 'number', 'message'])
    expect(playOrder(source).map((b) => b.type)).toEqual(['quote', 'number', 'message'])
  })
})

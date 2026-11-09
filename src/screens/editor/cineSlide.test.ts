import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WHOLE } from '../../deck/blocks'
import { presetRecipe } from '../../deck/cine'
import { createDeck, makeSlide } from '../../deck/generate'
import { useDeck } from '../../store/deckStore'
import { addCineSlide, OPEN_STUDIO, sealDirty, setKnob } from './cineEdit'

// 내 모션 그래픽(라이브러리)에 남기는 것만 가로챈다: 바꾸지 않은 틀은 남기지 않아야 한다
const sealCine = vi.hoisted(() => vi.fn(async () => ({})))
vi.mock('../../store/cines', () => ({ sealCine }))

// 지어낸 주간 보고
const deck = () => createDeck({ type: 'weekly', audience: 'practitioner', minutes: 10, method: 'live', title: '주간 업무 보고', org: '운영팀', presenter: '발표자', theme: 'white' })

describe("'슬라이드 추가'에서 모션 그래픽 넣기 (addCineSlide)", () => {
  const opened: string[] = []
  beforeEach(() => {
    opened.length = 0
    sealCine.mockClear()
    // 모션 편집을 여는 알림은 넣은 고침이 그려진 다음 프레임에 간다
    vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => (f(0), 0))
    vi.stubGlobal('window', { dispatchEvent: (e: Event) => (e.type === OPEN_STUDIO && opened.push((e as CustomEvent<string>).detail), true) })
    useDeck.getState().open(deck())
  })
  afterEach(() => vi.unstubAllGlobals())

  it('고른 슬라이드 다음에 새 슬라이드로 판 가득 넣고, 그 슬라이드를 골라 모션 편집을 연다', () => {
    const before = useDeck.getState().deck!
    const at = before.slides[2]
    const id = addCineSlide(presetRecipe('diffuse', 'l1'), at.id)
    const after = useDeck.getState().deck!
    expect(after.slides).toHaveLength(before.slides.length + 1)
    const added = after.slides[3]
    expect(added.layout).toBe('compose')
    expect(added.blocks).toHaveLength(1)
    expect(added.blocks![0]).toMatchObject({ id, type: 'cine', at: WHOLE })
    expect(after.cines?.[added.blocks![0].cine!]?.preset).toBe('diffuse')
    expect(useDeck.getState().selectedId).toBe(added.id)
    expect(opened).toEqual([id])
  })

  it('고른 슬라이드가 비어 있어도 그 슬라이드를 쓰지 않고 새 슬라이드를 더한다 (슬라이드를 더하려고 누른 것이라)', () => {
    const empty = makeSlide('compose')
    const current = useDeck.getState().deck!
    useDeck.getState().open({ ...current, slides: [...current.slides, empty] })
    addCineSlide(presetRecipe('light', 'l1'), empty.id)
    const after = useDeck.getState().deck!
    expect(after.slides.find((s) => s.id === empty.id)!.blocks ?? []).toHaveLength(0)
    expect(after.slides.at(-1)!.blocks![0].type).toBe('cine')
  })

  it('되돌리기 한 번에 슬라이드와 레시피가 함께 사라진다', () => {
    const before = useDeck.getState().deck!
    addCineSlide(presetRecipe('fill', 'l1'), before.slides[0].id)
    useDeck.getState().undo()
    const back = useDeck.getState().deck!
    expect(back.slides.map((s) => s.id)).toEqual(before.slides.map((s) => s.id))
    expect(back.cines).toEqual(before.cines)
    expect(useDeck.getState().past).toHaveLength(0)
  })

  it('손잡이를 바꾸지 않고 닫으면 내 모션 그래픽에 남기지 않고, 바꾸면 새 갈래로 남긴다', async () => {
    const recipe = presetRecipe('stroke', 'l1')
    addCineSlide(recipe, useDeck.getState().deck!.slides[0].id)
    await sealDirty(useDeck.getState().deck)
    expect(sealCine).not.toHaveBeenCalled()
    const d = useDeck.getState().deck!
    const slide = d.slides[1]
    setKnob(slide.id, slide.blocks![0], recipe, 'pace', 'fast')
    await sealDirty(useDeck.getState().deck)
    expect(sealCine).toHaveBeenCalledTimes(1)
    // 틀에서 새로 넣은 것이라 고치기 전 버전이 없다
    expect(sealCine.mock.calls[0]).toEqual([expect.objectContaining({ preset: 'stroke' }), undefined])
  })
})

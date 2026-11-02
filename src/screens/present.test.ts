import { describe, expect, it } from 'vitest'
import { createDeck } from '../deck/generate'
import { barRoom, endSlideId, startIndex } from './Present'

describe('발표를 시작할 장', () => {
  const deck = createDeck({ type: 'report', audience: 'mixed', minutes: 20, method: 'live', title: '', org: '', presenter: '', theme: 'white' })
  deck.slides[2].hidden = true
  const shown = deck.slides.filter((s) => !s.hidden)

  it('발표에서 뺀 장에서 시작하면 그 뒤의 첫 장부터', () => {
    expect(shown[startIndex(deck, shown, deck.slides[2].id)].id).toBe(deck.slides[3].id)
  })

  it('맨 끝의 뺀 장이면 바로 앞 장부터', () => {
    const last = deck.slides.length - 1
    const d = { ...deck, slides: deck.slides.map((s, i) => (i === last ? { ...s, hidden: true } : s)) }
    const v = d.slides.filter((s) => !s.hidden)
    expect(v[startIndex(d, v, d.slides[last].id)].id).toBe(d.slides[last - 1].id)
  })

  it('고른 장이 없으면 첫 장부터', () => {
    expect(startIndex(deck, shown)).toBe(0)
  })
})

describe('발표를 끝내면 편집기가 고를 장', () => {
  const deck = createDeck({ type: 'report', audience: 'mixed', minutes: 20, method: 'live', title: '', org: '', presenter: '', theme: 'white' })
  deck.slides[2].hidden = true
  const shown = deck.slides.filter((s) => !s.hidden)

  it('발표를 시작한 장이 아니라 마지막으로 보던 장 (PowerPoint, 구글 슬라이드와 같다)', () => {
    expect(endSlideId(shown, 4)).toBe(shown[4].id)
    expect(endSlideId(shown, shown.length - 1)).toBe(shown.at(-1)!.id)
  })

  it('보던 장 번호가 범위 밖이면 가까운 끝 장, 발표할 장이 없으면 고르지 않는다', () => {
    expect(endSlideId(shown, shown.length + 3)).toBe(shown.at(-1)!.id)
    expect(endSlideId(shown, -1)).toBe(shown[0].id)
    expect(endSlideId([], 0)).toBeUndefined()
  })
})

describe('발표 막대의 자리', () => {
  it('윈도우 노트북 창(1280×600, 1366×650)에서는 장 오른쪽 여백에 둔다', () => {
    expect(barRoom(1280, 600)).toBe('side')
    expect(barRoom(1366, 650)).toBe('side')
  })

  it('세로로 긴 창에서는 위 여백에 둔다', () => {
    expect(barRoom(1280, 900)).toBe('top')
  })

  it('여백이 모자란 16:9 전체 화면에서는 장 위에 겹친다', () => {
    expect(barRoom(1920, 1080)).toBe('over')
    expect(barRoom(1280, 720)).toBe('over')
  })
})

// 파일 열기(importDeck): 발표 파일(HTML)로 같은 발표를 열면 그 파일이 담지 않는 노트와 숨긴 슬라이드를 이 PC의 발표에서 이어받는다.
// 이어받지 않던 때는 같은 발표를 HTML 내용으로 바꾸면서 노트와 숨긴 슬라이드가 사라진 것으로 보였다(바뀌기 전 모습은 버전 기록에만 있었다).
// 작업 파일(.deck)은 모두 담으니 파일 그대로 연다
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sendable } from '../deck/fields'
import { createDeck, makeSlide } from '../deck/generate'
import type { Deck } from '../deck/types'

const state = vi.hoisted(() => ({
  /** idb-keyval 흉내: 저장소 이름마다 Map */
  db: new Map<string, Map<string, unknown>>(),
  local: new Map<string, unknown>(),
}))

vi.mock('idb-keyval', () => {
  const at = (store = 'keyval') => state.db.get(store) ?? state.db.set(store, new Map()).get(store)!
  return {
    createStore: (name: string) => name,
    get: async (k: string, store?: string) => at(store).get(k),
    set: async (k: string, v: unknown, store?: string) => void at(store).set(k, v),
    del: async (k: string, store?: string) => void at(store).delete(k),
    entries: async (store?: string) => [...at(store)],
    keys: async (store?: string) => [...at(store).keys()],
  }
})
vi.mock('./library', () => ({
  loadDeck: async (id: string) => state.local.get(id),
  listDecks: async () => [...state.local.values()],
  saveDeck: async (d: { id: string }) => {
    state.local.set(d.id, structuredClone(d))
    return true
  },
  deleteDeck: async (id: string) => void state.local.delete(id),
}))
vi.mock('./folder', () => ({
  folderStatus: async () => ({ kind: 'none' }),
  readFolderDeck: async () => null,
  listFolderDecks: async () => [],
  writeDeckToFolder: async () => true,
  writeVersionToFolder: async () => true,
  trashedDecks: async () => new Map(),
  pendingTrash: async () => new Map(),
  forgetTrash: async () => {},
  trashDeckInFolder: async () => {},
  allowFolder: async () => ({ kind: 'none' }),
  chooseFolder: async () => ({ kind: 'none' }),
}))

const { importDeck } = await import('./persist')
const { listVersions } = await import('./versions')

/** 이 PC의 발표: 장마다 노트, 숨긴 장 하나 */
const mine = (): Deck => {
  const deck = { ...createDeck({ type: 'report', audience: 'peers', minutes: 10, method: 'live', title: '분기 보고', org: '기획팀', presenter: '발표자', theme: 'white' }), id: 'd1' }
  const slides = deck.slides.map((s, i) => ({ ...s, notes: `대본 ${i + 1}` }))
  slides.splice(2, 0, { ...makeSlide('statement'), fields: { title: '숨겨 둔 장' }, hidden: true, notes: '숨긴 장의 대본' })
  return { ...deck, slides }
}
/** 발표 파일(HTML)에 담기는 것만 (JSON으로 한 번 오가며) */
const html = (d: Deck): Deck => JSON.parse(JSON.stringify(sendable(d)))

beforeEach(() => {
  state.db.clear()
  state.local.clear()
})

describe('발표 파일(HTML)로 같은 발표를 열 때', () => {
  it('이 PC의 발표를 내보낸 파일 그대로 열면 아무것도 바꾸지 않는다 (노트와 숨긴 슬라이드 그대로)', async () => {
    const local = mine()
    state.local.set('d1', local)
    const opened = await importDeck(html(local), { sent: true })
    expect(opened).toMatchObject({ saved: true, existed: true, replaced: false, copied: false })
    expect(opened.deck.slides).toEqual(local.slides)
    expect(await listVersions('d1')).toHaveLength(0)
  })

  it('파일 내용으로 바꿔도 파일에 없는 노트와 숨긴 슬라이드는 이 PC의 발표에서 이어받는다', async () => {
    const local = mine()
    state.local.set('d1', local)
    const file = html(local)
    file.slides[0] = { ...file.slides[0], fields: { ...file.slides[0].fields, title: '다른 PC에서 고친 제목' } }
    const opened = await importDeck(file, { sent: true })
    expect(opened).toMatchObject({ saved: true, existed: true, replaced: true })
    const saved = state.local.get('d1') as Deck
    expect(saved.slides[0].fields.title).toBe('다른 PC에서 고친 제목')
    expect(saved.slides.map((s) => s.notes)).toEqual(local.slides.map((s) => s.notes))
    expect(saved.slides[2]).toEqual(local.slides[2])
    // 바뀌기 전 모습도 버전 기록에 남는다
    expect((await listVersions('d1')).map((v) => v.reason)).toEqual(['file'])
  })

  it('이 PC에 없는 발표면 파일에 든 것만으로 연다', async () => {
    const opened = await importDeck(html(mine()), { sent: true })
    expect(opened).toMatchObject({ saved: true, existed: false, replaced: false, copied: false })
    expect(opened.deck.slides.every((s) => !s.notes && !s.hidden)).toBe(true)
  })
})

describe('작업 파일(.deck)로 같은 발표를 열 때', () => {
  it('지금처럼 파일 그대로 바꾼다: 작업 파일의 빈 노트는 비운 것이다', async () => {
    const local = mine()
    state.local.set('d1', local)
    const file = { ...local, slides: local.slides.filter((s) => !s.hidden).map((s) => ({ ...s, notes: '' })) }
    const opened = await importDeck(file)
    expect(opened).toMatchObject({ saved: true, existed: true, replaced: true })
    const saved = state.local.get('d1') as Deck
    expect(saved.slides.map((s) => s.notes).every((n) => n === '')).toBe(true)
    expect(saved.slides.some((s) => s.hidden)).toBe(false)
  })
})

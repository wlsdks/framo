// 파일 열기(importDeck): 발표 파일(HTML)로 같은 발표를 열면 그 파일이 담지 않는 노트와 숨긴 슬라이드를 이 PC의 발표에서 이어받는다.
// 이어받지 않던 때는 같은 발표를 HTML 내용으로 바꾸면서 노트와 숨긴 슬라이드가 사라진 것으로 보였다(바뀌기 전 모습은 버전 기록에만 있었다).
// 작업 파일(.deck)은 모두 담으니 파일 그대로 연다. 어느 파일이든 이 PC의 발표가 파일보다 나중에 고쳐졌으면 바꾸지 않고 사본으로 연다
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parseDeckData } from '../export/exportHtml'
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
/** 발표 파일(HTML)에 담기는 것만 (파일에서 읽는 그대로) */
const html = (d: Deck): Deck => parseDeckData(JSON.stringify(sendable(d)))!
/** 다른 곳에서 고친 파일: 이 PC의 발표보다 나중에 고쳤다 */
const later = (d: Deck): Deck => ({ ...d, updatedAt: d.updatedAt + 60_000 })

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
    // 고친 때도 그대로: 다시 저장해 고친 때만 지금으로 바꾸면 그 뒤에 연 예전 파일보다 나중에 고친 것으로 보인다
    expect(state.local.get('d1')).toEqual(local)
    expect(await listVersions('d1')).toHaveLength(0)
  })

  it('파일 내용으로 바꿔도 파일에 없는 노트와 숨긴 슬라이드는 이 PC의 발표에서 이어받는다', async () => {
    const local = mine()
    state.local.set('d1', local)
    const file = later(html(local))
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
    const file = later({ ...local, slides: local.slides.filter((s) => !s.hidden).map((s) => ({ ...s, notes: '' })) })
    const opened = await importDeck(file)
    expect(opened).toMatchObject({ saved: true, existed: true, replaced: true })
    const saved = state.local.get('d1') as Deck
    expect(saved.slides.map((s) => s.notes).every((n) => n === '')).toBe(true)
    expect(saved.slides.some((s) => s.hidden)).toBe(false)
  })
})

describe('이 PC의 발표가 파일보다 나중에 고쳐졌을 때 (파일을 만든 뒤에 더 고쳤다)', () => {
  // 예전 파일을 열면 그 뒤에 고친 것이 버전 기록으로만 남아, 버전 기록을 찾지 못하는 분에게는 잃은 것과 같았다
  const editedAfter = () => {
    const before = mine()
    const local = { ...before, updatedAt: before.updatedAt + 60_000, slides: before.slides.map((s, i) => (i === 0 ? { ...s, fields: { ...s.fields, title: '내보낸 뒤에 고친 제목' } } : s)) }
    state.local.set('d1', local)
    return { before, local }
  }

  it('발표 파일(HTML): 있던 발표는 그대로 두고 파일을 사본으로 연다', async () => {
    const { before, local } = editedAfter()
    const opened = await importDeck(html(before), { sent: true })
    expect(opened).toMatchObject({ saved: true, existed: true, replaced: false, copied: 'newer' })
    expect(state.local.get('d1')).toEqual(local)
    expect(opened.deck.id).not.toBe('d1')
    expect(opened.deck.title).toBe(`${before.title} 사본`)
    expect(state.local.get(opened.deck.id)).toEqual(opened.deck)
    // 사본은 파일의 내용이고, 파일에 없는 노트는 같은 장의 것을 이어받는다
    expect(opened.deck.slides[0].fields.title).toBe(before.slides[0].fields.title)
    expect(opened.deck.slides.map((s) => s.notes)).toEqual(local.slides.map((s) => s.notes))
    expect(await listVersions('d1')).toHaveLength(0)
  })

  it('작업 파일(.deck)도 같다', async () => {
    const { before, local } = editedAfter()
    const opened = await importDeck(before)
    expect(opened).toMatchObject({ saved: true, existed: true, replaced: false, copied: 'newer' })
    expect(state.local.get('d1')).toEqual(local)
    expect(opened.deck.slides[0].fields.title).toBe(before.slides[0].fields.title)
  })

  it('고친 때를 알 수 없는 파일이면 이 PC의 것을 지킨다', async () => {
    const { before, local } = editedAfter()
    const opened = await importDeck({ ...before, updatedAt: undefined as unknown as number })
    expect(opened).toMatchObject({ replaced: false, copied: 'newer' })
    expect(state.local.get('d1')).toEqual(local)
  })

  it('내용이 같으면 고친 때가 달라도 아무것도 바꾸지 않는다', async () => {
    const local = mine()
    state.local.set('d1', { ...local, updatedAt: local.updatedAt + 60_000 })
    const opened = await importDeck(html(local), { sent: true })
    expect(opened).toMatchObject({ existed: true, replaced: false, copied: false })
    expect(opened.deck.id).toBe('d1')
  })
})

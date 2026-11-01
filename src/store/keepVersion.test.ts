// 덮기 전의 발표를 버전으로 '남겼는지'. saveVersion은 같은 내용이 이미 있어 건너뛴 것과 쓰지 못한 것을 둘 다 null로 돌려주어서,
// 되돌리기와 폴더의 새 발표 가져오기가 남기지 못했는데도 지금 발표를 덮었다(저장 공간이 모자랄 때)
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDeck } from '../deck/generate'
import type { Deck } from '../deck/types'

const state = vi.hoisted(() => ({
  /** idb-keyval 흉내: 저장소 이름마다 Map */
  db: new Map<string, Map<string, unknown>>(),
  /** 이 브라우저(IndexedDB)에 쓰지 못한다 (저장 공간이 모자랄 때) */
  full: false,
  /** 보관 폴더에 쓸 수 있다 */
  folderOk: true,
  local: new Map<string, unknown>(),
  file: null as unknown,
}))

vi.mock('idb-keyval', () => {
  const at = (store = 'keyval') => state.db.get(store) ?? state.db.set(store, new Map()).get(store)!
  return {
    createStore: (name: string) => name,
    get: async (k: string, store?: string) => at(store).get(k),
    set: async (k: string, v: unknown, store?: string) => {
      if (state.full) throw new DOMException('quota', 'QuotaExceededError')
      at(store).set(k, v)
    },
    del: async (k: string, store?: string) => void at(store).delete(k),
    entries: async (store?: string) => [...at(store)],
    keys: async (store?: string) => [...at(store).keys()],
  }
})
vi.mock('./library', () => ({
  loadDeck: async (id: string) => state.local.get(id),
  listDecks: async () => [...state.local.values()],
  saveDeck: vi.fn(async (d: { id: string }) => {
    if (state.full) return false
    state.local.set(d.id, d)
    return true
  }),
  deleteDeck: async (id: string) => void state.local.delete(id),
}))
vi.mock('./folder', () => ({
  folderStatus: async () => ({ kind: 'ready', name: '보관' }),
  readFolderDeck: async () => state.file,
  listFolderDecks: async () => (state.file ? [state.file] : []),
  writeDeckToFolder: vi.fn(async () => state.folderOk),
  writeVersionToFolder: vi.fn(async () => state.folderOk),
  trashedDecks: async () => new Map(),
  pendingTrash: async () => new Map(),
  forgetTrash: async () => {},
  trashDeckInFolder: async () => {},
  allowFolder: async () => ({ kind: 'ready', name: '보관' }),
  chooseFolder: async () => ({ kind: 'ready', name: '보관' }),
}))

const { keepVersion, listVersions, saveVersion } = await import('./versions')
const { loadBestDeck } = await import('./persist')
const folder = await import('./folder')
const library = await import('./library')

const deck = (title: string, updatedAt: number): Deck => ({
  ...createDeck({ type: 'report', audience: 'peers', minutes: 10, method: 'live', title, org: '기획팀', presenter: '이도윤', theme: 'white' }),
  id: 'd1',
  updatedAt,
})

beforeEach(() => {
  state.db.clear()
  state.local.clear()
  state.full = false
  state.folderOk = true
  state.file = null
  vi.clearAllMocks()
})

describe('덮기 전에 버전으로 남기기', () => {
  it('남기면 true, 같은 내용이 이미 기록에 있어 건너뛰어도 true', async () => {
    const d = deck('주간 보고', 1)
    expect(await keepVersion(d, { reason: 'restore' })).toBe(true)
    expect(await saveVersion(d, { reason: 'restore' })).toBeNull()
    expect(await keepVersion(d, { reason: 'restore' })).toBe(true)
    expect(await listVersions('d1')).toHaveLength(1)
  })

  it('기록에 쓰지 못하면 false', async () => {
    state.full = true
    expect(await keepVersion(deck('주간 보고', 1), { reason: 'restore' })).toBe(false)
  })
})

describe('보관 폴더의 더 새 발표를 열 때', () => {
  it('이 브라우저의 기록에 남기지 못하면 보관 폴더의 버전 기록에 남기고 새 발표를 연다', async () => {
    const local = deck('이 브라우저에서 고친 것', 1)
    const file = deck('다른 PC에서 고친 것', 2)
    state.local.set('d1', local)
    state.file = file
    state.full = true
    expect(await loadBestDeck('d1')).toEqual(file)
    expect(folder.writeVersionToFolder).toHaveBeenCalledWith(local, expect.objectContaining({ named: false }))
  })

  it('어디에도 남기지 못하면 덮지 않고 이 브라우저의 것을 연다', async () => {
    const local = deck('이 브라우저에서 고친 것', 1)
    state.local.set('d1', local)
    state.file = deck('다른 PC에서 고친 것', 2)
    state.full = true
    state.folderOk = false
    expect(await loadBestDeck('d1')).toEqual(local)
    expect(library.saveDeck).not.toHaveBeenCalled()
  })

  it('남길 수 있으면 예전처럼 이 브라우저의 기록에 남기고 새 발표로 바꾼다', async () => {
    const local = deck('이 브라우저에서 고친 것', 1)
    const file = deck('다른 PC에서 고친 것', 2)
    state.local.set('d1', local)
    state.file = file
    expect(await loadBestDeck('d1')).toEqual(file)
    expect((await listVersions('d1')).map((v) => v.title)).toEqual(['이 브라우저에서 고친 것'])
    expect(state.local.get('d1')).toEqual(file)
  })
})

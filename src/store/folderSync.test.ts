// 보관 폴더와 맞출 때 지운 발표를 어떻게 다루는지 (persist.ts의 syncWithFolder)
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDeck } from '../deck/generate'
import type { Deck } from '../deck/types'

const state = vi.hoisted(() => ({
  local: new Map<string, unknown>(),
  folder: [] as unknown[],
  /** 보관 폴더의 '지운 발표': id → 지울 때의 고친 시각 */
  trashed: new Map<string, number>(),
  /** 폴더를 쓸 수 없을 때 지워 두고 아직 폴더에 옮기지 못한 것 */
  pending: new Map<string, number>(),
}))

vi.mock('idb-keyval', () => {
  const db = new Map<string, Map<string, unknown>>()
  const at = (store = 'keyval') => db.get(store) ?? db.set(store, new Map()).get(store)!
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
  saveDeck: vi.fn(async (d: { id: string }) => (state.local.set(d.id, d), true)),
  deleteDeck: vi.fn(async (id: string) => void state.local.delete(id)),
}))
vi.mock('./folder', () => ({
  folderStatus: async () => ({ kind: 'ready', name: '보관' }),
  readFolderDeck: async () => null,
  listFolderDecks: async () => state.folder,
  writeDeckToFolder: vi.fn(async () => true),
  writeVersionToFolder: vi.fn(async () => true),
  trashedDecks: async () => state.trashed,
  pendingTrash: async () => state.pending,
  forgetTrash: vi.fn(async (id: string) => void state.pending.delete(id)),
  trashDeckInFolder: vi.fn(async () => {}),
  allowFolder: async () => ({ kind: 'ready', name: '보관' }),
  chooseFolder: async () => ({ kind: 'ready', name: '보관' }),
}))

const { syncWithFolder, useStorage } = await import('./persist')
const folder = await import('./folder')
const library = await import('./library')

const deck = (updatedAt: number): Deck => ({
  ...createDeck({ type: 'report', audience: 'peers', minutes: 10, method: 'live', title: '주간 보고', org: '기획팀', presenter: '이도윤', theme: 'white' }),
  id: 'd1',
  updatedAt,
})

beforeEach(() => {
  state.local.clear()
  state.folder = []
  state.trashed.clear()
  state.pending.clear()
  vi.clearAllMocks()
  useStorage.setState({ folder: { kind: 'ready', name: '보관' } })
})

describe('다른 PC에서 지운 발표', () => {
  it('지운 그대로면 이 PC에서도 목록에서 뺀다', async () => {
    state.local.set('d1', deck(3))
    state.trashed.set('d1', 3)
    await syncWithFolder()
    expect(library.deleteDeck).toHaveBeenCalledWith('d1')
    expect(state.local.has('d1')).toBe(false)
  })

  it('지운 뒤에 이 PC에서 고쳤으면 지우지 않고 폴더에 다시 쓴다 (고친 것을 잃지 않게)', async () => {
    const local = deck(5)
    state.local.set('d1', local)
    state.trashed.set('d1', 3)
    await syncWithFolder()
    expect(library.deleteDeck).not.toHaveBeenCalled()
    expect(folder.writeDeckToFolder).toHaveBeenCalledWith(local)
  })
})

describe('폴더를 쓸 수 없을 때 지운 발표', () => {
  it('폴더와 맞출 때 폴더의 파일도 지운 발표로 옮기고 되살리지 않는다', async () => {
    const file = deck(3)
    state.folder = [file]
    state.pending.set('d1', 3)
    await syncWithFolder()
    expect(folder.trashDeckInFolder).toHaveBeenCalledWith(file)
    expect(library.saveDeck).not.toHaveBeenCalled()
    expect(state.pending.has('d1')).toBe(false)
  })

  it('지운 뒤에 다른 PC에서 고쳤으면 그 발표를 가져온다 (더 새 것이 남는다)', async () => {
    const file = deck(5)
    state.folder = [file]
    state.pending.set('d1', 3)
    await syncWithFolder()
    expect(folder.trashDeckInFolder).not.toHaveBeenCalled()
    expect(library.saveDeck).toHaveBeenCalledWith(file)
    expect(state.pending.has('d1')).toBe(false)
  })
})

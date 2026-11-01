// 보관 폴더를 쓸 수 없을 때(브라우저를 다시 열어 아직 허용하지 않은 때) 지운 발표. 예전에는 폴더의 파일이 그대로 남아,
// 다음에 폴더와 맞추면 '폴더에만 있는 발표'로 보고 되살렸다
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDeck } from '../deck/generate'

const db = vi.hoisted(() => new Map<string, Map<string, unknown>>())
vi.mock('idb-keyval', () => {
  const at = (store = 'keyval') => db.get(store) ?? db.set(store, new Map()).get(store)!
  return {
    createStore: (name: string) => name,
    get: async (k: string, store?: string) => at(store).get(k),
    set: async (k: string, v: unknown, store?: string) => void at(store).set(k, v),
    del: async (k: string, store?: string) => void at(store).delete(k),
    keys: async (store?: string) => [...at(store).keys()],
  }
})

const { forgetTrash, pendingTrash, trashDeckInFolder } = await import('./folder')

beforeEach(() => db.clear())

describe('폴더를 쓸 수 없을 때 지운 발표', () => {
  it('기억해 두었다가 다음에 맞출 때 쓴다 (지울 때의 고친 시각과 함께)', async () => {
    const deck = { ...createDeck({ type: 'report', audience: 'peers', minutes: 10, method: 'live', title: '주간 보고', org: '기획팀', presenter: '이도윤', theme: 'white' }), id: 'd1', updatedAt: 42 }
    await trashDeckInFolder(deck)
    expect(await pendingTrash()).toEqual(new Map([['d1', 42]]))
    await forgetTrash('d1')
    expect(await pendingTrash()).toEqual(new Map())
  })
})

// 내 모션 그래픽: 버전 남기기(봉인), 파일 읽기, 새 버전 알림
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cineId, presetRecipe, withKnob } from '../deck/cine'

const state = vi.hoisted(() => ({ db: new Map<string, unknown>(), file: null as string | null }))

vi.mock('idb-keyval', () => ({
  createStore: (name: string) => name,
  get: async (k: string) => state.db.get(k),
  set: async (k: string, v: unknown) => void state.db.set(k, v),
}))
vi.mock('./folder', () => ({
  readCinesFromFolder: async () => state.file,
  writeCinesToFolder: async (text: string) => {
    state.file = text
    return true
  },
}))

const { importCines, loadCines, newerFor, removeCine, restoreCine, sealCine, useCines, versionNumber } = await import('./cines')
const { decodeCinesFile, encodeCinesFile } = await import('./cinesFile')

beforeEach(() => {
  state.db.clear()
  state.file = null
  useCines.setState({ entries: [], loaded: false })
})

describe('내 모션 그래픽', () => {
  it('봉인: 새 갈래를 만들고, 고친 것은 그 갈래의 새 버전으로(고치기 전 버전을 parent로). 같은 버전은 다시 쌓지 않는다', async () => {
    const v1 = presetRecipe('light', 'l1')
    const v2 = withKnob(v1, 'shape', 'ring')
    await sealCine(v1)
    await sealCine(v2, cineId(v1))
    await sealCine(v2, cineId(v1))
    const [e] = useCines.getState().entries
    expect(e.name).toBe('빛에서 글자로')
    expect(e.versions.map((v) => v.id)).toEqual([cineId(v1), cineId(v2)])
    expect(e.versions[1].parent).toBe(cineId(v1))
    expect(versionNumber(e, cineId(v2))).toBe(2)
    // 같은 틀로 새로 만든 갈래는 번호를 붙인 이름
    await sealCine(presetRecipe('light', 'l2'))
    expect(useCines.getState().entries.map((x) => x.name)).toEqual(['빛에서 글자로 2', '빛에서 글자로'])
  })

  it('발표가 쓰는 버전보다 새 버전이 있을 때만 알린다(라이브러리에 없는 버전은 알리지 않는다)', async () => {
    const v1 = presetRecipe('stroke', 'l1')
    const v2 = withKnob(v1, 'pace', 'fast')
    await sealCine(v1)
    await sealCine(v2)
    const entries = useCines.getState().entries
    expect(newerFor(entries, v1, cineId(v1))?.number).toBe(2)
    expect(newerFor(entries, v2, cineId(v2))).toBeNull()
    expect(newerFor(entries, presetRecipe('stroke', 'other'), cineId(presetRecipe('stroke', 'other')))).toBeNull()
  })

  it('브라우저와 보관 폴더 가운데 새것을 읽고, 지운 것은 그 자리로 되돌린다', async () => {
    await sealCine(presetRecipe('diffuse', 'l1'))
    await sealCine(presetRecipe('gather', 'l2'))
    const file = state.file!
    useCines.setState({ entries: [], loaded: false })
    state.db.clear()
    state.file = file
    await loadCines()
    expect(useCines.getState().entries.map((e) => e.lineage)).toEqual(['l2', 'l1'])
    const gone = await removeCine('l2')
    expect(useCines.getState().entries.map((e) => e.lineage)).toEqual(['l1'])
    await restoreCine(gone!.entry, gone!.index)
    expect(useCines.getState().entries.map((e) => e.lineage)).toEqual(['l2', 'l1'])
  })

  it('파일에서 가져오면 없는 갈래는 더하고, 있는 갈래는 버전을 합친다(같은 버전은 한 번)', async () => {
    const v1 = presetRecipe('gather', 'l1')
    const v2 = withKnob(v1, 'pace', 'fast')
    await sealCine(v1)
    const theirs = decodeCinesFile(encodeCinesFile([
      { lineage: 'l1', name: '모여 맺힘', versions: [{ id: cineId(v1), savedAt: 1, recipe: v1 }, { id: cineId(v2), savedAt: Date.now() + 1000, recipe: v2 }] },
      { lineage: 'l9', name: '받은 장면', versions: [{ id: cineId(presetRecipe('stroke', 'l9')), savedAt: 5, recipe: presetRecipe('stroke', 'l9') }] },
    ]))!
    expect(await importCines(theirs.entries)).toBe(2)
    const entries = useCines.getState().entries
    expect(entries.map((e) => e.lineage)).toEqual(['l9', 'l1'])
    expect(entries[1].versions.map((v) => v.id)).toEqual([cineId(v1), cineId(v2)])
    // 다시 가져오면 바뀌는 것이 없다
    expect(await importCines(theirs.entries)).toBe(0)
  })

  it('파일은 꼴이 맞는 것만 읽는다: 버전 id는 내용으로 다시 셈하고, 레시피에 섞인 글은 뺀다', () => {
    const r = presetRecipe('light', 'l1')
    const text = encodeCinesFile([
      { lineage: 'l1', name: '  우리 팀   표지 ', versions: [{ id: 'cwrongwrong1', savedAt: 5, recipe: { ...r, note: '비밀 계획 문장' } as typeof r }] },
      { lineage: 'l2', name: 'x', versions: [] },
      { lineage: 'l3', name: 'y', versions: [{ id: 'c0', savedAt: 1, recipe: { ...r, lineage: 'other' } }] },
    ])
    const read = decodeCinesFile(text)!
    expect(read.entries).toHaveLength(1)
    expect(read.lost).toBe(2)
    expect(read.entries[0].name).toBe('우리 팀 표지')
    expect(read.entries[0].versions[0].id).toBe(cineId(read.entries[0].versions[0].recipe))
    expect(JSON.stringify(read.entries[0].versions[0].recipe)).not.toMatch(/비밀/)
    expect(decodeCinesFile('{"format":"html-maker/components"}')).toBeNull()
  })
})

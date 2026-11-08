import { createStore, get, set } from 'idb-keyval'
import { create } from 'zustand'
import { cineId, presetSpec } from '../deck/cine'
import type { CineRecipe } from '../deck/types'
import { CINE_KEEP, CINE_NAME_MAX, cleanEntry, decodeCinesFile, encodeCinesFile, type CineEntry } from './cinesFile'
import { readCinesFromFolder, writeCinesToFolder } from './folder'

// 내 모션 그래픽을 두는 곳: 이 브라우저(IndexedDB)와, 보관 폴더를 골랐으면 그 폴더의 파일 하나(내 모션 그래픽.cines).
// 발표와 따로 둔다: 발표를 지워도 남고, 어느 발표에서든 넣는다. 서버나 AI로 보내지 않는다(이름은 사람이 적은 글이다).
// 두 곳 가운데 updatedAt이 큰 쪽을 쓴다(내 컴포넌트, 발표 맞추기와 같은 규칙). 브라우저 데이터를 지워도 폴더에서 돌아온다.
// 발표는 넣을 때의 버전을 품고(deck.cines) 그 버전에 고정된다. 모션 편집에서 고친 것은 편집을 닫거나 장을 옮길 때 새 버전으로 남긴다(sealCine)

const store = createStore('html-maker-cines', 'cines')
const KEY = 'all'

interface CineList {
  updatedAt: number
  entries: CineEntry[]
}

interface CinesState {
  entries: CineEntry[]
  /** 처음 읽기를 마쳤는지 */
  loaded: boolean
}

export const useCines = create<CinesState>(() => ({ entries: [], loaded: false }))

async function readBrowser(): Promise<CineList | null> {
  try {
    const raw = await get<CineList>(KEY, store)
    if (!raw || !Array.isArray(raw.entries)) return null
    const entries = raw.entries.map(cleanEntry).filter((e): e is CineEntry => !!e)
    return { updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : 0, entries }
  } catch {
    return null
  }
}

async function write(entries: CineEntry[]): Promise<boolean> {
  const updatedAt = Date.now()
  useCines.setState({ entries, loaded: true })
  let ok = true
  try {
    await set(KEY, { updatedAt, entries } satisfies CineList, store)
  } catch {
    ok = false
  }
  await writeCinesToFolder(encodeCinesFile(entries, updatedAt))
  return ok
}

/** 브라우저와 폴더에서 읽어 새것을 쓴다. 내 컴포넌트를 열 때마다(그 사이 폴더를 허용했을 수 있다) */
export async function loadCines(): Promise<void> {
  const browser = await readBrowser()
  const text = await readCinesFromFolder()
  const folder = text ? decodeCinesFile(text) : null
  const best = folder && folder.updatedAt > (browser?.updatedAt ?? 0) ? folder : browser
  useCines.setState({ entries: best?.entries ?? [], loaded: true })
  if (best === folder && folder) await set(KEY, { updatedAt: folder.updatedAt, entries: folder.entries } satisfies CineList, store).catch(() => {})
  else if (browser && (!folder || browser.updatedAt > folder.updatedAt)) await writeCinesToFolder(encodeCinesFile(browser.entries, browser.updatedAt))
}

/** 갈래의 버전 번호(1부터). 이 갈래에 없는 버전이면 0 */
export const versionNumber = (entry: CineEntry, id: string) => entry.versions.findIndex((v) => v.id === id) + 1

/** 새 갈래의 이름: 틀 이름에 번호(빛에서 글자로 2). 사람이 바꿀 수 있다 */
function freshName(entries: CineEntry[], recipe: CineRecipe): string {
  const base = presetSpec(recipe.preset).name
  let n = 1
  while (entries.some((e) => e.name === (n === 1 ? base : `${base} ${n}`))) n++
  return n === 1 ? base : `${base} ${n}`
}

/**
 * 이 레시피를 라이브러리에 남긴다(봉인). 이미 있는 버전이면 그대로, 없으면 그 갈래의 새 버전으로(고치기 전 버전을 parent로),
 * 갈래가 없으면 새 갈래로. 남긴 갈래를 맨 앞으로 옮긴다(최근에 쓴 것이 먼저 보이게)
 */
export async function sealCine(recipe: CineRecipe, parent?: string): Promise<CineEntry> {
  const entries = useCines.getState().entries
  const id = cineId(recipe)
  const was = entries.find((e) => e.lineage === recipe.lineage)
  if (was?.versions.some((v) => v.id === id)) return was
  const version = { id, savedAt: Date.now(), ...(parent && parent !== id ? { parent } : was ? { parent: was.versions[was.versions.length - 1].id } : {}), recipe }
  const entry: CineEntry = was ? { ...was, versions: [...was.versions, version].slice(-CINE_KEEP) } : { lineage: recipe.lineage, name: freshName(entries, recipe), versions: [version] }
  await write([entry, ...entries.filter((e) => e !== was)])
  return entry
}

export function renameCine(lineage: string, name: string): Promise<boolean> {
  const clean = name.replace(/\s+/g, ' ').trim().slice(0, CINE_NAME_MAX)
  if (!clean) return Promise.resolve(false)
  return write(useCines.getState().entries.map((e) => (e.lineage === lineage ? { ...e, name: clean } : e)))
}

/** 지운 것과 그 자리(알림의 '되돌리기'로 그 자리에 돌려놓는다). 이 갈래를 쓰던 발표는 제 버전을 품고 있어 그대로 그린다 */
export async function removeCine(lineage: string): Promise<{ entry: CineEntry; index: number } | null> {
  const entries = useCines.getState().entries
  const index = entries.findIndex((e) => e.lineage === lineage)
  if (index < 0) return null
  await write(entries.filter((e) => e.lineage !== lineage))
  return { entry: entries[index], index }
}

export function restoreCine(entry: CineEntry, index: number): Promise<boolean> {
  const entries = useCines.getState().entries.filter((e) => e.lineage !== entry.lineage)
  entries.splice(Math.min(index, entries.length), 0, entry)
  return write(entries)
}

/**
 * 발표가 쓰는 버전보다 라이브러리에 새 버전이 있으면 그 갈래와 새 버전 번호. 발표의 버전이 라이브러리에 없으면(다른 사람의 발표)
 * 어느 쪽이 새것인지 몰라 알리지 않는다
 */
export function newerFor(entries: CineEntry[], recipe: CineRecipe | undefined, id: string | undefined): { entry: CineEntry; number: number } | null {
  if (!recipe || !id) return null
  const entry = entries.find((e) => e.lineage === recipe.lineage)
  if (!entry) return null
  const now = versionNumber(entry, id)
  return now > 0 && now < entry.versions.length ? { entry, number: entry.versions.length } : null
}

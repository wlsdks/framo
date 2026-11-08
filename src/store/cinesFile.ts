import { cineId, cleanRecipe, isCineId } from '../deck/cine'
import type { CineRecipe } from '../deck/types'

// 내 모션 그래픽 파일(.cines): 내가 만든 모션 그래픽의 갈래와 버전들. 보관 폴더에 하나를 두고(사라지지 않게), 다른 사람과 주고받을 때도
// 같은 파일을 쓴다. 내 컴포넌트 파일(.components)에 넣지 않는다: 예전 버전이 그 파일을 다시 쓰면 모르는 항목(모션 그래픽)을 지운다.
// 이름은 사람이 적은 글이라 이 파일(과 브라우저의 목록)에만 있다: 발표, 레시피, AI에게 보이는 모양에는 없다

export const CINES_EXT = '.cines'
const FORMAT = 'html-maker/cines'
const VERSION = 1
export const CINE_NAME_MAX = 40
/** 한 갈래에 남기는 버전 수. 넘으면 오래된 것부터 뺀다(발표는 제 버전을 품고 있어서 라이브러리에서 빠져도 그대로 그린다) */
export const CINE_KEEP = 30

interface CineVersion {
  /** 내용 해시(deck/cine.ts의 cineId) */
  id: string
  savedAt: number
  /** 고치기 전 버전 */
  parent?: string
  recipe: CineRecipe
}

/** 갈래 하나: 처음 만든 것과 고친 버전들(오래된 것부터) */
export interface CineEntry {
  lineage: string
  name: string
  versions: CineVersion[]
}

interface CinesFileData {
  format: typeof FORMAT
  version: number
  updatedAt: number
  entries: CineEntry[]
}

export function encodeCinesFile(entries: CineEntry[], updatedAt = Date.now()): string {
  const data: CinesFileData = { format: FORMAT, version: VERSION, updatedAt, entries }
  return JSON.stringify(data)
}

const cleanName = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, CINE_NAME_MAX) : '')

/**
 * 갈래 하나를 정해진 꼴로: 레시피의 꼴이 맞는 버전만(id는 내용 해시로 다시 셈한다: 손으로 고친 파일이 다른 버전 id를 달고 오면
 * 같은 id에 다른 레시피가 생긴다). 버전이 하나도 없으면 null
 */
export function cleanEntry(raw: unknown): CineEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const e = raw as Partial<CineEntry>
  if (typeof e.lineage !== 'string' || !Array.isArray(e.versions)) return null
  const seen = new Set<string>()
  const versions: CineVersion[] = []
  for (const v of e.versions) {
    const recipe = v && typeof v === 'object' ? cleanRecipe((v as CineVersion).recipe) : null
    if (!recipe || recipe.lineage !== e.lineage) continue
    const id = cineId(recipe)
    if (seen.has(id)) continue
    seen.add(id)
    const at = (v as CineVersion).savedAt
    const parent = (v as CineVersion).parent
    versions.push({ id, savedAt: typeof at === 'number' && Number.isFinite(at) ? at : 0, ...(isCineId(parent) ? { parent } : {}), recipe })
  }
  if (!versions.length) return null
  return { lineage: e.lineage, name: cleanName(e.name) || '모션 그래픽', versions: versions.slice(-CINE_KEEP) }
}

/** 파일을 읽어 정해진 꼴로. 꼴이 맞지 않는 항목은 빼고 몇 개를 뺐는지(lost) 센다 */
export function decodeCinesFile(text: string): { entries: CineEntry[]; updatedAt: number; lost: number } | null {
  try {
    const data = JSON.parse(text) as Partial<CinesFileData>
    if (data.format !== FORMAT || !Array.isArray(data.entries)) return null
    const entries: CineEntry[] = []
    for (const raw of data.entries) {
      const e = cleanEntry(raw)
      if (e && !entries.some((x) => x.lineage === e.lineage)) entries.push(e)
    }
    return { entries, updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : 0, lost: data.entries.length - entries.length }
  } catch {
    return null
  }
}

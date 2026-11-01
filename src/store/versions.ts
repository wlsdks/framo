import { createStore, del, entries, get, set } from 'idb-keyval'
import { slideName } from '../deck/blocks'
import { uid } from '../deck/generate'
import type { Deck } from '../deck/types'
import { writeVersionToFolder } from './folder'

/*
 * 버전 기록. 목록(가벼운 정보)과 내용(덱 전체)을 따로 저장해서 목록은 빨리 뜨게 한다.
 * - 이름 붙인 버전: 지우기 전까지 남는다.
 * - 자동 버전: 열 때, 고치는 중 10분마다, 발표·내보내기 전, 되돌리기 전에 남긴다. 발표마다 최근 30개.
 */

const listeners = new Set<() => void>()
/** 버전이 생기거나 지워질 때 알림을 받는다. 돌려준 함수를 부르면 그만 받는다. */
export function onVersionsChange(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
const changed = () => listeners.forEach((fn) => fn())

const metaStore = createStore('html-maker-version-list', 'versions')
const dataStore = createStore('html-maker-version-data', 'versions')
const AUTO_KEEP = 30
export const AUTO_INTERVAL = 10 * 60 * 1000

export type VersionReason = 'open' | 'interval' | 'present' | 'export' | 'restore' | 'file' | 'ai'

export interface DeckVersion {
  id: string
  deckId: string
  createdAt: number
  /** 이름 붙인 버전이면 그 이름 */
  name: string
  named: boolean
  reason?: VersionReason
  title: string
  slideCount: number
  /** 같은 내용을 두 번 남기지 않으려고 비교하는 값 */
  signature: string
  /** 장마다의 비교 값. 앞 버전과 비교해 어느 장이 바뀌었는지 보여 준다. */
  slides: { id: string; purpose: string; sig: string }[]
}

export interface VersionChanges {
  changed: string[]
  added: string[]
  removed: string[]
}

/** older 버전에서 newer 버전으로 오면서 바뀐 장들 */
export function versionChanges(newer: DeckVersion, older?: DeckVersion): VersionChanges {
  if (!older || newer.signature === older.signature) return { changed: [], added: [], removed: [] }
  const before = new Map(older.slides.map((s) => [s.id, s]))
  const after = new Set(newer.slides.map((s) => s.id))
  return {
    changed: newer.slides.filter((s) => before.has(s.id) && before.get(s.id)!.sig !== s.sig).map((s) => s.purpose),
    added: newer.slides.filter((s) => !before.has(s.id)).map((s) => s.purpose),
    removed: older.slides.filter((s) => !after.has(s.id)).map((s) => s.purpose),
  }
}

/**
 * 버전으로 되돌린 뒤 보여 줄 장. 되돌리기(deckStore의 shownAfter)와 같은 뜻을 내용으로 견준다: 버전은 저장소에서 새로 읽어서 장이 모두 새 객체다.
 * 보던 장이 바뀌었으면 그대로, 보던 장은 같고 다른 장이 바뀌었거나 되살아났으면 그 첫 장, 보던 장이 버전에 없으면 바뀐 첫 장(없으면 그 자리의 장).
 * 예전에는 늘 첫 장(표지)을 보여 줘서, 보던 장을 되돌려도 무엇이 돌아왔는지 그 장을 다시 찾아 눌러야 보였다
 */
export function slideAfterRestore(from: Deck, to: Deck, selectedId: string | null): string | null {
  const was = new Map(from.slides.map((s) => [s.id, JSON.stringify(s)]))
  const changed = to.slides.filter((s) => was.get(s.id) !== JSON.stringify(s))
  if (to.slides.some((s) => s.id === selectedId)) return changed.length && !changed.some((s) => s.id === selectedId) ? changed[0].id : selectedId
  if (changed.length) return changed[0].id
  const at = from.slides.findIndex((s) => s.id === selectedId)
  return to.slides[Math.min(Math.max(at, 0), to.slides.length - 1)]?.id ?? null
}

export const REASON_LABEL: Record<VersionReason, string> = {
  open: '열었을 때',
  interval: '고치는 중',
  present: '발표하기 전',
  export: '내보내기 전',
  restore: '되돌리기 전',
  file: '파일을 열기 전',
  ai: 'AI 제안을 적용하기 전',
}

/**
 * 내용이 같은지 보는 짧은 값. id, 만든·고친 시각, 저장 형식 번호, AI 공유처럼 내용이 아닌 것만 빼고 모두 넣는다.
 * 예전에는 제목, 정보, 테마, 장 넷만 넣어서 발표 전체의 움직임만 바꾸면 같은 내용으로 보고, 파일을 열거나 폴더와 맞출 때
 * 버전 없이 덮어썼다. 넷 밖의 값은 있을 때만 넣어, 예전에 저장한 버전의 서명과 그대로 맞는다
 */
export function deckSignature(deck: Deck): string {
  const { id, version, createdAt, updatedAt, aiShare, title, meta, theme, slides, ...rest } = deck
  return hash(JSON.stringify(Object.keys(rest).length ? [title, meta, theme, slides, rest] : [title, meta, theme, slides]))
}

/** 장마다의 비교 값 */
export function slideSignatures(deck: Deck): DeckVersion['slides'] {
  return deck.slides.map((s) => ({ id: s.id, purpose: slideName(s), sig: hash(JSON.stringify(s)) }))
}

function hash(text: string): string {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return `${text.length}:${(h >>> 0).toString(36)}`
}

export async function listVersions(deckId: string): Promise<DeckVersion[]> {
  try {
    const all = await entries<string, DeckVersion>(metaStore)
    return all
      .map(([, v]) => v)
      .filter((v) => v.deckId === deckId)
      .sort((a, b) => b.createdAt - a.createdAt)
  } catch {
    return []
  }
}

export async function loadVersionDeck(id: string): Promise<Deck | undefined> {
  try {
    return await get<Deck>(id, dataStore)
  } catch {
    return undefined
  }
}

interface SaveOptions {
  name?: string
  reason?: VersionReason
}

/**
 * 버전을 남긴다. 자동 버전은 같은 내용이 이미 기록에 있으면 건너뛴다.
 * 남겼으면 그 버전을, 건너뛰었으면 null을 돌려준다.
 */
export function saveVersion(deck: Deck, options: SaveOptions = {}): Promise<DeckVersion | null> {
  // 한 줄로 세워야 '앞 버전과 같은지' 비교가 맞다
  const run = queue.then(() => saveVersionNow(deck, options))
  queue = run.catch(() => null)
  return run
}
let queue: Promise<unknown> = Promise.resolve()

async function saveVersionNow(deck: Deck, { name, reason }: SaveOptions): Promise<DeckVersion | null> {
  const named = !!name?.trim()
  const signature = deckSignature(deck)
  const existing = await listVersions(deck.id)
  // 자동 버전은 이미 같은 내용의 버전이 있으면 남기지 않는다 (되돌린 직후 등)
  if (!named && existing.some((v) => v.signature === signature)) return null

  const version: DeckVersion = {
    id: uid(),
    deckId: deck.id,
    createdAt: Date.now(),
    name: named ? name!.trim() : '',
    named,
    reason: named ? undefined : reason,
    title: deck.title,
    slideCount: deck.slides.filter((s) => !s.hidden).length,
    signature,
    slides: slideSignatures(deck),
  }
  try {
    await set(version.id, structuredClone(deck), dataStore)
    await set(version.id, version, metaStore)
  } catch {
    return null
  }
  void writeVersionToFolder(deck, { createdAt: version.createdAt, name: version.name, named })
  if (!named) await pruneAuto([version, ...existing])
  changed()
  return version
}

/**
 * 덮기 전의 발표를 버전으로 남기고, 기록에 남았는지 알려 준다(남겼거나 같은 내용이 이미 있으면 true).
 * saveVersion은 같은 내용이 있어 건너뛴 것과 쓰지 못한 것을 둘 다 null로 돌려주어서, 되돌리기와 폴더의 새 발표 가져오기가
 * 남기지 못했는데도(저장 공간이 모자랄 때) 지금 발표를 덮었다
 */
export async function keepVersion(deck: Deck, options: SaveOptions = {}): Promise<boolean> {
  if (await saveVersion(deck, options)) return true
  const signature = deckSignature(deck)
  return (await listVersions(deck.id)).some((v) => v.signature === signature)
}

async function pruneAuto(versions: DeckVersion[]) {
  const autos = versions.filter((v) => !v.named)
  for (const v of autos.slice(AUTO_KEEP)) await deleteVersion(v.id)
}

/** 이름을 붙이면 자동 정리 대상에서 빠진다. 보관 폴더에도 그 이름으로 한 벌 남긴다. */
export async function renameVersion(version: DeckVersion, name: string): Promise<DeckVersion> {
  const next = { ...version, name: name.trim(), named: !!name.trim() || version.named }
  await set(version.id, next, metaStore).catch(() => {})
  const deck = await loadVersionDeck(version.id)
  if (deck && next.named) void writeVersionToFolder(deck, { createdAt: next.createdAt, name: next.name, named: true })
  changed()
  return next
}

export async function deleteVersion(id: string): Promise<void> {
  await del(id, metaStore).catch(() => {})
  await del(id, dataStore).catch(() => {})
  changed()
}

export async function deleteDeckVersions(deckId: string): Promise<void> {
  for (const v of await listVersions(deckId)) await deleteVersion(v.id)
}

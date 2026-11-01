import { create } from 'zustand'
import type { Deck } from '../deck/types'
import { heldElsewhere } from './deckLock'
import { useDeck } from './deckStore'
import {
  allowFolder,
  chooseFolder,
  folderStatus,
  listFolderDecks,
  readFolderDeck,
  trashDeckInFolder,
  trashedDeckIds,
  writeDeckToFolder,
  writeVersionToFolder,
  type FolderStatus,
} from './folder'
import { deleteDeck, listDecks, loadDeck, saveDeck } from './library'
import { reconcile } from './reconcile'
import { unshareDeck } from '../ai/client'
import { uid } from '../deck/generate'
import { deckSignature, deleteDeckVersions, keepVersion } from './versions'

/*
 * 저장은 두 곳에 한다.
 * 1. 이 브라우저(IndexedDB): 늘 저장. 빠르지만 기록을 지우면 사라질 수 있다.
 * 2. 보관 폴더: 폴더를 골라 두면 같이 저장. 브라우저와 상관없이 남는다.
 */

export type WriteState = 'idle' | 'saving' | 'saved' | 'failed'

interface StorageState {
  folder: FolderStatus | null
  browser: WriteState
  folderWrite: WriteState
  lastSavedAt: number | null
  refresh(): Promise<FolderStatus>
  choose(): Promise<FolderStatus>
  allow(): Promise<FolderStatus>
}

export const useStorage = create<StorageState>((set) => ({
  folder: null,
  browser: 'idle',
  folderWrite: 'idle',
  lastSavedAt: null,
  async refresh() {
    const folder = await folderStatus()
    set({ folder })
    return folder
  },
  async choose() {
    const folder = await chooseFolder()
    set({ folder })
    if (folder.kind === 'ready') await syncWithFolder()
    return folder
  },
  async allow() {
    const folder = await allowFolder()
    set({ folder })
    if (folder.kind === 'ready') await syncWithFolder()
    return folder
  },
}))

let persistAsked = false
/** 브라우저가 저장 공간을 함부로 비우지 않도록 요청한다. 허락 여부와 상관없이 저장은 계속된다. */
function askPersistent() {
  if (persistAsked) return
  persistAsked = true
  navigator.storage?.persist?.().catch(() => {})
}

/** 브라우저에 저장. 편집 중에는 자주 부른다. */
export async function saveToBrowser(deck: Deck): Promise<boolean> {
  // 다른 창이 넘겨받아 고치는 발표는 이 창이 들고 있던 것으로 덮지 않는다 (deckLock.ts)
  if (heldElsewhere(deck.id)) return false
  askPersistent()
  useStorage.setState({ browser: 'saving' })
  const ok = await saveDeck(deck)
  useStorage.setState({ browser: ok ? 'saved' : 'failed', lastSavedAt: ok ? Date.now() : useStorage.getState().lastSavedAt })
  return ok
}

/** 보관 폴더에 저장. 폴더가 준비되지 않았으면 아무것도 하지 않는다. */
export async function saveToFolder(deck: Deck): Promise<boolean> {
  if (heldElsewhere(deck.id)) return false
  const folder = useStorage.getState().folder ?? (await useStorage.getState().refresh())
  if (folder.kind !== 'ready') return false
  useStorage.setState({ folderWrite: 'saving' })
  const ok = await writeDeckToFolder(deck)
  useStorage.setState({ folderWrite: ok ? 'saved' : 'failed' })
  return ok
}

/** 새로 만들거나 들여온 발표를 두 곳에 바로 저장한다 */
export async function persistNow(deck: Deck): Promise<boolean> {
  const ok = await saveToBrowser(deck)
  await saveToFolder(deck)
  return ok
}

/**
 * 보관 폴더의 더 새 발표로 덮기 전에 이 브라우저의 것을 버전으로 남긴다. 이 브라우저의 기록에 남기지 못하면(저장 공간이
 * 모자랄 때) 보관 폴더의 '버전 기록'에라도 남긴다(파일 열기로 다시 열 수 있다). 어디에도 남기지 못하면 false: 덮지 않는다
 */
async function backupBeforeTake(local: Deck): Promise<boolean> {
  if (await keepVersion(local, { reason: 'file' })) return true
  return writeVersionToFolder(local, { createdAt: Date.now(), name: '', named: false })
}

/**
 * 폴더와 브라우저를 맞춘다. 더 최근에 고친 쪽을 남기고,
 * 브라우저 쪽을 덮어쓸 때는 덮이기 전 상태를 버전으로 남긴다.
 */
export async function syncWithFolder(): Promise<void> {
  const status = useStorage.getState().folder
  if (status?.kind !== 'ready') return
  const inFolder = await listFolderDecks()
  const seen = new Set<string>()
  for (const fileDeck of inFolder) {
    seen.add(fileDeck.id)
    // 편집기에 열려 있는 발표는 저장소가 아니라 화면에 있는 것과 비교한다
    const editing = useDeck.getState().deck
    const local = editing?.id === fileDeck.id ? editing : await loadDeck(fileDeck.id)
    const r = reconcile(local, fileDeck)
    if (r.action === 'take') {
      if (local && r.backup && !(await backupBeforeTake(local))) continue
      await saveDeck(fileDeck)
      if (editing?.id === fileDeck.id) useDeck.getState().open(fileDeck)
    } else if (r.action === 'write' && local) await writeDeckToFolder(local)
  }
  // 폴더에 없는 발표: 다른 PC에서 지웠으면 여기서도 목록에서 뺀다. 그 밖에는 폴더로 옮겨 둔다.
  const trashed = await trashedDeckIds()
  for (const local of await listDecks()) {
    if (seen.has(local.id)) continue
    if (trashed.has(local.id)) await deleteDeck(local.id)
    else await writeDeckToFolder(local)
  }
}

/**
 * 편집기를 열 때 쓸 발표. 폴더와 브라우저 중 더 최근 것을 고른다.
 * 다른 PC에서 고친 내용이 폴더에 있으면 그걸 연다.
 */
export async function loadBestDeck(id: string): Promise<Deck | undefined> {
  const local = await loadDeck(id)
  const status = await useStorage.getState().refresh()
  if (status.kind !== 'ready') return local
  const fileDeck = await readFolderDeck(id)
  const r = reconcile(local, fileDeck)
  if (r.action === 'take' && fileDeck) {
    if (local && r.backup && !(await backupBeforeTake(local))) return local
    await saveDeck(fileDeck)
    return fileDeck
  }
  if (r.action === 'write' && local) void writeDeckToFolder(local)
  return local
}

export interface Imported {
  deck: Deck
  /** 이 브라우저에 저장했는지 */
  saved: boolean
  /** 같은 발표가 있어서 파일 내용으로 바꿨다 (바뀌기 전은 버전 기록에 있다) */
  replaced: boolean
  /** 같은 발표가 있는데 바뀌기 전을 버전으로 남기지 못해서, 덮어쓰지 않고 사본으로 열었다 */
  copied: boolean
}

/**
 * 내려받아 둔 작업 파일을 연다. 같은 발표가 이미 있으면 지금 상태를 버전으로 남기고 파일 내용으로 바꾼다.
 * 버전 기록에 남았는지 확인하지 못하면 있던 발표를 덮어쓰지 않고 사본으로 연다.
 */
export async function importDeck(deck: Deck): Promise<Imported> {
  const local = await loadDeck(deck.id)
  const now = Date.now()
  // 가져온 발표는 AI 공유를 끈 채로 시작한다. 공유는 발표마다 사람이 켠다.
  let next: Deck = { ...deck, aiShare: false, updatedAt: now }
  let replaced = false
  let copied = false
  if (local && deckSignature(local) !== deckSignature(deck)) {
    if (await keepVersion(local, { reason: 'file' })) replaced = true
    else {
      next = { ...next, id: uid(), title: `${deck.title} 사본`, createdAt: now }
      copied = true
    }
  }
  const saved = await persistNow(next)
  return { deck: next, saved, replaced, copied }
}

export async function removeDeck(deck: Deck): Promise<void> {
  if (deck.aiShare) await unshareDeck(deck)
  await trashDeckInFolder(deck)
  await deleteDeck(deck.id)
  await deleteDeckVersions(deck.id)
}

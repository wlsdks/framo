import { create } from 'zustand'
import type { Deck } from '../deck/types'
import { heldElsewhere } from './deckLock'
import { useDeck } from './deckStore'
import {
  allowFolder,
  chooseFolder,
  folderStatus,
  forgetTrash,
  listFolderDecks,
  pendingTrash,
  readFolderDeck,
  trashDeckInFolder,
  trashedDecks,
  writeDeckToFolder,
  writeVersionToFolder,
  type FolderStatus,
} from './folder'
import { deleteDeck, listDecks, loadDeck, saveDeck } from './library'
import { reconcile } from './reconcile'
import { unshareDeck } from '../ai/client'
import { withUnsent } from '../deck/fields'
import { uid } from '../deck/generate'
import { deckSignature, deleteDeckVersions, keepVersion } from './versions'

/*
 * 저장은 두 곳에 한다.
 * 1. 이 브라우저(IndexedDB): 늘 저장. 빠르지만 기록을 지우면 사라질 수 있다.
 * 2. 보관 폴더: 폴더를 골라 두면 같이 저장. 브라우저와 상관없이 남는다.
 */

type WriteState = 'idle' | 'saving' | 'saved' | 'failed'

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
  const pending = await pendingTrash()
  const seen = new Set<string>()
  for (const fileDeck of inFolder) {
    seen.add(fileDeck.id)
    // 폴더를 쓸 수 없을 때 지운 발표: 지울 때 그대로면 폴더에서도 '지운 발표'로 옮긴다. 그 뒤에 다른 PC에서 고쳤으면 아래에서 가져온다
    const gone = pending.get(fileDeck.id)
    if (gone !== undefined) {
      await forgetTrash(fileDeck.id)
      if (fileDeck.updatedAt <= gone) {
        await trashDeckInFolder(fileDeck)
        continue
      }
    }
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
  // 폴더에 없는 발표: 다른 PC에서 지웠으면 여기서도 목록에서 뺀다. 지운 뒤에 이 PC에서 고쳤으면 지우지 않고 폴더에 다시
  // 쓴다(지운 발표의 시각만 보고 지우면 그 뒤에 고친 것을 잃었다). 그 밖에는 폴더로 옮겨 둔다
  const trashed = await trashedDecks()
  for (const local of await listDecks()) {
    if (seen.has(local.id)) continue
    const gone = trashed.get(local.id)
    if (gone !== undefined && local.updatedAt <= gone) await deleteDeck(local.id)
    else await writeDeckToFolder(local)
  }
  // 폴더에 파일이 없던 기억은 쓸 데가 없다
  for (const id of pending.keys()) if (!seen.has(id)) await forgetTrash(id)
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

interface Imported {
  deck: Deck
  /** 이 브라우저에 저장했는지 */
  saved: boolean
  /** 같은 발표가 이 PC에 있었다 */
  existed: boolean
  /** 같은 발표가 있어서 파일 내용으로 바꿨다 (바뀌기 전은 버전 기록에 있다) */
  replaced: boolean
  /**
   * 같은 발표가 있는데 덮어쓰지 않고 파일을 사본으로 열었다. newer: 이 PC의 발표가 파일보다 나중에 고쳐졌다.
   * unsaved: 바뀌기 전을 버전으로 남기지 못했다
   */
  copied: false | 'newer' | 'unsaved'
}

/**
 * 내려받아 둔 작업 파일(.deck)이나 발표 파일(HTML)을 연다. 같은 발표가 이미 있으면 지금 상태를 버전으로 남기고 파일 내용으로 바꾼다.
 * 이 PC의 발표가 파일에 담긴 발표보다 나중에 고쳐졌으면(파일을 만든 뒤에 더 고쳤으면) 바꾸지 않고 파일을 사본으로 연다: 예전 파일을 열면
 * 그 뒤에 고친 것이 버전 기록으로만 남았는데, 버전 기록을 찾지 못하는 분에게는 고친 것을 잃은 것과 같았다.
 * 버전 기록에 남았는지 확인하지 못해도 있던 발표를 덮어쓰지 않고 사본으로 연다.
 * sent: 발표 파일에서 읽은 발표. 발표 파일은 노트, 숨긴 장, 가려진 칸을 담지 않으므로(deck/fields.ts의 sendable) 같은 발표가 있으면 그것들을
 * 그 발표에서 이어받는다(withUnsent): 파일의 빈 노트는 지운 것이 아니라 담기지 않은 것이다. 작업 파일은 모두 담으니 파일 그대로 연다
 */
export async function importDeck(deck: Deck, { sent = false }: { sent?: boolean } = {}): Promise<Imported> {
  const local = await loadDeck(deck.id)
  const now = Date.now()
  // 가져온 발표는 AI 공유를 끈 채로 시작한다. 공유는 발표마다 사람이 켠다.
  let next: Deck = { ...(sent && local ? withUnsent(deck, local) : deck), aiShare: false, updatedAt: now }
  // 같은 내용이면 있던 발표를 그대로 연다: 고친 때(updatedAt)와 AI 공유도 그대로. 다시 저장하면 고친 때만 지금으로 바뀌어, 그 뒤에 연 예전
  // 파일과 견줄 때 이 PC의 발표가 더 나중에 고쳐진 것으로 보였다
  if (local && deckSignature(local) === deckSignature(next)) return { deck: local, saved: true, existed: true, replaced: false, copied: false }
  let replaced = false
  let copied: Imported['copied'] = false
  if (local) {
    // 파일에 담긴 발표가 고쳐진 때. 없거나 숫자가 아니면 알 수 없으니 이 PC의 것을 지킨다
    const newerHere = !(typeof deck.updatedAt === 'number' && deck.updatedAt >= local.updatedAt)
    if (!newerHere && (await keepVersion(local, { reason: 'file' }))) replaced = true
    else {
      next = { ...next, id: uid(), title: `${deck.title} 사본`, createdAt: now }
      copied = newerHere ? 'newer' : 'unsaved'
    }
  }
  const saved = await persistNow(next)
  return { deck: next, saved, existed: !!local, replaced, copied }
}

export async function removeDeck(deck: Deck): Promise<void> {
  if (deck.aiShare) await unshareDeck(deck)
  await trashDeckInFolder(deck)
  await deleteDeck(deck.id)
  await deleteDeckVersions(deck.id)
}

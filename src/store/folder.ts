import { del, get, keys, set } from 'idb-keyval'
import type { Deck } from '../deck/types'
import { DECK_EXT, decodeDeckFile, encodeDeckFile, fileStamp, safeFileName } from './deckFile'
import { CINES_EXT } from './cinesFile'
import { PARTS_EXT } from './partsFile'
import { settings } from './settings'

/*
 * 보관 폴더: 사용자가 고른 PC 폴더(또는 회사 드라이브의 폴더)에 작업 파일을 자동으로 쓴다.
 * 크롬, 엣지의 File System Access API를 쓰고, 폴더 핸들은 이 브라우저에 기억해 둔다.
 * 파일 이름은 처음 저장할 때 정하고 그 뒤로는 바꾸지 않는다. 발표 제목을 바꿔도 파일은 그대로다.
 */

const FOLDER_KEY = 'folder'
const VERSIONS_DIR = '버전 기록'
const TRASH_DIR = '지운 발표'
const AUTO_KEEP = 10
const AUTO_SUFFIX = ` 자동${DECK_EXT}`
/** 내 컴포넌트를 담는 파일 (발표 파일과 같은 폴더에 하나) */
const PARTS_FILE = `내 컴포넌트${PARTS_EXT}`
/** 내 모션 그래픽을 담는 파일. 내 컴포넌트 파일과 따로다(예전 버전이 그 파일을 다시 쓰면 모르는 항목을 지운다) */
const CINES_FILE = `내 모션 그래픽${CINES_EXT}`

type Mode = { mode: 'readwrite' }
const RW: Mode = { mode: 'readwrite' }

interface PermissionHandle {
  queryPermission(options: Mode): Promise<PermissionState>
  requestPermission(options: Mode): Promise<PermissionState>
}

type DirectoryPicker = (options: { id?: string; mode?: 'readwrite'; startIn?: string }) => Promise<FileSystemDirectoryHandle>

export type FolderStatus =
  | { kind: 'unsupported' }
  | { kind: 'none' }
  /** 폴더는 정했지만 이번에 다시 허용을 받아야 한다 */
  | { kind: 'locked'; name: string }
  | { kind: 'ready'; name: string }

function picker(): DirectoryPicker | undefined {
  return (window as unknown as { showDirectoryPicker?: DirectoryPicker }).showDirectoryPicker
}

export function folderSupported(): boolean {
  return typeof picker() === 'function'
}

async function storedFolder(): Promise<FileSystemDirectoryHandle | undefined> {
  try {
    return await get<FileSystemDirectoryHandle>(FOLDER_KEY, settings)
  } catch {
    return undefined
  }
}

async function permission(dir: FileSystemDirectoryHandle, ask: boolean): Promise<PermissionState> {
  const h = dir as unknown as PermissionHandle
  try {
    return ask ? await h.requestPermission(RW) : await h.queryPermission(RW)
  } catch {
    return 'denied'
  }
}

export async function folderStatus(): Promise<FolderStatus> {
  if (!folderSupported()) return { kind: 'unsupported' }
  const dir = await storedFolder()
  if (!dir) return { kind: 'none' }
  return (await permission(dir, false)) === 'granted' ? { kind: 'ready', name: dir.name } : { kind: 'locked', name: dir.name }
}

/** 버튼을 눌렀을 때만 부른다 (브라우저가 사용자 동작 안에서만 폴더 창을 연다) */
export async function chooseFolder(): Promise<FolderStatus> {
  const pick = picker()
  if (!pick) return { kind: 'unsupported' }
  try {
    const dir = await pick({ id: 'html-maker', mode: 'readwrite', startIn: 'documents' })
    await set(FOLDER_KEY, dir, settings)
    // 앞 폴더에서 쓰던 파일 이름은 버린다. 새 폴더의 다른 발표 파일을 덮어쓰지 않도록.
    for (const key of await keys<string>(settings)) if (key.startsWith('file:')) await del(key, settings)
    verified.clear()
    await indexFolder(dir)
    return { kind: 'ready', name: dir.name }
  } catch {
    return folderStatus()
  }
}

/** 버튼을 눌렀을 때만 부른다 */
export async function allowFolder(): Promise<FolderStatus> {
  const dir = await storedFolder()
  if (!dir) return folderStatus()
  return (await permission(dir, true)) === 'granted' ? { kind: 'ready', name: dir.name } : { kind: 'locked', name: dir.name }
}

async function readyFolder(): Promise<FileSystemDirectoryHandle | null> {
  const dir = await storedFolder()
  if (!dir) return null
  return (await permission(dir, false)) === 'granted' ? dir : null
}

// 같은 파일에 동시에 쓰지 않도록 한 줄로 세운다
let queue: Promise<unknown> = Promise.resolve()
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn)
  queue = run.catch(() => undefined)
  return run
}

async function exists(dir: FileSystemDirectoryHandle, name: string): Promise<boolean> {
  try {
    await dir.getFileHandle(name)
    return true
  } catch {
    return false
  }
}

async function readText(handle: FileSystemFileHandle): Promise<string> {
  return (await handle.getFile()).text()
}

async function writeText(dir: FileSystemDirectoryHandle, name: string, text: string) {
  const handle = await dir.getFileHandle(name, { create: true })
  const writable = await handle.createWritable()
  await writable.write(text)
  await writable.close()
}

const fileKey = (deckId: string) => `file:${deckId}`
/** 이번에 열어 둔 동안 '이 이름의 파일은 이 발표 것'임을 확인한 발표들 */
const verified = new Set<string>()

/** 그 이름의 파일이 없거나, 있으면 같은 발표의 파일인지 */
async function ownsName(dir: FileSystemDirectoryHandle, name: string, deckId: string): Promise<boolean> {
  try {
    const text = await readText(await dir.getFileHandle(name))
    return decodeDeckFile(text)?.id === deckId
  } catch {
    return true
  }
}

/** 폴더 안의 작업 파일을 읽어 어느 발표가 어느 파일인지 기억한다 */
async function indexFolder(dir: FileSystemDirectoryHandle): Promise<Deck[]> {
  const decks: Deck[] = []
  for await (const [name, handle] of dir.entries()) {
    if (handle.kind !== 'file' || !name.endsWith(DECK_EXT)) continue
    const deck = decodeDeckFile(await readText(handle as FileSystemFileHandle).catch(() => ''))
    if (!deck) continue
    decks.push(deck)
    await set(fileKey(deck.id), name, settings)
    verified.add(deck.id)
  }
  return decks
}

async function fileNameFor(dir: FileSystemDirectoryHandle, deck: Deck): Promise<string> {
  const known = await get<string>(fileKey(deck.id), settings)
  if (known && (verified.has(deck.id) || (await ownsName(dir, known, deck.id)))) {
    verified.add(deck.id)
    return known
  }
  await del(fileKey(deck.id), settings)
  await indexFolder(dir)
  const found = await get<string>(fileKey(deck.id), settings)
  if (found) return found
  const base = safeFileName(deck.title)
  for (let n = 1; ; n++) {
    const name = n === 1 ? `${base}${DECK_EXT}` : `${base} (${n})${DECK_EXT}`
    if (!(await exists(dir, name))) {
      await set(fileKey(deck.id), name, settings)
      verified.add(deck.id)
      return name
    }
  }
}

/** 보관 폴더에 있는 발표들. 다른 PC에서 만든 발표도 여기서 들어온다. */
export async function listFolderDecks(): Promise<Deck[]> {
  const dir = await readyFolder()
  if (!dir) return []
  try {
    return await indexFolder(dir)
  } catch {
    return []
  }
}

/** 보관 폴더에 있는 이 발표의 작업 파일. 없거나 폴더를 쓸 수 없으면 null */
export async function readFolderDeck(deckId: string): Promise<Deck | null> {
  const dir = await readyFolder()
  if (!dir) return null
  try {
    let name = await get<string>(fileKey(deckId), settings)
    if (!name || !(await exists(dir, name))) {
      await indexFolder(dir)
      name = await get<string>(fileKey(deckId), settings)
    }
    if (!name) return null
    const deck = decodeDeckFile(await readText(await dir.getFileHandle(name)))
    return deck?.id === deckId ? deck : null
  } catch {
    return null
  }
}

export function writeDeckToFolder(deck: Deck): Promise<boolean> {
  return serial(async () => {
    const dir = await readyFolder()
    if (!dir) return false
    try {
      await writeText(dir, await fileNameFor(dir, deck), encodeDeckFile(deck))
      return true
    } catch {
      return false
    }
  })
}

export interface FolderVersion {
  createdAt: number
  name: string
  named: boolean
}

/** 버전 기록/<발표 파일 이름>/2026-10-23 15-12 본부장 보고본.deck */
export function writeVersionToFolder(deck: Deck, version: FolderVersion): Promise<boolean> {
  return serial(async () => {
    const dir = await readyFolder()
    if (!dir) return false
    try {
      const base = (await fileNameFor(dir, deck)).slice(0, -DECK_EXT.length)
      const root = await dir.getDirectoryHandle(VERSIONS_DIR, { create: true })
      const own = await root.getDirectoryHandle(base, { create: true })
      const label = version.named ? ` ${safeFileName(version.name, '버전', 40)}${DECK_EXT}` : AUTO_SUFFIX
      await writeText(own, `${fileStamp(version.createdAt)}${label}`, encodeDeckFile(deck))
      if (!version.named) await pruneAuto(own)
      return true
    } catch {
      return false
    }
  })
}

async function pruneAuto(dir: FileSystemDirectoryHandle) {
  const autos: string[] = []
  for await (const name of dir.keys()) if (name.endsWith(AUTO_SUFFIX)) autos.push(name)
  autos.sort()
  for (const name of autos.slice(0, Math.max(0, autos.length - AUTO_KEEP))) await dir.removeEntry(name).catch(() => {})
}

/**
 * 보관 폴더의 '지운 발표'에 들어 있는 발표들(다른 PC에서 지운 것 포함): id → 지울 때의 고친 시각(updatedAt).
 * 같은 발표를 여러 번 지웠으면 가장 늦은 것. 맞출 때 그 뒤에 이 PC에서 고친 발표는 지우지 않으려고 시각까지 읽는다
 */
export async function trashedDecks(): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  const dir = await readyFolder()
  if (!dir) return out
  try {
    const trash = await dir.getDirectoryHandle(TRASH_DIR)
    for await (const handle of trash.values()) {
      if (handle.kind !== 'file' || !handle.name.endsWith(DECK_EXT)) continue
      const deck = decodeDeckFile(await readText(handle as FileSystemFileHandle).catch(() => ''))
      if (deck) out.set(deck.id, Math.max(out.get(deck.id) ?? -Infinity, deck.updatedAt))
    }
  } catch {
    // 아직 지운 발표가 없다
  }
  return out
}

const pendingKey = (deckId: string) => `trash:${deckId}`

/**
 * 보관 폴더를 쓸 수 없을 때(브라우저를 다시 열어 아직 허용하지 않은 때) 지운 발표: id → 지울 때의 고친 시각.
 * 다음에 폴더와 맞출 때 폴더의 파일도 '지운 발표'로 옮긴다(persist.ts). 기억해 두지 않으면 폴더에만 남은 파일을 다시 가져와 되살렸다
 */
export async function pendingTrash(): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  try {
    for (const key of await keys<string>(settings)) {
      if (typeof key !== 'string' || !key.startsWith('trash:')) continue
      const at = await get<number>(key, settings)
      if (typeof at === 'number') out.set(key.slice('trash:'.length), at)
    }
  } catch {
    // 읽지 못하면 없는 것으로 (지운 발표가 되살아날 수는 있어도 잃지는 않는다)
  }
  return out
}

/** 맞추며 쓴 기억은 지운다 */
export async function forgetTrash(deckId: string): Promise<void> {
  await del(pendingKey(deckId), settings).catch(() => {})
}

/** 지운 발표는 바로 없애지 않고 '지운 발표' 폴더로 옮긴다. 폴더를 쓸 수 없으면 기억해 두었다가 다음에 맞출 때 옮긴다 */
export function trashDeckInFolder(deck: Deck): Promise<void> {
  return serial(async () => {
    const dir = await readyFolder()
    if (!dir) {
      await set(pendingKey(deck.id), deck.updatedAt, settings).catch(() => {})
      return
    }
    try {
      const name = await get<string>(fileKey(deck.id), settings)
      if (!name || !(await exists(dir, name))) return
      const trash = await dir.getDirectoryHandle(TRASH_DIR, { create: true })
      const text = await readText(await dir.getFileHandle(name))
      await writeText(trash, `${fileStamp(Date.now())} ${name}`, text)
      await dir.removeEntry(name)
    } catch {
      // 옮기지 못하면 파일을 그대로 둔다. 잃는 것보다 남는 편이 낫다.
    }
  })
}

/** 보관 폴더의 발표 아닌 파일 하나(내 컴포넌트, 내 모션 그래픽). 없거나 폴더를 쓸 수 없으면 null */
async function readAside(name: string): Promise<string | null> {
  const dir = await readyFolder()
  if (!dir) return null
  try {
    return await readText(await dir.getFileHandle(name))
  } catch {
    return null
  }
}

function writeAside(name: string, text: string): Promise<boolean> {
  return serial(async () => {
    const dir = await readyFolder()
    if (!dir) return false
    try {
      await writeText(dir, name, text)
      return true
    } catch {
      return false
    }
  })
}

/** 보관 폴더의 내 컴포넌트 파일. 없거나 폴더를 쓸 수 없으면 null */
export const readPartsFromFolder = () => readAside(PARTS_FILE)
export const writePartsToFolder = (text: string) => writeAside(PARTS_FILE, text)
/** 보관 폴더의 내 모션 그래픽 파일 */
export const readCinesFromFolder = () => readAside(CINES_FILE)
export const writeCinesToFolder = (text: string) => writeAside(CINES_FILE, text)

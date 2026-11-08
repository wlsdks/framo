import type { Deck } from '../deck/types'
import { deckSignature } from './versions'

/**
 * 같은 발표의 두 벌(이 브라우저, 보관 폴더의 파일) 가운데 무엇을 남길지. 더 최근에 고친 쪽을 남긴다.
 * - take: 파일을 이 브라우저로 가져온다. backup이면 덮이기 전의 브라우저 것을 먼저 버전으로 남긴다(내용이 다를 때만)
 * - write: 브라우저 것을 폴더에 쓴다
 * - none: 둘이 같은 때다
 * 폴더와 맞출 때(syncWithFolder)와 편집기를 열 때(loadBestDeck)가 같이 쓴다. 따로 두었더니 같은 규칙이 두 번 적혀 있었다
 */
type Reconcile = { action: 'take'; backup: boolean } | { action: 'write' } | { action: 'none' }

export function reconcile(local: Deck | null | undefined, file: Deck | null | undefined): Reconcile {
  if (!file) return local ? { action: 'write' } : { action: 'none' }
  if (!local) return { action: 'take', backup: false }
  if (file.updatedAt > local.updatedAt) return { action: 'take', backup: deckSignature(local) !== deckSignature(file) }
  if (local.updatedAt > file.updatedAt) return { action: 'write' }
  return { action: 'none' }
}

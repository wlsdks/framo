import { useCallback, useEffect, useRef } from 'react'
import type { Deck } from '../deck/types'
import { useDeck } from './deckStore'
import { saveToBrowser, saveToFolder, useStorage } from './persist'
import { AUTO_INTERVAL, saveVersion, type VersionReason } from './versions'

/**
 * 고칠 때마다 저장한다. 브라우저에는 바로, 보관 폴더에는 조금 모아서.
 * 고치는 중에는 5분마다 자동 버전을 남긴다. 화면을 떠나거나 창을 닫을 때는 남은 저장을 바로 끝낸다.
 */
export function useAutosave(deck: Deck) {
  const latest = useRef(deck)
  const dirty = useRef({ browser: false, folder: false })
  const lastVersionAt = useRef(Date.now())
  latest.current = deck

  const flush = useCallback(() => {
    const d = latest.current
    // 폴더에서 새 버전의 발표가 들어와 편집기가 닫히는 중: 들고 있던 것으로 덮어쓰지 않는다 (고친 것은 버전으로 남겨 두었다)
    if (useDeck.getState().newer?.id === d.id) return
    if (dirty.current.browser) {
      dirty.current.browser = false
      void saveToBrowser(d)
    }
    if (dirty.current.folder) {
      dirty.current.folder = false
      void saveToFolder(d)
    }
  }, [])

  // 열 때 한 번 남긴다. 앞 버전과 같으면 저장소가 건너뛴다.
  useEffect(() => {
    void saveVersion(latest.current, { reason: 'open' })
  }, [deck.id])

  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    dirty.current = { browser: true, folder: true }
    const tb = window.setTimeout(() => {
      dirty.current.browser = false
      void saveToBrowser(deck)
    }, 400)
    const tf = window.setTimeout(() => {
      dirty.current.folder = false
      void saveToFolder(deck)
      if (Date.now() - lastVersionAt.current >= AUTO_INTERVAL) {
        lastVersionAt.current = Date.now()
        void saveVersion(deck, { reason: 'interval' })
      }
    }, 1500)
    return () => {
      window.clearTimeout(tb)
      window.clearTimeout(tf)
    }
  }, [deck])

  useEffect(() => {
    const onHide = () => document.visibilityState === 'hidden' && flush()
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onHide)
      flush()
    }
  }, [flush])

  /** 발표나 내보내기처럼 중요한 순간 전에 부른다 */
  const markVersion = useCallback((reason: VersionReason) => {
    flush()
    lastVersionAt.current = Date.now()
    void saveVersion(latest.current, { reason })
  }, [flush])

  /** Ctrl+S: 모아 둔 저장을 기다리지 않고 두 곳에 바로 저장한다. 고른 폴더에 쓰지 못했거나 브라우저에 못 쓰면 false */
  const saveNow = useCallback(async () => {
    const d = latest.current
    if (useDeck.getState().newer?.id === d.id) return true
    dirty.current = { browser: false, folder: false }
    const browser = await saveToBrowser(d)
    const folder = await saveToFolder(d)
    return browser && (folder || useStorage.getState().folder?.kind !== 'ready')
  }, [])

  return { markVersion, saveNow }
}

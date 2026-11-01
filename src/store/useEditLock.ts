import { useEffect, useRef, useState } from 'react'
import { holdDeck, type EditLock } from './deckLock'
import { useDeck } from './deckStore'
import { saveToBrowser, saveToFolder } from './persist'

/**
 * 이 창이 이 발표를 고쳐도 되는지 (deckLock.ts). taken은 다른 창에서 넘겨받은 횟수로, 늘면 편집기가 그 창이 저장한 발표를
 * 다시 읽는다. 다른 창에 넘길 때는 이 창이 들고 있는 발표를 두 곳(브라우저, 보관 폴더)에 저장한 뒤 넘긴다
 */
export function useEditLock(id: string): { state: EditLock; taken: number; take: () => void } {
  const [lock, setLock] = useState<{ state: EditLock; taken: number }>({ state: 'checking', taken: 0 })
  const handle = useRef<{ take(): void; close(): void } | null>(null)
  useEffect(() => {
    setLock({ state: 'checking', taken: 0 })
    // 한 박자 늦게 나선다: 개발 화면(StrictMode)은 붙였다 떼었다 다시 붙이는데, 떼면서 놓은 잠금이 아직 풀리기 전에
    // 다시 청하면 제 창을 다른 창으로 알았다
    const t = window.setTimeout(() => {
      handle.current = holdDeck(
        id,
        {
          locks: navigator.locks,
          channel: (name) => new BroadcastChannel(name),
          save: async () => {
            const d = useDeck.getState().deck
            if (d?.id !== id) return
            await saveToBrowser(d)
            await saveToFolder(d)
          },
        },
        (state, taken) => {
          // 넘겨받으면 들고 있던 것을 내려놓는다: 편집기가 그동안 다른 창이 저장한 것을 다시 읽는다
          if (taken) useDeck.getState().close()
          setLock((l) => ({ state, taken: taken ? l.taken + 1 : l.taken }))
        },
      )
    }, 0)
    return () => {
      window.clearTimeout(t)
      handle.current?.close()
      handle.current = null
    }
  }, [id])
  return { ...lock, take: () => handle.current?.take() }
}

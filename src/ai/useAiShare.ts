import { useCallback, useEffect, useRef, useState } from 'react'
import type { Deck } from '../deck/types'
import { aiStatus, fetchRequests, publishShape, sendResult, unshareDeck, type AiStatus } from './client'
import { requestFor, type ChangeRequest, type OpResult } from './ops'
import { toShape, type ShapeOver } from './share'

const POLL_MS = 2500

export interface AiShare {
  /** undefined: 확인 중, null: 이 화면에서는 쓸 수 없음 (‘Framo 시작’ 파일로 켜지 않았을 때) */
  status: AiStatus | null | undefined
  /** 이 발표에 온, 아직 보지 않은 제안 */
  requests: ChangeRequest[]
  resolve(request: ChangeRequest, status: 'applied' | 'rejected', results: OpResult[]): Promise<void>
  /** 기다리지 않고 바로 다시 가져온다 (부탁한 제안이 막 왔을 때) */
  refresh(): void
  /** 이 PC에 Claude Code가 있는지 다시 본다. AI 창을 열 때마다: 창을 띄워 둔 채 설치하고 돌아와도 바로 '준비됨'이 되게 */
  recheck(): void
}

/**
 * 공유를 켠 발표의 모양을 'AI 공유' 폴더에 올리고, AI가 보낸 제안을 가져온다.
 * 글은 모양에 들어가지 않으므로, 글을 고쳐도 글자 수 구간(과 넘쳤는지)이 그대로면 다시 올리지 않는다.
 * measure는 편집기가 그린 장에서 잰 넘침(screens/editor/aiOver.ts). ai/는 화면을 모르므로 넘겨받는다
 */
export function useAiShare(deck: Deck, measure?: (deck: Deck) => ShapeOver): AiShare {
  const [status, setStatus] = useState<AiStatus | null | undefined>(undefined)
  const [requests, setRequests] = useState<ChangeRequest[]>([])
  const [nudge, setNudge] = useState(0)
  const shared = !!deck.aiShare
  const ready = !!status

  useEffect(() => {
    let alive = true
    aiStatus().then((s) => alive && setStatus(s))
    return () => {
      alive = false
    }
  }, [])

  const published = useRef<string | null>(null)
  const latest = useRef(deck)
  latest.current = deck
  const measureRef = useRef(measure)
  measureRef.current = measure
  // 사람이 적용하거나 거절한 제안. 결과를 아직 남기지 못했으면(서버가 꺼졌거나 폴더에 쓰지 못할 때) 값을 들고 있다가
  // 다음에 가져올 때 다시 보낸다. 그동안 그 제안은 목록에 다시 넣지 않는다. 다시 보이면 같은 제안을 두 번 적용하게 된다.
  const decided = useRef(new Map<string, { status: 'applied' | 'rejected'; results: OpResult[] } | null>())

  // 고칠 때마다 쉬었다가(600ms) 모양을 만들어, 수정 시각은 빼고 지난번에 올린 것과 견준다. 칸의 글자 수 구간, 넘침, 장 순서 같은
  // 모양이 바뀔 때만 올린다. 넘침은 고친 것이 장 목록의 그림에 그려진 뒤에 재야 해서, 모양도 쉬었다가 만든다(예전에는 글자 하나 칠 때마다 만들었다)
  useEffect(() => {
    if (!ready) return
    if (!shared) {
      if (published.current !== null) {
        published.current = null
        void unshareDeck(latest.current)
      }
      return
    }
    const t = window.setTimeout(async () => {
      const shape = toShape(latest.current, measureRef.current?.(latest.current))
      const key = JSON.stringify({ ...shape, updatedAt: 0 })
      if (key === published.current) return
      if (await publishShape(shape)) published.current = key
    }, 600)
    return () => window.clearTimeout(t)
  }, [deck, shared, ready])

  useEffect(() => {
    if (!ready || !shared) {
      setRequests([])
      return
    }
    let alive = true
    const tick = async () => {
      if (document.hidden) return
      for (const [id, r] of decided.current) if (r && (await sendResult(id, r.status, r.results))) decided.current.set(id, null)
      const mine = (await fetchRequests()).filter((r) => requestFor(latest.current, r) && !decided.current.has(r.id))
      if (!alive) return
      setRequests((prev) => (prev.map((r) => r.id).join() === mine.map((r) => r.id).join() ? prev : mine))
    }
    void tick()
    const t = window.setInterval(tick, POLL_MS)
    return () => {
      alive = false
      window.clearInterval(t)
    }
  }, [ready, shared, deck.id, nudge])

  const refresh = useCallback(() => setNudge((n) => n + 1), [])
  // 다시 볼 때 서버에 닿지 못했으면(null) 그대로 둔다. 잠깐 끊긴 것으로 창 전체를 '쓸 수 없음'으로 바꾸지 않게.
  // Claude Code가 있는지만 달라졌을 때 바꾼다: 새 객체로 바꾸면 공유를 다시 올리는 효과들이 괜히 다시 돈다
  const recheck = useCallback(() => {
    void aiStatus().then((s) => s && setStatus((prev) => (prev && prev.agent === s.agent ? prev : s)))
  }, [])

  const resolve = useCallback(async (request: ChangeRequest, result: 'applied' | 'rejected', results: OpResult[]) => {
    decided.current.set(request.id, { status: result, results })
    setRequests((prev) => prev.filter((r) => r.id !== request.id))
    if (await sendResult(request.id, result, results)) decided.current.set(request.id, null)
  }, [])

  return { status, requests, resolve, refresh, recheck }
}

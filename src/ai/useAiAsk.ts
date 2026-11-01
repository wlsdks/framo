import { useCallback, useEffect, useRef, useState } from 'react'
import type { Deck, Slide } from '../deck/types'
import type { AskError, AskId, AskRun } from './asks'
import { askRun, cancelAsk } from './client'
import { pollAsk } from './askPoll'
import { startSharedAsk } from './askStart'
import { shapeSlideId, toShape } from './share'

const POLL_MS = 900

/** 하고 있는 부탁. id는 서버가 받기 전까지 빈 값 */
export interface AskJob extends AskRun {
  ask: AskId
  /** 장 부탁이면 그 장의 원래 id (화면에서 몇째 장인지 보여 주려고). 발표 전체면 null */
  slideId: string | null
  /** 서버에서 실행 결과를 아직 확인하지 못한 상태. 부탁 자체가 실패한 것은 아니다. */
  connectionLost?: boolean
}

export interface AiAsk {
  job: AskJob | null
  /**
   * 마지막 부탁이 Claude Code에 로그인돼 있지 않아서 끝나지 못했는지. 서버가 로그인 여부를 따로 알려 주지 않아서
   * 부탁이 'login'으로 끝난 것으로만 안다. 다음 부탁이 제안까지 가면(바꿀 게 없다고 해도) 풀린다
   */
  needsLogin: boolean
  start(ask: AskId, slide: Slide | null): Promise<void>
  cancel(): void
  dismiss(): void
}

/**
 * 'AI에게 부탁'. 로컬 서버가 이 PC의 Claude Code를 띄워 부탁을 전하고, 제안이 오면 알려 준다.
 * share는 발표의 AI 공유를 켜는 법(편집 상태가 넘겨 준다). ai/는 편집 상태(store)를 가져오지 않는다
 */
export function useAiAsk(deck: Deck, share: () => void): AiAsk {
  const [job, setJob] = useState<AskJob | null>(null)
  const latest = useRef(deck)
  latest.current = deck
  const shareRef = useRef(share)
  shareRef.current = share
  // 서버가 받기 전에 그만두기를 누르면, 늦게 돌아온 응답이 부탁을 되살리지 않게
  const turn = useRef(0)

  const start = useCallback(async (ask: AskId, slide: Slide | null) => {
    const d = latest.current
    const mine = ++turn.current
    const base = { ask, slideId: slide?.id ?? null }
    const fail = (error: AskError) => mine === turn.current && setJob({ ...base, id: '', state: 'failed', step: 'starting', error })
    setJob({ ...base, id: '', state: 'running', step: 'starting' })
    // AI가 부탁을 들어주려면 모양을 봐야 한다. 부탁을 누른 것이 보여 주겠다는 뜻이라 공유를 켠다 (끄기는 위쪽 AI 단추에서)
    if (!d.aiShare) shareRef.current()
    const run = await startSharedAsk(toShape(d), ask, slide ? shapeSlideId(slide) : null, () => mine === turn.current)
    if (!run) return
    if (typeof run === 'string') return void fail(run)
    if (mine !== turn.current) return void cancelAsk(run.id)
    setJob({ ...base, ...run })
  }, [])

  const running = job?.state === 'running' ? job.id : ''
  useEffect(() => {
    if (!running) return
    return pollAsk((signal) => askRun(running, signal), (run) => {
      setJob((j) => (j && j.id === running ? (run ? { ...j, ...run, connectionLost: false } : j.connectionLost ? j : { ...j, connectionLost: true }) : j))
    }, POLL_MS)
  }, [running])

  const cancel = useCallback(() => {
    turn.current++
    setJob((j) => {
      if (j?.id) void cancelAsk(j.id)
      return null
    })
  }, [])
  const dismiss = useCallback(() => setJob(null), [])

  const [needsLogin, setNeedsLogin] = useState(false)
  useEffect(() => {
    if (job?.state === 'failed' && job.error === 'login') setNeedsLogin(true)
    else if (job?.state === 'done' || job?.state === 'no_change') setNeedsLogin(false)
  }, [job])

  return { job, needsLogin, start, cancel, dismiss }
}

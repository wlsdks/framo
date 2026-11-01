import type { AskRun } from './asks'

/** 앞 조회가 끝나기 전에 다음 조회를 보내지 않는다. 늦은 응답이 완료 상태를 되돌리지 않게 한다. */
export function pollAsk(read: (signal: AbortSignal) => Promise<AskRun | null>, update: (run: AskRun | null) => void, delay: number): () => void {
  let active = true
  let timer: ReturnType<typeof setTimeout>
  let deadline: ReturnType<typeof setTimeout> | undefined
  let request: AbortController | undefined
  let failures = 0
  const poll = async () => {
    if (!active) return
    const current = new AbortController()
    request = current
    // 로컬 서버가 응답하지 않아도 진행 중 화면이 끝없이 멈추지 않게 한다.
    deadline = setTimeout(() => current.abort(), 10_000)
    let run: AskRun | null
    try {
      run = await read(current.signal)
    } catch {
      run = null
    } finally {
      clearTimeout(deadline)
      request = undefined
    }
    if (!active) return
    update(run)
    if (!active) return
    if (!run) {
      failures++
      timer = setTimeout(poll, Math.min(delay * 2 ** Math.min(failures, 4), 10_000))
    } else if (run.state === 'running') {
      failures = 0
      timer = setTimeout(poll, delay)
    }
  }
  timer = setTimeout(poll, delay)
  return () => {
    active = false
    clearTimeout(timer)
    clearTimeout(deadline)
    request?.abort()
  }
}

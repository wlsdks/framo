import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AskRun } from './asks'
import { pollAsk } from './askPoll'

const running = { id: 'a123', state: 'running', step: 'looking' } as const
const done = { id: 'a123', state: 'done', step: 'proposing' } as const
const pending = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}

describe('AI 부탁 상태 조회', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('응답이 느려도 조회를 겹치지 않고 완료되면 더 조회하지 않는다', async () => {
    const first = pending<AskRun | null>()
    const read = vi.fn<() => Promise<AskRun | null>>().mockReturnValueOnce(first.promise).mockResolvedValueOnce(done)
    const update = vi.fn()
    const stop = pollAsk(read, update, 900)
    await vi.advanceTimersByTimeAsync(3600)
    expect(read).toHaveBeenCalledTimes(1)
    first.resolve(running)
    await Promise.resolve()
    expect(update).toHaveBeenCalledWith(running)
    await vi.advanceTimersByTimeAsync(900)
    expect(read).toHaveBeenCalledTimes(2)
    expect(update).toHaveBeenLastCalledWith(done)
    await vi.advanceTimersByTimeAsync(3600)
    expect(read).toHaveBeenCalledTimes(2)
    stop()
  })

  it('화면이 닫히거나 취소된 뒤 도착한 응답은 반영하지 않는다', async () => {
    const first = pending<AskRun | null>()
    const read = vi.fn(() => first.promise)
    const update = vi.fn()
    const stop = pollAsk(read, update, 900)
    await vi.advanceTimersByTimeAsync(900)
    stop()
    first.resolve(running)
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(3600)
    expect(update).not.toHaveBeenCalled()
    expect(read).toHaveBeenCalledTimes(1)
  })

  it('조회가 실패하면 알리고 기다렸다가 다시 확인한다', async () => {
    const read = vi.fn<() => Promise<AskRun | null>>().mockRejectedValueOnce(new Error('연결 실패')).mockResolvedValueOnce(done)
    const update = vi.fn()
    const stop = pollAsk(read, update, 900)
    await vi.advanceTimersByTimeAsync(900)
    expect(update).toHaveBeenCalledOnce()
    expect(update).toHaveBeenCalledWith(null)
    await vi.advanceTimersByTimeAsync(1799)
    expect(read).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(read).toHaveBeenCalledTimes(2)
    expect(update).toHaveBeenLastCalledWith(done)
    stop()
  })

  it('연결이 계속 안 되면 재시도 간격을 늘리고, 복구되면 원래 간격으로 돌아온다', async () => {
    const read = vi.fn<() => Promise<AskRun | null>>().mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null).mockResolvedValueOnce(running).mockResolvedValueOnce(done)
    const update = vi.fn()
    const stop = pollAsk(read, update, 900)
    await vi.advanceTimersByTimeAsync(900 + 1800 + 3600 + 7200)
    expect(read).toHaveBeenCalledTimes(4)
    await vi.advanceTimersByTimeAsync(9999)
    expect(read).toHaveBeenCalledTimes(4)
    await vi.advanceTimersByTimeAsync(1)
    expect(update).toHaveBeenLastCalledWith(running)
    await vi.advanceTimersByTimeAsync(900)
    expect(update).toHaveBeenLastCalledWith(done)
    stop()
  })

  it('상태를 반영하는 도중 조회가 중지되어도 새 조회를 예약하지 않는다', async () => {
    const read = vi.fn<() => Promise<AskRun | null>>().mockResolvedValue(running)
    let stop = () => {}
    const update = vi.fn(() => stop())
    stop = pollAsk(read, update, 900)
    await vi.advanceTimersByTimeAsync(3600)
    expect(update).toHaveBeenCalledOnce()
    expect(read).toHaveBeenCalledOnce()
  })

  it('로컬 서버가 응답하지 않으면 조회를 중단하고 상태 확인 실패를 알린다', async () => {
    const read = vi.fn((signal: AbortSignal) => new Promise<AskRun | null>((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('중단됨')), { once: true })
    }))
    const update = vi.fn()
    const stop = pollAsk(read, update, 900)
    await vi.advanceTimersByTimeAsync(10_900)
    expect(read).toHaveBeenCalledOnce()
    expect(update).toHaveBeenCalledWith(null)
    stop()
  })

  it('중지하면 진행 중인 로컬 조회도 취소한다', async () => {
    let signal: AbortSignal | undefined
    const read = vi.fn((s: AbortSignal) => {
      signal = s
      return new Promise<AskRun | null>((_resolve, reject) => s.addEventListener('abort', () => reject(new Error('중단됨')), { once: true }))
    })
    const update = vi.fn()
    const stop = pollAsk(read, update, 900)
    await vi.advanceTimersByTimeAsync(900)
    stop()
    await Promise.resolve()
    expect(signal?.aborted).toBe(true)
    expect(update).not.toHaveBeenCalled()
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cancelAsk, publishShape, startAsk } from './client'
import { startSharedAsk } from './askStart'
import type { ShapeDeck } from './share'

vi.mock('./client', () => ({ publishShape: vi.fn(), startAsk: vi.fn(), cancelAsk: vi.fn() }))

const shape = { deck: 'd123456789abc' } as ShapeDeck
const pending = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}

describe('AI 부탁 시작과 취소', () => {
  beforeEach(() => vi.resetAllMocks())

  it('모양을 공유하지 못하면 에이전트를 띄우지 않고 이유를 돌려준다', async () => {
    vi.mocked(publishShape).mockResolvedValue(false)
    expect(await startSharedAsk(shape, 'deck_flow', null, () => true)).toBe('not_shared')
    expect(startAsk).not.toHaveBeenCalled()
  })

  it('공유한 모양의 발표 id로 부탁을 시작한다', async () => {
    vi.mocked(publishShape).mockResolvedValue(true)
    const run = { id: 'a123456789abc', state: 'running', step: 'starting' } as const
    vi.mocked(startAsk).mockResolvedValue(run)
    expect(await startSharedAsk(shape, 'deck_flow', null, () => true)).toEqual(run)
    expect(startAsk).toHaveBeenCalledWith('deck_flow', shape.deck, null)
  })

  it('모양 공유 중 취소하면 늦게 공유가 끝나도 에이전트를 띄우지 않는다', async () => {
    const share = pending<boolean>()
    vi.mocked(publishShape).mockReturnValue(share.promise)
    let current = true
    const result = startSharedAsk(shape, 'deck_flow', null, () => current)
    current = false
    share.resolve(true)
    expect(await result).toBeNull()
    expect(startAsk).not.toHaveBeenCalled()
  })

  it('서버에 시작을 요청한 뒤 취소하면 늦게 받은 실행도 서버에서 멈춘다', async () => {
    const run = pending<Awaited<ReturnType<typeof startAsk>>>()
    vi.mocked(publishShape).mockResolvedValue(true)
    vi.mocked(startAsk).mockReturnValue(run.promise)
    let current = true
    const result = startSharedAsk(shape, 'deck_flow', null, () => current)
    await Promise.resolve()
    expect(startAsk).toHaveBeenCalledOnce()
    current = false
    run.resolve({ id: 'a123456789abc', state: 'running', step: 'starting' })
    expect(await result).toBeNull()
    expect(cancelAsk).toHaveBeenCalledWith('a123456789abc')
  })
})

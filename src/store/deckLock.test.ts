import { describe, expect, it, vi } from 'vitest'
import { holdDeck, type ChannelLike, type EditLock, type LocksLike } from './deckLock'

/** 브라우저의 Web Locks처럼: 한 이름은 한 곳만 쥔다. ifAvailable, steal, signal을 흉내 낸다 (CI의 Node 22에는 없다) */
class FakeLocks implements LocksLike {
  private held = new Map<string, (e: unknown) => void>()
  private queue = new Map<string, (() => void)[]>()
  request(name: string, options: { ifAvailable?: boolean; steal?: boolean; signal?: AbortSignal }, cb: (lock: object | null) => unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const grant = () => {
        this.held.set(name, reject)
        const done = () => this.held.get(name) === reject && this.free(name)
        Promise.resolve(cb({ name })).then(
          (v) => (done(), resolve(v)),
          (e) => (done(), reject(e)),
        )
      }
      if (!this.held.has(name)) return grant()
      if (options.ifAvailable) return void Promise.resolve(cb(null)).then(resolve, reject)
      if (options.steal) {
        this.held.get(name)!(new DOMException('stolen', 'AbortError'))
        this.held.delete(name)
        return grant()
      }
      const q = this.queue.get(name) ?? []
      q.push(grant)
      this.queue.set(name, q)
      options.signal?.addEventListener('abort', () => {
        const i = q.indexOf(grant)
        if (i >= 0) q.splice(i, 1), reject(new DOMException('aborted', 'AbortError'))
      })
    })
  }
  private free(name: string) {
    this.held.delete(name)
    this.queue.get(name)?.shift()?.()
  }
}

/** 같은 PC의 창끼리 오가는 BroadcastChannel 흉내. deaf면 받지 않는다(멈춘 창) */
function bus() {
  const all = new Set<ChannelLike & { name: string; deaf: boolean }>()
  return (deaf = false) =>
    (name: string): ChannelLike => {
      const ch: ChannelLike & { name: string; deaf: boolean } = {
        name,
        deaf,
        onmessage: null,
        postMessage(data) {
          for (const s of all) if (s !== ch && s.name === name && !s.deaf) queueMicrotask(() => s.onmessage?.({ data } as MessageEvent))
        },
        close() {
          all.delete(ch)
        },
      }
      all.add(ch)
      return ch
    }
}

const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms))

/** 창마다 따로 읽은 모듈 (창마다 저장하지 않을 발표를 따로 기억한다) */
async function ownModule() {
  vi.resetModules()
  return await import('./deckLock')
}

/** 창 하나: 바뀐 상태를 차례로 적고, 저장한 때를 적는다 */
function windowOf(locks: LocksLike | undefined, channel: (name: string) => ChannelLike, log: string[], name: string, id = 'd1', hold = holdDeck) {
  const states: [EditLock, boolean][] = []
  const lock = hold(
    id,
    {
      locks,
      channel,
      save: async () => {
        await tick(1)
        log.push(`${name} 저장`)
      },
      wait: 30,
    },
    (state, taken) => {
      states.push([state, taken])
      log.push(`${name} ${state}`)
    },
  )
  return { lock, states }
}

describe('한 발표는 한 창에서 고친다', () => {
  it('먼저 연 창이 고치고, 같은 발표를 연 다른 창은 다른 창에서 고치는 중이다. 다른 발표는 따로다', async () => {
    const locks = new FakeLocks()
    const ch = bus()
    const log: string[] = []
    const a = windowOf(locks, ch(), log, 'A')
    await tick()
    const b = windowOf(locks, ch(), log, 'B')
    const c = windowOf(locks, ch(), log, 'C', 'd2')
    await tick()
    expect(a.states).toEqual([['mine', false]])
    expect(b.states).toEqual([['other', false]])
    expect(c.states).toEqual([['mine', false]])
    for (const w of [a, b, c]) w.lock.close()
  })

  it('다른 창이 넘겨 달라고 하면 남은 저장을 끝낸 뒤 넘기고, 넘겨받은 창은 저장된 것을 다시 읽는다', async () => {
    const locks = new FakeLocks()
    const ch = bus()
    const log: string[] = []
    const [ma, mb] = [await ownModule(), await ownModule()]
    const a = windowOf(locks, ch(), log, 'A', 'd1', ma.holdDeck)
    await tick()
    const b = windowOf(locks, ch(), log, 'B', 'd1', mb.holdDeck)
    await tick()
    b.lock.take()
    await tick(20)
    expect(a.states).toEqual([['mine', false], ['lost', false]])
    expect(b.states).toEqual([['other', false], ['mine', true]])
    // 앞 창이 저장을 끝낸 다음에 넘겨받는다: 넘겨받은 창이 읽을 때 앞 창의 마지막 글이 있다
    expect(log.indexOf('A 저장')).toBeLessThan(log.indexOf('B mine'))
    // 넘겨준 창은 이 발표를 더 저장하지 않는다 (persist.ts가 본다)
    expect(ma.heldElsewhere('d1')).toBe(true)
    expect(mb.heldElsewhere('d1')).toBe(false)
    // 다시 이 창에서 고치기
    a.lock.take()
    await tick(20)
    expect(a.states.at(-1)).toEqual(['mine', true])
    expect(b.states.at(-1)).toEqual(['lost', false])
    expect(ma.heldElsewhere('d1')).toBe(false)
    expect(mb.heldElsewhere('d1')).toBe(true)
    a.lock.close()
    b.lock.close()
    expect(mb.heldElsewhere('d1')).toBe(false)
  })

  it('답이 없는 창(멈춘 창)이면 조금 기다린 뒤 가져온다', async () => {
    const locks = new FakeLocks()
    const ch = bus()
    const log: string[] = []
    const a = windowOf(locks, ch(true), log, 'A')
    await tick()
    const b = windowOf(locks, ch(), log, 'B')
    await tick()
    b.lock.take()
    await tick(10)
    expect(b.states.at(-1)).toEqual(['other', false])
    await tick(60)
    expect(b.states.at(-1)).toEqual(['mine', true])
    expect(a.states.at(-1)).toEqual(['lost', false])
    a.lock.close()
    b.lock.close()
  })

  it('편집기를 떠나면 놓아서 다른 창이 바로 가져가고, 떠난 창에는 더 알리지 않는다', async () => {
    const locks = new FakeLocks()
    const ch = bus()
    const log: string[] = []
    const a = windowOf(locks, ch(), log, 'A')
    await tick()
    const b = windowOf(locks, ch(), log, 'B')
    await tick()
    a.lock.close()
    b.lock.take()
    await tick(10)
    expect(b.states.at(-1)).toEqual(['mine', true])
    expect(a.states).toEqual([['mine', false]])
    expect(log).not.toContain('A 저장')
    b.lock.close()
  })

  it('Web Locks가 없으면 잠그지 않고 고친다', async () => {
    const log: string[] = []
    const a = windowOf(undefined, bus()(), log, 'A')
    await tick()
    expect(a.states).toEqual([['mine', false]])
    a.lock.close()
  })
})

// 한 발표는 한 창에서만 고친다. 같은 발표를 두 창에서 열어 고치면 창마다 들고 있는 발표를 저장해서, 나중에 저장한 창이
// 다른 창에서 고친 글을 말없이 덮었다(Framo를 한 번 더 켜면 새 창이 열린다). 발표마다 Web Locks로 고치는 창을 하나로 두고,
// 다른 창이 넘겨 달라고 하면(BroadcastChannel) 남은 저장을 끝낸 뒤 넘긴다. 넘겨받은 창은 저장된 발표를 다시 읽는다.
// 잠금과 알림은 같은 PC의 창끼리만 오간다.

export type EditLock = 'checking' | 'mine' | 'other' | 'lost'

/** navigator.locks에서 쓰는 것만 */
export interface LocksLike {
  request(name: string, options: { ifAvailable?: boolean; steal?: boolean; signal?: AbortSignal }, cb: (lock: object | null) => unknown): Promise<unknown>
}

/** BroadcastChannel에서 쓰는 것만 */
export interface ChannelLike {
  onmessage: ((e: MessageEvent) => void) | null
  postMessage(data: unknown): void
  close(): void
}

export interface LockDeps {
  /** 없으면(Web Locks가 없는 브라우저) 잠그지 않고 고친다 */
  locks: LocksLike | undefined
  channel: (name: string) => ChannelLike
  /** 다른 창에 넘기기 전에 남은 저장을 끝낸다 */
  save: () => Promise<void>
  /** 넘겨 달라고 했는데 답이 없으면(멈춘 창) 이만큼 기다린 뒤 가져온다 */
  wait?: number
}

const lockName = (id: string) => `html-maker-edit:${id}`

/**
 * 다른 창이 넘겨받은 발표. 이 창은 그 발표를 더 저장하지 않는다(persist.ts): 멈췄다가 깨어난 창이 남은 저장을 하면서
 * 그사이 다른 창에서 고친 것을 들고 있던 것으로 덮지 않게
 */
const elsewhere = new Set<string>()
export const heldElsewhere = (id: string) => elsewhere.has(id)

/**
 * 발표 id를 고치는 창으로 나선다. 상태가 바뀔 때마다 onChange: mine(이 창이 고친다), other(다른 창이 고치는 중),
 * lost(다른 창이 넘겨받았다). taken은 이 창이 넘겨받았다는 뜻으로, 그동안 다른 창이 저장한 것을 다시 읽어야 한다
 */
export function holdDeck(id: string, deps: LockDeps, onChange: (state: EditLock, taken: boolean) => void): { take(): void; close(): void } {
  const { locks } = deps
  if (!locks) {
    onChange('mine', false)
    return { take() {}, close() {} }
  }
  const tell = (state: EditLock, taken: boolean) => {
    if (state === 'lost') elsewhere.add(id)
    if (state === 'mine') elsewhere.delete(id)
    onChange(state, taken)
  }
  const channel = deps.channel(lockName(id))
  /** 쥐고 있는 잠금을 놓는다. 쥐고 있지 않으면 null */
  let release: (() => void) | null = null
  let closed = false
  let waiting: AbortController | null = null
  let timer: ReturnType<typeof setTimeout> | undefined

  const ask = (options: { ifAvailable?: boolean; steal?: boolean; signal?: AbortSignal }, taken: boolean) => {
    /** 이 요청으로 쥔 잠금을 놓는 것 */
    let own: (() => void) | null = null
    locks
      .request(lockName(id), options, (lock) => {
        if (closed) return
        if (!lock) return tell('other', false)
        waiting = null
        clearTimeout(timer)
        tell('mine', taken)
        return new Promise<void>((resolve) => (own = release = resolve))
      })
      .catch(() => {
        // 이 요청으로 쥔 잠금을 다른 창이 기다리다 못해 가져갔다(steal). 기다리다 그만둔 요청(abort)은 쥔 적이 없고,
        // 그 알림이 늦게 와도 그사이 다른 요청으로 쥔 잠금을 놓친 것으로 치면 안 된다
        if (!own || release !== own) return
        release = null
        if (!closed) tell('lost', false)
      })
  }

  channel.onmessage = (e) => {
    if ((e.data as { type?: unknown } | null)?.type !== 'take' || !release) return
    const done = release
    release = null
    void deps
      .save()
      .catch(() => {})
      .finally(() => {
        done()
        if (!closed) tell('lost', false)
      })
  }

  ask({ ifAvailable: true }, false)

  return {
    /** 이 창에서 고치기: 고치는 창에 넘겨 달라고 하고, 답이 없으면 조금 기다린 뒤 가져온다 */
    take() {
      if (release || waiting || closed) return
      const ctl = new AbortController()
      waiting = ctl
      channel.postMessage({ type: 'take' })
      ask({ signal: ctl.signal }, true)
      timer = setTimeout(() => {
        if (waiting !== ctl || closed) return
        ctl.abort()
        waiting = null
        ask({ steal: true }, true)
      }, deps.wait ?? 3000)
    },
    /** 편집기를 떠난다: 잠금을 놓아 다른 창이 바로 가져갈 수 있게 */
    close() {
      closed = true
      clearTimeout(timer)
      waiting?.abort()
      release?.()
      release = null
      elsewhere.delete(id)
      channel.close()
    },
  }
}

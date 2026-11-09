import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadUpdate } from './client'

afterEach(() => vi.unstubAllGlobals())

function stubFetch() {
  const calls: { url: string; method: string }[] = []
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    calls.push({ url, method: init.method ?? 'GET' })
    return new Response(JSON.stringify({ current: '0.4.2', boot: 'b1', auto: false, check: { state: 'unknown' }, download: { state: 'idle' } }), { status: 200 })
  })
  return calls
}

describe('홈을 열 때 새 버전 확인', () => {
  it('알림이 켜져 있으면 확인을 부탁한다', async () => {
    const calls = stubFetch()
    await loadUpdate(true)
    expect(calls).toEqual([{ url: '/__html-maker/update/check', method: 'POST' }])
  })

  it('알림을 끄면 상태만 본다 (서버가 GitHub에 묻지 않는 GET status)', async () => {
    const calls = stubFetch()
    await loadUpdate(false)
    expect(calls).toEqual([{ url: '/__html-maker/update/status', method: 'GET' }])
  })

  it('브라우저는 같은 주소(상대 경로)로만 간다', async () => {
    const calls = stubFetch()
    await loadUpdate(true)
    await loadUpdate(false)
    for (const c of calls) expect(c.url.startsWith('/')).toBe(true)
  })
})

// 시작 프로그램: 가장 새 버전 켜기, 다시 켜기, 켜지지 않는 새 버전에서 앞 버전으로 돌아가기.
// 앞쪽은 서버를 흉내 내고, 뒤쪽은 작은 서버 대역을 진짜 자식 프로세스로 띄워 IPC와 끝 코드까지 본다.

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { READY_FILE, READY_FORMAT, requiredFiles } from './versions'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { choices, runServer, supervise, type Ran, type Run } from './launch'
import { FAIL_CODE, LISTENING, RESTART_CODE, RESTARTED_ENV } from './versions'

const HOME = '/app'
const base: Run = { version: '0.8.0', dir: HOME, node: '/app/node' }
const v9: Run = { version: '0.9.0', dir: '/app/versions/0.9.0', node: '/app/versions/0.9.0/node' }
const v10: Run = { version: '0.10.0', dir: '/app/versions/0.10.0', node: '/app/versions/0.10.0/node' }

const ran = (over: Partial<Ran>): Ran => ({ listening: true, code: 0, signal: null, spawnFailed: false, ...over })

/** 켤 차례(available)와 버전마다의 결과(차례대로 하나씩 꺼낸다)로 시작 프로그램을 돌린다 */
async function play(available: () => Run[], results: Record<string, Ran[]>) {
  const runs: { version: string; restarted: boolean }[] = []
  const failed: string[] = []
  const said: string[] = []
  const code = await supervise({
    own: HOME,
    pick: (skip) => [...available().filter((r) => !skip.has(r.version)), base],
    run: async (r, restarted) => {
      runs.push({ version: r.version, restarted })
      const next = results[r.version]?.shift()
      if (!next) throw new Error(`no result for ${r.version}`)
      return next
    },
    markFailed: (r) => failed.push(r.version),
    say: (m) => said.push(m),
  })
  return { code, runs, failed, said }
}

describe('시작 프로그램', () => {
  it('가장 새 버전을 켜고, 서버가 끝나면 그 코드로 끝난다', async () => {
    const r = await play(() => [v10, v9], { '0.10.0': [ran({ code: 0 })] })
    expect(r.runs).toEqual([{ version: '0.10.0', restarted: false }])
    expect(r.code).toBe(0)
  })

  it('다시 켜기 코드로 끝나면 그사이 풀어 둔 더 새 버전을 골라 다시 켜고, 다시 켰다고 알린다(창을 새로 열지 않게)', async () => {
    let list = [v9]
    const results = { '0.9.0': [ran({ code: RESTART_CODE })], '0.10.0': [ran({ code: 0 })] }
    const r = await supervise({
      own: HOME,
      pick: (skip) => [...list.filter((x) => !skip.has(x.version)), base],
      run: async (x, restarted) => {
        const out = results[x.version as '0.9.0' | '0.10.0'].shift()!
        // 첫 서버가 떠 있는 동안 0.10.0을 풀어 두었다
        list = [v10, v9]
        expect(restarted).toBe(x.version === '0.10.0')
        return out
      },
      markFailed: () => {},
      say: () => {},
    })
    expect(r).toBe(0)
  })

  it('새 버전이 자리를 잡기 전에 끝나면 표시를 남기고 바로 앞 버전으로 켠다', async () => {
    const r = await play(() => [v10, v9], {
      '0.10.0': [ran({ listening: false, code: 1 })],
      '0.9.0': [ran({ code: 0 })],
    })
    expect(r.failed).toEqual(['0.10.0'])
    expect(r.runs.map((x) => x.version)).toEqual(['0.10.0', '0.9.0'])
    expect(r.said.join()).toContain('0.10.0')
    expect(r.code).toBe(0)
  })

  it('새 버전의 node를 띄우지도 못하면(백신이 막았을 때) 앞 버전으로, 다 안 되면 앱 폴더의 버전으로', async () => {
    const r = await play(() => [v10, v9], {
      '0.10.0': [ran({ listening: false, code: null, spawnFailed: true })],
      '0.9.0': [ran({ listening: false, code: 3 })],
      '0.8.0': [ran({ code: 0 })],
    })
    expect(r.failed).toEqual(['0.10.0', '0.9.0'])
    expect(r.runs.map((x) => x.version)).toEqual(['0.10.0', '0.9.0', '0.8.0'])
  })

  it('다시 켠 새 버전이 켜지지 않아 앞 버전으로 돌아갈 때도 창을 새로 열지 않는다', async () => {
    let list = [v9]
    const results: Record<string, Ran[]> = { '0.9.0': [ran({ code: RESTART_CODE }), ran({ code: 0 })], '0.10.0': [ran({ listening: false, code: 1 })] }
    const runs: { version: string; restarted: boolean }[] = []
    const skipFailed = new Set<string>()
    await supervise({
      own: HOME,
      pick: (skip) => [...list.filter((x) => !skip.has(x.version) && !skipFailed.has(x.version)), base],
      run: async (x, restarted) => {
        runs.push({ version: x.version, restarted })
        list = [v10, v9]
        return results[x.version].shift()!
      },
      markFailed: (x) => skipFailed.add(x.version),
      say: () => {},
    })
    expect(runs).toEqual([
      { version: '0.9.0', restarted: false },
      { version: '0.10.0', restarted: true },
      { version: '0.9.0', restarted: true },
    ])
  })

  it('까닭을 보이고 끝난 서버(포트를 다른 프로그램이 씀)는 버전 탓이 아니다: 돌아가지 않고 1로 끝난다', async () => {
    const r = await play(() => [v9], { '0.9.0': [ran({ listening: false, code: FAIL_CODE })] })
    expect(r.failed).toEqual([])
    expect(r.runs).toHaveLength(1)
    expect(r.code).toBe(1)
  })

  it('자리를 잡은 뒤에 멈춘 서버는 버전 탓으로 보지 않는다', async () => {
    const r = await play(() => [v9], { '0.9.0': [ran({ listening: true, code: 1 })] })
    expect(r.failed).toEqual([])
    expect(r.code).toBe(1)
  })

  it('시작 프로그램은 살아 있는데 서버만 신호로 죽으면(맥의 보안 검사가 SIGKILL로 막을 때) 켜지지 않은 것으로 보고 앞 버전으로', async () => {
    const r = await play(() => [v9], {
      '0.9.0': [ran({ listening: false, code: null, signal: 'SIGKILL' })],
      '0.8.0': [ran({ code: 0 })],
    })
    expect(r.failed).toEqual(['0.9.0'])
    expect(r.runs.map((x) => x.version)).toEqual(['0.9.0', '0.8.0'])
  })

  it('자리를 잡지 않고 다시 켜기 코드로 끝나면 끝없이 다시 켜지 않는다', async () => {
    const r = await play(() => [v9], { '0.9.0': [ran({ listening: false, code: RESTART_CODE })], '0.8.0': [ran({ listening: false, code: RESTART_CODE })] })
    expect(r.failed).toEqual(['0.9.0'])
    expect(r.code).toBe(1)
  })

  it('앱 폴더의 버전도 켜지지 않으면 다시 풀라고 알리고 1로 끝난다', async () => {
    const r = await play(() => [], { '0.8.0': [ran({ listening: false, code: 1 })] })
    expect(r.code).toBe(1)
    expect(r.failed).toEqual([])
    expect(r.said.join()).toContain('다시 풀어')
  })
})

describe('시작 프로그램이 띄우는 진짜 자식', () => {
  /** dist-node/serve.mjs 자리에 대역을 둔 버전 폴더 */
  function fakeVersion(code: string) {
    const dir = mkdtempSync(join(tmpdir(), 'gyeol-launch-'))
    mkdirSync(join(dir, 'dist-node'))
    writeFileSync(join(dir, 'dist-node', 'serve.mjs'), code)
    return dir
  }

  it('자리를 잡았다는 말(IPC)과 끝 코드를 받고, 다시 켰다는 표시를 넘긴다', async () => {
    const dir = fakeVersion(`
      if (process.env.${RESTARTED_ENV} !== '1') process.exit(9)
      process.send(${JSON.stringify(LISTENING)}, () => process.exit(${RESTART_CODE}))
    `)
    const r = await runServer({ version: '0.9.0', dir, node: process.execPath }, true)
    expect(r).toEqual({ listening: true, code: RESTART_CODE, signal: null, spawnFailed: false })
    const first = await runServer({ version: '0.9.0', dir, node: process.execPath }, false)
    expect(first.code).toBe(9)
  })

  it('켜자마자 던지는 서버는 자리를 잡지 않은 채 끝난다', async () => {
    const dir = fakeVersion(`throw new Error('망가진 새 버전')`)
    const r = await runServer({ version: '0.9.0', dir, node: process.execPath }, false)
    expect(r.listening).toBe(false)
    expect(r.code).not.toBe(0)
  })

  it('신호로 죽은 서버는 신호를 그대로 알린다', async () => {
    if (process.platform === 'win32') return
    const dir = fakeVersion(`process.kill(process.pid, 'SIGKILL')`)
    const r = await runServer({ version: '0.9.0', dir, node: process.execPath }, false)
    expect(r).toMatchObject({ listening: false, signal: 'SIGKILL' })
  })

  it('node가 없으면(백신이 지웠을 때) 띄우지 못했다고 알린다', async () => {
    const dir = fakeVersion('')
    const r = await runServer({ version: '0.9.0', dir, node: join(dir, 'node', 'node.exe') }, false)
    expect(r.spawnFailed).toBe(true)
  })

  it('진짜 자식으로 돌려도: 망가진 새 버전에서 앞 버전으로 돌아가 켠다', async () => {
    const broken = fakeVersion(`throw new Error('망가진 새 버전')`)
    const good = fakeVersion(`process.send(${JSON.stringify(LISTENING)}, () => process.exit(0))`)
    const failed: string[] = []
    const code = await supervise({
      own: good,
      pick: (skip) => [
        ...(skip.has('0.9.0') ? [] : [{ version: '0.9.0', dir: broken, node: process.execPath }]),
        { version: '0.8.0', dir: good, node: process.execPath },
      ],
      run: runServer,
      markFailed: (r) => failed.push(r.version),
      say: () => {},
    })
    expect(failed).toEqual(['0.9.0'])
    expect(code).toBe(0)
  })
})

describe('켤 차례', () => {
  /** 앱 폴더와 그 안의 버전 폴더(다 풀고 확인을 마친 것) */
  function app(...versions: string[]) {
    const home = mkdtempSync(join(tmpdir(), 'gyeol-choices-'))
    for (const v of versions) {
      const dir = join(home, 'versions', v)
      for (const f of requiredFiles('win32', 'x64')) {
        mkdirSync(join(dir, ...f.split('/').slice(0, -1)), { recursive: true })
        writeFileSync(join(dir, ...f.split('/')), 'x')
      }
      writeFileSync(join(dir, READY_FILE), JSON.stringify({ format: READY_FORMAT, version: v }))
    }
    return home
  }

  it('앱 폴더에서 켜면 새 버전부터, 마지막은 앱 폴더 자신', () => {
    const home = app('0.9.0', '0.10.0')
    const list = choices(home, '0.8.0', '/node', 'win32', 'x64', new Set())
    expect(list.map((r) => [r.version, r.dir])).toEqual([
      ['0.10.0', join(home, 'versions', '0.10.0')],
      ['0.9.0', join(home, 'versions', '0.9.0')],
      ['0.8.0', home],
    ])
    expect(list[0].node).toBe(join(home, 'versions', '0.10.0', 'node', 'node.exe'))
  })

  it('versions 안의 Framo.exe를 직접 눌러도 그 버전 폴더의 서버를 켠다(앱 폴더의 서버를 다른 node로 켜지 않는다)', () => {
    const home = app('0.9.0', '0.10.0')
    const own = join(home, 'versions', '0.9.0')
    const list = choices(own, '0.9.0', join(own, 'node', 'node.exe'), 'win32', 'x64', new Set())
    expect(list.map((r) => [r.version, r.dir])).toEqual([
      ['0.10.0', join(home, 'versions', '0.10.0')],
      ['0.9.0', own],
    ])
  })
})

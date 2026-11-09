// 새 버전 확인과 받기. 네트워크에는 닿지 않는다: GitHub 대신 흉내 낸 GET(fake)을 넣는다.

import { createHash } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer, request, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { UpdateStatus } from '../src/update/protocol'
import { allowedHop, createUpdater, MAX_ASSET_BYTES, parseRelease, REPOS, type Getter } from './update'
import { compareVersions, FAILED_FILE, READY_FILE, READY_FORMAT, requiredFiles } from './versions'
import { fakePackage } from './zipFixture'
import { createUpdateHandler, dropFile, type UpdateSetup } from './updateRoutes'

const ZIP = Buffer.from('지어낸 배포본 내용 '.repeat(200))
const SHA = createHash('sha256').update(ZIP).digest('hex')
const DL = 'https://github.com/wlsdks/gyeol/releases/download/v0.9.0/gyeol-windows.zip'
const ASSET_HOST = 'https://release-assets.githubusercontent.com/github-production-release-asset/1/abc'

function release(over: Record<string, unknown> = {}, asset: Record<string, unknown> = {}) {
  return {
    tag_name: 'v0.9.0',
    html_url: 'https://github.com/wlsdks/gyeol/releases/tag/v0.9.0',
    draft: false,
    prerelease: false,
    assets: [
      { name: 'gyeol-mac.zip', size: 10, digest: `sha256:${'0'.repeat(64)}`, browser_download_url: 'https://github.com/wlsdks/gyeol/releases/download/v0.9.0/gyeol-mac.zip' },
      { name: 'gyeol-windows.zip', size: ZIP.length, digest: `sha256:${SHA}`, browser_download_url: DL, ...asset },
    ],
    ...over,
  }
}

interface Reply {
  status: number
  location?: string
  body?: Buffer | string
}

/** 주소마다 정한 답을 하는 가짜 GET. 받은 주소와 머리글을 남긴다 */
function fake(replies: Record<string, Reply | (() => Reply)>) {
  const calls: { url: string; headers: Record<string, string> }[] = []
  const get: Getter = async (url, headers) => {
    calls.push({ url: url.href, headers })
    const r = replies[url.href]
    if (!r) throw new Error('offline')
    const reply = typeof r === 'function' ? r() : r
    const body = Buffer.isBuffer(reply.body) ? reply.body : Buffer.from(reply.body ?? '')
    return {
      status: reply.status,
      location: reply.location,
      // 조각으로 나눠 흘려보낸다 (진행과 크기 상한을 보려고)
      body: (async function* () {
        for (let i = 0; i < body.length; i += 1000) yield body.subarray(i, i + 1000)
      })(),
      close() {},
    }
  }
  return { get, calls }
}

const API = 'https://api.github.com/repos/wlsdks/gyeol/releases/latest'
const API_NEW = 'https://api.github.com/repos/wlsdks/framo/releases/latest'

/** 저장소 이름을 framo로 바꾼 뒤의 릴리스 */
function renamed() {
  return JSON.parse(JSON.stringify(release()).replaceAll('wlsdks/gyeol', 'wlsdks/framo'))
}

describe('버전 견주기', () => {
  it('X.Y.Z를 숫자로 견준다', () => {
    expect(compareVersions('0.10.0', '0.9.9')).toBe(1)
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0)
    expect(compareVersions('0.4.2', '0.5.0')).toBe(-1)
  })

  it('꼴이 틀리면 새 버전으로 보지 않는다', () => {
    expect(compareVersions('1.0.0-beta', '0.1.0') > 0).toBe(false)
    expect(compareVersions('v1.0.0', '0.1.0') > 0).toBe(false)
  })
})

describe('릴리스 정보 고르기', () => {
  it('이 OS의 파일과 지문을 고른다', () => {
    expect(parseRelease(release(), 'win32')).toEqual({
      version: '0.9.0',
      page: 'https://github.com/wlsdks/gyeol/releases/tag/v0.9.0',
      asset: { url: DL, size: ZIP.length, sha256: SHA },
    })
  })

  it('바꾼 이름(framo)의 릴리스는 그 이름으로 받은 답일 때만', () => {
    expect(parseRelease(renamed(), 'win32', REPOS[1])?.asset?.url).toBe('https://github.com/wlsdks/framo/releases/download/v0.9.0/gyeol-windows.zip')
    // 예전 이름에 물었는데 새 이름의 주소가 오거나, 그 반대면 받지 않는다
    expect(parseRelease(renamed(), 'win32', REPOS[0])).toBeNull()
    expect(parseRelease(release(), 'win32', REPOS[1])).toBeNull()
  })

  it('배포본이 없는 OS는 받지 않고 페이지만 알린다', () => {
    expect(parseRelease(release(), 'linux')?.asset).toBeNull()
  })

  it('다른 저장소의 릴리스 페이지는 받지 않는다', () => {
    expect(parseRelease(release({ html_url: 'https://github.com/someone/gyeol/releases/tag/v0.9.0' }), 'win32')).toBeNull()
    expect(parseRelease(release({ html_url: 'https://evil.example/wlsdks/gyeol/releases/tag/v0.9.0' }), 'win32')).toBeNull()
  })

  it('태그 꼴이 다르거나 초안, 미리 보기 릴리스면 받지 않는다', () => {
    expect(parseRelease(release({ tag_name: 'v0.9.0/../../x' }), 'win32')).toBeNull()
    expect(parseRelease(release({ tag_name: '0.9.0' }), 'win32')).toBeNull()
    expect(parseRelease(release({ draft: true }), 'win32')).toBeNull()
    expect(parseRelease(release({ prerelease: true }), 'win32')).toBeNull()
  })

  it('받을 주소가 이 저장소의 그 태그 파일이 아니면 받지 않는다', () => {
    for (const url of [
      'https://github.com/someone/gyeol/releases/download/v0.9.0/gyeol-windows.zip',
      'http://github.com/wlsdks/gyeol/releases/download/v0.9.0/gyeol-windows.zip',
      'https://evil.example/wlsdks/gyeol/releases/download/v0.9.0/gyeol-windows.zip',
      'https://github.com/wlsdks/gyeol/releases/download/v0.8.0/gyeol-windows.zip',
      'https://github.com/wlsdks/gyeol/releases/download/v0.9.0/../../../evil/gyeol-windows.zip',
    ]) {
      expect(parseRelease(release({}, { browser_download_url: url }), 'win32')?.asset).toBeNull()
    }
  })

  it('지문이 없거나 꼴이 다르면 받지 않는다 (확인하지 않은 파일은 받지 않는다)', () => {
    expect(parseRelease(release({}, { digest: undefined }), 'win32')?.asset).toBeNull()
    expect(parseRelease(release({}, { digest: `md5:${'0'.repeat(32)}` }), 'win32')?.asset).toBeNull()
    expect(parseRelease(release({}, { digest: 'sha256:xyz' }), 'win32')?.asset).toBeNull()
  })

  it('크기가 상한을 넘거나 이상하면 받지 않는다', () => {
    expect(parseRelease(release({}, { size: MAX_ASSET_BYTES + 1 }), 'win32')?.asset).toBeNull()
    expect(parseRelease(release({}, { size: 0 }), 'win32')?.asset).toBeNull()
    expect(parseRelease(release({}, { size: '100' }), 'win32')?.asset).toBeNull()
  })
})

describe('받을 때 따라가는 곳', () => {
  it('첫 주소는 github.com의 이 저장소 릴리스 파일만', () => {
    expect(allowedHop(new URL(DL), true)).toBe(true)
    expect(allowedHop(new URL('https://github.com/someone/gyeol/releases/download/v1.0.0/x.zip'), true)).toBe(false)
    expect(allowedHop(new URL(ASSET_HOST), true)).toBe(false)
    expect(allowedHop(new URL('https://github.com/wlsdks/framo/releases/download/v1.0.0/gyeol-windows.zip'), true)).toBe(true)
    expect(allowedHop(new URL('https://github.com/wlsdks/framo2/releases/download/v1.0.0/x.zip'), true)).toBe(false)
    // ../는 URL이 먼저 풀어서 저장소 경로가 남지 않는다
    expect(allowedHop(new URL('https://github.com/wlsdks/gyeol/releases/download/../../../someone/x'), true)).toBe(false)
  })

  it('넘겨받는 곳은 GitHub의 파일 보관소만, https, 기본 포트, 사용자 정보 없이', () => {
    expect(allowedHop(new URL(ASSET_HOST), false)).toBe(true)
    expect(allowedHop(new URL('https://objects.githubusercontent.com/x'), false)).toBe(true)
    expect(allowedHop(new URL('http://release-assets.githubusercontent.com/x'), false)).toBe(false)
    expect(allowedHop(new URL('https://evil.example/x'), false)).toBe(false)
    expect(allowedHop(new URL('https://githubusercontent.com.evil.example/x'), false)).toBe(false)
    expect(allowedHop(new URL('https://release-assets.githubusercontent.com:8443/x'), false)).toBe(false)
    expect(allowedHop(new URL('https://user:pw@release-assets.githubusercontent.com/x'), false)).toBe(false)
    expect(allowedHop(new URL('https://api.github.com/x'), false)).toBe(false)
  })
})

describe('확인', () => {
  it('api.github.com에 Accept와 User-Agent만 보낸다', async () => {
    const { get, calls } = fake({ [API]: { status: 200, body: JSON.stringify(release()) } })
    const r = await createUpdater({ version: '0.4.2', platform: 'win32', get }).latest()
    expect(r?.version).toBe('0.9.0')
    expect(calls).toEqual([{ url: API, headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Framo/0.4.2' } }])
  })

  it('지금 이름이 200이면 바꿀 이름에는 묻지 않는다', async () => {
    const { get, calls } = fake({ [API]: { status: 200, body: JSON.stringify(release()) }, [API_NEW]: { status: 200, body: JSON.stringify(renamed()) } })
    expect((await createUpdater({ version: '0.4.2', platform: 'win32', get }).latest())?.page).toBe('https://github.com/wlsdks/gyeol/releases/tag/v0.9.0')
    expect(calls.map((c) => c.url)).toEqual([API])
  })

  it('저장소 이름을 바꿔 예전 이름이 넘겨주면 넘겨준 곳은 따라가지 않고 바꿀 이름에 묻는다', async () => {
    const { get, calls } = fake({
      [API]: { status: 301, location: 'https://api.github.com/repositories/1/releases/latest' },
      [API_NEW]: { status: 200, body: JSON.stringify(renamed()) },
    })
    const r = await createUpdater({ version: '0.4.2', platform: 'win32', get }).latest()
    expect(r?.page).toBe('https://github.com/wlsdks/framo/releases/tag/v0.9.0')
    expect(r?.asset?.url).toBe('https://github.com/wlsdks/framo/releases/download/v0.9.0/gyeol-windows.zip')
    expect(calls.map((c) => c.url)).toEqual([API, API_NEW])
    for (const c of calls) expect(c.headers).toEqual({ Accept: 'application/vnd.github+json', 'User-Agent': 'Framo/0.4.2' })
  })

  it('바꿀 이름이 다른 저장소의 답을 주면 받지 않는다', async () => {
    const { get } = fake({ [API]: { status: 404 }, [API_NEW]: { status: 200, body: JSON.stringify(release()) } })
    expect(await createUpdater({ version: '0.4.2', platform: 'win32', get }).latest()).toBeNull()
  })

  it('닿지 못하거나, 넘겨주거나, 답이 이상하면 조용히 null', async () => {
    // 200이 아닌 답은 두 이름 모두에 묻고 그만둔다
    for (const reply of [{ status: 500 }, { status: 301, location: 'https://evil.example/' }] as Reply[]) {
      const { get, calls } = fake({ [API]: reply, [API_NEW]: reply })
      expect(await createUpdater({ version: '0.4.2', get }).latest()).toBeNull()
      expect(calls.map((c) => c.url)).toEqual([API, API_NEW])
    }
    // 200을 받은 뒤 답이 이상하면 다른 이름에 더 묻지 않는다
    for (const reply of [
      { status: 200, body: '<html>회사 네트워크 차단 안내</html>' },
      { status: 200, body: Buffer.alloc(2 * 1024 * 1024, 32) },
    ] as Reply[]) {
      const { get, calls } = fake({ [API]: reply, [API_NEW]: { status: 200, body: JSON.stringify(renamed()) } })
      expect(await createUpdater({ version: '0.4.2', get }).latest()).toBeNull()
      expect(calls).toHaveLength(1)
    }
    expect(await createUpdater({ version: '0.4.2', get: fake({}).get }).latest()).toBeNull()
  })
})

describe('받기', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gyeol-update-'))
  let n = 0
  const target = () => join(dir, `새 버전 ${++n}`, 'gyeol-windows.zip')
  const asset = { url: DL, size: ZIP.length, sha256: SHA }

  it('GitHub이 넘겨주는 파일 보관소에서 받아 지문을 맞추고 남긴다', async () => {
    const { get, calls } = fake({ [DL]: { status: 302, location: ASSET_HOST }, [ASSET_HOST]: { status: 200, body: ZIP } })
    const file = target()
    const seen: number[] = []
    expect(await createUpdater({ version: '0.4.2', get }).download(asset, file, (r) => seen.push(r))).toBe('ok')
    expect(readFileSync(file).equals(ZIP)).toBe(true)
    expect(seen.at(-1)).toBe(ZIP.length)
    expect(calls.map((c) => c.url)).toEqual([DL, ASSET_HOST])
    for (const c of calls) expect(c.headers).toEqual({ Accept: 'application/octet-stream', 'User-Agent': 'Framo/0.4.2' })
    expect(readdirSync(join(file, '..'))).toEqual(['gyeol-windows.zip'])
  })

  it('정해 둔 곳 밖이나 http로 넘기면 따라가지 않는다', async () => {
    for (const location of ['https://evil.example/x.zip', 'http://release-assets.githubusercontent.com/x', '//evil.example/x']) {
      const { get, calls } = fake({ [DL]: { status: 302, location } })
      const file = target()
      expect(await createUpdater({ version: '0.4.2', get }).download(asset, file, () => {})).toBe('verify')
      expect(calls).toHaveLength(1)
      expect(existsSync(file)).toBe(false)
    }
  })

  it('넘겨주기가 여섯 번을 넘으면 그만둔다', async () => {
    const { get, calls } = fake({ [DL]: { status: 302, location: ASSET_HOST }, [ASSET_HOST]: { status: 302, location: ASSET_HOST } })
    expect(await createUpdater({ version: '0.4.2', get }).download(asset, target(), () => {})).toBe('network')
    expect(calls.length).toBe(6)
  })

  it('지문이 다르면 받은 것을 지운다', async () => {
    const { get } = fake({ [DL]: { status: 200, body: Buffer.from(ZIP).fill(65, 0, 1) } })
    const file = target()
    expect(await createUpdater({ version: '0.4.2', get }).download(asset, file, () => {})).toBe('verify')
    expect(existsSync(file)).toBe(false)
    expect(readdirSync(join(file, '..'))).toEqual([])
  })

  it('알려 준 크기보다 많이 오면 끊고 지운다', async () => {
    const { get } = fake({ [DL]: { status: 200, body: Buffer.concat([ZIP, ZIP]) } })
    const file = target()
    expect(await createUpdater({ version: '0.4.2', get }).download(asset, file, () => {})).toBe('verify')
    expect(existsSync(file)).toBe(false)
  })

  it('없는 파일(404)이나 끊긴 연결은 network', async () => {
    expect(await createUpdater({ version: '0.4.2', get: fake({ [DL]: { status: 404 } }).get }).download(asset, target(), () => {})).toBe('network')
    expect(await createUpdater({ version: '0.4.2', get: fake({}).get }).download(asset, target(), () => {})).toBe('network')
  })

  it('다른 저장소의 주소는 아예 묻지 않는다', async () => {
    const { get, calls } = fake({})
    const other = { ...asset, url: 'https://github.com/someone/gyeol/releases/download/v0.9.0/gyeol-windows.zip' }
    expect(await createUpdater({ version: '0.4.2', get }).download(other, target(), () => {})).toBe('verify')
    expect(calls).toHaveLength(0)
  })
})

describe('새 버전 창구', () => {
  let server: Server | null = null
  afterEach(() => new Promise<void>((r) => (server ? server.close(() => r()) : r())))

  async function serve(setup: Partial<UpdateSetup>) {
    const handle = createUpdateHandler({ version: '0.4.2', downloadDir: null, platform: 'win32', reveal: () => {}, ...setup })
    server = createServer((req, res) => {
      handle(req, res).then((done) => done || (res.writeHead(404), res.end()))
    })
    await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r))
    const port = (server.address() as AddressInfo).port
    return (path: string, { method = 'POST', headers = { 'X-HTML-Maker': '1' } as Record<string, string> } = {}) =>
      new Promise<{ status: number; body: UpdateStatus & { error?: string } }>((resolve, reject) => {
        const req = request({ host: '127.0.0.1', port, path: `/__html-maker/update/${path}`, method, headers }, (res) => {
          let text = ''
          res.on('data', (c) => (text += c))
          res.on('end', () => resolve({ status: res.statusCode ?? 0, body: JSON.parse(text) }))
        })
        req.on('error', reject)
        req.end()
      })
  }

  it('앱의 머리글이 없거나 다른 Origin이면 403이고 GitHub에 묻지 않는다', async () => {
    const { get, calls } = fake({ [API]: { status: 200, body: JSON.stringify(release()) } })
    const call = await serve({ get })
    expect((await call('check', { headers: {} })).status).toBe(403)
    expect((await call('check', { headers: { 'X-HTML-Maker': '1', Origin: 'https://evil.example' } })).status).toBe(403)
    expect((await call('download', { headers: { Origin: 'https://evil.example' } })).status).toBe(403)
    expect(calls).toHaveLength(0)
  })

  it('상태 보기(GET status)는 GitHub에 묻지 않는다 (알림을 끄면 화면이 이것만 부른다)', async () => {
    const { get, calls } = fake({ [API]: { status: 200, body: JSON.stringify(release()) } })
    const call = await serve({ get })
    const res = await call('status', { method: 'GET' })
    expect(res.body.check).toEqual({ state: 'unknown' })
    expect(calls).toHaveLength(0)
  })

  it('하루에 한 번만 묻고, 다시 확인은 바로 묻는다', async () => {
    const { get, calls } = fake({ [API]: { status: 200, body: JSON.stringify(release()) } })
    let now = 1_000_000
    const call = await serve({ get, now: () => now })
    expect((await call('check')).body.check).toMatchObject({ state: 'available', version: '0.9.0', download: false })
    await call('check')
    expect(calls).toHaveLength(1)
    await call('check/now')
    expect(calls).toHaveLength(2)
    now += 25 * 60 * 60 * 1000
    await call('check')
    expect(calls).toHaveLength(3)
  })

  it('확인하지 못하면 정해진 말만 돌려준다', async () => {
    const call = await serve({ get: fake({}).get })
    const res = await call('check')
    expect(res.body.check.state).toBe('failed')
    expect(JSON.stringify(res.body)).not.toMatch(/offline|github|https?:/)
  })

  it('같은 버전이면 최신이라고 한다', async () => {
    const { get } = fake({ [API]: { status: 200, body: JSON.stringify(release({ tag_name: 'v0.4.2', html_url: 'https://github.com/wlsdks/gyeol/releases/tag/v0.4.2' })) } })
    const call = await serve({ get })
    expect((await call('check')).body.check.state).toBe('latest')
  })

  it('개발 서버(받을 폴더 없음)는 받지 않는다', async () => {
    const { get, calls } = fake({ [API]: { status: 200, body: JSON.stringify(release()) }, [DL]: { status: 200, body: ZIP } })
    const call = await serve({ get, downloadDir: null })
    await call('check')
    const res = await call('download')
    expect(res.status).toBe(409)
    expect(calls.map((c) => c.url)).toEqual([API])
  })

  it('받을 폴더가 있으면 받고 폴더를 연다', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gyeol-update-route-'))
    const opened: string[] = []
    const { get } = fake({ [API]: { status: 200, body: JSON.stringify(release()) }, [DL]: { status: 302, location: ASSET_HOST }, [ASSET_HOST]: { status: 200, body: ZIP } })
    const call = await serve({ get, downloadDir: dir, reveal: (f) => opened.push(f) })
    expect((await call('check')).body.check).toMatchObject({ state: 'available', download: true })
    expect((await call('download')).status).toBe(202)
    for (let i = 0; i < 50 && (await call('status', { method: 'GET' })).body.download.state !== 'done'; i++) await new Promise((r) => setTimeout(r, 10))
    expect((await call('status', { method: 'GET' })).body.download).toEqual({ state: 'done' })
    // 이름은 네트워크에서 온 것이 아니라 정해 둔 것
    expect(opened).toEqual([join(dir, 'gyeol-windows.zip')])
    expect(readFileSync(join(dir, 'gyeol-windows.zip')).equals(ZIP)).toBe(true)
  })

  it('받는 동안에는 다시 묻지 않는다 (받는 버전과 알리는 버전이 어긋나지 않게)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gyeol-update-route-'))
    let latest = release()
    const { get: answer, calls } = fake({ [API]: () => ({ status: 200, body: JSON.stringify(latest) }), [DL]: { status: 302, location: ASSET_HOST } })
    // 파일 보관소는 앞 조각만 보내고 붙잡아 둔다
    let open = () => {}
    const gate = new Promise<void>((r) => (open = r))
    const get: Getter = async (url, headers, idleMs) => {
      if (url.href !== ASSET_HOST) return answer(url, headers, idleMs)
      return {
        status: 200,
        body: (async function* () {
          yield ZIP.subarray(0, 1000)
          await gate
          yield ZIP.subarray(1000)
        })(),
        close() {},
      }
    }
    const call = await serve({ get, downloadDir: dir })
    expect((await call('check')).body.check).toMatchObject({ state: 'available', version: '0.9.0' })
    expect((await call('download')).status).toBe(202)
    // 받는 사이에 더 새 버전이 나왔다. 지금 받는 것은 0.9.0이므로 0.9.1이라고 알리면 안 된다
    latest = release(
      { tag_name: 'v0.9.1', html_url: 'https://github.com/wlsdks/gyeol/releases/tag/v0.9.1' },
      { browser_download_url: 'https://github.com/wlsdks/gyeol/releases/download/v0.9.1/gyeol-windows.zip' },
    )
    const during = await call('check/now')
    expect(during.body.check).toMatchObject({ state: 'available', version: '0.9.0' })
    expect(during.body.download.state).toBe('downloading')
    expect(calls.filter((c) => c.url === API)).toHaveLength(1)
    open()
    for (let i = 0; i < 50 && (await call('status', { method: 'GET' })).body.download.state !== 'done'; i++) await new Promise((r) => setTimeout(r, 10))
    expect((await call('status', { method: 'GET' })).body.download).toEqual({ state: 'done' })
    // 다 받은 뒤에 다시 확인하면 더 새 버전을 알리고, 받기는 처음부터
    const after = await call('check/now')
    expect(after.body.check).toMatchObject({ state: 'available', version: '0.9.1' })
    expect(after.body.download).toEqual({ state: 'idle' })
  })

  it('지문이 없는 릴리스는 받지 않고 페이지만 알린다', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gyeol-update-route-'))
    const { get, calls } = fake({ [API]: { status: 200, body: JSON.stringify(release({}, { digest: undefined })) } })
    const call = await serve({ get, downloadDir: dir })
    expect((await call('check')).body.check).toMatchObject({ state: 'available', download: false, page: 'https://github.com/wlsdks/gyeol/releases/tag/v0.9.0' })
    expect((await call('download')).status).toBe(409)
    expect(calls).toHaveLength(1)
  })
  describe('저절로 바꾸기(시작 프로그램으로 켠 Framo)', () => {
    /** 지어낸 배포본 zip을 0.9.0 릴리스로 내놓는 가짜 GitHub */
    function packaged(zip = fakePackage('0.9.0', 'win32')) {
      const sha = createHash('sha256').update(zip).digest('hex')
      return fake({
        [API]: { status: 200, body: JSON.stringify(release({}, { size: zip.length, digest: `sha256:${sha}` })) },
        [DL]: { status: 302, location: ASSET_HOST },
        [ASSET_HOST]: { status: 200, body: zip },
      })
    }

    function app() {
      const home = mkdtempSync(join(tmpdir(), 'gyeol-update-app-'))
      return { home, downloadDir: join(home, '새 버전') }
    }

    async function until(call: Awaited<ReturnType<typeof serve>>, ok: (s: UpdateStatus) => boolean) {
      for (let i = 0; i < 200; i++) {
        const s = (await call('status', { method: 'GET' })).body
        if (ok(s)) return s
        await new Promise((r) => setTimeout(r, 10))
      }
      throw new Error('기다린 상태가 오지 않았어요')
    }

    it('업데이트: 받고, 풀고, 확인을 마치면 다시 시작을 권한다. 받은 zip은 지우고 폴더를 열지 않는다', async () => {
      const { home, downloadDir } = app()
      const opened: string[] = []
      let restarts = 0
      const call = await serve({ get: packaged().get, downloadDir, home, restart: () => restarts++, reveal: (f) => opened.push(f) })
      const first = await call('check')
      expect(first.body).toMatchObject({ auto: true, check: { state: 'available', version: '0.9.0', download: true } })
      expect((await call('download')).status).toBe(202)
      const done = await until(call, (s) => s.download.state === 'ready')
      expect(done.download).toEqual({ state: 'ready', version: '0.9.0' })
      expect(existsSync(join(home, 'versions', '0.9.0', READY_FILE))).toBe(true)
      expect(existsSync(join(downloadDir, 'gyeol-windows.zip'))).toBe(false)
      expect(opened).toEqual([])
      // 다시 확인해도 같은 버전이면 다시 시작 권유가 그대로다
      expect((await call('check/now')).body.download).toEqual({ state: 'ready', version: '0.9.0' })
      expect(restarts).toBe(0)
      const res = await call('restart')
      expect(res.status).toBe(202)
      await new Promise((r) => setTimeout(r, 20))
      // 답을 다 보낸 뒤에 한 번만
      expect(restarts).toBe(1)
      expect(res.body.boot).toBe(first.body.boot)
    })

    it('다시 시작은 풀어 둔 새 버전이 있고, 시작 프로그램으로 켰을 때만 받는다', async () => {
      const { home, downloadDir } = app()
      let restarts = 0
      const call = await serve({ get: packaged().get, downloadDir, home, restart: () => restarts++ })
      expect((await call('restart')).status).toBe(409)
      expect((await call('restart', { headers: {} })).status).toBe(403)
      // 시작 프로그램 없이 켠 서버(restart 없음)는 풀지 않고 사람이 푸는 길로
      const manual = await serve({ get: packaged().get, downloadDir: app().downloadDir, home })
      expect((await manual('status', { method: 'GET' })).body.auto).toBe(false)
      expect((await manual('restart')).status).toBe(409)
      expect(restarts).toBe(0)
    })

    it('풀지 못하면(배포본과 꼴이 다르면) 받은 폴더를 열어 사람이 풀게 하고 까닭을 알린다', async () => {
      const { home, downloadDir } = app()
      const opened: string[] = []
      const call = await serve({ get: packaged(fakePackage('0.9.0', 'win32', { 'node/node.exe': null })).get, downloadDir, home, restart: () => {}, reveal: (f) => opened.push(f) })
      await call('check')
      await call('download')
      const s = await until(call, (x) => x.download.state === 'done')
      expect(s.download).toEqual({ state: 'done', why: 'layout' })
      expect(opened).toEqual([join(downloadDir, 'gyeol-windows.zip')])
      expect(existsSync(join(home, 'versions', '0.9.0'))).toBe(false)
    })

    /** 받아 둔 버전 폴더 */
    function put(home: string, version: string, failed = false) {
      const dir = join(home, 'versions', version)
      for (const f of requiredFiles('win32', process.arch)) {
        mkdirSync(join(dir, ...f.split('/').slice(0, -1)), { recursive: true })
        writeFileSync(join(dir, ...f.split('/')), 'x')
      }
      writeFileSync(join(dir, READY_FILE), JSON.stringify({ format: READY_FORMAT, version }))
      if (failed) writeFileSync(join(dir, FAILED_FILE), '{}')
    }

    it('켤 때 받아 둔 새 버전이 있으면 GitHub에 묻지 않고도 다시 시작을 권한다', async () => {
      const { home, downloadDir } = app()
      put(home, '0.9.0')
      const { get, calls } = packaged()
      const call = await serve({ get, downloadDir, home, restart: () => {} })
      expect((await call('status', { method: 'GET' })).body.download).toEqual({ state: 'ready', version: '0.9.0' })
      expect(calls).toHaveLength(0)
    })

    it('받아 둔 새 버전이 켜지지 않았으면 알리고, 다시 받으면 풀지 않고 사람이 풀게 한다(또 켜지지 않게)', async () => {
      const { home, downloadDir } = app()
      put(home, '0.9.0', true)
      const opened: string[] = []
      const call = await serve({ get: packaged().get, downloadDir, home, restart: () => {}, reveal: (f) => opened.push(f) })
      expect((await call('status', { method: 'GET' })).body.download).toEqual({ state: 'failed', reason: 'start' })
      // 같은 버전이 나와 있다고 확인해도 켜지지 않았다는 알림은 그대로
      expect((await call('check')).body.download).toEqual({ state: 'failed', reason: 'start' })
      await call('download')
      const s = await until(call, (x) => x.download.state === 'done')
      expect(s.download).toEqual({ state: 'done', why: 'start' })
      expect(opened).toHaveLength(1)
      expect(readFileSync(join(home, 'versions', '0.9.0', FAILED_FILE), 'utf8')).toBe('{}')
    })
  })
})

describe('받은 zip 지우기', () => {
  it('지우지 못해도(막힌 폴더) 던지지 않는다: 받기가 끝난 뒤에 불러 서버가 꺼지지 않게', () => {
    if (process.platform === 'win32' || process.getuid?.() === 0) return
    const dir = mkdtempSync(join(tmpdir(), 'gyeol-drop-'))
    const file = join(dir, 'gyeol-mac.zip')
    writeFileSync(file, 'zip')
    chmodSync(dir, 0o500)
    try {
      expect(() => dropFile(file)).not.toThrow()
      expect(existsSync(file)).toBe(true)
    } finally {
      chmodSync(dir, 0o700)
    }
    dropFile(file)
    expect(existsSync(file)).toBe(false)
  })
})

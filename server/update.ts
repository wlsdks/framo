// 새 버전 확인과 받기. Framo가 이 PC 밖으로 연결하는 곳은 이 파일 하나뿐이다('AI에게 부탁'이 띄우는 Claude Code는 따로 도는 프로그램).
// scripts/offline.test.ts가 다른 파일에서 바깥으로 연결하는 코드를 찾으면 시험을 멈춘다.
//
// 가는 곳은 GitHub의 wlsdks/gyeol 저장소 릴리스뿐이다. 저장소 이름을 wlsdks/framo로 바꿀 때를 위해 그 이름도 같이 안다(REPOS).
//   1) 확인: GET https://api.github.com/repos/wlsdks/gyeol/releases/latest
//      답이 200이 아니면(이름을 바꾸면 예전 이름은 301로 넘긴다) 같은 꼴로 wlsdks/framo에 한 번 더 묻는다. 넘겨주기는 따라가지 않는다
//      보내는 것은 Accept와 User-Agent(Framo/버전) 머리글뿐. 쿠키, 토큰, 발표 내용, 이 PC의 정보는 보내지 않는다.
//   2) 받기(사람이 '받기'를 누를 때만): https://github.com/wlsdks/gyeol/releases/download/<태그>/<이 OS의 zip>
//      GitHub은 이 주소를 파일 보관소(release-assets.githubusercontent.com, 예전에는 objects.githubusercontent.com)로
//      한 번 넘긴다(302, 2026-10 확인). 넘기는 곳도 정해 둔 이름 안에서만 따라간다.
//
// 받은 파일은 GitHub이 알려 준 SHA-256 지문과 크기가 맞을 때만 남긴다. 지문이 없는 릴리스는 받지 않고 릴리스 페이지만 알린다.
// 받은 파일을 풀거나 실행하지 않는다. 사람이 폴더에서 직접 푼다.
// 실패는 조용히, 정해진 말로만 알린다. 네트워크 오류 글, 주소, 경로는 밖으로 내보내지 않는다.

import { createHash } from 'node:crypto'
import { createWriteStream, mkdirSync, renameSync, rmSync } from 'node:fs'
import { get as httpsGet } from 'node:https'
import { dirname } from 'node:path'
import type { DownloadError } from '../src/update/protocol'

// 주소는 글자 그대로 적는다. 빌드 결과의 바깥 주소 검사(scripts/offline.mjs)가 이 꼴 그대로만 허락한다
/**
 * 이 앱이 아는 저장소. 묻는 차례대로: 지금 이름, 바꿀 이름.
 * 저장소 이름을 바꾸면 예전에 내놓은 버전(0.5.4까지)은 새 버전을 찾지 못한다(예전 이름은 넘겨주기만 하고 그 버전은 따라가지 않는다).
 * 그래서 두 이름을 다 아는 버전을 먼저 내놓고, 충분히 퍼진 뒤에 바꾼다
 */
export const REPOS = [
  {
    name: 'wlsdks/gyeol',
    latest: 'https://api.github.com/repos/wlsdks/gyeol/releases/latest',
    page: 'https://github.com/wlsdks/gyeol/releases/tag/',
    download: 'https://github.com/wlsdks/gyeol/releases/download/',
  },
  {
    name: 'wlsdks/framo',
    latest: 'https://api.github.com/repos/wlsdks/framo/releases/latest',
    page: 'https://github.com/wlsdks/framo/releases/tag/',
    download: 'https://github.com/wlsdks/framo/releases/download/',
  },
] as const
export type Repo = (typeof REPOS)[number]
/**
 * 받을 때 따라가도 되는 곳. 첫 주소는 github.com, 그다음은 GitHub의 릴리스 파일 보관소.
 * 확인용 api.github.com은 받기에 쓰지 않는다(넘겨받을 까닭이 없다)
 */
export const DOWNLOAD_HOSTS = ['github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com'] as const
/** 배포본은 50~100MB다. 이보다 크면 약속과 다른 것으로 보고 받지 않는다 */
export const MAX_ASSET_BYTES = 300 * 1024 * 1024
/** 릴리스 정보(JSON)의 상한. 릴리스 설명이 길어도 몇십 KB다 */
const MAX_JSON_BYTES = 1024 * 1024
const MAX_REDIRECTS = 5
const CHECK_TIMEOUT_MS = 10_000
/** 받는 중에 이만큼 아무것도 오지 않으면 끊는다 */
const IDLE_TIMEOUT_MS = 30_000
/** 받기 전체의 상한. 느린 회사 네트워크에서도 300MB를 받을 만큼 */
const DOWNLOAD_TIMEOUT_MS = 30 * 60_000

const TAG = /^v(\d+)\.(\d+)\.(\d+)$/
const DIGEST = /^sha256:([0-9a-f]{64})$/

/** 이 OS에서 받을 파일 이름. 배포본이 없는 OS(리눅스 등)는 null: 받지 않고 릴리스 페이지만 알린다 */
export function assetName(platform: NodeJS.Platform): string | null {
  if (platform === 'win32') return 'gyeol-windows.zip'
  if (platform === 'darwin') return 'gyeol-mac.zip'
  return null
}

/** 'X.Y.Z'를 견준다. a가 새것이면 양수. 꼴이 틀리면 NaN이라 어느 비교도 참이 아니다(새 버전으로 보지 않는다) */
export function compareVersions(a: string, b: string): number {
  const pa = /^(\d+)\.(\d+)\.(\d+)$/.exec(a)
  const pb = /^(\d+)\.(\d+)\.(\d+)$/.exec(b)
  if (!pa || !pb) return NaN
  for (let i = 1; i <= 3; i++) {
    const d = Number(pa[i]) - Number(pb[i])
    if (d) return Math.sign(d)
  }
  return 0
}

export interface Asset {
  /** 받을 첫 주소. https://github.com/<REPOS의 저장소>/releases/download/<태그>/<이름> 그대로인 것만 */
  url: string
  size: number
  sha256: string
}

export interface Release {
  version: string
  page: string
  /** 이 OS에서 받을 파일. 없거나 지문이 없으면 null (받지 않는다) */
  asset: Asset | null
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * GitHub의 답에서 쓰는 것만 골라 확인한다. 하나라도 약속과 다르면 null.
 * 주소는 받은 것을 그대로 믿지 않고, 태그로 만든 주소와 글자 하나까지 같은지 본다(다른 저장소, 다른 곳으로 가지 않게).
 * repo는 이 답을 받은 저장소다. 페이지와 받을 주소도 그 저장소 것이어야 한다
 */
export function parseRelease(v: unknown, platform: NodeJS.Platform, repo: Repo = REPOS[0]): Release | null {
  if (!isObj(v)) return null
  const tag = v.tag_name
  if (typeof tag !== 'string') return null
  const m = TAG.exec(tag)
  if (!m) return null
  if (v.draft === true || v.prerelease === true) return null
  const version = `${Number(m[1])}.${Number(m[2])}.${Number(m[3])}`
  const page = repo.page + tag
  if (v.html_url !== page) return null

  const name = assetName(platform)
  let asset: Asset | null = null
  if (name && Array.isArray(v.assets)) {
    const a = v.assets.find((x) => isObj(x) && x.name === name)
    if (isObj(a)) {
      const url = `${repo.download}${tag}/${name}`
      const digest = typeof a.digest === 'string' ? DIGEST.exec(a.digest) : null
      const size = a.size
      if (a.browser_download_url === url && digest && typeof size === 'number' && Number.isInteger(size) && size > 0 && size <= MAX_ASSET_BYTES) {
        asset = { url, size, sha256: digest[1] }
      }
    }
  }
  return { version, page, asset }
}

/**
 * 받을 때 이 주소로 가도 되는지. https, 정해 둔 곳, 기본 포트, 사용자 정보 없음.
 * 첫 주소는 REPOS 가운데 한 저장소의 릴리스 파일 경로여야 한다(../ 같은 것은 URL이 먼저 풀어서 이 앞부분이 남지 않는다)
 */
export function allowedHop(url: URL, first: boolean): boolean {
  if (url.protocol !== 'https:' || url.port !== '' || url.username !== '' || url.password !== '') return false
  if (!(DOWNLOAD_HOSTS as readonly string[]).includes(url.hostname)) return false
  if (first) return url.hostname === 'github.com' && REPOS.some((r) => url.pathname.startsWith(`/${r.name}/releases/download/`))
  return true
}

/** 바깥 연결 하나의 답. 시험에서는 이것을 흉내 내서 네트워크에 닿지 않는다 */
export interface Hop {
  status: number
  location?: string
  body: AsyncIterable<Buffer>
  /** 다 읽지 않고 그만둘 때 */
  close(): void
}

/** GET 하나. 넘겨주기(redirect)는 따라가지 않는다. 부르는 쪽이 한 단계씩 확인하며 따라간다 */
export type Getter = (url: URL, headers: Record<string, string>, idleMs: number) => Promise<Hop>

/** 실제로 쓰는 GET. 연결을 다시 쓰지 않는다(agent: false). 쿠키를 갖고 있지 않으니 보낼 것도 없다 */
export const nodeGet: Getter = (url, headers, idleMs) =>
  new Promise((resolve, reject) => {
    const req = httpsGet(url, { headers, agent: false, timeout: idleMs }, (res) => {
      // 읽는 중에 끊기면 그만두게: 이 시간 동안 아무것도 오지 않으면 끊는다
      res.setTimeout(idleMs, () => res.destroy(new Error('idle')))
      resolve({
        status: res.statusCode ?? 0,
        location: typeof res.headers.location === 'string' ? res.headers.location : undefined,
        body: res,
        close: () => res.destroy(),
      })
    })
    req.on('timeout', () => req.destroy(new Error('timeout')))
    req.on('error', reject)
  })

async function readLimited(body: AsyncIterable<Buffer>, max: number): Promise<Buffer | null> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const c of body) {
    size += c.length
    if (size > max) return null
    chunks.push(c)
  }
  return Buffer.concat(chunks)
}

export interface UpdaterOptions {
  /** 이 앱의 버전 (User-Agent에 넣는다) */
  version: string
  platform?: NodeJS.Platform
  get?: Getter
}

export function createUpdater({ version, platform = process.platform, get = nodeGet }: UpdaterOptions) {
  const userAgent = `Framo/${version}`

  /** 마지막 릴리스. 닿지 못했거나 답이 약속과 다르면 null (까닭은 나누지 않는다) */
  async function latest(): Promise<Release | null> {
    let hop = null as Hop | null
    const work = (async () => {
      for (const repo of REPOS) {
        try {
          hop = await get(new URL(repo.latest), { Accept: 'application/vnd.github+json', 'User-Agent': userAgent }, CHECK_TIMEOUT_MS)
        } catch {
          continue
        }
        // 넘겨주기는 따라가지 않는다. 200이 아니면(없는 저장소, 이름을 바꿔 넘겨주는 예전 이름) 다음 이름에 묻는다
        if (hop.status !== 200) {
          hop.close()
          continue
        }
        // 200을 받은 뒤 답이 이상하면 다른 이름에 더 묻지 않는다
        const body = await readLimited(hop.body, MAX_JSON_BYTES)
        if (!body) return hop.close(), null
        return parseRelease(JSON.parse(body.toString('utf8')), platform, repo)
      }
      return null
    })().catch(() => null)
    // 조금씩 오래 흘려보내는 답도 끊는다(머리글을 받은 뒤의 시간까지 센다)
    let t: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<null>((resolve) => {
      t = setTimeout(() => (hop?.close(), resolve(null)), CHECK_TIMEOUT_MS)
    })
    try {
      return await Promise.race([work, timeout])
    } finally {
      clearTimeout(t)
    }
  }

  /**
   * 받아서 file에 둔다. 임시 이름으로 받고, 크기와 SHA-256이 맞을 때만 제 이름으로 바꾼다.
   * file은 부르는 쪽이 정한 고정 경로다. 네트워크에서 온 이름은 경로에 쓰지 않는다.
   */
  async function download(asset: Asset, file: string, onProgress: (received: number) => void): Promise<'ok' | DownloadError> {
    const part = `${file}.part`
    const deadline = Date.now() + DOWNLOAD_TIMEOUT_MS
    let url = new URL(asset.url)
    if (!allowedHop(url, true)) return 'verify'
    let hop: Hop | null = null
    try {
      for (let i = 0; ; i++) {
        hop = await get(url, { Accept: 'application/octet-stream', 'User-Agent': userAgent }, IDLE_TIMEOUT_MS)
        if ([301, 302, 303, 307, 308].includes(hop.status)) {
          hop.close()
          if (i >= MAX_REDIRECTS || !hop.location) return 'network'
          const next = new URL(hop.location, url)
          // 정해 둔 곳 밖으로 넘기면 따라가지 않는다
          if (!allowedHop(next, false)) return 'verify'
          url = next
          continue
        }
        if (hop.status !== 200) return hop.close(), 'network'
        break
      }
    } catch {
      return 'network'
    }

    try {
      mkdirSync(dirname(file), { recursive: true })
    } catch {
      hop.close()
      return 'write'
    }
    const hash = createHash('sha256')
    const out = createWriteStream(part)
    let received = 0
    let result: 'ok' | DownloadError = 'ok'
    // 쓰다 실패하면(디스크가 찼거나 막혔으면) 기록해 두고 읽기를 멈춘다
    out.on('error', () => {
      result = 'write'
      hop?.close()
    })
    try {
      for await (const c of hop.body) {
        received += c.length
        // 알려 준 크기보다 많이 오면 바로 끊는다(상한도 그 크기다)
        if (received > asset.size || Date.now() > deadline) {
          result = 'verify'
          hop.close()
          break
        }
        hash.update(c)
        // 쓰기가 밀리면 비워질 때까지(또는 오류로 닫힐 때까지) 기다린다. 남은 쪽 귀는 떼어 조각마다 쌓이지 않게
        if (!out.write(c)) {
          await new Promise<void>((r) => {
            const done = () => (out.off('drain', done), out.off('close', done), r())
            out.on('drain', done).on('close', done)
          })
        }
        if (result !== 'ok') break
        onProgress(received)
      }
    } catch {
      if (result === 'ok') result = 'network'
    }
    // 파일을 다 닫은 뒤에 지우거나 이름을 바꾼다(윈도우는 열린 파일을 지우지 못한다)
    await new Promise<void>((r) => {
      if (out.closed) return r()
      out.once('close', () => r())
      out.end()
    })
    if (result === 'ok' && (received !== asset.size || hash.digest('hex') !== asset.sha256)) result = 'verify'
    if (result !== 'ok') {
      rmSync(part, { force: true })
      return result
    }
    try {
      renameSync(part, file)
    } catch {
      rmSync(part, { force: true })
      return 'write'
    }
    return 'ok'
  }

  return { latest, download }
}

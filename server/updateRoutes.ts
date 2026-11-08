// 로컬 서버의 '새 버전' 창구: /__html-maker/update/
//
//   GET  status     지금 아는 것 (확인 결과, 받는 중인지)
//   POST check      확인한다. 24시간 안에 확인했으면 그 결과를 그대로 쓴다
//   POST check/now  '다시 확인': 바로 확인한다
//   POST download   이 OS의 배포본을 받는다. 지문을 맞춘 뒤 폴더를 연다
//   POST reveal     받은 파일이 있는 폴더를 다시 연다
//
// 바깥 연결은 update.ts가 한다. 이 파일은 상태를 들고 정해진 말로만 답한다.
// AI 창구처럼 앱만 붙이는 머리글과 같은 Origin을 확인한다. 다른 웹사이트가 받기를 시키지 못하게.

import { spawn } from 'node:child_process'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { join } from 'node:path'
import { UPDATE_PREFIX, type DownloadState, type UpdateCheck, type UpdateStatus } from '../src/update/protocol'
import { fromApp } from './guard'
import { assetName, compareVersions, createUpdater, type Getter, type Release } from './update'

/** 앱 폴더 안에 받은 파일을 두는 폴더. 쓰는 사람이 보는 이름이라 한국어다 */
export const UPDATE_DIR_NAME = '새 버전'
const DAY_MS = 24 * 60 * 60 * 1000

export interface UpdateSetup {
  /** 이 앱의 버전 (package.json) */
  version: string
  /** 받은 파일을 둘 폴더. null이면 받지 않는다(개발 서버: 저장소 안에 내려받지 않게) */
  downloadDir: string | null
  platform?: NodeJS.Platform
  /** 시험에서 네트워크 대신 쓴다 */
  get?: Getter
  /** 받은 파일을 탐색기, Finder에서 보여 준다. 시험에서 바꾼다 */
  reveal?: (file: string) => void
  now?: () => number
}

/** 파일을 고른 채로 폴더를 연다. 경로는 앱 폴더로 만든 고정 경로다(네트워크에서 온 글자는 들어가지 않는다) */
function revealFile(file: string) {
  if (process.env.GYEOL_NO_OPEN) return
  const [cmd, args, verbatim] =
    process.platform === 'win32'
      ? // explorer는 /select,"경로"를 한 덩어리로 받아야 빈칸이 있는 경로를 고른다. 윈도우 경로에는 "가 들어갈 수 없다
        (['explorer.exe', [`/select,"${file}"`], true] as const)
      : process.platform === 'darwin'
        ? (['open', ['-R', file], false] as const)
        : (['xdg-open', [join(file, '..')], false] as const)
  try {
    const child = spawn(cmd, [...args], { stdio: 'ignore', detached: true, windowsHide: true, windowsVerbatimArguments: verbatim })
    child.on('error', () => {})
    child.unref()
  } catch {
    // 열지 못해도 받은 파일은 그대로 있다
  }
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(body))
}

export function createUpdateHandler(setup: UpdateSetup) {
  const platform = setup.platform ?? process.platform
  const now = setup.now ?? Date.now
  const reveal = setup.reveal ?? revealFile
  const updater = createUpdater({ version: setup.version, platform, get: setup.get })
  const name = assetName(platform)
  const file = setup.downloadDir && name ? join(setup.downloadDir, name) : null

  let check: UpdateCheck = { state: 'unknown' }
  let release: Release | null = null
  let checking: Promise<void> | null = null
  let download: DownloadState = { state: 'idle' }

  function status(): UpdateStatus {
    return { current: setup.version, check, download }
  }

  function run(force: boolean): Promise<void> {
    if (checking) return checking
    // 받는 동안에는 묻지 않는다. 더 새 버전을 알게 되면 알림은 그 버전인데 받은 파일은 앞 버전이 된다(이름이 같다)
    if (download.state === 'downloading') return Promise.resolve()
    // 실패도 한 번 확인한 것으로 센다. 막힌 회사 네트워크에서 홈을 열 때마다 두드리지 않게
    if (!force && 'checkedAt' in check && now() - check.checkedAt < DAY_MS) return Promise.resolve()
    const before = check
    check = { state: 'checking' }
    checking = updater
      .latest()
      .then((r) => {
        // 묻는 사이에 받기를 시작했으면 이 답은 쓰지 않는다. 위와 같은 까닭
        if (download.state === 'downloading') return void (check = before)
        const checkedAt = now()
        if (!r) {
          // 이미 새 버전을 알고 있었으면 그대로 둔다. 잠깐 끊긴 것으로 알림이 사라지지 않게
          check = before.state === 'available' ? before : { state: 'failed', checkedAt }
          return
        }
        if (!(compareVersions(r.version, setup.version) > 0)) {
          release = null
          check = { state: 'latest', checkedAt }
          return
        }
        // 받은 뒤에 더 새 버전이 나왔으면 받기를 처음부터
        if (release?.version !== r.version) download = { state: 'idle' }
        release = r
        check = { state: 'available', checkedAt, version: r.version, page: r.page, download: !!(r.asset && file) }
      })
      .finally(() => (checking = null))
    return checking
  }

  function startDownload(res: ServerResponse) {
    const asset = release?.asset
    if (!asset || !file) return json(res, 409, { error: 'unavailable' })
    if (download.state === 'downloading') return json(res, 202, status())
    const target = file
    download = { state: 'downloading', received: 0, total: asset.size }
    updater
      .download(asset, target, (received) => {
        download = { state: 'downloading', received, total: asset.size }
      })
      .then(
        (r) => {
          if (r !== 'ok') return void (download = { state: 'failed', reason: r })
          download = { state: 'done' }
          reveal(target)
        },
        () => (download = { state: 'failed', reason: 'network' }),
      )
    json(res, 202, status())
  }

  return async function handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    if (!url.pathname.startsWith(UPDATE_PREFIX)) return false
    try {
      if (!fromApp(req)) return json(res, 403, { error: 'forbidden' }), true
      const path = url.pathname.slice(UPDATE_PREFIX.length)
      const route = `${req.method ?? 'GET'} ${path}`
      if (route === 'GET status') json(res, 200, status())
      else if (route === 'POST check') await run(false).then(() => json(res, 200, status()))
      else if (route === 'POST check/now') await run(true).then(() => json(res, 200, status()))
      else if (route === 'POST download') startDownload(res)
      else if (route === 'POST reveal') {
        if (download.state === 'done' && file) reveal(file)
        json(res, download.state === 'done' ? 200 : 404, status())
      } else json(res, 404, { error: 'not_found' })
    } catch {
      if (!res.headersSent) json(res, 500, { error: 'failed' })
      else res.destroy()
    }
    return true
  }
}

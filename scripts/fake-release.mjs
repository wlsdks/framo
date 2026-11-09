// 시험에서만: 로컬 서버가 GitHub에 묻고 받는 것(server/update.ts의 https.get)을 이 PC의 zip 하나로 흉내 낸다.
// 배포본에 들어가지 않고(scripts/는 묶지 않는다), 서버 코드에는 시험용 주소나 스위치가 없다. node의 --import로만 끼운다:
//
//   NODE_OPTIONS=--import=<이 파일의 file: 주소> FRAMO_FAKE_RELEASE=<새 버전 zip> FRAMO_FAKE_VERSION=<X.Y.Z>
//   FRAMO_FAKE_SIGN_KEY=<시험용 비밀 키 PEM> node dist-node/launch.mjs
//
// 답하는 것: 마지막 릴리스(그 버전, 이 OS의 zip 하나, 크기와 SHA-256 지문) → 받기 주소는 파일 보관소로 넘기고(302) → zip을 조금씩 흘린다.
// 시험용 키를 주면 지문 목록(SHA256SUMS.txt)과 그 서명(.sig)도 같은 릴리스 경로에서 내준다. 앱은 그 키를 믿게 고친 시험용 사본이어야 한다.
// 그 밖의 주소는 연결이 끊긴 것처럼 실패한다. 진짜 네트워크에는 닿지 않는다.

import { createHash, createPrivateKey, sign } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { createReadStream, readFileSync, statSync } from 'node:fs'
import https from 'node:https'
import { syncBuiltinESMExports } from 'node:module'
import { Readable, Transform } from 'node:stream'

const zip = process.env.FRAMO_FAKE_RELEASE
const version = process.env.FRAMO_FAKE_VERSION
/** 초당 흘릴 바이트. 받는 중 화면을 볼 수 있게 늦춘다 */
const rate = Number(process.env.FRAMO_FAKE_RATE) || 8 * 1024 * 1024

if (zip && version) {
  const name = process.platform === 'win32' ? 'gyeol-windows.zip' : 'gyeol-mac.zip'
  const tag = `v${version}`
  const size = statSync(zip).size
  const sha = createHash('sha256').update(readFileSync(zip)).digest('hex')
  const download = `https://github.com/wlsdks/gyeol/releases/download/${tag}/${name}`
  const storage = `https://release-assets.githubusercontent.com/fake/${name}`
  const release = {
    tag_name: tag,
    html_url: `https://github.com/wlsdks/gyeol/releases/tag/${tag}`,
    draft: false,
    prerelease: false,
    assets: [{ name, size, digest: `sha256:${sha}`, browser_download_url: download }],
  }
  /** 같은 릴리스 경로의 작은 파일(지문 목록, 서명): 받기 주소 → 파일 보관소 */
  const small = new Map()
  const keyFile = process.env.FRAMO_FAKE_SIGN_KEY
  if (keyFile) {
    const sums = Buffer.from(`${sha}  ${name}\n`)
    const sig = Buffer.from(`${sign(null, sums, createPrivateKey(readFileSync(keyFile, 'utf8'))).toString('base64')}\n`)
    for (const [file, body] of [['SHA256SUMS.txt', sums], ['SHA256SUMS.txt.sig', sig]]) {
      const url = `https://github.com/wlsdks/gyeol/releases/download/${tag}/${file}`
      release.assets.push({ name: String(file), size: body.length, digest: '', browser_download_url: url })
      small.set(url, { status: 302, location: `https://release-assets.githubusercontent.com/fake/${file}`, body: Readable.from([]) })
      small.set(`https://release-assets.githubusercontent.com/fake/${file}`, { status: 200, body })
    }
  }

  /** 초당 rate 바이트로 늦춘다 */
  const throttle = () => {
    let sent = 0
    const start = Date.now()
    return new Transform({
      transform(chunk, _enc, cb) {
        sent += chunk.length
        const wait = (sent / rate) * 1000 - (Date.now() - start)
        setTimeout(() => cb(null, chunk), Math.max(0, wait))
      },
    })
  }

  const answer = (/** @type {string} */ url) => {
    if (url === 'https://api.github.com/repos/wlsdks/gyeol/releases/latest') return { status: 200, body: Readable.from([Buffer.from(JSON.stringify(release))]) }
    if (url === download) return { status: 302, location: storage, body: Readable.from([]) }
    if (url === storage) return { status: 200, body: createReadStream(zip).pipe(throttle()) }
    const s = small.get(url)
    if (s) return { ...s, body: Buffer.isBuffer(s.body) ? Readable.from([s.body]) : s.body }
    return null
  }

  // https.get의 꼴(ClientRequest, IncomingMessage) 가운데 update.ts가 쓰는 것만 흉내 낸다
  /** @type {any} */ (https).get = (/** @type {URL} */ url, /** @type {unknown} */ _opts, /** @type {(res: any) => void} */ cb) => {
    const req = Object.assign(new EventEmitter(), { destroy() {} })
    setImmediate(() => {
      const a = answer(String(url))
      if (!a) return req.emit('error', new Error('offline'))
      const res = /** @type {any} */ (a.body)
      res.statusCode = a.status
      res.headers = a.location ? { location: a.location } : {}
      res.setTimeout = () => res
      cb(res)
    })
    return req
  }
  syncBuiltinESMExports()
  process.stderr.write(`[가짜 릴리스] ${tag} ${name} ${size}바이트\n`)
}

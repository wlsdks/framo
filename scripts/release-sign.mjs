// 릴리스가 끝난 뒤 이 PC에서 서명한다. 비밀 키는 이 PC에만 있어 GitHub Actions(release.yml)는 서명하지 못한다.
//
//   npm run release-sign -- vX.Y.Z [--key <비밀 키>] [--repo wlsdks/framo] [--replace]
//
// 1. gh로 그 릴리스의 SHA256SUMS.txt를 받고, 릴리스의 zip 둘(gyeol-windows.zip, gyeol-mac.zip)의 GitHub 지문과 목록이 같은지 본다.
//    목록이 zip과 다르면(누가 바꿨으면) 서명하지 않는다.
// 2. 비밀 키의 공개 키가 앱(server/releaseKey.ts의 RELEASE_KEYS)에 든 키인지 본다. 앱이 모르는 키로 서명하면 아무도 자동으로 풀지 못한다.
// 3. Ed25519로 서명해 SHA256SUMS.txt.sig(base64 한 줄)를 만들고, 공개 키로 다시 확인한 뒤 gh로 그 릴리스에 올린다.
//    이미 서명이 올라가 있으면 --replace일 때만 바꾼다.

import { execFileSync } from 'node:child_process'
import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto'
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_KEY } from './release-key.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const ZIPS = ['gyeol-windows.zip', 'gyeol-mac.zip']

/**
 * 앱이 믿는 공개 키들(server/releaseKey.ts의 글에서 읽는다)
 * @param {string} source
 */
export function keysInApp(source) {
  const list = /RELEASE_KEYS[^=]*=\s*\[([^\]]*)\]/.exec(source)?.[1] ?? ''
  return [...list.matchAll(/'([A-Za-z0-9+/]{43}=)'/g)].map((m) => m[1])
}

/**
 * 지문 목록이 릴리스의 zip 둘과 정확히 같은지. 다르면 까닭, 같으면 null
 * @param {string} sums SHA256SUMS.txt
 * @param {{ name: string, digest?: string }[]} assets gh release view --json assets
 */
export function sumsMismatch(sums, assets) {
  const lines = sums.split(/\r?\n/).filter(Boolean)
  const listed = new Map(lines.map((l) => /^([0-9a-f]{64}) [ *](\S+)$/.exec(l)).filter((m) => m !== null).map((m) => [m[2], m[1]]))
  if (listed.size !== lines.length || listed.size !== ZIPS.length) return '지문 목록의 꼴이 달라요(zip 둘의 줄만 있어야 해요)'
  for (const zip of ZIPS) {
    const asset = assets.find((a) => a.name === zip)
    if (!asset) return `릴리스에 ${zip}이 없어요`
    if (asset.digest !== `sha256:${listed.get(zip)}`) return `${zip}의 지문이 목록과 달라요`
  }
  return null
}

/**
 * 서명(base64 한 줄)을 만들고 공개 키(32바이트 base64)와 함께 돌려준다
 * @param {string} privatePem
 * @param {Buffer} sums
 */
export function signSums(privatePem, sums) {
  const key = createPrivateKey(privatePem)
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('Ed25519 비밀 키가 아니에요')
  const pub = createPublicKey(key)
  const sig = sign(null, sums, key)
  if (!verify(null, sums, pub, sig)) throw new Error('만든 서명이 맞지 않아요')
  return { sig: `${sig.toString('base64')}\n`, publicKey: Buffer.from(/** @type {string} */ (pub.export({ format: 'jwk' }).x), 'base64url').toString('base64') }
}

function isMain() {
  try {
    return !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}

if (isMain()) {
  const args = process.argv.slice(2)
  const option = (/** @type {string} */ name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined)
  const tag = args.find((a) => /^v\d+\.\d+\.\d+$/.test(a))
  const keyFile = option('--key') ?? DEFAULT_KEY
  const repo = option('--repo')
  const fail = (/** @type {string} */ m) => (console.error(m), process.exit(1))
  if (!tag) fail('서명할 릴리스의 태그(vX.Y.Z)를 적어 주세요.')
  const gh = (/** @type {string[]} */ a) => execFileSync('gh', [...a, ...(repo ? ['--repo', repo] : [])], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] })
  const work = mkdtempSync(join(tmpdir(), 'framo-sign-'))
  try {
    const view = JSON.parse(gh(['release', 'view', /** @type {string} */ (tag), '--json', 'assets']))
    const names = view.assets.map((/** @type {{ name: string }} */ a) => a.name)
    if (names.includes('SHA256SUMS.txt.sig') && !args.includes('--replace')) fail('이미 서명이 올라가 있어요. 바꾸려면 --replace를 붙여 주세요.')
    gh(['release', 'download', /** @type {string} */ (tag), '--pattern', 'SHA256SUMS.txt', '--dir', work, '--clobber'])
    const sums = readFileSync(join(work, 'SHA256SUMS.txt'))
    const bad = sumsMismatch(sums.toString('utf8'), view.assets)
    if (bad) fail(`서명하지 않았어요: ${bad}`)
    const { sig, publicKey } = signSums(readFileSync(keyFile, 'utf8'), sums)
    if (!keysInApp(readFileSync(join(root, 'server', 'releaseKey.ts'), 'utf8')).includes(publicKey))
      fail(`이 비밀 키의 공개 키(${publicKey})가 server/releaseKey.ts에 없어요. 앱이 모르는 키로 서명하면 아무도 자동으로 풀지 못해요.`)
    writeFileSync(join(work, 'SHA256SUMS.txt.sig'), sig)
    gh(['release', 'upload', /** @type {string} */ (tag), join(work, 'SHA256SUMS.txt.sig'), ...(args.includes('--replace') ? ['--clobber'] : [])])
    console.log(`${tag}에 서명을 올렸어요(SHA256SUMS.txt.sig). 이제 앱이 이 버전을 자동으로 풀 수 있어요.`)
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

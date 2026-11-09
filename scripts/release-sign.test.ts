// 릴리스 서명 스크립트: 키 만들기(덮지 않기, 권한 600), 서명, 앱이 믿는 키 읽기, 지문 목록과 릴리스 zip 맞추기.
// gh로 받고 올리는 부분은 돌리지 않는다. 키는 시험용 임시 폴더에만 만든다.

import { mkdtempSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { signedSums } from '../server/signature'
import { makeKey } from './release-key.mjs'
import { keysInApp, signSums, sumsMismatch } from './release-sign.mjs'

const A = 'a'.repeat(64)
const B = 'b'.repeat(64)
const SUMS = `${A}  gyeol-windows.zip\n${B}  gyeol-mac.zip\n`
const ASSETS = [
  { name: 'gyeol-windows.zip', digest: `sha256:${A}` },
  { name: 'gyeol-mac.zip', digest: `sha256:${B}` },
  { name: 'SHA256SUMS.txt', digest: `sha256:${'c'.repeat(64)}` },
]

describe('릴리스 서명 스크립트', () => {
  it('키는 권한 600으로 만들고, 이미 있으면 덮지 않는다', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'framo-key-')), 'nested', 'key.pem')
    const pub = makeKey(file)
    expect(pub).toMatch(/^[A-Za-z0-9+/]{43}=$/)
    if (process.platform !== 'win32') expect(statSync(file).mode & 0o777).toBe(0o600)
    const before = readFileSync(file, 'utf8')
    expect(() => makeKey(file)).toThrow()
    expect(readFileSync(file, 'utf8')).toBe(before)
  })

  it('만든 서명은 앱의 확인(server/signature.ts)이 그 공개 키로 받아들인다', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'framo-key-')), 'key.pem')
    const pub = makeKey(file)
    const { sig, publicKey } = signSums(readFileSync(file, 'utf8'), Buffer.from(SUMS))
    expect(publicKey).toBe(pub)
    expect(signedSums(Buffer.from(SUMS), Buffer.from(sig), [pub])?.get('gyeol-mac.zip')).toBe(B)
  })

  it('앱이 믿는 키를 releaseKey.ts의 글에서 읽는다', () => {
    const k = 'A'.repeat(43) + '='
    expect(keysInApp(`export const RELEASE_KEYS: readonly string[] = ['${k}', '${k.replace('A', 'B')}']`)).toEqual([k, k.replace('A', 'B')])
    expect(keysInApp('export const RELEASE_KEYS: readonly string[] = []')).toEqual([])
    expect(keysInApp(readFileSync(join(import.meta.dirname, '..', 'server', 'releaseKey.ts'), 'utf8')).length).toBeGreaterThanOrEqual(0)
  })

  it('지문 목록이 릴리스의 zip 둘과 정확히 같을 때만 서명한다', () => {
    expect(sumsMismatch(SUMS, ASSETS)).toBeNull()
    expect(sumsMismatch(SUMS.replace(A, 'd'.repeat(64)), ASSETS)).toMatch(/지문이 목록과 달라요/)
    expect(sumsMismatch(`${SUMS}${'e'.repeat(64)}  evil.zip\n`, ASSETS)).toMatch(/꼴이 달라요/)
    expect(sumsMismatch(SUMS, ASSETS.slice(1))).toMatch(/없어요/)
  })
})

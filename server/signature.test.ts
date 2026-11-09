// 릴리스 서명 확인: 이 PC의 비밀 키로 만든 SHA256SUMS.txt의 서명을 앱에 든 공개 키로만 믿는다.

import { describe, expect, it } from 'vitest'
import { RELEASE_KEYS } from './releaseKey'
import { parseSums, publicKeyOf, signedSums } from './signature'
import { testKey } from './zipFixture'

const A = 'a'.repeat(64)
const B = 'b'.repeat(64)
const SUMS = Buffer.from(`${A}  gyeol-windows.zip\n${B}  gyeol-mac.zip\n`)

describe('릴리스 서명', () => {
  it('앱에 든 키로 서명이 맞으면 지문 목록을 돌려준다', () => {
    const k = testKey()
    const got = signedSums(SUMS, Buffer.from(k.sign(SUMS)), [k.pub])
    expect(got?.get('gyeol-windows.zip')).toBe(A)
    expect(got?.get('gyeol-mac.zip')).toBe(B)
  })

  it('목록을 한 글자라도 바꾸면 맞지 않는다', () => {
    const k = testKey()
    const sig = Buffer.from(k.sign(SUMS))
    const changed = Buffer.from(SUMS.toString().replace('a', 'c'))
    expect(signedSums(changed, sig, [k.pub])).toBeNull()
  })

  it('앱이 모르는 키로 한 서명은 믿지 않는다(릴리스를 올릴 권한이 털려도 앱의 키는 없다)', () => {
    const app = testKey()
    const attacker = testKey()
    expect(signedSums(SUMS, Buffer.from(attacker.sign(SUMS)), [app.pub])).toBeNull()
  })

  it('키를 바꾸는 사이에는 아는 키 가운데 하나로 맞으면 된다', () => {
    const old = testKey()
    const next = testKey()
    expect(signedSums(SUMS, Buffer.from(next.sign(SUMS)), [old.pub, next.pub])).not.toBeNull()
  })

  it('키가 없거나, 서명이나 키의 꼴이 틀리면 믿지 않는다', () => {
    const k = testKey()
    const sig = Buffer.from(k.sign(SUMS))
    expect(signedSums(SUMS, sig, [])).toBeNull()
    expect(signedSums(SUMS, sig, ['짧은 키'])).toBeNull()
    expect(signedSums(SUMS, Buffer.from('서명 아님'), [k.pub])).toBeNull()
    expect(signedSums(SUMS, Buffer.from(sig.toString().trim() + 'AA'), [k.pub])).toBeNull()
    expect(signedSums(SUMS, Buffer.alloc(70 * 1024), [k.pub])).toBeNull()
    expect(publicKeyOf(Buffer.alloc(31).toString('base64'))).toBeNull()
  })

  it('지문 목록: 꼴이 틀린 줄, 같은 이름이 두 번 나오면 읽지 않는다', () => {
    expect(parseSums(`${A}  gyeol-mac.zip\n${B}  gyeol-mac.zip\n`)).toBeNull()
    expect(parseSums(`${A}  ../x.zip\n`)).toBeNull()
    expect(parseSums(`${A.slice(1)}  gyeol-mac.zip\n`)).toBeNull()
    expect(parseSums('')).toBeNull()
    expect(parseSums(`${A} *gyeol-mac.zip\r\n`)?.get('gyeol-mac.zip')).toBe(A)
  })

  it('앱에 든 공개 키는 모두 Ed25519 공개 키 32바이트다', () => {
    for (const k of RELEASE_KEYS) expect([k, publicKeyOf(k) !== null]).toEqual([k, true])
  })
})

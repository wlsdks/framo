// 릴리스 서명 확인. GitHub이 알려 주는 SHA-256은 GitHub에 올라온 파일로 셈한 값이라, 릴리스를 올릴 권한이 털리면 다른 zip도
// 그대로 맞는다. 그래서 자동으로 풀기 전에, 이 PC에만 있는 비밀 키로 만든 SHA256SUMS.txt의 Ed25519 서명을 앱에 든 공개 키로 확인한다.
//
//   SHA256SUMS.txt       릴리스(release.yml)가 올리는 지문 목록. `<sha256 64자>  <파일 이름>` 줄들
//   SHA256SUMS.txt.sig   릴리스 뒤 이 PC에서 scripts/release-sign.mjs가 올리는 서명: 64바이트 Ed25519 서명의 base64 한 줄
//
// 목록에는 버전이 없지만, 푸는 쪽(install.ts)이 zip 안의 맨 위 폴더(gyeol-<버전>)와 package.json의 버전이 릴리스 태그와 같은지
// 보므로, 예전에 서명한 목록과 zip을 새 태그로 다시 올려도 풀리지 않는다.
// Node 내장(node:crypto)만 쓴다.

import { createPublicKey, verify, type KeyObject } from 'node:crypto'

export const SUMS_NAME = 'SHA256SUMS.txt'
export const SIG_NAME = 'SHA256SUMS.txt.sig'
/** 목록과 서명의 상한. 줄 몇 개, 서명은 88자다 */
export const MAX_SIGNED_BYTES = 64 * 1024

const KEY_TEXT = /^[A-Za-z0-9+/]{43}=$/
const SIG_TEXT = /^[A-Za-z0-9+/]{86}==\r?\n?$/
const SUM_LINE = /^([0-9a-f]{64}) [ *]([A-Za-z0-9._-]+)$/

/** base64로 적은 Ed25519 공개 키 32바이트. 꼴이 틀리면 null */
export function publicKeyOf(text: string): KeyObject | null {
  if (!KEY_TEXT.test(text)) return null
  const raw = Buffer.from(text, 'base64')
  if (raw.length !== 32) return null
  try {
    return createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: raw.toString('base64url') }, format: 'jwk' })
  } catch {
    return null
  }
}

/** 지문 목록을 파일 이름 → SHA-256으로. 꼴이 틀린 줄이나 같은 이름이 두 번 나오면 null */
export function parseSums(text: string): Map<string, string> | null {
  const out = new Map<string, string>()
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue
    const m = SUM_LINE.exec(line)
    if (!m || out.has(m[2])) return null
    out.set(m[2], m[1])
  }
  return out.size ? out : null
}

/**
 * 서명이 keys 가운데 하나로 맞으면 그 목록(파일 이름 → SHA-256), 아니면 null.
 * 키가 없거나, 서명이나 목록의 꼴이 틀리거나, 어느 키로도 맞지 않으면 null이다(자동으로 풀지 않는다)
 */
export function signedSums(sums: Buffer, sig: Buffer, keys: readonly string[]): Map<string, string> | null {
  if (sums.length > MAX_SIGNED_BYTES || sig.length > MAX_SIGNED_BYTES) return null
  const sigText = sig.toString('latin1')
  if (!SIG_TEXT.test(sigText)) return null
  const raw = Buffer.from(sigText.trim(), 'base64')
  if (raw.length !== 64) return null
  const ok = keys.some((k) => {
    const key = publicKeyOf(k)
    if (!key) return false
    try {
      return verify(null, sums, key, raw)
    } catch {
      return false
    }
  })
  return ok ? parseSums(sums.toString('utf8')) : null
}

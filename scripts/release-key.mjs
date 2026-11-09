// 릴리스 서명 키 쌍을 이 PC에서 한 번 만든다. 비밀 키는 저장소 밖(~/.config/framo/release-signing-key.pem, 권한 600)에 두고,
// 공개 키는 server/releaseKey.ts의 RELEASE_KEYS에 넣는다. 이미 있으면 덮지 않는다(덮으면 이미 깔린 앱이 새 서명을 믿지 않는다).
//
//   npm run release-key                 만들고 공개 키를 보여 준다
//   npm run release-key -- --out <파일>  다른 곳에(시험용)
//
// 비밀 키는 GitHub Actions에도, 저장소에도, 다른 PC에도 두지 않는다. 잃으면 새 키를 만들어, 새 키를 더한 버전을 옛 키로 서명해
// 내놓아야 한다(옛 키가 없으면 사람이 직접 받아 푸는 수밖에 없다). 그래서 이 파일은 백업해 두되 안전한 곳에만.

import { generateKeyPairSync } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const DEFAULT_KEY = join(homedir(), '.config', 'framo', 'release-signing-key.pem')

/**
 * Ed25519 키 쌍을 만들어 비밀 키를 out에 쓰고(권한 600, 있으면 던진다), 앱에 넣을 공개 키(32바이트 base64)를 돌려준다
 * @param {string} out
 */
export function makeKey(out) {
  if (existsSync(out)) throw new Error('이미 키가 있어요. 덮지 않아요.')
  mkdirSync(dirname(out), { recursive: true, mode: 0o700 })
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  writeFileSync(out, privateKey.export({ type: 'pkcs8', format: 'pem' }), { flag: 'wx', mode: 0o600 })
  chmodSync(out, 0o600)
  return Buffer.from(/** @type {string} */ (publicKey.export({ format: 'jwk' }).x), 'base64url').toString('base64')
}

function isMain() {
  try {
    return !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}

if (isMain()) {
  const at = process.argv.indexOf('--out')
  const out = at > 0 ? process.argv[at + 1] : DEFAULT_KEY
  try {
    const pub = makeKey(out)
    console.log(`비밀 키를 만들었어요: ${out} (권한 600, 저장소 밖)`)
    console.log('server/releaseKey.ts의 RELEASE_KEYS에 이 공개 키를 넣어 주세요:')
    console.log(`  '${pub}'`)
  } catch (e) {
    console.error(`${e instanceof Error ? e.message : e} (${out})`)
    process.exit(1)
  }
}

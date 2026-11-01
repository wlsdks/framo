// 쓰는 패키지가 모두 사내에서 써도 되는 오픈소스 라이선스인지 확인한다. 인터넷 없이 node_modules만 읽는다.
//
//   npm run licenses                         확인만
//   node scripts/licenses.mjs --notices f    나눠 줄 파일에 넣는 패키지의 라이선스 전문을 f에 모은다
//
// 화면이나 서버에 묶여 나가는 패키지(prod)와 만들 때만 쓰는 도구(dev)의 허용 범위가 다르다.
// 허용하지 않는 라이선스가 있으면 1로 끝난다.

import { execSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/** 묶여서 나가는 패키지: 출처 표시만 하면 되는 허용형 라이선스와 글꼴 라이선스 */
const PROD_OK = ['MIT', 'ISC', 'BSD-2-Clause', 'BSD-3-Clause', '0BSD', 'Apache-2.0', 'OFL-1.1', 'Zlib', 'CC0-1.0', 'BlueOak-1.0.0']
/** 만들 때만 쓰는 도구: 고친 파일을 나눠 줄 때만 의무가 생기는 약한 카피레프트(MPL)까지 */
const DEV_OK = [...PROD_OK, 'MPL-2.0', 'CC-BY-4.0', 'Python-2.0', 'Unlicense']

function licenseOf(pkg) {
  let l = pkg.license ?? (Array.isArray(pkg.licenses) ? pkg.licenses.map((x) => x.type ?? x).join(' OR ') : undefined)
  if (l && typeof l === 'object') l = l.type
  return typeof l === 'string' ? l.trim() : 'UNKNOWN'
}

/** SPDX 식: OR는 하나만 허용돼도, AND는 모두 허용돼야 한다 */
function allowed(expr, list) {
  const clean = expr.replace(/[()]/g, ' ').trim()
  return clean.split(/\s+OR\s+/i).some((alt) => alt.split(/\s+AND\s+/i).every((id) => list.includes(id.trim())))
}

function licenseFiles(dir) {
  const found = readdirSync(dir).filter((f) => /^(licen[cs]e|copying|notice|ofl)/i.test(f)).map((f) => join(dir, f))
  // 글꼴 패키지는 dist 안에 둔다
  if (!found.length && existsSync(join(dir, 'dist'))) {
    found.push(...readdirSync(join(dir, 'dist')).filter((f) => /^(licen[cs]e|ofl)/i.test(f)).map((f) => join(dir, 'dist', f)))
  }
  return found
}

/**
 * 묶여 나가는 패키지(이름@버전)를 npm ls의 JSON 나무에서 고른다. 예전에는 --parseable이 알려 준 경로와 맞춰 보았는데,
 * npm은 UUID처럼 생긴 폴더 이름을 ***로 가려서 그런 폴더(임시 폴더 같은)에서는 하나도 고르지 못했다. 그러면 모든 패키지를
 * 만들 때만 쓰는 도구로 보아 더 넓은 허용 목록으로 확인했고, 배포본의 라이선스 전문은 비었다
 * @param {{ dependencies?: Record<string, any> }} tree
 * @returns {Set<string>}
 */
export function prodPackages(tree) {
  const out = new Set()
  /** @param {Record<string, any> | undefined} deps */
  const walk = (deps) => {
    for (const [name, dep] of Object.entries(deps ?? {})) {
      if (typeof dep?.version === 'string') out.add(`${name}@${dep.version}`)
      walk(dep?.dependencies)
    }
  }
  walk(tree.dependencies)
  return out
}

export function scan() {
  const tree = JSON.parse(execSync('npm ls --omit=dev --all --json', { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }))
  const prodIds = prodPackages(tree)
  const out = []
  const walk = (dir) => {
    if (!existsSync(dir)) return
    for (const name of readdirSync(dir)) {
      if (name.startsWith('.')) continue
      const p = join(dir, name)
      if (name.startsWith('@')) {
        walk(p)
        continue
      }
      const file = join(p, 'package.json')
      if (existsSync(file)) {
        const pkg = JSON.parse(readFileSync(file, 'utf8'))
        out.push({ name: pkg.name ?? name, version: pkg.version, license: licenseOf(pkg), path: p, prod: prodIds.has(`${pkg.name ?? name}@${pkg.version}`), files: licenseFiles(p) })
      }
      walk(join(p, 'node_modules'))
    }
  }
  walk(join(root, 'node_modules'))
  return out
}

function main() {
  const packages = scan()
  const bad = packages.filter((p) => !allowed(p.license, p.prod ? PROD_OK : DEV_OK))
  const count = (list) =>
    Object.entries(list.reduce((m, p) => ((m[p.license] = (m[p.license] ?? 0) + 1), m), {}))
      .map(([l, n]) => `${l} ${n}`)
      .join(', ')
  const prod = packages.filter((p) => p.prod)
  // 묶여 나가는 패키지를 하나라도 못 찾으면 멈춘다: 못 찾은 패키지는 더 넓은 목록으로 확인되고, 라이선스 전문에서도 빠진다
  const { dependencies = {} } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const lost = Object.keys(dependencies).filter((name) => !prod.some((p) => p.name === name))
  if (lost.length) {
    console.error(`묶여 나가는 패키지를 찾지 못했어요: ${lost.join(', ')}\nnpm install을 다시 한 뒤 돌려 주세요.`)
    process.exit(1)
  }
  console.log(`묶여 나가는 패키지 ${prod.length}개: ${count(prod)}`)
  console.log(`만들 때만 쓰는 패키지 ${packages.length - prod.length}개: ${count(packages.filter((p) => !p.prod))}`)

  const at = process.argv.indexOf('--notices')
  if (at > 0) {
    const sections = prod
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((p) => {
        const texts = p.files.map((f) => readFileSync(f, 'utf8').trim()).join('\n\n')
        return `${'='.repeat(72)}\n${p.name} ${p.version} (${p.license})\n${'='.repeat(72)}\n\n${texts || `${p.license} 라이선스`}`
      })
    writeFileSync(
      process.argv[at + 1],
      `Framo에 들어 있는 오픈소스\n\n이 프로그램은 아래 오픈소스를 담고 있어요. 각 라이선스 전문을 그대로 옮겨 둡니다.\n\n${sections.join('\n\n\n')}\n`,
    )
  }

  if (bad.length) {
    console.error('\n허용하지 않는 라이선스가 있어요:')
    for (const p of bad) console.error(`  ${p.name}@${p.version}  ${p.license}  (${p.prod ? '묶여 나감' : '만들 때만'})`)
    process.exit(1)
  }
  console.log('모두 허용된 오픈소스 라이선스예요.')
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()

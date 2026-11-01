// 나눠 줄 폴더와 zip을 만든다: 윈도우용(release/gyeol-windows.zip)과 맥용(release/gyeol-mac.zip).
//
// 둘 다 Node.js(공식 배포본)를 같이 넣어서, 받는 사람은 크롬이나 엣지 말고는 아무것도 설치하지 않아도 된다.
// 회사 PC는 프로그램 설치가 막혀 있는 경우가 많다. 맥용에는 애플 실리콘(arm64)과 인텔(x64) 두 가지를 넣고,
// 'Framo 시작.command'가 그 맥에 맞는 쪽을 고른다.
// - 윈도우용: Framo.exe(Node.js 단일 실행 파일, scripts/exe.mjs)로 켠다. 백신이 서명 없는 exe를 막는 PC를 위해
//   'Framo 시작.bat'도 한동안 같이 넣는다. .bat은 CRLF, 안내 .txt는 메모장이 한글을 바로 알아보게 BOM과 CRLF로 쓴다.
// - 맥용: 안내 .txt는 그대로(LF, BOM 없이), 'Framo 시작.command'와 node에는 실행 권한을 남긴다.
// - zip은 한글 파일 이름이 윈도우에서 깨지지 않게 직접 만든다 (scripts/zip.mjs). zip 이름에 버전을 넣지 않는다:
//   홍보 페이지의 내려받기 단추가 늘 같은 주소(releases/latest/download/gyeol-mac.zip)로 최신 판을 받는다.
//   판은 zip 안의 폴더 이름(gyeol-<버전>)과 첫 화면에 보인다.
//
// Node.js는 이 스크립트를 돌리는 개발 PC에서만 nodejs.org에서 받고(체크섬 확인), .cache/에 둔다.
// 받는 사람 PC에서는 어디로도 연결하지 않는다.
//
//   npm run pack                  둘 다
//   npm run pack -- --only mac    맥용만 (--only windows 는 윈도우용만)
//   npm run pack -- --no-node     Node.js 없이 (받는 사람이 Node.js를 설치해야 함. Framo.exe도 만들지 않는다)

import { createHash } from 'node:crypto'
import { execFileSync, execSync } from 'node:child_process'
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { buildExe } from './exe.mjs'
import { externalUrls } from './offline.mjs'
import { zipDir } from './zip.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const name = `gyeol-${version}`
const withNode = !process.argv.includes('--no-node')
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null
if (only && only !== 'mac' && only !== 'windows') {
  console.error('--only 뒤에는 mac이나 windows를 적어 주세요.')
  process.exit(1)
}

/** 배포본에 넣는 Node.js. LTS 중에서 고르고, 바꿀 때는 docs/OPEN-SOURCE.md도 고친다. */
const NODE_VERSION = 'v24.22.2'

// 사내에서 써도 되는 라이선스가 아니면 여기서 멈춘다. 나눠 줄 파일에 넣을 라이선스 전문도 이때 같이 모은다.
// 경로는 셸을 거치지 않고 인자로 넘긴다(빈칸과 한글이 든 경로에서도 그대로 간다)
const work = mkdtempSync(join(tmpdir(), 'gyeol-pack-'))
const notices = join(work, 'notices.txt')
execFileSync(process.execPath, [join(root, 'scripts', 'licenses.mjs'), '--notices', notices], { cwd: root, stdio: 'inherit' })
execSync('npm run build', { cwd: root, stdio: 'inherit' })

// 빌드 결과에 바깥 주소가 섞이면 멈춘다. 허락하는 목록은 검수(CI)와 같이 쓴다(scripts/offline.mjs)
const external = externalUrls(root)
if (external.length) {
  console.error('빌드 결과에 바깥 주소가 있어요. 확인해 주세요:\n' + external.join('\n'))
  process.exit(1)
}

// 빌드한 화면에 서버와 같은 CSP가 들어갔는지. 서버 없이 파일로 열어도 이 PC 밖으로 연결하지 못하게 하는 장치다
const { CSP_META } = await import(pathToFileURL(join(root, 'dist-node', 'serve.mjs')).href)
const cspTag = `<meta http-equiv="Content-Security-Policy" content="${CSP_META}" />`
if (!readFileSync(join(root, 'dist', 'index.html'), 'utf8').includes(cspTag)) {
  console.error('dist/index.html에 CSP가 없거나 서버의 CSP와 달라요. vite.config.ts의 cspMeta를 확인해 주세요.')
  process.exit(1)
}

/**
 * nodejs.org의 공식 배포본 하나(`node-<버전>-<dist>.<ext>`)에서 실행 파일과 LICENSE를 꺼낸다. 받은 파일은 .cache/에 둔다.
 * @param {string} dist win-x64, darwin-arm64, darwin-x64, linux-x64
 */
async function officialNode(dist) {
  const win = dist.startsWith('win')
  const file = `node-${NODE_VERSION}-${dist}.${win ? 'zip' : 'tar.gz'}`
  const top = `node-${NODE_VERSION}-${dist}`
  const cache = join(root, '.cache', 'node')
  const archive = join(cache, file)
  mkdirSync(cache, { recursive: true })
  const base = `https://nodejs.org/dist/${NODE_VERSION}/`
  const sums = join(cache, `SHASUMS256-${NODE_VERSION}.txt`)
  if (!existsSync(sums)) writeFileSync(sums, await (await fetch(base + 'SHASUMS256.txt')).text())
  const expected = readFileSync(sums, 'utf8')
    .split('\n')
    .find((line) => line.endsWith(`  ${file}`))
    ?.split(' ')[0]
  if (!expected) throw new Error(`SHASUMS256.txt에 ${file}이 없어요`)
  if (!existsSync(archive)) {
    console.log(`Node.js를 받는 중: ${base}${file}`)
    const res = await fetch(base + file)
    if (!res.ok) throw new Error(`받지 못했어요 (${res.status})`)
    writeFileSync(archive, Buffer.from(await res.arrayBuffer()))
  }
  const actual = createHash('sha256').update(readFileSync(archive)).digest('hex')
  if (actual !== expected) {
    rmSync(archive, { force: true })
    throw new Error('받은 Node.js의 체크섬이 맞지 않아요. 다시 실행해 주세요.')
  }
  const tmp = mkdtempSync(join(tmpdir(), 'gyeol-node-'))
  const bin = win ? `${top}/node.exe` : `${top}/bin/node`
  // 맥과 윈도우 10 이상의 tar(bsdtar)는 zip도 푼다
  execFileSync('tar', ['-xf', archive, '-C', tmp, bin, `${top}/LICENSE`])
  return { bin: join(tmp, bin), license: join(tmp, top, 'LICENSE'), cleanup: () => rmSync(tmp, { recursive: true, force: true }) }
}

/** 윈도우 메모장과 명령 프롬프트가 바로 읽는 줄바꿈과 인코딩 */
function windowsText(file, { bom }) {
  const text = readFileSync(file, 'utf8').replace(/^﻿/, '').replace(/\r?\n/g, '\r\n')
  writeFileSync(file, (bom ? '﻿' : '') + text)
}

/** 화면, 서버, 라이선스 전문처럼 두 배포본이 같이 쓰는 것을 out에 */
function common(out) {
  rmSync(out, { recursive: true, force: true })
  mkdirSync(out, { recursive: true })
  cpSync(join(root, 'dist'), join(out, 'dist'), { recursive: true })
  cpSync(join(root, 'dist-node'), join(out, 'dist-node'), { recursive: true })
  cpSync(notices, join(out, '오픈소스 라이선스.txt'))
  // dist-node의 .mjs는 그 자체로 ES 모듈이지만, 폴더를 알아보기 쉽게 이름과 버전을 남긴다
  writeFileSync(join(out, 'package.json'), JSON.stringify({ name: 'gyeol', version, private: true, type: 'module' }, null, 2) + '\n')
}

/** Node.js를 넣지 못하면 멈춘다 (넣지 않은 판을 모르고 나눠 주지 않게) */
async function putNode(dist, binTo, licenseTo) {
  try {
    const node = await officialNode(dist)
    mkdirSync(dirname(binTo), { recursive: true })
    cpSync(node.bin, binTo)
    chmodSync(binTo, 0o755)
    if (licenseTo) cpSync(node.license, licenseTo)
    node.cleanup()
  } catch (err) {
    console.error(`Node.js(${dist})를 넣지 못했어요: ${err.message}`)
    console.error('받는 사람이 Node.js를 직접 설치해야 해요. Node.js 없이 묶으려면 --no-node를 붙이세요.')
    process.exit(1)
  }
}

/**
 * Framo.exe (scripts/exe.mjs). SEA 덩어리는 넣을 node.exe와 같은 판의 node로 만들어야 해서,
 * 이 스크립트를 돌리는 node가 다른 판이면 이 PC에 맞는 공식 node를 같이 받아 쓴다.
 */
async function putExe(nodeExe, out) {
  const host = process.platform === 'win32' ? 'win-x64' : `${process.platform}-${process.arch}`
  const blobNode = process.version === NODE_VERSION ? null : await officialNode(host)
  const work = mkdtempSync(join(tmpdir(), 'gyeol-exe-'))
  try {
    await buildExe({ nodeExe, blobNode: blobNode?.bin ?? process.execPath, out, work, version })
  } catch (err) {
    console.error(`Framo.exe를 만들지 못했어요: ${err.message}`)
    process.exit(1)
  } finally {
    blobNode?.cleanup()
    rmSync(work, { recursive: true, force: true })
  }
}

async function windows() {
  const out = join(root, 'release', 'windows', name)
  common(out)
  cpSync(join(root, 'launch', 'Framo 시작.bat'), join(out, 'Framo 시작.bat'))
  cpSync(join(root, 'launch', '사용법.txt'), join(out, '사용법.txt'))
  if (withNode) {
    // node.exe는 Framo.exe를 못 쓰는 PC를 위한 'Framo 시작.bat'과, 권한 모델 안에서 도는 AI(MCP) 서버가 쓴다
    await putNode('win-x64', join(out, 'node', 'node.exe'), join(out, 'node', 'LICENSE.txt'))
    windowsText(join(out, 'node', 'LICENSE.txt'), { bom: true })
    await putExe(join(out, 'node', 'node.exe'), join(out, 'Framo.exe'))
  }
  windowsText(join(out, 'Framo 시작.bat'), { bom: false })
  for (const file of ['사용법.txt', '오픈소스 라이선스.txt']) windowsText(join(out, file), { bom: true })
  const zipFile = join(root, 'release', 'gyeol-windows.zip')
  zipDir(out, zipFile)
  console.log(`윈도우용: ${zipFile}`)
}

async function mac() {
  const out = join(root, 'release', 'mac', name)
  common(out)
  cpSync(join(root, 'launch', 'Framo 시작.command'), join(out, 'Framo 시작.command'))
  chmodSync(join(out, 'Framo 시작.command'), 0o755)
  cpSync(join(root, 'launch', '사용법-맥.txt'), join(out, '사용법.txt'))
  if (withNode) {
    // 두 실행 파일의 LICENSE는 같은 판이라 같다
    await putNode('darwin-arm64', join(out, 'node', 'arm64', 'node'), join(out, 'node', 'LICENSE.txt'))
    await putNode('darwin-x64', join(out, 'node', 'x64', 'node'))
  }
  const zipFile = join(root, 'release', 'gyeol-mac.zip')
  zipDir(out, zipFile, { executable: (file) => file.endsWith('.command') || /\/node\/(arm64|x64)\/node$/.test(file) })
  console.log(`맥용: ${zipFile}`)
}

if (only !== 'mac') await windows()
if (only !== 'windows') await mac()
rmSync(work, { recursive: true, force: true })
console.log(`\n${name}을 묶었어요. 받는 사람은 zip을 풀고 윈도우는 'Framo.exe', 맥은 'Framo 시작'을 더블클릭하면 돼요.`)

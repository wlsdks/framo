// 검수(CI)와 손으로: 나눠 줄 배포본에서 '이전 버전 → 새 버전' 자동 업데이트를 끝까지 돌려 본다. GitHub에는 가지 않는다.
//
//   node scripts/ci-update.mjs <푼 배포본 폴더> [--exe] [--port 41590] [--keep]
//
// 1. 푼 배포본을 새 폴더(이전 버전 앱)로 복사하고, 같은 배포본의 버전 표시만 바꾼 '새 버전' zip을 만든다(scripts/zip.mjs).
// 2. 이전 버전을 시작 프로그램(node dist-node/launch.mjs)으로 켠다. GitHub 대신 scripts/fake-release.mjs가 새 버전 zip과, 시험용 키로
//    서명한 지문 목록을 내준다. 이전 버전 앱(사본)의 공개 키 자리(RELEASE_KEYS)만 그 시험용 키로 바꾼다: 진짜 비밀 키는 쓰지 않는다.
// 3. 확인 → 업데이트(받기, 지문 확인, 풀기) → versions/<새 버전>이 준비됨 → '지금 다시 시작' → 같은 주소에 새 버전이 뜬다.
//    AI(MCP) 연결 경로는 앱 폴더의 것 그대로인지 본다. 시작 프로그램을 끄면 서버도 꺼지는지 본다.
// 4. 다시 처음부터 켠다(--exe면 Framo.exe로, 가짜 릴리스 없이): 받아 둔 새 버전이 켜진다.
// 브라우저는 열지 않는다(GYEOL_NO_OPEN). 실패하면 1로 끝난다.
// 새 버전 zip은 서버 쪽 흐름을 보려고 버전 표시만 바꾼 것이다. 화면 파일 이름(해시)은 그대로라 브라우저로 보면 캐시한 예전 화면이
// 뜬다(진짜 새 버전은 이름이 바뀐다). 화면까지 볼 때는 package.json의 버전을 올려 npm run pack으로 만든 zip을 쓴다.

import { spawn } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { request } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { makeKey } from './release-key.mjs'
import { zipDir } from './zip.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const source = /** @type {string} */ (args.find((a) => !a.startsWith('--') && !/^\d+$/.test(a)) ?? '')
const useExe = args.includes('--exe')
const keep = args.includes('--keep')
const port = Number(args[args.indexOf('--port') + 1]) || 41590
if (!source || !existsSync(join(source, 'dist-node', 'launch.mjs'))) {
  console.error('푼 배포본 폴더(dist-node/launch.mjs가 든)를 적어 주세요.')
  process.exit(1)
}

const win = process.platform === 'win32'
const ORIGIN = `http://127.0.0.1:${port}`
const oldVersion = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8')).version
const [a, b, c] = oldVersion.split('.').map(Number)
const newVersion = `${a}.${b}.${c + 1}`
// 서버가 알려 주는 경로는 실제 경로다(맥의 /var는 /private/var)
const work = realpathSync(mkdtempSync(join(tmpdir(), 'framo-update-')))
const app = join(work, '이전 버전 앱')
const node = win ? join(app, 'node', 'node.exe') : join(app, 'node', process.arch === 'arm64' ? 'arm64' : 'x64', 'node')

function fail(message) {
  console.error(`\n실패: ${message}`)
  process.exitCode = 1
  throw new Error(message)
}

/** 같은 배포본에서 버전 표시만 바꾼 새 버전 zip. 배포본 맨 위의 이름(PACKAGE_TOP)만 담는다(켜 본 폴더에 생긴 것은 빼고) */
async function makeNewZip() {
  const { PACKAGE_TOP } = await import(pathToFileURL(join(source, 'dist-node', 'serve.mjs')).href)
  const dir = join(work, 'new', `gyeol-${newVersion}`)
  for (const name of readdirSync(source)) if (PACKAGE_TOP.includes(name)) cpSync(join(source, name), join(dir, name), { recursive: true })
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ ...pkg, version: newVersion }, null, 2) + '\n')
  const quoted = new RegExp(`(["'\`])${oldVersion.replaceAll('.', '\\.')}\\1`, 'g')
  for (const sub of ['dist-node', join('dist', 'assets')]) {
    let found = 0
    for (const f of readdirSync(join(dir, sub))) {
      if (!/\.m?js$/.test(f)) continue
      const file = join(dir, sub, f)
      const text = readFileSync(file, 'utf8')
      const next = text.replace(quoted, (_m, q) => `${q}${newVersion}${q}`)
      if (next !== text) found++, writeFileSync(file, next)
    }
    if (!found) fail(`${sub}에서 버전 표시를 찾지 못했어요`)
  }
  const file = join(work, win ? 'gyeol-windows.zip' : 'gyeol-mac.zip')
  zipDir(dir, file, { executable: (name) => name.endsWith('.command') || /\/node\/(arm64|x64)\/node$/.test(name) })
  return file
}

function call(path, method = 'GET') {
  return new Promise((resolve) => {
    const req = request(`${ORIGIN}${path}`, { method, headers: { 'X-HTML-Maker': '1' }, timeout: 3000 }, (res) => {
      let text = ''
      res.on('data', (d) => (text += d))
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: path === '/__html-maker' ? text : JSON.parse(text) })
        } catch {
          resolve(null)
        }
      })
    })
    req.on('error', () => resolve(null))
    req.on('timeout', () => (req.destroy(), resolve(null)))
    req.end()
  })
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function until(what, test, ms = 60_000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    const v = await test()
    if (v) return v
    await sleep(300)
  }
  fail(`${what}: ${ms / 1000}초 안에 되지 않았어요`)
}

/** 시작 프로그램을 띄운다. 출력은 앞에 표시를 붙여 그대로 보인다 */
function start(label, env, exe = false) {
  const [cmd, argv] = exe ? [join(app, 'Framo.exe'), []] : [node, [join(app, 'dist-node', 'launch.mjs')]]
  const child = spawn(cmd, argv, { cwd: app, env: { ...process.env, GYEOL_NO_OPEN: '1', GYEOL_PORT: String(port), ...env }, stdio: ['ignore', 'pipe', 'pipe'] })
  for (const s of [child.stdout, child.stderr]) s.on('data', (d) => process.stdout.write(String(d).replace(/^(?=.)/gm, `  [${label}] `)))
  return child
}

const up = async () => (await call('/__html-maker'))?.body === 'html-maker'
const status = async () => (await call('/__html-maker/update/status'))?.body ?? null

async function stop(child) {
  child.kill()
  await until('시작 프로그램을 끄면 서버도 꺼진다', async () => !(await up()), 20_000)
}

/** @type {import('node:child_process').ChildProcess | null} */
let first = null
/** @type {import('node:child_process').ChildProcess | null} */
let second = null
try {
  if (await up()) fail(`${port}번 포트에 다른 서버가 떠 있어요`)
  console.log(`이전 버전 ${oldVersion} → 새 버전 ${newVersion} (${useExe ? 'Framo.exe' : 'node'}로 다시 켜 보기)`)
  cpSync(source, app, { recursive: true, filter: (f) => !/[\\/](versions|AI 공유|새 버전)$/.test(f) })
  const zip = await makeNewZip()
  // 시험용 서명 키: 이전 버전 앱(사본)이 이 키만 믿게 한다
  const keyFile = join(work, 'test-signing-key.pem')
  const pub = makeKey(keyFile)
  let trusted = 0
  for (const f of readdirSync(join(app, 'dist-node'))) {
    const file = join(app, 'dist-node', f)
    const text = readFileSync(file, 'utf8')
    const next = text.replace(/(RELEASE_KEYS\s*=\s*)\[[^\]]*\]/, (_m, head) => `${head}[${JSON.stringify(pub)}]`)
    if (next !== text) trusted++, writeFileSync(file, next)
  }
  if (!trusted) fail('이전 버전 앱에서 공개 키 자리(RELEASE_KEYS)를 찾지 못했어요')

  // 1) 이전 버전을 켜고, 가짜 릴리스로 업데이트를 받는다
  first = start('이전', {
    NODE_OPTIONS: `--import=${pathToFileURL(join(here, 'fake-release.mjs')).href}`,
    FRAMO_FAKE_RELEASE: zip,
    FRAMO_FAKE_VERSION: newVersion,
    FRAMO_FAKE_SIGN_KEY: keyFile,
  })
  await until('이전 버전이 켜진다', up)
  const before = await status()
  if (before?.current !== oldVersion || before.auto !== true) fail(`처음 상태가 달라요: ${JSON.stringify(before)}`)
  const checked = (await call('/__html-maker/update/check', 'POST'))?.body
  if (checked?.check?.state !== 'available' || checked.check.version !== newVersion || !checked.check.download) fail(`새 버전을 알지 못했어요: ${JSON.stringify(checked)}`)
  await call('/__html-maker/update/download', 'POST')
  const seen = new Set()
  const ready = await until(
    '받고 풀어 준비됨',
    async () => {
      const s = await status()
      if (s) seen.add(s.download.state)
      if (s?.download.state === 'done' || s?.download.state === 'failed') fail(`업데이트하지 못했어요: ${JSON.stringify(s.download)}`)
      return s?.download.state === 'ready' ? s : null
    },
    180_000,
  )
  console.log(`  지나온 상태: ${[...seen].join(' → ')}`)
  if (ready.download.version !== newVersion) fail('준비된 버전이 달라요')
  if (!existsSync(join(app, 'versions', newVersion, '.framo-ready'))) fail('versions 폴더에 준비 표시가 없어요')
  if (existsSync(join(app, '새 버전', win ? 'gyeol-windows.zip' : 'gyeol-mac.zip'))) fail('풀어 둔 뒤에도 받은 zip이 남았어요')
  const aiBefore = (await call('/__html-maker/ai/status'))?.body

  // 2) 지금 다시 시작: 같은 창(시작 프로그램)에서 새 버전이 같은 주소로 뜬다
  const restart = await call('/__html-maker/update/restart', 'POST')
  if (restart?.status !== 202) fail(`다시 시작을 받지 않았어요: ${JSON.stringify(restart)}`)
  const after = await until('새 버전으로 다시 켜진다', async () => {
    const s = await status()
    return s && s.boot !== ready.boot ? s : null
  })
  if (after.current !== newVersion) fail(`다시 켠 버전이 ${after.current}이에요`)
  if (first.exitCode !== null) fail('다시 켜는 사이에 시작 프로그램이 끝났어요')
  const aiAfter = (await call('/__html-maker/ai/status'))?.body
  if (aiAfter?.mcpPath !== join(app, 'dist-node', 'gyeol-mcp.mjs') || aiAfter.mcpPath !== aiBefore?.mcpPath || aiAfter.nodePath !== aiBefore?.nodePath)
    fail(`AI 연결 경로가 바뀌었어요: ${JSON.stringify({ aiBefore, aiAfter })}`)
  console.log(`  다시 시작: ${oldVersion} → ${after.current}, AI 연결 경로 그대로 (${aiAfter.mcpPath})`)
  await stop(first)
  first = null

  // 3) 처음부터 다시 켜도 새 버전이 켜진다 (가짜 릴리스 없이: 바깥에 묻지 않아도)
  second = start('다시 켬', { NODE_OPTIONS: '' }, useExe)
  await until('다시 켠다', up)
  const cold = await status()
  if (cold?.current !== newVersion) fail(`다시 켰는데 ${cold?.current}이 켜졌어요`)
  console.log(`  처음부터 다시 켜도 ${cold.current}`)
  await stop(second)
  second = null
  console.log('\n자동 업데이트 흐름: 통과')
} catch (e) {
  if (!process.exitCode) console.error(e)
  process.exitCode = 1
} finally {
  first?.kill()
  second?.kill()
  if (!keep) rmSync(work, { recursive: true, force: true })
  else console.log(`남겨 둔 폴더: ${work}`)
}

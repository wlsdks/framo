#!/usr/bin/env node
// 개발할 때 화면을 보고 검사하는 도구. 패키지 없이, 이 PC에 깔린 크롬(없으면 엣지)을 창 없이 띄워
// Chrome DevTools Protocol(Node 내장 WebSocket)로 다룬다. 연결은 이 PC 안(127.0.0.1의 디버그 포트)뿐이고,
// 브라우저는 매번 빈 임시 프로필로 띄워 쓰는 사람의 크롬 프로필과 화면을 건드리지 않는다.
//
//   npm run look -- shot  <주소> [--size 1280x600] [--wait 2000] [--scrollbars] [--out a.png]
//   npm run look -- check [--base http://localhost:5199] [--seeds 1-4] [--themes white,navy,serif] [--large]
//   npm run look -- frame --only cover,kpi [--base …]
//   npm run look -- film  <갤러리 주소> --slide 0 [--level lively] [--every 300] [--count 12] [--out film.png]
//
// shot   한 화면을 찍는다. --scrollbars는 윈도우처럼 늘 보이는 스크롤바를 흉내 낸다.
// check  부품 조합(set=combos)을 조건마다 열어 checkCombos()와 checkAssembly()를 돌린다. 문제가 있으면 1로 끝난다.
// frame  레이아웃의 모든 모양(variants=1)을 두 테마, 명조, 큰 글자, 편집 화면에서 열어 checkFrame()을 돌린다.
// film   갤러리의 장 하나를 playSlide로 움직이며 every ms마다 찍어 한 장의 필름 띠로 묶는다(모션 검토).
// 개발 서버(npm run dev)가 떠 있어야 한다. 주소를 생략하면 http://localhost:5199(AGENTS.md의 개발 포트)를 쓴다.

import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const DEFAULT_BASE = 'http://localhost:5199'

/** 이 PC의 크롬이나 엣지. CHROME_PATH로 정할 수 있다 */
function findBrowser() {
  const list = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter((p) => typeof p === 'string')
  const found = list.find((p) => existsSync(p))
  if (!found) throw new Error('크롬이나 엣지를 찾지 못했어요. CHROME_PATH에 실행 파일 경로를 적어 주세요.')
  return found
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** 창 없는 브라우저 하나와 탭 하나. 끝나면 close()로 브라우저와 임시 프로필을 지운다 */
async function openBrowser({ width = 1920, height = 1080 } = {}) {
  const profile = mkdtempSync(join(tmpdir(), 'framo-look-'))
  const proc = spawn(
    findBrowser(),
    ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-extensions', 'about:blank'],
    { stdio: 'ignore' },
  )
  const portFile = join(profile, 'DevToolsActivePort')
  for (let i = 0; i < 100 && !existsSync(portFile); i++) await sleep(100)
  if (!existsSync(portFile)) throw new Error('브라우저가 켜지지 않았어요.')
  const [port, path] = readFileSync(portFile, 'utf8').trim().split('\n')
  const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`)
  await new Promise((resolve, reject) => {
    ws.onopen = resolve
    ws.onerror = () => reject(new Error('브라우저에 붙지 못했어요.'))
  })
  let seq = 0
  const waiting = new Map()
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data)
    const w = msg.id && waiting.get(msg.id)
    if (!w) return
    waiting.delete(msg.id)
    if (msg.error) w.reject(new Error(msg.error.message))
    else w.resolve(msg.result)
  }
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = ++seq
      waiting.set(id, { resolve, reject })
      ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
    })
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
  const tab = (method, params) => send(method, params, sessionId)
  await tab('Page.enable')
  await tab('Runtime.enable')

  const page = {
    async size(w, h) {
      await tab('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false })
    },
    /** 자바스크립트 식을 돌려 값을 받는다(Promise면 기다린다) */
    async eval(expression) {
      const r = await tab('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text)
      return r.result.value
    },
    /** 새로 연다(같은 문서의 # 주소만 바꾸면 갤러리가 다시 그리지 않아서 빈 장을 거친다) */
    async go(url, wait = 1500) {
      await tab('Page.navigate', { url: 'about:blank' })
      await tab('Page.navigate', { url })
      for (let i = 0; i < 200; i++) {
        if ((await page.eval('document.readyState').catch(() => '')) === 'complete') break
        await sleep(50)
      }
      await page.eval('document.fonts.ready.then(() => true)')
      await sleep(wait)
    },
    /** 찍어서 PNG Buffer로. clip은 {x, y, width, height} */
    async shot(clip) {
      const r = await tab('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { ...clip, scale: 1 } } : {}) })
      return Buffer.from(r.data, 'base64')
    },
    async close() {
      await send('Browser.close').catch(() => {})
      ws.close()
      proc.kill()
      await sleep(200)
      rmSync(profile, { recursive: true, force: true })
    },
  }
  await page.size(width, height)
  return page
}

/** 늘 보이는 스크롤바(윈도우 흉내) */
const SCROLLBARS = `(() => { const s = document.createElement('style'); s.textContent = '::-webkit-scrollbar{width:17px;height:17px}::-webkit-scrollbar-thumb{background:#c1c1c1}::-webkit-scrollbar-track{background:#f1f1f1}'; document.head.append(s); return true })()`

/** @param {string[]} argv */
function args(argv) {
  /** @type {Record<string, any> & { _: string[] }} */
  const out = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const next = argv[i + 1]
      if (next === undefined || next.startsWith('--')) out[a.slice(2)] = true
      else out[a.slice(2)] = argv[++i]
    } else out._.push(a)
  }
  return out
}

const sizeOf = (s, w = 1920, h = 1080) => (typeof s === 'string' && /^\d+x\d+$/.test(s) ? s.split('x').map(Number) : [w, h])
const range = (s) => {
  const [a, b] = String(s).split('-').map(Number)
  return Array.from({ length: (b || a) - a + 1 }, (_, i) => a + i)
}

async function shot(o) {
  const url = o._[1]
  if (!url) throw new Error('찍을 주소를 적어 주세요.')
  const [w, h] = sizeOf(o.size)
  const page = await openBrowser({ width: w, height: h })
  try {
    await page.go(url, Number(o.wait ?? 2000))
    if (o.scrollbars) await page.eval(SCROLLBARS)
    const out = o.out || 'shot.png'
    writeFileSync(out, await page.shot())
    console.log(out)
  } finally {
    await page.close()
  }
}

/** 조건 하나를 열어 검사 함수들을 돌리고 문제 목록과 검사한 장 수를 돌려준다. 장이 하나도 없으면 그것도 문제다(빈 화면을 통과로 세지 않게) */
async function run(page, url, fns) {
  await page.go(url, 2500)
  const problems = []
  let slides = 0
  for (const fn of fns) {
    const ready = await page.eval(`typeof window.${fn} === 'function'`)
    if (!ready) {
      problems.push(`${fn}가 없어요(갤러리 주소를 확인해 주세요)`)
      continue
    }
    const r = await page.eval(`window.${fn}().then((r) => ({ problems: r.problems, slides: r.slides }))`)
    if (!r.slides) problems.push(`${fn}: 검사한 장이 없어요`)
    slides = Math.max(slides, r.slides || 0)
    for (const p of r.problems) problems.push(`${fn}: ${p}`)
  }
  return { problems, slides }
}

async function check(o) {
  const base = o.base || DEFAULT_BASE
  const seeds = range(o.seeds || '1-4')
  const themes = String(o.themes || 'white,navy,serif').split(',')
  const page = await openBrowser()
  let bad = 0
  try {
    for (const theme of themes)
      for (const seed of seeds) {
        const q = `set=combos&n=60&w=1920&seed=${seed}${theme === 'white' ? '' : `&theme=${theme}`}${o.large ? '&size=large' : ''}`
        const { problems, slides } = await run(page, `${base}/#/gallery?${q}`, ['checkCombos', 'checkAssembly'])
        bad += problems.length
        console.log(`${problems.length ? '✗' : '✓'} ${q} (${slides}장)${problems.length ? '\n  ' + problems.slice(0, 20).join('\n  ') : ''}`)
      }
  } finally {
    await page.close()
  }
  if (bad) process.exitCode = 1
}

async function frame(o) {
  const base = o.base || DEFAULT_BASE
  if (!o.only) throw new Error('--only에 레이아웃 id를 적어 주세요(쉼표로 여럿).')
  const conds = ['', '&theme=navy', '&theme=serif', '&size=large', '&mode=edit']
  const page = await openBrowser()
  let bad = 0
  try {
    for (const c of conds) {
      const q = `variants=1&only=${o.only}${c}`
      const { problems, slides } = await run(page, `${base}/#/gallery?${q}`, ['checkFrame'])
      bad += problems.length
      console.log(`${problems.length ? '✗' : '✓'} ${q} (${slides}장)${problems.length ? '\n  ' + problems.slice(0, 20).join('\n  ') : ''}`)
    }
  } finally {
    await page.close()
  }
  if (bad) process.exitCode = 1
}

async function film(o) {
  const url = o._[1]
  if (!url) throw new Error('갤러리 주소를 적어 주세요(예: http://localhost:5199/#/gallery?set=blocks&types=spread).')
  const i = Number(o.slide ?? 0)
  const every = Number(o.every ?? 300)
  const count = Number(o.count ?? 12)
  const page = await openBrowser()
  try {
    await page.go(url, 2500)
    const rect = await page.eval(`(() => { const s = document.querySelectorAll('.slide')[${i}]; if (!s) return null; s.scrollIntoView({ block: 'start' }); const r = s.getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height } })()`)
    if (!rect) throw new Error(`${i}번째 장이 없어요.`)
    await page.eval(`(void window.playSlide(${i}, ${JSON.stringify(o.level || 'lively')}), true)`)
    /** @type {string[]} */
    const frames = []
    for (let k = 0; k < count; k++) {
      await sleep(every)
      frames.push((await page.shot(rect)).toString('base64'))
    }
    // 같은 브라우저에서 그림들을 격자로 늘어놓고 한 번 더 찍어 한 장으로 묶는다(이미지 패키지 없이)
    const cols = 4
    const w = 480
    const h = Math.round((w * rect.height) / rect.width)
    const rows = Math.ceil(frames.length / cols)
    await page.size(cols * (w + 8) + 8, rows * (h + 28) + 8)
    await page.go('about:blank', 0)
    const cells = frames.map((f, k) => `<figure><img src="data:image/png;base64,${f}"><figcaption>${((k + 1) * every) / 1000}s</figcaption></figure>`).join('')
    await page.eval(`(() => { document.body.innerHTML = ${JSON.stringify(`<style>body{margin:0;padding:8px;background:#777;display:grid;grid-template-columns:repeat(${cols},${w}px);gap:8px;font:12px sans-serif;color:#fff}figure{margin:0}img{width:${w}px;height:${h}px;display:block}figcaption{height:20px;line-height:20px}</style>${cells}`)}; return Promise.all([...document.images].map((im) => im.decode())).then(() => true) })()`)
    const out = o.out || 'film.png'
    writeFileSync(out, await page.shot())
    console.log(out)
  } finally {
    await page.close()
  }
}

/** @type {Record<string, (o: Record<string, any>) => Promise<void>>} */
const COMMANDS = { shot, check, frame, film }
const o = args(process.argv.slice(2))
const cmd = COMMANDS[o._[0]]
if (!cmd) {
  console.error('쓰는 법: npm run look -- shot|check|frame|film … (scripts/look.mjs 맨 위 참고)')
  process.exit(2)
}
cmd(o).catch((e) => {
  console.error(e.message)
  process.exit(1)
})

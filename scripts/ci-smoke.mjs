// @ts-nocheck -- playwright-core는 이 검수 단계에서만 받아서, 타입 검사(npm run typecheck) 때는 없다
// 검수(CI)에서만 쓴다: 켜 둔 배포본을 엣지와 크롬으로 열어 화면이 그려지는지, 브라우저가 이 PC 밖으로 요청하지 않는지 본다.
// playwright-core는 이 단계에서만 따로 받고(package.json에 넣지 않는다) 설치된 엣지, 크롬을 그대로 쓴다.
// 쓰는 법: node scripts/ci-smoke.mjs <스크린샷 폴더>

import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright-core'

const ORIGIN = 'http://127.0.0.1:41580'
const out = process.argv[2] ?? 'ci-shots'
mkdirSync(out, { recursive: true })

const pages = [
  // 처음 화면은 '불러오는 중' 뒤에 그려진다. 제목(Framo)만으로는 그려졌는지 알 수 없어서 홈에만 있는 단추를 기다린다
  { name: 'home', url: `${ORIGIN}/`, ready: (p) => p.getByRole('button', { name: '새 발표 만들기' }) },
  // 새 프로필에는 예시 발표가 아직 없다. 처음 쓰는 사람처럼 '완성된 예시 보기'를 눌러 편집기로 들어간다
  {
    name: 'edit-sample',
    go: async (p) => p.getByRole('button', { name: '완성된 예시 보기' }).click(),
    ready: (p) => p.getByRole('button', { name: '발표하기', exact: true }),
  },
]

let failed = false
for (const channel of ['msedge', 'chrome']) {
  let browser
  try {
    browser = await chromium.launch({ channel, headless: true })
  } catch (e) {
    // 쓰는 사람의 브라우저는 크롬과 엣지라 둘 다 봐야 한다. 건너뛰고 넘어가면 검수 PC에서 브라우저가 빠져도 점검 없이 통과한다
    failed = true
    console.log(`${channel}: 열지 못했어요 (${String(e).split('\n')[0]})`)
    continue
  }
  // 윈도우 150% 노트북의 브라우저 안 크기
  const context = await browser.newContext({ viewport: { width: 1280, height: 600 } })
  const page = await context.newPage()
  const outside = new Set()
  const errors = []
  page.on('request', (r) => {
    const u = r.url()
    if (!u.startsWith(ORIGIN) && !u.startsWith('data:') && !u.startsWith('blob:')) outside.add(u)
  })
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(String(e)))
  for (const pg of pages) {
    try {
      if (pg.url) await page.goto(pg.url)
      else await pg.go(page)
      await pg.ready(page).first().waitFor({ state: 'visible', timeout: 30_000 })
      // 움직임이 끝난 모습을 찍는다
      await page.waitForTimeout(1500)
      await page.screenshot({ path: join(out, `${channel}-${pg.name}.png`) })
      console.log(`${channel} / ${pg.name}: 그려짐`)
    } catch (e) {
      failed = true
      await page.screenshot({ path: join(out, `${channel}-${pg.name}-failed.png`) }).catch(() => {})
      console.log(`${channel} / ${pg.name}: 그려지지 않았어요 (${String(e).split('\n')[0]})`)
    }
  }
  if (outside.size) {
    failed = true
    console.log(`${channel}: 브라우저가 이 PC 밖으로 요청했어요:\n  ${[...outside].join('\n  ')}`)
  }
  if (errors.length) {
    failed = true
    console.log(`${channel}: 콘솔 오류\n  ${errors.join('\n  ')}`)
  }
  await browser.close()
}
process.exit(failed ? 1 : 0)

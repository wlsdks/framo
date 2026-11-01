// 바깥으로 연결하는 코드가 정해 둔 곳 말고는 없는지 소스(src, server, mcp)를 훑는다.
// Framo가 이 PC 밖으로 연결하는 곳은 새 버전 확인(server/update.ts) 하나뿐이다('AI에게 부탁'은 Claude Code라는 다른 프로그램을 띄운다).
// 새 파일에서 바깥으로 연결하려 하면 이 시험이 멈춘다. 허락을 늘리기 전에 AGENTS.md '꼭 지킬 것' 1을 다시 읽는다.

import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ALLOWED } from './offline.mjs'

const root = join(import.meta.dirname, '..')

/** 시험 파일은 빼고 훑는다(시험은 가짜 주소를 일부러 쓴다) */
const files = ['src', 'server', 'mcp'].flatMap((dir) =>
  readdirSync(join(root, dir), { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && /\.(ts|tsx|mjs|js)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name))
    .map((e) => relative(root, join(e.parentPath, e.name)).split(sep).join('/')),
)

/** 주석을 빼고 본다. 설명에 적은 주소나 함수 이름은 연결이 아니다 */
function code(file: string): string {
  return readFileSync(join(root, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
}

/** 바깥으로 연결할 수 있는 것과, 그것을 써도 되는 파일(까닭) */
const NETWORK: { name: string; re: RegExp; allow: Record<string, string> }[] = [
  {
    name: 'https 모듈',
    re: /from\s+['"](node:)?https['"]|import\(\s*['"](node:)?https['"]/,
    allow: { 'server/update.ts': '새 버전 확인과 받기. github.com/wlsdks/gyeol 릴리스만' },
  },
  {
    name: 'http 모듈(값)',
    // 형(type)만 가져오는 것은 연결이 아니다
    re: /^import\s+(?!type\b)[^\n]*from\s+['"](node:)?http['"]|import\(\s*['"](node:)?http['"]|require\(\s*['"](node:)?https?['"]/m,
    allow: { 'server/serve.ts': '127.0.0.1에 서버를 띄우고, 이미 떠 있는지 127.0.0.1에 묻는다' },
  },
  { name: 'net, tls, dgram, http2', re: /from\s+['"](node:)?(net|tls|dgram|http2)['"]/, allow: {} },
  {
    name: 'fetch',
    re: /\bfetch\s*\(/,
    allow: {
      'src/ai/client.ts': '같은 주소의 AI 공유 창구(/__html-maker/ai/)',
      'src/update/client.ts': '같은 주소의 새 버전 창구(/__html-maker/update/)',
      'src/export/fonts.ts': '앱에 들어 있는 글꼴 파일을 내보낼 HTML에 넣으려고 읽는다(같은 주소, CSP)',
      'src/export/rasterize.tsx': '장 안의 이미지(data:, blob:)를 그림으로 바꾸려고 읽는다(CSP)',
    },
  },
  { name: 'XMLHttpRequest', re: /\bXMLHttpRequest\b/, allow: {} },
  { name: 'WebSocket', re: /\bWebSocket\b/, allow: {} },
  { name: 'EventSource', re: /\bEventSource\b/, allow: {} },
  { name: 'sendBeacon', re: /\bsendBeacon\b/, allow: {} },
  { name: '바깥 주소의 import()', re: /import\(\s*['"`]https?:/, allow: {} },
]

describe('바깥 연결', () => {
  it('훑을 파일이 있다', () => {
    expect(files).toContain('server/update.ts')
    expect(files).toContain('src/ai/client.ts')
  })

  for (const n of NETWORK) {
    it(`${n.name}: 허락한 파일에서만 쓴다`, () => {
      const used = files.filter((f) => n.re.test(code(f)))
      expect(used.filter((f) => !(f in n.allow))).toEqual([])
    })
  }

  it('브라우저 쪽 fetch는 같은 주소(상대 경로)로만 간다', () => {
    for (const file of ['src/ai/client.ts', 'src/update/client.ts']) {
      const calls = [...code(file).matchAll(/\bfetch\s*\(\s*([^,)]+)/g)].map((m) => m[1].trim())
      expect(calls.length).toBeGreaterThan(0)
      for (const arg of calls) expect(arg).toMatch(/^(AI_PREFIX|UPDATE_PREFIX)\b/)
    }
  })

  it('코드에 적힌 바깥 주소는 이름표, 로컬 주소, 새 버전 확인의 GitHub 주소뿐이다', () => {
    const bad: string[] = []
    for (const file of files) {
      for (const [url] of code(file).matchAll(/https?:\/\/[^\s"'`)<>\\]+/g)) {
        if (!ALLOWED.some((re) => re.test(url))) bad.push(`${file}: ${url}`)
      }
    }
    expect(bad).toEqual([])
  })

  it('GitHub 주소를 쓰는 곳은 server/update.ts 하나다', () => {
    const used = files.filter((f) => /https:\/\/(api\.)?github\.com\//.test(code(f)))
    // 화면은 '바뀐 점 보기' 링크가 서버가 준 주소와 같은 꼴인지 정규식으로만 본다(연결하지 않는다)
    expect(used).toEqual(['server/update.ts'])
  })

  it('로컬 주소는 이 PC 자신만 받는다', () => {
    const ok = (url: string) => ALLOWED.some((re) => re.test(url))
    for (const url of ['http://127.0.0.1', 'http://127.0.0.1:41580', 'http://127.0.0.1:41580/__html-maker', 'http://${HOST}:${PORT}', 'http://${req.headers.host}']) {
      expect(ok(url)).toBe(true)
    }
    // 127.0.0.1로 시작하지만 다른 곳으로 가는 주소: 이름을 이어 붙이거나, 앞을 사용자 정보로 만든 것
    for (const url of ['http://127.0.0.1.evil.example/', 'http://127.0.0.1@evil.example/', 'http://127.0.0.1:80@evil.example/', 'http://${HOST}.evil.example/']) {
      expect(ok(url)).toBe(false)
    }
  })

  it('허락 목록은 이 저장소의 릴리스만 받는다', () => {
    const ok = (url: string) => ALLOWED.some((re) => re.test(url))
    expect(ok('https://api.github.com/repos/wlsdks/gyeol/releases/latest')).toBe(true)
    expect(ok('https://github.com/wlsdks/gyeol/releases/download/')).toBe(true)
    expect(ok('https://api.github.com/repos/someone/gyeol/releases/latest')).toBe(false)
    expect(ok('https://github.com/someone/x/releases/download/')).toBe(false)
    expect(ok('https://github.com/wlsdks/gyeol/archive/main.zip')).toBe(false)
    expect(ok('https://evil.example/')).toBe(false)
    expect(ok('https://fonts.googleapis.com/css2')).toBe(false)
  })
})

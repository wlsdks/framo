// 문서(README, docs/)는 손으로 고치는 글이라 코드가 바뀌어도 예전 그대로 남기 쉽다(종류가 열넷이 됐는데 열셋,
// 판으로 바꾼 뒤에도 줄 시절의 함수 이름). 쓰는 사람이 고르는 것과 다음 사람이 찾아갈 이름만 코드와 같은지 본다
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AUDIENCES, BLUEPRINTS, DECK_TYPES, METHODS } from '../src/deck/blueprints'

const ROOT = join(import.meta.dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const README = read('README.md')
const DESIGN = read('docs/DESIGN.md')

// README는 수를 말로 적는다 (열넷, 열다섯 …)
const TENS = ['열', '열한', '열두', '열세', '열네', '열다섯', '열여섯', '열일곱', '열여덟', '열아홉', '스무']

/** '종류'가 든 줄에서 고른 수 */
function typeCounts(text: string, pattern: RegExp): string[] {
  return text.split('\n').filter((line) => line.includes('종류')).flatMap((line) => [...line.matchAll(pattern)].map((m) => m[1]))
}

/** 코드에 나오는 낱말 (함수, 변수, 키 이름). 주석은 뺀다: '예전 autoTarget과 같은 차례'처럼 없앤 이름이 주석에 남는다 */
function codeWords(): Set<string> {
  const words = new Set<string>()
  const walk = (dir: string) => {
    for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
      const p = join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (/\.(tsx?|mjs|cjs|css|ya?ml|json)$/.test(e.name)) {
        const code = /\.ya?ml$/.test(e.name)
          ? read(p).replace(/(^|\s)#.*$/gm, '$1')
          : read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1')
        for (const w of code.match(/[A-Za-z_$][\w$]*/g) ?? []) words.add(w)
      }
    }
  }
  for (const dir of ['src', 'server', 'mcp', 'scripts', 'launch', '.github']) walk(dir)
  return words
}

describe('문서와 코드', () => {
  it('README와 DESIGN.md가 발표 종류를 모두, 같은 수로 적는다', () => {
    for (const type of DECK_TYPES) {
      expect(README).toContain(BLUEPRINTS[type].name)
      expect(DESIGN).toContain(BLUEPRINTS[type].name)
    }
    const n = DECK_TYPES.length
    expect(typeCounts(README, /(열\S*|스무) 가지/g)).toEqual([`${TENS[n - 10]}`])
    const design = typeCounts(DESIGN, /(\d+)가지/g)
    expect(design.length).toBeGreaterThan(0)
    expect(new Set(design)).toEqual(new Set([String(n)]))
  })

  it('README와 DESIGN.md가 듣는 사람을 모두 적고, DESIGN.md는 방식도 화면의 이름으로 적는다', () => {
    for (const a of AUDIENCES) {
      expect(README).toContain(a.name)
      expect(DESIGN).toContain(a.name)
    }
    for (const m of METHODS) expect(DESIGN).toContain(m.name)
  })

  it('docs/의 설계 문서가 `이름`으로 가리키는 함수와 값이 코드에 있다', () => {
    const words = codeWords()
    const missing = ['docs/DESIGN.md', 'docs/MOTION.md', 'docs/ARCHITECTURE.md'].flatMap((doc) =>
      [...read(doc).matchAll(/`([A-Za-z_$][\w$]*)`/g)].map((m) => m[1]).filter((name) => !words.has(name)).map((name) => `${doc}: ${name}`),
    )
    expect([...new Set(missing)]).toEqual([])
  })
})

import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, normalize, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// 폴더끼리 기대는 방향. 아래쪽(발표 모델)이 위쪽(화면)을 가져오면 모델만 따로 시험하거나 MCP 서버에 넣을 수 없고,
// 고칠 때 한 곳을 바꾸면 어디까지 번지는지 알기 어려워진다. docs/ARCHITECTURE.md의 '층'과 같다
const ALLOWED: Record<string, string[]> = {
  lib: [],
  deck: ['lib'],
  motion: ['lib'],
  present: ['deck', 'lib'],
  slides: ['deck', 'lib', 'motion'],
  ai: ['deck', 'lib'],
  // 발표를 지울 때 AI 공유도 끈다(persist.ts의 removeDeck)
  store: ['deck', 'lib', 'ai'],
  export: ['deck', 'lib', 'motion', 'slides', 'store'],
  // 새 버전 창구에 AI 공유와 같은 머리글(AI_HEADER)을 보낸다: 로컬 서버는 그 머리글이 든 요청만 받는다(server/guard.ts)
  update: ['ai'],
}

// 맨 위의 층: 화면(screens/)과 src 바로 아래의 파일(App.tsx, main.tsx)은 무엇이든 가져온다
const TOP = new Set(['screens', ''])

const SRC = dirname(fileURLToPath(import.meta.url))

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name)
    if (e.isDirectory()) return sourceFiles(p)
    return /\.tsx?$/.test(e.name) && !/\.(test|d)\.tsx?$/.test(e.name) ? [p] : []
  })
}

const FILES = sourceFiles(SRC)
const KNOWN = new Set(FILES)

const IMPORT = /^(?:import|export)\s+(type\s+)?(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]/gm

/** 이 파일이 가져오는 src 안의 파일. 실행할 때 불러오는 것만(import type은 빼고) */
function imports(file: string): string[] {
  const text = readFileSync(file, 'utf8')
  const out: string[] = []
  for (const m of text.matchAll(IMPORT)) {
    if (m[1] || !m[2].startsWith('.')) continue
    const base = normalize(join(dirname(file), m[2].split('?')[0]))
    const hit = [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts')].find((p) => KNOWN.has(p))
    if (hit) out.push(hit)
  }
  return out
}

/** 이 파일이 실행할 때 가져오는 바깥 패키지(react, node:fs 같은) */
function packages(file: string): string[] {
  return [...readFileSync(file, 'utf8').matchAll(IMPORT)].filter((m) => !m[1] && !m[2].startsWith('.')).map((m) => m[2])
}

const GRAPH = new Map(FILES.map((f) => [f, imports(f)]))
const folder = (file: string) => {
  const parts = relative(SRC, file).split(sep)
  return parts.length > 1 ? parts[0] : ''
}
const name = (file: string) => relative(SRC, file).split(sep).join('/')

describe('구조', () => {
  it('src의 폴더마다 기댈 수 있는 방향을 정해 두었다 (모르는 폴더는 방향 검사를 건너뛴다)', () => {
    // ALLOWED에도 TOP에도 없는 폴더는 위의 검사가 소리 없이 넘긴다. 새 폴더를 만들면 여기와 docs/ARCHITECTURE.md의 '층'에 넣는다
    const unknown = [...new Set(FILES.map(folder))].filter((f) => !TOP.has(f) && !(f in ALLOWED))
    expect(unknown).toEqual([])
  })

  it('폴더는 정한 방향으로만 기댄다', () => {
    const wrong: string[] = []
    for (const [file, deps] of GRAPH) {
      const from = folder(file)
      const allowed = ALLOWED[from]
      if (!allowed) continue
      for (const dep of deps) {
        const to = folder(dep)
        if (to !== from && !allowed.includes(to)) wrong.push(`${name(file)} → ${name(dep)}`)
      }
    }
    expect(wrong).toEqual([])
  })

  it('로컬 서버와 MCP 서버가 가져가는 src 파일은 브라우저와 패키지 없이 돈다', () => {
    // 서버와 MCP 서버는 Node 내장만으로 돈다(AGENTS.md '꼭 지킬 것' 6). 모양 확인, 제안 읽기, 부품 목록을
    // src에서 그대로 가져가므로, 그 파일들이 React나 DOM을 쓰기 시작하면 서버 빌드가 깨지거나 몰래 의존성이 늘어난다
    const ROOT = dirname(SRC)
    const entries = [...sourceFiles(join(ROOT, 'server')), ...sourceFiles(join(ROOT, 'mcp'))]
    const used = new Set<string>()
    const walk = (f: string) => {
      for (const d of GRAPH.get(f) ?? imports(f)) if (!used.has(d)) used.add(d), walk(d)
    }
    entries.forEach(walk)
    const wrong: string[] = []
    for (const f of used) {
      for (const p of packages(f)) wrong.push(`${name(f)}: ${p}`)
      // 주석을 걷고 본다. 브라우저에만 있는 것
      const code = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
      for (const g of code.match(/\b(?:document|window|navigator|localStorage|indexedDB|requestAnimationFrame)\b/g) ?? []) wrong.push(`${name(f)}: ${g}`)
    }
    expect(used.size).toBeGreaterThan(10)
    expect(wrong).toEqual([])
  })

  it('파일끼리 서로를 가져오지 않는다 (순환이 있으면 불러오는 차례에 따라 아직 없는 값을 읽는다)', () => {
    // 강한 연결 요소(Tarjan). 둘 이상이 묶이면 순환이다
    const index = new Map<string, number>()
    const low = new Map<string, number>()
    const stack: string[] = []
    const onStack = new Set<string>()
    const cycles: string[][] = []
    let n = 0
    const visit = (v: string) => {
      index.set(v, n)
      low.set(v, n++)
      stack.push(v)
      onStack.add(v)
      for (const w of GRAPH.get(v) ?? []) {
        if (!index.has(w)) {
          visit(w)
          low.set(v, Math.min(low.get(v)!, low.get(w)!))
        } else if (onStack.has(w)) low.set(v, Math.min(low.get(v)!, index.get(w)!))
      }
      if (low.get(v) === index.get(v)) {
        const group: string[] = []
        let w: string
        do {
          w = stack.pop()!
          onStack.delete(w)
          group.push(name(w))
        } while (w !== v)
        if (group.length > 1) cycles.push(group.sort())
      }
    }
    for (const f of FILES) if (!index.has(f)) visit(f)
    expect(cycles).toEqual([])
  })
})

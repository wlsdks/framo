// 쓰지 않는 파일, 내보내기, 패키지를 찾는다. npm test의 unused.test.ts가 찾은 것이 없는지 본다.
// 무엇을 찾고 무엇을 입구와 가져오기로 세는지, 허락 목록에 넣는 법은 docs/ARCHITECTURE.md의 '쓰지 않는 것 찾기'에 있다.
// 소스를 읽는 일은 readSource.mjs가 한다.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { dirname, join, posix } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readCss, readHtml, readScript } from './readSource.mjs'

/** @typedef {import('./readSource.mjs').Module} Module */
/** @typedef {import('./readSource.mjs').Ref} Ref */
/** @typedef {import('./readSource.mjs').Export} Export */

// ───────────────────────── 저장소 전체 보기 ─────────────────────────

const SCRIPT = /\.(ts|tsx|mts|cts|mjs|cjs|js)$/
const TEST = /\.test\.tsx?$/
const EXTENSIONS = ['', '.ts', '.tsx', '.mts', '.mjs', '.js', '.cjs', '/index.ts', '/index.tsx']
const BUILTINS = new Set(builtinModules)

/** 'react-dom/client' → 'react-dom', '@dnd-kit/core/x' → '@dnd-kit/core' */
const packageOf = (/** @type {string} */ spec) => spec.split('/').slice(0, spec.startsWith('@') ? 2 : 1).join('/')

/**
 * @typedef {{
 *   files: Map<string, string | null>,
 *   packageJson: { scripts?: Record<string, string>, dependencies?: Record<string, string>, devDependencies?: Record<string, string> },
 *   roots: Record<string, string>,
 *   shipRoots: string[],
 *   bins: Record<string, string>,
 *   tsTypes: string[],
 *   allow?: { testHelpers?: Record<string, string>, exports?: Record<string, string>, undeclared?: Record<string, string>, pending?: string[] },
 * }} Project
 *   files: 저장소 기준 경로(/로 나눔) → 내용(그림 같은 파일은 null). roots: 늘 쓰는 것으로 볼 파일 → 까닭(시험 파일은 저절로 든다).
 *   shipRoots: 나눠 주는 프로그램의 시작 파일(여기서 닿는 패키지는 dependencies여야 한다). bins: 실행 이름 → 패키지.
 *   tsTypes: tsconfig의 types와 같은 것. allow: 까닭을 적은 허락 목록
 * @typedef {{ kind: string, item: string, note?: string }} Finding
 */

/**
 * @param {Project} project
 * @returns {Finding[]}
 */
export function analyze(project) {
  const { files, packageJson } = project
  const allow = { testHelpers: {}, exports: {}, undeclared: {}, pending: /** @type {string[]} */ ([]), ...project.allow }
  /** @type {Finding[]} */
  const out = []
  /** @type {Map<string, Module>} */
  const modules = new Map()
  for (const [file, text] of files) {
    if (text === null) continue
    if (SCRIPT.test(file)) modules.set(file, readScript(text, { jsx: /\.[jt]sx$/.test(file) }))
    else if (file.endsWith('.css')) modules.set(file, readCss(text))
    else if (file.endsWith('.html')) modules.set(file, readHtml(text))
  }

  /** @returns {{ file: string } | { pkg: string } | { builtin: true } | { missing: true } | { skip: true }} */
  const resolve = (/** @type {string} */ from, /** @type {string} */ raw) => {
    const spec = raw.replace(/[?#].*$/, '')
    if (!spec || /^(data:|https?:|\$)/.test(spec) || spec.endsWith('.json')) return { skip: true }
    if (spec.startsWith('node:') || BUILTINS.has(spec)) return { builtin: true }
    let base
    if (spec.startsWith('./') || spec.startsWith('../')) base = posix.normalize(posix.join(posix.dirname(from), spec))
    else if (spec.startsWith('/')) base = spec.slice(1)
    else return { pkg: packageOf(spec) }
    for (const ext of EXTENSIONS) if (files.has(base + ext)) return { file: base + ext }
    return { missing: true }
  }

  // 파일끼리 잇는 선. launch/의 파일 이름을 적은 문자열도 그 파일을 가리킨다(pack.mjs, exe.mjs가 이름으로 복사한다)
  const launchNames = new Map([...files.keys()].filter((f) => f.startsWith('launch/')).map((f) => [posix.basename(f), f]))
  /** @type {Map<string, { ref: Ref, target: string }[]>} */
  const edges = new Map()
  for (const [file, mod] of modules) {
    const list = []
    for (const ref of mod.refs) {
      const r = resolve(file, ref.spec)
      if ('file' in r) list.push({ ref, target: r.file })
      else if ('missing' in r) out.push({ kind: '찾지 못한 파일', item: `${file}:${ref.line} ${ref.spec}` })
    }
    for (const s of mod.strings) {
      const target = launchNames.get(s)
      if (target) list.push({ ref: { spec: s, line: 0, names: [], typeOnly: false }, target })
    }
    edges.set(file, list)
  }

  const reach = (/** @type {string[]} */ starts, valueOnly = false) => {
    const seen = new Set(starts.filter((f) => files.has(f)))
    const queue = [...seen]
    while (queue.length) {
      for (const { ref, target } of edges.get(/** @type {string} */ (queue.pop())) ?? []) {
        if (valueOnly && ref.typeOnly) continue
        if (!seen.has(target)) seen.add(target), queue.push(target)
      }
    }
    return seen
  }

  const tests = [...files.keys()].filter((f) => TEST.test(f))
  for (const root of Object.keys(project.roots)) if (!files.has(root)) out.push({ kind: '허락 목록이 낡음', item: `roots: ${root}`, note: '없는 파일' })
  const live = reach(Object.keys(project.roots))
  const tested = reach(tests)

  for (const file of files.keys()) {
    if (live.has(file) || TEST.test(file)) continue
    if (!tested.has(file)) out.push({ kind: '쓰지 않는 파일', item: file })
    else if (!(file in allow.testHelpers)) out.push({ kind: '시험에서만 쓰는 파일', item: file })
  }
  for (const file of Object.keys(allow.testHelpers)) {
    if (!files.has(file) || live.has(file) || !tested.has(file)) out.push({ kind: '허락 목록이 낡음', item: `testHelpers: ${file}`, note: '시험에서만 쓰는 파일이 아님' })
  }

  // ── 내보내기: 누가 어떤 이름을 가져가는지 다시 내보내기(export { } from, export * from)를 따라 표시한다
  /** @type {Map<string, Map<string, { live: boolean, test: boolean }>>} */
  const used = new Map()
  const exportsOf = (/** @type {string} */ file) => modules.get(file)?.exports ?? []
  const starTargets = (/** @type {string} */ file) =>
    (modules.get(file)?.stars ?? []).map((s) => resolve(file, s.spec)).flatMap((r) => ('file' in r ? [r.file] : []))
  const provides = (/** @type {string} */ file, /** @type {string} */ name, seen = new Set()) => {
    if (seen.has(file)) return false
    seen.add(file)
    return exportsOf(file).some((e) => e.name === name) || (name !== 'default' && starTargets(file).some((f) => provides(f, name, seen)))
  }
  const mark = (/** @type {string} */ file, /** @type {string} */ name, /** @type {'live' | 'test'} */ by, seen = new Set()) => {
    const key = `${file}#${name}`
    if (seen.has(key) || !modules.has(file)) return
    seen.add(key)
    const hit = (/** @type {Export} */ e) => {
      const u = used.get(file) ?? new Map()
      used.set(file, u)
      const s = u.get(e.name) ?? { live: false, test: false }
      s[by] = true
      u.set(e.name, s)
      if (e.from !== null) {
        const r = resolve(file, e.from)
        if ('file' in r) mark(r.file, e.imported ?? e.name, by, seen)
      }
    }
    if (name === '*') {
      exportsOf(file).forEach(hit)
      for (const f of starTargets(file)) mark(f, '*', by, seen)
      return
    }
    const own = exportsOf(file).find((e) => e.name === name)
    if (own) return hit(own)
    if (name === 'default') return
    for (const f of starTargets(file)) if (provides(f, name)) return mark(f, name, by, seen)
  }
  for (const [file, list] of edges) {
    const by = live.has(file) ? 'live' : 'test'
    for (const { ref, target } of list) for (const name of ref.names) mark(target, name, by)
  }

  const allowedExports = new Set(Object.keys(allow.exports))
  for (const [file, mod] of modules) {
    if (TEST.test(file) || (!live.has(file) && !tested.has(file))) continue
    const seen = new Set()
    for (const e of mod.exports) {
      if (seen.has(e.name)) continue
      seen.add(e.name)
      const key = `${file}#${e.name}`
      const u = used.get(file)?.get(e.name)
      const local = e.local !== null && (mod.uses.get(e.local) ?? 0) > 0
      // 설정 파일의 default는 도구(Vite, Vitest)가 읽는다
      if (e.name === 'default' && /^vite(\.node)?\.config\.ts$/.test(file)) continue
      let kind = ''
      if (u?.live || (u?.test && !live.has(file))) kind = ''
      else if (u?.test) kind = local ? '' : '시험에서만 쓰는 내보내기'
      else kind = local ? '파일 안에서만 쓰는 내보내기' : '쓰지 않는 내보내기'
      if (allowedExports.has(key)) {
        if (!kind) out.push({ kind: '허락 목록이 낡음', item: `exports: ${key}`, note: '이제 쓰는 곳이 있음' })
        allowedExports.delete(key)
        continue
      }
      if (kind) out.push({ kind, item: `${key}`, note: `${file}:${e.line}` })
    }
  }
  for (const key of allowedExports) out.push({ kind: '허락 목록이 낡음', item: `exports: ${key}`, note: '그런 내보내기가 없음' })

  // ── 패키지
  const declared = { ...packageJson.dependencies, ...packageJson.devDependencies }
  const usedPkgs = new Set()
  const shipped = reach(project.shipRoots, true)
  const shippedPkgs = new Set()
  for (const [file, mod] of modules) {
    if (!live.has(file) && !tested.has(file)) continue
    for (const ref of mod.refs) {
      const r = resolve(file, ref.spec)
      if (!('pkg' in r)) continue
      usedPkgs.add(r.pkg)
      if (shipped.has(file) && !ref.typeOnly) shippedPkgs.add(r.pkg)
    }
  }
  for (const type of project.tsTypes) usedPkgs.add(`@types/${type}` in declared ? `@types/${type}` : packageOf(type))
  for (const command of Object.values(packageJson.scripts ?? {})) {
    for (const word of command.split(/[\s&|;]+/)) if (word in project.bins) usedPkgs.add(project.bins[word])
  }
  // @types/x는 x를 쓰면 쓴 것이다
  for (const pkg of [...usedPkgs]) {
    const types = `@types/${pkg.replace(/^@(.*)\/(.*)$/, '$1__$2')}`
    if (types in declared) usedPkgs.add(types)
  }
  for (const pkg of Object.keys(declared)) if (!usedPkgs.has(pkg)) out.push({ kind: '쓰지 않는 패키지', item: pkg })
  for (const pkg of usedPkgs) {
    if (!(pkg in declared) && !(pkg in allow.undeclared)) out.push({ kind: 'package.json에 없는 패키지', item: pkg })
  }
  for (const pkg of Object.keys(allow.undeclared)) {
    if (pkg in declared || !usedPkgs.has(pkg)) out.push({ kind: '허락 목록이 낡음', item: `undeclared: ${pkg}` })
  }
  for (const pkg of Object.keys(packageJson.dependencies ?? {})) {
    if (!shippedPkgs.has(pkg) && usedPkgs.has(pkg)) out.push({ kind: 'devDependencies로 옮길 패키지', item: pkg, note: '나눠 주는 프로그램이 가져가지 않음' })
  }
  for (const pkg of shippedPkgs) {
    if (pkg in (packageJson.devDependencies ?? {})) out.push({ kind: 'dependencies로 옮길 패키지', item: pkg, note: '나눠 주는 프로그램이 가져감(라이선스 전문에 들어가야 함)' })
  }

  // 정리 대기: 다른 작업과 겹친 자리. 찾은 것과 같으면 빼고, 이미 없어졌으면 낡았다고 알린다
  const pending = new Set(allow.pending)
  const rest = out.filter((f) => {
    const key = `${f.kind}: ${f.item}`
    if (!pending.has(key)) return true
    pending.delete(key)
    return false
  })
  for (const key of pending) rest.push({ kind: '허락 목록이 낡음', item: `pending: ${key}`, note: '이미 정리됨' })
  return rest
}

// ───────────────────────── 이 저장소 ─────────────────────────

/**
 * 허락 목록. 항목마다 왜 '쓰지 않는 것'이 아닌지 까닭을 적는다. 까닭을 댈 수 없으면 넣지 말고 지운다.
 * 쓰게 되었거나 없어진 항목은 검사가 '허락 목록이 낡음'으로 알린다.
 */
export const ALLOW = {
  /** 손으로 돌리는 스크립트(package.json, 워크플로, 훅이 부르지 않는다) */
  manualRoots: {
    'scripts/icon.mjs': 'Framo.exe의 아이콘(launch/framo.ico)을 홍보 페이지의 표시로 다시 만들 때 손으로 돌린다',
  },
  /** 시험만 쓰는 도우미 파일 */
  testHelpers: {
    'src/ai/secretDeck.ts': '비밀 심기 시험의 발표. share.test.ts와 mcp/server.test.ts가 같이 쓴다',
    'src/export/zipReader.ts': '내보낸 zip과 pptx를 다시 열어 보는 시험용 읽기',
    'src/slides/cssSource.ts': 'CSS를 @import까지 풀어 읽는 시험용 도구',
    'scripts/unused.mjs': '이 검사. unused.test.ts가 돌린다',
    'scripts/readSource.mjs': '이 검사의 소스 읽기. unused.mjs와 시험이 쓴다',
  },
  /** 소스로는 아무도 가져가지 않지만 바깥에서 쓰는 내보내기 */
  exports: {
    'server/serve.ts#main': 'Framo.exe(launch/framo-exe.cjs)가 빌드한 dist-node/serve.mjs를 불러 부른다',
    'server/serve.ts#CSP_META': 'scripts/pack.mjs가 빌드한 dist-node/serve.mjs에서 읽어 index.html의 CSP와 견준다',
  },
  /** package.json에 없어도 되는 패키지 */
  undeclared: {
    'playwright-core': '검수(ci.yml)의 윈도우 화면 점검에서만 --no-save로 받아 쓴다(scripts/ci-smoke.mjs)',
  },
  /** 찾은 것 가운데 잠시 두는 것. '종류: 항목' 꼴로, 찾은 것과 글자 그대로 맞춘다 */
  pending: [
    // 정리 대기: 다른 작업과 겹쳐 병합 뒤 지움 (부품, 모션, 화면, 자동 버전을 다른 작업이 고치는 중이었다)
    '파일 안에서만 쓰는 내보내기: src/deck/blocks/arrange.ts#NUMBER_TYPES',
    '파일 안에서만 쓰는 내보내기: src/deck/blocks/arrange.ts#arrangeCost',
    '파일 안에서만 쓰는 내보내기: src/deck/blocks/board.ts#Leaf',
    '파일 안에서만 쓰는 내보내기: src/deck/blocks/board.ts#Split',
    '파일 안에서만 쓰는 내보내기: src/deck/blocks/board.ts#overlaps',
    '시험에서만 쓰는 내보내기: src/deck/blocks/board.ts#moveBlock',
    '시험에서만 쓰는 내보내기: src/deck/blocks/board.ts#isStacked',
    '파일 안에서만 쓰는 내보내기: src/deck/blocks/catalog.ts#LAYOUT_BLOCKS',
    '파일 안에서만 쓰는 내보내기: src/deck/blocks/cells.ts#BlockMissing',
    '파일 안에서만 쓰는 내보내기: src/deck/blocks/links.ts#blockIsBlank',
    '파일 안에서만 쓰는 내보내기: src/deck/blocks/place.ts#spotTarget',
    '파일 안에서만 쓰는 내보내기: src/deck/blocks/place.ts#BOTTOM',
    '파일 안에서만 쓰는 내보내기: src/deck/blocks/place.ts#slotRect',
    '파일 안에서만 쓰는 내보내기: src/deck/blocks/saved.ts#savedName',
    '파일 안에서만 쓰는 내보내기: src/deck/blocks/sizing.ts#NO_FIT',
    '파일 안에서만 쓰는 내보내기: src/deck/blocks/sizing.ts#rowPitch',
    '시험에서만 쓰는 내보내기: src/deck/blocks/sizing.ts#fitsWith',
    '파일 안에서만 쓰는 내보내기: src/motion/engine.ts#PlayOptions',
    '파일 안에서만 쓰는 내보내기: src/motion/engine.ts#MotionEngine',
    '파일 안에서만 쓰는 내보내기: src/screens/Present.tsx#BarRoom',
    '파일 안에서만 쓰는 내보내기: src/screens/assembly.ts#clipped',
    '파일 안에서만 쓰는 내보내기: src/screens/comboChecks.ts#InnerOptions',
    '파일 안에서만 쓰는 내보내기: src/screens/combos.ts#Combo',
    '파일 안에서만 쓰는 내보내기: src/screens/editor/BlockEditor.tsx#LibraryView',
    '파일 안에서만 쓰는 내보내기: src/screens/editor/Inspector.tsx#LayoutChoice',
    '파일 안에서만 쓰는 내보내기: src/screens/editor/planDrop.ts#DropPlan',
    '파일 안에서만 쓰는 내보내기: src/screens/editor/planDrop.ts#DropAt',
    '파일 안에서만 쓰는 내보내기: src/screens/editor/presentLaunch.tsx#PresentLaunch',
    '파일 안에서만 쓰는 내보내기: src/screens/editor/presentLaunch.tsx#CheckRow',
    '파일 안에서만 쓰는 내보내기: src/screens/editor/studio/Timeline.tsx#ClickIcon',
    '파일 안에서만 쓰는 내보내기: src/screens/editor/studio/player.ts#Plan',
    '파일 안에서만 쓰는 내보내기: src/screens/measureBlocks.ts#SPANS',
    '파일 안에서만 쓰는 내보내기: src/screens/measureBlocks.ts#measuredWidth',
    '파일 안에서만 쓰는 내보내기: src/screens/measureBlocks.ts#HeightTable',
    '파일 안에서만 쓰는 내보내기: src/screens/stress.ts#StressRow',
    '쓰지 않는 내보내기: src/screens/ui.tsx#BookmarkIcon',
    '쓰지 않는 내보내기: src/screens/ui.tsx#EyeIcon',
    '파일 안에서만 쓰는 내보내기: src/screens/ui.tsx#SegmentOption',
    '파일 안에서만 쓰는 내보내기: src/slides/blocks/Adoption.tsx#ROGERS',
    '파일 안에서만 쓰는 내보내기: src/slides/blocks/Adoption.tsx#ADOPT_W',
    '파일 안에서만 쓰는 내보내기: src/slides/blocks/Adoption.tsx#ADOPT_H',
    '파일 안에서만 쓰는 내보내기: src/slides/blocks/Adoption.tsx#CUMULATIVE',
    '파일 안에서만 쓰는 내보내기: src/slides/blocks/Cycle.tsx#CycleSide',
    '파일 안에서만 쓰는 내보내기: src/slides/blocks/Cycle.tsx#CycleSpot',
    '파일 안에서만 쓰는 내보내기: src/slides/blocks/Flow.tsx#flowHighlight',
    '파일 안에서만 쓰는 내보내기: src/slides/blocks/Gate.tsx#gateDrop',
    '파일 안에서만 쓰는 내보내기: src/slides/blocks/Hub.tsx#HUB_W',
    '파일 안에서만 쓰는 내보내기: src/slides/blocks/Hub.tsx#HUB_H',
    '파일 안에서만 쓰는 내보내기: src/slides/blocks/Hub.tsx#HubSpot',
    '파일 안에서만 쓰는 내보내기: src/slides/blocks/Hub.tsx#hubSpots',
    '파일 안에서만 쓰는 내보내기: src/slides/blocks/Network.tsx#networkSpots',
    '시험에서만 쓰는 내보내기: src/slides/blocks/Spark.tsx#seriesOf',
    '파일 안에서만 쓰는 내보내기: src/slides/blocks/Split.tsx#splitNeed',
    '파일 안에서만 쓰는 내보내기: src/slides/blocks/Spread.tsx#SPREAD_N',
    '파일 안에서만 쓰는 내보내기: src/slides/blocks/Spread.tsx#SPREAD_COLS',
    '파일 안에서만 쓰는 내보내기: src/slides/blocks/Spread.tsx#spreadShare',
    '파일 안에서만 쓰는 내보내기: src/slides/blocks/Spread.tsx#SPREAD_ORDER',
    '파일 안에서만 쓰는 내보내기: src/slides/blocks/Spread.tsx#SPREAD_TILT',
    '파일 안에서만 쓰는 내보내기: src/slides/blocks/Spread.tsx#spreadStops',
    '파일 안에서만 쓰는 내보내기: src/slides/blocks/Stack.tsx#partsOf',
    '파일 안에서만 쓰는 내보내기: src/slides/blocks/Steps.tsx#stepsHighlight',
    '파일 안에서만 쓰는 내보내기: src/slides/blocks/Tiles.tsx#tileGrid',
    '파일 안에서만 쓰는 내보내기: src/store/versions.ts#VersionChanges',
  ],
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
// .claude/는 Claude Code 하네스(훅). 그 안의 worktrees/는 에이전트마다의 작업 폴더라 보지 않는다
const SCAN = ['src', 'server', 'mcp', 'scripts', 'launch', '.claude']
const ROOT_FILES = ['index.html', 'vite.config.ts', 'vite.node.config.ts']
const SKIP_DIRS = new Set(['node_modules', '__snapshots__', 'fixtures', '.claude/worktrees'])

/**
 * 저장소를 읽어 Project로. 시작 파일은 index.html, 두 Vite 설정과 서버 빌드의 입력(vite.node.config.ts에 적힌 경로),
 * package.json의 scripts, 워크플로, Claude Code 훅(.claude/settings.json)이 node로 돌리는 파일, .d.ts,
 * 그리고 손으로 돌리는 것(manualRoots)이다
 * @param {Partial<NonNullable<Project['allow']>> & { manualRoots?: Record<string, string> }} allow
 * @param {string} [root]
 * @returns {Project}
 */
export function loadProject(allow, root = ROOT) {
  /** @type {Map<string, string | null>} */
  const files = new Map()
  const walk = (/** @type {string} */ dir) => {
    if (!existsSync(join(root, dir))) return
    for (const e of readdirSync(join(root, dir), { withFileTypes: true })) {
      const path = `${dir}/${e.name}`
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name) && !SKIP_DIRS.has(path)) walk(path)
      } else if (SCRIPT.test(e.name) || /\.(css|html)$/.test(e.name)) files.set(path, readFileSync(join(root, path), 'utf8'))
      else if (dir.startsWith('launch')) files.set(path, null)
    }
  }
  SCAN.forEach(walk)
  for (const f of ROOT_FILES) files.set(f, readFileSync(join(root, f), 'utf8'))

  const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  /** @type {Record<string, string>} */
  const roots = { 'index.html': '화면(브라우저 앱)', 'vite.config.ts': 'Vite, Vitest 설정', 'vite.node.config.ts': '로컬 서버, MCP 서버 빌드 설정' }
  // node로 돌리는 파일만 센다(워크플로의 paths: 같은 곳에 적힌 이름은 돌리는 것이 아니다)
  const scriptPath = /\bnode\s+["']?(?:\$\{?\w+\}?\/)?((?:scripts|launch|server|mcp|src|\.claude)\/[\w./-]+\.(?:mjs|cjs|js|ts))/g
  for (const [name, command] of Object.entries(packageJson.scripts ?? {})) {
    for (const m of /** @type {string} */ (command).matchAll(scriptPath)) roots[m[1]] = `package.json의 npm run ${name}`
  }
  const workflows = join(root, '.github', 'workflows')
  for (const name of existsSync(workflows) ? readdirSync(workflows) : []) {
    const yml = readFileSync(join(workflows, name), 'utf8').replace(/(^|\s)#.*$/gm, '$1')
    for (const m of yml.matchAll(scriptPath)) roots[m[1]] ??= `.github/workflows/${name}`
  }
  // Claude Code가 부르는 훅(.claude/settings.json의 command)
  const settings = join(root, '.claude', 'settings.json')
  const commands = (/** @type {unknown} */ v) => (typeof v === 'string' ? [v] : v && typeof v === 'object' ? Object.values(v).flatMap(commands) : [])
  for (const command of existsSync(settings) ? commands(JSON.parse(readFileSync(settings, 'utf8')).hooks) : []) {
    for (const m of command.matchAll(scriptPath)) roots[m[1]] ??= '.claude/settings.json의 훅'
  }
  for (const f of files.keys()) if (f.endsWith('.d.ts')) roots[f] = 'tsconfig가 늘 읽는 형 선언'
  Object.assign(roots, allow.manualRoots)

  /** @type {Record<string, string>} */
  const bins = {}
  for (const pkg of Object.keys({ ...packageJson.dependencies, ...packageJson.devDependencies })) {
    const file = join(root, 'node_modules', pkg, 'package.json')
    if (!existsSync(file)) continue
    const { bin } = JSON.parse(readFileSync(file, 'utf8'))
    if (typeof bin === 'string') bins[posix.basename(pkg)] = pkg
    else for (const b of Object.keys(bin ?? {})) bins[b] = pkg
  }
  const tsTypes = readdirSync(root)
    .filter((f) => /^tsconfig.*\.json$/.test(f))
    .flatMap((f) => JSON.parse(readFileSync(join(root, f), 'utf8')).compilerOptions?.types ?? [])

  // 나눠 주는 것: 화면과 서버 빌드의 입력. 여기서 닿는 패키지만 dependencies에 둔다(licenses.mjs가 그것만 배포본의 라이선스 전문에 넣는다)
  const html = readHtml(/** @type {string} */ (files.get('index.html')))
  const nodeInputs = [.../** @type {string} */ (files.get('vite.node.config.ts')).matchAll(/'((?:server|mcp)\/[\w/.-]+\.ts)'/g)].map((m) => m[1])
  for (const f of nodeInputs) roots[f] = '로컬 서버, MCP 서버 빌드의 입력(vite.node.config.ts)'
  const shipRoots = [...html.refs.map((r) => r.spec.slice(1)), ...nodeInputs]

  const { manualRoots: _, ...rest } = allow
  return { files, packageJson, roots, shipRoots, bins, tsTypes, allow: rest }
}

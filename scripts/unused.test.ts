// 쓰지 않는 파일, 내보내기, 패키지가 없는지 본다(scripts/unused.mjs, docs/ARCHITECTURE.md '쓰지 않는 것 찾기').
// 걸리면 정말 쓰지 않는 것은 지우고(파일 안에서만 쓰는 것은 export만 뗀다), 바깥에서 쓰는 것이면 unused.mjs의 ALLOW에
// 까닭과 함께 넣는다. 검사가 소리 없이 통과하지 않게 판단을 작은 예로 시험한다(소스 읽기는 readSource.test.ts).

import { describe, expect, it } from 'vitest'
import { ALLOW, analyze, loadProject } from './unused.mjs'

describe('판단', () => {
  const base = {
    'src/main.ts': "import { used } from './lib'\nimport './style.css'\nimport { fromBarrel } from './barrel'\nimport React from 'react'\nused(fromBarrel, React)",
    'src/lib.ts': [
      'export function used() { return helper() }',
      'export function helper() { return 1 }',
      'export function dead() {}',
      'export function onlyTested() {}',
      'export function testedAndLocal() {}',
      'testedAndLocal()',
    ].join('\n'),
    'src/barrel.ts': "export * from './parts'",
    'src/parts.ts': 'export const fromBarrel = 1\nexport const notFromBarrel = 2',
    'src/style.css': "@import './base.css';",
    'src/base.css': 'body {}',
    'src/orphan.css': 'a {}',
    'src/orphan.ts': 'export const x = 1',
    'src/helper.ts': 'export const h = 1',
    'src/lib.test.ts': "import { onlyTested, testedAndLocal } from './lib'\nimport { h } from './helper'\nimport { it } from 'vitest'",
  }
  const project = (files: Record<string, string | null>, more = {}) => ({
    files: new Map(Object.entries(files)),
    packageJson: { scripts: { test: 'vitest run' }, dependencies: { react: '1' }, devDependencies: { vitest: '1', '@types/react': '1', 'left-pad': '1' } },
    roots: { 'src/main.ts': '시작' },
    shipRoots: ['src/main.ts'],
    bins: { vitest: 'vitest' },
    tsTypes: [],
    ...more,
  })
  const run = (p: Parameters<typeof analyze>[0]) => analyze(p).map((f) => `${f.kind}: ${f.item}`).sort()

  it('쓰지 않는 파일, 시험에서만 쓰는 파일, 쓰지 않는 내보내기와 패키지를 찾는다', () => {
    expect(run(project(base))).toEqual(
      [
        '쓰지 않는 파일: src/orphan.css',
        '쓰지 않는 파일: src/orphan.ts',
        '시험에서만 쓰는 파일: src/helper.ts',
        '파일 안에서만 쓰는 내보내기: src/lib.ts#helper',
        '쓰지 않는 내보내기: src/lib.ts#dead',
        '시험에서만 쓰는 내보내기: src/lib.ts#onlyTested',
        '쓰지 않는 내보내기: src/parts.ts#notFromBarrel',
        '쓰지 않는 패키지: left-pad',
      ].sort(),
    )
  })

  it('허락 목록과 정리 대기는 찾은 것을 거르고, 낡으면 알린다', () => {
    const allow = {
      testHelpers: { 'src/helper.ts': '시험 도우미', 'src/main.ts': '낡음' },
      exports: { 'src/lib.ts#dead': '바깥에서 부름', 'src/lib.ts#used': '낡음', 'src/lib.ts#gone': '낡음' },
      pending: ['쓰지 않는 패키지: left-pad', '쓰지 않는 파일: src/fixed.ts'],
    }
    const found = run(project(base, { allow }))
    expect(found).not.toContain('시험에서만 쓰는 파일: src/helper.ts')
    expect(found).not.toContain('쓰지 않는 내보내기: src/lib.ts#dead')
    expect(found).not.toContain('쓰지 않는 패키지: left-pad')
    expect(found.filter((f) => f.startsWith('허락 목록이 낡음'))).toEqual(
      [
        '허락 목록이 낡음: testHelpers: src/main.ts',
        '허락 목록이 낡음: exports: src/lib.ts#used',
        '허락 목록이 낡음: exports: src/lib.ts#gone',
        '허락 목록이 낡음: pending: 쓰지 않는 파일: src/fixed.ts',
      ].sort(),
    )
  })

  it('패키지: 나눠 주는 쪽이 가져가면 dependencies, 아니면 devDependencies. 없는 패키지와 못 찾은 파일도 알린다', () => {
    const files = {
      'src/main.ts': "import 'idb-keyval'\nimport type { X } from 'vitest'\nimport { readFileSync } from 'node:fs'\nimport './font.css'\nimport './nope'",
      'src/font.css': "@font-face { src: url('@fontsource/x/a.woff2') }",
      'scripts/build.mjs': "import { create } from 'zustand'\nimport _ from 'lodash'",
    }
    const found = run({
      files: new Map(Object.entries(files)),
      packageJson: { dependencies: { zustand: '1', '@fontsource/x': '1' }, devDependencies: { 'idb-keyval': '1', vitest: '1', '@types/node': '1', typescript: '1' }, scripts: { typecheck: 'tsc --noEmit' } },
      roots: { 'src/main.ts': '시작', 'scripts/build.mjs': '빌드' },
      shipRoots: ['src/main.ts'],
      bins: { tsc: 'typescript' },
      tsTypes: ['node'],
    })
    expect(found).toEqual(
      [
        '찾지 못한 파일: src/main.ts:5 ./nope',
        'package.json에 없는 패키지: lodash',
        'devDependencies로 옮길 패키지: zustand',
        'dependencies로 옮길 패키지: idb-keyval',
      ].sort(),
    )
  })
})

describe('이 저장소', () => {
  const project = loadProject(ALLOW)

  it('시작 파일을 찾고 소스를 모두 읽는다 (에이전트의 작업 폴더는 빼고)', () => {
    expect(project.files.size).toBeGreaterThan(300)
    for (const f of ['index.html', 'vite.config.ts', 'server/serve.ts', 'mcp/server.ts', 'scripts/pack.mjs', 'scripts/look.mjs', '.claude/hooks/guard-commit.mjs']) {
      expect(project.roots, f).toHaveProperty([f])
    }
    expect(project.shipRoots).toEqual(expect.arrayContaining(['src/main.tsx', 'server/serve.ts', 'mcp/server.ts']))
    expect([...project.files.keys()].filter((f) => f.startsWith('.claude/worktrees/'))).toEqual([])
    expect(project.bins).toMatchObject({ tsc: 'typescript', vite: 'vite', vitest: 'vitest' })
  })

  it('쓰지 않는 파일, 내보내기, 패키지가 없다', () => {
    expect(analyze(project).map((f) => `${f.kind}: ${f.item}${f.note ? ` (${f.note})` : ''}`)).toEqual([])
  })
})

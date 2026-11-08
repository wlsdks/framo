// 소스 읽기(scripts/readSource.mjs)가 import, export, 쓰인 낱말을 바르게 읽는지 본다. 잘못 읽으면 쓰지 않는 것 찾기가
// 쓰는 것을 못 보거나(소리 없이 통과) 없는 것을 본다. 작은 예로 꼴마다 시험하고, 저장소의 모든 소스를 Vite의 파서와 견준다.

import { parseSync } from 'vite'
import { describe, expect, it } from 'vitest'
import { readCss, readScript, tokenize } from './readSource.mjs'
import { ALLOW, loadProject } from './unused.mjs'

const specs = (code: string, jsx = false) => readScript(code, { jsx }).refs.map((r) => r.spec)
const namesOf = (code: string, spec: string) => readScript(code).refs.find((r) => r.spec === spec)?.names

describe('낱말 읽기', () => {
  it('주석, 문자열, 템플릿 안의 import와 export는 읽지 않는다', () => {
    const code = [
      "// import a from './no1'",
      '/* export const no = 1 */',
      'const s = "import b from \'./no2\'"',
      'const t = `export const x = ${y}`',
      "import { real } from './yes'",
    ].join('\n')
    expect(specs(code)).toEqual(['./yes'])
    expect(readScript(code).exports).toEqual([])
  })

  it('정규식 안의 따옴표와 /를 문자열이나 주석으로 읽지 않는다. 나누기는 정규식이 아니다', () => {
    const code = ["const re = /['\"`]\\/[a-z/]+/g", 'export const after = 1', 'const d = a / b / c', "if (x) /'/.test(s)", 'export const z = 2'].join('\n')
    expect(readScript(code).exports.map((e) => e.name)).toEqual(['after', 'z'])
  })

  it('템플릿의 ${…} 안은 코드로 읽는다', () => {
    const code = "const s = `a${import('./dyn').then((m) => m.A)}b${`${c}`}`\nexport const after = 1"
    expect(namesOf(code, './dyn')).toEqual(['A'])
    expect(readScript(code).exports.map((e) => e.name)).toEqual(['after'])
  })

  it("JSX 안의 글(Don't, //)은 건너뛰고, 태그 이름은 쓴 것으로 센다", () => {
    const code = [
      "import { Card } from './card'",
      'export const Page = () => (',
      '  <div className="it\'s" data-x={a > b}>',
      "    Don't stop // here {count > 1 ? <Card.Head /> : null} <>{/* 주석 */}</>",
      '  </div>',
      ')',
      'const f = <T,>(x: T) => x',
      'export const after = useState<number>(0) < 2',
    ].join('\n')
    const mod = readScript(code, { jsx: true })
    expect(mod.uses.get('Card')).toBe(1)
    expect(mod.uses.get('count')).toBe(1)
    expect(mod.uses.has('stop')).toBe(false)
    expect(mod.exports.map((e) => e.name)).toEqual(['Page', 'after'])
  })

  it('/// <reference types>는 형으로 쓰는 패키지다', () => {
    expect(tokenize('/// <reference types="vitest/config" />\nconst a = 1').referenceTypes).toEqual(['vitest/config'])
  })
})

describe('import와 export의 꼴', () => {
  it('정적 import에서 가져오는 이름', () => {
    const code = "import d, { a, b as c, type T } from './m'\nimport type { U } from './t'\nimport './side.css'"
    const refs = readScript(code).refs
    expect(refs.map((r) => [r.spec, r.names, r.typeOnly])).toEqual([
      ['./m', ['default', 'a', 'b', 'T'], false],
      ['./t', ['U'], true],
      ['./side.css', [], false],
    ])
  })

  it('모듈을 통째로 받으면 ns.이름으로 쓴 것만, 통째로 넘기면 모두 쓴 것이다', () => {
    expect(namesOf("import * as ns from './ns'\nns.x()\nconst y = ns.y", './ns')).toEqual(['x', 'y'])
    expect(namesOf("import * as all from './all'\nspy(all, 'x')", './all')).toEqual(['*'])
  })

  it('동적 가져오기에서 꺼내 쓰는 이름', () => {
    expect(namesOf("const { p, q: r } = await import('./d1')", './d1')).toEqual(['p', 'q'])
    expect(namesOf("const mod = await import('./d2')\nmod.z()", './d2')).toEqual(['z'])
    expect(namesOf("const w = (await import('./d3')).w", './d3')).toEqual(['w'])
    expect(namesOf("lazy(() => import('./d4').then((m) => ({ default: m.Page })))", './d4')).toEqual(['Page'])
    expect(namesOf("const { h } = (await server.ssrLoadModule('/x.ts')) as typeof import('./x')", '/x.ts')).toEqual(['h'])
    expect(namesOf("register(import('./d5'))", './d5')).toEqual(['*'])
    const refs = readScript("type M = typeof import('./t2')\nconst css = new URL('./a.css', import.meta.url)").refs
    expect(refs.map((r) => [r.spec, r.names, r.typeOnly])).toEqual([
      ['./t2', [], true],
      ['./a.css', [], false],
    ])
  })

  it('export의 여러 꼴', () => {
    const code = [
      'export function f() {}',
      'export async function g() {}',
      'export const h = 1',
      'export class C {}',
      'export abstract class AC {}',
      'export interface I {}',
      'export type T = 1',
      'export enum E { A }',
      'export const enum CE { A }',
      'export default function main() {}',
      'const l = 1',
      'export { l as m }',
      "export { n } from './n'",
      "export type { O } from './o'",
      "export * from './star'",
    ].join('\n')
    const mod = readScript(code)
    expect(mod.exports.map((e) => e.name)).toEqual(['f', 'g', 'h', 'C', 'AC', 'I', 'T', 'E', 'CE', 'default', 'm', 'n', 'O'])
    expect(mod.exports.find((e) => e.name === 'default')?.local).toBe('main')
    expect(mod.exports.find((e) => e.name === 'm')?.local).toBe('l')
    expect(mod.exports.find((e) => e.name === 'n')).toMatchObject({ from: './n', imported: 'n', local: null })
    expect(mod.stars.map((s) => s.spec)).toEqual(['./star'])
  })

  it('가져온 이름을 export { }로 내보내면 다시 내보내기다(이 파일에서 써도 내보낼 까닭이 아니다)', () => {
    const mod = readScript("import { a as b } from './a'\nexport { b }\nuse(b)")
    expect(mod.exports).toEqual([{ name: 'b', local: null, line: 2, from: './a', imported: 'a' }])
  })

  it('파일 안에서 쓴 수: 열쇠, 속성 이름, 이름 붙인 함수식은 세지 않는다', () => {
    const code = [
      'export const used = 1',
      'export const key = 2',
      'export const prop = 3',
      'export const Named = memo(function Named() {})',
      'interface X {',
      '  a: string',
      '  key: number',
      '}',
      'const o = { key: 1, prop }',
      'o.key',
      'f(used ? used : 0)',
    ].join('\n')
    const { uses } = readScript(code)
    expect([uses.get('used'), uses.get('key'), uses.get('prop'), uses.get('Named')]).toEqual([2, undefined, 1, undefined])
  })

  it('CSS의 @import와 url(), 주석 안은 빼고', () => {
    const css = "/* @import './no.css'; */\n@import './a.css';\n@font-face { src: url('@pkg/font/a.woff2') }\n.x { background: url(data:image/png;base64,AA) }"
    expect(readCss(css).refs.map((r) => r.spec)).toEqual(['./a.css', '@pkg/font/a.woff2'])
  })
})

describe('이 저장소의 소스', () => {
  const project = loadProject(ALLOW)

  it('낱말 읽기가 Vite의 파서(oxc)와 같은 import, export를 읽는다', () => {
    // 손으로 짠 낱말 읽기가 새 꼴의 코드(JSX의 글, 정규식 같은)에서 어긋나면 쓰는 것을 못 보거나 없는 것을 본다.
    // 이 저장소의 모든 소스에서 Vite의 파서가 읽은 import와 export를 이 검사도 모두 읽는지 견준다
    const wrong: string[] = []
    for (const [file, text] of project.files) {
      if (text === null || !/\.(ts|tsx|mjs|cjs|js)$/.test(file)) continue
      const lang = file.endsWith('.tsx') ? 'tsx' : file.endsWith('.ts') ? 'ts' : 'js'
      const { module, errors } = parseSync(file, text, { lang, sourceType: 'module' })
      if (errors.length) {
        wrong.push(`${file}: Vite의 파서가 읽지 못함`)
        continue
      }
      const mine = readScript(text, { jsx: lang === 'tsx' })
      const mySpecs = new Set(mine.refs.map((r) => r.spec))
      const literal = (start: number, end: number) => /^(['"])(.*)\1$/.exec(text.slice(start, end))?.[2]
      const theirSpecs = [
        ...module.staticImports.map((s) => s.moduleRequest.value),
        ...module.staticExports.flatMap((s) => s.entries.flatMap((e) => (e.moduleRequest ? [e.moduleRequest.value] : []))),
        ...module.dynamicImports.flatMap((d) => literal(d.moduleRequest.start, d.moduleRequest.end) ?? []),
      ]
      for (const s of theirSpecs) if (!mySpecs.has(s)) wrong.push(`${file}: ${s}를 가져오는 것을 못 읽음`)
      const theirExports = module.staticExports
        .flatMap((s) => s.entries)
        .filter((e) => !(e.importName.kind === 'AllButDefault' && e.exportName.kind === 'None'))
        .map((e) => (e.exportName.kind === 'Default' ? 'default' : e.exportName.name))
      expect.soft(new Set(mine.exports.map((e) => e.name)), `${file}의 export`).toEqual(new Set(theirExports))
      for (const s of module.staticImports) {
        if (s.entries.some((e) => e.importName.kind === 'NamespaceObject')) continue
        const theirs = s.entries.map((e) => (e.importName.kind === 'Default' ? 'default' : e.importName.name)).sort()
        const ok = mine.refs.some((r) => r.spec === s.moduleRequest.value && [...r.names].sort().join() === theirs.join())
        if (!ok) wrong.push(`${file}: ${s.moduleRequest.value}에서 가져오는 이름이 다름 (${theirs.join(', ')})`)
      }
    }
    expect(wrong).toEqual([])
  })
})

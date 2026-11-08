// 소스 파일을 낱말(토큰)로 나눠 가져오는 것, 내보내는 것, 낱말이 쓰인 곳을 읽는다. 쓰지 않는 것 찾기(unused.mjs)가 쓴다.
//
// TypeScript 7(네이티브)에는 JavaScript로 부르는 컴파일러 API가 없어서 직접 읽는다. 주석, 문자열, 템플릿, 정규식, JSX의 글을
// 걸러 낸 낱말에서 import/export 문만 본다. 손으로 짠 읽기라 새 꼴의 코드에서 어긋날 수 있어서, readSource.test.ts가
// 작은 예로 시험하고 저장소의 모든 소스에서 Vite의 파서(oxc)가 읽은 것과 견준다.

// ───────────────────────── 낱말로 나누기 ─────────────────────────

/** @typedef {{ type: 'id' | 'str' | 'tpl' | 'num' | 'regex' | 'punc' | 'jsx', value: string, line: number, control?: boolean }} Token */

// 정규식(/…/)이 올 수 있는 자리를 앞 낱말로 가린다. 이 낱말 뒤의 /는 나누기가 아니다
const BEFORE_EXPR = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await'])
// 이 뒤의 <는 JSX가 시작하는 자리다(비교나 형 인자가 아니다)
const BEFORE_JSX = new Set(['(', ',', '=', ':', '?', '[', '{', ';', '!', '&', '|', '=>', 'return', 'default', 'yield', 'await', 'case', 'else'])
const ID_START = /[A-Za-z_$#\u0080-\uffff]/
const ID_PART = /[\w$\u0080-\uffff]/

/**
 * 소스를 낱말로 나눈다. 주석과 JSX 안의 글은 버리고, 문자열은 값으로, JSX 태그 이름은 낱말로 남긴다(<Gallery />도 쓴 것이다).
 * @param {string} text
 * @param {{ jsx?: boolean }} [options]
 * @returns {{ tokens: Token[], referenceTypes: string[] }}
 */
export function tokenize(text, { jsx = false } = {}) {
  /** @type {Token[]} */
  const tokens = []
  /** @type {string[]} */
  const referenceTypes = []
  let i = 0
  let line = 1
  const n = text.length
  /** @param {Token['type']} type @param {string} value */
  const push = (type, value) => tokens.push({ type, value, line })
  const prev = () => tokens[tokens.length - 1]
  /** 여는 (마다 if, while, for의 조건인지. 그 조건을 닫는 ) 뒤의 /는 정규식이다: if (x) /a/.test(s) */
  const parens = /** @type {boolean[]} */ ([])
  const advance = (/** @type {number} */ to) => {
    for (; i < to; i++) if (text[i] === '\n') line++
  }

  const regexAllowed = () => {
    const p = prev()
    if (!p) return true
    if (p.type === 'id') return BEFORE_EXPR.has(p.value)
    if (p.type === 'punc') return p.control === true || !(p.value === ')' || p.value === ']' || p.value === '}')
    return false
  }

  const jsxAllowed = () => {
    if (!jsx) return false
    const p = prev()
    if (p && !((p.type === 'punc' || p.type === 'id') && BEFORE_JSX.has(p.value))) return false
    // <T,>(x) => … 와 <T extends …>는 형 인자다
    if (/^<\s*[A-Za-z_$][\w$]*\s*(,|extends\b)/.test(text.slice(i, i + 80))) return false
    return /[A-Za-z_$>]/.test(text[i + 1] ?? '')
  }

  const skipString = (/** @type {string} */ quote) => {
    let j = i + 1
    let value = ''
    while (j < n && text[j] !== quote) {
      if (text[j] === '\\') {
        value += text[j + 1] ?? ''
        j += 2
      } else value += text[j++]
    }
    advance(j + 1)
    return value
  }

  const skipComment = () => {
    if (text[i + 1] === '/') {
      let j = text.indexOf('\n', i)
      if (j < 0) j = n
      const ref = /^\/\/\/\s*<reference\s+types=["']([^"']+)["']/.exec(text.slice(i, j))
      if (ref) referenceTypes.push(ref[1])
      advance(j)
    } else {
      const j = text.indexOf('*/', i + 2)
      advance(j < 0 ? n : j + 2)
    }
  }

  const skipRegex = () => {
    let j = i + 1
    let inClass = false
    while (j < n) {
      const c = text[j]
      if (c === '\n' || c === '\r') return false
      if (c === '\\') j += 2
      else {
        if (c === '[') inClass = true
        else if (c === ']') inClass = false
        else if (c === '/' && !inClass) break
        j++
      }
    }
    j++
    while (j < n && /[a-z]/.test(text[j])) j++
    push('regex', text.slice(i, j))
    advance(j)
    return true
  }

  /** 템플릿 문자열. ${…} 안은 코드로 읽는다 */
  const scanTemplate = () => {
    advance(i + 1)
    let part = ''
    while (i < n) {
      const c = text[i]
      if (c === '\\') {
        part += text[i + 1] ?? ''
        advance(i + 2)
      } else if (c === '`') {
        advance(i + 1)
        break
      } else if (c === '$' && text[i + 1] === '{') {
        push('tpl', part)
        part = ''
        advance(i + 2)
        scanCode('}')
      } else {
        part += c
        advance(i + 1)
      }
    }
    push('tpl', part)
  }

  const skipSpace = () => {
    while (i < n) {
      if (/\s/.test(text[i])) advance(i + 1)
      else if (text[i] === '/' && (text[i + 1] === '/' || text[i + 1] === '*')) skipComment()
      else break
    }
  }

  /** JSX 요소 하나(<로 시작). 태그 이름은 낱말로, 속성의 {…}는 코드로, 안의 글은 버린다 */
  const scanJsx = () => {
    advance(i + 1)
    skipSpace()
    if (text[i] === '>') {
      advance(i + 1)
      scanJsxChildren()
      return
    }
    const name = /^[A-Za-z_$][\w$.:-]*/.exec(text.slice(i))?.[0] ?? ''
    const [head, ...rest] = name.split('.')
    if (head) push('id', head)
    for (const r of rest) push('punc', '.'), push('id', r)
    advance(i + name.length)
    while (i < n) {
      skipSpace()
      if (text.startsWith('/>', i)) {
        advance(i + 2)
        break
      }
      if (text[i] === '>') {
        advance(i + 1)
        scanJsxChildren()
        break
      }
      if (text[i] === '{') {
        advance(i + 1)
        scanCode('}')
        continue
      }
      const attr = /^[\w$:-]+/.exec(text.slice(i))?.[0]
      if (!attr) {
        advance(i + 1)
        continue
      }
      advance(i + attr.length)
      skipSpace()
      if (text[i] !== '=') continue
      advance(i + 1)
      skipSpace()
      if (text[i] === '"' || text[i] === "'") skipString(text[i])
      else if (text[i] === '{') {
        advance(i + 1)
        scanCode('}')
      } else if (text[i] === '<') scanJsx()
    }
    push('jsx', '') // 요소 하나가 끝났다: 뒤의 /는 나누기, <는 비교다
  }

  const scanJsxChildren = () => {
    while (i < n) {
      const c = text[i]
      if (c === '{') {
        advance(i + 1)
        scanCode('}')
      } else if (c === '<') {
        if (text[i + 1] === '/') {
          const j = text.indexOf('>', i)
          advance(j < 0 ? n : j + 1)
          return
        }
        scanJsx()
      } else advance(i + 1)
    }
  }

  /** 코드. end('}')를 만나면(제 짝이 아닌) 멈춘다: 템플릿의 ${…}, JSX의 {…} */
  const scanCode = (/** @type {string | null} */ end) => {
    let depth = 0
    while (i < n) {
      const c = text[i]
      if (/\s/.test(c)) advance(i + 1)
      else if (c === '/' && (text[i + 1] === '/' || text[i + 1] === '*')) skipComment()
      else if (c === '"' || c === "'") push('str', skipString(c))
      else if (c === '`') scanTemplate()
      else if (c === '/' && regexAllowed() && skipRegex()) continue
      else if (c === '<' && jsxAllowed()) scanJsx()
      else if (ID_START.test(c)) {
        let j = i + 1
        while (j < n && ID_PART.test(text[j])) j++
        push('id', text.slice(i, j))
        advance(j)
      } else if (/\d/.test(c) || (c === '.' && /\d/.test(text[i + 1] ?? ''))) {
        let j = i + 1
        while (j < n && /[\w.]/.test(text[j])) j++
        push('num', text.slice(i, j))
        advance(j)
      } else {
        const three = text.slice(i, i + 3)
        const two = text.slice(i, i + 2)
        const op = three === '...' ? three : two === '=>' || (two === '?.' && !/\d/.test(text[i + 2] ?? '')) ? two : c
        if (op === '{') depth++
        if (op === '}') {
          if (depth === 0 && end === '}') {
            advance(i + 1)
            return
          }
          depth--
        }
        if (op === '(') parens.push(['if', 'while', 'for', 'with'].includes(prev()?.value ?? ''))
        const control = op === ')' && parens.pop() === true
        push('punc', op === '?.' ? '.' : op)
        if (control) tokens[tokens.length - 1].control = true
        advance(i + op.length)
      }
    }
  }

  scanCode(null)
  return { tokens, referenceTypes }
}

// ───────────────────────── 모듈 하나 읽기 ─────────────────────────

/**
 * @typedef {{ spec: string, line: number, names: string[], typeOnly: boolean }} Ref
 *   이 파일이 가리키는 것. names: 가져다 쓰는 이름('default' 포함). 빈 목록은 이름 없이 파일만(부수 효과, CSS, 읽기),
 *   ['*']는 무엇을 쓸지 몰라 모두 쓴 것으로 본다.
 * @typedef {{ name: string, local: string | null, line: number, from: string | null, imported: string | null }} Export
 *   from이 있으면 다시 내보내기(export { a as b } from './x'): imported는 그 파일에서의 이름
 * @typedef {{ refs: Ref[], exports: Export[], stars: { spec: string, line: number }[], uses: Map<string, number>, strings: Set<string> }} Module
 */

const DECL_SKIP = new Set(['declare', 'abstract', 'async', 'const'])

/**
 * TS, JS, TSX를 읽어 가져오는 것, 내보내는 것, 낱말이 쓰인 수를 낸다.
 * @param {string} text
 * @param {{ jsx?: boolean }} [options]
 * @returns {Module}
 */
export function readScript(text, options) {
  const { tokens, referenceTypes } = tokenize(text, options)
  /** @type {Ref[]} */
  const refs = referenceTypes.map((spec) => ({ spec, line: 1, names: [], typeOnly: true }))
  /** @type {Export[]} */
  const exports = []
  /** @type {{ spec: string, line: number }[]} */
  const stars = []
  /** 쓴 곳으로 세지 않을 낱말(가져오기·내보내기 문, 선언한 이름) */
  const skip = new Set()
  /** 모듈을 통째로 받은 이름(import * as ns, const m = await import()): 그 뒤 ns.이름을 모은다 @type {{ local: string, ref: Ref, decl: number }[]} */
  const wholes = []
  /** import로 받은 이름 → 어디서 무슨 이름으로. export { a }가 받은 이름이면 다시 내보내기다 @type {Map<string, { spec: string, name: string }>} */
  const bindings = new Map()

  const t = (/** @type {number} */ k) => tokens[k]
  const is = (/** @type {number} */ k, /** @type {string} */ v) => tokens[k]?.value === v && (tokens[k].type === 'punc' || tokens[k].type === 'id')
  const isId = (/** @type {number} */ k) => tokens[k]?.type === 'id'
  /** 짝이 맞는 닫는 괄호의 자리 */
  const close = (/** @type {number} */ k) => {
    const open = tokens[k].value
    const shut = { '(': ')', '[': ']', '{': '}' }[open]
    let depth = 0
    for (let j = k; j < tokens.length; j++) {
      if (tokens[j].type !== 'punc') continue
      if (tokens[j].value === open) depth++
      else if (tokens[j].value === shut && --depth === 0) return j
    }
    return tokens.length - 1
  }
  /** { a, b: c, ...d }에서 꺼내는 이름(a, b). ...가 있으면 모두 */
  const patternKeys = (/** @type {number} */ k) => {
    const end = close(k)
    const keys = []
    let depth = 0
    let expectKey = true
    for (let j = k + 1; j < end; j++) {
      const v = tokens[j]
      if (v.type === 'punc' && '([{'.includes(v.value)) depth++
      else if (v.type === 'punc' && ')]}'.includes(v.value)) depth--
      else if (depth === 0 && v.type === 'punc' && v.value === ',') expectKey = true
      else if (depth === 0 && expectKey && v.type === 'punc' && v.value === '...') return ['*']
      else if (depth === 0 && expectKey && (v.type === 'id' || v.type === 'str')) {
        keys.push(v.value)
        expectKey = false
      }
    }
    return keys
  }

  /**
   * import('x'), ssrLoadModule('/x'), require('x')로 받은 모듈에서 꺼내 쓰는 이름. 읽지 못하는 꼴이면 모두(['*'])
   * @param {number} start 부르는 식의 첫 낱말
   * @param {number} end 닫는 )
   * @param {Ref} ref
   */
  const dynamicNames = (start, end, ref) => {
    // import('x').then((m) => m.A) / .then(({ A }) => …)
    if (is(end + 1, '.') && is(end + 2, 'then') && is(end + 3, '(')) {
      const argEnd = close(end + 3)
      let k = end + 4
      if (is(k, '(')) k++
      if (is(k, '{')) return patternKeys(k)
      if (isId(k)) {
        const param = t(k).value
        const names = []
        for (let j = k + 1; j < argEnd; j++) {
          if (t(j).value !== param || t(j).type !== 'id') continue
          if (is(j + 1, '.') && isId(j + 2)) names.push(t(j + 2).value)
          else if (!is(j - 1, '.')) return ['*']
        }
        return names
      }
      return ['*']
    }
    // 형 자리의 import('x').Foo
    if (is(end + 1, '.') && isId(end + 2)) return [t(end + 2).value]
    let b = start - 1
    if (is(b, 'await')) b--
    // (await import('x')).A
    if (is(b, '(') && is(end + 1, ')')) {
      if (is(end + 2, '.') && isId(end + 3)) return [t(end + 3).value]
      b--
    }
    if (!is(b, '=')) return ['*']
    // const { A, B } = await import('x')
    if (is(b - 1, '}')) {
      let depth = 0
      for (let j = b - 1; j >= 0; j--) {
        if (is(j, '}')) depth++
        else if (is(j, '{') && --depth === 0) return patternKeys(j)
      }
      return ['*']
    }
    // const m = await import('x') → 뒤에서 m.A를 모은다
    if (isId(b - 1) && ['const', 'let', 'var'].includes(t(b - 2)?.value)) {
      wholes.push({ local: t(b - 1).value, ref, decl: b - 1 })
      return []
    }
    return ['*']
  }

  for (let k = 0; k < tokens.length; k++) {
    const tok = tokens[k]
    // server.ssrLoadModule(…)만 앞에 .이 온다. 그 밖의 x.import 같은 것은 속성 이름이다
    if (tok.type !== 'id' || (is(k - 1, '.') && tok.value !== 'ssrLoadModule')) continue

    // ── 부르는 꼴의 가져오기: import('x'), require('x'), ssrLoadModule('/x'), new URL('x', import.meta.url)
    const call = tok.value === 'import' || tok.value === 'require' || tok.value === 'ssrLoadModule'
    if (call && is(k + 1, '(') && t(k + 2)?.type === 'str' && (is(k + 3, ')') || is(k + 3, ','))) {
      const typeOnly = is(k - 1, 'typeof')
      const ref = { spec: t(k + 2).value, line: tok.line, names: /** @type {string[]} */ ([]), typeOnly }
      if (!typeOnly) {
        // server.ssrLoadModule(…)는 앞의 server.까지가 부르는 식이다
        const start = tok.value === 'ssrLoadModule' && is(k - 1, '.') ? k - 2 : k
        ref.names = dynamicNames(start, close(k + 1), ref)
      } else if (is(close(k + 1) + 1, '.') && isId(close(k + 1) + 2)) ref.names = [t(close(k + 1) + 2).value]
      refs.push(ref)
      continue
    }
    if (tok.value === 'URL' && is(k - 1, 'new') && is(k + 1, '(') && t(k + 2)?.type === 'str' && is(k + 3, ',') && is(k + 4, 'import') && is(k + 6, 'meta')) {
      refs.push({ spec: t(k + 2).value, line: tok.line, names: [], typeOnly: false })
      continue
    }

    // ── import 문
    if (tok.value === 'import' && !is(k + 1, '(') && !is(k + 1, '.')) {
      let j = k + 1
      let typeOnly = false
      if (is(j, 'type') && (is(j + 1, '{') || is(j + 1, '*') || (isId(j + 1) && !is(j + 1, 'from')))) {
        typeOnly = true
        j++
      }
      /** @type {Ref} */
      const ref = { spec: '', line: tok.line, names: [], typeOnly }
      if (t(j)?.type !== 'str') {
        if (isId(j) && !is(j, 'from')) {
          ref.names.push('default')
          bindings.set(t(j).value, { spec: '', name: 'default' })
          j++
          if (is(j, ',')) j++
        }
        if (is(j, '*') && is(j + 1, 'as')) {
          wholes.push({ local: t(j + 2).value, ref, decl: j + 2 })
          j += 3
        }
        if (is(j, '{')) {
          const end = close(j)
          for (let m = j + 1; m < end; m++) {
            // { a, type B, c as d }: 가져오는 이름은 a, B, c
            if (is(m, ',') || (is(m, 'type') && !is(m + 1, ',') && !is(m + 1, '}') && !is(m + 1, 'as'))) continue
            ref.names.push(t(m).value)
            bindings.set(is(m + 1, 'as') ? t(m + 2).value : t(m).value, { spec: '', name: t(m).value })
            if (is(m + 1, 'as')) m += 2
          }
          j = end + 1
        }
        if (is(j, 'from')) j++
      }
      ref.spec = t(j)?.value ?? ''
      for (const b of bindings.values()) b.spec ||= ref.spec
      refs.push(ref)
      for (let m = k; m <= j; m++) skip.add(m)
      k = j
      continue
    }

    // ── export 문
    if (tok.value !== 'export') continue
    let j = k + 1
    skip.add(k)
    if (is(j, '*')) {
      // export * from 'x' / export * as ns from 'x'
      if (is(j + 1, 'as')) {
        exports.push({ name: t(j + 2).value, local: null, line: tok.line, from: t(j + 4)?.value ?? '', imported: '*' })
        refs.push({ spec: t(j + 4)?.value ?? '', line: tok.line, names: [], typeOnly: false })
        for (let m = k; m <= j + 4; m++) skip.add(m)
      } else {
        stars.push({ spec: t(j + 2)?.value ?? '', line: tok.line })
        refs.push({ spec: t(j + 2)?.value ?? '', line: tok.line, names: [], typeOnly: false })
        for (let m = k; m <= j + 2; m++) skip.add(m)
      }
      continue
    }
    if (is(j, 'type') && is(j + 1, '{')) j++
    if (is(j, '{')) {
      // export { a, b as c } (from 'x')
      const end = close(j)
      const from = is(end + 1, 'from') ? t(end + 2)?.value ?? '' : null
      const list = []
      for (let m = j + 1; m < end; m++) {
        if (is(m, ',') || (is(m, 'type') && !is(m + 1, ',') && !is(m + 1, '}') && !is(m + 1, 'as'))) continue
        if (is(m + 1, 'as')) {
          list.push({ inner: t(m).value, outer: t(m + 2).value })
          m += 2
        } else list.push({ inner: t(m).value, outer: t(m).value })
      }
      for (const { inner, outer } of list) {
        exports.push({ name: outer, local: from === null ? inner : null, line: tok.line, from, imported: from === null ? null : inner })
      }
      if (from !== null) refs.push({ spec: from, line: tok.line, names: [], typeOnly: false })
      const last = from === null ? end : end + 2
      for (let m = k; m <= last; m++) skip.add(m)
      continue
    }
    if (is(j, 'default')) {
      skip.add(j)
      let m = j + 1
      if (is(m, 'async')) m++
      if ((is(m, 'function') || is(m, 'class')) && (isId(m + 1) || (is(m + 1, '*') && isId(m + 2)))) {
        const at = is(m + 1, '*') ? m + 2 : m + 1
        exports.push({ name: 'default', local: t(at).value, line: tok.line, from: null, imported: null })
        skip.add(at)
      } else exports.push({ name: 'default', local: null, line: tok.line, from: null, imported: null })
      continue
    }
    while (DECL_SKIP.has(t(j)?.value) && !(is(j, 'const') && !is(j + 1, 'enum'))) j++
    const kind = t(j)?.value
    let at = -1
    if (kind === 'function') at = is(j + 1, '*') ? j + 2 : j + 1
    else if (['class', 'interface', 'enum', 'namespace', 'module', 'type'].includes(kind)) at = j + 1
    else if (['const', 'let', 'var'].includes(kind)) {
      if (is(j + 1, '{') || is(j + 1, '[')) {
        // export const { a, b: c } = … 는 드물다. 묶음 안의 이름을 모두 내보낸 것으로 본다
        const end = close(j + 1)
        for (let m = j + 2; m < end; m++) {
          if (isId(m) && !is(m + 1, ':')) {
            exports.push({ name: t(m).value, local: t(m).value, line: tok.line, from: null, imported: null })
            skip.add(m)
          }
        }
        continue
      }
      at = j + 1
    }
    if (at >= 0 && isId(at)) {
      if (!exports.some((e) => e.name === t(at).value)) exports.push({ name: t(at).value, local: t(at).value, line: tok.line, from: null, imported: null })
      skip.add(at)
    }
  }

  // 모듈을 통째로 받은 이름: ns.A로 쓴 이름만 모은다. 통째로 넘기면(spyOn(ns, …), {...ns}) 모두 쓴 것으로 본다
  for (const whole of wholes) {
    skip.add(whole.decl)
    const names = new Set()
    for (let k = 0; k < tokens.length; k++) {
      if (k === whole.decl || tokens[k].type !== 'id' || tokens[k].value !== whole.local || is(k - 1, '.') || skip.has(k)) continue
      if (is(k + 1, '.') && isId(k + 2)) names.add(t(k + 2).value)
      else names.add('*')
    }
    whole.ref.names.push(...(names.has('*') ? ['*'] : names))
  }

  // export { a }의 a가 가져온 이름이면 그 파일의 것을 다시 내보낸 것이다(export { a } from과 같다). 이 파일에서 a를 써도
  // 내보낼 까닭은 되지 않는다: 가져가는 쪽이 원래 파일에서 가져오면 된다
  for (const e of exports) {
    const b = e.local === null ? undefined : bindings.get(e.local)
    if (b) Object.assign(e, { local: null, from: b.spec, imported: b.name })
  }

  /** @type {Map<string, number>} */
  const uses = new Map()
  /** @type {Set<string>} */
  const strings = new Set()
  for (let k = 0; k < tokens.length; k++) {
    const v = tokens[k]
    if (v.type === 'str' || v.type === 'tpl') strings.add(v.value)
    if (v.type !== 'id' || skip.has(k) || is(k - 1, '.')) continue
    // { a: …, b?: … }의 a, b(객체와 형의 열쇠, 매개변수 이름)는 쓴 것이 아니다. 형의 열쇠는 줄을 바꿔 늘어놓기도 한다(앞에 ;가 없다).
    // 앞이 ?이면 삼항식(a ? b : c)의 b라 쓴 것이다
    const after = (k > 0 && tokens[k - 1].line < v.line && !is(k - 1, '?')) || is(k - 1, '{') || is(k - 1, ',') || is(k - 1, ';') || is(k - 1, '(')
    const key = (is(k + 1, '?') && is(k + 2, ':')) || (is(k + 1, ':') && after)
    // function A, class A: 이름 붙인 함수식(memo(function A() {}))도 쓴 것이 아니다
    const named = is(k - 1, 'function') || is(k - 1, 'class')
    if (!key && !named) uses.set(v.value, (uses.get(v.value) ?? 0) + 1)
  }
  return { refs, exports, stars, uses, strings }
}

/**
 * CSS의 @import와 url(…)
 * @param {string} text
 * @returns {Module}
 */
export function readCss(text) {
  const code = text.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
  /** @type {Ref[]} */
  const refs = []
  const lineAt = (/** @type {number} */ at) => code.slice(0, at).split('\n').length
  for (const m of code.matchAll(/@import\s+(?:url\(\s*)?['"]?([^'")\s;]+)/g)) refs.push({ spec: m[1], line: lineAt(m.index ?? 0), names: [], typeOnly: false })
  for (const m of code.matchAll(/(?<!@import\s+)url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) {
    if (!/^(data:|#|https?:)/.test(m[1])) refs.push({ spec: m[1], line: lineAt(m.index ?? 0), names: [], typeOnly: false })
  }
  return { refs, exports: [], stars: [], uses: new Map(), strings: new Set() }
}

/**
 * HTML의 src, href 가운데 이 저장소의 파일(/로 시작)
 * @param {string} text
 * @returns {Module}
 */
export function readHtml(text) {
  const code = text.replace(/<!--[\s\S]*?-->/g, '')
  const refs = [...code.matchAll(/\s(?:src|href)="(\/[^"]+)"/g)].map((m) => ({ spec: m[1], line: code.slice(0, m.index).split('\n').length, names: [], typeOnly: false }))
  return { refs, exports: [], stars: [], uses: new Map(), strings: new Set() }
}

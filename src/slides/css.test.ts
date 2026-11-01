import { describe, expect, it } from 'vitest'
import { BLOCK_COL_GAP, BLOCK_GAP, LINK_PAD } from '../deck/blocks'
import { cssSource } from './cssSource'

// CSS와 코드가 서로 기대는 약속. 어긋나도 오류 없이 모양만 틀어져서(글자 크기 설정이 먹지 않거나 자리 어림이 틀린다) 테스트로 본다
const read = (name: string) => cssSource(new URL(`./${name}`, import.meta.url)).replace(/\/\*[\s\S]*?\*\//g, '')
const slides = read('slides.css')
const blocks = read('blocks.css')

/** 괄호 밖의 구분자로 자른다 (:is(a, b) 안의 쉼표에서 자르지 않게) */
function split(text: string, seps: string): string[] {
  const out: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of text) {
    if (ch === '(') depth++
    else if (ch === ')') depth--
    if (depth === 0 && seps.includes(ch)) {
      if (cur.trim()) out.push(cur.trim())
      cur = ''
    } else cur += ch
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}

/** 중첩 없는 규칙 { 선택자, 몸 } 모두 (@container 안의 규칙도) */
const rules = (css: string) => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1].trim(), body: m[2] }))

/** 선택자가 가리키는 요소(맨 끝 묶음)의 클래스. :not()과 :has() 안은 그 요소의 클래스가 아니라 뺀다 */
function subjectClasses(selector: string): string[] {
  const last = split(selector, ' >+~').at(-1) ?? ''
  const own = last.replace(/:(not|has)\((?:[^()]|\([^()]*\))*\)/g, '')
  return [...own.matchAll(/\.([A-Za-z][\w-]*)/g)].map((m) => m[1])
}

describe('글자 칸 목록 (slides.css의 --fs 규칙)', () => {
  // 글자 크기를 --fs × 배율(글자 크기 설정, 부품 칸 맞추기)로 정하는 규칙의 선택자에 든 클래스
  const listed = new Set(
    rules(slides)
      .filter((r) => r.body.includes('font-size') && r.body.includes('calc(var(--fs) * var(--fit, 1)'))
      .flatMap((r) => [...r.selector.matchAll(/\.([A-Za-z][\w-]*)/g)].map((m) => m[1])),
  )
  // 제목 칸(.s-title과 같이 쓴다)과 한 줄 칸(oneLine을 주면 .one-line이 붙는다)은 그 클래스의 규칙이 크기를 정한다
  const OWN_RULE = new Set(['ag-title', 'ix-title', 'pm-num'])

  it('--fs를 정하는 칸은 모두 목록에 있다 (없으면 글자 크기 설정과 부품 칸 맞추기가 먹지 않는다)', () => {
    const missing: string[] = []
    for (const r of [...rules(slides), ...rules(blocks)]) {
      if (!/(^|[;\s])--fs\s*:/.test(r.body)) continue
      for (const sel of split(r.selector, ',')) {
        if (sel.startsWith('@')) continue
        const classes = subjectClasses(sel)
        if (!classes.some((c) => listed.has(c) || OWN_RULE.has(c))) missing.push(sel)
      }
    }
    expect(missing).toEqual([])
  })
})

describe('부품 장의 간격', () => {
  const px = (name: string) => Number(new RegExp(`--${name}: (\\d+)px;`).exec(blocks)?.[1])

  it('칸 사이와 이음표 자리가 CSS와 같다 (자리 계산이 CSS calc()와 같은 값을 쓴다)', () => {
    expect(px('bk-gap')).toBe(BLOCK_GAP)
    expect(px('bk-col-gap')).toBe(BLOCK_COL_GAP)
    expect(px('lk-pad')).toBe(LINK_PAD)
  })
})

describe('면 위 소제목의 빈 키 자르기', () => {
  it('나란히 선 칸(is-shared)에서는 자르지 않는다: 옆 칸의 첫 글줄과 윗선이 같은 축에 선다 (docs/VISUAL-RULES.md 5)', () => {
    // 평가표 카드의 소제목만 잘려 옆 강조 상자 카드의 이름표보다 9px 위에 섰다(갤러리 조합 3-44, 크게)
    const trims = rules(blocks)
      .filter((r) => /text-box:\s*trim-start/.test(r.body))
      .flatMap((r) => split(r.selector, ','))
      .filter((s) => /\.bk-h\b/.test(s) && /\.bk-look-(card|bold)\b/.test(s))
    expect(trims.length).toBeGreaterThan(0)
    for (const s of trims) expect(s, s).toMatch(/:not\(\.is-shared\)/)
  })
})

describe('목록의 첫 항목 위', () => {
  it('예상 질문은 첫 질문 위에 선이 없으니 선 아래 여백도 두지 않는다: 옆 칸의 첫 글줄과 윗선이 같은 축에 선다 (docs/VISUAL-RULES.md 5)', () => {
    // 첫 질문 위 선만 투명하게 지우고(lines.css) 선 아래 여백(큰 칸에서 22px)은 남아서, 핵심 숫자 카드 옆에서 첫 질문이 21px 아래에
    // 섰다(갤러리 조합 5-82, 크게). 두 칸이 모두 본문 높이를 다 써서 쌓기(fitBlocks의 pack)가 내려 맞출 자리도 없었다. 맡은 사람의 목록과 같다
    const zero = rules(blocks)
      .filter((r) => /padding-top:\s*0(px)?\s*;/.test(r.body))
      .flatMap((r) => split(r.selector, ','))
    expect(zero).toContain('.bk-qa-item:first-child')
    // 여러 단으로 흘리면 첫 줄의 질문 모두 (둘째, 셋째 단의 첫 질문만 내려앉지 않게)
    expect(zero).toContain(".bk-qa-list:is([data-n='2'], [data-n='4']) > .bk-qa-item:nth-child(-n + 2)")
    expect(zero).toContain(".bk-qa-list[data-n='3'] > .bk-qa-item:nth-child(-n + 3)")
  })
})

/** 선택자의 세기(클래스, 속성, 가상 클래스의 수). :is(), :not(), :has()는 안의 가장 센 것, :where()는 0. 이 파일의 선택자에는 id가 없다 */
function specificity(selector: string): number {
  let n = 0
  const rest = selector.replace(/:(is|not|has|where)\(((?:[^()]|\([^()]*\))*)\)/g, (_, fn: string, inner: string) => {
    if (fn !== 'where') n += Math.max(...split(inner, ',').map(specificity))
    return ''
  })
  return n + (rest.match(/\.[A-Za-z][\w-]*|\[[^\]]*\]|:(?!:)[\w-]+/g) ?? []).length
}

describe('컴포넌트 칸의 숫자 하나', () => {
  it('바탕 없는 칸에서는 칸 위에서부터: 빈 숫자가 빠져 하나만 남아도 옆 칸의 첫 줄과 윗선이 같다 (docs/VISUAL-RULES.md 5)', () => {
    // 칸 가운데에 두던 때는 발표할 때 빈 숫자 둘이 빠지면 숫자 셋을 넣으려고 잡은 높은 칸 가운데에 남은 하나가 떠서, 옆 예상 질문의
    // 첫 줄보다 300px 남짓 아래에서 시작했다(804×842 칸에서 554, 255). 장(레이아웃)과 면이 있는 칸은 가운데에 두어도 된다
    const all = [...rules(slides), ...rules(blocks)].flatMap((r) => split(r.selector, ',').map((s) => ({ s, body: r.body })))
    for (const subject of [/\.kp\[data-n='1'\]$/, /\.kp\[data-n='1'\] (> )?\.kp-item$/]) {
      const top = all.filter((x) => subject.test(x.s) && /\.bk-look-plain\b/.test(x.s) && /align-content:\s*start\s*;/.test(x.body))
      expect(top.length, String(subject)).toBeGreaterThan(0)
      // 가운데에 두는 규칙 가운데 바탕 없는 컴포넌트 칸에도 걸리는 것(:not() 밖에 장이나 면을 가리키지 않는 것)은 위의 규칙보다 약해야 한다
      const centers = all.filter(
        (x) => subject.test(x.s) && /align-content:\s*(safe\s+)?center\s*;/.test(x.body) && !/\.l-kpi\b|\.bk-look-(card|bold)\b/.test(x.s.replace(/:not\([^)]*\)/g, '')),
      )
      expect(centers.length, String(subject)).toBeGreaterThan(0)
      const strongest = Math.max(...top.map((x) => specificity(x.s)))
      for (const c of centers) expect(specificity(c.s), c.s).toBeLessThan(strongest)
    }
    // 좁은 칸에서 맨 위에 서는 이름 위에도 여백이 없다: 이름 위 선을 지운 뒤에도 선과 글 사이의 28px가 남아, 옆 칸의 첫 줄보다 그만큼 아래에 섰다
    const padded = all.filter((x) => /\.kp\[data-n='1'\].* \.kp-label$/.test(x.s) && /padding(-top)?:\s*[1-9]/.test(x.body))
    expect(padded.map((x) => x.s)).toEqual([])
  })
})

describe('넓은 칸의 두 항목 목록', () => {
  /** @container 묶음마다 { 조건, 안의 규칙 } */
  const containers = [...blocks.matchAll(/@container ([^{]+)\{((?:[^{}]*\{[^{}]*\})*\s*)\}/g)].map((m) => ({ cond: m[1].trim(), body: m[2] }))
  const px = (cond: string, key: string) => Number(new RegExp(`\\(${key} ?(?:<|:) ?(\\d+)px\\)`).exec(cond)?.[1])

  it('소제목이 있으면 한 단이 드는 높이부터 한 단(소제목은 옆에): 편집 화면처럼 낮은 줄에서도 발표 화면과 짜임이 같다', () => {
    // 편집 화면(빈 칸 안내만큼 줄이 낮다)의 140px 줄에서 두 항목이 소제목 옆에 01 … 02로 늘어서, 같은 장의 발표 화면(한 단)과 짜임이 달랐다
    // (갤러리 combos seed 2 편집 화면의 87, 99번). 두 항목의 한 단은 편집 화면의 손잡이(44px)까지 2 × 44 + 10 = 98px이라 그보다 조금 높으면 든다
    const wide = containers.filter((c) => c.cond.includes('(min-width: 1300px)'))
    // 소제목과 두 항목을 한 줄에 눕히는 짜임이 서는 높이 (그보다 낮은 줄)
    const row = wide.find((c) => c.body.includes(".bk-h + .bk-list[data-n='2']") && /flex-direction:\s*row/.test(c.body))
    expect(row).toBeDefined()
    const rowBelow = px(row!.cond, 'height')
    // 소제목이 있는 바탕 없는 두 항목 목록이 한 단(--bl-one)이 되는 가장 낮은 높이
    const one = wide.filter((c) => /\.bk-look-plain > \.bk-in:has\(> \.bk-bl > (?:\.bk-h \+ )?\.bk-list\[data-n='2'\]\)/.test(c.body) && /--bl-one:\s*1/.test(c.body))
    const oneFrom = Math.min(...one.map((c) => px(c.cond, 'min-height')))
    expect(oneFrom).toBeLessThanOrEqual(120)
    // 둘 사이에 비는 높이가 없다: 비면 그 높이에서는 소제목 아래에 두 항목이 나란히 서서 낮은 줄에 글자가 줄어든다
    expect(rowBelow).toBe(oneFrom)
  })
})

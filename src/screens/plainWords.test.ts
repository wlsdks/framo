import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// AGENTS.md '화면 문구': 순화어나 예스러운 말보다 흔히 쓰는 말로 쓴다. 괄호 안의 말(적은 글, 저절로, 내려받기 …)은 화면에 쓰지 않는다.
// 화면에 '적은 글은 그대로예요'처럼 남아 있어도 테스트가 없어 아무도 몰랐다
const AVOID = ['적은 글', '저절로', '내려받기', '까닭', '지어낸', '두 번 누르', '두 번 눌러']

/** 화면 글이 있는 곳: 화면, 슬라이드, 발표 종류의 예시와 안내, 레이아웃과 컴포넌트의 안내, 내보낸 HTML */
const ROOTS = ['src/screens', 'src/slides', 'src/deck', 'src/export', 'src/present', 'src/motion']

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return name === 'fixtures' ? [] : files(p)
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : []
  })
}

/** 주석을 뺀 소스에서 따옴표 안의 글과 JSX 글 (주석은 화면에 나오지 않는다) */
function screenText(src: string): string[] {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
  return [...code.matchAll(/'([^'\n]*)'|`([^`]*)`|"([^"\n]*)"|>([^<>{}\n]+)</g)].map((m) => m[1] ?? m[2] ?? m[3] ?? m[4])
}

describe('화면 문구', () => {
  it('흔히 쓰는 말로 쓴다: 적은 글(작성한 글), 저절로(자동으로), 내려받기(다운로드) 같은 말은 화면에 없다', () => {
    const found: string[] = []
    for (const root of ROOTS)
      for (const p of files(root))
        for (const text of screenText(readFileSync(p, 'utf8')))
          for (const word of AVOID) if (text.includes(word)) found.push(`${p}: '${word}' — ${text.trim().slice(0, 60)}`)
    expect(found).toEqual([])
  })
})

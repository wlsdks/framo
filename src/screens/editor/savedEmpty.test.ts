import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = (name: string) => readFileSync(join('src/screens/editor', name), 'utf8')

describe("'내 컴포넌트'가 비었을 때의 안내", () => {
  it('저장하는 곳을 실제 메뉴의 이름으로 가리킨다: 도구 줄에 없는 그림(책갈피)을 누르라고 하지 않는다', () => {
    // 저장은 컴포넌트 도구에서 이름을 누르면 열리는 메뉴의 '내 컴포넌트로 저장'이다. 안내가 '도구의 (책갈피 그림)를 누르면'이라고 해서
    // 도구 줄을 다 뒤져도 그 그림을 찾을 수 없었다
    const empty = /className="mine-empty-p">([\s\S]*?)<\/p>/.exec(source('SavedParts.tsx'))?.[1] ?? ''
    expect(empty).not.toBe('')
    expect(empty).not.toMatch(/Icon/)
    expect(empty).toContain("'내 컴포넌트로 저장'")
    expect(source('BlockTools.tsx')).toContain('내 컴포넌트로 저장: ')
  })
})

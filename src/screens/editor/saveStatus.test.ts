import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const src = readFileSync(join(__dirname, 'SaveStatus.tsx'), 'utf8')

describe('저장 상태의 화면 읽기', () => {
  it('저장 단추는 알림 칸이 아니다 (글을 쓰는 동안 고칠 때마다 저장 중, 저장됨을 번갈아 읽었다)', () => {
    // 윈도우에서 받은 소스는 줄 끝이 CRLF다
    const button = /<button\s+type="button"\s+className=\{cx\('save',[\s\S]*?\n\s*>\r?\n/.exec(src)?.[0]
    expect(button).toBeTruthy()
    expect(button).not.toContain('aria-live')
  })

  it('저장하지 못한 때만 한 번 알린다', () => {
    expect(src).toMatch(/<p className="sr-only" role="alert">\s*\{tone === 'bad' \? label : ''\}\s*<\/p>/)
  })
})

describe('보관 폴더 물음', () => {
  it('고친 바로 그때가 아니라 손을 쉰 뒤에 묻는다 (첫 글자를 쓰는 중에 떠서 쓰던 칸을 가렸다)', () => {
    expect(src).toMatch(/const ASK_QUIET = \d{4,}/)
    expect(src).toMatch(/quiet < ASK_QUIET/)
  })

  it('띄운 것만으로 물은 것으로 치지 않는다: 답했을 때만 남긴다', () => {
    // markFolderAsked를 부르는 곳은 answer 하나뿐이다 (정의 한 번, 부르기 한 번)
    expect(src.match(/markFolderAsked\(\)/g)?.length).toBe(2)
    expect(src).toMatch(/const answer = \(\) => \{\s*markFolderAsked\(\)/)
    // 바깥을 누르면 접기만 한다
    expect(src).toMatch(/contains\(e\.target as Node\)\) setAsking\(false\)/)
  })
})

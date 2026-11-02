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

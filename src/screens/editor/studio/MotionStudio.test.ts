import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const src = readFileSync(join(__dirname, 'MotionStudio.tsx'), 'utf8')

describe('모션 편집의 머리', () => {
  it('지금 장의 이름은 장 목록과 같은 이름으로 (제목 칸이 비어도 제목 없는 슬라이드로 부르지 않는다)', () => {
    const name = /className="ms-slide-name">\{([^}]*)\}</.exec(src)?.[1]
    expect(name).toBe('slideHeading(slide)')
    expect(src).not.toContain('제목 없는 슬라이드')
  })

  it('되돌리기와 다시 하기는 한글 입력 상태에서도 된다 (자판 자리로 읽는다)', () => {
    // 한글 입력 상태의 Ctrl+Z는 key가 'ㅋ'로 와서, 모션 편집에서는 되돌리기가 되지 않았다(편집기는 presentKey로 읽는다)
    expect(src).toMatch(/const k = presentKey\(e\)\.toLowerCase\(\)/)
    expect(src).not.toMatch(/const k = e\.key\.toLowerCase\(\)/)
  })
})

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
})

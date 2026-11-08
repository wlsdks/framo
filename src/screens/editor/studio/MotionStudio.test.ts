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

  it('되돌리기와 다시 하기는 편집기의 단축키가 받는다 (한글 입력 상태에서도 되고, 두 번 되돌리지 않게)', () => {
    // 덮는 창이던 때는 스튜디오가 따로 받았다. 이제 편집기의 한 모습이라 따로 받으면 한 번 눌러 두 번 되돌린다
    expect(src).not.toMatch(/undo\(\)|redo\(\)/)
    const shortcuts = readFileSync(join(__dirname, '..', 'shortcuts.ts'), 'utf8')
    expect(shortcuts).toMatch(/const k = presentKey\(e\)\.toLowerCase\(\)/)
  })
})

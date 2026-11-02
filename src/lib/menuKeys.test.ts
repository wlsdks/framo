import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { menuStep } from './menuKeys'

const SRC = join(__dirname, '..')

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name)
    if (e.isDirectory()) return sources(p)
    return /\.tsx$/.test(e.name) && !/\.test\./.test(e.name) ? [p] : []
  })
}

describe('메뉴의 방향키', () => {
  it('위아래로 옮기고 끝에서는 처음으로 돈다. Home·End는 처음과 끝', () => {
    expect(menuStep('ArrowDown', 0, 3)).toBe(1)
    expect(menuStep('ArrowDown', 2, 3)).toBe(0)
    expect(menuStep('ArrowUp', 0, 3)).toBe(2)
    expect(menuStep('Home', 2, 3)).toBe(0)
    expect(menuStep('End', 0, 3)).toBe(2)
    // 초점이 항목이 아닌 곳에 있으면 아래는 첫 항목, 위는 끝 항목으로
    expect(menuStep('ArrowDown', -1, 3)).toBe(0)
    expect(menuStep('ArrowUp', -1, 3)).toBe(2)
    // 옆 방향키와 다른 키는 메뉴의 키가 아니다 (Esc는 메뉴를 닫는 곳이 받는다)
    expect(menuStep('ArrowRight', 0, 3)).toBeNull()
    expect(menuStep('Escape', 0, 3)).toBeNull()
    expect(menuStep('ArrowDown', 0, 0)).toBeNull()
  })

  it('메뉴라고 알려 주는 곳은 모두 방향키를 받는다', () => {
    const bad: string[] = []
    let menus = 0
    for (const f of sources(SRC)) {
      const text = readFileSync(f, 'utf8')
      for (const m of text.matchAll(/<[a-z]+\b[^<>]*role="menu"[^<>]*>/g)) {
        menus++
        if (!m[0].includes('onKeyDown={onMenuKeys}')) bad.push(f.slice(SRC.length + 1))
      }
    }
    // 컴포넌트 도구의 더 보기·바탕·모션·모양, 슬라이드 아래 도구의 더 보기
    expect(menus).toBeGreaterThanOrEqual(5)
    expect(bad).toEqual([])
  })
})

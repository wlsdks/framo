import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { tabStep } from './tabList'

const SRC = join(__dirname, '..')

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name)
    if (e.isDirectory()) return sources(p)
    return /\.tsx$/.test(e.name) && !/\.test\./.test(e.name) ? [p] : []
  })
}

/** 여는 태그 하나(속성까지). 줄이 나뉘어도 > 까지 */
const tags = (text: string, role: string) => [...text.matchAll(new RegExp(`<[a-z]+\\b[^<>]*role="${role}"[^<>]*>`, 'g'))].map((m) => m[0])

describe('탭 묶음의 방향키', () => {
  it('가로 탭은 왼쪽·오른쪽, 세로 탭은 위·아래로 옮기고 끝에서는 처음으로 돈다', () => {
    expect(tabStep('ArrowRight', 0, 3)).toBe(1)
    expect(tabStep('ArrowRight', 2, 3)).toBe(0)
    expect(tabStep('ArrowLeft', 0, 3)).toBe(2)
    expect(tabStep('ArrowDown', 0, 3)).toBeNull()
    expect(tabStep('ArrowDown', 1, 4, true)).toBe(2)
    expect(tabStep('ArrowUp', 0, 4, true)).toBe(3)
    expect(tabStep('ArrowRight', 1, 4, true)).toBeNull()
    expect(tabStep('Home', 2, 3)).toBe(0)
    expect(tabStep('End', 0, 3)).toBe(2)
    expect(tabStep('Enter', 0, 3)).toBeNull()
    // 초점이 탭이 아닌 곳(탭 묶음 안의 (i) 단추, 닫기 단추)에 있으면 옮기지 않는다
    expect(tabStep('ArrowRight', -1, 3)).toBeNull()
  })

  it('탭 묶음마다 방향키를 받고, Tab 키로는 고른 탭 하나에만 선다', () => {
    const files = sources(SRC).filter((f) => readFileSync(f, 'utf8').includes('role="tablist"'))
    // 오른쪽 칸(이 슬라이드 설정, 모션, 컴포넌트)과 슬라이드 추가의 묶음
    expect(files.length).toBeGreaterThanOrEqual(2)
    const bad = files.flatMap((f) => {
      const text = readFileSync(f, 'utf8')
      const name = f.slice(SRC.length + 1)
      return [
        ...tags(text, 'tablist').filter((t) => !t.includes('onKeyDown={onTabListKeys}')).map(() => `${name}: 방향키`),
        ...tags(text, 'tab').filter((t) => !/\btabIndex=\{/.test(t)).map(() => `${name}: tabIndex`),
      ]
    })
    expect(bad).toEqual([])
  })
})

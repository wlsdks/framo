import type { Active, Over } from '@dnd-kit/core'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { listAccessibility } from './listDrag'

const SRC = join(__dirname, '..')

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name)
    if (e.isDirectory()) return sources(p)
    return /\.tsx$/.test(e.name) && !/\.test\./.test(e.name) ? [p] : []
  })
}

const active = (id: string) => ({ id }) as Active
const over = (id: string) => ({ id }) as Over

describe('끌어 옮기는 목록의 화면 읽기 안내', () => {
  it('끌어 옮기는 목록마다 한국어 안내를 건다 (주지 않으면 dnd-kit의 영어 기본 문장이 읽힌다)', () => {
    const lists = sources(SRC).flatMap((file) => {
      const text = readFileSync(file, 'utf8')
      return [...text.matchAll(/<DndContext\b[\s\S]*?<SortableContext/g)].map((m) => ({ file: file.slice(SRC.length + 1), props: m[0] }))
    })
    // 장 목록, 나오는 차례, 움직임 편집의 시간표
    expect(lists.length).toBeGreaterThanOrEqual(3)
    expect(lists.filter((l) => !/\baccessibility=\{/.test(l.props)).map((l) => l.file)).toEqual([])
  })

  it('끄는 줄의 역할 이름도 한국어로 읽는다 (주지 않으면 dnd-kit의 sortable)', () => {
    const bad = sources(SRC).flatMap((file) => {
      const text = readFileSync(file, 'utf8')
      if (!/\buseSortable\(/.test(text)) return []
      const named = /useSortable\(\{[^\n]*roleDescription:/.test(text) || /\{\.\.\.attributes\}[\s\S]{0,200}?aria-roledescription=/.test(text)
      return named ? [] : [file.slice(SRC.length + 1)]
    })
    expect(bad).toEqual([])
  })

  it('집기, 자리 위, 놓기, 그만두기를 한국어로 읽는다', () => {
    const order = ['a', 'b', 'c']
    const name = { a: '막대 비교', b: '숫자 묶음', c: '목록' } as Record<string, string>
    const { announcements: say, screenReaderInstructions } = listAccessibility(
      (id) => name[String(id)],
      (id) => order.indexOf(String(id)) + 1,
    )
    expect(say.onDragStart({ active: active('a') })).toBe('막대 비교를 집었어요.')
    expect(say.onDragOver({ active: active('a'), over: over('c') })).toBe('3번째 자리 위에 있어요.')
    expect(say.onDragOver({ active: active('a'), over: null })).toBe('목록 밖에 있어요.')
    expect(say.onDragEnd({ active: active('b'), over: over('c') })).toBe('숫자 묶음을 3번째 자리에 놓았어요.')
    expect(say.onDragEnd({ active: active('c'), over: over('c') })).toBe('목록은 제자리에 있어요.')
    expect(say.onDragEnd({ active: active('a'), over: null })).toBe('막대 비교는 제자리에 있어요.')
    expect(say.onDragCancel({ active: active('a'), over: null })).toBe('옮기기를 그만뒀어요. 막대 비교는 제자리에 있어요.')
    // 이 목록들은 키보드 끌기(스페이스로 집기)를 쓰지 않는다. 키보드로는 Alt와 위아래 화살표로 옮긴다
    expect(screenReaderInstructions.draggable).toMatch(/^마우스로 끌어 순서를 바꿔요\. 키보드로는 .+로 한 칸씩 옮겨요\.$/)
    expect(screenReaderInstructions.draggable).not.toMatch(/space|스페이스/i)
  })
})

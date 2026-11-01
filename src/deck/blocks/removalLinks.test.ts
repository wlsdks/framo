import { expect, it } from 'vitest'
import { sampleBlock } from '../blockSamples'
import { makeSlide } from '../generate'
import { across, autoPlace, composeAreaH, linkAt, linkIssue, linkTargets, removeBlock, withLink } from '../blocks'
import type { BlockType } from '../types'

it('관계없는 컴포넌트를 빼도 남은 연결은 기존 대상만 가리킨다', () => {
  const h = composeAreaH({ ...makeSlide('compose'), fields: { title: '가상의 조합' } }, undefined, true)
  const types: BlockType[] = ['number', 'stat', 'facts']
  let checked = 0, removed = 0
  for (const t1 of types) for (const t2 of types) for (const t3 of types) for (const t4 of types) {
    let board = autoPlace([], { ...sampleBlock(t1), id: 'a' }, h)
    for (const [type, id] of [[t2, 'b'], [t3, 'c'], [t4, 'd']] as const) board = board && autoPlace(board, { ...sampleBlock(type), id }, h)
    if (!board) continue
    for (const target of linkTargets(board)) {
      if (linkIssue(board, target, 'arrow')) continue
      const before = withLink(board, target, 'arrow')
      const source = before.find((b) => b.id === target.id)!
      const ends = across(before, source, target.dir).map((b) => b.id).sort()
      if (!ends.length) continue
      for (const gone of before.filter((b) => b.id !== target.id && !ends.includes(b.id))) {
        const after = removeBlock(before, gone.id, h)
        if (!linkAt(after, target)) removed++
        else expect(across(after, after.find((b) => b.id === target.id)!, target.dir).map((b) => b.id).sort()).toEqual(ends)
        checked++
      }
    }
  }
  expect(checked).toBeGreaterThan(100)
  expect(removed).toBeGreaterThan(0)
}, 60000)

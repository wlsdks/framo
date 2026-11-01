import { describe, expect, it } from 'vitest'
import { sampleBlock } from '../blockSamples'
import { makeSlide } from '../generate'
import type { BlockType } from '../types'
import { across, autoPlace, boardTight, composeAreaH, linkAt, linkIssue, linkTargets, placeIssue, removeBlock, shownBlocks, withLink } from '../blocks'

describe('기존 연결이 있는 슬라이드의 자동 삽입', () => {
  it('삽입할 때 유효했던 연결의 종류와 양 끝을 그대로 유지한다', () => {
    const h = composeAreaH({ ...makeSlide('compose'), fields: { title: '가상의 조합' } }, undefined, true)
    const types: BlockType[] = ['number', 'stat', 'facts', 'trend', 'bullets', 'text']
    let checked = 0
    let refused = 0
    for (const first of types) for (const second of types) {
      const a = autoPlace([], { ...sampleBlock(first), id: 'a' }, h)
      const base = a && autoPlace(a, { ...sampleBlock(second), id: 'b' }, h)
      if (!base) continue
      for (const target of linkTargets(base)) for (const link of ['arrow', 'equals', 'plus'] as const) {
        if (linkIssue(base, target, link)) continue
        const before = withLink(base, target, link)
        if (linkAt(before, target) !== link) continue
        const source = before.find((b) => b.id === target.id)!
        const ends = across(before, source, target.dir).map((b) => b.id).sort()
        for (const type of types) {
          const added = { ...sampleBlock(type), id: 'new' }
          const after = autoPlace(before, added, h)
          if (!after) {
            expect(placeIssue(before, added, h)).not.toBeNull()
            refused++
            continue
          }
          const name = `${first} ${link} ${second} + ${type}`
          expect(linkAt(after, target), name).toBe(link)
          expect(linkIssue(after, target, link), name).toBeNull()
          expect(across(after, after.find((b) => b.id === target.id)!, target.dir).map((b) => b.id).sort(), name).toEqual(ends)
          checked++
        }
      }
    }
    expect(checked).toBeGreaterThan(100)
    expect(refused).toBeGreaterThan(0)
  })

  it('연결이 둘인 장에 다른 컴포넌트를 넣어도 두 연결을 함께 보존한다', () => {
    const slide = { ...makeSlide('compose'), fields: { title: '가상의 조합' } }
    const h = composeAreaH(slide, undefined, true)
    const types: BlockType[] = ['number', 'stat', 'facts', 'trend', 'bullets', 'text']
    let checked = 0
    for (const first of types) for (const second of types) for (const third of types) {
      const a = autoPlace([], { ...sampleBlock(first), id: 'a' }, h)
      const b = a && autoPlace(a, { ...sampleBlock(second), id: 'b' }, h)
      let before = b && autoPlace(b, { ...sampleBlock(third), id: 'c' }, h)
      if (!before) continue
      const targets = linkTargets(before).filter((t) => !linkIssue(before!, t, 'arrow')).slice(0, 2)
      if (targets.length < 2) continue
      for (const target of targets) before = withLink(before, target, 'arrow')
      if (boardTight({ ...slide, blocks: before }, undefined, h)) continue
      const ends = targets.map((target) => across(before!, before!.find((b) => b.id === target.id)!, target.dir).map((b) => b.id).sort())
      const added = { ...sampleBlock('stat'), id: 'new' }
      const after = autoPlace(before, added, h)
      if (!after) {
        expect(placeIssue(before, added, h)).not.toBeNull()
        continue
      }
      for (let i = 0; i < targets.length; i++) {
        const target = targets[i]
        expect(linkAt(after, target)).toBe('arrow')
        expect(linkIssue(after, target, 'arrow')).toBeNull()
        expect(across(after, after.find((b) => b.id === target.id)!, target.dir).map((b) => b.id).sort()).toEqual(ends[i])
      }
      checked++
    }
    expect(checked).toBeGreaterThan(10)
  }, 30000)
})

describe('컴포넌트를 뺄 때 연결의 뜻', () => {
  const board = () => {
    const places = [
      { x: 0, y: 0, w: 6, h: 6 }, { x: 6, y: 0, w: 6, h: 6 },
      { x: 0, y: 6, w: 7, h: 6 }, { x: 7, y: 6, w: 5, h: 6 },
    ]
    return ['a', 'b', 'c', 'd'].map((id, i) => ({ ...sampleBlock('number'), id, at: places[i], ...(i === 0 ? { linkBelow: 'arrow' as const } : {}) }))
  }
  const target = { id: 'a', dir: 'v' as const }

  it('관계없는 칸을 빼서 연결 대상이 늘어나면 다른 뜻으로 남기지 않는다', () => {
    const before = board()
    expect(across(before, before[0], 'v').map((b) => b.id)).toEqual(['c'])
    const after = removeBlock(before, 'b', 800)
    expect(after.map((b) => b.id)).toEqual(['a', 'c', 'd'])
    expect(across(after, after[0], 'v').map((b) => b.id)).toEqual(['c', 'd'])
    expect(linkAt(after, target)).toBeNull()
    expect(before[0].linkBelow).toBe('arrow')
    expect(after.map((b) => b.fields)).toEqual(before.filter((b) => b.id !== 'b').map((b) => b.fields))
  })

  it('다른 칸을 빼도 연결 대상이 같으면 연결을 지키며, 빈 칸을 숨겨 그릴 때도 같은 규칙을 쓴다', () => {
    const before = board()
    const after = removeBlock(before, 'd', 800)
    expect(linkAt(after, target)).toBe('arrow')
    expect(across(after, after[0], 'v').map((b) => b.id)).toEqual(['c'])
    const blank = before.map((b) => b.id === 'b' ? { ...b, fields: {}, items: [] } : b)
    expect(linkAt(shownBlocks(blank), target)).toBeNull()
    expect(linkAt(blank, target)).toBe('arrow')
  })
})

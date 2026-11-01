import { describe, expect, it } from 'vitest'
import { sampleBlock } from '../blockSamples'
import { makeSlide } from '../generate'
import { BLOCK_TYPES, autoPlace, boardCost, boardFit, boardTight, byReading, composeAreaH, rearrangeBlocks, tiles } from '../blocks'
import type { Block, BlockType } from '../types'

describe('기존 두 컴포넌트 다시 배치', () => {
  it('놓을 수 있는 모든 종류의 짝에서 글과 읽는 순서, 크기 규칙을 지킨다', () => {
    const slide = { ...makeSlide('compose'), fields: { title: '가상의 현황과 다음 단계' } }
    const h = composeAreaH(slide, undefined, true)
    let checked = 0
    for (const firstType of BLOCK_TYPES) for (const secondType of BLOCK_TYPES) {
      if (firstType === 'heading' || secondType === 'heading') continue
      const first = autoPlace([], { ...sampleBlock(firstType), id: 'first' }, h)
      if (!first) continue
      const before = autoPlace(first, { ...sampleBlock(secondType), id: 'second' }, h)
      if (!before) continue
      const after = rearrangeBlocks(before, h)
      const name = `${firstType} + ${secondType}`
      expect(after, name).not.toBeNull()
      if (!after) throw new Error(`${name}: 배치할 수 없어요`)
      expect(tiles(after), name).toBe(true)
      expect(boardTight({ ...slide, blocks: after }, undefined, h), name).toBe(false)
      expect(byReading(after).map((b) => b.id), name).toEqual(byReading(before).map((b) => b.id))
      expect(after.map(({ at: _at, ...b }) => b), name).toEqual(before.map(({ at: _at, ...b }) => b))
      const fit = boardFit(h, before)
      expect(boardCost(after, fit, h), name).toBeLessThanOrEqual(boardCost(before, fit, h) + 0.5)
      checked++
    }
    expect(checked).toBeGreaterThan(1000)
  }, 30000)
})

describe('기존 세네 컴포넌트 다시 배치', () => {
  it('글과 차트, 이미지가 섞여도 작성한 내용과 화면의 읽는 순서를 보존한다', () => {
    const slide = { ...makeSlide('compose'), fields: { title: '가상의 현황과 다음 단계' } }
    const h = composeAreaH(slide, undefined, true)
    const types: BlockType[] = ['message', 'text', 'bullets', 'number', 'stat', 'facts', 'trend', 'bars', 'share', 'image', 'decision', 'note']
    let seed = 7481
    const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0)
    let checked = 0
    for (let trial = 0; trial < 120; trial++) {
      const n = trial % 2 ? 4 : 3
      let before: Block[] | null = []
      for (let i = 0; i < n && before; i++) {
        const type = types[(random() >>> 8) % types.length]
        const b = sampleBlock(type)
        before = autoPlace(before, { ...b, id: `part-${i}` }, h)
      }
      if (!before || before.length !== n) continue
      const name = before.map((b) => b.type).join(' + ')
      const original = structuredClone(before)
      const after = rearrangeBlocks(before, h)
      // 읽는 순서를 지키는 후보가 없으면 재배치를 거절한다. 그때도 원래 판과 내용은 손대지 않는다.
      expect(before, name).toEqual(original)
      if (!after) continue
      expect(tiles(after), name).toBe(true)
      expect(boardTight({ ...slide, blocks: after }, undefined, h), name).toBe(false)
      expect(byReading(after).map((b) => b.id), name).toEqual(byReading(before).map((b) => b.id))
      expect(after.map(({ at: _at, ...b }) => b), name).toEqual(before.map(({ at: _at, ...b }) => b))
      expect(boardCost(after, boardFit(h, before), h), name).toBeLessThanOrEqual(boardCost(before, boardFit(h, before), h) + 0.5)
      checked++
    }
    expect(checked).toBeGreaterThan(30)
  }, 30000)
})

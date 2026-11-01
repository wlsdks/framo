import { describe, expect, it } from 'vitest'
import { sampleBlock } from '../blockSamples'
import { makeSlide } from '../generate'
import type { Block, BlockType } from '../types'
import { allSpots, autoPlace, boardTight, composeAreaH, moveAt, movingBase, removeBlock, tiles } from '../blocks'

describe('가상 컴포넌트를 계속 넣고 옮기고 빼기', () => {
  it('여러 순서에서도 다른 컴포넌트의 글을 잃거나 격자를 겹치지 않는다', () => {
    const slide = { ...makeSlide('compose'), fields: { title: '가상의 발표 편집' } }
    const height = composeAreaH(slide, undefined, true)
    const types: BlockType[] = ['number', 'text', 'bullets', 'ratio', 'facts', 'trend', 'decision', 'quote', 'kpi', 'image']
    let changes = 0
    for (let seed = 1; seed <= 8; seed++) {
      let state = seed
      const random = (n: number) => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0
        return Math.floor((state / 0x100000000) * n)
      }
      let board: Block[] = []
      for (let step = 0; step < 80; step++) {
        const previous = board
        const choice = random(3)
        let removed = ''
        if ((!board.length || choice === 0) && board.length < 4) {
          board = autoPlace(board, { ...sampleBlock(types[random(types.length)]), id: `fake-${seed}-${step}` }, height) ?? board
        } else if (choice === 1 && board.length >= 2) {
          const id = board[random(board.length)].id
          const spots = allSpots(movingBase(board, id, height))
          board = moveAt(board, id, { kind: 'spot', spot: spots[random(spots.length)] }, height) ?? board
        } else if (board.length) {
          removed = board[random(board.length)].id
          board = removeBlock(board, removed, height)
        }
        const label = `seed ${seed}, step ${step}`
        expect(tiles(board), label).toBe(true)
        expect(boardTight({ ...slide, blocks: board }, undefined, height), label).toBe(false)
        for (const old of previous.filter((b) => b.id !== removed)) {
          const now = board.find((b) => b.id === old.id)
          expect(now, label).toBeDefined()
          expect({ fields: now!.fields, items: now!.items, hints: now!.hints }, label).toEqual({ fields: old.fields, items: old.items, hints: old.hints })
        }
        if (board !== previous) changes++
      }
    }
    expect(changes).toBeGreaterThan(200)
  }, 30000)
})

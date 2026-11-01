import { describe, expect, it } from 'vitest'
import { sampleBlock } from '../blockSamples'
import { makeSlide } from '../generate'
import { BLOCK_TYPES, autoPlace, boardTight, composeAreaH, groupIssue, placeIssue } from '../blocks'
import { changeIssue, needRowsPx, overAlready, rowsFor } from './sizing'

describe('컴포넌트가 들어갈 높이', () => {
  it('본문 높이가 없거나 유효하지 않으면 들어갈 수 없다', () => {
    for (const height of [0, -1, -100, NaN, Infinity]) expect(rowsFor(100, height), String(height)).toBe(Infinity)
  })

  it('제목이 본문 높이를 모두 차지해도 높이 부족을 놓치지 않는다', () => {
    const slide = { ...makeSlide('compose'), fields: { title: '가상의 긴 제목 '.repeat(300) } }
    const blocks = autoPlace([], { ...sampleBlock('number'), id: 'part' })!
    expect(composeAreaH(slide, undefined, true)).toBeLessThan(0)
    expect(boardTight({ ...slide, blocks })).toBe(true)
  })

  it('본문 높이가 없을 때 너비 부족이 아니라 본문 높이 부족을 알린다', () => {
    for (const type of BLOCK_TYPES) for (const height of [0, -100]) {
      const block = { ...sampleBlock(type), id: 'part' }
      expect(autoPlace([], block, height), `${type} ${height}`).toBeNull()
      expect(placeIssue([], block, height), `${type} ${height}`).toMatchObject({ kind: 'height', noBody: true })
    }
  })

  it('기존 컴포넌트 변경과 저장한 묶음을 넣을 때도 본문 높이 부족으로 알린다', () => {
    const first = { ...sampleBlock('number'), id: 'first' }
    const second = { ...sampleBlock('message'), id: 'second' }
    const blocks = autoPlace([], first)!
    for (const height of [0, -100]) {
      expect(needRowsPx([], height)).toBe(0)
      expect(needRowsPx(blocks, height)).toBe(Infinity)
      expect(overAlready(blocks, height)).toBe(true)
      expect(groupIssue(blocks, [second], height)).toMatchObject({ kind: 'height', noBody: true, already: true })
      expect(changeIssue(blocks, 'first', (b) => ({ ...b, fields: { ...b.fields, label: '가상의 새 이름' } }), height)).toMatchObject({ kind: 'height', noBody: true, already: true })
    }
  })
})

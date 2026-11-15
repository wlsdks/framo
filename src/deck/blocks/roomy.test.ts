import { describe, expect, it } from 'vitest'
import { sampleBlock } from '../blockSamples'
import { makeSlide } from '../generate'
import type { Block, BlockType } from '../types'
import { allSpots, autoPlace, boardFit, composeAreaH, groupIssue, insertAt, insertParts, placeIssue, settle, validTargets, whyNot } from '../blocks'
import { blockMinH, roomyRows } from './sizing'

// 그림의 넉넉한 높이(sizing.ts의 ROOMY): 넣을 때만 지키고, 지킬 수 없으면 까닭(cramp)을 알리며 넣지 않는다
const H = composeAreaH({ ...makeSlide('compose'), fields: { title: '가상의 제목' } })
const part = (type: BlockType, id: string): Block => ({ ...sampleBlock(type), id })
const grow = (types: BlockType[]): Block[] => types.reduce<Block[]>((bs, t, i) => autoPlace(bs, part(t, `p${i}`), H) ?? bs, [])
const rowsOf = (bs: Block[], type: BlockType) => bs.find((b) => b.type === type)!.at!.h

describe('그림의 넉넉한 높이', () => {
  it('넷째 컴포넌트를 넣어도 방사형 비교는 넉넉한 높이를 지킨다', () => {
    const bs = grow(['radar', 'bullets', 'number', 'callout'])
    expect(bs).toHaveLength(4)
    const radar = bs.find((b) => b.type === 'radar')!
    expect(radar.at!.h).toBeGreaterThanOrEqual(roomyRows(radar, radar.at!.w, H))
  })

  it('넣는 차례가 달라도 넣을 수 있다: 끼울 자리가 없으면 판을 다시 짠다', () => {
    for (const order of [['bullets', 'number', 'radar'], ['callout', 'bullets', 'hub']] as BlockType[][]) {
      const before = grow(order.slice(0, 2))
      const figure = part(order[2], 'fig')
      // 끼울 자리는 어디에도 없다 (아래 새 줄은 낮다)
      expect(validTargets(before, figure, H)).toEqual([])
      expect(placeIssue(before, figure, H, false)).toEqual({ kind: 'cramp', type: order[2] })
      // 알아서 짠 판이면 다시 짜서 넣는다. 고르기의 표시(placeIssue)와 누를 때(autoPlace)가 같다
      const after = autoPlace(before, figure, H)
      expect(after, order.join()).not.toBeNull()
      expect(placeIssue(before, figure, H)).toBeNull()
      expect(rowsOf(after!, order[2])).toBeGreaterThanOrEqual(roomyRows(figure, 6, H))
      // 글과 차례는 그대로
      expect(after!.map((b) => b.id)).toEqual([...before.map((b) => b.id), 'fig'])
    }
  })

  it('지킬 수 없으면 넣지 않고, 눌리는 그림을 알린다', () => {
    const bs = grow(['hub', 'bullets', 'number'])
    const more = part('callout', 'more')
    expect(autoPlace(bs, more, H)).toBeNull()
    expect(placeIssue(bs, more, H)).toEqual({ kind: 'cramp', type: 'hub' })
    // 끌어 놓을 자리도 없다: 자리마다 높이가 모자라거나 그림이 눌린다
    const reasons = allSpots(bs).map((s) => whyNot(bs, { kind: 'spot', spot: s }, more, H)?.kind)
    expect(reasons).not.toContain(undefined)
    expect(reasons).toContain('cramp')
    expect(insertAt(bs, { at: bs[0].id, side: 'above' }, more, H)).toBeNull()
  })

  it('내 컴포넌트(묶음)를 넣을 때도 같다', () => {
    const bs = grow(['radar', 'bullets'])
    // 나란한 숫자 둘 (묶음은 제 짜임을 갖고 온다)
    const pair: Block[] = [
      { ...part('number', 'n1'), at: { x: 0, y: 0, w: 6, h: 12 } },
      { ...part('number', 'n2'), at: { x: 6, y: 0, w: 6, h: 12 } },
    ]
    expect(insertParts(bs, { at: null, side: 'below' }, pair, H)).toBeNull()
    expect(groupIssue(bs, pair, H)).toEqual({ kind: 'cramp', type: 'radar' })
  })

  it('이미 낮은 칸에 있는 그림은 지키지 않는다: 예전에 만든 장에도 넣을 수 있다', () => {
    // 예전 규칙으로 놓였거나 사람이 선을 끌어 낮춘 판: 방사형 비교가 위 절반, 목록이 아래 절반
    const low: Block[] = [
      { ...part('radar', 'r'), at: { x: 0, y: 0, w: 12, h: 7 } },
      { ...part('bullets', 'b'), at: { x: 0, y: 7, w: 12, h: 5 } },
    ]
    expect(low[0].at!.h).toBeLessThan(roomyRows(low[0], 12, H))
    const more = part('stat', 'more')
    expect(placeIssue(low, more, H)).toBeNull()
    expect(autoPlace(low, more, H, false)).not.toBeNull()
  })

  it('넣은 판은 판의 규칙으로 다시 놓아도 그대로다', () => {
    for (const order of [['radar', 'bullets', 'number', 'callout'], ['hub', 'number', 'number', 'number'], ['bullets', 'number', 'radar']] as BlockType[][]) {
      const bs = grow(order)
      expect(settle(bs, boardFit(H, bs))?.map((b) => b.at), order.join()).toEqual(bs.map((b) => b.at))
    }
  })

  it('본문이 낮은 장에서도 그림 하나는 넣을 수 있다', () => {
    for (const h of [300, 420, 520]) for (const type of ['radar', 'hub'] as BlockType[]) expect(placeIssue([], part(type, 'only'), h)?.kind, `${type} ${h}`).not.toBe('cramp')
  })

  it('한 줄을 혼자 쓰는 컴포넌트 아래에는 넓게 눕는 목록이 낮은 띠로 들어간다', () => {
    // 추진 일정(과제 넷, 430px) 아래에 남는 208px에 140px이면 되는 점 목록을 '슬라이드 높이를 넘어요'로 넣지 못했다
    for (const [solo, list] of [['gantt', 'bullets'], ['gantt', 'faq'], ['scorecard', 'bullets']] as BlockType[][]) {
      const bs = grow([solo, list])
      expect(bs.map((b) => b.type), `${solo} + ${list}`).toEqual([solo, list])
      const below = bs[1].at!
      expect(below.w).toBe(12)
      // 목록의 바닥(240px)보다 낮은 띠: 그 높이였으면 들어갈 줄이 모자랐다
      expect(below.h).toBeLessThan(5)
    }
  })

  it('그런 컴포넌트가 없는 판에서는 목록의 바닥 높이가 그대로다: 그림 옆에 둘 목록을 그림 아래의 띠로 보내지 않는다', () => {
    const list = part('bullets', 'b')
    expect(blockMinH(list, 12)).toBeGreaterThanOrEqual(240)
    expect(blockMinH(list, 12, true)).toBeLessThan(240)
    const bs = grow(['radar', 'bullets'])
    const radar = bs.find((b) => b.type === 'radar')!.at!
    const bullets = bs.find((b) => b.type === 'bullets')!.at!
    // 나란히: 방사형 비교는 판 높이를 다 쓴다
    expect(radar.h).toBe(12)
    expect(bullets.y).toBe(0)
    expect(radar.w + bullets.w).toBe(12)
  })
})

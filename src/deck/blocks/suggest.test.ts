import { describe, expect, it } from 'vitest'
import { makeSlide } from '../generate'
import { BLOCK_EFFECT_IDS, BLOCKS, effectChoices } from './catalog'
import { findBlocks, findCines, suggestBlocks, suggestCine } from './suggest'
import type { Block, Slide } from '../types'

const slideWith = (title: string, lead = '', blocks?: Block[]): Slide => {
  const s = makeSlide('compose')
  return { ...s, fields: { ...s.fields, title, lead }, ...(blocks ? { blocks } : {}) }
}
const block = (type: Block['type']): Block => ({ id: `b-${type}`, type, fields: {}, items: [] }) as Block

describe('컴포넌트 찾기', () => {
  it('이름과 설명, 묶음의 낱말로 찾는다', () => {
    expect(findBlocks('막대')).toContain('bars')
    expect(findBlocks('일정표')).toContain('gantt')
    expect(findBlocks('인용')).toContain('quote')
  })

  it('비슷한 말로도 찾는다: 사람은 순서라고 찾는데 카드는 단계, 흐름이라고 적혀 있다', () => {
    expect(findBlocks('순서')).toEqual(expect.arrayContaining(['process', 'steps']))
    expect(findBlocks('비교')).toEqual(expect.arrayContaining(['compare', 'versus']))
    expect(findBlocks('숫자')).toEqual(expect.arrayContaining(['number', 'kpi']))
  })

  it('이름에 맞은 것이 먼저이고, 흔한 말로 찾아도 목록이 끝없이 길지 않다', () => {
    // 움직임 설명까지 보던 때는 '순서'로 찾으면 '줄마다 차례로 들어와요'인 카드가 모두 걸려 마흔 개 넘게 나왔다
    for (const q of ['순서', '비교', '숫자', '일정', '사람']) expect(findBlocks(q).length, `${q}: ${findBlocks(q).join(', ')}`).toBeLessThanOrEqual(16)
    expect(findBlocks('순서').slice(0, 4)).toEqual(expect.arrayContaining(['process']))
    expect(findBlocks('막대')[0]).toMatch(/^(bars|meter)$/)
  })

  it('띄어 쓴 말은 모두 맞아야 하고, 맞는 것이 없으면 빈 목록', () => {
    expect(findBlocks('')).toEqual([])
    expect(findBlocks('   ')).toEqual([])
    expect(findBlocks('홀로그램우주선')).toEqual([])
    const both = findBlocks('막대 목표')
    expect(both.length).toBeGreaterThan(0)
    expect(both.length).toBeLessThan(findBlocks('막대').length)
  })
})

describe('이 슬라이드에 어울리는 것', () => {
  it('제목의 낱말로 고른다', () => {
    expect(suggestBlocks(slideWith('3분기 일정과 로드맵'))[0]).toBe('gantt')
    expect(suggestBlocks(slideWith('지금 방식과 바꾼 방식 비교'))[0]).toBe('compare')
    expect(suggestBlocks(slideWith('일하는 순서', '네 단계로 나눠요'))).toContain('process')
  })

  it('맞는 것이 없으면 흔히 쓰는 것, 늘 n개까지, 이미 든 것과 넣을 수 없는 것은 빼고', () => {
    const plain = suggestBlocks(slideWith(''))
    expect(plain).toEqual(['message', 'number', 'bars', 'process'])
    const some = suggestBlocks(slideWith('', '', [block('message')]), 4, (t) => t === 'bars')
    expect(some).not.toContain('message')
    expect(some).not.toContain('bars')
    expect(some.length).toBe(4)
    for (const t of some) expect(Object.hasOwn(BLOCKS, t)).toBe(true)
    expect(new Set(some).size).toBe(some.length)
  })

  it('차트만 든 장에는 결론 한 줄을 먼저 권한다', () => {
    expect(suggestBlocks(slideWith('', '', [block('bars')]))[0]).toBe('message')
  })
})

describe('모션 그래픽 틀 찾기와 어울리는 틀', () => {
  it('모션 그래픽이나 영화로 찾으면 틀 여섯이, 틀 이름이나 어울리는 장으로 찾으면 그 틀이 나온다', () => {
    expect(findCines('모션 그래픽')).toHaveLength(6)
    expect(findCines('영화')).toHaveLength(6)
    expect(findCines('갈림길')).toEqual(['fork'])
    expect(findCines('누적')).toEqual(['fill'])
    expect(findCines('')).toEqual([])
    expect(findCines('막대')).toEqual([])
  })

  it('장의 글에 맞는 틀: 고른 안은 갈림길, 바뀐 값은 그어지는 선, 쌓아 온 것은 차오름', () => {
    expect(suggestCine(slideWith('세 안 가운데 B안을 골랐어요'))).toBe('fork')
    expect(suggestCine(slideWith('적응 기간', '10주에서 6주로 줄었어요'))).toBe('stroke')
    expect(suggestCine(slideWith('세 해 동안 모은 제안 2,400건'))).toBe('fill')
    expect(suggestCine(slideWith('전사로 확산됐어요'))).toBe('diffuse')
  })

  it('글이 없으면 짜임으로: 큰 숫자 장은 확산, 맞는 것이 없거나 이미 모션 그래픽이 있으면 없다', () => {
    expect(suggestCine(makeSlide('kpi'))).toBe('diffuse')
    expect(suggestCine(slideWith('', '', [block('delta')]))).toBe('stroke')
    expect(suggestCine(slideWith(''))).toBeNull()
    expect(suggestCine(slideWith('세 안 가운데 B안을 골랐어요', '', [block('cine')]))).toBeNull()
  })
})

describe('컴포넌트 모션 고르기의 처음 목록', () => {
  it('기본과 없음, 종류에 어울리는 둘만 먼저. 튀어나오기와 한 글자씩은 늘 더 보기에', () => {
    for (const type of ['message', 'bars', 'number', 'hub'] as const) {
      const { first, more } = effectChoices(type)
      expect(first.length, type).toBeLessThanOrEqual(4)
      expect(first[0]).toBe('auto')
      expect(first).toContain('none')
      expect(more).toEqual(expect.arrayContaining(['pop', 'letters']))
      expect([...first, ...more].sort()).toEqual(BLOCK_EFFECT_IDS.slice().sort())
    }
  })
})

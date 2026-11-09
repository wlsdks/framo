import { describe, expect, it } from 'vitest'
import { makeBlock } from '../../deck/blocks'
import { makeSlide } from '../../deck/generate'
import { cineGoesNext } from './cineEdit'

describe('모션 그래픽을 넣을 자리', () => {
  it('빈 장은 이 장에: 장 제목과 부제만 적었어도 빈 장이다', () => {
    expect(cineGoesNext(makeSlide('compose'))).toBe(false)
    expect(cineGoesNext(makeSlide('kpi'))).toBe(false)
    const titled = makeSlide('kpi')
    expect(cineGoesNext({ ...titled, fields: { ...titled.fields, title: '숫자로 보는 성과', lead: '올해 상반기' } })).toBe(false)
  })

  it('다른 내용(글이나 컴포넌트)이 있으면 다음에 새 장으로: 숫자 아래 작은 상자로 끼지 않게', () => {
    const kpi = makeSlide('kpi')
    expect(cineGoesNext({ ...kpi, items: kpi.items.map((it, i) => (i === 0 ? { ...it, value: '40%' } : it)) })).toBe(true)
    expect(cineGoesNext({ ...makeSlide('compose'), blocks: [makeBlock('message')] })).toBe(true)
  })

  it('컴포넌트를 넣지 않는 장(표지, 섹션)은 늘 다음 장에', () => {
    expect(cineGoesNext(makeSlide('cover'))).toBe(true)
    expect(cineGoesNext(makeSlide('section'))).toBe(true)
  })
})

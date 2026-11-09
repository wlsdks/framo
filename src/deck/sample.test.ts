import { describe, expect, it } from 'vitest'
import { tidyCines } from './cine'
import { unknownParts } from './compat'
import { createSampleDeck, layoutSampleDeck, SAMPLE_LOGOS, SAMPLE_TITLE } from './sample'
import { sceneOf } from './scenes'
import { showcaseSlides } from './showcase'
import type { Block, BlockType } from './types'

/** '12,000시간' → 12000 */
const num = (s: string) => Number(s.replace(/[^\d.]/g, ''))

describe('예시 발표(홈의 완성된 예시 보기)', () => {
  const deck = createSampleDeck()
  const blocks = deck.slides.flatMap((s) => s.blocks ?? [])
  const cine = (preset: string): Block => blocks.find((b) => b.type === 'cine' && deck.cines?.[b.cine!]?.preset === preset)!
  const block = (type: BlockType): Block => blocks.find((b) => b.type === type)!

  it('예전 예시와 이름이 달라서 손대지 않은 예전 예시가 새 예시로 바뀐다', () => {
    // 홈(Home.tsx의 openSample)은 이름이 다른, 손대지 않은 예전 예시만 새 예시로 바꾼다. 예시를 새로 짤 때마다 이 목록에 예전 이름을 더한다
    const earlier = ['예시: 한빛제조 품질 관리 제안', '예시: 한빛제조 품질 관리 제안 계획', '예시: 주간 회의 줄이기 개선 제안']
    expect(deck.title).toBe(SAMPLE_TITLE)
    expect(earlier).not.toContain(deck.title)
  })

  it('이 버전이 모두 아는 것으로 짜여 열면 그대로 고칠 수 있다', () => {
    expect(unknownParts(deck)).toBe(0)
    // 쓰는 레시피만 품는다(남는 레시피도 빠진 레시피도 없다)
    expect(tidyCines(deck)).toBe(deck)
    for (const b of blocks.filter((x) => x.type === 'cine')) expect(deck.cines?.[b.cine!]).toBeDefined()
  })

  it('같은 그림을 되풀이하지 않는다: 모션 그래픽은 틀마다 한 번, 컴포넌트도 종류마다 한 번, 장면도 한 번씩', () => {
    const presets = blocks.filter((b) => b.type === 'cine').map((b) => deck.cines![b.cine!].preset)
    expect(presets.length).toBeGreaterThanOrEqual(2)
    expect(new Set(presets).size).toBe(presets.length)
    const types = blocks.filter((b) => b.type !== 'cine').map((b) => b.type)
    expect(new Set(types).size).toBe(types.length)
    const scenes = deck.slides.flatMap((s) => (s.options.scene ? [s.options.scene] : []))
    expect(new Set(scenes).size).toBe(scenes.length)
    // 골라 둔 장면은 모두 그 장에 맞는다(맞지 않으면 쉬어서 보이지 않는다)
    for (const s of deck.slides) if (s.options.scene) expect(sceneOf(s), s.purpose).toBe(s.options.scene)
  })

  it('모든 장에 그대로 읽어도 되는 발표자 노트가 있다', () => {
    for (const s of deck.slides) expect(s.notes.length, s.purpose).toBeGreaterThan(10)
  })

  it('숫자가 서로 맞는다: 회의 시간의 조각, 몇 중 몇, 한 해에 돌려받는 시간', () => {
    const split = block('split')
    const slide = deck.slides.find((s) => s.blocks?.includes(split))!
    const total = split.items.reduce((n, it) => n + num(it.value), 0)
    expect(slide.fields.title).toContain(`${total}시간`)
    // 열에 일곱: 80명 가운데 58명
    const ratio = block('ratio')
    const [all, of] = [...ratio.fields.note.matchAll(/(\d+)명/g)].map((m) => Number(m[1]))
    expect(Math.round((of / all) * Number(ratio.fields.total))).toBe(Number(ratio.fields.value))
    // 한 해에 돌려받는 시간 = 한 사람이 한 주에 아끼는 시간 × 사람 × 주
    const { value, sub } = cine('diffuse').fields
    const [hours, people, weeks] = [...sub.matchAll(/(\d+)(시간|명|주)/g)].map((m) => Number(m[1]))
    expect(num(value)).toBe(hours * people * weeks)
  })
})

describe('레이아웃 장으로 짠 판(장 모음과 시험)', () => {
  it('모두 레이아웃 장이다', () => {
    expect(layoutSampleDeck().slides.every((s) => s.layout !== 'compose')).toBe(true)
  })

  it('진행 회의 감소율은 전후 시간과 맞는다', () => {
    const item = layoutSampleDeck().slides.flatMap((slide) => slide.items).find((i) => i.title === '줄어드는 진행 회의 시간')!
    const [before, after] = [...item.body.matchAll(/(\d+)분/g)].map((m) => Number(m[1]))
    expect(Number.parseInt(item.value, 10)).toBe(Math.round(((before - after) / before) * 100))
  })
})

it('예시 로고와 업체 설명은 특정 회사 이름 대신 가상 표기를 쓴다', () => {
  expect(SAMPLE_LOGOS).toHaveLength(8)
  SAMPLE_LOGOS.forEach((logo, i) => {
    const svg = decodeURIComponent(logo.slice(logo.indexOf(',') + 1))
    expect(svg).toContain(`>가상 ${String.fromCharCode(65 + i)}</text>`)
  })
  const clients = showcaseSlides().map((slide) => slide.fields.client).filter(Boolean)
  expect(clients.length).toBeGreaterThan(0)
  expect(clients.every((client) => client.includes('가상'))).toBe(true)
})

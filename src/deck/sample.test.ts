import { expect, it } from 'vitest'
import { createSampleDeck, SAMPLE_LOGOS } from './sample'
import { showcaseSlides } from './showcase'

it('예시 발표의 진행 회의 감소율은 전후 시간과 맞는다', () => {
  const item = createSampleDeck().slides.flatMap((slide) => slide.items).find((i) => i.title === '줄어드는 진행 회의 시간')!
  const [before, after] = [...item.body.matchAll(/(\d+)분/g)].map((m) => Number(m[1]))
  expect(Number.parseInt(item.value, 10)).toBe(Math.round((before - after) / before * 100))
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

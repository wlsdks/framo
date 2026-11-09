import { describe, expect, it } from 'vitest'
import { BLUEPRINTS } from './blueprints'
import { filledFromHints } from './filled'
import { recipeSlide } from './generate'
import { DROP_ROW } from './layouts'
import type { DeckType } from './types'

const slideOf = (type: DeckType, purpose: string) => recipeSlide(BLUEPRINTS[type].recipes.find((r) => r.purpose === purpose)!)

describe('예시대로 채운 장 (프레임 잡기의 미리 보기)', () => {
  it('줄마다의 예시는 채우고, 칸의 기본 설명(짧은 설명이나 원인, 출처)은 비운다', () => {
    const s = filledFromHints(slideOf('result', '목표 대비 결과'), true)
    expect(s.fields.title).toBe('네 목표 중 세 개를 이뤘어요')
    expect(s.items.map((it) => it.title)).toEqual(['적응 기간', '참여 팀', '교육 이수율', '비용'])
    expect(s.items[0].value).toBe('6주')
    expect(s.items.every((it) => !it.body)).toBe(true)
    expect(s.fields.source ?? '').toBe('')
  })

  it("'(예: …)'는 예시만, '-ㄴ지/-ㄹ지'로 끝나는 설명과 지워도 되는 줄은 비운다", () => {
    const s = filledFromHints(slideOf('result', '요청 사항'), true)
    expect(s.items[0].title).toBe('전사 확대 승인')
    expect(s.items[0].body).toBe('')
    const last = s.items[s.items.length - 1]
    expect(Object.values(slideOf('result', '요청 사항').hints)).toContain(DROP_ROW)
    expect([last.title, last.body].join('')).toBe('')
  })

  it('갤러리의 검사(examplesOnly 없이)는 꼭 채울 칸을 설명으로도 채운다', () => {
    const s = filledFromHints(slideOf('decide', '지금의 불편'))
    const strict = filledFromHints(slideOf('decide', '지금의 불편'), true)
    expect(s.items.some((it) => it.body === '어떻게 잰 숫자인지')).toBe(true)
    expect(strict.items.some((it) => it.body === '어떻게 잰 숫자인지')).toBe(false)
  })
})

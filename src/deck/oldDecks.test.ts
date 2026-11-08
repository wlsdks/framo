import { describe, expect, it } from 'vitest'
import { unknownParts } from './compat'
import v040 from './fixtures/deck-v0.4.0.json'
import v042 from './fixtures/deck-v0.4.2.json'
import v050 from './fixtures/deck-v0.5.0.json'
import v051 from './fixtures/deck-v0.5.1.json'
import v052 from './fixtures/deck-v0.5.2.json'
import v053 from './fixtures/deck-v0.5.3.json'
import v054 from './fixtures/deck-v0.5.4.json'
import v055 from './fixtures/deck-v0.5.5.json'
import { migrateDeck } from './migrate'
import type { Deck } from './types'

// 예전에 내놓은 버전이 실제로 저장한 발표(그 버전의 코드로 만든 것: 예시 발표, 장 모음의 모든 장과 그 장을 바꾼 컴포넌트 장,
// 컴포넌트마다 한 장, 발표 종류마다 프레임 잡기가 만든 발표)를 지금 버전이 그대로 연다. 글은 모두 지어낸 것이고 이미지는 1px로 바꿔 두었다.
// v0.4.0은 컴포넌트 장이 줄(rows)이던 판 전, v0.4.2는 판(at)이다. 새 버전을 내놓을 때 그 버전의 파일도 더한다.
// v0.5.3부터는 고른 값(테마의 글꼴·글자 크기·아래 표시·전환, 장마다의 바탕·강조·모양·장면·차례, 컴포넌트의 바탕·움직임·
// 이음표)을 모두 넣은 발표(chosen)도 그 버전의 코드로 만들어 둔다. 예시 발표는 기본값뿐이라 고른 값이 사라져도 몰랐다
type Release = { rich: Deck; made: Deck[]; chosen?: Deck }
const RELEASES: [string, Release][] = [
  ['v0.4.0', v040 as unknown as Release],
  ['v0.4.2', v042 as unknown as Release],
  ['v0.5.0', v050 as unknown as Release],
  ['v0.5.1', v051 as unknown as Release],
  ['v0.5.2', v052 as unknown as Release],
  ['v0.5.3', v053 as unknown as Release],
  ['v0.5.4', v054 as unknown as Release],
  ['v0.5.5', v055 as unknown as Release],
]

/** 사람이 고른 값: 발표 전체, 장마다, 컴포넌트마다 */
function chosenValues(deck: Deck) {
  return {
    theme: deck.theme,
    motion: deck.motion,
    aiShare: deck.aiShare,
    slides: deck.slides.map((s) => ({ id: s.id, variant: s.variant, options: s.options })),
    blocks: deck.slides.flatMap((s) =>
      (s.blocks ?? []).map((b) => ({ id: b.id, look: b.look, effect: b.effect, when: b.when, speed: b.speed, from: b.from, variant: b.variant, highlight: b.highlight, link: b.link, linkBelow: b.linkBelow })),
    ),
  }
}

/** 사람이 적은 글: 칸, 항목, 컴포넌트(줄 안의 컴포넌트도) 안의 글. id와 이미지는 뺀다 */
function written(deck: Deck): string[] {
  const out: string[] = []
  const walk = (v: unknown) => {
    if (typeof v === 'string') {
      if (v.trim() && !v.startsWith('data:')) out.push(v)
    } else if (Array.isArray(v)) v.forEach(walk)
    else if (v && typeof v === 'object') for (const x of Object.values(v)) walk(x)
  }
  for (const s of deck.slides) {
    walk(s.fields)
    walk(s.items)
    walk(s.notes)
    const blocks = [...(s.blocks ?? []), ...((s as { rows?: { blocks: unknown[] }[] }).rows ?? []).flatMap((r) => r.blocks)] as { fields?: unknown; items?: unknown }[]
    for (const b of blocks) {
      walk(b.fields)
      walk(b.items)
    }
  }
  return out.sort()
}

describe('예전 버전의 발표', () => {
  it('v0.5.3부터는 고른 값을 모두 넣은 발표가 있다', () => {
    expect(RELEASES.find(([v]) => v === 'v0.5.3')![1].chosen?.slides.length).toBeGreaterThan(50)
  })

  for (const [version, { rich, made, chosen }] of RELEASES) {
    if (chosen)
      it(`${version}에서 고른 값을 그대로 연다 (테마, 장의 설정과 모양, 컴포넌트의 바탕·움직임·이음표)`, () => {
        expect(chosenValues(migrateDeck(structuredClone(chosen)))).toEqual(chosenValues(chosen))
      })

    it(`${version}에서 만든 발표를 막지 않고 열어, 장과 글을 하나도 잃지 않는다`, () => {
      for (const deck of [rich, ...made, ...(chosen ? [chosen] : [])]) {
        expect(unknownParts(deck), `${version} ${deck.title}`).toBe(0)
        const now = migrateDeck(structuredClone(deck))
        expect(now.slides.map((s) => s.id)).toEqual(deck.slides.map((s) => s.id))
        expect(written(now)).toEqual(written(deck))
        // 연 뒤에는 지금 꼴: 컴포넌트 장은 모두 판 위에
        expect(now.slides.every((s) => !('rows' in s) && (s.layout !== 'compose' || s.blocks!.every((b) => b.at)))).toBe(true)
        expect(unknownParts(now)).toBe(0)
      }
    })
  }
})

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
import v060 from './fixtures/deck-v0.6.0.json'
import { migrateDeck } from './migrate'
import type { Deck } from './types'

// 예전에 내놓은 버전이 실제로 저장한 발표(그 버전의 코드로 만든 것: 예시 발표, 장 모음의 모든 장과 그 장을 바꾼 컴포넌트 장,
// 컴포넌트마다 한 장, 발표 종류마다 프레임 잡기가 만든 발표)를 지금 버전이 그대로 연다. 글은 모두 지어낸 것이고 이미지는 1px로 바꿔 두었다.
// v0.4.0은 컴포넌트 장이 줄(rows)이던 판 전, v0.4.2는 판(at)이다. 새 버전을 내놓을 때 그 버전의 파일도 더한다.
// v0.5.3부터는 고른 값(테마의 글꼴·글자 크기·아래 표시·전환, 장마다의 바탕·강조·모양·장면·차례, 컴포넌트의 바탕·움직임·
// 이음표)을 모두 넣은 발표(chosen)도 그 버전의 코드로 만들어 둔다. 예시 발표는 기본값뿐이라 고른 값이 사라져도 몰랐다.
// v0.6.0부터는 장의 배경(종류·자리·짙기), AI에게 숨긴 장과 컴포넌트, 발표에서 숨긴 장, 내 PC 글꼴, 컴포넌트의 항목 하나씩 보이기,
// 모션 그래픽(틀 넷의 레시피와 손잡이, 장 제목은 모션 그래픽 다음에)도 고른 값에 든다
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
  ['v0.6.0', v060 as unknown as Release],
]

/** 사람이 고른 값: 발표 전체(모션 그래픽의 레시피도), 장마다(배경, 숨기기도), 컴포넌트마다(쓰는 레시피의 버전도) */
function chosenValues(deck: Deck) {
  return {
    theme: deck.theme,
    motion: deck.motion,
    aiShare: deck.aiShare,
    cines: deck.cines,
    slides: deck.slides.map((s) => ({ id: s.id, variant: s.variant, options: s.options, backdrop: s.backdrop, hidden: s.hidden })),
    blocks: deck.slides.flatMap((s) =>
      (s.blocks ?? []).map((b) => ({
        id: b.id,
        look: b.look,
        effect: b.effect,
        when: b.when,
        speed: b.speed,
        reveal: b.reveal,
        from: b.from,
        variant: b.variant,
        highlight: b.highlight,
        link: b.link,
        linkBelow: b.linkBelow,
        cine: b.cine,
      })),
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

  it('v0.6.0부터는 고른 값에 배경, 숨기기, 모션 그래픽이 들어 있다', () => {
    const { slides, cines, theme } = RELEASES.find(([v]) => v === 'v0.6.0')![1].chosen!
    const blocks = slides.flatMap((s) => s.blocks ?? [])
    expect(new Set(slides.map((s) => s.backdrop?.kind).filter(Boolean)).size).toBe(3)
    expect(slides.some((s) => s.backdrop?.at && s.backdrop.strength)).toBe(true)
    expect(slides.some((s) => s.options.aiHidden) && slides.some((s) => s.options.aiHiddenBlocks?.length) && slides.some((s) => s.hidden)).toBe(true)
    expect(blocks.some((b) => b.reveal === 'each')).toBe(true)
    expect(theme.localFont).toBeTruthy()
    // 틀 넷의 레시피를 모두 쓰고, 손잡이(장 제목은 모션 그래픽 다음에도)를 고른 값으로
    expect(new Set(blocks.filter((b) => b.type === 'cine').map((b) => cines?.[b.cine!]?.preset))).toEqual(new Set(['light', 'diffuse', 'gather', 'stroke']))
    expect(Object.values(cines!).every((r) => r.headAfter)).toBe(true)
  })

  for (const [version, { rich, made, chosen }] of RELEASES) {
    if (chosen)
      it(`${version}에서 고른 값을 그대로 연다 (테마, 장의 설정과 모양과 배경, 컴포넌트의 바탕·움직임·이음표, 모션 그래픽)`, () => {
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

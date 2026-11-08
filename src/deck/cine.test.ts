import { describe, expect, it } from 'vitest'
import { cleanBlock } from './blocks'
import {
  CINE_ENGINE,
  CINE_FIELDS,
  CINE_MAX_MS,
  CINE_PRESETS,
  cineId,
  cineScript,
  cleanCines,
  cleanRecipe,
  isCineId,
  knobsFor,
  knobValue,
  presetRecipe,
  spansOf,
  tidyCines,
  withKnob,
} from './cine'
import { unknownParts } from './compat'
import { createSampleDeck } from './sample'
import { migrateDeck } from './migrate'
import type { CineRecipe, Deck } from './types'

/** 레시피 안의 모든 글(열쇠와 값) */
function strings(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') out.push(v)
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out))
  else if (v && typeof v === 'object')
    for (const [k, x] of Object.entries(v)) {
      out.push(k)
      strings(x, out)
    }
  return out
}

function deckWith(recipe: CineRecipe, extra: Record<string, CineRecipe> = {}): Deck {
  const deck = createSampleDeck()
  const id = cineId(recipe)
  const slide = { ...deck.slides[0], id: 'c1', layout: 'compose' as const, blocks: [{ id: 'b1', type: 'cine' as const, fields: { glyph: 'N' }, items: [], cine: id, at: { x: 0, y: 0, w: 12, h: 12 } }] }
  return { ...deck, slides: [slide, ...deck.slides.slice(1)], cines: { [id]: recipe, ...extra } }
}

describe('모션 그래픽 레시피', () => {
  it('틀 넷은 모두 그릴 수 있고, 첫 연출은 한도(10초) 안이다', () => {
    expect(CINE_PRESETS.map((p) => p.id)).toEqual(['light', 'diffuse', 'gather', 'stroke'])
    for (const p of CINE_PRESETS) {
      const r = presetRecipe(p.id, 'l1')
      const s = cineScript(r)!
      expect(s, p.id).not.toBeNull()
      expect(Math.max(...spansOf(r.phases).map((x) => x.end)), p.id).toBeLessThanOrEqual(CINE_MAX_MS)
      expect(s.total, p.id).toBeLessThanOrEqual(CINE_MAX_MS)
      // 글 칸은 정해진 낱말뿐이고 틀의 예시 글도 그 칸에만 있다
      for (const t of s.texts) expect(CINE_FIELDS).toContain(t.key)
      expect(Object.keys(p.sample).every((k) => s.texts.some((t) => t.key === k))).toBe(true)
      // 차분하게(엔진이 줄인다)와 상관없이 생동감 기준으로도 다 맺히고 머문다: 끝난 뒤의 되풀이는 12초 넘는 주기
      expect(s.spans[0].start).toBe(0)
    }
  })

  it('레시피에는 글이 없다: 열쇠와 값의 글은 모두 정해진 낱말 꼴이다', () => {
    for (const p of CINE_PRESETS) for (const w of strings(presetRecipe(p.id, 'abc123'))) expect(w, p.id).toMatch(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,31}$/)
  })

  it('파일에서 읽은 레시피는 사람의 글을 빼고, 모르는 값(새 버전의 것)은 남긴다', () => {
    const raw = {
      ...presetRecipe('light', 'l1'),
      engine: 3,
      // 사람이 쓴 글이 섞여 든 파일: 빈칸이나 한글이 든 글은 낱말이 아니라 빠진다
      title: '올해 매출 비밀 계획',
      shape: { kind: 'glyph', field: 'glyph', note: '비밀 메모 한 줄' },
      // 새 엔진의 층
      haze: { amount: 0.4, kind: 'bloom' },
    }
    const r = cleanRecipe(raw)!
    expect(JSON.stringify(r)).not.toMatch(/비밀/)
    expect((r as unknown as { haze: unknown }).haze).toEqual({ amount: 0.4, kind: 'bloom' })
    expect(r.engine).toBe(3)
    expect(cleanRecipe({ engine: 1 })).toBeNull()
    expect(cleanRecipe('light')).toBeNull()
  })

  it('더 새 엔진의 레시피도 아는 층만 그린다: 모르는 구간은 그 시간만큼 머물고 차례와 때는 그대로', () => {
    const r = { ...presetRecipe('light', 'l1'), engine: CINE_ENGINE + 1, phases: [{ kind: 'seed', ms: 400 }, { kind: 'warp', ms: 600 }, { kind: 'gather', ms: 1000, overlap: 100 }] } as unknown as CineRecipe
    const s = cineScript(r)!
    expect(s.spans.map((x) => x.kind)).toEqual(['seed', 'hold', 'gather'])
    expect(s.spans[2]).toMatchObject({ start: 900, end: 1900 })
  })

  it('구간은 앞 구간이 끝나기 overlap만큼 전에 시작한다', () => {
    const s = spansOf([{ kind: 'seed', ms: 500 }, { kind: 'spread', ms: 1000, overlap: 200 }, { kind: 'gather', ms: 800, overlap: 2000 }])
    expect(s).toEqual([
      { kind: 'seed', start: 0, end: 500 },
      { kind: 'spread', start: 300, end: 1300 },
      // 겹침이 앞 구간보다 길면 0에서 시작한다
      { kind: 'gather', start: 0, end: 800 },
    ])
  })

  it('버전 id는 내용 해시다: 열쇠 차례와 상관없이 같고, 하나라도 다르면 다르다', () => {
    const a = presetRecipe('diffuse', 'l1')
    const b = Object.fromEntries(Object.entries(a).reverse()) as unknown as CineRecipe
    expect(cineId(a)).toBe(cineId(b))
    expect(isCineId(cineId(a))).toBe(true)
    expect(cineId(withKnob(a, 'pace', 'fast'))).not.toBe(cineId(a))
    expect(cineId(presetRecipe('diffuse', 'l2'))).not.toBe(cineId(a))
    expect(isCineId('c-not-a-hash')).toBe(false)
  })

  it('손잡이: 모양을 바꾸면 남는 선과 모양을 딸 칸이 함께 바뀌고, 숫자 굴리기는 숫자 칸에만', () => {
    const light = presetRecipe('light', 'l1')
    expect(knobValue(light, 'shape')).toBe('glyph')
    const ring = withKnob(light, 'shape', 'ring')
    expect(ring.shape).toEqual({ kind: 'ring' })
    expect(withKnob(ring, 'shape', 'glyph').shape).toEqual({ kind: 'glyph', field: 'glyph' })
    expect(withKnob(presetRecipe('stroke', 'l1'), 'shape', 'wave').line).toBe(true)
    // 제목은 써지기 → 한 글자씩. 숫자 굴리기는 제목에 고를 수 없다
    expect(knobValue(withKnob(light, 'enter', 'letters'), 'enter')).toBe('letters')
    expect(knobValue(withKnob(light, 'enter', 'count'), 'enter')).toBe('write')
    expect(knobValue(withKnob(presetRecipe('diffuse', 'l1'), 'enter', 'settle'), 'enter')).toBe('settle')
    // 번지는 구간이 없는 틀에는 번지는 모양 손잡이가 없다
    expect(knobsFor(light)).toContain('spread')
    expect(knobsFor(presetRecipe('gather', 'l1'))).not.toContain('spread')
    // 손잡이는 새 레시피를 만든다(원래 것은 그대로)
    expect(light.shape.kind).toBe('glyph')
  })

  it('발표를 열 때 꼴이 맞는 레시피만 남기고 쓰지 않는 버전은 뺀다', () => {
    const used = presetRecipe('light', 'l1')
    const unused = presetRecipe('stroke', 'l2')
    const deck = deckWith(used, { [cineId(unused)]: unused, cbadbadbadba: { engine: 'x' } as unknown as CineRecipe })
    const opened = migrateDeck(deck)
    expect(Object.keys(opened.cines ?? {})).toEqual([cineId(used)])
    expect(opened.slides[0].blocks![0].cine).toBe(cineId(used))
    expect(tidyCines({ slides: [], cines: { [cineId(used)]: used } })).toEqual({ slides: [] })
    expect(cleanCines({ 'not-an-id': used })).toBeUndefined()
  })

  it('이 버전은 모션 그래픽이 든 발표를 그대로 연다. 버전 id 꼴이 아닌 값은 빼며 센다', () => {
    const deck = deckWith(presetRecipe('gather', 'l1'))
    expect(unknownParts(deck)).toBe(0)
    const lost = { n: 0 }
    expect(cleanBlock({ id: 'b', type: 'cine', fields: {}, items: [], cine: 'oops' }, { left: 10 }, lost)?.cine).toBeUndefined()
    expect(lost.n).toBe(1)
    // 모션 그래픽이 아닌 부품에 붙은 레시피 id도 뺀다
    expect(cleanBlock({ id: 'b', type: 'text', fields: {}, items: [], cine: cineId(presetRecipe('light', 'l')) }, { left: 10 })?.cine).toBeUndefined()
  })
})

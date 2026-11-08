// 이 장의 움직임을 다른 장에도: 한 장을 공들여 짠 뒤 같은 모양의 장마다 하나하나 다시 고르지 않게.
// 새 값을 저장하지 않는다. 장의 움직임 정도, 장 넘기기, 장면과 (컴포넌트 장이면) 연출과 컴포넌트 종류마다의 움직임을
// 이미 있는 자리에 옮겨 적는 것이라 예전 버전, 내보낸 HTML, AI 모양 파일이 그대로 읽는다.
// 글은 건드리지 않는다: 옮기는 것은 고르는 값(enum)뿐이다

import { currentPreset, presetFits, withPreset, type MotionPreset } from './blocks'
import { sceneFits, sceneOf } from './scenes'
import type { Block, BlockType, Deck, Slide } from './types'

/** 컴포넌트마다 옮기는 움직임 값. 언제(when)와 나오는 차례는 연출이 정한다 */
type BlockMotion = Pick<Block, 'effect' | 'speed' | 'from'>

interface MotionCopyRow {
  slideId: string
  /** 장 번호 (1부터, 숨긴 장도 센다: 슬라이드 목록과 같게) */
  page: number
  /** 이 장과 모양(레이아웃)이 같은 장. 처음에 이것만 골라 둔다 */
  same: boolean
  /** 이 장의 장면이 그 장에는 맞지 않아 그 장의 장면을 그대로 둔다 */
  sceneSkipped: boolean
}

/** 모양이 같은 장: 레이아웃이 같으면(컴포넌트 장끼리도) 같은 연출이 같은 뜻으로 움직인다 */
const sameShape = (a: Slide, b: Slide) => a.layout === b.layout

/** 옮길 수 있는 장들 (이 장과 숨긴 장 빼고, 장 차례대로) */
export function planMotionCopy(deck: Pick<Deck, 'slides'>, fromId: string): MotionCopyRow[] {
  const from = deck.slides.find((s) => s.id === fromId)
  if (!from) return []
  const scene = sceneOf(from)
  const rows: MotionCopyRow[] = []
  deck.slides.forEach((s, i) => {
    if (s.id === fromId || s.hidden) return
    rows.push({ slideId: s.id, page: i + 1, same: sameShape(from, s), sceneSkipped: !!scene && !sceneFits(s, scene) })
  })
  return rows
}

/**
 * 한 장에 옮겨 적는다. 바뀐 것이 없으면 같은 장을 돌려준다.
 * prefer: 이 장에서 방금 고른 연출. 이 장에서는 같은 결과인 연출이 둘일 때(currentPreset) 어느 것을 옮길지
 */
export function copyMotion(from: Slide, to: Slide, prefer?: MotionPreset | null): Slide {
  const options = { ...to.options }
  const put = <K extends 'motion' | 'transition' | 'scene'>(key: K, value: Slide['options'][K]) => {
    if (value === undefined) delete options[key]
    else options[key] = value
  }
  put('motion', from.options.motion)
  put('transition', from.options.transition)
  // 장면: 이 장에 장면이 없으면 그 장도 끈다. 있는데 그 장에 맞지 않으면 그 장의 것을 그대로 둔다(맞지 않는 장면은 쉬기만 해서)
  const scene = sceneOf(from)
  if (!scene) delete options.scene
  else if (sceneFits(to, scene)) options.scene = scene
  let next: Slide = { ...to, options }
  if (from.layout === 'compose' && to.layout === 'compose') next = copyBlockMotion(from, next, prefer)
  return same(to, next) ? to : next
}

/**
 * 컴포넌트 장끼리: 연출(차례와 때)을 그 장에 맞게 다시 짜고, 같은 종류의 컴포넌트에 같은 움직임을 준다.
 * 컴포넌트 id로 맞추지 않는다: 다른 장의 컴포넌트는 id가 다르고, 같은 종류(숫자, 핵심 한 줄)라야 같은 움직임이 어울린다.
 * 이 장에 없는 종류의 컴포넌트는 그대로 둔다
 */
function copyBlockMotion(from: Slide, to: Slide, prefer?: MotionPreset | null): Slide {
  const preset = currentPreset(from, prefer)
  let next = preset && presetFits(to, preset) ? withPreset(to, preset) : to
  const byType = new Map<BlockType, BlockMotion>()
  for (const b of from.blocks ?? []) if (!byType.has(b.type)) byType.set(b.type, { effect: b.effect, speed: b.speed, from: b.from })
  const blocks = (next.blocks ?? []).map((b) => {
    const m = byType.get(b.type)
    if (!m || (m.effect === b.effect && m.speed === b.speed && m.from === b.from)) return b
    const out = { ...b }
    for (const key of ['effect', 'speed', 'from'] as const) {
      if (m[key] === undefined) delete out[key]
      else (out as Record<string, unknown>)[key] = m[key]
    }
    return out
  })
  next = { ...next, blocks }
  return next
}

/** 고른 장들에 옮겨 적은 발표 (prefer는 copyMotion과 같다) */
export function withMotionCopy<D extends Pick<Deck, 'slides'>>(deck: D, fromId: string, ids: readonly string[], prefer?: MotionPreset | null): D {
  const from = deck.slides.find((s) => s.id === fromId)
  if (!from) return deck
  const pick = new Set(ids)
  pick.delete(fromId)
  let changed = false
  const slides = deck.slides.map((s) => {
    if (!pick.has(s.id) || s.hidden) return s
    const next = copyMotion(from, s, prefer)
    if (next !== s) changed = true
    return next
  })
  return changed ? { ...deck, slides } : deck
}

/** 옮겨 적어도 달라지는 것이 없는지 (같은 값이면 되돌리기 기록을 남기지 않게) */
function same(a: Slide, b: Slide): boolean {
  return JSON.stringify([a.options, a.blocks]) === JSON.stringify([b.options, b.blocks])
}

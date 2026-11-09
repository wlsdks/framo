import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { blockNames, playOrder, whenOf } from '../../../deck/blocks'
import { sceneOf, sceneSpec } from '../../../deck/scenes'
import type { Slide } from '../../../deck/types'
import { motionEngine, type MotionLevel, type MotionPlay } from '../../../motion/engine'

// 움직임 편집의 재생기. 발표 화면과 같은 엔진으로 장을 한 번 움직이고, 엔진이 건 움직임(Web Animations)을 읽어
// 시간표를 만든다. 시간표를 따로 계산하지 않고 실제 움직임에서 읽으므로 발표할 때와 어긋나지 않는다.
// 멈추기와 끌어 보기는 모든 움직임의 currentTime을 한꺼번에 맞춘다(모두 같은 때에 시작해서 지연으로 차례를 둔다)

/** 시간표의 한 줄: 제목, 컴포넌트 하나, 출처 */
export interface Lane {
  id: string
  name: string
  /** 컴포넌트 줄이면 그 부품의 id */
  block?: string
  start: number
  end: number
  /** 몇 번째 누를 때 나오는지 (0은 장이 나올 때) */
  step: number
  /** 모션 그래픽의 구간(맺힘, 번짐, 모임 …): 고른 줄 아래에 구간마다 한 줄로 */
  parts?: { name: string; start: number; end: number }[]
}

export interface Plan {
  lanes: Lane[]
  /** 다 움직이는 데 걸리는 시간(ms) */
  total: number
  /** 누를 때마다 나오는 묶음이 시작하는 때 */
  clicks: { step: number; at: number }[]
}

const EMPTY: Plan = { lanes: [], total: 0, clicks: [] }

/** 엔진이 element.animate로 건 것만 (편집 화면의 CSS 전환과 애니메이션은 빼고) */
function engineAnims(root: Element): Animation[] {
  return root.getAnimations({ subtree: true }).filter((a) => !(a instanceof CSSAnimation) && !(a instanceof CSSTransition))
}

function timing(a: Animation) {
  const effect = a.effect
  if (!effect) return { start: 0, end: 0 }
  return { start: Number(effect.getTiming().delay ?? 0), end: Number(effect.getComputedTiming().endTime ?? 0) }
}

/** 가장 늦게 끝나는 움직임(같으면 앞의 것). 바늘의 때는 이것의 시각으로 읽는다 */
function lastToEnd(anims: Animation[]): Animation | null {
  let last: Animation | null = null
  let end = 0
  for (const a of anims) {
    const t = timing(a).end
    if (!last || t > end) {
      last = a
      end = t
    }
  }
  return last
}

/** 움직임마다 어느 줄인지: 컴포넌트 칸이면 그 부품, 이음표는 앞 부품, 머리는 제목 */
function laneOf(a: Animation): string {
  // 장면이 얹은 움직임(카메라, 가림막, 결 선, 장막)은 '장면' 줄 하나로. 컴포넌트 줄에 섞으면 그 컴포넌트가 3초 넘게 움직이는 것처럼 보인다
  if (a.id === 'mo-scene') return 'scene'
  const target = a.effect instanceof KeyframeEffect ? a.effect.target : null
  if (!target) return 'etc'
  const link = target.closest<HTMLElement>('.bk-area > .bk-link')
  if (link?.dataset.after) return `b:${link.dataset.after}`
  const cell = target.closest<HTMLElement>('.bk-area > .bk')
  if (cell?.dataset.block) return `b:${cell.dataset.block}`
  if (target.closest('.s-head, .cv-title, .cv-lead, .sc-title, .sc-lead, .sc-num, .st-title, .st-lead, .ag-title')) return 'head'
  if (target.closest('.s-source, .s-foot')) return 'source'
  return 'body'
}

/** 모션 그래픽 구간의 이름(시간표에 보이는 말) */
const PART_NAMES: Record<string, string> = { seed: '맺힘', spread: '번짐', gather: '모임', resolve: '또렷해짐', write: '글', pull: '물러남', hold: '머묾' }

/**
 * 모션 그래픽의 시계(장면 전체에 하나)에서 구간마다의 때를 읽는다: 레시피의 구간(data-script)을 시계의 길이에 맞춰 늘이고 줄인다.
 * 장면이 한 막대 하나로만 보이면 3초 동안 무엇이 일어나는지 알 수 없었다
 */
function cineParts(a: Animation): Lane['parts'] {
  const target = a.effect instanceof KeyframeEffect ? a.effect.target : null
  if (!(target instanceof HTMLElement) || !target.matches('.bk-cn[data-script]')) return undefined
  try {
    const s = JSON.parse(target.dataset.script!) as { total: number; spans: { kind: string; start: number; end: number }[] }
    const t = timing(a)
    const k = (t.end - t.start) / Math.max(1, s.total)
    return s.spans.map((p) => ({ name: PART_NAMES[p.kind] ?? p.kind, start: t.start + p.start * k, end: t.start + p.end * k }))
  } catch {
    return undefined
  }
}

/** 실제로 건 움직임에서 시간표를 만든다 */
function readPlan(slide: Slide, anims: Animation[]): Plan {
  const parts = new Map<string, NonNullable<Lane['parts']>>()
  for (const a of anims) {
    const p = cineParts(a)
    if (p) parts.set(laneOf(a), p)
  }
  const spans = new Map<string, { start: number; end: number }>()
  for (const a of anims) {
    const id = laneOf(a)
    const t = timing(a)
    const cur = spans.get(id)
    spans.set(id, cur ? { start: Math.min(cur.start, t.start), end: Math.max(cur.end, t.end) } : t)
  }
  const lanes: Lane[] = []
  const add = (id: string, name: string, step = 0, block?: string) => {
    const span = spans.get(id)
    // 움직이지 않는 컴포넌트(움직임 없음)도 줄은 둔다: 차례를 바꾸고 고를 수 있게. 막대는 없다
    lanes.push({ id, name, step, block, start: span?.start ?? -1, end: span?.end ?? -1, ...(parts.has(id) ? { parts: parts.get(id) } : {}) })
  }
  if (spans.has('head')) add('head', '제목')
  if (slide.layout === 'compose') {
    const names = blockNames(slide.blocks ?? [])
    let step = 0
    for (const b of playOrder(slide)) {
      if (whenOf(b) === 'click') step++
      add(`b:${b.id}`, names.get(b.id) ?? '컴포넌트', step, b.id)
    }
  } else if (spans.has('body')) add('body', '본문')
  // 장면 줄에는 그 장면 이름을: '장면'만으로는 카메라, 가림막, 선 가운데 무엇이 움직이는지, 어느 장면인지 알 수 없었다
  const scene = sceneOf(slide)
  if (spans.has('scene')) add('scene', scene ? `장면 · ${sceneSpec(scene).name}` : '장면')
  if (spans.has('source')) add('source', '출처')
  const clicks: Plan['clicks'] = []
  for (const lane of lanes) {
    if (!lane.step || clicks.some((c) => c.step === lane.step)) continue
    const group = lanes.filter((l) => l.step === lane.step && l.start >= 0)
    if (group.length) clicks.push({ step: lane.step, at: Math.min(...group.map((l) => l.start)) })
  }
  const total = Math.max(0, ...anims.map((a) => timing(a).end))
  return { lanes, total, clicks }
}

/**
 * 컴퓨터의 '동작 줄이기'. 켜 두면 엔진이 움직이지 않으므로 시간표가 빈다. 그때 '움직임 정도를 고르라'고 하면
 * 고를 것을 다 골라도 그대로라서 무엇이 막는지 알 수 없었다. 켜고 끄는 것을 따라가 알린다
 */
export function useReducedMotion(): boolean {
  const [on, setOn] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const m = matchMedia('(prefers-reduced-motion: reduce)')
    const change = () => setOn(m.matches)
    m.addEventListener('change', change)
    return () => m.removeEventListener('change', change)
  }, [])
  return on
}

export interface Player {
  plan: Plan
  /** 하나만 움직이는 중이면 그 부품 */
  solo: string | null
  /** 지금 때(ms)를 받는다. 그리는 쪽이 화면을 직접 고친다(한 프레임마다 React를 다시 그리지 않게) */
  subscribe(fn: (t: number, playing: boolean) => void): () => void
  playing: boolean
  toggle(): void
  restart(): void
  seek(t: number): void
  /** 그 컴포넌트 하나만 다시 움직인다 */
  playOne(block: string): void
  /** 무대가 새로 그려질 때(움직임을 바꿔서) 장 전체 대신 그 컴포넌트 하나만 움직인다 */
  focusNext(block: string): void
  /** 장을 움직이는 엔진. 앞 장에서 넘어오는 모습을 볼 때 같은 엔진으로 장을 바꿔야 이어 움직이기의 짝이 맞는다 */
  engine: ReturnType<typeof motionEngine>
}

/**
 * 무대(root, 안에 .slide 하나)를 움직이는 재생기. 무대는 장이 바뀔 때마다 새로 그려서(root가 바뀐다) 처음부터 다시 움직인다.
 * (움직이는 동안 제목은 낱말로, 숫자는 자리마다 나뉘어 있어서 같은 무대를 React가 고치면 엇갈린다)
 * 하나만 움직이라고 했으면(focus) 장 전체의 시간표를 읽은 뒤 그 컴포넌트만 다시 움직인다(움직임 하나를 바꿨을 때 장 전체를 기다리지 않게)
 */
export function usePlayer(root: HTMLElement | null, slide: Slide, level: MotionLevel): Player {
  const engine = useMemo(() => motionEngine(), [])
  const [plan, setPlan] = useState<Plan>(EMPTY)
  const [playing, setPlaying] = useState(false)
  const [solo, setSolo] = useState<string | null>(null)
  const listeners = useRef(new Set<(t: number, playing: boolean) => void>())
  // last: 가장 늦게 끝나는 움직임(lastToEnd). 걸 때 한 번 고른다: 바늘을 옮기는 프레임마다 모든 움직임의 때를 두 번씩 물어(움직임 수의 두 배만큼
  // getComputedTiming) 고르던 때는 낱말과 숫자로 나뉜 움직임이 많은 장에서 재생하는 동안 프레임마다 몇 ms를 썼다. 엔진은 건 뒤에 움직임의 때를 바꾸지 않는다
  const state = useRef({ anims: [] as Animation[], last: null as Animation | null, offset: 0, solo: false, ended: false, total: 0, raf: 0, stop: null as MotionPlay | null })
  /** 끝난 뒤에 끌어 보면 무대를 새로 그려 다시 걸고, 그 때로 옮겨 멈춘다 */
  const pendingSeek = useRef<number | null>(null)
  const [replay, setReplay] = useState(0)
  /** 다음에 걸 때 하나만 움직일 컴포넌트. 한 번 쓰면 지운다(그 뒤의 처음부터, 끌어 보기는 장 전체) */
  const focusRef = useRef<string | null>(null)
  const slideRef = useRef(slide)
  slideRef.current = slide

  const emit = useCallback((t: number, on: boolean) => {
    for (const fn of listeners.current) fn(t, on)
  }, [])

  const now = () => {
    const s = state.current
    if (!s.last) return s.ended ? s.total : 0
    return Math.min(s.total, s.offset + Number(s.last.currentTime ?? 0))
  }

  const tick = useCallback(() => {
    const s = state.current
    const t = now()
    const done = s.anims.every((a) => a.playState === 'finished')
    if (done) {
      s.ended = true
      setPlaying(false)
      emit(t, false)
      s.raf = 0
      return
    }
    emit(t, true)
    s.raf = requestAnimationFrame(tick)
  }, [emit])

  useLayoutEffect(() => {
    const s = state.current
    cancelAnimationFrame(s.raf)
    if (!root) {
      // 무대를 잠깐 내렸을 때(앞 장에서 넘어오는 모습을 보는 동안) 시간표는 그대로 둔다. 비웠다가 다시 채우면 줄이 깜박인다
      setSolo(null)
      setPlaying(false)
      s.anims = []
      s.last = null
      s.ended = true
      emit(0, false)
      return
    }
    if (level === 'none') {
      // 움직이지 않아도 줄은 보인다: 누르면 나오는 차례는 움직임 없음에서도 지킨다
      setPlan(readPlan(slideRef.current, []))
      setSolo(null)
      setPlaying(false)
      s.anims = []
      s.last = null
      s.ended = true
      emit(0, false)
      // 움직이지 않아도 발표 화면처럼 엔진에 맡긴다: 앞 장에서 넘어오는 중이면 엔진(swap)이 이 장의 글을 앞 장이 비킨 뒤에 들인다.
      // 엔진을 건너뛰던 때는 다 그려진 이 장의 글이 옅어지는 앞 장의 글과 겹쳐 보였다(발표 화면과 내보낸 HTML은 그렇지 않다)
      return engine.play(root, 'none', { clicks: 'auto' })
    }
    // 장 전체를 걸어 시간표를 읽는다
    let stop = engine.play(root, level, { clicks: 'auto' })
    const slideEl = root.querySelector('.slide') ?? root
    let anims = engineAnims(slideEl)
    const next = readPlan(slideRef.current, anims)
    setPlan(next)
    s.total = next.total
    s.offset = 0
    const focus = focusRef.current
    focusRef.current = null
    const lane = focus ? next.lanes.find((l) => l.block === focus) : undefined
    const cell = focus ? root.querySelector<HTMLElement>(`.bk[data-block="${CSS.escape(focus)}"]`) : null
    let one: string | null = null
    if (lane && cell && lane.start >= 0) {
      one = focus
      // 그 컴포넌트만: 장 전체는 끝 모습으로 두고 그 칸만 다시 움직인다. 시간표의 바늘은 그 줄 안에서 움직인다
      stop()
      stop = engine.play(cell, level)
      anims = engineAnims(cell)
      s.offset = lane.start
    }
    setSolo(one)
    s.solo = !!one
    s.anims = anims
    s.last = lastToEnd(anims)
    s.stop = stop
    s.ended = false
    if (pendingSeek.current !== null) {
      const t = pendingSeek.current
      pendingSeek.current = null
      for (const a of anims) {
        a.pause()
        a.currentTime = t
      }
      setPlaying(false)
      emit(t, false)
    } else {
      setPlaying(true)
      s.raf = requestAnimationFrame(tick)
    }
    return () => {
      cancelAnimationFrame(s.raf)
      s.raf = 0
      stop()
    }
    // 무대가 새로 그려질 때(root)와 다시 걸 때(replay)만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root, replay, level, engine])

  const seek = useCallback(
    (t: number) => {
      const s = state.current
      const at = Math.max(0, Math.min(s.total, t))
      // 하나만 움직이는 중이거나 끝났으면(제목 낱말과 굴린 숫자가 원래 글로 돌아갔다) 다시 걸고 그 때로
      if (s.ended || s.solo || !s.anims.length) {
        pendingSeek.current = at
        setReplay((n) => n + 1)
        return
      }
      cancelAnimationFrame(s.raf)
      s.raf = 0
      for (const a of s.anims) {
        a.pause()
        a.currentTime = at
      }
      setPlaying(false)
      emit(at, false)
    },
    [emit],
  )

  const toggle = useCallback(() => {
    const s = state.current
    if (s.ended || !s.anims.length) {
      setReplay((n) => n + 1)
      return
    }
    if (s.raf) {
      cancelAnimationFrame(s.raf)
      s.raf = 0
      for (const a of s.anims) a.pause()
      setPlaying(false)
      emit(now(), false)
      return
    }
    // 멈춘 자리에서 이어서: 다 끝난 것도 같은 때로 맞춰 함께 다시 움직인다
    const t = now() - s.offset
    for (const a of s.anims) {
      a.currentTime = t
      a.play()
    }
    setPlaying(true)
    s.raf = requestAnimationFrame(tick)
  }, [emit, tick])

  const restart = useCallback(() => setReplay((n) => n + 1), [])
  const playOne = useCallback((block: string) => {
    focusRef.current = block
    setReplay((n) => n + 1)
  }, [])
  const focusNext = useCallback((block: string) => {
    focusRef.current = block
  }, [])

  const subscribe = useCallback((fn: (t: number, playing: boolean) => void) => {
    listeners.current.add(fn)
    return () => void listeners.current.delete(fn)
  }, [])

  return { plan, solo, subscribe, playing, toggle, restart, seek, playOne, focusNext, engine }
}

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { blockNames, playOrder, whenOf } from '../../deck/blocks'
import { presetSpec } from '../../deck/cine'
import { sceneOf, sceneSpec } from '../../deck/scenes'
import { loadCines, newerFor, useCines, versionNumber } from '../../store/cines'
import { MOTIONS, motionOf, transitionOf, TRANSITIONS } from '../../deck/themes'
import type { BlockFrom, Deck, Slide, Transition } from '../../deck/types'
import { motionEngine } from '../../motion/engine'
import { ScaledSlide, SlideCanvas } from '../../slides/SlideCanvas'
import { ChevronIcon, MotionIcon, PlayIcon } from '../ui'
import { PREVIEW_MOTION } from './DeckMenus'
import { useLook } from './look'
import { SHORTCUT } from './shortcuts'
import { keys } from '../../lib/keys'

/**
 * 이 장만 바꾸지 않고 발표 전체 설정을 따르는 값의 이름. 예전에는 '기본'이라서, 기본이 무엇인지(차분하게? 없음?)
 * 발표 설정을 열어 봐야 알았다. 무엇을 따르는지는 지금 값으로 같이 보인다
 */
export const INHERIT = '발표 설정대로'

/** 이 장 설정의 '장 넘기기'에 보일 것. 자동(auto)은 발표 전체에만 있는 값이라 '발표 설정대로' 하나로 묶는다 */
export const SLIDE_TRANSITIONS: { id: Transition | undefined; name: string; description: string }[] = [
  { id: undefined, name: INHERIT, description: '발표 설정에서 정한 발표 전체의 화면 전환을 따라요.' },
  ...TRANSITIONS.filter((t) => t.id !== 'auto'),
]

export const nameOf = <T,>(list: { id: T; name: string }[], id: T) => list.find((o) => o.id === id)?.name ?? ''

/** 들어오는 쪽은 짧게 (네 단추가 한 줄에 들어가게) */
export const FROM_SHORT: Record<BlockFrom, string> = { below: '아래', above: '위', left: '왼쪽', right: '오른쪽' }

/** 차례 줄에 이름을 몇 개까지 늘어놓는지. 나머지는 '외 n개' */
const NAMES = 3

/**
 * 오른쪽 칸의 '모션': 이 장이 어떻게 움직이는지 쉬운 말로 짧게 보이고, 고치는 곳(모션 편집)으로 이끈다.
 * 예전에는 이 좁은 칸에 장면 카드, 모션 세기와 화면 전환의 단추 줄, 컴포넌트마다 펼치는 차례 목록이 다 들어 있어
 * 무엇부터 봐야 할지 몰랐다("우측 패널은 간단한 정보만 나오게 하고 클릭하면 이동되면서 사용을 유도하는 형태로").
 * 고치는 것은 모두 모션 편집에서 한다: 슬라이드 자리에서 크게 움직여 보이고, 이 칸에는 고른 것의 값만 보인다
 */
export function MotionPanel({ deck, slide, onOpenStudio }: { deck: Deck; slide: Slide; onOpenStudio(): void }) {
  const look = useLook(deck)
  const level = motionOf(deck, slide)
  const scene = sceneOf(slide)
  const own = { motion: !!slide.options.motion, transition: !!slide.options.transition && slide.options.transition !== 'auto' }
  const transition = transitionOf(deck, slide)
  const order = useMemo(() => playOrder(slide), [slide])
  const names = useMemo(() => blockNames(slide.blocks ?? []), [slide.blocks])
  const clicks = order.filter((b) => whenOf(b) === 'click').length
  // 이 장의 모션 그래픽(첫째): 이름(내 라이브러리의 이름, 없으면 틀 이름), 쓰는 버전, 더 새 버전
  const entries = useCines((s) => s.entries)
  useEffect(() => void loadCines(), [])
  const cine = useMemo(() => {
    const b = order.find((x) => x.type === 'cine')
    const r = b?.cine ? deck.cines?.[b.cine] : undefined
    if (!b || !r) return null
    const entry = entries.find((e) => e.lineage === r.lineage)
    return { name: entry?.name ?? presetSpec(r.preset).name, number: entry && b.cine ? versionNumber(entry, b.cine) : 0, newer: newerFor(entries, r, b.cine)?.number ?? 0 }
  }, [order, deck.cines, entries])
  const listed = order.slice(0, NAMES).map((b) => names.get(b.id) ?? '컴포넌트')
  const sequence =
    slide.layout !== 'compose'
      ? '슬라이드 모양에 맞춘 차례로'
      : !order.length
        ? '컴포넌트를 넣으면 정할 수 있어요'
        : order.length === 1
          ? `${listed[0]} 하나`
          : `${listed.join(' → ')}${order.length > NAMES ? ` 외 ${order.length - NAMES}개` : ''}`

  // 그림에 마우스를 올리거나 키보드로 오면 이 장이 발표할 때처럼 한 번 움직인다(움직이는 중에 다시 올려도 처음부터 다시 하지 않는다)
  const thumbRef = useRef<HTMLButtonElement>(null)
  // 그림은 칸 너비대로 (윈도우의 늘 보이는 스크롤바가 자리를 차지해도 넘치지 않게 재서 그린다)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = thumbRef.current
    if (!el) return
    const on = () => setWidth(el.clientWidth)
    on()
    const ro = new ResizeObserver(on)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const last = useRef(-1e9)
  const engine = useMemo(() => motionEngine(), [])
  const play = () => {
    const el = thumbRef.current?.querySelector('.slide')
    const t = performance.now()
    if (!el || level === 'none' || t - last.current < 2600) return
    last.current = t
    engine.play(el, level)
  }

  return (
    <div className="ins mp" role="tabpanel" aria-label="모션">
      <section className="ins-sec mp-brief">
        <div className="mp-head">
          <h2 className="ins-h">이 슬라이드의 모션</h2>
          <button type="button" className="btn btn-ghost btn-sm mp-preview" disabled={level === 'none'} title="가운데 슬라이드에서 발표할 때처럼 한 번 움직여요" onClick={() => window.dispatchEvent(new Event(PREVIEW_MOTION))}>
            <PlayIcon />
            미리 보기
          </button>
        </div>
        {/* 그림을 눌러도 모션 편집으로 간다: 무엇을 고치러 가는지 그림으로 먼저 보이게 */}
        <button ref={thumbRef} type="button" className="mp-thumb" aria-label="모션 편집 열기" onClick={onOpenStudio} onPointerEnter={play} onFocus={play}>
          {width > 0 && (
            <ScaledSlide width={width} decorative>
              <SlideCanvas deck={look} slide={slide} mode="final" />
            </ScaledSlide>
          )}
        </button>
        <dl className="mp-facts">
          {cine && (
            // 모션 그래픽: 이 발표가 쓰는 버전. 내 라이브러리에 더 새 버전이 있으면 알리고 모션 편집에서 바꾸게 한다(고정된 버전을 몰래 바꾸지 않는다)
            <div>
              <dt>모션 그래픽</dt>
              <dd>
                {cine.name}
                {cine.number > 0 && <span className="mp-note"> · 버전 {cine.number}</span>}
                {cine.newer > 0 && (
                  <button type="button" className="link-btn mp-newer" onClick={onOpenStudio}>
                    새 버전 {cine.newer}이 있어요
                  </button>
                )}
              </dd>
            </div>
          )}
          <div>
            <dt>움직이는 방식</dt>
            <dd>{scene ? `‘${sceneSpec(scene).name}’ 장면` : '자동 (내용에 맞게)'}</dd>
          </div>
          <div>
            <dt>나오는 차례</dt>
            <dd>
              {sequence}
              {clicks > 0 && <span className="mp-note"> · 누를 때 {clicks}번</span>}
            </dd>
          </div>
          <div>
            <dt>모션</dt>
            <dd>
              {nameOf(MOTIONS, level)}
              <span className="mp-note"> · {own.motion ? '이 슬라이드만' : INHERIT}</span>
            </dd>
          </div>
          <div>
            <dt>화면 전환</dt>
            <dd>
              {nameOf(TRANSITIONS, transition)}
              <span className="mp-note"> · {own.transition ? '이 슬라이드만' : INHERIT}</span>
            </dd>
          </div>
        </dl>
        <button type="button" className="btn btn-ghost mp-open" title={`모션 편집 열기 (${keys(SHORTCUT.studio)})`} onClick={onOpenStudio}>
          <MotionIcon />
          모션 편집 열기
          <ChevronIcon />
        </button>
        <p className="mp-open-d">슬라이드를 크게 보면서 나오는 차례와 모션을 골라요</p>
      </section>
    </div>
  )
}

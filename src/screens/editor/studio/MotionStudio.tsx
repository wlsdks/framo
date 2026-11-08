import { arrayMove } from '@dnd-kit/sortable'
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { flushSync } from 'react-dom'
import {
  BLOCK_EFFECTS,
  BLOCK_FROMS,
  BLOCK_SPEEDS,
  BLOCK_WHENS,
  blockNames,
  currentPreset,
  effectChoices,
  effectOf,
  fromOf,
  MOTION_PRESETS,
  playOrder,
  presetFits,
  slideHeading,
  speedOf,
  whenOf,
  withPreset,
  type MotionPreset,
  BLOCK_REVEALS,
  BLOCKS,
  revealOf,
} from '../../../deck/blocks'
import { pageInfo } from '../../../deck/fields'
import { sceneOf } from '../../../deck/scenes'
import { MOTIONS, motionOf, themeStyle, transitionOf, TRANSITIONS } from '../../../deck/themes'
import type { Block, BlockEffect, BlockFrom, BlockSpeed, BlockWhen, Deck, Motion, Slide, BlockReveal, Transition } from '../../../deck/types'
import { cx } from '../../../lib/cx'
import { FitSlide, pageProps, SlideCanvas, useStableSections } from '../../../slides/SlideCanvas'
import { useDeck } from '../../../store/deckStore'
import { BackIcon, ChevronIcon, PlayIcon, Segmented, useEscape, type Toast } from '../../ui'
import { DemoCard, MotionDemo, TransitionDemo } from '../DeckSettings'
import { Opt } from '../Inspector'
import { useLook, type Look } from '../look'
import { FROM_SHORT, INHERIT, nameOf, SLIDE_TRANSITIONS } from '../MotionPanel'
import { SceneOverride, ScenePicker } from '../ScenePicker'
import { usePlayer, useReducedMotion } from './player'
import { MotionCopy } from './MotionCopy'
import { Timeline } from './Timeline'
import { SHORTCUT } from '../shortcuts'
import { keys } from '../../../lib/keys'

// 움직임 편집: 한 장의 움직임을 크게 보며 고치는 곳. 편집기 안에서 슬라이드 자리(가운데)와 오른쪽 칸을 바꿔 쓴다:
// 가운데에 발표 화면과 똑같이 움직이는 장과 그 아래 컴포넌트마다 움직이는 동안을 그린 시간표, 오른쪽 칸에는 지금 고른 것의 값만.
// 아무것도 고르지 않으면 이 슬라이드 전체(움직이는 방식, 나오는 차례, 이 슬라이드만 다르게), 컴포넌트를 고르면 그 컴포넌트의 값이다.
// 이 칸은 이 슬라이드의 일만 다룬다: 발표 전체의 일(장면 알아서 고르기)은 발표 설정에 둔다
// 예전에는 편집기 위에 덮는 화면이라 왼쪽 슬라이드 목록이 가려졌고, 오른쪽 칸에는 장면부터 컴포넌트 값까지 한꺼번에 늘어서 있었다.
// 시간을 손으로 그리지 않는다(고르는 방식): 나오는 차례 하나로 장 전체의 차례와 때를 정하고, 컴포넌트마다 움직임, 언제, 쪽, 빠르기를 고른다.
// 값은 부품의 effect·when·from·speed, 장의 options.order·motion·transition·scene에 적는다

export function MotionStudio({
  deck,
  slide,
  initial,
  onClose,
  onConvert,
  onPresent,
  toast,
}: {
  deck: Deck
  slide: Slide
  /** 열 때 고를 컴포넌트 (편집기에서 고르고 있던 것) */
  initial: string | null
  onClose(): void
  onConvert(): void
  /** 이 장(또는 앞 장)부터 발표 */
  onPresent(slideId: string): void
  /** '다른 장에도'를 옮긴 뒤 되돌리기를 보일 알림 */
  toast?: Toast
}) {
  const store = useDeck.getState()
  const look = useLook(deck)
  const info = pageInfo(deck.slides, deck)
  const sections = useStableSections(info)
  const level = motionOf(deck, slide)
  const compose = slide.layout === 'compose'
  const order = useMemo(() => playOrder(slide), [slide])
  const ids = useMemo(() => order.map((b) => b.id), [order])
  const names = useMemo(() => blockNames(slide.blocks ?? []), [slide.blocks])
  // 고른 컴포넌트. 없으면(null) 슬라이드 전체의 값을 보인다: 처음 열면 '자동'인 슬라이드 전체부터
  const [selected, setSelected] = useState<string | null>(initial && ids.includes(initial) ? initial : null)
  const [hot, setHot] = useState<string | null>(null)
  useEffect(() => {
    if (selected && !ids.includes(selected)) setSelected(null)
  }, [ids, selected])
  // Esc로 편집으로 돌아간다. 열 때 초점은 무대 쪽 자체에: 첫 단추('편집으로')에 두면 '재생 (Space)'을 보고 누른 Space가 그 단추를 눌러 닫혔다.
  // 되돌리기, 다시 하기, F5는 편집기의 단축키가 그대로 받는다(덮는 창이 아니라 편집기의 한 모습이라)
  const mainRef = useRef<HTMLElement>(null)
  useEscape(onClose)
  useEffect(() => mainRef.current?.focus({ preventScroll: true }), [])

  // 장이 바뀔 때마다 무대를 새로 그린다(key). 그려진 무대(root)를 받으면 재생기가 처음부터 움직인다
  const rev = useRef({ slide, n: 0 })
  if (rev.current.slide !== slide) rev.current = { slide, n: rev.current.n + 1 }
  const [root, setRoot] = useState<HTMLDivElement | null>(null)
  const boxes = useBoxes(root)
  const player = usePlayer(root, slide, level)
  const small = useLowWindow()
  const reduced = useReducedMotion()

  // Space: 재생과 멈춤 (단추나 글 칸에 있을 때는 그것의 Space를 둔다. 바늘은 Space로 할 일이 없어 재생한다: 끌어 본 자리에서
  // 이어 보려고 누른 Space가 아무 일도 하지 않았다)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return
      // ←, →: 앞 장, 다음 장 (발표 화면과 같은 키). 단추를 누른 뒤에도 되게 단추는 막지 않는다. 바늘(slider)은 제 화살표로 옮긴다
      if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.altKey && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
        // 왼쪽 슬라이드 목록은 제 화살표로 옮긴다
        if ((e.target as Element).closest?.('input, textarea, select, [role="slider"], [contenteditable], .sl')) return
        e.preventDefault()
        goRef.current(e.key === 'ArrowLeft' ? -1 : 1)
        return
      }
      if (e.key !== ' ' || e.repeat) return
      if ((e.target as Element).closest?.('button, input, textarea, select, [contenteditable], .sl, .side')) return
      e.preventDefault()
      player.toggle()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [player.toggle])

  const visible = deck.slides.filter((s) => !s.hidden)
  const at = visible.findIndex((s) => s.id === slide.id)
  const go = (d: number) => {
    const next = visible[at + d]
    if (next) store.select(next.id)
  }
  const goRef = useRef(go)
  goRef.current = go

  // 앞 장에서 넘어오기: 무대에 앞 장(다 보인 모습)을 잠깐 두었다가, 발표 화면과 같은 엔진의 장 바꾸기로 이 장으로 넘긴다.
  // 장 넘기기는 두 장 사이의 일이라 이 장만 움직여서는 고른 넘기기가 어떤지 알 수 없었다('앞 장부터 발표'로 나가야 했다)
  const prev = at > 0 ? visible[at - 1] : null
  const [entering, setEntering] = useState(false)
  const enterRun = useRef(0)
  const enter = useCallback(() => {
    if (!prev || reduced) return
    const run = ++enterRun.current
    setEntering(true)
    window.setTimeout(() => {
      if (enterRun.current !== run) return
      // 넘기는 때의 값으로: 장 넘기기를 고르자마자 부르면 그 값이 아직 이 화면에 오기 전이다
      const now = useDeck.getState().deck
      const to = now?.slides.find((s) => s.id === slide.id)
      const html = document.documentElement
      html.classList.add('ms-vt')
      player.engine.swap(() => flushSync(() => setEntering(false)), transitionOf(now ?? deck, to ?? slide), 1)
      // 넘기기가 끝나면(엔진이 data-mo-swap을 뗀다) 무대만 찍는 표시를 거둔다. 시간으로 거두면 느린 PC에서 넘기는 도중에
      // 문서의 이름이 돌아와 화면 전체가 바탕색으로 덮였다. 바로 바꾸는 넘기기는 표시를 붙이지 않으니 바로 거둔다
      const clear = () => {
        if (enterRun.current === run) html.classList.remove('ms-vt')
      }
      if (!html.dataset.moSwap) clear()
      else {
        const watch = new MutationObserver(() => {
          if (html.dataset.moSwap) return
          watch.disconnect()
          clear()
        })
        watch.observe(html, { attributes: true, attributeFilter: ['data-mo-swap'] })
      }
    }, ENTER_HOLD)
  }, [prev, reduced, slide, deck, player.engine])
  // 장을 옮기거나 닫으면 넘기던 것을 거둔다
  useEffect(
    () => () => {
      enterRun.current++
      setEntering(false)
      document.documentElement.classList.remove('ms-vt')
    },
    [slide.id],
  )

  const block = (slide.blocks ?? []).find((b) => b.id === selected) ?? null
  const setBlock = (b: Block, patch: Partial<Block>, one: boolean) => {
    // 움직임, 쪽, 빠르기는 그 컴포넌트만 다시 보인다. 언제는 앞뒤와의 사이가 바뀌니 장 전체를
    if (one) player.focusNext(b.id)
    store.updateBlock(slide.id, b.id, (x) => ({ ...x, ...patch }), `motion.${b.id}`)
  }
  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= ids.length) return
    store.setOptions(slide.id, { order: arrayMove(ids, from, to) }, 'order')
  }
  // 이 장에서 방금 고른 연출. 같은 결과인 연출이 둘일 때(결론이 이미 맨 앞이면 차례로와 결론 먼저) 고른 것을 눌린 것으로 보이고
  // 다른 장에도 그것을 옮긴다. 값으로 저장하지 않아서 창을 다시 열면 앞의 것으로 보인다
  const [picked, setPicked] = useState<{ slide: string; id: MotionPreset } | null>(null)
  const prefer = picked?.slide === slide.id ? picked.id : null
  const pickPreset = (id: MotionPreset) => {
    setPicked({ slide: slide.id, id })
    store.replaceSlide(slide.id, withPreset(slide, id))
  }

  const name = block ? (names.get(block.id) ?? '컴포넌트') : ''
  return (
    <>
      <main ref={mainRef} className="ms" aria-label="모션 편집" tabIndex={-1}>
        <header className="ms-top">
          <button type="button" className="btn btn-ghost btn-sm ms-back" onClick={onClose} title={`편집으로 돌아가기 (Esc, ${keys(SHORTCUT.studio)})`}>
            <BackIcon />
            편집으로
          </button>
          <h1 className="ms-title">모션 편집</h1>
          <nav className="ms-nav" aria-label="슬라이드 넘기기">
            <button type="button" className="icon-btn ms-prev" aria-label="앞 슬라이드" title="앞 슬라이드 (←)" disabled={at <= 0} onClick={() => go(-1)}>
              <ChevronIcon />
            </button>
            <span className="ms-count">
              {at + 1} / {visible.length}
            </span>
            <button type="button" className="icon-btn" aria-label="다음 슬라이드" title="다음 슬라이드 (→)" disabled={at < 0 || at >= visible.length - 1} onClick={() => go(1)}>
              <ChevronIcon />
            </button>
            <span className="ms-slide-name">{slideHeading(slide)}</span>
          </nav>
          <button type="button" className="btn btn-ghost btn-sm ms-present" onClick={() => onPresent(slide.id)}>
            <PlayIcon />
            <span className="btn-t">이 슬라이드부터 발표</span>
          </button>
        </header>

        <div
          className={cx('ms-stage', player.playing && 'is-playing')}
          // 컴포넌트를 누르면 그것을, 빈 곳을 누르면 슬라이드 전체를 고른다 (오른쪽 칸이 그 값으로 바뀐다)
          onPointerDown={(e) => setSelected((e.target as Element).closest<HTMLElement>('.bk[data-block]')?.dataset.block ?? null)}
          onPointerOver={(e) => setHot((e.target as Element).closest<HTMLElement>('.bk[data-block]')?.dataset.block ?? null)}
          onPointerLeave={() => setHot(null)}
        >
          <FitSlide padding={small ? 12 : 20}>
            {entering && prev ? (
              <Stage key={`prev.${prev.id}`} deck={look} slide={prev} page={pageProps(info, prev.id)} sections={sections} />
            ) : (
              <Stage key={`${slide.id}.${rev.current.n}.${reduced}`} deck={look} slide={slide} page={pageProps(info, slide.id)} sections={sections} attach={setRoot} />
            )}
            <div className="ms-marks" aria-hidden="true" hidden={entering}>
              {boxes.map((b) => {
                const n = ids.indexOf(b.id) + 1
                if (!n) return null
                return (
                  <span
                    key={b.id}
                    className={cx('ms-mark', selected === b.id && 'is-on', hot === b.id && 'is-hot')}
                    style={{ left: b.x, top: b.y, width: b.w, height: b.h } as CSSProperties}
                  >
                    <b className="ms-mark-n">{n}</b>
                  </span>
                )
              })}
            </div>
          </FitSlide>
          {entering && <p className="ms-stage-tag">앞 슬라이드</p>}
        </div>

        <Timeline player={player} onEnter={prev && !reduced ? enter : null} quiet={reduced ? 'reduced' : level === 'none' ? 'none' : null} order={compose ? ids : []} selected={selected} hot={hot} onSelect={setSelected} onHot={setHot} onMove={move} />
      </main>

      {/* 오른쪽 칸: 고른 것의 값만. 컴포넌트를 골랐으면 그 컴포넌트, 아니면 슬라이드 전체 */}
      <aside className="side ms-side" aria-label="모션 고르기">
        <div className="ms-side-h">
          {block ? (
            <button type="button" className="ms-up" onClick={() => setSelected(null)} title="이 슬라이드 전체의 모션으로">
              <BackIcon />
              이 슬라이드 전체
            </button>
          ) : (
            <h2 className="ms-side-t">이 슬라이드 전체</h2>
          )}
        </div>
        <div className="ms-side-body">
          {block ? (
            <BlockMotion key={block.id} slide={slide} block={block} n={ids.indexOf(block.id) + 1} name={name} disabled={level === 'none'} onSet={setBlock} onPlay={() => player.playOne(block.id)} />
          ) : (
            <>
              {/* 움직이는 방식: 자동(컴포넌트마다 내용에 맞게) 아니면 장 전체를 한 컷으로 짠 장면. 고르면 무대가 그 모습으로 처음부터 움직인다 */}
              <section className="ms-sec sp">
                <h2 className="ms-h">움직이는 방식</h2>
                <ScenePicker deck={deck} slide={slide} thumb={120} />
              </section>
              {compose ? (
                <Presets slide={slide} prefer={prefer} onPick={pickPreset} />
              ) : (
                <section className="ms-sec ms-convert">
                  <h2 className="ms-h">컴포넌트마다 고르기</h2>
                  <p>컴포넌트 슬라이드로 바꾸면 컴포넌트마다 나오는 차례와 모션을 고를 수 있어요. 글은 그대로예요.</p>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={onConvert}>
                    컴포넌트 슬라이드로 바꾸기
                  </button>
                </section>
              )}
              {compose && ids.length > 0 && (
                <section className="ms-sec">
                  <p className="ms-none">슬라이드나 아래 시간표에서 컴포넌트를 누르면 그 컴포넌트의 모션을 고를 수 있어요.</p>
                </section>
              )}
              <SlideMotion deck={deck} slide={slide} onTransition={enter} />
              <MotionCopy deck={deck} slide={slide} prefer={prefer} toast={toast} />
            </>
          )}
        </div>
      </aside>
    </>
  )
}

/** 무대: 발표 화면과 같은 모습. 장이 바뀔 때마다 key로 새로 그린다 */
const Stage = memo(function Stage({
  deck,
  slide,
  page,
  sections,
  attach,
}: {
  deck: Look
  slide: Slide
  page: ReturnType<typeof pageProps>
  sections: readonly string[]
  /** 움직일 무대를 받는다. 앞 장은 보이기만 해서 넘기지 않는다 */
  attach?(el: HTMLDivElement | null): void
}) {
  // present-slide: 엔진이 발표 화면의 지금 장으로 보는 이름. 장을 바꿀 때 이어 움직이기의 짝과 아래 띠를 이 무대에서 찾는다
  // (발표 화면을 열면 편집기가 통째로 내려가서 둘이 함께 있지 않다)
  return (
    <div ref={attach} className="ms-slide present-slide">
      <SlideCanvas deck={deck} slide={slide} mode="final" page={page.page} total={page.total} sections={sections} sectionIndex={page.sectionIndex} />
    </div>
  )
}, (a, b) => a.slide === b.slide && a.deck === b.deck && a.page.page === b.page.page && a.page.total === b.page.total && a.sections === b.sections)

/**
 * 컴포넌트마다 글과 그림이 실제로 그려진 자리(장의 px). 칸이 아니라 내용에 맞춰야 번호와 고른 표시가 내용에 붙는다
 * (칸은 판에 맞춰 내용보다 클 때가 있어서 칸 둘레를 그리면 빈 자리까지 감싼다). 움직이기 전과 다 움직인 뒤(mo-end)에 잰다
 */
function useBoxes(root: HTMLElement | null) {
  const [boxes, setBoxes] = useState<{ id: string; x: number; y: number; w: number; h: number }[]>([])
  useLayoutEffect(() => {
    const slideEl = root?.querySelector<HTMLElement>('.slide')
    if (!root || !slideEl) return setBoxes([])
    const measure = () => {
      // 움직이는 중이면 옮겨지는 중의 자리가 잡힌다. 끝난 뒤(mo-end)에 다시 잰다
      if (root.hasAttribute('data-mo-play')) return
      const base = slideEl.getBoundingClientRect()
      const k = base.width / slideEl.offsetWidth || 1
      setBoxes(
        [...slideEl.querySelectorAll<HTMLElement>('.bk-area > .bk[data-block]')].map((el) => {
          const r = contentRect(el)
          return { id: el.dataset.block!, x: (r.left - base.left) / k, y: (r.top - base.top) / k, w: r.width / k, h: r.height / k }
        }),
      )
    }
    measure()
    root.addEventListener('mo-end', measure)
    document.fonts?.ready.then(measure)
    return () => root.removeEventListener('mo-end', measure)
  }, [root])
  return boxes
}

/** 칸 안에서 글, 그림, 면이 그려진 곳을 모두 덮는 네모. 아무것도 없으면 칸 그대로 */
function contentRect(cell: HTMLElement): DOMRect {
  let l = Infinity
  let t = Infinity
  let r = -Infinity
  let b = -Infinity
  const take = (x: DOMRect) => {
    if (!x.width || !x.height) return
    l = Math.min(l, x.left)
    t = Math.min(t, x.top)
    r = Math.max(r, x.right)
    b = Math.max(b, x.bottom)
  }
  /** 면이 있는 것(카드, 짙은 면)은 면 전체, 그림은 그림 전체 */
  const filled = (el: Element, style: CSSStyleDeclaration) =>
    style.backgroundColor !== 'rgba(0, 0, 0, 0)' || style.borderTopWidth !== '0px' || el instanceof SVGSVGElement || el instanceof HTMLImageElement
  const walk = (el: Element) => {
    const style = getComputedStyle(el)
    if (style.visibility === 'hidden' || style.display === 'none') return
    const face = filled(el, style)
    if (face || !el.children.length) take(el.getBoundingClientRect())
    if (!face) for (const c of el.children) walk(c)
  }
  // 칸 자체에 면이 있으면(카드, 짙은 면 모양) 칸 그대로
  if (filled(cell, getComputedStyle(cell))) return cell.getBoundingClientRect()
  for (const c of cell.children) walk(c)
  return l === Infinity ? cell.getBoundingClientRect() : new DOMRect(l, t, r - l, b - t)
}

/** 나오는 차례(연출): 장 전체의 차례와 때를 한 번에. 그림은 세 컴포넌트가 나오는 때(가로가 시간)를 줄인 모습 */
function Presets({ slide, prefer, onPick }: { slide: Slide; prefer: MotionPreset | null; onPick(id: MotionPreset): void }) {
  const now = currentPreset(slide, prefer)
  return (
    <section className="ms-sec">
      <h2 className="ms-h">나오는 차례</h2>
      <div className="ms-presets" role="group" aria-label="나오는 차례">
        {MOTION_PRESETS.map((p) => {
          const fits = presetFits(slide, p.id)
          return (
            <button
              key={p.id}
              type="button"
              className={cx('ms-preset', now === p.id && 'is-on')}
              aria-pressed={now === p.id}
              disabled={!fits}
              title={fits ? p.description : '핵심 한 줄이나 강조 상자가 있는 슬라이드에서 골라요'}
              onClick={() => onPick(p.id)}
            >
              <PresetGlyph id={p.id} />
              <span>{p.name}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

/** 연출 그림: 줄 셋이 나오는 때. 진한 줄은 결론, 점선은 누르는 때 */
function PresetGlyph({ id }: { id: MotionPreset }) {
  const bar = (x: number, y: number, w: number, key = false) => <rect key={`${x}.${y}`} x={x} y={y} width={w} height={5} rx={2.5} className={cx(key && 'is-key')} />
  const cut = (x: number) => <line key={`c${x}`} x1={x} x2={x} y1={2} y2={30} className="is-cut" />
  const parts =
    id === 'steps'
      ? [bar(4, 6, 22), bar(15, 14, 22), bar(26, 22, 22)]
      : id === 'together'
        ? [bar(4, 6, 30), bar(4, 14, 30), bar(4, 22, 30)]
        : id === 'clicks'
          ? [bar(4, 6, 12), cut(20), bar(24, 14, 12), cut(40), bar(44, 22, 12)]
          : id === 'answer'
            ? [bar(4, 6, 18, true), bar(16, 14, 20), bar(27, 22, 20)]
            : [bar(4, 6, 18), bar(14, 14, 18), cut(36), bar(40, 22, 14, true)]
  return (
    <svg className="ms-glyph" viewBox="0 0 60 32" aria-hidden="true">
      {parts}
    </svg>
  )
}

/** 고른 컴포넌트의 움직임 */
function BlockMotion({
  slide,
  block,
  n,
  name,
  disabled,
  onSet,
  onPlay,
}: {
  slide: Slide
  block: Block
  n: number
  name: string
  disabled: boolean
  onSet(b: Block, patch: Partial<Block>, one: boolean): void
  onPlay(): void
}) {
  const effect = effectOf(block)
  const when = whenOf(block)
  const from = fromOf(block)
  const speed = speedOf(block)
  // 장면을 고른 동안은 장면이 움직임, 쪽, 빠르기를 정한다. 언제는 그대로 고른다
  const scened = !!sceneOf(slide)
  const choices = effectChoices(block.type)
  const [more, setMore] = useState(false)
  const showMore = more || choices.more.includes(effect)
  return (
    <section className="ms-sec ms-block">
      <div className="ms-block-h">
        <span className="ms-n is-on">{n}</span>
        <h2 className="ms-h">{name}</h2>
        <button type="button" className="btn btn-ghost btn-sm ms-one" disabled={disabled || effect === 'none'} title="이 컴포넌트만 한 번 움직여요" onClick={onPlay}>
          <PlayIcon />
          이것만 보기
        </button>
      </div>
      <Opt label="언제" wide>
        <Segmented<BlockWhen> className="seg-fill" label="언제 나오는지" options={BLOCK_WHENS} value={when} onPick={(w) => onSet(block, { when: w === 'after' ? undefined : w }, false)} />
      </Opt>
      {/* 항목이 있는 컴포넌트: 발표할 때 항목을 누를 때마다 하나씩 */}
      {BLOCKS[block.type].items && (
        <Opt label="항목" wide>
          <Segmented<BlockReveal> className="seg-fill" label="항목이 나오는 때" options={BLOCK_REVEALS} value={revealOf(block)} onPick={(r) => onSet(block, { reveal: r === 'all' ? undefined : r }, false)} />
        </Opt>
      )}
      {scened ? (
        <SceneOverride slide={slide} />
      ) : (
        <Opt label="모션" wide>
          <div className="ms-fxs" role="group" aria-label="모션">
            {/* 어울리는 넷 먼저(기본, 종류에 맞는 둘, 없음), 나머지는 '더 보기'. 고른 것이 '더 보기'에 있으면 펼쳐 둔다 */}
            {BLOCK_EFFECTS.filter((x) => showMore || choices.first.includes(x.id)).map((x) => (
              <button
                key={x.id}
                type="button"
                className={cx('ms-fx', effect === x.id && 'is-on')}
                aria-pressed={effect === x.id}
                title={x.description}
                onClick={() => onSet(block, { effect: x.id === 'auto' ? undefined : (x.id as BlockEffect) }, x.id !== 'none')}
              >
                <span className={cx('fx-demo', `is-${x.id}`)} aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                <span className="ms-fx-n">{x.name}</span>
              </button>
            ))}
          </div>
          {!showMore && (
            <button type="button" className="link-btn ms-fx-more" onClick={() => setMore(true)}>
              모션 더 보기 ({choices.more.length})
            </button>
          )}
        </Opt>
      )}
      {from && !scened && (
        <Opt label="들어오는 쪽" wide>
          <Segmented<BlockFrom> className="seg-fill" label="들어오는 쪽" options={BLOCK_FROMS.map((f) => ({ ...f, name: FROM_SHORT[f.id] }))} value={from} onPick={(f) => onSet(block, { from: f }, true)} />
        </Opt>
      )}
      {!scened && (
        <Opt label="빠르기" wide>
          <Segmented<BlockSpeed> className="seg-fill" label="빠르기" options={BLOCK_SPEEDS} value={speed} onPick={(s) => onSet(block, { speed: s === 'normal' ? undefined : s }, true)} />
        </Opt>
      )}
    </section>
  )
}

/**
 * 이 슬라이드만 다르게: 모션과 화면 전환. 처음에는 접어 두고 지금 무엇인지만 한 줄로 보인다(대개는 발표 설정대로 둔다).
 * 펼치면 발표 설정과 같은 작은 그림으로 고른다: 예전에는 '발표 설정대로'와 값들이 빽빽한 단추 줄이라 무엇이 다른지 알 수 없었다
 */
function SlideMotion({ deck, slide, onTransition }: { deck: Deck; slide: Slide; onTransition(): void }) {
  const setOptions = useDeck((s) => s.setOptions)
  const ownMotion = slide.options.motion
  const ownTr = slide.options.transition && slide.options.transition !== 'auto' ? slide.options.transition : undefined
  const [open, setOpen] = useState(!!ownMotion || !!ownTr)
  // 다른 슬라이드로 가면 그 슬라이드에 따로 고른 것이 있을 때만 펼친다
  const [seen, setSeen] = useState(slide.id)
  if (seen !== slide.id) {
    setSeen(slide.id)
    setOpen(!!ownMotion || !!ownTr)
  }
  const look = useMemo(() => themeStyle(deck.theme), [deck.theme])
  const deckMotion = deck.motion ?? 'calm'
  const deckTr = transitionOf(deck)
  const pickMotion = useCallback((m: Motion | undefined) => setOptions(slide.id, { motion: m }), [setOptions, slide.id])
  const pickTr = (t: Transition | undefined) => {
    setOptions(slide.id, { transition: t })
    onTransition()
  }
  const now = `모션 ${nameOf(MOTIONS, motionOf(deck, slide))} · 화면 전환 ${nameOf(TRANSITIONS, transitionOf(deck, slide))}`
  return (
    <section className="ms-sec ms-own">
      <button type="button" className="ms-own-h" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span>
          <b>이 슬라이드만 다르게</b>
          <span className="ms-own-sum">{ownMotion || ownTr ? now : `${INHERIT}: ${now}`}</span>
        </span>
        <ChevronIcon />
      </button>
      {open && (
        <div className="ms-own-body">
          <p className="ms-h">모션</p>
          <div className="ds-cards ms-own-motions" role="group" aria-label="이 슬라이드의 모션">
            <DemoCard name={INHERIT} sub={nameOf(MOTIONS, deckMotion)} title="발표 설정에서 정한 발표 전체의 모션을 따라요." on={!ownMotion} onPick={() => pickMotion(undefined)}>
              <MotionDemo level={deckMotion} look={look} />
            </DemoCard>
            {MOTIONS.map((m) => (
              <DemoCard key={m.id} name={m.name} title={m.description} on={ownMotion === m.id} onPick={() => pickMotion(m.id)}>
                <MotionDemo level={m.id} look={look} />
              </DemoCard>
            ))}
          </div>
          <p className="ms-h">화면 전환</p>
          <div className="ds-cards ms-own-trs" role="group" aria-label="이 슬라이드로 넘어올 때">
            {SLIDE_TRANSITIONS.map((t) => (
              <DemoCard
                key={String(t.id)}
                name={t.name}
                sub={t.id ? undefined : nameOf(TRANSITIONS, deckTr)}
                title={`${t.description} 고르면 앞 슬라이드부터 한 번 넘겨 보여요.`}
                on={ownTr === t.id}
                onPick={() => pickTr(t.id)}
              >
                <TransitionDemo id={t.id && t.id !== 'auto' ? t.id : deckTr} look={look} />
              </DemoCard>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

/** 앞 장을 보이는 동안: 앞 장이 눈에 들어올 만큼만 */
const ENTER_HOLD = 650

/** 낮은 창(노트북 150% 같은): 무대 둘레를 좁혀 장을 조금이라도 크게 */
function useLowWindow() {
  const [low, setLow] = useState(() => window.innerHeight <= 700)
  useEffect(() => {
    const m = matchMedia('(max-height: 700px)')
    const on = () => setLow(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return low
}

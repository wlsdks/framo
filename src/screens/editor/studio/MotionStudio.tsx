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
import { MOTIONS, motionOf, transitionOf } from '../../../deck/themes'
import type { Block, BlockEffect, BlockFrom, BlockSpeed, BlockWhen, Deck, Motion, Slide, BlockReveal } from '../../../deck/types'
import { cx } from '../../../lib/cx'
import { presentKey } from '../../../lib/presentKeys'
import { FitSlide, pageProps, SlideCanvas, useStableSections } from '../../../slides/SlideCanvas'
import { useDeck } from '../../../store/deckStore'
import { BackIcon, ChevronIcon, PlayIcon, Segmented, useDialog, type Toast } from '../../ui'
import { Opt } from '../Inspector'
import { useLook, type Look } from '../look'
import { FROM_SHORT, INHERIT, InheritNote, SLIDE_TRANSITIONS } from '../MotionPanel'
import { SceneOverride, ScenePicker } from '../ScenePicker'
import { usePlayer, useReducedMotion } from './player'
import { MotionCopy } from './MotionCopy'
import { Timeline } from './Timeline'

// 움직임 편집: 한 장의 움직임을 크게 보며 고치는 화면. 편집기 위에 덮어 연다.
// 가운데에 발표 화면과 똑같이 움직이는 장, 아래에 컴포넌트마다 움직이는 동안을 그린 시간표, 오른쪽에 고르는 값.
// 시간을 손으로 그리지 않는다(고르는 방식): 연출 하나로 장 전체의 차례와 때를 정하고, 컴포넌트마다 움직임, 언제, 쪽, 빠르기를 고른다.
// 값은 편집기의 움직임 탭과 같은 곳(부품의 effect·when·from·speed, 장의 options.order·motion·transition)에 적는다

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
  const info = pageInfo(deck.slides)
  const sections = useStableSections(info)
  const level = motionOf(deck, slide)
  const compose = slide.layout === 'compose'
  const order = useMemo(() => playOrder(slide), [slide])
  const ids = useMemo(() => order.map((b) => b.id), [order])
  const names = useMemo(() => blockNames(slide.blocks ?? []), [slide.blocks])
  const [selected, setSelected] = useState<string | null>(initial && ids.includes(initial) ? initial : (ids[0] ?? null))
  const [hot, setHot] = useState<string | null>(null)
  useEffect(() => {
    if (!selected || !ids.includes(selected)) setSelected(ids[0] ?? null)
  }, [ids, selected])
  // 덮은 화면이라 대화 창처럼: 초점은 안에서만 돌고 Esc로 닫는다(편집기의 단축키는 그동안 쉰다).
  // 열 때 초점은 창 자체에(data-autofocus): 첫 단추('편집으로')에 두면 '재생 (Space)'을 보고 누른 Space가 그 단추를 눌러 창이 닫혔다
  const dialogRef = useRef<HTMLDivElement>(null)
  useDialog(dialogRef, onClose)

  // 장이 바뀔 때마다 무대를 새로 그린다(key). 그려진 무대(root)를 받으면 재생기가 처음부터 움직인다
  const rev = useRef({ slide, n: 0 })
  if (rev.current.slide !== slide) rev.current = { slide, n: rev.current.n + 1 }
  const [root, setRoot] = useState<HTMLDivElement | null>(null)
  const boxes = useBoxes(root)
  const player = usePlayer(root, slide, level)
  const small = useLowWindow()
  const reduced = useReducedMotion()

  // Space: 재생과 멈춤 (단추나 글 칸에 있을 때는 그것의 Space를 둔다. 바늘은 Space로 할 일이 없어 재생한다: 끌어 본 자리에서
  // 이어 보려고 누른 Space가 아무 일도 하지 않았다). 되돌리기와 다시 하기는 편집기와 같은 키로 (스튜디오가 덮은 동안 편집기의 단축키는 쉰다)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 한글 입력 상태에서는 Ctrl+Z가 'ㅋ'로 와서 글자 키는 자판 자리로 읽는다 (편집기의 단축키와 같게)
      const k = presentKey(e).toLowerCase()
      if ((e.metaKey || e.ctrlKey) && !e.altKey && (k === 'z' || k === 'y')) {
        e.preventDefault()
        const st = useDeck.getState()
        if (k === 'y' || e.shiftKey) st.redo()
        else st.undo()
        return
      }
      // ←, →: 앞 장, 다음 장 (발표 화면과 같은 키). 단추를 누른 뒤에도 되게 단추는 막지 않는다. 바늘(slider)은 제 화살표로 옮긴다
      if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.altKey && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
        if ((e.target as Element).closest?.('input, textarea, select, [role="slider"], [contenteditable]')) return
        e.preventDefault()
        goRef.current(e.key === 'ArrowLeft' ? -1 : 1)
        return
      }
      if (e.key !== ' ' || e.repeat) return
      if ((e.target as Element).closest?.('button, input, textarea, select, [contenteditable]')) return
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

  return (
    <div ref={dialogRef} className="ms" role="dialog" aria-modal="true" aria-label="모션 편집" tabIndex={-1} data-autofocus>
      <header className="ms-top">
        <button type="button" className="btn btn-ghost btn-sm ms-back" onClick={onClose} title="편집으로 돌아가기 (Esc)">
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
        <button type="button" className="btn btn-primary btn-sm ms-present" onClick={() => onPresent(slide.id)}>
          <PlayIcon />이 슬라이드부터 발표
        </button>
      </header>

      <div className="ms-body">
        <div
          className={cx('ms-stage', player.playing && 'is-playing')}
          onPointerDown={(e) => {
            const cell = (e.target as Element).closest<HTMLElement>('.bk[data-block]')
            if (cell?.dataset.block) setSelected(cell.dataset.block)
          }}
          onPointerOver={(e) => setHot((e.target as Element).closest<HTMLElement>('.bk[data-block]')?.dataset.block ?? null)}
          onPointerLeave={() => setHot(null)}
        >
          <FitSlide padding={small ? 14 : 24}>
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

        <aside className="ms-side" aria-label="모션 고르기">
          {/* 장면: 장 전체를 한 컷으로. 고르면 무대가 새로 그려져 그 장면으로 처음부터 움직인다 */}
          <section className="ms-sec sp">
            <h2 className="ms-h">장면</h2>
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
          {compose && (
            <BlockMotion
              slide={slide}
              block={block}
              n={block ? ids.indexOf(block.id) + 1 : 0}
              name={block ? (names.get(block.id) ?? '컴포넌트') : ''}
              disabled={level === 'none'}
              onSet={setBlock}
              onPlay={() => block && player.playOne(block.id)}
            />
          )}
          <SlideMotion deck={deck} slide={slide} onTransition={enter} />
          <MotionCopy deck={deck} slide={slide} prefer={prefer} toast={toast} />
        </aside>
      </div>
    </div>
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

/** 연출: 장 전체의 차례와 때를 한 번에. 그림은 세 컴포넌트가 나오는 때(가로가 시간)를 줄인 모습 */
function Presets({ slide, prefer, onPick }: { slide: Slide; prefer: MotionPreset | null; onPick(id: MotionPreset): void }) {
  const now = currentPreset(slide, prefer)
  return (
    <section className="ms-sec">
      <h2 className="ms-h">연출</h2>
      <div className="ms-presets" role="group" aria-label="연출">
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
  block: Block | null
  n: number
  name: string
  disabled: boolean
  onSet(b: Block, patch: Partial<Block>, one: boolean): void
  onPlay(): void
}) {
  if (!block) {
    return (
      <section className="ms-sec">
        <p className="ms-none">슬라이드나 시간표에서 컴포넌트를 고르면 모션을 바꿀 수 있어요.</p>
      </section>
    )
  }
  const effect = effectOf(block)
  const when = whenOf(block)
  const from = fromOf(block)
  const speed = speedOf(block)
  // 장면을 고른 동안은 장면이 움직임, 쪽, 빠르기를 정한다. 언제는 그대로 고른다
  const scened = !!sceneOf(slide)
  return (
    <section className="ms-sec ms-block">
      <div className="ms-block-h">
        <span className="ms-n is-on">{n}</span>
        <h2 className="ms-h">{name}</h2>
        <button type="button" className="btn btn-ghost btn-sm ms-one" disabled={disabled || effect === 'none'} title="이 컴포넌트만 한 번 움직여요" onClick={onPlay}>
          <PlayIcon />
          이것만
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
            {BLOCK_EFFECTS.map((x) => (
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

/** 이 장 전체: 움직임 정도와 장 넘기기 */
function SlideMotion({ deck, slide, onTransition }: { deck: Deck; slide: Slide; onTransition(): void }) {
  const setOptions = useDeck((s) => s.setOptions)
  const onPick = useCallback((m: Motion | undefined) => setOptions(slide.id, { motion: m }), [setOptions, slide.id])
  const own = slide.options.transition ?? undefined
  return (
    <section className="ms-sec">
      <h2 className="ms-h">이 슬라이드</h2>
      {/* 움직임 탭과 같은 말: 예전에는 여기만 '기본'이라 같은 값이 두 이름으로 보였고, 기본이 무엇인지도 알 수 없었다 */}
      <p className="mp-inherit">
        <InheritNote deck={deck} />
      </p>
      <Opt label="모션 세기" wide>
        <Segmented<Motion | undefined>
          className="seg-fill seg-fit"
          label="이 슬라이드의 모션 세기"
          options={[{ id: undefined, name: INHERIT, description: '테마 메뉴에서 정한 발표 전체의 모션 세기를 따라요.' }, ...MOTIONS]}
          value={slide.options.motion ?? undefined}
          onPick={onPick}
        />
      </Opt>
      <Opt label="화면 전환" wide tip="앞 슬라이드에서 이 슬라이드로 넘어올 때의 모습이에요. 고르면 무대에서 앞 슬라이드부터 한 번 넘겨 보여요.">
        <div className="mp-grid" role="group" aria-label="이 슬라이드로 넘어올 때">
          {SLIDE_TRANSITIONS.map((t) => {
            const on = own === t.id
            return (
              <button key={String(t.id)} type="button" className={cx('mp-pick', on && 'is-on')} aria-pressed={on} title={t.description} onClick={() => {
                  setOptions(slide.id, { transition: t.id })
                  onTransition()
                }}>
                {t.name}
              </button>
            )
          })}
        </div>
      </Opt>
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

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import type { AiAsk } from '../../ai/useAiAsk'
import type { AiShare } from '../../ai/useAiShare'
import { boardAreaH, boardTight, withImage } from '../../deck/blocks'
import { pageInfo } from '../../deck/fields'
import { motionOf } from '../../deck/themes'
import type { Deck, LayoutId, Slide } from '../../deck/types'
import { cx } from '../../lib/cx'
import { motionEngine } from '../../motion/engine'
import { BlockEditContext } from '../../slides/blockEdit'
import type { SlideActions } from '../../slides/context'
import { selectWord } from '../../slides/fields'
import { overflowAt, type OverField } from '../../slides/overflow'
import { FitSlide, pageProps, SlideCanvas } from '../../slides/SlideCanvas'
import { useDeck } from '../../store/deckStore'
import { useEscape } from '../ui'
import type { BlockEditing } from './BlockEditor'
import { PREVIEW_MOTION } from './DeckMenus'
import { layoutPreview } from './Inspector'
import { useLook } from './look'
import { SelectionBar, StageSlot } from './SelectionBar'
import type { SidePanel } from './sidePanel'
import { StageTools } from './StageTools'
import { useTypingStill } from './typingStill'

// 편집기 가운데: 고치는 장(무대), 그 위에 뜨는 도구, 아래 단추줄과 발표자 노트

export function SlideStage({
  deck,
  slide,
  ai,
  ask,
  blocks,
  fileOver,
  side,
  layoutPeek,
  onRemove,
}: {
  deck: Deck
  slide: Slide
  ai: AiShare
  ask: AiAsk
  blocks: BlockEditing
  /** 이미지 파일을 장 위로 끌고 있을 때 (놓으면 이미지로 들어간다) */
  fileOver: boolean
  side: SidePanel
  layoutPeek: LayoutId | null
  onRemove: (s: Slide) => void
}) {
  // 할 일(액션)만 쓴다: 덱 전체를 구독하면 고칠 때마다 이 장이 한 번 더 그려진다 (장과 덱은 위에서 받는다)
  const store = useDeck.getState()
  const info = pageInfo(deck.slides)
  const canvasRef = useRef<HTMLDivElement>(null)
  const look = useLook(deck)
  // 테마, 글꼴, 글자 크기, 발표 정보(아래 표시의 이름, 소속)를 바꿔도 다시 잰다
  const overflow = useOverflow(canvasRef, slide, look, deck)

  const actions = useMemo<SlideActions>(
    () => ({
      setField: (key, value) => useDeck.getState().setField(slide.id, key, value),
      setItem: (index, key, value) => useDeck.getState().setItem(slide.id, index, key, value),
      removeItem: (index) => useDeck.getState().removeItem(slide.id, index),
      moveItem: (from, to, key) => useDeck.getState().moveItem(slide.id, from, to, key),
      setOptions: (options, key) => useDeck.getState().setOptions(slide.id, options, key),
      setVariant: (variant, key) => useDeck.getState().setVariant(slide.id, variant, key),
      updateBlock: (blockId, fn, key) => useDeck.getState().updateBlock(slide.id, blockId, fn, key),
      placeImage: (blockId, url) => {
        const st = useDeck.getState()
        const cur = st.deck?.slides.find((s) => s.id === slide.id)
        if (!cur || !st.deck) return
        st.setBlocks(cur.id, withImage(cur.blocks ?? [], blockId, url, boardAreaH(cur, st.deck)))
      },
    }),
    [slide.id],
  )
  const peekSlide = useMemo(() => (layoutPeek ? layoutPreview(slide, layoutPeek) : null), [slide, layoutPeek])

  // 테마 메뉴에서 움직임을 고르면 이 장에서 발표할 때처럼 한 번 보여 준다
  const [preview, setPreview] = useState(0)
  const previewRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const on = () => setPreview((n) => n + 1)
    window.addEventListener(PREVIEW_MOTION, on)
    return () => window.removeEventListener(PREVIEW_MOTION, on)
  }, [])
  // 이 장 미리보기: 편집 표시 없이 발표 화면 그대로 보여 주고 움직임을 한 번 돌린다.
  // 발표를 시작하지 않고도 '윗분이 볼 모습'을 바로 확인하게. 슬라이드를 누르거나 Esc, 다른 장을 고르면 편집으로 돌아온다.
  const [peek, setPeek] = useState(false)
  useEffect(() => setPeek(false), [slide.id])
  useEscape(() => setPeek(false), { active: peek })
  const startPeek = () => {
    setPeek(true)
    setPreview((n) => n + 1)
  }
  // 쓰는 동안 손을 움직이기 전까지 손 아래 칸에 손을 올린 테를 두르지 않는다
  useTypingStill(canvasRef)
  // 두 번 누르기가 쓰는 칸 바로 밖(글자가 칸 상자 위아래로 나온 곳)에 닿아도 그 칸의 낱말을 고른다.
  // 칸의 처리기(fields.tsx)는 칸 안을 두 번 누른 것만 받아서, 크롬이 고른 낱말 뒤 빈칸이 그대로 남았다
  useEffect(() => {
    const root = canvasRef.current
    if (!root) return
    const on = (e: MouseEvent) => {
      const a = document.activeElement
      if (!(a instanceof HTMLElement) || !a.classList.contains('ed-input') || (e.target as Element).closest?.('.ed-input')) return
      if (a.closest('.slide') === (e.target as Element).closest?.('.slide')) selectWord(a, e.clientX, e.clientY, true)
    }
    root.addEventListener('dblclick', on)
    return () => root.removeEventListener('dblclick', on)
  }, [])

  const engine = useMemo(() => motionEngine(), [])
  const level = motionOf(deck, slide)
  useLayoutEffect(() => {
    if (!preview) return
    const root = previewRef.current
    // '누르면' 나오는 컴포넌트도 잠깐 쉬었다 이어서 보인다. 다 움직이고(mo-end) 끝 모습을 잠깐 보인 뒤 편집으로 돌아온다. 길어도 8초면 끝낸다
    const stop = level !== 'none' && root ? engine.play(root, level, { clicks: 'auto' }) : undefined
    let t = window.setTimeout(() => setPreview(0), stop ? 8000 : 600)
    const end = () => {
      window.clearTimeout(t)
      t = window.setTimeout(() => setPreview(0), 700)
    }
    root?.addEventListener('mo-end', end)
    return () => {
      window.clearTimeout(t)
      root?.removeEventListener('mo-end', end)
      stop?.()
    }
  }, [preview, level, engine])

  return (
    <main className="stage">
      <div
        className={cx('ed-canvas', fileOver && 'is-file-over')}
        ref={canvasRef}
        // 부품 밖을 누르면 부품 고르기를 끝낸다
        onPointerDown={(e) => !(e.target as Element).closest('.bk') && blocks.select(null)}
      >
        {/* 고른 것의 도구는 장 아래 도구 줄에: 레이아웃 장은 고른 항목이나 옆 판의 도구, 부품 장은 고른 컴포넌트나 이음표의 도구 */}
        {!peek && !preview && !peekSlide && slide.layout !== 'compose' && <SelectionBar slide={slide} canvasRef={canvasRef} />}
        {!peek && blocks.toolbar && <StageSlot canvasRef={canvasRef}>{blocks.toolbar}</StageSlot>}
        <FitSlide
          padding={4}
          belowHeight={56}
          below={
            <>
              {/* 끄는 동안 놓으면 할 일은 장 아래 단추줄 자리에 (그동안 단추줄은 숨긴다). 장 위쪽에 띄우던 때는 1280×600처럼
                  장 위가 좁은 창에서 장 제목을 덮었다 */}
              {(blocks.hint || fileOver) && (
                <p className="bk-hint" role="status">
                  {blocks.hint ?? '놓으면 이 슬라이드에 이미지로 들어가요'}
                </p>
              )}
              <StageTools
                deck={deck}
                slide={slide}
                ai={ai}
                ask={ask}
                blocks={blocks}
                side={side}
                peekSlide={peekSlide}
                peek={peek}
                overflow={overflow}
                onTogglePeek={() => (peek ? setPeek(false) : startPeek())}
                onReplay={() => setPreview((n) => n + 1)}
                onRemove={onRemove}
              />
            </>
          }
        >
          <div key={preview} ref={previewRef} className={cx(peek && 'stage-peeking')} onPointerDown={peek ? () => setPeek(false) : undefined}>
            <BlockEditContext.Provider value={blocks.edit}>
              <SlideCanvas
                deck={look}
                // 부품을 끌어 부품 장이 아닌 장 위에 오면, 놓았을 때 바뀔 모습을 미리 보여 준다
                slide={peekSlide ?? (peek || preview > 0 ? slide : blocks.stageSlide)}
                mode={peekSlide ? 'preview' : peek || preview > 0 ? 'final' : 'edit'}
                actions={actions}
                {...pageProps(info, slide.id)}
              />
            </BlockEditContext.Provider>
          </div>
        </FitSlide>
        {blocks.ghost}
        {!peek && !preview && blocks.room}
      </div>

      {/* 노트는 한 줄 높이로 접어 두고, 누르면 위로 펼쳐 장을 덮는다. 늘 펼쳐 두면 1280×600에서 장이 높이에 막혀
          590px까지 줄었고, 펼칠 때 자리를 밀어내면 쓰는 동안 장이 작아졌다 커졌다 한다 */}
      <label className="notes">
        <span className="notes-label">발표자 노트</span>
        <textarea
          className="notes-input"
          value={slide.notes}
          // 노트가 어디에 들어가는지: HTML에서는 빼지만 PPT와 작업 파일에는 들어간다(내보내기 메뉴의 설명과 같게).
          // 예전에는 '내보낸 파일에는 보이지 않아요'라고 해서, 노트를 적은 PPT를 그대로 보내도 되는 것처럼 읽혔다
          placeholder="발표자 노트: 발표할 때 말할 내용을 적어요. 듣는 분께는 보이지 않고, PPT로 내보내면 노트 칸에 들어가요."
          onChange={(e) => store.setNotes(slide.id, e.target.value)}
          // Esc로 쓰기를 끝낸다(장의 글 칸과 같게). 예전에는 Esc를 눌러도 노트에 커서가 남아 Ctrl+Z가 편집기의 되돌리기로 가지 않았다
          onKeyDown={(e) => {
            if (e.key !== 'Escape' || e.nativeEvent.isComposing) return
            e.preventDefault()
            e.currentTarget.blur()
          }}
        />
      </label>
    </main>
  )
}

/** 장 아래에 알릴 것: 글이 넘쳤는지('over'), 컴포넌트가 들어갈 자리가 모자란지('tight'), 넘친 칸들 */
export interface Overflow {
  kind: 'over' | 'tight' | null
  fields: OverField[]
  /** fields가 넘친 칸이 아니라 글이 길어 다른 칸을 장 밖으로 밀어낸 칸이다 */
  pushed: boolean
}

/**
 * 슬라이드 안의 글이 영역을 넘치는지('over') 확인한다. 부품 장은 모든 부품이 잘리지 않을 자리가 판에 없는 것도('tight') 알린다.
 * 꽉 채운 장에 나중에 부제를 쓰거나 제목이 두 줄이 되면 컴포넌트를 더 넣지 않아도 자리가 줄어서, 알리지 않으면 글자와 차트가
 * 조용히 작아진다 (판은 고칠 때마다 다시 나누고, 그래도 안 될 때만).
 * 넘친 칸에는 data-over를 달아 장 위에 표시한다(edit.css): 넘쳤다는 말만 있던 때는 어느 칸을 줄여야 하는지 몰랐다
 */
function useOverflow(ref: RefObject<HTMLDivElement | null>, slide: Slide, look: unknown, deck: Deck): Overflow {
  const [over, setOver] = useState<{ on: boolean; fields: OverField[]; pushed: boolean }>({ on: false, fields: [], pushed: false })
  // 그려진 본문 상자의 높이. 컴포넌트 잠금(BlockEditor의 roomOf)과 같은 잰 높이로 '자리가 모자라요'를 본다: 어림으로 보던 때는
  // 둘이 몇 px 어긋나, 잠기지 않은 컴포넌트를 넣자마자 이 알림이 뜨거나 실제로 모자란데도 뜨지 않았다
  const [areaH, setAreaH] = useState<number | null>(null)
  const tight = boardTight(slide, deck, areaH ?? undefined)
  useLayoutEffect(() => {
    const root = ref.current?.querySelector<HTMLElement>('.slide')
    if (!root) return
    let wait = 0
    let active = true
    const check = () => {
      if (!active) return
      // 끌거나 컴포넌트가 새 자리로 움직이는 동안에는 들어갈 글도 잠깐 넘쳐 보인다. 움직임이 끝난 자리를 잰다
      const moving = slide.layout === 'compose' && [...root.querySelectorAll<HTMLElement>('.bk')].some((cell) => cell.getAnimations().some((a) => a.playState === 'running'))
      if (document.body.matches('.is-block-resizing, .is-block-dragging') || moving) {
        window.clearTimeout(wait)
        wait = window.setTimeout(check, 120)
        return
      }
      const now = overflowAt(root)
      const ids = new Set(now.fields.map((f) => f.id))
      for (const input of root.querySelectorAll<HTMLElement>('.ed > .ed-input[data-field]')) {
        const ed = input.parentElement!
        const on = ids.has(input.dataset.field!)
        // 값이 그대로면 건드리지 않는다: 부품 장은 본문 상자 안의 바뀜을 지켜보고 다시 맞춘다(blocks.tsx의 BlockArea)
        if (on !== ed.hasAttribute('data-over')) ed.toggleAttribute('data-over', on)
      }
      setOver((p) => (p.on === now.over && p.pushed === now.pushed && p.fields.map((f) => f.id + f.label).join() === now.fields.map((f) => f.id + f.label).join() ? p : { on: now.over, fields: now.fields, pushed: now.pushed }))
      setAreaH(root.querySelector<HTMLElement>(':scope .bk-area')?.offsetHeight || null)
    }
    check()
    if (document.fonts?.status === 'loading') document.fonts.ready.then(check)
    // 부품 장에서 부품이 자리를 옮기는 동안(움직임 중)에는 넘쳐 보일 수 있어서, 다 움직인 뒤에 한 번 더 본다
    const t = window.setTimeout(check, 800)
    return () => {
      active = false
      window.clearTimeout(t)
      window.clearTimeout(wait)
    }
  }, [ref, slide, look])
  return { kind: over.on ? 'over' : tight ? 'tight' : null, fields: over.on ? over.fields : [], pushed: over.on && over.pushed }
}

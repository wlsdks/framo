import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  autoArranged,
  autoPlace,
  bandOf,
  blockFieldPrefix,
  blockItems,
  blockPrefH,
  changeIssue,
  BLOCK_COL_GAP,
  BLOCK_GAP,
  BLOCKS,
  BOARD_COLS,
  BOARD_ROWS,
  canCompose,
  copyBlock,
  dragGutter,
  effectOf,
  foldableFields,
  gutterLimit,
  imagePlace,
  lookChangeIssue,
  lookOf,
  makeBlock,
  movingBase,
  partFrom,
  placeIssue,
  removeBlock,
  shiftBlock,
  shiftIssue,
  variantOfBlock,
  WHOLE,
  whyNot,
  withItem,
  withLook,
  type Gutter,
  type NoRoom,
  type SavedKind,
  type Shown,
  type ShownCell,
} from '../../deck/blocks'
import { FRAME } from '../../deck/frame'
import { motionOf } from '../../deck/themes'
import type { Block, BlockEffect, BlockLink, BlockType, Deck, Slide } from '../../deck/types'
import { cx } from '../../lib/cx'
import { josa, particle } from '../../lib/josa'
import { gestureKey, usePointerSessions } from '../../lib/pointerSession'
import { motionEngine } from '../../motion/engine'
import type { BlockEdit } from '../../slides/blockEdit'
import { FRAME_PAD } from '../../slides/blockFrame'
import { SlideCanvas } from '../../slides/SlideCanvas'
import { useDeck } from '../../store/deckStore'
import { addSaved } from '../../store/saved'
import { BlocksIcon, dialogOpen, GripIcon, isTyping, undoAction, type Toast } from '../ui'
import { BlockTools } from './BlockTools'
import { CANVAS, COL_W } from './canvas'
import { useLinkEditing } from './LinkEditor'
import { useLook } from './look'
import { narrowText, noRoomText, refuseText } from './noRoom'
import { dropBlocks, dropResult, planDrop, sameBoard, sameEditTarget, type DropPlanKind, type EditTarget } from './planDrop'
import { RoomZone } from './RoomZone'

// 부품 장 편집: 부품을 고르고, 끌어다 놓고, 판을 나누는 선을 끌어 크기를 바꾸는 일.
//
// 놓을 자리와 크기는 판(deck/blocks/board.ts)이 정한다. 여기서는 끄는 동안 놓일 자리를
// 미리 보여 주고(그 자리에 빈 칸이 생기고 다른 부품이 비켜 난다), 놓으면 끌던 부품이 그 칸으로 날아가 맞춰진다.
// 끄는 중에는 저장하지 않는다. 놓을 때 한 번만 바꿔서 되돌리기 한 번으로 돌아온다.

interface Drag {
  kind: 'move' | 'new'
  block: Block
  /** 끄는 부품을 뺀 판. 놓을 자리는 이 판의 자리로 낸다 (손 아래는 화면에 보이는 판으로 잰다: planDrop) */
  base: Block[]
  /** 옮기는 중이면 옮기기 전의 판 (맞바꾸기, 그대로 두기) */
  moving: Block[] | null
  /** 부품 장이 아닌 장에 놓을 때: 같은 내용으로 바꾼 부품 장 */
  composed: Slide | null
  target: EditTarget | null
  /** 놓은 뒤의 판. 끄는 동안 이 모습을 보여 주고, 놓으면 이것을 저장한다 */
  result: Block[] | null
  /** 자리를 고를 때 잰 본문 높이. 넣을 때도 이 높이로 판을 나눠야 끄는 동안 보인 모습 그대로 놓인다 */
  room?: number
  /** 손 아래 자리에 놓을 수 없는 까닭 (그래서 다른 자리에 놓이거나, 넣지 않고 이 까닭을 알린다) */
  blocked: NoRoom | null
  /** 놓으면 할 일: 이 장에 넣기, 이 장을 부품 장으로 바꿔 넣기, 넣지 않고 까닭과 '새 장에 넣기'를 알리기(next) */
  plan: DropPlanKind
  /** 눌러 넣은 판이 알아서 짠 판인지 (planDrop). 끌어 놓은 것은 사람이 고른 자리라 없다 */
  auto?: boolean
  /** 끌고 있는 부품 그림의 크기 (캔버스 px)와 화면 크기 */
  canvas: { w: number; h: number }
  ghost: { w: number; h: number }
  grab: { x: number; y: number }
  source: DOMRect | null
  /** 손이 장 위에 있는지. 장 위에서는 손의 그림을 작게 줄인다 (놓일 자리는 장 위에 미리 보인다) */
  over: boolean
  /** 지금 자리를 고른 곳의 손 (본문 상자 기준 캔버스 px) */
  anchor?: { x: number; y: number } | null
}

const GHOST_MAX = { w: 340, h: 230 }
/**
 * 장 위에 온 손의 그림 크기 (몫). 놓일 자리는 장 위의 빈 칸이 제 크기로 보여 주니, 손의 그림은 무엇을 드는지만 알면 된다.
 * 예전에는 제 크기 그대로 손 아래에 있어서, 손 아래에 생기는 놓일 자리와 장 아래 단추를 덮었다
 */
const GHOST_OVER = 0.42
const SPRING =
  'linear(0, 0.0576, 0.1409, 0.2066, 0.3123, 0.4188, 0.5204, 0.6135, 0.6697, 0.7445, 0.8079, 0.8604, 0.9029, 0.9261, 0.9543, 0.9755, 0.991, 1.0019, 1.007, 1.0122, 1.0151, 1.0162, 1.0161, 1.0156, 1.0143, 1.0127, 1.011, 1.0093, 1.0082, 1.0066, 1.0052, 1.004, 1.003, 1.0025, 1.0017, 1.0011, 1.0007, 1.0004, 1.0002, 1, 1)'
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches

/** 부품 하나만 그린 장 (끌고 있는 부품, 부품 고르기 카드) */
export function soloSlide(block: Block): Slide {
  return { id: `solo-${block.id}`, layout: 'compose', purpose: '', section: '', fields: {}, items: [], hints: {}, guide: '', notes: '', options: {}, blocks: [{ ...block, at: WHOLE }] }
}

/** 글 칸(.ed)에 쓰기 시작한다: 누른 자리(x, y)에 글자 커서를 둔다. 글 밖(빈칸의 안내 위 같은)이면 칸 끝에 */
function caretAt(ed: HTMLElement, x: number, y: number) {
  const input = ed.querySelector<HTMLElement>('.ed-input')
  if (!input) return
  input.focus({ preventScroll: true })
  const sel = getSelection()
  const at = document.caretRangeFromPoint?.(x, y)
  if (!sel) return
  sel.removeAllRanges()
  if (at && input.contains(at.startContainer)) sel.addRange(at)
  else {
    const end = document.createRange()
    end.selectNodeContents(input)
    end.collapse(false)
    sel.addRange(end)
  }
}

/**
 * 글 칸에 쓰던 중이면 그 칸을 놓는다. 누르기를 막는 곳(컴포넌트의 이름표, 판의 선)에서 부른다: 막으면 초점이 쓰던 칸에 남아서,
 * 다른 컴포넌트를 고르고 빼려고 누른 Delete·Backspace가 쓰던 칸의 글자를 지웠고 Ctrl+Z도 그 칸의 글로 갔다
 */
function leaveTyping() {
  const a = document.activeElement
  if (a instanceof HTMLElement && a.closest('input, textarea, [contenteditable]')) a.blur()
}

/** 본문 상자(.bk-area)의 화면 자리와 캔버스 크기 */
function measureArea(el: HTMLElement | null) {
  if (!el) return null
  const rect = el.getBoundingClientRect()
  const k = el.offsetWidth ? rect.width / el.offsetWidth : 1
  return { rect, k, size: { w: el.offsetWidth, h: el.offsetHeight } }
}

/**
 * 부품 장이 아닌 장을 부품 장으로 바꿨을 때의 본문 상자 어림: 장의 틀(위, 본문 아래의 띠, 옆),
 * 지금 장의 제목 높이와 제목 아래 간격(FRAME.gap)을 뺀다. 바뀐 모습이 그려지면 그때부터는 실제로 잰다
 */
function guessArea(frame: DOMRect) {
  const slide = document.querySelector<HTMLElement>('.ed-canvas .slide')
  const head = slide?.querySelector<HTMLElement>('.s-head')
  const k = frame.width / CANVAS.w
  // 빈 부제는 컴포넌트 장에서 제목 아래 여백 위에 떠 있어 본문을 밀지 않는다(edit.css의 .l-compose .s-lead.is-empty). 레이아웃 장에서는
  // 부제 줄(81px)을 차지하니 그만큼 빼야 바꾼 뒤와 같다. 빼지 않아서 부제를 비운 핵심 포인트 장에서 카드 25개를 잠갔는데, 바꾸면 16개가 더 들어갔다
  const lead = head?.querySelector<HTMLElement>(':scope > .s-lead.is-empty')
  const leadH = lead ? lead.offsetHeight + (parseFloat(getComputedStyle(lead).marginTop) || 0) : 0
  const top = FRAME.y + (head && head.offsetHeight ? head.offsetHeight - leadH + FRAME.gap : 0)
  const size = { w: CANVAS.w - FRAME.x * 2, h: CANVAS.h - top - (slide?.classList.contains('hide-foot') ? FRAME.y : FRAME.bottom) }
  return { rect: new DOMRect(frame.left + FRAME.x * k, frame.top + top * k, size.w * k, size.h * k), k, size }
}

/**
 * 끄는 동안 화면에 보이는 판 (본문 상자 기준 캔버스 px): 컴포넌트마다 칸 상자와 테두리 상자(blockFrame.ts의 --fr-*), 놓일 자리.
 * 칸의 자리는 offset으로 잰다: 자리를 옮기는 움직임(useFlip)의 translate를 세지 않아 움직이는 중에도 끝자리다.
 * 그려진 판이 보일 판(expect)과 다르면(놓일 자리를 바꾼 뒤 아직 그리지 않았으면) null
 */
function shownOf(area: HTMLElement, dragId: string, expect: Block[]): Shown | null {
  const els = Array.from(area.querySelectorAll<HTMLElement>(':scope > .bk'))
  if (els.length !== expect.length) return null
  const want = new Map(expect.map((b) => [b.id, b.at]))
  const cells = new Map<string, ShownCell>()
  let slot: ShownCell | null = null
  for (const c of els) {
    const id = c.dataset.block ?? ''
    const a = want.get(id)
    const v = (name: string) => c.style.getPropertyValue(name)
    if (!a || Number(v('--x')) !== a.x || Number(v('--y')) !== a.y || Number(v('--w')) !== a.w || Number(v('--h')) !== a.h) return null
    const cell = { x: c.offsetLeft, y: c.offsetTop, w: c.offsetWidth, h: c.offsetHeight }
    // 테두리는 칸에서 이만큼 안쪽 (값이 없으면 칸 둘레 그대로: edit.css의 기본값)
    const fr = (name: string) => {
      const n = parseFloat(v(name))
      return Number.isFinite(n) ? n : -FRAME_PAD
    }
    const ink = { x: cell.x + fr('--fr-l'), y: cell.y + fr('--fr-t'), w: cell.w - fr('--fr-l') - fr('--fr-r'), h: cell.h - fr('--fr-t') - fr('--fr-b') }
    if (id === dragId) slot = { cell, ink }
    else cells.set(id, { cell, ink })
  }
  return { cells, slot }
}

/** 컴포넌트 고르기에 보이는 것: 기본 컴포넌트, 내 컴포넌트(저장해 둔 것) */
export type LibraryView = 'base' | 'mine'

/**
 * 고른 부품에서 내 컴포넌트로 저장할 수 있는 것과 든 컴포넌트 수: 이 컴포넌트, 옆에 다른 컴포넌트가 있으면 나란한 묶음,
 * 그리고 이 장(제목 칸과 장 설정까지)
 */
function saveChoices(slide: Slide, blockId: string): { kind: SavedKind; count: number }[] {
  const blocks = slide.blocks ?? []
  const band = bandOf(blocks, blockId)
  const out: { kind: SavedKind; count: number }[] = [{ kind: 'block', count: 1 }]
  if (band.length > 1 && band.length < blocks.length) out.push({ kind: 'row', count: band.length })
  out.push({ kind: 'slide', count: blocks.length })
  return out
}

export interface BlockEditing {
  /** 무대의 부품 장에 넣어 주는 것 */
  edit: BlockEdit
  /** 무대에 그릴 장. 부품을 끌고 부품 장이 아닌 장 위에 오면 바꾼 모습을 미리 보여 준다 */
  stageSlide: Slide
  /** 놓으면 할 일 안내 (장 아래 단추줄 자리에 띄운다) */
  hint: string | null
  ghost: ReactNode
  toolbar: ReactNode
  libraryOpen: boolean
  setLibraryOpen(open: boolean): void
  /** 컴포넌트 고르기의 무엇을 보이는지: 기본 컴포넌트, 내 컴포넌트 */
  libraryView: LibraryView
  setLibraryView(view: LibraryView): void
  /**
   * 부품 고르기 카드를 누르기 시작할 때. 끌면 끌어다 놓기, 그냥 떼면 알아서 넣기 (onTap을 주면 그것을).
   * 종류 대신 미리 채운 부품(내 컴포넌트)을 주면 그 부품을 끈다
   */
  pressCard(e: ReactPointerEvent<HTMLElement>, what: BlockType | Block, onTap?: () => void): void
  insert(type: BlockType, from?: HTMLElement | null): void
  /** 미리 채운 부품 하나를 알아서 고른 자리에. 이 장에 자리가 없으면 넣지 않고 까닭과 '새 장에 넣기'를 알린다 */
  insertBlock(block: Block, from?: HTMLElement | null): void
  /** 이 장 다음에 컴포넌트 장을 새로 만들어 넣는다 (쓰는 사람이 '새 장에 넣기'를 골랐을 때만). 미리 채운 부품(내 컴포넌트)도 */
  insertNew(what: BlockType | Block): void
  /** 미리 채운 부품 하나를 화면의 이 자리에 (끌어다 놓기와 같은 자리 찾기) */
  dropBlock(block: Block, x: number, y: number): void
  /** 이 부품(종류, 또는 미리 채운 부품)을 지금 장 어디에도 넣을 수 없을 때 그 까닭 (부품 고르기 카드에 보인다) */
  issueFor(what: BlockType | Block): NoRoom | null
  /** 지금 장에 넣을 본문 높이 (부품 장이 아닌 장은 부품 장으로 바꿨을 때의 어림). 잴 수 없으면 undefined */
  areaHeight(): number | undefined
  /** 이음표 카드를 누르기 시작할 때. 끌면 컴포넌트 사이에 놓고, 그냥 떼면 알아서 고른 사이에 넣는다 */
  pressLinkCard(e: ReactPointerEvent<HTMLElement>, link: BlockLink): void
  insertLink(link: BlockLink): void
  /** 이 이음표를 눌러 넣을 사이가 지금 장에 있는지 (부품 고르기 카드의 잠금) */
  linkOpen(link: BlockLink): boolean
  selected: string | null
  select(id: string | null): void
  convert(): void
  /** 부품 장이 아닌 장의 아래쪽이 비었을 때 그 자리에 띄우는 '여기에 부품 넣기' */
  room: ReactNode
}

export function useBlockEditing(deck: Deck, slide: Slide, toast: Toast): BlockEditing {
  // 할 일(액션)만 쓰므로 바뀔 때마다 다시 그리지 않게 한 번 꺼내 둔다
  const store = useDeck.getState()
  // 끄는 동안 창에 건 처리기. 편집기가 사라지면 끝나지 않은 끌기를 거둔다
  const startSession = usePointerSessions()
  const [selected, setSelected] = useState<string | null>(null)
  // 끄고 있는 판의 선 (dir + 선 앞쪽 첫 부품): 그 손잡이를 진하게 (blocks.tsx의 Lines)
  const [resizing, setResizing] = useState<string | null>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  // 놓은 뒤 끌던 그림이 칸으로 날아가는 동안 (id가 없으면 집어 온 카드로 돌아가 사라진다)
  const [landing, setLanding] = useState<{ id: string | null; ghost: Drag } | null>(null)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [libraryView, setLibraryView] = useState<LibraryView>('base')
  // 장 아래 빈자리의 '여기에 부품 넣기'로 부품 고르기를 열었으면, 눌러 넣는 부품을 그 자리(맨 아래 새 줄)에
  const [toBottom, setToBottom] = useState(false)
  useEffect(() => {
    if (!libraryOpen) setToBottom(false)
  }, [libraryOpen])
  // 빈 컴포넌트 장으로 오면(새로 만들었거나, 다 뺀 장으로 넘어오면) 컴포넌트 고르기를 바로 연다. 이 장에서 할 일이 컴포넌트를 고르는 것뿐인데
  // '이 장 설정'이 열린 채로 남아서 장 가운데의 '컴포넌트 고르기'를 한 번 더 눌러야 했다
  const emptyCompose = slide.layout === 'compose' && !(slide.blocks ?? []).length
  useEffect(() => {
    if (emptyCompose) setLibraryOpen(true)
    // 장이 바뀔 때만 본다: 같은 장에서 컴포넌트를 다 빼고 고르기를 닫았으면 다시 열지 않는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slide.id])
  const dragRef = useRef<Drag | null>(null)
  dragRef.current = drag
  const areaEl = useRef<HTMLDivElement | null>(null)
  const ghostEl = useRef<HTMLDivElement | null>(null)
  const slideRef = useRef(slide)
  slideRef.current = slide
  const engine = useMemo(() => motionEngine(), [])
  const look = useLook(deck)

  // '칸 더하기'로 연 빈칸 ('부품id 칸키'). 다른 장으로 가면 다시 접는다
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set())
  useEffect(() => {
    setSelected(null)
    setOpened(new Set())
  }, [slide.id])
  // 뺀 부품이 되돌리기로 다시 나타나면 고른다: 무엇이 돌아왔는지 보이고 바로 옮기거나 고칠 수 있게 (예전에는 아무것도 고르지 않아 어디에 돌아왔는지 찾아야 했다)
  const removed = useRef<{ slide: string; id: string } | null>(null)
  useEffect(() => {
    const r = removed.current
    if (!r || r.slide !== slide.id || !slide.blocks?.some((b) => b.id === r.id)) return
    removed.current = null
    setSelected(r.id)
  }, [slide])

  const compose = slide.layout === 'compose'

  const links = useLinkEditing({ slideRef, areaEl, toast, deselectBlock: () => setSelected(null), selectedBlock: selected })

  // ---------- 놓기 ----------

  /** 놓은 부품의 칸으로 끌던 그림을 보내고, 닿을 때 칸을 드러낸다 */
  const land = useCallback((d: Drag) => {
    setLanding({ id: d.block.id, ghost: d })
    setSelected(d.block.id)
  }, [])

  /** 이 장 다음에 컴포넌트 장을 새로 만들어 넣는다. 쓰는 사람이 고를 때만: 넣을 자리가 없다고 저절로 새 장을 만들지 않는다 */
  const addToNew = useCallback(
    (block: Block) => {
      store.addComposeSlide(autoPlace([], block) ?? [{ ...block, at: WHOLE }], slideRef.current.id)
      toast.show(`새 컴포넌트 슬라이드를 만들어 ${josa(BLOCKS[block.type].name, '을', '를')} 넣었어요`, undoAction(toast), 6000)
    },
    [store, toast],
  )

  const finish = useCallback(
    (d: Drag) => {
      const s = slideRef.current
      dragRef.current = null
      setDrag(null)
      if (d.kind === 'move') {
        // 놓을 자리가 없는 곳에 놓으면 원래 자리로 돌아간다
        if (d.plan === 'place' && d.result && d.target?.kind !== 'stay') store.setBlocks(s.id, d.result)
        land(d)
        return
      }
      if (!d.plan) {
        // 장 밖에 놓으면 그만둔다: 집어 온 카드로 돌아가 사라진다
        setLanding({ id: null, ghost: d })
        return
      }
      const block = d.block
      if (d.plan === 'place' && d.result) {
        store.setBlocks(s.id, d.result, undefined, d.auto)
      } else if (d.plan === 'convert' && d.result && d.composed) {
        store.replaceSlide(s.id, { ...d.composed, blocks: d.result })
        toast.show('이 슬라이드를 컴포넌트 슬라이드로 바꿔 넣었어요', undoAction(toast), 6000)
      } else {
        // 이 장에 넣을 수 없으면 넣지 않는다: 들고 온 카드로 돌아가고, 까닭과 '새 장에 넣기'를 알린다.
        // 예전에는 묻지 않고 다음 장을 새로 만들어 넣어서, 컴포넌트를 넣을 때마다 장이 하나씩 늘었다
        setLanding({ id: null, ghost: d })
        toast.show(refuseText(d.blocked, block.type, s.layout === 'compose' || canCompose(s.layout)), { label: '새 슬라이드에 넣기', run: () => addToNew(block) }, 8000)
        return
      }
      land(d)
    },
    [store, toast, land, addToNew],
  )

  // 놓은 뒤: 칸이 그려지면 끌던 그림을 그 칸에 맞춰 날려 보내고, 도착하면 칸을 보여 준다
  useLayoutEffect(() => {
    if (!landing) return
    const g = ghostEl.current
    const d = landing.ghost
    // 장 위에서 줄여 든 그림은 집은 자리(grab)를 가운데로 줄어 있다. 날려 보내기 전에 잡는 점을 옮겨도 그 자리에 그대로 보이게,
    // 줄인 몫(s0)과 잡는 점이 바뀐 만큼 처음 자리를 고친다
    const s0 = d.over ? GHOST_OVER : 1
    const at = (g?.style.translate || '0px 0px').split(' ').map(parseFloat)
    const from = (ox: number, oy: number) =>
      `${at[0] + (d.grab.x * d.ghost.w - ox) * (1 - s0)}px ${(at[1] ?? 0) + (d.grab.y * d.ghost.h - oy) * (1 - s0)}px`
    if (!landing.id) {
      if (!g || !d.source || reduced()) {
        setLanding(null)
        return
      }
      const r = d.source
      const back = g.animate(
        [
          { translate: from(0, 0), scale: String(s0), opacity: 1 },
          { translate: `${r.left}px ${r.top}px`, scale: `${r.width / d.ghost.w} ${r.height / d.ghost.h}`, opacity: 0 },
        ],
        { duration: 300, easing: 'cubic-bezier(0.4, 0, 0.6, 1)', fill: 'forwards' },
      )
      g.style.transformOrigin = '0 0'
      back.finished.then(
        () => setLanding((l) => (l === landing ? null : l)),
        () => {},
      )
      return
    }
    const cell = document.querySelector<HTMLElement>(`.ed-canvas .bk[data-block="${CSS.escape(landing.id)}"]`)
    if (!cell || !g || reduced()) {
      setLanding(null)
      return
    }
    // FLIP으로 이미 움직이기 시작한 칸은 멈추고 여기서 다시. 재기 전에 멈춘다: 움직이기 시작한 칸은 아직 옛 자리(끄는 동안의 판의 칸)에
    // 있어서, 그 자리로 재면 놓은 칸이 쌓인 자리와 어긋난 데서 커져 나왔다
    cell.getAnimations().forEach((a) => a.cancel())
    // 조립되는 느낌: 손에 든 그림은 칸 가운데로 줄어들며 사라지고, 진짜 칸은 그 그림 자리에서 나와
    // 제 비율 그대로 자기 자리로 커지며 살짝 튀어 맞춰진다. 비율을 한 가지로만 키워서 글자가 늘어나 보이지 않게
    const r = cell.getBoundingClientRect()
    const gr = g.getBoundingClientRect()
    const vs = cell.offsetWidth ? r.width / cell.offsetWidth : 1
    const k = Math.min(gr.width / r.width, gr.height / r.height, 1)
    const dx = (gr.left + gr.width / 2 - (r.left + r.width / 2)) / vs
    const dy = (gr.top + gr.height / 2 - (r.top + r.height / 2)) / vs
    cell.animate(
      [
        { transformOrigin: '50% 50%', transform: `translate(${dx}px, ${dy}px) scale(${k})`, opacity: 0.35 },
        { transformOrigin: '50% 50%', transform: 'none', opacity: 1 },
      ],
      { duration: 520, easing: SPRING },
    )
    // 넣은 뒤에 발표할 때의 움직임을 이어서 틀지 않는다: 자리에 맞춰진 내용이 사라졌다가 조각조각 다시 나타나서
    // 넣자마자 깨진 것처럼 보였다. 움직임은 '이 장 설정'의 움직임 ▶나 컴포넌트 도구의 움직임에서 미리 본다
    const end = { x: r.left + r.width / 2 - d.ghost.w / 2, y: r.top + r.height / 2 - d.ghost.h / 2 }
    const start = from(d.ghost.w / 2, d.ghost.h / 2)
    g.style.transformOrigin = '50% 50%'
    const fly = g.animate(
      [
        { translate: start, scale: String(s0), rotate: g.style.rotate || '0deg', opacity: 1 },
        { translate: `${end.x}px ${end.y}px`, scale: String(s0 * Math.min(r.width / gr.width, r.height / gr.height)), rotate: '0deg', opacity: 0 },
      ],
      { duration: 300, easing: 'cubic-bezier(0.3, 0, 0.2, 1)', fill: 'forwards' },
    )
    fly.finished.then(
      () => setLanding((l) => (l === landing ? null : l)),
      () => {},
    )
  }, [landing])

  // ---------- 끌기 ----------

  const pointer = useRef({ x: 0, y: 0, vx: 0, tilt: 0 })
  // 그려진 판이 아직 보일 판이 아니어서 다시 잰 횟수 (몇 번 넘으면 그냥 판의 칸으로 잰다)
  const stale = useRef(0)
  // 마지막으로 놓일 자리를 잰 손의 자리 (화면 px)
  const tracked = useRef<{ x: number; y: number } | null>(null)

  /** 끄는 중의 자리 계산. 바뀔 때만 다시 그린다 */
  const track = useCallback((x: number, y: number) => {
    const d = dragRef.current
    if (!d) return
    const frame = document.querySelector<HTMLElement>('.ed-canvas .slide-frame')
    const fr = frame?.getBoundingClientRect()
    const over = !!fr && x >= fr.left - 24 && x <= fr.right + 24 && y >= fr.top - 24 && y <= fr.bottom + 24
    // 아직 부품 장으로 바뀌기 전이면 바뀐 뒤의 본문 상자를 어림한다
    const el = areaEl.current
    const area = over ? (measureArea(el) ?? (fr ? guessArea(fr) : null)) : null
    // 손 아래는 지금 화면에 보이는 판으로 잰다: 미리 보인 판(놓일 자리), 자리를 고르기 전이면 지금 판. 놓일 자리를 바꾼 뒤 아직
    // 그리지 않았으면 다음 그림에서 다시 잰다 (지난 판으로 재면 손 아래가 어긋나 방금 고른 자리를 다시 바꿨다)
    const s = slideRef.current
    const expect = d.result && (d.plan === 'place' || d.plan === 'convert') ? d.result : s.layout === 'compose' ? (s.blocks ?? []) : null
    const shown = area && el && expect ? shownOf(el, d.block.id, expect) : null
    if (area && el && expect && !shown && stale.current < 3) {
      stale.current++
      requestAnimationFrame(() => track(x, y))
      return
    }
    stale.current = 0
    tracked.current = { x, y }
    const at = area && { p: { x: (x - area.rect.left) / area.k, y: (y - area.rect.top) / area.k }, size: area.size, shown }
    const { plan, target, result, blocked, composed, base, room } = planDrop(s, d, { by: 'pointer', over, at })
    if (
      over !== d.over ||
      plan !== d.plan ||
      !sameEditTarget(target, d.target) ||
      composed !== d.composed ||
      room !== d.room ||
      JSON.stringify(blocked) !== JSON.stringify(d.blocked)
    ) {
      const anchor = sameEditTarget(target, d.target) ? d.anchor : (at?.p ?? null)
      const next = { ...d, plan, target, result, blocked, composed, base, room, over, anchor }
      // 놓는 순간에도 바로 읽을 수 있게 그리기를 기다리지 않고 맞춘다
      dragRef.current = next
      setDrag(next)
    }
  }, [])

  const moveGhost = useCallback((x: number, y: number) => {
    const g = ghostEl.current
    const d = dragRef.current
    if (!g || !d) return
    const p = pointer.current
    p.vx = p.vx * 0.7 + (x - p.x) * 0.3
    p.x = x
    p.y = y
    // 옆으로 빨리 끌면 그 쪽으로 살짝 기운다 (손에 쥔 느낌)
    p.tilt = Math.max(-5, Math.min(5, p.vx * 0.45))
    g.style.translate = `${x - d.grab.x * d.ghost.w}px ${y - d.grab.y * d.ghost.h}px`
    g.style.rotate = `${p.tilt.toFixed(2)}deg`
  }, [])

  const begin = useCallback(
    (d: Drag, x: number, y: number, from: DOMRect | null) => {
      pointer.current = { x, y, vx: 0, tilt: 0 }
      tracked.current = null
      setSelected(null)
      dragRef.current = d
      setDrag(d)
      const session = startSession('is-block-dragging')
      // 그림이 그려지면 집어 든 자리(칸 또는 카드)에서 손 아래 크기로 줄어들며 들린다
      requestAnimationFrame(() => {
        const g = ghostEl.current
        if (!g) return
        moveGhost(x, y)
        g.style.transformOrigin = `${d.grab.x * d.ghost.w}px ${d.grab.y * d.ghost.h}px`
        if (from && !reduced()) g.animate([{ scale: String(from.width / d.ghost.w), opacity: 0.6 }, { scale: String(d.over ? GHOST_OVER : 1), opacity: 1 }], { duration: 380, easing: SPRING })
      })
      let raf = 0
      session.onEnd(() => cancelAnimationFrame(raf))
      const end = (cancel: boolean) => {
        session.end()
        const cur = dragRef.current
        if (!cur) return
        finish(cancel ? { ...cur, plan: null, target: null, result: null, blocked: null } : cur)
      }
      session.on('pointermove', (e) => {
        moveGhost(e.clientX, e.clientY)
        cancelAnimationFrame(raf)
        raf = requestAnimationFrame(() => track(e.clientX, e.clientY))
      })
      session.on('pointerup', (e) => {
        // 마지막으로 잰 자리에서 손이 움직이지 않았으면 다시 재지 않고 보이는 대로 놓는다: 놓일 자리를 미리 보이면 판이 바뀌어,
        // 놓는 순간 다시 재면 손 아래가 달라져 보이던 것과 다른 자리에 놓였다
        const last = tracked.current
        if (!last || Math.hypot(e.clientX - last.x, e.clientY - last.y) > 1) track(e.clientX, e.clientY)
        end(false)
      })
      session.on('pointercancel', () => end(true))
      session.on('keydown', (e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          end(true)
        }
      })
    },
    [finish, moveGhost, track, startSession],
  )

  /** 눌렀다가 조금 움직이면 끌기 시작. 그냥 떼면 onClick */
  const press = useCallback(
    (e: ReactPointerEvent<HTMLElement>, start: (x: number, y: number) => void, onClick?: () => void) => {
      if (e.button !== 0) return
      const sx = e.clientX
      const sy = e.clientY
      const session = startSession()
      session.on('pointermove', (ev) => {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return
        session.end()
        start(ev.clientX, ev.clientY)
      })
      session.on('pointerup', () => {
        session.end()
        onClick?.()
      })
    },
    [startSession],
  )

  /** 캔버스 크기의 부품 그림을 손 아래에 들 만한 크기로 */
  const ghostSize = (canvas: { w: number; h: number }, k: number) => {
    const w = canvas.w * k
    const h = canvas.h * k
    const f = Math.min(1, GHOST_MAX.w / w, GHOST_MAX.h / h)
    return { w: w * f, h: h * f }
  }

  const startMove = useCallback(
    (block: Block, x: number, y: number) => {
      const s = slideRef.current
      const cell = areaEl.current?.querySelector<HTMLElement>(`.bk[data-block="${CSS.escape(block.id)}"]`)
      const area = measureArea(areaEl.current)
      if (!cell || !area) return
      const r = cell.getBoundingClientRect()
      const canvas = { w: cell.offsetWidth + 80, h: cell.offsetHeight + 80 }
      const ghost = ghostSize(canvas, area.k)
      const grab = { x: Math.min(1, Math.max(0, (x - r.left) / r.width)), y: Math.min(1, Math.max(0, (y - r.top) / r.height)) }
      const blocks = s.blocks ?? []
      begin(
        {
          kind: 'move',
          block,
          // 옆 부품이 빈자리를 덮은 판 (옮기기가 보는 그대로). 옆 부품과 잇던 이음표는 두고 간다 (새 자리의 옆 부품과는 이어지지 않는다). 제자리에 놓으면 그대로 남는다
          base: movingBase(blocks, block.id, area.size.h),
          moving: blocks,
          composed: null,
          target: { kind: 'stay' },
          result: blocks,
          blocked: null,
          plan: 'place',
          canvas,
          ghost,
          grab,
          source: r,
          over: true,
        },
        x,
        y,
        r,
      )
    },
    [begin],
  )

  /** 넣을 본문 높이: 부품 장은 잰 높이, 부품 장으로 바꿀 장은 바꿨을 때의 어림 */
  const roomOf = (s: Slide) => {
    if (s.layout === 'compose' || !canCompose(s.layout)) return measureArea(areaEl.current)?.size.h
    const fr = document.querySelector<HTMLElement>('.ed-canvas .slide-frame')?.getBoundingClientRect()
    return fr ? guessArea(fr).size.h : undefined
  }

  const newDrag = (block: Block, from: DOMRect | null, x: number, y: number): Drag => {
    const s = slideRef.current
    const spec = BLOCKS[block.type]
    const area = measureArea(areaEl.current)
    const k = area?.k ?? (document.querySelector<HTMLElement>('.ed-canvas .slide-frame')?.getBoundingClientRect().width ?? 960) / CANVAS.w
    const canvas = { w: spec.prefSpan * (COL_W + BLOCK_COL_GAP) - BLOCK_COL_GAP + 80, h: Math.max(blockPrefH(block), 300) + 80 }
    const ghost = ghostSize(canvas, k)
    const grab = from ? { x: Math.min(1, Math.max(0, (x - from.left) / from.width)), y: Math.min(1, Math.max(0, (y - from.top) / from.height)) } : { x: 0.5, y: 0.5 }
    return { kind: 'new', block, base: s.blocks ?? [], moving: null, composed: null, target: null, result: null, blocked: null, plan: null, canvas, ghost, grab, source: from, over: false }
  }

  const pressCard = useCallback(
    (e: ReactPointerEvent<HTMLElement>, what: BlockType | Block, onTap?: () => void) => {
      const card = e.currentTarget
      const make = () => (typeof what === 'string' ? makeBlock(what) : what)
      press(
        e,
        (x, y) => {
          const from = card.getBoundingClientRect()
          begin(newDrag(make(), from, x, y), x, y, from)
        },
        onTap ?? (() => insertBlock(make(), card)),
      )
    },
    // eslint 없음: newDrag와 insert는 그릴 때마다 새로 만들어지지만 slideRef로 지금 장을 읽는다
    [press, begin],
  )

  /** 눌러서 넣기: 알아서 고른 자리에, 카드에서 날아와 맞춰진다 */
  function insert(type: BlockType, from?: HTMLElement | null) {
    insertBlock(makeBlock(type), from)
  }

  /** 미리 채운 부품(붙여 넣은 이미지 같은)을 눌러서 넣기와 같은 길로: 알아서 고른 자리, 없으면 넣지 않고 까닭과 '새 장에 넣기'를 알린다 */
  function insertBlock(block: Block, from?: HTMLElement | null) {
    const s = slideRef.current
    const r = from?.getBoundingClientRect() ?? null
    const d = newDrag(block, r, r ? r.left + r.width / 2 : 0, r ? r.top + r.height / 2 : 0)
    const full = { ...d, ...planDrop(s, d, { by: 'auto', h: roomOf(s), bottom: toBottom }) }
    if (!r) {
      finish(full)
      return
    }
    // 카드 자리에 그림을 띄워 두고 놓기와 같은 길로 보낸다
    pointer.current = { x: r.left + r.width / 2, y: r.top + r.height / 2, vx: 0, tilt: 0 }
    setDrag(full)
    requestAnimationFrame(() => {
      const g = ghostEl.current
      if (g) {
        g.style.translate = `${r.left + r.width / 2 - d.ghost.w / 2}px ${r.top + r.height / 2 - d.ghost.h / 2}px`
        g.style.transformOrigin = `${d.ghost.w / 2}px ${d.ghost.h / 2}px`
      }
      requestAnimationFrame(() => finish(full))
    })
  }

  /**
   * 화면의 이 자리(x, y)에 미리 채운 부품을 놓는다: 끌어다 놓을 때와 같은 자리 찾기(놓을 수 없으면 가장 가까운 자리, 장에 자리가 없으면
   * 넣지 않고 까닭과 '새 장에 넣기'를 알린다). 바탕 화면에서 끌어 온 이미지 파일처럼 손에 든 그림 없이 놓이는 것. 놓인 자리로 그 자리에서 날아 들어간다
   */
  function dropBlock(block: Block, x: number, y: number) {
    const d = newDrag(block, null, x, y)
    dragRef.current = d
    track(x, y)
    let full = dragRef.current ?? d
    // 이미지는 손 아래 자리보다 이미지 비율에 맞는 자리를 먼저 (끌어 오는 동안 이미지를 볼 수 없어 손 아래 자리가 어림이라서).
    // 비율이 비슷하게 맞는 자리끼리는 놓은 곳에 가까운 쪽
    if ((full.plan === 'place' || full.plan === 'convert') && full.room !== undefined) {
      const area = measureArea(areaEl.current)
      const near = area ? { x: (x - area.rect.left) / area.k, y: (y - area.rect.top) / area.k } : undefined
      const t = imagePlace(full.base, block, full.room, near)
      const result = t && dropResult(full, full.base, t, full.room)
      if (t && result) full = { ...full, target: t, result, blocked: null }
    }
    pointer.current = { x, y, vx: 0, tilt: 0 }
    setDrag(full)
    requestAnimationFrame(() => {
      const g = ghostEl.current
      if (g) {
        g.style.translate = `${x - d.ghost.w / 2}px ${y - d.ghost.h / 2}px`
        g.style.transformOrigin = `${d.ghost.w / 2}px ${d.ghost.h / 2}px`
      }
      requestAnimationFrame(() => finish(full))
    })
  }

  /** 부품 고르기 카드마다: 지금 장 어디에도 넣을 수 없으면 그 까닭. 부품 장이 아닌 장은 부품 장으로 바꾼 모습으로 본다 */
  function issueFor(what: BlockType | Block): NoRoom | null {
    const s = slideRef.current
    const at = dropBlocks(s)
    return at && placeIssue(at.blocks, typeof what === 'string' ? makeBlock(what) : what, roomOf(s))
  }

  // ---------- 판을 나누는 선 ----------

  const onGutterPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>, gutter: Gutter) => {
      if (e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()
      leaveTyping()
      // 더 끌 수 없는 쪽으로 끌면 손잡이가 꿈쩍하지 않아 고장처럼 보인다. 까닭을 알린다: 같은 까닭은 끄는 동안 한 번만.
      // 손을 떼지 않고 반대쪽 끝에 닿으면 그쪽 까닭을 (한 번만 알리던 때는 앞서 띄운 다른 컴포넌트의 까닭이 그대로 떠 있었다)
      let told = ''
      let g = gutter
      const startY = e.clientY
      // 한 번 끄는 동안은 되돌리기 한 단계 (손을 멈췄다 움직여도). 곧바로 다시 끈 것은 따로
      const key = gestureKey(`${slideRef.current.id}.line`)
      const session = startSession('is-block-resizing')
      setResizing(`${gutter.dir}${gutter.key}`)
      // 줄 사이 선(높이)을 끄는 동안은 위아래 커서 (styles/blocks.css)
      document.body.classList.toggle('is-row-resizing', gutter.dir === 'v')
      session.onEnd(() => {
        setResizing(null)
        document.body.classList.remove('is-row-resizing')
      })
      session.on('pointermove', (ev) => {
        const cur = slideRef.current
        const area = measureArea(areaEl.current)
        if (!area) return
        // 손의 자리를 판의 칸 수로: 선은 칸 사이의 가운데에 선다.
        // 줄 사이의 선은 누른 자리에서 움직인 만큼으로 센다: 편집 화면도 부품을 위로 올려 붙여서(fitBlocks.ts의 pack) 선이 판의 자리보다
        // 위에 그려져 있다. 손의 자리를 그대로 판의 칸으로 바꾸면 누르고 조금만 움직여도 그 차이만큼 줄 높이가 한꺼번에 바뀌었다
        const x = (ev.clientX - area.rect.left) / area.k
        const to =
          g.dir === 'h'
            ? Math.round(((x + BLOCK_COL_GAP / 2) * BOARD_COLS) / (area.size.w + BLOCK_COL_GAP))
            : gutter.at + Math.round(((ev.clientY - startY) / area.k) * BOARD_ROWS / (area.size.h + BLOCK_GAP))
        if (to === g.at) return
        const blocks = cur.blocks ?? []
        const limit = gutterLimit(blocks, g, to, area.size.h)
        const why = limit ? narrowText(limit) : ''
        if (why && why !== told) {
          told = why
          toast.show(why, undefined, 4000)
        }
        const next = dragGutter(blocks, g, to, area.size.h)
        if (!next) return
        // 옮긴 뒤의 선 (선 앞쪽 첫 부품은 그대로라 그것으로 다시 찾는다)
        const moved = next.find((b) => b.id === g.key)!.at!
        g = { ...g, at: g.dir === 'h' ? moved.x + moved.w : moved.y + moved.h }
        store.setBlocks(cur.id, next, key)
      })
      session.on('pointerup', () => session.end())
    },
    [store, toast, startSession],
  )

  const onGutterKeyDown = (e: ReactKeyboardEvent<HTMLElement>, gutter: Gutter) => {
    if (e.key === 'Tab') {
      const area = e.currentTarget.closest<HTMLElement>('.bk-area')
      const lines = area ? [...area.querySelectorAll<HTMLElement>('.bk-line[tabindex="0"]')] : []
      const index = lines.indexOf(e.currentTarget)
      const next = lines[index + (e.shiftKey ? -1 : 1)]
      const previousField = e.shiftKey && !next ? [...(area?.querySelectorAll<HTMLElement>('.ed-input') ?? [])].filter((el) => el.getClientRects().length > 0).at(-1) : null
      if (next || previousField) {
        e.preventDefault()
        ;(next ?? previousField)?.focus()
      }
      return
    }
    const delta = gutter.dir === 'h'
      ? e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0
      : e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0
    if (!delta) return
    e.preventDefault()
    e.stopPropagation()
    const area = measureArea(areaEl.current)
    if (!area) return
    const cur = slideRef.current
    const blocks = cur.blocks ?? []
    const to = gutter.at + delta
    const limit = gutterLimit(blocks, gutter, to, area.size.h)
    if (limit) toast.show(narrowText(limit), undefined, 4000)
    const next = dragGutter(blocks, gutter, to, area.size.h)
    if (next) store.setBlocks(cur.id, next)
  }

  // ---------- 고른 부품의 도구 ----------

  const update = (id: string, fn: (b: Block) => Block) => store.updateBlock(slideRef.current.id, id, fn)
  const remove = (b: Block) => {
    const s = slideRef.current
    const before = s.blocks ?? []
    const h = measureArea(areaEl.current)?.size.h
    // 알아서 짠 판에서 빼면 남은 컴포넌트로 판을 다시 고르고, 그 판도 알아서 짠 판으로 남긴다
    const auto = autoArranged(before, s.arranged, h)
    const next = removeBlock(before, b.id, h, auto)
    const links = (bs: Block[]) => bs.reduce((n, block) => n + Number(!!block.link) + Number(!!block.linkBelow), 0)
    store.setBlocks(s.id, next, undefined, auto)
    setSelected(null)
    removed.current = { slide: s.id, id: b.id }
    const notice = links(next) < links(before) ? ' 영향을 받은 연결 기호도 지웠어요.' : ''
    toast.show(`${BLOCKS[b.type].name} 컴포넌트를 뺐어요.${notice}`, undoAction(toast), notice ? 8000 : undefined)
  }
  const duplicate = (b: Block) => {
    const s = slideRef.current
    const copy = copyBlock(b)
    const area = measureArea(areaEl.current)
    const auto = autoArranged(s.blocks ?? [], s.arranged, area?.size.h)
    const next = autoPlace(s.blocks ?? [], copy, area?.size.h, auto)
    if (!next) {
      const reason = placeIssue(s.blocks ?? [], copy, area?.size.h)
      const text = reason && noRoomText(reason, copy.type, 'slide')
      toast.show(text ? `${text.why} ${text.fix}` : '이 슬라이드에는 더 넣을 자리가 없어요. 컴포넌트를 빼거나 다음 슬라이드에 넣어 주세요.')
      return
    }
    store.setBlocks(s.id, next, undefined, auto)
    setSelected(copy.id)
  }
  /** 저장할 컴포넌트(하나, 또는 나란한 묶음)가 장에서 차지한 크기 (캔버스 px). 목록의 작은 그림을 그 비율로 그린다 */
  const savedSize = (b: Block, kind: SavedKind) => {
    const area = measureArea(areaEl.current)
    if (!area || kind === 'slide') return undefined
    const ids = kind === 'block' ? [b.id] : bandOf(slideRef.current.blocks ?? [], b.id).map((x) => x.id)
    const rects = ids.flatMap((id) => {
      const cell = areaEl.current?.querySelector<HTMLElement>(`.bk[data-block="${CSS.escape(id)}"]`)
      return cell ? [cell.getBoundingClientRect()] : []
    })
    if (!rects.length) return undefined
    const w = Math.max(...rects.map((r) => r.right)) - Math.min(...rects.map((r) => r.left))
    const h = Math.max(...rects.map((r) => r.bottom)) - Math.min(...rects.map((r) => r.top))
    return { w: w / area.k, h: h / area.k }
  }
  /** 내 컴포넌트로 저장한다. 이름은 컴포넌트 이름으로 지어 두고, 내 컴포넌트 목록에서 바꾼다 */
  const save = (b: Block, kind: SavedKind) => {
    const part = partFrom(slideRef.current, kind, b.id, savedSize(b, kind))
    if (!part) return
    void addSaved(part).then((ok) =>
      toast.show(
        ok ? `‘${part.name}’${particle(part.name, '을', '를')} 내 컴포넌트에 저장했어요` : '이 브라우저에 저장하지 못했어요. 저장 공간이 모자란지 확인해 주세요.',
        ok
          ? {
              label: '보기',
              run: () => {
                setLibraryView('mine')
                setLibraryOpen(true)
              },
            }
          : undefined,
        6000,
      ),
    )
  }
  /** 접어 둔 칸을 열고 그 칸(항목이면 처음 빈 항목)에 바로 쓰게 한다 */
  const openField = (b: Block, key: string) => {
    setOpened((o) => new Set(o).add(`${b.id} ${key}`))
    requestAnimationFrame(() => {
      const k = key.startsWith('items.') ? key.slice(6) : key
      const prefix = blockFieldPrefix(b.id)
      const sel = key.startsWith('items.') ? `[data-field^="${CSS.escape(prefix)}"][data-field$=".${CSS.escape(k)}"]` : `[data-field="${CSS.escape(prefix + k)}"]`
      const el = [...document.querySelectorAll<HTMLElement>(`.ed-canvas ${sel}`)].find((x) => !x.innerText.trim())
      el?.focus()
    })
  }
  const preview = (b: Block, effect: BlockEffect) => {
    const cell = areaEl.current?.querySelector<HTMLElement>(`.bk[data-block="${CSS.escape(b.id)}"]`)
    if (!cell || effect === 'none') return
    const level = motionOf(deck, slideRef.current)
    const old = [...cell.classList].filter((c) => c.startsWith('fx-'))
    cell.classList.remove(...old)
    cell.classList.add(`fx-${effect}`)
    engine.play(cell, level === 'none' ? 'calm' : level)
    cell.classList.remove(`fx-${effect}`)
    cell.classList.add(...old)
  }

  const selectedBlock = selected ? (slide.blocks ?? []).find((x) => x.id === selected) : undefined
  /** 부품을 바꾸면(항목 더하기, 모양이나 바탕 바꾸기) 장에 들어가지 않을 때 그 까닭. 본문 상자는 화면에서 잰다 */
  const issue = (b: Block, fn: (x: Block) => Block) => {
    const area = measureArea(areaEl.current)
    return area ? changeIssue(slide.blocks ?? [], b.id, fn, area.size.h) : null
  }
  const tools = (b: Block) => (
    <BlockTools
      slide={slide}
      block={b}
      itemIssue={issue(b, withItem)}
      variantIssue={(v) => issue(b, (x) => ({ ...x, variant: v }))}
      lookIssue={(lk) => lookChangeIssue(slide.blocks ?? [], b.id, lk ?? 'plain', measureArea(areaEl.current)?.size.h)}
      onBlocked={(r) => {
        const t = noRoomText(r, b.type, 'change')
        toast.show(`${t.why} ${t.fix}`, undefined, 6000)
      }}
      onShift={(dir) => store.setBlocks(slideRef.current.id, shiftBlock(slideRef.current.blocks ?? [], b.id, dir, measureArea(areaEl.current)?.size.h))}
      shiftIssue={(dir) => shiftIssue(slide.blocks ?? [], b.id, dir, measureArea(areaEl.current)?.size.h)}
      onLook={(lk) => {
        // 지금 바탕을 다시 고르면 그대로 둔다 (빈 되돌리기 단계가 생겼다). 함께 바뀌는 옆 컴포넌트의 바탕까지 같은지 본다
        const cur = slideRef.current.blocks ?? []
        const next = withLook(cur, b.id, lk ?? 'plain')
        if (next.some((x, i) => lookOf(x) !== lookOf(cur[i]))) store.setBlocks(slideRef.current.id, next)
      }}
      onEffect={(fx) => {
        if (effectOf(b) !== fx) update(b.id, (x) => ({ ...x, effect: fx }))
        requestAnimationFrame(() => preview(b, fx))
      }}
      onPreview={(fx) => preview(b, fx)}
      onVariant={(v) => variantOfBlock(b) !== v && update(b.id, (x) => ({ ...x, variant: v }))}
      onAddItem={() => update(b.id, withItem)}
      adds={foldableFields(b.type).filter((f) => !opened.has(`${b.id} ${f.key}`) && (f.item ? blockItems(b).some((it) => !it[f.key.slice(6) as keyof typeof it]?.trim()) : !b.fields[f.key]?.trim()))}
      onOpenField={(key) => openField(b, key)}
      onDuplicate={() => duplicate(b)}
      onRemove={() => remove(b)}
      saves={saveChoices(slide, b.id)}
      onSave={(kind) => save(b, kind)}
    />
  )

  // 고른 부품: 지우기 키로 빼고, Esc로 고르기를 끝낸다 (글을 쓰는 중이 아닐 때)
  useEffect(() => {
    if (!selected) return
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e)) return
      // 대화 창이 떠 있으면 그 창의 키다: 창을 닫는 Esc로 고르기를 끝내거나, 창 뒤의 컴포넌트를 지우지 않는다
      if (e.defaultPrevented || dialogOpen()) return
      if (e.key === 'Escape') setSelected(null)
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const b = (slideRef.current.blocks ?? []).find((x) => x.id === selected)
        if (b) {
          e.preventDefault()
          remove(b)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // ---------- 무대에 넘길 것 ----------

  const showConverted = !!drag && drag.plan === 'convert' && !!drag.composed
  const stageSlide = showConverted ? drag!.composed! : slide
  const stageBlocks = stageSlide.blocks ?? []
  let previewBlocks: Block[] | null = null
  let dragId: string | null = null
  if (drag) {
    if (drag.result && (drag.plan === 'place' || drag.plan === 'convert')) {
      // 놓은 뒤와 같은 모습으로: 이미지 옆이면 이미지에 맞춘 크기까지 (놓자마자 칸이 다시 움직이지 않게)
      previewBlocks = drag.result
      dragId = drag.block.id
    } else if (drag.kind === 'move') {
      // 장 밖으로 끌고 나가면 원래 자리를 비워 둔다. 놓으면 돌아온다
      previewBlocks = stageBlocks
      dragId = drag.block.id
    }
  }

  const edit: BlockEdit = {
    blocks: previewBlocks ?? links.previewBlocks,
    dragId,
    selected: drag ? null : selected,
    opened,
    selectedLink: links.selectedLink,
    linkPreview: links.preview,
    onLinkPointerDown: links.onLinkPointerDown,
    onCellPointerDown: (e, b) => {
      if (e.button !== 0) return
      const t = e.target as HTMLElement
      setSelected(b.id)
      links.selectLink(null)
      // 단추, 그림 칸에서는 끌지 않는다 (누를 수 있게)
      if (t.closest('button, input, textarea, .img-ed, .bk-bar, .it-remove, .it-grip')) return
      // 글 칸: 쓰고 있는 칸이면 글자를 고르게 그대로 둔다. 아니면 눌러서 움직이면 컴포넌트를 옮기고, 그냥 떼면 누른 자리에 글자 커서를 둔다.
      // 예전에는 글 칸에서 끌기를 아예 받지 않아서, 글이 거의 다인 핵심 한 줄이나 인용은 잡을 곳이 위에 뜬 이름표뿐이라 옮길 수 없는 것처럼 보였다
      const ed = t.closest<HTMLElement>('.ed')
      if (ed?.contains(document.activeElement)) return
      leaveTyping()
      e.preventDefault()
      const sx = e.clientX
      const sy = e.clientY
      press(e, (x, y) => startMove(b, x, y), ed ? () => caretAt(ed, sx, sy) : undefined)
    },
    onGutterPointerDown,
    onGutterKeyDown,
    resizing,
    empty: () => (
      <div className="bk-empty">
        <p className="bk-empty-t">컴포넌트를 골라 넣어 이 슬라이드를 꾸며요</p>
        {/* 목록이 열려 있으면 고르기 단추 대신 어디서 고르는지를: 열린 목록 옆에서 같은 일을 하는 단추가 또 보였다 */}
        <p className="bk-empty-s">
          {libraryOpen ? '오른쪽 목록에서 누르거나 이 슬라이드로 끌어다 놓아요.' : '끌어다 놓으면 알맞은 자리에 들어가요.'} 크기는 옆 컴포넌트와 맞춰 알아서 정해져요.
        </p>
        {!libraryOpen && (
          <button type="button" className="bk-empty-btn" onClick={() => setLibraryOpen(true)}>
            <BlocksIcon />
            컴포넌트 고르기
          </button>
        )}
      </div>
    ),
    areaRef: (el) => {
      areaEl.current = el
    },
  }

  // 끄는 동안의 안내는 장 아래 가운데의 한 줄로만 (손 아래에는 놓일 자리가 생기니 가리지 않게)
  const hint = links.hint
    ? links.hint
    : !drag
    ? null
    : drag.blocked && drag.target && (drag.plan === 'place' || drag.plan === 'convert')
      ? `${noRoomText(drag.blocked, drag.block.type, drag.kind === 'move' ? 'move' : 'here').why} ${
          // 옮기다 손 아래에 놓을 수 없으면 제자리에 둔다(그렇다고 알린다). 가장 가까운 자리가 원래 자리여도 그렇다고:
          // '가까운 자리에 놓을게요' 뒤에 놓았는데 그대로라 옮겨지지 않은 줄 알았다
          drag.target.kind === 'stay' || (drag.moving && drag.result && sameBoard(drag.moving, drag.result)) ? '놓으면 그대로 둘게요.' : '가장 가까운 자리에 놓을게요.'
        }`
    : drag.plan === 'convert'
      ? '놓으면 이 슬라이드를 컴포넌트 슬라이드로 바꿔서 넣어요. 지금 내용은 그대로예요.'
      : drag.plan === 'next'
        ? `${refuseText(drag.blocked, drag.block.type, compose || canCompose(slide.layout))} 놓아도 넣지 않아요.`
        : drag.kind === 'new' && !drag.plan
          ? '슬라이드 위로 끌어 오세요'
          : drag.kind === 'move' && drag.target?.kind === 'stay' && !drag.base.length
            ? '컴포넌트가 하나뿐이라 자리가 그대로예요. 다른 컴포넌트를 넣으면 그 옆이나 위아래로 옮길 수 있어요.'
            : drag.kind === 'move' && drag.plan === 'place' && drag.result
              ? drag.target?.kind === 'stay' || (drag.moving && sameBoard(drag.moving, drag.result))
                ? '현재 자리예요. 다른 컴포넌트의 옆이나 위아래로 끌어 보세요.'
                : '놓으면 표시된 자리로 옮겨요. Esc를 누르면 취소해요.'
              : drag.kind === 'new' && drag.plan === 'place'
                ? '놓으면 표시된 자리에 넣어요. Esc를 누르면 취소해요.'
                : null

  const shown = drag ?? landing?.ghost ?? null
  const ghost = shown
    ? createPortal(
        <div
          ref={ghostEl}
          className={cx('bk-ghost', drag && 'is-held', shown.over && 'is-over', drag?.plan === 'next' && 'is-next', drag?.blocked && drag.target && 'is-elsewhere')}
          style={
            {
              width: shown.ghost.w,
              height: shown.ghost.h,
              scale: shown.over ? String(GHOST_OVER) : undefined,
              '--gx': shown.grab.x,
              '--gy': shown.grab.y,
              '--gk': GHOST_OVER,
            } as React.CSSProperties
          }
          aria-hidden="true"
        >
          <div className="bk-ghost-clip">
            <div className="bk-ghost-scale" style={{ width: shown.canvas.w, height: shown.canvas.h, transform: `scale(${shown.ghost.w / shown.canvas.w})` }}>
              <SlideCanvas deck={look} slide={soloSlide(shown.block)} mode="preview" solo={shown.canvas} />
            </div>
          </div>
          {/* 장 위에서는 놓일 자리에 컴포넌트가 제 크기로 미리 서니, 손에는 무엇을 드는지 이름표만 (작게 줄인 그림은 글자가 읽히지 않았다) */}
          <span className="bk-ghost-tag">
            <GripIcon />
            {BLOCKS[shown.block.type].name}{drag ? drag.kind === 'move' ? ' · 이동 중' : ' · 추가 중' : ''}
          </span>
        </div>,
        document.body,
      )
    : null

  // 고른 부품의 도구는 슬라이드 아래 도구 줄에 (SlideStage가 .stage-sel에 넣는다)
  const toolbar = selectedBlock && !drag && !landing && compose ? tools(selectedBlock) : compose ? links.toolbar : null

  // 부품 장으로 바꿔 아래에 새 줄을 둘 수 있을 만큼 비었을 때만
  const roomFits = (h: number) => {
    const base = dropBlocks(slide)?.blocks ?? []
    return !whyNot(base, { kind: 'spot', spot: { at: null, side: 'below' } }, makeBlock('message'), h)
  }
  const room =
    !compose && canCompose(slide.layout) && !drag && !landing
      ? createPortal(
          <RoomZone
            key={slide.id}
            fits={roomFits}
            onOpen={() => {
              setToBottom(true)
              setLibraryOpen(true)
            }}
          />,
          document.body,
        )
      : null

  return {
    edit,
    stageSlide,
    hint,
    room,
    ghost: (
      <>
        {ghost}
        {links.ghost}
      </>
    ),
    toolbar,
    libraryOpen,
    setLibraryOpen,
    libraryView,
    setLibraryView,
    pressCard,
    insert,
    insertBlock,
    insertNew: (what) => addToNew(typeof what === 'string' ? makeBlock(what) : what),
    dropBlock,
    issueFor,
    areaHeight: () => roomOf(slideRef.current),
    pressLinkCard: links.pressCard,
    insertLink: links.insert,
    linkOpen: links.canInsert,
    selected,
    select: (id) => {
      setSelected(id)
      if (!id) links.selectLink(null)
    },
    convert: () => {
      store.toCompose(slide.id)
      toast.show('이 슬라이드를 컴포넌트 슬라이드로 바꿨어요. 컴포넌트를 끌어 옮기거나 더 넣을 수 있어요.', undoAction(toast), 6000)
    },
  }
}

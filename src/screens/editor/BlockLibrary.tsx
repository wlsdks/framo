import { memo, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { blockPrefH, BLOCK_COL_GAP, BLOCK_GROUPS, BLOCK_LINKS, BLOCKS, canCompose, findBlocks, linkTargets, makeBlock, MAX_BLOCKS, suggestBlocks, type NoRoom } from '../../deck/blocks'
import { sampleBlock } from '../../deck/blockSamples'
import { emptyItem } from '../../deck/generate'
import { motionOf } from '../../deck/themes'
import type { BlockLink, BlockType, Deck, Slide } from '../../deck/types'
import { cx } from '../../lib/cx'
import { josa } from '../../lib/josa'
import { motionEngine } from '../../motion/engine'
import type { SlideMode } from '../../slides/context'
import { SlideCanvas } from '../../slides/SlideCanvas'
import { useDeck } from '../../store/deckStore'
import { loadSaved, useSaved } from '../../store/saved'
import { soloSlide, type BlockEditing } from './BlockEditor'
import { COL_W } from './canvas'
import { CloseIcon, dialogOpen, isTyping, NewSlideIcon, type Toast } from '../ui'
import { useLook, type Look } from './look'
import { noRoomText } from './noRoom'
import { SavedParts } from './SavedParts'

// 부품 고르기: 부품마다 예시 내용을 넣은 작은 그림을 보여 주고, 마우스를 올리면 발표할 때의 움직임을 한 번 보여 준다.
// 카드를 슬라이드로 끌어다 놓거나, 누르면 알맞은 자리에 넣는다.
// 맨 위의 찾기 칸('무엇을 보여 줄까요?')과 '이 슬라이드에 어울리는 것'(장에 적힌 글로 고른 넷)이 먼저다: 예순 개 넘는 카드를
// 묶음 칩으로만 고르던 때는 무엇을 보여 줄지는 알아도 그것이 어느 묶음에 있는지 몰라 끝까지 굴려 봐야 했다

const THUMB_RATIO = 1.5
/**
 * 그 부품의 얼굴인 짜임이 넓고 높은 칸에서만 나오는 부품은 작은 그림을 그만큼 크게 그린다. 순환은 칸이 낮으면 세로 목록이라
 * (cycle.css의 고리는 720×520부터), 부품 고르기에서 고리를 보지 못하고 목록으로만 알았다
 */
const THUMB_H: Partial<Record<BlockType, number>> = { cycle: 620 }

/**
 * 아직 그리지 않은 카드들. 한가할 때 하나씩 그린다(한 번에 하나: 여럿을 한꺼번에 깨우면 한 번에 그려져 다시 멈춘다).
 * 그래서 굴려 내려갈 즈음에는 대부분 그려져 있다
 */
const idleQueue: (() => void)[] = []
let idlePumping = false
function drawWhenIdle(wake: () => void): () => void {
  idleQueue.push(wake)
  if (!idlePumping && typeof requestIdleCallback !== 'undefined') {
    idlePumping = true
    const pump = () =>
      requestIdleCallback(() => {
        idleQueue.shift()?.()
        if (idleQueue.length) pump()
        else idlePumping = false
      })
    pump()
  }
  return () => {
    const i = idleQueue.indexOf(wake)
    if (i >= 0) idleQueue.splice(i, 1)
  }
}

/** 이 카드가 목록에 지금 보이는지 (반 넘게) */
function inView(el: HTMLElement): boolean {
  const list = el.closest('.lib-list')
  if (!list) return true
  const l = list.getBoundingClientRect()
  const r = el.getBoundingClientRect()
  return r.bottom > l.top && r.top < l.bottom && r.height > 0
}

/**
 * 아직 그리지 않은 카드가 굴려서 보이게 되면 그 그림에서 바로 그린다. 지켜보기는 위아래 한 화면 앞서 깨우지만, 목록 끝으로 뛰거나
 * 스크롤 막대를 끌어 한 번에 멀리 가면 그린 뒤에야 알려 주어 두세 그림 동안 빈 네모였다. scroll은 그리기 전에 오므로 거기서 그린다
 */
const scrollWaiters = new Map<HTMLElement, () => void>()
function onListScroll(e: Event) {
  if (!(e.target instanceof HTMLElement) || !e.target.classList.contains('lib-list')) return
  const due = [...scrollWaiters].filter(([el]) => e.target === el.closest('.lib-list') && inView(el))
  if (!due.length) return
  flushSync(() => due.forEach(([, wake]) => wake()))
}
function drawOnScroll(el: HTMLElement, wake: () => void): () => void {
  if (!scrollWaiters.size) document.addEventListener('scroll', onListScroll, true)
  scrollWaiters.set(el, wake)
  return () => {
    scrollWaiters.delete(el)
    if (!scrollWaiters.size) document.removeEventListener('scroll', onListScroll, true)
  }
}

/**
 * 작은 그림을 그릴 너비. lazy면 목록에서 보일 즈음(위아래 한 화면 안)이 되거나 한가할 때 차례가 오면 너비를 알려 그 카드를 그린다.
 * 컴포넌트 탭을 열면 카드 예순여 개가 한꺼번에 장을 그리고 컴포넌트를 맞춰서(fitBlocks) 0.4초쯤(CPU 4배 느리게는 1.6초)
 * 화면이 멈췄다. 한 번 그린 카드는 굴려 지나가도 그대로 둔다(다시 맞추지 않게). 카드는 비율(aspect-ratio)로 자리를 지킨다
 */
function useThumbWidth(lazy: boolean) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [near, setNear] = useState(!lazy)
  // 목록에 지금 보이는 카드는 처음 그리는 그림에서 바로 그린다(그리기 전에 너비를 잰다). 지켜보기(IntersectionObserver)는 그린 뒤에야
  // 알려 주어서, 탭을 열거나 다른 탭에서 돌아올 때마다 보이는 카드 여섯 개가 두세 그림 동안 빈 네모였다
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(el.clientWidth)
    if (!near && inView(el)) setNear(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    const el = ref.current
    if (!el || near || typeof IntersectionObserver === 'undefined') return setNear(true)
    const wake = () => setNear(true)
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && wake(), { root: el.closest('.lib-list'), rootMargin: '100% 0px' })
    io.observe(el)
    const forget = drawWhenIdle(wake)
    const unwatch = drawOnScroll(el, wake)
    return () => {
      io.disconnect()
      forget()
      unwatch()
    }
  }, [near])
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, near ? width : 0] as const
}

/**
 * 예시 부품 하나를 작은 그림으로. 부품이 잘리지 않을 높이로 그린 뒤 같은 비율의 카드에 맞춰 줄인다.
 * blank면 글을 비워 칸마다 안내만 (장 모음의 '빈 칸' 보기)
 */
export const BlockThumb = memo(function BlockThumb({ deck, type, blank, mode = 'preview', lazy = false }: { deck: Look; type: BlockType; blank?: boolean; mode?: SlideMode; lazy?: boolean }) {
  const block = useMemo(() => {
    const b = sampleBlock(type)
    return blank ? { ...b, fields: {}, items: b.items.map(() => emptyItem()) } : b
  }, [type, blank])
  const slide = useMemo(() => soloSlide(block), [block])
  // 부품이 들어갈 수 있는 가장 좁은 칸보다 좁게 그리지 않는다 (표나 차트가 찌그러져 보이지 않게)
  const minW = BLOCKS[type].minSpan * (COL_W + BLOCK_COL_GAP) - BLOCK_COL_GAP + 80
  const h = Math.max(480, blockPrefH(block) + 80, Math.round(minW / THUMB_RATIO), THUMB_H[type] ?? 0)
  const canvas = { w: Math.round(h * THUMB_RATIO), h }
  const [ref, width] = useThumbWidth(lazy)
  return (
    <div ref={ref} className="lib-thumb">
      {width > 0 && (
        <div className="lib-thumb-scale" style={{ width: canvas.w, height: canvas.h, transform: `scale(${width / canvas.w})` }}>
          <SlideCanvas deck={deck} slide={slide} mode={mode} solo={canvas} />
        </div>
      )}
    </div>
  )
})

/** 이음표 카드의 예시: 큰 숫자 둘 사이에 그 이음표 (지어낸 숫자) */
const LINK_SAMPLES: Record<BlockLink, [string, string, string, string]> = {
  arrow: ['지금 처리 시간', '4.2일', '추진 후', '1.5일'],
  plus: ['현장 교육', '12회', '도구 도입', '3종'],
  equals: ['줄어드는 시간', '2.7일', '한 해 절감', '3.1억 원'],
  versus: ['A안 비용', '4.8억 원', 'B안 비용', '3.6억 원'],
}

const LINK_CANVAS = { w: 660, h: 440 }

/** 이음표 하나를 작은 그림으로: 컴포넌트 둘 사이에 선 모습 그대로 */
export const LinkThumb = memo(function LinkThumb({ deck, link, mode = 'preview', lazy = false }: { deck: Look; link: BlockLink; mode?: SlideMode; lazy?: boolean }) {
  const slide = useMemo<Slide>(() => {
    const [l1, v1, l2, v2] = LINK_SAMPLES[link]
    const a = { ...makeBlock('number'), id: `lk-a-${link}`, fields: { label: l1, value: v1 }, link }
    const b = { ...makeBlock('number'), id: `lk-b-${link}`, fields: { label: l2, value: v2 } }
    return { ...soloSlide(a), id: `solo-link-${link}`, rows: [{ id: 'solo', blocks: [a, b] }] }
  }, [link])
  const [ref, width] = useThumbWidth(lazy)
  return (
    <div ref={ref} className="lib-thumb">
      {width > 0 && (
        <div className="lib-thumb-scale" style={{ width: LINK_CANVAS.w, height: LINK_CANVAS.h, transform: `scale(${width / LINK_CANVAS.w})` }}>
          <SlideCanvas deck={deck} slide={slide} mode={mode} solo={LINK_CANVAS} />
        </div>
      )}
    </div>
  )
})

/** 부품 고르기의 묶음 탭에 더하는 이음표 묶음 */
/** 부품 고르기의 모든 카드 (묶음 차례대로) */
const TYPES = BLOCK_GROUPS.flatMap((g) => g.types)

/** 칩 줄에서 '내 컴포넌트'를 가리키는 id (묶음 이름과 겹치지 않게) */
const MINE = '$mine'

const LINK_GROUP = { name: '연결 기호', short: '연결', description: '컴포넌트 사이에 끼워 둘이 어떻게 이어지는지 보여 줘요' }

type Issues = ReadonlyMap<BlockType, NoRoom | null>

/**
 * 카드마다 이 장 어디에도 넣을 수 없는 까닭. 처음 열 때와 다른 장으로 갈 때는 바로 재고, 같은 장이 바뀌면(글 한 자, 너비 끌기,
 * 놓기, 되돌리기) 쉬는 틈에 나눠 다시 잰다. 카드 예순 개마다 판의 모든 자리를 넣어 보느라 한 번에 60ms(느린 노트북에서는
 * 250ms)가 들었는데, 예전에는 장이 바뀐 그 그림에서 재서 컴포넌트에 글을 쓰면 한 자마다, 너비 선을 끌면 손이 움직일 때마다
 * 화면이 멈췄다. 잠금 표시가 한 박자 늦게 바뀌어도 누를 때는 넣기가 자리를 다시 따지므로(planDrop) 잘못 넣지 않는다
 */
function useIdleIssues(slide: Slide, areaH: number | undefined, issueFor: (t: BlockType) => NoRoom | null): Issues {
  const measure = () => new Map(TYPES.map((t) => [t, issueFor(t)]))
  const [state, setState] = useState<{ slide: Slide; areaH: number | undefined; issues: Issues }>(() => ({ slide, areaH, issues: measure() }))
  const ask = useRef(issueFor)
  ask.current = issueFor
  // 다른 장으로 오면 그 장의 잠금을 바로 보인다 (앞 장의 잠금이 잠깐이라도 남지 않게)
  let shown = state
  if (state.slide.id !== slide.id) {
    shown = { slide, areaH, issues: measure() }
    setState(shown)
  }
  const fresh = shown.slide === slide && Object.is(shown.areaH, areaH)
  useEffect(() => {
    if (fresh) return
    const next = new Map<BlockType, NoRoom | null>()
    let i = 0
    let idle = 0
    const work = (deadline: IdleDeadline) => {
      // 시간이 다 되어 불려도 하나는 잰다 (쉬는 틈이 없을 만큼 바빠도 언젠가는 끝나게)
      do {
        next.set(TYPES[i], ask.current(TYPES[i]))
        i++
      } while (i < TYPES.length && deadline.timeRemaining() > 2)
      if (i < TYPES.length) idle = requestIdleCallback(work, { timeout: 500 })
      else setState({ slide, areaH, issues: next })
    }
    // 글을 이어 쓰는 동안에는 한 자마다 다시 시작하지 않게 조금 기다린다
    const wait = setTimeout(() => (idle = requestIdleCallback(work, { timeout: 500 })), 150)
    return () => {
      clearTimeout(wait)
      cancelIdleCallback(idle)
    }
  }, [slide, areaH, fresh])
  return shown.issues
}

export function BlockLibrary({ deck, slide, blocks, toast }: { deck: Deck; slide: Slide; blocks: BlockEditing; toast: Toast }) {
  const [group, setGroup] = useState<string | null>(null)
  // 찾는 말. 있으면 묶음 칩과 어울리는 것 대신 찾은 카드만
  const [query, setQuery] = useState('')
  const found = useMemo(() => findBlocks(query), [query])
  const searching = query.trim().length > 0
  // 이 장에 넣을 수 없는 카드를 눌렀을 때 그 까닭을 보여 줄 부품
  const [why, setWhy] = useState<{ type: BlockType; card: HTMLElement } | null>(null)
  const look = useLook(deck)
  const engine = useMemo(() => motionEngine(), [])
  const playing = useRef(new WeakMap<Element, number>())
  const level = motionOf(deck, slide)
  const saved = useSaved((s) => s.parts.length)
  const mine = blocks.libraryView === 'mine'

  // 내 컴포넌트는 열 때마다 다시 읽는다 (그 사이 보관 폴더를 허용했거나 다른 창에서 저장했을 수 있다)
  useEffect(() => {
    void loadSaved()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.body.classList.contains('is-block-dragging')) return
      // 찾기 칸의 Esc는 찾는 말부터 지운다 (비어 있으면 아래처럼 닫는다)
      if ((e.target as Element).closest?.('.lib-find')) {
        if (query) {
          e.preventDefault()
          setQuery('')
          return
        }
      } else if (isTyping(e)) return
      // 대화 창을 닫는 Esc로 컴포넌트 고르기까지 닫지 않는다
      if (e.defaultPrevented || dialogOpen()) return
      // 까닭을 펼쳐 두었으면 그것만 닫는다
      if (why) setWhy(null)
      else blocks.setLibraryOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [blocks, why, query])

  // 까닭 창은 목록 아래에 붙어 목록을 줄인다. 누른 카드가 줄어든 목록 밖으로 밀려나지 않게 보이는 자리까지 굴린다
  // (1280×600에서 둘째 줄 카드를 누르면 창이 뜨며 그 카드가 가려져, 무엇에 대한 설명인지 알 수 없었다).
  // 카드가 줄어든 목록보다 크면 그림과 이름이 보이게 위에 맞춘다
  useLayoutEffect(() => {
    const card = why?.card
    const list = card?.closest<HTMLElement>('.lib-list')
    if (!card || !list) return
    const c = card.getBoundingClientRect()
    const l = list.getBoundingClientRect()
    const d = c.top < l.top || c.height > l.height - 16 ? c.top - l.top - 8 : c.bottom > l.bottom ? c.bottom - l.bottom + 8 : 0
    if (d) list.scrollBy({ top: d, behavior: 'smooth' })
  }, [why])

  /** 마우스를 올리면 그 부품의 움직임을 한 번. 움직이는 중에 다시 올려도 처음부터 다시 하지 않는다 */
  const preview = (card: HTMLElement) => {
    const cell = card.querySelector<HTMLElement>('.bk')
    if (!cell) return
    const now = performance.now()
    if (now - (playing.current.get(cell) ?? -1e9) < 1400) return
    playing.current.set(cell, now)
    engine.play(cell, level === 'lively' ? 'lively' : 'calm')
  }

  const counted = slide.layout === 'compose' && (slide.blocks ?? []).length >= MAX_BLOCKS
  // 표지와 섹션처럼 컴포넌트를 넣지 않는 장: 카드를 모두 잠근다. 예전에는 누를 때마다 다음 장을 새로 만들어 넣어서 장이 하나씩 늘었다
  const closed = slide.layout !== 'compose' && !canCompose(slide.layout)
  // 카드마다 이 장 어디에도 넣을 수 없는 까닭. 누를 때도 이것 하나로 정한다: 까닭이 있으면 카드를 잠가 두고, 누르면 넣지 않고
  // 까닭과 '새 장에 넣기'를 보인다(새 장은 쓰는 사람이 고를 때만). 장이 바뀔 때마다 다시 본다
  // 장과 본문 높이가 그대로면 다시 재지 않는다: 끄는 동안 목록이 포인터가 움직일 때마다 다시 그려지는데, 그때마다 카드마다
  // 판의 모든 자리를 다시 재서 한 번에 150ms씩 걸려 끄는 것이 끊겼다
  const areaH = blocks.areaHeight()
  const issues = useIdleIssues(slide, areaH, blocks.issueFor)
  // 그릴 때 읽은 본문 높이가 그린 뒤와 다르면 한 번 더 그려 잠금을 다시 본다. 레이아웃 장을 '컴포넌트 장으로 바꾸기'로 바꾼 바로 그때는
  // 바뀐 본문 상자가 아직 그려지지 않아 높이를 몰라서 어느 카드도 잠그지 않았다: 모든 카드가 열려 보였는데, 눌러 보면 한 장 요약 장에서는
  // 서른하나가 '함께 넣을 수 없어요'로 들어가지 않았다. 끄는 동안은 다시 재지 않는다
  const [, redraw] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    if (!document.body.classList.contains('is-block-dragging') && !Object.is(blocks.areaHeight(), areaH)) redraw()
  })
  // 어느 부품도 들어가지 않으면(개수가 찼거나 높이가 모자라) 위에 한 번 더 알린다. 카드마다의 잠금 표시는 그대로 둔다
  const full = counted || (slide.layout === 'compose' && TYPES.every((t) => issues.get(t)))
  // 넣기 전부터 장 높이를 넘은 장: '하나를 지우면 더 넣을 수 있어요'라고 했는데 작은 것을 빼면 그대로 잠겨 있었다
  const over = TYPES.some((t) => {
    const why = issues.get(t)
    return why?.kind === 'height' && why.already
  })
  const noBody = TYPES.some((t) => {
    const why = issues.get(t)
    return why?.kind === 'height' && why.noBody
  })
  // 알림은 상자 없이 한 줄로 (목록이 위에서부터 바로 보이게). 무엇이 어디에 들어가는지만 말한다
  const note = closed
    ? '표지와 섹션 슬라이드에는 컴포넌트를 넣지 않아요'
    : slide.layout === 'compose'
      ? full
        ? counted
          ? `슬라이드 하나에는 ${MAX_BLOCKS}개까지 넣어요. 하나를 지우면 더 넣을 수 있어요`
          : noBody
            ? '본문을 넣을 높이가 없어요. 제목이나 부제를 줄여 주세요'
          : over
            ? '이 슬라이드는 이미 넘쳤어요. 항목이나 컴포넌트를 줄이면 더 넣을 수 있어요'
            : '이 슬라이드는 자리가 다 찼어요. 하나를 지우면 더 넣을 수 있어요'
        : null
      : '넣으면 컴포넌트 슬라이드가 돼요'
  const groups = searching ? [] : group ? BLOCK_GROUPS.filter((g) => g.name === group) : BLOCK_GROUPS
  const showLinks = !searching && (!group || group === LINK_GROUP.name)
  // 이 장에 어울리는 것: 장에 적힌 글로 고른 넷(넣을 수 없는 것은 빼고). 표지와 섹션처럼 컴포넌트를 넣지 않는 장에는 두지 않는다
  const suggested = useMemo(() => (closed || full ? [] : suggestBlocks(slide, 4, (t) => !!issues.get(t))), [slide, issues, closed, full])
  // 찾은 연결 기호 (이름과 설명에 찾는 말이 다 들어 있으면)
  const foundLinks = searching ? BLOCK_LINKS.filter((l) => query.trim().split(/\s+/).every((w) => `${l.name} ${l.description} ${LINK_GROUP.name}`.includes(w))) : []
  const chips: { id: string | null; name: string; title?: string }[] = [
    { id: null, name: '전체' },
    ...BLOCK_GROUPS.map((g) => ({ id: g.name, name: g.short, title: `${g.name}: ${g.description}` })),
    { id: LINK_GROUP.name, name: LINK_GROUP.short, title: `${LINK_GROUP.name}: ${LINK_GROUP.description}` },
    { id: MINE, name: saved ? `내 컴포넌트 ${saved}` : '내 컴포넌트', title: '저장해 둔 컴포넌트, 줄, 슬라이드를 어느 발표에서든 다시 넣어요' },
  ]
  // 이음표는 컴포넌트 장에서 컴포넌트가 둘 이상일 때만 끼울 수 있다
  const linkable = slide.layout === 'compose' && linkTargets(slide.blocks ?? []).length > 0
  // 이음표마다 눌러 넣을 사이가 있는지(누를 때와 같은 규칙: 비어 있고, 뜻이 서고, 아래 사이면 위아래를 넓힐 높이도). 예전에는 컴포넌트가
  // 둘 이상이면 이음표 카드를 모두 열어 두어서, 눌러 보면 열에 여덟은 '뜻이 서지 않아요'나 '높이가 모자라요'로 들어가지 않았다
  const linkOpen = useMemo(() => new Map(BLOCK_LINKS.map((l) => [l.id, linkable && blocks.linkOpen(l.id)])), [slide, areaH, linkable])
  const shownWhy = !why
    ? null
    : closed
      ? { ...why, text: { why: '표지와 섹션 슬라이드에는 컴포넌트를 넣지 않아요.', fix: '새 슬라이드에 넣으면 이 슬라이드 다음에 컴포넌트 슬라이드를 만들어 넣어요.' } }
      : issues.get(why.type)
        ? { ...why, text: noRoomText(issues.get(why.type)!, why.type, 'slide') }
        : null

  /** 컴포넌트 카드 하나 (묶음, 어울리는 것, 찾은 것이 같이 쓴다) */
  const card = (type: BlockType) => {
    const spec = BLOCKS[type]
    const issue = issues.get(type)
    // 이 장에 넣을 수 없는 부품은 잠가 둔다: 눌러도 넣지 않고 까닭을 보여 준다 (끌어다 놓아도 넣지 않는다)
    const marked = closed || !!issue
    const tap = (el: HTMLElement) => (marked ? setWhy(why?.type === type ? null : { type, card: el }) : blocks.insert(type, el))
    return (
      <button
        key={type}
        type="button"
        className={cx('lib-card', marked && 'is-blocked', why?.type === type && 'is-why')}
        // 카드의 설명은 두 줄에서 자르므로 다 읽을 곳은 여기. 예전에는 움직임만 적어서 잘린 설명을 어디서도 볼 수 없었다
        title={`${spec.name}: ${spec.description}\n${marked ? `${closed ? '이 슬라이드에는 넣지 않아요' : '이 슬라이드에는 자리가 없어요'}. 눌러서 이유를 보고 새 슬라이드에 넣을 수 있어요` : `모션: ${spec.motion}`}`}
        onPointerDown={(e) => {
          const el = e.currentTarget
          blocks.pressCard(e, type, () => tap(el))
        }}
        // 키보드로 누를 때만 (마우스는 위의 누르기에서 끌기와 나눠 다룬다)
        onClick={(e) => e.detail === 0 && tap(e.currentTarget)}
        onPointerEnter={(e) => preview(e.currentTarget)}
        onFocus={(e) => preview(e.currentTarget)}
      >
        <BlockThumb deck={look} type={type} lazy />
        <span className="lib-name">{spec.name}</span>
        <span className="lib-desc">{spec.description}</span>
        {/* 슬라이드 전체에 넣을 수 없으면(표지와 섹션, 자리가 다 찬 슬라이드) 위 알림 한 줄로 말하고 카드는 옅게만 둔다:
            카드마다 같은 문구가 되풀이되어 목록이 어수선했다. 카드 몇 개만 못 넣을 때만 그 카드에 할 수 있는 길을 적는다.
            예전의 자물쇠와 '함께 넣을 수 없어요'는 돈을 내야 쓰는 기능처럼 읽혔고, 이제 자물쇠는 'AI에게 숨기기'의 표시다 */}
        {marked && !closed && !full && (
          <span className="lib-no">
            <NewSlideIcon />
            새 슬라이드에 넣을 수 있어요
          </span>
        )}
      </button>
    )
  }

  /** 연결 기호 카드 하나 */
  const linkCard = (l: (typeof BLOCK_LINKS)[number]) => {
    // 끼울 사이가 없는 이음표도 누르면 까닭을 알린다(LinkEditor의 insert가 알림으로)
    const shut = linkable && !linkOpen.get(l.id)
    return (
      <button
        key={l.id}
        type="button"
        className={cx('lib-card', (!linkable || shut) && 'is-blocked')}
        title={`${l.name}: ${l.description}${shut ? '\n이 슬라이드에 끼울 자리가 없어요. 눌러서 이유를 보세요' : ''}`}
        onPointerDown={(e) => blocks.pressLinkCard(e, l.id)}
        onClick={(e) => e.detail === 0 && blocks.insertLink(l.id)}
      >
        <LinkThumb deck={look} link={l.id} lazy />
        <span className="lib-name">{l.name}</span>
        <span className="lib-desc">{l.description}</span>
        {shut && <span className="lib-no">끼울 컴포넌트 사이가 없어요</span>}
      </button>
    )
  }

  return (
    <div className="lib" role="tabpanel" aria-label="컴포넌트">
      {/* 찾기: 보여 주고 싶은 것을 낱말로. 이름과 설명, 묶음, 비슷한 말(순서 → 단계, 흐름)로 찾는다 */}
      <div className="lib-find-w">
        <input
          className="input lib-find"
          type="search"
          placeholder="무엇을 보여 줄까요? 숫자, 순서, 비교…"
          aria-label="컴포넌트 찾기"
          value={query}
          onChange={(e) => {
            setWhy(null)
            setQuery(e.target.value)
            if (mine) blocks.setLibraryView('base')
          }}
        />
        {searching && (
          <button type="button" className="icon-btn lib-find-x" aria-label="찾는 말 지우기" title="찾는 말 지우기 (Esc)" onClick={() => setQuery('')}>
            <CloseIcon />
          </button>
        )}
      </div>
      {/* 묶음은 글자 칩. 한 줄에 다 들지 않아 두 줄로 반씩 나누고, 줄마다 칩이 너비를 똑같이 나눠 끝까지 채운다
          (넘친 칩 하나가 아랫줄에 홀로 남지 않게). 긴 이름과 설명은 목록의 묶음 제목에.
          내 컴포넌트도 칩 하나로 둔다: 예전에는 그 위에 '기본/내 컴포넌트' 고르기 줄이 따로 있어서, 1280×600에서
          고르는 줄만 140px를 차지해 카드가 한 줄 반만 보였다 */}
      {!searching && (
        <div className="lib-tabs" role="group" aria-label="컴포넌트 묶음">
          {chips.map((c) => {
            const on = c.id === MINE ? mine : !mine && group === c.id
            return (
              <button
                key={c.id ?? '전체'}
                type="button"
                className={cx('lib-tab', on && 'is-on', c.id === MINE && 'is-mine')}
                aria-pressed={on}
                title={c.title}
                onClick={() => {
                  setWhy(null)
                  if (c.id === MINE) return blocks.setLibraryView('mine')
                  blocks.setLibraryView('base')
                  setGroup(c.id)
                }}
              >
                {c.name}
              </button>
            )
          })}
        </div>
      )}
      {note && (
        <div className="lib-note">
          <p className="lib-note-t">{note}</p>
          {slide.layout !== 'compose' && canCompose(slide.layout) && (
            <button type="button" className="lib-note-btn" title="지금 내용은 그대로 남고, 내용이 컴포넌트로 나뉘어 하나씩 옮길 수 있게 돼요" onClick={blocks.convert}>
              지금 바꾸기
            </button>
          )}
          {(closed || full) && (
            <button type="button" className="lib-note-btn" title="이 슬라이드 다음에 빈 컴포넌트 슬라이드를 만들어요" onClick={() => useDeck.getState().addComposeSlide([], slide.id)}>
              새 컴포넌트 슬라이드
            </button>
          )}
        </div>
      )}

      {mine && <SavedParts deck={deck} slide={slide} blocks={blocks} toast={toast} />}

      {!mine && (
        <>
          <div className="lib-list">
            {searching ? (
              <section className="lib-sec">
                <h3 className="lib-group">
                  찾은 것<span className="lib-group-n">{found.length + foundLinks.length}</span>
                </h3>
                {found.length + foundLinks.length === 0 ? (
                  <p className="lib-group-d">‘{query.trim()}’에 맞는 컴포넌트가 없어요. 막대, 순서, 사람처럼 다른 말로 찾아보세요.</p>
                ) : (
                  <div className="lib-grid is-found">
                    {/* 이 슬라이드에 넣을 수 있는 것을 먼저: 찾자마자 맨 앞에 잠긴 카드가 서면 찾은 것이 없는 것처럼 보였다 */}
                    {[...found.filter((t) => !issues.get(t)), ...found.filter((t) => issues.get(t))].map(card)}
                    {foundLinks.map(linkCard)}
                  </div>
                )}
              </section>
            ) : (
              !group &&
              suggested.length > 0 && (
                <section className="lib-sec lib-suggest">
                  <h3 className="lib-group">이 슬라이드에 어울리는 것</h3>
                  <p className="lib-group-d">슬라이드에 적힌 글을 보고 골랐어요</p>
                  <div className="lib-grid">{suggested.map(card)}</div>
                </section>
              )
            )}
            {groups.map((g) => (
              <section key={g.name} className="lib-sec">
                <h3 className="lib-group">
                  {g.name}
                  <span className="lib-group-n">{g.types.length}</span>
                </h3>
                <p className="lib-group-d">{g.description}</p>
                <div className="lib-grid">{g.types.map(card)}</div>
              </section>
            ))}
            {showLinks && (
              <section className="lib-sec">
                <h3 className="lib-group">
                  {LINK_GROUP.name}
                  <span className="lib-group-n">{BLOCK_LINKS.length}</span>
                </h3>
                <p className="lib-group-d">{linkable ? `${LINK_GROUP.description}. 끌어서 컴포넌트 사이에 놓아요.` : '컴포넌트 슬라이드에 컴포넌트를 둘 이상 넣으면 그 사이에 끼울 수 있어요.'}</p>
                <div className="lib-grid">{BLOCK_LINKS.map(linkCard)}</div>
              </section>
            )}
          </div>
        </>
      )}

      {shownWhy && (
        <div className="lib-why" role="dialog" aria-label={`${josa(BLOCKS[shownWhy.type].name, '을', '를')} 넣을 수 없는 이유`}>
          <p className="lib-why-t">{josa(BLOCKS[shownWhy.type].name, '은', '는')} 이 슬라이드에 {closed ? '넣지 않아요' : '함께 넣을 수 없어요'}</p>
          <p className="lib-why-p">{shownWhy.text.why}</p>
          <p className="lib-why-p is-fix">{shownWhy.text.fix}</p>
          <div className="lib-why-actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setWhy(null)}>
              닫기
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                blocks.insertNew(shownWhy.type)
                setWhy(null)
              }}
            >
              새 슬라이드에 넣기
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

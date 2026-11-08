import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { across, behind, BLOCK_LINKS, BLOCKS, boardFit, BOARD_ROWS, linkAt, linkIssue, linkTargets, needRows, sameLinkTarget, withLink, type LinkTarget } from '../../deck/blocks'
import type { Block, BlockLink, Slide } from '../../deck/types'
import { josa } from '../../lib/josa'
import { cx } from '../../lib/cx'
import { usePointerSessions } from '../../lib/pointerSession'
import { LinkGlyph } from '../../slides/blocks'
import { useDeck } from '../../store/deckStore'
import { dialogOpen, isTyping, TrashIcon, undoAction, type Toast } from '../ui'

// 이음표(화살표, 더하기, 결과, 견주기)를 컴포넌트 사이에 끼우는 일.
//
// 이음표는 칸을 차지하지 않고 부품 사이의 선 위에 선다(deck/blocks/links.ts). 끌면 손에 든 이음표가 가장 가까운 선에 붙고,
// 그 자리의 양쪽 부품이 비켜 나는 모습을 미리 보여 준다. 놓을 때 한 번만 저장해서 되돌리기 한 번으로 돌아온다.
// 뜻이 서지 않는 짝(진행 막대와 시장 원을 견주기 같은)에는 놓지 않고 까닭을 알린다 (links.ts의 linkFits)

/** 이음표를 놓을 수 있는 자리의 화면 좌표. 옆 선은 앞 부품 높이의 가운데, 아래 선은 앞 부품 너비의 가운데 */
interface Spot {
  t: LinkTarget
  x: number
  y: number
  /** 옆 선은 앞 부품의 위아래 끝, 아래 선은 왼쪽 오른쪽 끝 (이 안이면 가깝다고 본다) */
  lo: number
  hi: number
}

interface LinkDrag {
  link: BlockLink
  /** 장에 있던 이음표를 옮길 때 원래 자리 */
  from: LinkTarget | null
  /** 옮기는 이음표를 뺀 판. 놓을 자리는 늘 이것을 기준으로 */
  base: Block[]
  spots: Spot[]
  target: LinkTarget | null
  /** 손 아래 자리에 놓을 수 없는 까닭 */
  blocked: string | null
}

const NO_HEIGHT = '컴포넌트 사이를 넓힐 높이가 모자라요. 컴포넌트를 지우거나 항목을 줄여 주세요.'
const NO_PAIR = '컴포넌트가 둘 이상 있어야 그 사이에 연결 기호를 끼울 수 있어요.'

/** 지금 그려진 부품들로 놓을 자리를 잰다. 양쪽 부품이 똑같이 비켜 나서, 미리 보기로 부품이 움직여도 가운데는 그대로다 */
function measureSpots(area: HTMLElement, blocks: Block[]): Spot[] {
  const cells = new Map<string, DOMRect>()
  for (const el of area.querySelectorAll<HTMLElement>(':scope > .bk')) cells.set(el.dataset.block!, el.getBoundingClientRect())
  const out: Spot[] = []
  for (const t of linkTargets(blocks)) {
    const b = blocks.find((x) => x.id === t.id)!
    const r = cells.get(b.id)
    const next = across(blocks, b, t.dir).flatMap((o) => cells.get(o.id) ?? [])
    if (!r || !next.length) continue
    if (t.dir === 'h') out.push({ t, x: (r.right + Math.min(...next.map((n) => n.left))) / 2, y: (r.top + r.bottom) / 2, lo: r.top, hi: r.bottom })
    else out.push({ t, x: (r.left + r.right) / 2, y: (r.bottom + Math.min(...next.map((n) => n.top))) / 2, lo: r.left, hi: r.right })
  }
  return out
}

/**
 * 뜻이 서지 않는 짝을 잇지 않는 까닭. 더하기와 견주기는 같은 컴포넌트끼리, 화살표는 같은 컴포넌트나 단계, 차트, 숫자끼리,
 * 결과(=)와 화살표는 숫자나 결론 한마디로 맺을 때. 소제목과 주석에는 달지 않아요 (links.ts의 linkFits)
 */
function pairText(from: Block['type'], to: Block['type'], link: BlockLink): string {
  const name = BLOCK_LINKS.find((l) => l.id === link)!.name
  const a = BLOCKS[from].name
  const b = BLOCKS[to].name
  const rule =
    from === 'heading' || from === 'note' || to === 'heading' || to === 'note'
      ? '소제목과 주석은 옆 컴포넌트에 딸린 글이라 연결 기호로 잇지 않아요.'
      : link === 'equals'
        ? '결과는 앞의 것이 모여 숫자나 결론 한마디가 될 때 써요.'
        : link === 'arrow'
          ? '화살표는 같은 컴포넌트, 단계, 차트, 숫자끼리 잇거나 숫자나 결론 한마디로 맺을 때 써요.'
          : '같은 컴포넌트 두 개를 이을 때 써요.'
  return `${josa(a, '과', '와')} ${josa(b, '은', '는')} ${josa(name, '으로', '로')} 이으면 뜻이 서지 않아요. ${rule}`
}

/** 손 아래에서 가장 가까운 자리. 칸 사이는 옆으로 떨어진 만큼, 줄 사이는 위아래로 떨어진 만큼 (그 줄이나 본문 밖이면 그만큼 더) */
function nearest(spots: Spot[], x: number, y: number): Spot | null {
  let best: Spot | null = null
  let score = Infinity
  for (const s of spots) {
    const out = (v: number) => Math.max(0, s.lo - v, v - s.hi)
    const d = s.t.dir === 'h' ? Math.abs(x - s.x) + out(y) : Math.abs(y - s.y) + out(x)
    if (d < score) {
      score = d
      best = s
    }
  }
  return best
}

export function useLinkEditing({
  slideRef,
  areaEl,
  toast,
  deselectBlock,
  selectedBlock,
}: {
  slideRef: RefObject<Slide>
  areaEl: RefObject<HTMLDivElement | null>
  toast: Toast
  deselectBlock(): void
  /** 고른 부품이 있으면 눌러 넣는 이음표를 그 부품의 오른쪽이나 아래에 */
  selectedBlock: string | null
}) {
  const store = useDeck.getState()
  const startSession = usePointerSessions()
  const [selected, setSelected] = useState<LinkTarget | null>(null)
  const [drag, setDrag] = useState<LinkDrag | null>(null)
  const dragRef = useRef<LinkDrag | null>(null)
  dragRef.current = drag
  const ghostEl = useRef<HTMLDivElement | null>(null)

  useEffect(() => setSelected(null), [slideRef.current.id])

  /** 이 자리에 이음표를 둘 수 없는 까닭: 뜻이 서지 않는 짝, 그리고 아래 선은 위아래 부품이 비켜 나는 만큼 높이가 더 든다 */
  const why = (blocks: Block[], t: LinkTarget, link: BlockLink): string | null => {
    const pair = linkIssue(blocks, t, link)
    if (pair) return pairText(pair.from, pair.to, link)
    if (t.dir === 'h') return null
    const h = areaEl.current?.offsetHeight
    const next = withLink(blocks, t, link)
    return h && needRows(next, boardFit(h, next)) > BOARD_ROWS ? NO_HEIGHT : null
  }

  /** 놓은 이음표가 제자리에서 살짝 튀며 나타난다 */
  const pop = (t: LinkTarget) =>
    requestAnimationFrame(() => {
      const key = `${t.dir}${t.id}`
      const el = areaEl.current?.querySelector<HTMLElement>(`:scope > .bk-link[data-link="${key}"] > .bk-link-g`)
      if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) return
      el.animate([{ scale: '0.4', opacity: 0 }, { scale: '1.12', opacity: 1, offset: 0.6 }, { scale: '1' }], { duration: 380, easing: 'cubic-bezier(0.3, 0, 0.2, 1)' })
    })

  const place = (blocks: Block[], t: LinkTarget, link: BlockLink) => {
    const s = slideRef.current
    store.setBlocks(s.id, withLink(blocks, t, link))
    setSelected(t)
    deselectBlock()
    pop(t)
  }

  // ---------- 끌기 ----------

  const moveGhost = (x: number, y: number) => {
    const g = ghostEl.current
    if (g) g.style.translate = `${x}px ${y}px`
  }

  const track = useCallback((x: number, y: number) => {
    const d = dragRef.current
    if (!d) return
    const frame = document.querySelector<HTMLElement>('.ed-canvas .slide-frame')?.getBoundingClientRect()
    const over = !!frame && x >= frame.left - 24 && x <= frame.right + 24 && y >= frame.top - 24 && y <= frame.bottom + 24
    let target: LinkTarget | null = null
    let blocked: string | null = null
    if (over) {
      const s = nearest(d.spots, x, y)
      // 경계에서 떨리지 않게: 지금 자리가 새 자리보다 조금만 멀면 그대로 둔다
      const cur = d.target && d.spots.find((p) => sameLinkTarget(p.t, d.target))
      const k = frame ? frame.width / 1920 : 1
      const dist = (p: Spot) => (p.t.dir === 'h' ? Math.abs(x - p.x) : Math.abs(y - p.y))
      const pick = cur && s && !sameLinkTarget(cur.t, s.t) && dist(cur) - dist(s) < 30 * k ? cur : s
      if (pick) {
        blocked = why(d.base, pick.t, d.link)
        target = blocked ? null : pick.t
      } else blocked = NO_PAIR
    }
    if (!sameLinkTarget(target, d.target) || !!target !== !!d.target || blocked !== d.blocked) {
      const next = { ...d, target, blocked }
      dragRef.current = next
      setDrag(next)
    }
  }, [])

  const begin = (link: BlockLink, from: LinkTarget | null, x: number, y: number) => {
    const s = slideRef.current
    const blocks = s.layout === 'compose' ? (s.blocks ?? []) : []
    const base = from ? withLink(blocks, from, null) : blocks
    const spots = areaEl.current && s.layout === 'compose' ? measureSpots(areaEl.current, blocks) : []
    const d: LinkDrag = { link, from, base, spots, target: from, blocked: null }
    dragRef.current = d
    setDrag(d)
    setSelected(null)
    deselectBlock()
    const session = startSession('is-block-dragging')
    requestAnimationFrame(() => {
      moveGhost(x, y)
      ghostEl.current?.animate([{ scale: '0.6', opacity: 0 }, { scale: '1', opacity: 1 }], { duration: 220, easing: 'cubic-bezier(0.3, 0, 0.2, 1)' })
    })
    let raf = 0
    session.onEnd(() => cancelAnimationFrame(raf))
    const end = (cancel: boolean) => {
      session.end()
      const cur = dragRef.current
      dragRef.current = null
      setDrag(null)
      if (!cur) return
      if (!cancel && cur.target) {
        if (!cur.from || !sameLinkTarget(cur.from, cur.target)) place(cur.base, cur.target, cur.link)
        else setSelected(cur.from)
        return
      }
      // 놓을 자리가 없는 곳에 놓으면: 옮기던 이음표는 제자리로, 새 이음표는 넣지 않는다
      if (cur.from) setSelected(cur.from)
      else if (!cancel) toast.show(cur.blocked ?? (cur.spots.length ? '컴포넌트 사이에 놓아 주세요.' : NO_PAIR), undefined, 5000)
    }
    session.on('pointermove', (e) => {
      moveGhost(e.clientX, e.clientY)
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => track(e.clientX, e.clientY))
    })
    session.on('pointerup', (e) => {
      track(e.clientX, e.clientY)
      end(false)
    })
    session.on('pointercancel', () => end(true))
    session.on('keydown', (e) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      end(true)
    })
  }

  /** 눌렀다가 조금 움직이면 끌기 시작. 그냥 떼면 onTap */
  const press = (e: ReactPointerEvent<HTMLElement>, start: (x: number, y: number) => void, onTap: () => void) => {
    if (e.button !== 0) return
    e.preventDefault()
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
      onTap()
    })
  }

  // ---------- 눌러서 넣기 ----------

  /** 알아서 고른 자리: 고른 부품의 오른쪽, 왼쪽, 아래, 위. 고른 부품이 없으면 처음 빈 옆 선, 그다음 아래 선 */
  function autoSpot(blocks: Block[], link: BlockLink): LinkTarget | null {
    const free = (t: LinkTarget) => !linkAt(blocks, t) && !why(blocks, t, link)
    const all = linkTargets(blocks)
    const self = selectedBlock && blocks.find((b) => b.id === selectedBlock)
    if (self) {
      const near: LinkTarget[] = [
        { id: self.id, dir: 'h' },
        ...behind(blocks, self, 'h').map((b) => ({ id: b.id, dir: 'h' as const })),
        { id: self.id, dir: 'v' },
        ...behind(blocks, self, 'v').map((b) => ({ id: b.id, dir: 'v' as const })),
      ]
      const t = near.find((n) => all.some((a) => sameLinkTarget(a, n)) && free(n))
      if (t) return t
    }
    return all.find((t) => t.dir === 'h' && free(t)) ?? all.find(free) ?? null
  }

  function insert(link: BlockLink) {
    const s = slideRef.current
    const blocks = s.layout === 'compose' ? (s.blocks ?? []) : []
    const all = linkTargets(blocks)
    if (!all.length) {
      toast.show(NO_PAIR, undefined, 5000)
      return
    }
    const t = autoSpot(blocks, link)
    if (!t) {
      const pair = all.map((a) => !linkAt(blocks, a) && linkIssue(blocks, a, link)).find(Boolean)
      toast.show(
        all.every((a) => linkAt(blocks, a))
          ? '모든 컴포넌트 사이에 이미 연결 기호가 있어요. 연결 기호를 눌러 모양을 바꿀 수 있어요.'
          : pair
            ? pairText(pair.from, pair.to, link)
            : NO_HEIGHT,
        undefined,
        6000,
      )
      return
    }
    place(blocks, t, link)
  }

  const pressCard = (e: ReactPointerEvent<HTMLElement>, link: BlockLink) => press(e, (x, y) => begin(link, null, x, y), () => insert(link))

  /** 이 이음표를 눌러 넣을 사이가 이 장에 있는지 (부품 고르기 카드의 잠금). 누를 때 사이를 고르는 autoSpot 그대로다 */
  const canInsert = (link: BlockLink): boolean => {
    const s = slideRef.current
    return s.layout === 'compose' && !!autoSpot(s.blocks ?? [], link)
  }

  // ---------- 장에 있는 이음표 ----------

  const onLinkPointerDown = (e: ReactPointerEvent<HTMLElement>, t: LinkTarget) => {
    if (e.button !== 0) return
    // 장 바탕을 누른 것으로 보고 고르기를 끝내지 않게
    e.stopPropagation()
    const link = linkAt(slideRef.current.blocks ?? [], t)
    if (!link) return
    setSelected(t)
    deselectBlock()
    press(e, (x, y) => begin(link, t, x, y), () => {})
  }

  const selectedLink = selected && linkAt(slideRef.current.blocks ?? [], selected) ? selected : null

  const change = (link: BlockLink | null) => {
    const s = slideRef.current
    if (!selectedLink) return
    const t = selectedLink
    const blocks = s.blocks ?? []
    const blockedBy = link && why(withLink(blocks, t, null), t, link)
    if (blockedBy) {
      toast.show(blockedBy, undefined, 6000)
      return
    }
    store.setBlocks(s.id, withLink(blocks, t, link))
    if (!link) {
      setSelected(null)
      toast.show('연결 기호를 뺐어요', undoAction(toast))
    }
  }

  // 고른 이음표: 지우기 키로 빼고, Esc로 고르기를 끝낸다
  useEffect(() => {
    if (!selectedLink) return
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e)) return
      // 대화 창이 떠 있으면 그 창의 키다: 창을 닫는 Esc로 고르기를 끝내거나, 창 뒤의 이음표를 빼지 않는다
      if (e.defaultPrevented || dialogOpen()) return
      if (e.key === 'Escape') setSelected(null)
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        change(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const current = selectedLink ? linkAt(slideRef.current.blocks ?? [], selectedLink) : null
  const toolbar =
    selectedLink && current && !drag ? (
      // 컴포넌트의 도구처럼 슬라이드 아래 도구 줄에 (SlideStage가 .stage-sel에 넣는다)
      <div className="sel-tools" role="toolbar" aria-label="연결 기호 도구" onPointerDown={(e) => e.stopPropagation()}>
        <span className="sel-name">연결 기호</span>
        <div className="lk-tool-set" role="radiogroup" aria-label="연결 기호 모양">
          {BLOCK_LINKS.map((l) => (
            <button
              key={l.id}
              type="button"
              role="radio"
              aria-checked={current === l.id}
              className={cx('btn btn-ghost btn-sm', current === l.id && 'is-on')}
              title={l.description}
              onClick={() => change(l.id)}
            >
              <span className="lk-tool-g" aria-hidden="true">
                <LinkGlyph link={l.id} />
              </span>
              <span className="btn-t">{l.name}</span>
            </button>
          ))}
        </div>
        <button type="button" className="btn btn-ghost btn-sm" title="지우기 (Delete)" aria-label="연결 기호 지우기" onClick={() => change(null)}>
          <TrashIcon />
          <span className="btn-t">지우기</span>
        </button>
      </div>
    ) : null

  const ghost = drag
    ? createPortal(
        <div ref={ghostEl} className={cx('lk-ghost', drag.target && 'is-placed')} aria-hidden="true">
          <span className="lk-ghost-g">
            <LinkGlyph link={drag.link} />
          </span>
        </div>,
        document.body,
      )
    : null

  // 놓을 수 없는 까닭도 장 아래의 한 줄 안내로 (손 아래에 붙여 두면 놓일 자리와 이웃 컴포넌트를 가렸다)
  const hint = drag ? (drag.blocked ?? (drag.spots.length ? '컴포넌트 사이에 놓으면 그 둘을 이어요' : NO_PAIR)) : null

  return {
    selectedLink,
    selectLink: setSelected,
    /** 끄는 동안 장에 보여 줄 판(옮기는 이음표를 뺀)과 놓일 자리 */
    previewBlocks: drag ? drag.base : null,
    preview: drag?.target ? { target: drag.target, link: drag.link } : null,
    dragging: !!drag,
    onLinkPointerDown,
    pressCard,
    insert,
    canInsert,
    toolbar,
    ghost,
    hint,
  }
}

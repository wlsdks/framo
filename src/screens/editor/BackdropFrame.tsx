import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { BACKDROP_CELL, BACKDROP_MIN, backdropOf } from '../../deck/backdrops'
import { BOARD_COLS, BOARD_ROWS } from '../../deck/blocks'
import type { BlockAt, Slide } from '../../deck/types'
import { josa } from '../../lib/josa'
import { gestureKey, usePointerSessions } from '../../lib/pointerSession'
import { useDeck } from '../../store/deckStore'
import { useEscape } from '../ui'
import { setBackdropEditing, useBackdropEditing } from './backdropEdit'

// 무대 위에서 배경 자리를 끌어 고치는 틀(이 장 설정의 '슬라이드에서 끌어 옮기기'). 장 전체를 12×12칸으로 나눈 칸에 맞춰 붙는다.
// 틀 안을 끌면 옮기고, 모서리와 가장자리를 끌면 크기를 바꾼다. 한 번 끄는 것이 되돌리기 한 단계다. 방향키로도 한 칸씩.
// 무대의 장 위(줄인 장의 좌표, 1920×1080)에 그리고, 손잡이는 장을 줄인 만큼 키워(--vs) 화면에서 늘 같은 크기로 보인다.
// 틀은 한 겹(테와 손잡이)뿐이고 맞춰 붙는 칸의 눈금은 끄는 동안만 옅게 보인다. 도움말과 끝내기는 이 장 설정에 둔다: 장 위에 떠 있던
// 도움말 막대는 부제를 덮었고, 끝내기 단추가 둘(이 장 설정의 '옮기기 끝내기'와 장 위의 '다 했어요')이었다(검수)

type Grip = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
const GRIPS: Exclude<Grip, 'move'>[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
const GRIP_NAME: Record<Exclude<Grip, 'move'>, string> = { n: '위', s: '아래', e: '오른쪽', w: '왼쪽', ne: '오른쪽 위', nw: '왼쪽 위', se: '오른쪽 아래', sw: '왼쪽 아래' }

const clampTo = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** 끈 칸 수(dx, dy)만큼 자리를 옮기거나 늘이고 줄인다. 장 밖으로 나가거나 가장 작은 크기보다 작아지지 않는다 */
export function dragArea(a: BlockAt, grip: Grip, dx: number, dy: number): BlockAt {
  if (grip === 'move') return { ...a, x: clampTo(a.x + dx, 0, BOARD_COLS - a.w), y: clampTo(a.y + dy, 0, BOARD_ROWS - a.h) }
  let { x, y, w, h } = a
  if (grip.includes('e')) w = clampTo(a.w + dx, BACKDROP_MIN.w, BOARD_COLS - a.x)
  if (grip.includes('w')) {
    x = clampTo(a.x + dx, 0, a.x + a.w - BACKDROP_MIN.w)
    w = a.w + (a.x - x)
  }
  if (grip.includes('s')) h = clampTo(a.h + dy, BACKDROP_MIN.h, BOARD_ROWS - a.y)
  if (grip.includes('n')) {
    y = clampTo(a.y + dy, 0, a.y + a.h - BACKDROP_MIN.h)
    h = a.h + (a.y - y)
  }
  return { x, y, w, h }
}

export function BackdropFrame({ slide }: { slide: Slide }) {
  const on = useBackdropEditing(slide.id)
  const setBackdrop = useDeck((s) => s.setBackdrop)
  const sessions = usePointerSessions()
  const ref = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)
  useEscape(() => setBackdropEditing(null), { active: on })
  const b = backdropOf(slide)
  // 키보드로도: 방향키는 한 칸 옮기기, Shift+방향키는 오른쪽 끝과 아래 끝을 한 칸 늘이고 줄이기(마우스를 쓰기 어려운 분, 한 칸만 고칠 때)
  useEffect(() => {
    if (!on || !b || !slide.backdrop) return
    const raw = slide.backdrop
    const key = gestureKey(`${slide.id}.backdrop.key`)
    const onKey = (e: KeyboardEvent) => {
      const d = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, [number, number]>)[e.key]
      if (!d || e.altKey || e.metaKey || e.ctrlKey) return
      const t = e.target as HTMLElement | null
      if (t?.closest('input, textarea, [contenteditable]')) return
      // 틀을 고치는 동안의 방향키는 틀의 것: 편집기의 다른 방향키(슬라이드 넘기기 같은)로 가지 않게 잡는 단계에서 받는다
      e.preventDefault()
      e.stopPropagation()
      const next = dragArea(b.at, e.shiftKey ? 'se' : 'move', d[0], d[1])
      if (next.x !== b.at.x || next.y !== b.at.y || next.w !== b.at.w || next.h !== b.at.h) setBackdrop(slide.id, { ...raw, at: next }, key)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [on, b, slide.backdrop, slide.id, setBackdrop])
  if (!on || !b || !slide.backdrop) return null
  const at = b.at
  const raw = slide.backdrop

  const start = (grip: Grip) => (e: ReactPointerEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    const box = ref.current?.getBoundingClientRect()
    if (!box) return
    // 장을 줄여 그린 배율: 화면의 1px이 장의 몇 px인지
    const k = box.width / 1920
    const x0 = e.clientX
    const y0 = e.clientY
    const key = gestureKey(`${slide.id}.backdrop`)
    let last = at
    const s = sessions(grip === 'move' ? 'is-block-dragging' : 'is-block-resizing')
    setDragging(true)
    s.onEnd(() => setDragging(false))
    s.on('pointermove', (ev) => {
      const dx = Math.round((ev.clientX - x0) / k / BACKDROP_CELL.w)
      const dy = Math.round((ev.clientY - y0) / k / BACKDROP_CELL.h)
      const next = dragArea(at, grip, dx, dy)
      if (next.x === last.x && next.y === last.y && next.w === last.w && next.h === last.h) return
      last = next
      setBackdrop(slide.id, { ...raw, at: next }, key)
    })
    s.on('pointerup', () => s.end())
    s.on('pointercancel', () => s.end())
  }

  return (
    <div ref={ref} className={`bdf${dragging ? ' is-dragging' : ''}`} role="group" aria-label="배경 자리 고치기">
      <div className="bdf-grid" aria-hidden="true" />
      <div
        className="bdf-box"
        style={{ left: at.x * BACKDROP_CELL.w, top: at.y * BACKDROP_CELL.h, width: at.w * BACKDROP_CELL.w, height: at.h * BACKDROP_CELL.h }}
        onPointerDown={start('move')}
      >
        <span className="bdf-label">배경 자리</span>
        {GRIPS.map((g) => (
          <span key={g} className={`bdf-grip is-${g}`} title={`${josa(GRIP_NAME[g], '을', '를')} 끌어 크기 바꾸기`} onPointerDown={start(g)} />
        ))}
      </div>
    </div>
  )
}

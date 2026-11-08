import { useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { BACKDROP_CELL, BACKDROP_MIN, backdropOf, placeOfArea, BACKDROP_PLACES } from '../../deck/backdrops'
import { BOARD_COLS, BOARD_ROWS } from '../../deck/blocks'
import type { BlockAt, Slide } from '../../deck/types'
import { josa } from '../../lib/josa'
import { gestureKey, usePointerSessions } from '../../lib/pointerSession'
import { useDeck } from '../../store/deckStore'
import { useEscape } from '../ui'
import { setBackdropEditing, useBackdropEditing } from './backdropEdit'

// 무대 위에서 배경 자리를 끌어 고치는 틀(이 장 설정의 '슬라이드에서 옮기기'). 장 전체를 12×12칸으로 나눈 칸에 맞춰 붙는다.
// 틀 안을 끌면 옮기고, 모서리와 가장자리를 끌면 크기를 바꾼다. 한 번 끄는 것이 되돌리기 한 단계다.
// 무대의 장 위(줄인 장의 좌표, 1920×1080)에 그리고, 손잡이는 장을 줄인 만큼 키워(--vs) 화면에서 늘 같은 크기로 보인다

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
  useEscape(() => setBackdropEditing(null), { active: on })
  const b = backdropOf(slide)
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

  const place = placeOfArea(at)
  return (
    <div ref={ref} className="bdf" role="group" aria-label="배경 자리 고치기">
      <div className="bdf-grid" aria-hidden="true" />
      <div
        className="bdf-box"
        style={{ left: at.x * BACKDROP_CELL.w, top: at.y * BACKDROP_CELL.h, width: at.w * BACKDROP_CELL.w, height: at.h * BACKDROP_CELL.h }}
        onPointerDown={start('move')}
      >
        <span className="bdf-label">{place ? `배경: ${BACKDROP_PLACES.find((p) => p.id === place)!.name}` : `배경: 가로 ${at.w}칸, 세로 ${at.h}칸`}</span>
        {GRIPS.map((g) => (
          <span key={g} className={`bdf-grip is-${g}`} title={`${josa(GRIP_NAME[g], '을', '를')} 끌어 크기 바꾸기`} onPointerDown={start(g)} />
        ))}
      </div>
      <div className="bdf-bar">
        <span>틀 안을 끌어 옮기고, 모서리를 끌어 크기를 바꿔요. 칸에 맞춰 붙어요.</span>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setBackdropEditing(null)}>
          다 했어요
        </button>
      </div>
    </div>
  )
}

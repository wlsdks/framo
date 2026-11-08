// 위아래로 늘어선 목록을 끌어 차례를 바꿀 때(장 목록, 나오는 차례, 움직임 편집의 시간표) 같이 쓰는 dnd-kit 조정

import type { Announcements, Modifier, UniqueIdentifier } from '@dnd-kit/core'
import { useMemo, useRef } from 'react'
import { josa } from './josa'
import { keys } from './keys'
import { usePointerSessions, type PointerSession } from './pointerSession'

/**
 * 끄는 것을 위아래로만, 그리고 목록이 스크롤되는 칸의 보이는 곳 안에서만 움직인다.
 * 칸 밖으로 끌면 끄는 것이 그만큼 칸의 스크롤 높이를 늘려서, 칸 끝에 대고 있으면 저절로 스크롤이 실제 끝을 넘어 빈 곳으로
 * 끝없이 이어졌다(칸에 끄는 것 하나만 남았다). 보이는 곳은 늘 내용 안이라 스크롤 높이가 늘지 않고, 저절로 스크롤은 손의 자리로
 * 움직여서 그대로 실제 끝까지 간다.
 * 끄는 것의 화면 자리는 끌기 시작할 때의 자리(activeNodeRect)에 transform을 더한 곳이다: 칸이 스크롤된 만큼은 dnd-kit이
 * 따로 더해 손 밑에 둔다
 */
const keepInList: Modifier = ({ transform, activeNodeRect, scrollableAncestorRects }) => {
  const box = scrollableAncestorRects[0]
  if (!activeNodeRect || !box) return { ...transform, x: 0 }
  const y = Math.min(Math.max(transform.y, box.top - activeNodeRect.top), box.bottom - activeNodeRect.bottom)
  return { ...transform, x: 0, y }
}

/**
 * 칸 끝의 저절로 스크롤: 칸 높이의 10% 띠 안에서, 끝에 닿으면 초당 1000px(dnd-kit의 기본은 20% 띠, 초당 2000px).
 * 기본값으로는 칸 끝 가까이의 줄을 잡아 조금만 움직여도 목록이 곧바로 0.2초에 200px씩 굴러, 세 줄짜리 나오는 차례에서는
 * 바라던 자리를 지나쳐 맨 끝에 놓였다
 */
const AUTO_SCROLL = { threshold: { x: 0, y: 0.1 }, acceleration: 5 }

/**
 * DndContext의 accessibility: 끄는 동안 화면 읽기 프로그램이 읽을 한국어 문장과 목록의 사용법.
 * 주지 않으면 dnd-kit의 영어 기본 문장('Picked up draggable item …')이 읽혔고, 기본 사용법의 '스페이스로 집기'는
 * 키보드 끌기를 쓰지 않는 이 목록들에서 되지도 않았다. 키보드로는 Alt와 위아래 화살표로 한 칸씩 옮긴다(목록마다의 onKeyDown).
 * nameOf는 읽을 이름, placeOf는 그 자리가 몇 번째인지(1부터)
 */
export function listAccessibility(nameOf: (id: UniqueIdentifier) => string, placeOf: (id: UniqueIdentifier) => number) {
  const announcements: Announcements = {
    onDragStart: ({ active }) => `${josa(nameOf(active.id), '을', '를')} 집었어요.`,
    onDragOver: ({ over }) => (over ? `${placeOf(over.id)}번째 자리 위에 있어요.` : '목록 밖에 있어요.'),
    onDragEnd: ({ active, over }) =>
      over && over.id !== active.id ? `${josa(nameOf(active.id), '을', '를')} ${placeOf(over.id)}번째 자리에 놓았어요.` : `${josa(nameOf(active.id), '은', '는')} 제자리에 있어요.`,
    onDragCancel: ({ active }) => `옮기기를 그만뒀어요. ${josa(nameOf(active.id), '은', '는')} 제자리에 있어요.`,
  }
  return {
    announcements,
    screenReaderInstructions: { draggable: `마우스로 끌어 순서를 바꿔요. 키보드로는 ${keys('alt+↑')}, ${keys('alt+↓')}로 한 칸씩 옮겨요.` },
  }
}

/** 키보드(Alt와 위아래 화살표)로 한 칸 옮긴 뒤 목록의 알림 줄(aria-live)에 읽을 문장. place는 옮겨 간 자리(1부터) */
export function movedSay(name: string, place: number): string {
  return `${josa(name, '을', '를')} ${place}번째로 옮겼어요.`
}

/** 목록을 끄는 동안 body에 붙는 class. 창(ui.tsx의 useDialog)은 이것이 있으면 Esc를 받지 않는다 */
export const LIST_DRAGGING = 'is-list-dragging'

/**
 * DndContext에 거는 것: keepInList와 저절로 스크롤, 끄는 동안의 Esc. 끄는 중의 Esc는 끌기만 그만둔다(dnd-kit이 document에서 받는다).
 * 편집기의 Esc(컴포넌트 고르기 끝내기)까지 받아 놓은 뒤 펼친 칸이 닫혔고, 움직임 편집에서는 창이 먼저 받아 창이 닫혔다.
 * 기본 동작을 막아 두면 Esc를 받는 다른 곳(defaultPrevented를 본다)이 쉬고, 창은 body의 class를 본다.
 * 화면이 끄는 도중에 사라져도 처리기와 class가 남지 않게 pointerSession으로 건다
 */
export function useListDrag() {
  const sessions = usePointerSessions()
  const live = useRef<{ session: PointerSession; pressed: boolean } | null>(null)
  return useMemo(() => {
    const end = () => {
      const d = live.current
      if (!d) return
      live.current = null
      d.session.end()
      if (d.pressed) swallowRelease(sessions())
    }
    return {
      modifiers: [keepInList],
      autoScroll: AUTO_SCROLL,
      start() {
        end()
        const session = sessions(LIST_DRAGGING)
        const d = { session, pressed: true }
        session.on(
          'keydown',
          (e) => {
            if (e.key === 'Escape') e.preventDefault()
          },
          true,
        )
        // 놓아서 끝났는지(손을 뗐다) Esc로 그만뒀는지(아직 눌려 있다) 가른다. 창의 잡는 단계라 dnd-kit의 놓기보다 먼저 받는다
        const release = () => {
          d.pressed = false
        }
        session.on('pointerup', release, true)
        session.on('pointercancel', release, true)
        live.current = d
      },
      end,
    }
  }, [sessions])
}

/**
 * Esc로 끌기를 그만둔 뒤 손을 뗄 때 생기는 누르기(click)를 삼킨다. dnd-kit은 끌기가 끝나고 50ms만 막아서,
 * Esc를 누르고 조금 뒤에 손을 떼면 끌던 장이 골라져 보던 장에서 넘어갔다(고른 컴포넌트도 풀렸다).
 * 누르기는 손을 떼는 일과 같은 차례에 오므로 뗀 다음 차례에 거둔다
 */
function swallowRelease(s: PointerSession) {
  s.on(
    'click',
    (e) => {
      e.preventDefault()
      e.stopPropagation()
      s.end()
    },
    true,
  )
  s.on('pointerup', () => setTimeout(s.end), true)
  s.on('pointercancel', s.end, true)
  // 뗀 것을 못 받았어도 다음에 새로 누르면 거둔다 (그 누르기까지 삼키지 않게)
  s.on('pointerdown', s.end, true)
}

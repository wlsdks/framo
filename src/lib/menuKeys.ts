// 메뉴(role="menu")의 방향키. 메뉴라고 알려 주면 화면 읽기 프로그램은 위아래 방향키로 항목을 옮기라고 안내하는데,
// 예전에는 Tab 키로만 옮겨 다녀 안내와 달랐다. 잠긴 항목(aria-disabled, 누르면 까닭을 보인다)도 초점은 받는다(WAI-ARIA).
// 모션 메뉴는 항목에 초점이 가면 그 모션을 미리 보여 주므로(onFocus), 방향키로 옮기며 마우스를 올린 것처럼 볼 수 있다

import type { KeyboardEvent } from 'react'

/** 누른 키로 옮겨 갈 항목의 차례. 메뉴의 키가 아니면 null. 끝에서 넘기면 처음으로 돈다 */
export function menuStep(key: string, at: number, count: number): number | null {
  if (count < 1) return null
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  if (key === 'ArrowDown') return at < 0 ? 0 : (at + 1) % count
  if (key === 'ArrowUp') return at < 0 ? count - 1 : (at - 1 + count) % count
  return null
}

/** 메뉴에 거는 onKeyDown: 옮겨 간 항목에 초점을 둔다 (고르는 것은 Enter나 스페이스, 누르기와 같다) */
export function onMenuKeys(e: KeyboardEvent<HTMLElement>) {
  if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
  const items = [...e.currentTarget.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([disabled])')]
  const to = menuStep(e.key, items.indexOf(e.target as HTMLElement), items.length)
  if (to === null) return
  e.preventDefault()
  items[to].focus()
}

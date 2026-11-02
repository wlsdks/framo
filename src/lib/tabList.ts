// 탭 묶음(role="tablist")의 방향키. WAI-ARIA의 탭 짜임대로: Tab 키로는 고른 탭 하나에만 서고(나머지는 tabIndex -1),
// 탭 사이는 방향키로 다니며 옮겨 간 탭을 바로 고른다(누른 것과 같이). 예전에는 탭 역할만 붙어 있어, 화면 읽기 프로그램이
// '탭'이라 알려 주는데 방향키로는 움직이지 않았다

import type { KeyboardEvent } from 'react'

/** 누른 키로 옮겨 갈 탭의 차례. 탭 묶음의 키가 아니거나 초점이 탭에 없으면(at < 0) null. 끝에서 넘기면 처음으로 돈다 */
export function tabStep(key: string, at: number, count: number, vertical = false): number | null {
  if (count < 1 || at < 0) return null
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  const step = key === (vertical ? 'ArrowDown' : 'ArrowRight') ? 1 : key === (vertical ? 'ArrowUp' : 'ArrowLeft') ? -1 : 0
  return step ? (at + step + count) % count : null
}

/** 탭 묶음에 거는 onKeyDown: 옮겨 간 탭에 초점을 두고 고른다. 세로 묶음은 aria-orientation="vertical"로 안다 */
export function onTabListKeys(e: KeyboardEvent<HTMLElement>) {
  if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
  const list = e.currentTarget
  const tabs = [...list.querySelectorAll<HTMLElement>('[role="tab"]:not([disabled])')]
  const to = tabStep(e.key, tabs.indexOf(e.target as HTMLElement), tabs.length, list.getAttribute('aria-orientation') === 'vertical')
  if (to === null) return
  e.preventDefault()
  tabs[to].focus()
  tabs[to].click()
}

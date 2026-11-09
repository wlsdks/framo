import { useLayoutEffect, useState } from 'react'
import { useEscape } from '../ui'
import type { BlockEditing } from './BlockEditor'

/** styles/narrow.css의 '좁은 화면'과 같은 너비: 이보다 좁으면 오른쪽 칸을 접는다 */
const NARROW = '(max-width: 1100px)'

/** 오른쪽 칸(이 장 설정, 움직임, 컴포넌트)의 탭과, 좁은 창에서 띄우고 닫는 일 */
export interface SidePanel {
  /** 넓은 창에서도 쓰는 사람이 오른쪽 칸을 접었는지 */
  collapsed: boolean
  /** 좁은 창에서 띄워 두었는지 */
  shown: boolean
  /** 띄운 칸이 '이 장 설정'을 보이는지 */
  settingsShown: boolean
  /** 보이는 탭. 컴포넌트 고르기가 열려 있으면 늘 컴포넌트 */
  tab: 'settings' | 'motion' | 'library'
  settings(): void
  motion(): void
  toggleSettings(): void
  toggleLibrary(): void
  closeLibrary(): void
  close(): void
}

/**
 * 좁은 창(1100px 아래)에서는 오른쪽 칸을 접어 두고, 열면 슬라이드 위에 띄운다.
 * 띄워 둘지는 어느 탭을 보는지와 따로 둔다: 탭을 '이 장 설정'으로 바꿔도 닫히지 않게 (컴포넌트를 고르는 중이면 늘 띄운다)
 */
export function useSidePanel(blocks: Pick<BlockEditing, 'libraryOpen' | 'setLibraryOpen'>): SidePanel {
  const [sideOpen, setSideOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  // 움직임 탭을 보던 중인지. 컴포넌트 고르기를 열었다 닫으면 보던 탭으로 돌아간다
  const [motionTab, setMotionTab] = useState(false)
  const [focus, setFocus] = useState<'settings' | 'library' | 'back-settings' | 'back-library' | null>(null)
  // 접거나 펴는 렌더가 끝나야 단추가 보인다. requestAnimationFrame만 기다리면 아직 숨은 단추에 초점을 보내기도 한다.
  useLayoutEffect(() => {
    if (!focus) return
    const selector = { settings: '.side-tab[aria-selected="true"]', library: '.lib-find', 'back-settings': '.stage-side', 'back-library': '.stage-blocks' }[focus]
    const target = document.querySelector<HTMLElement>(selector)
    const fallback = document.querySelector<HTMLElement>('.side-tab[aria-selected="true"]')
    const shown = target?.offsetWidth ? target : fallback
    shown?.focus({ preventScroll: true })
    setFocus(null)
  }, [focus, collapsed, sideOpen, motionTab, blocks.libraryOpen])
  // 띄운 '이 장 설정'은 Esc로 닫는다 (컴포넌트 탭의 Esc는 BlockLibrary가 받아 '이 장 설정'으로 돌아간다)
  useEscape(() => {
    setSideOpen(false)
    if (matchMedia(NARROW).matches) setFocus('back-settings')
  }, { active: sideOpen && !blocks.libraryOpen, typing: false })
  return {
    collapsed: collapsed && !blocks.libraryOpen,
    shown: sideOpen || blocks.libraryOpen,
    settingsShown: sideOpen && !blocks.libraryOpen && !motionTab,
    tab: blocks.libraryOpen ? 'library' : motionTab ? 'motion' : 'settings',
    settings: () => {
      setCollapsed(false)
      blocks.setLibraryOpen(false)
      setMotionTab(false)
      if (matchMedia(NARROW).matches) setSideOpen(true)
    },
    motion: () => {
      setCollapsed(false)
      blocks.setLibraryOpen(false)
      setMotionTab(true)
      if (matchMedia(NARROW).matches) setSideOpen(true)
    },
    toggleSettings: () => {
      setCollapsed(false)
      setFocus('settings')
      if (sideOpen && !blocks.libraryOpen && !motionTab) setSideOpen(false)
      else {
        blocks.setLibraryOpen(false)
        setMotionTab(false)
        setSideOpen(true)
      }
    },
    toggleLibrary: () => {
      setFocus(blocks.libraryOpen ? 'back-library' : 'library')
      if (!blocks.libraryOpen) return blocks.setLibraryOpen(true)
      blocks.setLibraryOpen(false)
      setSideOpen(false)
    },
    closeLibrary: () => {
      blocks.setLibraryOpen(false)
      setFocus('back-library')
    },
    close: () => {
      setFocus('back-settings')
      setCollapsed(true)
      setSideOpen(false)
      blocks.setLibraryOpen(false)
    },
  }
}

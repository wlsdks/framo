import { useEffect, useEffectEvent } from 'react'
import { isMac } from '../../lib/keys'
import { presentKey } from '../../lib/presentKeys'
import { useDeck } from '../../store/deckStore'
import { dialogOpen, isTyping, type Toast } from '../ui'
import type { PresentHow } from './DeckMenus'

/**
 * 편집기의 여는 단축키. 윈도우의 브라우저가 쓰는 키(Ctrl+T, W, N, Tab, Alt+F, Alt+D)는 피하고, PowerPoint에서 오는 분이 아는
 * 키(Ctrl+M 새 슬라이드, Ctrl+D 복제)는 같게 둔다. 화면에는 keys()로 이 PC에 맞게 보인다(윈도우는 Alt+T, 맥은 ⌥T).
 * 글을 쓰는 중에는 받지 않는다(맥의 ⌥+글자는 특수 문자를 친다)
 */
export const SHORTCUT = {
  newSlide: 'mod+M',
  duplicate: 'mod+D',
  library: 'alt+C',
  studio: 'alt+M',
  theme: 'alt+T',
  deck: 'alt+S',
  ai: 'alt+A',
  help: '?',
} as const

type ShortcutAction = Exclude<keyof typeof SHORTCUT, 'duplicate'>

/** 위 막대나 슬라이드 목록의 단추를 단축키로 누를 때 찾는 이름 (단추의 data-shortcut). 메뉴를 열고 닫는 일은 단추가 맡는다 */
export function pressShortcut(name: 'theme' | 'deck' | 'ai' | 'newSlide') {
  const btn = document.querySelector<HTMLButtonElement>(`[data-shortcut="${name}"]`)
  if (!btn) return
  // 마우스로 누를 때처럼 먼저 눌림을 알린다: 열려 있던 다른 메뉴가 바깥을 누른 것으로 알고 닫힌다(둘이 함께 열려 있지 않게)
  btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
  btn.click()
  btn.focus({ preventScroll: true })
}

/** 단축키 보기(?)에 늘어놓는 것. 묶음마다 키와 하는 일 */
export const SHORTCUT_LIST: { group: string; rows: { keys: string[]; what: string }[] }[] = [
  {
    group: '발표',
    rows: [
      { keys: ['F5'], what: '처음부터 발표' },
      { keys: ['shift+F5'], what: '이 슬라이드부터 발표' },
      { keys: ['alt+F5'], what: '발표자 화면과 함께 발표' },
    ],
  },
  {
    group: '슬라이드',
    rows: [
      { keys: [SHORTCUT.newSlide], what: '새 슬라이드 넣기' },
      { keys: [SHORTCUT.duplicate], what: '복제 (고른 컴포넌트나 슬라이드)' },
      { keys: ['Delete'], what: '지우기 (고른 컴포넌트나 슬라이드)' },
      { keys: ['PageUp', 'PageDown'], what: '앞 슬라이드, 다음 슬라이드' },
      { keys: ['alt+↑', 'alt+↓'], what: '슬라이드 순서 바꾸기 (왼쪽 목록)' },
    ],
  },
  {
    group: '고치기',
    rows: [
      { keys: ['mod+Z'], what: '되돌리기' },
      { keys: [isMac ? 'mod+shift+Z' : 'mod+Y'], what: '다시 하기' },
      { keys: ['mod+S'], what: '지금 저장 (늘 자동 저장돼요)' },
      { keys: ['mod+P'], what: 'PDF로 내보내기' },
      { keys: ['Esc'], what: '고른 것 놓기, 열린 창 닫기' },
    ],
  },
  {
    group: '열기',
    rows: [
      { keys: [SHORTCUT.library], what: '컴포넌트 넣기' },
      { keys: [SHORTCUT.studio], what: '모션 편집 열고 닫기' },
      { keys: [SHORTCUT.theme], what: '테마' },
      { keys: [SHORTCUT.deck], what: '발표 설정' },
      { keys: [SHORTCUT.ai], what: 'AI 도움받기' },
      { keys: [SHORTCUT.help], what: '단축키 보기' },
    ],
  },
  {
    group: '모션 편집 안에서',
    rows: [
      { keys: ['Space'], what: '재생, 멈춤' },
      { keys: ['←', '→'], what: '앞 슬라이드, 다음 슬라이드' },
      { keys: ['Esc'], what: '편집으로 돌아가기' },
    ],
  },
]

/** 누른 키가 SHORTCUT의 어느 것인지. 한글 입력 상태에서도 글자 키는 자판 자리로 읽는다(presentKey) */
export function shortcutOf(e: Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>): keyof typeof SHORTCUT | null {
  const mod = e.ctrlKey || e.metaKey
  // ?는 Shift와 함께 오는 글자. 맥의 ⌘/ 와 윈도우의 Ctrl+/ 도 받는다(어디서 보는지 아는 분이 많다)
  if (!mod && !e.altKey && e.key === '?') return 'help'
  if (mod && !e.altKey && !e.shiftKey && (e.key === '/' || e.code === 'Slash')) return 'help'
  const k = presentKey(e).toLowerCase()
  for (const [name, combo] of Object.entries(SHORTCUT) as [keyof typeof SHORTCUT, string][]) {
    const parts = combo.toLowerCase().split('+')
    const key = parts[parts.length - 1]
    if (key.length !== 1 || key !== k) continue
    if (parts.includes('mod') !== mod || parts.includes('alt') !== e.altKey || parts.includes('shift') !== e.shiftKey) continue
    return name
  }
  return null
}

/**
 * 편집기의 단축키: 되돌리기, F5로 발표 (PowerPoint와 같게), Ctrl+S 저장, Ctrl+P PDF, 그리고 여는 단축키(SHORTCUT).
 * 창에는 한 번만 걸고 늘 최근 처리기를 부른다 (예전에는 글자 하나 칠 때마다 떼었다 다시 걸었다)
 */
export function useEditorShortcuts(on: {
  /** 발표하는 동안은 쉰다 (발표 화면이 키를 받는다) */
  paused: boolean
  /** F5는 처음부터, Shift+F5는 지금 장부터. Alt를 같이 누르면 발표자 화면과 함께 */
  present(here: boolean, how: PresentHow): void
  /** 두 곳에 바로 저장한다. 고른 폴더나 브라우저에 쓰지 못하면 false */
  saveNow(): Promise<boolean>
  print(): void
  /** 여는 단축키(SHORTCUT)와 복제 */
  run(action: ShortcutAction | 'duplicate'): void
  /** 슬라이드 위에서 컴포넌트를 골랐는지 (그러면 Ctrl+D는 그 컴포넌트를 복제한다: BlockEditor가 받는다) */
  blockSelected(): boolean
  /** 앞, 다음 슬라이드로 (PageUp, PageDown) */
  step(d: 1 | -1): void
  toast: Toast
}) {
  const onShortcut = useEffectEvent((e: KeyboardEvent) => {
    const typing = isTyping(e)
    const mod = e.metaKey || e.ctrlKey
    // 한글 입력 상태에서는 Ctrl+Z가 'ㅋ'로 와서 글자 키는 자판 자리로 읽는다
    const k = presentKey(e).toLowerCase()
    const save = mod && !e.shiftKey && !e.altKey && k === 's'
    // Ctrl+P를 브라우저에 맡기면 인쇄할 장이 없어 빈 쪽이 나온다. 내보내기의 PDF와 같은 길로 보낸다
    const print = mod && !e.shiftKey && !e.altKey && k === 'p'
    // 브라우저의 새로 고침, 페이지 저장, 인쇄 창은 글을 쓰는 중에도, 창이 떠 있어도 막는다
    if (e.key === 'F5' || save || print) e.preventDefault()
    if (on.paused || dialogOpen()) return
    if (e.key === 'F5') {
      on.present(e.shiftKey, e.altKey ? 'presenter' : 'auto')
      return
    }
    if (save) {
      void on.saveNow().then((ok) =>
        on.toast.show(ok ? '저장했어요. 고칠 때마다 자동으로 저장되고 있어요.' : '저장하지 못했어요. 위쪽의 저장 상태를 눌러 할 일을 확인해 주세요.'),
      )
      return
    }
    if (print) {
      on.print()
      return
    }
    // 여는 단축키와 슬라이드 넘기기는 글을 쓰는 중이 아닐 때만. 다른 곳(슬라이드 목록의 Ctrl+D 같은)이 이미 받은 키도 두 번 하지 않는다
    if (!typing && !e.defaultPrevented) {
      const name = shortcutOf(e)
      if (name === 'duplicate') {
        if (on.blockSelected()) return
        e.preventDefault()
        on.run('duplicate')
        return
      }
      if (name) {
        e.preventDefault()
        on.run(name)
        return
      }
      if ((e.key === 'PageUp' || e.key === 'PageDown') && !mod && !e.altKey && !e.shiftKey) {
        e.preventDefault()
        on.step(e.key === 'PageDown' ? 1 : -1)
        return
      }
    }
    // 장의 글 칸에서는 쓰는 중에도 편집기의 되돌리기로(위쪽 되돌리기 단추와 같게). 브라우저에 맡기면 한글은 한 음절씩 되돌렸고,
    // 그 칸을 다 비우면 앞서 고친 다른 칸의 글을 한 음절씩 지웠으며, 되돌린 것이 편집기의 기록과 따로 놀았다. 조합 중의 키는 입력기에 맡긴다
    const field = typing && !e.isComposing && e.keyCode !== 229 && !!(e.target as HTMLElement).closest?.('.slide .ed-input')
    if (typing && !field) return
    const { undo, redo } = useDeck.getState()
    if (mod && k === 'z') {
      e.preventDefault()
      if (e.shiftKey) redo()
      else undo()
    } else if (mod && k === 'y') {
      e.preventDefault()
      redo()
    }
  })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => onShortcut(e)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

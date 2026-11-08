// 발표 중의 키. 앱의 발표 화면(Present), 발표자 화면(Presenter), 내보낸 HTML의 보기 화면(export/viewer.ts)이 같이 쓴다.
// 보기 화면은 두 함수의 소스를 그대로 넣는다(toString, 움직임 엔진과 같은 방식). 그래서 함수 밖의 것(import, 바깥 상수)을
// 쓰지 않는다. 예전에는 세 곳에 같은 키 목록을 따로 적어서, 한 곳만 고치면 발표 화면과 내보낸 파일이 다르게 넘어갔다.

import type { Blank } from '../present/link'

/**
 * 발표 중에 누른 키. 한글 입력 상태에서는 B가 'ㅠ'로(윈도우는 'Process'로) 와서 B·W·N·P가 듣지 않는다.
 * 글자 키는 자판 자리(e.code)로 읽는다. 영문 자판이 아닌 나라 배열(AZERTY 등)은 e.key가 영문자라 그대로 쓴다
 */
export function presentKey(e: Pick<KeyboardEvent, 'key' | 'code'>): string {
  if (/^Key[A-Z]$/.test(e.code) && !/^[a-z]$/i.test(e.key)) return e.code.slice(3).toLowerCase()
  if (e.key === 'Process') return ({ Period: '.', Comma: ',', Space: ' ', Enter: 'Enter' } as Record<string, string>)[e.code] ?? e.key
  return e.key
}

/** 키 하나로 할 일: 화면 가리기(blank가 null이면 걷기), 그 차례의 장으로 넘기기(넘기는 쪽이 처음과 끝에서 멈춘다), 발표 끝내기 */
/** go의 jump: 번호를 쳐서 간다. 다음 장 번호여도 '다음'(누르면 나올 것을 먼저 보이기)이 아니라 그 장으로 바로 간다 */
type PresentAction = { kind: 'blank'; blank: Blank } | { kind: 'go'; index: number; jump?: boolean } | { kind: 'exit' }

/**
 * presentKey로 읽은 키를 할 일로. PowerPoint와 같게: → ↓ PageDown Space Enter N은 다음 장, ← ↑ PageUp Backspace P는 앞 장,
 * Home과 End는 처음과 끝 장. B나 .은 검은 화면, W나 ,는 흰 화면이고 한 번 더 누르면 걷는다 (클리커의 '화면 가리기' 단추도 이 키를 보낸다).
 * 가린 화면에서는 Esc 말고 아무 키나 누르면 넘기지 않고 그 장으로 돌아온다. 할 일이 없는 키면 null (브라우저에 맡긴다).
 * blank는 지금 가린 화면, index는 지금 장, last는 마지막 장의 차례
 */
export function presentAction(key: string, blank: Blank, index: number, last: number, typed = ''): PresentAction | null {
  const next = ['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter', 'n']
  const prev = ['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace', 'p']
  const cover = ({ b: 'black', B: 'black', '.': 'black', w: 'white', W: 'white', ',': 'white' } as Record<string, 'black' | 'white'>)[key]
  if (cover) return { kind: 'blank', blank: blank === cover ? null : cover }
  if (blank && key !== 'Escape') return { kind: 'blank', blank: null }
  // 번호를 치고 Enter면 그 차례의 장으로 (PowerPoint와 같게. 숫자는 slideNumber가 모은다). 마지막 장보다 크면 마지막 장
  if (key === 'Enter' && /^[0-9]+$/.test(typed) && Number(typed) >= 1) return { kind: 'go', index: Math.min(Number(typed), last + 1) - 1, jump: true }
  if (next.includes(key)) return { kind: 'go', index: index + 1 }
  if (prev.includes(key)) return { kind: 'go', index: index - 1 }
  if (key === 'Home') return { kind: 'go', index: 0 }
  if (key === 'End') return { kind: 'go', index: last }
  if (key === 'Escape') return { kind: 'exit' }
  return null
}

/**
 * 발표 중에 친 숫자를 모은다: '5' '이어서 Enter'로 5번째 장에 간다(presentAction의 typed). 1.5초 안에 이어 친 숫자만 하나로 본다.
 * 앱의 발표 화면, 발표자 화면, 내보낸 파일의 보기 화면이 같이 쓴다(보기 화면은 소스를 그대로 넣는다: 바깥 이름을 쓰지 않는다)
 */
export function slideNumber() {
  let typed = ''
  let at = -Infinity
  return {
    /** 숫자 키면 모으고 true (그 키로 다른 일을 하지 않는다) */
    push(key: string, now: number): boolean {
      if (!/^[0-9]$/.test(key)) return false
      typed = (now - at < 1500 ? typed : '') + key
      at = now
      return true
    },
    /** 모아 둔 번호를 꺼내고 비운다. 오래됐으면 빈 글 */
    take(now: number): string {
      const t = now - at < 1500 ? typed : ''
      typed = ''
      return t
    },
  }
}

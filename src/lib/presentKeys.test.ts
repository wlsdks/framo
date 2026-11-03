import { describe, expect, it } from 'vitest'
import { VIEWER_JS } from '../export/viewer'
import { presentAction, presentKey, slideNumber } from './presentKeys'

const key = (k: string, code: string) => presentKey({ key: k, code })

describe('발표 중의 키', () => {
  it('한글 입력 상태에서도 B, W, N, P를 자판 자리로 읽는다', () => {
    expect(key('ㅠ', 'KeyB')).toBe('b')
    expect(key('ㅈ', 'KeyW')).toBe('w')
    expect(key('Process', 'KeyN')).toBe('n')
    expect(key('Process', 'Period')).toBe('.')
    expect(key('B', 'KeyB')).toBe('B')
    expect(key('ArrowRight', 'ArrowRight')).toBe('ArrowRight')
  })

  it('넘기기, 처음과 끝, 끝내기', () => {
    for (const k of ['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter', 'n']) expect(presentAction(k, null, 3, 9)).toEqual({ kind: 'go', index: 4 })
    for (const k of ['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace', 'p']) expect(presentAction(k, null, 3, 9)).toEqual({ kind: 'go', index: 2 })
    expect(presentAction('Home', null, 3, 9)).toEqual({ kind: 'go', index: 0 })
    expect(presentAction('End', null, 3, 9)).toEqual({ kind: 'go', index: 9 })
    expect(presentAction('Escape', null, 3, 9)).toEqual({ kind: 'exit' })
    expect(presentAction('a', null, 3, 9)).toBeNull()
    expect(presentAction('Tab', null, 3, 9)).toBeNull()
  })

  it('B·.은 검은 화면, W·,는 흰 화면이고 한 번 더 누르면 걷는다', () => {
    for (const k of ['b', 'B', '.']) {
      expect(presentAction(k, null, 0, 9)).toEqual({ kind: 'blank', blank: 'black' })
      expect(presentAction(k, 'black', 0, 9)).toEqual({ kind: 'blank', blank: null })
      expect(presentAction(k, 'white', 0, 9)).toEqual({ kind: 'blank', blank: 'black' })
    }
    for (const k of ['w', 'W', ',']) expect(presentAction(k, null, 0, 9)).toEqual({ kind: 'blank', blank: 'white' })
  })

  it('가린 화면에서는 아무 키나 누르면 넘기지 않고 걷는다. Esc는 발표를 끝낸다', () => {
    expect(presentAction('ArrowRight', 'black', 3, 9)).toEqual({ kind: 'blank', blank: null })
    expect(presentAction('a', 'white', 3, 9)).toEqual({ kind: 'blank', blank: null })
    expect(presentAction('Escape', 'black', 3, 9)).toEqual({ kind: 'exit' })
  })

  it('내보낸 HTML의 보기 화면도 같은 함수를 쓴다 (소스만 넣어도 돌아간다)', () => {
    expect(VIEWER_JS).toContain(presentKey.toString())
    expect(VIEWER_JS).toContain(presentAction.toString())
    // 보기 화면에는 함수의 소스만 들어가므로 바깥의 것을 쓰면 여기서 ReferenceError가 난다
    const loose = new Function(`return [(${presentKey.toString()}), (${presentAction.toString()})]`)() as [typeof presentKey, typeof presentAction]
    expect(loose[0]({ key: 'ㅠ', code: 'KeyB' })).toBe('b')
    for (const [k, blank] of [['n', null], ['b', 'black'], ['End', null], ['Escape', 'white'], ['x', null]] as const) {
      expect(loose[1](k, blank, 2, 5)).toEqual(presentAction(k, blank, 2, 5))
    }
  })
})

describe('번호를 치고 Enter (PowerPoint처럼 그 장으로)', () => {
  it('친 번호의 장으로 가고, 마지막보다 크면 마지막 장', () => {
    expect(presentAction('Enter', null, 0, 9, '5')).toEqual({ kind: 'go', index: 4 })
    expect(presentAction('Enter', null, 0, 9, '42')).toEqual({ kind: 'go', index: 9 })
    expect(presentAction('Enter', null, 3, 9, '')).toEqual({ kind: 'go', index: 4 })
    expect(presentAction('Enter', null, 3, 9, '0')).toEqual({ kind: 'go', index: 4 })
  })

  it('1.5초 안에 이어 친 숫자만 하나로 모으고, 꺼내면 비운다', () => {
    const num = slideNumber()
    expect(num.push('1', 0)).toBe(true)
    expect(num.push('2', 500)).toBe(true)
    expect(num.push('a', 600)).toBe(false)
    expect(num.take(800)).toBe('12')
    expect(num.take(900)).toBe('')
    num.push('3', 1000)
    expect(num.take(3000)).toBe('')
  })
})

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SHORTCUT, SHORTCUT_LIST, shortcutOf } from './shortcuts'

const key = (k: string, code: string, mods: Partial<Record<'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey', boolean>> = {}) => ({
  key: k,
  code,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
})

describe('편집기의 여는 단축키', () => {
  it('윈도우의 Ctrl과 맥의 ⌘를 같게 받는다 (PowerPoint의 Ctrl+M 새 슬라이드, Ctrl+D 복제)', () => {
    expect(shortcutOf(key('m', 'KeyM', { ctrlKey: true }))).toBe('newSlide')
    expect(shortcutOf(key('m', 'KeyM', { metaKey: true }))).toBe('newSlide')
    expect(shortcutOf(key('d', 'KeyD', { ctrlKey: true }))).toBe('duplicate')
  })

  it('한글 입력 상태와 맥의 ⌥(특수 문자를 친다)에서도 자판 자리로 읽는다', () => {
    expect(shortcutOf(key('ㅡ', 'KeyM', { ctrlKey: true }))).toBe('newSlide')
    expect(shortcutOf(key('ç', 'KeyC', { altKey: true }))).toBe('library')
    expect(shortcutOf(key('µ', 'KeyM', { altKey: true }))).toBe('studio')
    expect(shortcutOf(key('ㅅ', 'KeyT', { altKey: true }))).toBe('theme')
  })

  it('?와 Ctrl+/는 단축키 보기, 다른 조합은 받지 않는다', () => {
    expect(shortcutOf(key('?', 'Slash', { shiftKey: true }))).toBe('help')
    expect(shortcutOf(key('/', 'Slash', { ctrlKey: true }))).toBe('help')
    // 브라우저가 쓰는 키와 글자만 친 것은 그대로 둔다
    for (const [k, code, mods] of [
      ['t', 'KeyT', { ctrlKey: true }],
      ['w', 'KeyW', { ctrlKey: true }],
      ['n', 'KeyN', { ctrlKey: true }],
      ['m', 'KeyM', {}],
      ['c', 'KeyC', {}],
      ['m', 'KeyM', { ctrlKey: true, shiftKey: true }],
      ['f', 'KeyF', { altKey: true }],
      ['d', 'KeyD', { altKey: true }],
    ] as const)
      expect(shortcutOf(key(k, code, mods)), `${k} ${JSON.stringify(mods)}`).toBeNull()
  })

  it('브라우저가 먼저 가져가는 키(Ctrl+T, W, N, Tab, Alt+F, Alt+D)를 쓰지 않고, 키마다 하나의 일만', () => {
    const combos = Object.values(SHORTCUT).map((c) => c.toLowerCase())
    for (const reserved of ['mod+t', 'mod+w', 'mod+n', 'mod+tab', 'alt+f', 'alt+d', 'alt+e']) expect(combos).not.toContain(reserved)
    expect(new Set(combos).size).toBe(combos.length)
  })

  it('단축키 보기의 목록에 여는 단축키가 모두 있다', () => {
    const listed = SHORTCUT_LIST.flatMap((g) => g.rows.flatMap((r) => r.keys))
    for (const combo of Object.values(SHORTCUT)) expect(listed, combo).toContain(combo)
  })

  it('화면의 단축키 표기는 keys()로 쓴다: ⌘나 Ctrl을 직접 적지 않는다', () => {
    const dir = join(__dirname)
    const files = readdirSync(dir).filter((f) => /\.tsx?$/.test(f) && !/\.test\./.test(f) && statSync(join(dir, f)).isFile())
    const bad = files.filter((f) => /['"`(][^'"`\n]*(?:⌘|Ctrl\+)[^'"`\n]*['"`)]/.test(readFileSync(join(dir, f), 'utf8').replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, '')))
    expect(bad).toEqual([])
  })
})

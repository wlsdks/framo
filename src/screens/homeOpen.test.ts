import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createSampleDeck } from '../deck/sample'
import { decodeDeckFile, encodeDeckFile } from '../store/deckFile'

const src = readFileSync(join(__dirname, 'Home.tsx'), 'utf8')

describe('홈의 파일 열기', () => {
  it('작업 파일인지는 확장자가 아니라 내용으로 가린다', () => {
    // 'X.DECK'처럼 확장자가 대문자이거나(윈도우는 확장자의 대소문자를 가리지 않는다) 이름을 바꾼 작업 파일을 HTML로 읽어
    // 'Framo에서 저장한 작업 파일이나 내보낸 발표 파일(HTML)만 열 수 있어요'라고 했다
    expect(src).not.toMatch(/file\.name\.endsWith\(/)
    expect(src).toMatch(/decodeDeckFile\(text\) \?\? readDeckFromHtml\(text\)/)
  })

  it('작업 파일의 내용은 이름과 상관없이 발표로 읽히고, HTML은 작업 파일로 읽히지 않는다', () => {
    const deck = createSampleDeck()
    expect(decodeDeckFile(encodeDeckFile(deck))?.id).toBe(deck.id)
    expect(decodeDeckFile('<!DOCTYPE html><html><body></body></html>')).toBeNull()
  })
})

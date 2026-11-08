// 예전에 저장한 발표를 지금 꼴로 읽기. 저장 형식이나 정해진 이름(역할 이름, 테마 id)을 바꾸면 여기에 예전 것을
// 지금 것으로 바꾸는 줄을 더한다. 편집기가 발표를 열 때(deckStore.open) 부른다. 여러 번 불러도 결과가 같다

import { boardAreaH, boardFit, boardFromRows, cleanDeckBlocks } from './blocks'
import { cleanCines, tidyCines } from './cine'
import { LAYOUTS } from './layouts'
import { plainTheme } from './themes'
import type { Deck } from './types'

/** 바꾼 장 역할 이름: 예전 이름 → 지금 이름 (share.test.ts의 역할 이름 기록이 바뀌면 여기를 챙긴다) */
const RENAMED_ROLES: Record<string, string> = {
  // 화면에서 '부품'을 '컴포넌트'로 부르기 전에 만든 장
  '부품으로 꾸미기': LAYOUTS.compose.name,
}

export function migrateDeck(raw: Deck): Deck {
  const theme = plainTheme(raw.theme)
  const look = { meta: raw.meta, theme }
  const fitOf = (s: Deck['slides'][number]) => boardFit(boardAreaH(s, look))
  const slides = raw.slides.map((s) => {
    const named = Object.hasOwn(RENAMED_ROLES, s.purpose) ? { ...s, purpose: RENAMED_ROLES[s.purpose] } : s
    // 판 전(0.4까지)의 부품 장: 줄(rows)을 판으로. 칸 너비와 줄 높이 비중은 바라는 크기로, 이음표도 따라간다
    const old = named as typeof named & { rows?: unknown }
    if (old.rows === undefined) return named
    const { rows, ...rest } = old
    return { ...rest, blocks: rest.blocks ?? boardFromRows(rows, fitOf(rest)) }
  })
  // 부품 장의 판을 정해진 꼴로 맞추고, 예전 세리프 테마는 화이트에 명조 제목으로.
  // 모션 그래픽의 레시피는 꼴이 맞는 것만 남기고(사람의 글이 섞여 들지 않게), 쓰지 않는 버전은 뺀다
  const { cines: rawCines, ...rest } = raw
  const cines = cleanCines(rawCines)
  return tidyCines(cleanDeckBlocks({ ...rest, ...(cines ? { cines } : {}), version: 2, slides, theme }, fitOf))
}

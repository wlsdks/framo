// 장과 부품의 항목 수, 레이아웃을 바꾸는 규칙. 사람이 편집기에서 할 때(store/deckStore)와 AI 제안을 적용할 때(ai/ops)가
// 같이 쓴다. 따로 적어 두었더니 같은 일(항목 하나 더하기, 레이아웃 바꾸기)을 세 곳에서 조금씩 다르게 고쳐야 했다

import { LAYOUTS } from './layouts'
import { emptyItem, withDefaultOptions } from './make'
import type { Item, LayoutId, Slide } from './types'

/**
 * 보이는 항목(앞의 max개)을 count개로. 레이아웃이나 부품이 보이는 수보다 많은 항목은 지우지 않고 숨겨 두므로,
 * 늘릴 때는 숨은 항목 앞에 빈 항목을 넣고, 줄일 때는 보이는 끝에서 뺀다. 뺄 항목에 글이 있으면 null(지우지 않는다).
 * empty는 빈 항목인지 보는 법: AI 제안은 미리 넣은 이름표만 있는 항목도 빈 것으로 본다
 */
export function withVisibleCount(items: Item[], max: number, count: number, empty: (it: Item) => boolean): Item[] | null {
  const visible = Math.min(items.length, max)
  const next = [...items]
  if (count > visible) next.splice(visible, 0, ...Array.from({ length: count - visible }, emptyItem))
  else if (count < visible) {
    if (!next.slice(count, visible).every(empty)) return null
    next.splice(count, visible - count)
  }
  return next
}

/** 항목을 하나 더한 목록: 보이는 항목 바로 뒤, 숨은 항목 앞에. 이미 max개가 보이면 받은 목록 그대로 */
export function withOneMore(items: Item[], max: number): Item[] {
  const visible = Math.min(items.length, max)
  return visible >= max ? items : (withVisibleCount(items, max, visible + 1, () => true) ?? items)
}

/**
 * 다른 레이아웃으로 바꾼 장. 부품 장으로 바꾸기와 되돌리기는 따로다(blocks/convert.ts의 asCompose, unwrapCompose).
 * 칸과 항목의 글은 그대로 두고 새 레이아웃의 최소 항목 수만큼 빈 항목을 채운다. 모양은 레이아웃마다 따로라서
 * variant(없으면 기본 모양)로, 강조 같은 고르는 값은 새 레이아웃의 기본값으로
 */
export function relayout(slide: Slide, layout: LayoutId, variant?: string): Slide {
  const min = LAYOUTS[layout].items?.min ?? 0
  const items = [...slide.items]
  while (items.length < min) items.push(emptyItem())
  return { ...slide, layout, items, variant, options: withDefaultOptions(layout, slide.options, items.length) }
}

/**
 * 여러 줄을 붙여 넣은 글을 항목 하나에 한 줄씩 나눌 수 있게 줄로 자른다. 메일, 메모, 문서에서 목록을 복사하면 줄마다
 * 글머리표('•', '-', '1.', '①', '가.')가 따라와서, 그대로 넣으면 장의 목록 표시와 겹쳐 두 번 찍혔다. 빈 줄은 뺀다.
 * '-'와 번호는 뒤에 빈칸이 있을 때만 글머리표로 본다: '-5% 감소', '1.2억 원'의 앞을 떼면 숫자가 바뀐다
 */
export function listLines(raw: string): string[] {
  return raw
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) =>
      l
        .replace(/[\t ]/g, ' ')
        .replace(/^\s*(?:[•·▪◦‣①-⑳]\s*|(?:[-*–—]|\d{1,2}[.)]|\(\d{1,2}\)|[가-하][.)])\s+)/, '')
        .trim(),
    )
    .filter(Boolean)
}

/**
 * 항목 index의 key 칸부터 줄마다 다음 항목으로 채운 목록. 모자라면 항목을 늘린다(레이아웃의 max까지).
 * 사람이 적은 글은 덮지 않는다: 채울 칸 가운데 하나라도 글이 있거나, max를 넘으면 null(부르는 쪽이 칸 하나에 붙인다)
 */
export function pastedItems(items: Item[], max: number, index: number, key: Exclude<keyof Item, 'id'>, lines: string[]): Item[] | null {
  if (lines.length < 2 || index + lines.length > max) return null
  let next = items
  while (Math.min(next.length, max) < index + lines.length) {
    const grown = withOneMore(next, max)
    if (grown === next) return null
    next = grown
  }
  if (lines.some((_, j) => next[index + j][key].trim())) return null
  return next.map((it, i) => (i >= index && i < index + lines.length ? { ...it, [key]: lines[i - index] } : it))
}

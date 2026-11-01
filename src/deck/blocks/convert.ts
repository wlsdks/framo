// 장을 부품 장으로, 부품 장을 다시 장으로. 사람이 적은 글은 하나도 버리지 않는다

import { relayout } from '../edits'
import { uid } from '../generate'
import { sceneFits } from '../scenes'
import type { Block, BlockType, Item, LayoutBlockType, LayoutId, Slide } from '../types'
import { HEAD_KEYS } from './catalog'
import { boardFromRows } from './legacy'
import { boardFit, composeAreaH } from './sizing'

/** 표지와 단락 장은 색 면과 자리가 정해진 장이라 부품 장으로 바꾸지 않는다 */
export const canCompose = (layout: LayoutId) => layout !== 'cover' && layout !== 'section' && layout !== 'compose'

const pick = (fields: Record<string, string>, keys: string[]) => Object.fromEntries(keys.filter((k) => fields[k]?.trim()).map((k) => [k, fields[k]]))
const newBlock = (type: BlockType, fields: Record<string, string> = {}, items: Item[] = [], extra: Partial<Block> = {}): Block => ({ id: uid(), type, fields, items, ...extra })
/** 부품을 늘어놓을 줄 하나 (판으로 바꾸기 전의 짜임: 줄마다 나란히. boardFromRows가 판으로 바꾼다) */
type Row = { id: string; blocks: Block[] }
const newRow = (...blocks: (Block | null)[]): Row => ({ id: uid(), blocks: blocks.filter((b): b is Block => !!b) })

/** 글이 하나라도 있는 항목 (항목의 모든 글 칸. 지금 레이아웃이 그리지 않는 칸도 사람이 적은 글이다) */
const written = (it: Item) => (['title', 'body', 'value', 'meta', 'image'] as const).some((k) => it[k]?.trim())

/**
 * 지금 장을 같은 내용의 부품 장으로. 사람이 적은 글은 하나도 버리지 않는다: 제목, 부제, 출처는 장의 머리로,
 * 나머지 칸과 항목은 부품으로 옮긴다. 대부분은 같은 레이아웃의 부품 하나가 되어 모습도 그대로다.
 * 부품으로 옮기지 않은 칸과 항목(레이아웃을 바꾸며 가려 둔 것)은 장에 그대로 가려 둔다: 핵심 한 줄, 이미지와 설명처럼
 * 쓰는 칸만 옮기는 장이 가려 둔 글을 버려서, 요약에서 핵심 한 줄로 바꾼 장을 부품 장으로 바꾸면 요약의 항목이 사라졌다
 */
export function composeFrom(slide: Slide): Slide {
  if (!canCompose(slide.layout)) return slide
  const f = slide.fields
  const hintsOf = (keep: (k: string) => boolean) => Object.fromEntries(Object.entries(slide.hints).filter(([k]) => keep(k)))
  const headHints = hintsOf((k) => HEAD_KEYS.includes(k))
  let fields: Record<string, string>
  let rows: Row[]
  /** 머리나 부품으로 옮긴 칸 */
  let used: string[]
  /** 항목을 부품으로 옮겼는지 */
  let moved = true
  switch (slide.layout) {
    case 'statement':
      // 한 문장은 장의 제목, 근거는 부제로 둔다. 핵심 한 줄 부품으로 옮기던 때는 컴포넌트를 끌어 넣으면(장이 바뀐다)
      // 빈 제목 칸이 위에 남고 그 아래에 그 문장이 작게 서서, 같은 말을 두 번 쓰는 장처럼 보였다
      fields = pick(f, ['title', 'lead'])
      rows = []
      used = ['title', 'lead']
      moved = false
      break
    case 'imageText': {
      fields = pick(f, ['title'])
      const img = newBlock('image', pick(f, ['image']), [], slide.options.contain ? { variant: 'contain' } : {})
      const txt = newBlock('text', pick(f, ['body']))
      rows = [slide.options.flip ? newRow(txt, img) : newRow(img, txt)]
      used = ['title', 'image', 'body']
      moved = false
      break
    }
    case 'case': {
      fields = pick(f, ['title'])
      const text = newBlock('text', { ...(f.client ? { label: f.client } : {}), ...pick(f, ['body']) })
      const image = f.image ? newBlock('image', { image: f.image }, [], { variant: 'contain' }) : null
      const numbers = slide.items.length ? newBlock('kpi', {}, slide.items, { variant: 'cards' }) : null
      const quote = f.quote?.trim() ? newBlock('quote', { quote: f.quote }) : null
      rows = [newRow(text, image), newRow(numbers, quote)].filter((r) => r.blocks.length > 0)
      used = ['title', 'client', 'body', 'image', 'quote']
      break
    }
    case 'closing':
      fields = pick(f, ['title'])
      rows = slide.items.length ? [newRow(newBlock('bullets', {}, slide.items))] : []
      used = ['title']
      break
    default: {
      fields = pick(f, HEAD_KEYS)
      const rest = Object.fromEntries(Object.entries(f).filter(([k]) => !HEAD_KEYS.includes(k)))
      const hints = hintsOf((k) => !HEAD_KEYS.includes(k))
      rows = [
        newRow(
          newBlock(slide.layout as LayoutBlockType, rest, slide.items, {
            ...(slide.variant ? { variant: slide.variant } : {}),
            ...(slide.options.highlight !== undefined ? { highlight: slide.options.highlight } : {}),
            ...(Object.keys(hints).length ? { hints } : {}),
          }),
        ),
      ]
      used = Object.keys(f)
    }
  }
  // 옮기지 않은 칸: 머리 칸(부제, 출처)은 부품 장의 머리에 보이고, 나머지는 장에 가려 둔다
  const left = Object.fromEntries(Object.entries(f).filter(([k, v]) => !used.includes(k) && v?.trim()))
  fields = { ...left, ...fields }
  const items = !moved && slide.items.some(written) ? slide.items : []
  // 장마다 고른 것 가운데 부품 장에도 있는 것(바탕, 움직임, 화면 전환, 머리와 아래 표시 감추기)은 그대로 둔다
  const { tone, motion, scene, transition, hideHead, hideFoot } = slide.options
  const options = {
    ...(tone ? { tone } : {}),
    ...(motion ? { motion } : {}),
    ...(transition ? { transition } : {}),
    ...(hideHead ? { hideHead } : {}),
    ...(hideFoot ? { hideFoot } : {}),
  }
  // 줄을 판으로: 바뀐 장의 제목과 부제로 본문 높이를 어림해 부품마다 잘리지 않는 크기로 나눈다
  const blocks = boardFromRows(rows, boardFit(composeAreaH({ fields, hints: headHints, options }, undefined, true)))
  // 고른 장면은 바뀐 부품 장에도 맞으면 남긴다 (핵심 숫자를 부품 장으로 바꿔도 숫자 부품이 있으니 '숫자가 말한다'가 그대로 맞는다)
  const keepScene = scene && sceneFits({ layout: 'compose', blocks }, scene) ? { scene } : {}
  return {
    ...slide,
    layout: 'compose',
    fields,
    items,
    hints: headHints,
    variant: undefined,
    options: { ...options, ...keepScene },
    blocks,
  }
}

/**
 * 장을 부품 장으로 바꾼다. 편집기(레이아웃 바꾸기, 부품 장으로 바꾸기, 부품 끌어 넣기)와 AI 제안(set_layout)이 모두 이것을 쓴다.
 * 예전에 부품 장이었던 장은 다른 레이아웃으로 바꿔도 판을 장에 남겨 두는데, 따로 composeFrom을 부르던 곳은 그 판을 새 판으로
 * 덮어써서 그 안의 글이 지워졌다. 남겨 둔 판이 있으면 그 판을 다시 보여 주고(지금 레이아웃의 글은 장에 그대로 남는다),
 * 표지와 단락 장은 빈 부품 장으로, 나머지는 지금 내용을 부품으로 옮긴다
 */
export function asCompose(slide: Slide): Slide {
  if (slide.layout === 'compose') return slide
  if (slide.blocks?.length || !canCompose(slide.layout)) return { ...slide, layout: 'compose', blocks: slide.blocks ?? [], variant: undefined }
  return composeFrom(slide)
}

/**
 * 레이아웃 부품 하나뿐인 부품 장을 그 레이아웃의 장으로 되돌린다. 그럴 수 없으면 null.
 * 장에 가려 둔 칸이나 항목(부품 장이 되기 전 레이아웃의 글)이 있으면 되돌리지 않는다: 부품의 칸과 항목이 그 자리를 덮어
 * 가려 둔 글이 사라졌다(목록 → 부품 장 → 표를 채움 → 부품 장 → 목록이면 표에 적은 글이 지워졌다). 그때 편집기는 레이아웃만 바꾼다
 */
export function unwrapCompose(slide: Slide, layout: LayoutId): Slide | null {
  const blocks = slide.blocks ?? []
  if (slide.layout !== 'compose' || blocks.length !== 1 || blocks[0].type !== layout) return null
  const b = blocks[0]
  const head = pick(slide.fields, HEAD_KEYS)
  const hidden = Object.entries(slide.fields).some(([k, v]) => v?.trim() && !(k in head)) || slide.items.some(written)
  // 부품에 같은 이름의 머리 칸이 있어도 장의 머리를 덮는다 (가져온 파일)
  const clash = Object.keys(head).some((k) => b.fields[k]?.trim() && b.fields[k] !== head[k])
  if (hidden || clash) return null
  return {
    ...slide,
    layout,
    fields: { ...head, ...b.fields },
    items: b.items,
    hints: { ...slide.hints, ...b.hints },
    variant: b.variant,
    options: { ...slide.options, ...(b.highlight !== undefined ? { highlight: b.highlight } : {}) },
    blocks: undefined,
  }
}

/**
 * 편집기의 '레이아웃 바꾸기'로 바꾼 장. 부품 장으로는 내용을 부품으로 옮기고(예전에 부품 장이었던 장은 남겨 둔 부품을 다시 보여 준다),
 * 레이아웃 부품 하나뿐인 부품 장은 그 레이아웃으로 되돌리고, 그 밖에는 글을 그대로 두고 모양만 바꾼다
 */
export function withLayout(slide: Slide, layout: LayoutId): Slide {
  if (layout === 'compose') return asCompose(slide)
  return unwrapCompose(slide, layout) ?? relayout(slide, layout)
}

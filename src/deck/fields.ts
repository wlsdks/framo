import { asksDecision } from './blueprints'
import { allBlocks, blockMissing, blockNames, BLOCKS } from './blocks'
import { LAYOUTS } from './layouts'
import type { Deck, DeckMeta, Item, ItemKey, MetaKey, Slide } from './types'

export function isMetaKey(key: string): boolean {
  return key.startsWith('$')
}

export function readField(slide: Slide, meta: DeckMeta, key: string): string {
  if (isMetaKey(key)) return meta[key.slice(1) as MetaKey] ?? ''
  return slide.fields[key] ?? ''
}

/** 레이아웃이 보여주는 항목만. 최대 개수를 넘는 항목은 지우지 않고 숨긴다. */
export function visibleItems(slide: Slide) {
  const max = LAYOUTS[slide.layout].items?.max ?? 0
  return slide.items.slice(0, max)
}

const ITEM_TEXT: ItemKey[] = ['title', 'body', 'value', 'meta', 'image']

/** 칸을 하나도 채우지 않은 항목 (발표 화면에서 빼는 항목, presentable) */
export function isBlankItem(it: Item): boolean {
  return !ITEM_TEXT.some((k) => it[k].trim())
}

/**
 * 발표 화면에 그릴 장: 칸을 하나도 채우지 않은 항목은 뺀다(레이아웃의 가장 적은 수까지만).
 * '빈칸이 남았어요'에서 그대로 발표하면 빈 요청이 번호 '3'과 줄 선만 남거나, 빈 숫자 칸이 장 한쪽을 비웠다.
 * 숨긴 항목(최대 수 너머)은 앞의 빈 항목이 빠져도 끌려 올라오지 않게 함께 뺀다. 강조는 같은 항목을 따라가고,
 * 빈 항목을 강조했으면 강조하지 않는다. 뺄 것이 없으면 받은 장 그대로(같은 객체).
 * 부품은 부품의 가짜 장(blockSlide)에 부품의 항목 수 규칙(spec)을 넘겨 같이 쓴다
 */
export function presentable(slide: Slide, spec = LAYOUTS[slide.layout].items): Slide {
  if (!spec) return slide
  const shown = slide.items.slice(0, spec.max)
  const keep = shown.map((it) => !isBlankItem(it))
  let n = keep.filter(Boolean).length
  // 가장 적은 수보다 줄면 뒤에서부터 빈 항목을 되살린다
  for (let i = shown.length - 1; i >= 0 && n < spec.min; i--) {
    if (!keep[i]) {
      keep[i] = true
      n++
    }
  }
  if (n === slide.items.length) return slide
  const items = shown.filter((_, i) => keep[i])
  const hl = slide.options.highlight
  const highlight = hl === undefined || hl < 0 ? hl : keep[hl] ? keep.slice(0, hl).filter(Boolean).length : -1
  return { ...slide, items, options: hl === undefined ? slide.options : { ...slide.options, highlight } }
}

/** from째 항목을 to째 자리로 옮긴 목록 (사이의 항목은 한 칸씩 밀린다) */
export function moveIn<T>(list: readonly T[], from: number, to: number): T[] {
  const out = [...list]
  if (from === to || from < 0 || from >= out.length) return out
  const [it] = out.splice(from, 1)
  out.splice(Math.max(0, Math.min(to, out.length)), 0, it)
  return out
}

/**
 * 항목을 옮긴 뒤 강조한 항목의 자리. 사람이 고른 강조(값이 있을 때)는 그 항목을 따라간다.
 * 고르지 않은 강조(없음)는 '마지막 점'처럼 자리로 정한 것이라 그대로 둔다
 */
export function followIndex(index: number | undefined, from: number, to: number): number | undefined {
  if (index === undefined || index < 0) return index
  if (index === from) return to
  if (from < index && to >= index) return index - 1
  if (from > index && to <= index) return index + 1
  return index
}

/**
 * 항목 하나를 뺀 뒤 강조한 항목의 자리. 사람이 고른 강조는 그 항목을 따라 당겨지고, 강조한 항목을 빼면 강조도 없앤다(-1).
 * 그대로 두면 뺀 자리로 올라온 다음 항목이 강조되었다. 고르지 않은 강조(없음)는 자리로 정한 것이라 그대로 둔다(followIndex와 같다)
 */
export function dropIndex(index: number | undefined, removed: number): number | undefined {
  if (index === undefined || index < 0) return index
  if (index === removed) return -1
  return index > removed ? index - 1 : index
}

export interface Missing {
  key: string
  item?: number
  itemKey?: ItemKey
  label: string
  /** 부품 장의 부품 안 칸이면 그 부품 id */
  block?: string
}

/** 표시하지 않는 머리와 아래 띠는 빈칸으로 세거나 발표 파일에 넣지 않는다. */
function hiddenField(slide: Slide, key: string): boolean {
  return (slide.options.hideHead === true && (key === 'title' || key === 'lead')) || (slide.options.hideFoot === true && key === 'source')
}

export function missingFields(slide: Slide, meta: DeckMeta): Missing[] {
  const spec = LAYOUTS[slide.layout]
  const out: Missing[] = []
  for (const f of spec.fields) {
    if (f.optional || hiddenField(slide, f.key)) continue
    if (!readField(slide, meta, f.key).trim()) out.push({ key: f.key, label: f.label })
  }
  if (slide.layout === 'compose') {
    const names = blockNames(slide.blocks ?? [])
    for (const b of allBlocks(slide.blocks ?? [])) for (const m of blockMissing(b, names.get(b.id))) out.push(m.item !== undefined ? { ...m, itemKey: m.key as ItemKey } : m)
  }
  if (spec.items) {
    visibleItems(slide).forEach((item, i) => {
      for (const f of spec.items!.fields) {
        if (f.optional) continue
        if (!item[f.key].trim()) {
          out.push({ key: f.key, item: i, itemKey: f.key, label: `${spec.items!.label} ${i + 1}의 ${f.label}` })
        }
      }
    })
  }
  return out
}

/**
 * 비워 둬도 되는 칸 가운데 비어 있는 것 (장의 칸만. 부제, 발표자, 소속, 로고, 출처 같은).
 * 빈칸(missingFields)으로 세지 않아서 표지에 부제와 발표자가 비어도 '빈칸을 모두 채웠어요'라고 했는데,
 * 그 말만으로는 일부러 세지 않은 것인지 몰랐다. 따로 보여 주려고 꺼낸다.
 * 비워 두면 정해진 이름으로 보이는 칸(named)과, 이 발표에서 그리지 않는 칸(결정을 받지 않는 발표의 결정 요청)은 뺀다
 */
export function optionalBlanks(slide: Slide, meta: DeckMeta): Missing[] {
  return LAYOUTS[slide.layout].fields
    .filter((f) => f.optional && !f.named && !hiddenField(slide, f.key) && !readField(slide, meta, f.key).trim())
    .filter((f) => !(slide.layout === 'cover' && f.key === 'ask' && !asksDecision(meta.type)))
    .map((f) => ({ key: f.key, label: f.label }))
}

/** 발표에 들어가는 장(숨긴 장은 빼고)마다 남은 빈칸. 빈칸이 없는 장은 없다. 편집기의 빈칸 세기는 모두 이것(missingFields)을 쓴다 */
export function deckBlanks(deck: Deck): { slide: Slide; missing: Missing[] }[] {
  return deck.slides.filter((s) => !s.hidden).flatMap((slide) => {
    const missing = missingFields(slide, deck.meta)
    return missing.length ? [{ slide, missing }] : []
  })
}

type CellSpec ={ fields: { key: string }[]; items?: { max: number; fields: { key: ItemKey }[] } }
type Cells = { fields: Record<string, string>; items: Item[] }

/** 칸 정의가 그리는 칸만 남긴 것: 정의에 없는 칸, 정의에 없는 항목의 칸, 최대 수 너머의 항목을 뺀다 */
function within<T extends Cells>(x: T, spec: CellSpec): T {
  const keys = new Set(spec.fields.map((f) => f.key))
  const parts = new Set(spec.items?.fields.map((f) => f.key))
  const fields = Object.fromEntries(Object.entries(x.fields).filter(([key]) => isMetaKey(key) || keys.has(key)))
  const items = x.items.slice(0, spec.items?.max ?? 0).map((item) => ({ ...item, ...Object.fromEntries(ITEM_TEXT.filter((key) => !parts.has(key)).map((key) => [key, ''])) }))
  return { ...x, fields, items }
}

/**
 * 장에 그려지는 칸만 남긴 장. 부품 장이면 부품마다 그 부품이 그리는 칸만, 부품 장이 아니면 남겨 둔 부품은 뺀다.
 * 다른 사람에게 보내는 HTML 파일에 넣을 장(exportHtml.tsx의 deckData)
 */
export function shownOnly(slide: Slide): Slide {
  const shown = within(slide, LAYOUTS[slide.layout])
  const fields = Object.fromEntries(Object.entries(shown.fields).filter(([key]) => !hiddenField(slide, key)))
  return { ...shown, fields, blocks: slide.layout === 'compose' ? slide.blocks?.map((b) => within(b, BLOCKS[b.type])) : undefined }
}

/**
 * 장에 보이는 글의 글자 수(빈칸 빼고). 레이아웃이나 부품이 그리는 칸과 항목만 세고, 이미지와 가려 둔 칸은 세지 않는다.
 * 영상으로 저장할 때 장을 읽을 만큼 머무는 시간을 이것으로 정한다(present/pace.ts)
 */
export function shownChars(slide: Slide, meta: DeckMeta): number {
  const shown = shownOnly(slide)
  const count = (s: string) => s.replace(/\s+/g, '').length
  const cells = (specs: { key: string; image?: boolean }[], fields: Record<string, string>, items: Item[]) =>
    specs.reduce((n, f) => n + (f.image ? 0 : count(isMetaKey(f.key) ? (meta[f.key.slice(1) as MetaKey] ?? '') : (fields[f.key] ?? ''))), 0) +
    items.reduce((n, it) => n + ITEM_TEXT.reduce((m, key) => m + (key === 'image' ? 0 : count(it[key])), 0), 0)
  return (
    cells(LAYOUTS[slide.layout].fields, shown.fields, shown.items) +
    (shown.blocks ?? []).reduce((n, b) => n + cells(BLOCKS[b.type].fields, b.fields, b.items), 0)
  )
}

const META_KEYS: MetaKey[] = ['org', 'presenter', 'date', 'contact', 'logo']

/**
 * 받은 장들에 그려지는 발표 전체의 값($org 같은 칸)만 남긴 값. 고르는 값(종류, 듣는 사람, 시간, 방식)은 그대로 둔다.
 * 연락처와 로고는 표지와 마지막 장에만 나와서, 그 장을 숨기거나 빼고 보낸 HTML 파일에서는 보이지 않는데도 소스에는 들어 있었다
 */
export function shownMeta(meta: DeckMeta, slides: readonly Slide[]): DeckMeta {
  const shown = new Set<string>()
  const add = (spec: { fields: { key: string }[] }) => spec.fields.forEach((f) => isMetaKey(f.key) && shown.add(f.key.slice(1)))
  for (const s of slides) {
    add(LAYOUTS[s.layout])
    if (s.layout === 'compose') allBlocks(s.blocks ?? []).forEach((b) => add(BLOCKS[b.type]))
  }
  return { ...meta, ...Object.fromEntries(META_KEYS.filter((key) => !shown.has(key)).map((key) => [key, ''])) }
}

/** 채운 칸의 수 (발표 전체의 값은 빼고, 부품 안의 칸까지) */
function filledCount(slide: Slide): number {
  const count = (x: Cells) =>
    Object.entries(x.fields).filter(([key, v]) => !isMetaKey(key) && v?.trim()).length + x.items.reduce((n, item) => n + ITEM_TEXT.filter((key) => item[key]?.trim()).length, 0)
  return count(slide) + (slide.blocks ?? []).reduce((n, b) => n + count(b), 0)
}

/**
 * 채워 두었지만 지금 레이아웃이 보여 주지 않는 칸의 수. 레이아웃을 바꿔도 글과 그림은 지우지 않고 남겨 두는데
 * (edits.ts의 relayout, 부품 장이었던 장의 남겨 둔 부품), 새 레이아웃에 그 칸이 없으면 장에서 말없이 사라져 지운 것처럼 보였다
 */
export function unshownCount(slide: Slide): number {
  return filledCount(slide) - filledCount(shownOnly(slide))
}

export interface PageInfo {
  /** 숨긴 장을 뺀 쪽 번호 (1부터). 숨긴 장은 없다. */
  page: Map<string, number>
  total: number
  /** 발표의 큰 단락 이름. 섹션 구분 장이 있으면 그 제목들, 없으면 장마다 적힌 단락 이름 */
  sections: string[]
  /** 장마다 속한 단락 순번 (0부터). 첫 단락 앞의 표지, 목차 같은 장은 없다. */
  sectionOf: Map<string, number>
}

export function pageInfo(slides: Slide[]): PageInfo {
  const visible = slides.filter((s) => !s.hidden)
  const page = new Map<string, number>()
  visible.forEach((s, i) => page.set(s.id, i + 1))

  const sections: string[] = []
  const sectionOf = new Map<string, number>()
  if (visible.some((s) => s.layout === 'section')) {
    // 섹션 구분 장부터 다음 구분 장 전까지가 한 단락이다.
    for (const s of visible) {
      if (s.layout === 'section') sections.push(s.fields.title?.trim() || s.section || `섹션 ${sections.length + 1}`)
      if (sections.length) sectionOf.set(s.id, sections.length - 1)
    }
  } else {
    for (const s of visible) {
      const name = s.section.trim()
      if (!name) continue
      let i = sections.indexOf(name)
      if (i < 0) i = sections.push(name) - 1
      sectionOf.set(s.id, i)
    }
  }
  return { page, total: visible.length, sections, sectionOf }
}

import { asksDecision } from './blueprints'
import { allBlocks, blockMissing, blockNames, BLOCKS, HEAD_KEYS } from './blocks'
import { LAYOUTS } from './layouts'
import type { Block, Deck, DeckMeta, Item, ItemKey, LayoutId, MetaKey, Slide } from './types'

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
  /** 비지 않고 예시 글이 그대로인 칸(blockMissing). 빈칸과 달리 발표에 그대로 나온다 */
  example?: true
}

/** 표시하지 않는 머리와 아래 띠는 빈칸으로 세거나 발표 파일에 넣지 않는다. */
function hiddenField(slide: Slide, key: string): boolean {
  return (slide.options.hideHead === true && (key === 'title' || key === 'lead')) || (slide.options.hideFoot === true && key === 'source')
}

/**
 * 비워 둬도 되는 칸인지. 컴포넌트 장의 제목은 비워 둬도 되지만(컴포넌트가 제 소제목을 갖는 장도 있다), 프레임 잡기가 그 장의 말을 제목 안내로
 * 정해 준 장(원인, 바뀌는 모습, 기대 효과 …)은 레이아웃 장처럼 채울 칸이다. 비워 둬도 되는 칸으로 두던 때는 컴포넌트만 채우면
 * '꼭 채울 칸은 모두 채웠어요'가 떴는데, 편집 화면에 흐리게 보이던 제목 안내가 발표에서는 사라져 장의 결론 한 줄이 없었다
 */
function optionalHere(slide: Slide, f: { key: string; optional?: boolean }): boolean {
  if (slide.layout === 'compose' && f.key === 'title' && slide.hints?.title?.trim()) return false
  return !!f.optional
}

/**
 * 장의 칸(key)을 비워 둬도 되는 칸으로 그리는지(편집 화면의 옅은 안내). 빈칸을 세는 규칙(optionalHere)과 같게: 프레임 잡기가 제목 안내를
 * 정해 준 컴포넌트 장의 제목은 채울 칸이라 옅게 그리지 않는다. 비워 두면 정해진 이름으로 보이는 칸(named)은 이름이 글처럼 보여야 해서 옅게 하지 않는다
 */
export function looksOptional(slide: Slide, key: string): boolean {
  const f = LAYOUTS[slide.layout].fields.find((x) => x.key === key)
  return !!f && optionalHere(slide, f) && !f.named
}

export function missingFields(slide: Slide, meta: DeckMeta): Missing[] {
  const spec = LAYOUTS[slide.layout]
  const out: Missing[] = []
  for (const f of spec.fields) {
    if (optionalHere(slide, f) || hiddenField(slide, f.key)) continue
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
    .filter((f) => optionalHere(slide, f) && !f.named && !hiddenField(slide, f.key) && !readField(slide, meta, f.key).trim())
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

/**
 * 내용을 받치는 틀의 글: 단위, 목표선, 표의 열 이름, 비교의 양쪽 이름, 축 이름(과 비워 두면 정해진 이름이 보이는 칸, named).
 * 이것만 채운 장은 듣는 분께 빈 틀로 보인다. 여기에 없는 칸은 내용으로 친다: 칸을 새로 더해도 빈 슬라이드로 잘못 세지 않게
 */
const FRAME_KEYS = new Set(['unit', 'target', 'h1', 'h2', 'h3', 'h4', 'leftTitle', 'rightTitle', 'xAxis', 'yAxis'])

/** 제목 한 줄이 곧 그 장의 말인 장: 표지, 섹션 구분, 메시지. 제목만 있어도 빈 장이 아니다 */
const HEAD_IS_BODY: readonly LayoutId[] = ['cover', 'section', 'statement']

/** 칸 정의(레이아웃이나 부품)가 그리는 칸 가운데 채운 것이 있는지. counts는 내용으로 칠 장의 칸 */
function anyShown(spec: CellSpec, x: Cells, counts: (key: string) => boolean): boolean {
  if (spec.fields.some((f) => counts(f.key) && x.fields[f.key]?.trim())) return true
  return x.items.slice(0, spec.items?.max ?? 0).some((it) => spec.items!.fields.some((f) => it[f.key]?.trim()))
}

/** 부품이 장에 무언가를 그리는지: 채운 칸이 있거나, 꼭 채울 칸이 없는 부품(모션 그래픽처럼 글 없이도 그림이 서는 것) */
function blockShows(b: Block): boolean {
  return anyShown(BLOCKS[b.type], b, (key) => !isMetaKey(key)) || !blockMissing(b).length
}

/**
 * 꼭 채울 칸이 남았는데 머리(제목, 부제, 출처)와 틀의 글 말고는 보일 것이 없는 장. 그대로 발표하면 듣는 분께 제목 한 줄만 뜬다:
 * 주간 보고의 마지막 장 '도움이 필요한 것'의 요청을 비운 채 발표하면 빈 요청 줄은 빠지고(presentable) 제목과 발표자 이름만 남았다.
 * 발표하기와 내보내기 전에 이번에만 빼고 가자고 권한다(CheckDialog, leaveOut). 꼭 채울 칸이 없는 장은 그 모습이 뜻한 것이라
 * (요청 없이 인사만 하는 마지막 장, 제목만 둔 컴포넌트 장) 세지 않는다. 표지, 섹션 구분, 메시지는 제목이 곧 내용이라 제목까지 비었을 때만 센다.
 * 발표 전체의 값(발표자, 연락처 같은)은 여러 장에 되풀이되는 것이라 내용으로 치지 않는다
 */
export function bareSlide(slide: Slide, meta: DeckMeta): boolean {
  if (!missingFields(slide, meta).length) return false
  const own = HEAD_IS_BODY.includes(slide.layout)
  const spec = LAYOUTS[slide.layout]
  const named = new Set(spec.fields.filter((f) => f.named).map((f) => f.key))
  const counts = (key: string) =>
    !isMetaKey(key) && !named.has(key) && !hiddenField(slide, key) && (own || !(HEAD_KEYS.includes(key) || FRAME_KEYS.has(key)))
  if (anyShown(spec, slide, counts)) return false
  return !(slide.layout === 'compose' && allBlocks(slide.blocks ?? []).some(blockShows))
}

/** 이번에만 빼고 가자고 권할 빈 장(bareSlide)의 id, 발표하는 차례대로. 빼면 발표할 장이 하나도 남지 않으면 권하지 않는다(빈 목록) */
export function bareSlides(deck: Deck): string[] {
  const shown = deck.slides.filter((s) => !s.hidden)
  const bare = shown.filter((s) => bareSlide(s, deck.meta)).map((s) => s.id)
  return bare.length < shown.length ? bare : []
}

/** 빈 장(bareSlide)이 발표에서 무엇으로 보이는지: 제목 한 줄만 남는지, 아무것도 없는지 */
export function bareShows(slide: Slide): 'title' | 'nothing' {
  return !HEAD_IS_BODY.includes(slide.layout) && !hiddenField(slide, 'title') && slide.fields.title?.trim() ? 'title' : 'nothing'
}

/**
 * 이번 발표(내보내기)에서만 뺀 장을 발표에서 숨긴 사본. 발표 화면, 발표자 화면(발표 화면이 이 사본을 보낸다), 발표 파일, PDF, PPT, 영상이
 * 숨긴 장을 건너뛰는 길(hidden)을 그대로 탄다. 쪽 번호도 뺀 장 없이 다시 매겨져 듣는 분과 발표자가 같은 번호를 본다.
 * 고치는 발표(저장되는 것)에는 쓰지 않는다: 지우지도, '발표에서 숨기기'를 켜지도 않아 다음 발표에서는 다시 묻는다
 */
export function leaveOut(deck: Deck, ids: readonly string[]): Deck {
  if (!ids.length) return deck
  const out = new Set(ids)
  return { ...deck, slides: deck.slides.map((s) => (out.has(s.id) && !s.hidden ? { ...s, hidden: true } : s)) }
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

/** 받은 장들에 그려지는 발표 전체의 값($org 같은 칸)의 이름 */
function metaShownIn(slides: readonly Slide[]): Set<string> {
  const shown = new Set<string>()
  const add = (spec: { fields: { key: string }[] }) => spec.fields.forEach((f) => isMetaKey(f.key) && shown.add(f.key.slice(1)))
  for (const s of slides) {
    add(LAYOUTS[s.layout])
    if (s.layout === 'compose') allBlocks(s.blocks ?? []).forEach((b) => add(BLOCKS[b.type]))
  }
  return shown
}

/**
 * 다른 사람에게 보내는 발표 파일(HTML)에 담는 발표. 듣는 분께 보이지 않는 것은 뺀다: 발표자 노트, 숨긴 장, 레이아웃을 바꿔 가려진 칸(shownOnly),
 * 보내는 장에 나오지 않는 발표 전체의 값. 고르는 값(종류, 듣는 사람, 시간, 방식)은 그대로 둔다. 연락처와 로고는 표지와 마지막 장에만 나와서,
 * 그 장을 숨기거나 빼고 보낸 HTML 파일에서는 보이지 않는데도 소스에는 들어 있었다. 뺀 것은 이 PC의 같은 발표에서 되찾는다(withUnsent)
 */
export function sendable(deck: Deck): Deck {
  const slides = deck.slides.filter((s) => !s.hidden)
  const shown = metaShownIn(slides)
  const meta = { ...deck.meta, ...Object.fromEntries(META_KEYS.filter((key) => !shown.has(key)).map((key) => [key, ''])) }
  return { ...deck, meta, slides: slides.map((s) => ({ ...shownOnly(s), notes: '' })) }
}

/**
 * 발표 파일(HTML)로 연 발표(sent)에, 그 파일이 담지 않는 것(sendable이 뺀 것)을 이 PC의 같은 발표(full)에서 되찾아 넣는다: 같은 장의 발표자
 * 노트와 가려진 칸, 숨긴 장과 이번에만 빼고 내보낸 빈 장(있던 자리에), 보내는 장에 나오지 않는 발표 전체의 값. 발표 파일의 빈 노트는
 * 지운 것이 아니라 담기지 않은 것이다. 이것 없이 같은 발표를 발표 파일 내용으로 바꾸면 노트와 숨긴 장이 사라진 것으로 보였다(바뀌기 전 모습은
 * 버전 기록에만 있었다). 빼고 내보낸 빈 장(leaveOut)은 이 PC의 발표에서 숨긴 장이 아니지만, 내보낸 뒤 고치지 않았으면 지금도 빈 장(bareSlide)이다.
 * 파일에 담긴 것(보이는 글, 차례, 고른 값)은 파일 그대로 둔다. 이 PC의 발표를 내보낸 파일을 그대로 열면 이 PC의 발표와 똑같다
 */
export function withUnsent(sent: Deck, full: Deck): Deck {
  const was = new Map(full.slides.map((s) => [s.id, s]))
  const slides = sent.slides.map((s) => {
    const f = was.get(s.id)
    return f ? withUnsentSlide(s, f) : s
  })
  // 숨긴 장과 빼고 내보낸 빈 장은 이 PC의 발표에서 바로 앞에 있던 장 뒤에 (앞에 있던 장이 파일에 없으면 그 앞 장, 하나도 없으면 맨 앞에)
  const ids = new Set(slides.map((s) => s.id))
  full.slides.forEach((s, i) => {
    if (ids.has(s.id) || !(s.hidden || bareSlide(s, full.meta))) return
    let at = 0
    for (let j = i - 1; j >= 0 && !at; j--) at = slides.findIndex((x) => x.id === full.slides[j].id) + 1
    slides.splice(at, 0, s)
    ids.add(s.id)
  })
  const shown = metaShownIn(sent.slides)
  const meta = { ...sent.meta, ...Object.fromEntries(META_KEYS.filter((key) => !shown.has(key) && !sent.meta[key]).map((key) => [key, full.meta[key]])) }
  return { ...sent, meta, slides }
}

/** 같은 장: 노트, 가려진 칸, 부품 장이 아닌 장에 남겨 둔 부품, 부품마다 가려진 칸 */
function withUnsentSlide(s: Slide, f: Slide): Slide {
  const cells = withHiddenCells(s, f, LAYOUTS[s.layout], (key) => hiddenField(s, key))
  const was = new Map((f.blocks ?? []).map((b) => [b.id, b]))
  const blocks =
    s.layout === 'compose'
      ? s.blocks?.map((b) => {
          const from = was.get(b.id)
          return from ? inOrderOf(from, withHiddenCells(b, from, BLOCKS[b.type])) : b
        })
      : f.blocks
  return inOrderOf(f, { ...cells, notes: s.notes || f.notes, blocks })
}

/**
 * within이(와 숨긴 머리와 아래 띠가) 뺀 것을 full에서 되찾는다: 정의에 없는 칸, 같은 항목의 정의에 없는 칸, 최대 수 너머의 항목.
 * 최대 수 너머의 항목은 최대 수까지 찬 장에만 붙인다: 덜 찬 장에 붙이면 숨어 있던 항목이 장에 나온다
 */
function withHiddenCells<T extends Cells>(sent: T, full: Cells, spec: CellSpec, hidden: (key: string) => boolean = () => false): T {
  const keys = new Set(spec.fields.map((f) => f.key))
  const parts = new Set(spec.items?.fields.map((f) => f.key))
  const fields: Record<string, string> = {}
  for (const [key, v] of Object.entries(full.fields)) if (!(key in sent.fields) && ((!isMetaKey(key) && !keys.has(key)) || hidden(key))) fields[key] = v
  const gone = ITEM_TEXT.filter((key) => !parts.has(key))
  const was = new Map(full.items.map((it) => [it.id, it]))
  const items = sent.items.map((it) => {
    const f = was.get(it.id)
    return f && gone.length ? { ...it, ...Object.fromEntries(gone.map((key) => [key, it[key] || f[key]])) } : it
  })
  const max = spec.items?.max ?? 0
  const ids = new Set(sent.items.map((it) => it.id))
  const rest = sent.items.length >= max ? full.items.slice(max).filter((it) => !ids.has(it.id)) : []
  return { ...sent, fields: inOrderOf(full.fields, { ...fields, ...sent.fields }), items: [...items, ...rest] }
}

/** model의 키 차례대로 value의 키를 늘어놓는다(model에 없는 키는 뒤에). 되찾은 발표가 이 PC의 발표와 차례까지 같은 꼴이 되게(같은 발표로 알아보는 비교 값이 같게) */
function inOrderOf<T extends object>(model: object, value: T): T {
  const v = value as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(model)) if (key in v) out[key] = v[key]
  for (const key of Object.keys(v)) if (!(key in out)) out[key] = v[key]
  return out as T
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
  /**
   * 발표하는 차례의 장(숨긴 장 빼고)과 장 넘기기를 고르는 발표 전체의 값. 이어 움직이기로 넘어가는 이웃 장끼리 차트의 잣대를 같이
   * 쓸지 정할 때 쓴다(slides/sharedScale.ts). look이 없으면 장마다 고른 장 넘기기만 본다
   */
  visible: Slide[]
  look?: Pick<Deck, 'theme' | 'motion'>
}

export function pageInfo(slides: Slide[], look?: Pick<Deck, 'theme' | 'motion'>): PageInfo {
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
  return { page, total: visible.length, sections, sectionOf, visible, look }
}

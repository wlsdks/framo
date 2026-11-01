import { create } from 'zustand'
import { asCompose, cleanDeckBlocks, copyBlocks, mapBlock, settleDeck, tidyLinks, withLayout } from '../deck/blocks'
import { unknownParts } from '../deck/compat'
import { withOneMore } from '../deck/edits'
import { makeSlide, uid } from '../deck/generate'
import { dropIndex, followIndex, isMetaKey, moveIn } from '../deck/fields'
import { LAYOUTS, variantOf } from '../deck/layouts'
import { migrateDeck } from '../deck/migrate'
import { GESTURE_KEY } from '../lib/pointerSession'
import type { Block, Deck, DeckTheme, ItemKey, LayoutId, MetaKey, Motion, Slide, SlideOptions, ThemeId } from '../deck/types'

const HISTORY_LIMIT = 100
/** 같은 칸을 이 시간 안에 이어서 고치면 되돌리기 한 단계로 묶는다 */
const COALESCE_MS = 1200

interface DeckState {
  deck: Deck | null
  /** 새 버전에서 만든 발표라 열지 않고 들고만 있는 것 (compat.ts). 편집기가 알림을 보인다 */
  newer: Deck | null
  selectedId: string | null
  past: Deck[]
  future: Deck[]
  lastKey: string | null
  lastTime: number

  open(deck: Deck): void
  close(): void
  select(id: string): void
  undo(): void
  redo(): void

  setTitle(title: string): void
  setMeta(key: MetaKey, value: string): void
  setTheme(id: ThemeId): void
  setAccent(accent: string | undefined): void
  setMotion(motion: Motion): void
  /** 글꼴, 글자 크기, 아래 표시, 장 넘기기 */
  setLook(patch: Partial<Pick<DeckTheme, 'font' | 'size' | 'footer' | 'transition'>>): void

  setField(slideId: string, key: string, value: string): void
  setItem(slideId: string, index: number, key: ItemKey, value: string): void
  addItem(slideId: string): void
  removeItem(slideId: string, index: number): void
  /** 항목을 바로 뒤에 하나 더 (사람이 장 위에서 고른 항목만. 칸 수가 다 찼으면 그대로) */
  duplicateItem(slideId: string, index: number): void
  /** 항목 순서 바꾸기. 고른 강조는 그 항목을 따라간다. key가 같으면 되돌리기 한 단계로 */
  moveItem(slideId: string, from: number, to: number, key?: string): void
  setNotes(slideId: string, notes: string): void
  setOptions(slideId: string, options: SlideOptions, key?: string): void
  setHidden(slideId: string, hidden: boolean): void
  changeLayout(slideId: string, layout: LayoutId): void
  setVariant(slideId: string, variant: string, key?: string): void

  /** 되돌리기 기록에 남기지 않는 설정 */
  setAiShare(on: boolean): void
  /** 덱을 통째로 바꾼다 (AI 제안 적용). 되돌리기 한 번으로 돌아온다. */
  replaceDeck(next: Deck): void

  /** 부품 장: 판을 통째로 (끌어다 놓기, 선 끌기). key가 같으면 되돌리기 한 단계로 묶는다 */
  setBlocks(slideId: string, blocks: Block[], key?: string): void
  /** 부품 장: 부품 하나를 고친다 (칸의 글, 바탕, 움직임) */
  updateBlock(slideId: string, blockId: string, fn: (b: Block) => Block, key?: string): void
  /** 이 장을 같은 내용의 부품 장으로. 이미 부품 장이거나 바꿀 수 없는 장이면 그대로 */
  toCompose(slideId: string): void
  /** 장 하나를 통째로 바꾼다 (부품 장으로 바꾸면서 부품을 넣을 때처럼 되돌리기 한 번으로 묶을 일) */
  replaceSlide(slideId: string, slide: Slide): void
  /** 부품을 넣은 부품 장을 새로 만들어 이 장 뒤에 */
  addComposeSlide(blocks: Block[], afterId?: string): void
  /** 만들어 둔 장(내 컴포넌트의 장 하나)을 이 장 뒤에 넣고 고른다 */
  insertSlide(slide: Slide, afterId?: string): void

  addSlide(layout: LayoutId, afterId?: string): void
  duplicateSlide(slideId: string): void
  removeSlide(slideId: string): void
  moveSlide(from: number, to: number): void
}

function mapSlide(deck: Deck, slideId: string, fn: (s: Slide) => Slide): Deck {
  return { ...deck, slides: deck.slides.map((s) => (s.id === slideId ? fn(s) : s)) }
}

/**
 * 같은 값인지. 값이 undefined인 칸은 없는 것으로 본다(저장하면 빠진다). trim이면 a의 글이 b의 글의 앞뒤 빈칸만 다듬은 것이어도 같다.
 * 고치지 않은 장은 같은 것을 그대로 쓰므로 대개 바로 끝난다
 */
function same(a: unknown, b: unknown, trim = false): boolean {
  if (a === b) return true
  if (trim && typeof a === 'string' && typeof b === 'string') return a === b.trim()
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false
  const x = a as Record<string, unknown>
  const y = b as Record<string, unknown>
  const kx = Object.keys(x).filter((k) => x[k] !== undefined)
  const ky = Object.keys(y).filter((k) => y[k] !== undefined)
  return kx.length === ky.length && kx.every((k) => same(x[k], y[k], trim))
}

/** 고친 때(updatedAt) 말고는 같은 발표인지 */
const sameDeck = (a: Deck, b: Deck, trim = false) => same({ ...a, updatedAt: 0 }, { ...b, updatedAt: 0 }, trim)

/** 바로 앞의 commit이 아무것도 바꾸지 않았는지 (undoLast가 본다) */
let unchanged = false
/** 기록을 바꾼 고침의 수 (undoLast가 본다: 알림을 띄운 뒤에 고친 것이 있는지) */
let edits = 0

/**
 * 되돌리거나 다시 한 뒤 고를 장. 보던 장이 바뀌었으면 그대로, 다른 장이 바뀌었거나 되살아났으면 그 장, 보던 장이 없어졌으면 그 앞 장.
 * 다른 장만 없어졌으면 없어진 자리의 앞 장, 차례만 바뀌었으면 옮겨진 장 (보던 장이 그 곁이거나 함께 옮겨졌으면 그대로).
 * 예전에는 보던 장을 그대로 두어서 다른 장을 보다가 되돌리면 무엇이 되돌려졌는지 보이지 않았고, 넣은 장을 되돌리면 맨 앞 장으로 튀었다.
 * 테마처럼 발표 전체에 걸린 것은 보던 장 그대로 (모든 부품 장이 다시 맞춰져서 장마다 바뀐 것으로 보인다)
 */
function shownAfter(from: Deck, to: Deck, selectedId: string | null): string | null {
  if (from.theme === to.theme && from.meta === to.meta) {
    const was = new Map(from.slides.map((s) => [s.id, s]))
    const changed = to.slides.filter((s) => was.get(s.id) !== s)
    if (changed.length && !changed.some((s) => s.id === selectedId)) return changed[0].id
    const sel = to.slides.findIndex((s) => s.id === selectedId)
    if (!changed.length && sel >= 0) {
      const gone = from.slides.findIndex((s) => !to.slides.some((t) => t.id === s.id))
      if (gone >= 0) return sel < gone - 1 || sel > gone ? (to.slides[Math.max(gone - 1, 0)]?.id ?? selectedId) : selectedId
      const at = new Map(from.slides.map((s, i) => [s.id, i]))
      let moved: string | null = null
      let far = 0
      for (const [i, s] of to.slides.entries()) {
        const d = Math.abs(i - (at.get(s.id) ?? i))
        if (d > far) {
          moved = s.id
          far = d
        }
      }
      if (moved && selectedId !== null && at.get(selectedId) === sel) return moved
    }
  }
  if (to.slides.some((s) => s.id === selectedId)) return selectedId
  const at = from.slides.findIndex((s) => s.id === selectedId)
  return to.slides[Math.min(Math.max(at - 1, 0), to.slides.length - 1)]?.id ?? null
}

export const useDeck = create<DeckState>((set, get) => {
  /** 덱을 바꾸고 되돌리기 기록을 남긴다 */
  function commit(fn: (deck: Deck) => Deck, key?: string) {
    const { deck, past, future, lastKey, lastTime } = get()
    if (!deck) return
    // 부품 장의 판은 바뀐 부품, 제목, 글자 크기에 맞춰 다시 나눈다 (커진 부품이 옆에서 자리를 받는다)
    const next = { ...settleDeck(fn(deck), deck), updatedAt: Date.now() }
    // 아무것도 바뀌지 않았으면 기록하지 않는다. 지금 것을 다시 고르면(같은 차례, 같은 강조) 빈 되돌리기 단계가 생겨서
    // Ctrl+Z를 눌러도 아무 일이 없는 것처럼 보였다
    unchanged = sameDeck(next, deck)
    if (unchanged) return
    const now = Date.now()
    // 칸을 나가며 글의 앞뒤 빈칸만 다듬은 것(fields.tsx의 onBlur)은 단계를 따로 남기지 않고 지금 단계에 얹는다.
    // 쓰고 1.2초 넘게 쉬었다가, 또는 다른 것을 고친 뒤에 칸을 나가면 빈칸 하나만 되돌리는 단계가 생겨서
    // 첫 Ctrl+Z가 아무 일도 하지 않는 것처럼 보였다. 빈칸을 치는 것은 그대로 기록하고(얹으면 쓰기 전 모습이 기록에서 사라진다),
    // 기록이 비었을 때도 얹지 않는다(끝까지 되돌리면 처음 연 모습과 같게).
    // 다듬고 나니 지금 단계가 바꾼 것이 없어졌으면(빈칸만 쳤거나, 칸 안의 Ctrl+Z로 쓴 글을 지운 뒤 빈칸만 남았으면) 그 단계도 지운다:
    // 남겨 두면 칸 밖에서 누른 첫 Ctrl+Z가 아무 일도 하지 않는 것처럼 보였다. 되돌린 뒤라 다시 할 것이 있으면 그대로 둔다
    if (past.length && sameDeck(next, deck, true)) {
      const top = past[past.length - 1]
      if (!future.length && sameDeck(next, top)) {
        set({ deck: { ...top, aiShare: deck.aiShare }, past: past.slice(0, -1), lastKey: null, lastTime: now })
        edits++
        return
      }
      set({ deck: next, lastTime: now })
      return
    }
    // 한 번 끄는 동안(gestureKey)은 손을 멈춰도 한 단계로 묶는다
    const gesture = !!key?.startsWith(GESTURE_KEY)
    const coalesce = key !== undefined && key === lastKey && (gesture || now - lastTime < COALESCE_MS)
    const top = past.at(-1)
    if (coalesce && top && sameDeck(next, top)) {
      // 한 단계로 묶이는 고침이 처음 모습으로 돌아왔으면(끌다가 제자리에 놓거나 Esc로 그만두거나, 쓴 글을 곧바로 지우면) 그 단계를 지운다.
      // 바뀐 것 없는 단계가 남아 Ctrl+Z가 아무 일도 하지 않는 것처럼 보였다
      set({ deck: { ...top, aiShare: deck.aiShare }, past: past.slice(0, -1), lastKey: null, lastTime: now })
      edits++
      return
    }
    edits++
    set({
      deck: next,
      past: coalesce ? past : [...past, deck].slice(-HISTORY_LIMIT),
      future: [],
      lastKey: key ?? null,
      lastTime: now,
    })
  }

  return {
    deck: null,
    newer: null,
    selectedId: null,
    past: [],
    future: [],
    lastKey: null,
    lastTime: 0,

    open(raw) {
      // 새 버전에서 만든 발표: 이 버전이 모르는 부품이 있어서, 열어 고치면 그 부품과 안의 글을 빼고 저장하게 된다. 열지 않는다
      if (unknownParts(raw)) {
        set({ deck: null, newer: raw, selectedId: null, past: [], future: [], lastKey: null })
        return
      }
      // 가져온 파일이나 예전 저장본은 지금 꼴로
      const deck = migrateDeck(raw)
      set({ deck, newer: null, selectedId: deck.slides[0]?.id ?? null, past: [], future: [], lastKey: null })
    },
    close() {
      set({ deck: null, newer: null, selectedId: null, past: [], future: [] })
    },
    select(id) {
      set({ selectedId: id, lastKey: null })
    },
    undo() {
      const { deck, past, future } = get()
      if (!deck || !past.length) return
      // AI 공유는 되돌리기 기록에 없는 설정이라 지금 값을 그대로 둔다. 끈 공유가 되돌리기로 다시 켜지면 모양이 몰래 다시 올라간다
      const prev = { ...past[past.length - 1], aiShare: deck.aiShare }
      set({ deck: prev, past: past.slice(0, -1), future: [deck, ...future], lastKey: null, selectedId: shownAfter(deck, prev, get().selectedId) })
    },
    redo() {
      const { deck, past, future } = get()
      if (!deck || !future.length) return
      const next = { ...future[0], aiShare: deck.aiShare }
      set({ deck: next, past: [...past, deck], future: future.slice(1), lastKey: null, selectedId: shownAfter(deck, next, get().selectedId) })
    },

    setTitle(title) {
      commit((d) => ({ ...d, title }), 'deck.title')
    },
    setMeta(key, value) {
      commit((d) => ({ ...d, meta: { ...d.meta, [key]: value } }), `meta.${key}`)
    },
    setTheme(id) {
      commit((d) => ({ ...d, theme: { ...d.theme, id } }))
    },
    setAccent(accent) {
      // 색 고르기 창은 끄는 동안 값을 계속 보낸다. 한 단계로 묶어야 되돌리기 기록(100개)이 색 하나로 다 차지 않는다
      commit((d) => ({ ...d, theme: { ...d.theme, accent } }), 'theme.accent')
    },
    setMotion(motion) {
      commit((d) => ({ ...d, motion }))
    },
    setLook(patch) {
      commit((d) => ({ ...d, theme: { ...d.theme, ...patch } }))
    },

    setField(slideId, key, value) {
      if (isMetaKey(key)) return get().setMeta(key.slice(1) as MetaKey, value)
      commit((d) => mapSlide(d, slideId, (s) => ({ ...s, fields: { ...s.fields, [key]: value } })), `${slideId}.${key}`)
    },
    setItem(slideId, index, key, value) {
      commit(
        (d) =>
          mapSlide(d, slideId, (s) => ({
            ...s,
            items: s.items.map((it, i) => (i === index ? { ...it, [key]: value } : it)),
          })),
        `${slideId}.${index}.${key}`,
      )
    },
    addItem(slideId) {
      commit((d) =>
        mapSlide(d, slideId, (s) => {
          // 보이는 항목 바로 뒤에 넣는다. 레이아웃 때문에 숨겨진 항목은 뒤로 밀린다
          const items = withOneMore(s.items, LAYOUTS[s.layout].items?.max ?? 0)
          return items === s.items ? s : { ...s, items }
        }),
      )
    },
    removeItem(slideId, index) {
      commit((d) =>
        mapSlide(d, slideId, (s) => {
          const highlight = dropIndex(s.options.highlight, index)
          return { ...s, items: s.items.filter((_, i) => i !== index), options: highlight === s.options.highlight ? s.options : { ...s.options, highlight } }
        }),
      )
    },
    duplicateItem(slideId, index) {
      commit((d) =>
        mapSlide(d, slideId, (s) => {
          const max = LAYOUTS[s.layout].items?.max ?? 0
          if (Math.min(s.items.length, max) >= max || !s.items[index]) return s
          const items = [...s.items]
          items.splice(index + 1, 0, { ...s.items[index] })
          // 강조는 원래 항목에 그대로 둔다 (뒤의 항목을 강조했으면 한 칸 밀린다)
          const h = s.options.highlight
          const highlight = typeof h === 'number' && h > index ? h + 1 : h
          return { ...s, items, options: highlight === h ? s.options : { ...s.options, highlight } }
        }),
      )
    },
    moveItem(slideId, from, to, key) {
      commit(
        (d) =>
          mapSlide(d, slideId, (s) => {
            const highlight = followIndex(s.options.highlight, from, to)
            return { ...s, items: moveIn(s.items, from, to), options: highlight === s.options.highlight ? s.options : { ...s.options, highlight } }
          }),
        key,
      )
    },
    setNotes(slideId, notes) {
      commit((d) => mapSlide(d, slideId, (s) => ({ ...s, notes })), `${slideId}.notes`)
    },
    setOptions(slideId, options, key) {
      commit((d) => mapSlide(d, slideId, (s) => ({ ...s, options: { ...s.options, ...options } })), key)
    },
    setHidden(slideId, hidden) {
      commit((d) => mapSlide(d, slideId, (s) => ({ ...s, hidden })))
    },
    changeLayout(slideId, layout) {
      commit((d) => mapSlide(d, slideId, (s) => withLayout(s, layout)))
    },
    setVariant(slideId, variant, key) {
      // 지금 모양을 다시 고르면 그대로 둔다: 고른 적 없는 첫째 모양에 그 이름을 적어 넣기만 해서, 보이는 것은 같은데 되돌리기
      // 단계가 생겨 Ctrl+Z를 눌러도 아무 일이 없는 것처럼 보였다
      commit((d) => mapSlide(d, slideId, (s) => (variantOf({ ...s, variant }) === variantOf(s) ? s : { ...s, variant })), key)
    },

    setBlocks(slideId, blocks, key) {
      // 부품을 옮기거나 빼서 설 자리가 없어진 이음표(판 끝)는 뺀다
      commit((d) => mapSlide(d, slideId, (s) => ({ ...s, blocks: tidyLinks(blocks) })), key)
    },
    updateBlock(slideId, blockId, fn, key) {
      commit((d) => mapSlide(d, slideId, (s) => ({ ...s, blocks: mapBlock(s.blocks ?? [], blockId, fn) })), key)
    },
    toCompose(slideId) {
      commit((d) => mapSlide(d, slideId, (s) => asCompose(s)))
    },
    replaceSlide(slideId, slide) {
      commit((d) => mapSlide(d, slideId, () => ({ ...slide, id: slideId, ...(slide.blocks ? { blocks: tidyLinks(slide.blocks) } : {}) })))
    },
    addComposeSlide(blocks, afterId) {
      get().insertSlide({ ...makeSlide('compose'), blocks }, afterId)
    },
    insertSlide(slide, afterId) {
      commit((d) => {
        const at = afterId ? d.slides.findIndex((s) => s.id === afterId) + 1 : d.slides.length
        const prev = d.slides[at - 1]
        const slides = [...d.slides]
        // 앞 장과 같은 단락에 둔다
        slides.splice(at, 0, prev ? { ...slide, section: prev.section } : slide)
        return { ...d, slides }
      })
      set({ selectedId: slide.id })
    },

    setAiShare(on) {
      const { deck } = get()
      if (deck) set({ deck: { ...deck, aiShare: on, updatedAt: Date.now() } })
    },
    replaceDeck(next) {
      commit(() => cleanDeckBlocks(next))
      const { deck, selectedId } = get()
      if (deck && !deck.slides.some((s) => s.id === selectedId)) set({ selectedId: deck.slides[0]?.id ?? null })
    },

    addSlide(layout, afterId) {
      const slide = makeSlide(layout)
      commit((d) => {
        const at = afterId ? d.slides.findIndex((s) => s.id === afterId) + 1 : d.slides.length
        const prev = d.slides[at - 1]
        if (prev) slide.section = prev.section
        const slides = [...d.slides]
        slides.splice(at, 0, slide)
        return { ...d, slides }
      })
      set({ selectedId: slide.id })
    },
    duplicateSlide(slideId) {
      const { deck } = get()
      const source = deck?.slides.find((s) => s.id === slideId)
      if (!source) return
      const copy: Slide = {
        ...structuredClone(source),
        id: uid(),
        items: source.items.map((it) => ({ ...it, id: uid() })),
        ...(source.blocks ? { blocks: copyBlocks(source.blocks) } : {}),
      }
      commit((d) => {
        const slides = [...d.slides]
        slides.splice(slides.findIndex((s) => s.id === slideId) + 1, 0, copy)
        return { ...d, slides }
      })
      set({ selectedId: copy.id })
    },
    removeSlide(slideId) {
      const { deck, selectedId } = get()
      if (!deck || deck.slides.length <= 1) return
      const index = deck.slides.findIndex((s) => s.id === slideId)
      commit((d) => ({ ...d, slides: d.slides.filter((s) => s.id !== slideId) }))
      if (selectedId === slideId) {
        const rest = get().deck!.slides
        set({ selectedId: rest[Math.min(index, rest.length - 1)]?.id ?? null })
      }
    },
    moveSlide(from, to) {
      commit((d) => {
        const slides = [...d.slides]
        const [moved] = slides.splice(from, 1)
        slides.splice(to, 0, moved)
        return { ...d, slides }
      })
    },
  }
})

/**
 * 알림의 '되돌리기'용. 바꾼 바로 뒤에 불러 두면, 돌려준 함수는 그 바꾼 것이 아직 맨 위일 때만 되돌리고 true를 돌려준다.
 * 알림이 떠 있는 사이에 다른 것을 고쳤으면 그것을 되돌리게 되므로 되돌리지 않는다.
 * 기록을 바꾼 고침의 수와 기록의 길이로 본다: AI 공유처럼 기록에 남지 않는 설정이 바뀌어도, Ctrl+Z 뒤 Ctrl+Y로 그대로 돌아왔어도 되돌린다.
 * 그 뒤로 고친 것 없이 이미 되돌렸거나(Ctrl+Z, 위쪽 되돌리기) 바꾼 것이 없었으면 아무것도 하지 않고 true: 예전에는 Ctrl+Z 뒤에
 * 알림의 되돌리기를 누르면 '그 뒤에 고친 것이 있어서'라고 알려서 한 번 더 Ctrl+Z를 누르게 했고, 그러면 그 앞에 고친 것까지 되돌려졌다.
 * 되돌린 뒤에 새로 고쳤으면 기록의 맨 위가 다시 같아져도 되돌리지 않는다(새로 고친 것이 되돌려졌다)
 */
export function undoLast(): () => boolean {
  const at = useDeck.getState().past.length
  const seen = edits
  const none = unchanged
  return () => {
    const s = useDeck.getState()
    if (none || (edits === seen && s.past.length < at)) return true
    if (edits !== seen || s.past.length !== at) return false
    s.undo()
    return true
  }
}

export function useSelectedSlide(): Slide | null {
  return useDeck((s) => s.deck?.slides.find((x) => x.id === s.selectedId) ?? null)
}

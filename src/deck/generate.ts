import { AUDIENCES, BLUEPRINTS, type Recipe } from './blueprints'
import { LAYOUTS } from './layouts'
import type { Audience, Deck, DeckType, Item, LayoutId, Method, Slide, SlideOptions, ThemeId } from './types'

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

export function emptyItem(): Item {
  return { id: uid(), title: '', body: '', value: '', meta: '', image: '' }
}

/** 발표 시간에 맞는 목표 장 수. 보고는 질문과 토론 시간이 길어서 한 장에 2분 남짓. */
export function targetCount(minutes: number): number {
  if (minutes <= 5) return 5
  if (minutes <= 10) return 7
  if (minutes <= 20) return 11
  return 15
}

/**
 * 듣는 사람에 맞춘 우선순위. 더 챙기는 장(up)은 3에서 2로, 덜 챙기는 장(down)은 2에서 3으로.
 * 1은 그대로 둔다: 어느 자리에서든 빠지면 안 되는 장이라서다. 장 수를 맞출 때만 쓰고 장 자체는 바꾸지 않는다.
 */
export function priorityFor(recipe: Recipe, audience: Audience): Recipe['priority'] {
  const a = AUDIENCES.find((x) => x.id === audience)
  if (recipe.priority === 1 || !recipe.focus || !a) return recipe.priority
  if (recipe.priority === 3 && a.up?.includes(recipe.focus)) return 2
  if (recipe.priority === 2 && a.down?.includes(recipe.focus)) return 3
  return recipe.priority
}

/** 청중과 시간에 맞춰 blueprint에서 장을 고른다. 순서는 유지한다. */
export function planRecipes(type: DeckType, audience: Audience, minutes: number): Recipe[] {
  // 모르는 종류(새 버전이 더한 값)면 빈 발표의 구성으로
  let list = (BLUEPRINTS[type] ?? BLUEPRINTS.blank).recipes.filter((r) => !r.audience || r.audience.includes(audience))
  const target = targetCount(minutes)

  while (list.length > target) {
    // 묶음(group)은 한 단위로 다룬다
    const units = new Map<string, { priority: number; pos: number; recipes: Recipe[] }>()
    list.forEach((r, pos) => {
      const priority = priorityFor(r, audience)
      if (priority === 1) return
      const key = r.group ?? `#${pos}`
      const unit = units.get(key)
      if (unit) unit.recipes.push(r)
      else units.set(key, { priority, pos, recipes: [r] })
    })
    const victim = [...units.values()].sort((a, b) => b.priority - a.priority || b.pos - a.pos)[0]
    if (!victim) break
    list = list.filter((r) => !victim.recipes.includes(r))
  }
  return list
}

export function makeSlide(layout: LayoutId, recipe?: Partial<Recipe>): Slide {
  const spec = LAYOUTS[layout]
  const count = recipe?.items ?? spec.items?.default ?? 0
  return {
    id: uid(),
    layout,
    purpose: recipe?.purpose ?? spec.name,
    section: recipe?.section ?? '',
    fields: { ...(recipe?.fields ?? {}) },
    items: Array.from({ length: count }, (_, i) => ({ ...emptyItem(), ...recipe?.prefill?.[i] })),
    hints: { ...(recipe?.hints ?? {}) },
    guide: recipe?.guide ?? spec.description,
    notes: '',
    options: withDefaultOptions(layout, { ...recipe?.options }, count),
    ...(recipe?.variant ? { variant: recipe.variant } : {}),
    ...(layout === 'compose' ? { blocks: [] } : {}),
  }
}

/** 레이아웃마다 처음 정해 두는 옵션. 이미 고른 값은 그대로 둔다. */
export function withDefaultOptions(layout: LayoutId, options: SlideOptions, itemCount: number): SlideOptions {
  if (layout === 'pricing' && options.highlight === undefined) return { ...options, highlight: itemCount >= 3 ? 1 : -1 }
  // 제품 화면 캡처가 대부분이라 잘리지 않게 전체를 보여 주는 쪽이 기본이다.
  if (layout === 'imageText' && options.contain === undefined) return { ...options, contain: true }
  return options
}

interface DeckInput {
  type: DeckType
  audience: Audience
  minutes: number
  method: Method
  title: string
  org: string
  presenter: string
  /** 표지에 적는 결정 요청 한 줄 */
  ask?: string
  /** 표지의 부제. 결정을 받는 자리가 아닌 발표는 프레임 잡기에서 결정 요청 대신 이것을 묻는다 */
  lead?: string
  theme: ThemeId
}

export function formatDate(date = new Date()): string {
  return new Intl.DateTimeFormat('ko-KR').format(date)
}

/** recipes를 주면 듣는 사람과 시간으로 고르지 않고 그 장들로 만든다(갤러리가 구성의 모든 장을 그릴 때) */
export function createDeck(input: DeckInput, recipes = planRecipes(input.type, input.audience, input.minutes)): Deck {
  const blueprint = BLUEPRINTS[input.type] ?? BLUEPRINTS.blank
  const sectionTitles = blueprint.recipes.filter((r) => r.layout === 'section').map((r) => r.section ?? '')
  const title = input.title.trim() || blueprint.defaultTitle

  const slides = recipes.map((recipe) => {
    const slide = makeSlide(recipe.layout, recipe)
    if (recipe.layout === 'cover') {
      slide.fields.title = title
      if (input.ask?.trim()) slide.fields.ask = input.ask.trim()
      if (input.lead?.trim()) slide.fields.lead = input.lead.trim()
    }
    if (recipe.layout === 'agenda' && sectionTitles.length) {
      slide.items = sectionTitles.map((t) => ({ ...emptyItem(), title: t }))
    } else if (recipe.layout === 'agenda' && blueprint.storyline.length) {
      // 단락이 없는 구성(실적 보고, 착수 보고 같은)은 이야기 흐름을 목차의 예시로 보여 준다. 내용이 아니라 안내라서 칸은 비워 둔다.
      slide.items = blueprint.storyline.map(() => emptyItem())
      blueprint.storyline.forEach((t, i) => (slide.hints[`items.${i}.title`] = t))
    }
    return slide
  })

  const now = Date.now()
  return {
    id: uid(),
    version: 2,
    title,
    createdAt: now,
    updatedAt: now,
    meta: {
      type: input.type,
      audience: input.audience,
      duration: input.minutes,
      method: input.method,
      org: input.org.trim(),
      presenter: input.presenter.trim(),
      date: formatDate(),
      contact: '',
      logo: '',
    },
    theme: { id: input.theme },
    slides,
  }
}

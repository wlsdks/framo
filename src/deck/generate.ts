import { AUDIENCES, BLUEPRINTS, type Recipe } from './blueprints'
import { autoPlace, boardAreaH, boardSig, makeBlock } from './blocks'
import { emptyItem, makeSlide, uid } from './make'
import type { Audience, Block, Deck, DeckType, Method, Slide, ThemeId } from './types'

// 새 id, 새 항목, 새 장은 make.ts에 있다(부품 장도 쓰는 가장 아래의 만들기). 바깥은 여기서 그대로 가져온다
export { emptyItem, makeSlide, uid } from './make'

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

/**
 * 구성의 장 하나. 부품 장이면 넣어 둘 컴포넌트(recipe.blocks)를 편집기에서 하나씩 눌러 넣을 때와 같은 자리에 넣고(autoPlace),
 * 알아서 짠 판으로 남긴다(arranged): 사람이 컴포넌트를 더 넣거나 빼면 판을 다시 고른다. 자리를 구성에 적어 두지 않는 것은
 * 판의 규칙(잘리지 않는 높이, 짜임 틀)이 바뀌어도 늘 지금 규칙의 판으로 만들기 위해서다.
 * look: 판을 짤 본문 높이를 정하는 발표 설정(테마의 글꼴, 보내는 자료). 명조 제목은 고딕보다 머리가 높다
 */
export function recipeSlide(recipe: Recipe, look?: Parameters<typeof boardAreaH>[1]): Slide {
  const slide = makeSlide(recipe.layout, recipe)
  if (recipe.layout !== 'compose' || !recipe.blocks?.length) return slide
  const areaH = boardAreaH(slide, look)
  let blocks: Block[] = []
  for (const r of recipe.blocks) {
    const base = makeBlock(r.type)
    const block: Block = {
      ...base,
      fields: { ...r.fields },
      items: Array.from({ length: r.items ?? base.items.length }, (_, i) => ({ ...emptyItem(), ...r.prefill?.[i] })),
      ...(r.hints ? { hints: { ...r.hints } } : {}),
      ...(r.variant ? { variant: r.variant } : {}),
      ...(r.highlight !== undefined ? { highlight: r.highlight } : {}),
    }
    blocks = autoPlace(blocks, block, areaH, true) ?? blocks
  }
  return { ...slide, blocks, arranged: boardSig(blocks) }
}

/** recipes를 주면 듣는 사람과 시간으로 고르지 않고 그 장들로 만든다(갤러리가 구성의 모든 장을 그릴 때) */
export function createDeck(input: DeckInput, recipes = planRecipes(input.type, input.audience, input.minutes)): Deck {
  const blueprint = BLUEPRINTS[input.type] ?? BLUEPRINTS.blank
  const sectionTitles = blueprint.recipes.filter((r) => r.layout === 'section').map((r) => r.section ?? '')
  const title = input.title.trim() || blueprint.defaultTitle
  const look = { meta: { method: input.method }, theme: { id: input.theme } }

  const slides = recipes.map((recipe) => {
    const slide = recipeSlide(recipe, look)
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

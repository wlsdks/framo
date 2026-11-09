// 장면: 장 하나를 영화의 한 컷처럼 처음부터 끝까지 한 번에 짜 둔 움직임.
// 사람은 장면 하나를 고르기만 한다(딸깍). 무엇이 언제 움직이는지는 엔진(motion/engine.ts의 scene)이 레이아웃마다 정한다.
// 값은 장의 options.scene에 id 하나로 남고, 슬라이드의 data-scene으로 내보낸 HTML의 뷰어도 같이 읽는다.
// 여기의 목록이 고르는 값의 한 곳이다: 편집기, 장면 알아서 고르기, 예전 버전 검사(compat.ts)가 같이 쓰고,
// AI 카탈로그와 모양 파일, 제안(op)도 나중에 여기서 가져간다

import type { Block, BlockType, Deck, LayoutId, SceneId, Slide } from './types'

interface SceneSpec {
  id: SceneId
  name: string
  description: string
  /** 이 장면이 맞는 레이아웃 */
  layouts: readonly LayoutId[]
  /** 컴포넌트 장: 이 중 하나가 있으면 맞는다 */
  blocks: readonly BlockType[]
}

/** 고를 수 있는 장면. 차례가 곧 '장면 알아서 고르기'에서 한 장에 맞는 장면이 여럿일 때 먼저 고르는 차례다 */
export const SCENES: readonly SceneSpec[] = [
  {
    id: 'opening',
    name: '첫 장면',
    description: '조금 다가간 데서 천천히 물러나며 자리를 잡고, 제목이 한 글자씩 내려앉아요.',
    layouts: ['cover', 'section'],
    blocks: [],
  },
  {
    id: 'answer',
    name: '결론 한 방',
    description: '결론이 한 글자씩 내려앉고 그 아래로 선이 지나가요. 근거는 그다음에 나와요.',
    layouts: ['statement', 'summary', 'case'],
    blocks: ['message', 'callout'],
  },
  {
    id: 'numbers',
    name: '숫자가 말한다',
    description: '가장 중요한 숫자만 밝게 먼저 나오고, 나머지는 뒤따라 밝아져요.',
    layouts: ['kpi', 'scorecard', 'bars', 'share', 'funnel', 'bridge', 'versus', 'pricing'],
    blocks: ['number', 'stat', 'delta', 'goal', 'ring', 'attain', 'meter', 'ratio', 'kpi', 'scorecard', 'bars', 'versus', 'share', 'funnel', 'bridge'],
  },
  {
    id: 'flow',
    name: '흐름 따라가기',
    description: '읽는 차례로 선이 이어지며 하나씩 나와요.',
    layouts: ['process', 'points', 'agenda'],
    blocks: ['steps', 'flow', 'decision', 'process', 'points', 'agenda'],
  },
  {
    id: 'compare',
    name: '비교 드러내기',
    description: '왼쪽을 먼저 보이고, 장막이 걷히며 오른쪽이 드러나요.',
    layouts: ['compare'],
    blocks: ['compare'],
  },
  {
    id: 'time',
    name: '시간의 흐름',
    description: '단계 사이를 넓혀 차례로 보이며 시간 쪽으로 천천히 따라가요.',
    layouts: ['timeline', 'trend', 'progress'],
    blocks: ['timeline', 'gantt', 'trend', 'progress'],
  },
  {
    id: 'picture',
    name: '이미지 한 컷',
    description: '이미지에 천천히 다가가고, 제목이 한 글자씩 내려앉아요.',
    layouts: ['imageText'],
    blocks: ['image'],
  },
  {
    id: 'closing',
    name: '마무리',
    description: '천천히 물러나며 자리를 잡고, 부탁할 일이 차례로 이어져요.',
    layouts: ['closing'],
    blocks: [],
  },
]

export const SCENE_IDS: readonly SceneId[] = SCENES.map((s) => s.id)

export function isScene(v: unknown): v is SceneId {
  return typeof v === 'string' && (SCENE_IDS as readonly string[]).includes(v)
}

export function sceneSpec(id: SceneId): SceneSpec {
  return SCENES.find((s) => s.id === id)!
}

/** 컴포넌트 장에서 나란히 선 두 칸(앞과 뒤): 비교 드러내기가 둘 사이에 장막을 친다 */
function sideBySide(blocks: readonly Block[]): boolean {
  if (blocks.length !== 2) return false
  const [a, b] = blocks.map((x) => x.at)
  return !!a && !!b && a.y === b.y && a.h === b.h && a.x !== b.x
}

/** 이 장에 이 장면이 맞는지. 맞지 않는 장면은 고르는 곳에 보이지 않고, 골라 둔 뒤 레이아웃을 바꾸면 쉰다(값은 남는다) */
export function sceneFits(slide: Pick<Slide, 'layout' | 'blocks'>, id: SceneId): boolean {
  const spec = SCENES.find((s) => s.id === id)
  if (!spec) return false
  if (slide.layout !== 'compose') return spec.layouts.includes(slide.layout)
  const blocks = slide.blocks ?? []
  if (id === 'compare' && sideBySide(blocks)) return true
  return blocks.some((b) => spec.blocks.includes(b.type))
}

/** 이 장에 맞는 장면들 (목록 차례) */
export function scenesFor(slide: Pick<Slide, 'layout' | 'blocks'>): SceneId[] {
  return SCENE_IDS.filter((id) => sceneFits(slide, id))
}

/** 이 장에서 움직일 장면: 골랐고 지금 레이아웃에 맞을 때만 */
export function sceneOf(slide: Pick<Slide, 'layout' | 'blocks' | 'options'>): SceneId | null {
  const id = slide.options.scene
  return isScene(id) && sceneFits(slide, id) ? id : null
}

/**
 * 장면을 알아서 고를 때 이 장에 고를 수 있는 장면 (맞는 것 가운데 목록의 첫째). used에 든 장면은 빼고 고른다
 */
export function autoScene(slide: Pick<Slide, 'layout' | 'blocks'>, used: ReadonlySet<SceneId> = new Set()): SceneId | null {
  return scenesFor(slide).find((id) => !used.has(id)) ?? null
}

interface ScenePlanRow {
  slideId: string
  /** 장 번호 (1부터, 숨긴 장도 센다: 슬라이드 목록과 같게) */
  page: number
  /** 지금 골라 둔 장면 (없으면 null) */
  now: SceneId | null
  /** 입힐 장면 */
  next: SceneId
}

/**
 * 힘줄 장만 고르기: 장면마다 한 번, 그 장면이 맞는 첫 장에만. 여는 장, 결론, 숫자, 흐름, 비교, 시간, 이미지, 마지막 장이
 * 저마다 한 번씩 힘을 받고 나머지 장은 차분하게 둔다. 맞는 장마다 다 입히면 15장 발표의 거의 모든 장이 움직여서,
 * 어디가 중요한지 오히려 흐려지고 같은 장면이 이어져 단조로웠다(영화도 모든 컷이 크지 않다). 가운데 장면(숫자, 흐름 같은)은
 * 바로 앞 장이 움직였으면 한 장 쉬고 다음 맞는 장에 넣는다. 숨긴 장은 건너뛴다.
 * keep: 이미 골라 둔 장은 그대로 두고, 그 장면은 다시 쓰지 않는다
 */
function pick(deck: Pick<Deck, 'slides'>, keep: boolean): ScenePlanRow[] {
  const now = (s: Slide) => (isScene(s.options.scene) ? s.options.scene : null)
  const used = new Set<SceneId>(keep ? deck.slides.flatMap((s) => (!s.hidden && sceneOf(s) ? [sceneOf(s)!] : [])) : [])
  const rows: ScenePlanRow[] = []
  // 바로 앞 장(숨긴 장 빼고)이 움직였는지: 가운데 장면은 한 장 쉬고 온다. 여는 장, 결론, 마무리는 자리가 정해진 장이라 쉬지 않는다
  let moved = false
  deck.slides.forEach((s, i) => {
    if (s.hidden) return
    if (keep && now(s)) {
      moved = !!sceneOf(s)
      return
    }
    const rest = new Set<SceneId>(moved ? [...used, ...SCENE_IDS.filter((id) => !FRAMING.includes(id))] : used)
    const next = autoScene(s, rest)
    moved = !!next
    if (!next) return
    used.add(next)
    rows.push({ slideId: s.id, page: i + 1, now: now(s), next })
  })
  return rows
}

/** 이야기의 틀을 잡는 장면: 바로 앞 장이 움직였어도 넣는다 (표지 다음의 한 장 요약처럼 붙어 있는 게 자연스럽다) */
const FRAMING: readonly SceneId[] = ['opening', 'answer', 'closing']

/**
 * 장면 알아서 고르기의 계획. add: 장면이 없는 장에 새로 넣을 것(골라 둔 장과 그 장면은 그대로).
 * kept: 처음부터 다시 고르면 다른 장면이 될, 이미 골라 둔 장 (바꾸려면 사람이 따로 고른다). all: 처음부터 다시 고를 때 바뀌는 장
 */
export function planScenes(deck: Pick<Deck, 'slides'>): { add: ScenePlanRow[]; kept: ScenePlanRow[]; all: ScenePlanRow[] } {
  const all = pick(deck, false).filter((r) => r.now !== r.next)
  return { add: pick(deck, true), kept: all.filter((r) => r.now !== null), all }
}

/** 계획대로 장면을 넣은 발표. overwrite면 이미 골라 둔 장까지 처음부터 다시 고른다 */
export function withScenes<D extends Pick<Deck, 'slides'>>(deck: D, overwrite: boolean): D {
  const plan = planScenes(deck)
  const to = new Map((overwrite ? plan.all : plan.add).map((r) => [r.slideId, r.next]))
  if (!to.size) return deck
  return { ...deck, slides: deck.slides.map((s) => (to.has(s.id) ? { ...s, options: { ...s.options, scene: to.get(s.id) } } : s)) }
}

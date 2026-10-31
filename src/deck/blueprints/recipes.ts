// 장 하나의 꼴(Recipe)과 발표 종류의 꼴(Blueprint), 여러 발표 종류가 같이 쓰는 장: 표지, 한 장 요약, 안 비교, 위험, 마지막 장, 목차

import type { Audience, DeckType, ItemKey, LayoutId, SlideOptions } from '../types'

/** 듣는 사람에 따라 더 챙기거나 덜 챙기는 장. 장 수를 맞출 때 우선순위를 한 단계 올리거나 내린다 */
export type Focus = 'numbers' | 'detail' | 'context'

export interface Recipe {
  layout: LayoutId
  purpose: string
  /** 1은 항상 포함, 3부터 먼저 뺀다 */
  priority: 1 | 2 | 3
  /** 이 청중일 때만 포함. 없으면 모든 청중 */
  audience?: Audience[]
  /** 숫자 장, 세부 장, 배경 장. 듣는 사람(AUDIENCES의 up, down)에 따라 우선순위가 한 단계 오르내린다 */
  focus?: Focus
  /** 같은 묶음은 함께 넣거나 뺀다 */
  group?: string
  section?: string
  guide: string
  /** 칸 안내. `items.title`은 모든 항목, `items.0.title`은 첫 항목에만 */
  hints?: Record<string, string>
  /** 미리 채워 두는 값 (구조에 해당하는 글자만) */
  fields?: Record<string, string>
  /** 항목마다 미리 채워 두는 값 (구조에 해당하는 글자만, 예: 'A안') */
  prefill?: Partial<Record<ItemKey, string>>[]
  items?: number
  /** 처음 쓸 모양. 없으면 레이아웃의 기본 모양 */
  variant?: string
  /** 처음 정해 두는 장 옵션 (예: 강조할 단계) */
  options?: SlideOptions
}

export interface Blueprint {
  type: DeckType
  name: string
  /** 고르는 목록에 보이는 한 줄. 무엇을 하는 발표인지 짧게 */
  description: string
  /** 마법사에서 보여주는 이야기 흐름 */
  storyline: string[]
  /** 마법사의 발표 종류 미리 보기에 작은 그림으로 보일 장(장의 역할 이름). 이야기 흐름의 차례마다 하나 */
  showcase?: string[]
  defaultTitle: string
  /**
   * 마법사에서 이 종류를 고르면 먼저 골라 둘 듣는 사람과 시간. 늘 '여러 분이 함께, 20분'이면 주간 보고도 20분 구성이 됐다.
   * 그 자리에서 흔한 값을 어림으로 정한 것이라, 사람이 바꾼 값은 종류를 바꿔도 덮지 않는다(Wizard)
   */
  defaults: { audience: Audience; minutes: number }
  /**
   * 마법사의 입력 예시. ask가 없는 발표(나누고 알리는 발표)는 결정 요청 대신 부제(lead)를 묻는다.
   * 결정받을 것이 없는 자리에서 '결정받고 싶은 것'을 물으면 무엇을 적을지 헷갈린다
   */
  examples: { title: string; ask?: string; lead?: string }
  recipes: Recipe[]
}

export const ALL_BUT_EXEC: Audience[] = ['practitioner', 'peers', 'partners', 'external', 'mixed']

/** 항목마다 다른 안내 문구 */
function rows(key: ItemKey, hints: string[]): Record<string, string> {
  return Object.fromEntries(hints.map((h, i) => [`items.${i}.${key}`, h]))
}

/**
 * 여러 칸의 항목별 안내. 같은 예시가 줄마다 되풀이되면 무엇을 적을지 알기 어렵고 가짜처럼 보여서,
 * 줄마다 다른 예시로 한 장 전체가 말이 되게 한다.
 */
export function each(hints: Partial<Record<ItemKey, string[]>>): Record<string, string> {
  return Object.assign({}, ...Object.entries(hints).map(([key, list]) => rows(key as ItemKey, list ?? [])))
}

export function section(title: string, lead: string): Recipe {
  return {
    layout: 'section',
    purpose: `섹션: ${title}`,
    priority: 3,
    group: 'sections',
    section: title,
    guide: '이야기의 큰 흐름이 바뀌는 곳이에요.',
    fields: { title },
    hints: { lead },
  }
}

export const cover: Recipe = { layout: 'cover', purpose: '표지', priority: 1, guide: '제목과 결정받을 것을 한 줄씩 적어요.' }

/**
 * 결정을 받는 자리가 아닌 발표(나누고 알리는 발표)의 표지. 결정 요청 칸이 없어서(asksDecision) 아래 띠 모양으로 연다:
 * 옆 면은 위쪽이 결정 요청 자리라서, 결정 요청이 없으면 짙은 면의 위쪽이 통째로 빈다
 */
export const plainCover: Recipe = { ...cover, guide: '무엇에 관한 발표인지 제목에 담아요.', variant: 'band' }

/** 한 장 요약: 바쁜 분이 이 장만 보고도 판단할 수 있게 */
export function summary(conclusion: string, labels: string[], bodies: string[]): Recipe {
  return {
    layout: 'summary',
    purpose: '한 장 요약',
    priority: 1,
    guide: '이 슬라이드만 봐도 알 수 있게, 줄마다 한두 문장으로 써요.',
    hints: { title: conclusion, ...rows('body', bodies) },
    prefill: labels.map((title) => ({ title })),
    items: labels.length,
  }
}

export function options(purpose: string, priority: Recipe['priority'], sectionName: string | undefined, hints: Record<string, string>): Recipe {
  return {
    layout: 'pricing',
    purpose,
    priority,
    section: sectionName,
    guide: '추천안을 강조하고, 안마다 비용과 장단점을 적어요.',
    hints,
    prefill: [{ title: 'A안' }, { title: 'B안' }, { title: 'C안' }],
  }
}

/**
 * 2×2 우선순위. 두 축(하기 쉬운 정도, 효과)을 미리 채우므로 그 축으로 정해지는 네 칸의 이름도 채워 둔다.
 * 안내로만 두면 편집할 때는 흐리게 보여 채운 줄 알고, 발표할 때는 칸 이름이 빠진 채 나갔다
 */
export function priorities(sectionName: string): Recipe {
  const names = ['틈틈이 하기', '바로 하기', '미루기', '계획해서 하기']
  return {
    layout: 'matrix',
    purpose: '과제 우선순위',
    priority: 3,
    focus: 'detail',
    section: sectionName,
    guide: '효과와 하기 쉬운 정도로 나눠 무엇부터 할지 보여요.',
    fields: { yAxis: '실행하기 쉬움', xAxis: '효과가 큼' },
    prefill: names.map((title) => ({ title })),
    hints: { title: '쉽고 효과가 큰 것부터 시작해요', ...rows('title', names) },
  }
}

const RISKS = {
  title: ['예산이 늘어날 수 있어요', '일정이 늦어질 수 있어요', '맡을 사람이 모자랄 수 있어요'],
  body: ['단계마다 나눠 쓰고 점검해요', '중간 점검 날짜를 미리 정해 둬요', '협력사 인력을 미리 잡아 둬요'],
}

export function risks(priority: Recipe['priority'], sectionName?: string, examples: Partial<Record<ItemKey, string[]>> = RISKS): Recipe {
  return {
    layout: 'compare',
    purpose: '위험과 대응',
    priority,
    section: sectionName,
    guide: '"잘 안 되면?"에 먼저 답해요.',
    fields: { leftTitle: '예상 위험', rightTitle: '대응 방안' },
    hints: { title: '이런 위험은 이렇게 대비해요', 'items.title': '일어날 수 있는 문제', 'items.body': '대응 방법', ...each(examples) },
  }
}

/**
 * 마지막 장: 받을 결정, 부탁, 남길 말. asks는 첫 줄이 가장 중요하고, 마지막 줄은 없으면 지워도 되는 칸이다.
 * bodies를 주지 않으면 결정 요청의 설명 칸(언제까지, 왜)으로 안내한다.
 */
export function closing(
  purpose: string,
  title: string,
  priority: Recipe['priority'],
  guide: string,
  asks: string[],
  bodies = ['언제까지, 왜 필요한지', '언제까지, 왜 필요한지', '없으면 이 줄을 지워요'],
): Recipe {
  return {
    layout: 'closing',
    purpose,
    priority,
    guide,
    fields: { title },
    hints: {
      // 줄마다 붙인 안내가 먼저 쓰이고, 이것은 그 밖의 줄에. 예시는 첫 줄에만 맞아서 뺀다
      'items.title': asks[0].replace(/ \(예: .*\)$/, ''),
      'items.body': bodies[0],
      ...each({ title: asks, body: bodies }),
    },
  }
}

export const decision = (asks: string[]) => closing('결정 요청', '결정해 주실 것', 1, '받을 결정과 기한을 분명히 적어요.', asks)

export const agenda: Recipe = {
  layout: 'agenda',
  purpose: '목차',
  priority: 3,
  audience: ALL_BUT_EXEC,
  guide: '섹션 이름이 미리 들어가 있어요.',
  fields: { title: '보고 순서' },
}


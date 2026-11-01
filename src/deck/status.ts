// 진행 현황과 준비 상황이 같이 쓰는 과제의 상태 읽기. 그리기(slides)와 부품 높이 고르기(blocks/sizing.ts)가 같이 쓴다
import { readPercent } from './percent'

export type Status = 'done' | 'doing' | 'late' | 'todo'
export type Lane = Status | 'unknown'

export const STATUS_NAMES: Record<Status, string> = { done: '완료', doing: '진행 중', late: '지연', todo: '예정' }

/** 진행 중이라는 뜻이 분명하면서 지연이 없다는 설명도 함께 적은 짧은 상태. */
export function noDelayDoing(text: string): boolean {
  return /^지연없이진행중(?:이에요|이예요|입니다)?[.!]?$/.test(text.replace(/\s/g, ''))
}

/**
 * 과제의 상태. 사람이 적은 상태 글을 먼저 읽고, 비어 있으면 진행률로 짐작한다(100%는 완료, 0%는 예정).
 * 읽을 수 없는 글('검토 중' 같은)은 null이라 색 없이 그 글 그대로 보인다.
 */
export function statusOf(text: string, pct: number | null): Status | null {
  const t = text.replace(/\s/g, '')
  if (t) {
    // 부정이나 예정은 포함된 단어만 읽으면 뜻이 뒤집힌다 ('미완료'를 완료, '지연 없음'을 지연으로 판정하지 않는다).
    const noDelay = /(?:미|비)지연|지연(?:이|은|이란)?(?:없|아니|아님)|지연없이|지연(?:되|하)지(?:는|도)?(?:않|못)/.test(t)
    if (noDelayDoing(t)) return 'doing'
    if (!noDelay && /지연|늦|위험|차질|보류|중단|밀림|미달/.test(t)) return 'late'
    if (noDelay || /미완료|비완료|완료(?:가|는|이|를|을)?(?:아님|아니|안|되지않|하지않|하지못|못)/.test(t)) return null
    if (/완료(?:전|예정|대기)/.test(t)) return 'todo'
    if (/완료|끝|마침|마감됨|종료/.test(t)) return 'done'
    if (/예정|대기|준비|시작전|착수전/.test(t)) return 'todo'
    if (/진행|하는중|착수|추진/.test(t)) return 'doing'
    return null
  }
  if (pct === null) return null
  return pct >= 100 ? 'done' : pct <= 0 ? 'todo' : 'doing'
}

/** 상태 글을 읽을 수 없으면 진행률과 상관없이 확인이 필요한 단에 둔다. */
export function laneOf(state: string, pct: number | null): Lane {
  return statusOf(state, pct) ?? 'unknown'
}

/**
 * 상태별 모양에서 가장 많이 모인 단의 과제 수. 단마다 과제가 위아래로 쌓여서 높이와 짜임은 항목 수가 아니라 이 수가 정한다
 * (과제 다섯이 모두 진행 중이면 단 하나가 다섯 줄이다)
 */
export function laneRows(tasks: { state: string; value: string }[]): number {
  const counts: Partial<Record<Lane, number>> = {}
  for (const t of tasks) {
    const lane = laneOf(t.state, readPercent(t.value))
    counts[lane] = (counts[lane] ?? 0) + 1
  }
  // 다섯 단은 세 단씩 두 줄에 놓인다. 두 줄의 높이와 두 번째 머리줄까지 확보한다.
  if (Object.keys(counts).length === 5) {
    return Math.max(counts.done ?? 0, counts.doing ?? 0, counts.late ?? 0) + Math.max(counts.todo ?? 0, counts.unknown ?? 0) + 1
  }
  return Math.max(1, ...Object.values(counts))
}

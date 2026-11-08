/*
 * 발표의 골격. 결정을 받는 보고뿐 아니라 동료와 나누는 주간 보고, 사외 제안과 교육까지 담는다.
 * 어느 구성이든 결론을 먼저 말하고(표지 다음에 한 장 요약이나 한 문장 메시지), 마지막 장에서 받을 것이나 남길 것을 분명히 한다.
 *
 * 장 안내(guide)는 편집기에서 장 옆에 짧게 보인다. 한 문장으로, 그 장을 채울 때 꼭 필요한 요령만 적는다.
 *
 * 발표 종류 하나의 구성은 blueprints/<id>.ts, 여러 종류가 같이 쓰는 장과 장의 꼴은 blueprints/recipes.ts에 있다.
 */

import { blank } from './blueprints/blank'
import { business } from './blueprints/business'
import { deal } from './blueprints/deal'
import { decide } from './blueprints/decide'
import { improve } from './blueprints/improve'
import { intro } from './blueprints/intro'
import { issue } from './blueprints/issue'
import { kickoff } from './blueprints/kickoff'
import { plan } from './blueprints/plan'
import { proposal } from './blueprints/proposal'
import type { Blueprint, Focus } from './blueprints/recipes'
import { report } from './blueprints/report'
import { research } from './blueprints/research'
import { result } from './blueprints/result'
import { study } from './blueprints/study'
import { weekly } from './blueprints/weekly'
import type { Audience, DeckType } from './types'

export type { Recipe } from './blueprints/recipes'

export const BLUEPRINTS: Record<DeckType, Blueprint> = {
  business,
  improve,
  decide,
  deal,
  proposal,
  plan,
  weekly,
  report,
  result,
  issue,
  kickoff,
  research,
  study,
  intro,
  blank,
}

/**
 * 프레임 잡기에서 고르는 묶음: 제안하는 자리, 한 일을 알리는 자리, 알고 있는 것을 나누는 자리.
 * 묶음 안은 자주 쓰는 순서.
 */
export const DECK_GROUPS: { name: string; types: DeckType[] }[] = [
  { name: '제안하고 결정받기', types: ['business', 'improve', 'decide', 'deal', 'proposal', 'plan'] },
  { name: '진행과 결과 보고하기', types: ['weekly', 'report', 'result', 'issue'] },
  { name: '알리고 나누기', types: ['kickoff', 'research', 'study', 'intro'] },
]

/**
 * 결정을 받는 발표인지. 프레임 잡기는 결정을 받는 발표에만 결정 요청을 묻고, 표지도 그런 발표에만 결정 요청 칸을 둔다.
 * 나누고 알리는 발표(examples에 ask가 없는 것)에 그 칸이 있으면 무엇을 적을지 헷갈리고, 비워 두면 표지에 빈자리가 남는다
 */
export function asksDecision(type: DeckType): boolean {
  return !!(BLUEPRINTS[type] ?? BLUEPRINTS.blank).examples.ask
}

/** 빈 발표를 뺀 모든 종류. 프레임 잡기의 묶음 순서 그대로 */
export const DECK_TYPES: DeckType[] = DECK_GROUPS.flatMap((g) => g.types)

/**
 * 듣는 사람. up은 더 챙기는 장(우선순위를 한 단계 올린다), down은 덜 챙기는 장(한 단계 내린다).
 * 우선순위 1인 장은 그대로 두고 2와 3 사이에서만 오르내린다.
 */
export const AUDIENCES: { id: Audience; name: string; description: string; up?: Focus[]; down?: Focus[] }[] = [
  { id: 'exec', name: '본부장·임원', description: '결론과 숫자 위주로, 슬라이드 수는 적게', up: ['numbers'], down: ['detail'] },
  { id: 'practitioner', name: '팀장', description: '근거와 실행 계획까지 자세히', up: ['detail'] },
  { id: 'peers', name: '팀 동료', description: '할 일과 진행 방법을 자세히', up: ['detail'], down: ['numbers'] },
  { id: 'partners', name: '다른 부서', description: '배경을 먼저 풀고, 부탁을 분명히', up: ['context'] },
  { id: 'external', name: '사외 참석자', description: '배경과 핵심을 알기 쉽게', up: ['context'] },
  { id: 'mixed', name: '여러 분이 함께', description: '요약을 먼저, 자세한 내용은 뒤에' },
]

export const DURATIONS: { minutes: number; name: string }[] = [
  { minutes: 5, name: '5분' },
  { minutes: 10, name: '10분' },
  { minutes: 20, name: '20분' },
  { minutes: 30, name: '30분 이상' },
]

export const METHODS: { id: 'live' | 'remote' | 'send'; name: string; description: string }[] = [
  { id: 'live', name: '회의실 발표', description: '화면에 띄우고 말로 설명해요' },
  { id: 'remote', name: '화상 회의', description: '온라인 회의에서 화면을 공유해요' },
  { id: 'send', name: '자료로 보내기', description: '미리 보내서 혼자 읽게 해요' },
]

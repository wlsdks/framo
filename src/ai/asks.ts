// 'AI에게 부탁'에서 고르는 부탁들. 앱과 로컬 서버 사이에는 이 목록의 id와 해시 id만 오간다.
//
// 사람이 적은 글은 부탁에 넣지 않는다. AI에게 보내는 문장도 앱이 아니라 로컬 서버가 이 파일의
// 정해진 말로 만든다. 그래서 앱에 버그가 있어도 부탁을 타고 발표 내용이 나갈 길이 없다.

import { DECK_ID, SLIDE_ID } from './protocol'

export type AskScope = 'slide' | 'deck'

/** 로컬 서버가 띄운 Claude Code가 어디까지 했는지. 도구 이름으로만 짐작한다 */
export type AskStep = 'starting' | 'looking' | 'proposing'
export type AskState = 'running' | 'done' | 'no_change' | 'failed' | 'cancelled'
export type AskError = 'busy' | 'no_agent' | 'not_shared' | 'bad_ask' | 'timeout' | 'login' | 'failed'

export interface AskRun {
  id: string
  state: AskState
  step: AskStep
  /** done일 때 AI가 보낸 제안 id */
  request?: string
  /** no_change일 때 AI가 말한 까닭. AI → 앱 쪽 글이라 발표 내용이 나가는 길이 아니다 */
  reason?: string
  error?: AskError
}

export const REASON_MAX = 280

export interface Ask {
  id: string
  scope: AskScope
  /** 화면에 보이는 이름. 하는 일을 그대로 */
  name: string
  description: string
  /** AI에게 보내는 부탁. 고칠 수 있는 것(ops)으로 할 수 있는 일만 적는다 */
  prompt: string
  /** 장 부탁 가운데 이 레이아웃의 장에만 맞는 것 (없으면 모든 장). 화면은 맞는 장에서만 보이고, 로컬 서버도 다시 확인한다 */
  layouts?: readonly string[]
}

export const ASKS = [
  {
    id: 'slide_layout',
    scope: 'slide',
    name: '더 어울리는 모양으로',
    description: '이 슬라이드에 맞는 레이아웃을 골라요',
    prompt:
      '이 장의 역할, 칸이 비었는지, 항목 수를 보고 더 잘 맞는 레이아웃이나 같은 레이아웃의 다른 모양(variant)이 있으면 바꿔 주세요. 지금 채운 칸이 새 레이아웃에도 있는지 확인하고, 없어지는 칸이 많으면 바꾸지 마세요.',
  },
  {
    id: 'slide_focus',
    scope: 'slide',
    name: '핵심이 눈에 띄게',
    description: '강조, 바탕, 모션을 골라요',
    prompt:
      '듣는 사람이 이 장에서 가장 먼저 봐야 할 것이 눈에 띄도록 강조할 항목(highlight), 장의 바탕(tone), 발표할 때 움직임(motion)을 골라 주세요. 발표 전체에서 반대 색이나 강조색 바탕이 너무 많아지지 않게 하세요.',
  },
  {
    id: 'slide_guide',
    scope: 'slide',
    name: '칸 안내 다듬기',
    description: '칸마다 쓸 것을 알려 주는 안내를 고쳐요',
    prompt:
      '이 발표의 종류와 듣는 사람에 맞게 이 장의 안내(set_guide)와 빈 칸의 안내 문구(set_hint)를 구체적으로 다듬어 주세요. 안내 문구에는 무엇을 쓰면 되는지만 적고, 회사 이름, 사람 이름, 실제처럼 보이는 숫자는 지어내지 마세요.',
  },
  {
    id: 'slide_around',
    scope: 'slide',
    name: '앞뒤에 필요한 슬라이드',
    description: '앞뒤로 빠진 슬라이드를 넣어요',
    prompt:
      '이 장 앞뒤로 보고 흐름에 꼭 필요한데 빠진 장이 있으면 넣어 주세요(add_slide). 많아야 두 장이고, 이미 비슷한 역할의 장이 있으면 넣지 마세요.',
  },
  {
    // 컴포넌트 장은 자리, 크기, 면, 이음표, 나오는 차례를 사람이 하나씩 맞춰야 해서 손이 가장 많이 간다. 글을 건드리지 않고 고칠 수 있는 것이 가장 많은 장이기도 하다
    id: 'slide_compose',
    scope: 'slide',
    name: '컴포넌트 배치 다듬기',
    description: '자리, 크기, 바탕, 연결 기호를 맞춰요',
    layouts: ['compose'],
    prompt:
      '이 부품 장(layout compose)의 짜임을 다듬어 주세요. 뜻이 이어지는 부품끼리 나란히 두고(move_block의 beside, swap), 가장 중요한 부품이 더 넓게 보이게 하세요(set_size). ' +
      '면(look)은 한 장에 한 가지로 맞추고, 이어지거나 함께이거나 견주는 두 부품 사이에만 이음표(set_link)를 끼우세요. 발표할 때 나오는 차례(set_order)는 듣는 사람이 읽을 차례에 맞추세요. ' +
      '비어 있는 부품은 빼도 되지만(remove_block) 새 부품은 꼭 필요할 때 하나까지만 넣으세요. 부품 안의 글은 바꿀 수 없어요. 자리가 모자라면(no_room) 크기를 덜 바꾸세요.',
  },
  {
    id: 'deck_flow',
    scope: 'deck',
    name: '보고 흐름 점검',
    description: '결론이 먼저 오게 슬라이드 순서를 다듬어요',
    prompt:
      '듣는 사람이 결론부터 듣도록 장 순서를 다듬고, 빠진 장은 넣고, 쓰지 않는 빈 장은 빼 주세요. 지울 때는 빈 장만 지울 수 있어요.',
  },
  {
    id: 'deck_time',
    scope: 'deck',
    name: '시간에 맞추기',
    description: '발표 시간에 맞게 슬라이드 수를 줄이거나 늘려요',
    prompt:
      '발표 시간(duration)과 발표 방식(method)에 맞게 보이는 장 수를 맞춰 주세요. 줄일 때는 지우지 말고 발표에서 빼기(set_hidden)를 쓰고, 결론과 결정 요청 장은 남겨 두세요.',
  },
  {
    id: 'deck_look',
    scope: 'deck',
    name: '테마와 모션',
    description: '듣는 사람에 맞게 테마와 모션을 골라요',
    prompt:
      '듣는 사람(audience)과 발표 방식(method)에 맞게 테마, 글꼴, 장 넘기기, 발표할 때 움직임을 골라 주세요. 장마다 바탕을 바꿀 필요가 있으면 섹션을 여는 장 위주로만 바꾸세요.',
  },
  {
    // 발표 전체를 한 편의 영화처럼: 장마다 맞는 장면을 고르되, 이야기가 쌓이도록 차례와 쉼을 같이 본다.
    // '장면 알아서 고르기'(규칙대로 장면마다 맞는 첫 장에 한 번)가 못 하는 일이다. 장 하나만 고르는 부탁은 두지 않는다:
    // 그 장에 맞는 장면은 한두 개라 움직임 탭에서 보고 누르는 편이 빠르고, 앞뒤를 봐야 하는 판단은 발표 전체에서만 선다
    id: 'deck_scenes',
    scope: 'deck',
    name: '장면 연출',
    description: '슬라이드마다 어울리는 장면을 골라 이어요',
    prompt:
      '발표 전체를 한 편의 영화처럼 연출해 주세요. 장마다 그 장에 맞는 장면(카탈로그 scenes, set_options의 scene)을 골라 이야기가 쌓이게 하세요: ' +
      '여는 장은 첫 장면, 결론과 요약은 결론 한 방, 근거는 차분하게, 가장 중요한 숫자가 있는 장에서 가장 힘을 주고(숫자가 말한다), 마지막 장은 마무리로 조용히 닫으세요. ' +
      '같은 장면이 바로 이어지면 단조로우니 흐름상 꼭 맞을 때만 잇고, 어떤 장은 장면 없이 두어 쉬어 가게 해도 좋아요. 맞는 장면이 없는 장은 건너뛰세요. ' +
      '결정을 받는 보고처럼 차분해야 하는 발표는 장면을 아껴 쓰세요. 필요하면 발표 전체의 움직임 정도와 장 넘기기(set_theme의 motion, transition), 장마다 강조할 항목(highlight)도 맞춰 주세요. 장면은 다른 설정과 섞지 말고 장면만 담은 set_options로 보내세요(한 op는 하나라도 안 되면 통째로 빠져요). 숨긴 장은 건드리지 마세요.',
  },
  {
    // 모션 그래픽: 데이터가 오가는 그림이 있는 장만 '살아 있게'. 모션 세기(생동감)는 장마다 고르는 값이고, 계속 흐르는 움직임은
    // 생동감에서만 나온다(docs/MOTION.md). 기준을 AI에게 주어, 발표의 모양만 보고 어느 장을 살릴지 고르게 한다
    id: 'deck_motion_graphics',
    scope: 'deck',
    name: '모션 그래픽 연출',
    description: '데이터가 오가는 슬라이드를 살아 있게 움직여요',
    prompt:
      '데이터나 일이 오가는 그림이 있는 장을 모션 그래픽처럼 살려 주세요. 기준: ' +
      '흐름(flow), 연결도(network), 순환(cycle), 조건별 흐름(decision), 원인 캐기(whys), 단계 표시(steps), 모이고 퍼지기(hub) 부품이 있는 부품 장만 set_options의 motion을 lively로 바꿔 그 장에서만 데이터가 계속 흐르게 하세요(모이고 퍼지기는 차분하게에서도 흘러요). ' +
      '그런 장은 발표 전체에서 셋에서 다섯 장까지만 고르고, 바로 이어 붙이지 마세요. 결정 요청, 핵심 숫자, 요약 장은 차분하게 두세요(눈이 숫자와 결론에 가야 해요). ' +
      '여러 곳의 것이 한곳으로 모이거나 한곳에서 여러 곳으로 퍼지는 내용인데 그림이 없는 부품 장이면, 그 장에 모이고 퍼지기(hub, 모이기는 variant in, 퍼지기는 out)를 add_block으로 하나 넣자고 제안해도 좋아요(빈 부품이라 글은 사람이 채워요). ' +
      '그림이 없는 부품 장에는 내용의 비유에 맞는 장면을 add_block으로 하나 넣자고 제안해도 좋아요: 묻고 답하는 장면은 대화(chat), 지금과 바뀐 뒤는 바뀌기(wipe), 흩어진 것이 정리되면 흩어진 것 모으기(gather), 여러 곳을 뒤지면 여기저기 찾기(search), 위아래로 기대어 선 구조는 층(layers), 확인하고 거르는 과정은 관문(gate), 팀마다 따로 하던 같은 일을 하나로 합치면 겹친 수고(dupes), 하나를 곳마다 다르게 부르면 같은 대상, 다른 이름(aliases). 같은 장면을 이어진 장에 거듭 넣지 마세요(장마다 다른 그림이어야 보는 맛이 있어요). ' +
      '발표 전체의 움직임 정도(set_theme의 motion)는 바꾸지 마세요. 숨긴 장은 건드리지 마세요.',
  },
] as const satisfies readonly Ask[]

export type AskId = (typeof ASKS)[number]['id']

export const ASK_IDS: readonly AskId[] = ASKS.map((a) => a.id)

export function askOf(id: unknown): (typeof ASKS)[number] | undefined {
  return ASKS.find((a) => a.id === id)
}

/** 이 장에 고를 수 있는 부탁인지 (레이아웃이 정해진 부탁) */
export function askFits(ask: Ask, layout: string | null): boolean {
  return !ask.layouts || (layout !== null && ask.layouts.includes(layout))
}

/** 부탁과 대상이 맞는지. 장 부탁에는 장 id가, 발표 전체 부탁에는 null이 와야 한다 */
export function validAsk(ask: unknown, deck: unknown, slide: unknown): ask is AskId {
  const a = askOf(ask)
  if (!a || typeof deck !== 'string' || !DECK_ID.test(deck)) return false
  return a.scope === 'slide' ? typeof slide === 'string' && SLIDE_ID.test(slide) : slide === null
}

/** 이 PC에서 Claude Code를 바로 띄울 수 없을 때, Claude Code나 Codex에 붙여 넣을 부탁 */
export function askSentence(ask: AskId, deck: string, slide: string | null): string {
  return `Framo(gyeol)에 공유한 ${slide ? `발표 ${deck}의 장 ${slide}` : `발표 ${deck}`}: ${askOf(ask)!.prompt} 바꿀 것은 check_changes로 미리 확인한 뒤 propose_changes로 제안해 줘.`
}

/** AI에게 보내는 문장. 정해진 말과 해시 id만으로 만든다 */
export function askPrompt(ask: AskId, deck: string, slide: string | null): string {
  const a = askOf(ask)!
  const target = slide ? `발표 ${deck}의 장 ${slide}` : `발표 ${deck}`
  return [
    `Framo(gyeol) 앱에서 사람이 ${target}에 대해 부탁했어요.`,
    '',
    `부탁: ${a.prompt}`,
    '',
    '지킬 것',
    '- gyeol 도구만 쓸 수 있어요. get_shape로 이 발표의 모양을, get_catalog로 레이아웃과 고를 수 있는 값을 먼저 보세요. get_catalog에는 deck을 주고, 부품 장(layout compose)이 없는 발표면 blocks를 false로 하세요.',
    '- 사람이 적은 글은 보이지 않고 바꿀 수도 없어요. 장 순서, 레이아웃과 모양, 강조, 바탕, 움직임과 장면, 테마, 안내 문구만 바꿀 수 있어요.',
    '- 바꿀 것을 모아 먼저 check_changes로 미리 돌려 보고, ok가 false인 op는 help대로 고치거나 빼세요. 그다음 propose_changes를 한 번만 부르세요. note에는 왜 이렇게 바꾸는지 듣는 사람 입장에서 한두 문장으로 쓰세요.',
    '- 지금 모양이 이미 잘 맞으면 제안을 보내지 말고, 왜 그런지 두 문장 안으로만 답하고 끝내세요. 되묻지 마세요.',
    '- 제안을 보낸 뒤에는 결과를 기다리지 말고 바로 끝내세요. 사람이 앱에서 보고 정해요.',
  ].join('\n')
}

/** MCP 프롬프트(prompts/get)로 고른 장. 해시 id 대신 장 번호(1부터, 숨긴 장도 센다)를 받는다: 사람이 Claude Desktop에서 고를 때 장 id는 모른다 */
export const PAGE_MAX = 300

/**
 * MCP 프롬프트로 고른 부탁의 문장. Claude Desktop이나 Claude Code에서 사람이 고르면 이 문장이 대화에 들어간다.
 * 'AI에게 부탁'과 달리 그 AI에는 다른 도구가 있을 수 있어서, 발표 내용을 사람에게 묻지 말라고 따로 적는다.
 * 정해진 말과 해시 id, 장 번호만으로 만든다. deck이 null이면 가장 최근에 고친 발표(list_decks의 맨 앞)
 */
export function mcpPrompt(ask: AskId, deck: string | null, page: number | null): string {
  const a = askOf(ask)!
  const which = deck ? `발표 ${deck}` : '가장 최근에 고친 발표(list_decks의 맨 앞)'
  const target = page ? `${which}의 ${page}번째 장(get_shape의 slides에서 ${page}번째)` : which
  return [
    `Framo(gyeol)에 공유한 ${target}을 다듬어 주세요.`,
    '',
    `부탁: ${a.prompt}`,
    '',
    '지킬 것',
    '- gyeol 도구로 하세요. get_shape로 이 발표의 모양을, get_catalog로 레이아웃과 고를 수 있는 값을 먼저 보세요. get_catalog에는 deck을 주고, 부품 장(layout compose)이 없는 발표면 blocks를 false로 하세요. list_decks가 비었으면 Framo 편집 화면 위쪽 ‘AI 다듬기’에서 공유를 켜 달라고만 말하고 끝내세요.',
    '- 사람이 적은 글은 보안 때문에 보이지 않고 바꿀 수도 없어요. 내용을 붙여 달라고 하지 말고 모양만으로 판단하세요.',
    '- 바꿀 것을 모아 먼저 check_changes로 미리 돌려 보고, ok가 false인 op는 help의 풀이대로 고치거나 빼세요. 그다음 propose_changes를 한 번만 부르세요. note에는 왜 이렇게 바꾸는지 듣는 사람 입장에서 한두 문장으로 쓰세요.',
    '- 지금 모양이 이미 잘 맞으면 제안을 보내지 말고 왜 그런지 두 문장 안으로 말하세요.',
    '- 제안을 보냈으면 Framo 편집 화면에 뜬 제안을 미리 보고 적용하거나 거절하면 된다고 알려 주세요.',
  ].join('\n')
}


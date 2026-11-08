// 영상으로 저장할 때의 빠르기. 영상은 받은 분이 혼자 보며 읽는 기록이라, 모션이 끝난 뒤 장에 보이는 글을 읽을 만큼 머문다.
// 모든 장에 같은 1.8초를 두던 때는 네 줄짜리 요약이 3초 만에 지나가 읽을 수 없었다.
// 녹화(Present.tsx)와 녹화를 묻는 창의 걸리는 시간(recordTime)이 이 셈 하나를 같이 쓴다: 어림과 실제가 따로 놀지 않게
import { shownChars } from '../deck/fields'
import type { Deck, Slide } from '../deck/types'

/** 다 보인 장을 한 번 훑어보는 시간. 글이 거의 없는 장(단락 표지)도 이만큼은 둔다 */
const GLANCE_MS = 2500
/**
 * 글자 하나를 읽는 시간. 소리 내지 않고 읽는 빠르기(1초에 10자 남짓)에 맞추되, 모션이 도는 동안 먼저 읽기 시작하므로
 * 조금 짧게 잡는다. 140자짜리 요약 장이면 모션까지 14초쯤
 */
const READ_MS_PER_CHAR = 70
/** 글이 아주 많은 장도 이보다 오래 두지 않는다: 더 읽을 분은 영상을 멈추면 된다 */
const LONGEST_MS = 15_000
/** 마지막 장은 영상이 갑자기 끝나지 않게 더 머문다 */
const LAST_EXTRA_MS = 2000
const LAST_MIN_MS = 5000
/** '누르면' 나오는 컴포넌트 사이: 새로 나온 것을 알아볼 만큼만 짧게. 장을 읽는 시간은 다 나온 뒤에 준다 */
export const STEP_HOLD_MS = 900
/** 다음 장으로 넘긴 뒤 모션을 재기 시작할 때까지 (장 넘기기가 시작되는 동안) */
export const TURN_MS = 500
/** 녹화를 시작하고 첫 장을 움직이기까지 */
export const START_MS = 400
/**
 * 어림에만 쓰는 값: 장 하나가 넘어와 모션이 끝나기까지(장 넘기기, 모션, 끝났는지 재는 시간). 예시 발표 17장을 녹화해 보니
 * 장마다 평균 1.3초였다(TURN_MS 포함)
 */
const ENTER_MS = 1300
/** 어림에만 쓰는 값: '누르면' 나오는 컴포넌트 하나가 나오는 모션 */
const STEP_MOTION_MS = 600

/** 모션이 다 끝난 장을 보여 두는 시간(ms). chars는 장에 보이는 글자 수, last는 마지막 장인지 */
export function holdMs(chars: number, last: boolean): number {
  const ms = Math.min(LONGEST_MS, GLANCE_MS + Math.max(0, chars) * READ_MS_PER_CHAR)
  return last ? Math.max(LAST_MIN_MS, ms + LAST_EXTRA_MS) : ms
}

/** 녹화하는 장 하나를 보여 두는 시간. 녹화와 어림이 같이 쓴다 */
export function slideHoldMs(deck: Deck, slide: Slide, last: boolean): number {
  return holdMs(shownChars(slide, deck.meta), last)
}

/** 장에서 '누르면' 나오는 차례의 수: 누르면 나오는 컴포넌트, 항목이 하나씩 나오는 컴포넌트의 둘째 항목부터 */
function steps(slide: Slide): number {
  if (slide.layout !== 'compose') return 0
  return (slide.blocks ?? []).reduce((n, b) => n + (b.when === 'click' ? 1 : 0) + (b.reveal === 'each' ? Math.max(0, b.items.length - 1) : 0), 0)
}

/** 발표하는 장들(뺀 장 빼고)을 영상으로 저장하는 데 걸리는 어림 시간(초) */
export function recordSeconds(deck: Deck, slides: readonly Slide[]): number {
  const ms = slides.reduce(
    (sum, s, i) => sum + ENTER_MS + steps(s) * (STEP_MOTION_MS + STEP_HOLD_MS) + slideHoldMs(deck, s, i === slides.length - 1),
    START_MS,
  )
  return ms / 1000
}

/** 걸리는 시간을 말로: 40초, 1분, 3분. 1분 반쯤부터는 분으로 반올림한다 */
export function recordTime(seconds: number): string {
  return seconds < 55 ? `${Math.max(10, Math.round(seconds / 10) * 10)}초` : `${Math.max(1, Math.round(seconds / 60))}분`
}

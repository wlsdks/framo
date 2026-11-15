// 저울의 셈: 두 쪽의 값에서 저울대의 기울기와 차이를 읽는다. 그리기는 blocks/Weigh.tsx, 모양은 styles/blocks/weigh.css,
// 움직임은 motion/engine.ts의 nativeAuto

import { formatNumber } from './numbers'

/**
 * 저울대가 끝까지 기울었을 때의 기울기(높이 ÷ 너비, 7도 남짓). 이보다 가파르면 넓은 칸에서 내려간 쪽의 글이 칸 아래로 나가고,
 * 완만하면 3~5m에서 기울기가 아니라 비뚤게 그은 선으로 읽힌다. weigh.css의 --wg-slope와 같은 값
 */
const WEIGH_SLOPE = 0.12
/**
 * 조금이라도 다르면 이만큼은 기운다(끝까지 기운 것의 몫, 2도 남짓). 차이에 그대로 비례하면 102와 100은 0.1도라 수평으로 보여
 * '같다'고 읽힌다: 이 그림의 답은 어느 쪽이 무거운가라, 다르면 다르게 보여야 한다
 */
const TILT_MIN = 0.3
/**
 * 무거운 쪽이 가벼운 쪽의 이 배수면 끝까지 기운다. 그 뒤로는 더 기울지 않는다(세 배와 서른 배가 같은 기울기다):
 * 얼마나 더 무거운지는 저울대 아래의 차이가 말한다
 */
const TILT_FULL = 3

interface WeighFigure {
  /** 기울기: −1(왼쪽이 끝까지 내려감)에서 1(오른쪽이 끝까지 내려감). 0이면 수평 */
  tilt: number
  /** 무거운 쪽: 0은 왼쪽, 1은 오른쪽. 두 값이 같으면 null(답이 없다) */
  heavy: 0 | 1 | null
  /**
   * 왼쪽만 올렸을 때의 기울기(0 또는 −1). 발표할 때 왼쪽이 먼저 놓이는 동안 저울대가 가 있는 곳이다:
   * 오른쪽이 비었으니 왼쪽이 얼마든 끝까지 내려간다
   */
  first: number
}

/**
 * 두 값에서 저울을 셈한다. 값을 하나라도 모르거나(null) 0보다 작으면 null: 무게는 0 이상이고, 모르는 쪽을 0으로 치면
 * 적지 않은 쪽이 진 것처럼 기운다. 기울기는 두 값의 몫의 차이((큰 값 − 작은 값) ÷ 합)를 따르고 TILT_FULL배에서 멈춘다
 */
export function weighFigure(a: number | null, b: number | null): WeighFigure | null {
  if (a === null || b === null || !Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b < 0) return null
  const first = a > 0 ? -1 : 0
  if (a === b) return { tilt: 0, heavy: null, first }
  const share = Math.abs(b - a) / (a + b)
  const full = (TILT_FULL - 1) / (TILT_FULL + 1)
  const size = TILT_MIN + (1 - TILT_MIN) * Math.min(1, share / full)
  return { tilt: b > a ? size : -size, heavy: b > a ? 1 : 0, first }
}

/** 저울대의 각도(도). 양수면 오른쪽이 내려간다 */
export const weighAngle = (tilt: number) => (Math.atan(WEIGH_SLOPE * tilt) * 180) / Math.PI

/**
 * 차이를 말하는 한마디. 두 배부터는 몇 배인지('2.8배'), 그 밑은 얼마나 더 큰지('+500만 원', 둘 다 %면 '+12%p'):
 * 1.2배는 귀에 들어오지 않고, 서른 배 차이를 '+2,900'이라고 하면 얼마나 큰 차이인지 견줄 것이 없다.
 * 가벼운 쪽이 0이면 몇 배라고 할 수 없고 차이는 무거운 쪽의 값 그대로라 말하지 않는다. 같으면 빈 글
 */
export function weighGap(a: number, b: number, suffix: string): string {
  const [light, heavy] = a < b ? [a, b] : [b, a]
  if (!(heavy > light) || !(light > 0)) return ''
  const ratio = heavy / light
  if (ratio >= 2) {
    const shown = ratio < 10 ? Math.round(ratio * 10) / 10 : Math.round(ratio)
    return Number.isFinite(shown) ? `${formatNumber(shown)}배` : ''
  }
  const diff = formatNumber(heavy - light)
  // 반올림해 0이 되는 차이는 말하지 않는다('+0')
  if (diff === '0') return ''
  return `+${diff}${/^\s*(?:%|％|퍼센트|프로)\s*$/.test(suffix) ? '%p' : suffix}`
}

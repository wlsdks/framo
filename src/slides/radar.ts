// 방사형 비교(radar) 부품의 셈: 축의 방향, 그림이 차지하는 자리, 눈금의 끝(만점), 강조할 기준. 그리기는 blocks/Radar.tsx

/** 축 하나의 방향(길이 1). 화면 좌표라 y는 아래가 +다 */
type RadarAxis = { x: number; y: number }

const round = (v: number) => Math.round(v * 1e6) / 1e6

/** 축의 방향: 첫 기준이 맨 위(12시)에 서고 시계 방향으로 고르게 돈다. 읽는 차례(위에서 오른쪽으로)와 적은 차례가 같다 */
export function radarAxes(n: number): RadarAxis[] {
  return Array.from({ length: n }, (_, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n
    return { x: round(Math.cos(a)), y: round(Math.sin(a)) }
  })
}

/**
 * 바깥 틀(축 끝을 이은 다각형)이 가운데에서 뻗는 만큼: 옆으로 xm, 아래로 ym (반지름 1에 견준 몫. 위로는 늘 1: 첫 축이 맨 위).
 * 세 기준이면 아래로 0.5, 옆으로 0.87만 써서, 원으로 자리를 잡으면 그림 아래와 옆이 비었다. 그림 상자를 이 몫에 딱 맞춘다
 */
export function radarBox(axes: readonly RadarAxis[]): { xm: number; ym: number } {
  return { xm: Math.max(0.01, ...axes.map((a) => Math.abs(a.x))), ym: Math.max(0.01, ...axes.map((a) => a.y)) }
}

/**
 * 눈금의 끝(만점). 적었으면 적은 값. 비웠으면 가장 큰 값을 담는 흔한 만점: 1, 5, 10, 100(5점 척도, 10점 척도, 백분율과 100점).
 * 그보다 크면 1, 2, 5로 시작하는 수. 가장 큰 값에 맞춰 버리면(4.4면 4.4) 가장 높은 기준이 늘 틀에 닿아 만점처럼 읽힌다
 */
export function radarMax(values: readonly number[], explicit: number | null): number {
  if (explicit !== null && Number.isFinite(explicit) && explicit > 0) return explicit
  const hi = Math.max(0, ...values.filter((v) => Number.isFinite(v)))
  for (const step of [1, 5, 10, 100]) if (hi <= step) return step
  const pow = 10 ** Math.floor(Math.log10(hi))
  for (const m of [1, 2, 5, 10]) if (hi <= m * pow) return m * pow
  return hi
}

/** 축 위에서 값이 서는 자리(0~1). 만점을 넘는 값은 틀에 닿은 데까지만 그린다(숫자는 적은 그대로 보인다) */
export function radarRatio(value: number, max: number): number {
  if (!(max > 0) || !Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value / max))
}

/**
 * 강조할 기준(없으면 -1). 사람이 고른 것이 먼저다(-1은 강조하지 않기). 고르지 않았으면 모양이 정한다: 가장 낮은 기준(low, 손볼 곳)이나
 * 가장 높은 기준(high, 내세울 곳). 같은 값이 여럿이면 앞의 것. 모든 값이 같으면 짚을 답이 없어 강조하지 않는다
 */
export function radarPick(values: readonly (number | null)[], variant: 'low' | 'high', chosen: unknown): number {
  if (typeof chosen === 'number' && Number.isInteger(chosen)) return chosen >= 0 && chosen < values.length ? chosen : -1
  const known = values.flatMap((v, i) => (v === null ? [] : [{ v, i }]))
  if (known.length < 2 || known.every((k) => k.v === known[0].v)) return -1
  return known.reduce((best, k) => ((variant === 'low' ? k.v < best.v : k.v > best.v) ? k : best)).i
}

/** 그림(viewBox)의 반지름. 틀의 자리는 가운데 (xm × R, R)이고 그림 상자는 2·xm·R × (1 + ym)·R */
export const RADAR_R = 100

/** 축마다의 몫(0~1)을 이은 다각형의 꼭짓점들 (viewBox 좌표, SVG points) */
export function radarPoints(axes: readonly RadarAxis[], ratios: readonly number[], xm: number): string {
  return axes.map((a, i) => `${round(xm * RADAR_R + a.x * RADAR_R * (ratios[i] ?? 0))},${round(RADAR_R + a.y * RADAR_R * (ratios[i] ?? 0))}`).join(' ')
}

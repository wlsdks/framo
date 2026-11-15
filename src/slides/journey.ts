// 여정 곡선(journey)의 셈: 단계마다의 값에서 곡선의 높낮이, 가장 낮은 곳, 글이 곡선을 비켜 설 자리. 그리기는 blocks/Journey.tsx

/** 곡선을 그리는 판(viewBox). 그림은 칸에 맞춰 늘어나므로(preserveAspectRatio none) 숫자의 크기는 뜻이 없고 자릿수만 넉넉하면 된다 */
export const JOURNEY_BOX = 1000

/**
 * 가장 높은 값과 낮은 값의 차이가 이 몫(가장 큰 값의 크기에 대한)보다 작으면 곡선을 판 높이만큼 부풀리지 않는다.
 * 4.2와 4.0을 위 끝과 바닥에 놓으면 별 차이 없는 단계가 깊은 골짜기로 보이고, 그 골짜기를 '여기가 막힌다'고 발표하게 된다
 */
const FLAT_SHARE = 0.35

/**
 * 이름표와 값이 차지하는 너비(단계 한 칸의 너비에 대한 몫의 절반): 좁은 칸과 넓은 칸. journey.css의 --jr-lab-w, --jr-val-w, --jr-low-w와
 * 같은 값이다(가장 낮은 단계의 값은 크게 그려서 더 넓다)
 */
const LABEL_HALF = { narrow: 0.46, wide: 0.37 }
const VALUE_HALF = { narrow: 0.3, wide: 0.17 }
const LOW_VALUE_HALF = { narrow: 0.34, wide: 0.22 }
/** 넓은 칸에서 이름표가 옆으로 비킬 수 있는 가장 먼 거리(단계 한 칸에 대한 몫): 이웃 이름표와 닿지 않는 만큼(0.37 + 0.12 < 0.5) */
const LEAN_MAX = 0.12
/**
 * 기대서 이름표가 이만큼(띠 높이에 대한 몫)은 올라가야 기댄다. 평평한 양 끝과 봉우리는 기대도 조금밖에 못 올라가는데, 그만큼을 얻자고
 * 옮기면 값은 점 위 가운데, 이름은 점에서 옆으로 비켜 서서 한 단계의 글이 두 축에 선다(대충 놓은 것처럼 보였다)
 */
const LEAN_GAIN = 0.08

interface Point {
  x: number
  y: number
}

interface Seat {
  /** 좁은 칸, 넓은 칸에서의 자리(0~1, 위에서부터) */
  narrow: number
  wide: number
}

interface JourneyFigure {
  /** 단계마다 점의 자리(0~1): x는 단계 칸의 가운데, y는 위에서부터(가장 높은 값이 0) */
  pts: Point[]
  /** 가장 낮은 단계인지. 값이 모두 같으면(골짜기가 없다) 모두 false */
  low: boolean[]
  /** 곡선의 길(viewBox 0 0 JOURNEY_BOX JOURNEY_BOX). 판의 왼쪽 끝에서 오른쪽 끝까지 */
  d: string
  /** 단계마다 이름표의 윗선: 이름표 너비 안에서 곡선이 가장 낮게 내려오는 높이. 여기서부터 아래로 글을 두면 곡선과 겹치지 않는다 */
  under: Seat[]
  /** 넓은 칸에서 이름표를 옆으로 비키는 만큼(단계 한 칸의 너비에 대한 몫, 왼쪽이 −): 비탈에 선 단계는 오르막 쪽으로 기대야 제 점 가까이에 선다 */
  lean: number[]
  /** 단계마다 값의 아랫선: 값 너비 안에서 곡선이 가장 높이 올라가는 높이 */
  over: Seat[]
}

/**
 * 점마다의 기울기. 이웃한 두 구간이 같은 쪽으로 기울면 두 기울기의 조화 평균, 꺾이는 곳(봉우리, 골짜기)과 양 끝은 0.
 * 이렇게 잡으면 삼차 곡선이 점과 점 사이에서 넘치지 않는다(값보다 더 깊은 골짜기나 더 높은 봉우리를 그리지 않는다):
 * 곡선의 가장 낮은 곳이 곧 가장 낮은 단계의 점이라야 그 점에 찍은 강조가 맞는 말이 된다
 */
function slopes(pts: readonly Point[]): number[] {
  const n = pts.length
  const d = pts.slice(1).map((p, i) => (p.y - pts[i].y) / (p.x - pts[i].x))
  return pts.map((_, i) => {
    if (i === 0 || i === n - 1) return 0
    const [a, b] = [d[i - 1], d[i]]
    return a * b <= 0 ? 0 : (2 * a * b) / (a + b)
  })
}

/** 구간 k(점 k에서 k+1까지)의 x에서의 높이: 삼차 에르미트 보간 */
function heightAt(pts: readonly Point[], m: readonly number[], k: number, x: number): number {
  const [p, q] = [pts[k], pts[k + 1]]
  const w = q.x - p.x
  const t = Math.min(1, Math.max(0, (x - p.x) / w))
  const t2 = t * t
  const t3 = t2 * t
  return (2 * t3 - 3 * t2 + 1) * p.y + (t3 - 2 * t2 + t) * w * m[k] + (-2 * t3 + 3 * t2) * q.y + (t3 - t2) * w * m[k + 1]
}

/** 곡선의 x에서의 높이. 첫 점 앞과 마지막 점 뒤는 그 점의 높이 그대로(판의 끝까지 평평하게 이어진다) */
function curveAt(pts: readonly Point[], m: readonly number[], x: number): number {
  const n = pts.length
  if (x <= pts[0].x) return pts[0].y
  if (x >= pts[n - 1].x) return pts[n - 1].y
  let k = 0
  while (k < n - 2 && x > pts[k + 1].x) k++
  return heightAt(pts, m, k, x)
}

/** from에서 to까지 곡선이 지나는 높이의 가장 위와 가장 아래 */
function reach(pts: readonly Point[], m: readonly number[], from: number, to: number): { top: number; bottom: number } {
  let top = Infinity
  let bottom = -Infinity
  const steps = 24
  for (let i = 0; i <= steps; i++) {
    const y = curveAt(pts, m, from + ((to - from) * i) / steps)
    top = Math.min(top, y)
    bottom = Math.max(bottom, y)
  }
  return { top, bottom }
}

const r1 = (v: number) => Math.round(v * 10) / 10

/**
 * 단계마다의 값에서 그림을 셈한다. 값을 하나라도 모르면(null) 높낮이를 말할 수 없으므로 평평한 선에 강조 없이:
 * 빠진 단계를 이웃 값으로 이어 그리면 재지 않은 단계에도 체감이 있었던 것처럼 보인다.
 * 값이 높을수록 위. 가장 높은 값이 판의 위 끝이고, 가장 낮은 값은 차이가 충분할 때만 바닥까지 내려간다(FLAT_SHARE)
 */
export function journeyFigure(values: readonly (number | null)[]): JourneyFigure {
  const n = values.length
  const known = values.every((v): v is number => v !== null && Number.isFinite(v))
  const nums = known ? (values as readonly number[]) : values.map(() => 0)
  const hi = Math.max(...nums)
  const lo = Math.min(...nums)
  const span = Math.max(hi - lo, FLAT_SHARE * Math.max(Math.abs(hi), Math.abs(lo)))
  const pts = nums.map((v, i) => ({ x: (i + 0.5) / n, y: span > 0 && Number.isFinite(span) ? (hi - v) / span : 0 }))
  const m = slopes(pts)
  const low = nums.map((v) => known && hi > lo && v === lo)

  // 길: 판의 왼쪽 끝에서 첫 점까지, 마지막 점에서 오른쪽 끝까지는 평평하게(양 끝의 기울기가 0이라 꺾이지 않고 이어진다).
  // 삼차 에르미트 구간은 조절점을 구간의 3분의 1에 둔 베지에 곡선과 같다
  const px = (p: Point) => `${r1(p.x * JOURNEY_BOX)} ${r1(p.y * JOURNEY_BOX)}`
  let d = `M 0 ${r1(pts[0].y * JOURNEY_BOX)} L ${px(pts[0])}`
  for (let k = 0; k < n - 1; k++) {
    const [p, q] = [pts[k], pts[k + 1]]
    const w = (q.x - p.x) / 3
    d += ` C ${px({ x: p.x + w, y: p.y + w * m[k] })}, ${px({ x: q.x - w, y: q.y - w * m[k + 1] })}, ${px(q)}`
  }
  d += ` L ${JOURNEY_BOX} ${r1(pts[n - 1].y * JOURNEY_BOX)}`

  const col = 1 / n
  const seat = (p: Point, half: { narrow: number; wide: number }, side: 'top' | 'bottom'): Seat => ({
    narrow: reach(pts, m, p.x - half.narrow * col, p.x + half.narrow * col)[side],
    wide: reach(pts, m, p.x - half.wide * col, p.x + half.wide * col)[side],
  })
  // 넓은 칸의 이름표: 제 점 바로 아래(가운데)에서 시작해 양옆으로 조금씩 비켜 보며 곡선이 가장 덜 내려오는 자리를 고른다.
  // 가운데에만 두면 가파른 비탈의 단계는 이름표가 점에서 멀리 떨어져(곡선이 이름표 너비의 한쪽 끝에서 한참 내려가 있다) 어느 점의 글인지 흐려진다.
  // 봉우리와 골짜기, 평평한 곳은 가운데가 가장 좋아 그대로 선다(올라가는 만큼이 LEAN_GAIN에 못 미치면 옮기지 않는다)
  const under: Seat[] = []
  const lean: number[] = []
  for (const p of pts) {
    const at = (s: number) => reach(pts, m, p.x + (s - LABEL_HALF.wide) * col, p.x + (s + LABEL_HALF.wide) * col).bottom
    let best = 0
    let bottom = at(0)
    for (let k = 1; k <= 8; k++) {
      for (const s of [(-LEAN_MAX * k) / 8, (LEAN_MAX * k) / 8]) {
        const y = at(s)
        if (y < bottom - 0.004) {
          best = s
          bottom = y
        }
      }
    }
    const worth = at(0) - bottom >= LEAN_GAIN
    under.push({ narrow: seat(p, LABEL_HALF, 'bottom').narrow, wide: worth ? bottom : at(0) })
    lean.push(worth ? best : 0)
  }
  return { pts, low, d, under, lean, over: pts.map((p, i) => seat(p, low[i] ? LOW_VALUE_HALF : VALUE_HALF, 'top')) }
}

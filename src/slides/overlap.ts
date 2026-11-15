// 겹침(overlap) 부품의 셈: 두 원의 반지름, 중심 사이 거리, 겹친 부분(렌즈)의 꼴, 겹친 몫. 그리기는 blocks/Overlap.tsx

/**
 * 두 원의 그림. 길이는 큰 원의 반지름을 1로 본 몫이고, 왼쪽 원(a)의 가운데가 (0, 0), 오른쪽 원(b)의 가운데가 (d, 0)이다.
 * kind: apart는 떨어져 선 것(겹침 0), cross는 걸쳐 겹친 것, inside는 작은 원이 큰 원 안에 다 든 것
 */
interface OverlapFigure {
  ra: number
  rb: number
  d: number
  kind: 'apart' | 'cross' | 'inside'
}

/**
 * 겹침이 0일 때 두 원 사이의 틈. 맞닿게 두면 한 점에서 겹친 것처럼 읽힌다. 큰 원 반지름의 14%(지름 520px에 36px)였을 때는
 * 3~5m 떨어진 자리에서 맞닿은 것으로 보였다(검수)
 */
const GAP = 0.28
/** 크기가 0보다 큰 집단의 가장 작은 반지름. 넓이 0.6%: 그보다 작은 집단도 '아주 작은 몫'으로는 보여야 한다 */
const MIN_R = 0.08
/**
 * 겹친 수가 0보다 크면 렌즈의 가장 좁은 폭. 그보다 얇으면 떨어진 것과 구별되지 않는다 (크기가 같은 두 원이면 넓이 0.6%쯤).
 * 작은 원의 반지름의 3할을 넘기지는 않는다: 아주 작은 집단에서는 이 폭이 그 원의 절반을 덮는다
 */
const MIN_LENS = 0.06
/** 안에 든 원이 큰 원의 테두리에서 떨어지는 만큼: 테두리에 붙이면 걸쳐 겹친 것으로도 읽힌다 */
const TUCK = 0.06

/**
 * 반지름 ra, rb인 두 원의 가운데가 d만큼 떨어졌을 때 겹친 부분(렌즈)의 넓이. 떨어져 있으면 0, 한쪽이 다 들어가 있으면 작은 원의 넓이.
 * 그 사이는 두 부채꼴에서 가운데 연(네모)을 뺀 넓이다
 */
function lensArea(ra: number, rb: number, d: number): number {
  if (!(ra > 0) || !(rb > 0)) return 0
  if (d >= ra + rb) return 0
  if (d <= Math.abs(ra - rb)) return Math.PI * Math.min(ra, rb) ** 2
  const a = Math.acos(Math.min(1, Math.max(-1, (d * d + ra * ra - rb * rb) / (2 * d * ra))))
  const b = Math.acos(Math.min(1, Math.max(-1, (d * d + rb * rb - ra * ra) / (2 * d * rb))))
  const kite = 0.5 * Math.sqrt(Math.max(0, (-d + ra + rb) * (d + ra - rb) * (d - ra + rb) * (d + ra + rb)))
  return ra * ra * a + rb * rb * b - kite
}

/**
 * 두 집단의 크기(a, b)와 겹친 수(both)로 그림을 정한다. 원의 넓이는 집단의 크기에 비례하고(반지름은 크기의 제곱근), 가운데 사이
 * 거리는 렌즈의 넓이가 겹친 수에 비례하게 푼다: 렌즈의 넓이는 거리가 멀수록 줄기만 해서, 거리를 반씩 좁혀 찾는다(이분법).
 * 어림한 거리로 그리면(겹친 몫만큼 반지름을 당기기 같은) 10%가 겹친 그림이 25%쯤으로 보인다.
 * 그릴 수 없으면 null: 읽지 못한 값, 음수, 둘 다 0, 겹친 수가 어느 한 집단보다 큰 것(있을 수 없는 수)
 */
export function overlapFigure(a: number | null, b: number | null, both: number | null): OverlapFigure | null {
  if (a === null || b === null || both === null) return null
  if (![a, b, both].every((v) => Number.isFinite(v) && v >= 0)) return null
  const big = Math.max(a, b)
  const small = Math.min(a, b)
  if (!(big > 0) || both > small * (1 + 1e-9)) return null
  const radius = (v: number) => (v > 0 ? Math.max(MIN_R, Math.sqrt(v / big)) : 0)
  const ra = radius(a)
  const rb = radius(b)
  // 한쪽이 0이면 그 원은 없다: 남은 원 하나만 선다
  if (!(small > 0)) return { ra, rb, d: 0, kind: 'apart' }
  if (!(both > 0)) return { ra, rb, d: ra + rb + GAP, kind: 'apart' }
  if (both >= small * (1 - 1e-9)) {
    const room = Math.abs(ra - rb)
    return { ra, rb, d: room - Math.min(TUCK, room / 2), kind: 'inside' }
  }
  const target = (Math.PI * both) / big
  let near = Math.abs(ra - rb)
  let far = ra + rb
  for (let i = 0; i < 60; i++) {
    const mid = (near + far) / 2
    if (lensArea(ra, rb, mid) > target) near = mid
    else far = mid
  }
  return { ra, rb, d: Math.min((near + far) / 2, ra + rb - Math.min(MIN_LENS, 0.3 * Math.min(ra, rb))), kind: 'cross' }
}

/** 그림이 차지하는 자리: 왼쪽 끝(left, 왼쪽 원의 가운데에서 잰 것), 너비, 높이. 두 원의 가운데는 같은 높이에 선다 */
export function overlapBox(f: OverlapFigure): { left: number; width: number; height: number } {
  // 크기가 0인 집단의 원은 없으므로 자리를 세지 않는다
  const lefts = [...(f.ra > 0 ? [-f.ra] : []), ...(f.rb > 0 ? [f.d - f.rb] : [])]
  const rights = [...(f.ra > 0 ? [f.ra] : []), ...(f.rb > 0 ? [f.d + f.rb] : [])]
  const left = Math.min(...lefts)
  return { left, width: Math.max(...rights) - left, height: 2 * Math.max(f.ra, f.rb) }
}

const round = (v: number) => Math.round(v * 1000) / 1000

/**
 * 겹친 부분의 테두리(SVG path의 d). k는 반지름 1의 길이, (ox, oy)는 왼쪽 원의 가운데. 떨어져 있으면 빈 글.
 * 걸쳐 겹친 렌즈는 두 원이 만나는 위아래 두 점을 왼쪽 원의 호(오른쪽으로 부푼)와 오른쪽 원의 호(왼쪽으로 부푼)로 잇는다.
 * 만나는 줄이 그 원의 가운데를 넘어가면(작은 원이 거의 다 들어간 때) 그 원의 호는 반 바퀴보다 길다(large-arc)
 */
export function lensPath(f: OverlapFigure, k: number, ox: number, oy: number): string {
  if (f.kind === 'apart') return ''
  if (f.kind === 'inside') {
    // 안에 든 원이 통째로 겹친 부분이다
    const inner = f.ra <= f.rb ? { x: 0, r: f.ra } : { x: f.d, r: f.rb }
    const cx = ox + inner.x * k
    const r = round(inner.r * k)
    return `M${round(cx - inner.r * k)} ${round(oy)}A${r} ${r} 0 1 1 ${round(cx + inner.r * k)} ${round(oy)}A${r} ${r} 0 1 1 ${round(cx - inner.r * k)} ${round(oy)}Z`
  }
  const x = (f.d * f.d + f.ra * f.ra - f.rb * f.rb) / (2 * f.d)
  const y = Math.sqrt(Math.max(0, f.ra * f.ra - x * x))
  const px = round(ox + x * k)
  return `M${px} ${round(oy - y * k)}A${round(f.ra * k)} ${round(f.ra * k)} 0 ${x < 0 ? 1 : 0} 1 ${px} ${round(oy + y * k)}A${round(f.rb * k)} ${round(f.rb * k)} 0 ${x > f.d ? 1 : 0} 1 ${px} ${round(oy - y * k)}Z`
}

/** 겹친 수가 그 집단에서 차지하는 몫(%). 집단이 0이거나 읽지 못했으면 null */
export function overlapShare(both: number | null, group: number | null): number | null {
  if (both === null || group === null || !(group > 0) || !(both >= 0) || both > group * (1 + 1e-9)) return null
  return Math.min(100, (both / group) * 100)
}

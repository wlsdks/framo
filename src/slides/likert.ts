// 설문 결과(likert) 부품의 셈: 답의 단계, 질문마다의 몫(합 100), 모든 질문이 같이 쓰는 가운데 선. 그리기는 blocks/Likert.tsx

/** 단계 수의 범위: 둘(아니다, 그렇다)부터 일곱까지. 그보다 많으면 칸이 좁아 몫을 읽을 수 없다 */
export const LIKERT_MIN = 2
export const LIKERT_MAX = 7

/** 단계 이름을 비웠을 때의 흔한 이름 (부정에서 긍정 차례) */
const DEFAULT_NAMES: Record<number, string[]> = {
  2: ['아니다', '그렇다'],
  3: ['아니다', '보통', '그렇다'],
  4: ['전혀 아니다', '아니다', '그렇다', '매우 그렇다'],
  5: ['전혀 아니다', '아니다', '보통', '그렇다', '매우 그렇다'],
  6: ['전혀 아니다', '아니다', '조금 아니다', '조금 그렇다', '그렇다', '매우 그렇다'],
  7: ['전혀 아니다', '아니다', '조금 아니다', '보통', '조금 그렇다', '그렇다', '매우 그렇다'],
}

/** 적은 단계 이름. 이름 안에 띄어 쓰기가 있어서('매우 그렇다') 쉼표, 가운뎃점, 빗금으로만 나눈다 */
function namesIn(text: string): string[] {
  return text
    .split(/\s*[,·/|]\s*/)
    .map((t) => t.trim())
    .filter(Boolean)
}

const clamp = (n: number) => Math.min(LIKERT_MAX, Math.max(LIKERT_MIN, n))

/**
 * 단계 수: 단계 이름을 적었으면 그 수, 비웠으면 질문들이 적은 값의 수 가운데 가장 많은 것(질문 하나가 덜 적었어도 나머지를 따른다),
 * 아무것도 없으면 5. values는 질문마다 읽은 값들
 */
export function likertLevels(scale: string, values: readonly (readonly unknown[])[]): number {
  const named = namesIn(scale).length
  if (named) return clamp(named)
  const counts = new Map<number, number>()
  for (const v of values) if (v.length) counts.set(v.length, (counts.get(v.length) ?? 0) + 1)
  let best = 0
  let seen = 0
  for (const [n, c] of counts) if (c > seen || (c === seen && n > best)) [best, seen] = [n, c]
  return best ? clamp(best) : 5
}

/**
 * 단계 이름: 적은 이름(단계 수까지), 비웠으면 단계 수에 맞는 흔한 이름. 적은 이름이 단계 수보다 적으면(이름 하나만 적어 두 단계가
 * 된 때) 모자란 자리는 흔한 이름으로 채운다: 색 표시가 막대의 칸 수보다 적으면 어느 칸이 무엇인지 읽히지 않는다
 */
export function likertNames(scale: string, levels: number): string[] {
  const named = namesIn(scale)
  const usual = DEFAULT_NAMES[levels] ?? []
  return usual.map((name, i) => named[i] ?? name)
}

/**
 * 합계 칸의 머리: 강조하는 쪽에서 가운데에 가장 가까운 단계의 이름에 '이상'(긍정)이나 '이하'(부정)를 붙인다('그렇다 이상').
 * 설문 결과를 말할 때 흔히 쓰는 꼴이고, 적은 단계 이름을 그대로 써서 어느 답까지 더한 합계인지가 보인다. 그쪽 단계가 하나뿐이면 그 이름
 */
export function likertHead(names: readonly string[], hot: 'neg' | 'pos'): string {
  const at = likertSides(names.length)
    .map((side, i) => (side === hot ? i : -1))
    .filter((i) => i >= 0)
  if (!at.length) return ''
  const near = names[hot === 'pos' ? at[0] : at[at.length - 1]]
  return at.length > 1 ? `${near} ${hot === 'pos' ? '이상' : '이하'}` : near
}

export type LikertSide = 'neg' | 'neu' | 'pos'

/** 단계마다 어느 쪽인지: 앞 반은 부정, 뒤 반은 긍정, 홀수면 가운데 하나가 보통 */
export function likertSides(levels: number): LikertSide[] {
  const half = Math.floor(levels / 2)
  return Array.from({ length: levels }, (_, i) => (i < half ? 'neg' : levels % 2 && i === half ? 'neu' : 'pos'))
}

export type LikertRow = { shares: number[]; neg: number; neu: number; pos: number }

/**
 * 한 질문의 몫: 단계마다 적은 값을 합 100으로 맞춘 것(비율로 적어도, 응답 수로 적어도 된다)과 부정, 보통, 긍정의 합.
 * 값 수가 단계 수와 다르거나, 읽을 수 없거나 음수인 값이 있거나, 합이 0이면 null(그 질문은 막대를 그리지 않는다)
 */
export function likertRow(values: readonly (number | null)[], levels: number): LikertRow | null {
  if (values.length !== levels || values.some((v) => v === null || !Number.isFinite(v) || v < 0)) return null
  const nums = values as number[]
  const sum = nums.reduce((a, b) => a + b, 0)
  if (!(sum > 0)) return null
  const shares = nums.map((v) => (v / sum) * 100)
  const sides = likertSides(levels)
  const total = (side: LikertSide) => shares.reduce((a, s, i) => a + (sides[i] === side ? s : 0), 0)
  return { shares, neg: total('neg'), neu: total('neu'), pos: total('pos') }
}

/**
 * 가운데 선의 자리: 모든 질문의 막대가 같은 0 선에서 갈라진다. 보통은 0 선에 반씩 걸친다. left는 0 선 왼쪽으로 가장 긴 몫(부정과
 * 보통의 반), right는 오른쪽으로 가장 긴 몫. 막대 칸의 너비는 left + right로 나눠 쓴다
 */
export function likertSpan(rows: readonly (LikertRow | null)[]): { left: number; right: number } {
  const known = rows.filter((r): r is LikertRow => !!r)
  if (!known.length) return { left: 50, right: 50 }
  const round = (v: number) => Math.round(v * 1000) / 1000
  return {
    left: round(Math.max(...known.map((r) => r.neg + r.neu / 2))),
    right: round(Math.max(...known.map((r) => r.pos + r.neu / 2))),
  }
}

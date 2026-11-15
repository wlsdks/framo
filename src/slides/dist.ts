// 분포(dist)의 셈: 기준 칸의 글이 어느 구간을 가리키는지, 기준 안에 든 몫이 얼마인지. 그리기는 blocks/Dist.tsx

const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase()
const digit = (ch: string | undefined) => !!ch && /[\d.,]/.test(ch)

/**
 * hay 안에 needle이 낱말로 들어 있는지. 숫자가 이어 붙은 자리는 세지 않는다: '1일'을 '11일' 안에서, '3'을 '30대' 안에서 잡지 않게.
 * 글자는 이어 붙어도 된다('3일까지', '3일 안'의 조사와 뒷말)
 */
function holds(hay: string, needle: string): boolean {
  for (let at = hay.indexOf(needle); at >= 0; at = hay.indexOf(needle, at + 1)) {
    const before = hay[at - 1]
    const after = hay[at + needle.length]
    if (digit(needle[0]) && digit(before)) continue
    if (digit(needle[needle.length - 1]) && digit(after)) continue
    return true
  }
  return false
}

/**
 * 기준 칸에 적은 글이 가리키는 구간(0부터). 구간 이름을 그대로 적은 것이 먼저이고, 아니면 글 안에 든 구간 이름('약속한 3일 안'의 '3일':
 * 여럿이 들었으면 가장 긴 이름), 그것도 없으면 그 글로 시작하거나 그 글이 든 구간 하나('5일'은 '5일 이상').
 * 둘 이상에 똑같이 걸치면 짐작하지 않는다(-1): 틀린 구간에 기준선을 그으면 틀린 몫을 발표하게 된다
 */
export function cutIndex(text: string, titles: readonly string[]): number {
  const query = norm(text)
  if (!query) return -1
  const names = titles.map(norm)
  const only = (hits: number[]) => (hits.length === 1 ? hits[0] : -1)
  const exact = names.flatMap((name, i) => (name && name === query ? [i] : []))
  if (exact.length) return only(exact)
  const inside = names.flatMap((name, i) => (name && holds(query, name) ? [i] : []))
  if (inside.length) {
    const longest = Math.max(...inside.map((i) => names[i].length))
    return only(inside.filter((i) => names[i].length === longest))
  }
  return only(names.flatMap((name, i) => (name && holds(name, query) ? [i] : [])))
}

interface DistFigure {
  /** 구간마다 막대의 길이(0~100): 가장 큰 구간이 100 */
  bars: number[]
  /** 구간마다 기준 안인지. 기준이 없으면 모두 false */
  inside: boolean[]
  /** 기준 안에 든 값의 합과 전체 */
  sum: number
  total: number
  /** 기준 안에 든 몫(0~100). 기준이 없으면 null */
  pct: number | null
  /** 기준선이 서는 자리: 이 구간의 바로 앞(1 ~ n-1). 기준이 없거나 모든 구간이 기준 안이면 null(가를 것이 없다) */
  edge: number | null
}

/**
 * 구간마다의 값에서 그림을 셈한다. cut은 기준이 되는 구간(없으면 -1), from이면 그 구간부터 끝까지가 기준 안('80점 이상'),
 * 아니면 처음부터 그 구간까지('3일 안'). 값을 하나라도 읽지 못했거나 0보다 작거나, 모두 0이면 null:
 * 빠진 구간이 있는 채로 셈한 몫은 틀린 숫자다
 */
export function distFigure(values: readonly (number | null)[], cut: number, from = false): DistFigure | null {
  const n = values.length
  if (!n || values.some((v) => v === null || !Number.isFinite(v) || v < 0)) return null
  const nums = values as readonly number[]
  const total = nums.reduce((a, v) => a + v, 0)
  const top = Math.max(...nums)
  if (!(total > 0) || !Number.isFinite(total)) return null
  const has = Number.isInteger(cut) && cut >= 0 && cut < n
  const inside = nums.map((_, i) => has && (from ? i >= cut : i <= cut))
  const sum = nums.reduce((a, v, i) => (inside[i] ? a + v : a), 0)
  const at = from ? cut : cut + 1
  return {
    bars: nums.map((v) => (v / top) * 100),
    inside,
    sum,
    total,
    pct: has ? (sum / total) * 100 : null,
    edge: has && at > 0 && at < n ? at : null,
  }
}

/**
 * 크게 보일 몫. 기준 밖에 남은 것이 있는데 반올림으로 100%가 되면 그림(밖에 막대가 서 있다)과 다른 말을 한다: 그때는 99%에서 멈춘다.
 * 1%에 못 미치는 몫은 보이는 쪽(parts.tsx의 pctText)이 '1% 미만'으로 적는다
 */
export function distPct(figure: Pick<DistFigure, 'pct' | 'sum' | 'total'>): number | null {
  if (figure.pct === null) return null
  return figure.sum < figure.total && figure.pct >= 99.5 ? 99 : figure.pct
}

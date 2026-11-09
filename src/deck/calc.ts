// 계산식(calc) 부품의 셈: 셈 기호 읽기, 적은 결과가 셈과 맞는지, 결과를 비웠을 때 셈해 보일 결과.
// 그리기(slides/blocks/Calc.tsx)와 빈칸 세기(deck/blocks/cells.ts)가 같이 쓴다: 셈해 보이는 결과 칸은 빈칸으로 세지 않는다

import { type Amount, formatNumber, readAmount, SCALED_KINDS } from './amount'
import type { Item } from './types'

type CalcOp = '×' | '÷' | '+' | '−'

const OPS: [RegExp, CalcOp][] = [
  [/^(?:[x×X✕*＊]|곱하기)$/, '×'],
  [/^(?:[÷/／]|나누기)$/, '÷'],
  [/^(?:[+＋]|더하기)$/, '+'],
  [/^(?:[-−–—－]|빼기)$/, '−'],
]

/**
 * 값 앞의 셈 기호 칸. 비었으면 곱하기: 효과를 셈하는 장(시간 × 인건비 × 사람 수)이 대개 곱이라 기호를 적지 않아도 된다.
 * 자판에 없는 ×, ÷, −는 *, /, -로 적어도 된다. 읽을 수 없는 글은 null이고, 적은 글 그대로 보인다
 */
export function opOf(text: string): CalcOp | null {
  const t = text.trim()
  if (!t) return '×'
  for (const [re, op] of OPS) if (re.test(t)) return op
  return null
}

/** 자리까지 곱한 수: '4만 원' → 40,000, '1,200시간' → 1,200, '4.8억 원' → 480,000,000, '3%' → 0.03. 곱과 나누기에 쓴다 */
const placed = (a: Amount) => (a.base * a.place) / a.scale / (a.kind === '%' ? 100 : 1)

/**
 * 적은 결과가 맞다고 볼 너비: 적은 숫자의 마지막 자리의 반('4.8억'이면 0.05억, '5억'이면 0.5억, '1,200'이면 50).
 * 반올림해 적은 결과(4.83억을 4.8억으로)는 맞는 것으로 본다
 */
function slack(text: string, a: Amount): number {
  const nums = text.match(/\d(?:[\d,]*\d)?(?:\.\d+)?/g) ?? []
  // '1억 2,000만 원'처럼 이어 적은 값은 자리를 하나로 셀 수 없어 0.5%까지
  if (nums.length !== 1) return Math.abs(a.base) * 0.005
  const raw = nums[0].replace(/,/g, '')
  const dot = raw.indexOf('.')
  const step = dot >= 0 ? 10 ** -(raw.length - dot - 1) : 10 ** (raw.length - raw.replace(/0+$/, '').length)
  return 0.5 * step * a.scale
}

/**
 * 적은 결과가 값들의 셈과 맞는지. 곱과 나누기만이면 자리까지 곱한 수로(단위는 셈마다 바뀌므로 보지 않는다), 더하기와 빼기만이면
 * 같은 무리의 단위끼리 기준 값으로(1시간 + 30분 = 1.5시간). 곱과 합이 섞였거나, 읽을 수 없는 값이나 기호가 있거나, 결과가 비었으면 null.
 * expect는 셈한 값을 적은 결과의 자리와 단위로 적은 글('4.8억 원')
 */
export function calcCheck(values: string[], ops: (CalcOp | null)[], result: string): { ok: boolean; expect: string } | null {
  const r = readAmount(result.trim())
  if (!r || values.length < 2) return null
  const amounts = values.map((v) => readAmount(v.trim()))
  if (amounts.some((a) => !a)) return null
  const all = amounts as Amount[]
  const rest = ops.slice(1, values.length)
  if (rest.some((op) => !op)) return null
  const times = rest.every((op) => op === '×' || op === '÷')
  const plus = rest.every((op) => op === '+' || op === '−')
  let got: number
  let want: number
  if (times) {
    got = placed(all[0])
    for (const [i, op] of rest.entries()) {
      const v = placed(all[i + 1])
      if (op === '÷' && v === 0) return null
      got = op === '÷' ? got / v : got * v
    }
    want = placed(r)
  } else if (plus) {
    // 더하는 값과 결과의 단위 무리가 모두 같아야 한다('3명 + 4시간'은 셈이 아니다). 단위 없이 적은 숫자끼리는 그대로
    const kinds = new Set([...all, r].map((a) => a.kind))
    if (kinds.size > 1) return null
    got = all[0].base
    for (const [i, op] of rest.entries()) got += (op === '−' ? -1 : 1) * all[i + 1].base
    want = r.base
  } else return null
  if (!Number.isFinite(got) || !Number.isFinite(want)) return null
  // 반에 꼭 걸치면(3.5억을 3억으로) 반올림한 값이 아니다. 같은 값은 소수의 오차(0.1 + 0.2)까지 맞는 것으로
  const tol = times ? (slack(result, r) * r.place) / r.scale / (r.kind === '%' ? 100 : 1) : slack(result, r)
  const diff = Math.abs(got - want)
  const ok = diff < tol || diff <= Math.abs(want) * 1e-9
  return { ok, expect: expectText(got, r, times) }
}

/** 큰 자리: 셈한 값을 적은 결과와 다른 자리로 보일 때 */
const BIG_PLACES: [number, string][] = [
  [1e12, '조'],
  [1e8, '억'],
  [1e4, '만'],
]

/** 소수 자리: 100이 넘으면 없이, 10이 넘으면 하나, 그 밑은 둘 */
function rounded(v: number): number {
  const digits = Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2
  return Math.round(v * 10 ** digits) / 10 ** digits
}

/**
 * 셈한 값을 적은 결과의 꼴로 적은 글. 합이면 결과의 단위 그대로('3.5억 원'). 곱이고 결과를 억, 만 같은 자리로 적었으면 셈한 값에 맞는
 * 자리로: 4.8억 원으로 적었는데 셈하면 72만 원일 때 '0.01억 원'으로 보이면 무엇이 틀렸는지 알아보기 어려웠다
 */
function expectText(got: number, r: Amount, times: boolean): string {
  if (times && r.place > 1 && r.kind !== '%') {
    const unit = r.suffix.replace(/^(?:[십백천]?[만억조]|[십백천])\s*/, '')
    const [p, name] = BIG_PLACES.find(([x]) => Math.abs(got) >= x) ?? [1, '']
    return `${formatNumber(rounded(got / p))}${name}${name && unit ? ' ' : ''}${unit}`
  }
  const per = times ? r.place / (r.kind === '%' ? 100 : 1) : r.scale
  return `${formatNumber(rounded(got / per))}${r.suffix}`
}

/** 돈의 단위. 곱한 값에 돈이 하나 있으면 결과는 돈이다(2.4시간 × 500건 × 4만 원 = 4,800만 원: 건마다, 시간마다의 돈) */
const MONEY = new Set(['원', '달러', '유로', '엔', '파운드', '위안'])

/** 적은 단위 글에서 자리를 뗀 것('만 원' → '원', '시간' → '시간') */
const unitText = (a: Amount) => a.suffix.replace(/^(?:[십백천]?[만억조]|[십백천])\s*/, '')

/**
 * 셈한 값을 적는 꼴. 값에 자리(만, 억)를 적은 것이 있으면 결과도 크기에 맞는 자리로('4,800만 원'), 없으면 숫자 그대로('720,000원').
 * 반올림해 0이 되는 아주 작은 값은 0으로 보이면 틀린 말이라 적지 않는다
 */
function written(v: number, unit: string, places: boolean): string | null {
  if (!Number.isFinite(v)) return null
  const big = places && unit !== '%' ? BIG_PLACES.find(([x]) => Math.abs(v) >= x) : undefined
  const n = rounded(big ? v / big[0] : v)
  if (n === 0 && v !== 0) return null
  return `${formatNumber(n)}${big ? big[1] : ''}${big && unit ? ' ' : ''}${unit}`
}

/**
 * 곱과 나누기의 결과 단위. 나누는 값과 같은 단위의 곱하는 값은 서로 지운다(4.8억 원 ÷ 12억 원 = 0.4). 남은 곱하는 값 가운데 돈이 하나면 돈,
 * 없으면 시간, 무게 같은 잴 수 있는 단위가 하나면 그 단위, 그것도 없으면 남은 단위(명, 건)가 하나일 때 그 단위. 나누는 값의 단위는 붙이지
 * 않는다(4.8억 원 ÷ 12개월 = 4,000만 원: 한 달마다). 돈끼리, 시간끼리 곱한 것처럼 뜻이 서지 않으면 null(셈하지 않는다),
 * 세는 단위가 여럿이면(12곳 × 10명) 어느 것인지 몰라 단위 없이(''). 지운 짝은 같은 기준으로 읽은 값(base)을 쓴다(2시간 ÷ 30분 = 4)
 */
function productOf(amounts: Amount[], ops: CalcOp[]): { value: number; unit: string } | null {
  const den = amounts.map((_, i) => i > 0 && ops[i - 1] === '÷')
  const live = amounts.map((a) => !!a.kind && a.kind !== '%')
  const gone = amounts.map(() => false)
  amounts.forEach((a, i) => {
    if (!den[i] || !live[i]) return
    const j = amounts.findIndex((b, k) => !den[k] && !gone[k] && live[k] && b.kind === a.kind)
    if (j >= 0) gone[i] = gone[j] = true
  })
  let value = 1
  for (const [i, a] of amounts.entries()) {
    const v = gone[i] ? a.base : placed(a)
    if (den[i] && v === 0) return null
    value = den[i] ? value / v : value * v
  }
  const left = amounts.filter((_, i) => live[i] && !den[i] && !gone[i])
  const money = left.filter((a) => MONEY.has(a.kind))
  if (money.length > 1) return null
  if (money.length === 1) return { value, unit: unitText(money[0]) }
  const measured = left.filter((a) => SCALED_KINDS.has(a.kind))
  if (measured.length > 1) return null
  if (measured.length === 1) return { value, unit: unitText(measured[0]) }
  if (left.length === 1) return { value, unit: unitText(left[0]) }
  // 비율끼리 곱하면 비율(전환율 40% × 재구매율 50% = 20%)
  if (!left.length && amounts.every((a) => a.kind === '%') && ops.every((op) => op === '×')) return { value: value * 100, unit: '%' }
  return { value, unit: '' }
}

/**
 * 결과 칸을 비운 계산식의 결과: 값들을 셈한 글('4,800만 원'). 사람이 결과를 적으면 늘 적은 글을 보이고 이것은 쓰지 않는다.
 * 쉼표, 소수, 자리(천, 만, 억, 조), %, 시간과 분 같은 단위를 읽는다(deck/amount.ts). 곱과 나누기만이거나 더하기와 빼기만일 때 셈하고,
 * 더하기와 빼기는 같은 무리의 단위끼리만(1시간 + 30분 = 1.5시간, 결과는 첫 값의 단위). 읽을 수 없는 값이나 기호가 있거나, 둘이 섞였거나,
 * 단위가 맞지 않으면 null: 틀린 값이나 지어낸 단위를 보이느니 보이지 않는다
 */
export function calcAuto(values: string[], ops: (CalcOp | null)[]): string | null {
  if (values.length < 2) return null
  const read = values.map((v) => readAmount(v.trim()))
  if (read.some((a) => !a)) return null
  const amounts = read as Amount[]
  const rest = ops.slice(1, values.length)
  if (rest.some((op) => !op)) return null
  const steps = rest as CalcOp[]
  const places = amounts.some((a) => a.place > 1)
  if (steps.every((op) => op === '+' || op === '−')) {
    if (new Set(amounts.map((a) => a.kind)).size > 1) return null
    const sum = steps.reduce((s, op, i) => s + (op === '−' ? -1 : 1) * amounts[i + 1].base, amounts[0].base)
    // 첫 값의 단위로: 기준으로 읽은 합을 첫 값의 단위 배수(분이면 60)로 나눈다
    const first = amounts[0]
    return written(sum / (first.scale / first.place), unitText(first), places)
  }
  if (!steps.every((op) => op === '×' || op === '÷')) return null
  const p = productOf(amounts, steps)
  return p && written(p.value, p.unit, places)
}

/**
 * 계산식 컴포넌트의 항목(보이는 것)으로 셈한 결과. 칸을 하나도 채우지 않은 항목은 발표할 때처럼 빼고 셈한다(deck/fields.ts의 presentable):
 * 편집할 때와 발표할 때, 내보낸 HTML, PDF가 같은 값을 보인다
 */
export function calcAutoOf(items: readonly Item[]): string | null {
  const used = items.filter((it) => (['title', 'body', 'value', 'meta', 'image'] as const).some((k) => it[k].trim()))
  return calcAuto(
    used.map((it) => it.value),
    used.map((it, i) => (i === 0 ? null : opOf(it.meta))),
  )
}

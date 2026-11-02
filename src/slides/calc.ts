// 계산식(calc) 부품의 셈: 셈 기호 읽기, 적은 결과가 셈과 맞는지, 한 줄로 둘 수 있는 칸 너비. 그리기는 blocks/Calc.tsx

import { numberUnits } from './fields'
import { type Amount, formatNumber, readAmount } from './numbers'

export type CalcOp = '×' | '÷' | '+' | '−'

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

/** 칸 너비의 문턱들(calc.css의 @container와 같은 값) */
const NEEDS = [560, 720, 880, 1100, 1400, 1680]
/** 한 줄 꼴에서 숫자가 이 글자 크기보다 작아지면 한 줄로 두지 않는다(글자 크기 단계의 52) */
const ROW_MIN = 52
/** 숫자 사이 셈 기호 칸의 너비(기호와 양옆 틈) */
const OP_W = 84
/** 숫자 칸 하나의 가장 좁은 너비: 짧은 숫자('3%') 아래의 이름이 두 줄 안에 들게(이름은 기호 아래 틈까지 쓴다) */
const CELL_MIN = 124

/**
 * 계산식을 한 줄(값 기호 값 = 결과)로 둘 수 있는 가장 좁은 칸 너비(문턱 하나로 올림). 숫자는 모두 같은 크기이고 칸은 제 숫자의
 * 폭만큼이라, 숫자들의 폭을 더한 것에 기호 칸들. 가장 넓은 칸으로도 모자라면 'stack'(영수증처럼 쌓기). nums는 결과까지 그려지는 숫자들
 */
export function calcNeed(nums: string[]): string {
  const need = nums.reduce((w, t) => w + Math.max(CELL_MIN, numberUnits(t || '0') * ROW_MIN), 0) + (nums.length - 1) * OP_W
  const fit = NEEDS.find((x) => need <= x)
  return fit ? String(fit) : 'stack'
}

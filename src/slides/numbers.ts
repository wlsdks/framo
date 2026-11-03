// 칸에 적은 글에서 숫자를 읽는다. 막대 길이, 달성률, 증감의 끝 값을 계산할 때만 쓰고 화면에는 사람이 적은 글을 그대로 보인다.

/**
 * 낮을수록 좋은 목표인지 ('7분 이하', '불량률 0.5% 미만', '≤ 3일'). 대기 시간, 비용, 불량처럼 줄여야 하는 지표는
 * 목표를 이렇게 적으므로, 이때는 실적이 목표보다 작아야 달성이고 달성률도 거꾸로(목표 ÷ 실적) 센다
 */
export function lowerIsBetter(target: string): boolean {
  return /이하|이내|미만|아래|[≤⩽<]/.test(target)
}

// ---------- 숫자와 단위 ----------
// 칸 둘 이상의 숫자로 계산하는 곳(증감, 달성률, 전환율, 합계)은 단위까지 읽어 같은 기준으로 바꾼 뒤 계산한다.
// 숫자만 뽑으면 '6분 → 40초'가 6 → 40(▲ 567%)이 되고, '1.2억 원 → 8,000만 원'이 1.2 → 8,000이 된다.
// 견줄 수 없는 단위끼리('3건 → 40%', '2명 → 5대')는 계산하지 않는다. 틀린 숫자를 보이느니 보이지 않는다

/** 숫자 바로 뒤의 자리. '3천만'처럼 겹쳐 쓰면 곱한다 */
const PLACES: Record<string, number> = { 십: 10, 백: 100, 천: 1e3, 만: 1e4, 억: 1e8, 조: 1e12 }

const DAY = 86_400
/** 한 달은 한 해의 12분의 1. 30일로 세면 '18개월 → 1년'이 33%가 아니라 32% 줄어든 것이 된다 */
const MONTH = (365 / 12) * DAY

/**
 * 기준이 여럿인 단위 무리와, 무리의 기준(초, g, m, 바이트)으로 바꾸는 배수.
 * 같은 무리는 단위가 달라도 견준다('6분'과 '40초', '1.2kg'과 '800g')
 */
const SCALED: Record<string, [kind: string, per: number]> = {
  ms: ['time', 1e-3],
  밀리초: ['time', 1e-3],
  초: ['time', 1],
  sec: ['time', 1],
  분: ['time', 60],
  min: ['time', 60],
  시간: ['time', 3600],
  일: ['time', DAY],
  주: ['time', 7 * DAY],
  주일: ['time', 7 * DAY],
  개월: ['time', MONTH],
  달: ['time', MONTH],
  년: ['time', 365 * DAY],
  mg: ['mass', 1e-3],
  g: ['mass', 1],
  kg: ['mass', 1e3],
  톤: ['mass', 1e6],
  mm: ['length', 1e-3],
  cm: ['length', 1e-2],
  m: ['length', 1],
  km: ['length', 1e3],
  KB: ['data', 1024],
  MB: ['data', 1024 ** 2],
  GB: ['data', 1024 ** 3],
  TB: ['data', 1024 ** 4],
}
/** 긴 단위부터 맞춰 본다 ('시간'을 '시'로, '개월'을 '개'로 읽지 않게) */
const SCALED_WORDS = Object.keys(SCALED).sort((a, b) => b.length - a.length)
const SCALED_KINDS = new Set(Object.values(SCALED).map(([kind]) => kind))

/** 같은 단위의 다른 표기 */
const ALIASES: Record<string, string> = {
  '％': '%',
  '%p': '%',
  '%포인트': '%',
  퍼센트: '%',
  프로: '%',
  $: '달러',
  '＄': '달러',
  '₩': '원',
  '￦': '원',
  '€': '유로',
  '¥': '엔',
  '£': '파운드',
}

/** 단위 뒤에 붙어도 단위가 바뀌지 않는 말 ('7분 이내', '3년간', '120건이상') */
const QUAL = '(?:이상|이하|이내|미만|초과|내외|안팎|정도|가량|남짓|쯤|간|째|씩|당|여)'
const ONLY_QUALS = new RegExp(`^${QUAL}+$`)
const END_QUALS = new RegExp(`${QUAL}+$`)

interface Unit {
  /** 단위 무리. 시간, 무게 같은 무리 이름이거나 적은 단위 그대로('건', '원') */
  kind: string
  /** 무리의 기준으로 바꾸는 배수 ('분'이면 60) */
  per: number
  /** 적은 단위 글 ('분', '억 원'의 '원') */
  text: string
}

/** 숫자 뒤 낱말의 단위. 단위가 아닌 말('이상', '정도')뿐이면 null */
function unitOf(word: string): Unit | null {
  if (!word || ONLY_QUALS.test(word)) return null
  for (const w of SCALED_WORDS) {
    if (!word.startsWith(w)) continue
    const rest = word.slice(w.length)
    // '분기', '일차', '년도', '주차'는 기간의 길이가 아니라 몇째인지라 적은 말 그대로 둔다
    if (!rest || ONLY_QUALS.test(rest)) return { kind: SCALED[w][0], per: SCALED[w][1], text: w }
  }
  const noun = word.replace(END_QUALS, '')
  return { kind: ALIASES[noun] ?? noun, per: 1, text: noun }
}

/** 숫자: 천 단위 쉼표, 소수 */
const NUMBER = /\d(?:[\d,]*\d)?(?:\.\d+)?|\.\d+/g
/** 숫자 뒤의 자리와 단위 낱말 ('억 원', '만원', '분', '%'). 낱말은 띄어쓰기나 문장 부호 앞까지 */
const AFTER = /^\s?([십백천]?[만억조]|[십백천])?\s?([^\s\d.,~∼()[\]{}<>/·|:;=+\-−–—≤≥]*)/
/** 숫자 앞의 빼기 표기. 글 처음이나 띄어쓰기, 괄호 뒤에만 ('A-3'의 붙임표는 빼기가 아니다). △는 회계에서 마이너스 */
const MINUS = /(?:^|[\s(])[-−–△▽▼]\s*$/
/** 숫자 앞의 화폐 기호 ('$1.2') */
const CURRENCY_BEFORE = /[$＄₩￦€¥£]\s*$/

interface Part {
  n: number
  /** 숫자 뒤의 자리 ('억'이면 1억) */
  place: number
  placeText: string
  unit: Unit | null
  start: number
  end: number
}

function partsOf(text: string): Part[] {
  const out: Part[] = []
  for (const m of text.matchAll(NUMBER)) {
    const start = m.index
    const after = AFTER.exec(text.slice(start + m[0].length))!
    const placeText = after[1] ?? ''
    const place = [...placeText].reduce((p, c) => p * PLACES[c], 1)
    out.push({ n: parseFloat(m[0].replace(/,/g, '')), place, placeText, unit: unitOf(after[2]), start, end: start + m[0].length + after[0].length })
  }
  return out
}

/** 앞 숫자에 이어 적은 더 작은 자리나 단위인지: '1억 2,000만 원', '1시간 30분', '2년 6개월' */
function joins(a: Part, b: Part, between: string): boolean {
  if (between.trim()) return false
  // 자리만 적은 숫자 뒤에는 더 작은 자리. 뒤에 자리도 단위도 없으면('2억 5,000') 5,000인지 5,000만인지 몰라서 잇지 않는다
  if (!a.unit) return a.place > 1 && b.place < a.place && (b.place > 1 || !!b.unit)
  return a.place === 1 && b.place === 1 && !!b.unit && SCALED_KINDS.has(a.unit.kind) && b.unit.kind === a.unit.kind && b.unit.per < a.unit.per
}

/** 칸에 적은 숫자 하나를 단위까지 읽은 것 */
export interface Amount {
  /** 무리의 기준으로 바꾼 값: '1.2억 원' → 120,000,000, '6분' → 360(초), '1시간 30분' → 5,400(초) */
  base: number
  /** 적은 숫자에 곱한 배수(자리 × 단위): '1.2억 원' → 1억, '6분' → 60. 이어 적은 값은 가장 큰 자리 것 */
  scale: number
  /** 자리 배수 ('억'이면 1억). 자리를 적지 않았으면 1 */
  place: number
  /** 단위 무리. 비었으면 단위 없이 적은 숫자('120', '1.2억') */
  kind: string
  /** 자리도 단위도 없이 숫자만 적었는지 ('120') */
  bare: boolean
  /** 숫자 뒤에 적은 자리와 단위 ('억 원', '분'). 계산한 값을 같은 꼴로 보일 때 붙인다 */
  suffix: string
}

function readOwn(text: string): Amount | null {
  const parts = partsOf(text)
  if (!parts.length) return null
  let k = 1
  while (k < parts.length && joins(parts[k - 1], parts[k], text.slice(parts[k - 1].end, parts[k].start))) k++
  // 이어 적은 것이 아닌 숫자가 더 있으면('3~5일', '2024년 120억', '120건(전년 100건)') 어느 숫자인지 몰라서 읽지 않는다
  if (k < parts.length) return null
  const first = parts[0]
  const last = parts[parts.length - 1]
  const lead = text.slice(0, first.start)
  // 자리만 적은 앞 숫자는 끝 숫자의 단위를 같이 쓴다 ('1억 2,000만 원'의 1억도 원). 단위가 없으면 앞의 화폐 기호('$1.2')
  const sign = CURRENCY_BEFORE.exec(lead)
  const unit = first.unit ?? last.unit ?? (sign ? unitOf(sign[0].trim()) : null)
  const per = (p: Part) => (p.unit ?? unit)?.per ?? 1
  const base = parts.reduce((s, p) => s + p.n * p.place * per(p), 0)
  // 표현 범위를 넘는 긴 숫자는 Infinity가 되어 막대 길이와 비율을 NaN으로 만든다.
  // 계산만 멈추고 입력한 글은 각 칸에서 그대로 보여 준다.
  if (!Number.isFinite(base)) return null
  const unitText = first.unit || last.unit ? unit!.text : ''
  return {
    base: MINUS.test(lead) ? -base : base,
    scale: first.place * per(first),
    place: first.place,
    kind: unit?.kind ?? '',
    bare: first.place === 1 && !unit,
    suffix: first.placeText && unitText ? `${first.placeText} ${unitText}` : first.placeText || unitText,
  }
}

/**
 * 칸의 숫자를 단위까지 읽는다. 숫자가 없거나 어느 숫자인지 모르면 null.
 * 단위 칸(unit)이 따로 있는 그림이면 숫자만 적은 값('7.2')은 그 단위('억 원')로, 자리만 적은 값('8,000만')은 그 단위 무리(원)로 읽는다
 */
export function readAmount(text: string, unit = ''): Amount | null {
  const own = readOwn(text)
  if (!own || own.kind || !unit.trim()) return own
  const u = readOwn(`1 ${unit.trim()}`)
  if (!u || u.bare) return own
  if (own.bare) {
    const base = own.base * u.scale
    return Number.isFinite(base) ? { ...own, base, scale: u.scale, place: u.place, kind: u.kind, bare: false, suffix: unit.trim() } : null
  }
  const per = u.scale / u.place
  const base = own.base * per
  const scale = own.scale * per
  return Number.isFinite(base) && Number.isFinite(scale) ? { ...own, base, scale, kind: u.kind } : null
}

/** 값에 이미 적은 단위를 다시 붙이지 않는다. 자리까지 적었으면 단위의 자리는 빼고 ('2억'과 '억 원' → '2억 원'). */
export function unitAfter(text: string, unit: string): string {
  const suffix = unit.trim()
  if (!suffix) return ''
  const amount = readOwn(text)
  if (!amount) return ''
  if (amount.kind) return ''
  if (amount.place > 1) return suffix.replace(/^(?:[십백천]?[만억조]|[십백천])\s*/, '')
  return suffix
}

/** 적은 숫자 그대로 ('131억 원' → 131, '▼ 1.5억 원' → −1.5, '1시간 30분' → 1.5). 숫자가 없거나 어느 숫자인지 모르면 null */
export function readNumber(text: string): number | null {
  const a = readOwn(text)
  return a && a.base / a.scale
}

/** 한쪽에만 적어도 다른 쪽을 같은 단위로 읽는 단위인지: 기준이 하나뿐인 단위('건', '원', '%') */
const single = (kind: string) => !SCALED_KINDS.has(kind)

/**
 * 두 값을 견줄 수 있는지. 단위 무리가 같거나, 한쪽만 단위를 적었고 그 단위가 기준이 하나뿐일 때('120 → 150건').
 * 한쪽만 '6분'이면 다른 쪽이 분인지 초인지, 한쪽만 '1.2억'이면 다른 쪽 '8,000'이 8,000인지 8,000만인지 몰라서 견주지 않는다
 */
function comparable(a: Amount, b: Amount): boolean {
  if (a.bare || b.bare) {
    const other = a.bare ? b : a
    return other.bare || (other.place === 1 && single(other.kind))
  }
  if (a.kind === b.kind) return true
  // 자리만 적은 쪽('8,000만')은 다른 쪽의 단위('1.2억 원')로 읽는다. %와는 섞지 않는다
  const other = !a.kind ? b : !b.kind ? a : null
  return !!other && single(other.kind) && other.kind !== '%'
}

/** 두 칸의 값을 같은 기준으로 읽는다 (전과 후, 목표와 실적). 견줄 수 없으면 null */
export function amountPair(a: string, b: string, unit = ''): { a: Amount; b: Amount; kind: string } | null {
  const x = readAmount(a, unit)
  const y = readAmount(b, unit)
  if (!x || !y || !comparable(x, y)) return null
  const declared = unit.trim() ? readOwn(`1 ${unit.trim()}`) : null
  if (declared?.kind && [x, y].some((v) => v.kind && v.kind !== declared.kind)) return null
  return { a: x, b: y, kind: x.kind || y.kind }
}

/**
 * 목표 대비 실적 한 줄. 목표와 실적은 단위까지 읽어 같은 기준으로 견준다('7분 이하'와 '6분 30초', '1.2억 원'과 '9,500만 원').
 * 견줄 수 없는 단위이거나 실적이 비었거나, 목표가 0 이하, 실적이 음수면 known이 false(달성률과 달성 여부를 말하지 않는다).
 * 낮을수록 좋은 지표(목표에 '이하', '이내' 같은 말)는 목표보다 작아야 달성이고 달성률은 목표 ÷ 실적.
 * 장(Scorecard)과 발표 종류의 예시가 같은 셈을 쓴다: 예시 제목('네 목표 중 세 개를 이뤘어요')과 장의 달성 수가 어긋나지 않게
 */
export function scoreOf(target: string, actual: string): { known: boolean; met: boolean; rate: number | null; target: number; actual: number } {
  const p = amountPair(target, actual)
  const t = p?.a.base ?? 0
  const a = p?.b.base ?? 0
  const known = !!p && t > 0 && a >= 0 && actual.trim() !== ''
  const lower = lowerIsBetter(target)
  const met = lower ? a <= t : a >= t
  const rate = known ? (lower ? (a > 0 ? t / a : null) : a / t) : null
  return { known, met, rate, target: t, actual: a }
}

/**
 * 전과 후가 얼마나 바뀌었는지. 둘 다 %면 %p, 아니면 전 값에 대한 %.
 * 견줄 수 없는 단위이거나 전 값이 0이면 null (비율을 말할 수 없다).
 * 0을 지나 부호가 바뀌어도(적자에서 흑자로처럼) null: −1억에서 100억이 되면 전 값에 대한 %로는 ▲ 10,100%라 크기도 뜻도 없다
 */
export function changeOf(before: string, after: string, unit = ''): { value: number; pp: boolean } | null {
  const p = amountPair(before, after, unit)
  if (!p) return null
  const d = p.b.base - p.a.base
  if (!Number.isFinite(d)) return null
  if (p.kind === '%') return { value: d, pp: true }
  if (p.a.base === 0 || p.a.base * p.b.base < 0) return null
  const value = (d / Math.abs(p.a.base)) * 100
  return Number.isFinite(value) ? { value, pp: false } : null
}

/** 한 그림의 값들 */
export interface Series {
  /** 같은 자리로 맞춘 값: '58억, 4,200만'이면 58, 0.42. 비었거나 어느 숫자인지 모르는 칸은 null */
  values: (number | null)[]
  /** 서로 견줄 수 있는 값들인지. 아니면 values는 적은 숫자 그대로이고, 합이나 비율은 계산하지 않는다 */
  ok: boolean
  /** 계산한 값(합계, 끝 값)에 붙일 자리와 단위: 단위 칸에 적은 것, 없으면 기준으로 삼은 값에 적은 것('억') */
  suffix: string
}

/**
 * 한 그림에 놓이는 값들(막대, 선, 깔때기, 증감 요인)을 같은 자리로 읽는다. 기준은 자리나 단위를 적은 첫 값
 * (단위 칸이 있으면 그 단위). 한 그림의 숫자는 보통 같은 단위로 적고 몇 개에만 단위를 붙이므로, 숫자만 적은 값은
 * 그 기준 단위로 읽는다('117, +9억'은 117억과 9억). 서로 다른 단위 무리가 섞였으면('3건'과 '40%') ok가 false다
 */
export function seriesIn(texts: string[], unit = ''): Series {
  const amounts = texts.map((t) => readAmount(t, unit))
  // 입력 자체가 유한해도 단위를 바꾸는 나눗셈에서 표현 범위를 넘을 수 있다.
  const finite = (n: number) => Number.isFinite(n) ? n : null
  const known = amounts.filter((a): a is Amount => a !== null)
  const kinds = new Set(known.map((a) => a.kind).filter(Boolean))
  const kind = [...kinds][0] ?? ''
  const u = unit.trim() ? readOwn(`1 ${unit.trim()}`) : null
  // 자리만 적은 값('3만')과 기준이 여럿인 단위('2시간')가 섞이면 3만이 무엇인지 모른다
  // 단위 칸과 적은 값이 서로 달라도 계산을 멈춘다: '10원, 20원'을 '건'의 합계로 표시하지 않는다.
  const ok = kinds.size <= 1 && !(u?.kind && kind && u.kind !== kind) && !(SCALED_KINDS.has(kind) && known.some((a) => !a.bare && !a.kind))
  if (!ok) return { values: amounts.map((a) => a && finite(a.base / a.scale)), ok, suffix: '' }
  // 자리의 기준은 자리나 단위를 적은 첫 값, 단위의 기준은 단위를 적은 첫 값
  const ref = known.find((a) => !a.bare) ?? known[0]
  if (!ref) return { values: amounts.map(() => null), ok, suffix: unit.trim() }
  const unitRef = known.find((a) => a.kind)
  // 자리만 적은 값('8,000만')은 단위 무리의 배수만 받는다 (단위를 적은 값이 '9,500만 원'이면 원의 1)
  const per = unitRef ? unitRef.scale / unitRef.place : 1
  // 단위 칸이 있으면 그 단위가 기준이다 (계산한 끝 값에 단위 칸의 글을 붙이므로)
  const scale = u && !u.bare && u.kind === kind ? u.scale : ref.kind ? ref.scale : ref.place * per
  // 숫자만 적은 값은 기준의 자리와 단위 그대로라 적은 숫자가 곧 기준의 몇 배다
  const values = amounts.map((a) => a && finite(a.bare ? a.base : (a.kind ? a.base : a.base * per) / scale))
  return { values, ok, suffix: unit.trim() || ref.suffix }
}

/**
 * 한 그림의 값 가운데 견줄 수 없어 그림에서 빠지는 자리: 읽을 수 없거나('미정'), 0보다 작거나, 다른 값과 단위 무리가
 * 다른 것('20건' 사이의 '10%'). 기준 무리는 단위 칸, 없으면 단위를 적은 첫 값. 비운 칸은 쓰는 중이라 넣지 않는다.
 * 편집할 때 어느 칸을 고치면 되는지 보이려고 쓴다: 하나만 틀려도 그림 전체를 그리지 않는데, 안내 한 줄만으로는 어느 칸인지 몰랐다
 */
export function unfitValues(texts: string[], unit = ''): boolean[] {
  const amounts = texts.map((t) => (t.trim() ? readAmount(t, unit) : undefined))
  const u = unit.trim() ? readOwn(`1 ${unit.trim()}`) : null
  const ref = u?.kind || amounts.find((a) => a?.kind)?.kind || ''
  return amounts.map((a) => (a === undefined ? false : a === null || a.base < 0 || (!!ref && !!a.kind && a.kind !== ref)))
}

/** 빈 값으로 끊긴 선을 나눈다. 중간 시점이 없으면 양옆을 임의로 잇지 않는다. */
export function lineRuns<T>(points: readonly (T | null)[]): T[][] {
  const runs: T[][] = []
  let run: T[] = []
  for (const point of points) {
    if (point !== null) run.push(point)
    else if (run.length) { runs.push(run); run = [] }
  }
  if (run.length) runs.push(run)
  return runs
}

/**
 * 선 그래프(추이, 두 시점 비교의 선 모양)의 세로 축: 바닥과 천장, 값과 차례를 그릴 자리(0~100).
 * 값이 모두 0 이상이고 0에서 멀면(가장 작은 값이 오르내림 폭의 1.2배보다 크면) 바닥을 0이 아니라 가장 작은 값의
 * 폭 절반 아래로 잡는다. 0부터 그리면 110, 114, 118 같은 흐름이 위쪽에 납작한 선이 된다. 0보다 작은 값이 있으면
 * 바닥을 조금 더 아래로(0 선이 보이게), 천장은 가장 큰 값의 점과 숫자가 위 끝에 붙지 않게 조금 위로.
 * 두 레이아웃이 같은 축을 써야 장을 넘겨도 같은 값이 같은 높이로 보인다
 */
export function lineAxis(values: number[], n: number): { floor: number; ceil: number; y: (v: number) => number; x: (i: number) => number } {
  const lo = values.length ? Math.min(...values) : 0
  const hi = values.length ? Math.max(...values) : 1
  const span = hi - lo || Math.abs(hi) || 1
  const floor = lo >= 0 ? (lo - span * 1.2 > 0 ? lo - span * 0.5 : 0) : lo - span * 0.12
  const ceil = hi + span * 0.06
  return { floor, ceil, y: (v) => ((v - floor) / (ceil - floor || 1)) * 100, x: (i) => ((i + 0.5) / n) * 100 }
}

/**
 * 계산한 값을 보이는 꼴: 천 단위 쉼표, 소수 둘째 자리까지.
 * 반올림해 0이 되는 음수는 부호를 떼고 '0'이다(signDisplay 'negative'): 더하고 뺀 끝 값의 부동소수 찌꺼기
 * (0.3 − 0.1 − 0.2 = −2.8e-17)가 폭포의 끝 값에 '−0'으로 그려졌다
 */
export function formatNumber(n: number): string {
  return new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 2, signDisplay: 'negative' }).format(n)
}

const NUMERIC_CELL = /^[+\-−–▲▼△]?\s?[\d.,]+\s?(%p?|배|건|명|곳|개|점|원|[천만억조]\s?원?|시간|kg|톤)?$/

/**
 * 짧은 숫자만 든 칸(금액, 비율, 건수). 표에서 이런 칸만 오른쪽에 맞춰 자릿수가 줄을 맞추게 한다.
 * '11월', '3분기' 같은 날짜와 시기는 글로 본다.
 */
export function isNumericCell(text: string): boolean {
  const t = text.trim()
  return t.length > 0 && t.length <= 12 && NUMERIC_CELL.test(t)
}

// 과제의 상태는 부품 높이를 고를 때(deck/blocks/sizing.ts)도 읽어서 deck 층에 둔다
export { statusOf, STATUS_NAMES, type Status } from '../deck/status'

export type Grade = 'good' | 'mid' | 'bad'

/**
 * 평가표의 한 칸. 보고서에서 흔히 쓰는 말과 기호(좋음 보통 나쁨, 상 중 하, ○ △ ×)를 읽는다.
 * 읽을 수 없는 글('1.9억' 같은)은 null이라 표시 없이 그 글 그대로 보인다
 */
export function gradeOf(text: string): Grade | null {
  const t = text.trim()
  if (/^(좋음|좋다|좋아요|우수|상|높음|유리|가능|[◎○●Oo])$/.test(t)) return 'good'
  if (/^(보통|중|중간|[△◐])$/.test(t)) return 'mid'
  if (/^(나쁨|나쁘다|미흡|하|낮음|불리|불가|[×✕xX])$/.test(t)) return 'bad'
  return null
}

/** 평가표의 한 줄을 안마다 나눈다. 명시한 구분 기호 사이의 빈 칸도 자리를 지킨다. */
export function gradesOf(text: string): string[] {
  if (!text.trim()) return []
  if (!/[,，、·/|]/.test(text)) return text.trim().split(/\s+/)
  return text.split(/[,，、·/|]/).flatMap((part) => {
    const value = part.trim()
    if (!value) return ['']
    const words = value.split(/\s+/)
    // 쉼표 안에 이미 알려진 평가를 띄어 쓴 경우는 각각 나누되, '확인 중' 같은 말은 한 칸에 남긴다.
    return words.every((word) => gradeOf(word)) ? words : [value]
  })
}

// ---------- 추진 일정의 기간 칸 ----------

/** 기간 이름의 크기: 해 > 반기 > 분기 > 달 > 주 > 날. 기간 이름이 아니면 null */
function periodRank(word: string): number | null {
  if (/^'?\d{2,4}년도?$|^\d{4}$/.test(word)) return 6
  if (/^[상하]?반기$|^H[12]$/i.test(word)) return 5
  if (/^[1-4]분기$|^Q[1-4]$/i.test(word)) return 4
  if (/^(?:1[0-2]|0?[1-9])월$/.test(word)) return 3
  if (/^\d{1,2}주차?$|^W\d{1,2}$/i.test(word)) return 2
  if (/^\d{1,2}일$/.test(word)) return 1
  return null
}

/** 앞 기간에 붙어야 뜻이 되는 때 ('3월 상순', '1분기 말', '10월 초') */
const TAIL_WORDS = '초순|상순|중순|하순|말경|초반|중반|후반|전반|초|중|말'
const PERIOD_TAIL = new RegExp(`^(?:${TAIL_WORDS})$`)
/** 큰 기간 뒤에 더 작은 기간이나 때가 오는지 ('10월 2주', '10월 하순', '2026년 Q1') */
const FINER_AFTER = `(?!\\s*(?:\\d|[QWH]\\d|[상하]반기|${TAIL_WORDS}))`

/** 칸 이름을 나누는 표시. 쉼표와 줄바꿈이 먼저다('기획·설계, 개발'은 두 칸). 빗금은 '10/1' 같은 날짜 안의 것은 빼고 */
const COL_SEPS = [/\s*[,，、\n]\s*/, /\s*(?:[·|]|(?<!\d)\/|\/(?!\d))\s*/]

/**
 * 추진 일정의 기간 칸 이름(평가표의 안 이름, 색 표의 칸 이름도). 너무 많으면 막대가 가늘어져서 열둘까지.
 * 쉼표나 줄바꿈이 있으면 그것으로만, 없고 가운뎃점이나 빗금이 있으면 그것으로만 나눈다(칸 이름 안의 띄어쓰기는 그대로: '준비 기간, 시범 운영').
 * 띄어쓰기로만 적었으면 낱말마다 나누되, 큰 기간 뒤에 붙은 작은 기간과 때는 앞말과 한 칸으로 묶는다
 * ('10월 1주 10월 2주', '2026년 1분기 2분기', '3월 상순 3월 중순')
 */
export function colsOf(text: string): string[] {
  const input = text.trim()
  if (!input) return []
  const sep = COL_SEPS.find((s) => s.test(input))
  if (sep)
    return input
      .split(sep)
      .map((t) => t.trim().replace(/\s+/g, ' '))
      .slice(0, 12)
  const out: { words: string[]; rank: number | null }[] = []
  for (const w of input.split(/\s+/).filter(Boolean)) {
    const r = periodRank(w)
    const last = out[out.length - 1]
    // 때('초', '상순')는 바로 앞 낱말이 기간일 때만 붙는다. 기간은 앞 칸의 가장 작은 기간보다 작을 때만('10월' 뒤의 '1주')
    const tail = PERIOD_TAIL.test(w) && !!last && periodRank(last.words[last.words.length - 1]) !== null
    if (last && (tail || (r !== null && last.rank !== null && r < last.rank))) {
      last.words.push(w)
      if (r !== null) last.rank = r
    } else out.push({ words: [w], rank: r })
  }
  return out.map((c) => c.words.join(' ')).slice(0, 12)
}

/** 칸마다 앞 칸에서 이어받은 큰 기간까지 붙인 낱말들: '10월 1주, 2주'의 둘째 칸은 10월 2주 */
function fullNames(cols: string[]): string[][] {
  let around: [number, string][] = []
  return cols.map((c) => {
    const words = c.split(/\s+/).filter(Boolean)
    const first = periodRank(words[0] ?? '')
    const full = [...(first === null ? [] : around.filter(([r]) => r > first).map(([, w]) => w)), ...words]
    const ranked = full.flatMap((w): [number, string][] => {
      const r = periodRank(w)
      return r === null ? [] : [[r, w]]
    })
    if (ranked.length) around = ranked
    return full
  })
}

const escape = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * 한 칸을 가리키는 말의 꼴. 앞뒤에 숫자가 붙은 것은 칸 이름으로 보지 않는다('1월'을 '11월' 안에서 잡지 않게). 띄어쓰기는 있어도 없어도 된다.
 * - 이어받은 기간까지 붙인 이름 ('10월 2주')
 * - 그보다 큰 기간만 적은 말: 그 기간의 칸 모두 ('10월'이면 10월 1주부터 4주까지). 뒤에 더 작은 기간이 오면('10월 2주') 아니다
 * - 이어받은 기간을 뺀 이름 ('2주'): 위 둘로 찾은 칸이 하나도 없을 때만
 * - 큰 기간 뒤에 칸에 없는 때가 온 말 ('10월 중', '10월 말'이면 10월의 칸 모두): 그래도 없을 때만
 */
function namePatterns(words: string[]): RegExp[][] {
  // 이름이 비어 있는 열은 자리는 유지하되 어떤 기간이나 추천 이름과도 일치하지 않는다.
  if (!words.length) return [[], [], []]
  const re = (ws: string[], end: string) => new RegExp(`(?<!\\d)${ws.map(escape).join('\\s*')}${end}`)
  const exact = [re(words, '(?!\\d)')]
  const loose: RegExp[] = []
  const wide: RegExp[] = []
  // 앞에서부터 기간인 낱말까지만 큰 기간으로 본다 ('준비 기간'의 '준비'는 아니다)
  for (let k = 1; k < words.length && periodRank(words[k - 1]) !== null; k++) {
    exact.push(re(words.slice(0, k), FINER_AFTER))
    loose.push(re(words.slice(k), '(?!\\d)'))
    wide.push(re(words.slice(0, k), '(?!\\s*\\d)'))
  }
  return [exact, loose, wide]
}

/**
 * 글에 나오는 기간 칸의 처음과 끝 ('12월~2월'이면 12월 칸부터 2월 칸까지).
 * '1월'이 '11월', '12월' 안에서 잡히지 않게 앞뒤에 숫자가 붙은 것은 칸 이름으로 보지 않는다
 */
export function spanIn(text: string, cols: string[]): [number, number] | null {
  const pats = fullNames(cols).map(namePatterns)
  const t = withContext(expandPeriodRange(text))
  // 범위의 끝이 처음보다 앞 칸이면('1월 … 12월' 칸의 '12월~2월') 해를 넘긴 기간이다: 처음 칸부터 마지막 칸까지(칸 밖으로 이어진다).
  // 칸 순서의 가장 앞과 뒤만 보던 때는 2월부터 12월까지 거꾸로 열 달짜리 막대가 섰다
  const sides = rangeSides(t, pats)
  if (sides && sides[0] > sides[1]) return [sides[0], cols.length - 1]
  for (let tier = 0; tier < 3; tier++) {
    const hit = pats.flatMap((p, i) => (p[tier].some((r) => r.test(t)) ? [i] : []))
    if (hit.length) return [Math.min(...hit), Math.max(...hit)]
  }
  return null
}

/** 범위 글('12월~2월')의 앞이 가리키는 처음 칸과 뒤가 가리키는 끝 칸. 범위가 아니거나 한쪽이 칸에 없으면 null */
function rangeSides(t: string, pats: RegExp[][][]): [number, number] | null {
  const m = /^(.*?)(?:~|∼|–|—|-|부터)(.*)$/s.exec(t)
  if (!m) return null
  const side = (s: string, pick: (hit: number[]) => number) => {
    for (let tier = 0; tier < 3; tier++) {
      const hit = pats.flatMap((p, i) => (p[tier].some((r) => r.test(s)) ? [i] : []))
      if (hit.length) return pick(hit)
    }
    return null
  }
  const a = side(m[1], (hit) => Math.min(...hit))
  const b = side(m[2], (hit) => Math.max(...hit))
  return a === null || b === null ? null : [a, b]
}

/** '3~4월', '2~3주'처럼 앞 단위를 생략한 구간을 같은 단위의 양 끝으로 읽는다. */
function expandPeriodRange(text: string): string {
  return text.replace(/(?<![\d/.\-])(\d{1,4})\s*(~|∼|–|—|-|부터)\s*(\d{1,4})\s*(년도?|분기|월|주차?|일)(?!\d)/g, (whole, from: string, sep: string, to: string, unit: string) => {
    return periodRank(from + unit) !== null && periodRank(to + unit) !== null ? `${from}${unit}${sep}${to}${unit}` : whole
  })
}

/** 추천하는 안은 정확히 일치하는 이름을 우선하고, 여러 안에 걸치는 모호한 글은 짐작하지 않는다. */
export function optionIndex(text: string, options: string[]): number {
  const normal = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase()
  const query = normal(text)
  if (!query) return -1
  const exact = options.flatMap((option, i) => normal(option) === query ? [i] : [])
  if (exact.length) return exact.length === 1 ? exact[0] : -1
  // 다른 이름의 일부가 일치해도 추천으로 오인하지 않는다. 'B안 추천', 'B안을 추천'은 허용한다.
  const matches = options.flatMap((option, i) => {
    const name = normal(option)
    if (!name) return []
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escape(name).replace(/ /g, '\\s+')}(?=(?:은|는|이|가|을|를|으로|로)?(?:[^\\p{L}\\p{N}]|$))`, 'u')
    return pattern.test(query) ? [i] : []
  })
  return matches.length === 1 ? matches[0] : -1
}

/** 글 안의 기간 이름 ('10월', '2주', '1분기') */
const PERIOD_WORD = /(?<![\d'])(?:'?\d{2,4}년도?|[상하]반기|H[12]|[1-4]분기|Q[1-4]|\d{1,2}월|\d{1,2}주차?|W\d{1,2}|\d{1,2}일)/gi

/** 기간 글에서 앞의 큰 기간을 빼고 적은 작은 기간에 그 큰 기간을 붙인다: '10월 2주~3주' → '10월 2주~10월 3주' */
function withContext(text: string): string {
  let path: [number, string][] = []
  let prev: { rank: number; end: number } | null = null
  return text.replace(PERIOD_WORD, (w, at: number) => {
    const r = periodRank(w)
    if (r === null) return w // '13월'처럼 기간 이름의 꼴이지만 아닌 것
    // 바로 앞에 붙여 쓴 큰 기간이 있으면('10월 2주') 이미 다 적은 것이다
    const joined = !!prev && prev.rank > r && !text.slice(prev.end, at).trim()
    path = path.filter(([pr]) => pr > r)
    const lead = joined ? '' : path.map(([, pw]) => `${pw} `).join('')
    path.push([r, w])
    prev = { rank: r, end: at + w.length }
    return lead + w
  })
}

/** 기간 글에서 칸 이름과 사이 표시(~, 부터, 까지)를 뺀 나머지. 비었으면 막대가 기간을 다 보여 준다 ('내년 상반기'는 남는다) */
export function periodRest(text: string, cols: string[]): string {
  // 해를 넘겨 막대가 칸 끝에서 잘리면 막대가 기간을 다 보여 주지 못한다: 기간 글을 그대로 보인다
  const sides = rangeSides(withContext(expandPeriodRange(text)), fullNames(cols).map(namePatterns))
  if (sides && sides[0] > sides[1]) return text.trim()
  // '10월 말'처럼 칸에 없는 때까지 적은 것(wide)은 남겨서 기간 글을 보인다
  const pats = fullNames(cols)
    .flatMap((w) => {
      const [exact, loose] = namePatterns(w)
      return [...exact, ...loose]
    })
    // 긴 이름부터 지워야 '10월 2주'의 '2주'만 지워지고 '10월'이 남지 않는다
    .sort((a, b) => b.source.length - a.source.length)
  let t = expandPeriodRange(text)
  for (const p of pats) t = t.replace(new RegExp(p.source, 'g'), ' ')
  return t.replace(/부터|까지|[\s~∼\-–—]/g, '')
}

/** 날짜 뒤에 붙어도 되는 것: 요일 하나 ('(금)', '금요일'). 그 밖의 것(기간의 끝 '~ 10일' 같은)이 붙으면 날짜 하나가 아니다 */
const WEEKDAY = /^\s*(\(\s*[월화수목금토일]\s*\)|[월화수목금토일]요일)?\s*$/

/** 적은 꼴마다: 달까지(그대로 보일 앞부분), 달, 일. 앞부분이 없는 꼴(11/8)은 달을 'n월'로 적는다 */
const FORMS: { re: RegExp; head: (m: RegExpExecArray) => string }[] = [
  // 11월 8일, 2026년 11월 8일 (금)
  { re: /^((?:\d{4}\s*년\s*)?(\d{1,2})\s*월)\s*(\d{1,2})\s*일(.*)$/, head: (m) => m[1] },
  // 2026. 11. 8., 2026-11-08, 2026/11/8
  { re: /^(\d{4}\s*([./-])\s*(\d{1,2}))\s*[./-]\s*(\d{1,2})\.?(.*)$/, head: (m) => m[1] + (m[2] === '.' ? '.' : '') },
  // 11/8, 11. 8. (점은 띄어 쓴 것만: '3.5'는 수일 수 있다)
  { re: /^((\d{1,2}))(?:\s*\/\s*|\.\s+)(\d{1,2})\.?(.*)$/, head: (m) => `${Number(m[2])}월` },
]

/**
 * 날짜를 일의 숫자와 그 위의 달(과 해), 요일로 나눈다. 일의 숫자는 크게, 달은 작게 두려고. 달까지는 사람이 적은 꼴 그대로(2026. 11.).
 * 날짜 하나로 읽히지 않으면(11월 둘째 주, 연말, 기간) null: 그때는 적은 글을 그대로 쓴다
 */
export function dateParts(text: string): { head: string; day: string; weekday: string } | null {
  const t = text.trim()
  for (const { re, head } of FORMS) {
    const m = re.exec(t)
    if (!m) continue
    // 꼴마다 달과 일의 자리: 첫 꼴은 2·3, 둘째는 3·4, 셋째는 2·3
    const [mi, di] = re === FORMS[1].re ? [3, 4] : [2, 3]
    const month = Number(m[mi])
    const day = Number(m[di])
    const rest = WEEKDAY.exec(m[m.length - 1])
    if (month < 1 || month > 12 || day < 1 || day > 31 || !rest) return null
    return { head: head(m).trim(), day: String(day), weekday: (rest[1] ?? '').replace(/\s+/g, '') }
  }
  return null
}

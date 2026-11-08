// 모션 그래픽(cine): 영화 타이틀이나 애니메이션처럼 한 장면을 짠 컴포넌트. 코드가 아니라 '장면 레시피'(데이터)이고, 앱 안의 엔진 하나
// (motion/cine.ts)가 해석해 그린다. 사람도 AI도 스크립트나 셰이더를 쓰지 않는다(CSP 그대로, 이 PC 밖으로 아무것도 나가지 않는다).
//
// 이 파일이 레시피의 뜻을 정하는 한 곳이다: 틀(프리셋) 넷, 값의 범위와 기본값, 버전 id(내용 해시), 쉬운 손잡이, 시간표.
// 엔진에는 레시피를 그대로 넘기지 않고, 여기서 아는 것만 골라 기본값과 시간표까지 채운 '대본'(CineScript)을 넘긴다.
// 그래서 엔진은 값을 읽는 법을 따로 갖지 않고, 더 새 버전의 레시피(엔진 번호가 큰 것)도 아는 층만 그린다(모르는 값은 쉬고 지우지 않는다).
//
// 글은 레시피에 넣지 않는다: 사람이 칸(fields)에 쓰고 엔진은 그리는 순간에만 읽는다. 레시피의 문자열은 정해진 낱말, 짧은 id, 해시 id뿐이다.

import type {
  CineAmount,
  CineCamera,
  CineEnter,
  CineFieldKey,
  CineFrame,
  CineMaterial,
  CinePace,
  CinePhase,
  CinePhaseKind,
  CinePresetId,
  CineRecipe,
  CineShape,
  CineSpread,
  CineText,
  CineTone,
  Deck,
} from './types'

/** 이 버전의 엔진 번호. 레시피를 읽는 법(구간, 모양, 손잡이의 뜻)이 바뀌면 올린다 */
export const CINE_ENGINE = 1

/** 첫 연출의 한도(ms, 생동감·보통 빠르기). 더 길면 듣는 분을 기다리게 한다(docs/MOTION.md '모션 그래픽') */
export const CINE_MAX_MS = 10000

// ---------- 정해진 낱말 ----------

const CINE_PHASES: readonly CinePhaseKind[] = ['seed', 'spread', 'gather', 'resolve', 'write', 'pull', 'hold']
export const CINE_FIELDS: readonly CineFieldKey[] = ['glyph', 'title', 'lead', 'label', 'text', 'sub', 'value', 'note', 'before', 'after']
const ENTERS: readonly CineEnter[] = ['settle', 'write', 'letters', 'count', 'carry']
const MATERIALS: readonly CineMaterial[] = ['particles', 'wash', 'threads', 'line']
/** 재료마다 고를 수 있는 모양(첫째가 기본) */
export const SHAPES_OF: Record<CineMaterial, readonly CineShape[]> = { particles: ['glyph', 'ring', 'point'], wash: ['point'], threads: ['glyph'], line: ['line', 'wave'] }
/** 장의 답에 강조색이 들어오는 시간(ms, 보통 빠르기) */
const ACCENT_MS = 450
const FRAMES: readonly CineFrame[] = ['mark', 'center', 'line']
const PRESET_IDS: readonly CinePresetId[] = ['light', 'diffuse', 'gather', 'stroke']

interface Choice<T> {
  id: T
  name: string
  description: string
}

export const CINE_SHAPES: Choice<CineShape>[] = [
  { id: 'glyph', name: '글자', description: '큰 글자의 모양으로 모여요' },
  { id: 'ring', name: '고리', description: '글 둘레의 고리로 모여요' },
  { id: 'line', name: '선', description: '가로로 그어지는 선이 돼요' },
  { id: 'wave', name: '물결', description: '굽이치는 선이 돼요' },
  { id: 'point', name: '한 점', description: '한 점으로 모였다가 사라져요' },
]
export const CINE_AMOUNTS: Choice<CineAmount>[] = [
  { id: 'few', name: '적게', description: '성글고 가벼워요' },
  { id: 'normal', name: '보통', description: '' },
  { id: 'many', name: '많이', description: '촘촘하고 또렷해요' },
]
export const CINE_SPREADS: Choice<CineSpread>[] = [
  { id: 'round', name: '둥글게', description: '한 점에서 사방으로 번져요' },
  { id: 'side', name: '옆으로', description: '좌우로 길게 번져요' },
  { id: 'rise', name: '위로', description: '연기처럼 위로 번져요' },
]
export const CINE_CAMERAS: Choice<CineCamera>[] = [
  { id: 'pull', name: '물러나기', description: '가까이에서 시작해 전체로 물러나요' },
  { id: 'push', name: '다가가기', description: '멀리서 시작해 천천히 다가가요' },
  { id: 'none', name: '그대로', description: '카메라가 움직이지 않아요' },
]
export const CINE_PACES: Choice<CinePace>[] = [
  { id: 'slow', name: '천천히', description: '' },
  { id: 'normal', name: '보통', description: '' },
  { id: 'fast', name: '빠르게', description: '' },
]
const CINE_TONES: Choice<CineTone>[] = [
  { id: 'ink', name: '글자색', description: '' },
  { id: 'mix', name: '글자색에 강조색 조금', description: '' },
  { id: 'accent', name: '강조색', description: '' },
]
export const CINE_ENTERS: Choice<CineEnter>[] = [
  { id: 'settle', name: '맺히기', description: '제자리에서 또렷해져요' },
  { id: 'write', name: '써지기', description: '왼쪽부터 펜 끝을 따라 써져요' },
  { id: 'letters', name: '한 글자씩', description: '글자가 차례로 내려앉아요' },
  { id: 'count', name: '숫자 굴리기', description: '숫자가 0에서 굴러가 맞춰져요' },
  { id: 'carry', name: '건너오기', description: '선 끝을 타고 앞 값에서 굴러 오며 건너와요' },
]

/** 모션 그래픽 칸의 이름과 안내. 컴포넌트 정의(blocks/native.ts)가 그대로 쓴다 */
export const CINE_FIELD_SPECS: { key: CineFieldKey; label: string; hint: string; multiline?: boolean }[] = [
  { key: 'glyph', label: '큰 글자', hint: 'N' },
  { key: 'title', label: '제목', hint: '새 협업 도구', multiline: true },
  { key: 'lead', label: '부제', hint: '흩어진 일정을 한곳에서 봐요', multiline: true },
  { key: 'label', label: '이름표', hint: '시작' },
  { key: 'text', label: '글', hint: '한두 문장', multiline: true },
  { key: 'sub', label: '덧붙이는 말', hint: '뒷받침하는 한 줄', multiline: true },
  { key: 'value', label: '숫자', hint: '1,280명' },
  { key: 'note', label: '끝 이름표', hint: '1년 뒤' },
  { key: 'before', label: '지금 값', hint: '6시간' },
  { key: 'after', label: '바뀐 값', hint: '2시간' },
]

// ---------- 틀(프리셋) 넷 ----------

/** 틀마다 이름, 하는 말, 어울리는 장, 처음 레시피(글 없이 정해진 낱말만) */
interface CinePresetSpec {
  id: CinePresetId
  name: string
  /** 무엇이 어떻게 움직이는지 한 줄 */
  description: string
  /** 어울리는 장 */
  fits: string
  /** 칸에 처음 넣을 지어낸 글(예시). 레시피에는 들어가지 않는다 */
  sample: Partial<Record<CineFieldKey, string>>
  recipe: Omit<CineRecipe, 'engine' | 'lineage' | 'seed' | 'preset'>
}

const phases = (...list: [CinePhaseKind, number, number?][]): CinePhase[] => list.map(([kind, ms, overlap]) => (overlap ? { kind, ms, overlap } : { kind, ms }))

/**
 * 틀 넷. 시간은 생동감·보통 빠르기 기준이고 차분하게는 엔진이 같은 안무를 줄인다. 큐 시트와 까닭은 docs/MOTION.md '모션 그래픽'.
 * 차례가 곧 고르는 곳의 차례다
 */
export const CINE_PRESETS: readonly CinePresetSpec[] = [
  {
    id: 'light',
    name: '빛에서 글자로',
    description: '한 점의 빛이 입자로 터졌다가 곧장 감겨 들어 큰 글자가 되고, 제목이 써지며 카메라가 물러나요.',
    fits: '표지, 새 이름이나 제품, 단락의 시작',
    sample: { glyph: 'N', title: '새 협업 도구', lead: '흩어진 일정을 한곳에서 봐요' },
    recipe: {
      frame: 'mark',
      material: 'particles',
      // 번짐이 끝나기 전에 모임이 시작한다(볼 곳 없는 먼지 구간을 두지 않는다). 글자는 생동감 1.9초, 차분하게 1.5초에 읽힌다
      phases: phases(['seed', 350], ['spread', 800, 100], ['gather', 1200, 400], ['resolve', 550, 250], ['write', 900, 200], ['pull', 1900, 800]),
      particles: { amount: 'many', size: 1, tone: 'ink', depth: 0.7, trail: true, spread: 'round' },
      shape: { kind: 'glyph', field: 'glyph' },
      light: true,
      line: false,
      camera: 'pull',
      pace: 'normal',
      texts: [
        { key: 'glyph', enter: 'settle', on: 'resolve', lag: 0.2 },
        { key: 'title', enter: 'write', on: 'write', answer: true },
        { key: 'lead', enter: 'settle', on: 'write', lag: 0.55 },
      ],
      handoff: true,
      // 답에 강조색이 들어온 뒤로는 고요하게: 되풀이는 고르는 사람만
      loop: false,
      bleed: true,
    },
  },
  {
    id: 'diffuse',
    name: '확산',
    description: '한 방울이 번지듯 부드러운 면이 장 끝까지 퍼지는 동안 가운데 숫자가 같은 빠르기로 굴러가 맞춰져요.',
    fits: '도입, 커지는 수, 퍼지는 것',
    sample: { value: '1,280명', title: '새로 함께한 사람', sub: '올해 3분기까지' },
    recipe: {
      frame: 'center',
      material: 'wash',
      phases: phases(['seed', 250], ['spread', 1800, 100], ['write', 700, 1100]),
      particles: { amount: 'normal', size: 1, tone: 'ink', depth: 0.5, trail: false, spread: 'round' },
      shape: { kind: 'point' },
      light: false,
      line: false,
      camera: 'push',
      pace: 'normal',
      texts: [
        { key: 'value', enter: 'count', on: 'spread', lag: 0.08, answer: true },
        { key: 'title', enter: 'settle', on: 'write' },
        { key: 'sub', enter: 'settle', on: 'write', lag: 0.5 },
      ],
      handoff: false,
      loop: false,
      bleed: true,
    },
  },
  {
    id: 'gather',
    name: '모여 맺힘',
    description: '장 밖 여러 곳에서 가는 선들이 건너와 한 줄로 모이고, 그 자리에서 한 문장이 맺혀요.',
    fits: '결론, 통합, 하나로 모으기',
    sample: { title: '한곳에서 찾아요', sub: '흩어진 고객 정보를 하나로' },
    recipe: {
      frame: 'center',
      material: 'threads',
      phases: phases(['seed', 200], ['gather', 1500, 100], ['resolve', 600, 250], ['write', 600, 200]),
      particles: { amount: 'normal', size: 1, tone: 'ink', depth: 0.5, trail: false, spread: 'side' },
      shape: { kind: 'glyph', field: 'title' },
      light: false,
      line: false,
      camera: 'none',
      pace: 'normal',
      texts: [
        { key: 'title', enter: 'settle', on: 'resolve', answer: true },
        { key: 'sub', enter: 'settle', on: 'write' },
      ],
      handoff: false,
      loop: false,
      bleed: true,
    },
  },
  {
    id: 'stroke',
    name: '그어지는 선',
    description: '왼쪽의 지금 값에서 선이 그어지고, 값이 선 끝을 타고 건너가며 굴러 바뀐 값에 닿아요.',
    fits: '과정, 지금에서 다음으로, 바뀌는 값',
    sample: { title: '한 주 회의 시간', label: '지금', before: '6시간', note: '1년 뒤', after: '2시간' },
    recipe: {
      frame: 'line',
      material: 'line',
      phases: phases(['seed', 300], ['gather', 1400, 150], ['resolve', 400, 200], ['write', 500, 150]),
      particles: { amount: 'normal', size: 1, tone: 'ink', depth: 0.3, trail: false, spread: 'side' },
      shape: { kind: 'line' },
      light: false,
      line: true,
      camera: 'none',
      pace: 'normal',
      texts: [
        { key: 'title', enter: 'settle', on: 'seed' },
        { key: 'before', enter: 'settle', on: 'seed', lag: 0.4 },
        { key: 'label', enter: 'settle', on: 'seed', lag: 0.6 },
        { key: 'after', enter: 'carry', on: 'gather', answer: true },
        { key: 'note', enter: 'settle', on: 'write' },
      ],
      handoff: false,
      loop: false,
      bleed: false,
    },
  },
]

export const presetSpec = (id: CinePresetId) => CINE_PRESETS.find((p) => p.id === id) ?? CINE_PRESETS[0]

/** 틀에서 새 레시피. lineage는 라이브러리의 새 갈래 id */
export function presetRecipe(id: CinePresetId, lineage: string, seed = 7): CineRecipe {
  const p = presetSpec(id)
  return structuredCopy({ engine: CINE_ENGINE, lineage, preset: p.id, seed, ...p.recipe })
}

const structuredCopy = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T

// ---------- 버전 id ----------

/** 열쇠를 정렬한 JSON: 같은 내용이면 열쇠의 차례와 상관없이 같은 글 */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`
  if (v && typeof v === 'object')
    return `{${Object.keys(v)
      .sort()
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`)
      .join(',')}}`
  return JSON.stringify(v)
}

/** 53비트 해시 두 갈래를 섞은 값(같은 글이면 늘 같다). 버전 id를 만드는 데만 쓴다 */
function hash(text: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36).padStart(11, '0')
}

/** 레시피의 버전 id: 내용 해시. 같은 레시피는 어느 발표, 어느 PC에서나 같은 id다 */
export const cineId = (recipe: CineRecipe) => `c${hash(canonical(recipe))}`

export const isCineId = (v: unknown): v is string => typeof v === 'string' && /^c[0-9a-z]{11}$/.test(v)

// ---------- 받은 레시피 바로잡기 ----------

/** 레시피 안에 둘 수 있는 글: 정해진 낱말과 짧은 id. 사람의 글이 레시피에 섞여 들지 않게 이보다 긴 글이나 다른 글자는 뺀다 */
const WORD = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,31}$/

/**
 * 파일에서 읽은 값을 레시피로. 모르는 열쇠(더 새 버전의 것)도 남긴다: 이 버전은 그 층을 쉬고 지우지 않는다. 다만 값은 숫자, 불리언,
 * 정해진 낱말 꼴의 글과 그 묶음만 남긴다(사람의 글은 레시피에 들어가지 않는다). 레시피의 꼴(엔진 번호, 갈래 id)이 아니면 null
 */
export function cleanRecipe(raw: unknown): CineRecipe | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  if (!Number.isInteger(r.engine) || (r.engine as number) < 1 || typeof r.lineage !== 'string' || !WORD.test(r.lineage)) return null
  return keep(r, 0) as unknown as CineRecipe
}

function keep(v: unknown, depth: number): unknown {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined
  if (typeof v === 'boolean') return v
  if (typeof v === 'string') return WORD.test(v) ? v : undefined
  if (depth > 4) return undefined
  if (Array.isArray(v))
    return v
      .slice(0, 24)
      .map((x) => keep(x, depth + 1))
      .filter((x) => x !== undefined)
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, x] of Object.entries(v).slice(0, 32)) {
      if (!WORD.test(k) || k === '__proto__') continue
      const y = keep(x, depth + 1)
      if (y !== undefined) out[k] = y
    }
    return out
  }
  return undefined
}

/** 발표의 레시피 모음을 바로잡는다(열쇠가 버전 id 꼴이고 값이 레시피 꼴인 것만) */
export function cleanCines(raw: unknown): Record<string, CineRecipe> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const out: Record<string, CineRecipe> = {}
  for (const [id, v] of Object.entries(raw)) {
    const r = isCineId(id) ? cleanRecipe(v) : null
    if (r) out[id] = r
  }
  return Object.keys(out).length ? out : undefined
}

/** 쓰는 레시피만 남긴다(모션 그래픽을 빼거나 다른 버전으로 바꾸면 앞의 것은 발표에서 빠진다. 라이브러리에는 남는다) */
export function tidyCines<T extends Pick<Deck, 'slides' | 'cines'>>(deck: T): T {
  if (!deck.cines) return deck
  const used = new Set<string>()
  for (const s of deck.slides) for (const b of s.blocks ?? []) if (b.type === 'cine' && b.cine) used.add(b.cine)
  const ids = Object.keys(deck.cines)
  if (ids.every((id) => used.has(id))) return deck
  const kept = Object.fromEntries(ids.filter((id) => used.has(id)).map((id) => [id, deck.cines![id]]))
  const { cines: _, ...rest } = deck
  return (Object.keys(kept).length ? { ...rest, cines: kept } : rest) as T
}

// ---------- 대본: 엔진에 넘기는, 아는 것만 채운 꼴 ----------

/** 구간 하나의 때(ms, 생동감·보통 빠르기) */
export interface CineSpan {
  kind: CinePhaseKind
  start: number
  end: number
}

/** 글 칸 하나가 들어오는 때 */
export interface CineTextCue {
  key: CineFieldKey
  enter: CineEnter
  start: number
  end: number
  /** 장의 답: 다 들어온 때(end)부터 이때까지 글자색에서 강조색으로 한 번 바뀐다 */
  accent?: number
}

/**
 * 엔진이 그리는 대본. 레시피의 모든 값을 알맞은 범위로 맞추고 시간표(구간의 시작과 끝)까지 셈해 둔다.
 * 내보낸 HTML의 뷰어도 이 꼴을 그대로 읽는다(칸의 data-script)
 */
export interface CineScript {
  frame: CineFrame
  material: CineMaterial
  seed: number
  spans: CineSpan[]
  /** 다 맺히는 때(ms) */
  total: number
  /** 입자 수(GPU로 그릴 때. 캔버스는 엔진이 줄인다) */
  count: number
  size: number
  tone: CineTone
  depth: number
  trail: boolean
  spread: CineSpread
  shape: CineShape
  /** 모양을 딸 글 칸(shape가 glyph일 때) */
  field?: CineFieldKey
  light: boolean
  line: boolean
  camera: CineCamera
  texts: CineTextCue[]
  handoff: boolean
  loop: boolean
  bleed: boolean
  headAfter: boolean
}

const PACE: Record<CinePace, number> = { slow: 1.3, normal: 1, fast: 0.76 }
const COUNT: Record<CineAmount, number> = { few: 1500, normal: 3000, many: 5000 }

const oneOf = <T,>(list: readonly T[], v: unknown, base: T): T => (list.includes(v as T) ? (v as T) : base)
const num = (v: unknown, lo: number, hi: number, base: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : base)

/**
 * 구간들의 시작과 끝. 앞 구간이 끝나기 overlap만큼 전에 다음 구간이 시작한다. 모르는 구간(더 새 엔진의 것)은 그 시간만큼 머무는
 * 것(hold)으로 읽는다: 차례와 때는 지키고 그 층만 쉰다
 */
export function spansOf(list: unknown, pace = 1): CineSpan[] {
  const out: CineSpan[] = []
  let end = 0
  for (const p of Array.isArray(list) ? list.slice(0, 16) : []) {
    if (!p || typeof p !== 'object') continue
    const ms = num((p as CinePhase).ms, 0, 6000, 0) * pace
    const overlap = num((p as CinePhase).overlap, 0, 6000, 0) * pace
    const start = Math.max(0, end - Math.min(overlap, end))
    const kind = oneOf(CINE_PHASES, (p as CinePhase).kind, 'hold')
    out.push({ kind, start, end: start + ms })
    end = Math.max(end, start + ms)
  }
  return out
}

/** 레시피 → 대본. 레시피의 꼴이 아니면 null(그리지 않는다) */
export function cineScript(raw: unknown): CineScript | null {
  const r = cleanRecipe(raw)
  if (!r) return null
  const preset = presetSpec(oneOf(PRESET_IDS, r.preset, 'light')).recipe
  const pace = PACE[oneOf(['slow', 'normal', 'fast'] as const, r.pace, 'normal')]
  let spans = spansOf(r.phases, pace)
  // 한도보다 길면 같은 비율로 줄인다(값은 그대로 두고 그릴 때만)
  const long = spans.reduce((m, x) => Math.max(m, x.end), 0)
  if (long > CINE_MAX_MS) spans = spans.map((s) => ({ ...s, start: (s.start * CINE_MAX_MS) / long, end: (s.end * CINE_MAX_MS) / long }))
  const total = spans.reduce((m, x) => Math.max(m, x.end), 0)
  const pt = (r.particles ?? {}) as Partial<CineRecipe['particles']>
  const shape = (r.shape ?? {}) as Partial<CineRecipe['shape']>
  const first = (kind: CinePhaseKind) => spans.find((s) => s.kind === kind)
  const texts: CineTextCue[] = []
  for (const t of Array.isArray(r.texts) ? (r.texts as Partial<CineText>[]).slice(0, CINE_FIELDS.length) : []) {
    if (!t || !CINE_FIELDS.includes(t.key as CineFieldKey) || texts.some((x) => x.key === t.key)) continue
    // 그 구간이 없으면(손잡이로 뺀 구간) 글이 들어오는 구간(write), 그것도 없으면 맨 끝 구간에
    const span = first(oneOf(CINE_PHASES, t.on, 'write')) ?? first('write') ?? spans[spans.length - 1] ?? { start: 0, end: 600 }
    const lag = num(t.lag, 0, 0.95, 0)
    const start = span.start + (span.end - span.start) * lag
    // 글 하나가 들어오는 시간: 짧게 맺히고(0.5~0.7초), 써지기와 숫자는 구간 끝까지(0.6초 이상)
    const enter = oneOf(ENTERS, t.enter, 'settle')
    // 숫자 굴리기는 1.6초까지: 끝자리가 1초 넘게 꼼지락거리면 기다리게 한다(검수, docs/MOTION.md 4절 '숫자는 2초 안')
    const len = enter === 'settle' ? 620 * pace : enter === 'count' ? Math.min(1600 * pace, Math.max(600 * pace, span.end - start)) : Math.max(600 * pace, span.end - start)
    // 장의 답은 하나: 강조색이 들어오는 0.45초를 끝에 더한다
    texts.push({ key: t.key as CineFieldKey, enter, start, end: start + len, ...(t.answer === true && !texts.some((x) => x.accent !== undefined) ? { accent: start + len + ACCENT_MS * pace } : {}) })
  }
  // 모양은 재료마다 뜻이 있는 것만: 입자는 글자, 고리, 한 점으로 모이고, 그어지는 선은 선이나 물결, 먹의 면은 한 점에서, 가는 선은 글자로
  const material = oneOf(MATERIALS, r.material, preset.material ?? 'particles')
  const kinds = SHAPES_OF[material]
  const kind = oneOf(kinds, shape.kind, kinds[0])
  return {
    frame: oneOf(FRAMES, r.frame, preset.frame),
    material,
    seed: num(r.seed, 0, 2 ** 31, 7) | 0,
    spans,
    total: Math.max(total, ...texts.map((t) => t.accent ?? t.end)),
    count: COUNT[oneOf(CINE_AMOUNTS.map((a) => a.id), pt.amount, preset.particles.amount)],
    size: num(pt.size, 0.6, 1.6, 1),
    tone: oneOf(CINE_TONES.map((t) => t.id), pt.tone, 'ink'),
    depth: num(pt.depth, 0, 1, 0.5),
    trail: pt.trail === true,
    spread: oneOf(CINE_SPREADS.map((s) => s.id), pt.spread, 'round'),
    shape: kind,
    ...(kind === 'glyph' ? { field: oneOf(CINE_FIELDS, shape.field, preset.shape.field ?? 'title') } : {}),
    light: r.light === true,
    line: r.line === true,
    camera: oneOf(CINE_CAMERAS.map((c) => c.id), r.camera, 'none'),
    texts,
    handoff: r.handoff === true,
    loop: r.loop === true,
    bleed: r.bleed === true,
    headAfter: r.headAfter === true,
  }
}

/** 이 버전이 다 아는 레시피인지(엔진 번호가 이 버전 것 이하). 아니면 편집기가 '새 버전에서 만든 모션 그래픽'이라고 알린다 */
export const cineKnown = (r: Pick<CineRecipe, 'engine'>) => r.engine <= CINE_ENGINE

// ---------- 쉬운 손잡이 ----------

/** 모션 편집의 오른쪽 칸에 보이는 손잡이. 값을 고르면 레시피의 몇 군데를 함께 바꾼다(withKnob) */
export type CineKnob = 'shape' | 'amount' | 'spread' | 'light' | 'camera' | 'pace' | 'enter' | 'trail' | 'loop' | 'bleed' | 'headAfter'

/** 글이 들어오는 모습을 고를 칸: 레시피에서 처음 나오는 제목이나 숫자(모양을 딴 칸은 맺히기 그대로) */
export function mainText(r: CineRecipe): CineText | undefined {
  const shaped = r.shape?.kind === 'glyph' ? r.shape.field : undefined
  return r.texts?.find((t) => (t.key === 'title' || t.key === 'value' || t.key === 'text') && t.key !== shaped)
}

/** 손잡이마다 지금 값 */
export function knobValue(r: CineRecipe, knob: CineKnob): string | boolean {
  switch (knob) {
    case 'shape':
      return r.shape?.kind ?? 'glyph'
    case 'amount':
      return r.particles?.amount ?? 'normal'
    case 'spread':
      return r.particles?.spread ?? 'round'
    case 'light':
      return r.light === true
    case 'camera':
      return r.camera ?? 'none'
    case 'pace':
      return r.pace ?? 'normal'
    case 'enter':
      return mainText(r)?.enter ?? 'settle'
    case 'trail':
      return r.particles?.trail === true
    case 'loop':
      return r.loop === true
    case 'bleed':
      return r.bleed === true
    case 'headAfter':
      return r.headAfter === true
  }
}

/** 이 레시피에서 뜻이 있는 손잡이만(번지는 구간이 없으면 번지는 모양은 고를 것이 없다) */
export function knobsFor(r: CineRecipe): CineKnob[] {
  const has = (k: CinePhaseKind) => r.phases?.some((p) => p.kind === k)
  const material = oneOf(MATERIALS, r.material, presetSpec(oneOf(PRESET_IDS, r.preset, 'light')).recipe.material ?? 'particles')
  // 재료마다 뜻이 있는 손잡이만: 입자가 아닌 재료에 모일 모양, 번지는 모양, 빛, 잔상을 보이면 눌러도 바뀌는 것이 없다
  const out: CineKnob[] = []
  if (material === 'particles') out.push('shape', 'amount')
  else if (material === 'line') out.push('shape')
  else out.push('amount')
  if (material === 'particles' && has('spread')) out.push('spread')
  if (material === 'particles') out.push('light')
  if (material !== 'line') out.push('camera')
  out.push('pace')
  if (mainText(r)) out.push('enter')
  if (material === 'particles') out.push('trail', 'loop')
  if (material !== 'line') out.push('bleed')
  out.push('headAfter')
  return out
}

/** 글 칸마다 고를 수 있는 들어오기(숫자 굴리기는 숫자 칸에만) */
export const entersFor = (key: CineFieldKey): CineEnter[] => (key === 'value' ? ['settle', 'write', 'count'] : key === 'after' ? ['carry', 'settle'] : ['settle', 'write', 'letters'])

/**
 * 손잡이 하나를 바꾼 레시피(새 객체). 모양을 바꾸면 그 모양에 맞는 칸과 선을 함께 고친다: 글자로 모이려면 모양을 딸 칸이 있어야 하고,
 * 선과 물결은 모인 자리에 가는 선이 남는다
 */
export function withKnob(r: CineRecipe, knob: CineKnob, value: string | boolean): CineRecipe {
  const next = structuredCopy(r)
  switch (knob) {
    case 'shape': {
      const kind = oneOf(CINE_SHAPES.map((s) => s.id), value, next.shape.kind)
      const field = kind === 'glyph' ? (next.shape.field ?? (next.frame === 'mark' ? 'glyph' : 'title')) : undefined
      next.shape = field ? { kind, field } : { kind }
      next.line = kind === 'line' || kind === 'wave'
      break
    }
    case 'amount':
      next.particles.amount = oneOf(CINE_AMOUNTS.map((a) => a.id), value, next.particles.amount)
      break
    case 'spread':
      next.particles.spread = oneOf(CINE_SPREADS.map((s) => s.id), value, next.particles.spread)
      break
    case 'camera':
      next.camera = oneOf(CINE_CAMERAS.map((c) => c.id), value, next.camera)
      break
    case 'pace':
      next.pace = oneOf(CINE_PACES.map((p) => p.id), value, next.pace)
      break
    case 'enter': {
      const t = mainText(next)
      if (t) t.enter = oneOf(entersFor(t.key), value, t.enter)
      break
    }
    case 'light':
      next.light = value === true
      break
    case 'trail':
      next.particles.trail = value === true
      break
    case 'loop':
      next.loop = value === true
      break
    case 'bleed':
      next.bleed = value === true
      break
    case 'headAfter':
      if (value === true) next.headAfter = true
      else delete next.headAfter
      break
  }
  return next
}

export const isPresetId = (v: unknown): v is CinePresetId => PRESET_IDS.includes(v as CinePresetId)

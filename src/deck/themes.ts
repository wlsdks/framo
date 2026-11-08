import type { CSSProperties } from 'react'
import { HEAD } from './frame'
import type { Deck, DeckTheme, FontId, FooterMode, Motion, Place, Slide, TextSize, ThemeId, Tone, Transition } from './types'

interface Theme {
  id: ThemeId
  name: string
  description: string
  accent: string
  /**
   * 짙은 면(표지 옆면, 진한 면 부품, 색 면 단락 장)의 색. null이면 강조색을 깊게 가라앉힌 색(deepOf).
   * 쨍한 강조색은 '답'(숫자, 고른 막대)에만 쓰고, 넓은 면은 강조색을 깊게 한 색으로 깐다
   */
  deep: string | null
  /** good, bad: 목표 대비, 증감처럼 좋고 나쁨을 보일 때만 쓴다. 늘 글자(▲▼, 달성)와 함께 */
  colors: { bg: string; ink: string; ink2: string; ink3: string; line: string; surface: string; good: string; bad: string }
}

/*
 * 글꼴은 모두 앱과 내보낸 파일에 들어 있다(SIL OFL 1.1, docs/OPEN-SOURCE.md). 윈도우에서도 맥과 같게 보이고, 바깥 주소로 받지 않는다.
 * 프리텐다드를 늘 뒤에 둔다: 고른 글꼴에 없는 글자(SUIT의 드문 한글, ▲▼ 같은 기호)는 프리텐다드로 그린다
 */
const SANS = "'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif"
const SERIF = "'Hahmlet Variable', 'AppleMyungjo', 'Batang', serif"
const SUIT = `'SUIT', ${SANS}`
const MYEONGJO = "'Noto Serif KR Variable', 'AppleMyungjo', 'Batang', serif"

/*
 * 바탕은 흰색 아니면 검은색 두 가지뿐이다. 크림색처럼 색이 있는 바탕은 화면을 낡고 무겁게 만든다.
 * - 회색은 색을 섞지 않은 중립 회색. 강조색을 바꿔도 회색이 따로 놀지 않는다
 * - 맥락(작년, 다른 조각)은 회색, 강조색은 말하려는 한 곳에만 (Datawrapper의 차트 색 안내)
 * - 넓은 면(표지 옆면, 진한 면 부품, 색 면 단락 장)은 흰 바탕에서는 강조색을 깊게 가라앉힌 색(코발트면 짙은 남색),
 *   검은 바탕에서는 한 단계 뜬 검정. 흰 장 사이의 새까만 면은 너무 세고, 쨍한 강조색 면은 시끄럽다.
 *   흰 바탕, 짙은 남색 면, 강조색 하나는 보고 자료에서 오래 쓰인 짝이다
 */
const WHITE: Theme['colors'] = {
  bg: '#FFFFFF',
  ink: '#16171A',
  ink2: '#4A4C52',
  ink3: '#727479',
  line: '#E6E7EA',
  surface: '#F4F4F6',
  good: '#137A56',
  bad: '#C93A2E',
}

export const THEMES: Record<ThemeId, Theme> = {
  white: {
    id: 'white',
    name: '화이트',
    description: '흰 바탕이에요. 밝은 회의실과 인쇄에 잘 맞아요',
    accent: '#2F55D4',
    deep: null,
    colors: WHITE,
  },
  // id는 저장된 발표와 맞추려고 그대로 둔다 (예전 이름: 네이비)
  navy: {
    id: 'navy',
    name: '블랙',
    description: '검은 바탕이에요. 숫자와 차트가 또렷하게 떠요',
    accent: '#6B93FF',
    deep: '#222327',
    colors: {
      bg: '#000000',
      ink: '#F4F4F5',
      ink2: '#A6A7AC',
      ink3: '#808187',
      line: '#2A2B2F',
      surface: '#141517',
      good: '#5FD09A',
      bad: '#FF8478',
    },
  },
  // 예전의 세리프 테마. 이제 고르는 목록에는 없고, 열면 화이트에 명조 제목으로 바꾼다 (plainTheme)
  serif: {
    id: 'serif',
    name: '화이트',
    description: '흰 바탕에 명조 제목이에요',
    accent: '#2F55D4',
    deep: null,
    colors: WHITE,
  },
}

/**
 * 고를 수 있는 강조색. 두 바탕(흰색, 검은색)과 장의 바탕(반대 색, 강조색)에서 맞춰 보고 골랐다.
 * 검은 바탕에서는 숫자가 또렷하게 읽힐 만큼 밝혀서 쓴다 (readable)
 */
export const ACCENT_COMBOS: { name: string; accent: string }[] = [
  { name: '코발트', accent: '#2F55D4' },
  { name: '하늘', accent: '#6B93FF' },
  { name: '청록', accent: '#0B776E' },
  { name: '숲', accent: '#1B6A52' },
  { name: '남보라', accent: '#4A45B5' },
  { name: '자두', accent: '#9A2F5F' },
  { name: '벽돌', accent: '#B8432A' },
  { name: '황토', accent: '#9E6A12' },
  { name: '먹', accent: '#3A4254' },
]

export const THEME_ORDER: ThemeId[] = ['white', 'navy']

/** 발표할 때의 움직임. 이름과 설명은 발표 설정과 AI 카탈로그에 함께 쓴다. */
export const MOTIONS: { id: Motion; name: string; description: string }[] = [
  { id: 'none', name: '없음', description: '넘기면 바로 다 보여요.' },
  { id: 'calm', name: '차분하게', description: '제목, 항목이 차례로 살짝 올라와요. 보고 자리에 어울려요.' },
  { id: 'lively', name: '생동감', description: '더 크게 움직이고, 숫자가 굴러가다 살짝 지나쳤다 맞춰져요. 발표가 길 때 좋아요.' },
]

/**
 * 고를 수 있는 것들. 이름과 설명은 테마 메뉴, 이 장 설정, AI 카탈로그에 함께 쓴다.
 * 글꼴은 제목과 본문을 따로 고르지 않고 맞춰 본 짝 하나를 고른다. 아무렇게나 섞으면 비슷한 고딕 둘이 부딪치거나
 * 본문까지 명조가 되어 화면에서 읽기 어렵다. id 'sans', 'serif'는 예전 '고딕', '명조'(제목 글꼴)와 같은 값이다
 */
export const FONTS: { id: FontId; name: string; description: string }[] = [
  { id: 'sans', name: '프리텐다드', description: '기본 글꼴이에요. 제목과 본문 모두 또렷하고 현대적이라 어느 보고에나 잘 맞아요.' },
  { id: 'suit', name: 'SUIT', description: '제목과 본문 모두 SUIT예요. 글자가 반듯하고 둥글어서 숫자가 많은 슬라이드가 산뜻해 보여요.' },
  { id: 'serif', name: '명조 제목', description: '제목은 굵은 명조, 본문은 프리텐다드예요. 큰 화면에서도 제목이 또렷하고 격식 있어 보여요.' },
  { id: 'myeongjo', name: '본명조 제목', description: '제목은 가늘고 단정한 본명조, 본문은 프리텐다드예요. 보내 드리는 문서 같은 보고에 어울려요.' },
]

export const TEXT_SIZES: { id: TextSize; name: string; description: string }[] = [
  { id: 'small', name: '작게', description: '글이 많은 슬라이드도 넉넉하게 들어가요.' },
  { id: 'normal', name: '보통', description: '회의실 화면에 맞춘 크기예요.' },
  { id: 'large', name: '크게', description: '큰 회의실이나 화면 공유에서 잘 읽혀요.' },
]

/**
 * 슬라이드 아래쪽에 보이는 것. 예전 이름 '아래 표시', '섹션만', '숨기기'는 무엇이 어디에 보이는지 알기 어려웠다.
 * 발표 설정(DeckSettings.tsx)이 고를 때마다 그 슬라이드의 아래쪽 모습을 같이 보인다
 */
export const FOOTERS: { id: FooterMode; name: string; description: string }[] = [
  { id: 'section', name: '섹션 이름', description: '슬라이드 아래에 지금 섹션 이름을 보여요(섹션이 없으면 발표 이름). 화면으로 발표할 때 알맞아요.' },
  { id: 'all', name: '섹션 이름과 쪽 번호', description: '섹션 이름과 쪽 번호를 같이 보여요. 인쇄하거나 보낼 때 알맞아요.' },
  { id: 'page', name: '쪽 번호', description: '슬라이드 아래에 쪽 번호만 보여요.' },
  { id: 'none', name: '아무것도 없음', description: '슬라이드 아래에 아무것도 넣지 않아요.' },
]

/**
 * 화면 전환. 처음 값은 '자동'이라 대부분은 고르지 않아도 된다. 예전 이름 '모션에 맞춰', '모핑'은 무엇이 되는지 알기 어려웠다.
 * 발표 설정이 고를 때마다 두 슬라이드가 넘어가는 작은 그림을 같이 보인다
 */
export const TRANSITIONS: { id: Transition; name: string; description: string }[] = [
  { id: 'auto', name: '자동', description: '모션에 맞춰 알아서 골라요. 차분하게는 흐리게, 생동감은 밀기로 넘어가요.' },
  { id: 'none', name: '바로', description: '전환 없이 바로 다음 슬라이드가 보여요.' },
  { id: 'fade', name: '흐리게', description: '앞 슬라이드가 흐려지며 다음 슬라이드가 나타나요.' },
  { id: 'slide', name: '밀기', description: '다음 슬라이드가 옆에서 밀고 들어와요.' },
  { id: 'zoom', name: '다가오기', description: '다음 슬라이드가 앞으로 다가오듯 커지며 나타나요.' },
  { id: 'morph', name: '이어지게', description: '두 슬라이드에 같은 제목이나 컴포넌트가 있으면 사라지지 않고 새 자리와 크기로 옮겨 가요(PowerPoint의 모핑). 나머지는 흐리게 바뀌어요.' },
]

/** 제목 덩어리의 자리 (표지, 섹션). 장 위에서 제목을 위아래로 끌거나 이 장 설정에서 고른다 */
export const PLACES: { id: Place; name: string; description: string }[] = [
  { id: 'top', name: '위', description: '제목을 슬라이드 위쪽에 둬요. 아래가 넓게 비어 차분해 보여요.' },
  { id: 'middle', name: '가운데', description: '제목을 슬라이드 가운데에 둬요. 한 문장을 크게 보일 때 좋아요.' },
  { id: 'bottom', name: '아래', description: '제목을 슬라이드 아래쪽에 둬요. 보고 표지에 많이 쓰는 자리예요.' },
]

export const TONES: { id: Tone; name: string; description: string }[] = [
  { id: 'base', name: '바탕', description: '발표 전체와 같은 바탕이에요.' },
  { id: 'invert', name: '반대 색', description: '밝은 테마는 어둡게, 어두운 테마는 밝게. 흐름을 끊고 눈길을 모아요.' },
  { id: 'accent', name: '강조색', description: '강조색 면 위에 글을 놓아요. 가장 중요한 슬라이드 한두 곳에만 써요.' },
]

/** 고른 색 조합의 이름 (테마 기본색, 직접 고른 색도) */
export function comboName(deckTheme: DeckTheme): string {
  if (!deckTheme.accent) return '테마 기본색'
  return ACCENT_COMBOS.find((c) => c.accent.toLowerCase() === deckTheme.accent?.toLowerCase())?.name ?? '직접 고른 색'
}

/** 강조색 견본 */
export function comboSwatch(c: { accent: string }): string {
  return c.accent
}

/** 예전의 세리프 테마는 화이트에 명조 제목으로. 글꼴을 따로 골라 두었으면 그대로 */
export function plainTheme(deckTheme: DeckTheme): DeckTheme {
  if (deckTheme.id !== 'serif') return deckTheme
  return { ...deckTheme, id: 'white', font: deckTheme.font ?? 'serif' }
}

function rgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  const n = m ? parseInt(m[1], 16) : 0
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** a를 t만큼, b를 (1 - t)만큼 섞은 색 */
function mix(a: string, b: string, t: number): string {
  const x = rgb(a)
  const y = rgb(b)
  return '#' + x.map((c, i) => Math.round(c * t + y[i] * (1 - t)).toString(16).padStart(2, '0')).join('')
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * 바탕 위에서 읽힐 만큼 강조색을 밝히거나 어둡게 한다. 흰 바탕은 큰 글자 기준(3:1),
 * 검은 바탕은 4.5:1: 짙은 색은 검정 위에서 3:1을 넘겨도 가라앉아 흐려 보인다
 */
function readable(accent: string, bg: string): string {
  const dark = luminance(bg) < 0.2
  const toward = dark ? '#FFFFFF' : '#10141F'
  for (let t = 1; t >= 0.2; t -= 0.05) {
    const c = mix(accent, toward, t)
    if (contrast(c, bg) >= (dark ? 4.5 : 3)) return c
  }
  return toward
}

function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return 0
  const n = parseInt(m[1], 16)
  const channel = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
}

/** 강조색 위에 올릴 글자색. 대비가 더 큰 쪽을 고른다. */
function inkOn(hex: string): string {
  const l = luminance(hex)
  const contrastWhite = 1.05 / (l + 0.05)
  const contrastDark = (l + 0.05) / 0.0568
  return contrastWhite >= contrastDark ? '#FFFFFF' : '#10141F'
}

export function accentOf(deckTheme: Deck['theme']): string {
  return deckTheme.accent || THEMES[deckTheme.id].accent
}

/**
 * font: 제목과 큰 숫자, body: 본문. weight: 제목 굵기(단락 장, 표지의 큰 제목은 한 단계 더). SUIT는 굵기마다 한 단계 굵은 파일을 잇는다(fonts/suit.css)
 * num: 큰 숫자의 굵기. 숫자는 크기로 답이 되므로 굵게 칠하지 않고 보통 굵기 안팎으로 둔다(굵은 파란 숫자가 흔한 보고서 꼴로 보였다).
 *   너무 가늘면(300) 프로젝터와 뒷자리에서 획이 약해져서, 글꼴마다 눈으로 보고 정했다: 프리텐다드 400, SUIT 400(파일은 Medium),
 *   함렛(Hahmlet) 500, 본명조(Noto Serif)는 가로획이 더 가늘어 600
 * glyph: 한 줄로 줄이는 글(숫자 등)의 글자 폭이 고딕(textUnits의 기준)보다 얼마나 넓은지. 명조는 숫자와 %가 넓다.
 * tall: 큰 숫자의 줄 높이를 얼마나 늘리는지. 명조는 한글과 숫자의 키가 커서 줄 높이 0.8로는 위아래 글에 올라탄다
 * box, gap: 글꼴 높이(위아래 합)와 그 위에서 한글 윗선까지(글자 크기 배율, 캔버스로 잰 값). 장 맨 위의 제목을
 *   글자 윗선으로 틀에 맞출 때 쓴다(slides.css의 --pad-y)
 * 본문 글꼴의 높이는 slides.css가 프리텐다드 값(1.19, 0.155)으로 셈한다. SUIT는 글꼴 높이(1.25)와 윗빈칸(0.18)이 함께 커서
 * 줄 안에서 한글이 그려지는 자리는 프리텐다드와 같다(0.01em 안). 명조 제목 둘은 본문이 프리텐다드다
 * title, lead: 장 제목과 부제 글씨의 글자 폭(Glyphs). 부제는 본문 글꼴이다
 */
const FONT_LOOK: Record<FontId, { font: string; body: string; weight: number; num: number; tracking: string; glyph: number; tall: number; box: number; gap: number; title: Glyphs; lead: Glyphs }> = {
  sans: { font: SANS, body: SANS, weight: 700, num: 400, tracking: '-0.022em', glyph: 1, tall: 1, box: 1.19, gap: 0.15, title: { hangul: 0.85, space: 0.21, digit: 0.6, upper: 0.66, lower: 0.52, narrow: 0.27, wide: 0.94, other: 0.4 }, lead: { hangul: 0.86, space: 0.25, digit: 0.58, upper: 0.64, lower: 0.5, narrow: 0.25, wide: 0.86, other: 0.37 } },
  serif: { font: SERIF, body: SANS, weight: 600, num: 500, tracking: '-0.012em', glyph: 1.15, tall: 1.18, box: 1.44, gap: 0.33, title: { hangul: 0.93, space: 0.25, digit: 0.61, upper: 0.79, lower: 0.56, narrow: 0.37, wide: 1.11, other: 0.45 }, lead: { hangul: 0.86, space: 0.25, digit: 0.58, upper: 0.64, lower: 0.5, narrow: 0.25, wide: 0.86, other: 0.37 } },
  suit: { font: SUIT, body: SUIT, weight: 700, num: 400, tracking: '-0.022em', glyph: 1.06, tall: 1.03, box: 1.25, gap: 0.175, title: { hangul: 0.86, space: 0.21, digit: 0.58, upper: 0.69, lower: 0.51, narrow: 0.3, wide: 1.05, other: 0.47 }, lead: { hangul: 0.87, space: 0.22, digit: 0.56, upper: 0.67, lower: 0.48, narrow: 0.28, wide: 1.05, other: 0.45 } },
  myeongjo: { font: MYEONGJO, body: SANS, weight: 700, num: 600, tracking: '-0.03em', glyph: 1.08, tall: 1.18, box: 1.44, gap: 0.29, title: { hangul: 0.95, space: 0.28, digit: 0.56, upper: 0.7, lower: 0.56, narrow: 0.31, wide: 0.94, other: 0.39 }, lead: { hangul: 0.86, space: 0.25, digit: 0.58, upper: 0.64, lower: 0.5, narrow: 0.25, wide: 0.86, other: 0.37 } },
}

/**
 * 글자 갈래마다 한 글자의 폭(글자 크기의 몫, 자간까지). 장 제목과 부제를 그 글꼴과 굵기로 그려 잰 값이다(한글은 흔한 글자와
 * 획이 많은 글자 가운데 넓은 쪽). wide는 %, narrow는 .,:;'!|, other는 괄호, 붙임표 같은 그 밖의 기호
 */
export type Glyphs = { hangul: number; space: number; digit: number; upper: number; lower: number; narrow: number; wide: number; other: number }

/** 테마가 원래 쓰는 글꼴 */
export function fontOf(deckTheme: { id?: string; font?: string }): FontId {
  // 새 버전에서 더한 글꼴처럼 모르는 값이면 테마의 글꼴로 그린다. 값은 그대로 두어 저장해도 잃지 않는다 (compat.ts)
  if (deckTheme.font && Object.hasOwn(FONT_LOOK, deckTheme.font)) return deckTheme.font as FontId
  return deckTheme.id === 'serif' ? 'serif' : 'sans'
}

/**
 * 장 머리(제목, 부제)의 높이를 어림하는 값 (sizing.ts의 composeAreaH): 제목과 부제 글씨의 글자 폭, 그리고 장 맨 위 제목을 글자
 * 윗선으로 틀에 맞추며 올리는 만큼(글자 크기의 몫, frame.css의 .s-title margin-top과 같은 꼴). 고딕 값 하나로 어림하던 때는
 * 글자가 넓은 명조 제목이 실제로는 두 줄인데 한 줄로 쳐서, 본문을 71px 넉넉하게 잡아 칸이 잘려도 '자리가 모자라요'가 뜨지 않았다
 */
export function headLook(theme?: { id?: string; font?: string }): { title: Glyphs; lead: Glyphs; trim: number } {
  const f = FONT_LOOK[fontOf(theme ?? {})]
  return { title: f.title, lead: f.lead, trim: (HEAD.titleLine - f.box) / 2 + f.gap }
}

/**
 * 이 PC 글꼴의 이름을 CSS에 넣을 수 있게. 따옴표, 역빗금, 쌍반점, 중괄호, 꺾쇠처럼 글꼴 이름 밖으로 빠져나갈 수 있는 글자가 있거나 너무 길면
 * 쓰지 않는다(null). 값은 지우지 않고 그대로 두어, 저장해도 잃지 않는다(모르면 쉬고 지우지 않게)
 */
export function localFontOf(deckTheme: { localFont?: unknown }): string | null {
  const name = deckTheme.localFont
  if (typeof name !== 'string') return null
  const t = name.trim()
  if (!t || t.length > 80 || /["'\\;{}<>\u0000-\u001f]/.test(t)) return null
  return t
}

/** 글꼴 줄: 이 PC 글꼴을 골랐으면 그것을 맨 앞에, 없는 PC에서는 고른 짝의 글꼴로 */
const withLocal = (local: string | null, stack: string) => (local ? `"${local}", ${stack}` : stack)

/** 글꼴 고르는 단추의 이름을 그 글꼴(제목 글꼴)로 써서 고르기 전에 모양을 보이게 */
export function fontPreview(id: FontId): CSSProperties {
  return { fontFamily: FONT_LOOK[id].font }
}

/**
 * 아래 표시: 정한 값, 없으면 화면으로 발표하는 자료는 단락만, 보내는 자료는 쪽 번호까지.
 * 발표할 때 쪽 번호는 눈길만 끌고, 보낸 자료는 받은 분이 '몇 쪽'으로 짚어 묻는다
 */
export function footerOf(deck: Pick<Deck, 'theme' | 'meta'>): FooterMode {
  const own = deck.theme.footer
  if (own && FOOTERS.some((m) => m.id === own)) return own
  return deck.meta.method === 'send' ? 'all' : 'section'
}

/** 이 장의 움직임: 장에 정한 값, 없으면 발표 전체 값 */
export function motionOf(deck: Pick<Deck, 'motion'>, slide?: Pick<Slide, 'options'>): Motion {
  const own = slide?.options.motion
  if (own && MOTIONS.some((m) => m.id === own)) return own
  return deck.motion ?? 'calm'
}

/**
 * 장을 넘길 때의 전환. slide를 주면 그 장으로 넘어올 때의 전환(장에 정한 값, 없으면 발표 전체 값).
 * '움직임에 맞춰'면 움직임 정도로 정한다
 */
export function transitionOf(deck: Pick<Deck, 'theme' | 'motion'>, slide?: Pick<Slide, 'options'>): Exclude<Transition, 'auto'> {
  const own = slide?.options.transition
  if (own && own !== 'auto' && TRANSITIONS.some((x) => x.id === own)) return own as Exclude<Transition, 'auto'>
  const t = deck.theme.transition
  if (t && t !== 'auto' && TRANSITIONS.some((x) => x.id === t)) return t as Exclude<Transition, 'auto'>
  const m = deck.motion ?? 'calm'
  return m === 'lively' ? 'slide' : m === 'calm' ? 'fade' : 'none'
}

export function toneOf(slide: Pick<Slide, 'options'>): Tone {
  const t = slide.options.tone
  return t && TONES.some((x) => x.id === t) ? t : 'base'
}

interface Palette {
  bg: string
  ink: string
  ink2: string
  ink3: string
  line: string
  surface: string
  good: string
  bad: string
  accent: string
  accentInk: string
  /** 짙은 면, 그 위의 글자, 그 위의 강조, 그 위의 아주 큰 글자(단락 번호) */
  deep: string
  deepInk: string
  deepAccent: string
  deepMark: string
}

const NIGHT = '#0A0D16'

/**
 * 흰 바탕의 짙은 면: 강조색을 밤색(NIGHT) 쪽으로 깊게 가라앉힌다(강조색 30%). 강조색을 바꾸면 면도 그 색의 깊은 색으로 따라간다.
 * 반쯤(50%) 가라앉히던 때는 면이 쨍한 남색(코발트면 #1D3175)이라 넓은 면이 무겁고 흔한 파란 상자로 보였고, 그 위의 글과 강조가
 * 면의 색에 묻혔다(흰 글 12:1, 강조 4.8:1, 바뀐 만큼 칩 3.7:1). 먹에 가까운 색까지 내리면 면은 조용해지고 위의 글은 또렷해진다
 */
const DEEP_SHARE = 0.3

function deepOf(theme: Theme, accent: string): string {
  return theme.deep ?? mix(accent, NIGHT, DEEP_SHARE)
}

function toHsl(hex: string): [number, number, number] {
  const [r, g, b] = rgb(hex).map((c) => c / 255)
  const hi = Math.max(r, g, b)
  const lo = Math.min(r, g, b)
  const l = (hi + lo) / 2
  if (hi === lo) return [0, 0, l]
  const d = hi - lo
  const s = l > 0.5 ? d / (2 - hi - lo) : d / (hi + lo)
  const h = hi === r ? (g - b) / d + (g < b ? 6 : 0) : hi === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h / 6, s, l]
}

function fromHsl(h: number, s: number, l: number): string {
  const f = (n: number) => {
    const k = (n + h * 12) % 12
    const a = s * Math.min(l, 1 - l)
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))))
  }
  return '#' + [f(0), f(8), f(4)].map((c) => c.toString(16).padStart(2, '0')).join('')
}

/**
 * 짙은 면 위에서 강조할 색: 강조색의 색상과 채도는 두고 밝기만 올려 그 면 위에서 7:1이 되게 한다. 짙은 면 위의 강조는 큰 숫자(답)라
 * 흰 글(12~16:1)보다 한참 흐리면 답이 이름표보다 가라앉아 보인다. 흰색을 섞어 밝히면 채도가 빠져 회보라, 회분홍처럼 탁해져서
 * (코발트 #8DA2E7, 4.8:1) 밝기만 올린다. 파랑, 보라는 밝히면 같은 채도에서도 회보라로 바래서 앞의 숫자(옅은 회색)와 갈리지 않아
 * 채도를 0.85까지 올리고, 청록, 숲처럼 초록 쪽은 밝히면 형광빛이 나서 0.72까지만 둔다. 먹처럼 채도가 낮은 색은 그대로
 */
function accentOnDeep(accent: string, deep: string, need = 7): string {
  const [h, s, l] = toHsl(accent)
  const sat = s < 0.3 ? s : h >= 0.38 && h < 0.55 ? Math.min(s, 0.72) : h >= 0.55 && h < 0.8 ? Math.max(s, 0.85) : s
  for (let x = l; x <= 0.97; x += 0.01) {
    const c = fromHsl(h, sat, x)
    if (contrast(c, deep) >= need) return c
  }
  return '#FFFFFF'
}

function paletteOf(deckTheme: DeckTheme, tone: Tone): Palette {
  const theme = THEMES[deckTheme.id] ?? THEMES.white
  const accent = accentOf(deckTheme)
  if (tone === 'invert') {
    const other = theme.id === 'navy' ? THEMES.white : THEMES.navy
    const a = readable(accent, other.colors.bg)
    const deep = deepOf(other, a)
    return { ...other.colors, accent: a, accentInk: inkOn(a), deep, deepInk: inkOn(deep), deepAccent: accentOnDeep(a, deep), deepMark: accentOnDeep(a, deep) }
  }
  if (tone === 'accent') {
    // 강조색이 바탕이 되면 글자는 그 위에서 읽히는 색, 강조는 글자색 그대로 굵게
    const ink = inkOn(accent)
    const deep = mix(accent, NIGHT, DEEP_SHARE)
    return {
      bg: accent,
      ink,
      ink2: mix(ink, accent, 0.84),
      ink3: mix(ink, accent, 0.66),
      line: mix(ink, accent, 0.26),
      surface: mix(ink, accent, 0.1),
      good: ink,
      bad: ink,
      accent: ink,
      accentInk: accent,
      deep,
      deepInk: inkOn(deep),
      deepAccent: inkOn(deep),
      deepMark: inkOn(deep),
    }
  }
  // 밝은 강조색도 흰 바탕에서, 짙은 강조색도 검은 바탕에서 숫자가 읽히게
  const a = readable(accent, theme.colors.bg)
  const deep = deepOf(theme, a)
  return { ...theme.colors, accent: a, accentInk: inkOn(a), deep, deepInk: inkOn(deep), deepAccent: accentOnDeep(a, deep), deepMark: accentOnDeep(a, deep) }
}

/** 이 바탕이 어두운지. 어두운 바탕에서는 로고 밑에 밝은 면을 까는 등 몇 가지를 바꾼다 */
export function isDarkLook(deckTheme: DeckTheme, tone: Tone = 'base'): boolean {
  return luminance(paletteOf(deckTheme, tone).bg) < 0.2
}

export function themeStyle(deckTheme: DeckTheme, tone: Tone = 'base'): CSSProperties {
  const c = paletteOf(deckTheme, tone)
  const f = FONT_LOOK[fontOf(deckTheme)]
  const local = localFontOf(deckTheme)
  return {
    '--bg': c.bg,
    '--ink': c.ink,
    '--ink-2': c.ink2,
    '--ink-3': c.ink3,
    '--line': c.line,
    '--surface': c.surface,
    '--good': c.good,
    '--bad': c.bad,
    '--accent': c.accent,
    '--accent-ink': c.accentInk,
    '--deep': c.deep,
    '--deep-ink': c.deepInk,
    '--deep-accent': c.deepAccent,
    '--deep-mark': c.deepMark,
    '--font-head': withLocal(local, f.font),
    '--font-body': withLocal(local, f.body),
    '--head-weight': f.weight,
    '--display-weight': f.weight + 100,
    '--num-weight': f.num,
    '--head-tracking': f.tracking,
    '--glyph-k': f.glyph,
    '--tall': f.tall,
    '--head-box': f.box,
    '--head-gap': f.gap,
  }
}

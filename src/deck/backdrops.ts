// 배경: 장의 글과 컴포넌트 뒤에서 잔잔히 움직이는 그래픽. 분위기마다 하나라서 장의 말에 맞는 것을 고른다(docs/MOTION.md 9절, 12절).
// 여기의 목록이 고르는 값의 한 곳이다: 편집기, 장 모음, AI 카탈로그(backdrops), 모양 파일(backdrop), 제안(set_backdrop)이 같이 쓴다.
// 그림과 움직임은 motion/backdrop.ts. 값은 장의 backdrop(종류, 자리, 짙기)에 남는다.

import { BOARD_COLS, BOARD_ROWS, isArea, sameArea } from './blocks'
import { sideOf } from './layouts'
import type { Backdrop, BackdropId, BackdropStrength, BlockAt, LayoutId, Slide } from './types'

interface BackdropSpec {
  id: BackdropId
  name: string
  /** 무엇이 어떻게 움직이는지 한 줄 */
  description: string
  /** 어울리는 장. 고르는 곳과 AI 카탈로그에 그대로 보인다 */
  fits: string
  /** 한곳에 모인 그림(망점 덩어리, 모이는 갈래): 처음 고를 때 글이 적은 쪽에 놓는다. 아니면 장 전체에 고르게 깔린다 */
  focal: boolean
  /** 장 모음과 갤러리에서 이 배경을 깔아 보이는 장 (어울리는 장 하나) */
  showOn: LayoutId
}

/**
 * 고를 수 있는 배경. 이름은 docs/MOTION.md 9절의 분위기 이름 그대로이고, fits는 12절 '맥락에 맞는 움직임'의 바탕 칸을 따른다.
 * 차례가 곧 고르는 곳의 차례다
 */
export const BACKDROPS: readonly BackdropSpec[] = [
  // 깊이, 구조, 여운은 지형도, 모눈 템플릿, 장식 괘선 두 줄로 읽혀 뺐다(감성 검수). 그 값이 남은 발표는 그리지 않고 값은 둔다
  { id: 'diffuse', name: '확산', description: '한 점에 모인 짙음이 바깥으로 번져 나가요.', fits: '표지, 출시와 도입, 커지는 숫자, 퍼지는 이야기', focal: true, showOn: 'cover' },
  { id: 'gather', name: '모여 시작', description: '여러 곳에서 온 가는 선이 한 줄기로 모여 뻗어 나가요.', fits: '표지, 창단과 착수, 결론 한 줄, 통합과 합계', focal: true, showOn: 'statement' },
  { id: 'flow', name: '흐름', description: '가는 선들이 한쪽으로 흐르며 한 곳을 지나가요.', fits: '과정, 일정, 추이, 변화', focal: false, showOn: 'process' },
  { id: 'link', name: '연결', description: '양쪽의 점들이 낮은 활 모양 선으로 하나씩 이어져요.', fits: '연결도, 관계, 사람과 팀, 협업', focal: false, showOn: 'compare' },
]

export const BACKDROP_IDS: readonly BackdropId[] = BACKDROPS.map((b) => b.id)

export const BACKDROP_STRENGTHS: { id: BackdropStrength; name: string; description: string }[] = [
  { id: 'soft', name: '옅게', description: '글이 많은 슬라이드에 써요. 배경이 더 뒤로 물러나요.' },
  { id: 'base', name: '보통', description: '글이 그 위에서 편하게 읽히는 진하기예요.' },
  { id: 'strong', name: '또렷하게', description: '글이 적은 표지나 단락 슬라이드에 써요.' },
]

/** 자주 쓰는 자리. 장 전체를 12×12칸으로 나눈 칸 수다(세로 한 칸은 90px, 가로 한 칸은 160px) */
export const BACKDROP_PLACES: { id: string; name: string; at: BlockAt }[] = [
  // 고르는 단추의 차례: 짝(왼쪽과 오른쪽, 위와 아래)을 붙여 둔다. 뒤섞어 두던 때는 찾게 됐다(검수)
  { id: 'full', name: '전체', at: { x: 0, y: 0, w: BOARD_COLS, h: BOARD_ROWS } },
  { id: 'center', name: '가운데', at: { x: 2, y: 2, w: 8, h: 8 } },
  { id: 'left', name: '왼쪽', at: { x: 0, y: 0, w: 7, h: 12 } },
  { id: 'right', name: '오른쪽', at: { x: 5, y: 0, w: 7, h: 12 } },
  { id: 'top', name: '위', at: { x: 0, y: 0, w: 12, h: 7 } },
  { id: 'bottom', name: '아래', at: { x: 0, y: 5, w: 12, h: 7 } },
  { id: 'corner', name: '오른쪽 아래', at: { x: 6, y: 5, w: 6, h: 7 } },
]

export const WHOLE_SLIDE: BlockAt = BACKDROP_PLACES[0].at
/** 배경 자리의 한 칸 크기(장 px) */
export const BACKDROP_CELL = { w: 1920 / BOARD_COLS, h: 1080 / BOARD_ROWS }
/** 배경 자리의 가장 작은 크기(칸 수). 이보다 작으면 그림이 뜻을 잃는다 */
export const BACKDROP_MIN = { w: 3, h: 3 }

export const isBackdropKind = (v: unknown): v is BackdropId => typeof v === 'string' && (BACKDROP_IDS as readonly string[]).includes(v)
export const isBackdropStrength = (v: unknown): v is BackdropStrength => BACKDROP_STRENGTHS.some((s) => s.id === v)
/** 배경을 놓을 수 있는 자리: 장 안의 칸이고 가장 작은 크기보다 크다 */
export const isBackdropArea = (v: unknown): v is BlockAt => isArea(v) && v.w >= BACKDROP_MIN.w && v.h >= BACKDROP_MIN.h

export const backdropSpec = (id: BackdropId) => BACKDROPS.find((b) => b.id === id)!

/**
 * 그릴 배경. 값이 없거나 이 버전이 모르는 배경(더 새 버전에서 고른 것)이면 null: 그리지 않고 값은 장에 그대로 둔다.
 * 가져온 파일일 수 있어서 자리와 짙기도 확인하고, 맞지 않으면 기본값으로 그린다(값은 고치지 않는다)
 */
export function backdropOf(slide: Pick<Slide, 'backdrop'>): Required<Backdrop> | null {
  const b = slide.backdrop
  if (!b || typeof b !== 'object' || !isBackdropKind(b.kind)) return null
  return { kind: b.kind, at: isBackdropArea(b.at) ? b.at : WHOLE_SLIDE, strength: isBackdropStrength(b.strength) ? b.strength : 'base' }
}

/** 자리가 자주 쓰는 자리 중 하나면 그 id */
export const placeOfArea = (at: BlockAt) => BACKDROP_PLACES.find((p) => sameArea(p.at, at))?.id ?? null

/**
 * 표지와 단락 장은 제목이 왼쪽 아래에 있어서 위쪽이 비고, 한 문장 장은 글이 위에서 장 너비를 다 써서 오른쪽 아래가 빈다.
 * 다른 장은 글이 왼쪽부터 놓인다.
 * 한곳에 모이는 배경(확산, 모여 시작)은 그 빈 쪽에 놓아 그림의 가운데가 글 뒤에 오지 않게 한다
 */
const FOCAL_PLACE: Partial<Record<LayoutId, string>> = { cover: 'top', section: 'top', closing: 'top', statement: 'corner' }

/**
 * 글이 적은 장(표지, 섹션, 맺음, 한 문장): 처음 고를 때 또렷하게. 보통 짙기는 글이 많은 장에 맞춘 것이라 큰 화면에서 표지가 비어
 * 보였고, 한 문장 장의 오른쪽 아래 모여 시작은 검은 테마에서 거의 보이지 않았다(필름). 글 둘레는 배경이 비키므로 또렷하게도 글을 다투지 않는다
 */
const BOLD_PLACES: readonly LayoutId[] = ['cover', 'section', 'closing', 'statement']

/** 배경을 처음 고를 때의 값: 장 전체에 고르게 깔리는 그림은 전체, 한 점이 있는 그림은 글이 적은 쪽. 글이 적은 장은 또렷하게 */
export function baseBackdrop(slide: Pick<Slide, 'layout' | 'variant' | 'options'>, kind: BackdropId): Backdrop {
  const strong = BOLD_PLACES.includes(slide.layout) ? { strength: 'strong' as const } : {}
  return { ...placeOf(slide, kind), ...strong }
}

function placeOf(slide: Pick<Slide, 'layout' | 'variant' | 'options'>, kind: BackdropId): Backdrop {
  if (!backdropSpec(kind).focal) return { kind }
  // 옆 면이 있는 표지: 옆 면 밖(제목이 있는 판)의 위쪽. 옆 면이 씨앗을 가리지 않게
  const side = slide.layout === 'cover' ? sideOf(slide) : null
  if (side !== null) return { kind, at: { x: slide.options.flip ? side : 0, y: 0, w: BOARD_COLS - side, h: 8 } }
  const place = BACKDROP_PLACES.find((p) => p.id === (FOCAL_PLACE[slide.layout] ?? 'right'))!
  return { kind, at: place.at }
}

/** 배경을 바꿀 때: 자리와 짙기는 그대로 두고 종류만. 자리를 고른 적 없으면 그 배경의 처음 자리 */
export function withBackdropKind(slide: Pick<Slide, 'layout' | 'variant' | 'options' | 'backdrop'>, kind: BackdropId): Backdrop {
  const now = slide.backdrop
  if (!now || !now.at) return { ...baseBackdrop(slide, kind), ...(now?.strength ? { strength: now.strength } : {}) }
  return { ...now, kind }
}

/** 저장할 꼴: 기본값(장 전체, 보통)은 빼고 적는다 */
export function tidyBackdrop(b: Backdrop): Backdrop {
  return {
    kind: b.kind,
    ...(b.at && !sameArea(b.at, WHOLE_SLIDE) ? { at: { x: b.at.x, y: b.at.y, w: b.at.w, h: b.at.h } } : {}),
    ...(b.strength && b.strength !== 'base' ? { strength: b.strength } : {}),
  }
}

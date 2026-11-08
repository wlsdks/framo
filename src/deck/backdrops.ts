// 배경: 장의 글과 컴포넌트 뒤에서 한 번 크게 지나가는 몸짓. 분위기마다 하나라서 장의 말에 맞는 것을 고른다(docs/MOTION.md 9절, 12절).
// 여기의 목록이 고르는 값의 한 곳이다: 편집기, 장 모음, AI 카탈로그(backdrops), 모양 파일(backdrop), 제안(set_backdrop)이 같이 쓴다.
// 그림과 움직임은 motion/backdrop.ts. 값은 장의 backdrop(종류, 자리, 짙기)에 남는다.

import { BOARD_COLS, BOARD_ROWS, isArea, sameArea } from './blocks'
import { sideOf } from './layouts'
import type { Backdrop, BackdropId, BackdropStrength, BlockAt, LayoutId, Slide } from './types'

// 이 파일의 자리는 장 전체를 12×12칸으로 나눈 칸 수다(세로 한 칸은 90px, 가로 한 칸은 160px)

interface BackdropSpec {
  id: BackdropId
  name: string
  /** 무엇이 어떻게 움직이는지 한 줄 */
  description: string
  /** 어울리는 장. 고르는 곳과 AI 카탈로그에 그대로 보인다 */
  fits: string
  /** 장 모음과 갤러리에서 이 배경을 깔아 보이는 장 (어울리는 장 하나) */
  showOn: LayoutId
}

/**
 * 고를 수 있는 배경. 이름은 docs/MOTION.md 9절의 분위기 이름 그대로이고, fits는 12절 '맥락에 맞는 움직임'의 바탕 칸을 따른다.
 * 차례가 곧 고르는 곳의 차례다
 */
export const BACKDROPS: readonly BackdropSpec[] = [
  // 깊이, 구조, 여운, 연결은 지형도, 모눈 템플릿, 장식 괘선, 뜻이 서지 않는 아치로 읽혀 뺐다(감성 검수). 그 값이 남은 발표는 그리지
  // 않고 값은 둔다. 쓰임새 낱말은 셋이 겹치지 않게(표지는 확산에만)
  { id: 'diffuse', name: '확산', description: '가운데에서 입자의 물결이 장 끝까지 크게 번지고 걷혀요.', fits: '표지, 도입, 퍼짐', showOn: 'cover' },
  { id: 'gather', name: '모여들기', description: '장 밖 여러 곳에서 온 선이 강처럼 합쳐져 장의 답 가까이로 건너가요.', fits: '결론, 통합, 출범', showOn: 'statement' },
  { id: 'flow', name: '흐름', description: '긴 선 한두 가닥이 단계의 박자로 왼쪽에서 오른쪽으로 건너가요.', fits: '과정, 단계, 변화', showOn: 'process' },
]

export const BACKDROP_IDS: readonly BackdropId[] = BACKDROPS.map((b) => b.id)

export const BACKDROP_STRENGTHS: { id: BackdropStrength; name: string; description: string }[] = [
  { id: 'soft', name: '옅게', description: '글이 많은 슬라이드에 써요. 배경이 더 뒤로 물러나요.' },
  { id: 'base', name: '보통', description: '글이 그 위에서 편하게 읽히는 진하기예요.' },
  { id: 'strong', name: '또렷하게', description: '글이 적은 표지나 단락 슬라이드, 프로젝터와 큰 회의실에 써요.' },
]

/**
 * 자주 쓰는 자리: 전체와 3×3(왼쪽·가운데·오른쪽 × 위·가운데·아래). 고르는 곳은 전체 아래에 3×3 칸으로 놓는다.
 * 자리끼리 겹쳐서(가운데 8칸, 가장자리 7칸) 배경이 장 가장자리에서 잘린 듯 끝나지 않는다
 */
const COLS = [
  { k: 'left', name: '왼쪽', x: 0, w: 7 },
  { k: 'center', name: '가운데', x: 2, w: 8 },
  { k: 'right', name: '오른쪽', x: 5, w: 7 },
]
const ROWS = [
  { k: 'top', name: '위', y: 0, h: 7 },
  { k: 'middle', name: '가운데', y: 2, h: 8 },
  { k: 'bottom', name: '아래', y: 5, h: 7 },
]
export const BACKDROP_PLACES: { id: string; name: string; at: BlockAt }[] = [
  { id: 'full', name: '전체', at: { x: 0, y: 0, w: BOARD_COLS, h: BOARD_ROWS } },
  ...ROWS.flatMap((r) =>
    COLS.map((c) => ({
      id: r.k === 'middle' ? c.k : c.k === 'center' ? r.k : `${r.k}-${c.k}`,
      // 가운데 줄은 '왼쪽', '가운데', '오른쪽', 가운데 칸은 '위', '아래'
      name: r.k === 'middle' ? c.name : c.k === 'center' ? r.name : `${c.name} ${r.name}`,
      at: { x: c.x, y: r.y, w: c.w, h: r.h },
    })),
  ),
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
 * 글이 적은 장(표지, 섹션, 맺음, 한 문장): 처음 고를 때 또렷하게. 보통 짙기는 글이 많은 장에 맞춘 것이라 큰 화면에서 표지가 비어
 * 보였다(필름). 글 둘레는 배경이 비키므로 또렷하게도 글을 다투지 않는다
 */
const BOLD_PLACES: readonly LayoutId[] = ['cover', 'section', 'closing', 'statement']

/**
 * 배경을 처음 고를 때의 값: 장 전체(배경이 크게 지나가고, 글과 데이터 뒤는 알아서 비킨다). 옆 면이 있는 표지만 옆 면 밖의 판 전체:
 * 옆 면은 배경을 가리므로 그 아래로 퍼지면 몸짓의 가운데가 어긋난다. 구석에 작게 깔던 때는 하프톤 템플릿처럼 읽혔다(검수).
 * 글이 적은 장은 또렷하게
 */
export function baseBackdrop(slide: Pick<Slide, 'layout' | 'variant' | 'options'>, kind: BackdropId): Backdrop {
  const strong = BOLD_PLACES.includes(slide.layout) ? { strength: 'strong' as const } : {}
  const side = slide.layout === 'cover' ? sideOf(slide) : null
  const at = side !== null ? { at: { x: slide.options.flip ? side : 0, y: 0, w: BOARD_COLS - side, h: BOARD_ROWS } } : {}
  return { kind, ...at, ...strong }
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

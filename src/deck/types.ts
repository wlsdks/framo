export type LayoutId =
  | 'cover'
  | 'section'
  | 'agenda'
  | 'summary'
  | 'statement'
  | 'kpi'
  | 'scorecard'
  | 'bridge'
  | 'trend'
  | 'progress'
  | 'share'
  | 'process'
  | 'funnel'
  | 'table'
  | 'points'
  | 'compare'
  | 'matrix'
  | 'position'
  | 'timeline'
  | 'case'
  | 'pricing'
  | 'imageText'
  | 'logos'
  | 'bars'
  | 'versus'
  | 'closing'
  /** 부품(블록)을 끌어다 놓아 꾸미는 장. 부품은 정해진 자리(줄과 칸)에만 들어간다 */
  | 'compose'

/**
 * 발표의 종류. 구성(src/deck/blueprints.ts)이 종류마다 하나씩 있다.
 * 값은 저장 파일과 AI에게 보이는 모양에 그대로 들어가서, 이름이 바뀌어도 id는 바꾸지 않는다.
 * 예전 앱은 모르는 종류를 '빈 발표'처럼 다루고 값은 그대로 둔다(잃는 것이 없어서 compat.ts가 세지 않는다).
 */
export type DeckType =
  | 'business'
  | 'improve'
  | 'decide'
  | 'deal'
  | 'proposal'
  | 'plan'
  | 'weekly'
  | 'report'
  | 'result'
  | 'issue'
  | 'kickoff'
  | 'research'
  | 'study'
  | 'intro'
  | 'blank'
/**
 * 듣는 사람. 윗분만이 아니라 동료나 다른 부서 앞에서도 발표한다. 'practitioner'는 팀장이다(예전 이름 그대로 둔다).
 * 사외 참석자도 발표를 듣는다.
 */
export type Audience = 'exec' | 'practitioner' | 'peers' | 'partners' | 'external' | 'mixed'
export type Method = 'live' | 'remote' | 'send'
export type ThemeId = 'white' | 'navy' | 'serif'
/** 발표할 때의 움직임. 레이아웃마다 미리 짜 둔 순서로 움직이고, 사용자는 정도만 고른다. */
export type Motion = 'none' | 'calm' | 'lively'
/**
 * 글꼴 짝(제목과 본문). 없으면 테마의 글꼴. sans: 프리텐다드, serif: 명조(함렛) 제목과 프리텐다드 본문,
 * suit: SUIT, myeongjo: 본명조(Noto Serif KR) 제목과 프리텐다드 본문 (deck/themes.ts의 FONTS)
 */
export type FontId = 'sans' | 'serif' | 'suit' | 'myeongjo'
/** 발표 전체의 글자 크기 */
export type TextSize = 'small' | 'normal' | 'large'
/** 슬라이드 아래의 단락 지도와 쪽 번호 */
export type FooterMode = 'section' | 'all' | 'page' | 'none'
/**
 * 장을 넘길 때의 화면 전환. auto는 움직임 정도에 맞춘다(장에 정하면 발표 전체 설정을 따른다).
 * morph는 이어 움직이기: 앞 장과 다음 장에 같은 것(같은 제목, 같은 컴포넌트)이 있으면 사라지지 않고 새 자리로 옮겨 간다
 */
export type Transition = 'auto' | 'none' | 'fade' | 'slide' | 'zoom' | 'morph'
/**
 * 장면: 장 전체를 한 번에 짜는 움직임(카메라, 초점, 한 글자씩, 결 선, 숫자, 장막). 목록과 맞는 장은 deck/scenes.ts,
 * 움직임은 motion/engine.ts의 scene
 */
export type SceneId = 'opening' | 'answer' | 'numbers' | 'flow' | 'compare' | 'time' | 'picture' | 'closing'
/** 장의 바탕. invert는 테마의 반대(밝은 테마면 어둡게), accent는 강조색 면 */
export type Tone = 'base' | 'invert' | 'accent'
/**
 * 배경: 장의 글과 컴포넌트 뒤에서 한 번 크게 지나가는 몸짓. docs/MOTION.md 9절의 셋(확산, 모여들기, 흐름).
 * 목록과 이름은 deck/backdrops.ts, 그리기와 움직임은 motion/backdrop.ts. 이 브랜치에서 잠깐 있던 깊이, 구조, 여운, 연결(depth,
 * structure, linger, link)은 뺐다: 그 값이 남은 발표는 모르는 배경처럼 그리지 않고 값은 지우지 않는다(backdropOf)
 */
export type BackdropId = 'diffuse' | 'gather' | 'flow'
/** 배경의 짙기 */
export type BackdropStrength = 'soft' | 'base' | 'strong'

/**
 * 장의 배경. 글이 없는 고르는 값뿐이라 예전 버전은 이 값을 모른 채 그대로 두고(장을 고쳐 저장해도 남는다) 배경 없이 그린다.
 * 이 버전이 모르는 kind(더 새 버전의 배경)도 같다: 그리지 않고 값은 지우지 않는다(backdrops.ts의 backdropOf)
 */
export interface Backdrop {
  kind: BackdropId
  /** 장 전체(1920×1080)를 가로 12칸, 세로 12칸으로 나눈 자리. 없으면 장 전체 */
  at?: BlockAt
  /** 없으면 base */
  strength?: BackdropStrength
}
/**
 * 모션 그래픽(cine): 영화 타이틀처럼 한 장면을 짠 컴포넌트. 코드가 아니라 '장면 레시피'(데이터)이고, 앱 안의 엔진 하나(motion/cine.ts)가
 * 해석해 그린다. 레시피에는 글이 없다: 글은 컴포넌트의 칸(fields)에 있고 엔진은 그리는 순간에만 읽는다. 문자열은 정해진 낱말, 짧은 id,
 * 해시 id뿐이다. 뜻과 값의 범위, 기본값, 시간표는 deck/cine.ts 한 곳이 정한다
 */
/** 처음 고른 틀 */
export type CinePresetId = 'light' | 'diffuse' | 'gather' | 'stroke'
/** 글의 짜임: 큰 글자와 옆의 제목(mark), 가운데 하나(center), 가로로 그어지는 선과 두 끝(line) */
export type CineFrame = 'mark' | 'center' | 'line'
/** 구간: 한 점이 맺힘, 번짐, 모임, 또렷해짐, 글이 써짐, 카메라가 물러남, 머묾 */
export type CinePhaseKind = 'seed' | 'spread' | 'gather' | 'resolve' | 'write' | 'pull' | 'hold'
/** 입자가 모이는 모양: 칸의 글자, 고리, 선, 물결, 한 점 */
export type CineShape = 'glyph' | 'ring' | 'line' | 'wave' | 'point'
/** 모션 그래픽의 글 칸. 정해진 낱말뿐이다(사람이 쓴 글은 컴포넌트의 fields에) */
export type CineFieldKey = 'glyph' | 'title' | 'lead' | 'label' | 'text' | 'sub' | 'value' | 'note'
/** 글이 들어오는 모습: 맺힘, 써짐(왼쪽부터 펜 끝을 따라), 한 글자씩, 숫자 굴리기 */
export type CineEnter = 'settle' | 'write' | 'letters' | 'count'
export type CineAmount = 'few' | 'normal' | 'many'
/** 번지는 모양: 둥글게, 옆으로 길게, 위로 */
export type CineSpread = 'round' | 'side' | 'rise'
/** 카메라: 가까이에서 물러나기, 멀리서 다가가기, 그대로. 끝은 늘 제자리(배율 1)라 끝 모습이 편집 화면과 같다 */
export type CineCamera = 'pull' | 'push' | 'none'
/** 입자의 색: 글자색, 강조색, 글자색에 강조색을 조금 */
export type CineTone = 'ink' | 'accent' | 'mix'
export type CinePace = 'slow' | 'normal' | 'fast'

export interface CinePhase {
  kind: CinePhaseKind
  /** 걸리는 때(ms). 보통 빠르기와 생동감 기준(차분하게는 엔진이 줄인다) */
  ms: number
  /** 앞 구간이 끝나기 이만큼(ms) 전에 시작한다(겹침) */
  overlap?: number
}

/** 글 칸 하나가 언제 어떻게 들어오는지 */
export interface CineText {
  key: CineFieldKey
  enter: CineEnter
  /** 이 구간이 시작할 때 들어온다. 없으면 write */
  on?: CinePhaseKind
  /** 그 구간 안에서 늦추는 몫(0~1) */
  lag?: number
}

interface CineParticles {
  amount: CineAmount
  /** 크기 배율(0.6~1.6) */
  size: number
  tone: CineTone
  /** 깊이(0~1): 가까운 입자는 크고 옅게, 먼 입자는 작고 또렷하게 */
  depth: number
  /** 잔상: 빠르게 움직이는 동안 지나온 자리를 옅게 남긴다 */
  trail: boolean
  spread: CineSpread
}

export interface CineRecipe {
  /** 이 레시피를 쓴 엔진 번호(deck/cine.ts의 CINE_ENGINE). 더 새 번호면 이 버전은 아는 층만 그리고 레시피는 그대로 둔다 */
  engine: number
  /** 내 라이브러리에서 같은 갈래(처음 만든 것과 고친 버전들)를 묶는 id */
  lineage: string
  preset: CinePresetId
  frame: CineFrame
  /** 정해진 씨앗: 같은 레시피는 늘 같은 그림 */
  seed: number
  phases: CinePhase[]
  particles: CineParticles
  /** 모일 모양. glyph면 그 칸(field)의 글자를 그 칸의 글꼴로 그려 모양을 딴다 */
  shape: { kind: CineShape; field?: CineFieldKey }
  /** 한 점의 빛(어두운 바탕에서만. 밝은 바탕은 번지는 먹) */
  light: boolean
  /** 모인 자리에 남는 가는 선(선, 물결 모양에서) */
  line: boolean
  camera: CineCamera
  pace: CinePace
  texts: CineText[]
  /** 넘겨주기: 모임이 끝난 자리의 빛(먹)이 펜 끝이 되어 제목을 쓴다 */
  handoff: boolean
  /** 되풀이: 생동감에서만, 다 맺힌 뒤 12초 넘는 주기로 옅게 한 번씩 */
  loop: boolean
  /** 입자가 칸 밖, 장 전체로 번진다(글 칸은 늘 제 칸 안) */
  bleed: boolean
}

/** 제목 덩어리의 자리 (표지, 섹션). 값 목록은 themes.ts의 PLACES */
export type Place = 'top' | 'middle' | 'bottom'

export interface DeckTheme {
  id: ThemeId
  accent?: string
  font?: FontId
  /**
   * 이 PC에 깔린 글꼴의 이름(테마 메뉴의 '내 PC 글꼴'). 있으면 제목과 본문을 이 글꼴로 그리고, 없는 PC에서는 font의 글꼴로 그린다.
   * 글꼴 파일은 발표에 넣지 않는다(글꼴마다 나눠 주기를 막는 라이선스가 있다). AI에게 보이는 모양에도 넣지 않는다(사람이 고른 이름)
   */
  localFont?: string
  size?: TextSize
  footer?: FooterMode
  transition?: Transition
}

/** 덱 단위 값. 슬라이드에서는 `$org`처럼 `$`를 붙여 참조한다. */
export type MetaKey = 'org' | 'presenter' | 'date' | 'contact' | 'logo'

export interface Item {
  id: string
  title: string
  body: string
  value: string
  meta: string
  image: string
}

export type ItemKey = Exclude<keyof Item, 'id'>

export interface SlideOptions {
  /** 이 슬라이드의 제목과 부제를 감춘다. 작성한 글은 그대로 남는다 */
  hideHead?: boolean
  /** 이 슬라이드의 출처와 아래 표시를 감춘다. 작성한 출처는 그대로 남는다 */
  hideFoot?: boolean
  /** 강조할 항목 (0부터, -1은 강조 없음). 어느 레이아웃이 쓰는지는 LayoutSpec.highlight */
  highlight?: number
  /** 두 판으로 나뉜 장(LayoutSpec.panes): 옆 판을 반대쪽에. 이미지와 설명이면 이미지를 오른쪽에 */
  flip?: boolean
  /** 두 판으로 나뉜 장: 옆 판의 너비. 장 너비를 12로 나눈 칸 수이고, 고를 수 있는 값은 레이아웃마다(LayoutSpec.panes.sides). 없으면 레이아웃 기본 */
  pane?: number
  /** 이미지와 설명: 자르지 않고 전체 보이기 */
  contain?: boolean
  /** 이 장만 다른 움직임. 없으면 발표 전체 설정을 따른다 */
  motion?: Motion
  /** 이 장의 바탕. 색 면 장(표지, 섹션, 마지막 장)에는 쓰지 않는다 */
  tone?: Tone
  /** 제목 덩어리를 위, 가운데, 아래 중 어디에 둘지 (LayoutSpec.place가 있는 레이아웃). 없으면 레이아웃 기본 */
  place?: Place
  /** 이 장으로 넘어올 때의 전환. 없거나 auto면 발표 전체 설정을 따른다 */
  transition?: Transition
  /**
   * 부품 장: 발표할 때 부품이 나오는 차례(부품 id). 없거나 빠진 부품은 읽는 차례(위 줄부터, 왼쪽부터)로 그 뒤에.
   * 자리와 나오는 차례를 따로 정할 수 있게 (오른쪽 숫자를 먼저 보이고 왼쪽 설명을 뒤에)
   */
  order?: string[]
  /** 이 장의 장면. 고른 동안 컴포넌트마다의 움직임, 빠르기, 들어오는 쪽 대신 장면이 움직인다(값은 그대로 남는다) */
  scene?: SceneId
  /**
   * 이 장을 AI에게 숨긴다(사람이 슬라이드 메뉴에서 고른다). AI의 모양에는 자리만 보이고, 이 장을 바꾸거나 옮기는 제안은 건너뛴다(deck/aiHidden.ts).
   * 숨긴 컴포넌트(aiHiddenBlocks)와 함께 장의 옵션에 둔다: 컴포넌트에 새 값을 두면 예전 버전이 모르는 값으로 세어 발표를 열지 않는데(compat.ts),
   * 장의 옵션은 예전 버전도 그대로 두고 저장한다(모르면 쉬고 지우지 않게). 예전 버전의 AI 공유에는 숨긴 것의 모양도 보인다(글은 그때도 나가지 않는다)
   */
  aiHidden?: boolean
  /** 컴포넌트 장: AI에게 숨긴 컴포넌트의 id. AI의 모양에는 판의 자리만 보이고, 그 컴포넌트를 바꾸거나 옮기는 제안은 건너뛴다 */
  aiHiddenBlocks?: string[]
}

/** 부품 장만의 부품. 목록과 모양은 src/deck/blocks.ts */
export type NativeBlockType =
  | 'message'
  | 'text'
  | 'bullets'
  | 'quote'
  | 'callout'
  | 'number'
  | 'delta'
  | 'goal'
  | 'ring'
  | 'ratio'
  | 'spark'
  | 'facts'
  | 'risks'
  | 'swot'
  | 'faq'
  | 'checks'
  | 'gantt'
  | 'people'
  | 'image'
  | 'rating'
  | 'market'
  | 'pareto'
  | 'attain'
  | 'diverge'
  | 'stack'
  | 'heat'
  | 'sparks'
  | 'flow'
  | 'decision'
  | 'whys'
  | 'cycle'
  | 'network'
  | 'hub'
  | 'rank'
  | 'spread'
  | 'adoption'
  | 'aliases'
  | 'dupes'
  | 'gate'
  | 'layers'
  | 'search'
  | 'gather'
  | 'wipe'
  | 'chat'
  | 'split'
  | 'merge'
  | 'tiles'
  | 'calc'
  | 'likert'
  | 'heading'
  | 'stat'
  | 'meter'
  | 'range'
  | 'status'
  | 'steps'
  | 'date'
  | 'note'
  /** 모션 그래픽: 레시피(deck.cines)를 엔진이 그린다. 내 라이브러리에서 넣는다 */
  | 'cine'

/** 장 레이아웃을 그대로 부품으로 쓰는 것. 칸과 그리는 법이 그 레이아웃과 같아서, 장을 부품 장으로 바꿔도 내용과 모습이 그대로다 */
export type LayoutBlockType = Extract<
  LayoutId,
  | 'summary'
  | 'points'
  | 'kpi'
  | 'scorecard'
  | 'bars'
  | 'versus'
  | 'bridge'
  | 'trend'
  | 'share'
  | 'funnel'
  | 'progress'
  | 'process'
  | 'timeline'
  | 'compare'
  | 'matrix'
  | 'position'
  | 'pricing'
  | 'table'
  | 'logos'
  | 'agenda'
>

export type BlockType = NativeBlockType | LayoutBlockType

/** 부품의 바탕: 없음, 들여 쓰기(예전 옅은 면·위아래 선, id는 card 그대로), 강조(예전 진한 면, id는 bold 그대로) */
export type BlockLook = 'plain' | 'card' | 'bold'
/** 발표할 때 부품이 나타나는 모습. auto는 부품마다 짜 둔 움직임(숫자가 올라가고 막대가 자라는 것) */
export type BlockEffect = 'auto' | 'rise' | 'fade' | 'wipe' | 'slide' | 'pop' | 'zoom' | 'flip' | 'blur' | 'letters' | 'none'
/** 부품이 언제 나오는지: 앞 부품에 이어서(기본), 앞 부품과 함께, 발표하는 사람이 누르면 */
export type BlockWhen = 'after' | 'with' | 'click'
/** 부품 안의 항목이 나오는 때: 한꺼번에(기본, 짜 둔 차례대로 이어서), 하나씩(발표하는 사람이 누를 때마다 다음 항목) */
export type BlockReveal = 'all' | 'each'
/** 부품이 움직이는 빠르기 */
export type BlockSpeed = 'fast' | 'normal' | 'slow'
/** 움직이며 들어오는 쪽 (올라오기, 밀려오기, 펼치기). 없으면 움직임마다 정한 쪽 */
export type BlockFrom = 'below' | 'above' | 'left' | 'right'
/** 컴포넌트 사이에 끼우는 이음표: 이어진다(바뀐다), 더한다, 결과, 견준다 */
export type BlockLink = 'arrow' | 'plus' | 'equals' | 'versus'

/** 부품 장의 판(가로 12칸, 세로 6칸의 네모)에서 부품이 차지하는 자리. 네모 단위, 왼쪽 위가 0 */
export interface BlockAt {
  x: number
  y: number
  w: number
  h: number
}

export interface Block {
  id: string
  type: BlockType
  fields: Record<string, string>
  items: Item[]
  /** 칸별 안내 문구. 없으면 부품 기본값 */
  hints?: Record<string, string>
  /** 없으면 부품마다 정한 기본 바탕 */
  look?: BlockLook
  /** 없으면 auto */
  effect?: BlockEffect
  /** 없으면 after */
  when?: BlockWhen
  /** 없으면 normal */
  speed?: BlockSpeed
  /** 없으면 all. each면 발표할 때 항목이 누를 때마다 하나씩 나온다 */
  reveal?: BlockReveal
  /** 없으면 움직임마다 정한 쪽 */
  from?: BlockFrom
  /** 같은 부품 안의 모양 (레이아웃 부품은 그 레이아웃의 모양). 없으면 첫째 */
  variant?: string
  /** 강조할 항목 (0부터, -1은 없음). 없으면 부품마다 정한 기본 */
  highlight?: number
  /** 판에서 차지하는 자리. 장의 부품들이 판 전체를 빈틈없이 덮는다 (deck/blocks/board.ts) */
  at?: BlockAt
  /** 이 부품과 오른쪽 부품 사이의 이음표 (판을 옆으로 나누는 선 위). 오른쪽 끝 부품에는 없다 */
  link?: BlockLink
  /** 이 부품과 아래 부품 사이의 이음표 (판을 위아래로 나누는 선 위). 맨 아래 부품에는 없다 */
  linkBelow?: BlockLink
  /** 모션 그래픽(cine)만: 쓰는 레시피의 버전 id(내용 해시, deck.cines의 열쇠). 발표마다 쓰던 버전에 고정된다 */
  cine?: string
}

export interface Slide {
  id: string
  layout: LayoutId
  /** 이 장의 역할. 슬라이드 목록과 도움말에 보인다. */
  purpose: string
  /** 하단에 보이는 섹션 이름 */
  section: string
  fields: Record<string, string>
  items: Item[]
  /** 칸별 안내 문구. 키는 `title`, `items.value` 같은 형태. 없으면 레이아웃 기본값을 쓴다. */
  hints: Record<string, string>
  /** 이 장을 어떻게 채우면 좋은지에 대한 설명 */
  guide: string
  notes: string
  options: SlideOptions
  /** 같은 레이아웃 안의 모양. 레이아웃마다 정해 둔 것 중 하나이고, 없으면 첫째 모양 */
  variant?: string
  hidden?: boolean
  /**
   * 부품 장(compose)의 부품들. 자리(at)는 판의 칸 단위. 부품 장에서 다른 레이아웃으로 바꾼 장도 남겨 둔다
   * (부품 장으로 되돌리면 다시 보이게). 예전 파일의 줄(rows)은 열 때 판으로 바꾼다(blocks/legacy.ts)
   */
  blocks?: Block[]
  /**
   * 판을 마지막으로 알아서 짰을 때의 자리(blocks/place.ts의 boardSig). 지금 판이 이 자리 그대로면 사람이 옮기거나 선을 끌지 않은
   * 판이라서, 컴포넌트를 넣고 뺄 때 판을 지금 규칙으로 다시 고른다(autoArranged). 짜임 규칙이 바뀌어도 그대로 따른다.
   * 없으면(이 표시를 남기기 전의 장) 지금 규칙이 고를 판과 같은지로 본다. 예전 버전은 이 값을 모르고 그대로 두므로,
   * 거기서 옮긴 판은 자리가 달라져 사람이 짠 판이 된다. 그래서 저장 형식의 version은 그대로다
   */
  arranged?: string
  /** 장의 배경(글과 컴포넌트 뒤의 움직이는 그래픽). 레이아웃을 바꿔도 남는다 */
  backdrop?: Backdrop
}

export interface DeckMeta {
  type: DeckType
  audience: Audience
  duration: number
  method: Method
  /** 발표자 소속 (예: 영업 2팀) */
  org: string
  presenter: string
  date: string
  contact: string
  logo: string
}

export interface Deck {
  id: string
  /** 저장 형식. 2부터 부품 장이 줄 대신 판(blocks)이다 (compat.ts, migrate.ts) */
  version: 2
  title: string
  createdAt: number
  updatedAt: number
  meta: DeckMeta
  theme: DeckTheme
  /** 없으면 'calm' */
  motion?: Motion
  slides: Slide[]
  /** AI(MCP)에게 이 발표의 모양을 보여 줄지. 사용자가 발표마다 직접 켠다. */
  aiShare?: boolean
  /**
   * 모션 그래픽의 레시피: 버전 id → 레시피. 발표가 레시피를 품어서 .deck이나 HTML을 보내도 그대로 그린다.
   * 쓰지 않는 버전은 저장할 때 뺀다(deck/cine.ts의 tidyCines)
   */
  cines?: Record<string, CineRecipe>
}

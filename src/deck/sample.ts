import { baseBackdrop } from './backdrops'
import { BLUEPRINTS } from './blueprints'
import { agenda, each, type Recipe } from './blueprints/recipes'
import { settleDeck } from './blocks'
import { cineId, presetRecipe } from './cine'
import { createDeck, emptyItem, planRecipes } from './generate'
import type { BackdropId, BlockType, CinePresetId, CineRecipe, Deck, Item, Slide, SlideOptions } from './types'

// 처음 쓰는 사람이 완성된 모습을 볼 수 있는 예시 보고. 회사, 사람, 숫자는 모두 지어낸 것이다.
// 어느 직무든 '나도 이런 발표를 하겠다' 싶게, 직무가 드러나지 않는 사내 개선 제안(회의 줄이기)으로 둔다.
//
// 같은 이야기를 두 판으로 짠다.
// - createSampleDeck: 홈의 '완성된 예시 보기'. Framo가 할 수 있는 가장 좋은 모습을 보이는 쇼룸이다. 장마다 그 말이 무엇으로 서야 하는지 보고
//   그림 컴포넌트(몇 중 몇, 나누기, 원인 캐기, 순환), 모션 그래픽(그어지는 선, 확산, 갈림길: 틀을 되풀이하지 않는다), 장면, 배경 모션을
//   골랐다. 표지, 섹션, 마지막 장 같은 뼈대는 레이아웃 그대로, 한 장 요약은 핵심 숫자 셋이다. 숫자는 장끼리 한 셈으로 맞춘다(sample.test.ts).
//   발표자 노트는 그대로 읽어도 되는 대본이다
// - layoutSampleDeck: 같은 이야기를 칸을 채운 레이아웃 장(점 목록, 비교, 핵심 숫자 …)으로 짠 판. 장 모음과 컴포넌트 고르기가 레이아웃마다의
//   예시를 여기서 가져오고(showcase.ts), 레이아웃 장을 다루는 시험들이 이 발표를 쓴다. 홈에는 나오지 않는다

function svg(body: string, w = 360, h = 120): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">${body}</svg>`)}`
}

/** 모양 + 가상 업체 표기. 짧아진 이름에 맞춰 그림의 빈 오른쪽을 줄여 로고가 지나치게 작아지지 않게 한다. */
function wordmark(name: string, shape: string): string {
  return svg(
    `${shape}<text x="96" y="74" font-family="Pretendard Variable, Apple SD Gothic Neo, sans-serif" font-size="40" font-weight="800" letter-spacing="-1" fill="#1d2330">${name}</text>`,
    230,
  )
}

/** 개발용 레이아웃 모음에서도 쓰는 예시 로고 */
export const SAMPLE_LOGOS = [
  wordmark('가상 A', '<rect x="24" y="36" width="52" height="52" rx="10" fill="#1d2330"/>'),
  wordmark('가상 B', '<circle cx="50" cy="62" r="27" fill="#1d2330"/>'),
  wordmark('가상 C', '<path d="M24 88 L50 36 L76 88 Z" fill="#1d2330"/>'),
  wordmark('가상 D', '<rect x="24" y="36" width="52" height="52" rx="26" fill="none" stroke="#1d2330" stroke-width="10"/>'),
  wordmark('가상 E', '<path d="M24 36h52v18H42v34H24z" fill="#1d2330"/>'),
  wordmark('가상 F', '<path d="M24 88V36l26 26 26-26v52" fill="none" stroke="#1d2330" stroke-width="10"/>'),
  wordmark('가상 G', '<rect x="24" y="36" width="22" height="52" fill="#1d2330"/><rect x="54" y="52" width="22" height="36" fill="#1d2330"/>'),
  wordmark('가상 H', '<path d="M24 88h52V36z" fill="#1d2330"/>'),
]

const SAMPLE_DASHBOARD = svg(
  `<rect width="1600" height="1000" fill="#eef1f6"/>
  <rect x="0" y="0" width="1600" height="72" fill="#ffffff"/>
  <rect x="40" y="24" width="140" height="24" rx="6" fill="#1d2330"/>
  <rect x="1320" y="22" width="240" height="28" rx="14" fill="#e3e7ee"/>
  <rect x="40" y="112" width="360" height="180" rx="16" fill="#ffffff"/>
  <rect x="424" y="112" width="360" height="180" rx="16" fill="#ffffff"/>
  <rect x="808" y="112" width="360" height="180" rx="16" fill="#ffffff"/>
  <rect x="1192" y="112" width="368" height="180" rx="16" fill="#ffffff"/>
  <rect x="72" y="144" width="120" height="16" rx="8" fill="#c5ccd8"/>
  <rect x="72" y="196" width="200" height="52" rx="10" fill="#2350e8"/>
  <rect x="456" y="144" width="120" height="16" rx="8" fill="#c5ccd8"/>
  <rect x="456" y="196" width="160" height="52" rx="10" fill="#1d2330"/>
  <rect x="840" y="144" width="120" height="16" rx="8" fill="#c5ccd8"/>
  <rect x="840" y="196" width="180" height="52" rx="10" fill="#1d2330"/>
  <rect x="1224" y="144" width="120" height="16" rx="8" fill="#c5ccd8"/>
  <rect x="1224" y="196" width="140" height="52" rx="10" fill="#e5484d"/>
  <rect x="40" y="316" width="1000" height="644" rx="16" fill="#ffffff"/>
  <polyline points="88,860 200,800 312,820 424,700 536,720 648,610 760,640 872,520 984,480" fill="none" stroke="#2350e8" stroke-width="10" stroke-linejoin="round" stroke-linecap="round"/>
  <polyline points="88,900 200,880 312,890 424,850 536,860 648,830 760,840 872,800 984,790" fill="none" stroke="#c5ccd8" stroke-width="8" stroke-linejoin="round" stroke-linecap="round"/>
  <rect x="88" y="356" width="220" height="20" rx="10" fill="#c5ccd8"/>
  <rect x="1064" y="316" width="496" height="644" rx="16" fill="#ffffff"/>
  ${[0, 1, 2, 3, 4, 5]
    .map(
      (i) =>
        `<rect x="1096" y="${372 + i * 92}" width="200" height="18" rx="9" fill="#c5ccd8"/><rect x="1096" y="${402 + i * 92}" width="${380 - i * 46}" height="14" rx="7" fill="${i === 0 ? '#e5484d' : '#2350e8'}" opacity="${1 - i * 0.12}"/>`,
    )
    .join('')}`,
  1600,
  1000,
)

/** 장 하나에 채울 내용 */
interface Fill {
  fields?: Record<string, string>
  items?: Partial<Item>[]
  options?: SlideOptions
  /** 발표자 노트: 발표하는 사람이 그대로 읽어도 되는 대본 */
  notes?: string
  /** 배경 모션. 자리와 짙기는 처음 고를 때의 값(장 전체, 글이 적은 장은 또렷하게) */
  backdrop?: BackdropId
  /** 부품 장: 구성이 넣어 둔 컴포넌트에 차례대로 채울 내용 */
  blocks?: { fields?: Record<string, string>; items?: Partial<Item>[] }[]
  /** 모션 그래픽 장: 틀과 칸의 글. 구성이 넣어 둔 모션 그래픽 자리에 그 틀의 레시피를 건다 */
  cine?: { preset: CinePresetId; fields: Record<string, string> }
}

// 일하는 방식 TF 이서연 책임이 본부장에게 하는 개선 제안: 진행 공유는 보드로, 회의는 결정만
const SAMPLE_INPUT = {
  type: 'improve',
  audience: 'mixed',
  minutes: 30,
  method: 'live',
  title: '주간 회의 줄이기 개선 제안',
  org: '일하는 방식 TF',
  presenter: '이서연 책임',
  theme: 'white',
} as const

/**
 * 홈 목록과 장 아래에 보이는 예시의 이름. 예시를 새로 짜면 이름도 바꾼다: 홈(Home.tsx의 openSample)은 이름이 다른, 손대지 않은 예전 예시만
 * 새 예시로 바꾼다(sample.test.ts가 예전 이름들과 견준다)
 */
export const SAMPLE_TITLE = '예시: 주간 회의 줄이기 제안'

/** 두 판이 같이 쓰는 장: 뼈대(표지, 요약, 섹션, 마지막 장)와 이미지, 일정 */
const COMMON: Record<string, Fill> = {
  표지: {
    fields: {
      lead: '진행 상황은 보드로 나누고, 회의는 결정만 해요',
      ask: '두 팀 2개월 시범 운영과 보드 도구 사용료 승인',
    },
    notes:
      '일하는 방식 TF의 이서연이에요. 오늘은 주간 회의를 줄이자는 제안을 드리려고 해요. 결론부터 말씀드리면, 진행 상황은 회의 전에 보드로 나누고 회의에서는 정할 것만 정하자는 거예요. 두 팀이 두 달 동안 먼저 해 보는 것과 보드 도구 사용료를 오늘 승인받고 싶어요.',
  },
  '한 장 요약': {
    fields: { title: '진행 공유를 보드로 옮기면 한 사람이 일주일에 3시간을 돌려받아요' },
    items: [
      { title: '지금의 문제', body: '한 사람이 일주일에 회의로 9시간을 써요. 그중 3.5시간은 돌아가며 진행 상황을 말하는 시간이에요.' },
      { title: '개선안', body: '진행 상황은 회의 전에 보드에 적고, 회의는 30분 동안 정할 것만 다뤄요.' },
      { title: '기대 효과', body: '한 사람이 일주일에 3시간, 본부 80명이 한 해에 12,000시간을 아껴요.' },
      { title: '요청 사항', body: '두 팀 2개월 시범 운영 승인, 보드 도구 사용료 월 40만 원' },
    ],
    notes:
      '이 한 장이 오늘 말씀드릴 전부예요. 한 사람이 일주일에 회의로 9시간을 쓰는데, 그중 3.5시간이 돌아가며 진행 상황을 말하는 시간이에요. 진행은 보드로 옮기고 회의는 30분 동안 정할 것만 다루면, 한 사람이 일주일에 3시간, 본부 전체로는 한 해에 12,000시간을 돌려받아요. 그래서 두 팀 시범과 월 40만 원의 도구 사용료를 요청드려요.',
  },
  '섹션: 문제': { fields: { lead: '회의에 드는 시간' }, notes: '먼저 지금 회의에 시간이 얼마나 드는지 보여 드릴게요.' },
  '섹션: 개선안': { fields: { lead: '회의는 결정만' }, notes: '그럼 어떻게 바꿀지 말씀드릴게요.' },
  '진행 보드': {
    fields: {
      title: '팀의 한 주를 보드 한 화면에서 봐요',
      body: '팀원마다 한 일과 막힌 일, 이번 주에 정할 안건이 한 화면에 모여요.',
      image: SAMPLE_DASHBOARD,
    },
    notes:
      '우리 팀이 2주 동안 먼저 써 본 보드 화면이에요. 팀원마다 한 일과 막힌 일, 이번 주에 정할 안건이 한 화면에 모여서, 회의 전에 이 화면만 보고 들어오면 돼요.',
  },
  '섹션: 실행': { fields: { lead: '언제, 어떻게 바꿀지' }, notes: '마지막으로 언제, 어떻게 시작할지 말씀드릴게요.' },
  '실행 계획': {
    fields: { title: '11월에 시작해 2월에 모든 팀이 바꿔요' },
    options: { highlight: 0 },
    items: [
      { meta: '11월', title: '두 팀 시범', body: '손을 든 두 팀이 먼저' },
      { meta: '12월', title: '중간 점검', body: '회의 시간과 설문으로' },
      { meta: '1월', title: '본부 확대', body: '점검 결과가 좋으면' },
      { meta: '2월', title: '모든 팀 적용', body: '30분 사용법 안내와 함께' },
    ],
    notes:
      '11월 첫 주에 손을 든 두 팀이 먼저 시작해요. 12월에 회의 시간과 설문으로 중간 점검을 하고, 결과가 좋으면 1월에 본부로 넓혀요. 2월에는 30분 회의 사용법 안내와 함께 모든 팀이 바꿔요.',
  },
  '결정 요청': {
    items: [
      { title: '두 팀 2개월 시범 운영 승인', body: '11월 첫 주에 시작하려면 이번 주까지' },
      { title: '보드 도구 사용료 월 40만 원', body: '시범 기간 두 달, 모두 80만 원' },
    ],
    notes:
      '오늘 정해 주셨으면 하는 것은 두 가지예요. 두 팀의 두 달 시범 운영과 시범 기간의 보드 도구 사용료 월 40만 원이에요. 11월 첫 주에 시작하려면 이번 주에 정해 주시면 좋겠어요. 궁금하신 점을 말씀해 주세요.',
  },
}

/** 개선 제안 구성의 장 하나 (역할 이름으로) */
const improve = (purpose: string): Recipe => BLUEPRINTS.improve.recipes.find((r) => r.purpose === purpose)!

/** 새 방식에서 쓸 화면: 개선 제안 구성에 없는 이미지 장 */
const SCREEN: Recipe = {
  layout: 'imageText',
  purpose: '진행 보드',
  priority: 3,
  section: '개선안',
  guide: '새 방식에서 쓸 화면을 넣어요.',
}

/** 구성의 장을 컴포넌트 장으로: 레이아웃의 항목과 칸 안내는 빼고 장 제목의 안내만 둔다 */
function pictured(r: Recipe, blocks: BlockType[], extra: Partial<Recipe> = {}): Recipe {
  return { ...r, layout: 'compose', items: undefined, prefill: undefined, fields: undefined, options: undefined, variant: undefined, hints: r.hints?.title ? { title: r.hints.title } : {}, blocks: blocks.map((type) => ({ type })), ...extra }
}

/** 쇼룸의 차례. 개선 제안 구성(improve.ts)에서 장을 골라, 말이 그림으로 서는 장은 그 컴포넌트나 모션 그래픽으로 둔다 */
function showroomRecipes(): Recipe[] {
  return [
    improve('표지'),
    // 한 장 요약은 줄마다 글을 채운 표 대신 숫자 셋으로: 결론은 제목이 말하고, 숫자가 크게 받친다
    { ...improve('한 장 요약'), layout: 'kpi', items: 3, prefill: undefined, hints: { title: improve('한 장 요약').hints!.title } },
    improve('섹션: 문제'),
    pictured(improve('지금의 문제'), ['ratio']),
    pictured(improve('문제의 크기'), ['split']),
    improve('원인'),
    improve('섹션: 개선안'),
    {
      layout: 'compose',
      purpose: '가장 크게 바뀌는 것',
      priority: 1,
      section: '개선안',
      guide: '가장 크게 바뀌는 숫자 하나를 지금에서 바뀐 뒤로 건너가게 보여요.',
      blocks: [{ type: 'cine' }],
    },
    pictured(improve('바뀌는 절차'), ['cycle'], { guide: '매주 되풀이되는 새 차례를 고리로 보여요.' }),
    SCREEN,
    pictured(improve('기대 효과'), ['cine']),
    improve('섹션: 실행'),
    pictured(improve('방안 비교'), ['cine'], { section: '실행', guide: '여러 안 가운데 고른 것과 그 이유를 한 장면으로 보여요.' }),
    improve('실행 계획'),
    improve('결정 요청'),
  ]
}

const SHOWROOM: Record<string, Fill> = {
  ...COMMON,
  표지: { ...COMMON.표지, options: { scene: 'opening' }, backdrop: 'diffuse' },
  '한 장 요약': {
    fields: { title: COMMON['한 장 요약'].fields!.title, source: '본부 설문을 바탕으로 한 추정, 9월 기준' },
    items: [
      { value: '3시간', title: '한 사람이 한 주에 돌려받는 시간', body: '회의 9시간이 6시간으로' },
      { value: '12,000시간', title: '본부가 한 해에 돌려받는 시간', body: '80명, 한 해 50주' },
      { value: '월 40만 원', title: '두 팀 2개월 시범에 드는 돈', body: '맞지 않으면 바로 멈춰요' },
    ],
    options: { scene: 'numbers' },
    notes:
      '오늘 말씀드릴 것을 숫자 셋으로 먼저 보여 드릴게요. 진행 공유를 회의 전에 보드로 옮기고 회의는 30분 동안 정할 것만 다루면, 한 사람의 한 주 회의가 9시간에서 6시간이 돼요. 본부 80명이면 한 해에 12,000시간이에요. 이걸 두 팀이 두 달 동안, 월 40만 원으로 먼저 확인해 보자는 제안이에요.',
  },
  '지금의 문제': {
    fields: { title: '회의가 많아서 정작 일할 시간이 모자라요', source: '본부 설문, 80명 응답, 9월 기준' },
    blocks: [
      { fields: { label: '회의 때문에 야근한 적이 있는 사람', value: '7', total: '10', unit: '명', note: '본부 80명 가운데 58명' } },
    ],
    notes:
      '9월에 본부 80명에게 물었더니, 열 명 가운데 일곱 명이 회의 때문에 야근한 적이 있다고 답했어요. 설문에 이런 말이 남아 있었어요. “회의가 다 끝나야 제 일을 시작해요. 그러다 보면 저녁이에요.” 회의가 일할 시간을 먹고 있어요.',
  },
  '문제의 크기': {
    fields: { title: '한 사람이 일주일에 회의로 9시간을 써요', source: '본부 설문, 80명 응답, 9월 기준' },
    blocks: [
      {
        fields: { label: '한 사람의 한 주 회의' },
        items: [
          { title: '진행 회의', value: '3.5시간' },
          { title: '프로젝트 점검', value: '2.5시간' },
          { title: '부서 간 협의', value: '2시간' },
          { title: '그 밖의 회의', value: '1시간' },
        ],
      },
    ],
    notes:
      '이 9시간을 나눠 보면 가장 큰 조각이 팀과 프로젝트의 진행 회의예요. 일주일에 3.5시간, 회의 시간의 거의 40%를 돌아가며 진행 상황을 말하는 데 써요. 오늘 제안은 이 가장 큰 조각을 겨냥해요.',
  },
  원인: {
    fields: { title: '회의를 줄이려면 진행을 같이 볼 곳부터 있어야 해요' },
    blocks: [
      {
        fields: { problem: '진행 회의에만 한 주 3.5시간이 들어요' },
        items: [
          { title: '한 사람씩 돌아가며 진행을 말해요', meta: '진행 회의 시간의 절반' },
          { title: '회의 전에는 서로의 진행을 몰라요', meta: '80명 중 61명' },
          { title: '진행을 적어 두고 같이 볼 곳이 없어요', meta: '메일, 메신저, 문서에 흩어짐' },
        ],
      },
    ],
    notes:
      '왜 이렇게 길어질까요. 진행 회의에 한 주 3.5시간이 드는 건 한 사람씩 돌아가며 말하기 때문이고, 그렇게 말하는 건 회의 전에는 서로의 진행을 알 길이 없어서예요. 한 번 더 들어가 보면, 진행을 적어 두고 같이 볼 곳이 없다는 게 뿌리예요. 그래서 개선안은 회의를 줄이는 데가 아니라 진행을 같이 볼 곳을 만드는 데서 시작해요.',
  },
  '가장 크게 바뀌는 것': {
    cine: { preset: 'stroke', fields: { title: '한 사람의 한 주 회의', label: '지금', before: '9시간', note: '바꾸면', after: '6시간' } },
    notes:
      '바꾸면 한 사람의 한 주 회의가 9시간에서 6시간이 돼요. 한 주 3.5시간 들던 진행 회의가 정할 것만 다루는 30분 회의 하나로 줄기 때문이에요. 진행 공유는 회의 전에 보드에서 해요.',
  },
  '바뀌는 절차': {
    fields: { title: '보드에 적고, 모여서는 정하기만 해요' },
    blocks: [
      {
        fields: { center: '한 주' },
        items: [
          { title: '보드에 적기', meta: '월요일, 모든 팀원 10분' },
          { title: '안건 모으기', meta: '수요일, 팀장' },
          { title: '30분 결정 회의', meta: '목요일, 정할 사람만' },
          { title: '결정 알리기', meta: '목요일, 진행자가 보드에' },
        ],
      },
    ],
    notes:
      '한 주는 이렇게 돌아가요. 월요일에 모두 10분씩 보드에 한 일과 막힌 일을 적고, 수요일에 팀장이 정할 것만 골라 안건으로 올려요. 목요일에 정할 사람만 30분 모여 정하고, 정한 것은 그날 보드에 남겨요. 그리고 다음 주 월요일에 다시 적는 데서 시작해요.',
  },
  '진행 보드': { ...COMMON['진행 보드'], options: { scene: 'picture' } },
  '기대 효과': {
    fields: { source: '본부 설문을 바탕으로 한 추정, 9월 기준' },
    cine: { preset: 'diffuse', fields: { value: '12,000시간', title: '본부가 한 해에 돌려받는 시간', sub: '한 사람이 한 주에 3시간씩, 80명이 50주 동안' } },
    notes:
      '이렇게 바꾸면 한 사람이 일주일에 3시간을 돌려받아요. 회의 9시간이 6시간이 되는 거예요. 본부 80명이 한 해 50주 동안이면 1만 2천 시간이에요. 설문을 바탕으로 한 추정이라, 시범에서 실제 숫자로 확인하려고 해요.',
  },
  '방안 비교': {
    cine: { preset: 'fork', fields: { label: '게시판, 두 팀 시범, 본부 전체 가운데', title: '두 팀이 두 달 먼저 써 봐요', sub: '월 40만 원으로 효과를 숫자로 본 뒤 넓혀요' } },
    notes:
      '시작하는 방법은 세 가지를 견줬어요. 지금 쓰는 사내 게시판에 적는 A안은 돈이 들지 않지만 한눈에 보기 어려워 흐지부지되기 쉬워요. 처음부터 본부 전체가 바꾸는 C안은 월 300만 원이 들고, 맞지 않으면 되돌리기 어려워요. 그래서 두 팀이 두 달 동안 월 40만 원으로 먼저 써 보는 B안을 추천해요. 맞지 않으면 바로 멈출 수 있어요.',
  },
  '실행 계획': { ...COMMON['실행 계획'], options: { ...COMMON['실행 계획'].options, scene: 'time' } },
  '결정 요청': { ...COMMON['결정 요청'], options: { scene: 'closing' }, backdrop: 'gather' },
}

function fill(slide: Slide, content: Fill | undefined, cines: Record<string, CineRecipe>): Slide {
  if (!content) return slide
  let blocks = slide.blocks?.map((b, i) => {
    const c = content.blocks?.[i]
    if (!c) return b
    return { ...b, fields: { ...b.fields, ...c.fields }, items: c.items ? c.items.map((it) => ({ ...emptyItem(), ...it })) : b.items }
  })
  let options = { ...slide.options, ...content.options }
  if (content.cine) {
    // 레시피는 틀 그대로다(지어낸 갈래 id). 같은 레시피면 버전 id도 같아서 예시를 몇 번 만들어도 같은 모션 그래픽이다
    const recipe = presetRecipe(content.cine.preset, `sample-${content.cine.preset}`)
    const id = cineId(recipe)
    cines[id] = recipe
    blocks = blocks?.map((b) => (b.type === 'cine' ? { ...b, cine: id, fields: { ...content.cine!.fields } } : b))
    // 장에 모션 그래픽 하나뿐이면 장면의 제목이 장의 제목이다(편집기에서 넣을 때와 같다)
    if (recipe.texts?.some((t) => t.key === 'title')) options = { ...options, hideHead: true }
  }
  return {
    ...slide,
    fields: { ...slide.fields, ...content.fields },
    items: content.items ? content.items.map((it) => ({ ...emptyItem(), ...it })) : slide.items,
    options,
    ...(blocks ? { blocks } : {}),
    ...(content.notes ? { notes: content.notes } : {}),
    ...(content.backdrop ? { backdrop: baseBackdrop({ ...slide, options }, content.backdrop) } : {}),
  }
}

function build(recipes: Recipe[], content: Record<string, Fill>): Deck {
  const deck = createDeck(SAMPLE_INPUT, recipes)
  const cines: Record<string, CineRecipe> = {}
  const slides = deck.slides.map((s) => fill(s, content[s.purpose], cines))
  // 채운 뒤 판을 다시 맞춘다: 장 제목을 숨긴 모션 그래픽 장은 본문이 넓어지고, 채운 글에 맞는 높이가 다르다(편집기가 고칠 때마다 하는 것)
  return settleDeck({
    ...deck,
    title: SAMPLE_TITLE,
    meta: { ...deck.meta, contact: '내선 3051' },
    slides,
    ...(Object.keys(cines).length ? { cines } : {}),
  })
}

export function createSampleDeck(): Deck {
  return build(showroomRecipes(), SHOWROOM)
}

// ---------- 레이아웃 장으로 짠 판 (장 모음과 시험) ----------

/** 원인, 바뀌는 모습, 기대 효과는 구성에서 컴포넌트 장이다. 이 판은 그 장들을 칸을 채운 레이아웃 장(점 목록, 비교, 핵심 숫자)으로 둔다 */
const AS_LAYOUT: Record<string, Partial<Recipe>> = {
  원인: {
    layout: 'points',
    guide: '왜 생기는지 짚으면 개선안이 왜 맞는지 보여요.',
    hints: {
      title: '문제가 생기는 이유',
      'items.title': '원인',
      'items.body': '왜 그런지, 얼마나 자주 그런지',
      ...each({ title: ['양식이 팀마다 달라요', '업체 목록이 흩어져 있어요', '승인이 세 단계예요'] }),
    },
  },
  '바뀌는 모습': {
    layout: 'compare',
    guide: '지금 방식과 바뀐 방식을 줄마다 나란히 놓아요.',
    fields: { leftTitle: '지금', rightTitle: '개선 후' },
    hints: { title: '이렇게 바꾸자고 제안해요', 'items.title': '지금의 방식', 'items.body': '바뀐 방식' },
  },
  '기대 효과': {
    layout: 'kpi',
    guide: '무엇이 얼마나 좋아지는지 숫자로 적어요.',
    hints: { title: '바꾸면 얻는 것', 'items.body': '계산 근거' },
  },
}

/** 개선 제안 구성(듣는 사람 여럿, 30분)에 목차와 이미지 장을 더해, 한 벌로 더 많은 레이아웃을 보여 준다 */
function layoutRecipes(): Recipe[] {
  const list = planRecipes(SAMPLE_INPUT.type, SAMPLE_INPUT.audience, SAMPLE_INPUT.minutes).map((r) => (AS_LAYOUT[r.purpose] ? { ...r, ...AS_LAYOUT[r.purpose], blocks: undefined } : r))
  list.splice(list.findIndex((r) => r.purpose === '한 장 요약') + 1, 0, agenda)
  list.splice(list.findIndex((r) => r.purpose === '바뀌는 절차') + 1, 0, SCREEN)
  return list
}

const LAYOUT_CONTENT: Record<string, Fill> = {
  ...COMMON,
  '지금의 문제': {
    fields: {
      title: '회의가 많아서 정작 일할 시간이 모자라요',
      lead: '본부 80명 중 열에 일곱이 회의 때문에 야근한 적이 있다고 답했어요. 가장 오래 걸리는 건 돌아가며 진행 상황을 말하는 주간 회의예요.',
    },
  },
  '문제의 크기': {
    fields: { title: '한 사람이 일주일에 회의로 9시간을 써요', lead: '설문에 답한 80명의 평균이에요', unit: '시간', source: '본부 설문, 80명 응답, 9월 기준' },
    options: { highlight: 0 },
    items: [
      { title: '주간 진행 회의', value: '3.5' },
      { title: '프로젝트 점검', value: '2.5' },
      { title: '부서 간 협의', value: '2' },
      { title: '그 밖의 회의', value: '1' },
    ],
  },
  원인: {
    fields: { title: '회의가 길어지는 이유', lead: '설문에서 가장 많이 나온 세 가지예요' },
    items: [
      { title: '진행 상황을 말로 나눠요', body: '한 사람씩 돌아가며 말하느라 회의 시간의 절반이 지나가요.' },
      { title: '안건을 회의에서 처음 들어요', body: '무엇을 정할지 미리 몰라서 결정이 다음 주로 밀려요.' },
      { title: '모두가 모든 회의에 들어가요', body: '내 일과 상관없는 이야기를 듣는 시간이 길어요.' },
    ],
  },
  '과제 우선순위': {
    fields: { title: '쉽고 효과가 큰 것부터 시작해요' },
    items: [
      { title: '틈틈이 하기', body: '회의실 예약을 30분 단위로' },
      { title: '바로 하기', body: '진행 공유를 보드로\n안건 없는 회의는 열지 않기' },
      { title: '미루기', body: '회의록 양식 새로 만들기' },
      { title: '계획해서 하기', body: '겹치는 부서 간 회의 합치기' },
    ],
  },
  '바뀌는 모습': {
    fields: { title: '이렇게 바꾸자고 제안해요' },
    items: [
      { title: '진행 상황을 돌아가며 말해요', body: '회의 전에 보드에 적어 둬요' },
      { title: '안건을 회의에서 처음 들어요', body: '하루 전에 안건을 받아요' },
      { title: '팀 모두가 90분 동안 모여요', body: '정할 사람만 30분 모여요' },
    ],
  },
  '바뀌는 절차': {
    fields: { title: '보드에 적고, 모여서는 정하기만 해요', lead: '지금은 같은 일에 매주 90분 회의를 해요' },
    items: [
      { title: '보드에 진행 적기', meta: '모든 팀원, 10분', body: '한 일과 막힌 일을 보드에 남겨요' },
      { title: '안건 모으기', meta: '팀장, 하루 전', body: '정할 것만 골라 안건으로 올려요' },
      { title: '30분 결정 회의', meta: '정할 사람만, 30분', body: '안건마다 정하고 맡을 사람을 정해요' },
      { title: '결정 알리기', meta: '진행자, 당일', body: '정한 것을 보드에 적어 모두가 봐요' },
    ],
  },
  '방안 비교': {
    fields: { title: '두 팀이 먼저 해 보는 B안을 추천해요' },
    items: [
      { title: 'A안', value: '0원', meta: '바로', body: '지금 쓰는 사내 게시판에 진행을 적어요\n돈은 들지 않지만 한눈에 보기 어려워요\n흐지부지될 가능성이 커요' },
      { title: 'B안', value: '월 40만 원', meta: '두 팀, 2개월', body: '보드 도구를 두 팀이 먼저 써요\n효과를 숫자로 확인한 뒤 넓혀요\n맞지 않으면 바로 멈출 수 있어요' },
      { title: 'C안', value: '월 300만 원', meta: '본부 전체', body: '처음부터 모든 팀이 같이 바꿔요\n실패하면 되돌리기 어려워요' },
    ],
  },
  '기대 효과': {
    fields: { title: '한 사람이 일주일에 3시간을 돌려받아요', source: '본부 설문을 바탕으로 한 추정, 9월 기준' },
    items: [
      { value: '3시간', title: '한 사람이 아끼는 시간', body: '회의 9시간이 6시간으로' },
      { value: '67%', title: '줄어드는 진행 회의 시간', body: '진행 회의 90분이 30분으로' },
      { value: '12,000시간', title: '본부가 한 해에 아끼는 시간', body: '80명, 한 해 50주 기준' },
    ],
  },
}

/** 같은 이야기를 레이아웃 장으로만 짠 판 (모든 장이 레이아웃 장이다) */
export function layoutSampleDeck(): Deck {
  return build(layoutRecipes(), LAYOUT_CONTENT)
}

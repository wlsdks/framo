import { agenda, type Recipe } from './blueprints/recipes'
import { createDeck, emptyItem, planRecipes } from './generate'
import type { Deck, Item, Slide, SlideOptions } from './types'

// 처음 쓰는 사람이 완성된 모습을 볼 수 있는 예시 보고. 회사, 사람, 숫자는 모두 지어낸 것이다.
// 어느 직무든 '나도 이런 발표를 하겠다' 싶게, 직무가 드러나지 않는 사내 개선 제안(회의 줄이기)으로 둔다.

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

type Fill = { fields?: Record<string, string>; items?: Partial<Item>[]; options?: SlideOptions }

// 일하는 방식 TF 이서연 책임이 본부장에게 하는 개선 제안: 진행 공유는 보드로, 회의는 결정만
const CONTENT: Record<string, Fill> = {
  표지: {
    fields: {
      lead: '진행 상황은 보드로 나누고, 회의는 결정만 해요',
      ask: '두 팀 2개월 시범 운영과 보드 도구 사용료 승인',
    },
  },
  '한 장 요약': {
    fields: { title: '진행 공유를 보드로 옮기면 한 사람이 일주일에 3시간을 돌려받아요' },
    items: [
      { title: '지금의 문제', body: '한 사람이 일주일에 회의로 9시간을 써요. 그중 3.5시간은 돌아가며 진행 상황을 말하는 시간이에요.' },
      { title: '개선안', body: '진행 상황은 회의 전에 보드에 적고, 회의는 30분 동안 정할 것만 다뤄요.' },
      { title: '기대 효과', body: '한 사람이 일주일에 3시간, 본부 80명이 한 해에 1만 2천 시간을 아껴요.' },
      { title: '요청 사항', body: '두 팀 2개월 시범 운영 승인, 보드 도구 사용료 월 40만 원' },
    ],
  },
  '섹션: 문제': { fields: { lead: '회의에 드는 시간' } },
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
  '섹션: 개선안': { fields: { lead: '회의는 결정만' } },
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
  '진행 보드': {
    fields: {
      title: '팀의 한 주를 보드 한 화면에서 봐요',
      body: '팀원마다 한 일과 막힌 일, 이번 주에 정할 안건이 한 화면에 모여요. 우리 팀이 2주 동안 먼저 써 본 화면이에요.',
      image: SAMPLE_DASHBOARD,
    },
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
  '섹션: 실행': { fields: { lead: '언제, 어떻게 바꿀지' } },
  '실행 계획': {
    fields: { title: '두 팀에서 먼저 시작해요' },
    options: { highlight: 0 },
    items: [
      { meta: '11월', title: '두 팀 시범', body: '손을 든 두 팀이 먼저' },
      { meta: '12월', title: '중간 점검', body: '회의 시간과 설문으로' },
      { meta: '1월', title: '본부 확대', body: '점검 결과가 좋으면' },
      { meta: '2월', title: '모든 팀 적용', body: '30분 사용법 안내와 함께' },
    ],
  },
  '결정 요청': {
    items: [
      { title: '두 팀 2개월 시범 운영 승인', body: '11월 첫 주에 시작하려면 이번 주까지' },
      { title: '보드 도구 사용료 월 40만 원', body: '시범 기간 두 달, 모두 80만 원' },
      { title: '본부 주간 보고도 보드로 받기', body: '시범 팀이 같은 내용을 두 번 쓰지 않게' },
    ],
  },
}

/** 개선 제안 구성에 없는 목차와 이미지 장을 더해, 예시 한 벌로 더 많은 레이아웃을 보여 준다 */
const SCREEN: Recipe = {
  layout: 'imageText',
  purpose: '진행 보드',
  priority: 3,
  section: '개선안',
  guide: '새 방식에서 쓸 화면을 넣어요.',
}

function recipes(): Recipe[] {
  const list = [...planRecipes('improve', 'mixed', 30)]
  list.splice(list.findIndex((r) => r.purpose === '한 장 요약') + 1, 0, agenda)
  list.splice(list.findIndex((r) => r.purpose === '바뀌는 절차') + 1, 0, SCREEN)
  return list
}

function fill(slide: Slide): Slide {
  const content = CONTENT[slide.purpose]
  if (!content) return slide
  return {
    ...slide,
    fields: { ...slide.fields, ...content.fields },
    items: content.items ? content.items.map((it) => ({ ...emptyItem(), ...it })) : slide.items,
    options: { ...slide.options, ...content.options },
  }
}

export function createSampleDeck(): Deck {
  const deck = createDeck(
    {
      type: 'improve',
      audience: 'mixed',
      minutes: 30,
      method: 'live',
      title: '주간 회의 줄이기 개선 제안',
      org: '일하는 방식 TF',
      presenter: '이서연 책임',
      theme: 'white',
    },
    recipes(),
  )
  return {
    ...deck,
    title: '예시: 주간 회의 줄이기 개선 제안',
    meta: { ...deck.meta, contact: '내선 3051' },
    slides: deck.slides.map(fill),
  }
}

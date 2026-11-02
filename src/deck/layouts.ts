import type { Item, ItemKey, LayoutId, Place, Slide } from './types'

export interface FieldSpec {
  /** 슬라이드 칸 이름. `$`로 시작하면 덱 단위 값(소속, 발표자 등) */
  key: string
  label: string
  hint: string
  /**
   * 레이아웃의 예시 이야기(항목 칸의 hints)에 매인 예시(추이의 목표 120은 예시 값 96~152에 맞춘 것). 발표 종류가 항목 예시를
   * 따로 준 장에는 섞지 않고 hint(안내)를 보인다: 시장 추이(600~1,200억 원)에 목표 120이 그래프 바닥에 그어졌다
   */
  example?: string
  multiline?: boolean
  optional?: boolean
  /** 비워 두면 정해진 이름(목표, 실적 같은)으로 보이는 칸. 부품 안에서도 접지 않는다 */
  named?: boolean
  /** 채우지 않아도 되지만(빈칸으로 세지 않는다) 부품 안에서 접지 않고 늘 보이는 칸 (인용의 말한 사람) */
  shown?: boolean
  image?: boolean
}

export interface ItemFieldSpec {
  key: ItemKey
  label: string
  hint: string
  /** 항목 자리마다 다른 안내 (2×2의 네 칸처럼 자리에 뜻이 있을 때) */
  hints?: string[]
  multiline?: boolean
  optional?: boolean
  /** 채우지 않아도 되지만 부품 안에서 접지 않고 늘 보이는 항목 칸 (준비 상황의 상태: 표시가 이 칸의 글을 따른다) */
  shown?: boolean
  image?: boolean
}

/** 같은 칸을 다르게 놓은 모양. 내용은 그대로 두고 배치만 바뀐다. */
export interface VariantSpec {
  id: string
  name: string
}

export interface LayoutSpec {
  id: LayoutId
  name: string
  description: string
  /** 첫째가 기본 모양. 없으면 한 가지 모양뿐 */
  variants?: VariantSpec[]
  /** 항목 하나를 강조할 수 있으면 그 이름과, 고르지 않았을 때 강조할 항목(-1은 없음, 'last'는 마지막 항목) */
  highlight?: { label: string; fallback: number | 'last' }
  fields: FieldSpec[]
  items?: {
    label: string
    min: number
    max: number
    default: number
    fields: ItemFieldSpec[]
  }
  /**
   * 두 판으로 나뉜 장: 편집할 때 옆 판을 끌어 반대쪽으로 옮기고(options.flip), 판 사이를 끌어 너비를 고른다(options.pane).
   * name은 옆 판의 이름, el은 그 판을 찾는 선택자, sides는 고를 수 있는 너비(장 너비를 12로 나눈 칸 수), base는 고르지 않았을 때의 너비.
   * start는 옆 판이 처음에 왼쪽에 있는 장(이미지와 설명). variants가 있으면 그 모양에서만 좌우와 너비를 고른다.
   * below는 판이 아래에 깔리는 모양(표지의 아래 띠): 판을 장 아래쪽으로 끌면 그 모양이 되고, 위로 끌면 옆으로 돌아온다
   */
  panes?: { name: string; el: string; sides: number[]; base: number; start?: boolean; variants?: string[]; below?: string }
  /**
   * 제목 덩어리를 위, 가운데, 아래로 옮길 수 있는 장 (SlideOptions.place). name은 덩어리의 이름, el은 장 안의 그 요소.
   * 글상자를 아무 데나 놓게 하지 않고 정해 둔 세 자리에만 붙인다 (줄과 여백이 어긋나지 않게)
   */
  place?: { name: string; el: string; base: Place }
}

/** 옆 판 너비의 한 칸 (장 너비를 12로 나눈 것) */
export const PANE_UNIT = 1920 / 12

const title = (hint: string): FieldSpec => ({ key: 'title', label: '제목', hint })
/** 숫자 장 아래의 출처·기준. 윗분이 "이 숫자 어디서 나왔어요?"를 묻지 않게 */
const source: FieldSpec = { key: 'source', label: '출처', hint: '출처나 기준 시점 (예: 사내 집계, 9월 말 기준)', optional: true }
const lead = (hint = '제목을 뒷받침하는 한두 문장'): FieldSpec => ({
  key: 'lead',
  label: '부제',
  hint,
  multiline: true,
  optional: true,
})

export const LAYOUTS: Record<LayoutId, LayoutSpec> = {
  cover: {
    id: 'cover',
    name: '표지',
    description: '발표 제목과 발표자, 결정받을 것',
    // 모양과 옆 판의 이름은 결정 요청이 없는 발표(공유, 소개)에서도 맞게 자리로 부른다
    variants: [
      { id: 'base', name: '옆 면' },
      { id: 'band', name: '아래 띠' },
      { id: 'full', name: '색 면' },
    ],
    panes: { name: '옆 면', el: '.cv-side', sides: [3, 4, 5], base: 4, variants: ['base'], below: 'band' },
    place: { name: '제목', el: '.cv-text', base: 'bottom' },
    fields: [
      { key: 'title', label: '발표 제목', hint: '발표 제목', multiline: true },
      { key: 'lead', label: '부제', hint: '한 줄 부제', optional: true },
      { key: 'ask', label: '결정 요청', hint: '결정받고 싶은 것을 한 줄로', multiline: true, optional: true },
      { key: '$org', label: '소속', hint: '소속 (예: 경영지원팀)', optional: true },
      { key: '$presenter', label: '발표자', hint: '발표자 이름', optional: true },
      { key: '$date', label: '날짜', hint: '발표 날짜', optional: true },
      { key: '$logo', label: '로고', hint: '로고', optional: true, image: true },
    ],
  },
  section: {
    id: 'section',
    name: '섹션 구분',
    description: '이야기를 큰 덩어리로 나눠요',
    // 기본은 테마 바탕: 흰 장 사이에 검은 장이 끼면 장마다 무게가 달라 보인다. 짙은 면은 고르는 모양
    variants: [
      { id: 'base', name: '바탕' },
      { id: 'bold', name: '색 면' },
    ],
    place: { name: '제목', el: '.sc-body', base: 'bottom' },
    fields: [title('이번 섹션의 제목'), lead('이 섹션에서 다룰 내용')],
  },
  agenda: {
    id: 'agenda',
    name: '목차',
    description: '오늘 다룰 순서',
    variants: [
      { id: 'base', name: '목록' },
      { id: 'columns', name: '나란히' },
    ],
    fields: [title('목차')],
    items: {
      label: '목차 항목',
      min: 2,
      max: 6,
      default: 4,
      fields: [{ key: 'title', label: '항목', hint: '다룰 내용', hints: ['배경', '제안', '효과와 비용', '실행 계획', '위험과 대응', '요청 사항'] }],
    },
  },
  summary: {
    id: 'summary',
    name: '한 장 요약',
    description: '결론과 줄마다의 요점을 한 장에',
    variants: [
      { id: 'base', name: '줄' },
      { id: 'grid', name: '칸' },
    ],
    fields: [{ key: 'title', label: '결론', hint: '한 줄 결론', multiline: true }],
    items: {
      label: '줄',
      min: 2,
      max: 5,
      default: 4,
      fields: [
        { key: 'title', label: '이름', hint: '줄 이름', hints: ['배경', '제안', '기대 효과', '요청 사항', '일정'] },
        { key: 'body', label: '내용', hint: '한두 문장', multiline: true },
      ],
    },
  },
  statement: {
    id: 'statement',
    name: '한 문장 메시지',
    description: '가장 중요한 말을 크게',
    fields: [
      { key: 'title', label: '메시지', hint: '전하고 싶은 메시지를 한 문장으로', multiline: true },
      lead(),
    ],
  },
  kpi: {
    id: 'kpi',
    name: '핵심 숫자',
    description: '숫자 2~4개를 크게',
    variants: [
      { id: 'base', name: '나란히' },
      { id: 'focus', name: '하나 크게' },
      { id: 'cards', name: '카드' },
    ],
    fields: [title('숫자들이 말해 주는 결론'), source],
    items: {
      label: '숫자',
      min: 1,
      max: 4,
      default: 3,
      fields: [
        { key: 'value', label: '숫자', hint: '30%', hints: ['4.8억 원', '3년', '22%', '120곳'] },
        { key: 'title', label: '이름', hint: '지표 이름', hints: ['한 해 절감액', '회수 기간', '줄인 시간', '대상 지점'] },
        { key: 'body', label: '설명', hint: '짧은 설명', multiline: true, optional: true },
      ],
    },
  },
  scorecard: {
    id: 'scorecard',
    name: '목표 대비 실적',
    description: '지표마다 목표와 실적, 달성률을 한 표로',
    variants: [
      { id: 'base', name: '표' },
      { id: 'side', name: '나란히' },
    ],
    highlight: { label: '강조할 지표', fallback: -1 },
    fields: [
      title('실적을 요약하는 한 문장'),
      { key: 'metaTitle', label: '목표 제목', hint: '목표', optional: true, named: true },
      { key: 'valueTitle', label: '실적 제목', hint: '실적', optional: true, named: true },
      source,
    ],
    items: {
      label: '지표',
      min: 2,
      max: 6,
      default: 4,
      fields: [
        { key: 'title', label: '지표', hint: '지표 이름', hints: ['매출', '영업이익', '신규 채용', '처리 기간', '이익률', '문의 처리'] },
        { key: 'meta', label: '목표', hint: '117억 원', hints: ['117억 원', '14억 원', '5명', '5일 이하', '12%', '300건'] },
        { key: 'value', label: '실적', hint: '131억 원', hints: ['131억 원', '15.2억 원', '4명', '4.2일', '11%', '320건'] },
        { key: 'body', label: '설명', hint: '짧은 설명이나 원인', optional: true },
      ],
    },
  },
  bridge: {
    id: 'bridge',
    name: '증감 요인',
    description: '처음 값에서 끝 값까지, 무엇이 얼마나 더하고 뺐는지',
    variants: [
      { id: 'base', name: '세로' },
      { id: 'across', name: '가로' },
    ],
    fields: [
      title('증감을 요약하는 한 문장'),
      { key: 'startTitle', label: '처음 이름', hint: '목표', optional: true, named: true },
      { key: 'startValue', label: '처음 값', hint: '117' },
      { key: 'endTitle', label: '끝 이름', hint: '실적', optional: true, named: true },
      { key: 'unit', label: '단위', hint: '억 원', optional: true },
      source,
    ],
    items: {
      label: '요인',
      min: 1,
      max: 6,
      default: 3,
      fields: [
        { key: 'title', label: '요인', hint: '요인 이름', hints: ['신제품', '가격 조정', '거래 감소', '환율', '원가 절감', '기타'] },
        { key: 'value', label: '증감', hint: '+9', hints: ['+9', '+7', '-2', '+3', '-1', '+1'] },
        { key: 'meta', label: '보충', hint: '짧은 설명', optional: true },
      ],
    },
  },
  trend: {
    id: 'trend',
    name: '추이',
    description: '달마다, 분기마다 숫자가 어떻게 움직였는지 선으로',
    variants: [
      { id: 'base', name: '선' },
      { id: 'area', name: '면' },
    ],
    highlight: { label: '강조할 점', fallback: 'last' },
    fields: [
      title('흐름이 말해 주는 결론'),
      lead(),
      { key: 'unit', label: '단위', hint: '억 원', optional: true },
      { key: 'target', label: '목표선', hint: '있으면 숫자로', example: '120', optional: true },
      source,
    ],
    items: {
      label: '점',
      min: 3,
      max: 12,
      default: 6,
      fields: [
        { key: 'title', label: '시기', hint: '시기', hints: ['4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월', '1월', '2월', '3월'] },
        { key: 'value', label: '숫자', hint: '120', hints: ['96', '101', '99', '108', '117', '131', '126', '134', '140', '138', '145', '152'] },
      ],
    },
  },
  progress: {
    id: 'progress',
    name: '진행 현황',
    description: '과제마다 얼마나 됐는지와 완료, 진행 중, 지연, 예정 상태',
    variants: [
      { id: 'base', name: '줄' },
      { id: 'board', name: '상태별' },
    ],
    fields: [title('진행 상황을 요약하는 한 문장'), source],
    items: {
      label: '과제',
      min: 1,
      max: 7,
      default: 5,
      fields: [
        { key: 'title', label: '과제', hint: '과제 이름', hints: ['신청 화면 만들기', '규정 정리', '승인 단계 줄이기', '직원 교육', '효과 점검', '양식 정리', '결과 보고'] },
        { key: 'meta', label: '담당과 기한', hint: '담당, 기한', optional: true, hints: ['정보기술팀, 10월', '인사팀, 11월', '사업본부, 11월', '교육팀, 12월', '기획팀, 1월', '기획팀, 1월', '사업본부, 2월'] },
        { key: 'value', label: '진행률', hint: '80%', hints: ['100%', '80%', '40%', '20%', '0%', '50%', '0%'] },
        {
          key: 'body',
          label: '상태',
          hint: '완료, 진행 중, 지연, 예정',
          optional: true,
          hints: ['완료', '진행 중', '2주 지연', '진행 중', '예정', '진행 중', '예정'],
        },
      ],
    },
  },
  share: {
    id: 'share',
    name: '구성비',
    description: '전체를 나눈 비중 (비용 구성, 인력 구성, 매출 구성)',
    variants: [
      { id: 'base', name: '띠' },
      { id: 'donut', name: '도넛' },
      { id: 'units', name: '100칸' },
    ],
    highlight: { label: '강조할 항목', fallback: 0 },
    fields: [title('구성이 말해 주는 결론'), { key: 'unit', label: '단위', hint: '억 원', optional: true }, source],
    items: {
      label: '항목',
      min: 2,
      max: 6,
      default: 4,
      fields: [
        { key: 'title', label: '항목', hint: '항목 이름', hints: ['급여', '시설', '운영', '교육', '기타', '그 밖'] },
        { key: 'value', label: '숫자', hint: '48', hints: ['48', '31', '14', '7', '5', '3'] },
        { key: 'meta', label: '보충', hint: '짧은 설명', optional: true },
      ],
    },
  },
  process: {
    id: 'process',
    name: '단계 흐름',
    description: '일이 어떤 순서로 흘러가는지 (업무 절차, 바뀌는 절차)',
    variants: [
      { id: 'base', name: '선으로 잇기' },
      { id: 'cards', name: '칸' },
    ],
    highlight: { label: '강조할 단계', fallback: -1 },
    fields: [title('흐름을 요약하는 한 문장'), lead()],
    items: {
      label: '단계',
      min: 2,
      max: 6,
      default: 4,
      fields: [
        { key: 'title', label: '단계', hint: '단계 이름', hints: ['요청 접수', '내용 확인', '검토와 승인', '비용 처리', '최종 결재', '사후 관리'] },
        {
          key: 'meta',
          label: '담당과 시간',
          hint: '담당, 걸리는 시간',
          optional: true,
          hints: ['신청자, 당일', '담당자, 하루', '팀장, 반나절', '재무팀, 당일', '본부장, 사흘', '운영팀'],
        },
        {
          key: 'body',
          label: '설명',
          hint: '이 단계에서 하는 일',
          multiline: true,
          optional: true,
          hints: ['요청을 시스템에 남겨요', '빠진 서류를 바로 챙겨요', '한 번에 검토하고 승인해요', '정해진 계정으로 처리해요', '금액이 크면 한 번 더 봐요', '쓰는 모습을 살펴요'],
        },
      ],
    },
  },
  funnel: {
    id: 'funnel',
    name: '깔때기',
    description: '단계를 거치며 얼마나 남는지 (채용 단계, 신청에서 승인까지). 전환율은 자동으로 계산돼요',
    highlight: { label: '강조할 단계', fallback: 'last' },
    fields: [title('전환을 요약하는 한 문장'), { key: 'unit', label: '단위', hint: '건', optional: true }, source],
    items: {
      label: '단계',
      min: 2,
      max: 6,
      default: 4,
      fields: [
        { key: 'title', label: '단계', hint: '단계 이름', hints: ['지원', '서류 통과', '면접', '최종 합격', '입사', '수습 통과'] },
        { key: 'value', label: '숫자', hint: '120', hints: ['120', '48', '20', '9', '6', '3'] },
        { key: 'meta', label: '보충', hint: '짧은 설명', optional: true },
      ],
    },
  },
  table: {
    id: 'table',
    name: '표',
    description: '줄과 칸으로 정리해요 (실행 과제, 항목별 비교). 비운 칸은 발표할 때 빠져요',
    highlight: { label: '강조할 줄', fallback: -1 },
    fields: [
      title('표가 말해 주는 결론'),
      { key: 'h1', label: '첫째 열 제목', hint: '과제' },
      { key: 'h2', label: '둘째 열 제목', hint: '담당', optional: true },
      { key: 'h3', label: '셋째 열 제목', hint: '기한', optional: true },
      { key: 'h4', label: '넷째 열 제목', hint: '비고', optional: true },
      source,
    ],
    items: {
      label: '줄',
      min: 1,
      max: 7,
      default: 4,
      fields: [
        { key: 'title', label: '첫째 칸', hint: '과제 이름', hints: ['보고 양식 통일', '규정집 공유', '승인 단계 줄이기', '효과 점검'] },
        { key: 'meta', label: '둘째 칸', hint: '담당', hints: ['기획팀', '인사팀', '사업본부', '기획팀'], optional: true },
        { key: 'value', label: '셋째 칸', hint: '기한', hints: ['11월', '12월', '1월', '2월'], optional: true },
        {
          key: 'body',
          label: '넷째 칸',
          hint: '짧은 설명',
          hints: ['팀마다 다른 양식을 하나로', '분기마다 새로 올림', '세 단계를 두 단계로', '처리 시간을 다시 잼'],
          multiline: true,
          optional: true,
        },
      ],
    },
  },
  points: {
    id: 'points',
    name: '핵심 포인트',
    description: '나란히 놓는 2~4가지',
    variants: [
      { id: 'base', name: '줄' },
      { id: 'columns', name: '세로 칸' },
      { id: 'tiles', name: '타일' },
    ],
    fields: [title('포인트들을 묶는 제목'), lead()],
    items: {
      label: '포인트',
      min: 2,
      max: 4,
      default: 3,
      fields: [
        { key: 'title', label: '이름', hint: '포인트 이름' },
        { key: 'body', label: '설명', hint: '한두 문장 설명', multiline: true },
      ],
    },
  },
  compare: {
    id: 'compare',
    name: '비교',
    description: '두 가지를 줄마다 나란히 (지금과 바뀐 뒤, 위험과 대응)',
    variants: [
      { id: 'base', name: '두 면' },
      { id: 'table', name: '표' },
      { id: 'apart', name: '나란한 두 목록' },
    ],
    fields: [
      title('비교해서 보여줄 결론'),
      { key: 'leftTitle', label: '왼쪽 제목', hint: '지금' },
      { key: 'rightTitle', label: '오른쪽 제목', hint: '바뀐 뒤' },
    ],
    items: {
      label: '비교 줄',
      min: 2,
      max: 5,
      default: 3,
      fields: [
        { key: 'title', label: '왼쪽', hint: '지금의 모습' },
        { key: 'body', label: '오른쪽', hint: '바뀐 뒤의 모습' },
      ],
    },
  },
  matrix: {
    id: 'matrix',
    name: '2×2 우선순위',
    description: '두 기준으로 나눈 네 칸. 무엇부터 할지 보여요',
    highlight: { label: '먼저 할 칸', fallback: 1 },
    fields: [
      title('어느 칸부터 할지 한 문장으로'),
      { key: 'yAxis', label: '세로 기준', hint: '위로 갈수록 (예: 실행하기 쉬움)' },
      { key: 'xAxis', label: '가로 기준', hint: '오른쪽으로 갈수록 (예: 효과가 큼)' },
    ],
    items: {
      label: '칸',
      min: 4,
      max: 4,
      default: 4,
      fields: [
        { key: 'title', label: '칸 이름', hint: '칸 이름', hints: ['왼쪽 위 칸 이름', '오른쪽 위 칸 이름', '왼쪽 아래 칸 이름', '오른쪽 아래 칸 이름'] },
        { key: 'body', label: '내용', hint: '이 칸에 드는 과제', multiline: true },
      ],
    },
  },
  position: {
    id: 'position',
    name: '위치 비교',
    description: '여러 안이나 회사가 두 기준에서 어디쯤인지 점으로 (포지셔닝 맵)',
    highlight: { label: '강조할 점', fallback: 0 },
    fields: [
      title('위치가 말해 주는 결론'),
      { key: 'xAxis', label: '가로 기준', hint: '오른쪽으로 갈수록 (예: 기능이 많음)' },
      { key: 'yAxis', label: '세로 기준', hint: '위로 갈수록 (예: 구축이 빠름)' },
      source,
    ],
    items: {
      label: '점',
      min: 2,
      max: 6,
      default: 4,
      fields: [
        { key: 'title', label: '이름', hint: '안이나 회사 이름', hints: ['우리', 'A사', 'B사', 'C사', 'D사', 'E사'] },
        { key: 'value', label: '가로 점수', hint: '0~10', hints: ['8', '4', '7', '3', '5', '6'] },
        { key: 'meta', label: '세로 점수', hint: '0~10', hints: ['8', '6', '3', '4', '7', '2'] },
        { key: 'body', label: '한 줄', hint: '짧은 설명', optional: true },
      ],
    },
  },
  timeline: {
    id: 'timeline',
    name: '일정',
    description: '단계별 순서와 시기',
    variants: [
      { id: 'base', name: '가로' },
      { id: 'steps', name: '세로' },
    ],
    // 지나온 단계까지 선을 채워서 어디까지 왔는지 보여 준다. 계획만 보여 줄 때는 '없음'
    highlight: { label: '지금 단계', fallback: -1 },
    fields: [title('일정을 요약하는 제목')],
    items: {
      label: '단계',
      min: 2,
      max: 6,
      default: 4,
      fields: [
        { key: 'meta', label: '시기', hint: '시기', hints: ['1개월 차', '2개월 차', '4개월 차', '6개월 차', '9개월 차', '12개월 차'] },
        { key: 'title', label: '단계', hint: '단계 이름', hints: ['준비', '시범 운영', '중간 점검', '확대', '안정화', '마무리'] },
        { key: 'body', label: '설명', hint: '이 단계에서 하는 일', multiline: true, optional: true },
      ],
    },
  },
  case: {
    id: 'case',
    name: '사례',
    description: '비슷한 사례와 그 결과',
    panes: { name: '결과', el: '.cs-side', sides: [3, 4, 5], base: 4 },
    fields: [
      { key: 'client', label: '대상', hint: '부서, 지점 또는 협력사' },
      { key: 'title', label: '결과', hint: '얻은 결과를 한 문장으로', multiline: true },
      { key: 'body', label: '내용', hint: '어떤 과제를 어떻게 해결했는지', multiline: true },
      { key: 'quote', label: '한마디', hint: '담당자나 써 본 사람의 한마디', multiline: true, optional: true },
      { key: 'image', label: '로고 또는 사진', hint: '로고', optional: true, image: true },
    ],
    items: {
      label: '성과 숫자',
      min: 0,
      max: 3,
      default: 2,
      fields: [
        { key: 'value', label: '숫자', hint: '40%', hints: ['40%', '3개월'] },
        { key: 'title', label: '이름', hint: '지표 이름', hints: ['검사 시간 단축', '구축 기간', '처리량'] },
      ],
    },
  },
  pricing: {
    id: 'pricing',
    name: '안 비교',
    description: '두세 가지 안이나 가격을 나란히, 추천안 강조',
    variants: [
      { id: 'base', name: '나란히' },
      { id: 'rows', name: '표' },
    ],
    highlight: { label: '추천 표시', fallback: -1 },
    fields: [title('어느 안을 추천하는지 한 문장으로')],
    items: {
      label: '안',
      min: 1,
      max: 3,
      default: 3,
      fields: [
        { key: 'title', label: '이름', hint: '안 이름', hints: ['A안', 'B안', 'C안'] },
        { key: 'value', label: '비용', hint: '1.2억 원', hints: ['0.6억 원', '1.2억 원', '2.5억 원'] },
        { key: 'meta', label: '조건', hint: '기간, 인력 같은 조건', optional: true },
        { key: 'body', label: '내용', hint: '내용과 장단점을 한 줄에 하나씩', multiline: true },
      ],
    },
  },
  imageText: {
    id: 'imageText',
    name: '이미지와 설명',
    description: '제품 화면이나 사진과 설명',
    panes: { name: '이미지', el: '.ix-img', sides: [5, 6, 7, 8], base: 7, start: true },
    fields: [
      title('이미지가 보여주는 것'),
      { key: 'body', label: '설명', hint: '이미지를 설명하는 두세 문장', multiline: true },
      { key: 'image', label: '이미지', hint: '이미지', image: true },
    ],
  },
  logos: {
    id: 'logos',
    name: '로고 모음',
    description: '협력사, 계열사, 쓰는 서비스의 로고 모음',
    fields: [title('로고들을 묶는 제목'), lead('한 줄 설명')],
    items: {
      label: '로고',
      min: 2,
      max: 12,
      default: 8,
      fields: [
        { key: 'image', label: '로고', hint: '로고', image: true },
        { key: 'title', label: '이름', hint: '회사 이름', optional: true },
      ],
    },
  },
  bars: {
    id: 'bars',
    name: '막대 비교',
    description: '숫자를 막대 길이로 비교',
    variants: [
      { id: 'base', name: '가로 막대' },
      { id: 'columns', name: '세로 막대' },
      { id: 'dots', name: '점과 선' },
    ],
    highlight: { label: '강조할 막대', fallback: 0 },
    // 단위는 막대마다 되풀이하지 않고 위에 한 번만
    fields: [title('비교가 말해 주는 결론'), lead(), { key: 'unit', label: '단위', hint: '억 원', optional: true }, source],
    items: {
      label: '막대',
      min: 2,
      max: 6,
      default: 4,
      fields: [
        { key: 'title', label: '항목', hint: '항목 이름' },
        { key: 'value', label: '숫자', hint: '120', hints: ['96', '104', '131', '117', '88', '120'] },
        { key: 'meta', label: '보충', hint: '보충 설명', optional: true },
      ],
    },
  },
  versus: {
    id: 'versus',
    name: '두 값 비교',
    description: '작년과 올해, 계획과 실적처럼 두 값을 항목마다 나란히',
    variants: [
      { id: 'base', name: '묶은 막대' },
      { id: 'lines', name: '두 선' },
      { id: 'dots', name: '점 두 개' },
    ],
    highlight: { label: '강조할 항목', fallback: -1 },
    fields: [
      title('비교가 말해 주는 결론'),
      lead(),
      { key: 'metaTitle', label: '앞 값 이름', hint: '작년', optional: true, named: true },
      { key: 'valueTitle', label: '뒤 값 이름', hint: '올해', optional: true, named: true },
      { key: 'unit', label: '단위', hint: '억 원', optional: true },
      source,
    ],
    items: {
      label: '항목',
      min: 2,
      max: 8,
      default: 4,
      fields: [
        { key: 'title', label: '항목', hint: '항목 이름', hints: ['1분기', '2분기', '3분기', '4분기', '5월', '6월', '7월', '8월'] },
        { key: 'meta', label: '앞 값', hint: '96', hints: ['96', '104', '118', '121', '110', '115', '120', '125'] },
        { key: 'value', label: '뒤 값', hint: '112', hints: ['112', '109', '131', '138', '126', '130', '141', '150'] },
      ],
    },
  },
  closing: {
    id: 'closing',
    name: '결정 요청',
    description: '결정해 주실 것과 언제까지 필요한지',
    variants: [
      { id: 'base', name: '바탕' },
      { id: 'bold', name: '색 면' },
    ],
    panes: { name: '요청 목록', el: '.cl-steps', sides: [4, 5, 6], base: 5 },
    fields: [
      title('결정해 주실 것'),
      { key: '$presenter', label: '발표자', hint: '발표자 이름', optional: true },
      { key: '$contact', label: '연락처', hint: '이메일이나 내선 번호', optional: true },
    ],
    items: {
      label: '요청',
      min: 0,
      max: 3,
      default: 3,
      fields: [
        { key: 'title', label: '요청', hint: '결정해 주실 일' },
        { key: 'body', label: '설명', hint: '언제까지, 왜 필요한지', optional: true },
      ],
    },
  },
  compose: {
    id: 'compose',
    name: '컴포넌트로 꾸미기',
    description: '컴포넌트를 골라 끌어다 놓으면 알맞은 자리에 들어가요',
    fields: [
      { key: 'title', label: '제목', hint: '이 슬라이드의 결론 한 줄', multiline: true, optional: true },
      lead(),
      source,
    ],
  },
}

/** 색 면을 쓰는 장. 하단 쪽 번호를 넣지 않고, 장마다 바탕을 바꾸지 않는다(색 면이 싫으면 '바탕' 모양을 고른다). */
export const BOLD_LAYOUTS: LayoutId[] = ['cover', 'section', 'closing']

export const LAYOUT_ORDER: LayoutId[] = [
  'compose',
  'summary',
  'statement',
  'points',
  'kpi',
  'scorecard',
  'bridge',
  'trend',
  'progress',
  'share',
  'process',
  'funnel',
  'table',
  'compare',
  'matrix',
  'position',
  'pricing',
  'bars',
  'versus',
  'timeline',
  'imageText',
  'case',
  'logos',
  'agenda',
  'section',
  'cover',
  'closing',
]

/** 쓰임으로 묶은 레이아웃. 장 추가 메뉴와 장 모음 화면에 이 묶음과 순서로 보인다. 모든 레이아웃이 한 번씩 들어간다. */
export const LAYOUT_GROUPS: { name: string; description: string; layouts: LayoutId[] }[] = [
  { name: '자유롭게 꾸미기', description: '컴포넌트를 골라 끌어다 놓아요', layouts: ['compose'] },
  { name: '결론과 메시지', description: '하고 싶은 말을 먼저', layouts: ['summary', 'statement', 'points'] },
  { name: '숫자와 차트', description: '실적, 규모, 변화를 숫자로', layouts: ['kpi', 'scorecard', 'bars', 'versus', 'bridge', 'trend', 'share', 'funnel'] },
  { name: '진행과 계획', description: '언제, 어떤 순서로', layouts: ['progress', 'timeline', 'process'] },
  { name: '비교와 선택', description: '여러 안을 나란히 놓고 고르기', layouts: ['compare', 'matrix', 'position', 'pricing', 'table'] },
  { name: '자료와 사례', description: '화면, 사례, 로고', layouts: ['imageText', 'case', 'logos'] },
  { name: '시작과 끝', description: '표지, 목차, 섹션, 마지막 슬라이드', layouts: ['cover', 'agenda', 'section', 'closing'] },
]

/** 칸의 안내 문구. 항목 하나에 붙은 안내, 슬라이드에 지정된 안내, 레이아웃 기본값 순으로 쓴다. */
export function hintFor(
  layout: LayoutId,
  hints: Record<string, string>,
  key: string,
  itemKey?: ItemKey,
  index?: number,
): string {
  if (itemKey && index !== undefined && hints[`items.${index}.${itemKey}`]) return hints[`items.${index}.${itemKey}`]
  const path = itemKey ? `items.${itemKey}` : key
  if (hints[path]) return hints[path]
  const spec = LAYOUTS[layout]
  // 줄마다 다른 예시는 한 이야기다. 발표 종류의 예시가 있는 장에 레이아웃의 예시를 섞으면 '결과 공유회 · 처리 시간을 다시 잼'처럼
  // 앞뒤가 맞지 않는 줄이 되니, 그때 빈 칸은 칸의 안내만 보인다. 그 이야기에 매인 장의 칸(추이의 목표)도 같다
  const own = Object.keys(hints).some((k) => /^items\.\d+\./.test(k))
  if (itemKey) {
    const f = spec.items?.fields.find((x) => x.key === itemKey)
    return (index !== undefined && !own && f?.hints?.[index]) || f?.hint || ''
  }
  const f = spec.fields.find((x) => x.key === key)
  return (!own && f?.example) || f?.hint || ''
}

/** 줄을 지워도 된다는 안내. 빈 줄에만 맞는다(rowHint) */
export const DROP_ROW = '없으면 이 줄을 지워요'

/**
 * 항목 칸의 안내. 안내가 줄을 지워도 된다는 말(DROP_ROW)뿐인 칸은 빈 줄에만 그 말을 보이고, 줄의 다른 칸을 채웠으면 칸의 보통
 * 안내를 보인다: 결정 요청의 셋째 줄은 제목을 채워도 설명 칸에 '없으면 이 줄을 지워요'가 남아 '썼는데 지우라는 건가'로 읽혔다.
 * 칸 자신의 안내 끝에 붙은 말('도움이 필요한 것 (없으면 이 줄을 지워요)')은 그 칸을 채우면 안내째로 사라지니 그대로 둔다
 */
export function rowHint(layout: LayoutId, hints: Record<string, string>, item: Item | undefined, key: ItemKey, index: number): string {
  const hint = hintFor(layout, hints, key, key, index)
  if (hint !== DROP_ROW || !item || !(['title', 'body', 'value', 'meta', 'image'] as const).some((k) => k !== key && item[k]?.trim())) return hint
  return hintFor(layout, hints, key, key)
}

/**
 * 칸의 이름(스크린 리더가 읽는 이름). 안내 문구는 예시라서 채운 칸의 이름이 되면 틀린 말을 읽는다.
 * 항목 칸은 '숫자 2 이름'처럼 몇째 항목인지까지. 정의에 없는 칸(표지의 소속 같은 덱 값)은 빈 글
 */
export function labelFor(layout: LayoutId, key: string, itemKey?: ItemKey, index?: number): string {
  return labelIn(LAYOUTS[layout], key, itemKey, index)
}

/** labelFor를 칸 정의로: 부품 장만의 부품은 레이아웃이 아니라 부품 정의(BLOCKS)에 칸 이름이 있다 */
export function labelIn(spec: Pick<LayoutSpec, 'fields' | 'items'>, key: string, itemKey?: ItemKey, index?: number): string {
  if (itemKey) {
    const field = spec.items?.fields.find((x) => x.key === itemKey)?.label
    const item = spec.items?.label
    const head = item && (index !== undefined ? `${item} ${index + 1}` : item)
    // 항목 이름과 칸 이름이 같으면 한 번만: '숫자 1 숫자'가 아니라 '숫자 1'
    return [head, field !== item && field].filter(Boolean).join(' ')
  }
  return spec.fields.find((f) => f.key === key)?.label ?? ''
}

/** 이 레이아웃의 모양 id들. 한 가지뿐이면 ['base'] */
export function variantIds(layout: LayoutId): string[] {
  return LAYOUTS[layout].variants?.map((v) => v.id) ?? ['base']
}

/** 이 장의 모양. 레이아웃에 없는 값이면 첫째 모양 */
export function variantOf(slide: { layout: LayoutId; variant?: string }): string {
  const variants = LAYOUTS[slide.layout].variants
  if (!variants?.length) return 'base'
  return variants.some((v) => v.id === slide.variant) ? slide.variant! : variants[0].id
}

/** 강조할 항목. 고르지 않았으면 레이아웃의 기본값, 강조가 없는 레이아웃이면 -1 */
/** 이 장에서 옆 판을 옮기거나 너비를 고를 수 있으면 그 정의 (모양에 따라 없을 수 있다) */
export function panesOf(slide: Pick<Slide, 'layout' | 'variant'>): NonNullable<LayoutSpec['panes']> | null {
  const p = LAYOUTS[slide.layout].panes
  if (!p || (p.variants && !p.variants.includes(variantOf(slide)))) return null
  return p
}

/** 제목 덩어리의 자리. 옮길 수 없는 레이아웃이면 null, 고른 적이 없으면 레이아웃 기본 */
export function placeOf(slide: Pick<Slide, 'layout' | 'options'>): Place | null {
  const p = LAYOUTS[slide.layout].place
  if (!p) return null
  const v = slide.options.place
  return v === 'top' || v === 'middle' || v === 'bottom' ? v : p.base
}

/** 옆 판의 너비 (칸 수). 고른 너비가 이 레이아웃에서 고를 수 없는 값이면 기본 너비 */
export function sideOf(slide: Pick<Slide, 'layout' | 'variant' | 'options'>): number | null {
  const p = panesOf(slide)
  if (!p) return null
  const n = slide.options.pane
  return n !== undefined && p.sides.includes(n) ? n : p.base
}

export function highlightOf(slide: Pick<Slide, 'layout' | 'options' | 'items'>): number {
  const spec = LAYOUTS[slide.layout]
  if (!spec.highlight) return -1
  if (slide.options.highlight !== undefined) return slide.options.highlight
  // 추이의 마지막 점처럼 '지금'을 강조하는 장은 항목 수가 바뀌어도 늘 마지막을 따라간다
  if (spec.highlight.fallback === 'last') return Math.min(slide.items.length, spec.items?.max ?? 0) - 1
  return spec.highlight.fallback
}

/**
 * 로고 모음의 한 줄에 놓는 로고 수: 다섯까지는 한 줄에 모두, 그보다 많으면 두 줄로 나눠 윗줄에 하나 더 (7개는 4·3, 9개는 5·4).
 * 한 줄에 넷을 두던 때는 5개가 4·1로, 10개가 6·4로 마지막 줄이 비어 보였다. 덜 찬 마지막 줄은 가운데에 둔다(layouts.tsx)
 */
export function logoColumns(n: number): number {
  return n <= 5 ? Math.max(2, n) : Math.ceil(n / 2)
}

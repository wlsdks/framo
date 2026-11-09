// 발표 종류: 사업 제안 (business)

import { agenda, cover, decision, each, options, risks, section, summary, type Blueprint } from './recipes'

export const business: Blueprint = {
  type: 'business',
  name: '사업 제안',
  description: '새 사업이나 프로젝트를 승인받아요',
  storyline: ['배경', '제안', '효과', '결정 요청'],
  showcase: ['기회의 크기', '바뀌는 모습', '매출 전망', '결정 요청'],
  defaultTitle: '사업 제안',
  // 프레임 잡기에서 먼저 골라 둘 값: 승인을 내리는 본부장·임원 앞에서 근거까지 말할 시간
  defaults: { audience: 'exec', minutes: 20 },
  examples: { title: '중소 제조사 대상 구독형 품질 관리 사업 제안', ask: '시범 사업 예산 1.2억 원 승인' },
  recipes: [
    cover,
    summary(
      '한 줄 결론 (예: 구독형 서비스로 3년 안에 매출 30억 원)',
      ['배경', '제안', '기대 효과', '요청 사항'],
      ['왜 지금 이 사업을 해야 하는지', '무엇을 어떻게 하자는 건지', '얻는 것 (매출, 비용을 숫자로)', '결정해 주실 것 (예산, 인력)'],
    ),
    agenda,
    section('배경', '왜 지금 이 사업을 해야 하는지'),
    {
      layout: 'statement',
      purpose: '추진 배경',
      priority: 1,
      section: '배경',
      guide: '"왜 지금?"에 한 문장으로 답해요.',
      hints: { title: '지금 이 사업을 해야 하는 이유를 한 문장으로', lead: '그렇게 보는 근거 (시장 변화, 고객 요구, 경쟁사 움직임)' },
    },
    {
      // 기회의 크기는 숫자 셋을 나란히 두기보다 전체 시장 안에 노릴 시장과 우리 목표를 겹쳐 보이는 쪽이 한눈에 읽힌다
      layout: 'compose',
      purpose: '기회의 크기',
      priority: 2,
      focus: 'numbers',
      section: '배경',
      guide: '전체 시장에서 노릴 시장, 우리 목표까지 좁혀 가며 출처와 함께 적어요.',
      hints: { title: '노릴 시장만 600억 원이에요' },
      blocks: [
        {
          type: 'market',
          hints: {
            ...each({
              title: ['국내 품질 관리 시장', '중소 제조사 시장', '3년 안 목표'],
              value: ['1,200억 원', '600억 원', '12억 원'],
              body: ['해마다 18%씩 커요', '대상 기업 3,400곳', '3년 차 한 해 매출'],
            }),
          },
        },
      ],
    },
    {
      layout: 'share',
      purpose: '시장 구성',
      priority: 3,
      focus: 'numbers',
      section: '배경',
      guide: '노릴 부분 하나를 강조해요. 비중은 자동으로 계산돼요.',
      hints: {
        title: '중소 제조가 시장의 절반이에요',
        unit: '억 원',
        ...each({ title: ['중소 제조', '대기업', '공공', '기타'], value: ['600', '360', '160', '80'] }),
      },
    },
    section('제안', '무엇을 어떻게 할지'),
    {
      layout: 'points',
      purpose: '제안 내용',
      priority: 1,
      section: '제안',
      guide: '세 가지 이내로, 하지 않을 일도 적어요.',
      hints: {
        title: '무엇을 하자는 건지 한 문장으로',
        'items.title': '할 일',
        'items.body': '어떻게, 누가 하는지',
        ...each({
          title: ['구독형 서비스 출시', '대리점 판매 연계', '하지 않을 일'],
          body: ['어떻게, 누가 하는지', '어떻게, 누가 하는지', '이번에는 하지 않는 것 (예: 대기업 고객)'],
        }),
      },
    },
    {
      layout: 'compose',
      purpose: '바뀌는 모습',
      priority: 2,
      section: '제안',
      guide: '지금과 추진 후를 줄마다 짝지어요.',
      hints: { title: '추진하면 이렇게 달라져요' },
      blocks: [
        {
          type: 'wipe',
          fields: { from: '지금', to: '추진 후' },
          hints: {
            'items.title': '지금의 모습',
            'items.body': '추진 후의 모습',
            ...each({
              title: ['한 번 팔고 끝나요', '고객이 문제를 겪어야 연락이 와요', '해마다 매출이 들쭉날쭉해요'],
              body: ['다달이 구독료를 받아요', '먼저 이상을 알려 줘요', '매달 매출이 쌓여요'],
            }),
          },
        },
      ],
    },
    options('추진 방안 비교', 2, '제안', {
      title: '세 가지 방안 중 B안을 추천해요',
      'items.body': '할 일과 장단점을 한 줄에 하나씩',
      ...each({ value: ['0.6억 원', '1.2억 원', '2.5억 원'], meta: ['3개월, 2명', '6개월, 3명', '12개월, 6명'] }),
    }),
    section('효과와 비용', '얼마를 들여 무엇을 얻는지'),
    {
      layout: 'kpi',
      purpose: '기대 효과',
      priority: 1,
      section: '효과와 비용',
      guide: '얻는 것을 숫자로, 계산 근거와 함께 적어요.',
      hints: {
        title: '추진하면 얻는 것',
        'items.body': '계산 근거',
        ...each({ value: ['30억 원', '120곳', '2년'], title: ['3년 누적 매출', '구독 고객 수', '투자 회수 기간'] }),
      },
    },
    {
      layout: 'bars',
      purpose: '매출 전망',
      priority: 3,
      focus: 'numbers',
      section: '효과와 비용',
      guide: '해마다 얼마를 버는지 보이면 회수 시점이 보여요.',
      hints: { title: '3년 차에 매출 12억 원', unit: '억 원', ...each({ title: ['1년 차', '2년 차', '3년 차'], value: ['4', '7', '12'] }) },
      items: 3,
    },
    {
      layout: 'kpi',
      purpose: '필요한 자원',
      priority: 2,
      section: '효과와 비용',
      guide: '예산, 인력, 기간을 숨기지 말고 먼저 보여요.',
      hints: {
        title: '필요한 예산과 인력',
        ...each({ value: ['1.2억 원', '3명', '6개월'], body: ['어디에 쓰는지', '어느 팀에서 몇 명이 맡는지', '언제부터 언제까지'] }),
      },
      prefill: [{ title: '예산' }, { title: '인력' }, { title: '기간' }],
    },
    section('실행 계획', '언제, 어떻게 진행할지'),
    {
      layout: 'timeline',
      purpose: '추진 일정',
      priority: 2,
      focus: 'detail',
      section: '실행 계획',
      guide: '중간 점검 시점을 넣어 두면 안심해요.',
      hints: {
        title: '6개월 안에 시범 운영까지',
        ...each({ meta: ['1개월 차', '2개월 차', '4개월 차', '6개월 차'], title: ['준비', '시범 운영', '중간 점검', '확대 결정'] }),
      },
    },
    risks(2, '실행 계획'),
    decision(['결정해 주실 일 (예: 시범 사업 예산 1.2억 원 승인)', '함께 정해 주실 일 (예: 전담 인력 3명)', '그 밖의 요청']),
  ],
}

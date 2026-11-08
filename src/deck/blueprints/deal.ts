// 발표 종류: 고객 제안 계획 (deal)

import { agenda, ALL_BUT_EXEC, cover, decision, each, options, risks, section, summary, type Blueprint } from './recipes'

export const deal: Blueprint = {
  type: 'deal',
  name: '고객 제안 계획',
  description: '고객에게 낼 제안과 가격을 승인받아요',
  storyline: ['사업 기회', '제안 전략', '가격', '결정 요청'],
  showcase: ['사업 규모', '제안 내용', '가격 안', '결정 요청'],
  defaultTitle: '고객 제안 계획',
  // 프레임 잡기에서 먼저 골라 둘 값: 가격과 조건을 승인하는 윗분께 짧게
  defaults: { audience: 'exec', minutes: 10 },
  examples: { title: '한빛제조 품질 관리 시스템 제안 계획', ask: '제안 가격 4.8억 원 승인' },
  recipes: [
    cover,
    summary(
      '한 줄 결론 (예: 4.8억 원에 제안하면 이익률 22%로 수주할 수 있어요)',
      ['사업 기회', '제안 내용', '예상 매출', '요청 사항'],
      ['어느 고객의 어떤 사업인지', '무엇을 얼마에 제안할지', '매출과 이익률', '결정해 주실 것 (가격, 인력)'],
    ),
    agenda,
    section('사업 기회', '어떤 고객의 어떤 사업인지'),
    {
      layout: 'statement',
      purpose: '사업 기회',
      priority: 1,
      section: '사업 기회',
      guide: '고객이 지금 하려는 일을 한 문장으로 적어요.',
      hints: { title: '고객이 지금 하려는 일을 한 문장으로 (예: 한빛제조가 품질 관리 시스템 교체를 검토 중)', lead: '언제, 누가 결정하는지' },
    },
    {
      layout: 'kpi',
      purpose: '사업 규모',
      priority: 1,
      section: '사업 기회',
      guide: '얼마짜리 사업인지, 이익률과 함께 적어요.',
      hints: {
        title: '숫자로 보는 사업 규모',
        'items.body': '계산 기준',
        ...each({ value: ['4.8억 원', '3년', '22%'], body: ['첫해 구축비 기준', '유지보수 포함 금액', '본부 평균과 비교'] }),
      },
      prefill: [{ title: '예상 매출' }, { title: '계약 기간' }, { title: '예상 이익률' }],
    },
    {
      layout: 'compare',
      purpose: '경쟁 상황',
      priority: 2,
      focus: 'context',
      section: '사업 기회',
      guide: '앞서는 점과 밀리는 점을 솔직하게 적어요.',
      fields: { leftTitle: '경쟁사', rightTitle: '우리' },
      hints: {
        title: '경쟁사보다 앞서는 점',
        'items.title': '경쟁사의 강점이나 조건',
        'items.body': '우리의 강점이나 대응',
        ...each({
          title: ['가격이 더 낮아요', '구축에 6개월 걸려요', '고객과 오래 거래했어요'],
          body: ['원인 분석까지 들어 있어요', '3개월, 라인을 세우지 않아요', '같은 업종 사례가 2곳 있어요'],
        }),
      },
    },
    section('제안 전략', '무엇을 어떻게 제안할지'),
    {
      layout: 'points',
      purpose: '제안 내용',
      priority: 1,
      section: '제안 전략',
      guide: '고객이 얻는 것을 세 가지 이내로 적어요.',
      hints: {
        title: '고객에게 제안할 내용',
        'items.title': '제안 항목',
        'items.body': '고객이 얻는 것',
        ...each({ title: ['AI 외관 검사', '불량 원인 분석', '3개 라인부터'] }),
      },
    },
    options('가격 안', 1, '제안 전략', {
      title: '추천 가격은 B안 4.8억 원이에요',
      'items.body': '포함 범위와 조건을 한 줄에 하나씩',
      ...each({ value: ['3.9억 원', '4.8억 원', '6.5억 원'], meta: ['이익률 9%', '이익률 22%', '이익률 25%'] }),
    }),
    {
      layout: 'imageText',
      purpose: '제안할 솔루션',
      priority: 3,
      audience: ALL_BUT_EXEC,
      focus: 'detail',
      section: '제안 전략',
      guide: '고객에게 보여 줄 화면이나 구성도를 넣어요.',
      hints: { title: '고객에게 보여줄 화면', body: '이 화면으로 고객이 무엇을 할 수 있는지' },
    },
    { layout: 'case', purpose: '비슷한 수주 사례', priority: 3, section: '제안 전략', guide: '비슷한 고객에게 수주한 사례가 있으면 넣어요.' },
    section('실행 계획', '수주까지 무엇을 할지'),
    {
      layout: 'timeline',
      purpose: '수주 일정',
      priority: 2,
      focus: 'detail',
      section: '실행 계획',
      guide: '고객이 결정하는 날을 꼭 넣어요.',
      hints: {
        title: '12월 계약이 목표예요',
        ...each({ meta: ['11월 1주', '11월 3주', '12월 1주', '12월 3주'], title: ['제안서 제출', '현장 시연', '가격 협상', '계약'] }),
      },
    },
    risks(2, '실행 계획', {
      title: ['경쟁사가 가격을 더 낮출 수 있어요', '고객 결정이 늦어질 수 있어요', '구축 인력이 모자랄 수 있어요'],
      body: ['협상 때 쓸 조건을 미리 정해 둬요', '단계를 나눠 먼저 계약해요', '다른 팀 지원을 미리 받아 둬요'],
    }),
    decision(['결정해 주실 일 (예: 제안 가격 4.8억 원 승인)', '함께 정해 주실 일 (예: 구축 인력 2명 지원)', '그 밖의 요청 (예: 협상에 쓸 할인 폭)']),
  ],
}

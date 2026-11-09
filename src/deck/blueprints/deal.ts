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
      // 앞서는 점과 밀리는 점은 두 단의 글보다 기준마다 표시로 견주면 어디서 이기고 지는지 한눈에 보인다
      layout: 'compose',
      purpose: '경쟁 상황',
      priority: 2,
      focus: 'context',
      section: '사업 기회',
      guide: '기준마다 앞서는지 밀리는지 솔직하게 표시해요.',
      hints: { title: '값은 밀려도 기간과 기능에서 앞서요' },
      blocks: [
        {
          type: 'rating',
          fields: { opts: '경쟁사 우리' },
          hints: {
            ...each({
              title: ['가격', '기능', '구축 기간', '거래 경험'],
              body: ['좋음 보통', '보통 좋음', '나쁨 좋음', '좋음 보통'],
              meta: ['경쟁사가 10% 낮아요', '우리만 원인 분석까지', '6개월과 3개월', '오래 거래한 곳과 같은 업종 사례 2곳'],
            }),
          },
        },
      ],
    },
    section('제안 전략', '무엇을 어떻게 제안할지'),
    {
      // 무엇을 파는지보다 고객이 무엇이 달라지는지가 제안의 말이라, 고객의 지금이 제안 뒤의 모습으로 넘어가는 장면으로 보인다
      layout: 'compose',
      purpose: '제안 내용',
      priority: 1,
      section: '제안 전략',
      guide: '고객이 지금 겪는 것과 제안으로 달라지는 것을 세 줄 이내로 짝지어요.',
      hints: { title: '고객에게 이렇게 달라지는 것을 제안해요' },
      blocks: [
        {
          type: 'wipe',
          fields: { from: '고객의 지금', to: '제안하면' },
          hints: {
            'items.title': '고객이 지금 겪는 것',
            'items.body': '제안으로 달라지는 것',
            ...each({
              title: ['사람이 눈으로 일부만 검사해요', '불량이 난 이유를 몰라요', '바꾸려면 라인을 세워야 해요'],
              body: ['AI가 모든 제품을 검사해요', '라인마다 원인을 짚어 줘요', '3개 라인부터 세우지 않고 바꿔요'],
            }),
          },
        },
      ],
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

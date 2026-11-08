// 발표 종류: 검토 보고 (decide)

import { cover, decision, each, options, risks, summary, type Blueprint } from './recipes'

/** 검토 보고: 여러 안을 같은 기준으로 따져 보고 하나를 골라 결정받는다 (도구 도입, 업체 선정, 구매) */
export const decide: Blueprint = {
  type: 'decide',
  name: '검토 보고',
  description: '여러 안을 비교해 하나를 결정받아요',
  storyline: ['배경', '안 비교', '평가', '결정'],
  showcase: ['지금의 불편', '안 비교', '기준별 평가', '결정 요청'],
  defaultTitle: '검토 보고',
  // 프레임 잡기에서 먼저 골라 둘 값: 안을 고르는 윗분께 비교만 짧게
  defaults: { audience: 'exec', minutes: 10 },
  examples: { title: '협업 도구 도입 검토', ask: '협업 도구 B안 도입 승인' },
  recipes: [
    cover,
    summary(
      '한 줄 결론 (예: 세 안 중 B안이 비용 대비 효과가 가장 커요)',
      ['배경', '검토한 안', '추천안', '요청 사항'],
      ['왜 검토하게 됐는지', '어떤 안을 어떤 기준으로 봤는지', '추천하는 안과 그 이유', '결정해 주실 것 (예산, 시기)'],
    ),
    {
      layout: 'statement',
      purpose: '검토 배경',
      priority: 1,
      focus: 'context',
      guide: '왜 검토하게 됐는지 한 문장으로 적어요.',
      hints: { title: '검토하게 된 이유를 한 문장으로', lead: '지금 무엇이 불편하거나 모자란지' },
    },
    {
      layout: 'kpi',
      purpose: '지금의 불편',
      priority: 3,
      focus: 'numbers',
      guide: '지금 드는 시간이나 비용을 숫자로 보여요.',
      hints: {
        title: '자료 찾는 데만 하루 1.5시간을 써요',
        'items.body': '어떻게 잰 숫자인지',
        ...each({ value: ['1.5시간', '4가지', '3,600만 원'], title: ['하루에 자료 찾는 시간', '따로 쓰는 도구', '한 해 도구 비용'] }),
      },
    },
    {
      layout: 'points',
      purpose: '검토 기준',
      priority: 2,
      focus: 'detail',
      guide: '안을 견줄 기준을 먼저 맞춰요.',
      hints: {
        title: '세 가지 기준으로 견줬어요',
        'items.title': '기준',
        'items.body': '무엇을 어떻게 봤는지',
        ...each({ title: ['비용', '쓰기 쉬움', '보안'], body: ['3년 동안 드는 돈', '익히는 데 걸리는 시간', '사내 보안 기준을 지키는지'] }),
      },
    },
    options('안 비교', 1, undefined, {
      title: '세 가지 안 중 B안을 추천해요',
      'items.body': '내용과 장단점을 한 줄에 하나씩',
      ...each({ value: ['연 1,800만 원', '연 2,400만 원', '연 4,000만 원'], meta: ['지금 도구 그대로', '새 도구 도입', '직접 만들기'] }),
    }),
    {
      layout: 'table',
      purpose: '기준별 평가',
      priority: 2,
      focus: 'detail',
      guide: '기준마다 안을 한 줄로 견줘요.',
      fields: { h1: '기준', h2: 'A안', h3: 'B안', h4: 'C안' },
      hints: {
        title: 'B안이 세 기준에서 고르게 좋아요',
        ...each({
          title: ['비용', '쓰기 쉬움', '보안', '도입 기간'],
          meta: ['가장 낮아요', '지금과 같아요', '기준에 맞아요', '바로'],
          value: ['중간이에요', '쉬워요', '기준에 맞아요', '1개월'],
          body: ['가장 높아요', '익히기 어려워요', '가장 좋아요', '6개월'],
        }),
      },
    },
    {
      layout: 'timeline',
      purpose: '도입 일정',
      priority: 3,
      focus: 'detail',
      guide: '결정 뒤 언제 무엇을 하는지 보여요.',
      hints: {
        title: '석 달 안에 모두 옮겨요',
        ...each({ meta: ['12월', '1월', '2월', '3월'], title: ['계약', '한 팀 시범', '모두 옮기기', '예전 도구 끝내기'] }),
      },
    },
    risks(3, undefined, {
      title: ['옮기는 동안 일이 밀릴 수 있어요', '익숙해지는 데 시간이 걸려요', '비용이 오를 수 있어요'],
      body: ['한 팀부터 옮겨요', '첫 달에 교육을 두 번 해요', '3년 가격을 계약에 넣어요'],
    }),
    decision(['결정해 주실 일 (예: B안 도입 승인)', '함께 정해 주실 일 (예: 도입 시기 1월)', '그 밖의 요청']),
  ],
}

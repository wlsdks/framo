// 발표 종류: 개선 제안 (improve)

import { cover, decision, each, options, priorities, risks, section, summary, type Blueprint } from './recipes'

export const improve: Blueprint = {
  type: 'improve',
  name: '개선 제안',
  description: '일하는 방식이나 제도, 도구를 바꾸자고 해요',
  storyline: ['문제', '원인', '개선안', '효과'],
  showcase: ['문제의 크기', '원인', '바뀌는 모습', '기대 효과'],
  defaultTitle: '개선 제안',
  // 프레임 잡기에서 먼저 골라 둘 값: 바꿀 일을 맡은 팀장께 짧게
  defaults: { audience: 'practitioner', minutes: 10 },
  examples: { title: '구매 요청 처리 방식 개선 제안', ask: '한 팀 시범 운영 승인' },
  recipes: [
    cover,
    summary(
      '한 줄 결론 (예: 구매 요청 양식을 하나로 맞추면 처리 시간이 40% 줄어요)',
      ['지금의 문제', '개선안', '기대 효과', '요청 사항'],
      ['누가, 무엇 때문에 힘든지', '무엇을 어떻게 바꾸자는 건지', '바꾸면 얻는 것 (시간, 비용을 숫자로)', '결정해 주실 것'],
    ),
    section('문제', '지금 무엇이 문제인지'),
    {
      layout: 'statement',
      purpose: '지금의 문제',
      priority: 1,
      section: '문제',
      guide: '겪는 사람이 "맞아"라고 할 만큼 구체적으로 적어요.',
      hints: { title: '지금 가장 큰 문제를 한 문장으로 (예: 팀마다 구매 요청 양식이 달라 매번 다시 맞춰요)', lead: '누가, 얼마나 자주 겪는지 (예: 구매 담당 다섯 명이 하루 열 건 넘게 겪어요)' },
    },
    {
      layout: 'bars',
      purpose: '문제의 크기',
      priority: 2,
      focus: 'numbers',
      section: '문제',
      items: 3,
      guide: '문제 때문에 드는 시간이나 비용을 막대로 보여요.',
      hints: {
        title: '구매 요청 한 건에 평균 6시간이 들어요',
        'items.title': '항목',
        unit: '시간',
        ...each({ title: ['자료 찾기', '업체 비교', '검토와 승인'], value: ['2.5', '2', '1.5'] }),
      },
    },
    {
      // 원인은 글 목록보다 '왜?'를 거듭해 내려가는 그림이 개선안의 근거를 보인다. 짧은 보고에서는 숫자(문제의 크기)가 먼저 남는다
      layout: 'compose',
      purpose: '원인',
      priority: 3,
      focus: 'context',
      section: '문제',
      guide: '왜를 거듭해 근본 원인까지 내려가면 개선안이 왜 맞는지 보여요.',
      hints: { title: '문제의 뿌리는 양식을 맡은 곳이 없는 것이에요' },
      blocks: [
        {
          type: 'whys',
          hints: {
            problem: '구매 요청 한 건에 평균 6시간이 들어요',
            ...each({
              title: ['팀마다 양식이 달라 다시 맞춰요', '업체 목록이 흩어져 메일로 물어요', '양식과 목록을 맡아 고치는 곳이 없어요'],
              meta: ['양식 7가지', '목록 4곳', '최근 3년 맡은 곳 없음'],
            }),
          },
        },
      ],
    },
    section('개선안', '어떻게 바꿀지'),
    priorities('개선안'),
    {
      layout: 'compose',
      purpose: '바뀌는 모습',
      priority: 1,
      section: '개선안',
      guide: '지금 방식과 바뀐 방식을 줄마다 짝지어요.',
      hints: { title: '이렇게 바꾸자고 제안해요' },
      blocks: [
        {
          type: 'wipe',
          fields: { from: '지금', to: '개선 후' },
          hints: {
            'items.title': '지금의 방식',
            'items.body': '바뀐 방식',
            ...each({
              title: ['팀마다 다른 양식으로 써요', '업체를 메일로 물어봐요', '승인에 사흘 걸려요'],
              body: ['한 가지 양식으로 써요', '업체 목록에서 바로 찾아요', '하루 안에 승인해요'],
            }),
          },
        },
      ],
    },
    {
      layout: 'process',
      purpose: '바뀌는 절차',
      priority: 2,
      focus: 'detail',
      section: '개선안',
      guide: '가장 크게 바뀌는 단계 하나를 강조해요.',
      options: { highlight: 2 },
      hints: { title: '요청에서 처리까지 네 단계, 이틀이면 돼요', lead: '지금은 같은 일에 닷새가 걸려요' },
    },
    options('방안 비교', 3, '개선안', {
      title: '세 가지 방안 중 B안을 추천해요',
      'items.body': '할 일과 장단점을 한 줄에 하나씩',
      ...each({ value: ['500만 원', '2,000만 원', '6,000만 원'], meta: ['1개월', '3개월', '6개월'] }),
    }),
    {
      // 아끼는 시간은 셈을 보여야 믿는다: 큰 숫자 하나보다 '한 건에 줄어드는 시간 × 한 해 요청 = 한 해에 아끼는 시간'
      layout: 'compose',
      purpose: '기대 효과',
      priority: 1,
      section: '개선안',
      guide: '얻는 것을 셈으로 보이면 숫자를 믿어요.',
      hints: { title: '한 해 1,200시간, 4,800만 원어치 일손을 아껴요' },
      blocks: [
        {
          type: 'calc',
          items: 3,
          hints: {
            label: '한 해에 아끼는 일손',
            result: '4,800만 원',
            note: '요청 수는 지난해, 인건비는 평균 기준',
            ...each({ value: ['2.4시간', '500건', '4만 원'], title: ['한 건에 줄어드는 시간', '한 해 구매 요청', '한 시간 인건비'] }),
          },
        },
      ],
    },
    section('실행', '언제, 어떻게 바꿀지'),
    {
      layout: 'timeline',
      purpose: '실행 계획',
      priority: 2,
      section: '실행',
      guide: '작게 시작해서 넓히면 결정하기 쉬워요.',
      hints: {
        title: '한 팀에서 먼저 시작해요',
        ...each({ meta: ['1개월 차', '2개월 차', '3개월 차', '4개월 차'], title: ['한 팀 시범', '결과 점검', '본부 확대', '모든 팀 적용'] }),
      },
    },
    {
      layout: 'table',
      purpose: '할 일과 담당',
      priority: 3,
      focus: 'detail',
      section: '실행',
      guide: '누가 언제까지 무엇을 하는지 표로 정리해요.',
      fields: { h1: '과제', h2: '담당', h3: '기한', h4: '비고' },
      hints: { title: '네 가지를 2월까지 끝내요' },
    },
    risks(3, '실행', {
      title: ['새 방식이 익숙하지 않을 수 있어요', '바꾸는 동안 일이 밀릴 수 있어요', '효과가 예상보다 작을 수 있어요'],
      body: ['한 팀에서 먼저 써 보고 고쳐요', '바쁜 달을 피해 시작해요', '한 달 뒤 숫자로 점검해요'],
    }),
    decision(['결정해 주실 일 (예: 한 팀 시범 운영 승인)', '함께 정해 주실 일 (예: 시범 기간 2개월)', '그 밖의 요청']),
  ],
}

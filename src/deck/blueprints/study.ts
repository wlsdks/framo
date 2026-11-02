// 발표 종류: 지식 공유·교육 (study)

import { agenda, closing, each, plainCover, type Blueprint } from './recipes'

/** 지식 공유·교육: 사내 세미나, 배운 것 나누기, 새 도구나 방법 익히기. 결정이 아니라 기억할 것으로 끝난다 */
export const study: Blueprint = {
  type: 'study',
  name: '지식 공유·교육',
  description: '배운 것과 일하는 요령을 나눠요',
  storyline: ['핵심', '전과 후', '방법', '정리'],
  showcase: ['핵심 내용', '전과 후', '따라 하는 순서', '정리'],
  defaultTitle: '지식 공유',
  // 마법사에서 먼저 골라 둘 값: 동료와 나누는 자리라 질문까지 넉넉히
  defaults: { audience: 'peers', minutes: 30 },
  examples: { title: '경비 정산, 이렇게 하면 빨라요', lead: '재무팀 사내 세미나' },
  recipes: [
    plainCover,
    {
      layout: 'statement',
      purpose: '오늘의 한 줄',
      priority: 1,
      guide: '오늘 꼭 가져갈 한 가지를 먼저 말해요.',
      hints: { title: '오늘 꼭 전하고 싶은 한 가지를 한 문장으로', lead: '누구에게, 왜 도움이 되는지' },
    },
    { ...agenda, fields: { title: '오늘 다룰 것' } },
    {
      layout: 'points',
      purpose: '핵심 내용',
      priority: 1,
      guide: '세 가지 이내로, 한두 문장씩 적어요.',
      hints: {
        title: '세 가지만 기억하면 돼요',
        'items.title': '핵심',
        'items.body': '한두 문장 설명',
        ...each({ title: ['영수증은 사진으로', '계정은 고르기만', '결재는 한 번에'] }),
      },
    },
    {
      layout: 'compare',
      purpose: '전과 후',
      priority: 2,
      guide: '예전 방식과 새 방식을 줄마다 나란히 놓아요.',
      fields: { leftTitle: '예전에는', rightTitle: '이렇게 하면' },
      hints: {
        title: '이렇게 달라져요',
        'items.title': '예전 방식',
        'items.body': '새 방식',
        ...each({
          title: ['영수증을 종이에 붙여요', '합계를 손으로 맞춰요', '양식이 사람마다 달라요'],
          body: ['사진으로 찍어 올려요', '합계가 자동으로 맞아요', '한 양식으로 올려요'],
        }),
      },
    },
    {
      layout: 'process',
      purpose: '따라 하는 순서',
      priority: 1,
      guide: '처음 하는 사람이 따라 할 수 있게 단계로 적어요.',
      hints: {
        title: '네 단계면 정산이 끝나요',
        ...each({
          title: ['영수증 찍기', '계정 고르기', '쓴 곳 적기', '올리기'],
          meta: ['1분', '3분', '1분', '1분'],
          body: ['영수증을 휴대폰으로 찍어요', '목록에서 쓴 계정을 골라요', '누구와 왜 썼는지 적어요', '한 번에 결재를 올려요'],
        }),
      },
    },
    {
      layout: 'imageText',
      purpose: '화면으로 보기',
      priority: 2,
      focus: 'detail',
      guide: '실제 화면을 넣고 어디를 보면 되는지 적어요.',
      hints: { title: '이 화면에서 시작해요', body: '어디를 누르고 무엇을 보면 되는지' },
    },
    {
      layout: 'case',
      purpose: '해 본 사례',
      priority: 3,
      guide: '먼저 써 본 팀의 결과가 있으면 넣어요.',
      hints: { client: '먼저 써 본 팀 (예: 인사팀)', title: '해 보니 얻은 것을 한 문장으로' },
    },
    closing(
      '정리',
      '오늘 기억할 것',
      1,
      '오늘 기억할 것을 세 줄로 정리해요.',
      ['기억할 것 (예: 영수증은 사진으로 올려요)', '기억할 것 (예: 양식은 하나만 써요)', '더 알고 싶을 때 (예: 재무팀)'],
      ['한 줄 설명', '한 줄 설명', '없으면 이 줄을 지워요'],
    ),
  ],
}

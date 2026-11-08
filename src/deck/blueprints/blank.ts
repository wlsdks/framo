// 발표 종류: 빈 발표 (blank)

import { closing, cover, type Blueprint } from './recipes'

export const blank: Blueprint = {
  type: 'blank',
  name: '빈 발표',
  description: '처음부터 직접 구성해요',
  storyline: [],
  defaultTitle: '새 발표',
  defaults: { audience: 'mixed', minutes: 20 },
  examples: { title: '하반기 팀 운영 계획 보고', ask: '하반기 교육 예산 승인' },
  recipes: [
    cover,
    { layout: 'statement', purpose: '메시지', priority: 1, guide: '가장 전하고 싶은 말을 적어요.' },
    { layout: 'points', purpose: '포인트', priority: 1, guide: '나란히 보여 줄 내용을 적어요.' },
    closing('결정 요청', '결정해 주실 것', 1, '받을 결정을 적어요. 없으면 이 슬라이드는 지워도 돼요.', ['결정해 주실 일', '함께 정해 주실 일', '그 밖의 요청']),
  ],
}

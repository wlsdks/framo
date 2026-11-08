// 발표 종류: 문제·장애 보고 (issue)

import { closing, cover, each, summary, type Blueprint } from './recipes'

/** 문제·장애 보고: 무슨 일이 있었는지, 영향, 원인, 한 일과 할 일. 결론(지금 상태)부터 */
export const issue: Blueprint = {
  type: 'issue',
  name: '문제·장애 보고',
  description: '무슨 일인지, 원인과 대책을 알려요',
  storyline: ['영향', '경과', '원인', '대책'],
  showcase: ['영향', '경과', '원인', '재발 방지 대책'],
  defaultTitle: '문제 보고',
  // 프레임 잡기에서 먼저 골라 둘 값: 급한 보고라 결정할 윗분께 짧게
  defaults: { audience: 'exec', minutes: 10 },
  examples: { title: '10월 21일 주문 시스템 장애 보고', ask: '재발 방지 예산 2,000만 원 승인' },
  recipes: [
    cover,
    summary(
      '한 줄 요약 (예: 주문 시스템이 2시간 멈췄고, 지금은 정상이에요)',
      ['무슨 일', '영향', '원인', '대책'],
      ['언제, 어디서, 무엇이 (한두 문장)', '누가 얼마나 영향을 받았는지 (숫자로)', '왜 일어났는지', '한 일과 할 일, 지금 상태'],
    ),
    {
      layout: 'kpi',
      purpose: '영향',
      priority: 1,
      guide: '영향을 숫자로, 확인한 시점과 함께 적어요.',
      hints: {
        title: '주문 1,240건이 늦어졌어요',
        ...each({
          value: ['2시간', '1,240건', '3곳'],
          title: ['멈춘 시간', '늦어진 주문', '항의한 고객사'],
          body: ['10월 21일 14:00~16:00', '모두 그날 처리', '담당자가 직접 연락'],
        }),
      },
    },
    {
      layout: 'timeline',
      purpose: '경과',
      priority: 2,
      focus: 'detail',
      guide: '알아챈 때부터 복구까지 시각을 적어요.',
      variant: 'steps',
      hints: {
        title: '두 시간 만에 복구했어요',
        ...each({ meta: ['14:00', '14:20', '15:10', '16:00'], title: ['처음 알아챔', '원인 찾음', '임시 조치', '정상 복구'] }),
      },
    },
    {
      layout: 'points',
      purpose: '원인',
      priority: 1,
      guide: '바로 원인과 그 뒤의 이유까지 짚어요.',
      hints: {
        title: '저장 공간이 가득 찬 것을 몰랐어요',
        'items.title': '원인',
        'items.body': '왜 그랬는지',
        ...each({ title: ['저장 공간이 가득 찼어요', '경고가 울리지 않았어요', '점검표에 빠져 있었어요'] }),
      },
    },
    {
      layout: 'table',
      purpose: '재발 방지 대책',
      priority: 1,
      guide: '한 일과 할 일을 나눠, 담당과 기한을 적어요.',
      fields: { h1: '대책', h2: '담당', h3: '기한', h4: '상태' },
      hints: {
        title: '네 가지로 다시 일어나지 않게 해요',
        ...each({
          title: ['저장 공간 경고 켜기', '점검표에 넣기', '비상 연락망 고치기', '복구 훈련'],
          meta: ['IT운영팀', 'IT운영팀', '영업지원팀', 'IT운영팀'],
          value: ['10월 22일', '11월', '11월', '12월'],
          body: ['끝났어요', '진행 중', '진행 중', '예정'],
        }),
      },
    },
    closing('요청 사항', '요청 사항', 2, '대책에 필요한 결정이나 지원을 적어요.', [
      '결정해 주실 일 (예: 재발 방지 예산 승인)',
      '함께 정해 주실 일',
      '그 밖의 요청',
    ]),
  ],
}


// 발표 종류: 결과 보고 (result)

import { closing, cover, each, section, summary, type Blueprint } from './recipes'

/** 결과 보고: 끝난 일(프로젝트, 시범 운영, 행사, 출장)의 성과와 배운 점, 남은 일 */
export const result: Blueprint = {
  type: 'result',
  name: '결과 보고',
  description: '끝난 일의 성과와 배운 점을 정리해요',
  storyline: ['성과', '과정', '배운 점', '후속 과제'],
  showcase: ['목표 대비 결과', '진행 과정', '배운 점', '후속 과제'],
  defaultTitle: '결과 보고',
  // 프레임 잡기에서 먼저 골라 둘 값: 끝난 일을 맡긴 팀장께
  defaults: { audience: 'practitioner', minutes: 20 },
  examples: { title: '신입 온보딩 개편 시범 운영 결과 보고', ask: '전사 확대 승인' },
  recipes: [
    cover,
    summary(
      '한 줄 결론 (예: 시범 운영으로 신입 적응 기간을 40% 줄였어요)',
      ['목표', '결과', '배운 점', '후속 과제'],
      ['처음에 무엇을 하려 했는지', '무엇을 얼마나 이뤘는지 (숫자로)', '이어갈 것과 고칠 것', '남은 일과 요청 (예: 전사로 확대)'],
    ),
    section('결과', '무엇을 얼마나 이뤘는지'),
    {
      layout: 'scorecard',
      purpose: '목표 대비 결과',
      priority: 1,
      section: '결과',
      guide: '처음 정한 목표와 결과를 같은 단위로 적어요.',
      hints: {
        title: '네 목표 중 세 개를 이뤘어요',
        'items.title': '목표',
        ...each({
          title: ['적응 기간', '참여 팀', '교육 이수율', '비용'],
          meta: ['6.5주 이하', '3팀', '80%', '2,000만 원 이하'],
          value: ['6주', '3팀', '72%', '1,850만 원'],
        }),
      },
    },
    {
      layout: 'kpi',
      purpose: '핵심 성과',
      priority: 2,
      focus: 'numbers',
      section: '결과',
      guide: '가장 내세울 숫자 두세 개만 골라요.',
      hints: {
        title: '숫자로 보는 성과',
        ...each({
          value: ['40%', '1,200시간', '4.6점'],
          title: ['줄어든 적응 기간', '한 해에 아끼는 시간', '신입 만족도'],
          body: ['10주에서 6주로', '입사자 수로 계산', '5점 만점, 42명 응답'],
        }),
      },
    },
    section('과정', '어떻게 진행했는지'),
    {
      layout: 'timeline',
      purpose: '진행 과정',
      priority: 3,
      focus: 'detail',
      section: '과정',
      guide: '큰 고비만 짧게 적어요.',
      hints: { title: '넉 달 동안 이렇게 진행했어요', ...each({ meta: ['7월', '8월', '9월', '10월'], title: ['준비', '시범 운영', '보완', '마무리'] }) },
    },
    {
      layout: 'points',
      purpose: '잘된 점',
      priority: 2,
      section: '과정',
      guide: '다음에도 이어갈 것을 짚어요.',
      hints: {
        title: '잘된 이유',
        'items.title': '잘된 점',
        'items.body': '왜 잘됐는지',
        ...each({ title: ['한 팀에서 먼저 시작했어요', '매주 숫자로 점검했어요', '신입과 함께 고쳤어요'] }),
      },
    },
    section('배운 점', '다음에는 어떻게 할지'),
    {
      // 아쉬웠던 점과 다음에 할 것은 두 단의 글보다, 이번의 방식에 줄이 그어지고 다음 방식이 드러나는 장면이 '바꾼다'를 말한다
      layout: 'compose',
      purpose: '배운 점',
      priority: 1,
      section: '배운 점',
      guide: '아쉬웠던 점마다 다음에 어떻게 할지 짝지어요.',
      hints: { title: '다음에는 이렇게 해요' },
      blocks: [
        {
          type: 'wipe',
          fields: { from: '이번에는', to: '다음에는' },
          hints: {
            'items.title': '아쉬웠던 점',
            'items.body': '다음에 어떻게 할지',
            ...each({
              title: ['도와줄 선배를 늦게 정했어요', '교육 자료 정리가 오래 걸렸어요', '이수율이 목표에 못 미쳤어요'],
              body: ['입사 전에 선배를 정해요', '팀마다 먼저 정리해요', '교육 일정을 달력에 넣어요'],
            }),
          },
        },
      ],
    },
    {
      // 남은 일은 담당과 기한을 표로 적기보다 달 위에 막대로 놓으면 언제 무엇이 끝나는지 보인다
      layout: 'compose',
      purpose: '후속 과제',
      priority: 1,
      section: '배운 점',
      guide: '남은 일을 누가 언제까지 할지 적어요.',
      hints: { title: '네 가지가 남았어요' },
      blocks: [
        {
          type: 'gantt',
          hints: {
            cols: '11월, 12월, 1월, 2월',
            now: '예: 11월',
            ...each({
              title: ['결과 공유회', '교육 자료 매달 고치기', '이수율 다시 점검', '전사로 넓히기'],
              body: ['11월', '11월~2월', '12월', '1월~2월'],
              meta: ['경영지원본부', '교육팀', '인사팀', '인사팀'],
            }),
          },
        },
      ],
    },
    closing('요청 사항', '요청 사항', 2, '받을 결정이나 지원이 있으면 적어요.', [
      '결정해 주실 일 (예: 전사 확대 승인)',
      '함께 정해 주실 일 (예: 확대 예산)',
      '그 밖의 요청',
    ]),
  ],
}

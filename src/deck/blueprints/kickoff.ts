// 발표 종류: 프로젝트 착수 (kickoff)

import { agenda, closing, each, plainCover, risks, summary, type Blueprint } from './recipes'

/** 프로젝트 착수: 함께할 사람들과 목표, 범위, 일정, 역할을 맞춘다 */
export const kickoff: Blueprint = {
  type: 'kickoff',
  name: '프로젝트 착수',
  description: '목표, 범위, 일정, 역할을 맞춰요',
  storyline: ['목표', '범위', '일정', '역할'],
  showcase: ['목표', '하는 일과 하지 않는 일', '일정', '역할과 담당'],
  defaultTitle: '프로젝트 착수 보고',
  // 프레임 잡기에서 먼저 골라 둘 값: 여러 팀이 같이 듣는 자리
  defaults: { audience: 'mixed', minutes: 20 },
  examples: { title: '설비 점검 전산화 프로젝트 착수 보고', lead: '함께할 네 팀이 목표와 일정을 맞춰요' },
  recipes: [
    plainCover,
    summary(
      '한 줄 요약 (예: 6개월 안에 점검 기록 시간을 절반으로 줄여요)',
      ['왜', '목표', '범위', '일정'],
      ['이 프로젝트를 하는 이유', '끝났을 때 달라지는 것 (숫자로)', '하는 일과 하지 않는 일', '언제 시작해서 언제 끝나는지'],
    ),
    agenda,
    {
      layout: 'statement',
      purpose: '추진 배경',
      priority: 2,
      focus: 'context',
      guide: '왜 지금 이 일을 하는지 한 문장으로 적어요.',
      hints: { title: '이 프로젝트를 하는 이유를 한 문장으로', lead: '그렇게 보는 근거' },
    },
    {
      layout: 'kpi',
      purpose: '목표',
      priority: 1,
      guide: '끝났을 때 무엇으로 성공을 잴지 적어요.',
      hints: {
        title: '끝나면 이렇게 달라져요',
        ...each({
          value: ['50%', '3곳', '6개월'],
          title: ['줄일 기록 시간', '먼저 쓸 공장', '기간'],
          body: ['지금 하루 2시간에서 1시간으로', '1~3공장', '11월부터 4월까지'],
        }),
      },
    },
    {
      layout: 'compare',
      purpose: '하는 일과 하지 않는 일',
      priority: 1,
      variant: 'apart',
      guide: '하지 않는 일을 적어 두면 범위가 흔들리지 않아요.',
      fields: { leftTitle: '이번에 해요', rightTitle: '이번에는 안 해요' },
      hints: {
        title: '이번에 할 일과 하지 않을 일',
        'items.title': '하는 일',
        'items.body': '하지 않는 일',
        ...each({
          title: ['점검표 하나로 맞추기', '점검 기록 한곳에 모으기', '1~3공장에 적용'],
          body: ['안전 점검표', '설비 구매 시스템 바꾸기', '해외 공장'],
        }),
      },
    },
    {
      layout: 'timeline',
      purpose: '일정',
      priority: 1,
      guide: '중간 점검 날짜를 함께 정해요.',
      hints: { title: '4월에 모든 팀이 써요', ...each({ meta: ['11월', '12월', '2월', '4월'], title: ['착수', '설계 완료', '시범 운영', '모두 적용'] }) },
    },
    {
      layout: 'table',
      purpose: '역할과 담당',
      priority: 2,
      focus: 'detail',
      guide: '누가 무엇을 맡고, 얼마나 시간을 쓰는지 적어요.',
      fields: { h1: '역할', h2: '담당', h3: '시간', h4: '하는 일' },
      hints: {
        title: '네 팀이 함께해요',
        ...each({
          title: ['총괄', '설계', '개발', '현업 검증'],
          meta: ['기획팀', 'IT팀', 'IT팀', '설비팀'],
          value: ['50%', '100%', '100%', '20%'],
          body: ['일정과 결정', '화면과 흐름', '만들기와 시험', '써 보고 의견 내기'],
        }),
      },
    },
    {
      layout: 'process',
      purpose: '일하는 방식',
      priority: 3,
      focus: 'detail',
      guide: '언제 모이고 어디에 남기는지 정해요.',
      hints: {
        title: '매주 화요일에 모여 확인해요',
        ...each({
          title: ['주간 회의', '진행 공유', '이슈 올리기', '월간 보고'],
          meta: ['매주 화요일', '매주 금요일', '생기는 대로', '매달 첫 주'],
          body: ['지난주 한 일과 막힌 일을 봐요', '진행 상황을 한곳에 남겨요', '막히면 그날 바로 올려요', '윗분께 한 장으로 알려요'],
        }),
      },
    },
    risks(2, undefined, {
      title: ['현업이 바빠 검증이 늦을 수 있어요', '할 일이 자꾸 늘 수 있어요', '기존 시스템과 맞지 않을 수 있어요'],
      body: ['검증 날짜를 미리 잡아 둬요', '더할 일은 주간 회의에서 정해요', '첫 달에 연결부터 시험해요'],
    }),
    closing('함께 정할 것', '오늘 정할 것', 1, '이 자리에서 정할 것을 분명히 적어요.', [
      '정해 주실 일 (예: 투입 인력 확정)',
      '함께 맞출 일 (예: 주간 회의 시간)',
      '그 밖의 요청',
    ]),
  ],
}

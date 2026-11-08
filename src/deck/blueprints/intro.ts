// 발표 종류: 팀·업무 소개 (intro)

import { closing, each, plainCover, type Blueprint } from './recipes'

/** 팀·업무 소개: 새로 온 분, 다른 부서, 인수인계 받을 분에게 팀이 하는 일과 함께 일하는 법을 알린다 */
export const intro: Blueprint = {
  type: 'intro',
  name: '팀·업무 소개',
  description: '팀이 하는 일과 함께 일하는 법을 알려요',
  storyline: ['팀', '하는 일', '일하는 법', '연락'],
  showcase: ['숫자로 보는 팀', '하는 일', '일이 오가는 길', '이럴 때 찾아 주세요'],
  defaultTitle: '팀 소개',
  // 프레임 잡기에서 먼저 골라 둘 값: 함께 일할 다른 부서에
  defaults: { audience: 'partners', minutes: 20 },
  examples: { title: '기획팀을 소개해요', lead: '새로 오신 분께' },
  recipes: [
    plainCover,
    {
      layout: 'statement',
      purpose: '한 줄 소개',
      priority: 1,
      guide: '우리 팀을 한 문장으로 먼저 말해요.',
      hints: { title: '우리 팀을 한 문장으로 (예: 회사의 숫자를 모아 결정을 돕는 팀이에요)', lead: '누구를, 무엇으로 돕는지' },
    },
    {
      layout: 'kpi',
      purpose: '숫자로 보는 팀',
      priority: 2,
      focus: 'numbers',
      guide: '팀의 크기와 하는 일의 양을 숫자로 보여요.',
      hints: {
        title: '숫자로 보는 우리 팀',
        ...each({
          value: ['12명', '1,800건', '14곳'],
          title: ['함께 일하는 사람', '한 해에 받는 요청', '함께 일하는 부서'],
          body: ['기획 8명, 분석 4명', '하루 7건 정도', '본사 9곳, 공장 5곳'],
        }),
      },
    },
    {
      layout: 'points',
      purpose: '하는 일',
      priority: 1,
      guide: '하는 일을 세 가지 이내로 적어요.',
      hints: {
        title: '세 가지 일을 해요',
        'items.title': '하는 일',
        'items.body': '무엇을, 누구를 위해',
        ...each({ title: ['경영 숫자 모으기', '보고 자료 만들기', '부서 요청 분석'] }),
      },
    },
    {
      layout: 'process',
      purpose: '일이 오가는 길',
      priority: 2,
      focus: 'detail',
      guide: '요청이 들어와서 답이 나가기까지를 단계로 적어요.',
      hints: {
        title: '요청부터 답까지 이틀이면 돼요',
        ...each({
          title: ['요청 올리기', '담당 정하기', '검토', '답 보내기'],
          meta: ['요청한 분', '파트장, 그날', '담당, 하루', '담당, 그날'],
          body: ['요청을 게시판에 올려요', '파트장이 맡을 사람을 정해요', '내용을 보고 일정을 잡아요', '결과를 요청한 분께 알려요'],
        }),
      },
    },
    {
      layout: 'table',
      purpose: '맡은 사람',
      priority: 2,
      focus: 'detail',
      guide: '업무마다 누구를 찾으면 되는지 적어요.',
      fields: { h1: '업무', h2: '담당', h3: '연락', h4: '비고' },
      hints: {
        title: '이 일은 이분께 물어보세요',
        ...each({
          title: ['경영 숫자', '보고 자료', '부서 요청', '분석 도구'],
          meta: ['기획 1파트', '기획 2파트', '분석 파트', '기획 1파트'],
          value: ['내선 2101', '내선 2102', '내선 2103', '내선 2104'],
          body: ['매달 5일에 마감', '양식은 게시판에', '게시판에 올려 주세요', '권한은 신청서로'],
        }),
      },
    },
    {
      layout: 'timeline',
      purpose: '올해 계획',
      priority: 3,
      guide: '팀이 올해 바꾸려는 것을 짧게 적어요.',
      hints: {
        title: '올해 이렇게 바뀌어요',
        ...each({ meta: ['1분기', '2분기', '3분기', '4분기'], title: ['지표 정의 새로 짜기', '월간 보고 자동화', '분석 화면 열기', '내년 계획'] }),
      },
    },
    closing(
      '이럴 때 찾아 주세요',
      '이럴 때 찾아 주세요',
      1,
      '언제, 어떻게 연락하면 되는지 적어요.',
      ['찾을 때 (예: 회사 숫자가 필요할 때)', '찾을 때 (예: 보고 자료를 같이 만들 때)', '찾을 때 (예: 분석을 부탁할 때)'],
      ['누구에게, 어떻게 연락하는지', '누구에게, 어떻게 연락하는지', '없으면 이 줄을 지워요'],
    ),
  ],
}

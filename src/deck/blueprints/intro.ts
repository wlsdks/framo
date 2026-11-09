// 발표 종류: 팀·업무 소개 (intro)

import { closing, each, plainCover, type Blueprint } from './recipes'

/** 팀·업무 소개: 새로 온 분, 다른 부서, 인수인계 받을 분에게 팀이 하는 일과 함께 일하는 법을 알린다 */
export const intro: Blueprint = {
  type: 'intro',
  name: '팀·업무 소개',
  description: '팀이 하는 일과 함께 일하는 법을 알려요',
  storyline: ['팀', '하는 일', '일하는 법', '연락'],
  showcase: ['숫자로 보는 팀', '하는 일', '일이 오가는 길', '맡은 사람'],
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
      // 요청이 들어와 답이 나가기까지는 단계를 늘어놓기보다 요청이 단계를 건너가는 흐름으로 보일 때 '어디로 가는지'가 읽힌다
      layout: 'compose',
      purpose: '일이 오가는 길',
      priority: 2,
      focus: 'detail',
      guide: '요청이 들어와서 답이 나가기까지를 단계로 적어요.',
      hints: { title: '요청부터 답까지 이틀이면 돼요' },
      blocks: [
        {
          type: 'flow',
          items: 4,
          hints: {
            what: '오가는 것 (예: 부서 요청)',
            'items.value': '오가는 양 (예: 한 달 150건)',
            ...each({
              title: ['요청 올리기', '담당 정하기', '검토', '답 보내기'],
              meta: ['요청한 분, 게시판', '파트장, 그날', '담당, 하루', '담당, 그날'],
            }),
          },
        },
      ],
    },
    {
      // 누구를 찾으면 되는지는 표의 칸보다 사람마다 이름과 맡은 일을 크게 두면 듣는 분이 얼굴처럼 기억한다
      layout: 'compose',
      purpose: '맡은 사람',
      priority: 2,
      focus: 'detail',
      guide: '업무마다 누구를 찾으면 되는지, 어떻게 연락하는지 적어요.',
      hints: { title: '이 일은 이분께 물어보세요' },
      blocks: [
        {
          type: 'people',
          items: 4,
          hints: {
            ...each({
              title: ['기획 1파트 한도윤 책임', '기획 2파트 서지우 선임', '분석 파트 문하린 선임', '기획 1파트 오태민 선임'],
              meta: ['경영 숫자', '보고 자료', '부서 요청', '분석 도구'],
              body: ['내선 2101, 매달 5일에 마감', '내선 2102, 양식은 게시판에', '내선 2103, 게시판에 올려 주세요', '내선 2104, 권한은 신청서로'],
            }),
          },
        },
      ],
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

// 발표 종류: 실적 보고 (report)

import { agenda, closing, cover, each, type Blueprint } from './recipes'

export const report: Blueprint = {
  type: 'report',
  name: '실적 보고',
  description: '목표 대비 실적과 원인, 대책을 알려요',
  storyline: ['실적', '분석', '대책', '계획'],
  showcase: ['핵심 실적', '증감 요인', '문제와 대책', '다음 계획'],
  defaultTitle: '실적 보고',
  // 프레임 잡기에서 먼저 골라 둘 값: 실적은 본부장·임원이 숫자 위주로 본다
  defaults: { audience: 'exec', minutes: 20 },
  examples: { title: '3분기 실적 보고', ask: '신규 인력 1명 충원' },
  recipes: [
    cover,
    {
      layout: 'kpi',
      purpose: '핵심 실적',
      priority: 1,
      guide: '목표 대비 몇 퍼센트인지부터 보여요.',
      hints: {
        title: '이번 분기 목표의 112%를 달성했어요',
        ...each({
          value: ['112%', '131억 원', '4곳'],
          title: ['목표 달성률', '3분기 매출', '신규 고객'],
          body: ['목표와 실적 숫자', '지난 분기와 비교', '목표 5곳'],
        }),
      },
    },
    agenda,
    {
      layout: 'scorecard',
      purpose: '목표 대비 실적',
      priority: 1,
      guide: '목표에 못 미친 지표는 이유를 짧게 적어요.',
      hints: {
        title: '네 지표 중 세 개가 목표를 넘었어요',
        'items.title': '지표 이름',
        ...each({
          title: ['매출', '영업이익', '신규 고객', '재계약률'],
          meta: ['117억 원', '14억 원', '5곳', '90%'],
          value: ['131억 원', '15.2억 원', '4곳', '93%'],
        }),
      },
    },
    {
      layout: 'bridge',
      purpose: '증감 요인',
      priority: 2,
      focus: 'numbers',
      guide: '더한 것은 +, 뺀 것은 -로 적으면 실적이 계산돼요.',
      fields: { startTitle: '목표', endTitle: '실적' },
      hints: {
        title: '목표보다 14억 원 더 팔았어요',
        startValue: '117',
        unit: '억 원',
        ...each({ title: ['신규 고객', '단가 인상', '기존 고객 이탈'], value: ['+9', '+7', '-2'] }),
      },
    },
    {
      layout: 'trend',
      purpose: '기간별 실적',
      priority: 2,
      focus: 'numbers',
      guide: '목표선을 적으면 넘은 때가 한눈에 보여요.',
      hints: {
        title: '여름부터 매출이 꾸준히 늘었어요',
        unit: '억 원',
        target: '115',
        ...each({ title: ['4월', '5월', '6월', '7월', '8월', '9월'], value: ['96', '101', '99', '108', '117', '131'] }),
      },
    },
    {
      layout: 'versus',
      purpose: '작년 대비',
      priority: 3,
      focus: 'numbers',
      guide: '두 값을 나란히 적으면 증감이 계산돼요.',
      hints: {
        title: '3분기부터 작년보다 20% 넘게 늘었어요',
        unit: '억 원',
        ...each({ title: ['1분기', '2분기', '3분기', '4분기'], meta: ['96', '101', '108', '117'], value: ['104', '98', '131', '136'] }),
      },
    },
    {
      layout: 'progress',
      purpose: '과제 진행 현황',
      priority: 2,
      focus: 'detail',
      guide: '늦어지는 과제는 얼마나 늦는지 함께 적어요.',
      hints: { title: '다섯 과제 중 하나가 2주 늦어지고 있어요' },
    },
    {
      layout: 'funnel',
      purpose: '영업 단계별 현황',
      priority: 3,
      focus: 'detail',
      guide: '많이 빠지는 단계가 다음 계획의 근거가 돼요.',
      hints: {
        title: '제안까지 간 고객 다섯 중 한 곳이 계약했어요',
        unit: '곳',
        ...each({ title: ['문의', '미팅', '제안', '계약'], value: ['80', '32', '15', '3'] }),
      },
    },
    {
      layout: 'points',
      purpose: '잘된 점',
      priority: 2,
      guide: '실적을 만든 이유를 짚어요.',
      hints: {
        title: '실적을 만든 이유',
        'items.title': '잘된 점',
        'items.body': '왜 잘됐는지',
        ...each({ title: ['기존 고객 재계약', '새 업종 진입', '제안 기간 단축'] }),
      },
    },
    {
      layout: 'compare',
      purpose: '문제와 대책',
      priority: 1,
      guide: '부족했던 점을 먼저 꺼내고 대책을 함께 적어요.',
      fields: { leftTitle: '문제', rightTitle: '대책' },
      hints: {
        title: '부족했던 점과 대책',
        'items.title': '부족했던 점',
        'items.body': '대책',
        ...each({
          title: ['신규 고객이 목표보다 1곳 적어요', '제안서 준비에 시간이 많이 들어요', '큰 계약이 다음 분기로 밀렸어요'],
          body: ['4분기에 2곳을 더 만나요', '제안서 양식을 하나로 맞춰요', '12월 계약에 맞춰 일정을 당겨요'],
        }),
      },
    },
    {
      layout: 'timeline',
      purpose: '다음 계획',
      priority: 1,
      guide: '다음 기간에 무엇을 언제 할지 적어요.',
      hints: {
        title: '다음 분기 계획',
        ...each({ meta: ['10월', '11월', '12월', '1월'], title: ['신규 고객 2곳 방문', '재계약 협상', '연간 실적 점검', '내년 계획 보고'] }),
      },
    },
    closing('요청 사항', '요청 사항', 1, '없으면 이 슬라이드를 빼도 돼요.', ['필요한 지원 (예: 신규 인력 1명)', '함께 정해 주실 일', '그 밖의 요청']),
  ],
}

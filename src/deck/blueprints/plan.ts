// 발표 종류: 연간·반기 계획 (plan)

import { agenda, cover, decision, each, priorities, risks, section, summary, type Blueprint } from './recipes'

/** 연간·반기 계획: 지난 기간을 돌아보고, 다음 기간의 목표와 과제, 예산을 승인받는다 */
export const plan: Blueprint = {
  type: 'plan',
  name: '연간·반기 계획',
  description: '목표와 중점 과제, 예산을 정해요',
  storyline: ['돌아보기', '목표', '과제', '일정'],
  showcase: ['올해 돌아보기', '내년 목표', '중점 과제', '분기별 일정'],
  defaultTitle: '사업 계획',
  // 프레임 잡기에서 먼저 골라 둘 값: 한 해나 반기를 정하는 자리라 길게
  defaults: { audience: 'exec', minutes: 30 },
  examples: { title: '2027년 사업본부 사업 계획', ask: '내년 예산 12억 원과 인력 2명 승인' },
  recipes: [
    cover,
    summary(
      '한 줄 결론 (예: 내년 매출 580억 원, 신규 고객 20곳)',
      ['돌아보기', '목표', '중점 과제', '요청 사항'],
      ['올해 이룬 것과 모자란 것', '내년에 이룰 것 (숫자로)', '목표를 위해 할 일 세 가지', '결정해 주실 것 (예산, 인력)'],
    ),
    agenda,
    section('돌아보기', '올해 무엇을 이뤘는지'),
    {
      layout: 'scorecard',
      purpose: '올해 돌아보기',
      priority: 1,
      section: '돌아보기',
      guide: '올해 목표와 실적을 같은 단위로 적어요.',
      hints: {
        title: '네 목표 중 세 개를 이뤘어요',
        'items.title': '지표 이름',
        ...each({
          title: ['매출', '영업이익', '신규 고객', '재계약률'],
          meta: ['500억 원', '50억 원', '15곳', '90%'],
          value: ['512억 원', '47억 원', '17곳', '92%'],
        }),
      },
    },
    {
      layout: 'points',
      purpose: '올해 배운 점',
      priority: 3,
      focus: 'context',
      section: '돌아보기',
      guide: '내년 계획의 근거가 되는 것만 짚어요.',
      hints: {
        title: '내년에 이어갈 것과 고칠 것',
        'items.title': '배운 점',
        'items.body': '왜 그런지, 내년에 어떻게 할지',
        ...each({ title: ['큰 고객에 집중한 것이 통했어요', '신규 영업이 늦게 시작됐어요', '인력이 한 팀에 몰렸어요'] }),
      },
    },
    section('목표', '내년에 무엇을 이룰지'),
    {
      layout: 'kpi',
      purpose: '내년 목표',
      priority: 1,
      section: '목표',
      guide: '목표는 숫자로, 올해와 견줘 적어요.',
      hints: {
        title: '내년에 이룰 것',
        ...each({ value: ['580억 원', '20곳', '14%'], title: ['매출', '신규 고객', '영업이익률'], body: ['올해보다 13% 많이', '올해 17곳', '올해 9.2%'] }),
      },
    },
    {
      layout: 'versus',
      purpose: '올해와 내년',
      priority: 3,
      focus: 'numbers',
      section: '목표',
      guide: '분기마다 올해와 내년 목표를 나란히 놓아요.',
      fields: { metaTitle: '올해', valueTitle: '내년' },
      hints: {
        title: '분기마다 10% 넘게 늘려요',
        unit: '억 원',
        ...each({ title: ['1분기', '2분기', '3분기', '4분기'], meta: ['118', '124', '131', '139'], value: ['132', '140', '148', '160'] }),
      },
    },
    section('과제', '목표를 위해 무엇을 할지'),
    {
      // 과제를 글 목록으로 늘어놓으면 왜 이 셋인지 보이지 않는다. 과제마다 목표에 더하는 몫이 모여 목표가 되는 그림이면
      // 셋이 목표를 채우는지가 읽힌다(올해 512억 원 + 68억 원 = 내년 목표 580억 원)
      layout: 'compose',
      purpose: '중점 과제',
      priority: 1,
      section: '과제',
      guide: '과제는 세 가지 이내로, 과제마다 목표에 더하는 몫을 적어요.',
      hints: { title: '세 과제로 매출 68억 원을 더해요' },
      blocks: [
        {
          type: 'merge',
          hints: {
            label: '내년에 늘릴 매출',
            total: '68억 원',
            ...each({ title: ['신규 업종 진입', '구독 매출 늘리기', '영업 방식 바꾸기'], value: ['30억', '25억', '13억'] }),
          },
        },
      ],
    },
    priorities('과제'),
    section('실행', '언제, 무엇으로 할지'),
    {
      // 과제가 여러 분기에 걸쳐 겹치므로 점을 이은 선보다 기간 막대가 한 해의 짜임을 보인다
      layout: 'compose',
      purpose: '분기별 일정',
      priority: 2,
      focus: 'detail',
      section: '실행',
      guide: '과제마다 언제부터 언제까지 하는지 적어요.',
      hints: { title: '상반기에 첫 계약, 하반기에 구독 상품' },
      blocks: [
        {
          type: 'gantt',
          hints: {
            cols: '1분기, 2분기, 3분기, 4분기',
            ...each({
              title: ['조직 정비', '신규 업종 첫 계약', '구독 상품 출시', '연간 점검'],
              body: ['1분기', '1분기~2분기', '2분기~3분기', '4분기'],
              meta: ['경영기획팀', '영업본부', '상품팀', '경영기획팀'],
            }),
          },
        },
      ],
    },
    {
      layout: 'kpi',
      purpose: '필요한 예산과 인력',
      priority: 2,
      section: '실행',
      guide: '예산과 인력을 숨기지 말고 먼저 보여요.',
      hints: {
        title: '필요한 예산과 인력',
        ...each({ value: ['12억 원', '2명', '3억 원'], body: ['올해보다 1.5억 원 늘어요', '신규 업종 영업 담당', '구독 상품 개발'] }),
      },
      prefill: [{ title: '운영 예산' }, { title: '인력' }, { title: '투자' }],
    },
    risks(3, '실행', {
      title: ['경기가 나빠 매출이 줄 수 있어요', '신규 업종 영업이 늦을 수 있어요', '사람을 제때 뽑지 못할 수 있어요'],
      body: ['분기마다 목표를 다시 봐요', '협력사와 함께 영업해요', '내부 이동을 먼저 검토해요'],
    }),
    decision(['결정해 주실 일 (예: 내년 예산 12억 원 승인)', '함께 정해 주실 일 (예: 신규 인력 2명)', '그 밖의 요청']),
  ],
}


// 발표 종류: 조사·분석 보고 (research)

import { closing, cover, each, section, summary, type Blueprint } from './recipes'

/** 조사·분석 보고: 시장, 경쟁사, 고객을 조사한 결과와 그래서 무엇을 할지 */
export const research: Blueprint = {
  type: 'research',
  name: '조사·분석 보고',
  description: '시장, 경쟁사, 고객을 조사한 결과를 알려요',
  storyline: ['시장', '구성', '경쟁', '시사점'],
  showcase: ['시장 추이', '시장 구성', '경쟁사 위치', '시사점'],
  defaultTitle: '조사 보고',
  // 프레임 잡기에서 먼저 골라 둘 값: 여러 분이 같이 듣는 자리
  defaults: { audience: 'mixed', minutes: 20 },
  examples: { title: '중소 제조 품질 관리 시장 조사', ask: '시범 사업 검토 착수' },
  recipes: [
    cover,
    summary(
      '한 줄 결론 (예: 중소 제조 시장이 해마다 18%씩 커요)',
      ['조사 목적', '알게 된 것', '시사점', '제안'],
      ['무엇을 왜 조사했는지', '가장 중요한 발견 두세 가지', '그래서 우리에게 무슨 뜻인지', '다음에 할 일 (예: 시범 사업 검토)'],
    ),
    {
      layout: 'points',
      purpose: '조사 방법',
      priority: 3,
      focus: 'context',
      guide: '무엇을 얼마나 봤는지 적어 두면 믿고 들어요.',
      hints: {
        title: '세 가지로 조사했어요',
        'items.title': '방법',
        'items.body': '무엇을, 얼마나',
        ...each({ title: ['자료 조사', '고객 인터뷰', '설문'], body: ['협회 통계와 공시 자료', '중소 제조사 12곳', '담당자 140명 응답'] }),
      },
    },
    section('시장', '시장이 얼마나 크고 어떻게 움직이는지'),
    {
      layout: 'trend',
      purpose: '시장 추이',
      priority: 1,
      section: '시장',
      guide: '해마다의 숫자를 적고 출처를 함께 남겨요.',
      hints: {
        title: '5년 동안 시장이 두 배가 됐어요',
        unit: '억 원',
        ...each({ title: ['2021년', '2022년', '2023년', '2024년', '2025년', '2026년'], value: ['600', '700', '820', '960', '1,100', '1,200'] }),
      },
    },
    {
      layout: 'share',
      purpose: '시장 구성',
      priority: 2,
      focus: 'numbers',
      section: '시장',
      guide: '눈여겨볼 부분 하나를 강조해요.',
      hints: {
        title: '중소 제조가 시장의 절반이에요',
        unit: '억 원',
        ...each({ title: ['중소 제조', '대기업', '공공', '기타'], value: ['600', '360', '160', '80'] }),
      },
    },
    section('경쟁', '누가 어디쯤 있는지'),
    {
      layout: 'position',
      purpose: '경쟁사 위치',
      priority: 1,
      section: '경쟁',
      guide: '두 기준을 정하고 점수로 찍어요.',
      fields: { xAxis: '기능이 많음', yAxis: '도입이 빠름' },
      hints: { title: '빠르면서 기능도 많은 자리가 비어 있어요' },
    },
    {
      layout: 'table',
      purpose: '경쟁사 비교',
      priority: 3,
      focus: 'detail',
      section: '경쟁',
      guide: '견줄 항목을 같게 맞춰 한 줄씩 적어요.',
      fields: { h1: '회사', h2: '강점', h3: '가격', h4: '약점' },
      hints: {
        title: '세 회사 모두 도입이 느려요',
        ...each({
          title: ['A사', 'B사', 'C사', '우리'],
          meta: ['기능이 많아요', '값이 싸요', '대기업 사례가 많아요', '빨리 도입해요'],
          value: ['연 6,000만 원', '연 2,000만 원', '연 8,000만 원', '연 3,000만 원'],
          body: ['도입에 6개월', '분석 기능이 없어요', '중소기업엔 비싸요', '사례가 적어요'],
        }),
      },
    },
    section('시사점', '그래서 무엇을 할지'),
    {
      layout: 'points',
      purpose: '시사점',
      priority: 1,
      section: '시사점',
      guide: '조사 결과가 우리에게 무슨 뜻인지 적어요.',
      hints: {
        title: '중소 제조, 빠른 도입, 구독으로 가요',
        'items.title': '시사점',
        'items.body': '근거가 되는 숫자',
        ...each({ title: ['중소 제조부터 시작해요', '빠른 도입을 앞세워요', '값은 구독으로 받아요'] }),
      },
    },
    closing('다음에 할 일', '다음에 할 일', 2, '조사를 바탕으로 할 일이나 결정을 적어요.', [
      '정해 주실 일 (예: 시범 사업 검토 착수)',
      '함께 정해 주실 일',
      '그 밖의 요청',
    ]),
  ],
}

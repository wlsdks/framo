// 발표 종류: 대외 제안. 내부 승인에 쓰는 고객 제안 계획과 듣는 사람이 다르다.
import { agenda, closing, each, plainCover, summary, type Blueprint } from './recipes'

export const proposal: Blueprint = {
  type: 'proposal',
  name: '대외 제안',
  description: '외부의 듣는 분께 해결 방법과 진행 방식을 제안해요',
  storyline: ['필요', '제안', '진행 방식', '다음 단계'],
  showcase: ['필요와 목표', '제안 내용', '진행 일정', '다음 단계'],
  defaultTitle: '대외 제안',
  defaults: { audience: 'external', minutes: 20 },
  examples: { title: '물류 분류 작업 개선 제안', lead: '현장 확인부터 시범 운영까지' },
  recipes: [
    plainCover,
    summary('무엇을 제안하는지 한 문장으로', ['필요', '제안', '기대 효과', '다음 단계'], [
      '듣는 분이 해결하려는 일', '무엇을 어떻게 제안하는지', '달라질 점과 확인 방법', '함께 논의할 다음 일',
    ]),
    { ...agenda, fields: { title: '제안 순서' } },
    {
      layout: 'statement', purpose: '필요와 목표', priority: 2, focus: 'context',
      guide: '해결하려는 문제와 바라는 결과를 듣는 분의 관점에서 적어요.',
      hints: { title: '어떤 문제를 해결하려는지 한 문장으로', lead: '현황과 목표를 확인한 근거' },
    },
    {
      layout: 'points', purpose: '제안 내용', priority: 1,
      guide: '제공할 내용과 얻을 수 있는 점을 짝지어 적어요.',
      hints: { title: '이렇게 해결해요', 'items.title': '제안하는 내용', 'items.body': '듣는 분이 얻는 것',
        ...each({ title: ['현장 확인', '시범 운영', '결과 점검'] }) },
    },
    {
      layout: 'compare', purpose: '제공 범위', priority: 1, variant: 'apart',
      guide: '이번에 포함하는 일과 별도로 논의할 일을 구분해요.',
      fields: { leftTitle: '이번에 포함해요', rightTitle: '별도로 논의해요' },
      hints: { title: '제안 범위를 이렇게 나눠요', 'items.title': '포함하는 일', 'items.body': '별도 논의할 일',
        ...each({ title: ['현장 확인', '한 곳에서 시범 운영', '결과 공유'], body: ['추가 현장 조사', '다른 장소로 확대', '장기 운영 방식'] }) },
    },
    {
      layout: 'timeline', purpose: '진행 일정', priority: 2, focus: 'detail',
      guide: '시작부터 결과를 확인할 때까지의 단계를 적어요.',
      hints: { title: '이런 순서로 진행해요', ...each({ meta: ['1주', '2주', '3~6주', '7주'], title: ['현황 확인', '준비', '시범 운영', '결과 점검'] }) },
    },
    {
      layout: 'imageText', purpose: '제안 화면', priority: 3, focus: 'detail',
      guide: '이해를 돕는 화면이나 그림을 넣고 핵심을 설명해요.',
      hints: { title: '이렇게 사용할 수 있어요', body: '화면이나 그림에서 눈여겨볼 부분' },
    },
    {
      layout: 'kpi', purpose: '비용과 조건', priority: 2, focus: 'numbers',
      guide: '필요한 경우 비용과 적용 조건을 함께 적어요.',
      hints: { title: '비용과 조건을 확인해요', ...each({ value: ['3억 원', '8주', '1곳'], title: ['예상 비용', '예상 기간', '시범 범위'], body: ['포함 범위 기준', '준비부터 결과 공유까지', '확인할 현장 수'] }) },
    },
    closing('다음 단계', '함께 논의할 다음 단계', 1, '발표 뒤에 함께 확인하거나 진행할 일을 적어요.',
      ['확인할 일', '함께 논의할 일', '연락 또는 다음 일정'], ['무엇을 확인하고 싶은지', '누구와 무엇을 정할지', '언제, 누구와 이어 갈지']),
  ],
}

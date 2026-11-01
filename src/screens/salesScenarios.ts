import type { BlockType, Item } from '../deck/types'

// 특정 회사나 실제 영업 기록을 쓰지 않는 가상의 원자료와 발표 내용이다.
export type ScenarioSpec = {
  id: string
  title: string
  hideHead?: boolean
  hideFoot?: boolean
  blocks: { type: BlockType; fields: Record<string, string>; items?: Partial<Item>[]; variant?: string }[]
}

export const salesScenarios: ScenarioSpec[] = [
  {
    id: 'sales-discovery', title: '가상 영업: 먼저 해결할 문제를 함께 정해요', blocks: [
      { type: 'text', fields: { heading: '들은 이야기', body: '가상의 현장에서는 주문이 몰리는 시간마다 담당자가 수기로 분류해요. 처리 순서를 확인하는 데 시간이 걸려요.' } },
      { type: 'bullets', fields: { heading: '먼저 확인할 것' }, items: [{ title: '주문이 몰리는 시간과 처리량' }, { title: '현재 쓰는 분류 방식과 예외 상황' }, { title: '시범 운영에 참여할 담당자' }] },
    ],
  },
  {
    id: 'sales-proposal', title: '가상 영업: 한 구간에서 8주 먼저 시험해요', blocks: [
      { type: 'number', fields: { label: '시범 운영 기간', value: '8주', note: '준비 2주와 운영 6주' } },
      { type: 'facts', fields: { heading: '시범 범위' }, items: [{ title: '대상', body: '가상의 분류 구간 한 곳' }, { title: '측정', body: '건당 처리 시간과 다시 처리한 건수' }, { title: '마무리', body: '결과를 함께 검토하고 확대 여부 결정' }] },
    ],
  },
  {
    id: 'sales-results', title: '가상 영업: 처리 시간을 12분에서 6분으로 줄였어요', blocks: [
      { type: 'trend', fields: { unit: '분' }, items: [{ title: '1주', value: '12' }, { title: '2주', value: '10' }, { title: '3주', value: '9' }, { title: '4주', value: '7' }, { title: '5주', value: '6' }] },
      { type: 'number', fields: { label: '처리 시간 감소', value: '50%', note: '가상의 시범 운영 첫 주와 다섯째 주 비교' } },
    ],
  },
  {
    id: 'sales-pipeline', title: '가상 영업 보고: 제안 20건 중 8건이 계약됐어요', blocks: [
      { type: 'facts', fields: { heading: '이번 분기 흐름' }, items: [{ title: '문의', body: '120건' }, { title: '요구 확인', body: '48건' }, { title: '제안', body: '20건' }, { title: '계약', body: '8건' }] },
      { type: 'bullets', fields: { heading: '다음 분기에 집중할 일' }, items: [{ title: '요구 확인 전 준비 자료를 간결하게 정리해요' }, { title: '제안 뒤 검토 일정과 담당자를 함께 확인해요' }] },
    ],
  },
  {
    id: 'sales-comparison', title: '가상 영업: 두 운영 범위의 차이를 비교해요', blocks: [
      { type: 'facts', fields: { heading: '작게 시작' }, items: [{ title: '범위', body: '한 구간' }, { title: '기간', body: '8주' }, { title: '확인', body: '업무 흐름과 처리 시간' }] },
      { type: 'facts', fields: { heading: '범위 확대' }, items: [{ title: '범위', body: '세 구간' }, { title: '기간', body: '16주' }, { title: '확인', body: '구간별 차이와 운영 부담' }] },
    ],
  },
  {
    id: 'sales-onboarding', title: '가상 영업: 계약 뒤 첫 달의 준비 순서', blocks: [
      { type: 'steps', fields: { label: '함께 진행해요' }, items: [{ title: '담당자 정하기' }, { title: '현장 확인' }, { title: '사용 방법 안내' }, { title: '첫 결과 점검' }] },
      { type: 'callout', fields: { label: '첫 만남에서', text: '담당자와 첫 점검 날짜를 함께 정해요' } },
    ],
  },
  {
    id: 'sales-concerns', title: '가상 영업: 도입 전에 걱정되는 점을 살펴요', blocks: [
      { type: 'text', fields: { heading: '현장의 우려', body: '새로운 방법을 익히는 동안 기존 업무가 늦어지지 않을지 확인하고 싶어요.' } },
      { type: 'bullets', fields: { heading: '함께 확인하는 방법' }, items: [{ title: '업무량이 적은 구간부터 시작해요' }, { title: '기존 방식으로 돌아갈 조건을 정해요' }, { title: '첫 주에는 매일 어려운 점을 나눠요' }] },
    ],
  },
  {
    id: 'sales-forecast', title: '가상 영업 보고: 계약 8건의 합계는 3,600만 원이에요', blocks: [
      { type: 'number', fields: { label: '가상의 계약 금액 합계', value: '3,600만 원', note: '8건 × 건당 450만 원으로 가정' } },
      { type: 'facts', fields: { heading: '계산 기준' }, items: [{ title: '계약', body: '8건' }, { title: '건당 금액', body: '450만 원' }, { title: '제외', body: '아직 계약하지 않은 제안' }] },
    ],
  },
  {
    id: 'sales-renewal', title: '가상 영업: 재계약 전에 지난 결과를 돌아봐요', blocks: [
      { type: 'bullets', fields: { heading: '함께 볼 결과' }, items: [{ title: '처리 시간은 처음보다 얼마나 달라졌나요?' }, { title: '현장 담당자가 자주 겪는 불편은 무엇인가요?' }, { title: '다음 기간에는 어떤 범위를 바꾸면 좋을까요?' }] },
      { type: 'callout', fields: { label: '다음 만남', text: '사용 결과와 다음 기간의 범위를 함께 정해요' } },
    ],
  },
  {
    id: 'sales-handoff', title: '가상 영업: 합의한 내용을 운영 담당자에게 전해요', blocks: [
      { type: 'checks', fields: { heading: '인수인계' }, items: [{ title: '시범 범위 확인', body: '완료', meta: '한 구간' }, { title: '담당자 연결', body: '진행 중', meta: '첫 주' }, { title: '측정 방식 공유', body: '예정', meta: '둘째 주' }] },
      { type: 'facts', fields: { heading: '미리 확인할 점' }, items: [{ title: '일정', body: '준비 2주, 운영 6주' }, { title: '결과', body: '처리 시간과 다시 처리한 건수' }] },
    ],
  },
]

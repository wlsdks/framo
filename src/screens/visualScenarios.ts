import { sampleBlock } from '../deck/blockSamples'
import type { ScenarioSpec } from './salesScenarios'

// 모두 가상의 상황과 수치다. 실제 발표에서 쓰는 차트와 흐름을 글과 함께 조립해 본다.
export const visualScenarios: ScenarioSpec[] = [
  { id: 'visual-list-ring', title: '가상 운영: 대기와 재작업을 함께 줄여요', blocks: [
    { type: 'bullets', fields: {}, items: [{ title: '현장 대기 시간을 먼저 살펴봐요' }, { title: '한 구간에서 8주간 시범 운영해요' }, { title: '처리 시간과 재작업을 함께 비교해요' }] },
    { type: 'ring', fields: { label: '가상의 시범 목표', value: '72%' } },
  ] },
  { id: 'visual-sales-funnel', title: '가상 영업: 문의 120건 중 8건이 계약됐어요', blocks: [
    { type: 'funnel', fields: { unit: '건' }, items: [{ title: '문의', value: '120' }, { title: '요구 확인', value: '48' }, { title: '제안', value: '20' }, { title: '계약', value: '8' }] },
    { type: 'note', fields: { kind: '다음 점검', text: '제안 후 검토 일정을 함께 확인해요' } },
  ] },
  { id: 'visual-service-flow', title: '가상 운영: 접수부터 처리까지 한 흐름으로 연결해요', blocks: [
    { type: 'flow', fields: { what: '가상의 요청 240건' }, items: [{ title: '요청 접수', meta: '입력 확인', value: '240건' }, { title: '담당 배정', meta: '분류와 전달', value: '240건' }, { title: '처리 완료', meta: '결과 공유', value: '240건' }] },
    { type: 'stat', fields: { label: '확인 기준', value: '주 1회' } },
  ] },
  { id: 'visual-service-decision', title: '가상 운영: 재고에 따라 다음 행동을 정해요', blocks: [
    { type: 'decision', fields: { label: '먼저 확인', question: '재고가 준비됐나요?' }, items: [{ title: '준비됐어요', body: '출고를 진행해요' }, { title: '아직 없어요', body: '입고 날짜를 알려 드려요' }] },
    { type: 'note', fields: { kind: '확인 시점', text: '가상의 주문 접수 직후' } },
  ] },
  { id: 'visual-sales-decision', title: '가상 영업: 시범 결과에 따라 다음 범위를 정해요', blocks: [
    { type: 'decision', fields: { label: '8주 뒤 함께 확인', question: '시범 운영의 목표를 달성했나요?' }, items: [
      { title: '목표를 넘었어요', body: '다른 구간으로 넓히는 계획을 세워요' },
      { title: '조금 모자라요', body: '어려웠던 단계를 고쳐 다시 확인해요' },
      { title: '확인이 더 필요해요', body: '측정 기간을 함께 정해요' },
    ] },
    { type: 'note', fields: { kind: '판단 기준', text: '가상의 처리 시간과 재처리 건수' } },
  ] },
  { id: 'visual-development-network', title: '가상 개발: 주문 정보를 한곳에서 함께 확인해요', blocks: [
    { type: 'network', fields: { center: '가상 주문 정보' }, items: [{ title: '접수 화면', meta: '주문 등록' }, { title: '재고 관리', meta: '수량 확인' }, { title: '배송 관리', meta: '출고 상태' }, { title: '문의 화면', meta: '처리 이력' }] },
    { type: 'facts', fields: { heading: '먼저 확인할 점' }, items: [{ title: '기준', body: '각 화면에 같은 상태 표시' }, { title: '점검', body: '상태 변경 뒤 누락 여부 확인' }] },
  ] },
  { id: 'visual-budget', title: '가상 계획: 교육 예산을 세 가지에 나눠요', blocks: [
    { type: 'split', fields: { label: '가상의 교육 예산', total: '120만 원', unit: '만 원' }, items: [{ title: '기초 과정', value: '60' }, { title: '실습', value: '40' }, { title: '자료 제작', value: '20' }] },
    { type: 'facts', fields: { heading: '운영 기준' }, items: [{ title: '시기', body: '다음 분기부터' }, { title: '점검', body: '과정별 참여와 만족도' }] },
  ] },
  { id: 'visual-lecture-tiles', title: '가상 강의: 참가자 100명 중 75명이 실습을 마쳤어요', blocks: [
    { type: 'tiles', fields: { label: '실습을 마친 참가자', value: '75%', of: '100', note: '가상의 참가자 100명 기준' } },
    { type: 'bullets', fields: { heading: '다음 강의에서' }, items: [{ title: '첫 실습 안내를 더 짧게 만들어요' }, { title: '질문 시간을 중간에 한 번 더 둬요' }] },
  ] },
  { id: 'visual-quality-pareto', title: '가상 품질 보고: 상위 두 원인이 전체 80%예요', blocks: [
    { type: 'pareto', fields: { heading: '가상의 오류 100건', unit: '건' }, items: [{ title: '입력 누락', value: '50' }, { title: '분류 오류', value: '30' }, { title: '확인 지연', value: '15' }, { title: '기타', value: '5' }] },
    { type: 'note', fields: { kind: '먼저 고칠 것', text: '입력 필수 항목을 확인해요' } },
  ] },
  { id: 'visual-sales-compare', title: '가상 영업: 제안 뒤 검토 단계가 늘었어요', blocks: [
    { type: 'versus', fields: { metaTitle: '이전', valueTitle: '이번', unit: '건' }, items: [
      { title: '요구 확인', meta: '38', value: '44' }, { title: '제안', meta: '24', value: '31' }, { title: '검토', meta: '12', value: '19' },
    ] },
    { type: 'spark', fields: { label: '검토 단계 진입', value: '19건', series: '9, 11, 12, 15, 19', note: '가상의 최근 다섯 달' } },
  ] },
  { id: 'visual-sales-donut', title: '가상 영업: 문의의 절반 이상이 교육 분야예요', blocks: [
    { type: 'share', variant: 'donut', fields: { unit: '건' }, items: [
      { title: '교육', value: '60' }, { title: '운영', value: '25' }, { title: '기타', value: '15' },
    ] },
    { type: 'callout', fields: { label: '다음 준비', text: '교육 분야의 질문을 모아 설명 자료를 다듬어요' } },
  ] },
  { id: 'visual-sales-two-lines', title: '가상 영업: 올해 문의가 작년보다 늘었어요', blocks: [
    { type: 'versus', variant: 'lines', fields: { metaTitle: '작년 문의', valueTitle: '올해 문의', unit: '건' }, items: [
      { title: '1월', meta: '24', value: '30' }, { title: '2월', meta: '30', value: '36' },
      { title: '3월', meta: '36', value: '42' }, { title: '4월', meta: '42', value: '48' },
    ] },
    { type: 'note', fields: { kind: '가상의 집계', text: '작년과 올해 같은 달에 접수한 문의 수' } },
  ] },
  { id: 'visual-team-before-after', title: '가상 팀: 요청을 확인하고 처리하는 방식을 바꿔요', blocks: [
    { type: 'compare', variant: 'apart', fields: { leftTitle: '이전', rightTitle: '바꾼 뒤' }, items: [
      { title: '요청을 여러 곳에서 확인해요', body: '한 목록에서 모아 봐요' },
      { title: '담당자를 매번 찾아요', body: '요청할 때 담당자를 정해요' },
      { title: '완료 여부를 따로 물어봐요', body: '진행 상태를 함께 확인해요' },
    ] },
    { type: 'note', fields: { kind: '시범 범위', text: '가상의 한 팀에서 4주 동안 확인해요' } },
  ] },
  { id: 'visual-sales-market', title: '가상 영업: 접근 가능한 범위부터 확인해요', blocks: [
    { type: 'market', fields: { heading: '가상의 대상 규모' }, items: [
      { title: '전체 대상', value: '1,000곳', body: '같은 업무를 하는 가상의 현장' },
      { title: '우선 접근', value: '200곳', body: '현재 지원할 수 있는 범위' },
      { title: '첫해 목표', value: '10곳', body: '우선 접근 범위의 5%' },
    ] },
    { type: 'note', fields: { kind: '가정', text: '이 숫자는 설명을 위한 가상의 예시예요' } },
  ] },
  { id: 'visual-titleless-result', title: '가상 결과: 제목과 아래 표시 없이 보여요', hideHead: true, hideFoot: true, blocks: [
    { type: 'number', fields: { label: '한 사람이 아끼는 시간', value: '3시간', note: '가상의 회의 시간이 9시간에서 6시간으로' } },
    { type: 'bullets', fields: { heading: '먼저 바꾼 것' }, items: [
      { title: '자료를 한 양식으로 모았어요' }, { title: '회의 전에 요점을 공유했어요' }, { title: '남은 질문만 함께 살폈어요' },
    ] },
  ] },
  { id: 'visual-education-share', title: '가상 교육: 실습에 가장 많은 시간을 써요', blocks: [
    { type: 'share', fields: { unit: '분' }, items: [
      { title: '설명', value: '20' }, { title: '실습', value: '50' }, { title: '질문', value: '20' },
    ] },
    { type: 'quote', fields: { quote: '직접 해 볼 때 가장 쉽게 이해했어요', by: '가상의 참여자' } },
  ] },
  { id: 'visual-development-trend', title: '가상 개발: 배포 뒤 오류를 줄여 가고 있어요', blocks: [
    { type: 'trend', fields: { unit: '건', target: '5' }, items: [
      { title: '1주', value: '14' }, { title: '2주', value: '11' }, { title: '3주', value: '8' }, { title: '4주', value: '5' },
    ] },
    { type: 'facts', fields: { heading: '가상의 점검 기준' }, items: [
      { title: '범위', body: '같은 기능에서 접수된 오류' }, { title: '주기', body: '배포 후 한 주마다 확인' },
    ] },
  ] },
  { id: 'visual-heat', title: '가상 운영: 오후에 문의가 더 많이 모여요', blocks: [
    { type: 'heat', fields: { heading: '시간대별 가상 문의', cols: '월 화 수 목', unit: '건' }, items: [{ title: '오전', value: '8, 10, 9, 11' }, { title: '오후', value: '18, 20, 17, 21' }, { title: '저녁', value: '6, 7, 8, 7' }] },
    { type: 'note', fields: { kind: '다음 대응', text: '오후에 담당 인력을 보강해요' } },
  ] },
  { id: 'visual-alternatives', title: '가상 제안: 준비 부담과 확대 가능성을 함께 비교해요', blocks: [
    { type: 'rating', fields: { heading: '두 방식 비교', opts: '작게 시작, 한 번에 확대', pick: '작게 시작' }, items: [{ title: '준비 부담', body: '좋음 보통' }, { title: '빠른 시작', body: '좋음 나쁨' }, { title: '한 번에 적용', body: '보통 좋음' }] },
    { type: 'callout', fields: { label: '제안', text: '한 구간에서 먼저 확인해요' } },
  ] },
  { id: 'visual-plan', title: '가상 프로젝트: 준비와 점검을 네 달에 나눠요', blocks: [
    { type: 'gantt', fields: { heading: '가상의 추진 일정', cols: '1월, 2월, 3월, 4월', now: '2월' }, items: [{ title: '현황 확인', body: '1월', meta: '운영 담당' }, { title: '시범 준비', body: '1월~2월', meta: '준비 담당' }, { title: '시범 운영', body: '2월~3월', meta: '참여 팀' }, { title: '결과 점검', body: '4월', meta: '전체' }] },
    { type: 'note', fields: { text: '가상의 일정이며 결과를 보고 다음 범위를 정해요' } },
  ] },
  { id: 'visual-demo', title: '가상 시연: 필요한 정보를 한 화면에서 찾아요', blocks: [
    { type: 'image', fields: { image: sampleBlock('image').fields.image, caption: '가상의 화면 예시' } },
    { type: 'bullets', fields: { heading: '시연 순서' }, items: [{ title: '오늘 처리할 항목을 확인해요' }, { title: '담당자와 진행 상태를 살펴봐요' }, { title: '확인이 필요한 항목을 열어요' }] },
  ] },
  { id: 'visual-progress-wording', title: '가상 프로젝트: 준비와 진행 상황을 함께 살펴요', blocks: [
    { type: 'progress', variant: 'board', fields: {}, items: [
      { title: '기초 조사', value: '100%', body: '완료' },
      { title: '시범 준비', value: '60%', body: '지연 없이 진행 중' },
      { title: '자료 검토', value: '40%', body: '2주 지연' },
    ] },
    { type: 'note', fields: { kind: '확인 기준', text: '가상의 일정과 진행률을 함께 살펴봐요' } },
  ] },
]

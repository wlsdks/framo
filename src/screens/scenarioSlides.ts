import { autoPlace, composeAreaH } from '../deck/blocks'
import { sampleBlock } from '../deck/blockSamples'
import { makeSlide } from '../deck/generate'
import type { Block, BlockType, Item, Slide } from '../deck/types'
import { salesScenarios } from './salesScenarios'
import { visualScenarios } from './visualScenarios'

// 실제 자료가 아닌 가상 상황. 같은 조합을 테마와 글자 크기마다 반복해 견주기 위한 개발용 갤러리다.
type Spec = { type: BlockType; fields: Record<string, string>; items?: Partial<Item>[]; variant?: string }
type Scenario = { id: string; title: string; blocks: Spec[]; hideHead?: boolean; hideFoot?: boolean }
type Look = Parameters<typeof composeAreaH>[1]

const scenarios: Scenario[] = [
  { id: 'sales', title: '가상 영업: 제안할 범위를 먼저 맞춰요', blocks: [
    { type: 'number', fields: { label: '시범 운영', value: '8주', note: '한 곳에서 먼저 확인해요' } },
    { type: 'bullets', fields: { heading: '제안 범위' }, items: [{ title: '현장 흐름과 처리량 확인' }, { title: '분류 구간 한 곳에서 시범 운영' }, { title: '결과를 함께 검토하고 확대 여부 논의' }] },
    { type: 'callout', fields: { label: '다음 단계', text: '현장을 함께 살펴볼 날짜를 정해요' } },
  ] },
  { id: 'development', title: '가상 개발: 주문 처리 지연을 줄였어요', blocks: [
    { type: 'trend', fields: { unit: '분', target: '5' }, items: [{ title: '월', value: '12' }, { title: '화', value: '9' }, { title: '수', value: '7' }, { title: '목', value: '4' }, { title: '금', value: '3' }] },
    { type: 'bullets', fields: { heading: '다음 점검' }, items: [{ title: '대기열 증가를 더 일찍 알려요' }, { title: '처리 재시도와 중복 여부를 확인해요' }] },
  ] },
  { id: 'team', title: '가상 팀: 새로 합류한 분을 맞이해요', blocks: [
    { type: 'checks', fields: { heading: '첫 주 준비' }, items: [{ title: '계정과 장비 준비', body: '완료', meta: '운영 담당, 첫날 전' }, { title: '함께할 사람 소개', body: '진행 중', meta: '팀원, 첫 주' }, { title: '첫 과제 함께 정하기', body: '예정', meta: '담당자, 첫 주' }] },
    { type: 'callout', fields: { label: '도움이 필요할 때', text: '궁금한 점은 짝꿍에게 언제든 물어봐요' } },
  ] },
  { id: 'lecture', title: '가상 강의: 키보드로도 쓸 수 있는 화면', blocks: [
    { type: 'text', fields: { heading: '먼저 해 볼 일', body: '마우스를 내려놓고 탭 키만으로 메뉴와 입력란을 차례로 이동해 봐요.' } },
    { type: 'bullets', fields: { heading: '살펴볼 점' }, items: [{ title: '현재 위치를 눈으로 찾을 수 있나요?' }, { title: '버튼을 키보드로 누를 수 있나요?' }, { title: '화면 밖으로 초점이 사라지지 않나요?' }] },
  ] },
  { id: 'external', title: '가상 사외 제안: 작은 범위에서 함께 확인해요', blocks: [
    { type: 'facts', fields: { heading: '시범 운영' }, items: [{ title: '기간', body: '준비를 포함해 8주' }, { title: '대상', body: '분류 구간 한 곳' }, { title: '결과', body: '처리 시간과 오류 건수를 함께 확인' }] },
    { type: 'bullets', fields: { heading: '별도 논의' }, items: [{ title: '다른 현장으로 확대하는 시점' }, { title: '시범 이후 유지 관리 방식' }] },
  ] },
  { id: 'report', title: '가상 결과 보고: 문의를 더 빨리 해결해요', blocks: [
    { type: 'delta', fields: { label: '평균 처리 시간', before: '4일', after: '2일', note: '시범 운영 전후 각 4주' } },
    { type: 'number', fields: { label: '한 번에 해결', value: '78%', note: '가상의 문의 200건 기준' } },
  ] },
  { id: 'community', title: '가상 모임: 참여자와 일정을 준비해요', blocks: [
    { type: 'steps', fields: { label: '준비 순서' }, items: [{ title: '주제 정하기' }, { title: '참가 신청' }, { title: '모임 진행' }, { title: '의견 나누기' }] },
    { type: 'facts', fields: { heading: '모임 개요' }, items: [{ title: '일시', body: '토요일 오후 2시' }, { title: '대상', body: '관심 있는 누구나' }, { title: '준비물', body: '필기할 도구' }] },
  ] },
  { id: 'research', title: '가상 조사: 서로 다른 의견을 함께 살펴요', blocks: [
    { type: 'quote', fields: { quote: '처음 쓰는 사람도 어디서 시작할지 바로 알 수 있으면 좋겠어요', by: '가상의 참여자' } },
    { type: 'bullets', fields: { heading: '다음 조사' }, items: [{ title: '처음 화면에서 막히는 지점 찾기' }, { title: '다른 안내 문구 두 가지 비교하기' }] },
  ] },
]

export function scenarioSlides(look?: Look): Slide[] {
  return [...scenarios, ...salesScenarios, ...visualScenarios].map(({ id, title, blocks: specs, hideHead, hideFoot }) => {
    const base = makeSlide('compose')
    const slide: Slide = { ...base, id: `scenario-${id}`, fields: { title }, options: { ...base.options, ...(hideHead ? { hideHead: true } : {}), ...(hideFoot ? { hideFoot: true } : {}) } }
    const area = composeAreaH(slide, look, true)
    let blocks: Block[] = []
    specs.forEach((spec, i) => {
      const sample = sampleBlock(spec.type)
      const id = `scenario-${slide.id}-${i}`
      const items = spec.items?.map((item, n) => ({ id: `${id}-${n}`, title: '', body: '', value: '', meta: '', image: '', ...item })) ?? []
      const placed = autoPlace(blocks, { ...sample, id, fields: spec.fields, items, ...(spec.variant ? { variant: spec.variant } : {}) }, area)
      if (!placed) throw new Error(`가상 상황 ${slide.id}에 ${spec.type}을 넣을 수 없습니다`)
      blocks = placed
    })
    return { ...slide, blocks }
  })
}

import { BLOCKS, boardAreaH, boardFit, boardFromRows, composeFrom } from './blocks'
import { emptyItem, makeSlide } from './generate'
import { createSampleDeck, SAMPLE_LOGOS } from './sample'
import type { Block, BlockType, Item, Slide } from './types'

/*
 * 레이아웃마다 내용을 채운 예시 장. 장 모음 화면과 개발용 갤러리가 같이 쓴다.
 * 예시 발표(sample.ts)에 없는 레이아웃을 채운다. 회사, 사람, 숫자는 모두 지어낸 것이다.
 */

export function withItems(slide: Slide, items: Partial<Item>[], fields: Record<string, string> = {}): Slide {
  return { ...slide, fields: { ...slide.fields, ...fields }, items: items.map((it) => ({ ...emptyItem(), ...it })) }
}

export function withOptions(slide: Slide, options: Slide['options']): Slide {
  return { ...slide, options: { ...slide.options, ...options } }
}

export function extraSlides(): Slide[] {
  return [
    withOptions(withItems(
      makeSlide('bars'),
      [
        { title: '1분기', value: '96' },
        { title: '2분기', value: '104' },
        { title: '3분기', value: '131', meta: '새 설비 2대 반영' },
        { title: '목표', value: '117' },
      ],
      { title: '3분기 생산이 목표보다 12% 많았어요', lead: '2공장, 출하 검사 통과 기준', unit: '만 개', source: '생산관리 시스템, 9월 말 기준' },
    ), { highlight: 2 }),
    withItems(
      makeSlide('versus'),
      [
        { title: '1분기', meta: '96', value: '104' },
        { title: '2분기', meta: '101', value: '98' },
        { title: '3분기', meta: '108', value: '131' },
        { title: '4분기', meta: '117', value: '136' },
      ],
      { title: '3분기부터 작년보다 20% 넘게 늘었어요', lead: '지원센터, 전화와 채팅 합계', metaTitle: '작년', valueTitle: '올해', unit: '백 건', source: '상담관리 시스템, 9월 말 기준 (4분기는 예상치)' },
    ),
    withItems(
      makeSlide('scorecard'),
      [
        { title: '채용', meta: '117명', value: '131명', body: '공채 두 번으로 채움' },
        { title: '교육 시간', meta: '14시간', value: '15.2시간' },
        { title: '경력 채용', meta: '5명', value: '4명', body: '1명은 4분기로 넘어감' },
        { title: '근속률', meta: '90%', value: '93%' },
      ],
      { title: '네 지표 중 세 개가 목표를 넘었어요', source: '인사관리 시스템, 9월 말 기준' },
    ),
    withItems(
      makeSlide('bridge'),
      [
        { title: '전기료 절감', value: '+9', meta: '설비 2대' },
        { title: '물류 통합', value: '+7' },
        { title: '원자재 값 인상', value: '-2', meta: '1곳 인상' },
      ],
      {
        title: '전기료와 물류로 목표보다 14억 원 더 아꼈어요',
        startTitle: '목표',
        startValue: '117',
        endTitle: '실적',
        unit: '억 원',
        source: '원가관리 시스템, 9월 말 기준',
      },
    ),
    withItems(
      makeSlide('trend'),
      [
        { title: '4월', value: '96' },
        { title: '5월', value: '101' },
        { title: '6월', value: '99' },
        { title: '7월', value: '108' },
        { title: '8월', value: '117' },
        { title: '9월', value: '131' },
      ],
      { title: '여름부터 수강이 꾸준히 늘었어요', lead: '온라인 과정 2개를 8월부터 열었어요', unit: '명', target: '115', source: '교육관리 시스템, 9월 말 기준' },
    ),
    withItems(
      makeSlide('progress'),
      [
        { title: '신청 화면 만들기', meta: '정보기술팀, 10월', value: '100%', body: '완료' },
        { title: '규정 정리', meta: '인사팀, 11월', value: '80%', body: '진행 중' },
        { title: '승인 단계 줄이기', meta: '지원본부, 11월', value: '40%', body: '2주 지연' },
        { title: '직원 교육', meta: '교육팀, 12월', value: '20%', body: '진행 중' },
        { title: '효과 점검', meta: '경영기획팀, 1월', value: '0%', body: '예정' },
      ],
      { title: '다섯 과제 중 하나가 2주 늦어지고 있어요', source: '10월 3주 기준' },
    ),
    withItems(
      makeSlide('share'),
      [
        { title: '급여', value: '58', meta: '신규 2명 포함' },
        { title: '시설', value: '39' },
        { title: '운영', value: '21' },
        { title: '교육', value: '13' },
      ],
      { title: '비용의 절반 가까이가 급여에서 나와요', unit: '억 원', source: '회계 시스템, 9월 말 기준' },
    ),
    withOptions(withItems(
      makeSlide('process'),
      [
        { title: '요청 접수', meta: '요청한 팀, 당일', body: '구매 요청을 시스템에 남겨요' },
        { title: '업체 고르기', meta: '구매 담당, 하루', body: '업체 목록에서 바로 견줘 골라요' },
        { title: '검토와 승인', meta: '팀장, 반나절', body: '세 단계를 한 번으로 줄여요' },
        { title: '주문 넣기', meta: '구매 담당, 당일', body: '정해진 양식으로 보내요' },
      ],
      { title: '요청에서 주문까지 네 단계, 이틀이면 돼요', lead: '지금은 같은 일에 닷새가 걸려요' },
    ), { highlight: 2 }),
    withItems(
      makeSlide('funnel'),
      [
        { title: '지원', value: '120', meta: '공고와 추천' },
        { title: '서류', value: '48' },
        { title: '면접', value: '20' },
        { title: '합격', value: '9', meta: '평균 5년 차' },
      ],
      { title: '서류를 통과한 다섯 중 한 명이 합격했어요', unit: '명', source: '채용관리 시스템, 1~9월' },
    ),
    withOptions(withItems(
      makeSlide('table'),
      [
        { title: '보고 양식 통일', meta: '경영기획팀', value: '11월', body: '팀마다 다른 양식을 하나로' },
        { title: '규정집 공유', meta: '인사팀', value: '12월', body: '분기마다 새로 올림' },
        { title: '승인 단계 줄이기', meta: '지원본부', value: '1월', body: '세 단계를 두 단계로' },
        { title: '효과 점검', meta: '경영기획팀', value: '2월', body: '보고 한 건에 드는 시간을 다시 잼' },
      ],
      { title: '네 가지를 2월까지 끝내요', h1: '과제', h2: '담당', h3: '기한', h4: '비고' },
    ), { highlight: 0 }),
    withItems(
      makeSlide('table'),
      [
        { title: '수도권', meta: '58억 원', value: '+14%', body: '신규 고객 2곳' },
        { title: '충청권', meta: '31억 원', value: '+6%' },
        { title: '영남권', meta: '27억 원', value: '−3%', body: '큰 계약 1건이 4분기로' },
        { title: '호남권', meta: '15억 원', value: '+2%' },
        { title: '합계', meta: '131억 원', value: '+7%' },
      ],
      { title: '수도권이 전체 성장을 이끌었어요', h1: '권역', h2: '3분기 매출', h3: '지난해보다', h4: '비고', source: '영업관리 시스템, 9월 말 기준' },
    ),
    withItems(
      makeSlide('position'),
      [
        { title: '모아워크', value: '8', meta: '8', body: '3개월, 결재까지 함께' },
        { title: '한결메신저', value: '5', meta: '3', body: '6개월, 대화만' },
        { title: '누리오피스', value: '7', meta: '4' },
        { title: '지금 도구', value: '3', meta: '6' },
      ],
      { title: '기능과 도입 속도 모두 앞서는 것은 모아워크예요', xAxis: '기능이 많음', yAxis: '도입이 빠름', source: '각 사 제안서와 공개 자료, 10월 기준' },
    ),
    withItems(
      makeSlide('matrix'),
      [
        { title: '틈틈이 하기', body: '신청 양식 통일, 규정집 공유 폴더' },
        { title: '바로 하기', body: '신청 화면 정리, 승인 단계 줄이기' },
        { title: '미루기', body: '외부 인사 시스템 도입' },
        { title: '계획해서 하기', body: '부서별 신청 이력 관리' },
      ],
      { title: '쉽고 효과가 큰 두 가지부터 시작해요', yAxis: '실행하기 쉬움', xAxis: '효과가 큼' },
    ),
    withItems(makeSlide('kpi'), [{ value: '112%', title: '3분기 목표 달성률', body: '목표 117억 원, 실적 131억 원' }], {
      title: '3분기 목표를 넘겼어요',
    }),
    withItems(
      makeSlide('case'),
      [
        { value: '38%', title: '검사 시간 단축' },
        { value: '3개월', title: '구축 기간' },
      ],
      {
        client: '가상의 자동차 부품 업체',
        title: '같은 방식으로 작년에 바꿔서 3개월 만에 자리 잡았어요',
        body: '검사 자동화와 원인 분석을 함께 들였고, 다른 안보다 15% 비쌌지만 짧은 구축 기간으로 정했어요.',
        quote: '라인을 세우지 않고 바꿀 수 있다는 점이 결정적이었어요.',
        image: SAMPLE_LOGOS[0],
      },
    ),
    withItems(
      makeSlide('logos'),
      SAMPLE_LOGOS.map((image) => ({ image })),
      { title: '함께 일하는 협력사' },
    ),
    composeExample(),
  ]
}

/** 부품 장만의 부품에 지어낸 예시 내용을 채운 것 */
export function nativeSample(type: BlockType, extra: Partial<Block> = {}): Block {
  const spec = BLOCKS[type]
  const items = (spec.sample?.items ?? Array.from({ length: spec.items?.default ?? 0 }, () => ({}))).map((it) => ({ ...emptyItem(), ...it }))
  return { id: `sample-${type}`, type, fields: { ...spec.sample?.fields }, items, ...(spec.sample?.variant ? { variant: spec.sample.variant } : {}), ...extra }
}

/** 부품 장의 예시: 전과 후, 큰 숫자, 결정 요청을 한 줄에, 아래에 추이와 다음 단계 */
function composeExample(): Slide {
  const trend = composeFrom(
    withItems(
      makeSlide('trend'),
      ['3.2', '3.0', '2.1', '1.6', '1.3', '1.1'].map((value, i) => ({ title: `${i + 4}월`, value })),
      { unit: '%' },
    ),
  ).blocks![0]
  const slide: Slide = {
    ...makeSlide('compose'),
    // 출처 줄은 빼 둔다: 위 줄(전과 후, 큰 숫자, 강조 상자)과 아래 줄(추이 차트의 바닥 높이)이 본문 높이를 다 써서,
    // 출처 한 줄만큼 줄 높이를 줄이면 전과 후의 덧붙임 글이 칸 밖으로 나왔다(편집기가 '글이 넘쳤어요'를 띄웠다)
    fields: { title: '시범 라인 석 달 만에 불량률이 3분의 1로 줄었어요' },
  }
  // 줄로 적어 두고 판으로 옮긴다 (위 줄 셋, 아래 줄은 추이 차트가 3분의 2)
  const rows = [
    {
      id: 'sample-row-1',
      blocks: [
        { ...nativeSample('delta'), id: 'sample-delta', fields: { label: '불량률', before: '3.2%', after: '1.1%', note: '시범 라인 3개월 결과' } },
        { ...nativeSample('number'), id: 'sample-number', fields: { label: '한 해 아끼는 비용', value: '2.4억 원', note: '불량 처리와 재검사 비용' } },
        { ...nativeSample('callout'), id: 'sample-callout', fields: { label: '결정 요청', text: '12월까지 나머지 라인으로 넓히는 것을 승인해 주세요' } },
      ],
    },
    {
      id: 'sample-row-2',
      spans: [8, 4],
      blocks: [
        { ...trend, id: 'sample-trend' },
        {
          ...nativeSample('bullets'),
          id: 'sample-bullets',
          fields: { heading: '다음 단계' },
          items: ['11월 나머지 5개 라인 진단', '12월 카메라 설치', '1월 전 라인 가동'].map((title) => ({ ...emptyItem(), title })),
        },
      ],
    },
  ]
  return { ...slide, blocks: boardFromRows(rows, boardFit(boardAreaH(slide))) }
}

/** 예시 발표의 장과 덧붙인 예시 장. 모든 레이아웃이 적어도 한 번 나온다. */
export function showcaseSlides(): Slide[] {
  return [...createSampleDeck().slides, ...extraSlides()]
}

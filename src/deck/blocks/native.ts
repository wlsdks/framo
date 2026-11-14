// 부품 장에만 있는 부품의 정의와 예시 내용

import { CINE_FIELD_SPECS, presetSpec } from '../cine'
import { SAMPLE_IMAGE } from '../sampleImage'
import type { NativeBlockType } from '../types'
import type { BlockSpec } from './catalog'

export const NATIVE: Record<NativeBlockType, Omit<BlockSpec, 'type'>> = {
  message: {
    name: '핵심 한 줄',
    description: '듣는 분이 기억할 한 문장을 크게',
    motion: '낱말마다 차례로 올라와요',
    fields: [
      { key: 'text', label: '핵심 문장', hint: '듣는 분이 기억할 한 문장', multiline: true },
      { key: 'sub', label: '덧붙이는 말', hint: '뒷받침하는 한 줄', optional: true, multiline: true },
    ],
    minSpan: 6,
    prefSpan: 12,
    sample: { fields: { text: '주간 보고 양식을 하나로 맞춰요', sub: '팀마다 다른 양식을 다시 정리하는 일이 없도록' } },
  },
  text: {
    name: '제목과 글',
    description: '소제목 아래 두세 문장',
    motion: '소제목, 글 차례로 올라와요',
    fields: [
      { key: 'label', label: '작은 제목', hint: '소제목 위 작은 글 (예: 대상)', optional: true },
      { key: 'heading', label: '소제목', hint: '요점 한 줄', optional: true, multiline: true },
      { key: 'body', label: '글', hint: '설명을 두세 문장으로', multiline: true },
    ],
    minSpan: 4,
    prefSpan: 6,
    sample: { fields: { heading: '배포 시간을 줄여요', body: '사람이 손으로 하던 배포 전 점검을 자동 시험이 먼저 걸러요. 개발자는 실패한 항목만 다시 봐요.' } },
  },
  bullets: {
    name: '점 목록',
    description: '요점을 줄마다 하나씩',
    motion: '줄마다 차례로 들어와요',
    fields: [{ key: 'heading', label: '소제목', hint: '목록의 요점 한 줄', optional: true }],
    items: {
      label: '줄',
      min: 1,
      max: 6,
      default: 3,
      fields: [
        { key: 'title', label: '요점', hint: '요점 한 줄', multiline: true },
        { key: 'body', label: '설명', hint: '덧붙이는 설명', optional: true, multiline: true },
      ],
    },
    minSpan: 4,
    prefSpan: 6,
    sample: {
      fields: { heading: '먼저 바꿀 것' },
      items: [{ title: '주문이 많은 3개 품목부터' }, { title: '단가 기록을 한곳에 모아요' }, { title: '분기마다 효과를 다시 봐요' }],
    },
  },
  quote: {
    name: '인용',
    description: '동료나 현장에서 들은 한마디',
    motion: '따옴표가 먼저, 글이 뒤따라요',
    fields: [
      { key: 'quote', label: '인용할 말', hint: '그대로 옮길 한마디', multiline: true },
      // 말한 사람은 접어 두지 않는다: 누구의 말인지 없으면 굵은 글 한 덩이로만 보여 인용으로 읽히지 않았다.
      // 다만 출처를 밝히지 않는 인용도 흔해서 빈칸으로 세지는 않는다(채우라고 재촉하지 않게)
      { key: 'by', label: '말한 사람', hint: '누가 말했는지 (예: 시범 부서 팀장)', optional: true, shown: true },
    ],
    minSpan: 4,
    prefSpan: 6,
    sample: { fields: { quote: '신청이 한곳에 모이니 교육 일정 잡기가 훨씬 편해졌어요', by: '시범 부서 교육 담당' } },
  },
  callout: {
    name: '강조 상자',
    description: '결정 요청이나 꼭 알아야 할 것',
    motion: '면이 펼쳐지고 글이 올라와요',
    fields: [
      { key: 'label', label: '제목', hint: '예: 결정 요청, 주의할 점', optional: true },
      { key: 'text', label: '강조할 내용', hint: '꼭 전할 내용을 한두 문장으로', multiline: true },
    ],
    minSpan: 3,
    prefSpan: 4,
    look: 'bold',
    sample: { fields: { label: '결정 요청', text: '신입 교육 담당 2명을 11월부터 지원해 주세요' } },
  },
  number: {
    name: '큰 숫자',
    description: '숫자 하나를 크게',
    motion: '숫자가 자리마다 굴러가 맞춰져요',
    fields: [
      { key: 'label', label: '무엇의 숫자', hint: '무엇의 숫자인지' },
      { key: 'value', label: '숫자', hint: '3.6억 원' },
      { key: 'note', label: '보충 설명', hint: '짧은 설명 (예: 3년이면 10.8억 원)', optional: true, multiline: true },
    ],
    minSpan: 3,
    prefSpan: 4,
    sample: { fields: { value: '3.6억 원', label: '줄어드는 전기료', note: '3년이면 10.8억 원' } },
  },
  delta: {
    name: '전과 후',
    description: '바뀌기 전과 뒤의 숫자, 얼마나 달라지는지',
    motion: '전에서 후로, 차이가 튀어나와요',
    fields: [
      { key: 'label', label: '무엇이 바뀌는지', hint: '무엇이 바뀌는지 (예: 이직률)' },
      { key: 'before', label: '전', hint: '8.4%' },
      { key: 'after', label: '후', hint: '5.1%' },
      { key: 'note', label: '보충 설명', hint: '기준 (예: 도입 1년 뒤)', optional: true },
    ],
    minSpan: 4,
    prefSpan: 6,
    sample: { fields: { label: '이직률', before: '8.4%', after: '5.1%', note: '새 제도 도입 1년 결과' } },
  },
  goal: {
    name: '목표 대비',
    description: '목표에 얼마나 왔는지 막대로',
    motion: '막대가 목표를 향해 자라요',
    fields: [
      { key: 'label', label: '무엇의 목표', hint: '무엇의 목표인지 (예: 연간 절감)' },
      { key: 'value', label: '지금', hint: '7.2' },
      { key: 'target', label: '목표', hint: '10' },
      { key: 'unit', label: '단위', hint: '억 원', optional: true },
      { key: 'note', label: '보충 설명', hint: '짧은 설명', optional: true },
    ],
    minSpan: 4,
    prefSpan: 6,
    sample: { fields: { label: '연간 절감', value: '7.2', target: '10', unit: '억 원', note: '4분기 과제 3건이 남았어요' } },
  },
  ring: {
    name: '비율 원',
    description: '비율 하나를 원으로 크게 (달성률, 만족도)',
    motion: '원이 차오르며 숫자가 올라가요',
    variants: [
      { id: 'base', name: '원' },
      { id: 'gauge', name: '반원 게이지' },
    ],
    fields: [
      { key: 'label', label: '무엇의 비율', hint: '무엇의 비율인지 (예: 첫 상담 해결률)' },
      { key: 'value', label: '비율', hint: '72%' },
      { key: 'note', label: '보충 설명', hint: '짧은 설명 (예: 지난해 41%)', optional: true, multiline: true },
    ],
    minSpan: 3,
    prefSpan: 4,
    sample: { fields: { label: '상담원 한 번에 끝낸 문의', value: '72%', note: '지난해에는 41%였어요' } },
  },
  ratio: {
    name: '몇 중 몇',
    description: '전체 가운데 몇인지 점으로 (10곳 중 7곳)',
    motion: '점이 하나씩 채워져요',
    fields: [
      { key: 'label', label: '무엇을 센 것', hint: '무엇을 센 것인지 (예: 새 점검표를 쓰는 공장)' },
      { key: 'value', label: '몇', hint: '7' },
      { key: 'total', label: '전체', hint: '10' },
      { key: 'unit', label: '단위', hint: '곳', optional: true },
      { key: 'note', label: '보충 설명', hint: '짧은 설명', optional: true, multiline: true },
    ],
    minSpan: 4,
    prefSpan: 6,
    sample: { fields: { label: '점검표를 새로 바꾼 공장', value: '7', total: '10', unit: '곳', note: '나머지 3곳은 1분기에 바꿔요' } },
  },
  spark: {
    name: '숫자와 흐름',
    description: '지금 숫자와 그동안의 흐름을 작은 선으로',
    motion: '선이 그려지고 숫자가 올라가요',
    fields: [
      { key: 'label', label: '무엇의 숫자', hint: '무엇의 숫자인지 (예: 월 오류율)' },
      { key: 'value', label: '지금 숫자', hint: '1.1%' },
      { key: 'series', label: '흐름', hint: '3.2, 3.0, 2.1, 1.6, 1.1' },
      { key: 'note', label: '보충 설명', hint: '기간이나 기준 (예: 5월부터 9월까지)', optional: true },
    ],
    minSpan: 3,
    prefSpan: 4,
    sample: { fields: { label: '월 오류율', value: '1.1%', series: '3.2, 3.0, 2.1, 1.6, 1.3, 1.1', note: '4월부터 9월까지' } },
  },
  facts: {
    name: '개요',
    description: '기간, 예산, 담당처럼 항목과 내용을 짝지어',
    motion: '줄마다 차례로 들어와요',
    fields: [{ key: 'heading', label: '소제목', hint: '예: 과제 개요', optional: true }],
    items: {
      label: '줄',
      min: 1,
      max: 6,
      default: 4,
      fields: [
        { key: 'title', label: '항목', hint: '항목', hints: ['기간', '예산', '대상', '담당', '효과', '다음 보고'] },
        { key: 'body', label: '내용', hint: '내용 한 줄', multiline: true },
      ],
    },
    minSpan: 4,
    prefSpan: 6,
    sample: {
      fields: { heading: '이전 개요' },
      items: [
        { title: '기간', body: '11월부터 1월까지, 3개월' },
        { title: '예산', body: '2.4억 원 (공사 1.6억, 이사 0.8억)' },
        { title: '대상', body: '본사 사무실 3개 층' },
        { title: '담당', body: '총무팀 2명, 정보보안팀 1명' },
      ],
    },
  },
  risks: {
    name: '걱정과 대책',
    description: '걱정할 만한 점과 막는 방법을 짝지어',
    motion: '걱정 다음에 대책이 따라 들어와요',
    fields: [{ key: 'heading', label: '소제목', hint: '예: 걱정되는 점과 대책', optional: true }],
    items: {
      label: '걱정',
      min: 1,
      max: 4,
      default: 3,
      fields: [
        { key: 'title', label: '걱정되는 점', hint: '걱정되는 점', multiline: true },
        { key: 'body', label: '대책', hint: '이렇게 막아요', multiline: true },
      ],
    },
    minSpan: 6,
    prefSpan: 12,
    sample: {
      fields: {},
      items: [
        { title: '옮기는 동안 시스템이 멈춰요', body: '주말 이틀씩 나눠 옮겨 평일 업무는 그대로' },
        { title: '옮긴 자료 일부가 빠질 수 있어요', body: '첫 달은 예전 시스템과 같이 돌려 빠진 것을 맞춰 봐요' },
        { title: '직원들이 새 화면을 낯설어해요', body: '부서마다 담당 1명을 먼저 가르쳐 옆에서 돕게 해요' },
      ],
    },
  },
  swot: {
    name: '강점과 약점',
    description: '강점, 약점, 기회, 위협을 네 칸에 (SWOT)',
    motion: '네 칸이 차례로 나타나요',
    fields: [{ key: 'heading', label: '소제목', hint: '예: 새 제도의 강점과 약점', optional: true }],
    items: {
      label: '칸',
      min: 4,
      max: 4,
      default: 4,
      fields: [
        { key: 'title', label: '칸 이름', hint: '칸 이름', hints: ['강점', '약점', '기회', '위협'] },
        {
          key: 'body',
          label: '내용',
          hint: '한두 줄로',
          hints: ['우리가 잘하는 것', '우리가 모자란 것', '밖에서 오는 좋은 일', '밖에서 오는 걱정거리'],
          multiline: true,
        },
      ],
    },
    minSpan: 6,
    prefSpan: 12,
    sample: {
      fields: { heading: '새 근무제의 강점과 약점' },
      items: [
        { title: '강점', body: '출퇴근 시간을 고를 수 있는 곳이 드물어요' },
        { title: '약점', body: '팀끼리 회의 시간을 맞추기가 더 어려워요' },
        { title: '기회', body: '채용 공고에 내세우면 지원자가 늘 수 있어요' },
        { title: '위협', body: '경쟁사도 같은 제도를 낼 수 있어요' },
      ],
    },
  },
  faq: {
    name: '예상 질문',
    description: '받을 만한 질문과 짧은 답을 미리',
    motion: '질문이 먼저, 답이 뒤따라요',
    fields: [{ key: 'heading', label: '소제목', hint: '예: 예상 질문', optional: true }],
    items: {
      label: '질문',
      min: 1,
      max: 4,
      default: 3,
      fields: [
        { key: 'title', label: '질문', hint: '받을 만한 질문', hints: ['왜 지금 해야 하나요?', '비용은 언제 되찾나요?', '다른 부서에도 쓸 수 있나요?', '안 하면 어떻게 되나요?'], multiline: true },
        { key: 'body', label: '답', hint: '짧은 답', multiline: true },
      ],
    },
    minSpan: 6,
    prefSpan: 12,
    sample: {
      fields: {},
      items: [
        { title: '왜 지금 해야 하나요?', body: '1분기에 외부 감사가 있어서 그 전에 증빙 기록을 갖춰야 해요' },
        { title: '비용은 언제 되찾나요?', body: '정산하는 시간이 줄어 14개월이면 도입비를 되찾아요' },
        { title: '다른 부서에도 쓸 수 있나요?', body: '같은 시스템을 써서 설정만 바꾸면 돼요' },
      ],
    },
  },
  checks: {
    name: '준비 상황',
    description: '할 일마다 완료, 진행 중, 지연, 예정을 표시',
    motion: '줄마다 표시가 찍혀요',
    fields: [{ key: 'heading', label: '소제목', hint: '예: 준비 상황', optional: true }],
    items: {
      label: '할 일',
      min: 1,
      max: 6,
      default: 4,
      fields: [
        { key: 'title', label: '할 일', hint: '할 일', hints: ['예산 승인', '업체 고르기', '참석자 초대', '자료 준비', '효과 점검', '결과 보고'] },
        { key: 'body', label: '상태', hint: '완료, 진행 중, 지연, 예정', hints: ['완료', '완료', '진행 중', '예정', '예정', '예정'], optional: true, shown: true },
        { key: 'meta', label: '담당과 기한', hint: '담당, 기한', optional: true },
      ],
    },
    minSpan: 4,
    prefSpan: 6,
    sample: {
      fields: { heading: '준비 상황' },
      items: [
        { title: '예산 승인', body: '완료', meta: '경영기획팀, 10월' },
        { title: '행사장 업체 고르기', body: '완료', meta: '총무팀, 10월' },
        { title: '참석자 초대하기', body: '진행 중', meta: '마케팅팀, 11월' },
        { title: '자료 준비', body: '1주 지연', meta: '기획팀, 11월' },
      ],
    },
  },
  gantt: {
    name: '추진 일정',
    description: '할 일마다 언제부터 언제까지 하는지 막대로 (간트 차트)',
    motion: '막대가 차례로 그어져요',
    fields: [
      { key: 'heading', label: '소제목', hint: '예: 추진 일정', optional: true },
      // 안내 문구가 편집할 때의 예시 칸이기도 해서, 설명 대신 쉼표로 나눈 꼴을 보여 준다 ('10월 1주, 10월 2주'처럼 띄어 쓴 이름도 되게)
      { key: 'cols', label: '기간 칸', hint: '11월, 12월, 1월, 2월, 3월' },
      // 머리 줄의 '지금' 이름 옆 좁은 칸이라 예시만: '지금이 어느 칸인지 (예: 11월)'는 두 줄로 꺾였다. 무엇을 적는지는 이름이 말한다
      { key: 'now', label: '지금', hint: '예: 12월', optional: true },
    ],
    items: {
      label: '할 일',
      // 할 일이 하나면 일정표가 아니라 한 줄 글이다
      min: 2,
      max: 6,
      default: 4,
      fields: [
        { key: 'title', label: '할 일', hint: '할 일', hints: ['업체 고르기', '화면 만들기', '직원 교육', '효과 점검', '결과 보고', '넓히기'] },
        { key: 'body', label: '기간', hint: '예: 12월~2월', hints: ['11월', '11월~12월', '1월', '2월~3월', '3월', '3월'] },
        { key: 'meta', label: '담당', hint: '담당', optional: true },
      ],
    },
    minSpan: 12,
    prefSpan: 12,
    sample: {
      fields: { heading: '추진 일정', cols: '11월 12월 1월 2월 3월', now: '12월' },
      items: [
        { title: '개발 업체 고르기', body: '11월', meta: '구매팀' },
        { title: '새 화면 만들기', body: '11월~12월', meta: '정보기술팀' },
        { title: '직원 교육', body: '1월', meta: '인사팀' },
        { title: '효과 점검과 보고', body: '2월~3월', meta: '경영기획팀' },
      ],
    },
  },
  people: {
    name: '맡은 사람',
    description: '누가 무엇을 맡는지 (추진 체계)',
    motion: '사람마다 이름부터 차례로 올라오고, 체계도는 선이 뻗어 이어져요',
    variants: [
      { id: 'row', name: '나란히' },
      { id: 'list', name: '목록' },
      { id: 'tree', name: '체계도' },
    ],
    fields: [{ key: 'heading', label: '소제목', hint: '예: 추진 체계', optional: true }],
    items: {
      label: '사람',
      min: 1,
      max: 4,
      default: 3,
      fields: [
        { key: 'title', label: '이름', hint: '이름과 직급' },
        { key: 'meta', label: '역할', hint: '역할', hints: ['과제 총괄', '챗봇 설정', '상담 품질', '예산 관리'] },
        { key: 'body', label: '맡은 일', hint: '맡은 일 한 줄', optional: true, multiline: true },
      ],
    },
    minSpan: 6,
    prefSpan: 12,
    sample: {
      fields: {},
      items: [
        { title: '한도윤 책임', meta: '과제 총괄', body: '일정과 예산, 윗분 보고' },
        { title: '서지우 선임', meta: '챗봇 설정', body: '질문마다 챗봇 답을 넣고 시험' },
        { title: '문하린 선임', meta: '상담 품질', body: '상담원 답과 결과 맞춰 보기' },
      ],
    },
  },
  image: {
    name: '이미지',
    description: '화면 캡처, 현장 사진, 도면',
    motion: '걷히듯 나타나요',
    variants: [
      { id: 'cover', name: '꽉 채우기' },
      { id: 'contain', name: '전체 보이기' },
    ],
    fields: [
      { key: 'image', label: '이미지', hint: '보여 줄 이미지', image: true },
      { key: 'caption', label: '설명', hint: '이미지 아래 한 줄', optional: true },
    ],
    minSpan: 3,
    prefSpan: 6,
    // 예시는 화면 캡처라 전체 보이기로 (넣을 때도 화면 캡처는 전체 보이기로 고른다)
    sample: { fields: { image: SAMPLE_IMAGE, caption: '새 분류 화면의 첫 화면' }, variant: 'contain' },
  },
  rating: {
    name: '평가표',
    description: '기준마다 여러 안을 좋음, 보통, 나쁨으로 견주어 (대안 평가)',
    motion: '기준마다 표시가 차례로 찍혀요',
    fields: [
      { key: 'heading', label: '소제목', hint: '예: 세 안 견주기', optional: true },
      { key: 'opts', label: '안', hint: 'A안 B안 C안' },
      { key: 'pick', label: '추천', hint: '추천하는 안 (예: B안)', optional: true },
    ],
    items: {
      label: '기준',
      // 기준이 하나면 표가 아니라 한 줄 글이다
      min: 2,
      max: 6,
      default: 4,
      fields: [
        { key: 'title', label: '기준', hint: '견주는 기준', hints: ['첫해 비용', '시간 줄이는 효과', '도입 기간', '익히는 부담', '다른 부서로 넓히기', '업체 지원'] },
        {
          key: 'body',
          label: '평가',
          hint: '안마다 좋음, 보통, 나쁨 (○ △ ×도 돼요)',
          hints: ['좋음 보통 나쁨', '나쁨 좋음 좋음', '좋음 좋음 나쁨', '보통 좋음 나쁨', '나쁨 좋음 보통', '보통 보통 좋음'],
        },
        { key: 'meta', label: '설명', hint: '기준 설명 한 줄', optional: true },
      ],
    },
    minSpan: 6,
    prefSpan: 8,
    sample: {
      fields: { heading: '세 안 견주기', opts: 'A안 B안 C안', pick: 'B안' },
      items: [
        { title: '첫해 비용', body: '좋음 보통 나쁨', meta: '1.9억, 2.4억, 3.1억 원' },
        { title: '시간 줄이는 효과', body: '나쁨 좋음 좋음' },
        { title: '도입 기간', body: '좋음 좋음 나쁨', meta: '2개월, 3개월, 6개월' },
        { title: '다른 부서로 넓히기', body: '나쁨 좋음 보통' },
      ],
    },
  },
  market: {
    name: '시장 규모',
    description: '전체 시장, 공략할 시장, 목표를 겹친 원으로 (TAM, SAM, SOM)',
    motion: '큰 원부터 차례로 겹쳐져요',
    fields: [{ key: 'heading', label: '소제목', hint: '예: 시장 규모', optional: true }],
    items: {
      label: '단계',
      min: 2,
      max: 3,
      default: 3,
      fields: [
        { key: 'title', label: '이름', hint: '시장 이름', hints: ['전체 시장', '공략할 시장', '3년 안 목표'] },
        { key: 'value', label: '규모', hint: '규모 (예: 2.4조 원)', hints: ['2.4조 원', '3,200억 원', '180억 원'] },
        { key: 'body', label: '설명', hint: '어떤 시장인지 한 줄', optional: true, multiline: true },
      ],
    },
    minSpan: 6,
    prefSpan: 8,
    sample: {
      fields: { heading: '시장 규모' },
      items: [
        { title: '전체 시장', value: '2.4조 원', body: '국내 기업 직무 교육 전체' },
        { title: '공략할 시장', value: '3,200억 원', body: '직원 300명이 넘는 중견기업' },
        { title: '3년 안 목표', value: '180억 원', body: '공략할 시장의 5.6%' },
      ],
    },
  },
  pareto: {
    name: '원인 순위',
    description: '많은 것부터 막대로, 누적 비율을 선으로 (파레토)',
    motion: '막대가 차례로 자라고, 누적 비율 선이 그어져요',
    // 가로 막대: 원인 이름이 길 때. 몫이 계단처럼 쌓여 어느 원인에서 80%를 넘는지 줄로 보인다
    variants: [
      { id: 'base', name: '세로 막대' },
      { id: 'rows', name: '가로 막대' },
    ],
    fields: [
      { key: 'heading', label: '소제목', hint: '예: 9월 불량 원인', optional: true },
      { key: 'unit', label: '단위', hint: '건', optional: true },
    ],
    items: {
      label: '원인',
      // 둘이면 순위가 아니라 비교다
      min: 3,
      max: 8,
      default: 5,
      fields: [
        { key: 'title', label: '원인', hint: '많은 것부터', hints: ['납땜 불량', '부품 누락', '이물질', '치수 오차', '기타', '포장 파손', '라벨 오류', '도장 불량'] },
        { key: 'value', label: '수', hint: '412', hints: ['412', '236', '118', '64', '40', '28', '16', '9'] },
      ],
    },
    minSpan: 6,
    prefSpan: 8,
    sample: {
      fields: { heading: '9월 불량 원인 (870건)', unit: '건' },
      items: [
        { title: '납땜 불량', value: '412' },
        { title: '부품 누락', value: '236' },
        { title: '이물질', value: '118' },
        { title: '치수 오차', value: '64' },
        { title: '기타', value: '40' },
      ],
    },
  },
  attain: {
    name: '기간별 달성',
    description: '기간마다 실적 막대와 목표 표시. 못 미친 기간이 바로 보여요',
    motion: '막대가 차례로 자라고, 목표 표시가 그어져요',
    // 목표와의 차이: 목표를 기준선으로 두고 넘은 만큼 위로, 모자란 만큼 아래로 (계획 대비 편차)
    variants: [
      { id: 'base', name: '실적과 목표' },
      { id: 'gap', name: '목표와의 차이' },
    ],
    fields: [
      { key: 'heading', label: '소제목', hint: '예: 월별 생산 달성', optional: true },
      { key: 'unit', label: '단위', hint: '만 개', optional: true },
    ],
    items: {
      label: '기간',
      min: 2,
      max: 8,
      default: 6,
      fields: [
        { key: 'title', label: '기간', hint: '기간', hints: ['4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월'] },
        { key: 'value', label: '실적', hint: '48', hints: ['42', '45', '39', '48', '51', '49', '53', '55'] },
        { key: 'meta', label: '목표', hint: '46', hints: ['40', '44', '46', '46', '50', '52', '52', '54'] },
      ],
    },
    minSpan: 6,
    prefSpan: 8,
    sample: {
      fields: { heading: '월별 생산 달성', unit: '만 개' },
      items: [
        { title: '4월', value: '42', meta: '40' },
        { title: '5월', value: '45', meta: '44' },
        { title: '6월', value: '39', meta: '46' },
        { title: '7월', value: '48', meta: '46' },
        { title: '8월', value: '51', meta: '50' },
        { title: '9월', value: '49', meta: '52' },
      ],
    },
  },
  diverge: {
    name: '항목별 증감',
    description: '늘어난 것은 오른쪽, 줄어든 것은 왼쪽으로. 0을 가운데 두고 견줘요',
    motion: '막대가 가운데 선에서 양쪽으로 뻗어요',
    variants: [
      { id: 'up', name: '늘어난 쪽 강조' },
      { id: 'down', name: '줄어든 쪽 강조' },
    ],
    fields: [
      { key: 'heading', label: '소제목', hint: '예: 부서별 야근 증감', optional: true },
      { key: 'basis', label: '기준', hint: '예: 작년 같은 분기 대비', optional: true },
    ],
    items: {
      label: '항목',
      min: 2,
      max: 8,
      default: 5,
      fields: [
        { key: 'title', label: '항목', hint: '항목', hints: ['생산', '영업', '연구', '지원', '품질', '구매', '재무', '인사'] },
        { key: 'value', label: '증감', hint: '+12% 또는 −3%', hints: ['+12%', '+8%', '−3%', '+5%', '−9%', '+2%', '−1%', '+4%'] },
      ],
    },
    minSpan: 6,
    prefSpan: 8,
    sample: {
      fields: { heading: '부서별 야근 증감', basis: '작년 같은 분기 대비' },
      items: [
        { title: '생산', value: '+12%' },
        { title: '영업', value: '+8%' },
        { title: '연구', value: '−3%' },
        { title: '지원', value: '+5%' },
        { title: '품질', value: '−9%' },
      ],
    },
  },
  stack: {
    name: '쌓은 막대',
    description: '기간마다 합계와 그 구성을 막대 하나에 쌓아요',
    motion: '막대가 아래부터 한 칸씩 쌓여요',
    variants: [
      { id: 'sum', name: '값 그대로' },
      { id: 'pct', name: '100%로' },
    ],
    fields: [
      { key: 'heading', label: '소제목', hint: '예: 분기별 비용 구성', optional: true },
      { key: 'parts', label: '나눈 것', hint: '인건비, 시설 임차료, 운영비' },
      { key: 'unit', label: '단위', hint: '억 원', optional: true },
    ],
    items: {
      label: '기간',
      min: 2,
      max: 6,
      default: 4,
      fields: [
        { key: 'title', label: '기간', hint: '기간', hints: ['1분기', '2분기', '3분기', '4분기', '내년 1분기', '내년 2분기'] },
        { key: 'value', label: '값', hint: '나눈 것마다 쉼표로 (예: 12, 6, 3)', hints: ['12, 6, 3', '14, 7, 3', '15, 9, 4', '18, 11, 5', '20, 12, 6', '22, 14, 6'] },
      ],
    },
    minSpan: 6,
    prefSpan: 8,
    sample: {
      fields: { heading: '분기별 비용 구성', parts: '인건비, 시설 임차료, 운영비', unit: '억 원' },
      items: [
        { title: '1분기', value: '12, 6, 3' },
        { title: '2분기', value: '14, 7, 3' },
        { title: '3분기', value: '15, 9, 4' },
        { title: '4분기', value: '18, 11, 5' },
      ],
    },
  },
  heat: {
    name: '색 표',
    description: '지점×월처럼 줄과 칸으로 놓인 값을 색의 진하기로. 가장 높은 칸과 낮은 칸을 짚어 줘요 (히트맵)',
    motion: '칸이 왼쪽 위부터 차례로 물들고, 가장 높은 칸과 낮은 칸이 짚여요',
    variants: [
      { id: 'all', name: '표 전체에서 견주기' },
      { id: 'rows', name: '줄마다 견주기' },
    ],
    fields: [
      { key: 'heading', label: '소제목', hint: '예: 센터별 월 출고', optional: true },
      { key: 'cols', label: '칸 이름', hint: '4월 5월 6월 7월 8월 9월' },
      { key: 'unit', label: '단위', hint: '천 건', optional: true },
    ],
    items: {
      label: '줄',
      // 한 줄이면 색으로 견줄 이웃이 없다
      min: 2,
      max: 8,
      default: 4,
      fields: [
        { key: 'title', label: '이름', hint: '줄 이름', hints: ['서울', '경기', '부산', '대구', '광주', '대전', '울산', '강원'] },
        {
          key: 'value',
          label: '값',
          hint: '칸마다 쉼표로 (예: 42, 45, 48)',
          hints: [
            '42, 45, 48, 51, 55, 58',
            '38, 40, 39, 44, 47, 49',
            '21, 22, 20, 24, 26, 25',
            '18, 17, 19, 18, 21, 23',
            '12, 13, 11, 14, 15, 16',
            '15, 14, 16, 17, 17, 19',
            '9, 10, 9, 11, 12, 12',
            '6, 7, 6, 8, 9, 9',
          ],
        },
      ],
    },
    minSpan: 6,
    prefSpan: 12,
    sample: {
      fields: { heading: '센터별 월 출고', cols: '4월 5월 6월 7월 8월 9월', unit: '천 건' },
      items: [
        { title: '서울', value: '42, 45, 48, 51, 55, 58' },
        { title: '경기', value: '38, 40, 39, 44, 47, 49' },
        { title: '부산', value: '21, 22, 20, 24, 26, 25' },
        { title: '대구', value: '18, 17, 19, 18, 21, 23' },
      ],
    },
  },
  sparks: {
    name: '지표 흐름표',
    description: '지표마다 그동안의 흐름을 작은 선으로, 지금 값과 바뀐 만큼을 나란히',
    motion: '줄마다 선이 그려지고 지금 값이 올라가요',
    variants: [
      { id: 'prev', name: '바로 앞과 견주기' },
      { id: 'first', name: '처음과 견주기' },
    ],
    fields: [
      { key: 'heading', label: '소제목', hint: '예: 월간 핵심 지표', optional: true },
      { key: 'period', label: '기간', hint: '예: 4월~9월', optional: true },
    ],
    items: {
      label: '지표',
      min: 2,
      max: 6,
      default: 4,
      fields: [
        { key: 'title', label: '지표', hint: '지표 이름', hints: ['문의', '포기율', '상담 인력', '첫 해결률', '처리 기간', '만족도'] },
        {
          key: 'value',
          label: '흐름',
          hint: '앞에서부터 쉼표로 (예: 3.2, 2.8, 2.1)',
          hints: ['42, 45, 48, 51, 55, 58', '3.2, 3.0, 2.1, 1.6, 1.3, 1.1', '12, 15, 14, 18, 21, 24', '61, 63, 62, 65, 67, 68', '4.2, 4.0, 3.6, 3.1, 2.9, 2.6', '4.1, 4.2, 4.2, 4.4, 4.5, 4.6'],
        },
        { key: 'meta', label: '단위', hint: '단위', hints: ['백 건', '%', '명', '%', '일', '점'], optional: true },
      ],
    },
    minSpan: 6,
    prefSpan: 8,
    sample: {
      fields: { heading: '월간 핵심 지표', period: '4월~9월' },
      items: [
        { title: '문의', value: '42, 45, 48, 51, 55, 58', meta: '백 건' },
        { title: '포기율', value: '3.2, 3.0, 2.1, 1.6, 1.3, 1.1', meta: '%' },
        { title: '상담 인력', value: '12, 15, 14, 18, 21, 24', meta: '명' },
        { title: '첫 해결률', value: '61, 63, 62, 65, 67, 68', meta: '%' },
      ],
    },
  },
  flow: {
    name: '흐름',
    description: '일이나 데이터가 단계와 시스템을 거쳐 가는 흐름',
    motion: '단계가 이어지며 데이터가 선을 따라 건너가요',
    fields: [{ key: 'what', label: '오가는 것', hint: '오가는 것 (예: 신청 데이터)', optional: true }],
    items: {
      label: '단계',
      // 하나면 흐름이 아니라 상자 하나다. 여섯부터는 한 줄을 다 써도 단계 이름이 네 글자마다 꺾인다
      min: 2,
      max: 5,
      default: 3,
      fields: [
        { key: 'title', label: '이름', hint: '단계나 시스템 이름', hints: ['신청 접수', '팀장 승인', '교육 배정', '결과 알림', '보관'] },
        { key: 'meta', label: '설명', hint: '짧은 설명', hints: ['사내 포털', '결재 시스템', '인사 시스템', '메일', '문서 보관함'], optional: true },
        { key: 'value', label: '양', hint: '오가는 양 (예: 320건)', hints: ['320건', '296건', '288건', '288건', '288건'], optional: true },
      ],
    },
    minSpan: 4,
    prefSpan: 12,
    sample: {
      fields: { what: '교육 신청 데이터' },
      items: [
        { title: '신청 접수', meta: '사내 포털', value: '320건' },
        { title: '팀장 승인', meta: '결재 시스템', value: '296건' },
        { title: '교육 배정', meta: '인사 시스템', value: '288건' },
      ],
    },
  },
  decision: {
    name: '조건별 흐름',
    description: '조건에 따라 달라지는 다음 행동',
    motion: '확인할 조건에서 각 행동이 차례로 나타나요',
    fields: [
      { key: 'label', label: '안내', hint: '확인할 조건', optional: true },
      { key: 'question', label: '질문', hint: '재고가 준비됐나요?', multiline: true },
    ],
    items: {
      label: '경로', min: 2, max: 3, default: 2,
      fields: [
        { key: 'title', label: '조건', hint: '준비됐어요', hints: ['준비됐어요', '아직 없어요', '확인이 필요해요'], multiline: true },
        { key: 'body', label: '할 일', hint: '출고를 진행해요', hints: ['출고를 진행해요', '입고 날짜를 알려 드려요', '담당자에게 확인해요'], multiline: true },
      ],
    },
    minSpan: 6,
    prefSpan: 12,
    sample: {
      fields: { label: '확인할 조건', question: '재고가 준비됐나요?' },
      items: [
        { title: '준비됐어요', body: '출고를 진행해요' },
        { title: '아직 없어요', body: '입고 날짜를 알려 드려요' },
      ],
    },
  },
  whys: {
    name: '원인 캐기',
    description: '드러난 문제에서 왜를 거듭해 근본 원인까지 한 단씩 내려가요. 장애 보고, 개선 제안에',
    motion: '문제 아래로 선이 한 단씩 그어지며 원인이 나오고, 마지막 근본 원인이 또렷하게 맺혀요',
    variants: [
      { id: 'base', name: '계단' },
      { id: 'across', name: '가로' },
    ],
    fields: [
      { key: 'heading', label: '소제목', hint: '예: 보고가 늦어지는 이유', optional: true },
      { key: 'problem', label: '문제', hint: '드러난 문제 (예: 월간 보고가 매달 이틀 늦어요)', multiline: true },
    ],
    items: {
      label: '원인',
      // 원인 하나는 캐기가 아니라 문제와 원인 한 쌍이다. 여섯부터는 계단이 칸 너비의 절반 넘게 들어가 글 자리가 좁다
      min: 2,
      max: 5,
      default: 3,
      fields: [
        {
          key: 'title',
          label: '원인',
          hint: '왜 그런지 한 줄로',
          hints: ['부서 숫자가 마감 뒤에 모여요', '부서마다 양식이 달라 다시 맞춰요', '양식을 정하고 고치는 곳이 없어요', '보고 절차를 맡은 팀이 없어요', '조직을 바꿀 때 보고 일이 빠졌어요'],
          multiline: true,
        },
        {
          key: 'meta',
          label: '근거',
          hint: '확인한 사실 (예: 12개 부서 중 9곳)',
          hints: ['12개 부서 중 9곳', '양식 7가지', '최근 3년 맡은 곳 없음', '업무 분장표에 없음', '2024년 조직 개편'],
          optional: true,
        },
      ],
    },
    minSpan: 5,
    prefSpan: 6,
    sample: {
      fields: { problem: '월간 보고가 매달 이틀 늦어요' },
      items: [
        { title: '부서 숫자가 마감 뒤에 모여요', meta: '12개 부서 중 9곳' },
        { title: '부서마다 양식이 달라 다시 맞춰요', meta: '양식 7가지' },
        { title: '양식을 정하고 고치는 곳이 없어요' },
      ],
    },
  },
  cycle: {
    name: '순환',
    description: '단계를 거쳐 처음으로 돌아오는 고리예요. 매달 도는 개선 주기, 운영 절차에',
    motion: '고리가 시계 방향으로 한 구간씩 그어지며 닿는 단계가 나오고, 처음으로 돌아와 한 바퀴가 닫혀요',
    // 모양은 고르지 않는다: 칸 모양에 따라 고리, 가로, 세로를 스스로 고른다(cycle.css). '세로' 모양을 따로 두었을 때는 한 줄을 다
    // 쓰는 칸에서 세로 목록이 왼쪽에 몰려 본문 오른쪽이 60% 넘게 비었고, 좁은 칸에서는 기본이 이미 세로라 고를 일이 없었다
    fields: [
      { key: 'heading', label: '소제목', hint: '예: 매달 도는 개선 주기', optional: true },
      { key: 'center', label: '가운데', hint: '이 순환의 이름 (예: 한 달 주기)', optional: true },
    ],
    items: {
      label: '단계',
      // 둘이면 고리가 아니라 오가는 것이다. 일곱부터는 고리 둘레의 이름표끼리 부딪힌다
      min: 3,
      max: 6,
      default: 4,
      fields: [
        { key: 'title', label: '단계', hint: '단계 이름', hints: ['계획', '실행', '점검', '개선', '공유', '정리'], multiline: true },
        {
          key: 'meta',
          label: '설명',
          hint: '짧은 설명',
          hints: ['목표와 방법을 정해요', '작게 먼저 해 봐요', '숫자로 결과를 봐요', '고칠 것을 정해요', '배운 것을 나눠요', '다음 주기를 준비해요'],
          optional: true,
        },
      ],
    },
    // 강조할 단계는 고른 것만(기본 없음): 순환에는 정해진 답이 없어서, 이번 달에 손볼 단계처럼 말할 단계가 있을 때 고른다
    highlight: { label: '강조할 단계', fallback: -1 },
    minSpan: 4,
    prefSpan: 6,
    sample: {
      fields: { center: '한 달 주기' },
      items: [
        { title: '계획', meta: '목표와 방법을 정해요' },
        { title: '실행', meta: '작게 먼저 해 봐요' },
        { title: '점검', meta: '숫자로 결과를 봐요' },
        { title: '개선', meta: '고칠 것을 정해요' },
      ],
    },
  },
  hub: {
    name: '모이고 퍼지기',
    description: '여러 곳의 것이 한가운데로 모여들거나, 한가운데에서 여러 곳으로 퍼져 나가는 모습. 데이터가 계속 흘러요',
    motion: '선이 그어지고 빛나는 데이터 조각이 꼬리를 끌며 선을 따라 쉬지 않고 흘러요. 가운데는 숨 쉬듯 빛나고 둘레의 고리가 돌아요',
    variants: [
      { id: 'in', name: '모이기' },
      { id: 'out', name: '퍼지기' },
    ],
    fields: [
      { key: 'center', label: '가운데', hint: '가운데 둘 것 (예: 공통 고객 정보)' },
      { key: 'note', label: '가운데 설명', hint: '가운데 아래 짧은 한 줄', optional: true },
    ],
    items: {
      label: '곳',
      // 둘이면 모이는 그림이 아니라 잇는 선이다. 일곱부터는 한쪽 호에 이름이 빽빽해 서로 닿는다
      min: 3,
      max: 6,
      default: 4,
      fields: [
        { key: 'title', label: '이름', hint: '모이거나 퍼지는 곳', hints: ['주문 시스템', '상담 기록', '회원 정보', '배송 현황', '정산 시스템', '리뷰'] },
        { key: 'meta', label: '설명', hint: '오가는 것', hints: ['주문과 결제', '문의와 답변', '가입과 등급', '출고와 도착', '매출과 수수료', '별점과 후기'], optional: true },
      ],
    },
    // 너비 6칸에 곳이 다섯 넘으면 호 위의 이름끼리 닿는다(갤러리에서 잰 높이 표가 999)
    minSpan: 8,
    prefSpan: 12,
    sample: {
      fields: { center: '공통 고객 정보', note: '한 곳에서 찾아요' },
      items: [
        { title: '주문 시스템', meta: '주문과 결제' },
        { title: '상담 기록', meta: '문의와 답변' },
        { title: '회원 정보', meta: '가입과 등급' },
        { title: '배송 현황', meta: '출고와 도착' },
      ],
    },
  },
  chat: {
    name: '대화',
    description: '묻고 답하는 장면을 대본처럼. 지금 겪는 일이나 바뀐 뒤의 모습을 장면으로 보여 줘요',
    motion: '말하는 사람이 차례로 나오고, 한 말이 한 글자씩 써져요',
    fields: [{ key: 'heading', label: '소제목', hint: '예: 지금의 대화', optional: true }],
    items: {
      label: '말',
      min: 2,
      max: 5,
      default: 3,
      fields: [
        { key: 'title', label: '누가', hint: '말하는 사람', hints: ['나', 'AI', '나', 'AI', '나'] },
        { key: 'body', label: '한 말', hint: '한 말이나 한 일', hints: ['“지난달 회의록 어디 있어요?”', '“어느 회의인지 알려 주세요”', '(폴더를 뒤져 찾아 붙여 넣기)', '“요약해 드릴게요”', '“다음 달에 또 물어봐야겠네”'], multiline: true },
      ],
    },
    minSpan: 6,
    prefSpan: 12,
    sample: {
      fields: { heading: '지금의 대화' },
      items: [
        { title: '나', body: '“지난달 회의록 어디 있어요?”' },
        { title: 'AI', body: '“어느 회의인지 알려 주세요”' },
        { title: '나', body: '(폴더를 뒤져 찾아 붙여 넣기)' },
      ],
    },
  },
  wipe: {
    name: '바뀌기',
    description: '지금의 모습이 바뀐 뒤의 모습으로 넘어가는 장면. 줄마다 지금과 바뀐 뒤를 짝지어요',
    motion: '세로 선이 왼쪽에서 오른쪽으로 훑고 지나가며 지금에 줄을 긋고 바뀐 뒤를 드러내요',
    fields: [
      { key: 'from', label: '지금 이름', hint: '예: 지금' },
      { key: 'to', label: '바뀐 뒤 이름', hint: '예: 바뀐 뒤' },
    ],
    items: {
      label: '줄',
      min: 1,
      max: 4,
      default: 3,
      fields: [
        { key: 'title', label: '지금', hint: '지금의 모습', hints: ['회의록을 폴더에서 찾아요', '같은 질문을 매번 해요', '현황을 사람마다 물어요', '결정한 이유가 사라져요'], multiline: true },
        { key: 'body', label: '바뀐 뒤', hint: '바뀐 뒤의 모습', hints: ['검색 한 번에 찾아요', '처음 한 번만 물어요', '한 화면에서 봐요', '이유가 기록으로 남아요'], multiline: true },
      ],
    },
    minSpan: 8,
    prefSpan: 12,
    sample: {
      fields: { from: '지금', to: '바뀐 뒤' },
      items: [
        { title: '회의록을 폴더에서 찾아요', body: '검색 한 번에 찾아요' },
        { title: '같은 질문을 매번 해요', body: '처음 한 번만 물어요' },
        { title: '현황을 사람마다 물어요', body: '한 화면에서 봐요' },
      ],
    },
  },
  gather: {
    name: '흩어진 것 모으기',
    description: '여러 곳에 흩어진 것이 한 이름 아래 정돈되는 모습',
    motion: '조각들이 여기저기 흩어져 나타났다가 제자리로 날아와 줄을 서요',
    fields: [
      { key: 'center', label: '모이는 곳', hint: '모이는 곳의 이름 (예: 팀 공용 자료실)' },
      { key: 'note', label: '설명', hint: '이름 옆 짧은 한 줄', optional: true },
    ],
    items: {
      label: '모이는 것',
      min: 3,
      max: 8,
      default: 6,
      fields: [
        { key: 'title', label: '이름', hint: '흩어져 있던 것', hints: ['회의록', '결정 기록', '용어집', '담당자 목록', '자주 묻는 질문', '지난 보고서', '일정표', '안내 문서'] },
        { key: 'meta', label: '설명', hint: '어디에 있던 것', hints: ['메일함', '메신저', '개인 폴더', '공유 문서', '사람의 기억', '드라이브', '달력', '게시판'], optional: true },
      ],
    },
    minSpan: 6,
    prefSpan: 12,
    sample: {
      fields: { center: '팀 공용 자료실', note: '흩어진 것을 한 곳에' },
      items: [
        { title: '회의록', meta: '메일함' },
        { title: '결정 기록', meta: '메신저' },
        { title: '용어집', meta: '개인 폴더' },
        { title: '담당자 목록', meta: '공유 문서' },
        { title: '자주 묻는 질문', meta: '사람의 기억' },
        { title: '지난 보고서', meta: '드라이브' },
      ],
    },
  },
  search: {
    name: '여기저기 찾기',
    description: '하나를 찾으려고 여러 곳을 차례로 뒤지는 모습. 뒤진 곳의 수가 크게 보여요',
    motion: '커서가 곳에서 곳으로 건너뛰고, 건너뛸 때마다 뒤진 곳의 수가 하나씩 올라요',
    fields: [
      { key: 'heading', label: '찾는 것', hint: '예: 회의록 하나를 찾으려고' },
      { key: 'unit', label: '단위', hint: '예: 곳' },
      { key: 'result', label: '결과', hint: '예: 그래도 없으면 사람에게 물어요', optional: true },
    ],
    items: {
      label: '곳',
      min: 2,
      max: 6,
      default: 4,
      fields: [
        { key: 'title', label: '곳', hint: '뒤지는 곳', hints: ['메일함', '메신저', '공유 폴더', '게시판', '개인 메모', '동료'] },
        { key: 'meta', label: '설명', hint: '그곳에서 찾기 어려운 이유', hints: ['제목이 제각각', '대화에 묻힘', '버전이 여럿', '오래된 글과 섞임', '본인만 앎', '바쁘면 못 물음'], optional: true },
      ],
    },
    minSpan: 8,
    prefSpan: 12,
    sample: {
      fields: { heading: '회의록 하나를 찾으려고', unit: '곳', result: '그래도 없으면 사람에게 물어요' },
      items: [
        { title: '메일함', meta: '제목이 제각각' },
        { title: '메신저', meta: '대화에 묻힘' },
        { title: '공유 폴더', meta: '버전이 여럿' },
        { title: '게시판', meta: '오래된 글과 섞임' },
      ],
    },
  },
  layers: {
    name: '층',
    description: '위가 아래에 기대어 선 층. 쓰는 것, 잇는 것, 바탕이 되는 것을 위에서 아래로',
    motion: '맨 아래 판부터 차례로 내려앉아 쌓이고, 요청이 층을 타고 내려갔다가 올라와요',
    fields: [{ key: 'heading', label: '소제목', hint: '예: 어떻게 이어지나요', optional: true }],
    items: {
      label: '층',
      min: 2,
      max: 5,
      default: 3,
      fields: [
        { key: 'title', label: '층 이름', hint: '층 이름', hints: ['쓰는 화면', '잇는 곳', '모은 자료', '원래 시스템', '보관'] },
        { key: 'meta', label: '무엇이 있나', hint: '이 층에 있는 것', hints: ['사내 포털, 메신저', '하나의 연결 창구', '정리한 문서와 기록', '인사, 결재, 일정', '백업과 기록'], optional: true },
      ],
    },
    highlight: { label: '강조할 층', fallback: -1 },
    minSpan: 6,
    prefSpan: 12,
    sample: {
      fields: { heading: '어떻게 이어지나요' },
      items: [
        { title: '쓰는 화면', meta: '사내 포털, 메신저' },
        { title: '잇는 곳', meta: '하나의 연결 창구' },
        { title: '모은 자료', meta: '정리한 문서와 기록' },
        { title: '원래 시스템', meta: '인사, 결재, 일정' },
      ],
    },
  },
  gate: {
    name: '관문',
    description: '들어온 것이 확인하는 관문을 하나씩 지나 나가는 모습. 거르는 관문 하나를 고를 수 있어요',
    motion: '조각이 통로를 따라 관문을 지나고, 거르는 관문에서 몇 개는 아래로 떨어져요',
    fields: [
      { key: 'from', label: '들어오는 것', hint: '예: 들어온 신청' },
      { key: 'to', label: '나가는 것', hint: '예: 처리된 신청' },
      { key: 'dropped', label: '걸러지는 것', hint: '예: 빠진 서류', optional: true },
    ],
    items: {
      label: '관문',
      min: 2,
      max: 5,
      default: 3,
      fields: [
        { key: 'title', label: '관문', hint: '확인하는 것', hints: ['본인 확인', '서류 확인', '중복 확인', '승인', '기록'] },
        { key: 'meta', label: '하는 일', hint: '여기서 하는 일', hints: ['누가 냈는지', '빠진 것이 없는지', '같은 신청이 있는지', '담당자가 승인', '처리 내역을 남김'], optional: true },
      ],
    },
    highlight: { label: '거르는 관문', fallback: 1 },
    minSpan: 8,
    prefSpan: 12,
    sample: {
      fields: { from: '들어온 신청', to: '처리된 신청', dropped: '빠진 서류는 돌려보냄' },
      items: [
        { title: '본인 확인', meta: '누가 냈는지' },
        { title: '서류 확인', meta: '빠진 것이 없는지' },
        { title: '승인', meta: '담당자가 승인' },
      ],
    },
  },
  dupes: {
    name: '겹친 수고',
    description: '여러 팀이 따로 하던 같은 일을 하나로 합쳐 같이 쓰는 모습',
    motion: '팀마다 하던 같은 일이 동시에 밝아졌다가 한꺼번에 지워지고, 아래에 같이 쓸 하나가 올라와요',
    fields: [
      { key: 'heading', label: '소제목', hint: '예: 지금은 팀마다 따로', optional: true },
      { key: 'label', label: '하나의 이름', hint: '예: 같이 쓰면' },
      { key: 'result', label: '대신할 하나', hint: '예: 한 번 만든 일정 양식을 모든 팀이 씀', multiline: true },
    ],
    items: {
      label: '팀',
      min: 2,
      max: 5,
      default: 3,
      fields: [
        { key: 'title', label: '누가', hint: '팀이나 사람', hints: ['영업팀', '마케팅팀', '운영팀', '인사팀', '재무팀'] },
        { key: 'body', label: '따로 하던 일', hint: '따로 하던 일', hints: ['주간 일정 양식을 직접 만듦', '주간 일정 양식을 직접 만듦', '주간 일정 양식을 직접 만듦', '주간 일정 양식을 직접 만듦', '주간 일정 양식을 직접 만듦'], multiline: true },
      ],
    },
    minSpan: 6,
    prefSpan: 12,
    sample: {
      fields: { heading: '지금은 팀마다 따로', label: '같이 쓰면', result: '한 번 만든 일정 양식을 모든 팀이 씀' },
      items: [
        { title: '영업팀', body: '주간 일정 양식을 직접 만듦' },
        { title: '마케팅팀', body: '주간 일정 양식을 직접 만듦' },
        { title: '운영팀', body: '주간 일정 양식을 직접 만듦' },
      ],
    },
  },
  aliases: {
    name: '같은 대상, 다른 이름',
    description: '하나를 곳마다 다르게 부르는 모습. 용어가 맞지 않아 생기는 혼란을 보여 줘요',
    motion: '대상 이름이 곳마다 부르는 이름으로 차례로 바뀌다가 원래 이름으로 돌아와요',
    fields: [
      { key: 'label', label: '이름표', hint: '예: 같은 것' },
      { key: 'center', label: '대상', hint: '예: 고객 문의' },
      { key: 'note', label: '설명', hint: '예: 부서마다 부르는 이름이 달라 다시 확인해요', optional: true, multiline: true },
    ],
    items: {
      label: '이름',
      min: 2,
      max: 6,
      default: 4,
      fields: [
        { key: 'title', label: '부르는 이름', hint: '부르는 이름', hints: ['문의', '요청', '티켓', 'VOC', '건', '케이스'] },
        { key: 'meta', label: '쓰는 곳', hint: '이 이름을 쓰는 곳', hints: ['고객센터', '운영팀', '개발팀', '기획팀', '영업팀', '품질팀'], optional: true },
      ],
    },
    minSpan: 6,
    prefSpan: 12,
    sample: {
      fields: { label: '같은 것', center: '고객 문의', note: '부서마다 부르는 이름이 달라 다시 확인해요' },
      items: [
        { title: '문의', meta: '고객센터' },
        { title: '요청', meta: '운영팀' },
        { title: '티켓', meta: '개발팀' },
        { title: 'VOC', meta: '기획팀' },
      ],
    },
  },
  adoption: {
    name: '확산 곡선',
    description: '새 방식이 퍼지는 다섯 무리(2.5, 13.5, 34, 34, 16%)와 지금 어디까지 왔는지',
    motion: '시간 선이 왼쪽부터 훑으며 무리가 차오르고 누적 곡선이 같이 자란 뒤 지금 무리가 밝아져요',
    fields: [
      { key: 'label', label: '이름표', hint: '예: 확산 단계' },
      { key: 'note', label: '설명', hint: '예: 지금은 첫 무리, 3개월 차에 다음 무리로', optional: true, multiline: true },
      { key: 'total', label: '누적 곡선 이름', hint: '예: 누적', optional: true },
      // 종 모양(단계마다 새로 쓰기 시작하는 사람)에도 이름을 단다: 누적 곡선에만 이름이 있어 곡선 둘 가운데 하나가 무엇인지 몰랐다
      { key: 'curve', label: '새로 쓰는 사람 곡선 이름', hint: '예: 새로 쓰는 사람', optional: true },
    ],
    items: {
      label: '무리',
      // 다섯 무리(2.5, 13.5, 34, 34, 16%)가 곧 확산 곡선이라 늘 다섯: 셋이면 곡선의 반만 칠해진 채 남았다
      min: 5,
      max: 5,
      default: 5,
      fields: [
        { key: 'title', label: '무리', hint: '무리 이름', hints: ['처음 쓰는 사람', '앞서 쓰는 사람', '앞쪽 다수', '뒤쪽 다수', '마지막'] },
        { key: 'meta', label: '설명', hint: '누구인지', optional: true, multiline: true },
      ],
    },
    highlight: { label: '지금 무리', fallback: 0 },
    minSpan: 6,
    prefSpan: 12,
    sample: {
      fields: { label: '새 결재 시스템', note: '지금은 앞서 쓰는 사람까지', total: '누적', curve: '새로 쓰는 사람' },
      items: [
        { title: '시범 부서', meta: '2.5%' },
        { title: '먼저 쓰는 팀', meta: '13.5%' },
        { title: '본사 절반', meta: '34%' },
        { title: '지점', meta: '34%' },
        { title: '나머지', meta: '16%' },
      ],
    },
  },
  spread: {
    name: '퍼짐',
    description: '사람 100명을 눈금 100개로 놓고, 단계마다 몇 %까지 퍼졌는지 보여 줘요',
    motion: '단계마다 눈금이 왼쪽 씨앗에서부터 물결처럼 번지고 그 단계의 몫이 올라와요',
    fields: [
      { key: 'label', label: '이름표', hint: '예: 100명 중' },
      { key: 'note', label: '설명', hint: '예: 눈금 하나가 한 사람', optional: true, multiline: true },
    ],
    items: {
      label: '단계',
      min: 2,
      max: 5,
      default: 3,
      fields: [
        { key: 'meta', label: '몫', hint: '예: 16%', hints: ['3%', '16%', '50%', '84%', '100%'] },
        { key: 'title', label: '단계', hint: '이 단계의 이름', hints: ['시범 부서', '먼저 쓰는 팀', '본사 절반', '지점까지', '모두'], multiline: true },
      ],
    },
    highlight: { label: '지금 단계', fallback: 'last' },
    minSpan: 6,
    prefSpan: 12,
    sample: {
      fields: { label: '직원 100명 중', note: '눈금 하나가 한 사람' },
      items: [
        { meta: '3%', title: '시범 부서' },
        { meta: '16%', title: '먼저 쓰는 팀' },
        { meta: '50%', title: '본사 절반' },
      ],
    },
  },
  rank: {
    name: '순위 바뀌기',
    description: '지난번과 지금의 순위를 나란히 두고 바뀐 자리를 선으로 이어요. 지금 순서대로 적고 항목마다 지난 순위만 적으면 돼요(새로 들어온 것은 비워 두세요)',
    motion: '지난 순위에서 지금 순위로 선이 그어지고, 선이 닿으면 지금 순위가 제자리에 나타나요',
    fields: [
      { key: 'label', label: '무엇의 순위', hint: '예: 많이 찾은 사내 안내' },
      { key: 'from', label: '지난 때', hint: '예: 지난 분기' },
      { key: 'to', label: '지금', hint: '예: 이번 분기' },
    ],
    items: {
      label: '항목',
      min: 2,
      max: 6,
      default: 5,
      fields: [
        { key: 'title', label: '이름', hint: '지금 순위대로 적어요', hints: ['회의록 양식', '휴가 신청', '출장비 기준', '보안 수칙', '새 결재 안내', '사내 동호회'] },
        // 편집할 때 '지난 [순위]'로 읽힌다(Rank.tsx). 새로 들어온 항목은 비워 두면 '새로'가 된다: 그 자리의 안내는 '지난 없음'.
        // 좁은 칸에서는 이름 옆에 서서 안내가 길면 이름이 세 줄로 쪼개졌다('지난 예: 3 (처음 든 것은 비워요)')
        { key: 'meta', label: '지난 순위', hint: '순위', hints: ['4', '1', '2', '3', '없음', '5'] },
      ],
    },
    highlight: { label: '강조할 항목', fallback: 0 },
    // 6칸부터: 그보다 좁으면 선의 띠를 둘 너비가 없어 지금 순위 목록만 남는다(글 목록은 이 컴포넌트가 할 말이 아니다)
    minSpan: 6,
    prefSpan: 8,
    sample: {
      fields: { label: '많이 찾은 사내 안내', from: '지난 분기', to: '이번 분기' },
      items: [
        { title: '회의록 양식', meta: '4' },
        { title: '휴가 신청', meta: '1' },
        { title: '출장비 기준', meta: '2' },
        { title: '보안 수칙', meta: '3' },
        { title: '새 결재 안내', meta: '' },
      ],
    },
  },
  network: {
    name: '연결도',
    description: '가운데 하나에 여러 시스템이나 팀이 이어진 모습',
    motion: '가운데에서 선이 뻗어 나가고 데이터가 가운데로 모여요',
    fields: [{ key: 'center', label: '가운데', hint: '가운데 둘 것 (예: 공통 직원 정보)' }],
    items: {
      label: '연결',
      min: 3,
      max: 6,
      default: 4,
      fields: [
        { key: 'title', label: '이름', hint: '이어진 시스템이나 팀', hints: ['인사 시스템', '결재 시스템', '사내 포털', '교육 플랫폼', '메일', '출입 관리'] },
        { key: 'meta', label: '설명', hint: '주고받는 것', hints: ['입사, 발령', '결재선', '조직도', '수강 이력', '주소록', '출입 권한'], optional: true },
      ],
    },
    minSpan: 4,
    prefSpan: 8,
    sample: {
      fields: { center: '공통 직원 정보' },
      items: [
        { title: '인사 시스템', meta: '입사, 발령' },
        { title: '결재 시스템', meta: '결재선' },
        { title: '사내 포털', meta: '조직도' },
        { title: '교육 플랫폼', meta: '수강 이력' },
      ],
    },
  },
  split: {
    name: '나누기',
    description: '전체 하나를 몇 조각으로 나눈 몫',
    motion: '막대가 한 덩어리로 펼쳐진 뒤 조각으로 갈라져요',
    fields: [
      { key: 'label', label: '전체', hint: '무엇을 나누는지 (예: 올해 교육 예산)' },
      { key: 'total', label: '합계', hint: '4.8억 원', optional: true },
      { key: 'unit', label: '단위', hint: '억 원', optional: true },
    ],
    items: {
      label: '조각',
      min: 2,
      max: 5,
      default: 3,
      fields: [
        { key: 'title', label: '이름', hint: '조각 이름', hints: ['직무 교육', '리더십 과정', '외부 연수', '자격증 지원', '기타'] },
        { key: 'value', label: '값', hint: '조각의 값', hints: ['2.4억', '1.4억', '1억', '0.6억', '0.2억'] },
      ],
    },
    minSpan: 4,
    prefSpan: 8,
    sample: {
      fields: { label: '올해 교육 예산' },
      items: [
        { title: '직무 교육', value: '2.4억' },
        { title: '리더십 과정', value: '1.4억' },
        { title: '외부 연수', value: '1억' },
      ],
    },
  },
  merge: {
    name: '모으기',
    description: '여러 값을 하나로 모은 합계',
    motion: '조각이 하나씩 내려가 합계 막대에 끼워져요',
    fields: [
      { key: 'label', label: '합계', hint: '무엇의 합계인지 (예: 연간 절감 효과)' },
      { key: 'total', label: '합계 값', hint: '2.5억 원', optional: true },
      { key: 'unit', label: '단위', hint: '억 원', optional: true },
    ],
    items: {
      label: '값',
      min: 2,
      max: 5,
      default: 3,
      fields: [
        { key: 'title', label: '이름', hint: '무엇의 값인지', hints: ['인건비 절감', '운영비 절감', '외주비 절감', '재고 비용 절감', '기타'] },
        { key: 'value', label: '값', hint: '값', hints: ['1.2억', '0.8억', '0.5억', '0.3억', '0.1억'] },
      ],
    },
    minSpan: 4,
    prefSpan: 8,
    sample: {
      fields: { label: '연간 절감 효과' },
      items: [
        { title: '인건비 절감', value: '1.2억' },
        { title: '운영비 절감', value: '0.8억' },
        { title: '외주비 절감', value: '0.5억' },
      ],
    },
  },
  tiles: {
    name: '칸 조립',
    description: '비율을 작은 네모 칸으로 (100칸 중 86칸)',
    motion: '흩어진 칸이 날아와 하나로 맞춰져요',
    fields: [
      { key: 'label', label: '무엇의 비율', hint: '무엇을 센 것인지 (예: 보안 교육을 마친 직원)' },
      { key: 'value', label: '몇', hint: '86%' },
      { key: 'of', label: '전체', hint: '100', optional: true },
      { key: 'note', label: '보충 설명', hint: '짧은 설명', optional: true, multiline: true },
    ],
    minSpan: 4,
    prefSpan: 6,
    sample: { fields: { label: '보안 교육을 마친 직원', value: '86%', note: '남은 14%는 11월 말까지 마쳐요' } },
  },
  // ---------- 작은 컴포넌트: 좁은 칸, 낮은 줄에 여럿 쌓아 쓰는 것 ----------
  calc: {
    name: '계산식',
    description: '값을 곱하거나 더한 셈과 결과 (1,200시간 × 4만 원 × 10명 = 4.8억 원)',
    motion: '값이 차례로 놓이고 셈 기호가 맺힌 뒤 결과가 굴러 맞춰져요',
    fields: [
      { key: 'label', label: '결과의 이름', hint: '무엇을 셈한 것인지 (예: 한 해 아끼는 돈)' },
      { key: 'result', label: '결과', hint: '4.8억 원' },
      { key: 'note', label: '보충 설명', hint: '셈의 기준 (예: 시급은 평균 인건비)', optional: true, multiline: true },
    ],
    items: {
      label: '값',
      min: 2,
      max: 4,
      default: 3,
      fields: [
        { key: 'value', label: '값', hint: '값', hints: ['1,200시간', '4만 원', '10명', '12개월'] },
        { key: 'title', label: '이름', hint: '무엇의 값인지', hints: ['줄어드는 회의 시간', '한 시간 인건비', '회의에 드는 사람', '한 해'] },
        { key: 'meta', label: '셈 기호', hint: '×', hints: ['', '×', '×', '×'], optional: true },
      ],
    },
    minSpan: 4,
    prefSpan: 8,
    sample: {
      fields: { label: '한 해 아끼는 돈', result: '4.8억 원', note: '시급은 평균 인건비 기준' },
      items: [
        { value: '1,200시간', title: '줄어드는 회의 시간' },
        { value: '4만 원', title: '한 시간 인건비', meta: '×' },
        { value: '10명', title: '회의에 드는 사람', meta: '×' },
      ],
    },
  },
  likert: {
    name: '설문 결과',
    description: '질문마다 답(전혀 아니다~매우 그렇다)의 비율을 가운데에서 양쪽으로 갈라 쌓고, 긍정 합계를 짚어요',
    motion: '막대가 가운데 선에서 양쪽으로 자라고, 합계가 굴러 맞춰져요',
    variants: [
      { id: 'pos', name: '긍정 쪽 강조' },
      { id: 'neg', name: '부정 쪽 강조' },
    ],
    fields: [
      { key: 'heading', label: '소제목', hint: '예: 신입 교육 만족도', optional: true },
      { key: 'scale', label: '답의 단계', hint: '전혀 아니다, 아니다, 보통, 그렇다, 매우 그렇다', optional: true },
      { key: 'basis', label: '응답', hint: '예: 응답 140명', optional: true },
    ],
    items: {
      label: '질문',
      min: 1,
      max: 6,
      default: 4,
      fields: [
        {
          key: 'title',
          label: '질문',
          hint: '질문',
          hints: ['교육 내용이 업무에 도움이 됐다', '강사의 설명이 알기 쉬웠다', '교육 시간이 알맞았다', '동료에게 권하고 싶다', '실습 시간이 넉넉했다', '교육 장소가 편했다'],
        },
        {
          key: 'value',
          label: '비율',
          hint: '단계마다 쉼표로 (예: 4, 8, 20, 43, 25)',
          hints: ['3, 7, 18, 45, 27', '2, 6, 22, 48, 22', '8, 17, 30, 32, 13', '4, 9, 25, 38, 24', '12, 21, 27, 28, 12', '5, 10, 25, 40, 20'],
        },
      ],
    },
    minSpan: 6,
    prefSpan: 8,
    sample: {
      fields: { heading: '신입 교육 만족도', basis: '응답 140명' },
      items: [
        { title: '교육 내용이 업무에 도움이 됐다', value: '3, 7, 18, 45, 27' },
        { title: '강사의 설명이 알기 쉬웠다', value: '2, 6, 22, 48, 22' },
        { title: '교육 시간이 알맞았다', value: '8, 17, 30, 32, 13' },
        { title: '동료에게 권하고 싶다', value: '4, 9, 25, 38, 24' },
      ],
    },
  },
  radar: {
    name: '방사형 비교',
    description: '여러 기준의 점수를 한 그림에. 어디가 강하고 약한지가 모양으로 보여요 (레이더 차트). 기준은 셋에서 여덟까지, 견줄 값(목표, 지난 분기)을 적으면 점선으로 겹쳐요',
    motion: '틀이 먼저 서고, 다각형이 가운데에서 값까지 펼쳐져요',
    variants: [
      { id: 'low', name: '약한 곳 강조' },
      { id: 'high', name: '강한 곳 강조' },
    ],
    fields: [
      { key: 'heading', label: '소제목', hint: '예: 온보딩 과정 진단', optional: true },
      { key: 'max', label: '만점', hint: '5', optional: true },
      // 비워 두면 '목표'로 보인다(Radar.tsx). 견줄 값을 적었을 때만 그린다
      { key: 'base', label: '견줄 대상', hint: '목표', optional: true, named: true },
    ],
    items: {
      label: '기준',
      min: 3,
      max: 8,
      default: 5,
      fields: [
        { key: 'title', label: '기준', hint: '기준', hints: ['안내 자료', '실습', '멘토링', '일정', '도구 준비', '첫 과제', '팀 소개', '되돌아보기'] },
        { key: 'value', label: '점수', hint: '점수', hints: ['4.4', '3.8', '2.6', '4.1', '3.5', '3.9', '4.3', '3.2'] },
        // 편집할 때 '목표 [값]'으로 읽힌다(Radar.tsx). 모든 기준에 적어야 점선 다각형이 닫힌다
        { key: 'meta', label: '견줄 값', hint: '값', hints: ['4.0', '4.0', '4.0', '4.0', '4.0', '4.0', '4.0', '4.0'], optional: true },
      ],
    },
    // 고르지 않으면 모양이 정한다(가장 낮거나 높은 기준). -1은 강조하지 않기
    highlight: { label: '강조할 기준', fallback: -1 },
    // 6칸부터: 그보다 좁으면 양옆 이름표가 자리를 다 가져가 그림이 이름표보다 작아진다(4칸에서 그림 폭 110~160px)
    minSpan: 6,
    prefSpan: 6,
    sample: {
      fields: { heading: '온보딩 과정 진단' },
      items: [
        { title: '안내 자료', value: '4.4' },
        { title: '실습', value: '3.8' },
        { title: '멘토링', value: '2.6' },
        { title: '일정', value: '4.1' },
        { title: '도구 준비', value: '3.5' },
      ],
    },
  },
  heading: {
    name: '소제목',
    description: '옆이나 아래 컴포넌트들을 묶는 짧은 제목 (지금 방식, 바꾸면)',
    motion: '선이 왼쪽부터 그어지고 글이 올라와요',
    fields: [
      { key: 'text', label: '소제목', hint: '묶음의 이름 (예: 지금 방식)' },
      { key: 'note', label: '보충 설명', hint: '짧게 덧붙이는 말 (예: 2025년 기준)', optional: true },
    ],
    minSpan: 3,
    prefSpan: 12,
    small: true,
    sample: { fields: { text: '지금 방식', note: '구매 요청에서 물품을 받기까지' } },
  },
  stat: {
    name: '숫자 한 줄',
    description: '이름과 숫자 하나를 한 줄로. 좁은 칸에 여럿 쌓으면 목록이 돼요',
    motion: '숫자가 굴러 맞춰지고 아래 선이 그어져요',
    fields: [
      { key: 'label', label: '이름', hint: '무엇의 숫자인지 (예: 평균 처리 시간)' },
      { key: 'value', label: '숫자', hint: '2.4일' },
      { key: 'change', label: '변화', hint: '변화 (예: 12% 늘었어요)', optional: true },
      { key: 'note', label: '보충 설명', hint: '기준이나 기간 (예: 9월 한 달)', optional: true },
    ],
    minSpan: 3,
    prefSpan: 4,
    small: true,
    sample: { fields: { label: '문의 평균 처리 시간', value: '2.4일', change: '1.1일 줄었어요', note: '9월 한 달, 고객 지원팀' } },
  },
  meter: {
    name: '막대 하나',
    description: '숫자 하나가 전체나 목표의 얼마인지 가는 막대 하나로',
    motion: '막대가 왼쪽부터 자라고 숫자가 같이 올라가요',
    fields: [
      { key: 'label', label: '이름', hint: '무엇의 몫인지 (예: 올해 교육 예산 집행)' },
      { key: 'value', label: '숫자', hint: '72%' },
      { key: 'of', label: '전체', hint: '5억 원', optional: true },
      { key: 'target', label: '목표', hint: '80%', optional: true },
      { key: 'targetName', label: '눈금 이름', hint: '목표', optional: true },
    ],
    minSpan: 3,
    prefSpan: 4,
    small: true,
    sample: { fields: { label: '올해 교육 예산 집행', value: '3.6억 원', of: '5억 원', target: '4억 원' } },
  },
  range: {
    name: '범위',
    description: '지켜야 할 범위나 예상 범위, 그 위에 지금 값',
    motion: '띠가 가운데서 양쪽으로 열리고 고리가 내려앉아요',
    fields: [
      { key: 'label', label: '이름', hint: '무엇의 범위인지 (예: 서버실 적정 온도)' },
      { key: 'low', label: '낮은 값', hint: '18℃' },
      { key: 'high', label: '높은 값', hint: '24℃' },
      { key: 'mark', label: '지금 값', hint: '26℃', optional: true },
      { key: 'markName', label: '지금 값 이름', hint: '지금', optional: true },
      { key: 'note', label: '보충 설명', hint: '기준이나 출처 (예: 장비 제조사 권장)', optional: true },
    ],
    minSpan: 3,
    prefSpan: 4,
    small: true,
    sample: { fields: { label: '서버실 적정 온도', low: '18℃', high: '24℃', mark: '26℃', markName: '지난주 최고', note: '장비 제조사 권장' } },
  },
  status: {
    name: '상태',
    description: '일 하나의 상태 (진행 중, 완료, 예정, 지연)',
    motion: '상태 표시가 맺히고 할 일이 올라와요',
    variants: [
      { id: 'doing', name: '진행 중' },
      { id: 'done', name: '완료' },
      { id: 'todo', name: '예정' },
      { id: 'late', name: '지연' },
    ],
    fields: [
      { key: 'what', label: '할 일', hint: '무엇의 상태인지 (예: 신입 교육 자료 새로 쓰기)' },
      { key: 'meta', label: '언제, 누가', hint: '언제까지, 누가 (예: 11월 둘째 주 · 인사팀)', optional: true },
    ],
    minSpan: 3,
    prefSpan: 4,
    small: true,
    sample: { variant: 'doing', fields: { what: '신입 교육 자료 새로 쓰기', meta: '11월 둘째 주까지 · 인사팀' } },
  },
  steps: {
    name: '단계 표시',
    description: '지금 몇 번째 단계인지 (점을 이은 줄)',
    motion: '선이 그어지며 점이 차례로 맺히고 지금 단계가 커져요',
    fields: [{ key: 'label', label: '이름', hint: '무엇의 단계인지 (예: 새 근태 시스템 도입)', optional: true }],
    items: {
      label: '단계',
      // 둘이면 단계가 아니라 전과 후다. 일곱부터는 좁은 칸에서 점 사이가 점보다 좁아진다
      min: 3,
      max: 6,
      default: 4,
      fields: [{ key: 'title', label: '단계', hint: '단계 이름', hints: ['계획', '준비', '진행', '점검', '확대', '정착'] }],
    },
    minSpan: 3,
    prefSpan: 4,
    small: true,
    sample: {
      fields: { label: '새 근태 시스템 도입' },
      items: [{ title: '요구 정리' }, { title: '개발' }, { title: '시범 운영' }, { title: '전 부서 적용' }, { title: '정착 점검' }],
    },
  },
  date: {
    name: '날짜',
    description: '정해진 날 하나와 그날 하는 일 (마감, 회의, 시작일)',
    motion: '날짜가 올라오고 하는 일이 뒤따라요',
    fields: [
      { key: 'date', label: '날짜', hint: '11월 8일' },
      { key: 'what', label: '하는 일', hint: '그날 하는 일 (예: 확대 여부 결정 회의)' },
      { key: 'note', label: '보충 설명', hint: '보충 설명 (예: 남은 기간 2주)', optional: true },
    ],
    minSpan: 3,
    prefSpan: 4,
    small: true,
    sample: { fields: { date: '11월 8일 (금)', what: '연말 행사 장소 확정', note: '총무팀 · 남은 기간 2주' } },
  },
  note: {
    name: '주석',
    description: '표나 그림 아래 붙이는 작은 글 (출처, 기준, 주의)',
    motion: '조용히 흐려지듯 나타나요',
    fields: [
      { key: 'kind', label: '이름', hint: '기준', optional: true },
      { key: 'text', label: '주석', hint: '덧붙여 둘 말 (예: 9월 말 사내 집계예요)', multiline: true },
    ],
    minSpan: 3,
    prefSpan: 12,
    small: true,
    sample: { fields: { kind: '기준', text: '9월 말 인사 시스템 집계예요. 파견 인력은 빼고 셌어요.' } },
  },
  cine: {
    name: '모션 그래픽',
    description: '영화 타이틀처럼 한 장면을 짠 컴포넌트. 내 컴포넌트에서 틀을 골라 만들고, 고쳐 쓰며 버전이 남아요',
    motion: '빛이나 먹이 번지고 입자가 모여 글자가 되는 장면이 한 번 펼쳐져요',
    // 레시피가 쓰는 칸만 그린다(Cine.tsx). 비워도 빈칸으로 세지 않고, 편집할 때 접지 않는다
    fields: CINE_FIELD_SPECS.map((f) => ({ ...f, optional: true, shown: true })),
    minSpan: 6,
    prefSpan: 12,
    sample: { fields: presetSpec('light').sample as Record<string, string> },
  },
}

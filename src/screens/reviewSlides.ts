import { autoPlace, composeAreaH } from '../deck/blocks'
import { sampleBlock } from '../deck/blockSamples'
import { makeSlide } from '../deck/generate'
import type { Block, BlockLook, BlockType, Slide } from '../deck/types'

/*
 * 개발용: 부품 장의 대표 조합 (#/gallery?set=review). 조합 시험(combos.ts)은 seed로 고른 수백 장이라 한 장씩 비교하기 어려워서,
 * 고칠 때마다 같은 장을 전과 후로 견주어 볼 장면을 정해 둔다. 첫 장은 예시 발표의 '지금의 문제'를 부품 장으로 바꾸고
 * 핵심 한 줄과 인용을 더한 장이다(장 제목과 핵심 한 줄, 인용이 모두 굵은 검정으로 비슷한 크기라 셋 다 제목처럼 읽혔고,
 * 짧은 글 칸이 높은 칸에 떠서 부제 아래가 200px 넘게 비었다). 편집기의 '넣기'처럼 autoPlace로 차례대로 넣는다.
 * 내용은 모두 지어낸 것이다
 */

type Put = { type: BlockType; fields?: Record<string, string>; look?: BlockLook; n?: number; variant?: string }
type Look = Parameters<typeof composeAreaH>[1]

function block(p: Put, id: string): Block {
  const s = sampleBlock(p.type)
  const items = p.n && s.items.length ? Array.from({ length: p.n }, (_, i) => ({ ...s.items[i % s.items.length], id: `${id}-it${i}` })) : s.items
  return { ...s, id, items, fields: { ...s.fields, ...p.fields }, ...(p.look ? { look: p.look } : {}), ...(p.variant ? { variant: p.variant } : {}) }
}

function scene(id: string, fields: Record<string, string>, puts: Put[], look?: Look): Slide {
  const base: Slide = { ...makeSlide('compose'), id: `review-${id}`, fields }
  const areaH = composeAreaH(base, look, true)
  let blocks: Block[] = []
  puts.forEach((p, i) => {
    const placed = autoPlace(blocks, block(p, `${id}-b${i}`), areaH)
    if (!placed) throw new Error(`대표 조합 ${id}에 ${p.type}을 넣을 수 없습니다`)
    blocks = placed
  })
  return { ...base, blocks }
}

/** 글 둘의 자리를 맞바꾼 다음 전체 너비 차트를 넣은 실제 편집 장면 */
function pairChart(look?: Look): Slide {
  const slide = scene('pair-chart', {}, [{ type: 'bullets', n: 3 }, { type: 'callout' }, { type: 'trend' }], look)
  const positions = [
    { x: 0, y: 0, w: 6, h: 6 },
    { x: 6, y: 0, w: 6, h: 6 },
    { x: 0, y: 6, w: 12, h: 6 },
  ]
  return { ...slide, blocks: slide.blocks!.map((b, i) => ({ ...b, at: positions[i] })) }
}

/** 큰 글자로 점 목록의 칸을 조금 넓히면 읽기 어려운 두 단으로 바뀌던 장 */
function pairChartWide(look?: Look): Slide {
  const slide = pairChart(look)
  const positions = [
    { x: 0, y: 0, w: 7, h: 6 },
    { x: 7, y: 0, w: 5, h: 6 },
    { x: 0, y: 6, w: 12, h: 6 },
  ]
  return { ...slide, id: 'review-pair-chart-wide', fields: { title: '다음 할 일을 살펴봐요' }, blocks: slide.blocks!.map((b, i) => ({ ...b, at: positions[i] })) }
}

/** 넓은 목록 옆 주석이 멀어 보이던 경우. 짧은 글과 긴 글을 같이 견준다. */
function shortListNote(long: boolean): Slide {
  const list = block({ type: 'bullets', n: 2 }, `list-note-${long}-list`)
  const note = block({ type: 'note' }, `list-note-${long}-note`)
  const items = long ? list.items.map((item, i) => ({
    ...item,
    title: i === 0 ? '매달 처리 시간을 살펴보고 늦어진 원인을 함께 확인해요' : '담당자에게 결과를 공유하고 다음 분기 계획에 반영해요',
  })) : list.items
  return {
    ...makeSlide('compose'), id: `review-list-note-${long ? 'long' : 'short'}`,
    fields: { title: '다음에 할 일과 확인 기준' },
    blocks: [
      { ...list, items, at: { x: 0, y: 0, w: 8, h: 12 } },
      { ...note, at: { x: 8, y: 0, w: 4, h: 12 } },
    ],
  }
}

/** 나란한 글의 보이는 여백을 맞출 때 왼쪽 입력 칸이 오른쪽까지 넘어가던 장 */
function messageList(look?: Look): Slide {
  const slide = scene('message-list', { title: '주간 보고를 간결하게 바꿔요' }, [
    { type: 'message', fields: { text: '주간 보고를 한 양식으로 맞추면 회의가 20분 줄어요', sub: '기획팀 시범 3개월 결과 기준' } },
    { type: 'bullets', n: 3 },
  ], look)
  return { ...slide, blocks: slide.blocks!.map((b, i) => ({ ...b, at: { x: i * 6, y: 0, w: 6, h: 12 } })) }
}

/** 낮고 넓은 시장 규모에서 긴 숫자가 바로 옆 숫자와 겹치던 장 */
function marketLong(look?: Look): Slide {
  const slide = scene('market-long', {}, [{ type: 'market', n: 3 }, { type: 'text' }], look)
  const [market, text] = slide.blocks!
  return { ...slide, blocks: [
    { ...market, items: market.items.map((item, i) => ({ ...item, value: i === 0 ? '999,999,999억 원' : i === 1 ? '123,456,789억 원' : item.value, body: '' })), at: { x: 0, y: 0, w: 12, h: 8 } },
    { ...text, at: { x: 0, y: 8, w: 12, h: 4 } },
  ] }
}

/** 높이가 긴 단계 차트 옆에 숫자와 글을 쌓은 장 */
function funnelStat(): Slide {
  const puts: Put[] = [
    { type: 'funnel', look: 'card', n: 4 },
    { type: 'stat', look: 'card' },
    { type: 'text', look: 'card' },
  ]
  const positions = [
    { x: 0, y: 0, w: 8, h: 12 },
    { x: 8, y: 0, w: 4, h: 5 },
    { x: 8, y: 5, w: 4, h: 7 },
  ]
  return {
    ...makeSlide('compose'), id: 'review-funnel-stat', fields: { title: '지원에서 합격까지의 흐름을 살펴봐요' },
    blocks: puts.map((p, i) => ({ ...block(p, `funnel-stat-b${i}`), at: positions[i] })),
  }
}

/** 낮은 요약의 양 끝 여백 때문에 글자가 두 단계 줄던 장 */
function chartSummary(): Slide {
  const puts: Put[] = [
    { type: 'diverge', variant: 'down', n: 2, fields: { heading: '부서별 야근 증감', basis: '작년 같은 분기 대비' } },
    { type: 'summary', variant: 'base', n: 4 },
  ]
  const positions = [{ x: 0, y: 0, w: 12, h: 5 }, { x: 0, y: 5, w: 12, h: 7 }]
  return {
    ...makeSlide('compose'), id: 'review-chart-summary', fields: { title: '업무 시간과 개선안을 살펴봐요' },
    blocks: puts.map((p, i) => ({ ...block(p, `chart-summary-b${i}`), at: positions[i] })),
  }
}

/** 윗줄이 다른 칸 아래에 목표와 쌓은 막대를 나란히 둔 장 */
function goalStack(): Slide {
  const puts: Put[] = [
    { type: 'ring' }, { type: 'stat' }, { type: 'goal' }, { type: 'stack', variant: 'sum', n: 2 },
  ]
  const positions = [
    { x: 4, y: 0, w: 8, h: 5 }, { x: 0, y: 0, w: 4, h: 5 },
    { x: 0, y: 5, w: 5, h: 7 }, { x: 5, y: 5, w: 7, h: 7 },
  ]
  return {
    ...makeSlide('compose'), id: 'review-goal-stack', fields: { title: '주요 지표의 변화를 살펴봐요' },
    blocks: puts.map((p, i) => ({ ...block(p, `goal-stack-b${i}`), at: positions[i] })),
  }
}

/** 숫자의 빈 입력 영역이 위로 당겨진 비율 컴포넌트를 덮던 장 */
function numberRing(): Slide {
  const puts: Put[] = [
    { type: 'number' }, { type: 'ring', look: 'bold' },
    { type: 'number', fields: { value: '1,240건', label: '한 달 문의', note: '지난해보다 18% 늘었어요' } },
    { type: 'bars', variant: 'columns', n: 4 },
  ]
  const positions = [
    { x: 0, y: 0, w: 4, h: 5 }, { x: 8, y: 5, w: 4, h: 7 },
    { x: 4, y: 0, w: 8, h: 5 }, { x: 0, y: 5, w: 8, h: 7 },
  ]
  return {
    ...makeSlide('compose'), id: 'review-number-ring', fields: { title: '주요 지표를 함께 살펴봐요' },
    blocks: puts.map((p, i) => ({ ...block(p, `number-ring-b${i}`), at: positions[i] })),
  }
}

/** 연결된 숫자 중 들여 쓴 칸이 아래 차트 쪽으로 길게 남던 장 */
function linkedNumbers(): Slide {
  const puts: Put[] = [
    { type: 'number', look: 'card' },
    { type: 'number', look: 'plain', fields: { value: '1,240건', label: '한 달 문의', note: '지난해보다 18% 늘었어요' } },
    { type: 'number', look: 'plain', fields: { value: '1,240건', label: '한 달 문의', note: '지난해보다 18% 늘었어요' } },
    { type: 'stack', look: 'plain', variant: 'sum', n: 3 },
  ]
  const positions = [
    { x: 0, y: 0, w: 4, h: 6 }, { x: 4, y: 0, w: 4, h: 6 },
    { x: 8, y: 0, w: 4, h: 6 }, { x: 0, y: 6, w: 12, h: 6 },
  ]
  return {
    ...makeSlide('compose'), id: 'review-linked-numbers', fields: {},
    blocks: puts.map((p, i) => ({ ...block(p, `linked-numbers-b${i}`), at: positions[i], ...(i === 0 ? { link: 'arrow' as const } : {}) })),
  }
}

/** 본문 아래까지 찬 숫자 묶음 옆에서 목록의 첫 줄을 맞추던 장 */
function sparkKpiList(): Slide {
  const puts: Put[] = [
    { type: 'spark', look: 'plain' },
    { type: 'kpi', look: 'card', variant: 'base', n: 2 },
    { type: 'bullets', look: 'card', n: 3 },
  ]
  const positions = [
    { x: 0, y: 0, w: 12, h: 5 }, { x: 0, y: 5, w: 8, h: 7 }, { x: 8, y: 5, w: 4, h: 7 },
  ]
  return {
    ...makeSlide('compose'), id: 'review-spark-kpi-list', fields: { title: '변화와 다음 할 일을 살펴봐요' },
    blocks: puts.map((p, i) => ({ ...block(p, `spark-kpi-list-b${i}`), at: positions[i] })),
  }
}

/** 쌓인 두 칸 옆 준비 상황의 높이가 줄었다가 되돌아가던 장 */
function stackedChecks(): Slide {
  const puts: Put[] = [
    { type: 'delta', look: 'card' }, { type: 'checks', look: 'card', n: 3 }, { type: 'callout', look: 'card' },
  ]
  const positions = [
    { x: 0, y: 4, w: 6, h: 8 }, { x: 6, y: 0, w: 6, h: 12 }, { x: 0, y: 0, w: 6, h: 4 },
  ]
  return {
    ...makeSlide('compose'), id: 'review-stacked-checks', fields: { title: '준비와 변화 상황을 살펴봐요' },
    blocks: puts.map((p, i) => ({ ...block(p, `stacked-checks-b${i}`), at: positions[i] })),
  }
}

/** look: 갤러리의 테마(글꼴)와 글자 크기. 판을 그 본문 높이로 짠다 */
export function reviewSlides(look?: Look): Slide[] {
  return [
    shortListNote(false),
    shortListNote(true),
    // 예시 발표의 '지금의 문제' + 핵심 한 줄 + 인용 (말한 사람 없이)
    scene(
      'user',
      {
        title: '회의가 많아서 정작 일할 시간이 모자라요',
        lead: '본부 80명 중 열에 일곱이 회의 때문에 야근한 적이 있다고 답했어요. 가장 오래 걸리는 건 돌아가며 진행 상황을 말하는 주간 회의예요.',
      },
      [
        { type: 'message', fields: { text: '회의 시간을 3분의 1로 줄일 수 있어요', sub: '' } },
        { type: 'quote', fields: { quote: '진행 상황은 보드로 미리 보고 모여서는 정할 것만 정하면 한 시간은 아껴요. 손을 든 두 팀부터 해 보죠.', by: '' } },
      ],
      look,
    ),
    // 글만: 핵심 한 줄 아래 제목과 글 둘
    scene('text', { title: '배포 전 점검을 자동으로 바꿔요' }, [{ type: 'message' }, { type: 'text' }, { type: 'text', fields: { heading: '실패한 것만 다시 봐요', body: '자동 시험이 걸러 낸 항목만 사람이 확인해서 점검 시간이 하루에서 두 시간으로 줄어요.' } }], look),
    // 글과 숫자
    scene('number', { title: '전기료가 해마다 3.6억 원 줄어요', lead: '공장 두 곳의 냉각 설비를 바꾼 뒤 6개월 기준' }, [{ type: 'number' }, { type: 'number', fields: { value: '14%', label: '줄어든 사용량', note: '' } }, { type: 'text' }], look),
    // 글과 차트
    scene('chart', { title: '문의는 줄고 한 번에 끝내는 비율은 올랐어요' }, [{ type: 'message' }, { type: 'trend' }], look),
    // 인용과 목록
    scene('quote', { title: '시범 부서의 반응' }, [{ type: 'quote' }, { type: 'bullets' }], look),
    // 셋이 나란히
    scene('three', { title: '세 가지를 먼저 바꿔요' }, [{ type: 'text' }, { type: 'text' }, { type: 'text' }], look),
    // 제목 없는 결론 한 장
    scene('bare', {}, [{ type: 'message' }, { type: 'quote' }], look),
    // 빽빽한 장
    scene('dense', { title: '3분기 운영 지표', lead: '목표 대비 달성과 다음 분기 과제' }, [{ type: 'number' }, { type: 'delta' }, { type: 'goal' }, { type: 'bullets' }, { type: 'callout' }], look),
    // 강조 상자와 근거
    scene('callout', { title: '교육 담당 2명을 지원해 주세요' }, [{ type: 'callout', look: 'bold' }, { type: 'bullets', n: 4 }], look),
    // 소제목과 목록 둘
    scene('heading', { title: '잘된 것과 남은 것' }, [{ type: 'heading' }, { type: 'bullets', n: 2 }, { type: 'heading' }, { type: 'checks', n: 2 }], look),
    // 긴 목록과 차트 다음에 넣은 핵심 한 줄 (맨 위에도 목록 왼쪽에도 자리가 없어 맨 아래에 깔리던 장)
    scene('lead-late', { title: '시범 부서의 반응' }, [{ type: 'bullets', n: 6 }, { type: 'trend' }, { type: 'message' }], look),
    // 일정 설명 바로 아래 개요 제목이 붙어 보이던 장
    scene('timeline-facts', { title: '시범 운영을 세 단계로 진행해요' }, [{ type: 'timeline', n: 3 }, { type: 'facts', n: 2 }], look),
    // 가로 원인 차트 아래 숫자와 설명이 붙어 보이던 장
    scene('pareto-number', { title: '불량 원인을 우선순위대로 개선해요' }, [{ type: 'pareto', variant: 'rows', n: 4, fields: { heading: '9월 불량 원인 (830건)' } }, { type: 'number', fields: { label: '연간 예상 절감액' } }], look),
    // 전체 너비 차트가 아래에 있어도 위의 짧은 두 글은 바깥과 사이 여백을 고르게
    pairChart(look),
    pairChartWide(look),
    messageList(look),
    marketLong(look),
    funnelStat(),
    chartSummary(),
    goalStack(),
    numberRing(),
    linkedNumbers(),
    sparkKpiList(),
    stackedChecks(),
  ]
}

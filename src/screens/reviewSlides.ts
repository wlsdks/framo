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
    { type: 'message', fields: { text: '주간 보고 양식을 하나로 맞춰요', sub: '팀마다 다른 양식을 다시 정리하는 일이 없도록' } },
    { type: 'bullets', n: 3 },
  ], look)
  return { ...slide, blocks: slide.blocks!.map((b, i) => ({ ...b, at: { x: i * 6, y: 0, w: 6, h: 12 } })) }
}

/** 핵심 문장 아래 낮고 넓은 목록: 항목 수와 글 길이에 따라 단과 여백이 바뀌는 사례 */
function messageListStacked(n: number, long: boolean): Slide {
  const message = block({ type: 'message', fields: { text: '주간 보고 양식을 하나로 맞춰요', sub: '팀마다 다른 양식을 다시 정리하는 일이 없도록' } }, `message-stack-${n}-message`)
  const list = block({ type: 'bullets', n }, `message-stack-${n}-list`)
  const short = ['주문이 많은 품목부터 적용해요', '단가 기록을 한곳에 모아요', '매달 처리 시간을 살펴봐요', '담당자에게 결과를 공유해요', '분기마다 효과를 다시 봐요', '결과에 따라 적용 범위를 넓혀요']
  const extended = ['주문이 많은 품목부터 적용하고 처리 시간을 함께 살펴봐요', '단가 기록을 한곳에 모아 담당자가 쉽게 확인하도록 해요', '매달 처리 시간을 살펴보고 지연된 원인을 찾아요', '담당자에게 결과를 공유하고 개선할 점을 정해요', '분기마다 효과를 다시 보고 다음 계획에 반영해요', '결과에 따라 적용 범위를 넓히고 참여 팀을 정해요']
  return {
    ...makeSlide('compose'), id: `review-message-stack-${n}${long ? '-long' : ''}`, fields: { title: '가상의 주간 보고 개선' },
    blocks: [
      { ...message, at: { x: 0, y: 0, w: 12, h: 7 } },
      { ...list, fields: { ...list.fields, heading: '먼저 바꿀 것' }, items: list.items.map((item, i) => ({ ...item, title: (long ? extended : short)[i] })), at: { x: 0, y: 7, w: 12, h: 5 } },
    ],
  }
}

/** 입력 중 단위가 섞이면 원문을 보여 주는 비교 차트. 실제 편집처럼 놓은 뒤 값을 바꿔 본다. */
function mixedVersus(variant: 'base' | 'lines' | 'dots', look?: Look): Slide {
  const slide = scene(`mixed-versus-${variant}`, { title: '가상의 비교 값과 단위를 확인해요' }, [
    { type: 'versus', variant, n: 4 }, { type: 'note', fields: { kind: '확인', text: '두 값의 단위를 맞춘 뒤 비교해요.' } },
  ], look)
  const values = [['10건', '20%'], ['8건', '15%'], ['6건', '확인 중'], ['', '5%']]
  return { ...slide, blocks: slide.blocks!.map((b) => b.type !== 'versus' ? b : {
    ...b, fields: { ...b.fields, unit: '' },
    items: b.items.map((item, i) => ({ ...item, meta: values[i][0], value: values[i][1] })),
  }) }
}

/** 실적과 목표의 단위가 서로 다를 때 작성한 값을 감추지 않는지 확인한다. */
function mixedAttain(variant: 'base' | 'gap', look?: Look): Slide {
  const slide = scene(`mixed-attain-${variant}`, { title: '가상의 실적과 목표 단위를 확인해요' }, [
    { type: 'attain', variant, n: 3 }, { type: 'note', fields: { kind: '확인', text: '같은 단위로 고친 뒤 달성 여부를 비교해요.' } },
  ], look)
  const values = [['10건', '5%'], ['20건', '15%'], [variant === 'gap' ? '' : '확인 중', '25%']]
  return { ...slide, blocks: slide.blocks!.map((b) => b.type !== 'attain' ? b : {
    ...b, fields: { ...b.fields, unit: '' },
    items: b.items.map((item, i) => ({ ...item, value: values[i][0], meta: values[i][1] })),
  }) }
}

/** 평가가 빠진 열과 아직 확인 중인 글이 다른 대안으로 밀리지 않는지 확인한다. */
function missingRating(look?: Look): Slide {
  const slide = scene('missing-rating', { title: '가상의 세 가지 대안을 비교해요' }, [
    { type: 'rating', n: 3 }, { type: 'note', fields: { kind: '확인', text: '비어 있는 평가는 확인한 뒤 채워요.' } },
  ], look)
  const values = ['좋음, , 나쁨', '보통, 확인 중, 좋음', ', 보통,']
  return { ...slide, blocks: slide.blocks!.map((b) => b.type !== 'rating' ? b : {
    ...b, fields: { ...b.fields, opts: '첫째, , 셋째', pick: '' },
    items: b.items.map((item, i) => ({ ...item, body: values[i] })),
  }) }
}

/** 확인되지 않았거나 범위가 맞지 않는 진행률이 어떤 상태로 그려지는지 살펴볼 사례. */
function uncertainProgress(look?: Look): Slide {
  const slide = scene('uncertain-progress', { title: '가상의 과제와 확인할 진행률' }, [
    { type: 'progress', variant: 'board', n: 4 }, { type: 'note', fields: { kind: '검수', text: '진행률과 상태를 확인한 뒤 표시해요.' } },
  ], look)
  const values = [['40%', '진행 중'], ['확인 중', ''], ['10건', ''], ['150%', '']]
  return { ...slide, blocks: slide.blocks!.map((b) => b.type !== 'progress' ? b : {
    ...b, items: b.items.map((item, i) => ({ ...item, value: values[i][0], body: values[i][1] })),
  }) }
}

/** 다섯 상태가 동시에 있을 때 좁은 단과 줄 높이를 점검한다. */
function fiveLaneProgress(look?: Look): Slide {
  const slide = scene('five-lane-progress', { title: '가상의 과제 상태를 함께 살펴봐요' }, [
    { type: 'progress', variant: 'board', n: 7 },
  ], look)
  const values = [['100%', '완료'], ['60%', '진행 중'], ['30%', '2주 지연'], ['0%', '예정'], ['150%', '검토 중'], ['40%', '진행 중'], ['10건', '검토 중']]
  return { ...slide, blocks: slide.blocks!.map((b) => ({ ...b, items: b.items.map((item, i) => ({ ...item, value: values[i][0], body: values[i][1] })) })) }
}

/** 실제 편집에서 만든 목록과 비율 원: 글이 채워진 뒤 다시 놓는 경우도 살핀다. */
function listRing(look?: Look, long = false): Slide {
  const slide = scene(long ? 'list-ring-long' : 'list-ring', { title: '분류 시간을 줄여 현장의 대기와 재작업을 함께 줄여요', lead: '가상의 현장 조사와 시범 운영을 기준으로' }, [
    { type: 'bullets', n: 3, fields: { heading: '' } }, { type: 'ring', fields: { value: '72%', label: long ? '시범 운영에서 처음으로 해결한 문의의 비율' : '가상의 시범 목표', note: long ? '가상의 문의를 8주 동안 살펴본 결과예요' : '' } },
  ], look)
  const titles = ['현장 대기 시간을 먼저 살펴봐요', '한 구간에서 8주간 시범 운영해요', '처리 시간과 재작업을 함께 비교해요']
  return { ...slide, blocks: slide.blocks!.map((b) => b.type === 'bullets' ? { ...b, items: b.items.map((item, i) => ({ ...item, title: titles[i], body: '' })) } : b) }
}

/** 실제 입력처럼 이름에 설명까지 길게 적은 경우: 글이 사라지거나 옆 목록과 겹치지 않는지 본다. */
function listRingVeryLong(look?: Look): Slide {
  const slide = listRing(look, true)
  return { ...slide, id: 'review-list-ring-very-long', blocks: slide.blocks!.map((b) => b.type === 'ring' ? {
    ...b, fields: { ...b.fields, label: '가상의 현장 시범 운영에 참여한 여러 팀이 처음 받은 문의를 추가 확인 없이 해결한 비율과 처리 속도의 변화와 담당자의 확인 결과를 함께 살펴보는 가상의 예시', note: '' },
  } : b) }
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

/**
 * 판을 혼자 쓰는 바뀌기: 짝 넷에 글이 긴 편(바뀐 뒤 18자 남짓)과 짝 셋에 짧은 글. 짝마다 한 단으로 세우던 짜임은 긴 글을 칸마다 두세 줄로
 * 꺾고 끝 줄에 낱말 하나를 남겼다(검수). 글은 지어낸 것이다
 */
function wipeAlone(look?: Look, long = true): Slide {
  const pairs = long
    ? [
        ['회의록을 폴더마다 뒤져 찾음', '흩어진 회의록을 한 번에 찾아 주는 검색'],
        ['같은 질문을 팀마다 되풀이', '처음 답한 내용을 바로 다시 보여 주는 창'],
        ['현황을 사람마다 따로 확인', '팀 현황을 한 화면에 모아 주는 보드'],
        ['결정한 이유가 메일에 묻힘', '결정과 그 이유를 함께 남기는 기록'],
      ]
    : [
        ['회의록을 폴더에서 찾아요', '검색 한 번에 찾아요'],
        ['같은 질문을 매번 해요', '처음 한 번만 물어요'],
        ['현황을 사람마다 물어요', '한 화면에서 봐요'],
      ]
  const id = long ? 'wipe-long' : 'wipe-short'
  const slide = scene(id, { title: long ? '공용 보드로 찾는 시간을 줄여요' : '찾는 시간이 줄어요' }, [{ type: 'wipe', fields: { from: '지금', to: long ? '공용 보드를 쓰면' : '바뀐 뒤' }, n: pairs.length }], look)
  const [wipe] = slide.blocks!
  return { ...slide, blocks: [{ ...wipe, items: wipe.items.map((item, i) => ({ ...item, title: pairs[i][0], body: pairs[i][1] })) }] }
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

/** 두 지표가 세로로 쌓이고 옆 목록이 위에만 몰린 사용자의 사례 */
function kpiNextActions(long = false): Slide {
  const kpi = block({ type: 'kpi', variant: 'cards', n: 2 }, 'kpi-actions-kpi')
  const list = block({ type: 'bullets', n: 3 }, 'kpi-actions-list')
  const items = long ? [
    { title: '한 달 동안 처리한 문의', value: '12,345건', body: '시범 운영에 참여한 세 곳을 합친 건수' },
    { title: '처음에 해결된 문의', value: '78.5%', body: '가상의 문의 가운데 추가 확인이 필요 없었던 비율' },
  ] : [
    { title: '한 사람이 아끼는 시간', value: '3시간', body: '회의 9시간이 6시간으로' },
    { title: '줄어드는 진행 회의 시간', value: '67%', body: '진행 회의 90분이 30분으로' },
  ]
  return {
    ...makeSlide('compose'), id: `review-kpi-next-actions${long ? '-long' : ''}`, fields: {},
    blocks: [
      { ...kpi, items: kpi.items.map((item, i) => ({ ...item, ...items[i] })), at: { x: 0, y: 0, w: 8, h: 12 } },
      { ...list, at: { x: 8, y: 0, w: 4, h: 12 } },
    ],
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
    ...[2, 3, 4, 5, 6].flatMap((n) => [messageListStacked(n, false), messageListStacked(n, true)]),
    ...(['base', 'lines', 'dots'] as const).map((variant) => mixedVersus(variant, look)),
    ...(['base', 'gap'] as const).map((variant) => mixedAttain(variant, look)),
    missingRating(look),
    uncertainProgress(look),
    fiveLaneProgress(look),
    listRing(look), listRing(look, true), listRingVeryLong(look),
    ...(['base', 'gauge'] as const).flatMap((variant) => [
      scene(`ring-range-${variant}`, { title: '가상의 비율을 확인해요' }, [{ type: 'ring', variant, fields: { value: '150%', label: '확인할 비율' } }, { type: 'note', fields: { text: '입력한 비율이 표시 범위에 맞는지 확인해요.' } }], look),
      scene(`ring-unit-${variant}`, { title: '가상의 단위를 확인해요' }, [{ type: 'ring', variant, fields: { value: '10건', label: '확인할 값' } }, { type: 'note', fields: { text: '비율이 아닌 값은 원문으로 확인해요.' } }], look),
    ]),
    marketLong(look),
    wipeAlone(look),
    wipeAlone(look, false),
    funnelStat(),
    chartSummary(),
    goalStack(),
    numberRing(),
    linkedNumbers(),
    sparkKpiList(),
    kpiNextActions(),
    kpiNextActions(true),
    stackedChecks(),
  ]
}

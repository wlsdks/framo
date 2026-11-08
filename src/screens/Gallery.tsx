import { BLOCK_LOOK_IDS, BLOCKS, BLOCK_TYPES, BOARD_ROWS, boardFit, boardFromRows, composeAreaH, needRows, rearrangeBlocks, settleDeck } from '../deck/blocks'
import { sampleBlock } from '../deck/blockSamples'
import { BLUEPRINTS } from '../deck/blueprints'
import { pageInfo } from '../deck/fields'
import { createDeck, makeSlide } from '../deck/generate'
import { LAYOUTS } from '../deck/layouts'
import { createSampleDeck } from '../deck/sample'
import { extraSlides, withItems, withOptions } from '../deck/showcase'
import type { Block, BlockLook, BlockType, Deck, DeckTheme, DeckType, Slide, ThemeId, Tone } from '../deck/types'
import type { SlideMode } from '../slides/context'
import type { SlideActions } from '../slides/context'
import { pageProps, ScaledSlide, SlideCanvas } from '../slides/SlideCanvas'
import { fitBlocks } from '../slides/fitBlocks'
import { motionEngine } from '../motion/engine'
import { checkAssembly } from './assembly'
import { checkCombos, comboSlides } from './combos'
import { checkEdit } from './checkEdit'
import { checkFrame, inkOf } from './checkFrame'
import { clashes, failingHeights, heightsSource, measureAll, measureAllFonts, measureBlocks, mergeHeights, spanWidth } from './measureBlocks'
import { reviewSlides } from './reviewSlides'
import { scenarioSlides } from './scenarioSlides'
import { checkStress, stressSlides } from './stress'
import { dirSlides } from './dirSlides'
import { BackdropSheet, backdropSlides, withBackdrop } from './backdropSlides'

// 개발용: 모든 레이아웃을 한 화면에 늘어놓고 디자인을 점검한다. #/gallery?theme=navy&mode=preview&set=blank&type=deal
// &set=blocks 는 부품마다 넓은 칸과 좁은 칸에 넣어 본 부품 장. &types=ring,ratio 처럼 부품을 고르고, &bv=list 처럼 부품의 모양을 고를 수 있다.
// &fill=max 는 항목을 가장 많이, &fill=default 는 새로 넣을 때의 수, &fill=3 처럼 숫자면 그만큼(정한 범위 안에서). &bl=plain|card 는 부품의 바탕을 모두 그것으로 (잘리지 않는 높이를 잴 때, measureBlocks.ts)
// &variants=1 이면 장마다 레이아웃의 모든 모양을 늘어놓는다. &only=kpi,bars 처럼 레이아웃을 고를 수 있다.
// &tone=invert|accent 는 모든 장의 바탕을, &font=serif|suit|myeongjo &size=large &footer=page &accent=B8432A 는 발표 전체 설정을 바꿔 본다.
// &hl=2 는 강조할 항목(일정은 지금 단계)을 고를 수 있는 장 모두에 같은 번호를 준다.
// &count=5 는 레이아웃 장의 항목 수를 그만큼(정한 범위 안에서). 예시 항목을 되풀이해 채운다.
// &names=10월 1주,10월 2주 와 &values=900,60,40 은 레이아웃 장과 부품 장의 항목 이름과 값을 그 글로(쉼표로 나눠 되풀이). 긴 이름, 큰 차이를 볼 때.
// &metas=각자 소속 팀의 막힌 일 처럼 항목의 설명(meta)도 같다. &head=장 제목 은 set=blocks의 장에 제목을 단다(부제 대신, 제목 아래 빈 곳을 볼 때).
// &flip=1 은 두 판으로 나뉜 장(표지, 사례, 이미지와 설명, 결정 요청)의 옆 판을 반대쪽으로, &side=3 처럼 숫자면 옆 판의 너비(고를 수 있는 값일 때만).
// &hideHead=1, &hideFoot=1 은 제목·부제와 아래 표시를 각각 숨긴 슬라이드를 점검한다. &blankHead=1 은 제목과 부제를 비운다.
// set=edge 는 차트 장이 무너지기 쉬운 값(음수, 빈 값, 많은 항목, 같은 값)만 모아 본다.
// set=review 는 부품 장의 대표 조합 몇 장 (reviewSlides.ts, 고치기 전과 후를 견줄 때). &reflow=1은 같은 장을 자동 재배치한 결과다.
// &w=1920 이면 장을 줄이지 않고 그린다.
// set=scenarios 는 서로 다른 발표 상황의 가상 내용을 자동 조립한 장이다.
// set=stress&type=bullets 는 부품 하나를 항목 수, 칸 너비, 칸 높이마다 (stress.ts의 checkStress). type=many 는 부품 하나부터 여섯까지.
// set=dirs 는 컴포넌트의 모양을 고칠 때 전과 후를 견줄 장(dirSlides.ts: 빽빽한 장, 듬성한 장, 지표 줄, 단계, 비교, 인용, 이음표).
// set=combos&seed=1&n=60 은 규칙이 받아들인 부품 조합을 seed마다 정해진 차례로 만들어 본다 (combos.ts의 checkCombos).
// &blank=1이면 부품마다 반쯤은 첫 항목만 채운 채로 발표하는 모습(빈 항목이 빠진다).
// set=backdrops 는 배경마다 어울리는 장 하나(backdropSlides.ts). &bd=diffuse 는 어느 갤러리든 모든 장에 그 배경을, &bdat=right &bds=soft 는 자리와 짙기를.

/** set=edge: 차트 장이 무너지기 쉬운 값들 (음수, 빈 값, 많은 항목, 모두 같은 값, 긴 이름) */
function edgeSlides(): Slide[] {
  const trend = (title: string, values: string[], fields: Record<string, string> = {}) =>
    withItems(makeSlide('trend'), values.map((value, i) => ({ title: `${i + 1}월`, value })), { title, ...fields })
  return [
    trend('성장률이 마이너스에서 돌아섰어요', ['-3%', '-1.5%', '△0.5%', '1%', '2.5%', '4%'], { unit: '%', target: '3' }),
    trend('열두 달 흐름', ['96', '101', '99', '108', '117', '131', '126', '134', '140', '138', '145', '152'], { unit: '억 원' }),
    trend('빈 달이 있어요', ['96', '', '99', '108', '', '131']),
    trend('값이 모두 같아요', ['50', '50', '50', '50']),
    trend('0부터 시작해요', ['0', '12', '30', '41', '38', '60'], { unit: '건' }),
    withItems(
      makeSlide('progress'),
      [
        { title: '거래처별 단가 이력을 한곳에 모으고 분기마다 다시 확인하기', meta: '영업기획팀과 구매팀, 12월 말', value: '100%' },
        { title: '견적 양식 통일', value: '65%', body: '검토 중' },
        { title: '승인 단계 줄이기', value: '30%', body: '보류' },
        { title: '현장 교육', value: '0%' },
        { title: '효과 점검', value: '' },
        { title: '결과 보고', value: '10%', body: '착수' },
        { title: '내년 계획', value: '0%', body: '시작 전' },
      ],
      { title: '일곱 과제, 상태를 비운 칸은 진행률로 짐작해요', source: '10월 3주 기준' },
    ),
    withItems(
      makeSlide('share'),
      [
        { title: '제조', value: '40%' },
        { title: '유통', value: '35%' },
        { title: '금융', value: '15%' },
        { title: '공공', value: '6%' },
        { title: '기타', value: '3%' },
        { title: '해외 시범 사업', value: '1%' },
      ],
      { title: '비율로 적은 여섯 항목', source: '9월 말 기준' },
    ),
    withOptions(withItems(
      makeSlide('share'),
      [
        { title: '인건비', value: '3,200' },
        { title: '장비', value: '0.4' },
        { title: '교육', value: '' },
      ],
      { title: '강조 없이, 아주 작은 조각과 빈 값', unit: '만 원' },
    ), { highlight: -1 }),
    withOptions(withItems(
      makeSlide('process'),
      [
        { title: '요청 접수', meta: '영업 담당', body: '고객 요청을 남겨요' },
        { title: '현장 확인과 사진 기록', body: '설치 자리를 직접 보고 사진으로 남겨 견적에 붙여요' },
        { title: '견적', meta: '영업 담당, 하루' },
        { title: '검토와 승인' },
        { title: '계약', meta: '영업본부, 사흘', body: '계약 조건을 확정해요' },
        { title: '사후 관리', body: '쓰는 모습을 살펴요' },
      ],
      { title: '여섯 단계, 긴 이름과 빈 칸' },
    ), { highlight: 5 }),
    withItems(
      makeSlide('funnel'),
      [
        { title: '홈페이지 방문', value: '12,400' },
        { title: '자료 다운로드', value: '1,860' },
        { title: '상담 신청', value: '310' },
        { title: '현장 방문', value: '' },
        { title: '제안', value: '42' },
        { title: '계약', value: '3', meta: '평균 1.2억 원' },
      ],
      { title: '여섯 단계, 큰 차이와 빈 값', unit: '건' },
    ),
  ]
}

/**
 * 부품마다 편집기에서 실제로 나올 수 있는 크기로: 혼자 판을 다 쓸 때, 가장 좁은 칸에 가장 낮게 끌어내렸을 때,
 * 장 너비를 다 쓰면서 가장 낮을 때, 셋이 나란히. 줄로 적어 판으로 옮긴다(boardFromRows). 낮은 줄은 높이 비중(grow)으로 만든다:
 * 다른 줄이 남는 높이를 다 가져가서 그 줄은 판이 허락하는 가장 낮은 높이(blockMinH)가 된다.
 * 편집기가 넣지 않는 자리(더 좁거나 더 낮은 칸)는 그리지 않는다. 그런 칸은 쓰는 사람도 볼 일이 없다.
 * 핵심 한 줄과 같이 들어가지 않는 부품은 혼자 둔다(편집기도 그 장에는 넣지 않는다).
 * 함께 놓는 부품(fill-)은 높이를 잴 때(measureBlocks) 건너뛴다.
 */
function blockSlides(fill: string | null, only?: string[], variant?: string | null, look?: string | null, lane?: boolean, value?: string | null, fiveLanes?: boolean, status?: string | null, head?: string | null): Slide[] {
  return BLOCK_TYPES.flatMap((type, n) => {
    if (only && !only.includes(type)) return []
    const spec = BLOCKS[type]
    const original = sampleBlock(type)
    // 숫자가 아닌 입력도 실제 크기로 재어 본다. 예시의 다른 부품은 바꾸지 않는다.
    const sample = type === 'ring' && value != null ? { ...original, fields: { ...original.fields, value } } : original
    // &fill=max: 항목을 가장 많이 넣었을 때, &fill=default: 새로 넣을 때의 수, &fill=3: 세 개. 예시 항목을 되풀이해 채운다
    const count = !spec.items
      ? 0
      : fill === 'max'
        ? spec.items.max
        : fill === 'default'
          ? spec.items.default
          : Math.min(spec.items.max, Math.max(spec.items.min, Number(fill) || 0))
    const filled =
      count && sample.items.length
        ? Array.from({ length: count }, (_, i) => ({ ...sample.items[i % sample.items.length], id: `${type}-it${i}` }))
        : sample.items
    // &lane=1: 진행 현황의 과제를 모두 한 단에(상태별 모양의 높이는 가장 많이 모인 단의 과제 수로 잰다, blocks/sizing.ts).
    // 지연 단이라 과제마다 사정 글이 이름 줄 끝에 선다: 단 너비가 가장 좁은 경우
    const states = [['100%', '완료'], ['60%', '지연 없이 진행 중'], ['30%', '2주 지연'], ['0%', '예정'], ['150%', '검토 중'], ['40%', '진행 중'], ['10건', '검토 중']]
    const items = type !== 'progress' ? filled : status != null
      ? filled.map((it) => ({ ...it, body: status })) : fiveLanes
      ? filled.map((it, i) => ({ ...it, value: states[i][0], body: states[i][1] }))
      : lane ? filled.map((it) => ({ ...it, body: '2주 지연' })) : filled
    // &bv=list: 그 모양이 있는 부품은 그 모양으로
    const v = variant && spec.variants?.some((x) => x.id === variant) ? { variant } : {}
    const lk = BLOCK_LOOK_IDS.find((x) => x === look) ? { look: look as BlockLook } : {}
    const b = (id: string) => ({ ...sample, ...v, ...lk, items, id: `${type}-${id}` })
    const filler = (id: string, t: BlockType) => ({ ...sampleBlock(t), look: 'plain' as BlockLook, id: `${type}-fill-${id}` })
    const narrow = 12 - spec.minSpan
    const slide = (id: string, title: string, rows: { id: string; blocks: Block[]; spans?: number[]; grow?: number }[]): Slide => {
      // 이름은 장 제목이 아니라 부제에: 장 제목이 있으면 핵심 한 줄과 인용이 한 단계 작아져서(message.css, quote.css) 제목 없는 장에서
      // 그려질 큰 글자로 재지 못했다. 부품의 잘리지 않는 높이는 더 큰 쪽으로 잰다
      const s: Slide = { ...makeSlide('compose'), id: `bk-${n}-${id}`, fields: head ? { title: head } : { lead: `${spec.name}: ${title}` } }
      const fit = boardFit(composeAreaH(s))
      const blocks = boardFromRows(rows, fit)
      // 위 줄과 같이 들어가지 않으면 그 부품만
      if (needRows(blocks, fit) <= BOARD_ROWS) return { ...s, blocks }
      return { ...s, blocks: boardFromRows(rows.filter((r) => !r.blocks.every((x) => x.id.includes('-fill-m'))).map(({ grow: _, ...r }) => r), fit) }
    }
    return [
      slide('a', '한 줄을 다 쓸 때', [{ id: 'r1', blocks: [b('a')] }]),
      // 가장 좁은 칸, 가장 낮은 줄: 옆 칸은 낮게 들어가는 글 칸
      ...(narrow > 0
        ? [
            slide('b', '가장 좁은 칸, 가장 낮은 줄', [
              { id: 'r1', blocks: [filler('m', 'message')], grow: 99 },
              { id: 'r2', blocks: [b('b'), filler('p', 'text')], spans: [spec.minSpan, narrow], grow: 1 },
            ]),
          ]
        : []),
      slide('w', '한 줄을 다 쓰고 가장 낮은 줄', [
        { id: 'r1', blocks: [filler('m', 'message')], grow: 99 },
        { id: 'r2', blocks: [b('w')], grow: 1 },
      ]),
      // 4칸까지 좁아지는 부품은 셋이 나란히 들어갈 때도
      ...(spec.minSpan <= 4
        ? [
            slide('c', '셋이 나란히', [
              { id: 'r1', blocks: [filler('m', 'message')] },
              { id: 'r2', blocks: [b('c1'), b('c2'), b('c3')], spans: [4, 4, 4] },
            ]),
          ]
        : []),
    ]
  })
}

function galleryDeck(set: string, theme: ThemeId, params: URLSearchParams): Deck {
  if (set === 'blank') {
    const type = (params.get('type') as DeckType | null) ?? 'business'
    const input = { type, audience: 'mixed', minutes: 30, method: 'live', title: '', org: '', presenter: '', theme } as const
    // &all=1: 듣는 사람과 시간으로 고르지 않은 구성의 모든 장. 홍보 페이지 구성 보기의 그림(site/images/decks/<종류>-<차례>.webp)이
    // 이 장들을 mode=preview로 찍은 것이라, 차례가 BLUEPRINTS[type].recipes의 차례와 같다
    return params.get('all') === '1' ? createDeck(input, (BLUEPRINTS[type] ?? BLUEPRINTS.blank).recipes) : createDeck(input)
  }
  const deck = createSampleDeck()
  if (set === 'edge') return { ...deck, theme: { id: theme }, slides: edgeSlides() }
  if (set === 'blocks') return { ...deck, theme: { id: theme }, slides: blockSlides(params.get('fill'), params.get('types')?.split(','), params.get('bv'), params.get('bl'), params.get('lane') === '1', params.get('value'), params.get('lanes') === '5', params.get('status'), params.get('head')) }
  if (set === 'stress') return { ...deck, theme: { id: theme }, slides: stressSlides(params.get('type'), params.get('bv'), params.get('bl')) }
  // 판은 그 테마(글꼴)와 글자 크기의 본문 높이로 짠다: 명조 제목은 고딕보다 머리가 높다
  const look = { theme: { id: theme, size: params.get('size') ?? undefined } }
  if (set === 'review') {
    const slides = reviewSlides(look)
    return { ...deck, theme: { id: theme }, slides: params.get('reflow') === '1' ? slides.map((s) => ({ ...s, blocks: rearrangeBlocks(s.blocks ?? [], composeAreaH(s, look, true)) ?? s.blocks })) : slides }
  }
  if (set === 'scenarios') return { ...deck, title: '가상의 발표 예시', theme: { id: theme }, slides: scenarioSlides(look) }
  if (set === 'dirs') return { ...deck, theme: { id: theme }, slides: dirSlides(look) }
  if (set === 'backdrops' || set === 'bdsheet') return { ...deck, theme: { id: theme }, slides: backdropSlides(params) }
  if (set === 'combos') return { ...deck, theme: { id: theme }, slides: comboSlides(Number(params.get('seed')) || 1, Number(params.get('n')) || 40, look, params.get('mode') === 'edit', params.get('blank') === '1').map((c) => c.slide) }
  return { ...deck, theme: { id: theme }, slides: [...deck.slides, ...extraSlides()] }
}

/** &count: 레이아웃 장의 항목 수를 바꿔 본다. 모자라면 예시 항목을 되풀이한다 */
function withCount(s: Slide, n: number): Slide {
  const spec = LAYOUTS[s.layout].items
  if (!n || !spec || !s.items.length) return s
  const k = Math.min(spec.max, Math.max(spec.min, n))
  return { ...s, items: Array.from({ length: k }, (_, i) => (i < s.items.length ? s.items[i] : { ...s.items[i % s.items.length], id: `${s.items[i % s.items.length].id}-${i}` })) }
}

/** &names, &values, &metas: 레이아웃 장과 부품 장의 항목 이름(값, 설명)을 쉼표로 나눈 글로 바꿔 본다. 모자라면 되풀이한다 */
function withTexts(s: Slide, names?: string[], values?: string[], metas?: string[]): Slide {
  if (!names && !values && !metas) return s
  const put = (items: Slide['items']) =>
    items.map((it, i) => ({
      ...it,
      ...(names ? { title: names[i % names.length] } : {}),
      ...(values ? { value: values[i % values.length] } : {}),
      ...(metas ? { meta: metas[i % metas.length] } : {}),
    }))
  return {
    ...s,
    items: put(s.items),
    ...(s.blocks ? { blocks: s.blocks.map((b) => (b.id.includes('-fill-') ? b : { ...b, items: put(b.items) })) } : {}),
  }
}

/** 편집 보기에서 칸을 편집기처럼 그리려고 (적어도 바뀌지 않는다) */
const NO_ACTIONS: SlideActions = { setField() {}, setItem() {}, removeItem() {}, updateBlock() {} }

export function Gallery() {
  const params = new URLSearchParams(location.hash.split('?')[1] ?? '')
  // 부품의 잘리지 않는 높이를 재는 도구 (measureBlocks.ts). 콘솔에서 await measureBlocks()
  if (params.get('set') === 'blocks') Object.assign(window, { measureAll, measureAllFonts, measureBlocks, mergeHeights, heightsSource, clashes, failingHeights, spanWidth, fitBlocks })
  // 부품 조합 시험 (combos.ts). 콘솔에서 await checkCombos()
  if (['combos', 'review', 'dirs', 'scenarios'].includes(params.get('set') ?? '')) Object.assign(window, { checkCombos, comboSlides, checkAssembly })
  // 잘림과 짜임 검사는 레이아웃 장 갤러리에서도 (레이아웃 장은 잘림만 본다)
  else Object.assign(window, { checkAssembly })
  // 부품 하나를 항목 수와 칸 크기마다 재는 시험 (stress.ts). 콘솔에서 await checkStress()
  if (params.get('set') === 'stress') Object.assign(window, { checkStress, checkAssembly })
  // 편집 칸 점검 (checkEdit.ts). mode=edit에서 콘솔로 await checkEdit()
  if (params.get('mode') === 'edit') Object.assign(window, { checkEdit })
  // 장의 틀 점검 (checkFrame.ts). 콘솔에서 await checkFrame()
  Object.assign(window, { checkFrame, inkOf })
  // 움직임 보기: 콘솔에서 playSlide(0, 'lively')로 그 장을 발표할 때처럼 움직인다
  Object.assign(window, { playSlide: (i: number, level: 'calm' | 'lively' = 'calm') => motionEngine().play(document.querySelectorAll('.slide')[i], level) })
  const theme = (params.get('theme') ?? 'white') as ThemeId
  const mode = (params.get('mode') ?? 'final') as SlideMode
  const base = galleryDeck(params.get('set') ?? 'sample', theme, params)
  const only = params.get('only')?.split(',')
  const picked = only ? base.slides.filter((s) => only.includes(s.layout)) : base.slides
  // 모양마다 늘어놓은 장은 원래 장의 쪽 번호와 단락을 그대로 쓴다. 단락이 겹쳐 세지지 않게
  const origin = new Map<string, string>()
  const slides =
    params.get('variants') === '1'
      ? picked.flatMap((s) =>
          (LAYOUTS[s.layout].variants ?? [{ id: 'base' }]).map((v) => {
            origin.set(`${s.id}-${v.id}`, s.id)
            return { ...s, id: `${s.id}-${v.id}`, variant: v.id }
          }),
        )
      : picked
  const tone = params.get('tone') as Tone | null
  const hl = params.get('hl')
  const flip = params.get('flip') === '1'
  const side = Number(params.get('side')) || 0
  const look: Partial<DeckTheme> = {}
  for (const k of ['font', 'size', 'footer'] as const) {
    const v = params.get(k)
    if (v) (look as Record<string, string>)[k] = v
  }
  const accent = params.get('accent')
  if (accent) look.accent = `#${accent}`
  const raw = {
    ...base,
    theme: { ...base.theme, ...look },
    slides: slides.map((s) => ({
      ...withBackdrop(s, params.get('bd'), params.get('bdat'), params.get('bds')),
      ...withTexts(withCount(s, Number(params.get('count')) || 0), params.get('names')?.split(','), params.get('values')?.split(','), params.get('metas')?.split(',')),
      ...(params.get('blankHead') === '1' ? { fields: { ...s.fields, title: '', lead: '' } } : {}),
      options: {
        ...s.options,
        ...(tone ? { tone } : {}),
        ...(hl !== null && LAYOUTS[s.layout].highlight ? { highlight: Number(hl) } : {}),
        ...(flip && LAYOUTS[s.layout].panes ? { flip } : {}),
        ...(side && LAYOUTS[s.layout].panes?.sides.includes(side) ? { pane: side } : {}),
        ...(params.get('hideHead') === '1' ? { hideHead: true } : {}),
        ...(params.get('hideFoot') === '1' ? { hideFoot: true } : {}),
      },
    })),
  }
  const deck = ['hideHead', 'hideFoot', 'blankHead'].some((key) => params.get(key) === '1') ? settleDeck(raw) : raw
  const info = pageInfo(picked)
  if (params.get('set') === 'bdsheet') return <BackdropSheet deck={deck} params={params} />
  return (
    <div className="gallery" style={params.get('w') ? { gridTemplateColumns: `${params.get('w')}px` } : undefined}>
      {deck.slides.map((slide) => (
        <ScaledSlide key={slide.id} width={Number(params.get('w')) || 960} className="gallery-slide">
          <SlideCanvas
            deck={deck}
            slide={slide}
            mode={mode}
            actions={mode === 'edit' ? NO_ACTIONS : undefined}
            {...pageProps(info, origin.get(slide.id) ?? slide.id)}
          />
        </ScaledSlide>
      ))}
    </div>
  )
}

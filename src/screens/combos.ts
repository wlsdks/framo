import {
  across,
  autoPlace,
  BLOCK_LINK_IDS,
  BLOCK_TYPES,
  BLOCKS,
  CUSTOM_TYPES,
  BOARD_ROWS,
  boardAreaH,
  boardCost,
  boardFit,
  composeAreaH,
  insertAt,
  linkIssue,
  linkTargets,
  lookChangeIssue,
  lookOf,
  needRows,
  placeIssue,
  removeBlock,
  settle,
  validTargets,
  whyNot,
  withLink,
  withLook,
} from '../deck/blocks'
import { sampleBlock } from '../deck/blockSamples'
import { makeSlide } from '../deck/generate'
import type { Block, BlockType, Slide } from '../deck/types'
import { innerProblems } from './comboChecks'
import { clashes } from './measureBlocks'

/*
 * 개발용: 부품 조합 시험. 실제 발표에서 함께 쓸 만한 장면(숫자와 그 추이, 결론과 근거, 일정과 위험 같은)마다
 * 부품을 골라 규칙(deck/blocks)이 '넣을 수 있다'고 한 자리에 놓아 보고, 잘리거나 겹치는 칸이 없는지 본다.
 * #/gallery?set=combos&seed=1&n=60 → 콘솔에서 checkCombos()
 * 장면, 부품, 모양, 바탕, 항목 수, 놓을 자리를 seed로 정한 차례대로 고른다 (같은 seed면 늘 같은 조합).
 * 예전에는 부품을 아무렇게나 골라 진행 막대와 시장 원을 견주는 것 같은, 아무도 만들지 않을 장이 섞였다
 */

/** 같은 seed면 같은 차례를 내는 작은 난수 (mulberry32) */
function random(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 장면: 자리마다 고를 수 있는 부품들. 앞 자리부터 놓는다 */
const SCENES: BlockType[][][] = [
  // 숫자 하나와 그 추이, 까닭
  [['number', 'delta', 'kpi'], ['trend', 'bars', 'spark'], ['bullets', 'points', 'text']],
  // 결론 한마디와 근거
  [['message', 'callout'], ['bullets', 'facts', 'points']],
  // 숫자 셋을 나란히, 아래에 차트
  [['stat', 'number', 'ring'], ['stat', 'number', 'ring'], ['stat', 'number', 'goal'], ['trend', 'bars', 'stack', 'attain']],
  // 전과 후와 다음 단계, 결정 요청
  [['delta'], ['checks', 'bullets', 'steps'], ['callout']],
  // 일정과 위험
  [['gantt', 'timeline', 'process'], ['risks', 'status', 'facts']],
  // 비교 표와 결정 요청
  [['compare', 'table', 'rating', 'pricing'], ['callout', 'message']],
  // 깔때기와 핵심 숫자
  [['funnel', 'pareto', 'bridge'], ['number', 'stat'], ['text', 'note']],
  // 화면 캡처와 설명
  [['image'], ['bullets', 'points', 'text']],
  // 시장과 몫
  [['market', 'share', 'versus'], ['text', 'bullets'], ['number']],
  // 진행 상황
  [['progress', 'meter', 'goal', 'range'], ['checks', 'status'], ['date', 'note']],
  // 흐름과 결과
  [['flow', 'network', 'merge', 'split'], ['number', 'message']],
  // 사람과 일정: 누가 언제 무엇을. 예전에는 사람, 목차, 날짜 하나를 묶어 서로 뜻이 이어지지 않는 장이 나왔다
  [['people'], ['timeline', 'gantt']],
  // 분석과 해석
  [['heat', 'diverge', 'matrix', 'position'], ['summary', 'text', 'quote']],
  // 지표 묶음과 예상 질문
  [['scorecard', 'kpi', 'sparks'], ['faq', 'bullets']],
  // 소제목과 묶음 둘: 두 묶음은 다른 부품으로. 같은 요점 셋을 두 번 놓은 장은 말이 되지 않았다
  [['heading'], ['points'], ['heading'], ['bullets', 'checks']],
  // 강점과 약점, 결론
  [['swot'], ['message', 'callout']],
  // 함께하는 곳과 숫자: 한 장의 숫자 둘은 같은 말투로(같은 부품). 숫자 카드와 큰 숫자를 섞으면 이름표 자리와 크기가 달라 어색했다
  [['logos'], ['stat'], ['stat']],
  // 칸 조립과 설명
  [['tiles', 'ratio'], ['text', 'bullets']],
  // 효과 셈과 결론: 한마디 아래 셈, 옆에 근거
  [['message', 'callout'], ['calc'], ['bullets', 'note']],
  // 설문 결과와 해석: 막대 옆이나 아래에 읽은 것
  [['likert'], ['callout', 'bullets', 'text']],
  // 원인 캐기와 대책: 근본 원인 옆이나 아래에 고칠 것
  [['whys'], ['callout', 'bullets', 'checks']],
  // 도는 주기와 이번 차례: 고리 옆에 지금 하는 일이나 한마디
  [['cycle'], ['callout', 'bullets', 'text', 'checks']],
  // 주기를 돌린 결과: 숫자 하나 옆에 고리. 글과 짝지으면 글이 한 줄을 다 써서 고리가 늘 낮은 줄(가로)에만 놓였다
  [['number', 'stat', 'ring'], ['cycle']],
]

/** 어느 장면에도 없는 부품은 설명 글과 짝지은 장면으로 (새 부품을 더해도 시험에서 빠지지 않게) */
const ALL_SCENES: BlockType[][][] = [
  ...SCENES,
  // 모션 그래픽은 판에 혼자 서는 장면이라(내 컴포넌트에서 넣는다) 조합을 만들지 않는다
  ...BLOCK_TYPES.filter((t) => !CUSTOM_TYPES.includes(t) && !SCENES.some((s) => s.some((slot) => slot.includes(t)))).map((t) => [[t], ['text', 'bullets', 'message']] as BlockType[][]),
]

/** 끌어다 놓는 자리를 고를 때 가장 좋은 자리의 점수에서 이만큼까지 (combos의 사람이 놓는 자리) */
const SENSIBLE = 12

const pick = <T,>(rand: () => number, list: readonly T[]): T => list[Math.floor(rand() * list.length)]

/**
 * 한 장에 같은 부품이 두 번 들어갈 때 둘째 것의 지어낸 글. 예시 글을 그대로 되풀이하면 같은 숫자, 같은 사람이 두 번 나와
 * 실제 발표보다 어색해 보여서 짜임을 판단하기 어려웠다. 항목이 있는 부품은 항목의 차례를 돌려 쓴다
 */
const SECOND: Partial<Record<BlockType, Record<string, string>>> = {
  message: { text: '점검 시간을 하루에서 두 시간으로 줄여요', sub: '시범 두 달 기준' },
  text: { heading: '실패한 것만 다시 봐요', body: '자동 시험이 걸러 낸 항목만 사람이 확인해서 같은 점검을 두 번 하지 않아요.' },
  quote: { quote: '양식이 하나라서 처음 온 사람도 바로 따라 써요', by: '시범 부서 팀장' },
  callout: { label: '함께 정할 것', text: '시범 부서를 두 곳에서 다섯 곳으로 늘려요' },
  number: { value: '1,240건', label: '한 달 문의', note: '지난해보다 18% 늘었어요' },
  stat: { label: '교육을 마친 신입', value: '42명', change: '목표보다 6명 많아요', note: '10월 말 기준' },
  delta: { label: '평균 대기 시간', before: '12분', after: '7분', note: '접수 창구를 합친 뒤' },
  ring: { label: '제때 끝낸 요청', value: '88%', note: '9월에는 79%였어요' },
  goal: { label: '상반기 신규 고객', value: '36', target: '50', unit: '곳', note: '남은 석 달에 14곳' },
  meter: { label: '서버 이전 예산 집행', value: '1.2억 원', of: '2억 원', target: '1.5억 원' },
  heading: { text: '바꾸면', note: '요청에서 받기까지 이틀' },
  note: { kind: '주의', text: '시범 부서 두 곳의 값만 모았어요.' },
  date: { date: '12월 2일 (월)', what: '새 양식 전 부서 적용', note: '기획팀 · 남은 기간 5주' },
  status: { what: '교육 신청 화면 손보기', meta: '12월 첫 주까지 · 개발팀' },
}

/** 예시 내용으로 채운 부품 하나: 모양, 바탕, 항목 수를 고른다. nth는 그 장에서 같은 부품의 몇째인지 (0부터) */
function sceneBlock(rand: () => number, type: BlockType, id: string, nth = 0): Block {
  const spec = BLOCKS[type]
  const sample = sampleBlock(type)
  const variants = spec.variants ?? []
  const variant = variants.length ? pick(rand, variants).id : undefined
  // 실제로 쓰는 비율에 가깝게: 대부분 바탕 없이, 가끔 옅은 면, 드물게 진한 면(장의 다른 면과 어긋나면 넣을 때 바탕 없이 바뀐다)
  const r = rand()
  const look = r < 0.55 ? 'plain' : r < 0.85 ? 'card' : 'bold'
  const it = spec.items
  const n = it ? it.min + Math.floor(rand() * (it.max - it.min + 1)) : 0
  // 항목은 예시에 있는 만큼까지만: 되풀이해 채우면 같은 항목이 한 부품에 두 번 나왔다. 많은 항목은 stress 시험이 따로 본다
  const src = sample.items
  // 항목 하나짜리 목록(점 하나, 사람 하나)은 실제 발표에서 거의 쓰지 않아 둘부터. 하나는 stress 시험이 본다
  const count = it && src.length ? Math.max(Math.min(n, src.length), it.min, Math.min(2, src.length, it.max)) : 0
  const shift = nth * Math.ceil(src.length / 2)
  const items = count ? Array.from({ length: count }, (_, i) => ({ ...src[(i + shift) % src.length], id: `${id}-it${i}` })) : src
  const fields = nth > 0 && SECOND[type] ? { ...sample.fields, ...SECOND[type] } : sample.fields
  return { ...sample, id, fields, items, look, ...(variant ? { variant } : {}) }
}

export interface Combo {
  slide: Slide
  /** 넣으려다 규칙이 막은 부품과 그 까닭 (막은 것이 맞는지 보려고 남긴다) */
  refused: { block: Block; why: string }[]
}

/**
 * 항목을 다 채우지 않고 발표하는 장: 부품마다 반쯤은 첫 항목만 남기고 나머지 항목의 글을 비운다. 판은 편집할 때처럼 비운 항목까지 세어
 * 짜여 있고, 발표할 때는 빈 항목이 빠진다(핵심 숫자 셋 가운데 하나만 채우면 숫자 하나가 높은 칸 가운데에 떴다). 조합의 차례(seed)를
 * 바꾸지 않게 따로 된 난수로 고른다
 */
function blankSome(blocks: Block[], seed: number, k: number): Block[] {
  const rand = random(seed * 7919 + k)
  return blocks.map((b) => {
    if (b.items.length < 2 || rand() < 0.5) return b
    return { ...b, items: b.items.map((it, i) => (i === 0 ? it : { ...it, title: '', body: '', value: '', meta: '', image: '' })) }
  })
}

/**
 * 규칙이 받아들인 조합 n개. 제목이 있는 장과 없는 장을 섞는다.
 * edit면 편집 화면의 본문 높이(비운 제목과 부제의 안내까지)로 놓는다: 편집 화면에서 잘리거나 겹치는지 볼 때.
 * blank면 부품마다 반쯤은 첫 항목만 채운 채로 둔다(blankSome)
 */
export function comboSlides(seed: number, n: number, look?: Parameters<typeof composeAreaH>[1], edit?: boolean, blank?: boolean): Combo[] {
  const rand = random(seed)
  return Array.from({ length: n }, (_, k) => {
    const title = rand() < 0.7 ? `조합 ${seed}-${k + 1}` : ''
    const base: Slide = { ...makeSlide('compose'), id: `combo-${seed}-${k}`, fields: { title } }
    const areaH = edit ? boardAreaH(base, look) : composeAreaH(base, look)
    const scene = pick(rand, ALL_SCENES)
    let blocks: Block[] = []
    const refused: Combo['refused'] = []
    const seen = new Map<BlockType, number>()
    scene.forEach((slot, j) => {
      // 둘째 글(SECOND)이 없는 부품은 한 장에 두 번 고르지 않는다: 같은 예시가 두 번 나온 장은 실제 발표에서 만들지 않는다
      const fresh = slot.filter((t) => !seen.has(t) || SECOND[t])
      const type = pick(rand, fresh.length ? fresh : slot)
      const b = sceneBlock(rand, type, `c${k}-b${j}`, seen.get(type) ?? 0)
      seen.set(type, (seen.get(type) ?? 0) + 1)
      // 대개는 편집기의 '넣기'처럼 알아서, 가끔은 사람이 끌어다 놓듯 넣을 수 있는 자리 가운데 하나에
      let next: Block[] | null = null
      if (rand() < 0.65) next = autoPlace(blocks, b, areaH)
      else {
        const valid = validTargets(blocks, b, areaH)
        // 소제목 다음에 끌어다 놓는 부품은 사람이라면 그 소제목 아래에 놓는다(소제목은 아래 부품들의 이름). 아무 자리에나 놓으면
        // 소제목만 맨 아래에 혼자 남은, 아무도 만들지 않을 장이 섞였다
        const head = blocks.at(-1)?.type === 'heading' && b.type !== 'heading' ? blocks.at(-1)!.id : null
        const under = head ? valid.find((v) => v.kind === 'spot' && v.spot.at === head && v.spot.side === 'below' && !v.spot.up) : undefined
        // 사람은 말이 되는 자리에 끌어다 놓는다: 넣을 수 있는 자리 가운데 짜임 점수(arrange.ts의 boardCost)가 가장 좋은 것에서 SENSIBLE 안쪽만.
        // 아무 자리에나 놓으면 로고 모음 옆 좁은 칸에 숫자 하나, 맨 위 띠에 다른 숫자 하나처럼 아무도 만들지 않을 짜임이 섞였다
        const scored = valid.map((v) => {
          const next = v.kind === 'spot' ? insertAt(blocks, v.spot, b, areaH) : null
          return { v, cost: next ? boardCost(next, boardFit(areaH, next), areaH) : Infinity }
        })
        const least = Math.min(...scored.map((x) => x.cost))
        const sensible = scored.filter((x) => x.cost <= least + SENSIBLE).map((x) => x.v)
        const t = under ?? (sensible.length ? pick(rand, sensible) : null)
        // validTargets와 whyNot이 같은 것을 말하는지
        if (t && whyNot(blocks, t, b, areaH)) throw new Error('validTargets와 whyNot이 서로 다르게 판단했어요')
        next = t && t.kind === 'spot' ? insertAt(blocks, t.spot, b, areaH) : null
      }
      if (!next) {
        const why = placeIssue(blocks, b, areaH)
        refused.push({ block: b, why: why ? JSON.stringify(why) : '?' })
        return
      }
      blocks = next
      // 편집기에서 면을 고를 때처럼 나란한 부품은 같은 면으로. 장을 넘칠 때는 편집기처럼 고를 수 없으니 그대로
      const placed = blocks.find((x) => x.id === b.id)!
      if (!lookChangeIssue(blocks, b.id, lookOf(placed), areaH)) blocks = withLook(blocks, b.id, lookOf(placed))
    })
    // 소제목 아래(같은 단)에 묶을 부품이 없으면 사람이라면 그 소제목을 지운다: 뒤의 부품이 장에 들어가지 않았거나 다른 자리에 놓인 장
    // 하나를 지우면 판이 다시 나뉘어 다른 소제목의 아래가 바뀔 수 있어 남은 것이 없을 때까지
    const orphan = () =>
      blocks.find((h) => {
        const a = h.at!
        return h.type === 'heading' && blocks.length > 1 && !blocks.some((o) => o !== h && o.at && o.at.y >= a.y + a.h && o.at.x < a.x + a.w && a.x < o.at.x + o.at.w)
      })
    for (let h = orphan(); h; h = orphan()) blocks = removeBlock(blocks, h.id, areaH)
    // 이음표: 선마다 셋에 하나꼴로, 뜻이 서는 것만(편집기와 같은 규칙), 높이가 들어갈 때만
    for (const t of linkTargets(blocks)) {
      if (rand() > 0.35) continue
      // 예시 글은 부품마다 따로 지어낸 것이라 다른 부품끼리는 뜻이 이어지지 않는다(깔때기 → 문의 처리 시간). 같은 부품끼리만 잇는다
      const from = blocks.find((b) => b.id === t.id)
      if (!from || across(blocks, from, t.dir).some((o) => o.type !== from.type)) continue
      const fits = BLOCK_LINK_IDS.filter((l) => !linkIssue(blocks, t, l))
      if (!fits.length) continue
      const next = withLink(blocks, t, pick(rand, fits))
      if (needRows(next, boardFit(areaH, next)) <= BOARD_ROWS) blocks = next
    }
    // 편집기가 고칠 때마다 하듯 판을 다시 맞춘다: 면을 바꾸거나 이음표를 끼워 커진 부품이 옆에서 자리를 받는다
    blocks = settle(blocks, boardFit(areaH, blocks)) ?? blocks
    if (blank) blocks = blankSome(blocks, seed, k)
    return { slide: { ...base, blocks }, refused }
  })
}

/**
 * 그려진 조합 장마다: 본문 상자를 넘거나 서로 겹치는 칸, 글자를 줄였거나(크게는 한 단계보다 더),
 * 그러고도 넘치거나 겹치는 칸, 칸에 걸치는 이음표. 없으면 빈 목록
 */
export async function checkCombos(): Promise<{ slides: number; cells: number; problems: string[] }> {
  await document.fonts.ready
  await new Promise((r) => setTimeout(r, 300))
  const problems: string[] = []
  let cells = 0
  const areas = [...document.querySelectorAll<HTMLElement>('.bk-area')]
  areas.forEach((area, i) => {
    const box = area.getBoundingClientRect()
    const list = [...area.querySelectorAll<HTMLElement>(':scope > .bk')]
    // 칸은 판의 자리로 본다: 발표 화면에서 줄째 올려 붙인 만큼(--bk-shift, fitBlocks.ts 3-4)은 되돌린다. 올려 붙이는 것은 그려진
    // 내용끼리 사이를 맞추는 것이라 내용 아래의 빈 칸끼리는 겹칠 수 있다(그려진 것이 겹치는지는 checkAssembly가 본다)
    const k = area.offsetHeight ? box.height / area.offsetHeight : 1
    const rects = list.map((c) => {
      const r = c.getBoundingClientRect()
      const dy = (parseFloat(c.style.getPropertyValue('--bk-shift')) || 0) * k
      // 키워 보느라 더 준 높이(음수 --bk-trim, fitBlocks.ts의 fit 끝)와 옆으로 옮긴 만큼(--bk-shift-x)도 판의 자리로 되돌린다
      const dh = Math.min(0, parseFloat(c.style.getPropertyValue('--bk-trim')) || 0) * k
      const dx = (parseFloat(c.style.getPropertyValue('--bk-shift-x')) || 0) * k
      return new DOMRect(r.left - dx, r.top - dy, r.width, r.height + dh)
    })
    // 이음표는 칸 사이의 빈자리에 혼자 서야 한다: 어느 칸에도 걸치지 않는다. 칸의 자리와 같은 때에 잰다: 아래의 칸 안 검사가
    // 장을 스크롤하면 그 뒤에 잰 이음표만 자리가 달라져 걸치지 않은 이음표를 걸쳤다고 했다
    for (const lk of area.querySelectorAll<HTMLElement>(':scope > .bk-link')) {
      const r0 = (lk.querySelector('svg, .bk-link-vs') ?? lk).getBoundingClientRect()
      // 그려진 것 사이로 옮긴 만큼(--bk-shift, --bk-shift-x, fitBlocks.ts의 linkAxes)은 되돌려 판의 자리로 견준다. 그려진 것에 걸치는지는 checkAssembly가 본다
      const g = new DOMRect(r0.left - (parseFloat(lk.style.getPropertyValue('--bk-shift-x')) || 0) * k, r0.top - (parseFloat(lk.style.getPropertyValue('--bk-shift')) || 0) * k, r0.width, r0.height)
      const hit = rects.some((r) => g.left < r.right - 0.5 && g.right > r.left + 0.5 && g.top < r.bottom - 0.5 && g.bottom > r.top + 0.5)
      if (hit) problems.push(`${i + 1}번 장: 이음표(${lk.dataset.link})가 칸에 걸쳐요`)
    }
    // 판은 본문 상자 안에 들어가야 한다: 넘치면 아래 칸이 출처와 하단 표시 자리로 내려간다
    const over = Math.max(0, ...rects.map((r) => r.bottom - box.bottom))
    if (over > 1) problems.push(`${i + 1}번 장: 칸이 본문 상자보다 ${Math.round(over)} 내려가요`)
    rects.forEach((a, x) =>
      rects.slice(x + 1).forEach((b, y) => {
        if (a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5) problems.push(`${i + 1}번 장: ${list[x].dataset.type}와 ${list[x + 1 + y].dataset.type} 칸이 겹쳐요`)
      }),
    )
    // 글자 크기 '크게'(1.2배)는 한 단계(1/1.2, fitBlocks.ts)까지 줄여도 보통 크기와 같다
    const least = area.closest('.slide')?.classList.contains('sz-large') ? 1 / 1.2 : 1
    for (const cell of list) {
      cells++
      const fit = Number(cell.style.getPropertyValue('--bk-fit') || 1)
      const what = `${i + 1}번 장 ${cell.dataset.type} ${[...cell.classList].filter((c) => c.startsWith('va-') || c.startsWith('bk-look-')).join(' ')} 항목 ${cell.querySelectorAll('.it').length} 너비 ${Math.round(cell.offsetWidth)}×${Math.round(cell.offsetHeight)}`
      if (fit < least) problems.push(`${what}: 글자를 ${fit}까지 줄였어요`)
      const left = clashes(cell)
      if (left.length) problems.push(`${what}: ${left.slice(0, 3).join(', ')}`)
      // 칸 안이 깨진 곳: 글이 줄 선에 닿거나 항목 밖으로 나가는 것, 가려진 글, 면 안의 위아래 여백 (comboChecks.ts)
      for (const p of innerProblems(cell)) problems.push(`${what}: ${p}`)
    }
  })
  // 가림을 확인하느라 화면 밖 칸을 가져온 뒤에도 제목과 하단 표시가 제자리에 있어야 한다.
  // overflow: hidden으로 돌아가면 scrollIntoView가 장 내부를 밀어 올리는 회귀를 잡는다.
  areas.forEach((area, i) => {
    const slide = area.closest<HTMLElement>('.slide')
    if (slide && (slide.scrollTop || slide.scrollLeft)) problems.push(`${i + 1}번 장: 슬라이드 내부가 스크롤됐어요`)
  })
  return { slides: areas.length, cells, problems }
}

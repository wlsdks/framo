import { isLink, linkFits } from '../deck/blocks'
import type { BlockType } from '../deck/types'
import { blockDrawn, blockEdgeSeen, blockFigures, blockTextLines } from '../slides/fitBlocks'

/*
 * 개발용: 부품 장이 '사람이 짠 것처럼' 보이는지 보는 검사. checkCombos(combos.ts)는 잘리거나 겹치는 것만 봐서,
 * 하나도 잘리지 않았는데 어색한 장을 놓쳤다(예시 발표의 '사업 기회'에 핵심 한 줄과 인용을 더한 장: 제목, 핵심 한 줄, 인용이
 * 모두 굵은 검정에 비슷한 크기라 제목이 셋으로 읽혔고, 부제 아래와 부품 사이가 200px 넘게 비었고, 인용 한 줄이 1630px였다).
 * 그려진 장마다(발표 화면 모습, mode=final) 셋을 본다. 길이는 모두 캔버스 px(1920×1080 기준).
 * - 위계: 장 제목이 있으면, 부품 장만의 부품의 글이 제목만 하거나(같은 크기 이상) 제목과 같은 색, 굵기로 한 단계 안쪽이면(제목 ÷ 1.2 이상)
 *   제목과 다투는 것으로 본다. 강조색이나 버금 글자색의 글은 답이나 딸린 글이라,
 *   숫자와 단위는 답이라 제목과 다투지 않는다. 핵심 한 줄과 강조 상자의 글(답 글)이 있으면 다른 부품의 문장이 그보다 크지 않아야 한다
 *   (근거가 결론보다 크면 위계가 거꾸로 읽힌다)
 * - 빈 띠와 세로 리듬(docs/VISUAL-RULES.md 6): 장 머리 아래와 부품 내용 사이, 부품 사이에 위아래로 빈 띠가 GAP_MAX(--body-gap의 1.5배)보다
 *   넓은 곳, 묶음 사이가 줄마다 다른 것, 줄이 내용의 두 배 넘게 늘어난 것. 남는 높이는 맨 아래 한곳에 모인다.
 *   내용은 칸이 아니라 그려진 것으로 잰다: 바탕 없는 칸은 글과 그림, 칠한 상자가 그려진 범위, 면이 있는 칸은 면 전체
 *   그려진 것끼리 겹치는 것, 이음표가 그려진 것에 걸치는 것, 소제목 아래(같은 단)에 묶을 부품이 없는 것도 본다
 * - 짜임 안의 빈 곳: 면 안에서 내용이 위에 붙고 아래 안쪽만 크게 빈 것, 면이 내용과 나란한 칸보다 훨씬 큰 것, 여러 단으로 흘린 목록의 단 사이가 지나치게 넓거나 단이 고르지 않은 것
 * - 떠 있는 칸: 바탕 없는 칸에서 칸 높이의 절반도 안 되는 내용이 칸 가운데에 내려가 있는 것
 * - 이음표: 앞 부품과 선 건너편 부품이 뜻이 서는 짝인지 (links.ts의 linkFits)
 * - 짜임: 높이가 넉넉한데 단을 나눈 목록, 내용이 적은데 본문의 왼쪽 위에 몰린 장(너비의 절반도 안 쓰고 아래 3분의 1 넘게 빈)
 * - 글 폭: 글 부품(TEXT_TYPES)의 한 줄이 MEASURE_EM(그 글자 크기의 배수)보다 긴 것, 여러 줄 글의 끝 줄에 낱말 하나만 남은 것(그림의 이름표도)
 * - 짧은 이름표: 흐름의 단계 이름이 꺾였는데 흐름의 이름을 모두 한 단계 작게 하면 모두 한 줄에 드는 것
 * #/gallery?set=combos&seed=1&n=60 (또는 set=review) → 콘솔에서 await checkAssembly()
 */

/** 위아래로 빈 띠의 허용 폭. 장에서 가장 큰 사이(--body-gap, 72)에 칸 한 줄 몫의 끝수(판의 칸이 내용보다 조금 높다)를 더한 것 */
const GAP_MAX = 72 * 1.5
/** 묶음 사이가 줄마다 이만큼 넘게 다르면 들쭉날쭉해 보인다 (글꼴의 잉크 차이 몫) */
const GAP_VARY = 24
/** 한 줄의 가장 긴 폭 (글자 크기의 배수). 글 칸은 24em(한글로 34자 남짓)에서 꺾는다(blocks/base.css의 --measure). 글꼴 차이 몫을 더한 값 */
const MEASURE_EM = 25.5
/** 끝 줄이 가장 긴 줄의 이만큼도 안 되면 낱말 하나가 홀로 남은 것 */
const ORPHAN = 0.22
/** 그림의 이름표는 줄이 짧아(여덟 글자 남짓) 두 글자 낱말 하나만 남아도 끝 줄이 가장 긴 줄의 4분의 1이다: '결과를 시스템에 / 기록' */
const ORPHAN_LABEL = 0.34
/** 글 폭과 끝 줄을 보는 부품: 문장을 쓰는 글 부품 */
const TEXT_TYPES = new Set(['message', 'text', 'quote', 'callout', 'bullets', 'note', 'faq', 'heading'])

/** 글이 문장이 아니라 그림의 이름표인 부품 (흐름, 연결도, 나누기, 모으기, 칸 조립) */
const FIGURE_TYPES = new Set(['flow', 'network', 'merge', 'split', 'tiles', 'hub', 'gather', 'search', 'layers', 'gate', 'dupes', 'aliases', 'adoption', 'spread', 'rank', 'cine'])

type Span = { t: number; b: number }

const EDIT_UI = '.ed-halo, .it-remove, .it-grip, .pn-tools, .img-tools, .bk-handle, .bk-gutter'

/**
 * 칸에서 실제로 그려진 위아래 (화면 px). 발표 화면의 쌓기와 같은 것으로 본다(fitBlocks.ts의 drawn). 쌓기처럼 편집 표시를 숨기고 잰다
 * (edit.css의 is-fitting): 숨기지 않으면 편집 화면에서 이미지 칸 아래 끝에 뜨는 '바꾸기', '지우기' 단추의 글을 그려진 것으로 알고,
 * 높은 칸에 작게 든 화면 캡처가 본문 아래로 63~99px 나간다고 했다
 */
const inkSpan = (cell: HTMLElement): Span | null => {
  const area = cell.closest<HTMLElement>('.bk-area')
  const was = area?.classList.contains('is-fitting')
  area?.classList.add('is-fitting')
  const span = blockDrawn(cell)
  if (!was) area?.classList.remove('is-fitting')
  return span
}

/** 겹치는 범위를 합친 띠들 (위에서 아래로) */
function merge(spans: Span[]): Span[] {
  const out: Span[] = []
  for (const s of [...spans].sort((a, b) => a.t - b.t)) {
    const last = out.at(-1)
    if (last && s.t <= last.b) last.b = Math.max(last.b, s.b)
    else out.push({ ...s })
  }
  return out
}

const hangul = (s: string) => /[가-힣]/.test(s)
/** 숫자와 단위('2.4조 원', '억 원'): 숫자는 답이라 제목보다 커도 된다 */
const numeric = (s: string) => {
  const words = s.replace(/[\d.,%+\-~()\s]/g, '')
  return words.length <= 2 || (/\d/.test(s) && words.length <= 3)
}

/**
 * 답 글: 핵심 한 줄은 그 장의 결론이고(장 제목이 없으면 곧 제목), 강조 상자의 글은 꼭 알아야 할 것(결정 요청)이다. 답 글을 가린 글자,
 * 이름, 견주지 않는 부품(다른 답), 본문 단계 밑에서 시작한 글(근거)하고만 견주는지. 강조 상자는 핵심 한 줄보다 크지 않으면 되고,
 * 강조 상자끼리는 견주지 않고, 소제목처럼 본문보다 큰 단계에서 시작한 글은 묶음의 이름이라 강조 상자보다 커도 된다(fitBlocks의 answers와 같다)
 */
const ANSWERS = [
  { text: '.bk-msg-t', name: '핵심 한 줄', skip: '.bk-message', bodyOnly: false },
  { text: '.bk-call-t', name: '강조 상자의 글', skip: '.bk-message, .bk-callout', bodyOnly: true },
]

/**
 * 위계: 답 글보다 큰 다른 부품의 글. 답보다 근거의 문장이 크면 결론이 넘어간다(강조 상자의 결정 요청 30px 아래에 준비 상황의 항목이 36px.
 * 강조 상자는 긴 글과 낮은 칸에서 한 단계씩 줄고, 옆 목록은 장에 자리가 남아 키워졌다)
 */
function overAnswer(area: HTMLElement): string[] {
  const out = new Set<string>()
  const body = parseFloat(getComputedStyle(area).getPropertyValue('--t-body')) || 30
  for (const { text: sel, name, skip, bodyOnly } of ANSWERS)
    for (const answer of area.querySelectorAll<HTMLElement>(`:scope > .bk ${sel}`)) {
      const own = answer.closest<HTMLElement>('.bk')!
      const ownInner = own.querySelector<HTMLElement>(':scope > .bk-in')
      // 글이 그려진 답만 (편집 화면의 빈칸 안내는 쓸 글의 자리라 보지 않는다)
      if (!ownInner || !blockTextLines(ownInner).some((q) => answer.contains(q.n) && hangul(q.n.textContent ?? ''))) continue
      const afs = parseFloat(getComputedStyle(answer).fontSize)
      for (const cell of area.querySelectorAll<HTMLElement>(':scope > .bk:not(.bk-layout)')) {
        // 그림 안의 이름표(연결도의 가운데 상자 같은)는 문장이 아니라 그림의 일부라 견주지 않는다
        if (cell === own || cell.matches(skip) || FIGURE_TYPES.has(cell.dataset.type ?? '')) continue
        const inner = cell.querySelector<HTMLElement>(':scope > .bk-in')
        if (!inner) continue
        for (const q of blockTextLines(inner)) {
          const el = q.n.parentElement
          const text = (q.n.textContent ?? '').trim()
          if (!el || !hangul(text) || numeric(text)) continue
          const cs = getComputedStyle(el)
          if (bodyOnly && !(parseFloat(cs.getPropertyValue('--fs')) <= body + 0.5)) continue
          const fs = parseFloat(cs.fontSize)
          if (fs > afs + 0.5) out.add(`${cell.dataset.type}: 글이 ${name}보다 커요(${Math.round(fs)} > ${Math.round(afs)}) 「${text.slice(0, 12)}」`)
        }
      }
    }
  return [...out]
}

/** 위계: 장 제목과 다투는 부품의 글 */
function rivals(slide: HTMLElement, area: HTMLElement): string[] {
  const title = slide.querySelector<HTMLElement>('.s-title')
  if (!title || title.matches('.is-hint, .is-empty') || !title.textContent?.trim()) return overAnswer(area)
  const ts = getComputedStyle(title)
  const tfs = parseFloat(ts.fontSize)
  const out = new Set<string>()
  // 레이아웃 부품은 그 레이아웃의 장과 같은 모양이라(장 제목 아래의 표, 일정) 부품 장만의 부품을 본다
  for (const cell of area.querySelectorAll<HTMLElement>(':scope > .bk:not(.bk-layout)')) {
    const inner = cell.querySelector<HTMLElement>(':scope > .bk-in')
    if (!inner) continue
    for (const q of blockTextLines(inner)) {
      const el = q.n.parentElement
      const text = (q.n.textContent ?? '').trim()
      if (!el || !hangul(text) || numeric(text)) continue
      const cs = getComputedStyle(el)
      // 제목과 다른 색(강조색의 답, 버금 글자색의 딸린 글)은 제목과 다투지 않는다
      if (cs.color !== ts.color) continue
      // 판에 혼자인 핵심 한 줄은 굵기를 낮춰(600 밑) 제목보다 커져도 된다(message.css, docs/VISUAL-RULES.md 4)
      if (cell.dataset.type === 'message' && Number(cs.fontWeight) < 600 && !area.querySelector(':scope > .bk ~ .bk')) continue
      const fs = parseFloat(cs.fontSize)
      const same = Number(cs.fontWeight) >= 600
      if (fs >= tfs - 0.5) out.add(`${cell.dataset.type}: 글이 장 제목만큼 커요(${Math.round(fs)} ≥ ${Math.round(tfs)}) 「${text.slice(0, 12)}」`)
      else if (same && fs * 1.2 >= tfs - 0.5) out.add(`${cell.dataset.type}: 장 제목과 같은 색, 굵기에 크기가 한 단계 안쪽이라 제목과 다퉈요(${Math.round(fs)}, 제목 ${Math.round(tfs)}) 「${text.slice(0, 12)}」`)
    }
  }
  return [...out, ...overAnswer(area)]
}

/** 빈 띠: 장 머리 아래와 내용 사이 */
function bands(slide: HTMLElement, area: HTMLElement, k: number): string[] {
  const out: string[] = []
  const all = [...area.querySelectorAll<HTMLElement>(':scope > .bk')]
  const inks = all.map(inkSpan)
  const spans = inks.filter((s): s is Span => !!s)
  if (!spans.length) return out
  // 그려진 것끼리 겹치는 곳: 발표 화면은 줄째 올려 붙여서(fitBlocks.ts 3-4) 칸이 아니라 그려진 범위로 본다
  all.forEach((a, i) =>
    all.slice(i + 1).forEach((b, j) => {
      const p = inks[i]
      const q = inks[i + 1 + j]
      // 옆으로도 그려진 것으로: 판 너비를 다 쓰는 칸의 짧은 날짜는 쌓기가 왼쪽 단 아래로 올려 붙여, 칸 상자로는 오른쪽 단과 겹치지만
      // 그려진 글은 겹치지 않는다
      const ra = inkX(a)
      const rb = inkX(b)
      if (p && q && ra && rb && Math.min(p.b, q.b) - Math.max(p.t, q.t) > 1 && Math.min(ra.r, rb.r) - Math.max(ra.l, rb.l) > 1)
        out.push(`${a.dataset.type}와 ${b.dataset.type}의 그려진 것이 겹쳐요`)
    }),
  )
  const merged = merge(spans)
  // 그려진 것이 본문 상자 아래로 나가면 출처와 하단 표시를 덮는다(칸은 본문 안이어도 쌓기가 칸째 옮길 수 있다)
  const areaBottom = area.getBoundingClientRect().bottom
  all.forEach((c, i) => {
    const p = inks[i]
    if (p && p.b > areaBottom + 2 * k) out.push(`${c.dataset.type}: 그려진 것이 본문 아래로 ${Math.round((p.b - areaBottom) / k)}px 나가요`)
  })
  const head = slide.querySelector<HTMLElement>('.s-head')
  const hasHead = !!head && head.getClientRects().length > 0 && !!head.textContent?.trim()
  // 본문은 장 제목 아래 --body-gap에서 시작한다(docs/VISUAL-RULES.md 6). 머리 아래가 그 1.5배를 넘으면 본문을 가운데로 띄운 것
  // 내용이 적어 쌓기가 눈높이 가운데로 내린 장(fitBlocks.ts의 eyeLevel, data-eye)은 머리 아래가 넓은 것이 맞다
  if (hasHead && !area.dataset.eye) {
    // 머리의 아래: 부제가 있으면 부제, 없으면 제목의 글 줄 아래
    const last = [...head!.querySelectorAll<HTMLElement>('.s-title, .s-lead')].filter((el) => el.textContent?.trim()).at(-1)
    const hb = last ? last.getBoundingClientRect().bottom : head!.getBoundingClientRect().bottom
    const gap = (merged[0].t - hb) / k
    if (gap > GAP_MAX) out.push(`장 머리 아래가 ${Math.round(gap)}px 비어요(본문은 제목 아래 --body-gap에서)`)
  }
  // 묶음 사이: 남는 높이를 사이에 나누지 않아서 사이는 줄마다 같다(--bk-gap). 소제목 아래는 그 아래 부품과 한 덩어리라 좁은 것이 맞아 뺀다
  const headsOnly = (s: Span) =>
    all.every((c, i) => {
      const p = inks[i]
      return !p || p.b < s.t - 1 || p.t > s.b + 1 || c.dataset.type === 'heading'
    })
  const gaps: number[] = []
  for (let i = 1; i < merged.length; i++) {
    const gap = (merged[i].t - merged[i - 1].b) / k
    if (gap > GAP_MAX) out.push(`부품 사이가 위아래로 ${Math.round(gap)}px 비어요`)
    if (!headsOnly(merged[i - 1])) gaps.push(gap)
  }
  if (gaps.length > 1 && Math.max(...gaps) - Math.min(...gaps) > GAP_VARY) out.push(`묶음 사이가 줄마다 달라요(${gaps.map(Math.round).join(', ')}px)`)
  // 이음표는 그려진 것 사이의 빈자리에 혼자 서야 한다
  for (const lk of area.querySelectorAll<HTMLElement>(':scope > .bk-link')) {
    const g = (lk.querySelector('svg, .bk-link-vs') ?? lk).getBoundingClientRect()
    // 그려진 것으로 견준다: 바탕 없는 칸은 칸 상자가 아니라 글과 그림의 가로 범위(이음표는 그려진 것 사이 가운데에 선다)
    if (getComputedStyle(lk).display === 'none') continue
    const hit = all.some((c, i) => {
      const p = inks[i]
      const r = inkX(c)
      return !!p && !!r && Math.min(p.b, g.bottom) - Math.max(p.t, g.top) > 1 && Math.min(r.r, g.right) - Math.max(r.l, g.left) > 1
    })
    if (hit) out.push(`이음표(${lk.dataset.link})가 그려진 것에 걸쳐요`)
  }
  // 소제목은 아래 부품들의 이름이라 그 아래(같은 단)에 묶을 부품이 있어야 한다
  const cells = [...area.querySelectorAll<HTMLElement>(':scope > .bk')]
  // 판의 자리로 본다: 발표 화면에서 올려 붙인 만큼(--bk-shift)은 되돌린다
  const placeOf = (c: HTMLElement) => {
    const r = c.getBoundingClientRect()
    return new DOMRect(r.left, r.top - (parseFloat(c.style.getPropertyValue('--bk-shift')) || 0) * k, r.width, r.height)
  }
  if (cells.length > 1)
    for (const h of cells.filter((c) => c.dataset.type === 'heading')) {
      const r = placeOf(h)
      const under = cells.some((c) => {
        const o = placeOf(c)
        return c !== h && o.top >= r.bottom - 1 && o.left < r.right - 1 && r.left < o.right - 1
      })
      if (!under) out.push('소제목 아래에 묶을 부품이 없어요')
    }
  return out
}

/**
 * 글 폭과 끝 줄. 그림의 이름표(FIGURE_TYPES)는 끝 줄만 본다: 좁은 단에서 꺾이는 흐름의 단계 설명이 '담당자가 한 번 더 / 확인'으로
 * 갈려도 글 부품만 보던 검사는 몰랐다. 이름표의 줄 길이는 그림이 정한 단 너비라 보지 않는다
 */
function measure(area: HTMLElement, k: number): string[] {
  const out = new Set<string>()
  for (const cell of area.querySelectorAll<HTMLElement>(':scope > .bk')) {
    const prose = TEXT_TYPES.has(cell.dataset.type ?? '')
    if (!prose && !FIGURE_TYPES.has(cell.dataset.type ?? '')) continue
    const inner = cell.querySelector<HTMLElement>(':scope > .bk-in')
    if (!inner) continue
    // 글 칸(요소)마다 줄을 모은다: 같은 높이의 조각은 한 줄
    const byEl = new Map<Element, { t: number; l: number; r: number }[]>()
    for (const q of blockTextLines(inner)) {
      const el = q.n.parentElement
      if (!el || el.closest(EDIT_UI)) continue
      const rows = byEl.get(el) ?? []
      const row = rows.find((x) => Math.abs(x.t - q.t) < 4 * k)
      if (row) {
        row.l = Math.min(row.l, q.l)
        row.r = Math.max(row.r, q.r)
      } else rows.push({ t: q.t, l: q.l, r: q.r })
      byEl.set(el, rows)
    }
    byEl.forEach((rows, el) => {
      const fs = parseFloat(getComputedStyle(el).fontSize)
      const text = (el.textContent ?? '').trim().slice(0, 12)
      const ws = rows.map((x) => (x.r - x.l) / k)
      const most = Math.max(...ws)
      if (prose && most > fs * MEASURE_EM) out.add(`${cell.dataset.type}: 한 줄이 ${Math.round(most)}px(글자 크기의 ${Math.round(most / fs)}배)로 길어요 「${text}」`)
      rows.sort((a, b) => a.t - b.t)
      const tail = (rows.at(-1)!.r - rows.at(-1)!.l) / k
      if (rows.length >= 2 && tail < most * (prose ? ORPHAN : ORPHAN_LABEL)) out.add(`${cell.dataset.type}: 끝 줄에 낱말 하나만 남았어요 「${text}」`)
    })
  }
  return [...out]
}

/**
 * 짧은 이름표가 반으로 꺾인 것 (docs/DESIGN.md '흐름'): 흐름의 단계 이름은 한 줄에 드는 가장 큰 단계로 그린다(fitBlocks.ts의 flowNames).
 * 이름이 꺾였는데 흐름의 이름, 번호, 설명을 모두 한 단계(1.2) 작게 하면 모든 이름이 한 줄에 드는 흐름을 잡는다. 판을 혼자 쓰는 다섯 단계
 * 흐름에서 이름을 52로 키워 '각자 / 만들기', '본부에 / 배포'로 꺾이고 '합의'만 한 줄이던 것.
 * 맞추기처럼 줄여 보지 않고 그려진 것으로 어림한다: 글 칸마다 한 줄 너비는 꺾인 줄의 글 너비에 줄 사이의 띄어쓰기 몫을 더한 것이다.
 * 단계 칸(격자의 열)은 글 너비만큼이고 모자라면 남는 너비를 고르게 나눠 받으므로(flow.css), 한 단계 작게 한 단계마다의 너비로
 * 지금 단계 칸들의 너비 합을 다시 나눠 본다. 세로로 쌓은 흐름은 지금 글 칸 너비와 견준다.
 * 번호(이름 한 단계 아래)가 바닥(--fs-min) 밑으로 가는 단계와, 판을 혼자 쓰는 흐름에서 이름이 --fw-least(flow.css) 밑으로 가는 단계는
 * 보지 않는다: 그보다 작게는 내리지 않고 꺾인다
 */
function labelWraps(area: HTMLElement, k: number): string[] {
  const out: string[] = []
  const range = document.createRange()
  // 글 칸을 한 줄로 늘어놓았을 때의 너비(캔버스 px)와 지금 그려진 줄 수
  const oneLine = (el: Element | null) => {
    if (!el) return { w: 0, rows: 0 }
    const rows: { t: number; w: number }[] = []
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    while (walk.nextNode()) {
      range.selectNodeContents(walk.currentNode)
      for (const q of range.getClientRects()) {
        if (q.width <= 1) continue
        const row = rows.find((x) => Math.abs(x.t - q.top) < q.height / 2)
        if (row) row.w += q.width
        else rows.push({ t: q.top, w: q.width })
      }
    }
    const fs = parseFloat(getComputedStyle(el).fontSize)
    return { w: rows.reduce((n, x) => n + x.w, 0) / k + Math.max(0, rows.length - 1) * fs * 0.3, rows: rows.length }
  }
  for (const fw of area.querySelectorAll<HTMLElement>('.bk-fw')) {
    const nodes = [...fw.querySelectorAll<HTMLElement>('.bk-fw-node')].filter((el) => el.getClientRects().length)
    const steps = nodes.map((node) => {
      const t = node.querySelector<HTMLElement>('.bk-fw-t')
      const name = oneLine(t)
      // 한 단계 작게 했을 때 이 단계 칸이 바라는 너비: 오가는 양은 그대로, 나머지는 1.2로 나눈다
      const need = Math.max(Math.max(name.w, oneLine(node.querySelector('.bk-fw-m')).w, oneLine(node.querySelector('.bk-fw-i')).w) / 1.2, oneLine(node.querySelector('.bk-fw-v')).w)
      return { t, name, need, width: node.getBoundingClientRect().width / k }
    })
    const wrapped = steps.filter((x) => x.name.rows > 1)
    if (!wrapped.length || !wrapped[0].t) continue
    const fs = parseFloat(getComputedStyle(wrapped[0].t).fontSize)
    const fcs = getComputedStyle(fw)
    if (fs / 1.44 < (parseFloat(fcs.getPropertyValue('--fs-min')) || 0) - 0.5 || fs / 1.2 < (parseFloat(fcs.getPropertyValue('--fw-least')) || 0) - 0.5) continue
    let room: (x: (typeof steps)[number]) => number
    if (getComputedStyle(fw.querySelector('.bk-fw-list') ?? fw).display === 'grid') {
      // 단계 칸들의 너비 합을 바라는 너비가 작은 칸부터 채우고 남는 것을 고르게 나눈다
      let left = steps.reduce((n, x) => n + x.width, 0)
      let share = Infinity
      const needs = steps.map((x) => x.need).sort((p, q) => p - q)
      for (let i = 0; i < needs.length; i++) {
        const even = left / (needs.length - i)
        if (needs[i] > even) {
          share = even
          break
        }
        left -= needs[i]
      }
      // 바라는 너비를 다 받는 칸은 꺾이지 않는다
      room = (x) => (x.need <= share ? Infinity : share)
    } else room = (x) => x.t?.clientWidth ?? 0
    if (wrapped.every((x) => x.name.w / 1.2 <= room(x) - 2)) out.push(`흐름: 단계 이름이 꺾였어요(한 단계 작게 하면 모두 한 줄에 들어요) 「${(wrapped[0].t?.textContent ?? '').trim().slice(0, 12)}」`)
  }
  return out
}

/** 면 안의 빈 띠가 이보다 넓게 아래에 몰리면 (캔버스 px). 면 안의 위아래 여백은 같아 보여야 한다 */
const FACE_SLACK = 48
/** 여러 단으로 흘린 목록에서 앞 단의 글 끝과 다음 단 사이가 이보다 넓으면 흩어져 보인다 (옆 칸 사이 72의 세 배) */
const COLUMN_GAP_MAX = 72 * 3
/** 면이 제 내용(안쪽 여백까지)과 나란한 칸의 높이보다 이만큼 넘게 크면 빈 면으로 보인다 (fitBlocks.ts의 hug는 24 밑이면 그대로 둔다. 그 두 배) */
const FACE_OVER = 48

/**
 * 면이 있는 칸이 제 내용에 쓰는 높이(안쪽 여백까지, 캔버스 px). 내용은 줄 사이를 넓히기 전(--bk-air 없이)으로 잰다:
 * 줄 사이를 넓혀 면을 채우면 내용이 면만큼 커 보여 놓쳤다. 잴 수 없으면 null
 */
function faceNeed(cell: HTMLElement, k: number): number | null {
  const inner = cell.querySelector<HTMLElement>(':scope > .bk-in')
  const body = inner && [...inner.children].find((el) => (el as HTMLElement).offsetHeight > 0)
  if (!inner || !body) return null
  const air = cell.style.getPropertyValue('--bk-air')
  if (air) cell.style.removeProperty('--bk-air')
  let t = Infinity
  let b = -Infinity
  for (const el of body.children) {
    const q = el.getBoundingClientRect()
    if (!q.height || getComputedStyle(el).position === 'absolute' || el.closest(EDIT_UI)) continue
    t = Math.min(t, q.top)
    b = Math.max(b, q.bottom)
  }
  if (air) cell.style.setProperty('--bk-air', air)
  if (t === Infinity) return null
  const cs = getComputedStyle(inner)
  return (b - t) / k + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)
}

/**
 * 짜임 안의 빈 곳: 면(옅은 면, 진한 면) 안에서 내용이 위에 붙고 아래 안쪽만 크게 빈 것,
 * 여러 줄을 여러 단으로 흘린 목록에서 단 사이가 지나치게 벌어진 것(단을 칸 너비로 반씩 나누면 짧은 요점이 흩어져 보였다)
 */
function inside(area: HTMLElement, k: number): string[] {
  const out: string[] = []
  for (const cell of area.querySelectorAll<HTMLElement>(':scope > .bk:not(.bk-look-plain)')) {
    const inner = cell.querySelector<HTMLElement>(':scope > .bk-in')
    const body = inner && [...inner.children].find((el) => (el as HTMLElement).offsetHeight > 0)
    if (!inner || !body) continue
    let t = Infinity
    let b = -Infinity
    for (const el of body.children) {
      const q = el.getBoundingClientRect()
      if (!q.height || getComputedStyle(el).position === 'absolute' || el.closest(EDIT_UI)) continue
      t = Math.min(t, q.top)
      b = Math.max(b, q.bottom)
    }
    if (t === Infinity) continue
    const cs = getComputedStyle(inner)
    const ir = inner.getBoundingClientRect()
    const top = (t - ir.top) / k - parseFloat(cs.paddingTop)
    const bottom = (ir.bottom - b) / k - parseFloat(cs.paddingBottom)
    // 들여 쓰기(card)와 강조(bold)는 선도 면도 없이 그린다(blocks/looks.css): 보이는 면이 없으니 칸 아래가 비어도 면 안이 빈 것이 아니다.
    // 강조 모양의 비율 원이 높은 차트 옆에서 위에 붙어(옆 칸과 윗선을 맞춘다) 칸 아래가 비었는데 면 안이 251px 빈다고 했다
    if (!cell.matches('.bk-look-card, .bk-look-bold') && bottom - top > FACE_SLACK && bottom > top * 2) out.push(`${cell.dataset.type}: 면 안의 아래가 ${Math.round(bottom)}px 비어요(위 ${Math.round(Math.max(0, top))}px)`)
    // 면이 내용보다 훨씬 큰 것: 면은 제 내용과 고른 안쪽 여백만큼, 나란한 칸이 더 길면 그 높이까지만 (fitBlocks.ts의 hug).
    // 판이 남는 높이를 면에 주면 두 줄짜리 결정 요청의 면이 본문 바닥까지 닿아 글이 면 가운데에 떠 있었다.
    // 나란한 칸들이 그려진 위아래 범위로 견준다: 옆에 둘을 쌓았으면 둘을 합친 높이까지(옆 단 전체와 높이를 맞춘 면은 사람도 그렇게 둔다).
    // 옆의 면도 면 높이가 아니라 제 내용으로 본다: 나란한 두 면이 같이 부풀면 서로를 핑계로 놓쳤다
    const cr = cell.getBoundingClientRect()
    let nt = Infinity
    let nb = -Infinity
    for (const other of area.querySelectorAll<HTMLElement>(':scope > .bk')) {
      const or = other.getBoundingClientRect()
      if (other === cell || other.dataset.band !== cell.dataset.band || Math.min(or.bottom, cr.bottom) - Math.max(or.top, cr.top) < 1) continue
      const fh = other.classList.contains('bk-look-plain') ? null : faceNeed(other, k)
      const ink = fh === null ? inkSpan(other) : { t: or.top, b: or.top + fh * k }
      if (!ink) continue
      nt = Math.min(nt, ink.t)
      nb = Math.max(nb, ink.b)
    }
    // 면은 칸의 윗선에 서므로 칸 윗선부터 옆 칸이 그려진 끝까지 (fitBlocks.ts의 hug와 같은 기준)
    const need = Math.max(faceNeed(cell, k) ?? Infinity, nt < nb ? (nb - cr.top) / k : 0)
    const face = cr.height / k
    if (face - need > FACE_OVER) out.push(`${cell.dataset.type}: 면이 내용보다 ${Math.round(face - need)}px 커요(면 ${Math.round(face)}, 내용 ${Math.round(need)})`)
  }
  for (const list of area.querySelectorAll<HTMLElement>(':scope > .bk .bk-list')) {
    const items = [...list.children].filter((el) => (el as HTMLElement).offsetHeight > 0) as HTMLElement[]
    const cols = new Map<number, HTMLElement[]>()
    for (const it of items) {
      const x = Math.round(it.getBoundingClientRect().left)
      const key = [...cols.keys()].find((c) => Math.abs(c - x) < 4) ?? x
      cols.set(key, (cols.get(key) ?? []).concat(it))
    }
    // 높이가 넉넉한데 단을 나눈 목록: 단 나누기와 나란히 세우기는 높이가 모자랄 때의 짜임이다. 한 단으로 쌓아도 칸 안에 들면
    // 나눈 단이 장의 한쪽 구석에 작게 몰려 보였다(소제목과 점 다섯이 셋과 둘로 갈려 왼쪽 위 4분의 1에)
    if (cols.size >= 2) {
      const cell = list.closest<HTMLElement>('.bk')
      const inner = cell?.querySelector<HTMLElement>(':scope > .bk-in')
      if (cell && inner) {
        const cs = getComputedStyle(inner)
        const ir = inner.getBoundingClientRect()
        // 두 단에서 잰 항목은 좁아서 줄이 더 꺾일 수 있다. 그 높이를 더하면 한 단이 들어갈 자리가 있어도 놓치므로,
        // 같은 글꼴과 폭에서 한 단으로 쌓은 복사본을 화면에 보이지 않게 재고 바로 뺀다.
        const above = (list.getBoundingClientRect().top - ir.top) / k - parseFloat(cs.paddingTop)
        const copy = list.cloneNode(true) as HTMLElement
        const gap = items.length >= 5 ? '7px' : '10px'
        Object.assign(copy.style, { position: 'absolute', visibility: 'hidden', width: `${list.offsetWidth}px`, height: 'auto', display: 'flex', flexDirection: 'column', gap: `calc(${gap} + var(--bk-air, 0px) / 2)` })
        for (const [i, item] of [...copy.children].entries()) {
          ;(item as HTMLElement).style.paddingTop = i ? `calc(${gap} + var(--bk-air, 0px) / 2)` : '0px'
        }
        list.parentElement!.append(copy)
        const one = above + copy.getBoundingClientRect().height / k
        copy.remove()
        const room = ir.height / k - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)
        // 한 단으로 겨우 들어가는 경우는 글꼴과 줄바꿈에 대비할 여유가 없다. 실제로 여유가 있을 때만 단 나누기를 지적한다.
        if (one + 16 <= room) out.push(`${cell.dataset.type}: 높이가 넉넉한데 목록을 ${cols.size}단으로 나눴어요(한 단 ${Math.round(one)}px, 칸 ${Math.round(room)}px)`)
      }
    }
    if (cols.size < 2 || items.length <= cols.size) continue
    const xs = [...cols.keys()].sort((a, b) => a - b)
    for (let i = 1; i < xs.length; i++) {
      // 앞 단에서 글이 가장 길게 나간 끝
      let end = -Infinity
      for (const it of cols.get(xs[i - 1])!) for (const q of blockTextLines(it)) end = Math.max(end, q.r)
      const gap = (xs[i] - end) / k
      if (gap > COLUMN_GAP_MAX) out.push(`${list.closest<HTMLElement>('.bk')?.dataset.type}: 목록의 단 사이가 ${Math.round(gap)}px 벌어져요`)
    }
    const counts = [...cols.values()].map((c) => c.length)
    if (Math.max(...counts) - Math.min(...counts) > 1) out.push(`${list.closest<HTMLElement>('.bk')?.dataset.type}: 목록의 단이 고르지 않아요(${counts.join(', ')})`)
  }
  return out
}

/**
 * 내용이 적은 장이 본문의 한쪽 구석(왼쪽 위)에 몰린 것: 그려진 것이 본문 너비의 절반도 안 쓰고 아래 3분의 1 넘게 비었다.
 * 항목이 여럿인 부품(목록, 표 같은)이 있는 장만 본다: 항목은 단을 바꾸거나 소제목 옆으로 눕혀 넓게 짤 수 있다.
 * 글만 있는 장은 글 폭(--measure)이 일부러 줄을 꺾어 오른쪽이 비는 것이라 보지 않는다
 */
const CORNER_W = 0.5
const CORNER_B = 1 / 3

function corner(area: HTMLElement, k: number): string[] {
  const a = area.getBoundingClientRect()
  let l = Infinity
  let r = -Infinity
  let b = -Infinity
  for (const cell of area.querySelectorAll<HTMLElement>(':scope > .bk')) {
    const ink = inkSpan(cell)
    if (!ink) continue
    b = Math.max(b, ink.b)
    if (!cell.classList.contains('bk-look-plain')) {
      const q = cell.getBoundingClientRect()
      l = Math.min(l, q.left)
      r = Math.max(r, q.right)
      continue
    }
    const inner = cell.querySelector<HTMLElement>(':scope > .bk-in')
    if (!inner) continue
    for (const q of blockTextLines(inner)) {
      l = Math.min(l, q.l)
      r = Math.max(r, q.r)
    }
    for (const f of inner.querySelectorAll('svg, img')) {
      if (f.parentElement?.closest('svg')) continue
      const q = f.getBoundingClientRect()
      if (!q.width) continue
      l = Math.min(l, q.left)
      r = Math.max(r, q.right)
    }
  }
  if (!(l < r) || !area.querySelector(':scope > .bk .it ~ .it')) return []
  const w = (r - l) / a.width
  const bottom = (a.bottom - b) / a.height
  return w < CORNER_W && bottom > CORNER_B ? [`내용이 본문의 왼쪽 위에 몰렸어요(너비의 ${Math.round(w * 100)}%, 아래 ${Math.round((a.bottom - b) / k)}px 빔)`] : []
}

/**
 * 이음표의 뜻: 이음표마다 앞 부품과 선 건너편 부품들이 뜻이 서는 짝인지(links.ts의 linkFits, linkIssue). 건너편이 여럿이면 모두와 서야 한다:
 * 개요와 날짜를 견주거나, 목표 대비와 주석 사이에 '='가 서면 무엇과 무엇의 관계인지 읽히지 않았다
 */
function linkMeaning(area: HTMLElement): string[] {
  const out: string[] = []
  const cells = [...area.querySelectorAll<HTMLElement>(':scope > .bk')]
  const at = (c: HTMLElement, v: string) => Number(c.style.getPropertyValue(v)) || 0
  for (const lk of area.querySelectorAll<HTMLElement>(':scope > .bk-link')) {
    const link = [...lk.classList].map((c) => c.replace(/^is-/, '')).find(isLink)
    const from = cells.find((c) => c.dataset.block === lk.dataset.after)
    if (!link || !from) continue
    const h = lk.classList.contains('lk-h')
    const [x, y, w, hh] = ['--x', '--y', '--w', '--h'].map((v) => at(from, v))
    const next = cells.filter((c) =>
      h
        ? at(c, '--x') === x + w && at(c, '--y') < y + hh && y < at(c, '--y') + at(c, '--h')
        : at(c, '--y') === y + hh && at(c, '--x') < x + w && x < at(c, '--x') + at(c, '--w'),
    )
    // 소제목과 주석은 옆 부품에 딸린 글이라 함께 쌓인 다른 부품이 있으면 빼고 본다 (links.ts의 linkIssue와 같이)
    const main = next.filter((c) => c.dataset.type !== 'heading' && c.dataset.type !== 'note')
    for (const to of main.length ? main : next)
      if (!linkFits(link, from.dataset.type as BlockType, to.dataset.type as BlockType)) out.push(`이음표(${link})의 뜻이 서지 않아요: ${from.dataset.type} → ${to.dataset.type}`)
  }
  return out
}

/**
 * 떠 있는 작은 내용: 바탕 없는 칸에서 그려진 것이 칸 높이의 절반도 안 되는데, 나란한 옆 칸의 그려진 윗선보다 칸 높이의 4분의 1 넘게
 * 아래에서 시작하는 것(칸 가운데에 내려 둔 것). 높은 칸 가운데에 날짜 하나, 숫자 하나가 혼자 떠 있으면 옆 칸과 윗선이 어긋나
 * 어디에 딸린 것인지 읽히지 않았다. 옆 칸이 없으면 쌓기가 칸째 옮겨 떠 보이지 않는다
 */
function floating(area: HTMLElement, k: number): string[] {
  const out: string[] = []
  const cells = [...area.querySelectorAll<HTMLElement>(':scope > .bk')]
  for (const cell of cells) {
    if (!cell.classList.contains('bk-look-plain')) continue
    const ink = inkSpan(cell)
    if (!ink) continue
    const r = cell.getBoundingClientRect()
    if (r.height / k < 200 || ink.b - ink.t >= r.height / 2) continue
    const tops = cells
      .filter((o) => o !== cell && o.dataset.band === cell.dataset.band)
      .filter((o) => {
        const q = o.getBoundingClientRect()
        return Math.min(q.bottom, r.bottom) - Math.max(q.top, r.top) > r.height / 2
      })
      .map((o) => inkSpan(o)?.t)
      .filter((t): t is number => t !== undefined)
    if (!tops.length) continue
    // 위아래로 쌓인 아래 칸은 제 칸 위에서부터 잰다(옆 칸의 윗선보다 아래에서 시작하는 것이 맞다)
    const drop = ink.t - Math.max(r.top, Math.min(...tops))
    if (drop > r.height / 4) out.push(`${cell.dataset.type}: 작은 내용이 높은 칸 가운데에 떠 있어요(옆 칸보다 ${Math.round(drop / k)}px 아래에서 시작)`)
  }
  return out
}

/** 그려진 부품 장마다 위계, 빈 띠, 글 폭을 본다. 없으면 빈 목록 */
/*
 * 선의 경제와 칠한 상자, 글 겹침 (사람 눈 기준, docs/VISUAL-RULES.md). 사용자가 '무슨 선이 이렇게 많아', '박스 전체가 색인 건 안 된다'고
 * 짚은 것을 숫자로 본다:
 * - 한 장의 가로선은 12줄까지(같은 높이에 나란한 선은 한 줄로 센다). 넘으면 장이 표 칸처럼 갇혀 보였다.
 * - 40px 안에 두 선이 겹쳐 서지 않는다(사이에 글이 없으면): 위 컴포넌트의 아래 선과 아래 컴포넌트의 위 선이 붙은 두 겹.
 * - 선의 굵기는 두 단계까지: 세 단계면 어느 선이 무엇을 나누는지 흐렸다.
 * - 글이 든 칠한 상자(넓이 120×60 넘게, 한글 네 자 넘게)는 없다. 데이터를 그리는 막대와 칸(숫자뿐인)은 세지 않는다.
 */
const LINE_ROWS_MAX = 12
const DOUBLE_GAP = 40

type Line = { y: number; x1: number; x2: number; w: number; dark: boolean; section: boolean; el: HTMLElement }

function linesOf(area: HTMLElement, k: number): Line[] {
  const out: Line[] = []
  const ink = getComputedStyle(area).color
  let dark = false
  let section = false
  for (const el of area.querySelectorAll<HTMLElement>('*')) {
    if (el instanceof SVGElement || el.closest(EDIT_UI)) continue
    const s = getComputedStyle(el)
    // 구역 선: 컴포넌트 칸이나 그 맨 바깥 짜임의 위아래 끝에 그은 선 (항목 사이 선이 아니라 묶음을 두르는 선)
    section = el.matches('.bk, .bk > .bk-in, .bk > .bk-in > *')
    if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) continue
    const r = el.getBoundingClientRect()
    if (!r.width || !r.height) continue
    const add = (y: number, x1: number, x2: number, w: number) => {
      if (x2 - x1 >= 60 * k && w > 0) out.push({ y, x1, x2, w: Math.round(w * 10) / 10, dark, section, el })
    }
    // 굵기는 계산된 값(장 크기로 줄이기 전)이라 k로 나누지 않는다. 자리(r)만 줄어든 화면 값이다
    const seen = (c: string) => !/rgba\(.*,\s*0\)$/.test(c) && c !== 'transparent'
    const bt = s.borderTopStyle !== 'none' ? parseFloat(s.borderTopWidth) || 0 : 0
    const bb = s.borderBottomStyle !== 'none' ? parseFloat(s.borderBottomWidth) || 0 : 0
    dark = s.borderTopColor === ink
    if (bt && seen(s.borderTopColor)) add(r.top, r.left, r.right, bt)
    dark = s.borderBottomColor === ink
    if (bb && seen(s.borderBottomColor)) add(r.bottom, r.left, r.right, bb)
    dark = (s.boxShadow || '').includes(ink)
    for (const m of (s.boxShadow || '').matchAll(/inset 0(?:px)? (-?\d+(?:\.\d+)?)px 0(?:px)?/g)) {
      const v = parseFloat(m[1])
      if (v > 0) add(r.top, r.left, r.right, v)
      else if (v < 0) add(r.bottom, r.left, r.right, -v)
    }
  }
  return out
}

function lineEconomy(area: HTMLElement, k: number): string[] {
  const out: string[] = []
  const lines = linesOf(area, k).sort((a, b) => a.y - b.y)
  const rows: number[] = []
  for (const l of lines) if (!rows.some((y) => Math.abs(y - l.y) <= 3 * k)) rows.push(l.y)
  if (rows.length > LINE_ROWS_MAX) out.push(`가로선이 ${rows.length}줄이에요(${LINE_ROWS_MAX}줄까지)`)
  const weights = [...new Set(lines.map((l) => Math.round(l.w)))]
  if (weights.length >= 3) out.push(`선 굵기가 ${weights.length}단계예요(${weights.sort((a, b) => a - b).join(', ')}px)`)
  // 검정(글자색) 선, 2px 넘는 선은 장식이나 묶음 표시로 쓰지 않는다 (docs/VISUAL-RULES.md 2)
  const heavy = lines.find((l) => l.dark || l.w > 2)
  if (heavy) out.push(`${heavy.dark ? '글자색' : `${heavy.w}px`} 선이 있어요(선은 옅은 1px만)`)
  // 구역 선(묶음을 두르는 선)은 한 장에 하나까지, 대개는 없다
  const sections = new Set(lines.filter((l) => l.section).map((l) => Math.round(l.y / (4 * k))))
  if (sections.size > 1) out.push(`구역 선이 ${sections.size}개예요(하나까지)`)
  const texts = blockTextLinesOf(area)
  // 선이 글을 지나는 것(취소선처럼)
  for (const l of lines) {
    const hit = texts.find((t) => {
      if (!(l.y > t.t + 3 * k && l.y < t.b - 3 * k && Math.min(t.r, l.x2) - Math.max(t.l, l.x1) > 4 * k)) return false
      // 위치 비교의 이름표는 불투명한 바탕으로 가운데 기준선을 실제로 가린다.
      const label = t.n.parentElement?.closest<HTMLElement>('.pm-label')
      if (label && l.el.matches('.pm-mid') && label.closest('.pm-plot') === l.el.parentElement) {
        const s = getComputedStyle(label)
        const r = label.getBoundingClientRect()
        if (s.backgroundColor !== 'transparent' && !s.backgroundColor.startsWith('rgba(') && Number(s.zIndex) > 0 && r.top <= l.y && r.bottom >= l.y) return false
      }
      return true
    })
    if (hit) {
      out.push('선이 글을 지나가요')
      break
    }
  }
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const a = lines[i]
      const b = lines[j]
      const gap = b.y - a.y
      if (gap <= 3 * k) continue
      if (gap >= DOUBLE_GAP * k) break
      const lo = Math.max(a.x1, b.x1)
      const hi = Math.min(a.x2, b.x2)
      if (hi - lo < 0.3 * Math.min(a.x2 - a.x1, b.x2 - b.x1)) continue
      const between = texts.some((t) => t.t >= a.y && t.b <= b.y && t.r > lo && t.l < hi)
      if (!between) {
        out.push(`${Math.round(gap / k)}px 사이에 선이 두 겹이에요`)
        return out
      }
    }
  }
  return out
}

/** 그려진 것의 왼쪽, 오른쪽 끝 (화면 px). 들여 쓰기와 강조도 칸에는 면이 없어 글 줄과 그림으로 잰다. */
function inkX(cell: HTMLElement): { l: number; r: number } | null {
  const inner = cell.querySelector<HTMLElement>(':scope > .bk-in')
  if (!inner) return null
  let l = Infinity
  let r = -Infinity
  for (const q of blockTextLines(inner)) {
    l = Math.min(l, q.l)
    r = Math.max(r, q.r)
  }
  for (const f of inner.querySelectorAll('svg, img')) {
    if (f.parentElement?.closest('svg') || f.closest(EDIT_UI)) continue
    const q = f.getBoundingClientRect()
    if (!q.width) continue
    l = Math.min(l, q.left)
    r = Math.max(r, q.right)
  }
  // 칠한 막대와 띠(모으기, 나누기, 폭포의 막대)도 그려진 것이다. 글과 svg만 보면 본문 끝까지 닿은 막대를 몰라서, 왼쪽 이름표에서
  // 끝난 것으로 알고 오른쪽이 40% 빈다고 했다
  for (const el of inner.querySelectorAll<HTMLElement>('*')) {
    if (el.closest('svg') || el.closest(EDIT_UI)) continue
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.opacity === '0') continue
    const bg = cs.backgroundColor
    // 그림자로 테를 두른 상자(흐름의 단계 상자)도 그려진 것이다
    if ((!bg || bg === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(bg)) && cs.backgroundImage === 'none' && cs.boxShadow === 'none' && !(['Top', 'Bottom', 'Left', 'Right'] as const).some((side) => blockEdgeSeen(cs, side))) continue
    const q = el.getBoundingClientRect()
    if (!q.width || !q.height) continue
    l = Math.min(l, q.left)
    r = Math.max(r, q.right)
  }
  return l < r ? { l, r } : null
}

/**
 * 단으로 나눈 컴포넌트의 오른쪽 끝: 한 컴포넌트가 글을 둘 이상의 단(가로로 겹치지 않는 글 묶음)으로 본문 너비에 고르게 나눠 세웠고
 * (마지막 단이 본문의 40% 넘게에서 시작한다) 오른쪽에 남은 빈 곳이 단 사이의 빈 곳(가장 넓은 것)의 1.5배 안이면, 오른쪽은 몰려서 빈 것이
 * 아니라 마지막 단의 글 끝이 들쭉날쭉한 것이다. A안과 B안을 반씩 나란히 둔 가격안은 B안의 글이 본문의 75%에서 끝나 오른쪽 25%가 비었지만,
 * 그 빈 곳은 A안과 B안 사이(218px)와 같은 폭이라 고른 격자로 읽혔다. 단이 하나뿐인 글(결론 한 줄 아래에 쌓은 짧은 개요)은 봐주지 않는다
 */
function gridEnd(cells: HTMLElement[], a: DOMRect, empty: number): boolean {
  for (const cell of cells) {
    const inner = cell.querySelector<HTMLElement>(':scope > .bk-in')
    if (!inner) continue
    // 가로로 겹치는 글 줄은 한 단으로 모은다 (왼쪽 끝 차례로 훑으며 겹치면 잇는다)
    const spans: { l: number; r: number }[] = []
    const ls = blockTextLines(inner)
      .filter((q) => !q.n.parentElement?.closest(EDIT_UI))
      .sort((p, q) => p.l - q.l)
    for (const q of ls) {
      const last = spans.at(-1)
      if (last && q.l <= last.r) last.r = Math.max(last.r, q.r)
      else spans.push({ l: q.l, r: q.r })
    }
    if (spans.length < 2) continue
    const last = spans[spans.length - 1]
    if ((last.l - a.left) / a.width < 0.4) continue
    const gutter = Math.max(...spans.slice(1).map((s, i) => s.l - spans[i].r))
    if (empty <= gutter * 1.5) return true
  }
  return false
}

/**
 * 그려진 가로 범위에 ::before, ::after로 긋는 줄 선(자리를 잡은 것)까지 더한 것. 틀 밖으로 나갔는지 볼 때만 쓴다: 빈 곳을 볼 때 넣으면
 * 줄 선만 끝까지 그어진 짧은 개요를 꽉 찬 것으로 본다
 */
function withRules(cell: HTMLElement, x: { l: number; r: number } | null): { l: number; r: number } | null {
  const inner = cell.querySelector<HTMLElement>(':scope > .bk-in')
  if (!inner || !cell.classList.contains('bk-look-plain')) return x
  let l = x?.l ?? Infinity
  let r = x?.r ?? -Infinity
  for (const el of inner.querySelectorAll<HTMLElement>('*')) {
    if (el.closest('svg') || el.closest(EDIT_UI)) continue
    for (const w of ['::before', '::after']) {
      const ps = getComputedStyle(el, w)
      if (ps.content === 'none' || ps.content === 'normal' || ps.display === 'none' || ps.position !== 'absolute' || ps.visibility === 'hidden') continue
      const bg = ps.backgroundColor
      const clear = !bg || bg === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(bg)
      if (clear && ps.backgroundImage === 'none' && !blockEdgeSeen(ps, 'Top') && !blockEdgeSeen(ps, 'Left')) continue
      const px = parseFloat(ps.left)
      const pw = parseFloat(ps.width)
      if (!Number.isFinite(px) || !(pw > 0)) continue
      const q = el.getBoundingClientRect()
      const k = el.offsetWidth ? q.width / el.offsetWidth : 1
      l = Math.min(l, q.left + px * k)
      r = Math.max(r, q.left + (px + pw) * k)
    }
  }
  return l < r ? { l, r } : null
}

/** 한쪽이 이만큼 넘게 비면 판이 너비를 고르게 나누지 못한 것 */
const SIDE_EMPTY = 0.25

/**
 * 가로 리듬(docs/VISUAL-RULES.md 6): 컴포넌트가 둘 이하인 장에서 본문의 한쪽이 SIDE_EMPTY 넘게 빈 것(둘이 왼쪽 70% 안에 붙고 오른쪽이
 * 통째로 빈 장), 그리고 한 컴포넌트 안에서 같은 높이의 글과 덧붙임 사이가 본문 너비의 절반 넘게 빈 것(날짜가 한 줄을 다 쓸 때 왼쪽 글과
 * 맨 오른쪽 덧붙임으로 찢어진 것). 글 부품만 있는 장은 글 폭(--measure)이 일부러 줄을 꺾어 오른쪽이 비는 것이라 보지 않는다
 */
function sides(area: HTMLElement, k: number): string[] {
  const out: string[] = []
  const a = area.getBoundingClientRect()
  const cells = [...area.querySelectorAll<HTMLElement>(':scope > .bk')]
  // 그려진 것이 본문 옆 틀 밖으로 나간 것: 옆으로 옮긴 칸(--bk-shift-x)이 장 틀 밖으로 나가도 장 안이라 잘림 검사는 몰랐다
  for (const cell of cells) {
    const x = withRules(cell, inkX(cell))
    if (x && (x.r > a.right + 2 * k || x.l < a.left - 2 * k)) out.push(`${cell.dataset.type}: 그려진 것이 본문 옆으로 ${Math.round(Math.max(x.r - a.right, a.left - x.l) / k)}px 나가요`)
  }
  // 글 부품만 있는 장(하나든 둘이든)은 글 폭(--measure)이 일부러 줄을 꺾어 오른쪽이 빈다: 결정 요청(강조 상자) 옆 점 목록처럼
  const lone = cells.length > 0 && cells.every((c) => TEXT_TYPES.has(c.dataset.type ?? '') && c.dataset.type !== 'heading')
  if (cells.length <= 2 && !lone) {
    const xs = cells.map(inkX).filter((x): x is { l: number; r: number } => !!x)
    if (xs.length) {
      const left = (Math.min(...xs.map((x) => x.l)) - a.left) / a.width
      const right = (a.right - Math.max(...xs.map((x) => x.r))) / a.width
      if (right > SIDE_EMPTY && !gridEnd(cells, a, right * a.width)) out.push(`컴포넌트가 ${cells.length}개인데 본문 오른쪽이 ${Math.round(right * 100)}% 비어요`)
      if (left > SIDE_EMPTY) out.push(`컴포넌트가 ${cells.length}개인데 본문 왼쪽이 ${Math.round(left * 100)}% 비어요`)
    }
  }
  for (const cell of cells) {
    const inner = cell.querySelector<HTMLElement>(':scope > .bk-in')
    // 차트(svg로 그린 것)의 이름표는 축과 범례 자리에 따로 서는 것이라 글과 덧붙임이 아니다
    if (!inner || inner.querySelector('svg:not([aria-hidden="true"] svg)')) continue
    const ls = blockTextLines(inner).filter((q) => !q.n.parentElement?.closest(EDIT_UI))
    // 그려진 것(막대, 그림, 칠한 상자, 선): 글 사이에 이것이 있으면 찢어진 것이 아니라 그림의 양쪽 이름표다
    const drawnBoxes = [...inner.querySelectorAll<HTMLElement>('*')]
      .filter((el) => {
        if (el.parentElement?.closest('svg') || el.closest(EDIT_UI)) return false
        const tag = el.tagName.toLowerCase()
        if (tag === 'svg' || tag === 'img') return true
        // 글 없는 그림 상자(aria-hidden, 범위의 눈금처럼 ::before로 긋는 축): 상자째 그림이다. 칠한 띠만 보면 눈금 축을 몰라서,
        // 왼쪽 이름과 눈금 위 표시의 이름(고리 아래)을 찢어진 글과 덧붙임으로 알았다
        if (el.getAttribute('aria-hidden') === 'true') return true
        const cs = getComputedStyle(el)
        return (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent') || cs.backgroundImage !== 'none'
      })
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0)
    let torn = 0
    for (const p of ls) {
      for (const q of ls) {
        if (p === q || q.l < p.r) continue
        if (Math.min(p.b, q.b) - Math.max(p.t, q.t) < 0.5 * Math.min(p.b - p.t, q.b - q.t)) continue
        // 한 항목(같은 .it, 또는 둘 다 항목 밖)의 글과 덧붙임만: 나란한 항목(강점과 약점의 두 칸, 표의 칸)은 따로 선 글이다
        const pi = p.n.parentElement?.closest('.it') ?? null
        const qi = q.n.parentElement?.closest('.it') ?? null
        if (pi !== qi) continue
        // 줄 선이 있는 항목(목차, 표의 줄)은 선이 두 끝을 잇는 한 줄이라 찢어진 것이 아니다
        // 선은 테두리로도, 칠한 가상 요소(::after)로도 긋는다(목차의 항목 사이 선)
        const ruled = (el: Element) => {
          const cs = getComputedStyle(el)
          if (parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderBottomWidth) > 0) return true
          return (['::before', '::after'] as const).some((p) => {
            const ps = getComputedStyle(el, p)
            return ps.content !== 'none' && (ps.backgroundColor !== 'rgba(0, 0, 0, 0)' || parseFloat(ps.borderTopWidth) > 0 || parseFloat(ps.borderBottomWidth) > 0)
          })
        }
        // 목록의 줄 선은 항목 사이에만 서서(아래 선이면 끝 항목, 위 선이면 첫 항목에는 없다) 같은 목록의 다른 항목에 선이 있어도 그 꼴이다:
        // 목차의 끝 항목 '실행 … 3'만 선이 없어(선은 앞 두 항목의 ::after) 찢어졌다고 재어졌다
        const rows = pi ? [pi, ...[...(pi.parentElement?.children ?? [])].filter((x) => x !== pi && x.classList.contains('it'))] : []
        if (rows.some((row) => [row, ...row.querySelectorAll('*')].some(ruled))) continue
        // 항목 밖의 두 글도 줄 선이 있는 한 줄(표의 머리 줄: 진행 현황의 '과제'와 상태별 개수)에 함께 서면 찢어진 것이 아니다.
        // 두 글을 함께 담은 가장 가까운 상자부터 칸 안쪽까지 올라가며 그 상자 자신의 선만 본다(아래 줄들의 선까지 보면 다 빠진다)
        if (!pi) {
          let box = p.n.parentElement
          while (box && box !== inner && !box.contains(q.n)) box = box.parentElement
          let row = false
          for (let el: HTMLElement | null = box; el && el !== inner; el = el.parentElement) if (ruled(el)) row = true
          if (row) continue
        }
        // 사이에 다른 글이나 그려진 것이 있으면 찢어진 것이 아니다 (막대 옆 숫자, 표의 칸)
        if (ls.some((o) => o !== p && o !== q && o.l >= p.r - 1 && o.r <= q.l + 1 && Math.min(o.b, p.b) - Math.max(o.t, p.t) > 0)) continue
        if (drawnBoxes.some((o) => o.left < q.l && o.right > p.r && Math.min(o.bottom, p.b + 24 * k) - Math.max(o.top, p.t - 24 * k) > 0)) continue
        // 오른쪽 글이 그림 바로 위나 아래(그 글 한 줄 반 안)에 그 그림과 겹쳐 서면 덧붙임이 아니라 그림의 이름표다(범위 눈금 위 고리의 이름)
        if (drawnBoxes.some((o) => o.left < q.r && o.right > q.l && Math.max(o.top - q.b, q.t - o.bottom) < 1.5 * (q.b - q.t))) continue
        torn = Math.max(torn, q.l - p.r)
      }
    }
    if (torn > 0.5 * a.width) out.push(`${cell.dataset.type}: 글과 덧붙임 사이가 ${Math.round(torn / k)}px 비어요(양 끝으로 찢어졌어요)`)
  }
  return out
}

/**
 * 줄의 리듬(docs/VISUAL-RULES.md 6): 위아래로 쌓인 항목(표의 줄, 목록, 가격안의 줄)의 그려진 것 사이가 내용 높이의 두 배를 넘거나
 * 줄마다 GAP_VARY 넘게 다른 것. 칸이 내용보다 높으면 격자의 1fr 줄이 남는 높이를 나눠 받아 줄 사이가 글자 크기의 몇 배로 벌어졌고,
 * 두 줄짜리 항목 옆의 한 줄 항목은 사이가 더 벌어져 줄마다 달랐다. 줄의 상자가 아니라 그려진 것(글, 그림, 칠한 상자)으로 잰다
 */
function rowRhythm(area: HTMLElement, k: number): string[] {
  const out: string[] = []
  for (const cell of area.querySelectorAll<HTMLElement>(':scope > .bk')) {
    const inner = cell.querySelector<HTMLElement>(':scope > .bk-in')
    if (!inner) continue
    // 모이고 퍼지기의 곳 이름은 줄이 아니라 그림 위의 이름표다: 칸 높이에 맞춰 호를 따라 벌어지는 것이 그림의 짜임이다
    if (cell.dataset.type === 'hub') continue
    const lines = blockTextLines(inner)
    const lists = new Set<Element>()
    for (const it of inner.querySelectorAll('.it')) if (it.parentElement) lists.add(it.parentElement)
    for (const list of lists) {
      const items = [...list.children].filter((el): el is HTMLElement => el instanceof HTMLElement && el.classList.contains('it') && el.offsetHeight > 0)
      if (items.length < 2) continue
      const spans = items.map((it) => {
        let t = Infinity
        let b = -Infinity
        for (const q of lines) {
          if (!it.contains(q.n)) continue
          t = Math.min(t, q.t)
          b = Math.max(b, q.b)
        }
        for (const el of [it, ...it.querySelectorAll<HTMLElement>('svg, img, *')]) {
          if (el.parentElement?.closest('svg') || el.closest(EDIT_UI)) continue
          const tag = el.tagName.toLowerCase()
          const cs = getComputedStyle(el)
          // 둘레를 긋는 상자(흐름의 단계 상자처럼 그림자로 1px 테를 두른 것)도 그려진 것이다: 글만 보면 상자 사이의 이음표 자리까지 줄 사이로 알고
          // 줄이 내용의 두 배 넘게 늘었다고 했다(단계 상자 80px 사이 44px에 화살표). 한쪽에만 긋는 줄 선(border, ::before)은 줄 사이의 선이라 넣지 않는다
          const paint = tag === 'svg' || tag === 'img' || (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent') || cs.boxShadow !== 'none'
          if (!paint) continue
          const r = el.getBoundingClientRect()
          if (!r.width || !r.height) continue
          t = Math.min(t, r.top)
          b = Math.max(b, r.bottom)
        }
        const r = it.getBoundingClientRect()
        return { t, b, l: r.left, r: r.right }
      })
      // 위아래로 쌓인 이웃끼리만 (옆으로 나란한 항목은 줄이 아니다)
      const gaps: number[] = []
      for (let i = 1; i < spans.length; i++) {
        const p = spans[i - 1]
        const q = spans[i]
        if (!Number.isFinite(p.b) || !Number.isFinite(q.t) || q.t < p.b - 1) continue
        if (Math.min(p.r, q.r) - Math.max(p.l, q.l) < 0.5 * Math.min(p.r - p.l, q.r - q.l)) continue
        const gap = (q.t - p.b) / k
        const h = Math.max(p.b - p.t, q.b - q.t) / k
        // 연결도의 상자는 같은 높이의 자리(선이 그 가운데로 들어간다)에 가운데로 서서, 글 줄 수가 다르면 글 사이는 달라도 가운데 사이는 같다:
        // 줄마다 같아야 하는 것은 가운데 사이다(두 줄로 꺾인 이름 옆 한 줄 이름이 66, 104px로 다르다고 했다)
        // 하나 크게 모양은 첫 숫자를 나머지 줄과 의도적으로 떼어 둔다. 그 사이는 나머지 같은 크기 줄의 간격과 견주지 않는다.
        const focusLead = i === 1 && cell.dataset.type === 'kpi' && cell.classList.contains('va-focus') && getComputedStyle(inner).getPropertyValue('--kp-fstack').trim() === '1'
        if (!focusLead) gaps.push(cell.dataset.type === 'network' ? (q.t + q.b - p.t - p.b) / 2 / k : gap)
        if (gap > 2 * h && gap > 48) {
          out.push(`${cell.dataset.type}: 줄 사이(${Math.round(gap)}px)가 내용 높이(${Math.round(h)}px)의 두 배를 넘게 늘었어요`)
          break
        }
      }
      if (gaps.length > 1 && Math.max(...gaps) - Math.min(...gaps) > GAP_VARY) out.push(`${cell.dataset.type}: 줄 사이가 줄마다 달라요(${gaps.map(Math.round).join(', ')}px)`)
    }
  }
  return [...new Set(out)]
}

/** 글과 글이 겹치는 것(다른 글 줄끼리 2px 넘게). 겹치면 그 짜임은 실패다 (docs/VISUAL-RULES.md 5) */
function textOverlap(area: HTMLElement, k: number): string[] {
  const ls: { n: Node; t: number; b: number; l: number; r: number }[] = []
  // 편집할 때 그림 위에 겹쳐 띄우는 입력 칸(.on-chart, 날짜의 큰 날 위 같은)은 일부러 겹친다
  for (const inner of area.querySelectorAll<HTMLElement>('.bk-in')) for (const q of blockTextLines(inner)) if (!q.n.parentElement?.closest('.on-chart')) ls.push(q)
  const gap = 2 * k
  for (let i = 0; i < ls.length; i++) {
    for (let j = i + 1; j < ls.length; j++) {
      const a = ls[i]
      const b = ls[j]
      if (a.n === b.n) continue
      if (Math.min(a.r, b.r) - Math.max(a.l, b.l) > gap && Math.min(a.b, b.b) - Math.max(a.t, b.t) > gap) {
        const ta = (a.n.textContent ?? '').trim().slice(0, 8)
        const tb = (b.n.textContent ?? '').trim().slice(0, 8)
        return [`글이 겹쳐요 「${ta}」 「${tb}」`]
      }
    }
  }
  return []
}

function blockTextLinesOf(area: HTMLElement): ReturnType<typeof blockTextLines> {
  const out: ReturnType<typeof blockTextLines> = []
  for (const inner of area.querySelectorAll<HTMLElement>('.bk-in')) for (const q of blockTextLines(inner)) out.push(q)
  return out
}

function paintedBoxes(area: HTMLElement, k: number): string[] {
  const out: string[] = []
  // 장 바탕과 같은 색으로 지운 것(위치 비교의 이름표가 선을 가리는 바탕 같은)은 칠한 상자가 아니다
  const slideBg = getComputedStyle(area.closest('.slide') ?? area).backgroundColor
  for (const el of area.querySelectorAll<HTMLElement>('.bk *')) {
    if (el instanceof SVGElement || el.closest(EDIT_UI) || el.matches('img')) continue
    const s = getComputedStyle(el)
    const bg = s.backgroundColor
    if (!bg || bg === 'transparent' || bg === slideBg || /rgba\(.*,\s*0(?:\.0\d*)?\)$/.test(bg)) continue
    const r = el.getBoundingClientRect()
    if (r.width < 120 * k || r.height < 60 * k) continue
    // 그림의 둥근 마디(모이고 퍼지기의 가운데 원)는 글 상자가 아니라 그림이다: 짙은 면 위에 이름 하나를 얹은 기호
    if (s.borderRadius === '50%') continue
    const text = (el.textContent || '').replace(/\s/g, '')
    if ((text.match(/[가-힣]/g) || []).length < 4) continue
    const cell = el.closest<HTMLElement>('.bk')
    out.push(`${cell?.dataset.type ?? '컴포넌트'}: 글이 든 상자를 칠했어요(${Math.round(r.width / k)}×${Math.round(r.height / k)})`)
  }
  return [...new Set(out)]
}

/**
 * 한 축 정렬(docs/VISUAL-RULES.md 5): 같은 줄(같은 묶음, 같은 판의 줄)에 나란한 칸 가운데 글로 시작하는 칸끼리 첫 글줄의 윗선이
 * 4px 넘게 어긋난 것. 32px 넘게 다르면 짜임이 다른 것(그림 옆의 글)이라 쌓기도 맞추지 않아 보지 않는다
 */
function rowTops(area: HTMLElement, k: number): string[] {
  const out: string[] = []
  const rows = new Map<string, HTMLElement[]>()
  for (const c of area.querySelectorAll<HTMLElement>(':scope > .bk.is-shared:not(.lk-row)')) {
    const key = `${c.dataset.band}|${c.style.getPropertyValue('--y')}`
    rows.set(key, (rows.get(key) ?? []).concat(c))
  }
  rows.forEach((row) => {
    if (row.length < 2) return
    // 원과 글의 짝은 첫 글줄 대신 보이는 묶음 전체의 중심으로 검수한다.
    if (row.length === 2 && row.every((c) => c.classList.contains('bk-look-plain')) && row.some((c) => c.dataset.type === 'ring') && row.some((c) => ['bullets', 'text', 'facts', 'checks'].includes(c.dataset.type ?? ''))) {
      const spans = row.map(inkSpan)
      if (spans.every((s) => s !== null)) {
        const centers = spans.map((s) => (s!.t + s!.b) / 2)
        const d = Math.abs(centers[0] - centers[1]) / k
        if (d > 4) out.push(`원형 그래프와 글 묶음의 중심이 ${Math.round(d)}px 어긋나요`)
      }
      return
    }
    const tops = row.flatMap((c) => {
      const inner = c.querySelector<HTMLElement>(':scope > .bk-in')
      const ink = inkSpan(c)
      const ls = inner ? blockTextLines(inner).filter((q) => !q.n.parentElement?.closest(EDIT_UI)) : []
      if (!ls.length || !ink) return []
      const t = Math.min(...ls.map((q) => q.t))
      return t - ink.t < 8 * k || c.classList.contains('bk-look-card') ? [{ c, t }] : []
    })
    if (tops.length < 2) return
    const d = (Math.max(...tops.map((x) => x.t)) - Math.min(...tops.map((x) => x.t))) / k
    if (d > 4 && d <= 32) out.push(`한 줄의 첫 글줄 윗선이 ${Math.round(d)}px 어긋나요(${tops.map((x) => x.c.dataset.type).join(', ')})`)
  })
  return out
}

/** 본문을 이만큼도 채우지 못하면 빈 장으로 본다 (docs/VISUAL-RULES.md 6: 60~85%가 기본) */
const FILL_MIN = 0.6

/**
 * 채움: 그려진 내용이 본문 높이의 FILL_MIN에 못 미치는 장. 남는 높이는 맨 아래에 모이니, 내용이 적으면 아래가 40% 넘게 빈다.
 * 사이를 벌리지 말고 글자와 그림의 단계를 올려 채운다(fitBlocks.ts의 fit 끝). 제목 없는 한 문장 장(가운데에 선다)과
 * 키워도 모자라 눈높이 가운데로 내린 완결된 장(data-eye)은 뺀다
 */
function fill(slide: HTMLElement, area: HTMLElement): string[] {
  const cells = [...area.querySelectorAll<HTMLElement>(':scope > .bk')]
  const head = slide.querySelector<HTMLElement>('.s-head')
  const hasHead = !!head && head.getClientRects().length > 0 && !!head.textContent?.trim()
  if ((!hasHead && cells.length === 1) || area.dataset.eye === 'full') return []
  const a = area.getBoundingClientRect()
  const spans = cells.map(inkSpan).filter((x): x is Span => !!x)
  if (!spans.length || !a.height) return []
  const used = (Math.max(...spans.map((x) => x.b)) - a.top) / a.height
  return used < FILL_MIN ? [`본문을 ${Math.round(used * 100)}%만 채워요(아래가 ${Math.round((1 - used) * 100)}% 비어요)`] : []
}

/**
 * 레이아웃 장의 위아래 균형 (VISUAL-RULES 6): 장 채움(fitBlocks.ts의 fitLayout)이 글자를 키우고 줄 사이를 넓혀도 75%를 못 채우면
 * 눈높이 가운데로 내려야 한다(.s-body의 data-eye). 위에 붙은 채 아래만 길게 빈 장을 찾는다. 채움은 본문 상자가 아니라
 * 본문 윗선부터 장 틀의 아랫선까지로 잰다(하단 표시 몫은 공백 설계에 넣지 않는다. 비교 장은 본문 상자가 내용 높이뿐이다)
 */
// fitBlocks.ts의 FILL_EYE와 같은 값
const LAYOUT_EYE = 0.75

function layoutFill(slide: HTMLElement): string[] {
  if (slide.classList.contains('l-compose')) return []
  // 채울 본문: 보통 장은 장 머리 아래의 본문 하나, 사례 장은 단마다(제목 아래 이야기, 대상 아래 결과 숫자. fitBlocks.ts의 layoutParts와 같다)
  const parts: { body: HTMLElement; name: string }[] = []
  const body = slide.querySelector<HTMLElement>(':scope > .s-body')
  if (body && slide.querySelector(':scope > .s-head')) parts.push({ body, name: '본문을' })
  if (slide.classList.contains('l-case')) {
    const story = slide.querySelector<HTMLElement>(':scope > .cs-main > .cs-story')
    const results = slide.querySelector<HTMLElement>(':scope > .cs-side > .cs-results')
    if (story) parts.push({ body: story, name: '왼쪽 단의 이야기를' })
    if (results) parts.push({ body: results, name: '결과 숫자를' })
  }
  const sr = slide.getBoundingClientRect()
  const k = sr.height / slide.offsetHeight
  if (!k) return []
  const out: string[] = []
  for (const { body, name } of parts) {
    if (body.dataset.eye) continue
    const b = body.getBoundingClientRect()
    const room = sr.bottom - (parseFloat(getComputedStyle(slide).getPropertyValue('--pad-y')) || 0) * k - b.top
    if (room <= 0 || !b.height) continue
    let bottom = -Infinity
    for (const q of blockTextLines(body)) if (!q.n.parentElement?.closest(EDIT_UI)) bottom = Math.max(bottom, q.b)
    for (const f of blockFigures(body)) bottom = Math.max(bottom, f.getBoundingClientRect().bottom)
    for (const im of body.querySelectorAll('img')) {
      const r = im.getBoundingClientRect()
      if (r.width && r.height) bottom = Math.max(bottom, r.bottom)
    }
    if (bottom === -Infinity) continue
    const used = (bottom - b.top) / room
    // 머리 줄뿐인 덜 쓴 장은 fitLayout도 내리지 않는다(내리면 머리 글자만 가운데에 뜬다).
    // 제목이 없어도 본문이 완결되어 있으면 위아래 균형을 검사한다.
    if (used < 0.25) continue
    if (used < LAYOUT_EYE) out.push(`${name} ${Math.round(used * 100)}%만 채우고 위에 붙어 있어요(아래 ${Math.round((room - (bottom - b.top)) / k)}px 빔)`)
  }
  return out
}

/**
 * 잘림: 글이나 그림이 장 밖으로, 또는 넘침을 숨기는 상자(overflow hidden, clip) 밖으로 나가 보이지 않는 것. 레이아웃 장도 본다
 * (진행 현황의 넷째 열이 장 밖으로 잘렸는데 칸 안만 보는 검사는 몰랐다). 편집 표시는 뺀다
 */
export function clipped(slide: HTMLElement): string[] {
  const out = new Set<string>()
  const k = slide.getBoundingClientRect().width / 1920
  const sr = slide.getBoundingClientRect()
  const tol = 2 * k
  const boxes: { box: { l: number; t: number; r: number; b: number }; el: Element; what: string }[] = []
  for (const inner of slide.querySelectorAll<HTMLElement>('.bk-in')) for (const q of blockTextLines(inner)) boxes.push({ box: q, el: q.n.parentElement!, what: `「${(q.n.textContent ?? '').trim().slice(0, 10)}」` })
  if (!slide.querySelector('.bk-in')) {
    // 레이아웃 장: 장 안의 글 줄 전부
    const range = document.createRange()
    const walk = document.createTreeWalker(slide, NodeFilter.SHOW_TEXT)
    while (walk.nextNode()) {
      const n = walk.currentNode
      const el = n.parentElement
      if (!el || !(n.textContent ?? '').trim() || el.closest(EDIT_UI) || el.closest('[aria-hidden="true"]')) continue
      if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue
      range.selectNodeContents(n)
      for (const q of range.getClientRects()) if (q.width && q.height) boxes.push({ box: { l: q.left, t: q.top, r: q.right, b: q.bottom }, el, what: `「${(n.textContent ?? '').trim().slice(0, 10)}」` })
    }
  }
  for (const f of slide.querySelectorAll('svg, img')) {
    if (f.parentElement?.closest('svg') || f.closest(EDIT_UI) || f.closest('[aria-hidden="true"]:not(svg)')) continue
    const q = f.getBoundingClientRect()
    if (q.width && q.height) boxes.push({ box: { l: q.left, t: q.top, r: q.right, b: q.bottom }, el: f, what: f.tagName.toLowerCase() })
  }
  for (const { box, el, what } of boxes) {
    const cell = el.closest<HTMLElement>('.bk')
    const name = cell ? `${cell.dataset.type}: ` : ''
    if (box.l < sr.left - tol || box.r > sr.right + tol || box.t < sr.top - tol || box.b > sr.bottom + tol) {
      out.add(`${name}${what}이(가) 장 밖으로 나가 잘려요`)
      continue
    }
    for (let x = el.parentElement; x && x !== slide; x = x.parentElement) {
      const cs = getComputedStyle(x)
      const hideX = cs.overflowX === 'hidden' || cs.overflowX === 'clip'
      const hideY = cs.overflowY === 'hidden' || cs.overflowY === 'clip'
      if (!hideX && !hideY) continue
      const r = x.getBoundingClientRect()
      if ((hideX && (box.l < r.left - tol || box.r > r.right + tol)) || (hideY && (box.t < r.top - tol || box.b > r.bottom + tol))) {
        out.add(`${name}${what}이(가) 상자 밖으로 나가 잘려요`)
        break
      }
    }
  }
  return [...out]
}

export async function checkAssembly(): Promise<{ slides: number; problems: string[] }> {
  await document.fonts.ready
  await new Promise((r) => setTimeout(r, 300))
  const problems: string[] = []
  const areas = [...document.querySelectorAll<HTMLElement>('.bk-area')]
  // 레이아웃 장(부품 장이 아닌 장)은 잘림과 위아래 균형만 본다: 장 번호는 갤러리의 장 차례
  const slides = [...document.querySelectorAll<HTMLElement>('.slide')]
  slides.forEach((slide, i) => {
    if (slide.querySelector('.bk-area')) return
    for (const p of [...clipped(slide), ...layoutFill(slide)]) problems.push(`${i + 1}번 장(레이아웃): ${p}`)
  })
  areas.forEach((area, i) => {
    const slide = area.closest<HTMLElement>('.slide')
    if (!slide) return
    const k = slide.getBoundingClientRect().width / 1920
    for (const p of [...rivals(slide, area), ...bands(slide, area, k), ...measure(area, k), ...labelWraps(area, k), ...inside(area, k), ...corner(area, k), ...linkMeaning(area), ...floating(area, k), ...lineEconomy(area, k), ...paintedBoxes(area, k), ...textOverlap(area, k), ...rowRhythm(area, k), ...sides(area, k), ...rowTops(area, k), ...fill(slide, area), ...clipped(slide)]) problems.push(`${i + 1}번 장: ${p}`)
  })
  return { slides: areas.length, problems }
}

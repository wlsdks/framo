/*
 * 개발용: 장의 틀 점검. 모든 장이 같은 틀(slides.css의 --pad-x, --pad-y) 안에 그려지는지 잰다.
 * #/gallery?variants=1 (테마, &size=large, &mode=edit도) → 콘솔에서 checkFrame()
 *
 * 잴 때는 글자가 실제로 그려진 선(잉크)으로 잰다. 줄 높이의 빈 위아래나 글자 옆 빈칸까지 재면
 * 큰 제목은 틀에서 멀어 보이고 작은 글은 가까워 보여서, 상자로는 맞아도 눈으로는 위아래가 달라 보인다.
 * - 넘침: 글, 선, 면, 그림이 틀 밖으로 나가면 (장 끝까지 깐 바탕과 옆면은 틀이 아니어서 뺀다)
 * - 위 틀선: 장 맨 위의 제목이 있는 장은 제목 글자의 윗선이 위 틀선에 닿아야 한다
 * - 아래 틀선: 하단 표시가 있는 장은 그 상자 아래가 아래 틀선이다 (단락 밑줄의 아랫선)
 */

/** 글꼴 상자와 글자 선의 차이를 재는 캔버스 */
let pen: CanvasRenderingContext2D | null = null

interface Ink {
  l: number
  t: number
  r: number
  b: number
  who: { l?: string; t?: string; r?: string; b?: string }
}

const EDIT_UI = '.ed-halo, .it-remove, .it-grip, .pn-tools, .img-tools, .bk-handle, .bk-line, .bk-board'

const nameOf = (el: Element) => (typeof el.className === 'string' && el.className ? el.className.split(' ')[0] : el.tagName.toLowerCase())

/** 장 하나에서 글과 그림이 그려진 테두리 (1920×1080 기준) */
export function inkOf(slide: HTMLElement): Ink {
  pen ??= document.createElement('canvas').getContext('2d')
  const sr = slide.getBoundingClientRect()
  const k = sr.width / 1920
  const ink: Ink = { l: 1e9, t: 1e9, r: -1e9, b: -1e9, who: {} }
  const add = (x0: number, y0: number, x1: number, y1: number, el: Element, bleed: boolean) => {
    const [l, t, r, b] = [(x0 - sr.left) / k, (y0 - sr.top) / k, (x1 - sr.left) / k, (y1 - sr.top) / k]
    if (r - l < 0.5 || b - t < 0.5) return
    // 장 끝까지 깐 면(바탕, 옆면, 꽉 채운 그림)은 틀이 아니다
    if (bleed && (l <= 1 || t <= 1 || r >= 1919 || b >= 1079)) return
    if (l < ink.l) [ink.l, ink.who.l] = [l, nameOf(el)]
    if (t < ink.t) [ink.t, ink.who.t] = [t, nameOf(el)]
    if (r > ink.r) [ink.r, ink.who.r] = [r, nameOf(el)]
    if (b > ink.b) [ink.b, ink.who.b] = [b, nameOf(el)]
  }
  // 편집 표시(빈칸의 옅은 면, 항목 빼기 단추, 부품 손잡이)는 장의 내용이 아니다
  const shown = (el: Element) => el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) && !el.closest(EDIT_UI)
  const walk = document.createTreeWalker(slide, NodeFilter.SHOW_TEXT)
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const text = n.textContent?.trim()
    const el = n.parentElement
    if (!text || !el || !shown(el) || !pen) continue
    const cs = getComputedStyle(el)
    pen.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
    pen.letterSpacing = cs.letterSpacing === 'normal' ? '0px' : cs.letterSpacing
    const m = pen.measureText(text)
    // 위아래는 문장 부호를 빼고 잰다: 쉼표와 마침표의 꼬리는 글자 밑선 아래로 내려오지만 틀은 글자의 밑선으로 맞춘다.
    // 크게에서 표지 부제 '…나누고, 회의는…'의 쉼표 꼬리(4px)만 아래 틀 밖으로 재어졌다(글자 밑선은 틀선 위)
    const letters = text.replace(/[,.;:!?…·'"‘’“”()[\]{}]/g, '')
    const v = letters && letters !== text ? pen.measureText(letters) : m
    const range = document.createRange()
    range.selectNodeContents(n)
    let rects = [...range.getClientRects()]
    // 여러 줄이면 줄 상자 대신 낱말마다의 상자로: 편집 칸(빈칸을 그대로 두는 글)은 줄 끝의 빈칸까지 줄 상자에 들어가, 글자는
    // 틀 안인데 빈칸 하나만큼(크게에서 7px) 오른쪽 틀 밖으로 재어졌다(한 장 요약의 오른쪽 단, 편집 화면에서만)
    if (rects.length > 1) {
      const data = n.textContent ?? ''
      rects = [...data.matchAll(/\S+/g)].flatMap((w) => {
        const word = document.createRange()
        word.setStart(n, w.index!)
        word.setEnd(n, w.index! + w[0].length)
        return [...word.getClientRects()]
      })
    }
    const one = rects.length === 1
    for (const r of rects) {
      const ky = r.height / (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent)
      const top = r.top + (m.fontBoundingBoxAscent - v.actualBoundingBoxAscent) * ky
      const bottom = r.bottom - (m.fontBoundingBoxDescent - v.actualBoundingBoxDescent) * ky
      // 한 줄이면 글자 옆 빈칸도 뺀다 (큰 숫자는 옆 빈칸이 넓다). 여러 줄이면 줄마다 글이 달라 상자로
      const kx = one && m.width ? r.width / m.width : 0
      const left = kx ? r.left - m.actualBoundingBoxLeft * kx : r.left
      const right = kx ? r.left + m.actualBoundingBoxRight * kx : r.right
      add(left, top, right, bottom, el, false)
    }
  }
  for (const el of slide.querySelectorAll('*')) {
    if (!shown(el)) continue
    const tag = el.tagName.toLowerCase()
    if (el instanceof SVGElement) {
      // 배경 모션(.s-bd)은 장 끝까지 지나가는 몸짓이라 틀이 아니다: 끝 모습의 가장자리에 남는 옅은 흔적을 틀 밖 내용으로 쟀다
      if (el.closest('.s-bd')) continue
      if (['path', 'rect', 'circle', 'line', 'polyline', 'polygon', 'ellipse'].includes(tag)) {
        const r = el.getBoundingClientRect()
        add(r.left, r.top, r.right, r.bottom, el, true)
      }
      continue
    }
    const cs = getComputedStyle(el)
    const fill = cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || cs.backgroundImage !== 'none'
    const line = (['Top', 'Right', 'Bottom', 'Left'] as const).some(
      (s) => parseFloat(cs[`border${s}Width`]) > 0 && cs[`border${s}Style`] !== 'none' && cs[`border${s}Color`] !== 'rgba(0, 0, 0, 0)',
    )
    if (tag === 'img' || fill || line) {
      const r = el.getBoundingClientRect()
      add(r.left, r.top, r.right, r.bottom, el, true)
    }
  }
  return { l: ink.l, t: ink.t, r: 1920 - ink.r, b: 1080 - ink.b, who: ink.who }
}

/** 틀에서 이만큼까지는 눈에 같아 보인다 (글자마다 키가 조금씩 다르다) */
const SLACK = 4

export async function checkFrame(): Promise<{ slides: number; problems: string[] }> {
  await document.fonts.ready
  await new Promise((r) => setTimeout(r, 300))
  const problems: string[] = []
  const slides = [...document.querySelectorAll<HTMLElement>('.slide')]
  slides.forEach((slide, i) => {
    const cs = getComputedStyle(slide)
    const px = parseFloat(cs.getPropertyValue('--pad-x'))
    const py = parseFloat(cs.getPropertyValue('--pad-y'))
    const layout = /\bl-([\w-]+)/.exec(slide.className)?.[1] ?? '?'
    const variant = /\bva-([\w-]+)/.exec(slide.className)?.[1]
    const what = `${i + 1}번 장 ${layout}${variant ? ` (${variant})` : ''}`
    const ink = inkOf(slide)
    const out = (['l', 'r', 't', 'b'] as const).filter((e) => ink[e] < (e === 'l' || e === 'r' ? px : py) - SLACK)
    for (const e of out) problems.push(`${what}: ${{ l: '왼쪽', r: '오른쪽', t: '위', b: '아래' }[e]} 틀 밖 ${Math.round(ink[e])} (${ink.who[e]})`)
    const k = slide.getBoundingClientRect().width / 1920
    const title = slide.querySelector('.s-head > .s-title:first-child')
    if (title && ink.who.t === 's-title' && Math.abs(ink.t - py) > SLACK) problems.push(`${what}: 제목이 위 틀선에서 ${Math.round(ink.t - py)} 떨어졌어요`)
    const foot = slide.querySelector<HTMLElement>('.s-foot')
    if (foot?.checkVisibility()) {
      const gap = (slide.getBoundingClientRect().bottom - foot.getBoundingClientRect().bottom) / k
      if (Math.abs(gap - py) > 1) problems.push(`${what}: 하단 표시가 아래 틀선에서 ${Math.round(gap - py)} 떨어졌어요`)
    }
  })
  return { slides: slides.length, problems }
}

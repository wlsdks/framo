// 모션 그래픽(cine)의 엔진: 레시피의 대본(deck/cine.ts의 CineScript)을 읽어 한 장면을 그린다. 앱의 발표 화면, 모션 편집, 내보낸 HTML의
// 뷰어가 똑같이 쓴다. 기준은 docs/MOTION.md의 '모션 그래픽'이다.
//
// - 모든 움직임은 시간의 순수 함수다: 입자 하나의 자리, 크기, 짙기, 빛, 카메라, 글의 들어오기가 모두 '때 e'만으로 정해진다. 그래서
//   끌어 보기, 하나씩, 필름 띠, 멈춘 그림이 한 계산에서 나오고, 어느 때로 건너뛰어도 같은 그림이다. 시계는 Web Animations 하나(clock)라서
//   엔진의 끝맺음, 모션 편집의 멈추기와 끌어 보기, 발표하는 사람의 건너뛰기가 그 시계만 맞추면 된다.
// - 그리기는 셋: 입자는 WebGL2의 점(기본), 소프트웨어 GL이거나 GPU가 없으면 Canvas2D(입자 1500, 잔상 없음), 멈춘 그림은 SVG(남는 선만.
//   편집 화면, 목록, PDF, PPT, 내보낸 HTML의 처음 모습). 빛, 먹, 선, 펜 끝은 뒤의 2D 캔버스가 그린다.
// - 밝기: 장 바탕이 어두우면 빛(더하기 섞기), 밝으면 번지는 먹(보통 섞기, 낮은 짙기, 빛 번짐 없음). 색은 장의 글자색과 강조색뿐이다.
// - 글은 DOM의 글 그대로다(고를 수 있고 PDF에서 벡터). 엔진은 그리는 순간 칸의 글자를 그 칸의 글꼴로 화면 밖 캔버스에 그려 모양을 딴다.
//   들어오기는 투명도, 흐림(8px까지), 가림(mask)으로만 한다(자리를 다시 짜지 않는다). 끝나면 손댄 것을 모두 되돌려 편집 화면과 같다.
// - 성능: 처음 30프레임의 p90이 20ms를 넘으면 입자를 절반으로 줄이고 잔상을 끈다. 캔버스 화소는 1.5배, 240만 화소까지. 장을 떠나면
//   그리기를 멈추고 GL 문맥을 버린다(썸네일과 목록은 GL을 만들지 않는다).
//
// 뷰어에는 이 함수의 소스(toString)가 그대로 들어간다(engine.ts, backdrop.ts와 같다). 그래서 바깥의 아무것도 참조하지 않고(받는 것은 kit뿐),
// 필요한 것은 모두 이 함수 안에 둔다. 셰이더와 수식은 처음부터 직접 짰다(docs/OPEN-SOURCE.md).

import type { CineScript, CineSpan, CineTextCue } from '../deck/cine'
import type { DrawKit } from './draw'

interface CinePlayOptions {
  /** none, calm, lively */
  level: string
  /** 시작을 늦출 ms(엔진의 차례와 장 바꾸기의 기다림) */
  at?: number
  /** 컴포넌트마다 고른 빠르기(엔진의 pace: 빠르게 0.6, 천천히 1.7) */
  pace?: number
  /** 시계를 넣을 곳: 엔진의 끝맺음과 모션 편집의 시간표가 이 시계를 본다 */
  anims?: Animation[]
  /** 발표하는 사람이 누르면: 아직 그리는 중이면 끝 모습으로 건너뛰고 true */
  skips?: (() => boolean)[]
  /** false면 WebGL을 쓰지 않는다(고르는 카드처럼 여럿이 함께 움직이는 작은 그림) */
  gl?: boolean
}

/** 마지막으로 그린 장면의 성능 기록(개발용 검사, scripts/look.mjs perf) */
interface CineStats {
  mode: string
  count: number
  tier: number
  setup: number
  /** 준비 단계마다 걸린 ms(캔버스와 GPU, 글 재기와 입자) */
  steps: number[]
  frames: number[]
}

interface CineRuntime {
  /** 끝 모습의 SVG 안쪽: 칸을 0~1000으로 늘린 좌표(preserveAspectRatio none)의 남는 선. 남는 것이 없으면 '' */
  still(script: CineScript | null): string
  /** 모션 그래픽 하나(.bk-cn)를 움직인다. 돌려준 함수를 부르면 멈추고 끝 모습으로 */
  play(el: HTMLElement, o: CinePlayOptions): () => void
  /** 엔진이 장을 움직이며 보내는 알림(mo-cine)을 받는다. 한 문서에 한 번 */
  listen(root: Document): void
  stats(): CineStats | null
}

export function cineMotion(kit: DrawKit): CineRuntime {
  const { TAU, clamp, lerp, rng } = kit
  const { out, reveal, carry } = kit.ease
  const camEase = kit.ease.camera

  /** 차분하게는 같은 안무를 이만큼의 시간에(docs/MOTION.md: 0.6~1.0배) */
  const CALM = 0.78
  /** 생동감의 되풀이: 다 맺히고 처음까지, 주기, 한 번의 길이(ms). 주기는 12초보다 길다(오래 보면 어지럽지 않게) */
  const LOOP = { first: 5000, period: 14000, len: 2600 }
  /** 카메라: 물러나기는 이 배율에서, 다가가기는 이 배율에서 1로 */
  const PULL = 1.2
  const PUSH = 0.93
  const smooth = (a: number, b: number, x: number) => {
    const t = clamp((x - a) / (b - a))
    return t * t * (3 - 2 * t)
  }

  // ======================================================================
  // 길(선, 물결): 칸을 0~1000으로 늘린 좌표. 멈춘 그림(SVG)과 캔버스가 같은 길을 긋는다
  // ======================================================================
  const PATH_Y = 560
  const pathX = (u: number) => u * 1000
  const pathY = (kind: string, u: number) => (kind === 'wave' ? PATH_Y + 64 * Math.sin(TAU * u * 1.25 + 0.4) * (0.55 + 0.45 * Math.sin(Math.PI * u)) : PATH_Y)
  const isPath = (s: CineScript) => s.shape === 'line' || s.shape === 'wave'

  function still(script: CineScript | null): string {
    if (!script || !script.line || !isPath(script)) return ''
    const n = script.shape === 'wave' ? 96 : 1
    let d = ''
    for (let i = 0; i <= n; i++) d += `${i ? 'L' : 'M'}${Math.round(pathX(i / n) * 10) / 10} ${Math.round(pathY(script.shape, i / n) * 10) / 10}`
    return `<path d="${d}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>`
  }

  // ======================================================================
  // 장면 하나: 잰 자리(geo)와 입자 표(Float32Array). 만든 뒤에는 값을 바꾸지 않는다
  // ======================================================================

  interface TextBox {
    cue: CineTextCue
    el: HTMLElement
    /** 칸(content) 안의 자리 [x, y, w, h] */
    box: number[]
    /** 줄마다 [x, y, w, h] (글 칸 안의 자리). 써지기와 한 글자씩 */
    lines: number[][]
    /** 한 글자씩: 줄마다 글자의 오른쪽 끝(글 칸 안의 x) */
    stops: number[][]
    /** 숫자 굴리기: 그 글 노드, 원래 글, 숫자의 자리 */
    count?: { node: Text; text: string; at: number; len: number; value: number; digits: number; comma: boolean }
  }

  interface Scene {
    s: CineScript
    /** 그리는 판의 크기(장 px)와 칸이 그 안에 놓인 자리 */
    W: number
    H: number
    ox: number
    oy: number
    cw: number
    ch: number
    /** 시작점(빛이 맺히는 곳, 펜이 떠나는 곳) */
    fx: number
    fy: number
    /** 모일 모양의 둘레(빛이 모이는 크기) */
    gr: number
    /** 모일 모양의 상자(되풀이의 띠가 지나는 곳) [x, y, w, h] */
    gb: number[]
    reach: number
    /** 모양을 딴 글자의 그림(또렷해질 때 번지는 빛) */
    img: { cv: HTMLCanvasElement; x: number; y: number; w: number; h: number } | null
    /** 갈래: 입자마다 몇째 갈래인지(-1은 갈래 없이 가운데 둘레), 갈래마다 [뻗는 각도, 길이, 휘는 몫] */
    arm: Int8Array
    arms: number[][]
    mode: 'burst' | 'scatter' | 'pen'
    N: number
    ang: Float32Array
    rad: Float32Array
    z: Float32Array
    size: Float32Array
    alpha: Float32Array
    tone: Float32Array
    delay: Float32Array
    bow: Float32Array
    ph: Float32Array
    w: Float32Array
    sx: Float32Array
    sy: Float32Array
    tx: Float32Array
    ty: Float32Array
    /** 길 위의 자리(0~1, 펜 모드) */
    pu: Float32Array
    texts: TextBox[]
    spans: Record<string, CineSpan | undefined>
    dark: boolean
  }

  const spanOf = (s: CineScript, kind: string) => s.spans.find((x) => x.kind === kind)

  /** 장(slide) 안의 px로 재는 배율: 화면에 줄여 그린 장(편집기, 목록)도 장의 1920 좌표로 */
  function zoomOf(slide: Element) {
    const r = slide.getBoundingClientRect()
    const w = (slide as HTMLElement).offsetWidth || 1920
    return r.width / w || 1
  }

  /** 글 칸 안의 글 노드들 */
  function textNodes(root: Node): Text[] {
    const list: Text[] = []
    const walk = root.ownerDocument!.createTreeWalker(root, 4)
    for (let n = walk.nextNode(); n; n = walk.nextNode()) if (/\S/.test(n.nodeValue || '')) list.push(n as Text)
    return list
  }

  /** 글자(한글은 음절, 결합 문자는 한 덩어리)마다의 자리. 화면의 px 그대로(getClientRects) */
  function graphemes(root: Node): { node: Text; at: number; len: number; text: string; r: DOMRect }[] {
    const out: { node: Text; at: number; len: number; text: string; r: DOMRect }[] = []
    const doc = root.ownerDocument!
    const range = doc.createRange()
    const Seg = (Intl as unknown as { Segmenter?: new (l: string, o: { granularity: string }) => { segment(t: string): Iterable<{ segment: string; index: number }> } }).Segmenter
    for (const node of textNodes(root)) {
      const t = node.nodeValue || ''
      const parts = Seg ? Array.from(new Seg('ko', { granularity: 'grapheme' }).segment(t)).map((p) => ({ s: p.segment, i: p.index })) : Array.from(t).reduce<{ s: string; i: number }[]>((a, s) => (a.push({ s, i: a.length ? a[a.length - 1].i + a[a.length - 1].s.length : 0 }), a), [])
      for (const p of parts) {
        if (!/\S/.test(p.s)) continue
        range.setStart(node, p.i)
        range.setEnd(node, p.i + p.s.length)
        const rs = range.getClientRects()
        if (rs.length && rs[0].width > 0) out.push({ node, at: p.i, len: p.s.length, text: p.s, r: rs[0] })
      }
    }
    range.detach?.()
    return out
  }

  /**
   * 글 칸의 글자를 그 글꼴로 화면 밖 캔버스에 그려 모양을 딴다. 글자마다 DOM이 놓은 자리에 그려서 줄바꿈, 자간, 글꼴이 화면과 같다.
   * 칸 좌표의 점 n개(늘 같은 씨앗으로 고른다)와 모양의 상자. 그릴 글자가 없으면 null
   */
  function sampleText(wrap: HTMLElement, n: number, R: () => number, at: (r: DOMRect) => number[], color: string) {
    const gs = graphemes(wrap)
    if (!gs.length) return null
    const field = (wrap.firstElementChild as HTMLElement | null) || wrap
    const cs = getComputedStyle(field)
    const font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
    const boxes = gs.map((g) => at(g.r))
    let x0 = Infinity
    let y0 = Infinity
    let x1 = -Infinity
    let y1 = -Infinity
    for (const b of boxes) {
      x0 = Math.min(x0, b[0])
      y0 = Math.min(y0, b[1])
      x1 = Math.max(x1, b[0] + b[2])
      y1 = Math.max(y1, b[1] + b[3])
    }
    x0 -= 8
    y0 -= 8
    x1 += 8
    y1 += 8
    const sc = Math.min(1, 420 / Math.max(1, x1 - x0, y1 - y0))
    const cv = document.createElement('canvas')
    cv.width = Math.max(1, Math.ceil((x1 - x0) * sc))
    cv.height = Math.max(1, Math.ceil((y1 - y0) * sc))
    const ctx = cv.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    ctx.scale(sc, sc)
    ctx.translate(-x0, -y0)
    ctx.font = font
    ctx.textBaseline = 'alphabetic'
    ctx.fillStyle = color
    gs.forEach((g, k) => {
      const m = ctx.measureText(g.text)
      const asc = m.fontBoundingBoxAscent || m.actualBoundingBoxAscent || 0.8 * parseFloat(cs.fontSize)
      const desc = m.fontBoundingBoxDescent || m.actualBoundingBoxDescent || 0.2 * parseFloat(cs.fontSize)
      const b = boxes[k]
      ctx.fillText(g.text, b[0], b[1] + (b[3] * asc) / (asc + desc))
    })
    const data = ctx.getImageData(0, 0, cv.width, cv.height).data
    const hits: number[] = []
    const step = cv.width * cv.height > 240000 ? 2 : 1
    for (let y = 0; y < cv.height; y += step) for (let x = 0; x < cv.width; x += step) if (data[(y * cv.width + x) * 4 + 3] > 110) hits.push(x, y)
    const m = hits.length / 2
    if (!m) return null
    const pts = new Float32Array(n * 2)
    // 고르게 뽑는다(정해진 씨앗으로 섞어 앞에서부터). 점이 모자라면 같은 화소를 화소 안에서 흔들어 다시 쓴다
    const order = new Uint32Array(m)
    for (let i = 0; i < m; i++) order[i] = i
    for (let i = 0; i < n; i++) {
      let j: number
      if (i < m) {
        const k = i + Math.floor(R() * (m - i))
        j = order[k]
        order[k] = order[i]
        order[i] = j
      } else j = order[Math.floor(R() * m)]
      pts[i * 2] = x0 + (hits[j * 2] + R() * step) / sc
      pts[i * 2 + 1] = y0 + (hits[j * 2 + 1] + R() * step) / sc
    }
    // 그린 글자는 남겨 둔다: 또렷해지는 순간 그 글자 모양 그대로 빛(먹)이 번졌다 가라앉는다(bloom)
    return { pts, box: [x0 + 8, y0 + 8, x1 - x0 - 16, y1 - y0 - 16], img: { cv, x: x0, y: y0, w: x1 - x0, h: y1 - y0 } }
  }

  /** 줄마다의 상자와 글자의 오른쪽 끝(글 칸 안의 자리) */
  function linesOf(wrap: HTMLElement, rel: (r: DOMRect) => number[]) {
    const lines: number[][] = []
    const stops: number[][] = []
    for (const g of graphemes(wrap)) {
      const b = rel(g.r)
      const cy = b[1] + b[3] / 2
      let k = lines.findIndex((l) => cy > l[1] && cy < l[1] + l[3])
      if (k < 0) {
        lines.push([b[0], b[1], b[2], b[3]])
        stops.push([])
        k = lines.length - 1
      } else {
        const l = lines[k]
        const r = Math.max(l[0] + l[2], b[0] + b[2])
        l[0] = Math.min(l[0], b[0])
        l[2] = r - l[0]
      }
      stops[k].push(b[0] + b[2])
    }
    const order = lines.map((_, i) => i).sort((a, b) => lines[a][1] - lines[b][1])
    return { lines: order.map((i) => lines[i]), stops: order.map((i) => stops[i].sort((a, b) => a - b)) }
  }

  /** 숫자 굴리기: 글 칸에서 첫 숫자(쉼표, 소수 포함)를 찾는다 */
  function countOf(wrap: HTMLElement): TextBox['count'] {
    for (const node of textNodes(wrap)) {
      const text = node.nodeValue || ''
      const m = /\d[\d,]*(\.\d+)?/.exec(text)
      if (!m) continue
      const raw = m[0].replace(/,/g, '')
      const value = parseFloat(raw)
      if (!Number.isFinite(value)) continue
      return { node, text, at: m.index, len: m[0].length, value, digits: m[1] ? m[1].length - 1 : 0, comma: m[0].includes(',') }
    }
    return undefined
  }

  /**
   * 장면을 만든다: 칸과 글의 자리를 재고, 입자 n개의 씨앗 값과 모일 자리를 정한다. 재는 동안에는 카메라를 잠깐 풀어 둔다
   * (배율이 걸린 채로 재면 글의 자리가 어긋난다)
   */
  function build(el: HTMLElement, s: CineScript, n: number, host: { x: number; y: number; w: number; h: number }, kz: number, dark: boolean, ink: string): Scene {
    const R = rng((s.seed * 7919 + 13) >>> 0)
    const er = el.getBoundingClientRect()
    const cw = el.offsetWidth || er.width / kz
    const ch = el.offsetHeight || er.height / kz
    const ox = -host.x
    const oy = -host.y
    /** 화면의 자리 → 판 좌표(그리는 캔버스의 장 px) */
    const toHost = (r: DOMRect) => [(r.left - er.left) / kz + ox, (r.top - er.top) / kz + oy, r.width / kz, r.height / kz]
    const spans: Scene['spans'] = {}
    for (const k of ['seed', 'spread', 'gather', 'resolve', 'write', 'pull']) spans[k] = spanOf(s, k)
    const texts: TextBox[] = []
    for (const cue of s.texts) {
      const wrap = el.querySelector<HTMLElement>(`[data-cn="${cue.key}"]`)
      if (!wrap || !/\S/.test(wrap.textContent || '')) continue
      const wr = wrap.getBoundingClientRect()
      const rel = (r: DOMRect) => [(r.left - wr.left) / kz, (r.top - wr.top) / kz, r.width / kz, r.height / kz]
      const tb: TextBox = { cue, el: wrap, box: toHost(wr), lines: [], stops: [] }
      if (cue.enter === 'write' || cue.enter === 'letters') Object.assign(tb, linesOf(wrap, rel))
      if (cue.enter === 'count') tb.count = countOf(wrap)
      texts.push(tb)
    }
    const shapeWrap = s.field ? el.querySelector<HTMLElement>(`[data-cn="${s.field}"]`) : null
    // 시작점: 큰 글자의 가운데, 가운데 짜임은 큰 글의 가운데, 선은 길의 시작
    const bigKey = s.frame === 'center' ? (s.field ?? (s.texts.some((t) => t.key === 'value') ? 'value' : 'title')) : 'glyph'
    const big = el.querySelector<HTMLElement>(`[data-cn="${bigKey}"]`)
    const bigBox = big && /\S/.test(big.textContent || '') ? toHost(big.getBoundingClientRect()) : null
    let fx = ox + cw * (s.frame === 'mark' ? 0.3 : 0.5)
    let fy = oy + ch * 0.5
    if (bigBox) {
      fx = bigBox[0] + bigBox[2] / 2
      fy = bigBox[1] + bigBox[3] / 2
    }
    const path = isPath(s)
    const P = (u: number) => [ox + (pathX(u) / 1000) * cw, oy + (pathY(s.shape, u) / 1000) * ch]
    if (path) [fx, fy] = P(0)
    const mode: Scene['mode'] = spans.spread ? 'burst' : path ? 'pen' : 'scatter'
    // 번지는 크기: 뒤에 모임이 있으면 장의 한가운데를 채울 만큼, 번짐으로 끝나면 장 끝 너머까지
    const far = Math.hypot(Math.max(fx, host.w - fx), Math.max(fy, host.h - fy))
    const reach = spans.gather ? Math.min(host.w, host.h) * 0.56 : far * 0.95
    const ang = new Float32Array(n)
    const rad = new Float32Array(n)
    const z = new Float32Array(n)
    const size = new Float32Array(n)
    const alpha = new Float32Array(n)
    const tone = new Float32Array(n)
    const delay = new Float32Array(n)
    const bow = new Float32Array(n)
    const ph = new Float32Array(n * 2)
    const w = new Float32Array(n * 2)
    const sx = new Float32Array(n)
    const sy = new Float32Array(n)
    const tx = new Float32Array(n)
    const ty = new Float32Array(n)
    const pu = new Float32Array(n)
    const share = s.tone === 'accent' ? 1 : s.tone === 'mix' ? 0.12 : 0
    // 갈래: 물에 떨어진 먹이 번질 때처럼 몇 가닥의 굽은 갈래로 뻗는다(고른 구름이면 화면 가득 모래 같은 점만 남았다, 필름).
    // 갈래는 모두 같은 쪽으로 조금 휘어서 번짐 전체가 천천히 도는 것으로 읽히고, 모일 때도 같은 쪽으로 감겨 든다. 많이 휘면
    // 나선 은하나 바람개비로 읽혔다(필름)
    const arms: number[][] = []
    const ARMS = 5
    const turn = R() * TAU
    // 갈래마다 각도, 길이, 휘는 몫, 굵기를 다르게: 고르게 나누면 눈송이나 꽃처럼 꾸민 무늬로 읽혔다(필름)
    for (let a = 0; a < ARMS; a++) arms.push([turn + ((a + (R() - 0.5) * 0.8) / ARMS) * TAU, 0.6 + 0.7 * R(), 0.45 + 0.6 * R(), 0.14 + 0.18 * R()])
    const arm = new Int8Array(n)
    const gauss = () => Math.sqrt(-2 * Math.log(1 - R() * 0.995)) * Math.cos(TAU * R())
    for (let i = 0; i < n; i++) {
      if (spans.gather && R() < 0.55) {
        // 갈래 위: 갈래의 각도 둘레에 좁게, 갈래를 따라(끝으로 갈수록 드물게)
        const a = Math.floor(R() * ARMS)
        arm[i] = a
        rad[i] = Math.min(1.5, 0.28 + Math.pow(R(), 1.2) * arms[a][1])
        // 갈래는 가운데의 덩어리에서 뻗어 나와 끝으로 갈수록 가늘어진다(가운데까지 가는 날이면 바람개비 무늬로 읽혔다, 필름)
        ang[i] = arms[a][0] + gauss() * arms[a][3] * (0.75 / (0.25 + rad[i]))
      } else {
        // 가운데 둘레: 가운데가 짙고 바깥으로 드문 분포(평면 정규분포의 반지름). 번짐으로 끝나는 장면은 갈래 없이 둥글게 번지되, 앞이
        // 고르지 않게(먹 얼룩의 가장자리처럼 몇 군데가 더 나간다): 갈래가 있으면 은하나 바람개비로 읽혔다(필름)
        arm[i] = -1
        ang[i] = R() * TAU
        // 번짐으로 끝나는 장면은 바깥 쪽에 더 많이: 번지는 앞(물결)이 두껍게 보여야 '퍼진다'가 3~5m에서도 읽힌다(가운데가 짙은 분포는
        // 장 가득 옅은 먼지로만 보였다, 필름)
        rad[i] = spans.gather ? Math.min(1.4, Math.sqrt(-2 * Math.log(1 - R() * 0.995)) * 0.34) : 0.22 + 0.95 * Math.pow(R(), 0.55)
        if (!spans.gather) rad[i] *= 1 + 0.07 * Math.sin(3 * ang[i] + turn) + 0.05 * Math.sin(7 * ang[i] + turn * 2.3)
      }
      z[i] = R()
      const near = (1 - z[i]) * s.depth
      const k = R()
      // 작은 입자가 많고 큰 입자는 드물게. 가까운 입자는 크고 옅다(초점 밖), 먼 입자는 작고 또렷하다
      size[i] = (0.8 + 1.7 * k * k * k) * s.size * (1 + near * 1.1)
      alpha[i] = (0.5 + 0.5 * R()) * (1 - near * 0.5)
      // 카메라 바로 앞의 몇 개: 크고 흐린 점(초점 밖)이 더 크게 움직여 깊이를 낸다
      if (i % 40 === 7 && s.depth > 0.2) {
        size[i] = (6 + 9 * R()) * s.size * s.depth
        alpha[i] = 0.16 + 0.12 * R()
        z[i] = 0
      }
      tone[i] = R() < share ? 1 : 0
      delay[i] = R()
      // 모일 때 휘는 몫: 모두 같은 쪽으로 휘어 소용돌이처럼 감겨 든다
      bow[i] = 0.35 + 0.5 * R()
      ph[i * 2] = R() * TAU
      ph[i * 2 + 1] = R() * TAU
      w[i * 2] = 0.5 + 0.9 * R()
      w[i * 2 + 1] = 0.5 + 0.9 * R()
      // 흩어진 자리: 판 전체, 가운데는 조금 비워서 '흩어져 있다'로 읽히게
      let px = R() * host.w
      let py = R() * host.h
      if (Math.abs(px - fx) < host.w * 0.18 && Math.abs(py - fy) < host.h * 0.18) {
        px = px < fx ? px - host.w * 0.18 : px + host.w * 0.18
      }
      sx[i] = px
      sy[i] = py
    }
    // 모일 자리
    let gb = bigBox ?? [fx - 80, fy - 80, 160, 160]
    let sampled = false
    let img: Scene['img'] = null
    if (s.shape === 'glyph' && shapeWrap) {
      const got = sampleText(shapeWrap, n, R, toHost, ink)
      if (got) {
        tx.set(got.pts.filter((_, j) => j % 2 === 0))
        ty.set(got.pts.filter((_, j) => j % 2 === 1))
        gb = got.box
        img = got.img
        sampled = true
      }
    }
    if (path) {
      for (let i = 0; i < n; i++) pu[i] = (i + R()) / n
      for (let i = 0; i < n; i++) {
        const [x, y] = P(pu[i])
        const g = Math.sqrt(-2 * Math.log(1 - R() * 0.99)) * Math.cos(TAU * R())
        tx[i] = x
        ty[i] = y + g * 2.2
      }
      gb = [ox, oy + (PATH_Y / 1000) * ch - 40, cw, 80]
    } else if (!sampled) {
      if (s.shape === 'point') {
        for (let i = 0; i < n; i++) {
          tx[i] = fx + Math.cos(ang[i]) * 3 * R()
          ty[i] = fy + Math.sin(ang[i]) * 3 * R()
        }
      } else {
        // 고리(글자로 모일 글이 없을 때도): 큰 글을 두르는 고리
        const rr = bigBox ? Math.max(bigBox[2], bigBox[3]) * 0.62 : Math.min(cw, ch) * 0.3
        for (let i = 0; i < n; i++) {
          const t = (i / n) * TAU + R() * 0.02
          const r = rr * (1 + 0.03 * Math.sqrt(-2 * Math.log(1 - R() * 0.99)) * Math.cos(TAU * R()))
          tx[i] = fx + Math.cos(t) * r
          ty[i] = fy + Math.sin(t) * r
          pu[i] = i / n
        }
        gb = [fx - rr, fy - rr, rr * 2, rr * 2]
      }
    }
    // 모이는 차례: 고리는 둘레를 따라, 나머지는 모일 자리에 가까운 것부터(가까운 입자가 먼저 닿아 모양이 안에서부터 차오른다)
    if (!path && spans.gather) {
      const t0 = spans.gather.start
      const d = new Float32Array(n)
      const scene0 = { mode, fx, fy, reach, ang, rad, z, ph, w, sx, sy, s, spans, arm, arms } as unknown as Scene
      const f = [0, 0]
      for (let i = 0; i < n; i++) {
        free(scene0, i, t0, f)
        d[i] = s.shape === 'ring' ? pu[i] : Math.hypot(f[0] - tx[i], f[1] - ty[i])
      }
      const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => d[a] - d[b])
      idx.forEach((i, r) => (delay[i] = 0.72 * (r / n) + 0.28 * delay[i]))
    }
    const gr = Math.max(40, Math.hypot(gb[2], gb[3]) / 2)
    return { s, W: host.w, H: host.h, ox, oy, cw, ch, fx, fy, gr, gb, reach, img, arm, arms, mode, N: n, ang, rad, z, size, alpha, tone, delay, bow, ph, w, sx, sy, tx, ty, pu, texts, spans, dark }
  }

  /** 구간 안에서의 진행(0~1). 구간이 없으면 없다(-1) */
  const prog = (sp: CineSpan | undefined, e: number) => (sp ? clamp((e - sp.start) / Math.max(1, sp.end - sp.start)) : -1)

  /** 모이기 전의 자리(번진 자리, 흩어진 자리, 펜 끝) */
  function free(c: Scene, i: number, e: number, o: number[]) {
    const t = e / 1000
    if (c.mode === 'burst') {
      const sp = c.spans.spread!
      // √t: 처음에 빠르게 터져 나가고 점점 느려진다(먹이 물에 번지는 꼴). 구간이 끝나도 아주 느리게 이어 번진다
      const k = Math.sqrt(clamp((e - sp.start) / Math.max(1, sp.end - sp.start) / 2.6) * 2.6)
      const seed = c.spans.seed ? prog(c.spans.seed, e) : 1
      // 맺힘 동안은 한 점 둘레의 작은 덩어리(고르게 같은 반지름이면 작은 고리로 보였다, 필름)
      const r = c.reach * c.rad[i] * k * (c.z[i] === 0 ? 1.45 : 1) + (3 + 10 * seed) * c.rad[i]
      // 갈래는 바깥으로 갈수록 휜 나선이고(처음부터 휘어 있다: 곧은 살은 금 간 유리처럼 보였다), 번짐 전체가 천천히 돈다(같은 쪽으로)
      const a = c.arm[i]
      const curl = a >= 0 ? c.arms[a][2] * c.rad[i] : 0
      const th = c.ang[i] + curl + 0.34 * Math.min(1.6, k)
      let dx = Math.cos(th) * r
      let dy = Math.sin(th) * r
      const form = c.s.spread
      if (form === 'side') {
        dx *= 1.65
        dy *= 0.45
      } else if (form === 'rise') {
        dx *= 0.85
        dy = dy * 0.5 - r * (0.45 + 0.45 * c.z[i])
      }
      // 번진 만큼 느리게 흔들리는 결
      const dm = 12 * Math.min(1.2, k) * (0.4 + c.z[i])
      o[0] = c.fx + dx + dm * Math.sin(c.w[i * 2] * t + c.ph[i * 2])
      o[1] = c.fy + dy + dm * Math.cos(c.w[i * 2 + 1] * t + c.ph[i * 2 + 1])
      return
    }
    if (c.mode === 'scatter') {
      o[0] = c.sx[i] + 10 * Math.sin(c.w[i * 2] * t + c.ph[i * 2])
      o[1] = c.sy[i] + 10 * Math.cos(c.w[i * 2 + 1] * t + c.ph[i * 2 + 1])
      return
    }
    o[0] = c.fx
    o[1] = c.fy
  }

  /** 펜 끝이 길 위의 어디까지 왔나(0~1): 힘을 모았다가 건너고 천천히 닿는다 */
  const penAt = (c: Scene, e: number) => (c.spans.gather ? carry(prog(c.spans.gather, e)) : 1)

  /**
   * 입자 하나의 그 때 모습: [x, y, 반지름, 짙기]. 시간의 순수 함수다(같은 e면 늘 같다)
   */
  function particle(c: Scene, i: number, e: number, o: number[]) {
    let a = c.alpha[i]
    let r = c.size[i]
    const G = c.spans.gather
    const RS = c.spans.resolve
    if (c.mode === 'pen') {
      // 펜 끝이 지나간 자리에서 튀어 나와 길 위로 내려앉는다
      const q = clamp((penAt(c, e) - c.pu[i]) / 0.07)
      if (q <= 0) {
        o[3] = 0
        return
      }
      const k = out(q)
      // 펜 끝에서 튀는 몫: 대부분은 선 가까이, 몇은 멀리(붓이 종이를 스칠 때의 튐)
      const side = Math.cos(c.ph[i * 2]) * (10 + 64 * c.rad[i] * c.rad[i])
      const back = -34 * Math.abs(Math.sin(c.ph[i * 2 + 1]))
      o[0] = c.tx[i] + back * (1 - k)
      o[1] = c.ty[i] + side * (1 - k)
      a *= smooth(0, 0.12, q)
      // 갓 튄 것은 크고 밝게, 내려앉으며 선의 굵기로(멀리서도 펜 끝이 무엇을 남기는지 보이게)
      r *= 1 + 0.9 * (1 - k)
    } else {
      free(c, i, e, o)
      if (c.mode === 'burst') {
        // 맺힘 동안은 거의 보이지 않다가(빛이 말한다) 번지며 드러나고, 번질수록 조금 옅어진다
        const seed = c.spans.seed ? prog(c.spans.seed, e) : 1
        const sp = prog(c.spans.spread, e)
        a *= smooth(0.35, 1, seed) * (1 - 0.3 * Math.min(1, sp)) * (1.15 - 0.45 * Math.min(1, c.rad[i]))
        // 번짐으로 끝나는 장면: 장 끝으로 나가며 사라진다(끝 모습에는 아무것도 남지 않는다)
        // 번짐으로 끝나는 장면: 번지는 앞(바깥 입자)이 밝고 안은 걷힌다. 퍼지는 물결로 읽혀야 '퍼진다'가 선다(고른 구름은 먼지로 읽혔다)
        if (!G) a *= (0.3 + 1.1 * smooth(0.2, 1.1, c.rad[i])) * (1 - smooth(0.62, 1, sp) * (0.6 + 0.4 * Math.min(1, c.rad[i])))
      } else if (c.mode === 'scatter') {
        // 흩어진 자리에서 하나씩 맺힌다
        const seed = c.spans.seed ? prog(c.spans.seed, e) : 1
        a *= smooth(c.delay[i] * 0.6, c.delay[i] * 0.6 + 0.4, seed)
      }
      if (G) {
        const len = Math.max(1, G.end - G.start)
        const lag = 0.3 * len
        const g = carry(clamp((e - G.start - c.delay[i] * lag) / (len - lag)))
        if (g > 0) {
          const fx = o[0]
          const fy = o[1]
          const tx = c.tx[i]
          const ty = c.ty[i]
          const L = Math.hypot(tx - fx, ty - fy) || 1
          const b = c.bow[i] * L * 0.3
          const cx = (fx + tx) / 2 - ((ty - fy) / L) * b
          const cy = (fy + ty) / 2 + ((tx - fx) / L) * b
          const u = 1 - g
          o[0] = u * u * fx + 2 * u * g * cx + g * g * tx
          o[1] = u * u * fy + 2 * u * g * cy + g * g * ty
          // 모일수록 또렷해진다
          // 모일수록 밝아진다(흩어진 먼지는 옅게, 모양에 닿은 것은 또렷하게): 모양이 먼지 속에서 떠올라야 '모였다'가 읽힌다
          a = lerp(a * 0.75, c.alpha[i] * 1.35, g)
          r *= 1 - 0.25 * g
        }
      }
    }
    if (RS && e > RS.start) {
      const pr = prog(RS, e)
      // 남은 떨림이 잦아들고, 입자는 작아지며 사라진다. 열에 하나 꼴은 먼지처럼 조금 떠올랐다 가라앉는다
      o[0] += Math.cos(c.ph[i * 2]) * 2.5 * (1 - pr)
      o[1] += Math.sin(c.ph[i * 2]) * 2.5 * (1 - pr)
      if (i % 11 === 0 && c.mode !== 'pen') {
        const q = out(clamp((e - RS.start) / Math.max(1, (RS.end - RS.start) * 1.9)))
        o[0] += Math.cos(c.ang[i]) * 34 * q
        o[1] += Math.sin(c.ang[i]) * 22 * q - 16 * q
        a *= 1 - q
      } else {
        // 또렷한 글자가 맺히는 만큼만 걷힌다(처음에는 천천히): 빨리 걷히면 입자 글자와 DOM 글자 사이에 글자가 거의 없는 한 박자가 생겼다(필름)
        a *= 1 - smooth(0.2, 0.95, pr)
      }
      r *= 1 - 0.35 * pr
    } else if (!RS && G && e > G.end) a *= 1 - clamp((e - G.end) / 400)
    o[2] = r
    o[3] = a
  }

  /**
   * 빛(어두운 바탕)이나 먹(밝은 바탕)의 세기와 크기: [세기 0~1, 반지름]. 한 점에서 번지는 장면은 맺힘에서 가장 밝고 번지며 흩어졌다가,
   * 모일수록 다시 모이고, 또렷해지는 순간 한 번 차올랐다 가라앉는다. 흩어진 것이 모이는 장면은 모일수록 모일 자리에서 밝아진다
   */
  function glow(c: Scene, e: number, o: number[]) {
    const { seed, spread, gather, resolve } = c.spans
    let I = 0
    let r = c.gr * 1.15
    if (c.mode === 'burst') {
      const ps = seed ? prog(seed, e) : 1
      I = seed ? out(ps) : 0
      r = 18 + 34 * ps
      if (spread && e > spread.start) {
        const p = prog(spread, e)
        const k = Math.sqrt(p)
        I = 1 - 0.74 * k
        r = 52 + c.reach * 0.3 * k
        // 번짐으로 끝나는 장면은 빛이 일찍 걷힌다: 가운데에 오래 남으면 그 위에 서는 숫자 뒤의 얼룩이 됐다
        if (!gather) I *= 1 - smooth(0.12, 0.55, p)
      }
      if (gather && e > gather.start) {
        // 모이는 동안 가운데 빛은 잦아든다: 빛은 입자를 따라 글자로 옮겨 가서 글자째 번진다(bloom). 가운데에 남기면 글자의 빈 속에 점이 떴다
        const g = carry(prog(gather, e))
        I = 0.26 * (1 - g)
        r = 52 + c.reach * 0.3
      }
    } else if (c.mode === 'scatter' && gather && e > gather.start) {
      const g = carry(prog(gather, e))
      I = 0.4 * g * g
    }
    if (c.mode !== 'pen' && resolve && e > resolve.start && !c.img) {
      const p = prog(resolve, e)
      I = (0.5 + 0.3 * Math.sin(Math.PI * Math.min(1, p * 1.8))) * Math.pow(1 - p, 1.6)
      r = c.gr * (0.95 + 0.25 * p)
    } else if (c.img && resolve && e > resolve.start) I = 0
    else if (!resolve && gather && e > gather.end) I *= 1 - clamp((e - gather.end) / 500)
    o[0] = c.mode === 'pen' ? 0 : I
    o[1] = r
  }

  /** 카메라 배율 */
  function zoom(s: CineScript, e: number) {
    if (s.camera === 'push') return lerp(PUSH, 1, camEase(clamp(e / Math.max(1, s.total))))
    if (s.camera !== 'pull') return 1
    const pl = s.spans.find((x) => x.kind === 'pull') ?? { start: s.total * 0.55, end: s.total }
    // 물러나기 전에도 아주 느리게 다가간다(멈춘 화면이 아니라 살아 있는 화면으로)
    if (e < pl.start) return PULL + 0.018 * clamp(e / Math.max(1, pl.start))
    return lerp(PULL + 0.018, 1, camEase(clamp((e - pl.start) / Math.max(1, pl.end - pl.start))))
  }

  // ======================================================================
  // 글의 들어오기(DOM): 투명도, 흐림, 가림(mask)만 쓴다. 자리를 다시 짜지 않는다
  // ======================================================================

  const MASK = ['mask-image', 'mask-size', 'mask-position', 'mask-repeat', '-webkit-mask-image', '-webkit-mask-size', '-webkit-mask-position', '-webkit-mask-repeat']

  /** 써지기와 한 글자씩의 펜 끝: 몇째 줄의 어디(글 칸 안 x, y). 다 쓰면 null */
  function writeEdge(t: TextBox, e: number): number[] | null {
    const lines = t.lines
    if (!lines.length) return null
    const p = clamp((e - t.cue.start) / Math.max(1, t.cue.end - t.cue.start))
    if (p <= 0 || p >= 1) return null
    const total = lines.reduce((m, l) => m + l[2], 0) || 1
    let left = reveal(p) * total
    for (let j = 0; j < lines.length; j++) {
      const l = lines[j]
      if (left <= l[2]) return [j, l[0] + left, l[1] + l[3] * 0.62]
      left -= l[2]
    }
    return null
  }

  function textAt(t: TextBox, e: number, lively: boolean) {
    const st = t.el.style
    const cue = t.cue
    const p = clamp((e - cue.start) / Math.max(1, cue.end - cue.start))
    if (cue.enter === 'settle') {
      const o = out(p)
      st.opacity = String(o)
      const b = (1 - o) * (lively ? 6 : 4)
      st.filter = b > 0.05 ? `blur(${b.toFixed(2)}px)` : ''
      return
    }
    if (cue.enter === 'count') {
      st.opacity = String(out(clamp(p * 3)))
      const c = t.count
      if (c) {
        const v = c.value * reveal(p)
        let s = v.toFixed(c.digits)
        if (c.comma) {
          const [a, b] = s.split('.')
          s = a.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (b ? `.${b}` : '')
        }
        const next = c.text.slice(0, c.at) + s + c.text.slice(c.at + c.len)
        if (c.node.nodeValue !== next) c.node.nodeValue = next
      }
      return
    }
    // 써지기, 한 글자씩: 줄마다 가림을 하나씩 두고, 펜 끝이 지나간 만큼 왼쪽부터 드러낸다
    if (p >= 1) {
      for (const k of MASK) st.removeProperty(k)
      st.opacity = ''
      return
    }
    st.opacity = '1'
    const lines = t.lines
    if (!lines.length) {
      st.opacity = String(out(p))
      return
    }
    const total = lines.reduce((m, l) => m + l[2], 0) || 1
    let left = reveal(p) * total
    const soft = Math.max(18, Math.min(64, (lines[0][3] || 40) * 0.9))
    const imgs: string[] = []
    const sizes: string[] = []
    const pos: string[] = []
    lines.forEach((l, j) => {
      const x = Math.max(0, Math.min(l[2], left))
      left -= l[2]
      // 줄 상자보다 조금만 넉넉하게: 가림을 크게 잡으면 앞줄의 가림이 다음 줄 글자의 윗부분을 먼저 드러냈다
      const y = l[1] - l[3] * 0.06
      const h = l[3] * 1.12
      let img: string
      if (x <= 0) img = 'linear-gradient(transparent,transparent)'
      else if (x >= l[2]) img = 'linear-gradient(#000,#000)'
      else if (cue.enter === 'letters') {
        // 한 글자씩: 지난 글자는 다 보이고, 펜 끝이 있는 글자 하나가 제자리에서 옅게부터 또렷해진다(쓸어 드러내지 않는다)
        const edge = l[0] + x
        let a = l[0]
        for (const r of t.stops[j]) if (r <= edge) a = r
        const b = t.stops[j].find((r) => r > edge) ?? l[0] + l[2]
        const f = smooth(0.15, 1, (edge - a) / Math.max(1, b - a)).toFixed(3)
        img = `linear-gradient(90deg,#000 ${Math.round(a)}px,rgba(0,0,0,${f}) ${Math.round(a)}px,rgba(0,0,0,${f}) ${Math.round(b)}px,transparent ${Math.round(b)}px)`
      } else img = `linear-gradient(90deg,#000 ${Math.round(l[0] + x - soft)}px,transparent ${Math.round(l[0] + x)}px)`
      imgs.push(img)
      sizes.push(`${Math.ceil(l[0] + l[2] + soft + 4)}px ${Math.ceil(h)}px`)
      pos.push(`0px ${Math.floor(y)}px`)
    })
    const img = imgs.join(',')
    st.setProperty('-webkit-mask-image', img)
    st.setProperty('mask-image', img)
    st.setProperty('-webkit-mask-size', sizes.join(','))
    st.setProperty('mask-size', sizes.join(','))
    st.setProperty('-webkit-mask-position', pos.join(','))
    st.setProperty('mask-position', pos.join(','))
    st.setProperty('-webkit-mask-repeat', 'no-repeat')
    st.setProperty('mask-repeat', 'no-repeat')
  }

  /** 들어오기 전의 글 칸: 아직 보이지 않게(첫 프레임부터. 끝 모습이 번쩍 보였다 사라지지 않게) */
  function hideText(el: HTMLElement) {
    el.style.opacity = '0'
  }

  function restoreText(t: TextBox | { el: HTMLElement; count?: TextBox['count'] }) {
    const st = t.el.style
    st.opacity = ''
    st.filter = ''
    for (const k of MASK) st.removeProperty(k)
    if (t.count && t.count.node.nodeValue !== t.count.text) t.count.node.nodeValue = t.count.text
  }

  // ======================================================================
  // 그리기: GPU(WebGL2 점)와 캔버스(2D)
  // ======================================================================

  interface Painter {
    mode: string
    draw(xs: Float32Array, n: number): void
    clear(): void
    dispose(): void
  }

  /**
   * WebGL2로 점을 그린다. 소프트웨어 GL(성능이 크게 떨어지는 GL)이면 null(캔버스로 그린다).
   * 점 하나는 가운데가 짙고 가장자리로 부드럽게 옅어지는 원. 어두운 바탕은 빛처럼 더하고, 밝은 바탕은 먹처럼 겹친다
   */
  function glPainter(cv: HTMLCanvasElement, dark: boolean, colors: number[][], q: number): Painter | null {
    const gl = cv.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, failIfMajorPerformanceCaveat: true, preserveDrawingBuffer: false }) as WebGL2RenderingContext | null
    if (!gl) return null
    const info = gl.getExtension('WEBGL_debug_renderer_info')
    const name = String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER))
    const lose = () => gl.getExtension('WEBGL_lose_context')?.loseContext()
    if (/swiftshader|llvmpipe|software|basic render/i.test(name)) {
      lose()
      return null
    }
    const vs = `#version 300 es
in vec2 p;in float s;in float a;in float t;
uniform vec2 res;uniform float k;
out float va;out float vt;
void main(){gl_Position=vec4(p.x/res.x*2.0-1.0,1.0-p.y/res.y*2.0,0.0,1.0);float d=s*k*2.6;gl_PointSize=max(1.6,d);va=a*min(1.0,d/1.6);vt=t;}`
    const fs = `#version 300 es
precision mediump float;
in float va;in float vt;uniform vec3 c0;uniform vec3 c1;out vec4 o;
void main(){vec2 q=gl_PointCoord*2.0-1.0;float r=dot(q,q);if(r>1.0)discard;float f=exp(-r*3.4)*(1.0-r*r);float al=va*f;o=vec4(mix(c0,c1,vt)*al,al);}`
    const sh = (type: number, src: string) => {
      const x = gl.createShader(type)!
      gl.shaderSource(x, src)
      gl.compileShader(x)
      return x
    }
    const prog = gl.createProgram()!
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, vs))
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fs))
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      lose()
      return null
    }
    gl.useProgram(prog)
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    const at = (name: string, size: number, off: number) => {
      const loc = gl.getAttribLocation(prog, name)
      gl.enableVertexAttribArray(loc)
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 20, off)
    }
    at('p', 2, 0)
    at('s', 1, 8)
    at('a', 1, 12)
    at('t', 1, 16)
    const u = (name: string) => gl.getUniformLocation(prog, name)
    gl.uniform3f(u('c0'), colors[0][0], colors[0][1], colors[0][2])
    gl.uniform3f(u('c1'), colors[1][0], colors[1][1], colors[1][2])
    gl.enable(gl.BLEND)
    if (dark) gl.blendFunc(gl.ONE, gl.ONE)
    else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    const res = u('res')
    const kq = u('k')
    return {
      mode: 'gl',
      draw(xs, n) {
        gl.viewport(0, 0, cv.width, cv.height)
        gl.clearColor(0, 0, 0, 0)
        gl.clear(gl.COLOR_BUFFER_BIT)
        gl.uniform2f(res, cv.width / q, cv.height / q)
        gl.uniform1f(kq, q)
        gl.bufferData(gl.ARRAY_BUFFER, xs.subarray(0, n * 5), gl.DYNAMIC_DRAW)
        gl.drawArrays(gl.POINTS, 0, n)
      },
      clear() {
        gl.clearColor(0, 0, 0, 0)
        gl.clear(gl.COLOR_BUFFER_BIT)
      },
      dispose: lose,
    }
  }

  /** 캔버스(2D)로 점을 그린다: 같은 짙기끼리 모아 한 번에 칠한다(drawKit의 canvasPaint) */
  function flatPainter(ctx: CanvasRenderingContext2D, dark: boolean, colors: string[], q: number): Painter {
    const P = kit.canvasPaint(ctx, colors, 1)
    return {
      mode: '2d',
      draw(xs, n) {
        ctx.save()
        ctx.setTransform(q, 0, 0, q, 0, 0)
        ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over'
        for (let i = 0; i < n; i++) {
          const a = xs[i * 5 + 3]
          if (a > 0.01) P.dot(xs[i * 5], xs[i * 5 + 1], xs[i * 5 + 2] * 0.9, xs[i * 5 + 4], a)
        }
        P.flush()
        ctx.restore()
      },
      clear() {},
      dispose() {},
    }
  }

  /** CSS 색 → [r, g, b] (0~1). 캔버스 하나로 읽어 rgb(), oklch(), color-mix() 무엇이든 */
  function rgbOf(css: string): number[] {
    const c = document.createElement('canvas')
    c.width = c.height = 1
    const x = c.getContext('2d', { willReadFrequently: true })
    if (!x) return [1, 1, 1]
    x.fillStyle = '#000'
    x.fillStyle = css
    x.fillRect(0, 0, 1, 1)
    const d = x.getImageData(0, 0, 1, 1).data
    return [d[0] / 255, d[1] / 255, d[2] / 255]
  }
  const rgbCss = (c: number[], a = 1) => `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${a})`

  // ======================================================================
  // 움직이기
  // ======================================================================

  let last: CineStats | null = null
  const running = new WeakMap<HTMLElement, () => void>()

  function play(el: HTMLElement, o: CinePlayOptions): () => void {
    running.get(el)?.()
    let script: CineScript | null = null
    try {
      script = JSON.parse(el.dataset.script || 'null') as CineScript | null
    } catch {
      script = null
    }
    const noop = () => {}
    if (!script || !Array.isArray(script.spans) || (o.level !== 'calm' && o.level !== 'lively') || typeof el.animate !== 'function') return noop
    const s = script
    const lively = o.level === 'lively'
    const k = (lively ? 1 : CALM) * (o.pace || 1)
    const at = Math.max(0, o.at || 0)
    const T = Math.max(1, s.total * k)
    // 시계: 아무것도 바꾸지 않는 움직임 하나. 엔진의 끝맺음, 모션 편집의 멈추기와 끌어 보기, 건너뛰기가 이 시계의 때만 맞춘다
    const clock = el.animate([{ opacity: 1 }, { opacity: 1 }], { duration: T, delay: at, easing: 'linear' })
    o.anims?.push(clock)
    const cam = el.querySelector<HTMLElement>('.bk-cn-cam')
    const still = el.querySelector<HTMLElement>('.bk-cn-still')
    const slide = el.closest('.slide') as HTMLElement | null
    const dark = !!slide?.classList.contains('is-dark')
    // 첫 프레임: 글 칸과 남는 선을 감추고 카메라를 처음 배율로(장을 넘기는 첫 프레임에는 이것만 한다)
    const wraps = s.texts.map((t) => el.querySelector<HTMLElement>(`[data-cn="${t.key}"]`)).filter((x): x is HTMLElement => !!x)
    wraps.forEach(hideText)
    if (still) still.style.visibility = 'hidden'
    const applyCam = (z: number, fx: number, fy: number, bleedEl: HTMLElement | null, bx: number, by: number) => {
      const tf = Math.abs(z - 1) < 1e-4 ? '' : `scale(${z.toFixed(5)})`
      if (cam) {
        cam.style.transformOrigin = `${fx}px ${fy}px`
        cam.style.transform = tf
      }
      if (bleedEl) {
        bleedEl.style.transformOrigin = `${fx + bx}px ${fy + by}px`
        bleedEl.style.transform = tf
      }
    }
    if (cam) applyCam(zoom(s, 0), el.offsetWidth * (s.frame === 'mark' ? 0.3 : 0.5), el.offsetHeight * 0.5, null, 0, 0)

    let scene: Scene | null = null
    let host: HTMLElement | null = null
    let back: CanvasRenderingContext2D | null = null
    let painter: Painter | null = null
    let xs: Float32Array | null = null
    let q = 1
    let n = 0
    let tier = 0
    let raf = 0
    let timer = 0
    let lastE = -1
    let lastNow = 0
    let ended = false
    let looping = false
    let loopAt = 0
    const stats: CineStats = { mode: '', count: 0, tier: 0, setup: 0, steps: [], frames: [] }
    last = stats
    const ink = { c: [1, 1, 1], a: [1, 1, 1], line: 'currentColor' }
    const tmp = [0, 0, 0, 0]
    let bx = 0
    let by = 0

    /**
     * 준비는 프레임마다 한 단계씩: 장을 넘기는 첫 프레임에는 아무것도 하지 않고(글을 감추는 것만 play가 했다), 다음 프레임에 자리를 재고
     * 2D 캔버스를, 그다음에 GPU 그리기를, 그다음에 글을 재고 입자를 만든다. 한 프레임에 다 하던 때는 CPU를 4배 느리게 한 시험에서
     * 그 프레임이 0.1초였다
     */
    let stage = 0
    let box = { x: 0, y: 0, w: 1, h: 1 }
    let kz = 1
    let front: HTMLCanvasElement | null = null
    /** 재는 동안에는 카메라를 푼다(배율이 걸린 채로 재면 글의 자리가 어긋난다) */
    const unzoom = () => {
      if (cam) cam.style.transform = ''
    }
    const setup = (): boolean | null => {
      const t0 = performance.now()
      if (!slide || !el.isConnected) return false
      const done = (v: boolean | null) => {
        stats.steps.push(performance.now() - t0)
        stats.setup += performance.now() - t0
        return v
      }
      if (stage === 0) {
        stage = 1
        return null
      }
      if (stage === 1) {
        stage = 2
        kz = zoomOf(slide)
        unzoom()
        const sr = slide.getBoundingClientRect()
        const er = el.getBoundingClientRect()
        bx = (er.left - sr.left) / kz
        by = (er.top - sr.top) / kz
        box = s.bleed ? { x: -bx, y: -by, w: slide.offsetWidth || 1920, h: slide.offsetHeight || 1080 } : { x: 0, y: 0, w: el.offsetWidth, h: el.offsetHeight }
        const cs = getComputedStyle(el)
        const accent = cs.getPropertyValue('--accent').trim() || cs.color
        ink.c = rgbOf(cs.color)
        ink.a = rgbOf(dark ? cs.getPropertyValue('--bold-accent').trim() || accent : accent)
        if (still) ink.line = getComputedStyle(still).color
        if (cam) applyCam(zoom(s, 0), el.offsetWidth * (s.frame === 'mark' ? 0.3 : 0.5), el.offsetHeight * 0.5, null, 0, 0)
        host = document.createElement('div')
        host.className = 'bk-cn-cv'
        host.setAttribute('aria-hidden', 'true')
        // 장 전체로 번지면 장의 맨 뒤(배경 다음)에, 아니면 칸 안 글의 뒤에
        if (s.bleed) {
          host.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;z-index:-1;pointer-events:none;'
          const bd = slide.querySelector(':scope > .s-bd')
          slide.insertBefore(host, bd ? bd.nextSibling : slide.firstChild)
        } else {
          host.style.cssText = 'position:absolute;inset:0;pointer-events:none;'
          ;(cam || el).insertBefore(host, (cam || el).firstChild)
        }
        const dpr = Math.min(1.5, window.devicePixelRatio || 1)
        const camMax = s.camera === 'pull' ? PULL + 0.02 : 1
        q = Math.min(kz * dpr * camMax, 1.5, Math.sqrt(2.4e6 / (box.w * box.h)))
        const mk = () => {
          const c = document.createElement('canvas')
          c.width = Math.max(1, Math.round(box.w * q))
          c.height = Math.max(1, Math.round(box.h * q))
          c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;'
          host!.appendChild(c)
          return c
        }
        back = mk().getContext('2d')
        front = mk()
        return done(back ? null : false)
      }
      if (stage === 2) {
        stage = 3
        // 그리기: GPU가 되면 입자를 다(4천~5천), 아니면 캔버스로 1500
        painter = o.gl === false ? null : glPainter(front!, dark, [ink.c, ink.a], q)
        if (!painter) {
          front!.remove()
          painter = flatPainter(back!, dark, [rgbCss(ink.c), rgbCss(ink.a)], q)
        }
        // 첫 그리기에서 GPU가 셰이더를 준비하느라 길어지지 않게 점 하나로 미리 그려 둔다
        painter.draw(new Float32Array(5), 1)
        painter.clear()
        n = painter.mode === 'gl' ? s.count : Math.min(1500, s.count)
        stats.mode = painter.mode
        stats.count = n
        return done(null)
      }
      unzoom()
      scene = build(el, s, n, box, kz, dark, rgbCss(ink.c))
      xs = new Float32Array(n * 5 * (s.trail && painter!.mode === 'gl' ? 3 : 1))
      if (cam) applyCam(zoom(s, 0), scene.fx - scene.ox, scene.fy - scene.oy, null, 0, 0)
      return done(true)
    }

    /** 뒤의 2D 캔버스: 빛이나 먹, 남는 선, 펜 끝 */
    const drawBack = (c: Scene, e: number) => {
      const x = back!
      x.setTransform(1, 0, 0, 1, 0, 0)
      x.clearRect(0, 0, x.canvas.width, x.canvas.height)
      x.setTransform(q, 0, 0, q, 0, 0)
      const g = [0, 0]
      if (s.light) {
        glow(c, e, g)
        const I = g[0]
        if (I > 0.004 && c.mode !== 'pen') {
          if (c.dark) {
            // 빛: 작은 심과 넓은 번짐. 세기의 상한은 엔진이 정한다(장의 글보다 밝지 않게)
            x.globalCompositeOperation = 'lighter'
            const rg = x.createRadialGradient(c.fx, c.fy, 0, c.fx, c.fy, g[1])
            const tint = s.tone === 'ink' ? ink.c : [lerp(ink.c[0], ink.a[0], 0.22), lerp(ink.c[1], ink.a[1], 0.22), lerp(ink.c[2], ink.a[2], 0.22)]
            rg.addColorStop(0, rgbCss(ink.c, 0.95 * I))
            rg.addColorStop(0.05, rgbCss(ink.c, 0.5 * I))
            rg.addColorStop(0.22, rgbCss(tint, 0.12 * I))
            rg.addColorStop(0.6, rgbCss(tint, 0.03 * I))
            rg.addColorStop(1, rgbCss(tint, 0))
            x.fillStyle = rg
            x.fillRect(c.fx - g[1], c.fy - g[1], g[1] * 2, g[1] * 2)
          } else {
            // 먹: 한 방울이 떨어져 번진다. 빛 번짐 없이 낮은 짙기의 얼룩만
            x.globalCompositeOperation = 'source-over'
            const drop = Math.min(1, I * 1.4)
            const rd = 5 + 7 * drop
            const stain = x.createRadialGradient(c.fx, c.fy, 0, c.fx, c.fy, g[1] * 0.8)
            stain.addColorStop(0, rgbCss(ink.c, 0.16 * I))
            stain.addColorStop(0.5, rgbCss(ink.c, 0.06 * I))
            stain.addColorStop(1, rgbCss(ink.c, 0))
            x.fillStyle = stain
            x.fillRect(c.fx - g[1], c.fy - g[1], g[1] * 2, g[1] * 2)
            const sp = c.spans.spread ? prog(c.spans.spread, e) : 0
            // 먹 한 방울은 한 점에서 번지는 장면에만(흩어진 것이 모이는 장면은 얼룩만 짙어진다)
            const da = c.mode === 'burst' ? 0.85 * drop * (1 - Math.sqrt(Math.max(0, sp))) : 0
            if (da > 0.01) {
              x.fillStyle = rgbCss(ink.c, da)
              x.beginPath()
              x.arc(c.fx, c.fy, rd, 0, TAU)
              x.fill()
            }
          }
        }
      }
      // 또렷해지는 순간: 모양을 딴 글자 그대로 빛이 번졌다 가라앉는다(어두운 바탕). 밝은 바탕은 먹이 번져 있다가 글자로 거두어진다
      const RS = c.spans.resolve
      const b0 = RS ? RS.start + (RS.end - RS.start) * 0.35 : 0
      if (c.img && RS && e > b0 && e < RS.end + 320) {
        // 또렷한 글자가 거의 맺힌 뒤에 그 둘레로 번진다: 맺히기 전에 번지면 글자 대신 흐린 회색 덩어리가 보였다(필름).
        // 어두운 바탕은 글자 둘레의 빛, 밝은 바탕은 글자 둘레로 배어 나온 먹이 다시 거두어진다
        const p = clamp((e - b0) / (RS.end + 320 - b0))
        const env = Math.sin(Math.PI * p)
        if (env > 0.01) {
          x.globalCompositeOperation = c.dark ? 'lighter' : 'source-over'
          // 글 한 줄(넓적한 모양)은 짧고 옅게: 오래 번지면 흐린 글이 몇 칸째 떠 있었다(필름)
          const wide = c.img.w > c.img.h * 2.2 ? 0.5 : 1
          x.globalAlpha = (c.dark ? 0.4 : 0.18) * env * wide
          x.filter = `blur(${Math.round((c.dark ? 14 - 6 * p : 10 * (1 - p) + 2) * (wide < 1 ? 0.6 : 1))}px)`
          x.drawImage(c.img.cv, c.img.x, c.img.y, c.img.w, c.img.h)
          x.filter = 'none'
          x.globalAlpha = 1
        }
      }
      x.globalCompositeOperation = 'source-over'
      // 길: 펜 끝이 지나간 만큼 가는 선이 남는다(끝 모습의 SVG와 같은 길, 같은 색, 같은 굵기)
      if (c.mode === 'pen') {
        const u = penAt(c, e)
        if (s.line && u > 0.002) {
          x.strokeStyle = ink.line
          x.lineWidth = 2
          x.lineCap = 'round'
          x.lineJoin = 'round'
          x.globalAlpha = smooth(0, 0.05, u)
          x.beginPath()
          const steps = Math.max(2, Math.ceil(u * (s.shape === 'wave' ? 96 : 1)))
          for (let i = 0; i <= steps; i++) {
            const uu = (u * i) / steps
            const px = c.ox + (pathX(uu) / 1000) * c.cw
            const py = c.oy + (pathY(s.shape, uu) / 1000) * c.ch
            if (i) x.lineTo(px, py)
            else x.moveTo(px, py)
          }
          x.stroke()
          x.globalAlpha = 1
        }
        // 펜 끝: 다 긋기 전까지만
        if (u > 0 && u < 1) pen(x, c, c.ox + (pathX(u) / 1000) * c.cw, c.oy + (pathY(s.shape, u) / 1000) * c.ch, 1 - smooth(0.92, 1, u))
      }
      // 넘겨주기: 모양이 맺힌 자리의 빛(먹)이 펜 끝이 되어 제목을 쓴다
      if (s.handoff && c.mode !== 'pen') {
        const tw = c.texts.find((t) => t.cue.enter === 'write' || t.cue.enter === 'letters')
        if (tw && tw.lines.length) {
          const ws = tw.cue.start
          const fly = 380 * (lively ? 1 : CALM)
          const l0 = tw.lines[0]
          const sx = c.gb[0] + c.gb[2] * 0.92
          const sy = c.fy
          const ex = tw.box[0] + l0[0]
          const ey = tw.box[1] + l0[1] + l0[3] * 0.62
          if (e > ws - fly && e < ws) {
            const p = carry(clamp((e - (ws - fly)) / fly))
            const lift = Math.sin(Math.PI * p) * -26
            pen(x, c, lerp(sx, ex, p), lerp(sy, ey, p) + lift, smooth(0, 0.25, p))
          } else {
            const edge = writeEdge(tw, e)
            if (edge) {
              const pw = clamp((e - tw.cue.start) / Math.max(1, tw.cue.end - tw.cue.start))
              pen(x, c, tw.box[0] + edge[1], tw.box[1] + edge[2], 1 - smooth(0.85, 1, pw))
            }
          }
        }
      }
    }

    /** 펜 끝: 어두운 바탕은 작은 빛, 밝은 바탕은 먹 한 점 */
    const pen = (x: CanvasRenderingContext2D, c: Scene, px: number, py: number, a: number) => {
      if (a <= 0.01) return
      if (c.dark && s.light) {
        x.globalCompositeOperation = 'lighter'
        const rg = x.createRadialGradient(px, py, 0, px, py, 34)
        rg.addColorStop(0, rgbCss(ink.c, 0.95 * a))
        rg.addColorStop(0.12, rgbCss(ink.c, 0.6 * a))
        rg.addColorStop(0.4, rgbCss(ink.c, 0.12 * a))
        rg.addColorStop(1, rgbCss(ink.c, 0))
        x.fillStyle = rg
        x.fillRect(px - 34, py - 34, 68, 68)
        x.globalCompositeOperation = 'source-over'
      } else {
        x.fillStyle = rgbCss(ink.c, 0.85 * a)
        x.beginPath()
        x.arc(px, py, 4.5, 0, TAU)
        x.fill()
      }
    }

    /** 입자를 버퍼에 채운다. 잔상은 조금 앞의 두 때를 옅고 작게(같은 순수 함수로 셈한다) */
    const fill = (c: Scene, e: number) => {
      const b = xs!
      let m = 0
      const count = tier ? n >> 1 : n
      const trails = s.trail && painter!.mode === 'gl' && !tier
      // 잔상은 빠르게 움직이는 동안(번짐의 처음, 모임)만 뜻이 있다
      const moving = trails && ((c.spans.gather && e > c.spans.gather.start && e < c.spans.gather.end + 200) || (c.spans.spread && e > c.spans.spread.start && e < c.spans.spread.start + 700))
      for (let i = 0; i < count; i++) {
        particle(c, i, e, tmp)
        if (tmp[3] <= 0.004) continue
        b[m * 5] = tmp[0]
        b[m * 5 + 1] = tmp[1]
        // 밝은 바탕의 먹 알갱이는 조금 크고 옅게: 작고 짙으면 먼지 티끌로 읽혔다(필름). 번짐으로 끝나는 장면(모일 곳이 없다)은 물결이
        // 주인공이라 조금 크고 짙게
        const wave = c.spans.gather ? 1 : 1.3
        b[m * 5 + 2] = (c.dark ? tmp[2] : tmp[2] * 1.7) * wave
        b[m * 5 + 3] = Math.min(1, tmp[3] * wave) * (c.dark ? 0.78 : 0.42)
        b[m * 5 + 4] = c.tone[i]
        m++
        if (moving && i % 2 === 0) {
          for (let g = 1; g <= 2; g++) {
            particle(c, i, e - g * 34, tmp)
            if (tmp[3] <= 0.004) continue
            b[m * 5] = tmp[0]
            b[m * 5 + 1] = tmp[1]
            b[m * 5 + 2] = tmp[2] * (1 - 0.15 * g)
            b[m * 5 + 3] = Math.min(1, tmp[3]) * (c.dark ? 0.78 : 0.42) * (g === 1 ? 0.42 : 0.18)
            b[m * 5 + 4] = c.tone[i]
            m++
          }
        }
      }
      return m
    }

    /** 생동감의 되풀이: 다 맺힌 뒤 드물게, 옅게 한 번 */
    const fillLoop = (c: Scene, p: number) => {
      const b = xs!
      let m = 0
      const env = Math.sin(Math.PI * p)
      if (c.mode === 'pen') {
        // 길 위로 작은 빛(먹)이 한 번 지나간다
        const u = carry(p)
        for (let j = 0; j < 8; j++) {
          const uu = Math.max(0, u - j * 0.012)
          b[m * 5] = c.ox + (pathX(uu) / 1000) * c.cw
          b[m * 5 + 1] = c.oy + (pathY(s.shape, uu) / 1000) * c.ch
          b[m * 5 + 2] = 2.6 - j * 0.2
          b[m * 5 + 3] = env * (c.dark ? 0.7 : 0.4) * (1 - j / 8)
          b[m * 5 + 4] = j ? 0 : 1
          m++
        }
        return m
      }
      if (!c.spans.gather) {
        // 번짐: 옅은 물결 하나가 다시 지나간다
        const f = c.reach * 1.3 * out(p)
        for (let i = 0; i < n; i += 3) {
          const d = c.reach * c.rad[i]
          const band = Math.exp(-(((d - f) / (c.reach * 0.12)) ** 2))
          if (band < 0.02) continue
          b[m * 5] = c.fx + Math.cos(c.ang[i]) * d
          b[m * 5 + 1] = c.fy + Math.sin(c.ang[i]) * d
          b[m * 5 + 2] = c.size[i] * 0.8
          b[m * 5 + 3] = band * env * 0.3 * (c.dark ? 0.62 : 0.34)
          b[m * 5 + 4] = c.tone[i]
          m++
        }
        return m
      }
      // 모인 모양 위로 옅은 띠가 왼쪽에서 오른쪽으로 한 번 지나간다(빛이 스치듯, 먹이 다시 배어나듯)
      const bw = Math.max(40, c.gb[2] * 0.16)
      const xb = c.gb[0] - bw + (c.gb[2] + bw * 2) * carry(p)
      for (let i = 0; i < n; i += 3) {
        const band = Math.exp(-(((c.tx[i] - xb) / bw) ** 2))
        if (band < 0.03) continue
        b[m * 5] = c.tx[i]
        b[m * 5 + 1] = c.ty[i] - 3 * band
        b[m * 5 + 2] = c.size[i] * 0.75
        b[m * 5 + 3] = band * env * 0.5 * (c.dark ? 0.62 : 0.34)
        b[m * 5 + 4] = c.tone[i]
        m++
      }
      return m
    }

    const applyDom = (c: Scene | null, e: number) => {
      if (c) {
        for (const t of c.texts) textAt(t, e, lively)
        applyCam(zoom(s, e), c.fx - c.ox, c.fy - c.oy, s.bleed ? host : null, bx, by)
      }
    }

    const frame = (now: number) => {
      raf = 0
      if (ended) return
      if (!el.isConnected) return end()
      if (!scene) {
        const ready = setup()
        if (ready === false) return end()
        if (ready === null) {
          raf = requestAnimationFrame(frame)
          return
        }
      }
      const c = scene!
      if (lastNow) {
        const dt = now - lastNow
        if (stats.frames.length < 600) stats.frames.push(dt)
        // 처음 30프레임이 느리면(p90 20ms 넘게) 입자를 절반으로, 잔상을 끈다. 한 번만
        if (!tier && stats.frames.length === 30) {
          const sorted = stats.frames.slice().sort((a, b) => a - b)
          if (sorted[Math.floor(sorted.length * 0.9)] > 20) tier = stats.tier = 1
        }
      }
      lastNow = now
      if (looping) {
        const tau = now - loopAt
        const k2 = tau < LOOP.first ? -1 : ((tau - LOOP.first) % LOOP.period) / LOOP.len
        if (k2 >= 0 && k2 < 1) {
          painter!.draw(xs!, fillLoop(c, k2))
          raf = requestAnimationFrame(frame)
        } else {
          painter!.clear()
          if (back) back.clearRect(0, 0, back.canvas.width, back.canvas.height)
          // 다음 되풀이까지는 그리지 않고 쉰다
          const wait = tau < LOOP.first ? LOOP.first - tau : LOOP.period - ((tau - LOOP.first) % LOOP.period)
          lastNow = 0
          timer = window.setTimeout(() => {
            timer = 0
            if (!ended) raf = requestAnimationFrame(frame)
          }, Math.max(16, wait - 20))
        }
        return
      }
      // 시계가 거둬졌으면(다른 움직임이 이 칸을 다시 걸었다) 그친다
      if (clock.playState === 'idle') return end()
      const ct = clock.currentTime
      const done = clock.playState === 'finished'
      const e = done ? s.total : clamp((Number(ct ?? 0) - at) / T) * s.total
      if (e !== lastE) {
        lastE = e
        drawBack(c, e)
        painter!.draw(xs!, fill(c, e))
        applyDom(c, e)
      }
      if (done) {
        // 다 맺혔다: 끝 모습(글, 남는 선)으로 돌리고, 생동감의 되풀이가 있으면 캔버스만 남겨 쉰다
        restoreAll()
        if (lively && s.loop) {
          looping = true
          loopAt = now
          painter!.clear()
          if (back) back.clearRect(0, 0, back.canvas.width, back.canvas.height)
          lastNow = 0
          timer = window.setTimeout(() => {
            timer = 0
            if (!ended) raf = requestAnimationFrame(frame)
          }, LOOP.first - 20)
          return
        }
        return end()
      }
      raf = requestAnimationFrame(frame)
    }

    const restoreAll = () => {
      for (const w of wraps) restoreText(scene?.texts.find((t) => t.el === w) ?? { el: w })
      if (cam) {
        cam.style.transform = ''
        cam.style.transformOrigin = ''
      }
      if (host) {
        host.style.transform = ''
        host.style.transformOrigin = ''
      }
      if (still) still.style.visibility = ''
    }

    function end() {
      if (ended) return
      ended = true
      if (raf) cancelAnimationFrame(raf)
      if (timer) clearTimeout(timer)
      restoreAll()
      painter?.dispose()
      host?.remove()
      if (scene?.img) scene.img.cv.width = scene.img.cv.height = 0
      xs = null
      scene = null
      running.delete(el)
    }

    o.skips?.push(() => {
      if (ended || looping || clock.playState === 'finished') return false
      clock.finish()
      return true
    })
    raf = requestAnimationFrame(frame)
    running.set(el, end)
    return end
  }

  function listen(root: Document) {
    const box = root as Document & { __cineListen?: boolean }
    if (box.__cineListen) return
    box.__cineListen = true
    root.addEventListener('mo-cine', (ev) => {
      const e = ev as CustomEvent<{ level?: string; at?: number; pace?: number; anims?: Animation[]; stops?: (() => void)[]; skips?: (() => boolean)[] }>
      const el = e.target as HTMLElement | null
      if (!el || !el.classList || !el.classList.contains('bk-cn')) return
      const d = e.detail || {}
      const stop = play(el, { level: d.level || 'none', at: d.at || 0, pace: d.pace, anims: d.anims, skips: d.skips })
      d.stops?.push(stop)
    })
  }

  return { still, play, listen, stats: () => last }
}

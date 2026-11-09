// 모션 그래픽(cine)의 엔진: 레시피의 대본(deck/cine.ts의 CineScript)을 읽어 한 장면을 그린다. 앱의 발표 화면, 모션 편집, 내보낸 HTML의
// 뷰어가 똑같이 쓴다. 기준은 docs/MOTION.md의 '모션 그래픽'이다.
//
// - 모든 움직임은 시간의 순수 함수다: 입자 하나의 자리, 크기, 짙기, 빛, 카메라, 글의 들어오기가 모두 '때 e'만으로 정해진다. 그래서
//   끌어 보기, 하나씩, 필름 띠, 멈춘 그림이 한 계산에서 나오고, 어느 때로 건너뛰어도 같은 그림이다. 시계는 Web Animations 하나(clock)라서
//   엔진의 끝맺음, 모션 편집의 멈추기와 끌어 보기, 발표하는 사람의 건너뛰기가 그 시계만 맞추면 된다.
// - 그리기는 셋: 입자는 WebGL2의 점(기본), 소프트웨어 GL이거나 GPU가 없으면 Canvas2D(입자 1500, 잔상 없음), 멈춘 그림은 SVG(남는 선만.
//   편집 화면, 목록, PDF, PPT, 내보낸 HTML의 처음 모습). 빛, 먹, 선, 펜 끝, 갈래, 물은 뒤의 2D 캔버스가 그린다. 이 버전이 모르는 재료
//   (더 새 버전의 것)는 다른 재료로 바꿔 그리지 않고 쉰다(글만 제 때에 맺힌다).
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
  /** 미리 그려 둔 다음 장의 글자 모양을 미리 딴다(한가할 때). 장을 넘기는 프레임에 글자를 따느라 첫 프레임이 늦지 않게 */
  prewarm(root: ParentNode): void
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
  const PULL = 1.1
  const PUSH = 0.93
  const smooth = (a: number, b: number, x: number) => {
    const t = clamp((x - a) / (b - a))
    return t * t * (3 - 2 * t)
  }

  // ======================================================================
  // 길(선, 물결): 칸을 0~1000으로 늘린 좌표. 멈춘 그림(SVG)과 캔버스가 같은 길을 긋는다
  // ======================================================================
  const PATH_Y = 600
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
    /** 건너오기: 앞 값(before)의 칸, 그 자리까지의 가로 거리(이 칸 기준 px), 앞 값의 숫자(굴러 오는 출발점), 앞 값을 벗어나는 때(0~1) */
    from?: { el: HTMLElement | null; dx: number; value: number | null; clear: number }
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
    /** 글자 모양을 땄는지(땄으면 맺히는 순간의 빛 대신 글자가 답이다) */
    shaped: boolean
    /** 지금 카메라 배율 - 1(입자의 시차: 가까운 입자는 카메라보다 더, 먼 입자는 덜 움직인다). 프레임마다 fill이 적는다 */
    cz: number
    /** 번지는 먹의 가장자리(wash): 굽이마다 [몇 번 굽나, 크기, 위상, 기어가는 빠르기] */
    edge: Float32Array
    /** 모여드는 가는 선(threads): 선마다 [처음 y, 닿을 y, 처음 가운데 x, 닿을 가운데 x, 처음 길이, 닿을 길이, 늦춤, 짙기] */
    threads: Float32Array
    /** 가는 선의 굵기(글자의 가로 줄 간격에 맞춘다) */
    threadW: number
    /** 갈래: 입자마다 몇째 갈래인지(-1은 갈래 없이 가운데 둘레), 갈래마다 [뻗는 각도, 길이, 휘는 몫] */
    arm: Int8Array
    arms: number[][]
    /** 뻗어 나가는 갈래(갈림길) */
    br: Branches | null
    /** 떨어져 모여 차오르는 물(차오름) */
    pool: Pool | null
    /** rest: 이 버전이 모르는 재료라 그리지 않고 쉰다 */
    mode: 'burst' | 'scatter' | 'pen' | 'wash' | 'threads' | 'branches' | 'pool' | 'rest'
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
    /** 고리 둘레의 자리(0~1): 고리로 모일 때 둘레를 따라 차례로 */
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
   * 모양 딴 것의 캐시: 같은 글, 같은 글꼴, 같은 크기면 같은 점들이다(글 칸 기준 좌표). 다음 장의 모양을 앞 장 동안 미리 따 두고(prewarm)
   * 장을 넘길 때는 꺼내 쓴다. 점은 정해진 씨앗으로 섞은 차례라 앞에서부터 n개를 쓰면 어느 수든 고르게 뽑은 것이다
   */
  /** 칸에 보이는 글이 있는지 */
  const filled = (w: Element | null): w is HTMLElement => !!w && /\S/.test(w.textContent || '')
  /** 모양을 딸 칸이 비었을 때 대신 주인공이 되는 칸의 차례 */
  const STAND_IN = ['title', 'value', 'text', 'lead', 'sub']

  /**
   * 모양을 딸 칸: 레시피의 칸(큰 글자 같은)이 비었으면 글이 있는 다음 칸이 주인공이 된다. 큰 글자를 비운 '빛에서 글자로'는 입자가 제목
   * 글줄로 모인다(빈 칸이면 입자가 빈 고리로 모였다가 사라지고 제목은 따로 써졌다). [모양을 딸 칸의 이름, 그 칸]
   */
  function shapeField(el: HTMLElement, s: CineScript): [string, HTMLElement] | null {
    if (s.shape !== 'glyph' || !s.field) return null
    const own = el.querySelector(`[data-cn="${s.field}"]`)
    if (filled(own)) return [s.field, own]
    for (const k of STAND_IN) {
      if (!s.texts.some((t) => t.key === k)) continue
      const w = el.querySelector(`[data-cn="${k}"]`)
      if (filled(w)) return [k, w]
    }
    return null
  }

  interface Shape {
    /** 점(입자가 모일 자리): 정해진 씨앗으로 섞은 차례 */
    pts: Float32Array
    /** 가로 줄(가는 선이 모일 자리): 줄마다 [왼쪽 x, 오른쪽 x, y] */
    runs: Float32Array
    /** 글자의 상자 [x, y, w, h] */
    box: number[]
  }
  const shapes = new Map<string, Shape>()
  const MAX_PTS = 5000
  function shapeKey(wrap: HTMLElement, kz: number) {
    const field = (wrap.firstElementChild as HTMLElement | null) || wrap
    const cs = getComputedStyle(field)
    const r = wrap.getBoundingClientRect()
    return `${wrap.textContent}|${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}|${cs.letterSpacing}|${Math.round(r.width / kz)}x${Math.round(r.height / kz)}`
  }
  /** 글 칸의 모양(글 칸 기준 좌표). 같은 글, 글꼴, 크기면 캐시에서 */
  function shapeOf(wrap: HTMLElement, kz: number): Shape | null {
    const key = shapeKey(wrap, kz)
    let got = shapes.get(key)
    if (!got) {
      const wr = wrap.getBoundingClientRect()
      const made = traceText(wrap, (r) => [(r.left - wr.left) / kz, (r.top - wr.top) / kz, r.width / kz, r.height / kz])
      if (!made) return null
      got = made
      if (shapes.size > 24) shapes.delete(shapes.keys().next().value!)
      shapes.set(key, got)
    }
    return got
  }

  /**
   * 글 칸의 글자를 그 글꼴로 화면 밖 캔버스에 그려 모양을 딴다. 글자마다 DOM이 놓은 자리에 그려서 줄바꿈, 자간, 글꼴이 화면과 같다.
   * 칸 좌표의 점(늘 같은 씨앗으로 섞는다), 가로 줄, 모양의 상자. 그릴 글자가 없으면 null
   */
  function traceText(wrap: HTMLElement, at: (r: DOMRect) => number[]): Shape | null {
    const R = rng(97)
    const n = MAX_PTS
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
    ctx.fillStyle = '#000'
    gs.forEach((g, k) => {
      const m = ctx.measureText(g.text)
      const asc = m.fontBoundingBoxAscent || m.actualBoundingBoxAscent || 0.8 * parseFloat(cs.fontSize)
      const desc = m.fontBoundingBoxDescent || m.actualBoundingBoxDescent || 0.2 * parseFloat(cs.fontSize)
      const b = boxes[k]
      ctx.fillText(g.text, b[0], b[1] + (b[3] * asc) / (asc + desc))
    })
    const data = ctx.getImageData(0, 0, cv.width, cv.height).data
    // 가로 줄: 글자 크기의 26분의 1 간격으로 글자를 가로질러 칠한 구간마다 하나(판화의 선처럼). 선이 모이면 그 줄들이 글자가 된다
    const fs = parseFloat(cs.fontSize) || 60
    const gap = Math.max(3, fs / 26) * sc
    const runs: number[] = []
    for (let y = gap / 2; y < cv.height; y += gap) {
      const row = Math.floor(y) * cv.width
      let x0r = -1
      for (let x = 0; x <= cv.width; x++) {
        const on = x < cv.width && data[(row + x) * 4 + 3] > 110
        if (on && x0r < 0) x0r = x
        else if (!on && x0r >= 0) {
          if (x - x0r >= 2) runs.push(x0 + x0r / sc, x0 + x / sc, y0 + y / sc)
          x0r = -1
        }
      }
    }
    const hits: number[] = []
    const step = cv.width * cv.height > 240000 ? 2 : 1
    for (let y = 0; y < cv.height; y += step) for (let x = 0; x < cv.width; x += step) if (data[(y * cv.width + x) * 4 + 3] > 110) hits.push(x, y)
    cv.width = cv.height = 0
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
    return { pts, runs: new Float32Array(runs), box: [x0 + 8, y0 + 8, x1 - x0 - 16, y1 - y0 - 16] }
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
   * 갈래(갈림길): 장 왼쪽 밖에서 들어온 줄기가 한 번 갈라져 안의 수(둘~넷)만큼의 갈래가 되고, 고른 안 하나만 끝까지 그어져 답의 첫머리에
   * 닿는다. 갈래는 3차 곡선을 표본 점으로 잘라 둔다(점마다 [x, y, 뿌리에서의 거리, 굵기]). 묶음 0은 고른 길(줄기, 고른 안, 답까지 이어지는
   * 끝), 1부터는 고르지 않은 안이다
   */
  interface Branches {
    pts: Float32Array
    /** 갈래마다 [첫 표본, 표본 수, 묶음] */
    segs: Int32Array
    /** 묶음마다 그 길의 끝(뿌리에서의 거리) */
    ends: number[]
    /** 갈라지는 자리, 고른 안이 고르기 전에 멈춘 자리, 답의 첫머리(모두 뿌리에서의 거리) */
    fork: number
    stop: number
    end: number
    /** 갈라진 자리의 둥근 이음매 [x, y, 반지름] */
    joint: number[]
  }

  /**
   * 갈래를 짠다. aim은 답의 글(주인공) 첫 줄의 왼쪽 끝(조금 띄운 자리)과 그 줄의 가운데 높이, band는 글이 설 띠 [왼, 위, 오른, 아래].
   * 갈래는 양 끝이 가로로 눕는 S자라 강물처럼 흐른다. 안의 수는 촘촘하기에 따라 둘, 셋, 넷: 열여섯 갈래로 거듭 갈라지던 시안은 퍼짐이나 자람(계통수)으로
   * 읽혀 '하나를 골랐다'가 서지 않았다(감성 검수)
   */
  function branchesOf(R: () => number, c: { ox: number; oy: number; cw: number; ch: number; W: number }, aim: number[], band: number[] | null, dense: number): Branches {
    const { oy, cw, ch } = c
    const K = 22
    const pts: number[] = []
    const segs: number[] = []
    const top = oy + ch * 0.06
    const [tx, ty] = aim
    const ph = R() * TAU
    /** 3차 곡선 하나를 K점으로(거리와 굵기도). 끝의 거리 */
    const bez = (p: number[], s0: number, w0: number, w1: number, g: number) => {
      const first = pts.length / 4
      let sd = s0
      let px = p[0]
      let py = p[1]
      for (let i = 0; i < K; i++) {
        const t = i / (K - 1)
        const u = 1 - t
        const x = u * u * u * p[0] + 3 * u * u * t * p[2] + 3 * u * t * t * p[4] + t * t * t * p[6]
        const y = u * u * u * p[1] + 3 * u * u * t * p[3] + 3 * u * t * t * p[5] + t * t * t * p[7]
        if (i) sd += Math.hypot(x - px, y - py)
        // 붓질처럼 굵기가 조금씩 오르내린다(고른 굵기는 그래프의 선으로 읽힌다)
        pts.push(x, y, sd, lerp(w0, w1, t) * (1 + 0.08 * Math.sin(sd * 0.017 + ph)))
        px = x
        py = y
      }
      segs.push(first, K, g)
      return sd
    }
    /** 양 끝이 가로로 눕는 S자 */
    const flow = (a: number[], b: number[], s0: number, w0: number, w1: number, g: number) => {
      const d = (b[0] - a[0]) * 0.46
      return bez([a[0], a[1], a[0] + d, a[1], b[0] - d, b[1], b[0], b[1]], s0, w0, w1, g)
    }
    const x0 = -30
    const L = Math.max(cw * 0.16, tx - x0)
    const n = dense === 0 ? 2 : dense === 2 ? 4 : 3
    // 갈림은 답의 줄보다 조금 위나 아래: 고른 안도 휘어 들어가 하나의 갈래로 보인다(곧으면 줄기가 조금 길어진 것으로 보였다, 필름)
    const y0 = ty + (R() < 0.5 ? -1 : 1) * ch * (0.07 + 0.03 * R())
    const F = [x0 + Math.min(L * 0.3, c.W * 0.06), y0]
    // 고른 안은 가운데: 답의 첫머리에서 멈췄다가(고르기 전), 고른 뒤 그 끝이 펜이 되어 답을 끝까지 써 나간다(답보다 멀리 가는 길은 없다).
    // 고르지 않은 안은 글 띠의 위와 아래로 휘어 답의 첫머리를 조금 지나서 멈춘다: 모든 안을 답의 첫머리 앞에서 멈추게 하던 시안은 장 왼쪽
    // 10%의 화살 깃 그림 문자로 읽혔고(필름), 장 가운데 너머까지 보내면 고른 안이 그 7분의 1인 곁가지라 '작은 샛길을 골랐다'로 읽혔다(감성 검수).
    // 안들은 같은 굵기로 같은 무게다
    const fork = flow([x0, y0], F, 0, 15, 13, 0)
    const end = flow(F, [tx, ty], fork, 12.5, 9.5, 0)
    const stop = end
    const ends = [end]
    const bt = band ? band[1] - 50 : ty - ch * 0.16
    const bb = band ? band[3] + 50 : ty + ch * 0.16
    const others = n - 1
    let up = others === 1 ? (R() < 0.5 ? 1 : 0) : Math.ceil(others / 2)
    if (others === 3 && R() < 0.5) up = 1
    for (let k = 0, g = 1; k < others; k++) {
      const upper = k < up
      const j = upper ? k : k - up
      const m = upper ? up : others - up
      // 위는 글 띠 위의 자리를, 아래는 글 띠 아래의 자리를 고르지 않게 나눠 갖는다(거울에 비친 꼴이 되지 않게)
      const f = (j + 0.35 + 0.3 * R()) / m
      const y = upper ? lerp(bt, top, f) : lerp(bb, oy + ch * 0.92, f)
      const x = tx + c.W * (0.07 + 0.05 * R()) + (upper ? 0 : c.W * 0.03)
      ends.push(flow(F, [x, y], fork, 12.5, 7, g++))
    }
    return { pts: new Float32Array(pts), segs: new Int32Array(segs), ends, fork, stop, end, joint: [F[0], F[1], 6.5] }
  }

  /**
   * 물(차오름): 장의 위에서 물방울이 하나씩 떨어져 아래에 고인 물로 들어가고, 들어간 만큼 물이 차오른다(작은 것이 모여 이만큼이 됐다).
   * 수위는 숫자 굴리기와 같은 곡선(reveal)이라 차오른 높이와 숫자가 움직이는 동안에도 같은 값을 말한다. 물방울은 그 곡선이 오르는
   * 빠르기만큼 떨어진다: 처음에는 소나기처럼 잦고 끝으로 갈수록 드문드문, 마지막 몇 방울은 하나씩 보인다. 물방울은 글 칸의 옆에서만
   * 떨어져 글 위를 지나지 않는다. 물방울이 닿은 자리에서 잔물결이 양옆으로 퍼지며 잦아든다(시간의 순수 함수: 닿은 때와 자리만 안다)
   */
  interface Pool {
    /** 물방울마다 [x, 닿는 때, 떨어지기 시작하는 높이, 떨어지는 시간, 물결 세기] */
    drops: Float32Array
    n: number
    /** 바닥(장 아래 끝 너머), 다 찬 수위, 물이 찰 가로 범위 */
    base: number
    full: number
    x0: number
    x1: number
    /** 숫자 굴리기의 때 [시작, 끝] */
    win: number[]
  }
  const DROP = 5

  function poolOf(R: () => number, c: { ox: number; oy: number; cw: number; ch: number; W: number; H: number }, band: number[] | null, win: number[], dense: number): Pool {
    const x0 = Math.min(0, c.ox) - 20
    const x1 = Math.max(c.W, c.ox + c.cw) + 20
    const base = Math.max(c.H, c.oy + c.ch) + 24
    // 다 찬 수위: 글 띠 바로 아래(글이 물에 잠기지 않는다)
    const full = band ? Math.min(base - 80, band[3] + 40) : c.oy + c.ch * 0.72
    const [c0, c1] = win
    const inv = (q: number) => {
      let lo = 0
      let hi = 1
      for (let j = 0; j < 22; j++) {
        const m = (lo + hi) / 2
        if (reveal(m) < q) lo = m
        else hi = m
      }
      return (lo + hi) / 2
    }
    const n = dense === 0 ? 18 : dense === 2 ? 52 : 32
    // 글 칸 옆의 두 기둥에서만 떨어진다(글 칸 둘레를 띄워)
    const gl = band ? band[0] - 60 : c.ox + c.cw * 0.3
    const gr = band ? band[2] + 60 : c.ox + c.cw * 0.7
    const L = Math.max(0, gl - (c.ox + c.cw * 0.04))
    const Rw = Math.max(0, c.ox + c.cw * 0.96 - gr)
    const drops = new Float32Array(n * DROP)
    for (let j = 0; j < n; j++) {
      const o = j * DROP
      const u = R() * (L + Rw)
      drops[o] = u < L ? c.ox + c.cw * 0.04 + u : gr + (u - L)
      // j번째 방울이 닿는 때: 수위(숫자)가 (j+0.5)/n만큼 오른 때. 조금씩 흩어 고른 박자가 되지 않게
      drops[o + 1] = c0 + (c1 - c0) * inv(Math.min(1, (j + 0.3 + 0.4 * R()) / n))
      drops[o + 2] = c.oy + c.ch * (0.02 + 0.2 * R())
      drops[o + 3] = 300 + 160 * R()
      // 큰 방울은 드물게(모두 같은 세기면 고른 빗소리 무늬가 된다)
      drops[o + 4] = 0.55 + 0.9 * R() * R()
    }
    return { drops, n, base, full, x0, x1, win }
  }

  /** 글이 설 띠: 글이 있는 모든 글 칸을 두른 상자 [왼, 위, 오른, 아래](판 좌표). 글 칸이 없으면 null */
  function bandOf(texts: TextBox[]): number[] | null {
    let band: number[] | null = null
    for (const t of texts) {
      const b = t.box
      band = band ? [Math.min(band[0], b[0]), Math.min(band[1], b[1]), Math.max(band[2], b[0] + b[2]), Math.max(band[3], b[1] + b[3])] : [b[0], b[1], b[0] + b[2], b[1] + b[3]]
    }
    return band
  }

  /**
   * 장면을 만든다: 칸과 글의 자리를 재고, 입자 n개의 씨앗 값과 모일 자리를 정한다. 재는 동안에는 카메라를 잠깐 풀어 둔다
   * (배율이 걸린 채로 재면 글의 자리가 어긋난다)
   */
  function build(el: HTMLElement, s: CineScript, n: number, host: { x: number; y: number; w: number; h: number }, kz: number, dark: boolean, lively: boolean): Scene {
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
    const shaped = shapeField(el, s)
    // 대신 주인공이 된 칸은 비운 칸의 때에 제자리에서 맺힌다(입자가 그 글줄로 모인 뒤에): 펜이 다시 쓰면 모인 글자를 한 번 더 그리게 된다
    const standIn = shaped && shaped[0] !== s.field ? s.texts.find((t) => t.key === s.field) : undefined
    for (const raw of s.texts) {
      const cue: CineTextCue =
        standIn && raw.key === shaped![0]
          ? { ...raw, enter: 'settle', start: standIn.start, end: standIn.end, ...(raw.accent !== undefined ? { accent: standIn.end + raw.accent - raw.end } : {}) }
          : raw
      const wrap = el.querySelector<HTMLElement>(`[data-cn="${cue.key}"]`)
      if (!wrap || !/\S/.test(wrap.textContent || '')) continue
      const wr = wrap.getBoundingClientRect()
      const rel = (r: DOMRect) => [(r.left - wr.left) / kz, (r.top - wr.top) / kz, r.width / kz, r.height / kz]
      const tb: TextBox = { cue, el: wrap, box: toHost(wr), lines: [], stops: [] }
      if (cue.enter === 'write' || cue.enter === 'letters') Object.assign(tb, linesOf(wrap, rel))
      if (cue.enter === 'count' || cue.enter === 'carry') tb.count = countOf(wrap)
      if (cue.enter === 'carry') {
        // 건너오기: 앞 값의 자리에서 떠나 앞 값의 숫자에서 굴러 온다
        const bw = el.querySelector<HTMLElement>('[data-cn="before"]')
        const bc = bw && /\S/.test(bw.textContent || '') ? countOf(bw) : undefined
        const dx = bw ? (bw.getBoundingClientRect().left - wr.left) / kz : -cw * 0.6
        tb.from = { el: bw, dx, value: bc ? bc.value : null, clear: bw ? clamp((bw.getBoundingClientRect().width / kz + 72) / Math.max(1, Math.abs(dx))) : 0.2 }
      }
      texts.push(tb)
    }
    const shapeWrap = shaped ? shaped[1] : null
    // 시작점: 큰 글자의 가운데, 가운데 짜임은 큰 글의 가운데, 선은 길의 시작. 큰 글자를 비웠으면 대신 주인공이 된 칸의 가운데
    const bigKey = standIn ? shaped![0] : s.frame === 'center' ? (s.field ?? (s.texts.some((t) => t.key === 'value') ? 'value' : 'title')) : 'glyph'
    const big = el.querySelector<HTMLElement>(`[data-cn="${bigKey}"]`)
    const bigBox = big && /\S/.test(big.textContent || '') ? toHost(big.getBoundingClientRect()) : null
    let fx = ox + cw * (s.frame === 'mark' ? 0.3 : 0.5)
    let fy = oy + ch * 0.5
    if (bigBox) {
      fx = bigBox[0] + bigBox[2] / 2
      fy = bigBox[1] + bigBox[3] / 2
    }
    const path = s.material === 'line' && isPath(s)
    const P = (u: number) => [ox + (pathX(u) / 1000) * cw, oy + (pathY(s.shape, u) / 1000) * ch]
    if (path) [fx, fy] = P(0)
    const mode: Scene['mode'] =
      s.material === 'wash' || s.material === 'threads' || s.material === 'branches' || s.material === 'pool' || s.material === 'rest' ? s.material : s.material === 'line' ? 'pen' : spans.spread ? 'burst' : 'scatter'
    // 번지는 크기: 뒤에 모임이 있으면 장의 한가운데를 채울 만큼, 번짐으로 끝나면 장 끝 너머까지
    const far = Math.hypot(Math.max(fx, host.w - fx), Math.max(fy, host.h - fy))
    // 모이기 전의 구름은 장의 한쪽에 머물게(장 절반을 덮으면 흰 바탕에서 그을음으로 읽혔다, 감성 검수). 차분하게는 같은 안무의 작은 판
    const reach = (spans.gather ? Math.min(host.w, host.h) * 0.38 : far * 1.05) * (lively || !spans.gather ? 1 : 0.85)
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
      // 흩어진 자리: 판 전체, 모일 자리 가까이로 갈수록 성기게(둥글고 부드럽게). 네모를 비우던 때는 가운데에 빈 상자가 버그처럼 보였다(검수)
      let px = R() * host.w
      let py = R() * host.h
      for (let t = 0; t < 4; t++) {
        const d = Math.hypot((px - fx) / host.w, (py - fy) / host.h)
        if (R() < smooth(0.04, 0.3, d)) break
        px = R() * host.w
        py = R() * host.h
      }
      sx[i] = px
      sy[i] = py
    }
    // 모일 자리
    let gb = bigBox ?? [fx - 80, fy - 80, 160, 160]
    let sampled = false
    const traced = shapeWrap && s.shape === 'glyph' && (n || mode === 'threads') ? shapeOf(shapeWrap, kz) : null
    const [wx, wy] = shapeWrap ? toHost(shapeWrap.getBoundingClientRect()) : [0, 0]
    if (n && traced) {
      const got = traced
      {
        // 글 칸 기준의 점을 판 좌표로
        for (let i = 0; i < n; i++) {
          tx[i] = wx + got.pts[(i * 2) % got.pts.length]
          ty[i] = wy + got.pts[(i * 2 + 1) % got.pts.length]
        }
        gb = [wx + got.box[0], wy + got.box[1], got.box[2], got.box[3]]
        sampled = true
        // 대신 주인공이 된 글줄은 칸보다 짧다: 빛은 칸의 가운데가 아니라 글자의 가운데에서 맺힌다
        if (standIn) {
          fx = gb[0] + gb[2] / 2
          fy = gb[1] + gb[3] / 2
        }
      }
    }
    // 그어지는 선은 입자 없이 선과 글로 그린다(모일 자리가 없다): 상자는 선 둘레
    if (path) gb = [ox, oy + (PATH_Y / 1000) * ch - 40, cw, 80]
    else if (!sampled) {
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
    // 번지는 먹의 가장자리: 둥글지만 고르지 않은 테두리(굽이 몇 개를 겹친다). 고르게 둥글면 원 도형으로, 갈래로 뻗으면 꽃잎 무늬로 읽혔다(필름)
    const edge = new Float32Array(s.material === 'wash' ? 5 * 4 : 0)
    ;[3, 5, 7, 11, 17].forEach((k, h) => {
      if (!edge.length) return
      edge[h * 4] = k
      edge[h * 4 + 1] = (0.07 / Math.sqrt(k / 3)) * (0.6 + 0.8 * R())
      edge[h * 4 + 2] = R() * TAU
      edge[h * 4 + 3] = (R() - 0.5) * 0.5
    })
    // 모여드는 가는 선: 장 밖 왼쪽과 오른쪽, 여러 높이에서 건너와 글자를 가로지르는 줄 하나하나에 내려앉는다. 다 닿으면 판화처럼 가는 줄로 그린
    // 글자가 되고, 그 자리에서 글이 맺힌다. 글이 없으면 글이 설 띠에 가지런히 모인다
    let runs = traced && traced.runs.length ? traced.runs : null
    let threadW = 1.2
    if (mode === 'threads' && !runs) {
      const tb0 = bigBox ?? [fx - cw * 0.25, fy - 40, cw * 0.5, 80]
      const list: number[] = []
      for (let y = tb0[1] + 6; y < tb0[1] + tb0[3]; y += 6) {
        const half = tb0[2] * (0.2 + 0.3 * R())
        const cx = tb0[0] + tb0[2] / 2 + (R() - 0.5) * (tb0[2] - half * 2)
        list.push(cx - half - wx, cx + half - wx, y - wy)
      }
      runs = new Float32Array(list)
    } else if (runs && shapeWrap) {
      const fs = parseFloat(getComputedStyle((shapeWrap.firstElementChild as HTMLElement | null) || shapeWrap).fontSize) || 60
      threadW = Math.max(1.2, (fs / 26) * 0.55)
    }
    const K = mode === 'threads' && runs ? runs.length / 3 : 0
    const threads = new Float32Array(K * 8)
    for (let k = 0; k < K; k++) {
      const side = R() < 0.5 ? -1 : 1
      const y1 = wy + runs![k * 3 + 2]
      const y0 = y1 + (R() - 0.5) * ch * 0.5
      const len0 = host.w * (0.1 + 0.3 * R())
      const len1 = runs![k * 3 + 1] - runs![k * 3]
      threads[k * 8] = y0
      threads[k * 8 + 1] = y1
      threads[k * 8 + 2] = side < 0 ? -len0 * 0.2 - R() * host.w * 0.08 : host.w + len0 * 0.2 + R() * host.w * 0.08
      threads[k * 8 + 3] = wx + (runs![k * 3] + runs![k * 3 + 1]) / 2
      threads[k * 8 + 4] = len0
      threads[k * 8 + 5] = len1
      // 늦춤: 먼 높이에서 오는 선일수록, 그리고 조금씩 섞어서(한꺼번에 닿으면 막이 내리듯 읽혔다)
      threads[k * 8 + 6] = 0.38 * (0.35 * Math.min(1, Math.abs(y0 - y1) / ch) + 0.65 * R())
      threads[k * 8 + 7] = 0.75 + 0.25 * R()
    }
    // 촘촘하기(손잡이): 갈래의 깊이, 낱장의 두께
    const dense = s.count >= 5000 ? 2 : s.count <= 1500 ? 0 : 1
    let br: Branches | null = null
    if (mode === 'branches') {
      // 남는 길이 닿을 곳: 답(주인공 글)의 첫 줄 왼쪽 끝을 조금 띄운 자리, 그 줄의 가운데 높이(글의 첫머리로 흘러 든다). 가운데에 닿게
      // 하던 시안은 남는 길이 글 아래를 지나야 해서, 답이 맺히기 전까지 홀로 선 물결 밑줄로 읽혔다(필름). 글이 없으면 칸의 가운데 왼쪽
      const hero = texts.find((t) => t.cue.key === bigKey)
      let aim = [fx - cw * 0.12, fy]
      if (hero) {
        const hr = hero.el.getBoundingClientRect()
        const l0 = linesOf(hero.el, (r) => [(r.left - hr.left) / kz, (r.top - hr.top) / kz, r.width / kz, r.height / kz]).lines[0]
        if (l0) aim = [hero.box[0] + l0[0] - 30, hero.box[1] + l0[1] + l0[3] * 0.55]
      }
      br = branchesOf(R, { ox, oy, cw, ch, W: host.w }, aim, bandOf(texts), dense)
    }
    let pool: Pool | null = null
    if (mode === 'pool') {
      // 숫자 굴리기와 같은 때(숫자가 없으면 모임 구간)
      const cue = texts.find((t) => t.cue.enter === 'count')?.cue
      const win = cue ? [cue.start, cue.end] : spans.gather ? [spans.gather.start, spans.gather.end] : [0, s.total * 0.6]
      // 물방울은 글이 설 띠의 옆으로만, 물은 그 아래까지
      pool = poolOf(R, { ox, oy, cw, ch, W: host.w, H: host.h }, bandOf(texts), win, dense)
    }
    return { s, W: host.w, H: host.h, ox, oy, cw, ch, fx, fy, gr, gb, reach, shaped: sampled, cz: 0, edge, threads, threadW, arm, arms, br, pool, mode, N: n, ang, rad, z, size, alpha, tone, delay, bow, ph, w, sx, sy, tx, ty, pu, texts, spans, dark }
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
    // 깊이: 가까운 입자는 초점 밖이라 흐리고, 먼 입자는 또렷하다. 모양에 내려앉을수록 모두 초점 안으로
    let soft = c.z[i] === 0 ? 1 : Math.min(1, (1 - c.z[i]) ** 2 * c.s.depth * 1.5)
    let land = 0
    const G = c.spans.gather
    const RS = c.spans.resolve
    {
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
          land = g
          soft *= 1 - g
        }
      }
    }
    if (RS && e > RS.start) {
      const pr = prog(RS, e)
      // 남은 떨림이 잦아들고, 입자는 작아지며 사라진다. 열에 하나 꼴은 먼지처럼 조금 떠올랐다 가라앉는다
      o[0] += Math.cos(c.ph[i * 2]) * 2.5 * (1 - pr)
      o[1] += Math.sin(c.ph[i * 2]) * 2.5 * (1 - pr)
      if (i % 11 === 0) {
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
    if (c.cz && land < 1) {
      // 시차: 카메라가 움직이는 동안 가까운 입자는 카메라보다 더, 먼 입자는 덜 움직인다(내려앉은 입자는 글자에 붙어 있다)
      const k = 1 + c.cz * (1.1 * (1 - c.z[i]) - 0.35) * (1 - land)
      o[0] = c.fx + (o[0] - c.fx) * k
      o[1] = c.fy + (o[1] - c.fy) * k
    }
    o[2] = r
    o[3] = a
    o[4] = soft
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
        // 모이는 동안 가운데 빛은 잦아든다: 빛은 입자를 따라 글자로 옮겨 간다. 가운데에 남기면 글자의 빈 속에 점이 떴다
        const g = carry(prog(gather, e))
        I = 0.26 * (1 - g)
        r = 52 + c.reach * 0.3
      }
    } else if (c.mode === 'scatter' && gather && e > gather.start) {
      const g = carry(prog(gather, e))
      I = 0.4 * g * g
    }
    if (c.mode !== 'pen' && resolve && e > resolve.start && !c.shaped) {
      const p = prog(resolve, e)
      I = (0.5 + 0.3 * Math.sin(Math.PI * Math.min(1, p * 1.8))) * Math.pow(1 - p, 1.6)
      r = c.gr * (0.95 + 0.25 * p)
    } else if (c.shaped && resolve && e > resolve.start) I = 0
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

  /**
   * 글 하나의 그 때 모습. 장의 답이면 다 들어온 순간 글자색에서 강조색으로 한 번 바뀌고 그대로 둔다(끝 모습의 강조색과 같다). 강조색은
   * 장면 전체에서 이때 한 번만 들어온다
   */
  function textAt(t: TextBox, e: number, lively: boolean) {
    enterAt(t, e, lively)
    const cue = t.cue
    if (cue.accent === undefined) return
    const a = clamp((e - cue.end) / Math.max(1, cue.accent - cue.end))
    t.el.style.color = a >= 1 ? '' : a <= 0 ? 'var(--ink)' : `color-mix(in srgb, var(--accent) ${(out(a) * 100).toFixed(1)}%, var(--ink))`
  }

  const fmtLike = (c: NonNullable<TextBox['count']>, x: number) => {
    let t = x.toFixed(c.digits)
    if (c.comma) {
      const [a, b] = t.split('.')
      t = a.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (b ? `.${b}` : '')
    }
    return t
  }
  /** 굴러가는 숫자를 글 노드에 쓴다. 끝 값의 너비를 처음부터 지킨다(모자란 앞자리는 숫자 폭의 빈칸 U+2007, 쉼표 자리는 U+2008) */
  function rollTo(c: NonNullable<TextBox['count']>, v: number) {
    const full = fmtLike(c, c.value)
    let s = fmtLike(c, v)
    if (s.length < full.length) s = full.slice(0, full.length - s.length).replace(/\d/g, '\u2007').replace(/[^\u2007]/g, '\u2008') + s
    const next = c.text.slice(0, c.at) + s + c.text.slice(c.at + c.len)
    if (c.node.nodeValue !== next) c.node.nodeValue = next
  }

  function enterAt(t: TextBox, e: number, lively: boolean) {
    const st = t.el.style
    const cue = t.cue
    const p = clamp((e - cue.start) / Math.max(1, cue.end - cue.start))
    if (cue.enter === 'carry') {
      // 건너오기: 앞 값의 자리에서 떠나 펜 끝과 같은 빠르기로 선을 타고 건너오며, 앞 값의 숫자에서 이 값으로 굴러 온다. 앞 값과 겹친
      // 동안은 보이지 않다가 앞 값을 벗어나며 짙어지고, 그만큼 앞 값은 지난 값의 색으로 물러난다: 값의 먹이 옮겨 가는 것으로 읽힌다
      // (겹친 채 둘 다 보이면 깨진 글자로 보였다, 필름)
      const u = carry(p)
      const f = t.from
      const clear = f ? f.clear : 0.2
      st.opacity = String(smooth(clear * 0.85, clear * 1.2, u))
      st.transform = f && u < 1 ? `translateX(${(f.dx * (1 - u)).toFixed(1)}px)` : ''
      // 지금 값을 벗어난 뒤부터 굴러간다(붙은 채 굴러가면 두 값이 한 낱말로 읽혔다, 감성 검수)
      if (t.count) rollTo(t.count, lerp(f?.value ?? 0, t.count.value, clamp((u - clear) / Math.max(0.01, 1 - clear))))
      const dim = smooth(clear * 0.5, clear * 1.2, u)
      if (f?.el) f.el.style.color = dim <= 0 ? 'var(--ink)' : dim >= 1 ? '' : `color-mix(in srgb, var(--ink) ${((1 - dim) * 100).toFixed(1)}%, var(--ink-3))`
      return
    }
    if (cue.enter === 'settle') {
      const o = out(p)
      st.opacity = String(o)
      const b = (1 - o) * (lively ? 6 : 4)
      st.filter = b > 0.05 ? `blur(${b.toFixed(2)}px)` : ''
      return
    }
    if (cue.enter === 'count') {
      st.opacity = String(out(clamp(p * 3)))
      if (t.count) rollTo(t.count, t.count.value * reveal(p))
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
    st.color = ''
    st.transform = ''
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
void main(){vec2 q=gl_PointCoord*2.0-1.0;float r=dot(q,q);if(r>1.0)discard;float tn=step(1.0,vt);float sf=(vt-tn)*2.0;float f=mix(1.0-smoothstep(0.5,1.0,r),exp(-r*3.4)*(1.0-r*r),sf);float al=va*f;o=vec4(mix(c0,c1,tn)*al,al);}`
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
          if (a > 0.01) P.dot(xs[i * 5], xs[i * 5 + 1], xs[i * 5 + 2] * 0.9, xs[i * 5 + 4] >= 1 ? 1 : 0, a)
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
    /** 번지는 먹의 면을 그리는 작은 캔버스(장의 4분의 1) */
    let wash: HTMLCanvasElement | null = null
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
    const tmp = [0, 0, 0, 0, 0]
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
        // 입자는 앞의 캔버스(GPU)에. 입자가 아닌 재료는 뒤의 캔버스 하나로 그린다
        front = s.material === 'particles' ? mk() : null
        return done(back ? null : false)
      }
      if (stage === 2) {
        stage = 3
        // 입자가 아닌 재료(먹의 면, 가는 선, 그어지는 선)는 뒤의 2D 캔버스 하나로 그린다
        if (!front) {
          n = 0
          stats.mode = '2d'
          return done(null)
        }
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
      scene = build(el, s, n, box, kz, dark, lively)
      xs = new Float32Array(n * 5 * (s.trail && painter?.mode === 'gl' ? 3 : 1))
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
      if (s.light && (c.mode === 'burst' || c.mode === 'scatter')) {
        glow(c, e, g)
        const I = g[0]
        if (I > 0.004) {
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
          } else if (c.mode === 'burst') {
            // 먹: 한 방울이 떨어져 터진다. 빛 번짐도 회색 얼룩도 없이 또렷한 먹 한 점만(얼룩은 회색 잡티로 읽혔다, 검수)
            x.globalCompositeOperation = 'source-over'
            const drop = Math.min(1, I * 1.4)
            const rd = 6 + 8 * drop
            const sp = c.spans.spread ? prog(c.spans.spread, e) : 0
            // 먹 한 방울은 한 점에서 번지는 장면에만(흩어진 것이 모이는 장면은 얼룩만 짙어진다)
            const da = 0.92 * drop * (1 - Math.sqrt(Math.max(0, sp)))
            if (da > 0.01) {
              x.fillStyle = rgbCss(ink.c, da)
              x.beginPath()
              x.arc(c.fx, c.fy, rd, 0, TAU)
              x.fill()
            }
          }
        }
      }
      x.globalCompositeOperation = 'source-over'
      if (c.mode === 'wash') drawWash(x, c, e)
      if (c.mode === 'threads') drawThreads(x, c, e)
      if (c.mode === 'branches') drawBranches(x, c, e)
      if (c.mode === 'pool') drawPool(x, c, e)
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

    /**
     * 번지는 먹(확산): 한 방울이 떨어진 자리에서 고르지 않은 테두리가 √t로 장 끝 너머까지 번진다. 종이에 번진 먹처럼 테두리가 짙고
     * 안은 옅으며, 지나온 자리에 옅은 물때(결)가 두 겹 남는다. 안쪽은 마르듯 먼저 걷혀 가운데의 숫자가 깨끗한 바탕에 선다.
     * 장의 4분의 1 크기 캔버스에 그려 늘려 쓴다(면이라 흐려도 되고 그리는 일이 16분의 1). 밝은 바탕은 먹, 어두운 바탕은 옅은 빛
     */
    const drawWash = (x: CanvasRenderingContext2D, c: Scene, e: number) => {
      const sp = c.spans.spread ? prog(c.spans.spread, e) : 1
      const seed = c.spans.seed ? prog(c.spans.seed, e) : 1
      if (sp >= 1 || (sp <= 0 && seed <= 0)) return
      if (!wash) {
        wash = document.createElement('canvas')
        wash.width = Math.max(1, Math.round(c.W / 4))
        wash.height = Math.max(1, Math.round(c.H / 4))
      }
      const w = wash.getContext('2d')!
      w.setTransform(1, 0, 0, 1, 0, 0)
      w.clearRect(0, 0, wash.width, wash.height)
      w.setTransform(0.25, 0, 0, 0.25, 0, 0)
      w.globalCompositeOperation = c.dark ? 'lighter' : 'source-over'
      const t = e / 1000
      const k = Math.sqrt(Math.max(0, sp))
      const R0 = c.reach * k
      // 떨어진 한 방울: 맺힘에서 짙게, 번지기 시작하면 테두리로 풀린다
      const drop = out(seed) * (1 - smooth(0, 0.25, sp))
      if (drop > 0.01) {
        w.fillStyle = rgbCss(ink.c, (c.dark ? 0.7 : 0.92) * drop)
        w.beginPath()
        w.arc(c.fx, c.fy, 8 + 14 * drop, 0, TAU)
        w.fill()
      }
      const env = smooth(0, 0.06, sp) * (1 - smooth(0.62, 1, sp))
      if (env > 0.005 && R0 > 4) {
        const outline = (r: number, turn: number) => {
          w.beginPath()
          for (let i = 0; i <= 120; i++) {
            const th = (i / 120) * TAU
            let f = 1
            for (let h = 0; h < c.edge.length; h += 4) f += c.edge[h + 1] * Math.sin(c.edge[h] * th + c.edge[h + 2] + turn + c.edge[h + 3] * t)
            const px = c.fx + Math.cos(th) * r * f
            const py = c.fy + Math.sin(th) * r * f
            if (i) w.lineTo(px, py)
            else w.moveTo(px, py)
          }
          w.closePath()
        }
        const A = c.dark ? 0.85 : 1
        // 안: 옅은 먹, 마르듯 걷힌다
        outline(R0, 0)
        w.fillStyle = rgbCss(ink.c, 0.05 * A * env * (1 - smooth(0.1, 0.55, sp)))
        w.fill()
        w.save()
        w.clip()
        // 테두리: 짙은 먹이 가장자리에 모인다. 바깥 끝은 또렷하고(종이에 멈춘 자리) 안으로 갈수록 풀린다: 테두리 안쪽만 남기고 흐리게 긋는다
        const rim = R0 * 0.07 + 8
        outline(R0, 0)
        w.filter = `blur(${(rim * 0.45).toFixed(1)}px)`
        w.strokeStyle = rgbCss(ink.c, 0.36 * A * env)
        w.lineWidth = rim * 2
        w.stroke()
        w.filter = 'none'
        w.strokeStyle = rgbCss(ink.c, 0.3 * A * env)
        w.lineWidth = 3
        w.stroke()
        w.restore()
      }
      x.save()
      x.setTransform(1, 0, 0, 1, 0, 0)
      x.imageSmoothingEnabled = true
      x.drawImage(wash, 0, 0, x.canvas.width, x.canvas.height)
      x.restore()
    }

    /**
     * 모여드는 가는 선(모여 맺힘): 장 밖 여러 높이에서 가는 선들이 건너와 문장이 설 띠 안에 가지런히 모인다. 문장이 맺히면 선은 문장 쪽으로
     * 짧아지며 걷힌다. 입자가 아니라 선이라 같은 발표의 '빛에서 글자로'와 다른 몸짓으로 읽힌다
     */
    const drawThreads = (x: CanvasRenderingContext2D, c: Scene, e: number) => {
      const G = c.spans.gather
      const RS = c.spans.resolve
      if (!G) return
      const len = Math.max(1, G.end - G.start)
      const pr = RS ? prog(RS, e) : 0
      if (pr >= 1) return
      x.globalCompositeOperation = c.dark ? 'lighter' : 'source-over'
      x.lineCap = 'butt'
      x.lineWidth = c.threadW
      // 짙기를 여섯 묶음으로 나눠 묶음마다 한 번에 긋는다(선 수백 개를 하나씩 그으면 느린 PC에서 한 프레임이 길어졌다)
      const buckets: number[][] = [[], [], [], [], [], []]
      const K = c.threads.length / 8
      for (let k = 0; k < K; k++) {
        const o = k * 8
        // 장 밖에서 빠르게 들어와 천천히 내려앉는다(힘을 모으는 첫 박자가 있으면 처음 0.3초가 빈 장이었다, 필름)
        const g = out(clamp((e - G.start - c.threads[o + 6] * len) / (len * 0.62)))
        if (g <= 0) continue
        // 높이는 건너오며 천천히 맞춘다(옆으로 건너오며 줄을 선다)
        const gy = smooth(0, 0.85, g)
        const y = lerp(c.threads[o], c.threads[o + 1], gy)
        const cx = lerp(c.threads[o + 2], c.threads[o + 3], g)
        const l = lerp(c.threads[o + 4], c.threads[o + 5], g)
        // 건너오는 동안은 옅고, 닿을수록 짙다: 오가는 선보다 모여 선 문장이 보이게
        let a = smooth(0, 0.1, g) * c.threads[o + 7] * lerp(0.3, 1, g * g)
        // 글이 맺히는 만큼 선은 걷힌다(글 아래로 스며든다)
        if (pr > 0) a *= 1 - smooth(0.05, 0.85, pr)
        if (a <= 0.02) continue
        buckets[Math.min(5, Math.floor(a * 6))].push(cx - l / 2, y, cx + l / 2)
      }
      const top = c.dark ? 0.8 : 0.92
      buckets.forEach((b, j) => {
        if (!b.length) return
        x.strokeStyle = rgbCss(ink.c, ((j + 0.5) / 6) * top)
        x.beginPath()
        for (let i = 0; i < b.length; i += 3) {
          x.moveTo(b[i], b[i + 1])
          x.lineTo(b[i + 2], b[i + 1])
        }
        x.stroke()
      })
      x.globalCompositeOperation = 'source-over'
    }

    /**
     * 갈래 하나의 [from, to] 구간(뿌리에서의 거리)을 굵기만큼의 띠로 경로에 더한다. 띠는 한쪽 둘레로 가서 다른 쪽 둘레로 돌아오는
     * 닫힌 꼴이고, 모든 띠와 이음매의 원이 같은 돌림 방향이라 겹친 곳도 한 번만 칠해진다(겹친 곳만 짙어지면 갈림마다 먹 점이 생긴다).
     * 끝(자라는 앞)과 꼬리(빨려 드는 뒤)는 붓끝처럼 가늘어진다
     */
    const ribbon = (x: CanvasRenderingContext2D, P: Float32Array, first: number, count: number, from: number, to: number, wk: number) => {
      const s0 = P[first * 4 + 2]
      const s1 = P[(first + count - 1) * 4 + 2]
      const a = Math.max(from, s0)
      const b = Math.min(to, s1)
      if (b - a < 0.5) return
      const L = rib
      let m = 0
      const put = (i: number, u: number) => {
        const j = i * 4
        const k = j + 4
        L[m++] = lerp(P[j], P[k], u)
        L[m++] = lerp(P[j + 1], P[k + 1], u)
        L[m++] = lerp(P[j + 2], P[k + 2], u)
        L[m++] = lerp(P[j + 3], P[k + 3], u)
      }
      for (let i = first; i < first + count - 1 && m < L.length - 8; i++) {
        const sa = P[i * 4 + 2]
        const sb = P[i * 4 + 6]
        if (sb < a || sa > b) continue
        const d = Math.max(1e-3, sb - sa)
        if (!m) put(i, clamp((a - sa) / d))
        put(i, clamp((b - sa) / d))
      }
      const n = m / 4
      if (n < 2) return
      // 한쪽 둘레로 가고(-n 쪽) 다른 쪽 둘레로 돌아온다(+n 쪽)
      for (let pass = 0; pass < 2; pass++) {
        for (let jj = 0; jj < n; jj++) {
          const j = pass ? n - 1 - jj : jj
          const o = j * 4
          const p0 = Math.max(0, j - 1) * 4
          const p1 = Math.min(n - 1, j + 1) * 4
          let dx = L[p1] - L[p0]
          let dy = L[p1 + 1] - L[p0 + 1]
          const dl = Math.hypot(dx, dy) || 1
          dx /= dl
          dy /= dl
          const sd = L[o + 2]
          // 붓끝: 자라는 앞(to)과 빨려 드는 꼬리(from) 둘레만 가늘게. 갈래 하나의 끝(b)에서 가늘게 하면 마디마다 끊겨 보였다(필름)
          const hw = (L[o + 3] * wk * clamp(0.28 + (to - sd) / 44) * clamp(0.28 + (sd - from) / 44)) / 2
          const sg = pass ? hw : -hw
          const px = L[o] - dy * sg
          const py = L[o + 1] + dx * sg
          if (!pass && !jj) x.moveTo(px, py)
          else x.lineTo(px, py)
        }
      }
      x.closePath()
    }
    /** 띠 하나의 표본(갈래 하나는 22점이라 넉넉하다) */
    const rib = new Float32Array(26 * 4)

    /**
     * 갈래(갈림길): 줄기가 들어와 갈라지고, 안들이 함께 뻗어 같은 때에 멈춘다(펼쳐 보이기). 머묾 뒤 고른다: 고르지 않은 안은 제자리에서
     * 옅어지고(되감으면 '취소'로 읽혔다, 감성 검수), 고른 안은 짙고 조금 굵어지며 멈춘 자리에서 끝까지 그어져 답의 첫머리에 닿는다. 답이
     * 써지는 동안 펜 끝이 글줄을 따라가고 고른 길은 뒤에서부터 답의 첫머리로 빨려 든다(고른 길이 답이 된다). 끝 모습은 글뿐이고 강조색은
     * 쓰지 않는다
     */
    const drawBranches = (x: CanvasRenderingContext2D, c: Scene, e: number) => {
      const b = c.br
      if (!b) return
      const SP = c.spans.spread
      const RS = c.spans.resolve
      const g = SP ? reveal(Math.max(0, prog(SP, e))) : 1
      // 줄기가 먼저 갈림까지, 그다음 안들이 같은 몫씩 뻗어 같은 때에 멈춘다
      const a = b.fork / Math.max(1, b.stop)
      const trunk = b.fork * clamp(g / a)
      const opt = clamp((g - a) / (1 - a))
      const r = RS ? Math.max(0, prog(RS, e)) : 0
      const split = r > 0
      // 고르는 몸짓은 0.4초 남짓: 고르지 않은 안이 옅어지는 동안 고른 안이 짙어진다(잘라 붙인 듯 짧으면 고르는 순간이 보이지 않았다, 감성 검수)
      const pick = out(clamp(r / 0.5))
      const fade = 1 - out(clamp(r / 0.6))
      const ext = carry(clamp((r - 0.1) / 0.7))
      // 답(주인공 글)이 들어오는 동안 고른 길은 뒤에서부터 빨려 든다. 써지기면 펜 끝이 글줄을 따라간다
      const tw = c.texts.find((t) => t.cue.key === 'title') ?? c.texts.find((t) => t.cue.enter === 'write')
      // 답을 비웠으면 글이 들어오는 구간에 맞춰 빨려 든다(끝에 한꺼번에 사라지지 않게)
      const WR = c.spans.write
      const wq = tw ? clamp((e - tw.cue.start) / Math.max(1, tw.cue.end - tw.cue.start)) : WR ? Math.max(0, prog(WR, e)) : 0
      const writing = !!tw && wq > 0 && wq < 1 && (tw.cue.enter === 'write' || tw.cue.enter === 'letters')
      const tail = b.end * carry(clamp(wq * 1.6))
      if (tail < b.end - 1) {
        const chosen = g < a ? trunk : r <= 0 ? b.fork + (b.stop - b.fork) * opt : b.stop + (b.end - b.stop) * ext
        const A0 = c.dark ? 0.62 : 0.72
        const A1 = c.dark ? 0.94 : 0.96
        const wk = 1 + 0.22 * pick
        x.globalCompositeOperation = 'source-over'
        for (let pass = 0; pass < (split ? 2 : 1); pass++) {
          x.beginPath()
          for (let k = 0; k < b.segs.length; k += 3) {
            const grp = b.segs[k + 2]
            if (split && (grp === 0) !== (pass === 0)) continue
            if (grp === 0) ribbon(x, b.pts, b.segs[k], b.segs[k + 1], tail, chosen, wk)
            else if (opt > 0 && fade > 0) ribbon(x, b.pts, b.segs[k], b.segs[k + 1], split ? b.fork + 8 : 0, b.fork + (b.ends[grp] - b.fork) * opt, 1)
          }
          if (pass === 0 && trunk >= b.fork - 2 && tail < b.fork - 4) {
            const rr = b.joint[2] * wk
            x.moveTo(b.joint[0] + rr, b.joint[1])
            x.arc(b.joint[0], b.joint[1], rr, 0, TAU)
          }
          x.fillStyle = rgbCss(ink.c, pass === 1 ? A0 * fade : lerp(A0, A1, pick))
          x.fill()
        }
      }
      if (writing) {
        const edge = writeEdge(tw!, e)
        if (edge) pen(x, c, tw!.box[0] + edge[1], tw!.box[1] + edge[2], 1 - smooth(0.85, 1, wq))
      }
    }

    /**
     * 물(차오름): 수위(숫자와 같은 곡선) 위에 물방울이 닿은 자리마다 잔물결 둘이 양옆으로 퍼지며 잦아든다. 물은 옅은 먹의 면(어두운 바탕은
     * 옅은 빛), 물 낯은 또렷한 가는 선. 떨어지는 물방울은 빠를수록 길게 늘어난 짧은 획이다(3~5m에서 점 하나는 보이지 않는다). 다 차고
     * 숫자가 맺히면 물은 조금 가라앉으며 걷힌다(끝 모습은 글뿐이다). 강조색은 쓰지 않는다
     */
    const drawPool = (x: CanvasRenderingContext2D, c: Scene, e: number) => {
      const P = c.pool
      if (!P) return
      const RS = c.spans.resolve
      const gone = RS ? clamp(prog(RS, e)) : 0
      if (gone >= 1) return
      const [c0, c1] = P.win
      const rise = reveal(clamp((e - c0) / Math.max(1, c1 - c0)))
      const fade = 1 - smooth(0, 1, gone)
      const level = lerp(P.base, P.full, rise) + 22 * carry(gone)
      const D = P.drops
      // 물결: 닿은 때부터 양옆으로 퍼지며(초당 700px) 잦아든다(0.48초)
      const wave = (px: number) => {
        let y = 0
        for (let j = 0; j < P.n; j++) {
          const o = j * DROP
          const dt = e - D[o + 1]
          if (dt <= 0 || dt > 1600) continue
          const reach = 0.7 * dt
          const amp = 12 * D[o + 4] * Math.exp(-dt / 480)
          // 물결 하나는 긴 굽이 한두 개(짧은 굽이가 겹치면 지진계의 잡음으로 읽혔다, 필름)
          for (const sg of [-1, 1]) {
            const u = px - (D[o] + sg * reach)
            if (Math.abs(u) > 240) continue
            y += amp * Math.sin(u * 0.038) * Math.exp(-(u * u) / 9000)
          }
          // 닿은 자리는 잠깐 오목하게
          const u0 = px - D[o]
          if (dt < 280 && Math.abs(u0) < 80) y += amp * (1 - dt / 280) * Math.exp(-(u0 * u0) / 900)
        }
        return y
      }
      if (rise > 0 && level < P.base) {
        const N = 160
        const sx = (P.x1 - P.x0) / N
        x.beginPath()
        for (let i = 0; i <= N; i++) {
          const px = P.x0 + i * sx
          const py = level + wave(px)
          if (i) x.lineTo(px, py)
          else x.moveTo(px, py)
        }
        // 물: 물 낯에서 바닥까지
        x.lineTo(P.x1, P.base + 40)
        x.lineTo(P.x0, P.base + 40)
        x.closePath()
        x.fillStyle = rgbCss(ink.c, (c.dark ? 0.09 : 0.06) * fade)
        x.fill()
        // 물 낯: 닫힌 경로의 윗변만 다시 긋는다
        x.beginPath()
        for (let i = 0; i <= N; i++) {
          const px = P.x0 + i * sx
          const py = level + wave(px)
          if (i) x.lineTo(px, py)
          else x.moveTo(px, py)
        }
        x.strokeStyle = rgbCss(ink.c, (c.dark ? 0.62 : 0.58) * fade)
        x.lineWidth = 2.4
        x.lineJoin = 'round'
        x.stroke()
      }
      // 떨어지는 물방울: 위에서 옅게 나타나 빨라지며(자유 낙하) 물 낯에 닿는다
      x.strokeStyle = rgbCss(ink.c, c.dark ? 0.78 : 0.7)
      x.lineCap = 'round'
      for (let j = 0; j < P.n; j++) {
        const o = j * DROP
        const t1 = D[o + 1]
        const t0 = t1 - D[o + 3]
        if (e <= t0 || e >= t1) continue
        const u = (e - t0) / (t1 - t0)
        const yEnd = lerp(P.base, P.full, reveal(clamp((t1 - c0) / Math.max(1, c1 - c0))))
        const y = lerp(D[o + 2], yEnd, u * u)
        // 빠를수록 길게(떨어지는 거리 × 빠르기)
        const len = 10 + 70 * u * D[o + 4]
        x.globalAlpha = smooth(0, 0.25, u)
        x.lineWidth = 3.5 + 2 * D[o + 4]
        x.beginPath()
        x.moveTo(D[o], y - len)
        x.lineTo(D[o], y)
        x.stroke()
      }
      x.globalAlpha = 1
    }

    /** 펜 끝: 작은 점 하나(빛 번짐 없이. 번지는 빛은 어두운 바탕의 초점 하나뿐이다) */
    const pen = (x: CanvasRenderingContext2D, c: Scene, px: number, py: number, a: number) => {
      if (a <= 0.01) return
      x.fillStyle = rgbCss(ink.c, 0.9 * a)
      x.beginPath()
      x.arc(px, py, c.dark ? 3.5 : 4.5, 0, TAU)
      x.fill()
    }

    /** 입자를 버퍼에 채운다. 잔상은 조금 앞의 두 때를 옅고 작게(같은 순수 함수로 셈한다) */
    const fill = (c: Scene, e: number) => {
      const b = xs!
      let m = 0
      const count = tier ? n >> 1 : n
      const trails = s.trail && painter!.mode === 'gl' && !tier
      // 밝은 바탕은 또렷한 먹: 다섯에 둘만, 크고 짙게, 가장자리가 또렷하게. 옅고 작은 점이 많으면 화면의 회색 잡티로 읽혔다(검수).
      // 어두운 바탕만 빛(겹칠수록 밝다)
      const ink2 = !c.dark
      // 잔상은 빠르게 움직이는 동안(번짐의 처음, 모임)만 뜻이 있다
      const moving = trails && ((c.spans.gather && e > c.spans.gather.start && e < c.spans.gather.end + 200) || (c.spans.spread && e > c.spans.spread.start && e < c.spans.spread.start + 700))
      c.cz = zoom(s, e) - 1
      const put = (i: number, size: number, alpha: number) => {
        b[m * 5] = tmp[0]
        b[m * 5 + 1] = tmp[1]
        b[m * 5 + 2] = size
        b[m * 5 + 3] = alpha
        // 흐림(0~1)은 색 값에 얹는다: 1 이상이면 강조색, 소수 부분이 흐림
        b[m * 5 + 4] = c.tone[i] + 0.5 * Math.min(0.99, ink2 && c.z[i] !== 0 ? tmp[4] * 0.4 : tmp[4])
        m++
      }
      for (let i = 0; i < count; i++) {
        if (ink2 && i % 3) continue
        particle(c, i, e, tmp)
        if (tmp[3] <= 0.004) continue
        put(i, ink2 ? tmp[2] * 1.8 : tmp[2], ink2 ? Math.min(1, tmp[3] * 2.1) * 0.92 : Math.min(1, tmp[3]) * 0.8)
        if (moving && i % 2 === 0) {
          for (let g = 1; g <= 2; g++) {
            particle(c, i, e - g * 34, tmp)
            if (tmp[3] <= 0.004) continue
            put(i, (ink2 ? tmp[2] * 1.8 : tmp[2]) * (1 - 0.15 * g), Math.min(1, tmp[3]) * (ink2 ? 0.88 : 0.8) * (g === 1 ? 0.42 : 0.18))
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
      if (!c.spans.gather) return 0
      // 모인 모양 위로 옅은 띠가 왼쪽에서 오른쪽으로 한 번 지나간다(빛이 스치듯, 먹이 다시 배어나듯)
      const bw = Math.max(40, c.gb[2] * 0.16)
      const xb = c.gb[0] - bw + (c.gb[2] + bw * 2) * carry(p)
      for (let i = 0; i < n; i += 3) {
        const band = Math.exp(-(((c.tx[i] - xb) / bw) ** 2))
        if (band < 0.03) continue
        b[m * 5] = c.tx[i]
        b[m * 5 + 1] = c.ty[i] - 3 * band
        b[m * 5 + 2] = c.size[i] * 0.75
        b[m * 5 + 3] = band * env * 0.5 * (c.dark ? 0.62 : 0.5)
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
          painter?.draw(xs!, fillLoop(c, k2))
          raf = requestAnimationFrame(frame)
        } else {
          painter?.clear()
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
        if (painter) painter.draw(xs!, fill(c, e))
        applyDom(c, e)
      }
      if (done) {
        // 다 맺혔다: 끝 모습(글, 남는 선)으로 돌리고, 생동감의 되풀이가 있으면 캔버스만 남겨 쉰다
        restoreAll()
        if (lively && s.loop && painter) {
          looping = true
          loopAt = now
          painter.clear()
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
      if (wash) wash.width = wash.height = 0
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

  function prewarm(root: ParentNode) {
    for (const el of Array.from(root.querySelectorAll<HTMLElement>('.bk-cn[data-script]'))) {
      let s: CineScript | null = null
      try {
        s = JSON.parse(el.dataset.script || 'null') as CineScript | null
      } catch {
        s = null
      }
      if (!s || !Array.isArray(s.texts) || (s.material !== 'particles' && s.material !== 'threads')) continue
      const wrap = shapeField(el, s)?.[1]
      const slide = el.closest('.slide')
      if (wrap && slide && wrap.getBoundingClientRect().width > 0) shapeOf(wrap, zoomOf(slide))
    }
  }

  return { still, play, listen, prewarm, stats: () => last }
}

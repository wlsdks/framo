// 배경: 장의 글과 컴포넌트 뒤에 까는 잔잔한 그래픽과 그 움직임. 앱의 발표 화면과 내보낸 HTML의 뷰어가 똑같이 쓴다.
// 기준은 docs/MOTION.md의 '9. 바탕 움직임'이다: 분위기 일곱 가운데 넷(확산, 모여 시작, 흐름, 연결)이 배경이다. 깊이, 구조, 여운은
// 지형도, 모눈 템플릿, 장식 괘선 두 줄로 읽혀 뺐다(감성 검수. 그때의 그림은 git의 8461f809에 있다: 모션 그래픽 프리셋으로 다시 만들 때)
//
// - 배경마다 '때 e의 모습'을 그리는 그림 하나(Scene)다. 끝 모습(들어오기가 끝나고 머무는 모습)은 이 그림으로 SVG를 만들어 장에 넣고
//   (편집 화면, 목록 그림, PDF, PPT, 내보낸 HTML의 처음 모습), 발표할 때는 같은 그림을 캔버스에 프레임마다 그린다.
//   그래서 움직임이 끝난 모습과 멈춘 그림이 같다. 숫자 하나, 글 한 줄 없이 그린다.
//   그리는 도구(시간의 순수 함수, SVG와 캔버스 그리기, 캔버스 재생기)는 motion/draw.ts에 있고 인자(kit)로 받는다.
// - 장에 맞춘다(fit): 그린 뒤에 장의 내용이 놓인 자리를 재서(clear) 세 가지를 안다. 비울 구멍(글 묶음, 그림, 차트), 본문 띠(흐름은 그
//   위아래로 나란히, 연결은 그 아래에), 장의 답(결정 요청, 한 문장 장의 문장, 맺음의 요청: 모여 시작의 줄기가 건너가 닿는 곳).
//   재고 나면 끝 모습을 그 값으로 다시 그린다. 구멍과 가장자리의 옅어짐은 SVG 안의 마스크라 PDF와 PPT 그림에도 그대로 들어간다
//   (PPT 그림은 장을 SVG 그림으로 옮겨 그리는데, 그 안에서는 CSS 마스크가 먹지 않아 배경이 화면의 두 배로 진했다)
// - 움직임: 장이 나올 때 한 번 들어오고(엔진이 mo-backdrop으로 알린다, motion/engine.ts) 2초 남짓에 가라앉는다(장의 글보다 늦게 끝나
//   마지막 박자를 가져가지 않게). 차분하게는 그 한 번뿐이고, 생동감만 그 뒤로 아주 느린 흐름이 이어진다(확산은 14초마다 한 번의 물결,
//   흐름은 결 전체가 미끄러짐. 모여 시작과 연결은 다 모이고 이어진 뒤의 고요가 말이라 흐름이 없다). 종류마다 같은 되풀이(선 위를 지나는
//   조각)를 두던 때는 실선이 점선처럼 흘러 자동으로 만든 느낌이었다(검수). 장에 되풀이하는 컴포넌트가 있으면 생동감도 들어오기 한 번
//   뒤로 멈춘다(계속 움직이는 것은 한 장에 하나). 움직임 없음과 '동작 줄이기'에서는 끝 모습 그대로다.
// - 색은 장의 글자색(currentColor) 하나다. 강조색은 장의 답에만 쓴다(AGENTS.md). 존재감은 선을 짙게가 아니라 몸짓의 크기와 요소의
//   양으로 낸다: 프로젝터 3~5m에서 검은 바탕의 배경이 사실상 보이지 않았다(검수). 검은 바탕은 한 단계 짙게 그린다(Backdrop.tsx)
// - 움직임은 처음부터 직접 만들었다. 이징은 엔진의 쓰임새 표(EASE)와 같은 곡선이다.
//
// 뷰어에는 이 함수와 drawKit의 소스(toString)가 그대로 들어간다. 그래서 바깥의 아무것도 참조하지 않고(받는 것은 kit뿐), 필요한 것은
// 모두 이 함수 안에 둔다. 다른 이름을 바깥에서 가져다 쓰면 빌드가 이름을 바꿔 뷰어에서 찾지 못한다

import type { DrawKit, Paint, Scene } from './draw'

/** 장에 맞춘 값(자리 px). 재기 전이나 모르면 빈 값이고, 그림은 그때의 기본 모양으로 그린다 */
interface Fit {
  /** 장의 답이 놓인 자리의 가운데(자리 밖일 수 있다) */
  aim?: number[]
  /** 본문 띠의 위와 아래 */
  band?: number[]
  /** 장 머리(제목과 부제)의 아래 끝 */
  head?: number
  /** 비울 구멍: [x, y, w, h] (둘레를 더한 것) */
  holes?: number[][]
}

interface StillOptions {
  /** 그 순간(들어오기가 시작된 뒤 ms, 끝을 지나면 생동감의 느린 흐름의 때). 없으면 끝 모습 */
  e?: number
  fit?: Fit
  /** 자리(12×12칸): 장 가장자리에 닿지 않는 쪽을 옅게 한다 */
  cells?: number[]
  /** 마스크 id의 앞머리(한 문서에 여러 장이 있어서) */
  id?: string
}

interface BackdropRuntime {
  /** 아는 배경 id */
  kinds: string[]
  /** 끝 모습(e를 주면 그 순간)의 SVG 안쪽. 자리 크기는 장 px, strength는 짙기(soft, base, strong, vivid: 검은 바탕의 또렷하게) */
  still(kind: string, w: number, h: number, strength?: string, opt?: StillOptions): string
  /** 캔버스에 씌울 마스크(CSS mask-image의 url): 구멍과 가장자리의 옅어짐. 없으면 '' */
  maskUrl(w: number, h: number, cells?: number[], fit?: Fit): string
  /**
   * 배경 하나(.s-bd)를 움직인다. level은 none, calm, lively, at은 시작을 늦출 ms. 돌려준 함수를 부르면 멈추고 끝 모습으로.
   * waits가 있으면 들어오기가 끝나는(또는 멈추는) 약속을 넣는다
   */
  play(el: HTMLElement, level: string, at: number, waits?: Promise<void>[]): () => void
  /** 엔진이 장을 움직이며 보내는 알림(mo-backdrop)을 받는다. 한 문서에 한 번 */
  listen(root: Document): void
  /** 들어오기가 끝나는 때(ms, 생동감 기준). 모르는 배경이면 0 */
  endOf(kind: string, w: number, h: number): number
  /** 장(.slide)의 내용이 놓인 자리를 재서 배경을 장에 맞춘다(구멍, 본문 띠, 장의 답). 배경이 없거나 그리지 않은 장이면 그대로 */
  clear(slide: Element): void
  /** 갤러리에서 움직임을 늘어놓아 볼 때: 배경 하나(.s-bd)의 끝 모습을 그 순간(e ms)의 그림으로 바꾼다(장에 맞춘 값 그대로) */
  frame(el: HTMLElement, e: number): void
}

export function backdropMotion(kit: DrawKit): BackdropRuntime {
  const { TAU, clamp, lerp, clock, span, every, rng, svgPaint } = kit
  const { out, reveal } = kit.ease

  // ======================================================================
  // 배경 넷. 저마다 '들어올 때 한 번'의 몸짓이 그 분위기의 말이다(docs/MOTION.md 9절의 표)
  // ======================================================================

  /**
   * 확산(한 점에서 바깥으로 번진다): 한 점에 모인 짙음이 장 절반 넘게 퍼져 나가며 옅어진다. 인쇄의 망점처럼 고른 판의 점 크기가 그
   * 자리의 짙기다. 넓이가 드러내기 곡선을 따라 한 점에서 넓어지고(처음 한순간은 작은 덩어리로 머물다 번지고 끝에서 느리게 멈춘다),
   * 퍼진 만큼 가운데가 옅어진다(양이 그대로라서). 퍼지는 동안 가운데가 시작한 점에서 조금 비켜 간다(흐르는 물에 떨어진 먹처럼).
   * 망점을 작게 두고 자리의 5분의 1만 퍼지던 때는 3~5m에서 옅은 얼룩이었다(검수): 퍼지는 거리를 키우고 점은 조금 크게, 판은 성기게.
   * 생동감의 느린 흐름: 14초마다 옅은 물결이 가운데에서 바깥으로 6초에 걸쳐 지나가며 망점이 조금 커졌다 돌아온다
   */
  function diffuse(w: number, h: number): Scene {
    const cx = w / 2
    const cy = h / 2
    const s = 0.3 * Math.sqrt(w * h)
    const q = Math.pow(w / h, 0.2)
    const sx = s * q
    const sy = s / q
    // 퍼지는 동안 가운데가 비켜 가는 거리(끝 모습에서)
    const SG0 = Math.sqrt(0.03)
    const DX = 0.16 * sx
    const DY = -0.07 * sy
    // 육각 판: 줄마다 반 칸씩 엇갈린다(망점). 가장 큰 점에서도 이웃과 닿지 않는다
    const pitch = Math.max(22, Math.min(32, Math.sqrt(w * h) / 44))
    const rmax = pitch * 0.33
    const rowH = pitch * 0.866
    const X: number[] = []
    const Y: number[] = []
    for (let r = 0, y = rowH / 2; y < h; r++, y += rowH)
      for (let x = r % 2 ? pitch * 0.75 : pitch * 0.25; x < w; x += pitch) {
        // 끝 모습에서 보이지 않는 먼 점은 처음부터 빼 둔다(들어오는 동안은 끝보다 좁게 퍼져 있다)
        const u = ((x - cx - DX * (1 - SG0)) / sx) ** 2 + ((y - cy - DY * (1 - SG0)) / sy) ** 2
        if (Math.exp(-0.5 * u) < 0.02) continue
        X.push(x)
        Y.push(y)
      }
    const n = X.length
    const T = 1700
    const end = T + 100
    const spread = (e: number) => Math.sqrt(0.03 + 0.97 * reveal(clamp(e / T)))
    return {
      end,
      draw(P, e, tau) {
        const sg = spread(e)
        // 양이 그대로라 넓어질수록 가운데가 옅어진다. 처음의 짙은 덩어리는 1.6배까지만
        const peak = Math.min(1.6, 1 / (sg * sg))
        const wave = every(tau, 4000, 14000, 6000)
        const wr = wave ? 3.2 * Math.pow(wave[1], 0.7) : -9
        const inv = 1 / (sg * sg)
        const mx = DX * (sg - SG0)
        const my = DY * (sg - SG0)
        const show = span(e, 0, 200)
        for (let i = 0; i < n; i++) {
          const ux = (X[i] - cx - mx) / sx
          const uy = (Y[i] - cy - my) / sy
          const u = (ux * ux + uy * uy) * inv
          if (u > 18) continue
          let c = peak * Math.exp(-0.5 * u)
          if (wave) {
            const d = (Math.sqrt(u) - wr) / 0.3
            c *= 1 + 0.3 * Math.sin(Math.PI * wave[1]) * Math.exp(-d * d)
          }
          const r = rmax * Math.pow(Math.min(1.25, c), 0.55)
          if (r >= 0.75) P.dot(X[i], Y[i], r, 0, 0.13 * show)
        }
      },
    }
  }

  /** 점의 줄(길이 기준 0~1로 찾게 누적 길이도) */
  type Line = { pts: number[]; len: number[]; total: number }
  const lineOf = (pts: number[]): Line => {
    const len = [0]
    for (let i = 2; i < pts.length; i += 2) len.push(len[len.length - 1] + Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]))
    return { pts, len, total: len[len.length - 1] }
  }
  /** 선의 처음부터 u0~u1(0~1)까지를 짚는다(긋기는 부르는 쪽이) */
  const trace = (P: Paint, ln: Line, u0: number, u1: number) => {
    const a = u0 * ln.total
    const b = u1 * ln.total
    let started = false
    for (let i = 1; i < ln.len.length; i++) {
      const l0 = ln.len[i - 1]
      const l1 = ln.len[i]
      if (l1 < a) continue
      const seg = l1 - l0 || 1
      if (!started) {
        const k = clamp((a - l0) / seg)
        P.to(lerp(ln.pts[i * 2 - 2], ln.pts[i * 2], k), lerp(ln.pts[i * 2 - 1], ln.pts[i * 2 + 1], k))
        started = true
      }
      if (l1 >= b) {
        const k = clamp((b - l0) / seg)
        P.to(lerp(ln.pts[i * 2 - 2], ln.pts[i * 2], k), lerp(ln.pts[i * 2 - 1], ln.pts[i * 2 + 1], k))
        return
      }
      P.to(ln.pts[i * 2], ln.pts[i * 2 + 1])
    }
  }
  /** 세 번째 곡선(베지어)의 점 N+1개 */
  const bezier = (x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, N: number) => {
    const pts: number[] = []
    for (let i = 0; i <= N; i++) {
      const u = i / N
      const v = 1 - u
      pts.push(v * v * v * x0 + 3 * v * v * u * x1 + 3 * v * u * u * x2 + u * u * u * x3, v * v * v * y0 + 3 * v * v * u * y1 + 3 * v * u * u * y2 + u * u * u * y3)
    }
    return pts
  }

  /**
   * 모여 시작(바깥에서 가운데로 모였다가 고요해진다): 일곱 갈래의 가는 선이 자리 가장자리에서 휘어 들어와 한 점에서 만나 하나의
   * 줄기가 되고, 그 줄기가 장을 건너 장의 답(결정 요청, 한 문장 장의 문장, 맺음의 요청) 쪽으로 가서 닿으며 옅어진다(여럿이 모여 하나로
   * 시작해 답에 이른다). 답을 모르면 오른쪽 끝으로. 그림 전체가 답 쪽을 향하도록 돌아가고, 갈래는 그 반대쪽에서 온다. 갈래가 다 닿기
   * 조금 전에 줄기가 떠나 넘겨주기가 된다. 빈 원으로 모이던 때는 불러오는 중 표시나 로고 자리처럼 읽혔고(검수), 줄기가 자리 안에서
   * 짧게 끝나던 때는 3~5m에서 잔금처럼 보였다(검수).
   */
  function gather(w: number, h: number, fit: Fit): Scene {
    const R = rng(3)
    const cx = w / 2
    const cy = h / 2
    // 향하는 쪽: 답이 있으면 자리 가운데에서 답으로, 없으면 오른쪽(살짝 위)
    const aim = fit.aim
    let dx = 1
    let dy = -0.08
    if (aim && Math.hypot(aim[0] - cx, aim[1] - cy) > 40) {
      dx = aim[0] - cx
      dy = aim[1] - cy
    }
    const dl = Math.hypot(dx, dy)
    dx /= dl
    dy /= dl
    /** 점 (x, y)에서 (ux, uy) 쪽으로 자리 가장자리 바로 밖까지의 거리 */
    const toEdge = (x: number, y: number, ux: number, uy: number) => {
      const tx = ux < -1e-6 ? -x / ux : ux > 1e-6 ? (w - x) / ux : Infinity
      const ty = uy < -1e-6 ? -y / uy : uy > 1e-6 ? (h - y) / uy : Infinity
      return Math.min(tx, ty) + 30
    }
    // 만나는 점: 가운데에서 향하는 쪽의 반대로(줄기가 길게 건너가게)
    const reach = Math.abs(dx) * w + Math.abs(dy) * h
    const mx = cx - dx * 0.22 * reach
    const my = cy - dy * 0.22 * reach
    // 줄기의 끝: 답이 자리 안이면 답까지, 아니면 그쪽 가장자리 밖까지
    const inside = !!aim && aim[0] > -20 && aim[0] < w + 20 && aim[1] > -20 && aim[1] < h + 20
    const far = toEdge(mx, my, dx, dy)
    const ex = aim && inside ? aim[0] : mx + dx * far
    const ey = aim && inside ? aim[1] : my + dy * far
    const tl = Math.hypot(ex - mx, ey - my)
    const S = 7
    const ORDER = [3, 0, 5, 2, 6, 1, 4]
    const D = 1000
    const GAP = 70
    const back = Math.atan2(-dy, -dx)
    const strands = Array.from({ length: S }, (_, s) => {
      // 만나는 점에서 향하는 쪽의 반대로 부채꼴(±70°)
      const th = back + ((-70 + (140 * s) / (S - 1) + (R() - 0.5) * 10) * Math.PI) / 180
      const ux = Math.cos(th)
      const uy = Math.sin(th)
      const L = toEdge(mx, my, ux, uy)
      const sx = mx + ux * L
      const sy = my + uy * L
      // 만나는 점에서 줄기와 같은 쪽을 보며 들어간다: 부드럽게 합쳐진다
      const bend = (R() - 0.5) * 0.25 * L
      const pts = bezier(sx, sy, sx + (mx - sx) * 0.4 - uy * bend, sy + (my - sy) * 0.4 + ux * bend, mx - dx * L * 0.35, my - dy * L * 0.35, mx, my, 40)
      return { ...lineOf(pts), t0: 80 + ORDER[s] * GAP }
    })
    // 줄기: 만나는 점에서 끝까지, 아주 조금 휘며(향하는 쪽의 왼편으로)
    const sag = Math.min(0.06 * tl, 40)
    const trunk = lineOf(bezier(mx, my, mx + (ex - mx) * 0.33 + dy * sag, my + (ey - my) * 0.33 - dx * sag, mx + (ex - mx) * 0.66 + dy * sag, my + (ey - my) * 0.66 - dx * sag, ex, ey, 48))
    // 줄기는 갈래 넷째가 닿을 즈음 떠난다(넘겨주기). 길게 건너가는 만큼 조금 오래
    const TRUNK = 80 + 3 * GAP + D * 0.8
    const TD = 900
    const end = Math.max(TRUNK + TD, 80 + (S - 1) * GAP + D) + 100
    const PIECES = 8
    return {
      end,
      draw(P, e) {
        for (const st of strands) {
          const p = reveal(span(e, st.t0, D))
          if (p <= 0) continue
          trace(P, st, 0, p)
          P.stroke(1.1, 0, 0.16)
        }
        const t = reveal(span(e, TRUNK, TD))
        // 줄기는 답에 가까워질수록 옅어진다(닿으며 사라진다)
        for (let k = 0; k < PIECES; k++) {
          const u0 = k / PIECES
          if (u0 >= t) break
          trace(P, trunk, u0, Math.min(t, (k + 1) / PIECES))
          P.stroke(1.6, 0, 0.3 * (1 - 0.8 * Math.pow((k + 0.5) / PIECES, 1.6)))
        }
      },
    }
  }

  /**
   * 흐름(한쪽으로 느리게 흐르는 결): 가는 선 여러 가닥이 나란히 왼쪽에서 오른쪽으로 그어지듯 깔린다. 본문 띠를 알면 선은 그 위와 아래로
   * 나란히 갈라 지나간다(본문 뒤는 비운다). 가운데에 가까운 한 가닥만 조금 짙다(우리가 가는 길). 선 사이는 44px 넘게(겹선이 되지 않게).
   * 한 곳(목)으로 오므라들었다 퍼지던 때는 본문을 비키며 결이 구겨져 보였다(검수).
   * 생동감의 느린 흐름: 결 전체가 아주 느리게(30초에 한 물결) 옆으로 미끄러진다. 선 위로 조각이 지나가던 때는 실선이 점선처럼 흘렀다
   */
  function flow(w: number, h: number, fit: Fit): Scene {
    const N = Math.max(24, Math.round(w / 16))
    const GAP = 48
    // 선을 놓을 띠: 본문 띠가 있으면 그 위와 아래, 없으면 자리 전체
    // 위 끝은 장 머리(제목) 아래에서: 제목 뒤를 지나는 선은 비워져 토막으로 보인다
    const regions: number[][] = []
    const band = fit.band
    const top = Math.max(0.06 * h, fit.head !== undefined ? fit.head + 40 : 0)
    if (band) {
      // 본문과는 64px 넘게 떨어진다: 물결(16px)이 와도 본문의 줄 선과 40px 안의 겹선이 되지 않게
      if (band[0] - 64 - top > GAP) regions.push([top, band[0] - 64])
      if (h - band[1] - 64 > 30 + GAP) regions.push([band[1] + 64, Math.min(h - 24, 0.94 * h)])
    }
    if (!regions.length) regions.push([top < 0.5 * h ? top : 0.06 * h, 0.94 * h])
    const ys: number[] = []
    for (const [a, b] of regions) {
      const n = Math.max(1, Math.min(14, Math.floor((b - a) / GAP) + 1))
      for (let i = 0; i < n; i++) ys.push(n === 1 ? (a + b) / 2 : a + ((b - a) * i) / (n - 1))
    }
    const L = ys.length
    const mid = h / 2
    let main = 0
    ys.forEach((y, i) => {
      if (Math.abs(y - mid) < Math.abs(ys[main] - mid)) main = i
    })
    const amp1 = Math.min(16, h * 0.016)
    const lines = ys.map((y0, i) => ({ y0, a: 0.1 + 0.05 * (((i * 7) % 3) / 2), delay: 60 + i * (520 / Math.max(1, L - 1)) }))
    const yAt = (i: number, k: number, ph: number) => {
      const x = k / N
      return lines[i].y0 + amp1 * Math.sin(TAU * x * 1.1 + i * 0.35 + ph) + amp1 * 0.35 * Math.sin(TAU * x * 2.6 - i * 0.25 + ph * 1.6)
    }
    const DRAW = 1100
    const end = 60 + 520 + DRAW + 100
    return {
      end,
      draw(P, e, tau) {
        const ph = (clock(tau) * TAU) / 30000
        for (let i = 0; i < L; i++) {
          const p = reveal(span(e, lines[i].delay, DRAW))
          if (p <= 0) continue
          const kmax = p * N
          const kf = Math.floor(kmax)
          for (let k = 0; k <= kf; k++) P.to((k / N) * w, yAt(i, k, ph))
          if (kf < N) P.to((kmax / N) * w, lerp(yAt(i, kf, ph), yAt(i, kf + 1, ph), kmax - kf))
          if (i === main) P.stroke(1.3, 0, 0.2)
          else P.stroke(1, 0, lines[i].a)
        }
      },
    }
  }

  /**
   * 연결(점과 점 사이에 선이 이어진다): 양쪽 무리의 점이 먼저 맺히고, 낮고 넓은 활이 한 가닥씩 왼쪽 점에서 건너가 오른쪽 점에 닿는다.
   * 닿을 때 그 점이 한 번 또렷해진다. 활은 본문 띠 아래에(자리가 모자라면 위에) 두어 표의 줄 선과 떨어지고, 바닥선은 자리 아래 끝에서
   * 떼어 활의 발이 잘린 듯 끝나지 않는다. 활을 높이 솟게 두던 때는 표의 줄 선과 글을 가로질러 데이터처럼 읽혔고, 바닥선을 자리 끝에
   * 붙이던 때는 아래가 잘려 보였다(검수).
   */
  function link(w: number, h: number, fit: Fit): Scene {
    const n = 6
    const band = fit.band
    // 바닥선과 활의 높이: 본문 아래의 빈 띠에, 모자라면 본문 위의 빈 띠에
    let base = h * 0.86
    let lift = Math.min(0.2 * h, 220)
    if (band) {
      const below = h - band[1]
      const above = band[0]
      if (below >= 150) {
        base = h - Math.max(40, 0.22 * below)
        lift = Math.min(lift, base - band[1] - 44)
      } else if (above >= 190) {
        base = band[0] - 44
        lift = Math.min(lift, base - Math.max(0.2 * h, 150))
      }
    }
    lift = Math.max(40, lift)
    const left = Array.from({ length: n }, (_, k) => w * (0.08 + (0.3 * k) / (n - 1)))
    const right = Array.from({ length: n }, (_, k) => w * (0.62 + (0.3 * k) / (n - 1)))
    // 짝: 왼쪽의 점마다 오른쪽의 점 하나(차례를 섞어서). 너비가 엇갈려 겹겹의 무지개가 되지 않는다
    const PAIR = [3, 0, 4, 1, 5, 2]
    const arcs = Array.from({ length: n }, (_, k) => ({ a: left[k], b: right[PAIR[k]], t0: 0, to: PAIR[k] }))
    arcs.sort((x, y) => x.b - x.a - (y.b - y.a))
    // 활은 안쪽 점들이 맺힌 뒤에 떠나고(가까운 짝부터), 닿으면 그 점이 0.3초 또렷해진다
    const START = 520
    const DRAW = 900
    const GAP = 70
    const TOUCH = 300
    arcs.forEach((a, k) => (a.t0 = START + k * GAP))
    const end = START + (n - 1) * GAP + DRAW * 0.92 + TOUCH + 20
    const widest = arcs[n - 1].b - arcs[n - 1].a
    /** 활 위 u(0~1)의 자리: 넓을수록 높되 lift를 넘지 않는 낮은 반타원 */
    const pt = (a: (typeof arcs)[number], u: number): [number, number] => {
      const r = (a.b - a.a) / 2
      const t = Math.PI * (1 - u)
      return [(a.a + a.b) / 2 + Math.cos(t) * r, base - Math.sin(t) * lift * (0.55 + 0.45 * ((a.b - a.a) / widest))]
    }
    return {
      end,
      draw(P, e) {
        // 점이 먼저 맺힌다(안쪽부터)
        for (let k = 0; k < n; k++) {
          P.dot(left[k], base, 2.2 * out(span(e, 40 + (n - 1 - k) * 60, 360)), 0, 0.3)
          // 오른쪽 점은 활이 닿을 때 한 번 또렷해진다
          const hit = arcs.find((a) => a.to === k)
          const touch = hit ? span(e, hit.t0 + DRAW * 0.92, TOUCH) : 0
          const glow = touch > 0 && touch < 1 ? Math.sin(Math.PI * touch) : 0
          P.dot(right[k], base, 2.2 * out(span(e, 40 + k * 60, 360)) * (1 + 0.5 * glow), 0, 0.3 + 0.25 * glow)
        }
        for (const a of arcs) {
          const p = reveal(span(e, a.t0, DRAW))
          if (p <= 0) continue
          const steps = Math.max(2, Math.ceil(56 * p))
          for (let k = 0; k <= steps; k++) {
            const [x, y] = pt(a, (p * k) / steps)
            P.to(x, y)
          }
          P.stroke(1, 0, 0.14 + 0.06 * ((a.b - a.a) / w))
        }
      },
    }
  }

  const KINDS: Record<string, (w: number, h: number, fit: Fit) => Scene> = { diffuse, gather, flow, link }
  /** 짙기: 옅게, 보통, 또렷하게. vivid는 검은 바탕의 또렷하게(한 단계 위, Backdrop.tsx). 그림의 짙기에 곱한다 */
  const STRENGTH: Record<string, number> = { soft: 0.6, base: 1, strong: 1.45, vivid: 1.9 }

  /** 장에 맞춘 값의 열쇠(같은 값이면 같은 그림) */
  const fitKey = (fit: Fit) => `${fit.aim ? fit.aim.map(Math.round).join(',') : ''}|${fit.band ? fit.band.map(Math.round).join(',') : ''}|${fit.head === undefined ? '' : Math.round(fit.head)}`

  /**
   * 배경 하나의 그림. 그리는 함수는 값을 바꾸지 않아서 같은 배경, 같은 크기, 같은 맞춤은 한 번만 만든다: 장을 넘기는 첫 프레임에
   * 만들면 그 프레임이 길어진다. 끝 모습(still)을 그릴 때 이미 만들어 둔다
   */
  const scenes = new Map<string, Scene>()
  function sceneOf(kind: string, w: number, h: number, fit: Fit = {}): Scene | null {
    const make = Object.hasOwn(KINDS, kind) ? KINDS[kind] : null
    if (!make || !(w > 0) || !(h > 0)) return null
    const key = `${kind}|${Math.round(w)}|${Math.round(h)}|${fitKey(fit)}`
    let sc = scenes.get(key)
    if (!sc) {
      sc = make(Math.round(w), Math.round(h), fit)
      scenes.set(key, sc)
    }
    return sc
  }

  // ---------- 마스크: 구멍과 가장자리의 옅어짐 ----------
  /**
   * 마스크 정의(SVG defs). 장 가장자리에 닿지 않는 쪽은 서서히 옅어지고(자리의 네모 끝이 선처럼 보이지 않게. 닿는 쪽은 장 밖까지
   * 이어진 것처럼 그대로), 구멍은 흐린 네모로 0.2만 남긴다. 둘 다 없으면 ''
   */
  function maskDefs(id: string, w: number, h: number, cells?: number[], holes?: number[][]): string {
    const fade = (on: boolean, len: number) => (on ? len : 0)
    const cx = cells || [0, 0, 12, 12]
    const L = fade(cx[0] > 0, Math.min(220, w * 0.24))
    const Rr = fade(cx[0] + cx[2] < 12, Math.min(220, w * 0.24))
    const T = fade(cx[1] > 0, Math.min(180, h * 0.24))
    const B = fade(cx[1] + cx[3] < 12, Math.min(180, h * 0.24))
    if (!L && !Rr && !T && !B && !(holes && holes.length)) return ''
    // 곧은 기울기는 끝에서 꺾여 보여서, 처음과 끝을 눕힌 곡선(0, 0.15, 0.55, 1)으로 잇는다
    const grad = (gid: string, vertical: boolean, size: number, a: number, b: number) => {
      const st: string[] = []
      const stop = (o: number, v: number) => st.push(`<stop offset="${Math.round(clamp(o / size) * 1000) / 1000}" stop-color="#fff" stop-opacity="${v}"/>`)
      if (a) {
        stop(0, 0)
        stop(a * 0.3, 0.15)
        stop(a * 0.6, 0.55)
      }
      stop(a, 1)
      stop(size - b, 1)
      if (b) {
        stop(size - b * 0.6, 0.55)
        stop(size - b * 0.3, 0.15)
        stop(size, 0)
      }
      return `<linearGradient id="${gid}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${vertical ? 0 : size}" y2="${vertical ? size : 0}">${st.join('')}</linearGradient>`
    }
    let defs = ''
    let fill = '#fff'
    let inner = ''
    if (L || Rr) defs += grad(`${id}x`, false, w, L, Rr)
    if (T || B) defs += grad(`${id}y`, true, h, T, B)
    if ((L || Rr) && (T || B)) {
      defs += `<mask id="${id}xm" maskUnits="userSpaceOnUse" x="0" y="0" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="url(#${id}x)"/></mask>`
      fill = `url(#${id}y)`
      inner = ` mask="url(#${id}xm)"`
    } else if (L || Rr) fill = `url(#${id}x)`
    else if (T || B) fill = `url(#${id}y)`
    let hole = ''
    if (holes && holes.length) {
      defs += `<filter id="${id}b" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="14"/></filter>`
      hole = `<g filter="url(#${id}b)" fill="#000" fill-opacity="0.8">${holes.map((r) => `<rect x="${Math.round(r[0])}" y="${Math.round(r[1])}" width="${Math.round(r[2])}" height="${Math.round(r[3])}" rx="16"/>`).join('')}</g>`
    }
    return `${defs}<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${fill}"${inner}/>${hole}</mask>`
  }

  function maskUrl(w: number, h: number, cells?: number[], fit: Fit = {}): string {
    const defs = maskDefs('m', w, h, cells, fit.holes)
    if (!defs) return ''
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs>${defs}</defs><rect width="${w}" height="${h}" mask="url(#m)"/></svg>`
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
  }

  const stills = new Map<string, string>()
  function still(kind: string, w: number, h: number, strength = 'base', opt: StillOptions = {}): string {
    const fit = opt.fit || {}
    const id = opt.id || 'bd'
    const masked = maskDefs(id, w, h, opt.cells, fit.holes)
    const key = `${kind}|${Math.round(w)}|${Math.round(h)}|${strength}|${fitKey(fit)}`
    const at = opt.e
    let body = at === undefined ? stills.get(key) : undefined
    if (body === undefined) {
      const sc = sceneOf(kind, w, h, fit)
      if (!sc) return ''
      const P = svgPaint(STRENGTH[strength] ?? 1)
      // 때를 주면 그 순간(들어오기의 ms, 끝을 지나면 생동감의 느린 흐름)을 그린다: 갤러리에서 움직임을 한 장씩 늘어놓아 볼 때
      if (at !== undefined) sc.draw(P, Math.min(sc.end, at), Math.max(0, at - sc.end))
      else sc.draw(P, sc.end, 0)
      body = P.markup()
      if (at === undefined) stills.set(key, body)
    }
    return masked ? `<defs>${masked}</defs><g mask="url(#${id})">${body}</g>` : body
  }

  // ---------- 움직이기 ----------
  /**
   * 되풀이하는 컴포넌트(살아 있는 그림). 이것이 있는 장에서는 배경이 들어오기 한 번 뒤로 멈춘다(계속 움직이는 것은 한 장에 하나).
   * 모이고 퍼지기는 늘, 나머지는 생동감에서만 되풀이한다(docs/MOTION.md '살아 있는 그림')
   */
  const LIVING = '.bk[data-type="hub"]'
  const LIVING_LIVELY = ['flow', 'network', 'cycle', 'decision', 'whys', 'steps'].map((t) => `.bk[data-type="${t}"]`).join(',')
  /** 되풀이가 있는 배경. 나머지는 생동감에서도 들어오기 한 번뿐이다(다 모이고 이어진 뒤의 고요가 말이다) */
  const FLOWS: Record<string, boolean> = { diffuse: true, flow: true }
  /**
   * 바로 앞 장에서 멈춘 배경. 다음 장도 같은 배경(같은 그림, 같은 자리)이면 들어오기를 다시 하지 않고 머물던 모습에서 이어 간다.
   * 장을 넘길 때마다 같은 배경이 처음부터 다시 퍼지면 배경이 아니라 장마다의 장식처럼 보인다
   */
  let last: { sig: string; tau: number; at: number } | null = null
  const running = new WeakMap<HTMLElement, () => void>()
  /** 배경마다 장에 맞춘 값(clear가 잰다) */
  const fits = new WeakMap<Element, { fit: Fit; key: string }>()
  /** 갤러리에서 한 순간에 멈춰 둔 배경(frame): 다시 맞출 때도 그 순간으로 그린다 */
  const pinned = new WeakMap<Element, number>()

  function play(el: HTMLElement, level: string, at: number, waits?: Promise<void>[]): () => void {
    running.get(el)?.()
    const kind = el.dataset.bd || ''
    const w = Number(el.dataset.w)
    const h = Number(el.dataset.h)
    const strength = el.dataset.strength || 'base'
    const svg = el.querySelector('svg')
    const sig = `${kind}|${w}|${h}|${el.dataset.x}|${el.dataset.y}|${strength}`
    const now0 = performance.now()
    // 앞 장의 같은 배경을 0.4초 안에 넘겨받으면 들어오기를 하지 않는다(움직임 없음이면 끝 모습 그대로)
    const carried = last && last.sig === sig && now0 - last.at < 400 ? last.tau : -1
    /** 장을 떠날 때: 다음 장이 같은 배경이면 이어 가게 적어 둔다 */
    const leave = (tau: number) => {
      last = { sig, tau, at: performance.now() }
    }
    if (level !== 'calm' && level !== 'lively') return () => leave(0)
    const lively = level === 'lively'
    const slide = el.closest('.slide')
    // 생동감의 느린 흐름은 되풀이가 있는 배경이고 장에 되풀이하는 컴포넌트가 없을 때만
    const flows = lively && FLOWS[kind] === true && !slide?.querySelector(`${LIVING},${LIVING_LIVELY}`)
    // 이어 가는데 흐름도 없으면 그릴 것이 없다: 끝 모습 그대로
    if (carried >= 0 && !flows) return () => leave(0)
    const sc = sceneOf(kind, w, h, fits.get(el)?.fit)
    if (!sc || !svg || typeof document === 'undefined') return () => leave(0)
    // 차분하게는 같은 들어오기를 1.3배 빠르게(보고 자리에서 기다리게 하지 않는다)
    const sp = lively ? 1 : 1.3
    const t0 = carried >= 0 ? now0 - sc.end / sp - carried : now0 + Math.max(0, at)

    let settle = () => {}
    waits?.push(new Promise<void>((r) => (settle = r)))
    const pl = kit.player(el, sc, {
      w,
      h,
      t0,
      speed: sp,
      flows,
      strength: STRENGTH[strength] ?? 1,
      className: 'bd-cv',
      onSettled: () => {
        running.delete(el)
        settle()
      },
    })
    const finish = pl.finish
    const stop = () => {
      finish()
      leave(pl.tau())
    }
    running.set(el, finish)
    return stop
  }

  // ---------- 장에 맞추기 ----------
  /**
   * 그린 뒤에 장의 내용이 놓인 자리를 잰다.
   * - 구멍: 글이 든 묶음(장의 4분의 1보다 작은 것: 단계 하나, 표의 줄 하나, 제목 묶음)을 통째로, 그림, 영상, 차트(svg)는 크기와
   *   상관없이 통째로. 그 안의 줄 선, 강조 선, 칸 사이까지 비어서 배경의 선이 데이터의 선과 나란히 서지 않는다(검수). 큰 묶음은 그
   *   안의 작은 묶음과 글이 맡고, 이미 뚫은 묶음 안의 것은 건너뛴다(요소는 문서 차례라 묶음이 먼저 온다)
   * - 본문 띠: 장 머리(제목)와 꼬리(출처, 쪽)를 뺀 구멍들의 위아래
   * - 장의 답: 결정 요청, 한 문장 장의 문장, 맺음의 요청, 없으면 강조한 항목
   */
  const PAD = 34
  const SMALL = 1920 * 1080 * 0.25
  const AIMS = ['.cv-ask-text', '.st-title', '.cl-title', '.is-hl']
  let uid = 0
  function clear(slide: Element) {
    const el = slide.querySelector(':scope > .s-bd') as HTMLElement | null
    const svg = el?.querySelector(':scope > svg')
    if (!el || !svg) return
    const sr = slide.getBoundingClientRect()
    if (!sr.width) return
    const k = sr.width / 1920
    const W = Number(el.dataset.w)
    const H = Number(el.dataset.h)
    const bx = el.offsetLeft
    const by = el.offsetTop
    const box = (node: Element) => {
      const r = node.getBoundingClientRect()
      return [(r.left - sr.left) / k - bx, (r.top - sr.top) / k - by, r.width / k, r.height / k]
    }
    const holes: number[][] = []
    const taken: number[][] = []
    let b0 = Infinity
    let b1 = -Infinity
    let hb = -Infinity
    const all = slide.querySelectorAll('*')
    for (let i = 0; i < all.length && holes.length < 240; i++) {
      const node = all[i]
      if (node === el || el.contains(node)) continue
      const tag = node.tagName.toLowerCase()
      const media = tag === 'img' || tag === 'video' || tag === 'canvas' || tag === 'svg'
      // 차트 안의 모양과 글은 차트(svg)가 통째로 맡는다
      if (!media && node.closest('svg')) continue
      if (!media && !/\S/.test(node.textContent || '')) continue
      const [x0, y0, w0, h0] = box(node)
      if (!w0 || !h0) continue
      if (!media && w0 * h0 > SMALL) continue
      if (taken.some((t) => x0 >= t[0] && y0 >= t[1] && x0 + w0 <= t[0] + t[2] && y0 + h0 <= t[1] + t[3])) continue
      taken.push([x0, y0, w0, h0])
      if (node.closest('.s-head')) hb = Math.max(hb, y0 + h0)
      else if (!node.closest('.s-foot') && x0 < W && x0 + w0 > 0) {
        b0 = Math.min(b0, y0)
        b1 = Math.max(b1, y0 + h0)
      }
      const x = x0 - PAD
      const y = y0 - PAD
      const w = w0 + PAD * 2
      const h = h0 + PAD * 2
      if (x > W || y > H || x + w < 0 || y + h < 0) continue
      holes.push([x, y, w, h])
    }
    const fit: Fit = { holes }
    if (b1 > b0) fit.band = [b0, b1]
    if (hb > -Infinity) fit.head = hb
    for (const sel of AIMS) {
      const t = slide.querySelector(sel)
      if (!t) continue
      const [x0, y0, w0, h0] = box(t)
      if (w0 && h0) {
        fit.aim = [x0 + Math.min(w0, 480) / 2, y0 + h0 / 2]
        break
      }
    }
    const cells = [Number(el.dataset.x), Number(el.dataset.y), W / 160, H / 90]
    const kind = el.dataset.bd || ''
    const strength = el.dataset.strength || 'base'
    const key = `${kind}|${W}|${H}|${strength}|${cells.join(',')}|${fitKey(fit)}|${holes.map((r) => r.map(Math.round).join(',')).join(';')}`
    const was = fits.get(el)
    // React가 끝 모습을 다시 그렸으면(값이 바뀜) 맞춘 그림이 지워졌다: 표시(data-fit)로 알아본다
    if (was && was.key === key && svg.getAttribute('data-fit') === key) return
    fits.set(el, { fit, key })
    const id = el.dataset.mid || (el.dataset.mid = `bdm${++uid}`)
    svg.innerHTML = still(kind, W, H, strength, { fit, cells, id, e: pinned.get(el) })
    svg.setAttribute('data-fit', key)
    const url = maskUrl(W, H, cells, fit)
    if (url) el.style.setProperty('--bd-mask', url)
    else el.style.removeProperty('--bd-mask')
  }

  function frame(el: HTMLElement, e: number) {
    pinned.set(el, e)
    const slide = el.parentElement
    if (slide && !fits.get(el)) clear(slide)
    const svg = el.querySelector(':scope > svg')
    if (!svg) return
    const W = Number(el.dataset.w)
    const H = Number(el.dataset.h)
    const cells = [Number(el.dataset.x), Number(el.dataset.y), W / 160, H / 90]
    svg.innerHTML = still(el.dataset.bd || '', W, H, el.dataset.strength, { e, fit: fits.get(el)?.fit, cells, id: el.dataset.mid })
  }

  function listen(root: Document) {
    const box = root as Document & { __bdListen?: boolean }
    if (box.__bdListen) return
    box.__bdListen = true
    root.addEventListener('mo-backdrop', (ev) => {
      const e = ev as CustomEvent<{ level?: string; at?: number; stops?: (() => void)[]; waits?: Promise<void>[] }>
      const el = e.target as HTMLElement | null
      if (!el || !el.classList || !el.classList.contains('s-bd')) return
      const stop = play(el, e.detail?.level || 'none', e.detail?.at || 0, e.detail?.waits)
      e.detail?.stops?.push(stop)
    })
  }

  return { kinds: Object.keys(KINDS), still, maskUrl, play, listen, clear, frame, endOf: (kind, w, h) => sceneOf(kind, w, h)?.end ?? 0 }
}

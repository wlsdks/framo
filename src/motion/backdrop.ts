// 배경: 장의 글과 컴포넌트 뒤에서 한 번 크게 지나가는 몸짓. 앱의 발표 화면과 내보낸 HTML의 뷰어가 똑같이 쓴다.
// 기준은 docs/MOTION.md의 '9. 바탕 움직임'이다: 셋(확산, 모여들기, 흐름)이 배경이다. 깊이, 구조, 여운은 지형도, 모눈 템플릿, 장식 괘선
// 두 줄로(8461f809), 연결은 뜻이 서지 않아(2f08a60a) 뺐다(감성 검수. 그때의 그림은 git의 그 커밋에 있다: 모션 그래픽 프리셋으로 다시 만들 때)
//
// - 배경은 '깔아 두는 무늬'가 아니라 '크게 지나가고 거의 남지 않는 몸짓'이다(결정). 들어오는 동안 크게(회의실 3~5m에서 보이게) 움직이고,
//   지나간 자리는 걷혀 끝 모습에는 가장자리의 아주 옅은 흔적만 남거나 아무것도 남지 않는다. 뜻은 움직이는 동안에만 서서, 멈춘 끝 모습을
//   무늬로 남기던 때는 넷 모두 망점 템플릿, 철망, 금 간 유리, 줄 공책, 아치 장식으로 읽혔다(2차 감성 검수). 그래서 PDF와 PPT에는 배경을
//   넣지 않는다(Backdrop.tsx).
// - 배경마다 '때 e의 모습'을 그리는 그림 하나(Scene)다. 끝 모습은 이 그림으로 SVG를 만들어 장에 넣고(편집 화면, 내보낸 HTML의 처음
//   모습), 발표할 때는 같은 그림을 캔버스에 프레임마다 그린다. 숫자 하나, 글 한 줄 없이 그린다.
//   그리는 도구(시간의 순수 함수, SVG와 캔버스 그리기, 캔버스 재생기)는 motion/draw.ts에 있고 인자(kit)로 받는다.
// - 장에 맞춘다(fit): 그린 뒤에 장의 내용이 놓인 자리를 재서(clear) 세 가지를 안다. 비울 구멍(글 묶음, 그림, 차트: 움직이는 동안에도 그
//   뒤에는 아무것도 남지 않는다), 본문 띠(흐름은 데이터 선 높이에서 먼 빈 띠로), 장의 답(결정 요청, 한 문장 장의 문장, 맺음의 요청:
//   모여들기의 줄기가 데이터가 없는 높이로 건너가 그 가까이에서 멈추며 사라진다). 재고 나면 끝 모습을 그 값으로 다시 그린다.
// - 움직임: 장이 나올 때 한 번(엔진이 mo-backdrop으로 알린다, motion/engine.ts) 2초 남짓. 차분하게는 그 한 번뿐이고, 생동감만 그 뒤로
//   드문 되풀이가 있다(확산은 16초마다 옅은 물결 하나, 흐름은 18초마다 옅은 한 가닥이 지나감. 모여들기는 다 모인 뒤의 고요가 말이라
//   없다). 장에 되풀이하는 컴포넌트가 있으면 생동감도 들어오기 한 번 뒤로 멈춘다. 움직임 없음과 '동작 줄이기'에서는 끝 모습 그대로다.
// - 색은 장의 글자색(currentColor) 하나다. 강조색은 장의 답에만 쓴다(AGENTS.md). 존재감은 선을 짙게가 아니라 몸짓의 크기로 낸다.
//   검은 바탕은 한 단계 짙게 그린다(Backdrop.tsx). 밝기의 정점은 장의 제목보다 낮다.
// - 움직임은 처음부터 직접 만들었다. 이징은 엔진의 쓰임새 표(EASE)와 같은 곡선이다.
//
// 뷰어에는 이 함수와 drawKit의 소스(toString)가 그대로 들어간다. 그래서 바깥의 아무것도 참조하지 않고(받는 것은 kit뿐), 필요한 것은
// 모두 이 함수 안에 둔다. 다른 이름을 바깥에서 가져다 쓰면 빌드가 이름을 바꿔 뷰어에서 찾지 못한다

import type { DrawKit, Paint, Scene } from './draw'

/** 장에 맞춘 값(자리 px). 재기 전이나 모르면 빈 값이고, 그림은 그때의 기본 모양으로 그린다 */
interface Fit {
  /** 장의 답이 놓인 상자 [x, y, w, h] (자리 밖일 수 있다) */
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
  const { TAU, clamp, lerp, span, every, rng, svgPaint } = kit
  const { out, reveal } = kit.ease

  // ======================================================================
  // 배경 셋. 저마다 '들어올 때 한 번'의 큰 몸짓이 그 분위기의 말이고, 지나간 자리는 걷힌다(docs/MOTION.md 9절의 표)
  // ======================================================================

  const smooth = (a: number, b: number, x: number) => {
    const t = clamp((x - a) / (b - a))
    return t * t * (3 - 2 * t)
  }

  /**
   * 확산(한 점에서 바깥으로 번진다): 자리 가운데에서 부드러운 입자의 물결 하나가 장 끝까지 크게 퍼져 나가고, 지나간 안쪽부터 걷힌다.
   * 끝 모습에는 가장자리에 아주 옅은 흔적만 남는다. 물결이 지나는 입자는 조금 부풀고 바깥으로 밀린다. 입자는 고르지 않은 자리(흔든
   * 격자)와 크기라서 판처럼 읽히지 않는다: 규칙적인 망점 판은 검은 바탕에서 철망으로, 구석에 깔린 망점은 하프톤 템플릿으로
   * 읽혔다(검수). 제목이 맺힌 뒤(0.45초)에 출발하고, 밝기의 정점은 제목보다 낮다: 첫 칸에서 배경이 제목보다 앞서지 않게.
   * 생동감의 되풀이: 16초마다 옅은 물결 하나가 다시 지나간다
   */
  function diffuse(w: number, h: number): Scene {
    const R = rng(5)
    const cx = w / 2
    const cy = h / 2
    const far = Math.hypot(Math.max(cx, w - cx), Math.max(cy, h - cy))
    const pitch = Math.max(20, Math.min(32, Math.sqrt(w * h) / 50))
    const X: number[] = []
    const Y: number[] = []
    const D: number[] = []
    const RAD: number[] = []
    const A: number[] = []
    const UX: number[] = []
    const UY: number[] = []
    for (let y = pitch / 2; y < h; y += pitch)
      for (let x = pitch / 2; x < w; x += pitch) {
        if (R() < 0.18) continue
        const px = x + (R() - 0.5) * pitch * 0.9
        const py = y + (R() - 0.5) * pitch * 0.9
        const dx = px - cx
        const dy = py - cy
        const dl = Math.hypot(dx, dy) || 1
        X.push(px)
        Y.push(py)
        D.push(dl / far)
        UX.push(dx / dl)
        UY.push(dy / dl)
        // 작은 입자가 많고 큰 입자는 드물게
        RAD.push(1.5 + 2.8 * R() * R())
        A.push(0.55 + 0.45 * R())
      }
    const n = X.length
    const T0 = 450
    const TR = 1600
    const end = T0 + TR + 100
    /** 물결의 앞(가운데에서의 거리, 장 끝을 1로): 처음 빠르고 끝에서 느리게, 장 밖까지 나가 다 걷힌다 */
    const front = (p: number) => 1.45 * (1 - Math.pow(1 - p, 1.35))
    return {
      end,
      draw(P, e, tau) {
        const p = span(e, T0, TR)
        const f = front(p)
        const start = clamp((e - T0) / 140)
        // 생동감: 16초마다 옅은 물결 하나
        const wave = every(tau, 5000, 16000, 3200)
        const f2 = wave ? 1.7 * out(wave[1]) : -9
        const bw = 0.15 + 0.1 * Math.min(1, f)
        const amp = 1 / (1 + 1.1 * f)
        for (let i = 0; i < n; i++) {
          const d = D[i]
          let band = start > 0 ? Math.exp(-(((d - f) / bw) ** 2)) * amp * start : 0
          if (wave) band += 0.4 * Math.sin(Math.PI * wave[1]) * Math.exp(-(((d - f2) / 0.13) ** 2))
          // 물결이 지나간 가장자리에는 아주 옅은 흔적
          const trace = 0.05 * smooth(0.9, 1.05, d) * smooth(0, 0.35, f - d)
          const a = (0.34 * band + trace) * A[i]
          if (a < 0.004) continue
          const push = 18 * band
          P.dot(X[i] + UX[i] * push, Y[i] + UY[i] * push, RAD[i] * (0.75 + 0.6 * band), 0, a)
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
  /** 선의 u0~u1(0~1)을 짚는다(긋기는 부르는 쪽이) */
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
  /**
   * 지나가는 선: 머리(head)와 꼬리(tail) 사이(0~1)만 긋고, 두 끝 쪽은 옅게 사라진다. fade는 선 위의 자리 u에서의 짙기 배율.
   * 마디마다 짙기가 달라 끝을 평평하게(flat) 긋는다: 둥근 끝끼리 이음에서 겹치면 짙은 점이 생겨 실선이 점선처럼 보였다(검수)
   */
  const pass = (P: Paint, ln: Line, tail: number, head: number, width: number, a: number, fade?: (u: number) => number) => {
    const len = head - tail
    if (len <= 0.002) return
    const PIECES = Math.max(4, Math.min(16, Math.ceil(len * 16)))
    const soft = Math.min(0.12, len * 0.4)
    for (let k = 0; k < PIECES; k++) {
      const u0 = tail + (len * k) / PIECES
      const u1 = tail + (len * (k + 1)) / PIECES
      const u = (u0 + u1) / 2
      const al = a * smooth(tail, tail + soft, u) * (1 - smooth(head - soft * 0.6, head, u)) * (fade ? fade(u) : 1)
      if (al < 0.004) continue
      trace(P, ln, u0, u1)
      P.stroke(width, 0, al, false, true)
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
  /** 가는 곳의 방향(ex, ey)으로 끝나는 곡선: 강줄기가 합쳐지듯 끝에서 그 방향을 본다 */
  const into = (sx: number, sy: number, x: number, y: number, ex: number, ey: number, wob: number) => {
    const L = Math.hypot(x - sx, y - sy)
    const c2x = x - ex * L * 0.38
    const c2y = y - ey * L * 0.38
    const nx = -(y - sy) / (L || 1)
    const ny = (x - sx) / (L || 1)
    return lineOf(bezier(sx, sy, sx + (c2x - sx) * 0.35 + nx * wob, sy + (c2y - sy) * 0.35 + ny * wob, c2x, c2y, x, y, 40))
  }

  /**
   * 모여들기(바깥 여러 곳에서 강처럼 합쳐진다): 장 밖 서로 다른 곳(옆, 위, 아래 가장자리 너머)에서 온 갈래가 먼저 둘이 합쳐지고, 다시
   * 매듭에서 나머지와 합쳐져 한 줄기가 된다. 줄기는 데이터가 없는 높이(빈 띠)로 장을 옆으로 건너, 장의 답(결정 요청, 한 문장 장의 문장,
   * 맺음의 요청, 강조 항목) 바로 곁에서 멈추며 사라진다. 갈래와 줄기는 지나가는 선이라 지나간 자리가 걷히고, 끝 모습에는 아무것도 남지
   * 않는다. 매듭은 구석과 아래 표시에서 멀다. 한 점에서 갈래가 사방으로 뻗던 때는 금 간 유리로, 줄기가 막대와 숫자에 붙던 때는 데이터
   * 선으로 읽혔다(검수)
   */
  function gather(w: number, h: number, fit: Fit): Scene {
    const R = rng(3)
    const holes = fit.holes || []
    const hit = (x: number, y: number, pad: number) => holes.some((r) => x > r[0] - pad && x < r[0] + r[2] + pad && y > r[1] - pad && y < r[1] + r[3] + pad)
    // 닿을 곳: 장의 답. 모르면 오른쪽 가운데 조금 위
    const tb = fit.aim || [w * 0.8, h * 0.38, w * 0.12, h * 0.12]
    const acx = tb[0] + tb[2] / 2
    const acy = tb[1] + tb[3] / 2
    // 흐르는 쪽: 답이 오른쪽에 있으면 왼쪽에서 오른쪽으로
    const dir = acx >= w / 2 ? 1 : -1
    const kx = dir > 0 ? 0.3 * w : 0.7 * w
    // 줄기의 끝: 답의 가까운 쪽 끝 조금 안. 답이 넓어 매듭 가까이까지 오면 장 너비의 절반쯤 건너간 곳(답의 곁)
    const near = dir > 0 ? tb[0] + Math.min(120, tb[2] / 2) : tb[0] + tb[2] - Math.min(120, tb[2] / 2)
    const ex = Math.max(48, Math.min(w - 48, dir * (near - kx) >= 0.25 * w ? near : kx + dir * 0.45 * w))
    // 빈 띠: 매듭에서 답 곁까지 옆으로 건너는 높이 가운데 데이터를 덜 지나고 답의 높이에 가까운 것. 아래 표시와 위 끝은 피한다
    let lane = acy
    let bestS = Infinity
    for (let y = 0.16 * h; y <= 0.82 * h; y += 0.02 * h) {
      let crossed = 0
      for (let s = 0; s <= 30; s++) if (hit(lerp(kx, ex, s / 30), y, 14)) crossed++
      if (hit(kx, y, 40)) crossed += 6
      const score = crossed * 10 + Math.abs(y - acy) / h
      if (score < bestS) {
        bestS = score
        lane = y
      }
    }
    const ky = lane
    const ey = lane
    const trunk = lineOf(bezier(kx, ky, lerp(kx, ex, 0.33), ky - 10, lerp(kx, ex, 0.66), ey + 8, ex, ey, 48))
    // 갈래가 오는 곳: 흐름의 위쪽(옆 가장자리 너머 두 곳, 위와 아래 가장자리 너머 한 곳씩)
    const sideX = dir > 0 ? -60 : w + 60
    const src = [
      [sideX, ky - 0.32 * h + (R() - 0.5) * 40],
      [lerp(sideX, kx, 0.45) + (R() - 0.5) * 60, -60],
      [sideX, ky + 0.3 * h + (R() - 0.5) * 40],
      [lerp(sideX, kx, 0.55) + (R() - 0.5) * 60, h + 60],
    ]
    // 첫 합류: 옆과 위에서 온 둘이 매듭 앞에서 먼저 만난다
    const m1x = lerp(kx, sideX, 0.42)
    const m1y = lerp(ky, Math.min(src[0][1], ky), 0.35)
    const ml = Math.hypot(kx - m1x, ky - m1y) || 1
    const wob = () => (R() - 0.5) * 140
    const lines = [
      { ln: into(src[0][0], src[0][1], m1x, m1y, (kx - m1x) / ml, (ky - m1y) / ml, wob()), t0: 0, D: 700, lag: 380, wd: 2.4, a: 0.2 },
      { ln: into(src[1][0], src[1][1], m1x, m1y, (kx - m1x) / ml, (ky - m1y) / ml, wob()), t0: 90, D: 640, lag: 380, wd: 2.4, a: 0.2 },
      { ln: into(m1x, m1y, kx, ky, dir, 0, 0), t0: 640, D: 380, lag: 300, wd: 3, a: 0.24 },
      { ln: into(src[2][0], src[2][1], kx, ky, dir, 0, wob()), t0: 160, D: 880, lag: 400, wd: 2.4, a: 0.2 },
      { ln: into(src[3][0], src[3][1], kx, ky, dir, 0, wob()), t0: 260, D: 800, lag: 400, wd: 2.2, a: 0.18 },
    ]
    const TT = 960
    const TD = 650
    const TL = 420
    const end = TT + TL + TD + 100
    return {
      end,
      draw(P, e) {
        for (const l of lines) pass(P, l.ln, reveal(span(e, l.t0 + l.lag, l.D)), reveal(span(e, l.t0, l.D)), l.wd, l.a)
        // 줄기: 머리는 답 곁에서 멈추고(out), 꼬리가 따라와 걷힌다. 답에 가까울수록 옅어진다
        pass(P, trunk, reveal(span(e, TT + TL, TD)), out(span(e, TT, TD)), 3.6, 0.28, (u) => 1 - 0.75 * smooth(0.6, 1, u))
      },
    }
  }

  /**
   * 흐름(한쪽으로 느리게 흐르는 결): 한두 가닥의 긴 선이 왼쪽에서 오른쪽으로 단계의 박자(넷)에 맞춰 건너가고, 지나간 뒤 꼬리가 따라와
   * 걷힌다. 선은 데이터 선(단계의 축, 표의 줄)의 높이에서 먼 빈 띠(본문 위아래 가운데 더 넓은 쪽)의 가운데로 지나간다. 결 여러 가닥을
   * 깔아 두던 때는 끝 모습이 줄 공책으로 읽혔다(검수).
   * 생동감의 되풀이: 18초마다 옅은 한 가닥이 다시 지나간다
   */
  function flow(w: number, h: number, fit: Fit): Scene {
    const top = Math.max(0.08 * h, fit.head !== undefined ? fit.head + 40 : 0)
    const bottom = 0.92 * h
    let lane = [top, bottom]
    const band = fit.band
    if (band) {
      const above = [top, band[0] - 64]
      const below = [band[1] + 64, bottom]
      lane = above[1] - above[0] >= below[1] - below[0] ? above : below
      if (lane[1] - lane[0] < 40) lane = [top, bottom]
    }
    const y0 = (lane[0] + lane[1]) / 2
    const two = lane[1] - lane[0] >= 150
    const amp1 = Math.min(18, h * 0.02)
    const N = Math.max(24, Math.round(w / 20))
    const lineAt = (y: number, ph: number) => {
      const pts: number[] = []
      for (let k = 0; k <= N; k++) {
        const x = -40 + ((w + 80) * k) / N
        pts.push(x, y + amp1 * Math.sin(TAU * (k / N) * 0.9 + ph) + amp1 * 0.3 * Math.sin(TAU * (k / N) * 2.3 - ph))
      }
      return lineOf(pts)
    }
    const strands = [{ ln: lineAt(y0 - (two ? 32 : 0), 0.4), delay: 0, wd: 3.2, a: 0.26 }]
    if (two) strands.push({ ln: lineAt(y0 + 32, 2.1), delay: 140, wd: 2.2, a: 0.16 })
    // 머리는 넷의 박자로 건너간다: 한 박자(0.3초)마다 4분의 1을 내닫고 머문다
    const BEAT = 300
    const T0 = 200
    const headAt = (t: number) => {
      const k = Math.floor(t / BEAT)
      if (k >= 4) return 1
      if (t <= 0) return 0
      return (k + out((t - k * BEAT) / BEAT)) / 4
    }
    const TAIL = 850
    const TD = 850
    const end = T0 + 140 + TAIL + TD + 100
    const ghost = lineAt((lane[0] + lane[1]) / 2, 1.2)
    return {
      end,
      draw(P, e, tau) {
        for (const s of strands) {
          const t = e - T0 - s.delay
          pass(P, s.ln, reveal(span(t, TAIL, TD)), headAt(t), s.wd, s.a)
        }
        const g = every(tau, 6000, 18000, 3200)
        if (g) pass(P, ghost, reveal(clamp((g[1] - 0.25) / 0.75)), reveal(clamp(g[1] / 0.75)), 2.2, 0.12)
      },
    }
  }

  const KINDS: Record<string, (w: number, h: number, fit: Fit) => Scene> = { diffuse, gather, flow }
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
   * 이어진 것처럼 그대로), 구멍은 흐린 네모로 다 비운다(글과 데이터 뒤에는 움직이는 동안에도 남는 것 없이). 둘 다 없으면 ''
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
      hole = `<g filter="url(#${id}b)" fill="#000">${holes.map((r) => `<rect x="${Math.round(r[0])}" y="${Math.round(r[1])}" width="${Math.round(r[2])}" height="${Math.round(r[3])}" rx="16"/>`).join('')}</g>`
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
        fit.aim = [x0, y0, w0, h0]
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

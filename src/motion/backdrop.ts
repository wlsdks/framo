// 배경: 장의 글과 컴포넌트 뒤에 까는 잔잔한 그래픽과 그 움직임. 앱의 발표 화면과 내보낸 HTML의 뷰어가 똑같이 쓴다.
// 기준은 docs/MOTION.md의 '9. 바탕 움직임'이다: 분위기 일곱(확산, 모여 시작, 흐름, 깊이, 구조, 여운, 연결)이 곧 배경 일곱이다.
//
// - 배경마다 '때 e의 모습'을 그리는 그림 하나(Scene)다. 끝 모습(들어오기가 끝나고 머무는 모습)은 이 그림으로 SVG를 만들어 장에 넣고
//   (편집 화면, 목록 그림, PDF, PPT, 내보낸 HTML의 처음 모습), 발표할 때는 같은 그림을 캔버스에 프레임마다 그린다.
//   그래서 움직임이 끝난 모습과 멈춘 그림이 같다. 숫자 하나, 글 한 줄 없이 자리의 크기만으로 그린다.
//   그리는 도구(시간의 순수 함수, SVG와 캔버스 그리기, 캔버스 재생기)는 motion/draw.ts에 있고 인자(kit)로 받는다.
//   여기에는 배경 일곱의 그림과 배경만의 규칙(세기, 이어지는 장, 살아 있는 그림이 있는 장)만 둔다
// - 움직임: 장이 나올 때 한 번 들어오고(엔진이 mo-backdrop으로 알린다, motion/engine.ts) 3초 안에 가라앉는다. 차분하게는 그 한 번뿐이고,
//   생동감만 그 뒤로 아주 느린 흐름(한 주기 12초 넘게, 장 폭의 2% 안)이 이어진다. 장에 살아 있는 그림(되풀이하는 컴포넌트)이 있으면
//   생동감도 들어오기 한 번 뒤로 멈춘다(계속 움직이는 것은 한 장에 하나). 움직임 없음과 '동작 줄이기'에서는 끝 모습 그대로다.
// - 색은 장의 글자색(currentColor)과 강조색 둘뿐이고 옅게만 쓴다(글이 그 위에서 읽혀야 한다). 번짐 빛, 칠한 면, 그러데이션은 없다.
//   강조색은 씨앗, 닫는 점, 한 가닥처럼 그림의 '답' 한 곳에만.
// - 움직임은 처음부터 직접 만들었다. 이징은 엔진의 쓰임새 표(EASE)와 같은 곡선이다.
//
// 뷰어에는 이 함수와 drawKit의 소스(toString)가 그대로 들어간다. 그래서 바깥의 아무것도 참조하지 않고(받는 것은 kit뿐), 필요한 것은
// 모두 이 함수 안에 둔다. 다른 이름을 바깥에서 가져다 쓰면 빌드가 이름을 바꿔 뷰어에서 찾지 못한다

import type { DrawKit, Paint, Scene } from './draw'

/** 움직임의 한 순간: 들어오기가 시작된 뒤 e ms (끝을 지나면 생동감의 느린 흐름의 때) */
interface Frame {
  e: number
}

interface BackdropRuntime {
  /** 아는 배경 id */
  kinds: string[]
  /** 끝 모습(at을 주면 그 순간)의 SVG 안쪽(path들). 자리 크기는 장 px, strength는 짙기(soft, base, strong) */
  still(kind: string, w: number, h: number, strength?: string, at?: Frame): string
  /**
   * 배경 하나(.s-bd)를 움직인다. level은 none, calm, lively, at은 시작을 늦출 ms. 돌려준 함수를 부르면 멈추고 끝 모습으로.
   * waits가 있으면 들어오기가 끝나는(또는 멈추는) 약속을 넣는다
   */
  play(el: HTMLElement, level: string, at: number, waits?: Promise<void>[]): () => void
  /** 엔진이 장을 움직이며 보내는 알림(mo-backdrop)을 받는다. 한 문서에 한 번 */
  listen(root: Document): void
  /** 들어오기가 끝나는 때(ms, 생동감 기준). 모르는 배경이면 0 */
  endOf(kind: string, w: number, h: number): number
}

export function backdropMotion(kit: DrawKit): BackdropRuntime {
  const { TAU, clamp, lerp, amp, clock, sway, span, every, rng, ellipse, svgPaint } = kit
  const { out, reveal, carry } = kit.ease

  // ======================================================================
  // 배경 일곱. 저마다 '들어올 때 한 번'의 몸짓이 그 분위기의 말이다(docs/MOTION.md 9절의 표)
  // ======================================================================

  /**
   * 확산(한 점에서 바깥으로 번진다): 씨앗에 모인 짙음이 퍼져 나가며 옅어진다. 인쇄의 망점처럼 고른 판의 점 크기가 그 자리의 짙기다.
   * 퍼지는 너비는 시간의 제곱근을 따르고(확산의 물리: 처음에 빠르고 끝에서 느려진다), 퍼진 만큼 가운데가 옅어진다(양이 그대로라서).
   * 퍼지는 동안 가운데가 씨앗에서 조금 비켜 가고(흐르는 물에 떨어진 먹처럼) 씨앗은 제자리라 '여기서 시작해 퍼져 갔다'가 읽힌다.
   * 앞서 나간 알갱이 몇십 개가 망점보다 멀리 가 있고, 퍼지는 앞에는 강조색의 가는 고리가 지나가며 옅어진다.
   * 생동감의 느린 흐름: 알갱이가 아주 조금 떠다니고, 14초마다 옅은 물결이 씨앗에서 바깥으로 6초에 걸쳐 지나간다
   */
  function diffuse(w: number, h: number): Scene {
    const cx = w / 2
    const cy = h / 2
    const s = 0.2 * Math.sqrt(w * h)
    const q = Math.pow(w / h, 0.2)
    const sx = s * q
    const sy = s / q
    // 퍼지는 동안 가운데가 비켜 가는 거리(끝 모습에서)
    const SG0 = Math.sqrt(0.03)
    const DX = 0.16 * sx
    const DY = -0.07 * sy
    // 육각 판: 줄마다 반 칸씩 엇갈린다(망점). 가장 큰 점에서도 이웃과 닿지 않는다
    const pitch = Math.max(18, Math.min(26, Math.sqrt(w * h) / 56))
    const rmax = pitch * 0.4
    const rowH = pitch * 0.866
    const X: number[] = []
    const Y: number[] = []
    for (let r = 0, y = rowH / 2; y < h; r++, y += rowH)
      for (let x = r % 2 ? pitch * 0.75 : pitch * 0.25; x < w; x += pitch) {
        // 끝 모습에서 보이지 않는 먼 점은 처음부터 빼 둔다(들어오는 동안은 끝보다 좁게 퍼져 있다)
        const u = ((x - cx - DX * (1 - SG0)) / sx) ** 2 + ((y - cy - DY * (1 - SG0)) / sy) ** 2
        if (Math.exp(-0.5 * u) < 0.015) continue
        // 씨앗 자리는 비운다: 강조색 씨앗이 그 망점을 대신한다(겹치면 과녁처럼 보인다)
        if (Math.hypot(x - cx, y - cy) < pitch * 0.6) continue
        X.push(x)
        Y.push(y)
      }
    const n = X.length
    // 씨앗이 먼저 맺히고(여기서 시작한다) 그 뒤에 퍼진다. 둘이 함께 나오면 처음부터 덩어리가 터지는 것처럼 보였다(필름)
    const LEAD = 180
    const T = 2450
    // 앞서 나간 알갱이: 멀리 갈수록 늦게 닿는다(거리의 제곱에 비례)
    const R = rng(7)
    const K = 72
    const PA = new Float32Array(K)
    const PR = new Float32Array(K)
    const PT = new Float32Array(K)
    const PP = new Float32Array(K * 3)
    for (let k = 0; k < K; k++) {
      PA[k] = R() * TAU
      PR[k] = 1.7 + 1.4 * Math.pow(R(), 0.8)
      PT[k] = LEAD + 120 + (T * 0.98 * (PR[k] * PR[k])) / (3.1 * 3.1)
      for (let j = 0; j < 3; j++) PP[k * 3 + j] = R()
    }
    const end = Math.max(T, ...PT) + 120
    /** 들어오는 동안의 퍼진 너비(끝을 1로). 시간의 제곱근이라 처음에 빠르고 끝에서 느리게 멈춘다. 처음부터 너비가 있게 0.03에서 */
    const spread = (e: number) => Math.sqrt(0.03 + 0.97 * (1 - Math.pow(1 - clamp((e - LEAD) / T), 2.2)))
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
        const show = span(e, LEAD, 240)
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
          if (r >= 0.45) P.dot(X[i], Y[i], r, 0, 0.22 * show)
        }
        const jig = amp(tau) * 2.4
        for (let k = 0; k < K; k++) {
          const p = span(e, LEAD + 60, PT[k] - LEAD - 60)
          if (p <= 0) continue
          const pe = Math.sqrt(out(p))
          const rr = PR[k] * pe
          // 가늘게 떨며 나가다가 자리에 가까울수록 잦아든다(브라운 운동)
          const wob = 0.12 * (1 - pe) * Math.sin(p * 11 + PP[k * 3] * TAU)
          let x = cx + Math.cos(PA[k] + wob) * rr * sx
          let y = cy + Math.sin(PA[k] + wob) * rr * sy
          if (jig) {
            x += jig * sway(tau, 19000 + PP[k * 3 + 1] * 6000, PP[k * 3 + 2])
            y += jig * sway(tau, 23000 + PP[k * 3 + 2] * 6000, PP[k * 3 + 1])
          }
          P.dot(x, y, 1.5, 0, 0.36 * clamp(p * 4))
        }
        // 퍼지는 앞: 망점이 끝나는 언저리(1.7배 너비)에서 옅어지는 강조색 고리
        if (e > LEAD && e < LEAD + T) ellipse(P, cx + mx, cy + my, 1.7 * sg * sx, 1.7 * sg * sy, 0, TAU, 1.25, 1, 0.45 * Math.pow(1 - (e - LEAD) / T, 1.4) * span(e, LEAD, 200))
        if (wave) ellipse(P, cx + mx, cy + my, wr * sx * sg, wr * sy * sg, 0, TAU, 1, 1, 0.16 * Math.sin(Math.PI * wave[1]))
        // 씨앗: 가장 먼저 서는 강조색 점
        P.dot(cx, cy, 4.5 * out(span(e, 0, 360)), 1, 0.9)
      },
    }
  }

  /**
   * 모여 시작(바깥에서 가운데로 모였다가 고요해진다): 일곱 갈래의 선이 장 밖 여러 곳에서 휘어 들어와 한 원에 비스듬히 닿고,
   * 닿은 자리에서 원을 따라 제 몫(다음 갈래가 닿는 자리까지)만큼 이어 간다. 일곱이 다 닿으면 원이 하나로 닫히고, 강조색 조각이
   * 맨 위에서 한 바퀴 돌아 그 자리에 강조색 점 하나가 남는다(하나가 됐다). 들어온 길은 옅게 남아 멈춘 그림에서도 '여러 곳에서
   * 모여 하나'가 읽힌다. 생동감의 느린 흐름: 15초마다 조각 하나가 한 갈래를 따라 들어와 원에 닿는다(누군가 또 합류한다)
   */
  function gather(w: number, h: number): Scene {
    const R = rng(3)
    const cx = w / 2
    const cy = h / 2
    const Rr = Math.max(110, 0.3 * Math.min(w, h))
    const S = 7
    // 출발점은 자리 바로 밖: 더 멀면 들어오는 시간의 절반을 보이지 않는 곳에서 보낸다
    const far = Math.hypot(w, h) * 0.5 + 40
    const ORDER = [0, 4, 1, 5, 2, 6, 3]
    const D = 1400
    const GAP = 110
    const TH = Array.from({ length: S }, (_, s) => -Math.PI / 2 + (s * TAU) / S + (R() - 0.5) * 0.12)
    const strands = TH.map((th, s) => {
      const arc = (s === S - 1 ? TH[0] + TAU : TH[s + 1]) - th
      // 장 밖의 출발점: 닿는 자리보다 뒤쪽(시계 반대쪽)에서 와서 원을 따라 시계 방향으로 이어진다
      const from = th - 1.05 - R() * 0.35
      const ax = cx + Math.cos(th) * Rr
      const ay = cy + Math.sin(th) * Rr
      const tx = -Math.sin(th)
      const ty = Math.cos(th)
      const sx = cx + Math.cos(from) * far
      const sy = cy + Math.sin(from) * far
      const pts: number[] = []
      // 출발 → 닿는 자리: 3차 곡선, 닿는 자리에서 원의 접선과 같은 쪽으로 들어간다
      const c1x = sx + (cx - sx) * 0.38
      const c1y = sy + (cy - sy) * 0.38
      const c2x = ax - tx * Rr * 0.95
      const c2y = ay - ty * Rr * 0.95
      const N1 = 48
      for (let i = 0; i <= N1; i++) {
        const u = i / N1
        const v = 1 - u
        pts.push(v * v * v * sx + 3 * v * v * u * c1x + 3 * v * u * u * c2x + u * u * u * ax, v * v * v * sy + 3 * v * v * u * c1y + 3 * v * u * u * c2y + u * u * u * ay)
      }
      const onRing = pts.length / 2
      const N2 = 24
      for (let i = 1; i <= N2; i++) {
        const a = th + (arc * i) / N2
        pts.push(cx + Math.cos(a) * Rr, cy + Math.sin(a) * Rr)
      }
      // 길이로 나눈 자리(0~1)마다 점 차례를 찾게 누적 길이를 적어 둔다
      const len = [0]
      for (let i = 2; i < pts.length; i += 2) len.push(len[len.length - 1] + Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]))
      const total = len[len.length - 1]
      return { pts, len, total, ring: len[onRing - 1] / total, t0: 120 + ORDER[s] * GAP }
    })
    type Strand = (typeof strands)[number]
    /** 갈래의 u0~u1(길이 기준 0~1)을 선으로 넣는다 */
    const trace = (P: Paint, st: Strand, u0: number, u1: number) => {
      const a = u0 * st.total
      const b = u1 * st.total
      let first = true
      for (let i = 1; i < st.len.length; i++) {
        const l0 = st.len[i - 1]
        const l1 = st.len[i]
        if (l1 < a) continue
        if (first) {
          const k = clamp((a - l0) / (l1 - l0 || 1))
          P.to(lerp(st.pts[i * 2 - 2], st.pts[i * 2], k), lerp(st.pts[i * 2 - 1], st.pts[i * 2 + 1], k))
          first = false
        }
        if (l1 >= b) {
          const k = clamp((b - l0) / (l1 - l0 || 1))
          P.to(lerp(st.pts[i * 2 - 2], st.pts[i * 2], k), lerp(st.pts[i * 2 - 1], st.pts[i * 2 + 1], k))
          break
        }
        P.to(st.pts[i * 2], st.pts[i * 2 + 1])
      }
    }
    const point = (st: Strand, u: number): [number, number] => {
      const b = u * st.total
      let i = 1
      while (i < st.len.length - 1 && st.len[i] < b) i++
      const k = clamp((b - st.len[i - 1]) / (st.len[i] - st.len[i - 1] || 1))
      return [lerp(st.pts[i * 2 - 2], st.pts[i * 2], k), lerp(st.pts[i * 2 - 1], st.pts[i * 2 + 1], k)]
    }
    const close = 120 + (S - 1) * GAP + D
    const LAP = 800
    const end = close + LAP + 250
    return {
      end,
      draw(P, e, tau) {
        for (const st of strands) {
          const p = reveal(span(e, st.t0, D))
          if (p <= 0) continue
          // 들어온 길(옅게)과 원 위의 몫(조금 짙게: 모여서 된 하나)
          trace(P, st, 0, Math.min(p, st.ring))
          P.stroke(1.1, 0, 0.19)
          if (p > st.ring) {
            trace(P, st, st.ring, p)
            P.stroke(1.6, 0, 0.42)
          }
          // 그어지는 끝: 작은 점이 이끌고, 다 그으면 사라진다
          if (p < 1) {
            const [x, y] = point(st, p)
            P.dot(x, y, 2.6, 0, 0.55 * Math.min(1, p * 6) * Math.min(1, (1 - p) * 8))
          }
        }
        // 닫기: 강조색 조각이 맨 위에서 원을 한 바퀴 돌고 그 자리에 점이 남는다
        const lap = span(e, close, LAP)
        if (lap > 0 && lap < 1) {
          const c = -Math.PI / 2 + TAU * carry(lap)
          ellipse(P, cx, cy, Rr, Rr, c - 0.9, c, 2, 1, 0.85 * Math.sin(Math.PI * lap))
        }
        P.dot(cx, cy - Rr, 4.5 * out(span(e, close + LAP * 0.75, 420)), 1, 0.9)
        // 생동감: 15초마다 조각 하나가 한 갈래를 따라 들어와 원에 닿는다
        const go = every(tau, 3000, 15000, 3600)
        if (go) {
          const st = strands[(go[0] * 3 + 2) % S]
          const u = carry(go[1]) * st.ring
          const [x, y] = point(st, u)
          P.dot(x, y, 2.4, 0, 0.5 * Math.sin(Math.PI * Math.min(1, go[1] * 1.15)))
        }
      },
    }
  }

  /**
   * 흐름(한쪽으로 느리게 흐르는 결): 가는 선 여러 가닥이 왼쪽에서 오른쪽으로 흐르며 한 곳(목)을 지나 다시 퍼진다.
   * 가운데 한 가닥은 강조색(우리가 가는 길). 선은 가운데 가닥부터 바깥으로 차례로 그어지고, 강조색 조각 하나가 그 길을 따라
   * 먼저 지나간다. 생동감의 느린 흐름: 물결이 24초에 한 번 꼴로 옆으로 흘러가고, 13초마다 한 가닥 위로 옅은 조각이 지나간다
   */
  function flow(w: number, h: number): Scene {
    const L = Math.max(9, Math.min(19, Math.round(h / 60)))
    const N = Math.max(24, Math.round(w / 16))
    const mid = (L - 1) / 2
    const main = Math.round(mid)
    const xt = 0.58 * w
    const c = 0.52 * h
    const sg = 0.22 * w
    const amp1 = Math.min(18, h * 0.018)
    const lines = Array.from({ length: L }, (_, i) => ({
      y0: h * (0.06 + (0.88 * i) / Math.max(1, L - 1)),
      a: 0.1 + 0.05 * (((i * 7) % 3) / 2),
      delay: 80 + Math.abs(i - mid) * 70,
    }))
    const G = new Float32Array(N + 1)
    for (let k = 0; k <= N; k++) {
      const g = ((k / N) * w - xt) / sg
      G[k] = Math.exp(-g * g)
    }
    const yAt = (i: number, k: number, ph: number) => {
      const x = k / N
      const g = G[k]
      return c + (lines[i].y0 - c) * (1 - 0.58 * g) + amp1 * Math.sin(TAU * x * 1.15 + i * 0.42 + ph) * (1 - 0.6 * g) + amp1 * 0.35 * Math.sin(TAU * x * 2.7 - i * 0.3 + ph * 1.7)
    }
    const yOf = (i: number, kk: number, ph: number) => {
      const kf = Math.floor(kk)
      return kf >= N ? yAt(i, N, ph) : lerp(yAt(i, kf, ph), yAt(i, kf + 1, ph), kk - kf)
    }
    const DRAW = 1400
    const COMET = 2000
    const end = Math.max(80 + mid * 70 + DRAW, 300 + COMET) + 100
    /** 선 i 위로 x(0~1.15)에 머리가 있는 조각: 짧은 꼬리가 뒤로 옅어진다 */
    const comet = (P: Paint, i: number, head: number, ph: number, tone: number, a: number) => {
      const tail = 150 / w
      for (let seg = 0; seg < 4; seg++) {
        const x1 = Math.min(1, head - (tail * seg) / 4)
        const x0 = Math.max(0, head - (tail * (seg + 1)) / 4)
        if (x1 <= x0) continue
        const k0 = x0 * N
        const k1 = x1 * N
        P.to(x0 * w, yOf(i, k0, ph))
        for (let k = Math.ceil(k0); k < k1; k++) P.to((k / N) * w, yAt(i, k, ph))
        P.to(x1 * w, yOf(i, k1, ph))
        P.stroke(1.6, tone, a * (1 - seg / 4) * 0.9)
      }
      if (head >= 0 && head <= 1) P.dot(head * w, yOf(i, head * N, ph), 2.4, tone, a)
    }
    return {
      end,
      draw(P, e, tau) {
        const ph = (clock(tau) * TAU) / 24000
        for (let i = 0; i < L; i++) {
          const p = reveal(span(e, lines[i].delay, DRAW))
          if (p <= 0) continue
          const kmax = p * N
          for (let k = 0; k < kmax; k++) P.to((k / N) * w, yAt(i, k, ph))
          P.to((kmax / N) * w, yOf(i, kmax, ph))
          if (i === main) P.stroke(1.3, 1, 0.3)
          else P.stroke(1, 0, lines[i].a)
        }
        // 들어올 때 강조색 조각이 가운데 길을 따라 먼저 지나간다
        const cm = span(e, 300, COMET)
        if (cm > 0 && cm < 1) comet(P, main, carry(cm) * 1.12, ph, 1, 0.6 * Math.sin(Math.PI * Math.min(1, cm * 1.25)))
        // 생동감: 13초마다 한 가닥 위로 옅은 조각 하나
        const go = every(tau, 3000, 13000, 4200)
        if (go) comet(P, (go[0] * 5 + 3) % L, carry(go[1]) * 1.15, ph, 0, 0.28)
      },
    }
  }

  /**
   * 깊이(앞뒤 층이 천천히 어긋난다): 땅의 높낮이를 그린 등고선. 낮은 곳(바깥)의 선부터 높은 곳(안쪽)의 선까지 차례로 맺히는데,
   * 높은 층일수록 멀리 비켜 있다가 제자리로 내려앉아 층이 겹겹이 맞춰진다(카메라가 다가가며 깊이가 생기는 것처럼). 가장 높은 층의
   * 선과 꼭대기 점만 강조색(가장 깊이 판 곳). 네 번째 선마다 조금 짙게(지도의 계곡선처럼).
   * 생동감의 느린 흐름: 층이 높이에 비례해 아주 조금(꼭대기가 12px 안) 어긋났다 돌아온다(28초 주기)
   */
  function depth(w: number, h: number): Scene {
    const hyp = Math.sqrt(w * h)
    const hills = [
      [0.68, 0.38, 0.17, 1],
      [0.3, 0.72, 0.13, 0.62],
      [0.86, 0.82, 0.1, 0.45],
      [0.18, 0.2, 0.12, 0.35],
      [0.5, 0.58, 0.22, 0.3],
    ].map(([x, y, s, k]) => ({ x: x * w, y: y * h, s: s * hyp, k }))
    const cell = Math.max(14, Math.min(24, hyp / 60))
    const gw = Math.ceil(w / cell) + 1
    const gh = Math.ceil(h / cell) + 1
    const F = new Float32Array(gw * gh)
    let lo = Infinity
    let hi = -Infinity
    let peak = 0
    for (let j = 0; j < gh; j++)
      for (let i = 0; i < gw; i++) {
        let v = 0
        for (const hl of hills) {
          const ux = i * cell - hl.x
          const uy = j * cell - hl.y
          v += hl.k * Math.exp(-(ux * ux + uy * uy) / (2 * hl.s * hl.s))
        }
        F[j * gw + i] = v
        if (v < lo) lo = v
        if (v > hi) {
          hi = v
          peak = j * gw + i
        }
      }
    const px = (peak % gw) * cell
    const py = Math.floor(peak / gw) * cell
    const L = 12
    const step = (hi - lo) / (L + 1)
    /** 값 v의 선들(이어 붙인 꺾은선, 닫혔는지). 같은 칸 모서리를 지나는 토막끼리 잇는다(정사각 행진) */
    const iso = (v: number): [Float32Array, boolean][] => {
      // 모서리 id: 가로 모서리 (i, j)-(i+1, j)는 2(j*gw+i), 세로 모서리 (i, j)-(i, j+1)은 2(j*gw+i)+1
      const at = (edge: number): [number, number] => {
        const base = edge >> 1
        const i = base % gw
        const j = (base / gw) | 0
        const a0 = F[base]
        const a1 = edge & 1 ? F[base + gw] : F[base + 1]
        const k = (v - a0) / (a1 - a0)
        return edge & 1 ? [i * cell, (j + k) * cell] : [(i + k) * cell, j * cell]
      }
      const link = new Map<number, number[]>()
      const add = (p: number, q: number) => {
        ;(link.get(p) || link.set(p, []).get(p)!).push(q)
        ;(link.get(q) || link.set(q, []).get(q)!).push(p)
      }
      for (let j = 0; j < gh - 1; j++)
        for (let i = 0; i < gw - 1; i++) {
          const b = j * gw + i
          const cs = (F[b] > v ? 1 : 0) | (F[b + 1] > v ? 2 : 0) | (F[b + gw + 1] > v ? 4 : 0) | (F[b + gw] > v ? 8 : 0)
          if (cs === 0 || cs === 15) continue
          const top = 2 * b
          const right = 2 * (b + 1) + 1
          const bottom = 2 * (b + gw)
          const left = 2 * b + 1
          if (cs === 1 || cs === 14) add(left, top)
          else if (cs === 2 || cs === 13) add(top, right)
          else if (cs === 3 || cs === 12) add(left, right)
          else if (cs === 4 || cs === 11) add(right, bottom)
          else if (cs === 6 || cs === 9) add(top, bottom)
          else if (cs === 7 || cs === 8) add(left, bottom)
          else if (cs === 5) {
            add(left, top)
            add(right, bottom)
          } else {
            add(top, right)
            add(left, bottom)
          }
        }
      const seen = new Set<number>()
      const lines: [Float32Array, boolean][] = []
      // 끝이 열린 줄(자리 가장자리에 닿는 선)부터, 그다음 닫힌 고리
      const starts = [...link.keys()].sort((p, q) => (link.get(p)!.length === 1 ? 0 : 1) - (link.get(q)!.length === 1 ? 0 : 1))
      for (const s of starts) {
        if (seen.has(s)) continue
        const pts: number[] = []
        let cur = s
        let prev = -1
        let closed = false
        for (;;) {
          seen.add(cur)
          pts.push(...at(cur))
          const next = link.get(cur)!.find((q) => q !== prev && (!seen.has(q) || (q === s && pts.length > 4)))
          if (next === undefined) break
          if (next === s) {
            closed = true
            break
          }
          prev = cur
          cur = next
        }
        if (pts.length >= 4) lines.push([new Float32Array(pts), closed])
      }
      return lines
    }
    const LEVELS = Array.from({ length: L }, (_, k) => iso(lo + step * (k + 1)))
    const STAG = 140
    const IN = 700
    const end = 100 + (L - 1) * STAG + IN + 150
    return {
      end,
      draw(P, e, tau) {
        // 가장 높은 층이 비켜 있는 거리. 높이에 비례해 층마다 덜 비켜 있다
        const far = Math.min(w, h) * 0.05
        const drift = amp(tau) * 12
        const dx = drift ? sway(tau, 28000, 0.25) : 0
        const dy = drift ? sway(tau, 36000, 0.6) : 0
        for (let k = 0; k < L; k++) {
          const p = span(e, 100 + k * STAG, IN)
          if (p <= 0) continue
          const z = (k + 1) / L
          const settle = 1 - out(p)
          const ox = (far * settle + drift * dx) * z
          const oy = (-far * 0.6 * settle + drift * dy * 0.7) * z
          const top = k === L - 1
          const index = k % 4 === 3
          for (const [pts, closed] of LEVELS[k]) {
            for (let i = 0; i < pts.length; i += 2) P.to(pts[i] + ox, pts[i + 1] + oy)
            if (top) P.stroke(1.3, 1, 0.42 * clamp(p * 1.6), closed)
            else P.stroke(index ? 1.5 : 1, 0, (index ? 0.17 : 0.11) * clamp(p * 1.6), closed)
          }
        }
        const pk = span(e, end - 450, 420)
        P.dot(px + drift * dx, py + drift * dy * 0.7, 3.5 * out(pk), 1, 0.85)
      },
    }
  }

  /**
   * 구조(눈금과 격자가 맞춰진다): 옅고 성긴 점의 판이 비스듬히 깔리고, 그 위 오른쪽 위에 칸 묶음(모듈)이 하나씩 촘촘한 점으로 채워지며
   * 구조가 선다. 마지막 묶음은 강조색(핵심). 점만으로 짜서 상자나 선은 없다. 묶음은 위 줄부터 짜 올리듯 채워지고 점이 딸깍 맞춰진다.
   * 다 맞춰진 뒤에는 움직이지 않는다(맞춰졌다는 고요가 이 분위기의 말이다)
   */
  function structure(w: number, h: number): Scene {
    const p = 44
    const cols = Math.max(4, Math.floor(w / p))
    const rows = Math.max(3, Math.floor(h / p))
    const ox = (w - (cols - 1) * p) / 2
    const oy = (h - (rows - 1) * p) / 2
    // 묶음: 판의 칸에 맞춘 네모. 오른쪽 위에 모아 둔다: 장의 제목은 왼쪽 위, 본문은 가운데 띠에 놓이는 장이 많아서
    // 그 둘을 비운다(가운데 오른쪽에 두던 때는 핵심 숫자 장의 숫자 뒤에 점 묶음이 깔려 글과 다투었다, 필름). 마지막이 강조색
    const MODS = [
      [0.62, 0.06, 0.8, 0.28],
      [0.83, 0.06, 0.89, 0.28],
      [0.62, 0.31, 0.89, 0.35],
      [0.92, 0.06, 0.96, 0.16],
    ].map(([x0, y0, x1, y1]) => {
      const c0 = Math.round(x0 * (cols - 1))
      const r0 = Math.round(y0 * (rows - 1))
      return { c0, r0, c1: Math.max(c0 + 1, Math.round(x1 * (cols - 1))), r1: Math.max(r0 + 1, Math.round(y1 * (rows - 1))) }
    })
    const BX: number[] = []
    const BY: number[] = []
    const BU: number[] = []
    const inMod = (c: number, r: number) => MODS.some((m) => c >= m.c0 && c <= m.c1 && r >= m.r0 && r <= m.r1)
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        if (inMod(c, r)) continue
        BX.push(ox + c * p)
        BY.push(oy + r * p)
        BU.push((c / cols) * 0.6 + (r / rows) * 0.4)
      }
    const MX: number[] = []
    const MY: number[] = []
    const MK: number[] = []
    const MW: number[] = []
    const START = 650
    const STEP = 280
    MODS.forEach((m, k) => {
      const nr = (m.r1 - m.r0) * 2 + 1
      for (let j = 0; j < nr; j++)
        for (let i = 0; i <= (m.c1 - m.c0) * 2; i++) {
          MX.push(ox + m.c0 * p + (i * p) / 2)
          MY.push(oy + m.r0 * p + (j * p) / 2)
          MK.push(k)
          // 묶음 안은 위 줄부터 차례로, 줄 안은 왼쪽부터 조금씩 늦게 (짜 올리듯)
          MW.push(START + k * STEP + (j / nr) * 360 + i * 6)
        }
    })
    const IN = 360
    const end = Math.max(...MW) + IN + 100
    const last = MODS.length - 1
    return {
      end,
      draw(P, e) {
        for (let i = 0; i < BX.length; i++) {
          const show = span(e, 40 + BU[i] * 700, 420)
          if (show > 0) P.dot(BX[i], BY[i], 1.3, 0, 0.16 * show)
        }
        for (let i = 0; i < MX.length; i++) {
          const k = span(e, MW[i], IN)
          if (k <= 0) continue
          // 맞춰지기: 조금 크게 나타났다가 제 크기로 줄어 앉는다(넘치지 않는다)
          const size = 1 + 0.45 * (1 - out(k))
          const accent = MK[i] === last
          P.dot(MX[i], MY[i], (accent ? 2.5 : 2.1) * size, accent ? 1 : 0, (accent ? 0.6 : 0.34) * clamp(k * 2.5))
        }
      },
    }
  }

  /**
   * 여운(아주 느리게 옅어지며 가라앉는다): 가는 선 스무여 가닥이 한 띠를 이루어 장을 가로지르며 굽이친다. 띠가 비틀리는 자리에서는
   * 선들이 한 줄로 모였다가 다시 벌어져, 얇은 천이 뒤집히듯 깊이가 생긴다. 들어올 때 왼쪽에서부터 펼쳐지며 비틀림이 생기고,
   * 다 펼쳐지면 조금 아래로 가라앉으며 옅어져 쉰다. 생동감의 느린 흐름: 비틀림이 32초에 한 번 조금 오간다(장 폭의 2% 안)
   */
  function linger(w: number, h: number): Scene {
    const M = 22
    const N = Math.max(32, Math.round(w / 16))
    const cy = h * 0.58
    const A1 = h * 0.11
    const A2 = h * 0.035
    const W = Math.min(h * 0.2, 220)
    const DRAW = 1800
    const SINK = 1100
    const settleAt = 1500
    const end = settleAt + SINK + 100
    return {
      end,
      draw(P, e, tau) {
        // 생동감의 흐름: 비틀림이 ±0.35rad 안에서 32초에 한 번 오간다(띠의 점이 장 폭의 2% 안에서 움직인다).
        // 비틀림이 끝없이 돌게 두던 때는 띠가 너비만큼(장 폭의 5% 넘게) 오르내려 배경이 아니라 움직이는 그림이 되었다
        const ph = 0.35 * Math.sin((clock(tau) * TAU) / 32000)
        // 들어올 때 비틀림이 납작한 띠에서 생기고, 다 펼쳐지면 띠 높이의 3%만큼 가라앉으며 3분의 1 옅어진다
        const twist = out(span(e, 250, 2000))
        const sink = out(span(e, settleAt, SINK))
        const fall = sink * h * 0.03
        const fade = 1.45 - 0.45 * sink
        for (let i = 0; i < M; i++) {
          const p = reveal(span(e, i * 12, DRAW))
          if (p <= 0) continue
          const o = i / (M - 1) - 0.5
          const kmax = p * N
          const yAt = (kk: number) => {
            const t = kk / N
            const c = cy + fall + A1 * Math.sin(TAU * t * 0.8 + 0.6 - ph * 0.5) + A2 * Math.sin(TAU * t * 1.9 + 1.3 + ph * 0.8)
            const th = lerp(0, TAU * t * 0.95 + 0.4 - ph, twist)
            const width = W * (0.78 + 0.22 * Math.sin(TAU * t * 0.6 + 2.1))
            return c + o * width * Math.cos(th) + o * width * 0.18 * Math.sin(th)
          }
          for (let k = 0; k < kmax; k++) P.to((k / N) * w, yAt(k))
          P.to((kmax / N) * w, yAt(kmax))
          P.stroke(1, 0, (Math.abs(o) > 0.45 ? 0.15 : 0.08) * fade)
        }
      },
    }
  }

  /**
   * 연결(점과 점 사이에 선이 이어진다): 바닥선 위 왼쪽 무리와 오른쪽 무리의 점들이 서고, 활 모양의 가는 선이 짧은 짝부터 긴 짝까지
   * 하나씩 그어져 두 쪽을 잇는다. 너비가 다른 활이 엇갈려 짜인 그물처럼 보인다. 가운데 한 가닥은 강조색이고, 다 이어지면 그 위로
   * 조각 하나가 건너간다(전해진다). 생동감의 느린 흐름: 13초마다 한 가닥 위로 옅은 조각이 건너간다
   */
  function link(w: number, h: number): Scene {
    const R = rng(13)
    const n = 9
    const base = h * 0.86
    const left = Array.from({ length: n }, (_, k) => w * (0.1 + (0.3 * k) / (n - 1)))
    const right = Array.from({ length: n }, (_, k) => w * (0.6 + (0.3 * k) / (n - 1)))
    const arcs: { a: number; b: number; delay: number; accent: boolean }[] = []
    // 짝: 왼쪽의 점마다 오른쪽의 점 하나(차례를 섞어서), 둘에 하나는 하나 더. 겹겹의 무지개가 되지 않게 너비가 엇갈린다
    for (let k = 0; k < n; k++) {
      arcs.push({ a: left[k], b: right[(k * 4 + 1) % n], delay: 0, accent: k === Math.floor(n / 2) })
      if (k % 2 === 0) arcs.push({ a: left[k], b: right[(k * 2 + 5) % n], delay: 0, accent: false })
    }
    arcs.sort((x, y) => x.b - x.a - (y.b - y.a) || R() - 0.5)
    const DRAW = 1000
    const GAP = 55
    arcs.forEach((a, k) => (a.delay = 320 + k * GAP))
    const accentArc = arcs.find((a) => a.accent)!
    const drawn = 320 + (arcs.length - 1) * GAP + DRAW
    const BEAD = 1000
    const end = drawn - 150 + BEAD + 100
    const top = h * 0.8
    /** 활 위 u(0~1)의 자리. 높이는 두 점 사이 거리에 비례하고 자리 높이를 넘지 않는다 */
    const pt = (a: (typeof arcs)[number], u: number): [number, number] => {
      const r = (a.b - a.a) / 2
      const t = Math.PI * (1 - u)
      return [(a.a + a.b) / 2 + Math.cos(t) * r, base - Math.sin(t) * Math.min(top, r * 0.9)]
    }
    return {
      end,
      draw(P, e, tau) {
        for (let k = 0; k < n; k++) {
          P.dot(left[k], base, 2.6 * out(span(e, 60 + (n - 1 - k) * 30, 360)), 0, 0.42)
          P.dot(right[k], base, 2.6 * out(span(e, 60 + k * 30, 360)), 0, 0.42)
        }
        for (const a of arcs) {
          const p = reveal(span(e, a.delay, DRAW))
          if (p <= 0) continue
          const steps = Math.max(2, Math.ceil(56 * p))
          for (let k = 0; k <= steps; k++) {
            const [x, y] = pt(a, (p * k) / steps)
            P.to(x, y)
          }
          if (a.accent) P.stroke(1.4, 1, 0.45)
          else P.stroke(1, 0, 0.12 + 0.06 * ((a.b - a.a) / w))
        }
        const b = span(e, drawn - 150, BEAD)
        if (b > 0 && b < 1) {
          const [x, y] = pt(accentArc, carry(b))
          P.dot(x, y, 3, 1, 0.8 * Math.sin(Math.PI * b))
        }
        const go = every(tau, 3000, 13000, 2800)
        if (go) {
          const [x, y] = pt(arcs[(go[0] * 5 + 2) % arcs.length], carry(go[1]))
          P.dot(x, y, 2.4, 0, 0.45 * Math.sin(Math.PI * go[1]))
        }
      },
    }
  }

  const KINDS: Record<string, (w: number, h: number) => Scene> = { diffuse, gather, flow, depth, structure, linger, link }
  /** 짙기: 옅게, 보통, 또렷하게. 강조색과 글자색 모두에 곱한다 */
  const STRENGTH: Record<string, number> = { soft: 0.6, base: 1, strong: 1.45 }

  /**
   * 배경 하나의 그림. 그리는 함수는 값을 바꾸지 않아서 같은 배경, 같은 크기는 한 번만 만든다: 등고선은 만드는 데 3ms(CPU 4배 느림에서
   * 12ms 남짓)라, 장을 넘기는 첫 프레임에 만들면 그 프레임이 길어진다. 끝 모습(still)을 그릴 때 이미 만들어 둔다
   */
  const scenes = new Map<string, Scene>()
  function sceneOf(kind: string, w: number, h: number): Scene | null {
    const make = Object.hasOwn(KINDS, kind) ? KINDS[kind] : null
    if (!make || !(w > 0) || !(h > 0)) return null
    const key = `${kind}|${Math.round(w)}|${Math.round(h)}`
    let sc = scenes.get(key)
    if (!sc) {
      sc = make(Math.round(w), Math.round(h))
      scenes.set(key, sc)
    }
    return sc
  }

  const stills = new Map<string, string>()
  function still(kind: string, w: number, h: number, strength = 'base', at?: Frame): string {
    const key = `${kind}|${Math.round(w)}|${Math.round(h)}|${strength}`
    let s = at ? undefined : stills.get(key)
    if (s !== undefined) return s
    const sc = sceneOf(kind, w, h)
    if (!sc) return ''
    const P = svgPaint(STRENGTH[strength] ?? 1)
    // 때를 주면 그 순간(들어오기의 ms, 끝을 지나면 생동감의 느린 흐름)을 그린다: 갤러리에서 움직임을 한 장씩 늘어놓아 볼 때
    if (at) sc.draw(P, Math.min(sc.end, at.e), Math.max(0, at.e - sc.end))
    else sc.draw(P, sc.end, 0)
    s = P.markup()
    if (!at) stills.set(key, s)
    return s
  }

  // ---------- 움직이기 ----------
  /**
   * 되풀이하는 컴포넌트(살아 있는 그림). 이것이 있는 장에서는 배경이 들어오기 한 번 뒤로 멈춘다(계속 움직이는 것은 한 장에 하나).
   * 모이고 퍼지기는 늘, 나머지는 생동감에서만 되풀이한다(docs/MOTION.md '살아 있는 그림')
   */
  const LIVING = '.bk[data-type="hub"]'
  const LIVING_LIVELY = ['flow', 'network', 'cycle', 'decision', 'whys', 'steps'].map((t) => `.bk[data-type="${t}"]`).join(',')
  /**
   * 바로 앞 장에서 멈춘 배경. 다음 장도 같은 배경(같은 그림, 같은 자리)이면 들어오기를 다시 하지 않고 머물던 모습에서 이어 간다.
   * 장을 넘길 때마다 같은 배경이 처음부터 다시 퍼지면 배경이 아니라 장마다의 장식처럼 보인다
   */
  let last: { sig: string; tau: number; at: number } | null = null
  const running = new WeakMap<HTMLElement, () => void>()

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
    // 생동감의 느린 흐름은 장에 되풀이하는 컴포넌트가 없을 때만
    const flows = lively && !slide?.querySelector(`${LIVING},${LIVING_LIVELY}`)
    // 이어 가는데 흐름도 없으면 그릴 것이 없다: 끝 모습 그대로
    if (carried >= 0 && !flows) return () => leave(0)
    const sc = sceneOf(kind, w, h)
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
      accentClass: 'bd-a',
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

  return { kinds: Object.keys(KINDS), still, play, listen, endOf: (kind, w, h) => sceneOf(kind, w, h)?.end ?? 0 }
}

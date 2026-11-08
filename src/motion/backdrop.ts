// 배경: 장의 글과 컴포넌트 뒤에 까는 잔잔한 그래픽과 그 움직임. 앱의 발표 화면과 내보낸 HTML의 뷰어가 똑같이 쓴다.
// 기준은 docs/MOTION.md의 '9. 바탕 움직임'이다: 분위기 일곱(확산, 모여 시작, 흐름, 깊이, 구조, 여운, 연결)이 곧 배경 일곱이다.
//
// - 배경마다 '때 e의 모습'을 그리는 그림 하나(Scene)다. 끝 모습(들어오기가 끝나고 머무는 모습)은 이 그림으로 SVG를 만들어 장에 넣고
//   (편집 화면, 목록 그림, PDF, PPT, 내보낸 HTML의 처음 모습), 발표할 때는 같은 그림을 캔버스에 프레임마다 그린다.
//   그래서 움직임이 끝난 모습과 멈춘 그림이 같다. 숫자 하나, 글 한 줄 없이 자리의 크기만으로 그린다.
//   그리는 도구(시간의 순수 함수, SVG와 캔버스 그리기, 캔버스 재생기)는 motion/draw.ts에 있고 인자(kit)로 받는다.
//   여기에는 배경 일곱의 그림과 배경만의 규칙(세기, 이어지는 장, 살아 있는 그림이 있는 장)만 둔다
// - 움직임: 장이 나올 때 한 번 들어오고(엔진이 mo-backdrop으로 알린다, motion/engine.ts) 2초 남짓에 가라앉는다(장의 글보다 늦게 끝나
//   마지막 박자를 가져가지 않게). 차분하게는 그 한 번뿐이고,
//   생동감만 그 뒤로 아주 느린 흐름(한 주기 12초 넘게, 장 폭의 2% 안)이 이어진다. 장에 살아 있는 그림(되풀이하는 컴포넌트)이 있으면
//   생동감도 들어오기 한 번 뒤로 멈춘다(계속 움직이는 것은 한 장에 하나). 움직임 없음과 '동작 줄이기'에서는 끝 모습 그대로다.
// - 색은 장의 글자색(currentColor) 하나이고 옅게만 쓴다(글이 그 위에서 읽혀야 한다). 강조색은 쓰지 않는다: 강조색은 장의 답에만
//   쓰는데(AGENTS.md), 배경에 강조색 씨앗, 고리, 가닥을 두던 때는 장마다 강조가 두 곳이 되어 답이 흐려졌다(검수).
//   번짐 빛, 칠한 면, 그러데이션은 없다. 글 칸 둘레에서는 배경이 비켜 옅어진다(clear: 글이 놓인 자리를 재서 마스크로)
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
  /** 장(.slide)의 글이 놓인 자리를 재서, 그 둘레에서 배경이 비켜 옅어지게 한다(마스크). 배경이 없거나 그리지 않은 장이면 그대로 */
  clear(slide: Element): void
}

export function backdropMotion(kit: DrawKit): BackdropRuntime {
  const { TAU, clamp, lerp, amp, clock, sway, span, every, rng, svgPaint } = kit
  const { out, reveal, carry } = kit.ease

  // ======================================================================
  // 배경 일곱. 저마다 '들어올 때 한 번'의 몸짓이 그 분위기의 말이다(docs/MOTION.md 9절의 표)
  // ======================================================================

  /**
   * 확산(한 점에서 바깥으로 번진다): 한 점에 모인 짙음이 퍼져 나가며 옅어진다. 인쇄의 망점처럼 고른 판의 점 크기가 그 자리의 짙기다.
   * 퍼지는 너비는 시간의 제곱근을 따르고(확산의 물리: 처음에 빠르고 끝에서 느려진다), 퍼진 만큼 가운데가 옅어진다(양이 그대로라서).
   * 퍼지는 동안 가운데가 시작한 점에서 조금 비켜 간다(흐르는 물에 떨어진 먹처럼). 글자색 하나로만 그린다: 강조색 씨앗과 고리,
   * 멀리 흩어진 알갱이를 두던 때는 씨앗이 죽은 화소처럼, 알갱이가 먼지처럼 보였다(검수). 망점을 크고 짙게(0.17) 두던 때는 흰 바탕의
   * 표지에서 망점 면이 제목보다 무거웠고, 처음 0.15초에 이미 덩어리가 서 있어 '번진다'가 약했다(검수): 점을 줄이고 옅게, 처음을 작게.
   * 생동감의 느린 흐름: 14초마다 옅은 물결이 가운데에서 바깥으로 6초에 걸쳐 지나가며 망점이 조금 커졌다 돌아온다
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
    const rmax = pitch * 0.3
    const rowH = pitch * 0.866
    const X: number[] = []
    const Y: number[] = []
    for (let r = 0, y = rowH / 2; y < h; r++, y += rowH)
      for (let x = r % 2 ? pitch * 0.75 : pitch * 0.25; x < w; x += pitch) {
        // 끝 모습에서 보이지 않는 먼 점은 처음부터 빼 둔다(들어오는 동안은 끝보다 좁게 퍼져 있다)
        const u = ((x - cx - DX * (1 - SG0)) / sx) ** 2 + ((y - cy - DY * (1 - SG0)) / sy) ** 2
        if (Math.exp(-0.5 * u) < 0.015) continue
        X.push(x)
        Y.push(y)
      }
    const n = X.length
    const T = 1700
    const end = T + 100
    /**
     * 들어오는 동안의 퍼진 너비(끝을 1로). 넓이(제곱)가 드러내기 곡선을 따라 한 점(0.03)에서 넓어진다: 처음 한순간은 작은 덩어리로 머물다
     * 번지고 끝에서 느리게 멈춘다
     */
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
          if (r >= 0.45) P.dot(X[i], Y[i], r, 0, 0.13 * show)
        }
      },
    }
  }

  /**
   * 모여 시작(바깥에서 가운데로 모였다가 고요해진다): 일곱 갈래의 가는 선이 자리의 왼쪽 위, 왼쪽, 왼쪽 아래 가장자리에서 휘어 들어와
   * 한 점에서 만나 하나의 줄기가 되고, 그 줄기가 오른쪽으로 뻗어 나간다(여럿이 모여 하나로 시작한다). 줄기는 갈래보다 조금 짙다.
   * 갈래가 다 닿기 조금 전에 줄기가 떠나 넘겨주기가 된다. 빈 원으로 모이던 때는 불러오는 중 표시나 로고 자리처럼 읽혔다(검수).
   * 생동감의 느린 흐름: 15초마다 옅은 조각 하나가 한 갈래를 따라 들어와 줄기를 타고 나간다(또 합류한다)
   */
  function gather(w: number, h: number): Scene {
    const R = rng(3)
    const mx = 0.44 * w
    const my = 0.6 * h
    const S = 7
    const ORDER = [3, 0, 5, 2, 6, 1, 4]
    const D = 1000
    const GAP = 70
    /** 갈래 하나: 점의 줄(길이 기준 0~1로 찾게 누적 길이도) */
    const build = (pts: number[]) => {
      const len = [0]
      for (let i = 2; i < pts.length; i += 2) len.push(len[len.length - 1] + Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]))
      return { pts, len, total: len[len.length - 1] }
    }
    const strands = Array.from({ length: S }, (_, s) => {
      // 만나는 점에서 왼쪽으로 부채꼴(110°~250°)
      const th = (Math.PI * (110 + (140 * s) / (S - 1)) + (R() - 0.5) * 10 * Math.PI) / 180
      const dx = Math.cos(th)
      const dy = Math.sin(th)
      // 자리 가장자리 바로 밖에서 출발한다(더 멀면 들어오는 동안 보이지 않는다)
      const tx = dx < 0 ? -mx / dx : (w - mx) / dx
      const ty = dy < 0 ? -my / dy : dy > 0 ? (h - my) / dy : Infinity
      const far = Math.min(tx, ty) + 30
      const sx = mx + dx * far
      const sy = my + dy * far
      // 만나는 점에서 줄기와 같은 쪽(오른쪽)을 보며 들어간다: 부드럽게 합쳐진다
      const bend = (R() - 0.5) * 0.25 * far
      const c1x = sx + (mx - sx) * 0.4 - dy * bend
      const c1y = sy + (my - sy) * 0.4 + dx * bend
      const c2x = mx - far * 0.35
      const c2y = my
      const pts: number[] = []
      const N = 40
      for (let i = 0; i <= N; i++) {
        const u = i / N
        const v = 1 - u
        pts.push(v * v * v * sx + 3 * v * v * u * c1x + 3 * v * u * u * c2x + u * u * u * mx, v * v * v * sy + 3 * v * v * u * c1y + 3 * v * u * u * c2y + u * u * u * my)
      }
      return { ...build(pts), t0: 80 + ORDER[s] * GAP }
    })
    // 줄기: 만나는 점에서 오른쪽 끝까지, 아주 조금 휘며
    const trunk = (() => {
      const pts: number[] = []
      const N = 40
      for (let i = 0; i <= N; i++) {
        const u = i / N
        const x = mx + (w + 30 - mx) * u
        pts.push(x, my - Math.sin(Math.PI * u) * h * 0.03)
      }
      return build(pts)
    })()
    type Line = typeof trunk
    const trace = (P: Paint, ln: Line, u1: number) => {
      const b = u1 * ln.total
      P.to(ln.pts[0], ln.pts[1])
      for (let i = 1; i < ln.len.length; i++) {
        if (ln.len[i] >= b) {
          const k = clamp((b - ln.len[i - 1]) / (ln.len[i] - ln.len[i - 1] || 1))
          P.to(lerp(ln.pts[i * 2 - 2], ln.pts[i * 2], k), lerp(ln.pts[i * 2 - 1], ln.pts[i * 2 + 1], k))
          return
        }
        P.to(ln.pts[i * 2], ln.pts[i * 2 + 1])
      }
    }
    const point = (ln: Line, u: number): [number, number] => {
      const b = u * ln.total
      let i = 1
      while (i < ln.len.length - 1 && ln.len[i] < b) i++
      const k = clamp((b - ln.len[i - 1]) / (ln.len[i] - ln.len[i - 1] || 1))
      return [lerp(ln.pts[i * 2 - 2], ln.pts[i * 2], k), lerp(ln.pts[i * 2 - 1], ln.pts[i * 2 + 1], k)]
    }
    // 줄기는 갈래 넷째가 닿을 즈음 떠난다(넘겨주기)
    const TRUNK = 80 + 3 * GAP + D * 0.8
    const TD = 800
    const end = Math.max(TRUNK + TD, 80 + (S - 1) * GAP + D) + 100
    return {
      end,
      draw(P, e, tau) {
        for (const st of strands) {
          const p = reveal(span(e, st.t0, D))
          if (p <= 0) continue
          trace(P, st, p)
          P.stroke(1.1, 0, 0.16)
        }
        const t = reveal(span(e, TRUNK, TD))
        if (t > 0) {
          trace(P, trunk, t)
          P.stroke(1.6, 0, 0.3)
        }
        // 생동감: 15초마다 옅은 조각 하나가 한 갈래를 따라 들어와 줄기를 타고 나간다
        const go = every(tau, 3000, 15000, 4200)
        if (go) {
          const st = strands[(go[0] * 3 + 2) % S]
          const u = carry(go[1]) * 2
          const [x, y] = u < 1 ? point(st, u) : point(trunk, u - 1)
          P.dot(x, y, 2.2, 0, 0.4 * Math.sin(Math.PI * go[1]))
        }
      },
    }
  }

  /**
   * 흐름(한쪽으로 느리게 흐르는 결): 가는 선 여러 가닥이 왼쪽에서 오른쪽으로 흐르며 한 곳(목)을 지나 다시 퍼진다.
   * 가운데 한 가닥만 조금 짙다(우리가 가는 길). 선은 가운데 가닥부터 바깥으로 차례로 왼쪽에서 그어진다.
   * 생동감의 느린 흐름: 물결이 24초에 한 번 꼴로 옆으로 흘러가고, 13초마다 한 가닥 위로 옅은 조각이 지나간다
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
      delay: 60 + Math.abs(i - mid) * 45,
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
    const DRAW = 1100
    const end = 60 + mid * 45 + DRAW + 100
    /** 선 i 위로 x(0~1.15)에 머리가 있는 조각: 짧은 꼬리가 뒤로 옅어진다 */
    const comet = (P: Paint, i: number, head: number, ph: number, a: number) => {
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
        P.stroke(1.6, 0, a * (1 - seg / 4) * 0.9)
      }
      if (head >= 0 && head <= 1) P.dot(head * w, yOf(i, head * N, ph), 2.4, 0, a)
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
          // 가운데 가닥만 조금 짙고 굵게(우리가 가는 길). 강조색은 쓰지 않는다: 답은 장의 글과 데이터에 있다
          if (i === main) P.stroke(1.3, 0, 0.2)
          else P.stroke(1, 0, lines[i].a)
        }
        // 생동감: 13초마다 한 가닥 위로 옅은 조각 하나
        const go = every(tau, 3000, 13000, 4200)
        if (go) comet(P, (go[0] * 5 + 3) % L, carry(go[1]) * 1.15, ph, 0.24)
      },
    }
  }

  /**
   * 깊이(앞뒤 층이 천천히 어긋난다): 땅의 높낮이를 그린 등고선. 낮은 곳(바깥)의 선부터 높은 곳(안쪽)의 선까지 차례로 맺히는데,
   * 높은 층일수록 멀리 비켜 있다가 제자리로 내려앉아 층이 겹겹이 맞춰진다(카메라가 다가가며 깊이가 생기는 것처럼). 네 번째 선마다
   * 조금 짙게(지도의 계곡선처럼). 꼭대기에 강조색 고리와 점을 두던 때는 숫자 옆의 과녁처럼 읽혔고, 답이 맺힌 뒤에 나타나 마지막
   * 박자를 가져갔다(검수).
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
        if (v > hi) hi = v
      }
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
    const STAG = 90
    const IN = 650
    const end = 80 + (L - 1) * STAG + IN + 100
    return {
      end,
      draw(P, e, tau) {
        // 가장 높은 층이 비켜 있는 거리. 높이에 비례해 층마다 덜 비켜 있다
        const far = Math.min(w, h) * 0.05
        const drift = amp(tau) * 12
        const dx = drift ? sway(tau, 28000, 0.25) : 0
        const dy = drift ? sway(tau, 36000, 0.6) : 0
        for (let k = 0; k < L; k++) {
          const p = span(e, 80 + k * STAG, IN)
          if (p <= 0) continue
          const z = (k + 1) / L
          const settle = 1 - out(p)
          const ox = (far * settle + drift * dx) * z
          const oy = (-far * 0.6 * settle + drift * dy * 0.7) * z
          const index = k % 4 === 3
          for (const [pts, closed] of LEVELS[k]) {
            for (let i = 0; i < pts.length; i += 2) P.to(pts[i] + ox, pts[i + 1] + oy)
            P.stroke(index ? 1.5 : 1, 0, (index ? 0.17 : 0.11) * clamp(p * 1.6), closed)
          }
        }
      },
    }
  }

  /**
   * 구조(눈금과 격자가 맞춰진다): 점들이 조금씩 어긋난 자리에서 나타나 비스듬한 물결을 따라 고른 격자로 맞춰진다. 오른쪽 위가 짙고
   * 왼쪽 아래로 갈수록 옅어져(대개 제목과 본문이 놓이는 쪽) 모눈종이처럼 장을 덮지 않는다. 다 맞춰진 뒤에는 움직이지 않는다(맞춰졌다는
   * 고요가 이 분위기의 말이다). 네 칸마다의 교차점은 점 대신 작은 십자(눈금)라 도면의 격자처럼 읽힌다. 칸 묶음을 촘촘한 점으로
   * 채우던 때는 막대 그래프처럼 읽혀 숫자 장에서 '저건 뭐냐'를 불렀다(검수). 점만 1.5px로 두던 때는 검은 테마의 필름에서 보이지 않았다
   */
  function structure(w: number, h: number): Scene {
    const R = rng(11)
    const p = 40
    const cols = Math.max(4, Math.floor(w / p))
    const rows = Math.max(3, Math.floor(h / p))
    const ox = (w - (cols - 1) * p) / 2
    const oy = (h - (rows - 1) * p) / 2
    const X: number[] = []
    const Y: number[] = []
    const A: number[] = []
    const JX: number[] = []
    const JY: number[] = []
    const WAIT: number[] = []
    const MAJOR: boolean[] = []
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const xn = c / Math.max(1, cols - 1)
        const yn = r / Math.max(1, rows - 1)
        // 오른쪽 위에서 멀어질수록 옅게
        const g = Math.exp(-((1 - xn) ** 2 + yn ** 2) / (2 * 0.42 * 0.42))
        const a = 0.06 + 0.24 * g
        if (a < 0.075) continue
        X.push(ox + c * p)
        MAJOR.push(c % 4 === 0 && r % 4 === 0)
        Y.push(oy + r * p)
        A.push(a)
        const ang = R() * TAU
        const off = p * (0.25 + 0.3 * R())
        JX.push(Math.cos(ang) * off)
        JY.push(Math.sin(ang) * off)
        // 오른쪽 위에서 왼쪽 아래로 비스듬히 맞춰져 간다
        WAIT.push(60 + ((1 - xn) * 0.55 + yn * 0.45) * 650)
      }
    const IN = 650
    const end = Math.max(...WAIT) + IN + 80
    return {
      end,
      draw(P, e) {
        for (let i = 0; i < X.length; i++) {
          const k = span(e, WAIT[i], IN)
          if (k <= 0) continue
          const m = 1 - out(k)
          const x = X[i] + JX[i] * m
          const y = Y[i] + JY[i] * m
          const a = A[i] * clamp(k * 3)
          if (!MAJOR[i]) {
            P.dot(x, y, 1.8, 0, a)
            continue
          }
          // 눈금: 팔이 맞춰지며 자란다
          const arm = 7 * out(k)
          P.to(x - arm, y)
          P.to(x + arm, y)
          P.stroke(1, 0, a)
          P.to(x, y - arm)
          P.to(x, y + arm)
          P.stroke(1, 0, a)
        }
      },
    }
  }

  /**
   * 여운(아주 느리게 옅어지며 가라앉는다): 퉁긴 줄의 울림이 잦아드는 모습. 가는 줄 하나가 퉁겨진 모양으로 나타나 느리게 떨다가
   * 가라앉고, 조금 뒤 아래의 짧고 옅은 줄 하나(메아리)가 더 작게 떨다 가라앉는다. 떨림은 줄의 고유한 떨기 셋(기본과 두 배, 세 배)을
   * 겹친 것이고 높은 떨기일수록 빨리 잦아든다(실제 줄처럼). 떨리는 동안 조금 짙다가 가라앉으며 제 짙기로 옅어진다. 쉬는 줄은 아주
   * 조금 처지고 끝으로 갈수록 가늘게 사라진다. 두 줄은 90px 넘게 떨어져 겹선이 되지 않는다.
   * 가는 선 여섯을 겹쳐 두던 때는 40px 안의 겹선 다발이라 공책 줄이나 화면 줄무늬로 읽혔고, 작은 점을 흩어 가라앉히던 때는 먼지처럼
   * 보였다(검수, 필름).
   * 생동감의 느린 흐름: 14초마다 위의 줄에 아주 작은 떨림(3px 안)이 한 번 지나간다
   */
  function linger(w: number, h: number): Scene {
    const amp0 = Math.min(34, h * 0.05)
    const strings = [
      { y: h * 0.48, a0: w * 0.06, a1: w * 0.94, amp: amp0, p: 0.37, t0: 80, alpha: 0.22, sag: h * 0.012 },
      { y: h * 0.48 + Math.max(90, h * 0.15), a0: w * 0.22, a1: w * 0.82, amp: amp0 * 0.55, p: 0.64, t0: 360, alpha: 0.13, sag: h * 0.008 },
    ]
    // 기본 떨기(초에 1.3번)와 잦아드는 빠르기(ms). 1.5초면 처음 떨림의 3% 아래로 가라앉는다
    const F = 1.3
    const DAMP = 420
    const RING = 1500
    const end = strings[1].t0 + RING + 100
    const SEG = 12
    const N = 72
    return {
      end,
      draw(P, e, tau) {
        const g = every(tau, 5000, 14000, 2400)
        for (let si = 0; si < strings.length; si++) {
          const st = strings[si]
          const t = e - st.t0
          if (t <= 0) continue
          const appear = clamp(t / 140)
          const damp = Math.exp(-t / DAMP)
          // 떨기 셋: 퉁긴 자리(p)에 따라 세기가 다르고, n번째는 n배 빠르게 떨며 n배 빨리 잦아든다
          const modes = [1, 2, 3].map((n) => (st.amp * Math.sin(n * Math.PI * st.p) * Math.cos((2 * Math.PI * F * n * t) / 1000) * Math.exp((-t * n) / DAMP)) / (n * n))
          // 생동감: 위의 줄에만 아주 작은 떨림이 한 번 지나간다
          const tremor = si === 0 && g ? 3 * Math.sin(Math.PI * g[1]) * Math.cos(2 * Math.PI * 2 * g[1]) : 0
          const a = st.alpha * appear * (1 + 0.8 * damp)
          const yAt = (u: number) =>
            st.y + st.sag * Math.sin(Math.PI * u) + (modes[0] + tremor) * Math.sin(Math.PI * u) + modes[1] * Math.sin(2 * Math.PI * u) + modes[2] * Math.sin(3 * Math.PI * u)
          // 끝으로 갈수록 옅어지게 마디마다 짙기를 달리 긋는다
          for (let sg = 0; sg < SEG; sg++) {
            const k0 = Math.round((sg * N) / SEG)
            const k1 = Math.round(((sg + 1) * N) / SEG)
            for (let k = k0; k <= k1; k++) {
              const u = k / N
              P.to(lerp(st.a0, st.a1, u), yAt(u))
            }
            P.stroke(1.1, 0, a * Math.pow(Math.sin((Math.PI * (k0 + k1)) / 2 / N), 0.7))
          }
        }
      },
    }
  }

  /**
   * 연결(점과 점 사이에 선이 이어진다): 자리 아래쪽 바닥선 위에 양쪽 무리의 점이 서고, 낮은 활 모양의 가는 선이 짧은 짝부터 하나씩
   * 그어져 두 쪽을 잇는다. 활은 여섯 가닥, 높이는 자리 높이의 4분의 1까지라 자리의 아래 띠에만 있다(위쪽은 대개 글과 표가 있다).
   * 활을 높고 많이(열일곱, 아홉) 긋던 때는 비교 표의 글과 줄 선을 가로질러 데이터처럼 읽혔다(검수).
   * 생동감의 느린 흐름: 13초마다 옅은 조각 하나가 한 가닥을 따라 건너간다(전해진다)
   */
  function link(w: number, h: number): Scene {
    const R = rng(13)
    const n = 6
    const base = h * 0.92
    const left = Array.from({ length: n }, (_, k) => w * (0.12 + (0.26 * k) / (n - 1)))
    const right = Array.from({ length: n }, (_, k) => w * (0.62 + (0.26 * k) / (n - 1)))
    const arcs: { a: number; b: number; delay: number }[] = []
    // 짝: 왼쪽의 점마다 오른쪽의 점 하나(차례를 섞어서), 셋에 하나는 하나 더. 너비가 엇갈려 겹겹의 무지개가 되지 않는다
    for (let k = 0; k < n; k++) {
      arcs.push({ a: left[k], b: right[(k * 4 + 1) % n], delay: 0 })
    }
    arcs.sort((x, y) => x.b - x.a - (y.b - y.a) || R() - 0.5)
    const DRAW = 900
    const GAP = 70
    arcs.forEach((a, k) => (a.delay = 260 + k * GAP))
    const end = 260 + (arcs.length - 1) * GAP + DRAW + 100
    const top = h * 0.25
    /** 활 위 u(0~1)의 자리. 높이는 두 점 사이 거리에 비례하고 자리 높이의 4분의 1을 넘지 않는다 */
    const pt = (a: (typeof arcs)[number], u: number): [number, number] => {
      const r = (a.b - a.a) / 2
      const t = Math.PI * (1 - u)
      return [(a.a + a.b) / 2 + Math.cos(t) * r, base - Math.sin(t) * Math.min(top, r * 0.7)]
    }
    return {
      end,
      draw(P, e, tau) {
        for (let k = 0; k < n; k++) {
          P.dot(left[k], base, 2 * out(span(e, 40 + (n - 1 - k) * 30, 360)), 0, 0.26)
          P.dot(right[k], base, 2 * out(span(e, 40 + k * 30, 360)), 0, 0.26)
        }
        for (const a of arcs) {
          const p = reveal(span(e, a.delay, DRAW))
          if (p <= 0) continue
          const steps = Math.max(2, Math.ceil(48 * p))
          for (let k = 0; k <= steps; k++) {
            const [x, y] = pt(a, (p * k) / steps)
            P.to(x, y)
          }
          P.stroke(1, 0, 0.13 + 0.06 * ((a.b - a.a) / w))
        }
        const go = every(tau, 3000, 13000, 2800)
        if (go) {
          const [x, y] = pt(arcs[(go[0] * 5 + 2) % arcs.length], carry(go[1]))
          P.dot(x, y, 2.2, 0, 0.4 * Math.sin(Math.PI * go[1]))
        }
      },
    }
  }

  const KINDS: Record<string, (w: number, h: number) => Scene> = { diffuse, gather, flow, depth, structure, linger, link }
  /** 짙기: 옅게, 보통, 또렷하게. 그림의 짙기에 곱한다 */
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

  // ---------- 글 둘레 비우기 ----------
  /**
   * 배경은 글의 자리를 모르고 그려진다(자리 크기만 안다). 그래서 그린 뒤에 장의 내용이 놓인 자리를 재서, 그 둘레를 흐린 구멍으로 뚫은
   * 마스크(SVG 그림)를 배경에 씌운다: 구멍 안에서는 배경이 거의 사라진다. 끝 모습(SVG)과 움직이는 캔버스가 같은 상자 안이라 둘 다
   * 비킨다. 구멍은 글이 든 묶음(장의 4분의 1보다 작은 것: 단계 하나, 표의 줄 하나, 제목 묶음)을 통째로 뚫는다. 그 안의 줄 선, 강조 선,
   * 칸 사이까지 비어서, 배경의 선이 데이터의 선과 나란히 서지 않는다(검수: 등고선과 단계의 강조 선 가운데 어느 것이 데이터인지
   * 헷갈렸다). 큰 묶음은 그 안의 작은 묶음과 글이 맡는다. 그림, 영상, 차트(svg)는 크기와 상관없이 통째로
   */
  const cleared = new WeakMap<Element, string>()
  const PAD = 34
  const SMALL = 1920 * 1080 * 0.25
  function clear(slide: Element) {
    const el = slide.querySelector(':scope > .s-bd') as HTMLElement | null
    if (!el) return
    const sr = slide.getBoundingClientRect()
    if (!sr.width) return
    const k = sr.width / 1920
    const W = Number(el.dataset.w)
    const H = Number(el.dataset.h)
    const bx = el.offsetLeft
    const by = el.offsetTop
    const holes: string[] = []
    const taken: number[][] = []
    const all = slide.querySelectorAll('*')
    for (let i = 0; i < all.length && holes.length < 240; i++) {
      const node = all[i]
      if (node === el || el.contains(node)) continue
      const tag = node.tagName.toLowerCase()
      const media = tag === 'img' || tag === 'video' || tag === 'canvas' || tag === 'svg'
      // 차트 안의 모양과 글은 차트(svg)가 통째로 맡는다
      if (!media && node.closest('svg')) continue
      if (!media && !/\S/.test(node.textContent || '')) continue
      const r = node.getBoundingClientRect()
      if (!r.width || !r.height) continue
      const x0 = (r.left - sr.left) / k - bx
      const y0 = (r.top - sr.top) / k - by
      const w0 = r.width / k
      const h0 = r.height / k
      if (!media && w0 * h0 > SMALL) continue
      // 이미 뚫은 구멍 안의 것(묶음 안의 글)은 건너뛴다: 요소는 문서 차례라 묶음이 먼저 온다
      if (taken.some((t) => x0 >= t[0] && y0 >= t[1] && x0 + w0 <= t[0] + t[2] && y0 + h0 <= t[1] + t[3])) continue
      const x = x0 - PAD
      const y = y0 - PAD
      const w = w0 + PAD * 2
      const h = h0 + PAD * 2
      if (x > W || y > H || x + w < 0 || y + h < 0) continue
      taken.push([x0, y0, w0, h0])
      holes.push(`<rect x="${Math.round(x)}" y="${Math.round(y)}" width="${Math.round(w)}" height="${Math.round(h)}" rx="16"/>`)
    }
    const key = holes.join('')
    if (cleared.get(el) === key) return
    cleared.set(el, key)
    if (!holes.length) {
      el.style.removeProperty('--bd-clear')
      return
    }
    // 마스크는 알파로 읽힌다: 검은 판을 안쪽 마스크(흰 바탕에 흐린 회색 구멍)로 덮어, 구멍에서만 투명하게
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
      `<defs><filter id="b" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="14"/></filter>` +
      `<mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#fff"/>` +
      `<g filter="url(#b)" fill="#000" fill-opacity="0.8">${key}</g></mask></defs>` +
      `<rect width="${W}" height="${H}" mask="url(#m)"/></svg>`
    el.style.setProperty('--bd-clear', `url("data:image/svg+xml,${encodeURIComponent(svg)}")`)
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

  return { kinds: Object.keys(KINDS), still, play, listen, clear, endOf: (kind, w, h) => sceneOf(kind, w, h)?.end ?? 0 }
}

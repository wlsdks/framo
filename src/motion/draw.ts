// 모션 그래픽을 그리는 도구: 시간의 순수 함수, 점과 선만 그리는 두 그리기(끝 모습의 SVG, 움직임의 캔버스), 캔버스 재생기.
// 장의 배경(motion/backdrop.ts)이 쓰고, 다른 모션 그래픽도 같은 그림 함수를 다시 쓸 수 있게 따로 둔다.
//
// - 그림은 Scene 하나다: '때 e의 모습'을 그리는 순수 함수(draw). 같은 e면 늘 같은 그림이라, 끝 모습은 SVG로 장에 넣고
//   (편집 화면, 목록, PDF, PPT, 내보낸 HTML의 처음 모습) 움직일 때는 같은 함수를 캔버스에 프레임마다 그린다.
// - 그리기는 점(dot)과 선(to, stroke) 둘뿐이고 색은 둘(0: 글자색, 1: 강조색)이다. 짙기와 굵기가 같은 것끼리 모아 한 번에 칠한다.
// - 이징은 엔진의 쓰임새 표(EASE)와 같은 곡선이다. 처음부터 직접 만들었다(docs/MOTION.md).
//
// 내보낸 HTML의 뷰어에 이 함수의 소스(toString)가 그대로 들어간다(engine.ts와 같다). 바깥의 아무것도 참조하지 않는다.

/** 그리는 쪽. 점과 선 둘뿐이다. tone 0은 글자색, 1은 강조색. a는 짙기(0~1) */
export interface Paint {
  dot(x: number, y: number, r: number, tone: number, a: number): void
  /** 선의 점을 하나씩 넣고 stroke로 긋는다 */
  to(x: number, y: number): void
  /**
   * flat이면 선의 두 끝을 평평하게(butt). 한 선을 마디마다 짙기를 달리해 이어 그을 때 쓴다: 둥근 끝끼리 이음에서 겹쳐 짙은 점이 생겨
   * 실선이 점선처럼 보였다(검수)
   */
  stroke(width: number, tone: number, a: number, closed?: boolean, flat?: boolean): void
}

/** 그림 하나: w × h 안에 그린다 */
export interface Scene {
  /** 들어오기가 끝나는 때(ms) */
  end: number
  /**
   * e: 들어오기의 때(0~end). tau: 들어오기가 끝난 뒤 흐른 때(ms, 느린 흐름). 끝 모습은 draw(P, end, 0)이다:
   * 느린 흐름은 tau가 0일 때 아무것도 옮기지 않는다
   */
  draw(P: Paint, e: number, tau: number): void
}

/** 캔버스 재생기의 설정 */
interface PlayerOptions {
  /** 그림의 크기(그림의 좌표, px) */
  w: number
  h: number
  /** 그림의 시간 0이 되는 때(performance.now 기준) */
  t0: number
  /** 들어오기를 이만큼 빠르게(1이면 그대로) */
  speed: number
  /** 들어오기가 끝난 뒤에도 느린 흐름을 그린다. 아니면 끝나는 대로 캔버스를 걷는다 */
  flows: boolean
  /** 짙기 배율 */
  strength: number
  /** 캔버스에 붙일 class */
  className: string
  /** 강조색을 읽을 요소의 class (그림 안에서 강조색을 쓰는 class와 같게). 없으면 글자색 하나로 그린다 */
  accentClass?: string
  /** 들어오기가 끝나거나 멈출 때 */
  onSettled?: () => void
}

interface Player {
  /** 캔버스를 걷고 끝 모습으로. 여러 번 불러도 한 번만 */
  finish(): void
  /** 들어오기가 끝난 뒤 흐른 때(ms, 흐름이 없으면 0) */
  tau(): number
}

export interface DrawKit {
  TAU: number
  clamp(x: number): number
  lerp(a: number, b: number, k: number): number
  /** 들어와 자리 잡기, 걷히며 드러나기, 자리에서 자리로, 끝없이 오가기, 카메라 (엔진의 EASE와 같은 곡선) */
  ease: { out(x: number): number; reveal(x: number): number; carry(x: number): number; breathe(x: number): number; camera(x: number): number }
  /** 느린 흐름이 0부터 천천히 붙는 세기와 시계(처음에 멈춰 있다가 제 빠르기에 이른다) */
  amp(tau: number, ramp?: number): number
  clock(tau: number, ramp?: number): number
  /** 주기 period로 -1~1을 오간다(breathe) */
  sway(tau: number, period: number, phase: number): number
  /** a부터 d 동안 0→1 */
  span(e: number, a: number, d: number): number
  /** period마다 first부터 한 번씩 len 동안: [몇 번째, 진행 0~1] 아니면 null */
  every(tau: number, first: number, period: number, len: number): [number, number] | null
  /** 정해진 씨앗의 난수(같은 씨앗이면 늘 같은 그림) */
  rng(seed: number): () => number
  /** 타원(또는 원, 그 일부)을 선으로 */
  ellipse(P: Paint, cx: number, cy: number, rx: number, ry: number, from: number, to: number, width: number, tone: number, a: number): void
  /** 끝 모습의 SVG 안쪽(path들). m은 짙기 배율, accentClass는 강조색 path의 class(기본 mo-a) */
  svgPaint(m: number, accentClass?: string): Paint & { markup(): string }
  /** 캔버스에 그리기. colors는 [글자색, 강조색], line과 dot은 선 굵기와 점 지름의 바닥(그림 px, 없으면 0) */
  canvasPaint(ctx: CanvasRenderingContext2D, colors: string[], m: number, line?: number, dot?: number): Paint & { flush(): void }
  /**
   * 그림 하나를 el 안의 캔버스로 움직인다. el 안의 SVG(끝 모습)는 그동안 감춘다. 화면 밖이면 쉬고, el이 문서에서 빠지면 그친다.
   * 첫 프레임에는 SVG만 감추고 캔버스는 다음 프레임에 만든다(장을 넘기는 첫 프레임을 가볍게)
   */
  player(el: HTMLElement, sc: Scene, o: PlayerOptions): Player
}

export function drawKit(): DrawKit {
  const TAU = Math.PI * 2
  const clamp = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)
  const lerp = (a: number, b: number, k: number) => a + (b - a) * k

  // ---------- 이징: 엔진(EASE)과 같은 곡선. 매 프레임 수천 번 부르므로 표로 만들어 둔다 ----------
  function bezier(x1: number, y1: number, x2: number, y2: number) {
    const at = (a: number, b: number, t: number) => 3 * a * t * (1 - t) * (1 - t) + 3 * b * t * t * (1 - t) + t * t * t
    const n = 256
    const table = new Float32Array(n + 1)
    // x(t)가 늘어나는 차례로 t를 훑어 x마다 y를 적는다 (뉴턴법 없이, 표 칸 사이는 곧게 잇는다)
    let t = 0
    for (let i = 0; i <= n; i++) {
      const x = i / n
      while (t < 1 && at(x1, x2, t) < x) t += 1 / 2048
      table[i] = at(y1, y2, Math.min(1, t))
    }
    return (x: number) => {
      if (x <= 0) return 0
      if (x >= 1) return 1
      const f = x * n
      const i = f | 0
      return table[i] + (table[i + 1] - table[i]) * (f - i)
    }
  }
  /** 들어와 자리 잡기 */
  const out = bezier(0.16, 1, 0.3, 1)
  /** 걷히며 드러나기(선 긋기) */
  const reveal = bezier(0.25, 0.8, 0.25, 1)
  /** 자리에서 자리로 옮기기(조각이 건너가기) */
  const carry = bezier(0.45, 0, 0.25, 1)
  /** 끝없이 오가기(느린 흐름) */
  const breathe = bezier(0.45, 0, 0.55, 1)
  /** 카메라: 천천히 떠나 길게 멈춘다(모션 그래픽의 물러나기와 다가가기) */
  const camera = bezier(0.33, 0, 0.12, 1)
  /** 느린 흐름이 들어오기 끝에서 0부터 천천히 붙는 세기 */
  const amp = (tau: number, ramp = 3000) => {
    const k = clamp(tau / ramp)
    return k * k * (3 - 2 * k)
  }
  /** 같은 까닭으로 시계: 처음에는 멈춰 있다가 ramp 동안 제 빠르기에 이른다(자리와 빠르기가 끊기지 않는다) */
  const clock = (tau: number, ramp = 3000) => (tau < ramp ? (tau * tau) / (2 * ramp) : tau - ramp / 2)
  /** 오가는 흐름: 주기 period의 -1~1. 곡선은 breathe(같은 모양으로 오간다) */
  const sway = (tau: number, period: number, phase: number) => {
    const k = (((tau / period + phase) % 1) + 1) % 1
    return breathe(k < 0.5 ? k * 2 : 2 - k * 2) * 2 - 1
  }
  /** 이 사이에서 0→1 */
  const span = (e: number, a: number, d: number) => clamp((e - a) / d)
  /** 생동감의 드문 일: period(12초 넘게)마다 first부터 한 번씩, len 동안. 그 안이면 몇 번째인지와 진행(0~1), 아니면 null */
  const every = (tau: number, first: number, period: number, len: number): [number, number] | null => {
    if (tau < first) return null
    const n = Math.floor((tau - first) / period)
    const k = (tau - first - n * period) / len
    return k < 1 ? [n, k] : null
  }

  function rng(seed: number) {
    let a = seed >>> 0
    return () => {
      a = (a + 0x6d2b79f5) >>> 0
      let t = a
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }

  /** 타원(또는 원, 그 일부)을 선으로 */
  const ellipse = (P: Paint, cx: number, cy: number, rx: number, ry: number, from: number, to: number, width: number, tone: number, a: number) => {
    if (a <= 0.004 || rx <= 0) return
    const n = Math.max(12, Math.ceil((Math.abs(to - from) * Math.max(rx, ry)) / 14))
    for (let i = 0; i <= n; i++) {
      const t = from + ((to - from) * i) / n
      P.to(cx + Math.cos(t) * rx, cy + Math.sin(t) * ry)
    }
    P.stroke(width, tone, a, Math.abs(to - from) >= TAU - 1e-6)
  }


  // ---------- 그리는 쪽 둘: SVG(끝 모습)와 캔버스(움직임). 같은 짙기와 굵기끼리 모아 한 번에 그린다 ----------
  const Q = 100
  const num = (v: number) => String(Math.round(v * 10) / 10)

  function svgPaint(m: number, accentClass = 'mo-a'): Paint & { markup(): string } {
    const dots = new Map<number, string[]>()
    const strokes = new Map<number, string[]>()
    const pts: number[] = []
    const bucket = (map: Map<number, string[]>, key: number) => map.get(key) || map.set(key, []).get(key)!
    return {
      dot(x, y, r, tone, a) {
        const q = Math.round(Math.min(0.95, a * m) * Q)
        if (q <= 0 || r <= 0.05) return
        // 점은 길이 없는 선의 둥근 끝으로, 크기는 0.25px 단계로: 원 경로보다 다섯 배쯤 짧아 장 그림(목록, 내보낸 HTML)이 가볍다
        // (망점 수천 개도 50KB 안). 캔버스도 같은 단계로 그려서, 움직임이 끝나 캔버스를 걷고 이 그림으로 돌아올 때 점이 튀지 않는다
        bucket(dots, tone * 1e6 + q * 1000 + Math.min(999, Math.round(r * 4) * 5)).push(`M${num(x)} ${num(y)}h0`)
      },
      to(x, y) {
        pts.push(x, y)
      },
      stroke(width, tone, a, closed, flat) {
        const q = Math.round(Math.min(0.95, a * m) * Q)
        if (q > 0 && pts.length >= 4) {
          let d = `M${num(pts[0])} ${num(pts[1])}L`
          for (let i = 2; i < pts.length; i += 2) d += `${num(pts[i])} ${num(pts[i + 1])} `
          bucket(strokes, (tone + (flat ? 2 : 0)) * 1e6 + q * 1000 + Math.round(width * 4)).push(d.trim() + (closed ? 'Z' : ''))
        }
        pts.length = 0
      },
      markup() {
        let s = ''
        // 선만 stroke-linejoin을 갖는다(점은 길이가 없어 이음이 없다). 장을 아주 작게 줄인 그림(배경 고르기 카드)이 선만 골라
        // 화면 1px로 그릴 때(vector-effect) 이것으로 가른다. 열쇠의 백만 자리: 1은 강조색, 2는 평평한 끝
        const path = (key: number, width: number, d: string[], line: boolean) => {
          const t = Math.floor(key / 1e6)
          return `<path${t & 1 ? ` class="${accentClass}"` : ''} fill="none" stroke="currentColor" stroke-linecap="${t & 2 ? 'butt' : 'round'}"${line ? ' stroke-linejoin="round"' : ''} stroke-opacity="${Math.floor((key % 1e6) / 1000) / Q}" stroke-width="${width}" d="${d.join('')}"/>`
        }
        for (const [key, d] of strokes) s += path(key, (key % 1000) / 4, d, true)
        for (const [key, d] of dots) s += path(key, (key % 1000) / 10, d, false)
        return s
      },
    }
  }

  function canvasPaint(ctx: CanvasRenderingContext2D, colors: string[], m: number, line = 0, dot = 0): Paint & { flush(): void } {
    const fills = new Map<number, Path2D>()
    const strokes = new Map<number, Path2D>()
    const pts: number[] = []
    const bucket = (map: Map<number, Path2D>, key: number) => map.get(key) || map.set(key, new Path2D()).get(key)!
    return {
      dot(x, y, r, tone, a) {
        const q = Math.round(Math.min(0.95, a * m) * Q)
        if (q <= 0 || r <= 0.05) return
        // 크기는 끝 모습(SVG)과 같은 0.25px 단계
        const rr = Math.max(dot / 2, Math.round(r * 4) / 4)
        if (rr <= 0) return
        const p = bucket(fills, tone * 1000 + q)
        p.moveTo(x + rr, y)
        p.arc(x, y, rr, 0, TAU)
      },
      to(x, y) {
        pts.push(x, y)
      },
      stroke(width, tone, a, closed, flat) {
        const q = Math.round(Math.min(0.95, a * m) * Q)
        if (q > 0 && pts.length >= 4) {
          const p = bucket(strokes, (tone + (flat ? 2 : 0)) * 1e6 + q * 1000 + Math.round(width * 4))
          p.moveTo(pts[0], pts[1])
          for (let i = 2; i < pts.length; i += 2) p.lineTo(pts[i], pts[i + 1])
          if (closed) p.closePath()
        }
        pts.length = 0
      },
      flush() {
        ctx.lineJoin = 'round'
        for (const [key, p] of strokes) {
          const t = Math.floor(key / 1e6)
          ctx.lineCap = t & 2 ? 'butt' : 'round'
          ctx.globalAlpha = Math.floor((key % 1e6) / 1000) / Q
          ctx.strokeStyle = colors[t & 1]
          ctx.lineWidth = Math.max(line, (key % 1000) / 4)
          ctx.stroke(p)
        }
        for (const [key, p] of fills) {
          ctx.globalAlpha = (key % 1000) / Q
          ctx.fillStyle = colors[Math.floor(key / 1000)]
          ctx.fill(p)
        }
        ctx.globalAlpha = 1
        fills.clear()
        strokes.clear()
      },
    }
  }

  function player(el: HTMLElement, sc: Scene, o: PlayerOptions): Player {
    const svg = el.querySelector('svg')
    const endMs = sc.end / o.speed
    if (svg) svg.style.visibility = 'hidden'
    let cv: HTMLCanvasElement | null = null
    let ctx: CanvasRenderingContext2D | null = null
    let P: (Paint & { flush(): void }) | null = null
    let k = 0
    let frames = 0
    let tau = 0
    const fitCanvas = () => {
      const r = el.getBoundingClientRect()
      // 화면에 그려지는 크기에 맞추되 화소는 1.5배까지, 다 해서 240만 화소까지(윈도우 노트북도 한 프레임 안에)
      const dpr = Math.min(1.5, window.devicePixelRatio || 1)
      const next = Math.min(Math.max(0.1, (r.width / o.w) * dpr), Math.sqrt(2.4e6 / (o.w * o.h)))
      if (Math.abs(next - k) / Math.max(k, 0.01) < 0.08) return
      k = next
      cv!.width = Math.max(1, Math.round(o.w * k))
      cv!.height = Math.max(1, Math.round(o.h * k))
    }
    const setup = () => {
      cv = document.createElement('canvas')
      cv.className = o.className
      cv.setAttribute('aria-hidden', 'true')
      el.appendChild(cv)
      ctx = cv.getContext('2d')
      if (!ctx) return false
      // 강조색은 장마다 달라서(어두운 면, 강조색 바탕) 그려진 색을 읽는다. 강조색을 쓰지 않는 그림(배경)은 글자색 하나
      const cs = getComputedStyle(el)
      const ink = cs.color
      const colors = [ink, ink]
      if (o.accentClass) {
        const probe = document.createElement('i')
        probe.className = o.accentClass
        el.appendChild(probe)
        colors[1] = getComputedStyle(probe).color
        probe.remove()
      }
      fitCanvas()
      // 아주 작게 줄인 그림(배경 고르기 카드)은 --mo-line, --mo-dot으로 선 굵기와 점 지름의 바닥을 준다: 끝 모습(SVG)을 같은 값으로
      // 그리므로 움직이는 동안에도 같은 굵기여야 카드가 옅어졌다 짙어지지 않는다
      P = canvasPaint(ctx, colors, o.strength, parseFloat(cs.getPropertyValue('--mo-line')) || 0, parseFloat(cs.getPropertyValue('--mo-dot')) || 0)
      return true
    }
    const draw = (now: number) => {
      const t = Math.max(0, now - o.t0)
      tau = o.flows ? Math.max(0, t - endMs) : 0
      if (++frames % 30 === 0) fitCanvas()
      ctx!.setTransform(1, 0, 0, 1, 0, 0)
      ctx!.clearRect(0, 0, cv!.width, cv!.height)
      ctx!.setTransform(k, 0, 0, k, 0, 0)
      sc.draw(P!, Math.min(sc.end, t * o.speed), tau)
      P!.flush()
      return t
    }
    let raf = 0
    let visible = true
    let settled = false
    const settle = () => {
      if (settled) return
      settled = true
      o.onSettled?.()
    }
    const tick = (now: number) => {
      raf = 0
      if (!el.isConnected || (!cv && !setup())) return finish()
      const t = draw(now)
      if (t >= endMs) settle()
      // 흐름이 없으면 들어오기가 끝나는 대로 끝 모습(SVG)으로 돌아가 쉰다
      if (!o.flows && t >= endMs) return finish()
      if (visible) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    // 화면 밖(접힌 미리 보기, 스크롤된 목록)이면 쉰다. 다른 탭이면 브라우저가 requestAnimationFrame을 멈춘다
    const io =
      typeof IntersectionObserver === 'function'
        ? new IntersectionObserver((entries) => {
            visible = entries.some((x) => x.isIntersecting)
            if (visible && !raf) raf = requestAnimationFrame(tick)
          })
        : null
    io?.observe(el)
    let stopped = false
    function finish() {
      if (stopped) return
      stopped = true
      if (raf) cancelAnimationFrame(raf)
      io?.disconnect()
      cv?.remove()
      if (svg) svg.style.visibility = ''
      settle()
    }
    return { finish, tau: () => tau }
  }

  return {
    TAU,
    clamp,
    lerp,
    ease: { out, reveal, carry, breathe, camera },
    amp,
    clock,
    sway,
    span,
    every,
    rng,
    ellipse,
    svgPaint,
    canvasPaint,
    player,
  }
}

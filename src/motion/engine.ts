// 발표할 때의 움직임 엔진. 앱의 발표 화면과 내보낸 HTML의 뷰어가 똑같이 쓴다.
//
// - 의존성 없이 브라우저 기능만 쓴다: Web Animations(WAAPI), CSS linear() 이징, View Transitions.
// - 사용자는 움직임을 하나하나 붙이지 않는다. 레이아웃마다 짜 둔 순서(연출표)로 움직이고, 정도만 고른다.
// - 움직임은 처음부터 직접 만들었다. 특정 사이트나 라이브러리의 코드를 옮기지 않았다(docs/MOTION.md).
// - 끝나면 원래 모습 그대로다. 애니메이션은 시작 모습만 정하고(fill: backwards), 끝 모습은 CSS 그대로.
//   제목을 낱말로 나눈 것도 끝나면 원래 글자 노드로 되돌린다.
//
// 뷰어에는 이 함수의 소스(toString)가 그대로 들어간다. 그래서 바깥의 아무것도 참조하지 않게,
// 필요한 것은 모두 이 함수 안에 둔다.

/** none은 움직이지 않지만 '누르면' 나오는 부품은 누를 때까지 감춘다 */
export type MotionLevel = 'calm' | 'lively' | 'none'

/**
 * play가 돌려주는 것. 부르면 바로 끝 모습으로 (아직 누르지 않은 차례도 다 보인다).
 * next는 '누르면' 나오는 다음 차례를 보인다. 남은 차례가 없으면 false(그때 발표 화면은 다음 장으로 넘긴다)
 */
export interface MotionPlay {
  (): void
  next(): boolean
  /** 남은 차례 수 */
  left(): number
}

export interface PlayOptions {
  /** auto: '누르면'을 기다리지 않고 잠깐 쉬었다 이어서 (편집기의 미리 보기). 없으면 누를 때까지 기다린다 */
  clicks?: 'auto'
}

export interface MotionEngine {
  /** 한 장을 움직인다 */
  play(root: Element, level: MotionLevel, opts?: PlayOptions): MotionPlay
  /** 장을 바꾸는 동안 앞 장과 다음 장을 이어 준다. 지원하지 않으면 그냥 바꾼다 */
  swap(update: () => void, kind: string, direction: 1 | -1): void
}

export function motionEngine(): MotionEngine {
  // ---------- 스프링: 물리 시뮬레이션을 CSS linear() 이징으로 ----------
  // 같은 스프링이라도 시간이 정해져 있어서, 멈출 때까지 흉내 내 보고 그 시간을 쓴다.
  function spring(stiffness: number, damping: number) {
    const dt = 1 / 240
    let x = 0
    let v = 0
    let t = 0
    const pts: number[] = []
    while (t < 3) {
      v += (-stiffness * (x - 1) - damping * v) * dt
      x += v * dt
      t += dt
      pts.push(x)
      if (Math.abs(x - 1) < 0.001 && Math.abs(v) < 0.01) break
    }
    const n = 64
    const out: string[] = ['0']
    for (let i = 1; i < n; i++) out.push(String(Math.round(pts[Math.round((i / n) * (pts.length - 1))] * 10000) / 10000))
    out.push('1')
    return { easing: `linear(${out.join(', ')})`, duration: Math.round(t * 1000) }
  }

  // 모든 스프링은 넘치지 않는다(감쇠가 임계값 2√k 이상). 먹물이 번져 자리를 찾듯 빠르게 다가와 천천히 멈춘다.
  // 예전 생동감은 넘쳤다가 되돌아오는 스프링(bounce, pop)이었는데, 글자와 막대가 튕겨서 보고 자리에 가볍고
  // 흔한 템플릿처럼 보였다. 이제 두 단계는 거리, 시간, 차례 사이로만 다르다.
  // 차분하게: 짧은 거리를 빠르게(보고 자리에서 기다리게 하지 않게). 생동감: 조금 먼 거리를 더 길게, 흐림에서 또렷해지며
  const SPRINGS = {
    quick: spring(300, 35),
    glide: spring(170, 26.5),
    soft: spring(110, 21),
    settle: spring(120, 22),
    firm: spring(220, 30),
  }
  // 이징은 하는 일마다 하나씩, 이 표에서만 고른다(Carbon과 Material 3의 모션 토큰처럼 이름이 곧 쓰임새).
  // 예전에는 움직임마다 비슷하지만 조금씩 다른 곡선을 따로 적어 16가지였다: 같은 '드러나기'인데 장마다 끝맺음이 달랐다
  const EASE = {
    /** 들어와 자리 잡기: 빠르게 다가와 길게 멈춘다 */
    out: 'cubic-bezier(0.16, 1, 0.3, 1)',
    /** 걷히며 드러나기: 선 긋기, 가림 걷기, 숫자 굴리기 */
    reveal: 'cubic-bezier(0.25, 0.8, 0.25, 1)',
    /** 자리에서 자리로 옮기기: 천천히 떠나 빠르게 건너고 천천히 닿는다(데이터 조각, 판 옮기기) */
    carry: 'cubic-bezier(0.45, 0, 0.25, 1)',
    /** 쓸고 지나가기: 힘을 모았다가 끝까지 쓴다(닦기, 지우기, 막대가 열리기) */
    sweep: 'cubic-bezier(0.55, 0, 0.3, 1)',
    /** 카메라: 천천히 떠나 길게 멈춘다. 먹이 가라앉듯 끝에서 오래 머물러서 언제 멈췄는지 눈에 띄지 않는다 */
    camera: 'cubic-bezier(0.33, 0, 0.12, 1)',
    /** 사진 위로 천천히 흐르기(장면의 밀어 들어가기) */
    drift: 'cubic-bezier(0.25, 0.1, 0.2, 1)',
    /** 끝없이 오가는 숨쉬기 */
    breathe: 'cubic-bezier(0.45, 0, 0.55, 1)',
    /** 딸깍 맞춰지기: 조금 넘었다가 제자리. 결이 맞춰지는 눈금처럼 '맞았다'를 보일 때만 */
    snap: 'cubic-bezier(0.34, 1.45, 0.64, 1)',
  } as const
  const OUT = EASE.out

  /**
   * 곡선(cubic-bezier) 하나를 JS에서 셈한다(EASE의 이름 그대로). 시계 하나를 여러 단계로 나누고 단계마다 같은 곡선을 입힐 때 쓴다
   * (값 이어 움직이기). x(t)가 늘기만 하는 곡선이라 t를 반씩 좁혀 찾는다
   */
  function curve(css: string) {
    const m = /cubic-bezier\(([^)]+)\)/.exec(css)
    const [x1, y1, x2, y2] = m ? m[1].split(',').map(Number) : [0, 0, 1, 1]
    const at = (a: number, b: number, t: number) => 3 * a * t * (1 - t) * (1 - t) + 3 * b * t * t * (1 - t) + t * t * t
    return (x: number) => {
      if (x <= 0) return 0
      if (x >= 1) return 1
      let lo = 0
      let hi = 1
      let t = x
      for (let i = 0; i < 24; i++) {
        t = (lo + hi) / 2
        if (at(x1, x2, t) < x) lo = t
        else hi = t
      }
      return at(y1, y2, t)
    }
  }

  const LEVELS = {
    calm: { span: 480, y: 20, step: 60, word: 30, ink: 0, scale: 0.98, move: SPRINGS.quick, grow: SPRINGS.glide, pop: SPRINGS.quick, speed: 0.8 },
    lively: { span: 720, y: 44, step: 100, word: 50, ink: 5, scale: 0.96, move: SPRINGS.settle, grow: SPRINGS.settle, pop: SPRINGS.firm, speed: 1.1 },
  }

  type Level = (typeof LEVELS)['calm']
  type Spring = { easing: string; duration: number }

  // ---------- 하나하나의 움직임 ----------

  // 움직임을 짜는 동안만 바뀌는 값 (play가 짜는 동안 정하고 끝나면 되돌린다).
  // still: 움직이지 않는 때(움직임 없음, 동작 줄이기). '누르면' 나오는 차례만 지키고 아무것도 움직이지 않는다.
  // pace: 부품마다 고른 빠르기. 걸리는 시간과 부품 안의 차례 사이를 함께 늘이고 줄인다
  let still = false
  let pace = 1

  // 낱말 나누기와 숫자 굴리기가 DOM에 쓰는 일. play가 한 묶음을 짜는 동안은 쓰지 않고 모았다가, 다 짠 뒤 모든 칸이 같이
  // 한 단계씩 쓴다(flushJobs: 쓰기 → 재기 → 쓰기). 칸마다 쓰고 바로 다시 재면 그때마다 장 전체를 다시 배치해서, 장을 넘기는
  // 순간 한 프레임이 42~77ms였다(핵심 숫자 셋과 점 목록이 든 컴포넌트 장, 144Hz 맥. 윈도우 노트북은 그 3~4배).
  // 짜는 동안 재는 일은 나누기 전의 글로 한다: 나눈 낱말과 감싼 숫자는 글자 모양을 바꾸지 않아 자리가 같다.
  // 움직임은 아직 장에 넣지 않은 낱말에도 미리 건다(넣는 때가 같은 일 안이라 첫 화면부터 시작 모습이다)
  type Job = { write: () => void; read?: () => void; after?: () => void; done?: boolean; dead?: boolean }
  let jobs: Job[] | null = null
  function defer(job: Job) {
    if (jobs) jobs.push(job)
    else runJobs([job])
  }
  function runJobs(list: Job[]) {
    for (const j of list) {
      j.write()
      j.done = true
    }
    for (const j of list) if (j.read) j.read()
    for (const j of list) if (j.after) j.after()
  }
  function flushJobs() {
    if (!jobs || !jobs.length) return
    const list = jobs.filter((j) => !j.dead)
    jobs = []
    runJobs(list)
  }

  function run(
    out: Animation[],
    el: Element,
    frames: Keyframe[],
    at: number,
    timing: { easing: string; duration: number },
    pseudoElement?: string,
  ) {
    // 이어 움직이기로 앞 장에서 옮겨 온 것(data-mo-keep)은 이미 제자리에 와 있어서 다시 들이지 않는다
    if (still || el.closest('[data-mo-keep]')) return null
    // 키프레임 하나만 주면 Web Animations는 그것을 '끝' 모습으로 본다. 여기서는 늘 '시작' 모습이라 offset 0을 붙인다.
    const keyframes = frames.length === 1 ? [{ ...frames[0], offset: 0 }] : frames
    const a = el.animate(keyframes, {
      duration: timing.duration * pace,
      delay: Math.max(0, at),
      easing: timing.easing,
      fill: 'backwards',
      pseudoElement,
    })
    out.push(a)
    return a
  }

  /**
   * 글을 낱말로 나눈다. 낱말마다 아래에서 올라오게. 되돌리는 함수도 함께 돌려준다.
   * chars면 낱말 안을 다시 글자(한글은 음절, 결합 문자는 한 덩어리: Intl.Segmenter의 grapheme)로 나눈다(한 글자씩).
   * 그때 marks에는 글자마다 문장 부호인지 적는다: 문장 부호는 앞 글자와 같은 때에 나와 빈 시간을 만들지 않는다.
   * 그림(svg) 안의 글은 나누지 않는다(svg 안에 span을 넣으면 그려지지 않는다)
   */
  function splitWords(el: Element, chars = false) {
    const words: HTMLElement[] = []
    const marks: boolean[] = []
    /** 자리를 맞출 상자: 낱말이면 낱말 상자, 글자면 글자 상자. 같은 줄의 이웃 사이를 원래 글과 같게 오른쪽 여백으로 맞춘다 */
    const boxes: HTMLElement[] = []
    const undo: (() => void)[] = []
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    const texts: Text[] = []
    for (let n = walker.nextNode(); n; n = walker.nextNode()) if (!(n.parentElement && n.parentElement.closest('svg'))) texts.push(n as Text)
    const seg = chars && typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('ko', { granularity: 'grapheme' }) : null
    const pieces = (word: string) => (!chars ? [word] : seg ? Array.from(seg.segment(word), (g) => g.segment) : Array.from(word))
    // 나누기 전에 낱말(글자)마다 원래 글에서의 자리를 잰다(아래에서 나눈 뒤의 자리와 맞추고, 줄 올라오기가 줄을 가른다)
    const range = document.createRange()
    const was: { left: number; top: number; height: number }[] = []
    for (const node of texts) {
      let i = 0
      for (const part of (node.nodeValue || '').split(/(\s+)/)) {
        if (part.trim()) {
          let j = i
          for (const piece of pieces(part)) {
            range.setStart(node, j)
            range.setEnd(node, j + piece.length)
            const r = range.getClientRects()[0]
            was.push(r ? { left: r.left, top: r.top, height: r.height } : { left: NaN, top: NaN, height: NaN })
            j += piece.length
          }
        }
        i += part.length
      }
    }
    // 낱말 상자는 여기서 만들기만 하고 장에 넣는 것은 모아 둔 일(defer)에서
    const swaps: { node: Text; made: Node[] }[] = []
    for (const node of texts) {
      const parts = (node.nodeValue || '').split(/(\s+)/)
      if (parts.every((p) => !p.trim())) continue
      const made: Node[] = []
      for (const part of parts) {
        if (!part) continue
        if (!part.trim()) {
          made.push(document.createTextNode(part))
          continue
        }
        const outer = document.createElement('span')
        outer.className = 'mo-w'
        const inner = document.createElement('span')
        inner.className = 'mo-wi'
        outer.appendChild(inner)
        made.push(outer)
        if (!chars) {
          inner.textContent = part
          words.push(inner)
          boxes.push(outer)
          continue
        }
        // 한 글자씩: 낱말 상자는 줄바꿈을 원래대로(낱말 사이에서만) 지키고, 그 안에서 글자마다 움직인다
        outer.classList.add('is-ch')
        const list = pieces(part)
        list.forEach((piece, n) => {
          const c = document.createElement('span')
          c.className = 'mo-ch'
          c.textContent = piece
          inner.appendChild(c)
          words.push(c)
          marks.push(/^[\p{P}\p{S}]+$/u.test(piece))
          // 낱말의 마지막 글자 뒤(다음 낱말과의 사이)는 낱말 상자의 여백으로 맞춘다
          boxes.push(n === list.length - 1 ? outer : c)
        })
      }
      swaps.push({ node, made })
    }
    // 장을 줄여 그린 비율. 나누어도 장의 크기는 그대로라 나누기 전에 잰다
    const box = el.getBoundingClientRect()
    const k = (el as HTMLElement).offsetWidth ? box.width / (el as HTMLElement).offsetWidth : 0
    const label = el.getAttribute('aria-label')
    let now: DOMRect[] = []
    const job: Job = {
      write: () => {
        for (const { node, made } of swaps) {
          const parent = node.parentNode
          if (!parent) continue
          for (const m of made) parent.insertBefore(m, node)
          parent.removeChild(node)
          undo.push(() => {
            if (!made[0].parentNode) return
            made[0].parentNode.insertBefore(node, made[0])
            for (const m of made) m.parentNode?.removeChild(m)
          })
        }
        // 글자로 나눈 동안 화면 읽기 프로그램은 낱낱의 글자를 읽지 않고 원래 글을 한 번 읽는다
        if (chars && words.length) {
          if (label === null) el.setAttribute('aria-label', (el.textContent || '').replace(/\s+/g, ' ').trim())
          for (const b of boxes) if (b.classList.contains('mo-w')) b.setAttribute('aria-hidden', 'true')
        }
      },
      read: () => {
        if (k && was.length === words.length) now = words.map((o) => o.getBoundingClientRect())
      },
      // 낱말 사이를 원래 글과 같게. 낱말을 상자(inline-block)로 감싸면 상자 밖의 띄어쓰기와 짝을 이룬 자간(쉼표 뒤 같은)이
      // 빠져서 낱말이 조금 넓어진다. 녹화해 보니 '사업, 12월'에서 쉼표 뒤가 3px 벌어져 있다가, 움직임이 끝나 원래 글로
      // 돌아올 때 그 뒤의 낱말이 모두 왼쪽으로 튀었다. 같은 줄의 이웃 낱말 사이가 원래와 다르면 앞 낱말의 오른쪽 여백으로 맞춘다.
      // 글자로 나눌 때도 같다: 글자 상자 사이에서는 글꼴의 짝 자간(kerning)이 빠진다
      after: () => {
        for (let i = 0; i + 1 < now.length; i++) {
          const a = was[i]
          const b = was[i + 1]
          if (!(Math.abs(a.top - b.top) < 1 && Math.abs(now[i].top - now[i + 1].top) < 1)) continue
          const gap = b.left - a.left - (now[i + 1].left - now[i].left)
          if (Math.abs(gap) > 0.05 * k) boxes[i].style.marginRight = gap / k + 'px'
        }
      },
    }
    defer(job)
    return {
      words,
      marks,
      /** 낱말(글자)마다 나누기 전의 자리 */
      was,
      restore: () => {
        // 아직 장에 넣지 않았으면 넣지 않는다 (한 글자씩에서 낱말로 다시 나눌 때)
        if (!job.done) {
          job.dead = true
          return
        }
        undo.forEach((u) => u())
        if (chars && label === null) el.removeAttribute('aria-label')
      },
    }
  }

  /**
   * 큰 숫자를 0부터 올린다. 숫자가 하나만 있는 칸만. '3~4개월', 날짜는 그대로 둔다.
   * 다 올라가면 waits에 넣은 약속을 지킨다: 글이 원래 숫자로 돌아와야 움직임이 끝난 것이다(play의 끝 표시)
   */
  function countUp(el: Element, at: number, duration: number, stops: (() => void)[], waits: Promise<void>[], from = 0) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    let node = walker.nextNode() as Text | null
    while (node && !/\d/.test(node.nodeValue || '')) node = walker.nextNode() as Text | null
    if (!node) return
    const text = node.nodeValue || ''
    const all = text.match(/\d[\d,]*(\.\d+)?/g)
    if (!all || all.length !== 1) return
    const m = /^(\D*)(\d[\d,]*)(\.\d+)?([\s\S]*)$/.exec(text)
    if (!m) return
    const target = parseFloat((m[2] + (m[3] || '')).replace(/,/g, ''))
    if (!(target > 0) || target >= 1e12) return
    const decimals = m[3] ? m[3].length - 1 : 0
    const grouped = m[2].indexOf(',') >= 0
    const format = (v: number) => {
      let s = v.toFixed(decimals)
      if (grouped) {
        const parts = s.split('.')
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
        s = parts.join('.')
      }
      return m[1] + s + m[4]
    }
    const target_node = node
    const start = performance.now() + at
    let frame = 0
    let done = () => {}
    waits.push(new Promise<void>((r) => (done = r)))
    target_node.nodeValue = format(from)
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / duration))
      // 처음엔 빠르게, 끝에서 천천히 멈춘다. from에서 출발하면(전과 후) 앞 값에서 새 값으로 바뀌어 간다
      target_node.nodeValue = t >= 1 ? text : format(from + (target - from) * (1 - Math.pow(2, -10 * t)))
      if (t < 1) frame = requestAnimationFrame(tick)
      else done()
    }
    frame = requestAnimationFrame(tick)
    stops.push(() => {
      cancelAnimationFrame(frame)
      target_node.nodeValue = text
      done()
    })
  }

  /**
   * 숫자를 자리마다 굴려서 맞춘다(주행 거리계처럼). 숫자가 하나만 있는 칸만, countUp과 같은 조건.
   * 제자리 숫자는 투명하게 남겨 줄과 폭을 그대로 지키고, 자리마다 그 글자 상자와 같은 크기의 창을 덮어
   * 0부터 그 숫자까지(한 바퀴 더) 굴린다. 왼쪽 자리부터 차례로 멈춘다. 다 굴러가면 창을 걷고 원래 글자로.
   * 글자 상자를 잴 수 없으면(안 보이는 칸) false를 돌려준다. 그때는 0부터 올리기로.
   */
  function roll(el: Element, at: number, duration: number, anims: Animation[], restores: (() => void)[], nth = 0) {
    // 숫자가 든 nth째 글 조각. 숫자가 둘인 값('3시간 30분')은 숫자마다 조각이 나뉘어 조각마다 굴린다(play의 count)
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    let node = walker.nextNode() as Text | null
    for (let seen = -1; node; node = walker.nextNode() as Text | null) if (/\d/.test(node.nodeValue || '') && ++seen === nth) break
    const parent = node && node.parentElement
    if (!node || !parent) return false
    const text = node.nodeValue || ''
    const all = text.match(/\d[\d,]*(\.\d+)?/g)
    if (!all || all.length !== 1 || all[0].replace(/\D/g, '').length > 9) return false
    const base = parent.getBoundingClientRect()
    // 발표 화면은 장을 줄여 그린다. 잰 값을 장의 px로 되돌린다
    const k = parent.offsetWidth ? base.width / parent.offsetWidth : 0
    if (!k) return false
    // 굴릴 수 있는지(자리마다 글자 상자가 보이는지)는 감싸기 전의 글에서 잰다. 감싼 것은 글자 모양을 바꾸지 않는 보통 span이라
    // 자리가 같고, 감싸고 바로 재면 숫자마다 장 전체를 다시 배치했다
    const range = document.createRange()
    for (let i = 0; i < text.length; i++) {
      if (text[i] < '0' || text[i] > '9') continue
      range.setStart(node, i)
      range.setEnd(node, i + 1)
      const b = range.getBoundingClientRect()
      if (!b.width || !b.height) return false
    }
    // 숫자마다 감싼다. 감싼 것은 글자 모양을 바꾸지 않는 보통 span이라 줄과 폭이 그대로다
    const frag = document.createDocumentFragment()
    const cells: HTMLElement[] = []
    let plain = ''
    for (const ch of text) {
      if (ch >= '0' && ch <= '9') {
        if (plain) frag.appendChild(document.createTextNode(plain))
        plain = ''
        const c = document.createElement('span')
        c.textContent = ch
        cells.push(c)
        frag.appendChild(c)
      } else plain += ch
    }
    if (plain) frag.appendChild(document.createTextNode(plain))
    const parts = Array.prototype.slice.call(frag.childNodes) as Node[]
    const original = node
    const covers: HTMLElement[] = []
    const position = parent.style.position
    // 원래 style 속성이 없었으면 되돌릴 때도 없게 (빈 style=""이 남으면 끝 모습의 DOM이 원래와 달라진다)
    const styled = parent.hasAttribute('style')
    const statics = getComputedStyle(parent).position === 'static'
    // 창과 띠는 모아 둔 쓰기 때 만든다. 그때의 빠르기가 아니라 이 칸의 빠르기로
    const speed = pace
    let boxes: DOMRect[] = []
    let heights: number[] = []
    let at0 = base
    let edge = { left: 0, top: 0 }
    // 같은 묶음에서 먼저 쓴 일이 이 글을 이미 바꿨으면(낱말로 나눈 글 안의 숫자) 굴리지 않는다. 없는 자리에 넣으면 장 전체의 움직임이 멈춘다
    let lost = false
    const job: Job = {
      write: () => {
        if (original.parentNode !== parent) {
          lost = true
          return
        }
        parent.replaceChild(frag, original)
        if (statics) parent.style.position = 'relative'
      },
      read: () => {
        if (lost) return
        at0 = parent.getBoundingClientRect()
        edge = { left: parent.clientLeft, top: parent.clientTop }
        boxes = cells.map((c) => c.getBoundingClientRect())
        // 창 높이(=띠의 줄 높이)는 글자 상자의 높이 그대로. 잰 높이를 줄인 비율로 되돌리면 127.92처럼 조금 모자라서, 줄 높이가
        // 글자 상자보다 작아지고 글자가 줄 안에서 1px 위로 맞춰졌다. offsetHeight는 줄이기와 상관없는 장의 px다
        heights = cells.map((c, i) => c.offsetHeight || boxes[i].height / k)
      },
      after: () => {
        if (lost) return
        const was = pace
        pace = speed
        const n = cells.length
        cells.forEach((c, i) => {
          const b = boxes[i]
          const h = heights[i]
          const digit = Number(c.textContent)
          const strip = document.createElement('span')
          strip.className = 'mo-odr'
          const seq: string[] = []
          // 0부터 한 바퀴(0~9) 돈 뒤 그 숫자에서 멈춘다. 마지막 칸이 꼭 그 숫자여야 한다(9 + digit까지만 넣으면 하나 모자라
          // 3.7에서 멈췄다가 원래 글자로 돌아올 때 4.8로 튄다)
          for (let d = 0; d <= 10 + digit; d++) seq.push(String(d % 10))
          const stop = seq.length - 1
          strip.textContent = seq.join('\n')
          strip.style.lineHeight = h + 'px'
          // 멈춘 자리는 translate가 아니라 margin으로 둔다. 글자 높이는 px 소수라서, 소수 translate로 옮긴 글자는 원래 글자와
          // 다른 자리에 맞춰 그려진다(녹화해 보니 멈춘 숫자가 1px 가까이 아래에 있다가, 움직임이 다 끝나 창을 걷을 때 위로 튀었다).
          // 움직임은 그 자리에서 아래로 내려간 데서 출발해 0(옮기지 않음)으로 끝난다
          strip.style.marginTop = -stop * h + 'px'
          const cover = document.createElement('span')
          cover.className = 'mo-od'
          cover.setAttribute('aria-hidden', 'true')
          cover.style.left = (b.left - at0.left) / k - edge.left + 'px'
          cover.style.top = (b.top - at0.top) / k - edge.top + 'px'
          cover.style.width = b.width / k + 'px'
          cover.style.height = h + 'px'
          cover.appendChild(strip)
          parent.appendChild(cover)
          covers.push(cover)
          c.className = 'mo-odc'
          // 왼쪽 자리가 먼저 멈추고 오른쪽으로 갈수록 조금씩 늦게
          const time = duration + (n > 1 ? (i / (n - 1)) * duration * 0.25 : 0)
          // 지나쳤다 돌아오지 않는다. 예전 생동감은 끝 숫자를 창 높이의 16%만큼 지나쳤다 돌아왔는데, 녹화해 보니 자리마다
          // 따로 지나쳐서 0.4초쯤 숫자가 들쭉날쭉 어긋나 보였다. 생동감도 같은 감속 곡선으로, 조금 더 길게 굴러 천천히 멈춘다
          run(anims, strip, [{ translate: `0 ${stop * h}px` }], at, { easing: EASE.reveal, duration: time })
        })
        pace = was
      },
    }
    defer(job)
    // 나눈 조각과 덮은 창을 걷고 원래 글 하나로 (아직 쓰지 않았으면 쓰지 않는다)
    restores.push(() => {
      if (!job.done) {
        job.dead = true
        return
      }
      if (lost) return
      covers.forEach((c) => c.remove())
      if (parts[0].parentNode === parent) parent.insertBefore(original, parts[0])
      parts.forEach((p) => p.parentNode === parent && parent.removeChild(p))
      parent.style.position = position
      if (!styled && !parent.getAttribute('style')) parent.removeAttribute('style')
    })
    return true
  }

  // ---------- 연출표 ----------

  /**
   * 한 장을 움직인다. 부품 장의 칸(.bk) 하나를 넘기면 그 부품만 (편집기에서 움직임을 고를 때 미리 보기).
   * 부품 장은 부품을 읽는 차례대로 하나씩: 레이아웃 부품은 그 레이아웃의 연출을 그 칸 안에서, 부품마다 고른 움직임이 있으면 그것으로.
   */
  /**
   * 장을 바꾸는 중이면 다음 장의 움직임을 이만큼 늦게 시작한다. 앞 장이 사라지기 전에 다음 장의 글이 나오면
   * 두 장의 글이 겹쳐 보인다(motion.css의 전환 시간과 맞춘다). 밀기와 다가오기는 앞 장이 220ms 안에 다 비킨다
   */
  const SWAP_LEAD: Record<string, number> = { fade: 170, zoom: 230, slide: 230, morph: 200 }

  function play(root: Element, levelName: MotionLevel, opts?: PlayOptions): MotionPlay {
    // 움직임 없음과 '동작 줄이기'에서도 '누르면' 나오는 부품은 누를 때까지 감춘다(발표하는 사람이 짚어 가며 말하는 차례라서)
    const quiet = levelName === 'none' || matchMedia('(prefers-reduced-motion: reduce)').matches
    const L: Level = LEVELS[levelName as keyof typeof LEVELS] || LEVELS.calm
    let lead = SWAP_LEAD[document.documentElement.dataset.moSwap || ''] || 0
    const cellOnly = root.classList.contains('bk') ? root : null
    const slide = cellOnly ? cellOnly.closest('.slide') : root.classList.contains('slide') ? root : root.querySelector('.slide')
    // 한 묶음(장이 나올 때, 누를 때마다)의 움직임. 묶음마다 새로 받아 묶음마다 뒷정리한다
    let anims: Animation[] = []
    let stops: (() => void)[] = []
    let restores: (() => void)[] = []
    let waits: Promise<void>[] = []
    const idle = Object.assign(() => {}, { next: () => false, left: () => 0 })
    if (!slide) return idle
    // 이어 움직이기로 넘어오는 중이면 앞 장의 것과 짝을 맞춘다 (짝이 된 것은 움직임 없이 옮겨 온다)
    if (morphFrom && !cellOnly && slide.closest(CURRENT)) pairUp(slide)
    // 장을 바꾸는 중인데 이 장을 움직이지 않으면 swap이 글을 늦게 들인다(두 장의 글이 겹쳐 보이지 않게)
    if (lead && !cellOnly && slide.closest(CURRENT)) stillSwap = quiet ? slide : null
    // 부품 하나를 움직이는 동안에는 그 칸 안에서만 찾고, 시간은 그 부품이 시작하는 때부터 센다
    let scope: Element = slide
    let t0 = 0
    const $ = (sel: string) => Array.prototype.slice.call(scope.querySelectorAll(sel)) as HTMLElement[]
    const one = (sel: string) => scope.querySelector(sel) as HTMLElement | null
    const layout = (/\bl-([a-zA-Z]+)/.exec(slide.className) || [])[1] || ''
    const slideVariant = (/\bva-([a-zA-Z]+)/.exec(slide.className) || [])[1] || 'base'
    // 옆 판을 반대쪽으로 옮긴 장: 판이 들어오는 쪽도 바꾼다
    const flipped = slide.classList.contains('is-flip')
    // 장면(data-scene): 장 전체를 한 컷으로 짠다. 아래 scene()이 연출표의 움직임을 다시 짜고 층을 얹는다
    const sceneName = cellOnly ? null : slide.getAttribute('data-scene')
    const sceneOn = !!sceneName
    /** 장면이 한 글자씩 내려앉게 할 글 (words가 이 글을 만나면 letters로) */
    let lettersFor: Element | null = null
    const s = (ms: number) => (t0 + ms * pace) * L.speed + lead
    /** 걸리는 시간은 시작 때와 상관없이 빠르기만 맞춘다 */
    const d = (ms: number) => ms * L.speed

    // 오르는 만큼은 원래 자리에 더한다(composite: 'add'). 바꿔 끼우면 제자리를 잡으려고 translate를 쓰는 것(추이와 두 값 비교의 점 숫자는
    // 점 가운데로 -50%, 증감 요인의 가로 값은 위아래 가운데로 -50%)이 0에서 출발해, 숫자가 비스듬히 미끄러져 들어왔다
    const rise = (el: Element | null, at: number, y = L.y, timing: Spring = L.move) => {
      if (!el) return
      run(anims, el, [{ opacity: 0 }], s(at), timing)
      run(anims, el, [{ translate: `0 ${y}px`, composite: 'add' }], s(at), timing)
    }
    const card = (el: Element | null, at: number) => {
      if (el) run(anims, el, [{ opacity: 0, translate: `0 ${L.y}px`, scale: String(L.scale) }], s(at), L.move)
    }
    const fade = (el: Element | null, at: number, duration = 600) => {
      if (el) run(anims, el, [{ opacity: 0 }], s(at), { easing: OUT, duration })
    }
    /**
     * 선을 그은 줄(목록과 표의 줄): 줄째 그 줄의 차례에 흐리게 들인다. 칸의 본문(.bk-in)과 함께 나타나면 선만 먼저 깔려 있다가
     * 줄마다 글이 채워져서 빈 표처럼 보였다(녹화해 보니 예상 질문의 마지막 줄은 선만 0.4초 보였다)
     */
    const ruled = (el: Element | null, at: number) => fade(el, at, 280)
    /**
     * 줄 선 긋기(표와 비교의 줄): 줄을 왼쪽에서부터 걷어 열어 줄 선이 그어지는 것처럼 보인다. 칸의 글은 따로 가림막 뒤에서
     * 올라온다(lines). 위아래는 넉넉히 열어 두어 올라오는 글의 위아래가 걷는 창에 잘리지 않는다. 처음에 빨리 열리고 끝에서
     * 천천히 멈춰서(감속), 줄의 오른쪽 칸 글이 올라오기 시작할 때는 선이 이미 거기까지 와 있다. 줄째 흐리게 들이던 때는
     * 머리줄이 장 제목이 올라오는 동안 옅게 먼저 깔렸고, 칸 글이 한 덩어리로 떠서 표의 짜임(줄과 열)이 움직임에 드러나지 않았다
     */
    const sweep = (el: Element | null, at: number) => {
      if (!el) return
      run(anims, el, [{ clipPath: 'inset(-40px 100% -40px 0)' }, { clipPath: 'inset(-40px 0 -40px 0)' }], s(at), {
        easing: EASE.reveal,
        duration: d(levelName === 'lively' ? 760 : 600),
      })
    }
    /** 가는 꺾쇠(slides/arrow.tsx): 가리키는 쪽으로 조금 밀려 나온다. 튀어나오게(크기) 하면 가는 획이 굵어 보였다 */
    const nudge = (el: Element | null, at: number) => {
      if (el) run(anims, el, [{ opacity: 0, translate: `${-L.y * 0.6}px 0` }], s(at), L.move)
    }
    const pop = (el: Element | null, at: number, pseudo?: string) => {
      if (el) run(anims, el, [{ opacity: 0, scale: '0.3' }], s(at), L.pop, pseudo)
    }
    /** x: 왼쪽에서 (가로 막대), down: 위에서 (세로 일정의 선), up: 바닥에서 (세로 막대) */
    /** 막대가 자란다. x는 왼쪽에서 오른쪽으로, back은 오른쪽에서 왼쪽으로, up과 down은 아래와 위에서 */
    const grow = (el: Element | null, at: number, axis: 'x' | 'back' | 'down' | 'up' = 'x', pseudo?: string) => {
      if (!el) return
      const origin = { x: 'left center', back: 'right center', down: 'center top', up: 'center bottom' }[axis]
      const across = axis === 'x' || axis === 'back'
      run(anims, el, [{ scale: across ? '0 1' : '1 0', transformOrigin: origin }, { scale: '1 1', transformOrigin: origin }], s(at), L.grow, pseudo)
    }
    const wipe = (el: Element | null, at: number, from: 'left' | 'right' | 'bottom' | 'top', duration = 1000) => {
      if (!el) return
      const inset = { left: 'inset(0 100% 0 0)', right: 'inset(0 0 0 100%)', bottom: 'inset(100% 0 0 0)', top: 'inset(0 0 100% 0)' }[from]
      // 걷히는 곡선은 감속만: 천천히 떠나 빨라졌다 멈추는(ease-in-out) 곡선은 흔한 프레젠테이션의 '닦아내기'처럼 기계적으로 보였다.
      // 먹이 번지듯 처음에 빨리 열리고 끝에서 천천히 멈춘다
      run(anims, el, [{ clipPath: inset }, { clipPath: 'inset(0 0 0 0)' }], s(at), { easing: EASE.reveal, duration: d(duration) })
    }
    /**
     * 이미지 당기기: 가림막이 걷히는 동안 그림이 조금 크게, 걷히는 쪽으로 조금 비켜 있다가 제자리로 다가앉는다(걷히는 가림막에 끌려
     * 들어오듯). 비키는 거리는 커진 만큼의 4분의 1이라 그림 끝이 칸 안으로 들어오지 않는다(커진 만큼의 절반이 양쪽으로 넘친다).
     * 생동감은 천천히(big배에서), 차분하게는 커지는 만큼을 반으로 줄이고 1.4배 오래: 차분하게도 생동감과 똑같이 당겨서 두 단계가
     * 다르지 않았다. 옅게 오래 다가앉아 다 보인 뒤에도 눈에 걸리지 않는다
     */
    const pull = (img: Element | null, big: number, duration: number, from: 'left' | 'right') => {
      if (!img) return
      const k = levelName === 'lively' ? 1 : 0.5
      const grow = (big - 1) * k
      const dx = (from === 'left' ? -25 : 25) * grow
      run(anims, img, [{ scale: String(1 + grow), translate: `${dx}% 0` }, { scale: '1', translate: '0 0' }], s(0), {
        easing: EASE.reveal,
        duration: k === 1 ? duration : duration * 1.4,
      })
    }
    /**
   * 낱말마다 아래에서 올라오는 제목. 생동감은 번진 먹이 가라앉듯 조금 흐린 데서 또렷해지며 선다(L.ink).
   * 예전에는 기울었다가(3도) 바로 섰는데, 낱말마다 고개를 까딱여서 흔한 프레젠테이션 효과처럼 보였다
   */
    /**
     * 제목: 제자리에서 짧게 또렷해진다(옮기지 않는다). 낱말마다 아래에서 올라오던 때는 장마다 제목이 날아 들어와(사용자: 글자가
     * 날아오는 모션은 필요 없다, 장표라 바로 깔끔하게 나오는 게 보기 좋다) 눈이 그림보다 글의 움직임에 먼저 갔다. 움직임은 그림(막대,
     * 선, 조각)이 맡고 글은 조용히 선다. 장면이 이 글을 초점으로 삼았을 때만 한 글자씩(letters, 사람이 고른 연출)
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const words = (el: Element | null, at: number, _gap = L.word, _blur = false) => {
      if (!el || still || el.closest('[data-mo-keep]')) return at
      if (el === lettersFor) return letters(el, at)
      fade(el, at, d(360))
      return at + 160
    }
    /**
     * 한 글자씩(글자 결): 글자마다 아주 조금(0.12em) 아래에서 옅게 시작해 제자리에 내려앉는다. 넘치지 않는 감속 곡선.
     * 글자 사이는 짧게(차분하게 30ms, 생동감 24ms), 다 합쳐 1초를 넘지 않게 좁힌다. 글자가 많아 사이가 12ms보다 좁아지면
     * 글자마다는 눈에 들지 않으니 낱말마다로 나눈다. 문장 부호는 앞 글자와 함께 나와 빈 시간을 만들지 않는다.
     * 생동감은 먹이 가라앉듯 아주 조금(1.5px) 흐린 데서 또렷해진다. 다음 차례가 시작할 수 있는 때를 돌려준다
     */
    const letters = (el: Element | null, at: number) => {
      if (!el || still || el.closest('[data-mo-keep]')) return at
      // 편집 중인 칸의 글자는 나누지 않는다 (입력 칸을 건드리지 않게). 흐리게만
      if (el.closest('.m-edit') || el.querySelector('[contenteditable]')) {
        fade(el, at, 600)
        return at + 300
      }
      const lively = levelName === 'lively'
      const cap = 1000
      let split = splitWords(el, true)
      const beats = split.marks.filter((m) => !m).length
      let step = Math.min(lively ? 24 : 30, cap / Math.max(1, beats))
      if (step < 12) {
        split.restore()
        split = splitWords(el)
        step = Math.min(L.word, cap / Math.max(1, split.words.length))
      }
      restores.push(split.restore)
      // 글자는 제자리에서 나타나기만 한다(써지는 것처럼): 아래에서 올라오며 흐렸다 또렷해지던 때는 첫 장 제목이 날아오는 것처럼
      // 보였다(사용자: 글자가 날아오는 모션은 필요 없다)
      const from: Keyframe = { opacity: 0 }
      const to: Keyframe = { opacity: 1 }
      let t = at
      split.words.forEach((w, i) => {
        if (i > 0 && !split.marks[i]) t += step
        run(anims, w, [from, to], s(t), { easing: EASE.reveal, duration: d(lively ? 620 : 520) })
      })
      return t + 120
    }
    /**
     * 줄 올라오기: 글이 줄마다 제 줄의 가림막 뒤에서 밀려 올라온다(위 줄부터). 설명 글, 인용, 강조 상자가 칸째 한 덩어리로
     * 떠오르던 때는 몇 줄인지, 어디서 끊기는지 같은 글의 짜임이 움직임에 드러나지 않았다(필름으로 끊어 보니 장 제목만 낱말마다
     * 올라오고 컴포넌트의 글은 상자째 떴다). 낱말로 나눈 뒤(splitWords, 낱말 상자가 가림막) 같은 줄의 낱말은 왼쪽부터 아주 조금씩만
     * 엇갈려 한 줄로 읽히게 올린다. 줄이 많아도 다 합쳐 0.7초(생동감 0.9초) 안에 시작하게 줄 사이를 좁힌다. 장면이 이 글을 초점으로
     * 삼았으면 한 글자씩(letters). 다음 차례가 시작할 수 있는 때를 돌려준다
     */
    const lines = (el: Element | null, at: number) => {
      if (!el || still || el.closest('[data-mo-keep]')) return at
      if (el === lettersFor) return letters(el, at)
      // 글은 줄마다 밀어 올리지 않고 제자리에서 짧게 또렷해진다(words와 같은 까닭)
      fade(el, at, d(360))
      return at + 160
    }
    /**
     * 칸 안에서 숫자가 든 글 조각 수. 숫자가 둘인 값('6분 30초', '3억 5,000만 원')은 단위를 작게 떼어 그려서(fields.tsx의 numberRuns)
     * 숫자마다 조각이 나뉜다. 굴리기와 올리기는 조각 하나만 다뤄서, 그런 값을 한 번 굴리면 앞 숫자만 구르고 뒤 숫자는 서 있었다
     */
    const digitTexts = (el: Element) => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
      let n = 0
      for (let node = walker.nextNode(); node; node = walker.nextNode()) if (/\d/.test(node.nodeValue || '')) n++
      return n
    }
    const count = (el: Element | null, at: number) => {
      // 편집 중인 칸의 글자는 바꾸지 않는다 (쓰고 있는 글과 엇갈리지 않게). 옮겨 온 숫자는 다시 굴리지 않는다
      if (!el || still || el.closest('.m-edit, [data-mo-keep]')) return
      // 자리마다 굴린다. 생동감은 조금 더 길게 구른다. 굴릴 수 없는 칸은 0부터 올린다
      const lively = levelName === 'lively'
      // 숫자가 둘인 값은 숫자 조각마다 굴린다(digitTexts). 0부터 올리기는 숫자 하나만 다뤄서, 굴릴 수 없으면 그대로 둔다
      const runs = digitTexts(el)
      // 20 이하의 정수 하나(4곳, 7명)는 굴리지 않고 0부터 하나씩 센다: 자리마다 한 바퀴 더 굴리면 4가 되기 전에 5, 3이 보여
      // 틀린 수처럼 읽혔다(발표 녹화)
      const small = /^\D*\b([0-9]|1[0-9]|20)\b\D*$/.test(el.textContent || '')
      if (runs === 1 && small) {
        countUp(el, s(at), (lively ? 900 : 700) * pace, stops, waits)
        return
      }
      if (runs > 1) {
        for (let i = 0; i < runs; i++) roll(el, s(at), lively ? 900 : 800, anims, restores, i)
        return
      }
      // 숫자는 장이 나오고 2초 안에 다 멈춘다(녹화해 보니 1.3초씩 굴리면 다음 장으로 넘길 때까지 굴러가고 있었다)
      if (!roll(el, s(at), lively ? 900 : 800, anims, restores))
        countUp(el, s(at), (lively ? 1000 : 800) * pace, stops, waits)
    }
    /**
     * 지금 점(강조한 점)이 맺힌 뒤 고리가 두 번 퍼진다. 고리는 그동안만 점 안에 넣는다.
     * 두 고리는 겹쳐서 이어 퍼진다: 0.9초 간격, 1.4초씩이던 때는 생동감에서 점이 맺히고도 2.9초를 더 움직여서,
     * 발표하는 사람이 말을 시작한 뒤에도 장 한쪽이 계속 깜빡였다
     */
    const pulse = (el: HTMLElement | null, at: number) => {
      if (!el || still || el.closest('.m-edit, [data-mo-keep]')) return
      const ring = document.createElement('span')
      ring.className = 'mo-ring'
      ring.setAttribute('aria-hidden', 'true')
      // 점의 테두리 바깥에 맞춘다
      ring.style.inset = -el.clientLeft + 'px'
      el.appendChild(ring)
      restores.push(() => ring.remove())
      for (const k of [0, 1]) {
        run(
          anims,
          ring,
          [
            { opacity: 0, scale: '1', offset: 0 },
            { opacity: 0.6, scale: '1.15', offset: 0.1 },
            { opacity: 0, scale: '2.6', offset: 1 },
          ],
          s(at) + k * d(650),
          { easing: EASE.reveal, duration: d(1100) },
        )
      }
    }
    /**
     * 글이 한 글자씩 써진다(대화). 칸의 높이는 다 쓴 높이로 붙잡아 두어 쓰는 동안 아래 줄이 밀리지 않고, 글 끝에 강조색 커서가 따라간다.
     * keep이면 다 쓴 뒤에도 커서가 남아 깜빡인다(생동감의 마지막 말: 장을 떠나면 걷힌다). 편집 중이거나 움직임을 줄인 화면에서는
     * 글을 바꾸지 않고 흐리게 들이기만 한다. 끝나면 원래 글 조각으로 되돌린다(play의 끝 표시)
     */
    /** 프레임마다 직접 그리는 움직임의 시계: '하나씩'으로 멈춘 컴포넌트 안이면 멈춘 동안은 흐르지 않는다(위의 Stepper) */
    const nowFor = (el: Element) => {
      const st = steppers.find((x) => x.cell.contains(el))
      return st ? (st.at ?? performance.now()) - st.held : performance.now()
    }
    const typeOut = (el: Element | null, at: number, ms: number, keep = false) => {
      if (!(el instanceof HTMLElement)) return
      if (still || quiet || el.closest('.m-edit, [data-mo-keep]')) {
        fade(el, at, 300)
        return
      }
      const nodes: Text[] = []
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
      for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text)
      const texts = nodes.map((n) => n.nodeValue || '')
      const chars = texts.map((t) => [...t])
      const total = chars.reduce((a, c) => a + c.length, 0)
      if (!total) return
      const minH = el.style.minHeight
      el.style.minHeight = el.offsetHeight + 'px'
      const caret = document.createElement('span')
      caret.className = 'mo-caret'
      caret.setAttribute('aria-hidden', 'true')
      const show = (k: number) => {
        let left = k
        nodes.forEach((n, i) => {
          const take = Math.max(0, Math.min(chars[i].length, left))
          n.nodeValue = chars[i].slice(0, take).join('')
          left -= take
        })
      }
      show(0)
      el.appendChild(caret)
      const start = performance.now() + s(at)
      const dur = d(ms)
      let frame = 0
      let done = () => {}
      waits.push(new Promise<void>((r) => (done = r)))
      const restore = () => {
        nodes.forEach((n, i) => (n.nodeValue = texts[i]))
        el.style.minHeight = minH
      }
      const tick = () => {
        const t = Math.min(1, Math.max(0, (nowFor(el) - start) / dur))
        show(Math.round(total * t))
        if (t < 1) frame = requestAnimationFrame(tick)
        else {
          restore()
          el.appendChild(caret)
          if (keep && levelName === 'lively') caret.classList.add('is-blink')
          else caret.remove()
          done()
        }
      }
      frame = requestAnimationFrame(tick)
      stops.push(() => {
        cancelAnimationFrame(frame)
        restore()
        caret.remove()
        done()
      })
    }
    /** 감싼 줄이 따로 나타나지 않는 숫자: 올라가기 시작할 때 함께 나타난다. 아직 차례가 아닌 줄에 0이 미리 보이지 않게 */
    const countIn = (el: Element | null, at: number) => {
      fade(el, at, 240)
      count(el, at)
    }
    /**
     * 값 이어 움직이기: 이어 움직이기로 짝이 된 것(el) 안의 값을 앞 장의 값(was)에서 지금 값으로 옮긴다. 숫자가 든 글은 앞 값에서 새 값까지
     * 세고(숫자 밖의 글이 같은 것만: '42%'에서 '58%'로. 단위나 꼴이 바뀌면 그대로 둔다), 값 변수와 그림의 좌표는 사이 값으로 옮긴다.
     *
     * 눈금(축): 차트는 장마다 제 값에 맞춘 눈금으로 그린다(막대는 가장 큰 값을 끝까지, 추이는 값의 범위를 위아래 끝까지). 길이를 그대로
     * 사이 값으로 옮기면 두 장의 눈금이 섞여, 3.5에서 5.0으로 오르는 막대가 그대로 있고 2.5에서 3.0으로 오르는 막대는 줄어들었다
     * (감성 검수). 그래서 값 변수마다 그 요소 안의 숫자와 길이를 맞대어 눈금(길이 = α + β·값)을 두 장에서 각각 찾고, 찾으면 단계를 나눈다
     * (Heer & Robertson 2007의 '눈금을 먼저, 값은 그다음'): ① 앞 장의 눈금에서 두 장을 다 담는 눈금으로(모든 막대가 같은 비율로 줄어든다),
     * ② 그 한 눈금 위에서 값이 바뀌고(막대와 숫자가 같은 쪽으로 같이), ③ 필요하면 새 장의 눈금으로. 숫자가 없는 것(목표선)도 같은 눈금을
     * 따라가서, 값이 같은 목표선은 값이 바뀌는 동안 가만히 있다. 눈금을 찾지 못한 값은 예전처럼 사이 값으로 옮긴다.
     *
     * 시계는 아무것도 바꾸지 않는 움직임 하나(곡선 없이 흐르는 진행)이고, 단계마다 '들어와 자리 잡기' 곡선(EASE.out: 빨리 떠나 천천히 멈춘다)을
     * 입힌다. 누르고 0.06초에 떠난다: 0.3초 넘게 가만히 있던 때는 발표하는 사람이 넘어가지 않은 줄 알고 한 번 더 눌렀다(감성 검수).
     * 짝의 앞 모습은 그 사이(motion.css의 0.14초)에 거의 다 옅어져 두 겹으로 보이지 않는다. 끝나면 글과 값을 원래 문자열 그대로 돌려 둔다
     */
    const carry = (el: HTMLElement, was: Values) => {
      if (still) return
      type Tick = { v: number; at: (group: string, u: number) => number | null }
      const sets: ((t: Tick) => void)[] = []
      const undo: (() => void)[] = []
      const NUM = /^(\D*)(\d[\d,]*)(\.\d+)?(\D*)$/
      const plain = /^\s*-?(?:\d+\.?\d*|\.\d+)\s*$/
      const NUMS = /-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi
      /** 켜짐이 바뀐 몫 표시(칸 조립의 칸, 비율의 막대) */
      const flips: { el: Element; to: boolean }[] = []
      /** 점 숫자가 서는 쪽이 바뀐 것 */
      const sides: { el: Element; before: string[]; after: string[] }[] = []
      /** 숫자가 든 글(바뀌지 않은 것도: 눈금을 찾는 데 쓴다) */
      const nums: { node: Text; old: string; now: string; from: number; to: number; m: RegExpExecArray }[] = []
      /** 값 변수 */
      const vars: { n: HTMLElement; name: string; group: string; before: string; now: string; q0: number; q1: number; prio: string }[] = []
      walkPaths(el, (n, path) => {
        const w = was.get(path)
        const on = n.classList.contains('is-on')
        if (on !== !!(w && w.on)) flips.push({ el: n, to: on })
        if (!w) return
        const side = sideOf(n)
        if (side !== (w.side || '')) sides.push({ el: n, before: (w.side || '').split(' '), after: side.split(' ') })
        let k = 0
        for (const c of Array.prototype.slice.call(n.childNodes) as Node[]) {
          if (c.nodeType !== 3) continue
          const old = w.texts[k++]
          const node = c as Text
          const now = node.nodeValue || ''
          const a = old ? NUM.exec(old) : null
          const b = NUM.exec(now)
          if (!old || !a || !b || a[1] !== b[1] || a[4] !== b[4] || (a[2] + b[2]).length > 30) continue
          const from = parseFloat((a[2] + (a[3] || '')).replace(/,/g, ''))
          const to = parseFloat((b[2] + (b[3] || '')).replace(/,/g, ''))
          if (Number.isFinite(from) && Number.isFinite(to)) nums.push({ node, old, now, from, to, m: b })
        }
        const st = (n as HTMLElement).style
        for (const name in w.vars) {
          const before = w.vars[name]
          const now = st ? st.getPropertyValue(name) : ''
          if (!now || !plain.test(now) || !plain.test(before)) continue
          if (SOFT_VARS.indexOf(name) >= 0 && now.indexOf('.') < 0) continue
          // 목표선의 높이(--ty)는 점의 높이(--y)와 같은 눈금이다
          vars.push({ n: n as HTMLElement, name, group: name === '--ty' ? '--y' : name, before, now, q0: parseFloat(before), q1: parseFloat(now), prio: st.getPropertyPriority(name) })
        }
        for (const name in w.attrs) {
          const before = w.attrs[name]
          const now = n.getAttribute(name)
          if (!now || now === before || before.replace(NUMS, '#') !== now.replace(NUMS, '#')) continue
          const a = (before.match(NUMS) || []).map(Number)
          const b = (now.match(NUMS) || []).map(Number)
          const parts = now.split(NUMS)
          if (a.length !== b.length || parts.length !== b.length + 1) continue
          // 추이의 선과 면(0~100 그림, 위가 0)은 점과 같은 눈금으로: 짝수 자리는 가로, 홀수 자리는 세로(100 - 높이)
          const line = name === 'points' && !!n.closest('.tn-svg')
          const text = (vals: number[]) => parts.map((part, i) => part + (i < vals.length ? String(Math.round(vals[i] * 100) / 100) : '')).join('')
          sets.push((t) => {
            if (t.v >= 1 && !line) return n.setAttribute(name, now)
            const vals = b.map((y, i) => {
              const x = a[i] + (y - a[i]) * t.v
              if (!line || i % 2 === 0) return x
              // 바닥(면의 아래 끝)은 늘 바닥이다. 값이 아니라 그림의 가장자리라서 눈금을 따라 뜨지 않게
              if (a[i] === 100 && y === 100) return 100
              const u0 = axes['--y'] ? (100 - a[i] - axes['--y'].a0.al) / axes['--y'].a0.be : NaN
              const u1 = axes['--y'] ? (100 - y - axes['--y'].a1.al) / axes['--y'].a1.be : NaN
              const q = t.at('--y', u0 + (u1 - u0) * t.v)
              return q === null ? x : 100 - q
            })
            n.setAttribute(name, text(vals))
          })
          undo.push(() => n.setAttribute(name, now))
        }
      })

      // ---- 눈금 찾기: 값 변수마다, 그 요소 안에 숫자가 하나뿐인 것들로 길이 = α + β·값을 두 장에서 각각 맞춘다 ----
      type Fit = { al: number; be: number }
      const fit = (pts: { u: number; q: number }[]): Fit | null => {
        // 막대는 아주 작은 값을 2%로 올려 그린다(Bars.tsx): 그 바닥에 걸린 점은 눈금을 맞출 때 뺀다
        const use = pts.filter((p) => p.q > 2.5).length >= 2 ? pts.filter((p) => p.q > 2.5) : pts
        if (!use.length) return null
        const mu = use.reduce((x, p) => x + p.u, 0) / use.length
        const mq = use.reduce((x, p) => x + p.q, 0) / use.length
        const vu = use.reduce((x, p) => x + (p.u - mu) * (p.u - mu), 0)
        // 값이 하나뿐이면 0에서 시작하는 눈금으로 본다(막대 하나)
        const be = vu > 1e-9 ? use.reduce((x, p) => x + (p.u - mu) * (p.q - mq), 0) / vu : mu ? mq / mu : 0
        const al = vu > 1e-9 ? mq - be * mu : 0
        if (!(be > 0) || !Number.isFinite(al)) return null
        return use.every((p) => Math.abs(al + be * p.u - p.q) <= 1) ? { al, be } : null
      }
      const axes: Record<string, { a0: Fit; a1: Fit; d0: [number, number]; d1: [number, number]; u: [number, number] }> = {}
      const groups = Array.from(new Set(vars.map((x) => x.group)))
      for (const g of groups) {
        const own = vars.filter((x) => x.group === g)
        const p0: { u: number; q: number }[] = []
        const p1: { u: number; q: number }[] = []
        for (const x of own) {
          const inside = nums.filter((t) => x.n.contains(t.node))
          if (inside.length !== 1) continue
          p0.push({ u: inside[0].from, q: x.q0 })
          p1.push({ u: inside[0].to, q: x.q1 })
        }
        const a0 = fit(p0)
        const a1 = fit(p1)
        if (!a0 || !a1) continue
        // 눈금이 담는 값의 범위(길이 0과 100에 놓이는 값)와, 두 장을 다 담는 범위
        const d0: [number, number] = [-a0.al / a0.be, (100 - a0.al) / a0.be]
        const d1: [number, number] = [-a1.al / a1.be, (100 - a1.al) / a1.be]
        axes[g] = { a0, a1, d0, d1, u: [Math.min(d0[0], d1[0]), Math.max(d0[1], d1[1])] }
      }
      const same = (a: [number, number], b: [number, number]) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) <= 0.002 * (b[1] - b[0])
      const first = Object.keys(axes).some((g) => !same(axes[g].d0, axes[g].u))
      const last = Object.keys(axes).some((g) => !same(axes[g].d1, axes[g].u))

      // ---- 바뀌는 값 ----
      for (const t of nums) {
        if (t.old === t.now || t.from === t.to) continue
        const { node, old, now, from, to, m: b } = t
        // 새 값의 꼴로 센다(소수 자리, 세 자리 쉼표). 앞 값이나 새 값에 쉼표가 있으면 세는 동안에도 쉼표를 둔다
        const decimals = b[3] ? b[3].length - 1 : 0
        const grouped = (old + now).indexOf(',') >= 0
        const format = (v: number) => {
          const [whole, frac] = v.toFixed(decimals).split('.')
          return b[1] + (grouped ? whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : whole) + (frac ? '.' + frac : '') + b[4]
        }
        sets.push((k) => (node.nodeValue = k.v <= 0 ? old : k.v >= 1 ? now : format(from + (to - from) * k.v)))
        undo.push(() => (node.nodeValue = now))
      }
      for (const x of vars) {
        const ax = axes[x.group]
        // 눈금이 같고 길이도 같으면 옮길 것이 없다(값이 같은 막대). 눈금이 바뀌면 값이 같아도 눈금을 따라간다
        if (x.before.trim() === x.now.trim() && (!ax || (same(ax.d0, ax.u) && same(ax.d1, ax.u)))) continue
        const u0 = ax ? (x.q0 - ax.a0.al) / ax.a0.be : 0
        const u1 = ax ? (x.q1 - ax.a1.al) / ax.a1.be : 0
        sets.push((t) => {
          const q = ax ? t.at(x.group, u0 + (u1 - u0) * t.v) : null
          x.n.style.setProperty(x.name, String(Math.round((q === null ? x.q0 + (x.q1 - x.q0) * t.v : q) * 1000) / 1000), x.prio)
        })
        undo.push(() => x.n.style.setProperty(x.name, x.now, x.prio))
      }
      // 몫을 칸마다 칠한 표시는 숫자가 세는 대로 하나씩 켜지고(늘 때는 앞에서부터) 꺼진다(줄 때는 뒤에서부터). 그대로 두면 새 몫의 칸이
      // 처음 0.26초에 한꺼번에 바뀌고 숫자만 혼자 세었다
      const ups = flips.filter((f) => f.to)
      const downs = flips.filter((f) => !f.to).reverse()
      for (const list of [ups, downs])
        list.forEach((f, k) => {
          const at = (k + 1) / (list.length + 1)
          sets.push((t) => f.el.classList.toggle('is-on', t.v >= at ? f.to : !f.to))
          undo.push(() => f.el.classList.toggle('is-on', f.to))
        })
      // 점 숫자가 서는 쪽이 바뀌었으면(점이 오르내려 선과 부딪히는 쪽이 달라졌다) 그때까지는 앞 장의 쪽에 두고, 숫자만 아주 잠깐 옅어졌다가
      // 새 쪽에서 다시 선다. 숫자마다 읽는 차례(왼쪽부터)로 엇갈려서 여럿이 한꺼번에 깜빡이지 않게. 그대로 두면 짝을 바꿔 끼우는 처음에
      // 숫자가 점의 반대쪽으로 건너뛰었다(필름)
      sides.forEach((sd, k) => {
        const mid = sides.length > 1 ? 0.3 + (0.4 * k) / (sides.length - 1) : 0.5
        const labels = (Array.prototype.slice.call(sd.el.children) as HTMLElement[]).filter((c) => (c.textContent || '').trim())
        const styles = labels.map((c) => c.getAttribute('style'))
        sets.push((t) => {
          const list = t.v < mid ? sd.before : sd.after
          for (const c of SIDES) sd.el.classList.toggle(c, list.indexOf(c) >= 0)
          const o = Math.min(1, Math.abs(t.v - mid) / 0.09)
          for (const c of labels) c.style.opacity = o >= 1 ? '' : String(o)
        })
        undo.push(() => {
          for (const c of SIDES) sd.el.classList.toggle(c, sd.after.indexOf(c) >= 0)
          labels.forEach((c, i) => (styles[i] === null ? c.removeAttribute('style') : c.setAttribute('style', styles[i]!)))
        })
      })
      if (!sets.length) return

      // ---- 시계와 단계: ① 앞 눈금 → 두 장을 다 담는 눈금, ② 값, ③ 새 눈금. 없는 단계는 건너뛴다 ----
      const ease = curve(EASE.out)
      // 단계는 조금씩 겹친다: 곡선이 빨리 떠나 천천히 멈춰서, 앞 단계가 거의 다 왔을 때(남은 것이 눈에 띄지 않을 때) 다음 단계가 떠난다.
      // 겹치지 않던 때는 눈금이 다 바뀐 뒤 0.2초 남짓 아무것도 움직이지 않다가 값이 떠났다(필름)
      const a1 = first ? 0.3 : 0
      const v0 = first ? 0.16 : 0
      const v1 = last ? 0.82 : 1
      const a3 = last ? 0.6 : 1
      const clamp = (x: number) => Math.max(0, Math.min(1, x))
      const tick = (raw: number): Tick => {
        const e1 = first ? ease(clamp(raw / a1)) : 1
        const e3 = last ? ease(clamp((raw - a3) / (1 - a3))) : 0
        const v = raw >= 1 ? 1 : ease(clamp((raw - v0) / (v1 - v0)))
        return {
          v,
          at: (g, u) => {
            const ax = axes[g]
            if (!ax) return null
            const lerp = (a: [number, number], b: [number, number], k: number): [number, number] => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]
            const dom = e3 > 0 ? lerp(ax.u, ax.d1, e3) : lerp(ax.d0, ax.u, e1)
            return ((u - dom[0]) / (dom[1] - dom[0])) * 100
          },
        }
      }
      const clock = el.animate([], { duration: d(1100), delay: 60, easing: 'linear' })
      anims.push(clock)
      const apply = (raw: number) => {
        const t = tick(raw)
        sets.forEach((f) => f(t))
      }
      apply(0)
      let frame = 0
      let done = () => {}
      waits.push(new Promise<void>((r) => (done = r)))
      const end = () => {
        cancelAnimationFrame(frame)
        undo.forEach((f) => f())
        done()
      }
      const step = () => {
        if (clock.playState === 'finished' || clock.playState === 'idle') return end()
        const p = clock.effect ? clock.effect.getComputedTiming().progress : null
        apply(typeof p === 'number' ? p : 0)
        frame = requestAnimationFrame(step)
      }
      frame = requestAnimationFrame(step)
      stops.push(end)
    }
    /**
     * 차례로 나오는 n개의 사이(Motion Canvas의 sequence, anime.js의 stagger와 같은 생각을 우리 말로).
     * 기본 사이로 늘어놓되, 첫 것부터 마지막 것이 나오기 시작할 때까지가 span을 넘지 않게 좁힌다: 항목이 열둘인 목록도
     * 넷인 목록과 거의 같은 때에 다 나와서, 듣는 사람이 마지막 줄을 기다리지 않는다
     */
    const stagger = (n: number, step: number, span = L.span) => (n > 1 ? Math.min(step, span / (n - 1)) : step)
    const items = (sel: string, at: number, each: (el: HTMLElement, at: number, i: number) => void, step = L.step) => {
      const list = $(sel)
      const gap = stagger(list.length, step)
      list.forEach((el, i) => each(el, at + i * gap, i))
      return at + list.length * gap
    }

    // 머리: 제목 낱말 → 부제. 본문은 제목이 거의 다 올라왔을 때부터. 부품 안에서는 머리가 없다.
    // 본문 상자도 그때 함께 나타난다: 따로 움직이지 않는 줄(표의 선, 빈 막대 자리, 단위)이 장이 뜨자마자
    // 제목보다 먼저 보이면 빈 틀이 깔려 있다가 채워지는 것처럼 보인다 (녹화해 보니 그랬다)
    // 장의 머리와 본문 상자는 장 바로 아래의 것만(:scope >). 부품 장에는 본문 상자가 없고 레이아웃 부품마다 제 본문 상자가 있어서,
    // 그냥 찾으면 첫 레이아웃 부품의 본문 상자를 장 머리의 때에 흐리게 들였다(그 부품의 차례보다 먼저)
    const head = () => {
      if (scope !== slide) return 0
      const t = words(one(':scope > .s-head .s-title'), 0)
      fade(one(':scope > .s-head .s-lead'), Math.min(t, 420), d(360))
      const body = Math.min(t, 520)
      fade(one(':scope > .s-body'), Math.max(0, body - 120), 360)
      return body
    }

    // 부품 장: 부품을 나오는 차례(data-seq, 움직임 탭에서 정한 차례)로 늘어놓고, '누르면' 나오는 부품마다 차례 묶음을 새로 연다.
    // 첫 묶음은 장이 나올 때, 나머지는 발표하는 사람이 누를 때마다 하나씩 (PowerPoint의 '클릭할 때')
    const links = !cellOnly && layout === 'compose' ? $('.bk-area > .bk-link') : []
    const groups: HTMLElement[][] = [[]]
    if (!cellOnly && layout === 'compose') {
      const cells = $('.bk-area > .bk')
        .map((el, i) => ({ el, k: el.dataset.seq === undefined ? i : Number(el.dataset.seq) }))
        .sort((a, b) => a.k - b.k)
        .map((c) => c.el)
      for (const cell of cells) {
        if (cell.dataset.when === 'click') groups.push([cell])
        else groups[groups.length - 1].push(cell)
      }
    }
    const auto = opts?.clicks === 'auto'
    const waiting = auto ? [] : groups.slice(1)
    /** 묶음의 부품과 그 뒤에 서는 이음표. 누를 때까지 자리는 지키고 보이지만 않게 (motion.css의 .mo-hold) */
    const hold = (group: HTMLElement[], on: boolean) => {
      for (const cell of group) {
        cell.classList.toggle('mo-hold', on)
        for (const lk of links) if (lk.dataset.after === cell.dataset.block) lk.classList.toggle('mo-hold', on)
      }
    }
    waiting.forEach((g) => hold(g, true))

    /**
     * '하나씩'(data-reveal="each"): 컴포넌트 안의 항목마다 첫 움직임이 시작하는 때(marks)를 재 두고, 그때가 되면 그 컴포넌트의
     * 움직임을 모두 그 자리에서 멈춘다. 누르면 이어 간다(다음 항목까지). 아직 그때가 안 됐는데 누르면 그때로 건너뛰어 이어 간다.
     * 컴포넌트의 움직임은 한 묶음 안에서 같은 때에 만들어져 같은 시계를 쓰므로, 멈춘 때의 어긋남만큼 되감아 정확히 그 자리에 세운다.
     * 프레임마다 직접 그리는 것(한 글자씩 쓰기, 수 세기)은 nowFor로 같은 시계를 읽어 같이 멈춘다
     */
    type Stepper = { cell: HTMLElement; marks: number[]; i: number; born: number; held: number; at: number | null; raf: number }
    const steppers: Stepper[] = []
    /** 다 보인 장(뒤로 돌아온 장, 넘긴 장): 그 뒤에 재는 '하나씩'은 멈추지 않는다. 멈출 자리는 다음 프레임에 재므로, 그사이에
     *  다 보이게 한 장을 다시 멈춰 세웠다(뒤로 돌아온 대화가 두 마디에서 멈춰 있었다) */
    let shown = false
    const logical = (st: Stepper) => (st.at ?? performance.now()) - st.held - st.born
    const cellAnims = (st: Stepper) => st.cell.getAnimations({ subtree: true })
    const watch = (st: Stepper) => {
      cancelAnimationFrame(st.raf)
      const tick = () => {
        if (st.i >= st.marks.length) return
        const over = logical(st) - st.marks[st.i]
        if (st.at === null && over >= 0) {
          for (const a of cellAnims(st)) {
            if (a.currentTime !== null) a.currentTime = Math.max(0, Number(a.currentTime) - over)
            a.pause()
          }
          st.at = performance.now()
          st.held = st.at - st.born - st.marks[st.i]
          return
        }
        st.raf = requestAnimationFrame(tick)
      }
      st.raf = requestAnimationFrame(tick)
    }
    const stepIn = (cell: HTMLElement) => {
      if (shown) return
      // 그 순간 컴포넌트에 걸린 움직임으로 잰다: 장면은 연출표의 움직임을 다시 짜므로(scene) 만들 때 모은 목록은 이미 바뀌어 있다
      const mine = cell.getAnimations({ subtree: true })
      const items = Array.prototype.slice.call(cell.querySelectorAll('.it')).filter((it: HTMLElement) => !it.parentElement?.closest('.it')) as HTMLElement[]
      const startOf = (a: Animation) => Number((a.effect as KeyframeEffect | null)?.getTiming().delay) || 0
      const first = (it: HTMLElement) => {
        let m = Infinity
        for (const a of mine) {
          const t = (a.effect as KeyframeEffect | null)?.target
          if (t && it.contains(t)) m = Math.min(m, startOf(a))
        }
        return m
      }
      const base = items.length ? first(items[0]) : 0
      const marks = [...new Set(items.slice(1).map(first).filter((m) => Number.isFinite(m) && m > base + 1))].sort((a, b) => a - b)
      if (!marks.length) return
      const st: Stepper = { cell, marks, i: 0, born: performance.now(), held: 0, at: null, raf: 0 }
      steppers.push(st)
      watch(st)
    }
    /** 누르면: 멈춘 컴포넌트를 다음 항목까지 이어 간다. 아직 멈추기 전이면 다음 항목이 시작하는 때로 건너뛴다 */
    const stepOn = (st: Stepper) => {
      const t = st.marks[st.i]
      if (st.at !== null) {
        for (const a of cellAnims(st)) a.play()
        st.held = performance.now() - st.born - t
        st.at = null
      } else {
        const jump = t - logical(st)
        if (jump > 0) {
          for (const a of cellAnims(st)) if (a.currentTime !== null) a.currentTime = Number(a.currentTime) + jump
          st.held -= jump
        }
      }
      st.i++
      watch(st)
    }

    /** 부품 묶음 하나를 차례로. '함께'는 앞 부품과 같은 때에 나온다. 다음 묶음이 시작할 수 있는 때를 돌려준다 */
    const composeGroup = (group: HTMLElement[], at: number) => {
      const steps = group.filter((c, i) => i > 0 && c.dataset.when !== 'with').length
      // 부품 사이의 간격. 부품이 많으면 좁혀서 모든 부품이 정한 시간 안에 나오기 시작하게 한다. 녹화해 보니 생동감에서
      // 부품 다섯인 장은 마지막 부품이 1.7초에야 나오기 시작해 4초 넘게 움직였다(발표하는 사람이 말을 시작해도 장이 채워지는 중)
      const gap = Math.min(L.step * 2.6, (levelName === 'lively' ? 760 : 560) / Math.max(1, steps))
      let begin = at
      group.forEach((cell, i) => {
        if (i > 0 && cell.dataset.when !== 'with') begin += gap
        block(cell, begin)
        if (cell.dataset.reveal === 'each' && !auto && !still) {
          // 움직임은 다음 프레임에 시작하니(때가 정해지니) 그때 잰다
          requestAnimationFrame(() => stepIn(cell))
        }
        // 이음표는 앞의 부품이 나오고 다음 부품이 나오기 전에: 화살표는 가리키는 쪽으로 밀려 나오고, 나머지는 튀어나온다
        for (const lk of links) {
          if (lk.dataset.after !== cell.dataset.block) continue
          const g = lk.firstElementChild
          const at2 = begin + gap * 0.6
          if (lk.classList.contains('is-arrow')) {
            run(anims, g ?? lk, [{ opacity: 0, translate: lk.classList.contains('lk-v') ? `0 ${-L.y * 0.5}px` : `${-L.y * 0.5}px 0` }], s(at2), L.move)
          } else fade(g, at2, 420)
        }
      })
      return begin + gap
    }

    function choreo(layout: string, variant: string) {
    switch (layout) {
      case 'compose': {
        const t = head()
        let end = composeGroup(groups[0], Math.min(t, 420))
        fade(one('.s-source'), end + 200)
        // 미리 보기: '누르면' 나오는 묶음도 잠깐 쉬었다 이어서
        if (auto) for (const g of groups.slice(1)) end = composeGroup(g, end + 600)
        break
      }
      case 'cover': {
        // 띠는 아래에서, 오른쪽 면은 오른쪽에서 밀려 들어온다. 색 면 모양은 면이 장 전체라 줄만 나타난다
        // 표지는 밀어 넣지 않고 제자리에서 차례로 또렷해진다: 오른쪽 면이 밀려 들어오고 제목이 낱말마다 올라오던 때는 첫 장부터
        // 글자가 날아왔다(사용자). 면, 제목, 부제, 발표자 정보 차례로 짧게
        fade(one('.cv-side'), 0, d(500))
        fade(one('.cv-logo'), 120)
        const t = words(one('.cv-title'), 120)
        fade(one('.cv-lead'), t, d(360))
        fade(one('.cv-ask'), t + 120, d(360))
        items('.cv-meta > *', t + 200, (el, at) => fade(el, at, d(360)), 50)
        break
      }
      case 'section': {
        run(anims, one('.sc-num') ?? scope, [{ opacity: 0, translate: '0 22%' }], s(0), levelName === 'lively' ? SPRINGS.soft : SPRINGS.glide)
        const t = words(one('.sc-title'), 160)
        fade(one('.sc-lead'), t, d(360))
        fade(one('.sc-map'), t, 400)
        items('.sc-map li', t + 120, (el, at) => fade(el, at, 500), 60)
        break
      }
      case 'agenda': {
        // 선을 왼쪽부터 긋고(목록은 맨 위 굵은 선 다음 줄마다, 나란히는 칸마다 위의 선이 이어서) 이름이 올라온 뒤 번호가 뜬다
        const t = Math.min(words(one('.ag-title'), 0), 360)
        const list = one('.ag-list')
        if (list && getComputedStyle(list, '::before').content !== 'none') grow(list, Math.max(0, t - 120), 'x', '::before')
        items('.ag-item', t, (el, at) => {
          grow(el, at, 'x', '::after')
          rise(el.querySelector('.ag-t'), at + 60, L.y * 0.6)
          fade(el.querySelector('.ag-n'), at + 200, 700)
        })
        break
      }
      case 'statement': {
        const t = words(one('.st-title'), 0)
        fade(one('.st-lead'), t + 80, d(360))
        break
      }
      case 'summary': {
        const t = head()
        items('.sm-row', t, (el, at) => {
          ruled(el, at)
          fade(el.querySelector('.sm-label'), at, 500)
          rise(el.querySelector('.sm-body'), at + 40, L.y * 0.6)
        })
        break
      }
      case 'kpi': {
        const t = head()
        const end = items('.kp-item', t, (el, at) => {
          // 면이 있는 카드만 커지며 들어오고, 띠는 숫자가 올라오기만
          if (variant === 'cards') card(el, at)
          else rise(el, at, L.y * 0.7)
          count(el.querySelector('.kp-value'), at + 40)
        })
        fade(one('.s-source'), end + 200)
        break
      }
      case 'points': {
        const t = head()
        items('.pt-item', t, (el, at) => rise(el, at))
        break
      }
      case 'compare': {
        const t = head()
        // 두 쪽 이름이 앞 쪽부터 가림막 뒤에서 올라오고, 줄마다 앞 글의 선이 그어지며 글이 올라온 뒤 꺾쇠가 밀려 나오고
        // 뒤 글의 선과 글이 따른다. 머리줄을 통째로 띄우던 때는 두 이름이 한 덩어리로 떠서 '지금 → 바뀐 뒤'의 차례가 없었다
        lines(one('.cp-hl'), t + 80)
        lines(one('.cp-hr'), t + 200)
        items('.cp-row.it', t + 200, (el, at) => {
          const l = el.querySelector('.cp-l')
          const r = el.querySelector('.cp-r')
          sweep(l, at)
          lines(l, at + 40)
          nudge(el.querySelector('.cp-arrow'), at + 160)
          sweep(r, at + 240)
          lines(r, at + 280)
        })
        // 두 쪽 사이의 꺾쇠는 앞 쪽에서 뒤 쪽으로 조금 밀려 나온다(compare.css): 첫 줄의 앞 글 다음, 뒤 글 앞에
        nudge(one('.cp > .cp-arrow'), t + 200 + 160)
        break
      }
      case 'timeline': {
        const t = head()
        items('.tl-item', t, (el, at) => {
          grow(el, at, variant === 'steps' ? 'down' : 'x', '::before')
          pop(el.querySelector('.tl-dot'), at + 140)
          if (el.classList.contains('is-now')) pulse(el.querySelector('.tl-dot'), at + 420)
          rise(el.querySelector('.tl-meta'), at + 60, L.y * 0.5)
          rise(el.querySelector('.tl-title'), at + 200, L.y * 0.6)
          rise(el.querySelector('.tl-body'), at + 260, L.y * 0.6)
        }, L.step * 1.6)
        break
      }
      case 'case': {
        if (levelName === 'lively') wipe(one('.cs-side'), 0, flipped ? 'left' : 'right', 1000)
        else fade(one('.cs-side'), 0)
        const t = words(one('.cs-title'), 160)
        rise(one('.cs-body'), Math.min(t, 600), L.y * 0.6)
        rise(one('.cs-quote'), Math.min(t, 600) + 200, L.y * 0.6)
        pop(one('.cs-quote'), Math.min(t, 600) + 260, '::before')
        fade(one('.cs-logo'), 300)
        // 대상은 로고 아래에서 로고와 함께
        rise(one('.cs-client'), 360, L.y * 0.5)
        items('.cs-res', 500, (el, at) => {
          rise(el, at)
          count(el.querySelector('.cs-value'), at + 100)
        })
        break
      }
      case 'pricing': {
        const t = head()
        // 안마다 이름, 값, 덧붙임, 설명이 차례로: 글은 가림막 뒤에서 올라오고 값은 나타나며 자리마다 굴러 맞춰진다(countIn).
        // 표 모양은 안 사이의 줄 선이 왼쪽부터 그어진다. 안째 카드처럼 띄우던 때는 이름과 설명이 한 덩어리로 떠올라
        // 무엇이 이름이고 값인지가 움직임에 드러나지 않았다
        const end = items('.pr-plan', t, (el, at) => {
          if (variant === 'rows') sweep(el, at)
          lines(el.querySelector('.pr-name'), at + 40)
          countIn(el.querySelector('.pr-price'), at + 120)
          lines(el.querySelector('.pr-meta'), at + 200)
          lines(el.querySelector('.pr-body'), at + 260)
        })
        const hl = one('.pr-plan.is-hl')
        if (hl) {
          run(anims, hl, [{ scale: '1' }, { scale: '1.035' }, { scale: '1' }], s(end + 500), { easing: 'ease-in-out', duration: 700 })
          pop(hl.querySelector('.pr-tag'), end + 420)
        }
        break
      }
      case 'imageText': {
        const flip = !!one('.ix.is-flip')
        wipe(one('.ix-img'), 0, flip ? 'right' : 'left', 1100)
        pull(one('.ix-img img'), 1.16, 2600, flip ? 'right' : 'left')
        const t = words(one('.ix-title'), 380)
        rise(one('.ix-body'), Math.min(t, 760), L.y * 0.6)
        break
      }
      case 'logos': {
        const t = head()
        items('.lg-cell', t, (el, at) => run(anims, el, [{ opacity: 0, scale: '0.86' }], s(at), L.pop), 45)
        break
      }
      case 'bars': {
        const t = head()
        items('.br-row', t, (el, at) => {
          ruled(el, at)
          rise(el.querySelector('.br-label'), at, L.y * 0.5)
          fade(el.querySelector('.br-track'), at, 400)
          grow(el.querySelector(variant === 'columns' ? '.br-track' : '.br-fill'), at + 120, variant === 'columns' ? 'up' : 'x')
          countIn(el.querySelector('.br-value'), at + 120)
        })
        fade(one('.s-source'), t + 400)
        break
      }
      case 'versus': {
        const t = head()
        items('.vs-key', t, (el, at) => fade(el, at, 400), 80)
        fade(one('.vs-unit'), t, 400)
        let end = t
        if (one('.vs-rows.is-text')) {
          // 단위를 견줄 수 없어 원문만 남긴 줄은 차트 대신 글로 차례대로 나타낸다.
          end = items('.vs-row', t, (el, at) => rise(el, at, L.y * 0.4), L.step * 1.2)
        } else if (variant === 'lines') {
          // 앞 값(작년) 선이 먼저 그려지고, 뒤 값(올해) 선이 조금 늦게 그 위를 따라간다. 점은 선이 닿을 때 맺힌다
          const draw = d(levelName === 'lively' ? 1400 : 1000)
          const from = { a: t + 80, b: t + 420 }
          for (const k of ['a', 'b'] as const) {
            const svg = one(`.vs-svg.is-${k}`)
            if (svg) run(anims, svg, [{ clipPath: 'inset(-10% 100% -10% 0)' }, { clipPath: 'inset(-10% 0 -10% 0)' }], s(from[k]), { easing: 'linear', duration: draw })
          }
          const reach = (k: 'a' | 'b', x: number) => from[k] + (x / 100) * (draw / L.speed)
          $('.vs-pt').forEach((el) => {
            const k = el.classList.contains('is-a') ? 'a' : 'b'
            const at = reach(k, parseFloat(el.style.getPropertyValue('--x')) || 0)
            pop(el.querySelector('.vs-dot'), at)
            if (el.classList.contains('is-hl')) {
              rise(el.querySelector('.vs-val'), at + 60, L.y * 0.5)
              count(el.querySelector('.vs-num'), at + 60)
            } else fade(el.querySelector('.vs-val'), at + 40, 400)
          })
          $('.vs-col').forEach((el, i, all) => {
            fade(el.querySelector('.vs-name'), t + i * 30, 400)
            pop(el.querySelector('.vs-change'), reach('b', ((i + 0.5) / all.length) * 100) + 120)
          })
          end = from.b + draw / L.speed
        } else if (variant === 'dots') {
          // 점 두 개: 앞 값 점이 맺히고, 뒤 값 점이 앞 값 자리에서 제 자리까지 미끄러진다. 잇는 길은 점을 따라 늘어난다
          end = items('.vs-row', t, (el, at) => {
            fade(el.querySelector('.vs-label'), at, 400)
            pop(el.querySelector('.vs-d.is-a'), at + 60)
            fade(el.querySelector('.vs-num.is-a'), at + 60, 400)
            const a = el.style.getPropertyValue('--a')
            const b = el.style.getPropertyValue('--b')
            const dot = el.querySelector('.vs-d.is-b')
            if (dot && a && b) {
              run(anims, dot, [{ left: `${a}%`, opacity: 0 }, { left: `${a}%`, opacity: 1, offset: 0.12 }, { left: `${b}%`, opacity: 1 }], s(at + 160), L.grow)
              const span = el.querySelector('.vs-span')
              // 줄어든 줄은 오른쪽(앞 값)에서 왼쪽으로, 늘어난 줄은 왼쪽에서 오른쪽으로 늘어난다
              const origin = el.classList.contains('is-down') ? 'right center' : 'left center'
              if (span) run(anims, span, [{ scale: '0 1', transformOrigin: origin }, { scale: '1 1', transformOrigin: origin }], s(at + 160), L.grow)
            } else pop(dot, at + 160)
            rise(el.querySelector('.vs-num.is-b'), at + 240, L.y * 0.4)
            count(el.querySelector('.vs-num.is-b'), at + 240)
            pop(el.querySelector('.vs-change'), at + 520)
          }, L.step * 1.2)
        } else {
          // 항목마다 앞 값 막대가 서고, 바로 옆에서 뒤 값 막대가 더 높이(또는 낮게) 따라 선다. 바뀐 비율은 둘이 다 선 뒤에
          end = items('.vs-col', t, (el, at) => {
            fade(el.querySelector('.vs-name'), at, 400)
            grow(el.querySelector('.vs-bar.is-a .vs-fill'), at, 'up')
            grow(el.querySelector('.vs-bar.is-b .vs-fill'), at + 120, 'up')
            rise(el.querySelector('.vs-bar.is-a .vs-val'), at + 140, L.y * 0.4)
            count(el.querySelector('.vs-bar.is-a .vs-num'), at + 140)
            rise(el.querySelector('.vs-bar.is-b .vs-val'), at + 260, L.y * 0.4)
            count(el.querySelector('.vs-bar.is-b .vs-num'), at + 260)
            pop(el.querySelector('.vs-change'), at + 460)
          }, L.step * 1.2)
        }
        fade(one('.s-source'), end + 200)
        break
      }
      case 'scorecard': {
        const t = head()
        fade(one('.sk-headrow'), t, 500)
        const end = items('.sk-row.it', t + 120, (el, at) => {
          ruled(el, at)
          rise(el.querySelector('.sk-name'), at, L.y * 0.5)
          grow(el.querySelector('.sk-fill'), at + 120)
          pop(el.querySelector('.sk-mark'), at + 320)
          // 넘은 만큼(모자란 만큼)은 목표 줄이 선 다음 그 자리에서 뻗어 나간다
          grow(el.querySelector('.sk-diff'), at + 420)
          fade(el.querySelector('.sk-target'), at + 80, 500)
          countIn(el.querySelector('.sk-value'), at + 120)
          countIn(el.querySelector('.sk-rate'), at + 200)
        })
        fade(one('.s-source'), end + 200)
        break
      }
      case 'bridge': {
        const t = head()
        // 처음 막대부터 차례로: 더한 요인은 아래에서 솟고, 뺀 요인은 위에서 내려온다. 잇는 점선은 막대가 선 뒤에.
        // 가로 모양은 더한 요인이 왼쪽에서 뻗고, 뺀 요인은 앞 막대가 끝난 오른쪽에서 왼쪽으로 줄어든다
        const across = variant === 'across'
        const end = items('.wf-col', t, (el, at) => {
          const down = el.classList.contains('wf-down')
          fade(el.querySelector('.wf-label') || el.querySelector(':scope > .wf-title'), at, 500)
          grow(el.querySelector('.wf-bar'), at + 80, across ? (down ? 'back' : 'x') : down ? 'down' : 'up')
          // 축을 끊은 표시는 막대가 솟기 시작할 때 그 아래에 놓인다
          fade(el.querySelector('.wf-cut'), at + 80, 300)
          rise(el.querySelector('.wf-val'), at + 220, L.y * 0.4)
          if (el.classList.contains('wf-total')) count(el.querySelector('.wf-num'), at + 120)
          const plot = el.querySelector('.wf-plot')
          if (plot) run(anims, plot, [{ opacity: 0 }], s(at + 420), { easing: OUT, duration: d(400) }, '::after')
        }, L.step * 1.3)
        fade(one('.s-source'), end + 200)
        break
      }
      case 'trend': {
        const t = head()
        fade(one('.tn-meta > .tn-unit:not(.tn-legend)'), t, 500)
        // 목표의 이름표는 목표선과 함께 나온다. 따로 두면 본문 상자와 함께 먼저 떠서, 가리킬 선이 없는 '목표 115'가 보였다
        fade(one('.tn-legend'), t + 200, 600)
        // 선은 왼쪽에서부터 그려지고, 점은 선이 닿을 때 하나씩 맺힌다. 그래서 선은 일정한 빠르기로.
        // 생동감은 조금만 더 길게: 1500이던 때는 선이 1.65초 동안 기어가서 끝의 강조한 숫자가 3.2초에야 멈췄다
        const draw = levelName === 'lively' ? 1150 : 1100
        // 바닥줄(그림 상자의 아래 선)은 본문 차례에 표의 줄 선처럼 왼쪽부터 그어지고, 선은 그 위를 따라 그려진다. 본문 상자와 함께
        // 옅게 깔리던 때는 제목이 아직 올라오는 동안 빈 축이 먼저 서 있었다. 상자째 걷어 열어서 목표선과 0의 선도 왼쪽부터 그어진다
        sweep(one('.tn-plot'), t)
        const svg = one('.tn-svg')
        if (svg) run(anims, svg, [{ clipPath: 'inset(-10% 100% -10% 0)' }, { clipPath: 'inset(-10% 0 -10% 0)' }], s(t + 100), { easing: 'linear', duration: d(draw) })
        $('.tn-pt').forEach((el) => {
          const at = t + 100 + ((parseFloat(el.style.getPropertyValue('--x')) || 0) / 100) * draw
          pop(el.querySelector('.tn-dot'), at)
          if (el.classList.contains('is-hl')) {
            pulse(el.querySelector('.tn-dot'), at + 300)
            rise(el.querySelector('.tn-val'), at + 60, L.y * 0.5)
            count(el.querySelector('.tn-num'), at + 60)
          } else fade(el.querySelector('.tn-val'), at + 40, 400)
        })
        // 달 이름은 선이 그 달에 닿을 때 하나씩(점과 같은 칸 가운데). 한꺼번에 흐리게 들이던 때는 선이 그려지기 전에 빈 축 아래에
        // 달 이름이 다 깔려 있었다. 점이 맺히기 조금 전에 가림막 뒤에서 올라와 점이 맺힐 때는 읽힌다
        const cols = $('.tn-col')
        cols.forEach((el, i) => {
          const at = Math.max(t, t + 100 + ((i + 0.5) / cols.length) * draw - 140)
          lines(el.querySelector('.tn-name'), at)
          // 숫자로 읽을 수 없어 점 대신 달 아래에 둔 값(미정 같은)
          fade(el.querySelector(':scope > .tn-unit'), at + 80, 300)
        })
        fade(one('.tn-target'), t + 200, 600)
        fade(one('.s-source'), t + draw)
        break
      }
      case 'progress': {
        const t = head()
        fade(one('.ps-sum'), t, 500)
        fade(one('.ps-headrow'), t + 80, 500)
        // 상태별: 단 머리가 먼저 차례로 서고, 그 아래 과제가 단 순서대로
        $('.ps-lane-h').forEach((el, k) => wipe(el, t + k * 90, 'left', 600))
        const end = items('.ps-row.it', t + 160, (el, at) => {
          ruled(el, at)
          rise(el.querySelector('.ps-name'), at, L.y * 0.5)
          grow(el.querySelector('.ps-fill'), at + 120)
          countIn(el.querySelector('.ps-pct'), at + 120)
          pop(el.querySelector('.ps-chip'), at + 380)
        })
        fade(one('.s-source'), end + 200)
        break
      }
      case 'share': {
        const t = head()
        fade(one('.sh-top'), t, 500)
        if (variant === 'donut') {
          // 12시 방향에서 시계 방향으로 한 바퀴: 조각마다 앞 조각이 끝난 자리에서 이어 그려진다.
          // 한 바퀴는 처음에 빠르고 끝에서 느려지게, 조각은 그 안에서 제 몫의 시간만 쓴다
          const sweep = d(levelName === 'lively' ? 1300 : 1000)
          const ease = (x: number) => 1 - Math.pow(1 - x, 2.2)
          fade(one('.sh-ring-track'), t, 300)
          for (const el of $('.sh-arc')) {
            const from = -(parseFloat(el.getAttribute('stroke-dashoffset') || '0') || 0) / 100
            const len = (parseFloat(el.getAttribute('stroke-dasharray') || '0') || 0) / 100
            const a = ease(from)
            const b = ease(Math.min(1, from + len))
            run(anims, el, [{ strokeDasharray: '0 100' }, { strokeDasharray: el.getAttribute('stroke-dasharray') || '0 100' }], s(t + 80) + a * sweep, { easing: 'linear', duration: Math.max(1, (b - a) * sweep) })
          }
          // 강조한 조각은 다 그려진 뒤 한 번 도톰해졌다 돌아온다
          const hl = $('.sh-item').findIndex((el) => el.classList.contains('is-hl'))
          // 0인 조각은 원을 그리지 않으므로 DOM 순번이 항목 순번과 다르다. 원래 항목 번호로 짝을 찾아야 다른 조각이 강조되지 않는다.
          const arc = hl >= 0 ? one(`.sh-arc[data-index="${hl}"]`) : null
          if (arc) {
            const w = parseFloat(getComputedStyle(arc).strokeWidth) || 15
            run(anims, arc, [{ strokeWidth: String(w) }, { strokeWidth: String(w * 1.3) }, { strokeWidth: String(w) }], s(t + 80) + sweep, { easing: 'ease-in-out', duration: d(520) })
          }
          rise(one('.sh-total'), t + 360, L.y * 0.4)
          count(one('.sh-total-v'), t + 360)
        } else if (variant === 'units') {
          // 칸이 왼쪽 위에서부터 하나씩 차오른다. 칸은 항목 차례로 칠해져 있어서 항목마다 제 몫을 다 채우고 다음 항목으로 넘어간다.
          // 100칸이 한 칸씩 0.7초 남짓에 (한꺼번에 나오면 조각이 모이는 느낌이 없고, 더 느리면 이름표보다 늦게 끝난다)
          const gap = levelName === 'lively' ? 8 : 6
          $('.sh-u').forEach((el, k) => run(anims, el, [{ opacity: 0, scale: '0.4' }], s(t + 80 + k * gap), L.pop))
        } else wipe(one('.sh-band'), t, 'left', 900)
        const end = items('.sh-item', t + 260, (el, at) => {
          rise(el, at, L.y * 0.5)
          count(el.querySelector('.sh-pct'), at + 60)
        })
        fade(one('.s-source'), end + 200)
        break
      }
      case 'process': {
        const t = head()
        if (variant === 'cards') {
          items('.pc-step', t, (el, at) => {
            run(anims, el, [{ opacity: 0, translate: `${-L.y}px 0` }], s(at), L.move)
            rise(el.querySelector('.pc-text'), at + 140, L.y * 0.5)
          }, L.step * 1.4)
          break
        }
        // 선으로 잇기: 단계마다 위의 선이 왼쪽부터 그어지고, 선이 끝날 즈음 다음 단계의 선이 이어서. 번호와 이름은 선을 따라 올라온다
        const step = L.step * 1.7
        items('.pc-step', t, (el, at) => {
          run(
            anims,
            el,
            [{ scale: '0 1', transformOrigin: 'left center' }, { scale: '1 1', transformOrigin: 'left center' }],
            s(at),
            { easing: EASE.carry, duration: d(step) },
            '::before',
          )
          fade(el.querySelector('.pc-n'), at + 60, 600)
          rise(el.querySelector('.pc-title'), at + 100, L.y * 0.5)
          rise(el.querySelector('.pc-text'), at + 180, L.y * 0.5)
        }, step)
        break
      }
      case 'funnel': {
        const t = head()
        // 첫 단계부터 막대가 왼쪽에서 자라고, 그 단계에서 빠진 옅은 면이 뒤따라 깔린다. 넘어온 비율은 막대가 선 뒤에
        const end = items('.fn-row', t, (el, at) => {
          rise(el.querySelector('.fn-label'), at, L.y * 0.5)
          grow(el.querySelector('.fn-bar'), at + 80, 'x')
          // 빠진 면은 튀지 않게(생동감의 스프링이면 앞 단계 길이를 넘었다가 돌아와 계단이 잠깐 어긋났다)
          const zone = el.querySelector('.fn-zone')
          const from = { scale: '0 1', transformOrigin: 'left center' }
          if (zone) run(anims, zone, [from, { ...from, scale: '1 1' }], s(at + 260), { easing: OUT, duration: d(700) }, '::before')
          fade(el.querySelector('.fn-rate'), at + 300, 400)
          count(el.querySelector('.fn-num'), at + 120)
          // 단위는 숫자와 함께: 숫자보다 먼저 나오면 막대 옆에 '명'만 떠 있다
          fade(el.querySelector('.fn-val'), at + 120, 240)
        }, L.step * 1.3)
        fade(one('.fn-total'), end + 100, 500)
        fade(one('.s-source'), end + 200)
        break
      }
      case 'table': {
        const t = head()
        // 칸마다 물결: 줄 선이 왼쪽부터 그어지고(sweep) 그 줄의 칸 글이 왼쪽 칸부터 차례로 가림막 뒤에서 올라온다(lines).
        // 다음 줄은 앞 줄의 첫 칸이 올라온 뒤에 시작해 줄과 열의 차례가 비스듬한 물결로 읽힌다. 머리줄이 먼저, 그 아래 줄마다.
        // 줄이 많아도 마지막 줄이 0.6초(생동감 0.8초) 안에 시작하게 줄 사이를 좁힌다
        const col = levelName === 'lively' ? 70 : 50
        const wave = (row: HTMLElement, at: number) => {
          sweep(row, at)
          Array.from(row.children).forEach((cell, j) => lines(cell, at + 40 + j * col))
        }
        const head0 = one('.tb-headrow')
        if (head0) wave(head0, t)
        const rows = $('.tb-row.it')
        const gap = Math.min(levelName === 'lively' ? 120 : 90, (levelName === 'lively' ? 800 : 600) / Math.max(1, rows.length))
        const end = items('.tb-row.it', t + gap + 60, wave, gap)
        fade(one('.s-source'), end + 200)
        break
      }
      case 'matrix': {
        const t = head()
        // 빈 판이 글보다 먼저 깔리지 않게: 축(판의 왼쪽과 아래 선)은 첫 칸의 글과 함께, 칸 나눔 선(칸의 테두리)은 그 칸의 글과 함께
        // 흐리게 든다(ruled). 예전에는 판이 아래에서 걷혀 올라온 뒤 0.26초 지나서야 글이 위 칸부터 채워져서, 빈 격자가 먼저 보였다(녹화)
        ruled(one('.mx-grid'), t)
        fade(one('.mx-y'), t, 500)
        fade(one('.mx-x'), t, 500)
        items('.mx-cell', t, (el, at) => {
          ruled(el, at)
          rise(el.querySelector('.mx-title'), at, L.y * 0.5)
          rise(el.querySelector('.mx-body'), at + 80, L.y * 0.5)
        })
        break
      }
      case 'position': {
        const t = head()
        // 축이 왼쪽 아래에서 펼쳐지는 동안 점이 하나씩 위에서 제자리로 내려앉는다. 강조할 점은 맨 나중에, 내려앉은 뒤 고리.
        // 축은 처음에 빨리 열리고(감속 곡선) 점은 축이 열리기 시작하면 바로: 축이 다 펼쳐진 뒤(0.42초)에 점을 들이던 때는
        // 빈 축만 0.4초 남짓 서 있었다(녹화, '빈 틀 먼저 보이지 않기')
        const plot = one('.pm-plot')
        if (plot) run(anims, plot, [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(-40px -40px -40px -40px)' }], s(t), { easing: EASE.reveal, duration: d(700) })
        fade(one('.pm-y'), t, 500)
        fade(one('.pm-x'), t, 500)
        const pts = $('.pm-pt')
        const ordered = pts.filter((el) => !el.classList.contains('is-hl')).concat(pts.filter((el) => el.classList.contains('is-hl')))
        let at = t + 120
        for (const el of ordered) {
          const hl = el.classList.contains('is-hl')
          run(anims, el.querySelector('.pm-dot') || el, [{ opacity: 0, translate: `0 ${-L.y * 1.4}px` }, { opacity: 1, offset: 0.25 }, { translate: '0 0' }], s(at), L.pop)
          fade(el.querySelector('.pm-label'), at + 160, 500)
          if (hl) pulse(el.querySelector('.pm-dot'), at + 380)
          at += L.step * (hl ? 2 : 1.4)
        }
        fade(one('.s-source'), at + 200)
        break
      }
      case 'closing': {
        const t = words(one('.cl-title'), 0, L.word * 1.2)
        fade(one('.cl-contact'), t)
        // 할 일 사이의 선도 할 일과 함께 (제목보다 먼저 빈 줄이 그어져 있지 않게)
        fade(one('.cl-steps'), Math.max(0, Math.min(t, 560) - 120), 360)
        // 요청이 올라온 뒤 번호가 뜬다 (번호는 가늘고 옅은 글자라 튀어나오게 하지 않는다)
        items('.cl-step', Math.min(t, 560), (el, at) => {
          rise(el.querySelector('.cl-step-text'), at, L.y * 0.6)
          fade(el.querySelector('.cl-n'), at + 160, 700)
        })
        break
      }
      default: {
        const t = head()
        items('.s-body .it', t, (el, at) => rise(el, at))
      }
    }
    }

    /** 데이터 조각이 오가는 길의 이징: 천천히 떠나 빠르게 건너고 천천히 닿는다. 선 긋기와 같은 이징이라 조각이 선 끝을 타고 간다 */
    const CARRY = EASE.carry
    /**
     * 데이터 조각: 길(path, host 안의 캔버스 px 점들)을 따라 건너가는 작은 네모(motion.css의 .mo-pk). 꺾이는 길은 길이대로 나눠
     * 같은 빠르기로 지난다. 떠날 때와 닿을 때 흐려져서 앞 상자에서 나와 다음 상자로 들어가는 것처럼 보인다.
     * 끝 모습에는 없다: 움직이는 동안만 붙였다가 뗀다
     */
    /** easing: 조각이 길을 타는 빠르기. 선이 곡선 없이(linear) 그어지는 길에서는 조각도 linear여야 선 끝과 함께 간다 */
    const packet = (host: Element | null, path: [number, number][], at: number, duration: number, easing: string = CARRY) => {
      // 한 번 건너가는 조각은 나오는 연출이라, 이어 움직이기로 이미 제자리에 와 있는 컴포넌트에서는 띄우지 않는다
      if (!host || path.length < 2 || host.closest('[data-mo-keep]')) return
      const p = document.createElement('span')
      p.className = 'mo-pk'
      p.setAttribute('aria-hidden', 'true')
      host.appendChild(p)
      restores.push(() => p.remove())
      const lens = path.slice(1).map((q, i) => Math.hypot(q[0] - path[i][0], q[1] - path[i][1]))
      const total = lens.reduce((a, b) => a + b, 0) || 1
      let walked = 0
      const frames = path.map((q, i) => {
        walked += i ? lens[i - 1] : 0
        return { translate: `${q[0]}px ${q[1]}px`, offset: walked / total }
      })
      run(anims, p, frames, s(at), { easing, duration: d(duration) })
      run(anims, p, [{ opacity: 0, scale: '0.5' }, { opacity: 1, scale: '1', offset: 0.14 }, { opacity: 1, scale: '1', offset: 0.86 }, { opacity: 0, scale: '0.5' }], s(at), { easing: 'linear', duration: d(duration) })
    }
    /**
     * 계속 흐르는 조각(생동감에서만): packet과 같은 조각을 길 위에 붙여 두고 장을 떠날 때까지 되풀이해 흘려보낸다.
     * 끝맺음 목록(anims)에 넣지 않고 따로 모아(stops) 장을 떠날 때 거두므로 '누르면' 차례를 붙잡지 않는다.
     * 차분하게, 움직임 없음, 동작 줄이기에서는 흐르지 않는다: 보고를 듣는 동안 장 한쪽이 계속 움직이면 눈을 빼앗는다
     */
    const stream = (host: Element | null, path: [number, number][], at: number, period: number, phase = 0, lit?: { el: Element | null; on: Keyframe; off: Keyframe }) => {
      if (!host || path.length < 2 || levelName !== 'lively' || quiet || still) return
      const p = document.createElement('span')
      p.className = 'mo-pk is-stream'
      p.setAttribute('aria-hidden', 'true')
      host.appendChild(p)
      const lens = path.slice(1).map((q, i) => Math.hypot(q[0] - path[i][0], q[1] - path[i][1]))
      const total = lens.reduce((a, b) => a + b, 0) || 1
      let walked = 0
      const frames = path.map((q, i) => {
        walked += i ? lens[i - 1] : 0
        return { translate: `${q[0]}px ${q[1]}px`, offset: walked / total }
      })
      const timing = { duration: period, delay: s(at) + phase, iterations: Infinity, easing: CARRY, fill: 'backwards' as FillMode }
      const a = p.animate(frames, timing)
      const b = p.animate([{ opacity: 0, scale: '0.5' }, { opacity: 1, scale: '1', offset: 0.14 }, { opacity: 1, scale: '1', offset: 0.86 }, { opacity: 0, scale: '0.5' }], { ...timing, easing: 'linear' })
      // 닿는 순간: 받는 것(lit)이 잠깐 강조색이 된다(모이고 퍼지기와 같은 문법). 조각은 주기의 0.86쯤에 사라진다
      const c = lit?.el
        ? lit.el.animate([{ ...lit.off, offset: 0 }, { ...lit.off, offset: 0.8 }, { ...lit.on, offset: 0.86 }, { ...lit.off, offset: 0.97 }, { ...lit.off, offset: 1 }], { ...timing, easing: 'linear' })
        : null
      stops.push(() => {
        a.cancel()
        b.cancel()
        c?.cancel()
        p.remove()
      })
    }
    /**
     * 굵기를 지키는 선(vector-effect: non-scaling-stroke)에 건 점선의 단위 바로잡기. 길이를 100으로 맞춘 길(pathLength) 위의 점선을
     * 크롬은 그림을 늘인 뒤의 좌표(칸의 px)에서 긋는데, 100을 늘이기 전의 길이로 셈한다. 그래서 늘어난 그림에서는 100이 선 전체가
     * 아니었다(필름): 모이고 퍼지기의 선은 긋기 전부터 가운데 쪽 끝 토막이 보였고(점선의 다음 마디), 다 그었을 때도 63%까지만 그려져
     * 있다가 움직임이 끝날 때 나머지가 한꺼번에 나타났다. 순환의 고리와 확산 곡선의 종 모양도 조각보다 앞선 토막이 먼저 보였다.
     * 돌려주는 수를 pathLength 단위의 점선 값에 곱하면 100이 늘인 뒤에도 선 전체다. 그림 안의 좌표(getCTM)로 재서 발표 화면이 장을
     * 줄여 그리거나(바깥 transform) 화면 배율이 달라도 같다
     */
    const dashK = (el: Element | null) => {
      if (!(el instanceof SVGGeometryElement) || !el.hasAttribute('pathLength') || getComputedStyle(el).vectorEffect !== 'non-scaling-stroke') return 1
      const len = el.getTotalLength()
      const m = el.getCTM()
      if (!len || !m) return 1
      let drawn = 0
      let prev: DOMPoint | null = null
      for (let i = 0; i <= 48; i++) {
        const q = el.getPointAtLength((len * i) / 48).matrixTransform(m)
        if (prev) drawn += Math.hypot(q.x - prev.x, q.y - prev.y)
        prev = q
      }
      return drawn > 0 ? drawn / len : 1
    }
    /** 부품 안 상자의 자리(host 기준, 장의 px). 장은 줄여 그려지기도 해서 화면 px를 host의 비율로 되돌린다 */
    const spot = (el: Element, host: HTMLElement) => {
      const h = host.getBoundingClientRect()
      const r = el.getBoundingClientRect()
      const k = host.offsetWidth ? h.width / host.offsetWidth : 1
      const l = (r.left - h.left) / k - host.clientLeft
      const t = (r.top - h.top) / k - host.clientTop
      return { l, t, r: l + r.width / k, b: t + r.height / k }
    }
    /**
     * 꺾인 선(테두리 둘로 그린 꺾쇠)을 한쪽 끝에서 다른 끝으로 긋는다: 세로 토막(꺾이는 쪽의 띠)을 먼저 펼치고 가로 토막을 잇는다.
     * from은 긋기 시작하는 끝(top, bottom), side는 세로 토막이 있는 쪽(left, right). 두 토막을 길이대로 나눠 같은 빠르기로
     */
    const bend = (el: HTMLElement, at: number, duration: number, from: 'top' | 'bottom' | 'none', side: 'left' | 'right', band: number, easing: string = CARRY) => {
      const strip = `calc(100% - ${band}px)`
      const keep = side === 'left' ? `0 ${strip} 0 0` : `0 0 0 ${strip}`
      const flat = side === 'left' ? 'inset(0 100% 0 0)' : 'inset(0 0 0 100%)'
      const v = from === 'none' ? 0 : Math.min(0.85, el.offsetHeight / (el.offsetHeight + el.offsetWidth))
      const start = from === 'none' ? flat : side === 'left' ? (from === 'top' ? `inset(0 ${strip} 100% 0)` : `inset(100% ${strip} 0 0)`) : from === 'top' ? `inset(0 0 100% ${strip})` : `inset(100% 0 0 ${strip})`
      const frames: Keyframe[] = [{ clipPath: start }]
      if (v) frames.push({ clipPath: `inset(${keep})`, offset: v })
      frames.push({ clipPath: 'inset(0 0 0 0)' })
      run(anims, el, frames, s(at), { easing, duration: d(duration) })
    }
    /** 선 하나를 긋는다(요소나 가짜 요소). 조각과 같은 이징, 같은 시간이라 조각이 그어지는 선 끝을 탄다 */
    const draw = (el: Element | null, at: number, duration: number, origin: string, pseudo?: string) => {
      if (!el) return
      const from = origin.startsWith('center') ? '1 0' : '0 1'
      run(anims, el, [{ scale: from, transformOrigin: origin }, { scale: '1 1', transformOrigin: origin }], s(at), { easing: CARRY, duration: d(duration) }, pseudo)
    }

    /**
     * 합계를 조각이 닿을 때마다 그만큼씩 올린다. marks는 닿는 때(ms)와 그때까지 모인 몫(0~1). 숫자가 하나만 있는 칸만(countUp과
     * 같은 조건). 한 번에 0부터 굴리면 조각이 끼워지는 것과 숫자가 따로 놀아서, 끼워질 때마다 그 몫만큼 짧게 올라가 멈춘다.
     * 움직이지 않는 때(still)에는 올리지 않는다: 제 시계로 도는 것이라 움직임 없음에서도 합계가 0부터 올라갔다
     */
    const tally = (el: Element | null, marks: { at: number; upto: number }[]) => {
      // 옮겨 온 숫자(이어 움직이기)는 0으로 되돌리지 않는다: 값이 바뀌었으면 carry가 앞 값에서 옮긴다
      if (!el || still || el.closest('.m-edit, [data-mo-keep]') || !marks.length || digitTexts(el) > 1) return
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
      let node = walker.nextNode() as Text | null
      while (node && !/\d/.test(node.nodeValue || '')) node = walker.nextNode() as Text | null
      if (!node) return
      const text = node.nodeValue || ''
      const m = /^(\D*)(\d[\d,]*)(\.\d+)?(\D*)$/.exec(text)
      if (!m) return
      const target = parseFloat((m[2] + (m[3] || '')).replace(/,/g, ''))
      if (!(target > 0) || target >= 1e12) return
      const decimals = m[3] ? m[3].length - 1 : 0
      const grouped = m[2].indexOf(',') >= 0
      const format = (v: number) => {
        const [whole, frac] = v.toFixed(decimals).split('.')
        return m[1] + (grouped ? whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : whole) + (frac ? '.' + frac : '') + m[4]
      }
      const target_node = node
      const climb = d(320)
      const times = marks.map((k) => s(k.at))
      // 시계: 아무것도 바꾸지 않는 움직임 하나의 시간을 읽는다. 다른 움직임과 같이 멈추고 넘겨져서(발표 화면의 멈춤, 녹화)
      // 숫자가 조각과 어긋나지 않는다
      const clock = el.animate([], { duration: times[times.length - 1] + climb })
      anims.push(clock)
      let frame = 0
      let done = () => {}
      waits.push(new Promise<void>((r) => (done = r)))
      target_node.nodeValue = format(0)
      const tick = () => {
        const t = Number(clock.currentTime ?? 0)
        let v = 0
        let prev = 0
        marks.forEach((k, i) => {
          const p = Math.min(1, Math.max(0, (t - times[i]) / climb))
          v += (k.upto - prev) * (1 - Math.pow(1 - p, 3))
          prev = k.upto
        })
        if (clock.playState === 'finished' || t >= times[times.length - 1] + climb) {
          target_node.nodeValue = text
          done()
          return
        }
        target_node.nodeValue = format(target * v)
        frame = requestAnimationFrame(tick)
      }
      frame = requestAnimationFrame(tick)
      stops.push(() => {
        cancelAnimationFrame(frame)
        target_node.nodeValue = text
        done()
      })
    }

    /** 부품 장만의 부품이 알아서 움직이는 모습. 면이 있는 부품은 면이 먼저 자리 잡고 안의 글이 뒤따른다 */
    function nativeAuto(cell: HTMLElement, type: string) {
      if (!cell.classList.contains('bk-look-plain')) card(cell, 0)
      switch (type) {
        case 'message': {
          const t = words(one('.bk-msg-t'), 0, L.word * 1.2)
          lines(one('.bk-msg-s'), t)
          break
        }
        case 'text': {
          rise(one('.bk-label'), 60, L.y * 0.4)
          // 글은 제목의 첫 줄이 올라오는 사이에 따라 나온다. 제목이 없으면 바로
          const h = lines(one('.bk-h'), 120)
          lines(one('.bk-body'), Math.min(h, 240))
          break
        }
        case 'bullets':
          lines(one('.bk-h'), 60)
          items('.bk-li', 160, (el, at) => {
            fade(el.querySelector('.bk-dot'), at, 400)
            lines(el.querySelector('.bk-li-text'), at + 40)
          })
          break
        case 'quote': {
          // 여는 따옴표가 먼저 맺히고, 말이 줄마다 올라오고, 닫는 따옴표는 마지막 줄을 따라 나온다. 따옴표는 글자가 아니라
          // 가짜 요소(quote.css)라 줄과 함께 가려지지 않는다: 따로 들이지 않으면 말보다 먼저 빈 따옴표 한 쌍이 떠 있다
          const q = one('.bk-q-t')
          if (q) run(anims, q, [{ opacity: 0, translate: `0 ${L.y * 0.4}px` }], s(60), L.move, '::before')
          const end = lines(q, 120)
          if (q) run(anims, q, [{ opacity: 0 }], s(end - 160), { easing: OUT, duration: d(400) }, '::after')
          fade(one('.bk-q-by'), Math.max(520, end), 600)
          break
        }
        case 'callout':
          rise(one('.bk-call-l'), 160, L.y * 0.4)
          // 장면 '결론 한 방'이 이 글을 초점으로 삼으면 한 글자씩 (lines가 letters로 넘긴다)
          lines(one('.bk-call-t'), 240)
          break
        case 'number':
          fade(one('.bk-num-l'), 100, 500)
          rise(one('.bk-num-v'), 140, L.y * 0.4)
          count(one('.bk-num-v'), 160)
          fade(one('.bk-num-n'), 520, 600)
          break
        case 'delta': {
          // 같은 값이 바뀌는 것으로 보이게(대상 일관성, Heer & Robertson 2007): 뒤 값이 0이 아니라 앞 값에서 출발해 새 값으로
          // 굴러간다(8.4 → 5.1). 앞 값의 사본을 뒤 값 자리로 미끄러뜨려도 봤지만 지나가는 동안 숫자끼리 두 겹으로 겹쳐 지저분했다
          const fromV = one('.bk-dl-from .bk-dl-v')
          const toV = one('.bk-dl-to .bk-dl-v')
          const num = (el: Element | null) => {
            const all = (el?.textContent ?? '').match(/\d[\d,]*(\.\d+)?/g)
            return all && all.length === 1 ? parseFloat(all[0].replace(/,/g, '')) : NaN
          }
          const before = num(fromV)
          fade(one('.bk-dl-l'), 80, 500)
          rise(one('.bk-dl-from'), 140, L.y * 0.4)
          const arrow = one('.bk-dl-arrow')
          if (arrow) run(anims, arrow, [{ opacity: 0, translate: `${-L.y * 0.6}px 0` }], s(320), L.move)
          rise(one('.bk-dl-to'), 420, L.y * 0.5)
          if (toV && Number.isFinite(before) && Number.isFinite(num(toV)) && !still && !toV.closest('.m-edit, [data-mo-keep]'))
            countUp(toV, s(560), (levelName === 'lively' ? 1100 : 900) * pace, stops, waits, before)
          else count(toV, 440)
          pop(one('.bk-dl-chip'), 1300)
          fade(one('.bk-dl-n'), 1380, 500)
          break
        }
        case 'goal':
          fade(one('.bk-gl-l'), 80, 500)
          grow(one('.bk-gl-fill'), 200)
          countIn(one('.bk-gl-pct'), 200)
          fade(one('.bk-gl-of'), 380, 500)
          fade(one('.bk-gl-n'), 520, 500)
          break
        case 'ring': {
          fade(one('.bk-rg-l'), 60, 500)
          fade(one('.bk-rg-track'), 80, 500)
          // 둘레가 12시 방향에서부터 비율만큼 차오르고, 가운데 숫자가 같이 올라간다
          const arc = one('.bk-rg-arc')
          const fill = { easing: OUT, duration: d(levelName === 'lively' ? 1500 : 1100) }
          if (arc) run(anims, arc, [{ strokeDasharray: '0 100' }], s(160), fill)
          // 길이 0인 호도 둥근 끝 때문에 점으로 보인다. 차오르기 전에 점 하나만 떠 있지 않게
          fade(arc, 140, 200)
          // 반원 게이지의 손잡이는 호와 같은 시간, 같은 이징으로 돌아서 호의 끝에 붙어 간다
          const knob = one('.bk-rg-knob')
          if (knob) {
            run(anims, knob, [{ rotate: '0deg' }], s(160), fill)
            fade(knob, 120, 240)
          }
          countIn(one('.bk-rg-v'), 160)
          fade(one('.bk-rg-n'), 640, 500)
          break
        }
        case 'ratio': {
          fade(one('.bk-rt-l'), 60, 500)
          fade(one('.bk-rt-of'), 120, 500)
          rise(one('.bk-rt-big'), 160, L.y * 0.4)
          count(one('.bk-rt-v'), 180)
          // 세기 막대가 많아도 1초 안에 다 그어지게. 해당하는 막대는 손으로 세며 긋듯 아래에서 위로 그어지고, 나머지는 옅게 놓인다
          const dots = $('.bk-rt-d')
          const step = stagger(dots.length, L.step, 900)
          dots.forEach((el, i) =>
            el.classList.contains('is-on') && !el.querySelector('svg')
              ? run(anims, el, [{ scale: '1 0', transformOrigin: '50% 100%' }], s(240 + i * step), { easing: OUT, duration: d(360) })
              : el.classList.contains('is-on')
                ? pop(el, 240 + i * step)
                : fade(el, 240 + i * step, 300),
          )
          fade(one('.bk-rt-n'), 360 + dots.length * step, 500)
          break
        }
        case 'spark': {
          fade(one('.bk-sp-l'), 60, 500)
          rise(one('.bk-sp-v'), 100, L.y * 0.4)
          count(one('.bk-sp-v'), 120)
          // 선은 왼쪽부터 같은 빠르기로 그려지고, 끝점(지금)이 선이 닿을 때 맺힌다. 처음 점과 처음 값은 선이 출발할 때 먼저 놓인다
          const draw = levelName === 'lively' ? 1300 : 1000
          fade(one('.bk-sp-start'), 160, 300)
          fade(one('.bk-sp-from'), 160, 400)
          for (const el of $('.bk-sp-svg')) run(anims, el, [{ clipPath: 'inset(-10% 100% -10% 0)' }, { clipPath: 'inset(-10% 0 -10% 0)' }], s(200), { easing: 'linear', duration: d(draw) })
          pop(one('.bk-sp-dot'), 200 + draw)
          fade(one('.bk-sp-n'), 400, 500)
          break
        }
        case 'facts':
          lines(one('.bk-h'), 60)
          items('.bk-fc-row', 160, (el, at) => {
            grow(el, at, 'x', '::before')
            rise(el.querySelector('.bk-fc-k'), at + 80, L.y * 0.4)
            rise(el.querySelector('.bk-fc-v'), at + 140, L.y * 0.4)
          })
          break
        case 'risks':
          lines(one('.bk-h'), 60)
          fade(one('.bk-rk-head'), 120, 500)
          items('.bk-rk-row', 220, (el, at) => {
            ruled(el, at)
            rise(el.querySelector('.bk-rk-t'), at, L.y * 0.4)
            const arrow = el.querySelector('.bk-rk-arrow')
            if (arrow) run(anims, arrow, [{ opacity: 0, translate: `${-L.y * 0.6}px 0` }], s(at + 160), L.move)
            rise(el.querySelector('.bk-rk-b'), at + 260, L.y * 0.4)
          }, L.step * 1.8)
          break
        case 'faq':
          lines(one('.bk-h'), 60)
          items('.bk-qa-item', 160, (el, at) => {
            ruled(el, at)
            pop(el.querySelector('.bk-qa-k'), at)
            rise(el.querySelector('.bk-qa-qt'), at + 60, L.y * 0.4)
            fade(el.querySelector('.bk-qa-a'), at + 260, 600)
          }, L.step * 1.8)
          break
        case 'checks':
          lines(one('.bk-h'), 60)
          fade(one('.bk-ck-sum'), 160, 500)
          items('.bk-ck-row', 200, (el, at) => {
            ruled(el, at)
            rise(el.querySelector('.bk-ck-text'), at, L.y * 0.4)
            // 표시는 획으로 그어 나간다(체크, 띠, 느낌표: Checks.tsx의 길이 1인 획)
            el.querySelectorAll('.bk-ck-mark path').forEach((path, k) =>
              run(anims, path, [{ strokeDasharray: '0 1' }, { strokeDasharray: '1 0' }], s(at + 140 + k * 120), { easing: OUT, duration: d(380) }),
            )
            fade(el.querySelector('.bk-ck-s'), at + 220, 400)
          })
          break
        case 'swot':
          // 네 칸이 읽는 차례(강점, 약점, 기회, 위협)로: 글자가 맺히고 이름과 내용이 따라 올라온다
          lines(one('.bk-h'), 60)
          items('.bk-sw-q', 140, (el, at) => {
            ruled(el, at)
            pop(el.querySelector('.bk-sw-k'), at)
            rise(el.querySelector('.bk-sw-t'), at + 80, L.y * 0.4)
            rise(el.querySelector('.bk-sw-b'), at + 160, L.y * 0.4)
          }, L.step * 1.4)
          break
        case 'gantt':
          // 기간 칸이 먼저 깔리고, 할 일마다 이름이 올라오며 막대가 시작 칸에서 끝 칸으로 그어진다. 막대가 다 서면 '지금' 선이
          // 첫 칸에서 출발해 시간을 따라 오늘의 칸까지 미끄러져 와 선다: 일정 위에서 지금 어디쯤인지를 움직임이 짚는다
          lines(one('.bk-h'), 60)
          fade(one('.bk-gt-cols'), 120, 500)
          const rowsEnd = items('.bk-gt-row', 240, (el, at) => {
            ruled(el, at)
            rise(el.querySelector('.bk-gt-label'), at, L.y * 0.4)
            grow(el.querySelector('.bk-gt-bar'), at + 120, 'x')
          })
          const nowLine = one('.bk-gt-now')
          const nowAt = parseFloat(nowLine?.closest<HTMLElement>('.bk-gt')?.style.getPropertyValue('--now') ?? '') || 0
          if (nowLine && nowAt > 0) {
            const shift = nowLine.offsetWidth * nowAt
            run(anims, nowLine, [{ opacity: 0, translate: `${-shift}px 0`, offset: 0 }, { opacity: 1, translate: `${-shift}px 0`, offset: 0.12 }, { opacity: 1, translate: '0 0' }], s(rowsEnd + 200), {
              easing: CARRY,
              duration: d(Math.min(1200, 420 + nowAt * 220)),
            })
          } else fade(nowLine, rowsEnd + 200, 600)
          break
        case 'people': {
          lines(one('.bk-h'), 60)
          // 사람마다 이름이 줄마다 가림막 뒤에서 올라오고, 역할과 맡은 일이 반 박자씩 뒤따른다. 이름, 역할, 맡은 일을 묶음째
          // 띄우던 때는 사람 하나가 한 덩어리로 떠서 누가 무엇을 맡는지가 움직임에 드러나지 않았다
          const person = (el: Element | undefined, at: number) => {
            if (!el) return
            lines(el.querySelector('.bk-pp-name'), at)
            lines(el.querySelector('.bk-pp-role'), at + 90)
            lines(el.querySelector('.bk-pp-b'), at + 160)
          }
          const tree = one('.va-tree .bk-pp-list')
          if (tree) {
            // 체계도: 이끄는 사람이 먼저 올라오고, 그 아래 선이 내려와 가운데에서 양옆으로 퍼진 뒤,
            // 맡은 사람마다 선이 내려오며 글이 올라온다. 선은 칸의 가짜 요소라 칸이 아니라 글만 올린다(칸을 숨기면 선도 숨는다)
            const [lead, ...team] = Array.from(tree.querySelectorAll<HTMLElement>(':scope > .bk-pp-card'))
            person(lead, 160)
            if (team.length) {
              grow(lead, 520, 'down', '::after')
              run(anims, tree, [{ scale: '0 1', transformOrigin: 'center' }, { scale: '1 1', transformOrigin: 'center' }], s(680), L.grow, '::before')
              team.forEach((el, i) => {
                grow(el, 860 + i * L.step, 'down', '::before')
                person(el, 920 + i * L.step)
              })
            }
            break
          }
          items('.bk-pp-card', 160, (el, at) => {
            // 목록 모양은 사람 사이의 줄 선을 왼쪽부터 긋는다(표의 줄처럼). 첫 사람 위와 단으로 나란히 놓인 사람 사이에는 선이 없어서
            // 선이 있는 줄만. 나란히는 사람마다 위에 긋던 선을 걷어서(people.css) 글만 올라온다
            const ruledRow = cell.classList.contains('va-list') && parseFloat(getComputedStyle(el).borderTopWidth) > 0
            if (ruledRow) sweep(el, at)
            person(el, ruledRow ? at + 40 : at)
          }, L.step * 1.5)
          break
        }
        case 'rating':
          // 안 이름과 추천 띠가 먼저 깔리고, 기준마다 줄이 올라오며 표시가 안 차례로 찍힌다.
          // 줄은 선까지 통째로: 선만 먼저 보이면 빈 표가 깔려 있다가 채워지는 것처럼 보인다
          lines(one('.bk-h'), 60)
          fade(one('.bk-ev-lg'), 120, 500)
          fade(one('.bk-ev-cols'), 120, 500)
          fade(one('.bk-ev-band'), 160, 800)
          items('.bk-ev-row', 240, (el, at) => {
            rise(el, at, L.y * 0.4)
            el.querySelectorAll('.bk-ev-cell > *').forEach((m, j) => pop(m, at + 120 + j * 70))
          })
          break
        case 'market':
          // 큰 원부터 바닥에서 부풀어 겹치고, 원마다 그 이름과 규모가 함께 들어온다
          lines(one('.bk-h'), 60)
          $('.bk-mk-c').forEach((c, i) =>
            run(anims, c, [{ scale: '0', transformOrigin: '50% 100%' }, { scale: '1', transformOrigin: '50% 100%' }], s(120 + i * 220), L.grow),
          )
          items('.bk-mk-row', 160, (el, at) => {
            rise(el, at, L.y * 0.4)
            pop(el.querySelector('.bk-mk-sw'), at)
            count(el.querySelector('.bk-mk-v'), at + 120)
          }, 220)
          break
        case 'pareto':
        case 'attain':
        case 'stack': {
          // 막대가 바닥에서 차례로 자라고 숫자가 따라 올라온다. 달성은 막대 뒤에 목표 줄이 그어진다.
          // 쌓은 막대는 칸마다 키우면 칸 사이가 벌어진 채 떠 보여서, 막대 하나를 바닥부터 드러내 아래 칸이 먼저 차오르게 한다.
          // 원인 순위는 막대가 다 선 뒤에 누적 비율 선이 왼쪽부터 그어지고, 선이 닿는 점마다 맺힌다
          lines(one('.bk-h'), 60)
          fade(one('.bk-cc-key'), 120, 500)
          if (one('.bk-tg-text')) {
            fade(one('.bk-tg-text-head'), 120, 400)
            items('.bk-tg-text-row', 180, (el, at) => rise(el, at, L.y * 0.4), 120)
            break
          }
          // 원인 순위의 가로 막대: 줄마다 앞까지 더한 몫이 먼저 깔리고, 그 끝에서 이 원인의 몫이 뻗는다. 80% 줄은 처음에 한 번
          if (one('.bk-pr-list')) {
            fade(one('.bk-pr-head'), 120, 500)
            fade(one('.bk-pr-guide'), 160, 600)
            items('.bk-pr-row', 160, (el, at) => {
              fade(el.querySelector('.bk-pr-name'), at, 400)
              fade(el.querySelector('.bk-pr-before'), at, 300)
              grow(el.querySelector('.bk-pr-fill'), at + 120, 'x')
              fade(el.querySelector('.bk-pr-num'), at + 260, 400)
              count(el.querySelector('.bk-pr-num'), at + 260)
              fade(el.querySelector('.bk-pr-cum'), at + 420, 400)
            }, 120)
            break
          }
          // 기간별 달성의 목표와의 차이: 기준선이 먼저 그어지고, 기간마다 막대가 기준선에서 위나 아래로 뻗는다
          if (one('.bk-ag-plot')) {
            grow(one('.bk-ag-axis'), 120, 'x', '::before')
            items('.bk-ag-col', 180, (el, at) => {
              fade(el.querySelector('.bk-cc-label'), at, 400)
              grow(el.querySelector('.bk-ag-fill'), at + 160, el.classList.contains('is-down') ? 'down' : 'up')
              fade(el.querySelector('.bk-ag-v'), at + 380, 400)
            }, 220)
            break
          }
          const end = items('.bk-cc-col', 180, (el, at) => {
            fade(el.querySelector('.bk-cc-label'), at, 400)
            const stack = el.querySelector('.bk-st-stack')
            if (stack) wipe(stack, at, 'bottom', 900)
            else grow(el.querySelector('.bk-cc-fill'), at, 'up')
            grow(el.querySelector('.bk-tg-goal'), at + 280, 'x')
            const num = stack ? at + 520 : at + 220
            fade(el.querySelector('.bk-cc-v, .bk-tg-v'), num, 400)
            count(el.querySelector('.bk-cc-num'), num)
            el.querySelectorAll('.bk-st-n').forEach((m, j) => fade(m, at + 200 + j * 180, 300))
          }, 120)
          const svg = one('.bk-pa-svg')
          if (svg) {
            const draw = levelName === 'lively' ? 1100 : 900
            run(anims, svg, [{ clipPath: 'inset(-10% 100% -10% 0)' }, { clipPath: 'inset(-10% 0 -10% 0)' }], s(end + 80), { easing: 'linear', duration: d(draw) })
            $('.bk-pa-pt').forEach((pt) => pop(pt, end + 80 + ((parseFloat(pt.style.getPropertyValue('--x')) || 0) / 100) * draw))
          }
          break
        }
        case 'diverge':
          // 가운데 선이 먼저 서고, 막대가 그 선에서 늘어난 쪽은 오른쪽으로, 줄어든 쪽은 왼쪽으로 뻗는다
          lines(one('.bk-h'), 60)
          fade(one('.bk-cc-key'), 120, 500)
          $('.bk-dv-axis').forEach((a) => grow(a, 120, 'down'))
          items('.bk-dv-row', 220, (el, at) => {
            rise(el.querySelector('.bk-dv-name'), at, L.y * 0.4)
            const bar = el.querySelector('.bk-dv-bar')
            const origin = el.classList.contains('is-neg') ? 'right center' : 'left center'
            if (bar) run(anims, bar, [{ scale: '0 1', transformOrigin: origin }, { scale: '1 1', transformOrigin: origin }], s(at + 80), L.grow)
            fade(el.querySelector('.bk-dv-v'), at + 320, 400)
            count(el.querySelector('.bk-dv-num'), at + 320)
          })
          break
        case 'likert': {
          // 가운데 선이 먼저 서고, 질문마다 막대가 그 선에서 양쪽으로 열린다: 가까운 단계(보통, 그렇다)부터 먼 단계(매우 그렇다)로
          // 번지듯. 양쪽이 같은 때에 끝나서 짧은 쪽은 천천히 열린다. 합계는 막대가 열리는 동안 굴러 맞춰지고, 칸 안 숫자는 다 열린 뒤에
          lines(one('.bk-h'), 60)
          // 머리 줄(응답 수, 단계 색 표시, 합계의 머리)은 질문 줄들과 한 칸 나눔에 서서 표시 줄의 상자(.bk-cc-key)가 없다(display: contents)
          fade(one('.bk-cc-u'), 120, 500)
          fade(one('.bk-lk-keywrap'), 120, 500)
          fade(one('.bk-lk-th'), 160, 500)
          $('.bk-lk-axis').forEach((a) => grow(a, 120, 'down'))
          const open = levelName === 'lively' ? 900 : 760
          items('.bk-lk-row', 220, (el, at) => {
            rise(el.querySelector('.bk-lk-q'), at, L.y * 0.4)
            const bar = el.querySelector<HTMLElement>('.bk-lk-bar')
            if (bar) {
              // 막대 안에서 가운데 선의 자리(%): 셋 다 막대 칸에 대한 몫이다(가운데 선 --lk-x, 막대의 시작 --o, 너비 --w)
              const x = parseFloat((bar.closest('.bk-lk') as HTMLElement | null)?.style.getPropertyValue('--lk-x') || '50')
              const o = parseFloat(bar.style.getPropertyValue('--o')) || 0
              const w = parseFloat(bar.style.getPropertyValue('--w')) || 100
              const c = Math.min(100, Math.max(0, ((x - o) / w) * 100))
              run(anims, bar, [{ clipPath: `inset(-2px ${100 - c}% -2px ${c}%)` }, { clipPath: 'inset(-2px 0 -2px 0)' }], s(at + 80), {
                easing: EASE.reveal,
                duration: d(open),
              })
            }
            el.querySelectorAll('.bk-lk-n').forEach((n) => fade(n, at + 80 + open * 0.8, 360))
            countIn(el.querySelector('.bk-lk-tot'), at + 200)
          })
          break
        }
        case 'heat': {
          // 칸이 왼쪽 위 모서리부터 비스듬한 물결로 물든다(줄 + 칸이 같은 칸이 함께). 칸이 많아도 1초 안에 다 물들게.
          // 다 물든 뒤 가장 높은 칸과 낮은 칸에 고리가 맺힌다
          lines(one('.bk-h'), 60)
          fade(one('.bk-cc-key'), 120, 500)
          fade(one('.bk-hm-head'), 120, 500)
          const rows = $('.bk-hm-row')
          const cols = Math.max(1, ...rows.map((r) => r.querySelectorAll('.bk-hm-cell').length))
          const wave = Math.min(L.step * 0.6, 1000 / Math.max(1, rows.length + cols - 1))
          rows.forEach((row, i) => {
            fade(row.querySelector('.bk-hm-name'), 180 + i * wave, 400)
            row.querySelectorAll('.bk-hm-cell').forEach((cell, j) => fade(cell, 200 + (i + j) * wave, 420))
          })
          const end = 200 + (rows.length + cols - 1) * wave + 320
          $('.bk-hm-ring').forEach((r, k) => pop(r, end + k * 160))
          break
        }
        case 'sparks':
          // 줄마다 이름이 올라오고 흐름 선이 왼쪽부터 같은 빠르기로 그어진다. 선이 끝에 닿을 때 지금 점이 맺히고 지금 값이 굴러간다
          lines(one('.bk-h'), 60)
          // 넓은 칸에서 두 단으로 흘리면 머리도 둘이다
          $('.bk-sx-head').forEach((el) => fade(el, 120, 500))
          items('.bk-sx-row', 180, (el, at) => {
            ruled(el, at)
            rise(el.querySelector('.bk-sx-name'), at, L.y * 0.4)
            const draw = levelName === 'lively' ? 900 : 700
            const svg = el.querySelector('.bk-sx-svg')
            if (svg) run(anims, svg, [{ clipPath: 'inset(-10% 100% -10% 0)' }, { clipPath: 'inset(-10% 0 -10% 0)' }], s(at + 60), { easing: 'linear', duration: d(draw) })
            pop(el.querySelector('.bk-sx-dot'), at + 60 + draw)
            fade(el.querySelector('.bk-sx-now'), at + draw - 120, 300)
            count(el.querySelector('.bk-sx-v'), at + draw - 120)
            fade(el.querySelector('.bk-sx-chg'), at + draw + 120, 400)
          })
          break
        case 'image': {
          // 전체 보이기(비율대로 그린 이미지)는 이미지 자리만 걷는다. 화면 캡처는 당겨 보이면 글씨가 흔들려 보여서 키우지 않는다
          const fit = !!one('.bk-img.is-fit')
          wipe(one(fit ? '.bk-img-i > img' : '.bk-img-i'), 0, 'left', 1000)
          if (!fit) pull(one('.bk-img-i img'), 1.12, 2200, 'left')
          // 설명은 가림막이 거의 다 걷혔을 때 줄마다 가림막 뒤에서 (흐리게만 들이면 글 컴포넌트와 말투가 달랐다)
          lines(one('.bk-img-c'), 600)
          break
        }
        case 'decision': {
          // 생동감: 질문에서 조각이 괄호 줄기를 타고 갈래마다 번갈아 들어가고, 닿는 갈래의 조건이 잠깐 강조색이 된다.
          // 조각의 길은 움직임을 걸기 전에 잰다: 올라오기(rise)는 걸자마자 시작 자리(아래로 밀린 자리)에 서서, 뒤에 재면 길이 선에서
          // 비켜 났다(발표 화면에서 조각이 선 아래로 지나갔다). 선은 쌓기가 그린 갈래 곡선이다(fitBlocks.ts의 forks)
          const root = one('.bk-dc')
          const list = one('.bk-dc-list')
          const rows = $('.bk-dc-row')
          const ways: { path: [number, number][]; cond: HTMLElement | null }[] = []
          // 조각의 길은 쌓기가 그은 갈래 곡선(decision.css, fitBlocks.ts의 forks)을 따라 점으로 뽑는다(곡선의 단위는 칸 안의 px)
          const paths = $('.bk-dc-fork') as unknown as SVGPathElement[]
          if (root && list && rows.length && paths.length === rows.length) {
            paths.forEach((p, i) => {
              const len = p.getTotalLength()
              const pts: [number, number][] = []
              for (let j = 0; j <= 24; j++) {
                const pt = p.getPointAtLength((len * j) / 24)
                pts.push([pt.x, pt.y])
              }
              ways.push({ path: pts, cond: rows[i].querySelector('.bk-dc-condition') })
            })
          }
          fade(one('.bk-dc-label'), 40, 400)
          rise(one('.bk-dc-question'), 100, L.y * 0.5)
          let last = 240
          // 갈래마다 곡선이 질문에서 그어져 나가고, 닿을 즈음 그 갈래의 조건과 할 일이 나타난다
          const forkEls = paths
          items('.bk-dc-row', 240, (el, at) => {
            const k = rows.indexOf(el as HTMLElement)
            const f = forkEls[k]
            if (f && !still) run(anims, f, [{ strokeDasharray: '1 1', strokeDashoffset: '1' }, { strokeDasharray: '1 1', strokeDashoffset: '0' }], s(at - 160), { easing: OUT, duration: d(520) })
            rise(el, at + 120, L.y * 0.4)
            last = Math.max(last, at + 120)
          })
          if (root && ways.length) {
            const accent = getComputedStyle(root).getPropertyValue('--accent').trim()
            const period = d(2400)
            ways.forEach((w, k) => {
              const ink = w.cond ? getComputedStyle(w.cond).color : ''
              stream(root, w.path, last + 700, period, (k * period) / ways.length, w.cond ? { el: w.cond, off: { color: ink }, on: { color: accent } } : undefined)
            })
          }
          break
        }
        case 'whys': {
          // 문제가 먼저 서고, 단마다 앞 단의 이름표 아래에서 선이 내려와 꺾여 들어오면(└) 그 끝에 '왜?'가 닿고 원인이 올라온다.
          // 계단을 한 단씩 내려가는 차례가 캐 들어가는 차례다. 마지막 근본 원인은 강조색 갈고리가 닿을 때 흐릿하던 글이 또렷하게
          // 맺힌다(답). 단이 많아도 1.6초 안에 근본 원인까지 닿게
          lines(one('.bk-h'), 60)
          const steps = $('.bk-wy-step')
          // 생동감에서 계속 흐를 조각의 길은 움직임을 걸기 전에 잰다(조건별 흐름과 같은 까닭: 올라오는 글이 시작 자리에 서 있다)
          const wyList = one('.bk-wy-list')
          const wyLabels = steps.map((st) => st.querySelector('.bk-wy-k') as HTMLElement | null)
          const wyPath: [number, number][] = []
          if (wyList && wyLabels.length > 1 && wyLabels.every(Boolean)) {
            wyLabels.forEach((lb, n) => {
              const r = spot(lb!, wyList)
              const p: [number, number] = [r.l - 8, (r.t + r.b) / 2]
              if (n > 0) wyPath.push([wyPath[wyPath.length - 1][0], p[1]])
              wyPath.push(p)
            })
          }
          const hop = Math.min(levelName === 'lively' ? 560 : 480, 1600 / Math.max(1, steps.length - 1))
          const seg = hop * 0.8
          steps.forEach((step, n) => {
            const at = 120 + n * hop
            const label = step.querySelector('.bk-wy-k')
            const text = step.querySelector('.bk-wy-t')
            const note = step.querySelector('.bk-wy-m')
            if (n === 0) {
              fade(label, at, 400)
              rise(text, at, L.y * 0.5)
              rise(note, at + 80, L.y * 0.3)
              return
            }
            const link = step.querySelector<HTMLElement>('.bk-wy-link')
            if (link && link.offsetParent) {
              // 계단: 앞 단의 이름표 아래에서 단 끝까지 내려가는 조각을 먼저 긋고, 이 단의 갈고리가 이어서 세로를 연 다음 가로로 연다
              draw(steps[n - 1], at - hop * 0.35, hop * 0.35, 'center top', '::after')
              const frames: Keyframe[] = [{ clipPath: 'inset(0 100% 100% 0)' }, { clipPath: 'inset(0 calc(100% - 3px) 0 0)', offset: 0.5 }, { clipPath: 'inset(0 0 0 0)' }]
              run(anims, link, frames, s(at), { easing: EASE.reveal, duration: d(seg) })
            } else {
              // 가로(넓은 칸): 갈고리는 숨고 앞 이름표에서 이 이름표까지 이름표 줄의 곧은 선(앞 이름표의 ::after)이 왼쪽에서 그어진다
              draw(steps[n - 1].querySelector('.bk-wy-k'), at - hop * 0.2, seg, 'left center', '::after')
            }
            fade(label, at + seg * 0.7, 360)
            if (step.classList.contains('is-root') && text) {
              const origin = 'left center'
              run(anims, text, [{ opacity: 0, filter: 'blur(6px)', scale: '1.04', transformOrigin: origin }, { opacity: 1, filter: 'blur(0px)', scale: '1', transformOrigin: origin }], s(at + seg * 0.75), {
                easing: OUT,
                duration: d(720),
              })
            } else rise(text, at + seg * 0.75, L.y * 0.4)
            rise(note, at + seg * 0.75 + 90, L.y * 0.3)
          })
          // 생동감: 그 뒤로는 조각이 문제에서 이름표를 따라 한 단씩 내려가 근본 원인에 닿고, 닿을 때 근본 원인의 글이 잠깐 밝아진다.
          // 캐 들어가는 차례를 계속 보여 준다. 길은 이름표마다의 왼쪽 가운데를 계단(꺾임)으로 잇는다
          if (wyList && wyPath.length > 1) {
            // 근본 원인의 이름표는 이미 강조색이라, 닿을 때 밝아지는 것은 근본 원인의 글이다
            const rootText = steps[steps.length - 1].querySelector('.bk-wy-t') as HTMLElement | null
            const accent = getComputedStyle(wyList).getPropertyValue('--accent').trim()
            const ink = rootText ? getComputedStyle(rootText).color : ''
            const end = 120 + (steps.length - 1) * hop + seg + 600
            stream(wyList, wyPath, end, d(2600), 0, rootText ? { el: rootText, off: { color: ink }, on: { color: accent } } : undefined)
          }
          break
        }
        case 'cycle': {
          // 순환의 요점은 끝이 처음에 이어지는 것이라, 짜임마다 마지막 단계에서 처음 단계로 돌아오는 길을 끝까지 긋고 그 길을 데이터 조각이
          // 한 번 탄다. 고리(넓고 높은 칸): 12시의 첫 단계 점이 맺히면 구간이 시계 방향으로 하나씩 그어지고 조각이 선 끝을 타고 건너가
          // 머리가 맺힐 때 다음 단계가 나온다. 마지막 구간이 첫 점으로 돌아오면 조각이 고리를 한 번 더 빠르게 돌고, 첫 점이 받으며
          // 부풀었다 돌아온다. 가로(넓고 낮은 칸): 단계가 왼쪽부터 나오며 번호 사이 선이 그어지고, 마지막 단계에서 선이 위로 꺾여 거꾸로
          // 건너와 처음 단계로 들어간다. 세로(좁은 칸): 단계가 위에서부터 나오고, 괄호 선이 아래에서 위로 그어져 처음 단계로 들어간다.
          // 단계가 많아도 한 바퀴는 1.8초 안에. 되풀이하지 않는다(흐름과 같은 까닭)
          lines(one('.bk-h'), 60)
          const steps = $('.bk-cy-step')
          const ring = one('.bk-cy-ring')
          const stage = one('.bk-cy-stage')
          const root = one('.bk-cy')
          if (!stage || !root || !steps.length) break
          const hop = Math.min(levelName === 'lively' ? 480 : 420, 1800 / steps.length)
          fade(one('.bk-cy-c'), 100, 600)
          const line = parseFloat(getComputedStyle(root).getPropertyValue('--cy-line')) || 1.5
          // 첫 단계 눈금(고리)이나 첫 번호(가로, 세로)가 한 바퀴를 받으며 부풀었다 돌아온다. 나타날 때 쓴 scale과 겹치지 않게 transform으로
          const land = (el: Element | null, at: number) => {
            if (el) run(anims, el, [{ transform: 'scale(1)' }, { transform: 'scale(1.6)' }, { transform: 'scale(1)' }], s(at), { easing: 'ease-in-out', duration: d(460) })
          }
          if (ring && getComputedStyle(ring).display !== 'none') {
            const arcs = $('.bk-cy-line')
            const ports = $('.bk-cy-port')
            const tips = $('.bk-cy-tip')
            // 조각이 지나갈 길: 고리 가운데와 반지름(판의 px)은 움직이기 전에 잰다
            const box = spot(ring, stage)
            const cx = (box.l + box.r) / 2
            const cy = (box.t + box.b) / 2
            const R = (box.r - box.l) / 2
            const deg = (el: HTMLElement | undefined) => parseFloat(el?.style.getPropertyValue('--a') ?? '') || 0
            const arc = (from: number, to: number): [number, number][] => {
              const k = Math.max(2, Math.ceil((to - from) / 6))
              return Array.from({ length: k + 1 }, (_, i) => {
                const a = ((from + ((to - from) * i) / k) * Math.PI) / 180
                return [cx + R * Math.sin(a), cy - R * Math.cos(a)] as [number, number]
              })
            }
            const legs = steps.map((_, n) => arc(deg(ports[n]), deg(tips[n])))
            steps.forEach((step, n) => {
              const at = 140 + n * hop
              pop(ports[n] ?? null, at)
              rise(step, at + 40, L.y * 0.4)
              if (!arcs[n]) return
              // 길이 단위는 늘어난 고리에 맞춘다(dashK): 그대로 두면 한 구간이 여러 마디로 끊겨 조각보다 앞선 토막이 먼저 그어졌다
              const k = dashK(arcs[n]) * 100
              run(anims, arcs[n], [{ strokeDasharray: `0 ${k}` }, { strokeDasharray: `${k} 0` }], s(at + 80), { easing: CARRY, duration: d(hop * 0.92) })
              packet(stage, legs[n], at + 80, hop * 0.92)
              pop(tips[n] ?? null, at + 80 + hop * 0.85)
            })
            // 한 번 더: 조각이 구간마다 이어 건너간다(점에서 나와 다음 점 앞에서 들어간다)
            const fast = hop * 0.6
            let again = 140 + steps.length * hop + 260
            for (const leg of legs) {
              packet(stage, leg, again, fast)
              again += fast
            }
            land(ports[0] ?? null, again - 80)
            // 생동감: 그 뒤로는 조각 둘이 고리를 마주 보며 쉬지 않고 돈다(한 바퀴 길을 이어 붙여 한 줄로)
            const loop = legs.flat()
            const lap = d(Math.max(2600, steps.length * 700))
            stream(stage, loop, again + 300, lap)
            stream(stage, loop, again + 300, lap, lap / 2)
          } else if (getComputedStyle(root).getPropertyValue('--cy-flat').trim() === '1') {
            steps.forEach((step, n) => {
              const at = 120 + n * hop
              rise(step.querySelector('.bk-cy-n'), at, L.y * 0.4)
              rise(step.querySelector('.bk-cy-text'), at + 40, L.y * 0.4)
              if (n === steps.length - 1) return
              const to = step.querySelector('.bk-cy-to')
              draw(to, at + 120, hop * 0.8, 'left center')
              pop(to, at + 120 + hop * 0.8, '::after')
            })
            // 돌아가는 길: 마지막 번호 뒤의 선 → 위로 꺾임 → 윗변을 거꾸로 → 처음 단계 앞에서 내려와 머리로. 조각과 같은 빠르기로
            // 이어 그어지게 조각마다 길이대로 시간을 나누고 곡선 없이(linear) 긋는다
            const last = steps[steps.length - 1]
            const first = steps[0]
            const list = one('.bk-cy-list')
            const outTo = last.querySelector<HTMLElement>('.bk-cy-to')
            const up = last.querySelector<HTMLElement>('.bk-cy-rail')
            const down = first.querySelector<HTMLElement>('.bk-cy-rail')
            if (!list || !outTo || !up || !down || steps.length < 2) break
            const a = spot(outTo, stage)
            const u = spot(up, stage)
            const w = spot(down, stage)
            const L0 = spot(list, stage)
            const yLine = a.t + line / 2
            const top = L0.t + line / 2
            const xLeft = w.l + line / 2
            const yIn = w.b - line / 2
            const path: [number, number][] = [
              [a.l, yLine],
              [u.r - line / 2, yLine],
              [u.r - line / 2, top],
              [xLeft, top],
              [xLeft, yIn],
              // 끝 눈금(cycle.css)이 처음 단계 앞에 선다: 조각은 그 눈금에서 멈춘다
              [w.r, yIn],
            ]
            const lens = path.slice(1).map((q, i) => Math.hypot(q[0] - path[i][0], q[1] - path[i][1]))
            const total = lens.reduce((x, y) => x + y, 0) || 1
            const T = Math.max(700, Math.min(1200, total * 0.45))
            const per = (len: number) => (T * len) / total
            let at = 120 + steps.length * hop + 60
            const linear = (el: Element, from: string, ms: number, pseudo?: string) =>
              run(anims, el, [{ clipPath: from }, { clipPath: 'inset(-12px -12px -12px -12px)' }], s(at), { easing: 'linear', duration: d(ms) }, pseudo)
            // 조각은 곡선 없이: 선이 그어지는 끝과 같은 빠르기로 탄다. 조각만 CARRY로 타면 윗길 가운데에서 선 끝보다 300px 남짓 앞서 달렸다
            packet(stage, path, at, T, 'linear')
            linear(outTo, 'inset(-12px 100% -12px 0)', per(lens[0]))
            at += per(lens[0])
            linear(up, 'inset(100% -12px 0 -12px)', per(lens[1]))
            at += per(lens[1])
            linear(list, 'inset(-12px 0 -12px 100%)', per(lens[2]), '::before')
            at += per(lens[2])
            bend(down, at, per(lens[3] + lens[4]), 'top', 'left', line + 4, 'linear')
            at += per(lens[3] + lens[4])
            pop(down, at - 40, '::after')
            land(first.querySelector('.bk-cy-n'), at + 60)
          } else {
            const lead = hop * 0.6
            steps.forEach((step, n) => rise(step, 120 + n * lead, L.y * 0.4))
            // 괄호 선은 단계가 다 나온 뒤에 마지막 단계의 조각부터 위로 이어 긋는다. 머리는 조각 밖으로 걸려 있어서 걷는 창을
            // 둘레로 넉넉히 둔다
            const rails = steps.map((st) => st.querySelector('.bk-cy-rail')).filter((r): r is HTMLElement => !!r)
            if (rails.length < 2) break
            const start = 120 + steps.length * lead
            const seg = Math.min(240, 900 / rails.length)
            ;[...rails].reverse().forEach((rail, k) =>
              run(anims, rail, [{ clipPath: 'inset(100% -0.5em -0.5em -0.5em)' }, { clipPath: 'inset(-0.5em -0.5em -0.5em -0.5em)' }], s(start + k * seg), {
                easing: 'linear',
                duration: d(seg),
              }),
            )
            const shut = start + rails.length * seg
            pop(rails[0], shut, '::after')
            land(steps[0].querySelector('.bk-cy-n'), shut + 80)
          }
          break
        }
        case 'flow': {
          // 첫 단계가 나오고, 다음 단계로 선이 그어지는 동안 데이터 조각이 선 끝을 따라 건너가서, 닿을 때 다음 단계가 받아 나타난다.
          // 끝까지 닿으면 조각이 처음부터 끝까지 한 번 더 빠르게 지나가고 멈춘다. 되풀이하지 않는다:
          // 보고를 듣는 동안 장 한쪽이 계속 움직이면 눈을 빼앗는다
          fade(one('.bk-fw-key'), 60, 500)
          const nodes = $('.bk-fw-node')
          const links = $('.bk-fw-link')
          // 단계가 많아도 1.5초 안에 끝 단계까지 닿게
          const hop = Math.min(levelName === 'lively' ? 400 : 360, 1500 / Math.max(1, links.length))
          // 잇는 선의 양 끝(flow.css): 보내는 상자 가장자리의 점에서 받는 상자 가장자리(머리 끝)까지. 가로면 왼쪽에서 오른쪽,
          // 세로로 쌓였으면 위에서 아래
          const tall = (link: HTMLElement) => link.offsetHeight > link.offsetWidth
          const ends = (link: HTMLElement): [number, number][] => {
            const w = link.offsetWidth
            const h = link.offsetHeight
            return tall(link) ? [[w / 2, 0], [w / 2, h]] : [[0, h / 2], [w, h / 2]]
          }
          let at = 40
          nodes.forEach((node, i) => {
            const link = links[i - 1]
            if (link) {
              const down = tall(link)
              // 점이 보내는 상자 가장자리에서 맺히고, 선이 그 점에서 그어진다. 머리는 조각이 받는 상자로 들어갈 때
              // 선이 오던 쪽에서 밀려와 닿는다(머리가 처음부터 있으면 빈 선 끝에 화살표만 먼저 떠 있다)
              pop(link, at, '::before')
              draw(link.querySelector('.bk-fw-wire'), at, hop, down ? 'center top' : 'left center')
              run(anims, link, [{ opacity: 0, translate: down ? '-50% -10px' : '-10px -50%' }], s(at + hop * 0.68), { easing: OUT, duration: d(280) }, '::after')
              packet(link, ends(link), at, hop)
              at += hop
            }
            // 받는 단계는 조각이 들어가기 직전부터 커지며 나타난다
            run(anims, node, [{ opacity: 0, scale: String(L.scale) }], s(Math.max(0, at - 80)), L.pop)
            rise(node.querySelector('.bk-fw-text'), at, L.y * 0.4)
            // 숫자는 끝 단계(강조)만 굴린다. 단계마다 굴리면 조각보다 숫자에 눈이 간다
            if (node.classList.contains('is-hl')) countIn(node.querySelector('.bk-fw-v'), at + 40)
            else fade(node.querySelector('.bk-fw-v'), at + 60, 400)
          })
          // 한 번 더: 조각이 선을 이어 건너간다(단계 안은 들어갔다 나오는 것처럼 건너뛴다). 끝 단계(강조)가 받으며 살짝 부풀었다 돌아온다
          const fast = hop * 0.6
          let again = at + 260
          for (const link of links) {
            packet(link, ends(link), again, fast)
            again += fast
          }
          // 생동감: 그 뒤로는 조각이 단계 사이를 쉬지 않고 건너간다(선마다 엇갈려). 데이터가 계속 오가는 흐름으로 보인다
          const accent = getComputedStyle(scope).getPropertyValue('--accent').trim()
          const rim = (el: Element | undefined) => (el ? getComputedStyle(el).boxShadow : 'none')
          links.forEach((link, i) =>
            stream(link, ends(link), again + 300, d(1400), (i * 1400) / Math.max(2, links.length), {
              el: nodes[i + 1] ?? null,
              off: { boxShadow: rim(nodes[i + 1]) },
              on: { boxShadow: `inset 0 0 0 2px ${accent}` },
            }),
          )
          const hl = one('.bk-fw-node.is-hl')
          // 부풀기는 transform으로: 나타날 때 쓴 scale과 같은 속성이면 늦게 만든 이것이 시작 전(fill backwards)부터 scale을 덮어 나타나기가 사라진다
          if (hl && links.length) run(anims, hl, [{ transform: 'scale(1)' }, { transform: 'scale(1.03)' }, { transform: 'scale(1)' }], s(again - 60), { easing: 'ease-in-out', duration: d(480) })
          break
        }
        case 'chat': {
          // 대본처럼: 말하는 사람이 나오고, 그 말이 한 글자씩 써진다. 앞의 말이 다 써지면 다음 사람. 말이 길어도 한 말은 1.2초 안에.
          // 생동감에서는 마지막 말(답) 끝에 커서가 남아 깜빡인다
          lines(one('.bk-h'), 60)
          const turns = $('.bk-ch-turn')
          let at = 160
          turns.forEach((turn, k) => {
            const say = turn.querySelector<HTMLElement>('.bk-ch-say')
            const len = [...(say?.textContent ?? '')].length
            const ms = Math.max(320, Math.min(1000, len * 32))
            fade(turn.querySelector('.bk-ch-who'), at, 300)
            run(anims, turn, [{ opacity: 0 }, { opacity: 1 }], s(at), { easing: OUT, duration: d(120) })
            typeOut(say, at + 120, ms, k === turns.length - 1)
            at += 120 + ms + 260
          })
          break
        }
        case 'wipe': {
          // 지금이 먼저 줄마다 올라오고, 세로 선 하나가 왼쪽에서 오른쪽으로 같은 빠르기로 훑는다. 선이 지금 글의 끝을 지날 때 취소선이
          // 그어지고(글이 한 단계 옅어지며), 바뀐 뒤 글은 선이 지나가는 만큼 왼쪽부터 드러난다. 자리는 움직임을 걸기 전에 잰다
          const root = one('.bk-wp')
          const bar = one('.bk-wp-bar')
          const rows = $('.bk-wp-row')
          if (!root || !rows.length) break
          const W = root.offsetWidth || 1
          const spots = rows.map((row) => {
            const old = row.querySelector<HTMLElement>('.bk-wp-old')
            const neu = row.querySelector<HTMLElement>('.bk-wp-new')
            return { old, neu, o: old ? spot(old, root) : null, n: neu ? spot(neu, root) : null }
          })
          const hf = one('.bk-wp-hf')
          const ht = one('.bk-wp-ht')
          const frame = one('.bk-wp-frame')
          // 선은 글이 있는 자리만 훑는다: 위아래는 글 묶음(.bk-wp-frame), 옆은 맨 왼쪽 글에서 맨 오른쪽 글까지. 칸 전체(높이 100%, 칸 너비)를
          // 훑던 때는 칸이 높으면 글 아래 빈 자리까지 긴 선이 서 있었고(필름: 글보다 선이 몇 배 길었다), 글 밖의 빈 너비를 지나는 동안
          // 듣는 사람을 기다리게 했다. 끝에서는 0.04만에 사라져 오른쪽 끝에서 뚝 끊겼다. 이제 마지막 5분의 1 동안 옅어지며 빠져나간다
          const boxes = [...spots.flatMap((sp) => [sp.o, sp.n]), hf ? spot(hf, root) : null, ht ? spot(ht, root) : null].filter((b): b is ReturnType<typeof spot> => !!b)
          const L0 = boxes.length ? Math.max(0, Math.min(...boxes.map((b) => b.l)) - 24) : 0
          const R0 = boxes.length ? Math.min(W, Math.max(...boxes.map((b) => b.r)) + 24) : W
          const span = Math.max(1, R0 - L0)
          fade(hf, 60, 400)
          rows.forEach((row, k) => rise(row.querySelector('.bk-wp-was'), 120 + k * 90, L.y * 0.4))
          const t0 = 260 + rows.length * 90
          // 훑는 빠르기는 예전(칸 너비를 1.2초)과 같게 두되 너무 짧게 끝나지 않게
          const T = (levelName === 'lively' ? 1500 : 1200) * Math.max(0.6, Math.min(1, span / W))
          const x = (px: number) => t0 + (T * Math.max(0, Math.min(span, px - L0))) / span
          if (bar && !still) {
            const fr = frame ? spot(frame, root) : null
            if (fr) {
              const style = bar.getAttribute('style')
              bar.style.top = fr.t - 12 + 'px'
              bar.style.bottom = 'auto'
              bar.style.height = fr.b - fr.t + 24 + 'px'
              restores.push(() => (style === null ? bar.removeAttribute('style') : bar.setAttribute('style', style)))
            }
            run(
              anims,
              bar,
              [
                { opacity: 0, translate: `${L0}px 0`, offset: 0 },
                { opacity: 1, translate: `${L0 + span * 0.06}px 0`, offset: 0.06 },
                { opacity: 1, translate: `${L0 + span * 0.8}px 0`, offset: 0.8 },
                { opacity: 0, translate: `${R0}px 0`, offset: 1 },
              ],
              s(t0),
              { easing: 'linear', duration: d(T) },
            )
          }
          fade(ht, ht ? x(spot(ht, root).l) : x(L0 + span * 0.4), 300)
          for (const sp of spots) {
            if (sp.old && sp.o) {
              const ink = getComputedStyle(sp.old).color
              run(anims, sp.old, [{ textDecorationColor: 'transparent', color: getComputedStyle(root).getPropertyValue('--ink-2').trim() || ink }], s(x(sp.o.r)), { easing: OUT, duration: d(260) })
            }
            if (sp.neu && sp.n)
              // 끝은 글 상자보다 조금 넓게: 상자 끝에 딱 맞추면 상자 밖으로 조금 나온 마지막 글자의 끝이 움직임이 끝날 때까지 잘려 있다가 튀었다
              run(anims, sp.neu, [{ clipPath: 'inset(-20% 100% -20% 0)' }, { clipPath: 'inset(-20% -0.25em -20% 0)' }], s(x(sp.n.l)), {
                easing: 'linear',
                duration: d(Math.max(80, x(sp.n.r) - x(sp.n.l))),
              })
          }
          break
        }
        case 'gather': {
          // 어지러운 것이 정리된다: 모인 것들이 장 여기저기(제자리에서 칸 너비의 절반 안팎 떨어진 곳)에 조금씩 기울어 흩어져 나타나고,
          // 잠깐 머문 뒤 차례로 제자리로 날아와 줄을 선다. 다 서면 위의 가는 선이 그어지고 모이는 곳의 이름이 올라온다.
          // 흩어진 자리는 차례마다 정해진 값(무작위가 아니라)이라 발표할 때마다 같은 그림이다
          const root = one('.bk-gt2')
          const its = $('.bk-gt2-it')
          if (!root || !its.length) break
          const W = root.offsetWidth || 1
          const H = root.offsetHeight || 1
          // 흩어진 자리는 컴포넌트 칸 안으로만: 칸 밖(장의 아래 단락 표시, 옆 컴포넌트)까지 날아가 겹쳤다(발표 녹화)
          const boxes = its.map((it) => spot(it, root))
          // 흩어진 자리끼리도 겹치지 않게, 칸을 나눈 자리(왼쪽 위 기준, 칸의 비율)에 하나씩. 제자리와 다른 줄·단이 되도록 섞어 둔 차례다
          const SPOTS = [
            [0.62, 0.06],
            [0.04, 0.5],
            [0.38, 0.82],
            [0.78, 0.46],
            [0.2, 0.12],
            [0.5, 0.36],
            [0.86, 0.84],
            [0.06, 0.86],
          ]
          const spread = (k: number) => {
            const b = boxes[k]
            const [fx, fy] = SPOTS[k % SPOTS.length]
            const x = fx * Math.max(0, W - (b.r - b.l)) - b.l
            const y = fy * Math.max(0, H - (b.b - b.t)) - b.t
            return { x, y, rot: ((k % 3) - 1) * 4 }
          }
          const fly = 80 + its.length * 70 + 420
          // 한 조각의 움직임을 한 애니메이션으로: 흩어진 자리에 나타나 머물다 제자리로. 둘로 나누면 그 사이에 제자리에 잠깐 보였다
          its.forEach((it, k) => {
            const p = spread(k)
            const start = 80 + k * 70
            const go = fly + k * 80
            const total = go + 620 - start
            const away = { translate: `${p.x}px ${p.y}px`, rotate: `${p.rot}deg` }
            run(
              anims,
              it,
              [
                { opacity: 0, ...away, offset: 0, easing: OUT },
                { opacity: 0.85, ...away, offset: 260 / total },
                { opacity: 0.85, ...away, offset: (go - start) / total, easing: CARRY },
                { opacity: 1, translate: '0px 0px', rotate: '0deg', offset: 1 },
              ],
              s(start),
              { easing: 'linear', duration: d(total) },
            )
          })
          const settled = fly + its.length * 80 + 520
          const head = one('.bk-gt2-head')
          if (head) run(anims, head, [{ borderBottomColor: 'transparent' }], s(settled), { easing: OUT, duration: d(400) })
          rise(one('.bk-gt2-c'), settled + 60, L.y * 0.5)
          fade(one('.bk-gt2-n'), settled + 220, 500)
          break
        }
        case 'search': {
          // 하나를 찾으려고 여러 곳을 뒤진다: 곳들이 차례로 서고, 첫 곳부터 이름이 차례로 잠깐 강조색이 됐다가 옅어지며(뒤졌지만 없음)
          // 왼쪽 수가 하나씩 오른다(1 → 6). 다 뒤지면 결과 한 줄이 올라온다
          const list = one('.bk-sr-list')
          const its = $('.bk-sr-it')
          const num = one('.bk-sr-k')
          if (!list || !its.length) break
          fade(one('.bk-sr-l'), 60, 400)
          its.forEach((it, k) => {
            rise(it.querySelector('.bk-sr-t'), 160 + k * 60, L.y * 0.4)
            fade(it.querySelector('.bk-sr-m'), 200 + k * 60, 360)
          })
          // 곳들이 서자마자 뒤지기 시작한다. 수는 뒤지기 시작할 때 나온다: 먼저 나오면 '00'으로 1초 넘게 멈춰 있었다(발표 녹화)
          const hop = levelName === 'lively' ? 400 : 340
          const t0 = 160 + its.length * 60 + 80
          rise(one('.bk-sr-num'), t0 - 120, L.y * 0.4)
          const accent = getComputedStyle(list).getPropertyValue('--accent').trim()
          its.forEach((it, k) => {
            const t = it.querySelector<HTMLElement>('.bk-sr-t')
            if (t && !still) run(anims, t, [{ color: getComputedStyle(t).color }, { color: accent, offset: 0.25 }, { color: getComputedStyle(t).color }], s(t0 + k * hop + hop * 0.4), { easing: 'ease-out', duration: d(hop * 1.4) })
          })
          // 수: 커서가 곳에 닿을 때마다 하나씩(굴리기가 아니라 셈: 01, 02, …)
          if (num && !still && !quiet && !num.closest('.m-edit, [data-mo-keep]')) {
            const final = num.textContent || ''
            const width = final.length
            const born = performance.now()
            const hits = its.map((_, k) => s(t0 + k * hop + hop * 0.45))
            const end = s(t0 + its.length * hop + 100)
            num.textContent = '00'.slice(0, width)
            let done = () => {}
            let frame = 0
            waits.push(new Promise<void>((r) => (done = r)))
            // 시계는 nowFor: '하나씩'으로 멈춘 동안은 수도 멈춘다
            const tick = () => {
              const t = nowFor(num) - born
              if (t >= end) {
                num.textContent = final
                done()
                return
              }
              num.textContent = String(hits.filter((h) => h <= t).length).padStart(width, '0')
              frame = requestAnimationFrame(tick)
            }
            frame = requestAnimationFrame(tick)
            stops.push(() => {
              cancelAnimationFrame(frame)
              num.textContent = final
              done()
            })
          }
          rise(one('.bk-sr-r'), t0 + its.length * hop + 200, L.y * 0.4)
          break
        }
        case 'layers': {
          // 위가 아래에 기대어 선다: 층이 위에서부터 차례로 내려앉고, 다 쌓이면 요청이 내려갔다 올라오는 것을 층 이름이 차례로 잠깐
          // 강조색이 되는 것으로 보인다(위에서 아래로, 다시 아래에서 위로). 축과 그 위를 타는 조각은 꾸밈 표시라 뺐다(사용자)
          const rows = $('.bk-ly-row')
          if (!rows.length) break
          lines(one('.bk-h'), 60)
          rows.forEach((row, k) => {
            run(anims, row, [{ opacity: 0, translate: `0 ${-L.y * 1.2}px` }], s(120 + k * 140), { easing: CARRY, duration: d(520) })
          })
          const built = 120 + rows.length * 140 + 420
          if (rows.length > 1 && !still) {
            const per = levelName === 'lively' ? 340 : 280
            const accent = getComputedStyle(rows[0]).getPropertyValue('--accent').trim()
            const order = [...rows.keys(), ...[...rows.keys()].reverse().slice(1)]
            order.forEach((k, n) => {
              const t = rows[k].querySelector<HTMLElement>('.bk-ly-t')
              if (!t) return
              const ink = getComputedStyle(t).color
              run(anims, t, [{ color: ink }, { color: accent, offset: 0.3 }, { color: ink }], s(built + per * n), { easing: 'ease-out', duration: d(560) })
            })
          }
          break
        }
        case 'gate': {
          // 들어온 것이 관문을 지난다: 통로가 왼쪽부터 그어지고 들어오는 것, 관문 눈금(아래위로 서며), 관문 이름이 차례로 나온다.
          // 그다음 조각이 통로를 따라 관문을 하나씩 지나 나가는 것에 닿는다. 거르는 관문에서는 조각 하나가 아래로 떨어진다.
          // 생동감에서는 조각이 쉬지 않고 들어와 지나가고, 두 번에 한 번은 거르는 관문에서 떨어진다
          const root = one('.bk-gw')
          const gates = $('.bk-gw-g')
          if (!root || !gates.length) break
          const W = root.offsetWidth || 1
          // 통로의 높이: 관문 눈금의 가운데(gate.css의 가운데 줄)
          // 통로의 높이는 관문 이름의 가운데(이름이 통로 위에 선다, gate.css)
          const name0 = gates[0].querySelector('.bk-gw-t')
          const midY = name0 ? (() => { const r = spot(name0, root); return (r.t + r.b) / 2 })() : (root.offsetHeight || 0) / 2
          const dropIdx = gates.findIndex((g) => g.classList.contains('is-drop'))
          const dropX = dropIdx >= 0 ? (() => { const r = spot(gates[dropIdx].querySelector('.bk-gw-t') ?? gates[dropIdx], root); return (r.l + r.r) / 2 })() : -1
          const inEl = one('.bk-gw-in')
          const outEl = one('.bk-gw-out')
          const x0 = inEl ? spot(inEl, root).r : 0
          const x1 = outEl ? spot(outEl, root).l : W
          draw(root, 60, 700, 'left center', '::before')
          rise(inEl, 100, L.y * 0.4)
          gates.forEach((g, k) => {
            const at = 200 + k * 140
            rise(g.querySelector('.bk-gw-t'), at + 60, L.y * 0.4)
            fade(g.querySelector('.bk-gw-m'), at + 140, 400)
          })
          const ready = 200 + gates.length * 140 + 300
          rise(outEl, ready - 100, L.y * 0.4)
          fade(one('.bk-gw-x'), ready + 900, 500)
          if (!still) {
            const ride = levelName === 'lively' ? 1500 : 1300
            packet(root, [[x0, midY], [x1, midY]], ready, ride, 'linear')
            if (dropX > 0) {
              // 떨어지는 조각: 거르는 관문까지 오다가 아래로 떨어지며 옅어진다
              const fall = Math.max(200, (ride * (dropX - x0)) / Math.max(1, x1 - x0))
              packet(root, [[x0, midY], [dropX, midY], [dropX, midY + 90]], ready + 500, fall + 380, 'linear')
            }
            stream(root, [[x0, midY], [x1, midY]], ready + ride + 700, d(2200))
            stream(root, [[x0, midY], [x1, midY]], ready + ride + 700, d(2200), d(1100))
          }
          break
        }
        case 'spread': {
          // 퍼짐: 옅은 눈금 판이 먼저 깔리고, 단계마다 그 단계에 드는 눈금이 왼쪽 가운데의 씨앗에서 가까운 차례로 번진다(물결).
          // 기울어 있던 눈금이 똑바로 서며 물든다(사람들이 같은 쪽을 보기 시작한다). 단계의 몫과 이름은 그 단계가 번지기
          // 바로 전에 올라온다. '하나씩'이면 단계마다 멈춘다(단계 이름이 오르는 때가 항목의 시작)
          const ms = $('.bk-spr-m')
          const its = $('.bk-spr-it')
          if (!ms.length) break
          fade(one('.bk-spr-l'), 40, 400)
          fade(one('.bk-spr-grid'), 80, 500)
          const gray = ms.length ? getComputedStyle(ms[ms.length - 1]).getPropertyValue('--sp-off').trim() : ''
          const base = gray || getComputedStyle(scope).getPropertyValue('--line').trim()
          const groups: { el: HTMLElement; o: number; to: string }[][] = its.map(() => [])
          for (const m of ms) {
            const st = Number(m.dataset.st)
            if (st >= 0 && groups[st]) groups[st].push({ el: m, o: Number(m.style.getPropertyValue('--o')), to: getComputedStyle(m).backgroundColor })
          }
          const wave = levelName === 'lively' ? 900 : 760
          let at = 520
          groups.forEach((g, k) => {
            g.sort((x, y) => x.o - y.o)
            rise(its[k], at - 120, L.y * 0.4)
            const per = g.length > 1 ? Math.min(40, wave / g.length) : 0
            if (!still)
              g.forEach((m, j) =>
                run(
                  anims,
                  m.el,
                  // 기울어 있던 눈금이 똑바로 서며 물든다(결이 맞춰진다). 살짝 지나쳤다 돌아오는 곡선이라 하나하나가 '선다'
                  [
                    { backgroundColor: base, rotate: m.el.style.getPropertyValue('--r') || '0deg', offset: 0 },
                    { backgroundColor: m.to, offset: 0.45 },
                    { backgroundColor: m.to, rotate: '0deg', offset: 1 },
                  ],
                  s(at + j * per),
                  { easing: EASE.snap, duration: d(760) },
                ),
              )
            at += 120 + Math.max(320, per * g.length) + 380
          })
          fade(one('.bk-spr-n'), at - 200, 500)
          break
        }
        case 'adoption': {
          // 확산 곡선: 바닥선과 종 모양 윤곽이 먼저 그어지고, 세로선(시간)이 왼쪽에서 오른쪽으로 같은 빠르기로 훑는다. 선이 지나간 만큼
          // 무리의 면과 누적 S자 곡선이 드러나고(같은 가림막), 경계를 지날 때 그 경계의 누적 몫(2.5% → 16% → …)이, 무리 칸에 들어설 때
          // 그 무리 이름이 올라온다. 다 훑으면 지금 무리가 한 번 밝아진다. '하나씩'이면 무리 이름이 오르는 때마다 멈춘다(훑기도 같이).
          // 자리는 움직임을 걸기 전에 잰다
          const stage = one('.bk-ad-stage')
          if (!stage) break
          const W = stage.offsetWidth || 1
          const its = $('.bk-ad-it')
          const starts = its.map((it) => spot(it, stage).l)
          const cums = $('.bk-ad-cum').map((el) => ({ el, x: spot(el, stage).l + el.offsetWidth / 2 }))
          fade(one('.bk-ad-l'), 60, 400)
          fade(one('.bk-ad-n'), 160, 500)
          fade(one('.bk-ad-base'), 120, 400)
          const bell = one('.bk-ad-bell')
          if (bell && !still) {
            // 길이 단위는 늘어난 그림에 맞춘다(dashK): 그대로 두면 긋기 전부터 종의 오른쪽 꼬리가 보였다
            const k = dashK(bell) * 100
            run(anims, bell, [{ strokeDasharray: `${k} ${k}`, strokeDashoffset: k }, { strokeDasharray: `${k} ${k}`, strokeDashoffset: 0 }], s(160), { easing: OUT, duration: d(900) })
          }
          const t0 = 620
          const T = levelName === 'lively' ? 2400 : 2000
          const x = (px: number) => t0 + (T * Math.max(0, Math.min(W, px))) / W
          const fill = one('.bk-ad-fill')
          const bar = one('.bk-ad-sweep')
          if (fill && !still) run(anims, fill, [{ clipPath: 'inset(-4% 100% -4% 0)' }, { clipPath: 'inset(-4% 0% -4% 0)' }], s(t0), { easing: 'linear', duration: d(T) })
          if (bar && !still)
            run(
              anims,
              bar,
              [
                { opacity: 0, translate: '0 0', offset: 0 },
                { opacity: 1, translate: `${W * 0.03}px 0`, offset: 0.03 },
                { opacity: 1, translate: `${W * 0.97}px 0`, offset: 0.97 },
                { opacity: 0, translate: `${W}px 0`, offset: 1 },
              ],
              s(t0),
              { easing: 'linear', duration: d(T) },
            )
          $('.bk-ad-edge').forEach((el, k) => fade(el, x(cums[k]?.x ?? 0), 300))
          for (const c of cums) rise(c.el, x(c.x) - 60, L.y * 0.3)
          its.forEach((it, k) => rise(it, x(starts[k]) + 80, L.y * 0.4))
          fade(one('.bk-ad-sl'), t0 + T - 200, 400)
          const now = one('.bk-ad-band.is-now')
          if (now && !still) {
            const base = getComputedStyle(now).fill
            const accent = getComputedStyle(scope).getPropertyValue('--accent').trim()
            run(anims, now, [{ fill: base }, { fill: base, offset: 0.001 }, { fill: accent, offset: 0.35 }, { fill: base }], s(t0 + T + 120), { easing: 'ease-in-out', duration: d(900) })
          }
          break
        }
        case 'dupes': {
          // 따로 하던 같은 일: 팀 줄이 차례로 나오고(한 일은 아직 지우지 않은 글자색), 다 나오면 한 일들이 동시에 강조색으로 밝아졌다가
          // (다 같은 일) 한꺼번에 줄이 그어지며 옅어진다. 그다음 아래의 하나가 올라온다. 한 일의 움직임은 한 애니메이션으로: 둘로
          // 나누면 그 사이에 끝 모습(지운 모습)이 잠깐 보였다
          lines(one('.bk-h'), 60)
          const rows = $('.bk-dp-row')
          const accent = getComputedStyle(scope).getPropertyValue('--accent').trim()
          const ink = getComputedStyle(scope).getPropertyValue('--ink-2').trim()
          const step = levelName === 'lively' ? 200 : 170
          const flash = 120 + rows.length * step + 260
          const strike = flash + 520
          rows.forEach((row, k) => {
            const at = 120 + k * step
            fade(row.querySelector('.bk-dp-who'), at, 300)
            const what = row.querySelector<HTMLElement>('.bk-dp-what')
            if (!what || still) return
            const total = strike + 420 - at
            const o = (t: number) => Math.min(1, Math.max(0, (t - at) / total))
            run(
              anims,
              what,
              [
                { opacity: 0, translate: `0 ${L.y * 0.4}px`, color: ink, textDecorationColor: 'transparent', offset: 0, easing: OUT },
                { opacity: 1, translate: '0 0', color: ink, textDecorationColor: 'transparent', offset: o(at + 380) },
                { opacity: 1, translate: '0 0', color: ink, textDecorationColor: 'transparent', offset: o(flash) },
                { opacity: 1, translate: '0 0', color: accent, textDecorationColor: 'transparent', offset: o(flash + 180) },
                { opacity: 1, translate: '0 0', color: ink, textDecorationColor: 'transparent', offset: o(strike) },
              ],
              s(at),
              { easing: 'linear', duration: d(total) },
            )
          })
          fade(one('.bk-dp-l'), strike + 260, 400)
          rise(one('.bk-dp-r'), strike + 320, L.y * 0.5)
          break
        }
        case 'aliases': {
          // 같은 대상, 다른 이름: 위의 대상 글자가 곳마다 부르는 이름으로 차례로 바뀌고(바뀔 때 그 이름이 아래에 나타나며 잠깐 강조색),
          // 마지막에 원래 이름으로 돌아온다. 글자를 바꾸는 것은 프레임마다 시계(nowFor)를 읽어 '하나씩'으로 멈추면 같이 멈춘다
          fade(one('.bk-al-l'), 60, 400)
          const c = one('.bk-al-c')
          const its = $('.bk-al-it')
          const names = its.map((it) => (it.querySelector('.bk-al-t')?.textContent ?? '').trim())
          const hold = levelName === 'lively' ? 620 : 540
          const t0 = 260
          const accent = getComputedStyle(scope).getPropertyValue('--accent').trim()
          its.forEach((it, k) => {
            const at = t0 + k * hold
            run(anims, it, [{ opacity: 0, translate: `0 ${L.y * 0.4}px` }], s(at), { easing: OUT, duration: d(320) })
            const t = it.querySelector<HTMLElement>('.bk-al-t')
            if (t && !still) run(anims, t, [{ color: accent }, { color: accent, offset: 0.6 }, { color: getComputedStyle(t).color }], s(at), { easing: 'linear', duration: d(hold) })
          })
          const back = t0 + its.length * hold
          fade(one('.bk-al-n'), back + 200, 500)
          if (c) {
            run(anims, c, [{ opacity: 0 }], s(80), { easing: OUT, duration: d(240) })
            const walker = document.createTreeWalker(c, NodeFilter.SHOW_TEXT)
            const node = walker.nextNode() as Text | null
            if (node && names.every(Boolean) && !still && !quiet && !c.closest('.m-edit, [data-mo-keep]')) {
              const original = node.nodeValue || ''
              const born = performance.now()
              const swaps = names.map((_, k) => s(t0 + k * hold))
              const end = s(back)
              let frame = 0
              let done = () => {}
              waits.push(new Promise<void>((r) => (done = r)))
              const tick = () => {
                const el = nowFor(c) - born
                if (el >= end) {
                  node.nodeValue = original
                  done()
                  return
                }
                const k = swaps.filter((x) => x <= el).length - 1
                node.nodeValue = k >= 0 ? names[k] : original
                frame = requestAnimationFrame(tick)
              }
              frame = requestAnimationFrame(tick)
              stops.push(() => {
                cancelAnimationFrame(frame)
                node.nodeValue = original
                done()
              })
              // 바뀔 때마다 짧게 옅어졌다 또렷해진다(글자만 갈아 끼우면 깜빡이는 것처럼 보였다)
              // 글자는 가장 옅을 때 바뀐다
              ;[...swaps.slice(1), end].forEach((at) => run(anims, c, [{ opacity: 1 }, { opacity: 0.2, offset: 0.4 }, { opacity: 1 }], Math.max(0, at - d(104)), { easing: 'ease-out', duration: d(260) }))
            }
          }
          break
        }
        case 'hub': {
          // 모이고 퍼지기(모션 그래픽 장면). 모이기는 끝점이 위에서부터 맺히고 선이 가운데로 그어진 뒤 계기판이 서고, 퍼지기는
          // 계기판이 먼저 서고 선이 끝점으로 뻗는다. 다 서면 데이터 조각이 길을 따라 쉬지 않고 흐르고, 조각이 닿는 순간 그 길의
          // 가운데 테(모이기)나 끝점(퍼지기)이 잠깐 강조색으로 밝아진다: 움직임이 '전달됐다'는 뜻을 갖게. 떠나는 쪽도 조각이 출발할 때
          // 살짝 밝아진다. 계속 움직이는 것은 이 흐름 하나다(번짐 빛, 숨쉬기, 도는 호는 쓰지 않는다: docs/MOTION.md).
          // 흐름은 이 장을 떠날 때(stops)까지 이어진다. 끝맺음(묶음이 끝났는지)을 기다리는 목록(anims)에는 넣지 않는다
          const root = one('.bk-hb')
          if (!root) break
          const out = root.classList.contains('is-out')
          const lines = $('.bk-hb-line')
          const dots = $('.bk-hb-dot')
          const nodes = $('.bk-hb-node')
          const core = one('.bk-hb-core')
          const ticks = one('.bk-hb-ticks')
          const hubText = one('.bk-hb-hub')
          const hits = $('.bk-hb-hit')
          const n = Math.max(1, lines.length)
          const step = stagger(n + 1, levelName === 'lively' ? 170 : 150, 800)
          const lineDur = d(levelName === 'lively' ? 700 : 620)
          const grow = (el: Element | null, at: number) => {
            if (el) run(anims, el, [{ opacity: 0, scale: '0.4' }], s(at), L.pop)
          }
          const stroke = (el: Element, at: number) => {
            const k = dashK(el) * 100
            run(anims, el, [{ strokeDasharray: `${k} ${k}`, strokeDashoffset: k }, { strokeDasharray: `${k} ${k}`, strokeDashoffset: 0 }], s(at), { easing: OUT, duration: lineDur })
          }
          // 모이기: 계기판은 마지막 선이 가운데에 거의 닿을 때 그 자리에서 선다. 선이 다 닿은 뒤에 세우면 선 끝이 한 점에 모인 꺾쇠(>)가
          // 0.2~0.3초 혼자 보였다(필름)
          const coreAt = out ? 60 : 200 + (n - 1) * step + 240
          // 계기판: 테가 먼저 서고 눈금이 한 바퀴 그어진다
          grow(core, coreAt)
          if (ticks) run(anims, ticks, [{ strokeDasharray: '0 1' }, { strokeDasharray: '0.35 0.65' }], s(coreAt + 80), { easing: OUT, duration: d(700) })
          rise(hubText, coreAt + 160, L.y * 0.5)
          lines.forEach((line, k) => {
            const at = out ? coreAt + 260 + k * step : 60 + k * step
            if (out) {
              stroke(line, at)
              grow(dots[k], at + 380)
              rise(nodes[k], at + 400, L.y * 0.5)
            } else {
              grow(dots[k], at)
              rise(nodes[k], at + 40, L.y * 0.5)
              stroke(line, at + 160)
            }
          })
          if (quiet || still) break
          // 살아 있는 흐름: 장의 움직임이 다 선 뒤부터
          const start = s(out ? coreAt + 260 + (n - 1) * step + 700 : coreAt + 500)
          const loops: Animation[] = []
          const fast = levelName === 'lively' ? 0.85 : 1
          const heads = $('.bk-hb-pk')
          const tails = $('.bk-hb-tail')
          const accent = getComputedStyle(root).getPropertyValue('--accent').trim() || 'currentColor'
          heads.forEach((head, k) => {
            // 조각은 길마다 둘(Hub.tsx): 같은 길의 둘째는 반 주기 늦게
            const way = Math.floor(k / 2)
            const period = (1700 + (way % 3) * 260) * fast
            const delay = start + ((way * 380) % 1300) + (k % 2) * (period / 2)
            const timing = { duration: period, delay, iterations: Infinity, easing: EASE.breathe }
            const fadeIn = [{ opacity: 0, offset: 0 }, { opacity: 1, offset: 0.1 }, { opacity: 1, offset: 0.84 }, { opacity: 0, offset: 1 }]
            // 획의 길이와 자리는 길 전체를 100으로 본 값(hub.css). 늘어난 그림에서 100이 길 전체가 되게 dashK를 곱한다: 곱하지 않으면 무늬가
            // 길의 63%마다 되풀이되어 조각이 길 가운데에서 하나 더 나타났고, 가운데에 닿기 전에 사라졌다(닿는 순간의 밝아짐과 어긋났다)
            const kh = dashK(head)
            loops.push(head.animate(fadeIn.map((f, i) => ({ ...f, strokeDasharray: `${0.4 * kh} ${99.6 * kh}`, strokeDashoffset: [0.4, -9.6, -84, -99.6][i] * kh })), timing))
            const tail = tails[k]
            const kt = dashK(tail)
            if (tail) loops.push(tail.animate(fadeIn.map((f, i) => ({ ...f, opacity: f.opacity * 0.6, strokeDasharray: `${9 * kt} ${91 * kt}`, strokeDashoffset: [9, -1, -75, -91][i] * kt })), timing))
            // 닿는 순간: 모이기는 그 길의 가운데 테, 퍼지기는 그 길의 끝점이 잠깐 강조색. 떠나는 쪽 끝점(모이기)은 출발할 때
            // 한 길의 조각 둘은 반 주기 엇갈려 있으니, 반 주기마다 한 번 밝히는 움직임 하나로 둘 다 받는다(같은 요소에 둘을 걸면 뒤의 것이 덮는다)
            if (k % 2) return
            const flashAt = { duration: period / 2, delay, iterations: Infinity, easing: 'linear' }
            const hit = hits[way]
            const dot = dots[way]
            // 조각은 주기의 0.88쯤에 닿는다(가속·감속 곡선). 반 주기 고리로 옮기면 0.76쯤
            if (!out && hit) loops.push(hit.animate([{ opacity: 0, offset: 0 }, { opacity: 0, offset: 0.68 }, { opacity: 0.9, offset: 0.76 }, { opacity: 0, offset: 0.92 }, { opacity: 0, offset: 1 }], flashAt))
            if (dot) {
              const lit = { background: accent, scale: '1.35' }
              const rest = { background: getComputedStyle(dot).backgroundColor, scale: '1' }
              const frames = out
                ? [{ ...rest, offset: 0 }, { ...rest, offset: 0.68 }, { ...lit, offset: 0.76 }, { ...rest, offset: 0.92 }, { ...rest, offset: 1 }]
                : [{ ...lit, offset: 0 }, { ...rest, offset: 0.12 }, { ...rest, offset: 1 }]
              loops.push(dot.animate(frames, flashAt))
            }
          })
          stops.push(() => loops.forEach((a) => a.cancel()))
          break
        }
        case 'network': {
          // 가운데가 먼저 서고, 선이 가운데에서 하나씩 뻗어 나가 닿는 상자가 나타난다. 다 이어지면 데이터 조각이 상자마다 선을 따라
          // 가운데로 모여든다(차분하게 한 번, 생동감 두 번). 되풀이하지 않는다
          const map = one('.bk-nw-map')
          const hub = one('.bk-nw-hub')
          const nodes = $('.bk-nw-node')
          if (!map || !hub || !nodes.length) break
          const root = map.parentElement as HTMLElement
          const tree = getComputedStyle(root).getPropertyValue('--nw-tree').trim() === '1'
          const line = parseFloat(getComputedStyle(root).getPropertyValue('--nw-line')) || 3
          const band = (parseFloat(getComputedStyle(root).getPropertyValue('--nw-r')) || 18) + line + 4
          // 조각이 지나갈 길은 움직이기 전에 잰다(움직이기 시작하면 상자가 작아진 채로 잡힌다)
          const H = spot(hub, map)
          const paths = nodes.map((node) => {
            const wire = node.querySelector('.bk-nw-wire')
            if (!wire) return [] as [number, number][]
            const w = spot(wire, map)
            const half = line / 2
            if (tree) return [[w.r, w.b - half], [w.l + half, w.b - half], [w.l + half, H.b]] as [number, number][]
            const left = node.classList.contains('is-l')
            const edge = left ? w.l : w.r
            const trunk = left ? w.r - half : w.l + half
            const into = left ? H.l : H.r
            if (node.classList.contains('is-mid')) return [[edge, w.t + half], [into, w.t + half]] as [number, number][]
            const up = node.classList.contains('is-up')
            const y0 = up ? w.t + half : w.b - half
            const y1 = up ? w.b - half : w.t + half
            return [[edge, y0], [trunk, y0], [trunk, y1], [into, y1]] as [number, number][]
          })
          run(anims, hub, [{ opacity: 0, scale: '0.92' }], s(0), L.pop)
          rise(hub.querySelector('.bk-nw-c'), 40, L.y * 0.4)
          if (!tree) {
            draw(hub, 200, 240, 'right center', '::before')
            draw(hub, 200, 240, 'left center', '::after')
          }
          // 양옆에 둘 때는 왼쪽과 오른쪽을 번갈아(위에서부터), 쌓을 때는 위에서부터
          const order = tree ? nodes : [...nodes].sort((a, b) => spot(a, map).t - spot(b, map).t || (a.classList.contains('is-l') ? -1 : 1))
          const reach = tree ? 360 : 420
          const step = stagger(order.length + 1, levelName === 'lively' ? 170 : 140, 700)
          let last = 0
          order.forEach((node, k) => {
            const at = (tree ? 260 : 400) + k * step
            const wire = node.querySelector('.bk-nw-wire') as HTMLElement | null
            if (tree) {
              const prev = node.previousElementSibling?.querySelector('.bk-nw-run')
              if (prev) draw(prev, at - 120, 140, 'center top')
              if (wire) bend(wire, at, reach, 'top', 'left', band)
            } else if (wire) {
              const left = node.classList.contains('is-l')
              // 가운데 쪽 끝에서 긋는다: 위의 상자는 줄기 아래 끝(가운데 높이)에서, 아래 상자는 줄기 위 끝에서
              bend(wire, at, reach, node.classList.contains('is-mid') ? 'none' : node.classList.contains('is-up') ? 'bottom' : 'top', left ? 'right' : 'left', band)
            }
            // 선이 닿을 때 상자가 받아 나타난다
            const got = at + reach - 90
            run(anims, node, [{ opacity: 0, scale: String(L.scale) }], s(got), L.pop)
            rise(node.querySelector('.bk-nw-t'), got + 30, L.y * 0.3)
            rise(node.querySelector('.bk-nw-m'), got + 80, L.y * 0.3)
            last = Math.max(last, got)
          })
          // 데이터 조각: 상자마다 하나씩 조금씩 엇갈려 가운데로. 마지막 조각이 닿을 때 가운데가 살짝 부풀었다 돌아온다
          const rounds = levelName === 'lively' ? 2 : 1
          const travel = 600
          let arrive = 0
          for (let r = 0; r < rounds; r++) {
            nodes.forEach((_, k) => {
              const at = last + 260 + r * 480 + k * 70
              packet(map, paths[k], at, travel)
              arrive = Math.max(arrive, at + travel)
            })
          }
          // transform으로 (흐름의 끝 단계와 같은 까닭)
          run(anims, hub, [{ transform: 'scale(1)' }, { transform: 'scale(1.025)' }, { transform: 'scale(1)' }], s(arrive - 120), { easing: 'ease-in-out', duration: d(420) })
          // 생동감: 그 뒤로는 상자마다 조각이 쉬지 않고 가운데로 모여든다(상자마다 엇갈려)
          const hubText = hub.querySelector('.bk-nw-c')
          const ink = hubText ? getComputedStyle(hubText).color : ''
          const accent = getComputedStyle(scope).getPropertyValue('--accent').trim()
          nodes.forEach((_, k) =>
            stream(map, paths[k], arrive + 200, d(1600), (k * 1600) / Math.max(2, nodes.length), k === 0 && hubText ? { el: hubText, off: { color: ink }, on: { color: accent } } : undefined),
          )
          break
        }
        case 'split': {
          // 전체가 먼저: 막대가 틈 없는 한 덩어리(강조색)로 왼쪽에서 펼쳐지는 동안 합계가 올라간다. 그다음 조각 사이가 벌어지며
          // 조각마다 제 색으로 갈리고, 이름표가 조각 차례로 올라오며 값이 맞춰진다
          rise(one('.bk-sg-top'), 0, L.y * 0.4)
          const bar = one('.bk-sg-bar')
          const segs = $('.bk-sg-seg')
          const open = 760
          // 처음 색은 이 칸의 강조색 그대로(진한 면이면 면 위의 강조색)
          const accent = segs.length ? getComputedStyle(segs[0]).getPropertyValue('--accent').trim() : ''
          if (bar) {
            run(anims, bar, [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }], s(60), { easing: EASE.sweep, duration: d(720) })
            run(anims, bar, [{ columnGap: '0px' }], s(open), { easing: EASE.carry, duration: d(460) })
            // 붙어 있는 동안 조각 사이의 이음매(반 픽셀의 틈)가 가는 선으로 비쳐 한 덩어리로 보이지 않았다. 막대 바탕을 같은 색으로 깔아 두고 갈라질 때 걷는다
            if (accent) run(anims, bar, [{ backgroundColor: accent }], s(open), { easing: OUT, duration: d(180) })
          }
          segs.forEach((seg, i) => {
            if (accent) run(anims, seg, [{ backgroundColor: accent }], s(open + 40 + i * 60), { easing: OUT, duration: d(520) })
            run(anims, seg, [{ borderRadius: '0px' }], s(open), { easing: OUT, duration: d(460) })
          })
          count(one('.bk-sg-total'), 120)
          items('.bk-sg-key', open + 220, (el, at) => {
            rise(el, at, L.y * 0.5)
            countIn(el.querySelector('.bk-sg-v'), at + 40)
          })
          break
        }
        case 'merge': {
          // 값마다 줄이 차례로 나오며 조각이 제 자리(계단)에 그어지고, 합계 선이 그어진다. 그다음 조각이 하나씩 합계 막대의 제 자리로
          // 내려가 끼워지고, 끼워질 때마다 합계가 그만큼 오른다. 끼워지는 조각은 줄의 조각과 같은 자리, 같은 크기에서 떠나 막대의
          // 크기로 닿는다(움직이기 전에 두 자리를 재어 transform으로 되돌려 놓았다가 푼다)
          const root = one('.bk-mg')
          const sum = one('.bk-mg-sum')
          const bar = one('.bk-mg-bar')
          if (!root || !sum || !bar) break
          const parts = $('.bk-mg-part')
          const pieces = parts.map((p) => p.querySelector<HTMLElement>('.bk-mg-pc')).filter((p): p is HTMLElement => !!p)
          const segs = $('.bk-mg-seg')
          const moves = segs.map((seg, j) => {
            const a = pieces[j] ? spot(pieces[j], root) : null
            const b = spot(seg, root)
            const w = b.r - b.l || 1
            const h = b.b - b.t || 1
            return a ? `translate(${a.l - b.l}px, ${a.t - b.t}px) scale(${(a.r - a.l) / w}, ${(a.b - a.t) / h})` : ''
          })
          const lively = levelName === 'lively'
          const step = stagger(parts.length + 1, lively ? 130 : 110, 560)
          parts.forEach((part, i) => {
            const at = i * step
            rise(part.querySelector('.bk-mg-name'), at, L.y * 0.4)
            rise(part.querySelector('.bk-mg-num'), at + 40, L.y * 0.4)
            draw(part.querySelector('.bk-mg-pc'), at + 120, 420, 'left center')
          })
          const line = parts.length * step + 120
          draw(sum, line, 480, 'left center', '::before')
          rise(sum.querySelector('.bk-mg-head'), line + 120, L.y * 0.4)
          fade(sum.querySelector('.bk-mg-total'), line + 160, 260)
          // 조각이 하나씩 내려간다: 위의 조각부터
          const first = line + 420
          const gap = lively ? 170 : 150
          const travel = 560
          const values = segs.map((seg) => parseFloat(seg.style.getPropertyValue('--p')) || 0)
          let upto = 0
          const marks = segs.map((seg, j) => {
            const at = first + j * gap
            if (moves[j]) {
              run(
                anims,
                seg,
                [
                  { transform: moves[j], transformOrigin: '0 0', opacity: 0, offset: 0 },
                  { opacity: 1, offset: 0.04 },
                  { transform: 'none', transformOrigin: '0 0', opacity: 1, offset: 1 },
                ],
                s(at),
                { easing: CARRY, duration: d(travel) },
              )
            } else fade(seg, at, 240)
            upto += values[j]
            return { at: at + travel * 0.8, upto: Math.min(1, upto) }
          })
          // 끼워질 빈 자리: 합계 선이 그어질 때 흐리게 깔렸다가 마지막 조각이 닿으면 걷힌다
          const end = first + Math.max(0, segs.length - 1) * gap + travel
          const hold = end - line
          run(anims, bar, [{ opacity: 0 }, { opacity: 1, offset: Math.min(0.3, 240 / hold) }, { opacity: 1, offset: 0.92 }, { opacity: 0 }], s(line + 160), { easing: 'linear', duration: d(hold) }, '::before')
          const total = sum.querySelector('.bk-mg-total')
          if (marks.length) tally(total, marks)
          else count(total, line + 160)
          break
        }
        case 'calc': {
          // 셈을 적어 내려가듯: 값이 하나씩 놓이고, 다음 값이 오기 바로 전에 그 앞 틈에 셈 기호가 맺힌다(생동감은 기호가 4분의 1 바퀴
          // 돌며 튀어나온다. ×와 +는 돌아도 같은 꼴이라 도는 것이 셈의 박자로 읽힌다). 끝에 = 가 왼쪽에서 그어지고(쌓은 꼴은 합계 선이
          // 먼저) 결과가 올라오며 굴러 맞춰진다. 굴리는 것은 결과뿐: 값마다 굴리면 답보다 셈에 눈이 간다
          const lively = levelName === 'lively'
          const terms = $('.bk-ca-term:not(.bk-ca-result)')
          const hop = Math.min(lively ? 300 : 240, 1000 / Math.max(1, terms.length))
          const sign = (op: Element | null, at: number) => {
            if (!op) return
            if (lively) run(anims, op, [{ opacity: 0, scale: '0.3', rotate: '-90deg' }], s(at), SPRINGS.settle)
            else run(anims, op, [{ opacity: 0, scale: '0.6' }], s(at), L.pop)
          }
          let at = 80
          terms.forEach((term, i) => {
            if (i > 0) sign(term.querySelector(':scope > .bk-ca-op'), at - 90)
            rise(term.querySelector('.bk-ca-vbox'), at, L.y * 0.5)
            fade(term.querySelector('.bk-ca-name'), at + 120, 420)
            at += hop
          })
          const res = one('.bk-ca-result')
          if (res) {
            // 합계 선(쌓은 꼴에만 있는 가짜 요소)이 왼쪽에서 그어지고, = 의 두 획이 따라 그어진다
            draw(res, at - 40, lively ? 520 : 420, 'left center', '::before')
            wipe(res.querySelector(':scope > .bk-ca-op'), at, 'left', lively ? 420 : 340)
            rise(res.querySelector('.bk-ca-vbox'), at + 180, L.y * 0.6)
            count(res.querySelector('.bk-ca-v'), at + 200)
            fade(res.querySelector('.bk-ca-name'), at + 420, 500)
            at += 640
          }
          fade(one('.bk-ca-n'), at, 500)
          break
        }
        case 'tiles': {
          // 흩어져 있던 칸이 단마다 왼쪽부터 날아와 한 판으로 맞춰지고(모두 옅은 칸으로), 다 맞춰질 즈음 채운 칸이 차례로(왼쪽 단부터,
          // 단마다 아래에서 위로) 물든다. 숫자는 칸이 물드는 만큼 오른다
          fade(one('.bk-tl-l'), 60, 500)
          const root = one('.bk-tl')
          const grid = one('.bk-tl-grid')
          const sqs = $('.bk-tl-sq')
          if (!root || !grid || !sqs.length) {
            rise(one('.bk-tl-v'), 120, L.y * 0.4)
            count(one('.bk-tl-v'), 160)
            fade(one('.bk-tl-of'), 200, 500)
            fade(one('.bk-tl-n'), 260, 500)
            break
          }
          const lively = levelName === 'lively'
          const size = sqs[0].offsetWidth || 24
          const rows = Math.max(1, Math.round(parseFloat(getComputedStyle(grid).getPropertyValue('--rr')) || 1))
          const cols = Math.ceil(sqs.length / rows)
          const off = getComputedStyle(root).getPropertyValue('--tl-off').trim()
          // 칸마다 늘 같은 자리에서 날아오게(다시 움직여도 같은 모습) 번호로 만든 흩어짐
          const scatter = (i: number, k: number) => {
            const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453
            return x - Math.floor(x) - 0.5
          }
          const spread = size * (lively ? 6 : 3.5)
          const turn = lively ? 120 : 60
          const wave = Math.min(lively ? 38 : 32, 480 / cols)
          const fly = lively ? SPRINGS.settle : SPRINGS.glide
          sqs.forEach((sq, i) => {
            const at = 140 + Math.floor(i / rows) * wave + (i % rows) * 8
            run(
              anims,
              sq,
              [
                { translate: `${scatter(i, 1) * 2 * spread}px ${scatter(i, 2) * 2 * spread}px`, rotate: `${scatter(i, 3) * turn}deg`, scale: '0.4', opacity: 0, offset: 0 },
                { opacity: 1, offset: 0.3 },
                { translate: '0 0', rotate: '0deg', scale: '1', opacity: 1, offset: 1 },
              ],
              s(at),
              fly,
            )
          })
          // 채운 칸이 물드는 차례: 판이 거의 다 맞춰진 뒤(옅은 판이 한 번 보이게) 0.6초 안에
          const on = sqs.filter((sq) => sq.classList.contains('is-on'))
          const paint = 140 + (cols - 1) * wave + 420
          // 숫자는 칸이 물들기 시작할 때 나타나 바로 오르고, 전체와 덧붙임이 뒤따른다. 처음부터 두면 옅은 판이 맞춰지는 동안(생동감 1.2초
          // 남짓) '0%'가 답처럼 서 있었다(필름)
          const shown = Math.max(120, paint - 160)
          rise(one('.bk-tl-v'), shown, L.y * 0.4)
          fade(one('.bk-tl-of'), shown + 80, 500)
          fade(one('.bk-tl-n'), shown + 140, 500)
          const each = Math.min(14, 600 / Math.max(1, on.length))
          if (off) on.forEach((sq, i) => run(anims, sq, [{ backgroundColor: off }], s(paint + i * each), { easing: OUT, duration: d(260) }))
          // 숫자는 단마다 그 단까지 물든 몫만큼
          const marks: { at: number; upto: number }[] = []
          for (let k = rows; k < on.length + rows; k += rows) {
            const upto = Math.min(k, on.length)
            marks.push({ at: paint + (upto - 1) * each, upto: upto / on.length })
          }
          if (marks.length) tally(one('.bk-tl-v'), marks)
          else count(one('.bk-tl-v'), 160)
          break
        }
        case 'heading':
          // 소제목이 올라오고 덧붙임이 뒤따라 흐려지듯 (윗선은 없앴다: docs/VISUAL-RULES.md 2)
          rise(one('.bk-hd-t'), 0, L.y * 0.5)
          fade(one('.bk-hd-n'), 360, 500)
          break
        case 'stat':
          // 이름이 먼저 흐려지듯 나오고 숫자가 올라오며 굴러 맞춰진다. 아래 선은 숫자가 거의 맞춰질 때 왼쪽부터 그어져 줄을 닫는다
          fade(one('.bk-sl-l'), 60, 500)
          rise(one('.bk-sl-v'), 120, L.y * 0.4)
          count(one('.bk-sl-v'), 140)
          fade(one('.bk-sl-c'), 520, 400)
          fade(one('.bk-sl-n'), 600, 500)
          draw(one('.bk-sl-box'), 300, levelName === 'lively' ? 800 : 650, 'left center', '::after')
          break
        case 'meter': {
          // 막대 자리와 눈금이 먼저 놓이고, 채운 몫이 왼쪽부터 자라는 동안 숫자가 같이 올라간다. 눈금의 이름은 막대가 거의 닿을 때
          fade(one('.bk-mt-l'), 60, 500)
          fade(one('.bk-mt-of'), 120, 500)
          const tick = one('.bk-mt-tick')
          if (tick) run(anims, tick, [{ opacity: 0, scale: '1 0' }], s(120), L.pop)
          grow(one('.bk-mt-fill'), 180)
          countIn(one('.bk-mt-v'), 180)
          fade(one('.bk-mt-tg'), 560, 500)
          break
        }
        case 'range': {
          // 눈금이 먼저 깔리고, 범위 띠가 제 가운데에서 양쪽으로 열리며 양 끝 값이 따라 나온다. 표시 눈금은 띠가 다 열릴 즈음 띠를 가로질러 선다
          fade(one('.bk-rn-l'), 60, 500)
          fade(one('.bk-rn-fig'), 100, 300)
          const band = one('.bk-rn-band')
          if (band) run(anims, band, [{ scale: '0 1', transformOrigin: 'center' }, { scale: '1 1', transformOrigin: 'center' }], s(160), L.grow)
          rise(one('.bk-rn-ends'), 220, L.y * 0.4)
          const mark = one('.bk-rn-mark')
          if (mark) run(anims, mark, [{ opacity: 0, scale: '1 0' }], s(520), { easing: OUT, duration: d(380) })
          fade(one('.bk-rn-mk'), 640, 400)
          fade(one('.bk-rn-n'), 700, 500)
          break
        }
        case 'status':
          // 상태 표시가 먼저 맺히고(상태가 이 컴포넌트의 답) 이름이 뒤따른다. 할 일은 그 아래에서 올라온다
          for (const [k, path] of $('.bk-ss-mark path').entries())
            run(anims, path, [{ strokeDasharray: '0 1' }, { strokeDasharray: '1 0' }], s(80 + k * 120), { easing: OUT, duration: d(380) })
          fade(one('.bk-ss-name'), 160, 400)
          rise(one('.bk-ss-w'), 220, L.y * 0.4)
          fade(one('.bk-ss-m'), 420, 500)
          break
        case 'steps': {
          // 기준선이 왼쪽부터 그어지고, 선이 닿는 차례로 눈금이 아래위로 선다. 지난 구간의 띠가 뒤따라 지금 단계까지 차오르면 그 눈금이
          // 높이 솟고 번호가 굴러 맞춰진다. 단계 이름은 제 눈금이 선 뒤에
          const list = one('.bk-stp-list')
          // 생동감에서 계속 흐를 조각의 길(지난 구간의 띠: 첫 눈금에서 지금 단계 눈금까지)은 움직임을 걸기 전에 잰다(조건별 흐름과 같은 까닭)
          const nowTick = one('.bk-stp-it.is-now > .bk-stp-dot')
          const firstTick = one('.bk-stp-dot')
          let band: [number, number][] = []
          if (list && nowTick && firstTick && nowTick !== firstTick) {
            const a = spot(firstTick, list)
            const b = spot(nowTick, list)
            const y = (b.t + b.b) / 2
            band = [[(a.l + a.r) / 2, y], [(b.l + b.r) / 2, y]]
          }
          fade(one('.bk-stp-l'), 0, 500)
          const span = levelName === 'lively' ? 900 : 760
          draw(list, 60, span, 'left center', '::before')
          const dots = $('.bk-stp-dot')
          const last = Math.max(dots.length - 1, 1)
          const now = $('.bk-stp-it').findIndex((it) => it.classList.contains('is-now'))
          dots.forEach((dot, i) => {
            const at = 60 + (i / last) * span * 0.75
            if (i === now) return
            run(anims, dot, [{ opacity: 0, scale: '1 0' }], s(at), { easing: OUT, duration: d(320) })
          })
          const reach = now < 0 ? 0 : (now / last) * span
          if (now > 0) draw(list, 180, Math.max(reach, 300), 'left center', '::after')
          // 지금 단계의 눈금은 띠가 닿을 때 기준선에서 위아래로 솟는다(크기 키우기가 아니라 높이만: 눈금이 뭉툭해지지 않게)
          if (now >= 0) run(anims, dots[now], [{ opacity: 0, scale: '1 0.1' }], s(180 + Math.max(reach, 300) * 0.9), { easing: OUT, duration: d(420) })
          // 단계 번호는 굴리지 않는다: 세는 수가 아니라 차례라서 굴리면 다른 단계(4 / 6, 1 / 6)를 거쳐 가는 것처럼 보였다
          rise(one('.bk-stp-now'), 120, L.y * 0.4)
          $('.bk-stp-t').forEach((t, i) => fade(t, 160 + (i / last) * span * 0.75, 400))
          // 생동감: 지나온 길을 따라 조각이 쉬지 않고 지금 단계로 흘러들고, 닿을 때 그 눈금이 잠깐 솟는다('여기까지 왔다')
          if (band.length && nowTick) {
            stream(list, band, 180 + Math.max(reach, 300) + 900, d(2400), 0, { el: nowTick, off: { scale: '1 1' }, on: { scale: '1 1.3' } })
          }
          break
        }
        case 'date':
          // 일의 숫자가 먼저 올라오고(이 컴포넌트의 답) 달이 옆에 흐려지듯, 그날 하는 일이 뒤따른다.
          // 숫자는 굴리지 않는다: 날짜는 세는 수가 아니라서 0부터 굴리면 다른 날을 거쳐 가는 것처럼 보인다
          rise(one('.bk-dt-day') ?? one('.bk-dt-txt'), 60, L.y * 0.5)
          fade(one('.bk-dt-mo'), 160, 500)
          rise(one('.bk-dt-w'), 220, L.y * 0.4)
          fade(one('.bk-dt-n'), 400, 500)
          break
        case 'note':
          // 주석은 본문보다 물러나 있는 글이라 움직임도 조용히: 올라오지 않고 흐려지듯만, 위의 것이 다 나온 뒤에
          fade(one('.bk-nt'), 120, 700)
          break
        default:
          rise(cell, 0)
      }
    }

    /**
     * 부품 하나: 고른 움직임으로. '알아서'면 레이아웃 부품은 그 레이아웃의 연출, 아니면 부품마다 짜 둔 움직임.
     * 고른 빠르기(data-speed)는 부품 안의 걸리는 시간과 차례 사이를 함께 바꾸고, 들어오는 쪽(data-from)은 올라오기, 밀려오기, 펼치기에 쓴다
     */
    function block(cell: HTMLElement, at: number) {
      // 장면을 고른 동안은 장면이 장 전체를 짠다: 컴포넌트마다 고른 움직임, 빠르기, 들어오는 쪽 대신 짜 둔 움직임(알아서)으로.
      // 값은 칸에 그대로 남아서 장면을 끄면 돌아온다
      const effect = sceneOn ? 'auto' : (/\bfx-([a-z]+)/.exec(cell.className) || [])[1] || 'auto'
      const type = cell.getAttribute('data-type') || ''
      const saved = { scope, t0, pace }
      scope = cell
      t0 = at
      pace = sceneOn ? 1 : cell.dataset.speed === 'fast' ? 0.6 : cell.dataset.speed === 'slow' ? 1.7 : 1
      const from = sceneOn ? undefined : cell.dataset.from
      /** 들어오는 쪽에서 n만큼 떨어진 자리 */
      const off = (n: number) => (from === 'left' ? `${-n}px 0` : from === 'right' ? `${n}px 0` : from === 'above' ? `0 ${-n}px` : `0 ${n}px`)
      if (effect === 'rise') run(anims, cell, [{ opacity: 0, translate: off(L.y) }], s(0), L.move)
      else if (effect === 'fade') fade(cell, 0, 800)
      else if (effect === 'wipe') wipe(cell, 0, from === 'right' ? 'right' : from === 'below' ? 'bottom' : from === 'above' ? 'top' : 'left', 900)
      else if (effect === 'slide') run(anims, cell, [{ opacity: 0, translate: off(L.y * 2.6) }], s(0), L.move)
      // 튀어나오기, 다가오기, 세우기는 값(id)은 그대로 두고 느낌만 덜어냈다: 0.6배에서 통통 튀며 커지고, 1.14배에서 줄어들고,
      // 72도 누워 있다가 서던 것이 흔한 템플릿 효과처럼 보였다. 이제 크기는 몇 %만, 기울기는 28도만 바뀌고 넘치지 않는다
      else if (effect === 'pop') run(anims, cell, [{ opacity: 0, scale: '0.9' }], s(0), L.pop)
      else if (effect === 'zoom') run(anims, cell, [{ opacity: 0, scale: '1.05' }], s(0), { easing: OUT, duration: d(800) })
      else if (effect === 'flip')
        // 아래 가장자리를 축으로 누워 있다가 선다. 원근은 칸마다 따로 (장 전체가 휘어 보이지 않게)
        run(
          anims,
          cell,
          [
            { opacity: 0, transform: 'perspective(1800px) rotateX(-28deg)', transformOrigin: '50% 100%' },
            { opacity: 1, transform: 'perspective(1800px) rotateX(0deg)', transformOrigin: '50% 100%' },
          ],
          s(0),
          L.grow,
        )
      else if (effect === 'letters') {
        // 면과 선(옅은 면, 진한 면, 줄의 선)은 짧게 흐리게 들이고, 글은 읽는 차례로 한 글자씩
        fade(cell, 0, 320)
        letters(cell, 60)
      } else if (effect === 'blur')
        // 흐림은 8px까지만: 20px이던 때는 칸이 뿌연 덩어리로 떠 있다가 나타나 흔한 AI 데모처럼 보였다
        run(anims, cell, [{ opacity: 0, filter: 'blur(8px)', scale: '1.015' }, { opacity: 1, filter: 'blur(0px)', scale: '1' }], s(0), { easing: OUT, duration: d(850) })
      else if (effect === 'auto') {
        // 칸 안의 따로 움직이지 않는 줄과 빈 자리도 이 부품의 차례에 (장 머리의 본문 상자와 같은 까닭)
        fade(cell.querySelector(':scope > .bk-in'), 0, 360)
        if (cell.classList.contains('bk-layout')) choreo(type, (/\bva-([a-zA-Z]+)/.exec(cell.className) || [])[1] || 'base')
        else nativeAuto(cell, type)
      }
      scope = saved.scope
      t0 = saved.t0
      pace = saved.pace
    }

    // ---------- 장면 ----------
    // 장면은 레이아웃의 연출표를 버리지 않고 그 위에서 한 컷을 짠다. 연출표가 건 움직임(anims)을 다 건 뒤
    // 1) 때를 다시 짜고(초점이 먼저, 근거는 그다음: 지연만 옮긴다), 2) 그 위에 층(카메라, 가림막, 결 선, 장막)을 얹는다.
    // 층은 움직이는 동안만 붙였다 떼고, 카메라는 시작 모습만 정해(fill: backwards) 끝나면 원래 자리다. 그래서 끝 모습이 편집 화면과 같다.
    // 움직임 하나하나는 연출표의 것이라 장면이 레이아웃마다 새로 짜지 않아도 되고, 레이아웃을 고치면 장면도 같이 따라간다

    /** 장면이 얹은 움직임에 붙이는 이름. 움직임 편집의 시간표가 '장면' 줄로 따로 그린다 */
    const SCENE = 'mo-scene'
    const CAMERA = EASE.camera

    /**
     * 장면 하나를 준비한다. 움직임을 걸기 전에 자리를 잰다(연출표가 움직임을 걸면 시작 모습으로 옮겨진 자리가 잡힌다).
     * 돌려주는 함수는 연출표를 건 뒤에 불러 때를 다시 짜고 층을 얹는다. 이 장에서 할 것이 없으면 null
     */
    function scene(name: string): (() => void) | null {
      const host = slide as HTMLElement
      const W = host.offsetWidth
      const H = host.offsetHeight
      const base = host.getBoundingClientRect()
      const k = W ? base.width / W : 0
      if (!k) return null
      type Box = { l: number; t: number; r: number; b: number }
      const toBox = (r: DOMRect): Box => ({ l: (r.left - base.left) / k, t: (r.top - base.top) / k, r: (r.right - base.left) / k, b: (r.bottom - base.top) / k })
      const join = (list: Box[]): Box | null =>
        list.length
          ? { l: Math.min(...list.map((b) => b.l)), t: Math.min(...list.map((b) => b.t)), r: Math.max(...list.map((b) => b.r)), b: Math.max(...list.map((b) => b.b)) }
          : null
      const boxOf = (el: Element | null): Box | null => {
        if (!el) return null
        const b = toBox(el.getBoundingClientRect())
        return b.r - b.l > 0 && b.b - b.t > 0 ? b : null
      }
      /** 글이 실제로 그려진 자리: 줄마다의 글자 상자를 합친다(칸은 글보다 넓을 때가 있다) */
      const textBox = (el: Element | null): Box | null => {
        if (!el) return null
        const range = document.createRange()
        range.selectNodeContents(el)
        return join(Array.prototype.slice.call(range.getClientRects()).filter((r: DOMRect) => r.width > 1 && r.height > 1).map(toBox))
      }
      /** 안의 것을 모두 덮는 자리 (점처럼 크기가 없는 상자도 안의 점과 숫자로) */
      const deepBox = (el: Element | null): Box | null => {
        if (!el) return null
        return boxOf(el) ?? join((Array.prototype.slice.call(el.querySelectorAll('*')) as Element[]).map(boxOf).filter((b): b is Box => !!b))
      }
      const q = (sel: string) => slide!.querySelector<HTMLElement>(sel)
      const qa = (sel: string) => Array.prototype.slice.call(slide!.querySelectorAll(sel)) as HTMLElement[]

      // 장 바로 아래의 것들. 장 가장자리에 닿는 면(표지의 옆 면, 색 면)은 무대라서 카메라가 움직이지 않는다
      // (작게 당기면 가장자리가 비어 보인다). 아래 띠도 제자리 (장을 바꿀 때와 같은 까닭)
      const top = Array.prototype.slice.call(host.children) as HTMLElement[]
      const touches = (el: HTMLElement) => el.offsetLeft <= 1 || el.offsetTop <= 1 || el.offsetLeft + el.offsetWidth >= W - 1 || el.offsetTop + el.offsetHeight >= H - 1
      const foot = top.filter((el) => el.classList.contains('s-foot'))
      const stage = top.filter((el) => !foot.includes(el) && touches(el))
      // 가장자리에 닿는 덩어리(표지의 왼쪽 판 같은) 안의 글은 따로 움직인다. 자리는 움직이기 전에 잰다(카메라의 중심을 맞춘다)
      const moving: { el: HTMLElement; at: Box }[] = []
      for (const el of top) {
        if (foot.includes(el)) continue
        const inner = stage.includes(el) ? (Array.prototype.slice.call(el.children) as HTMLElement[]) : [el]
        for (const x of inner) {
          const b = boxOf(x)
          if (b && b.l > 1 && b.t > 1 && b.r < W - 1 && b.b < H - 1) moving.push({ el: x, at: b })
        }
      }
      const variant = slideVariant

      // 부품 장: 장이 나올 때 나오는 칸만 (누르면 나오는 칸은 그때 따로 움직인다), 나오는 차례대로
      const cells = layout === 'compose' ? $('.bk-area > .bk').filter((c) => !c.classList.contains('mo-hold')).sort((a, b) => Number(a.dataset.seq || 0) - Number(b.dataset.seq || 0)) : []
      const cellOf = (types: string[]) => cells.find((c) => types.includes(c.dataset.type || '')) || null

      // 이 장면이 이 장에서 할 것
      /** 한 글자씩 내려앉을 글(결론, 제목) */
      let text: HTMLElement | null = null
      /** 먼저 나올 것 (결론, 가장 중요한 숫자). 없으면 text */
      let focal: HTMLElement | null = null
      let underline = false
      let cam: { kind: 'in' | 'back' | 'drift'; dur: number } | null = null
      let spotlight = false
      /** 읽는 차례를 잇는 선을 지나갈 항목들 */
      let guide: HTMLElement[] = []
      /** 근거 사이를 이만큼 벌린다 (선이 따라가며 읽을 수 있게) */
      let spread = 1
      /** 시간의 흐름: 지금 단계(강조한 점)에서 머무는 곳 */
      let now: HTMLElement | null = null
      /** 비교 드러내기: 장막을 칠 곳과 가르는 선 */
      let halves: { region: Box; split: number; right?: HTMLElement } | null = null
      let picture: HTMLElement | null = null
      /** 다시 짜지 않고 연출표대로 두는 것 (단락 번호처럼 장의 바탕을 이루는 것) */
      let keep = ''

      switch (name) {
        case 'opening':
          text = q('.cv-title, .sc-title')
          underline = true
          cam = { kind: 'back', dur: 3800 }
          keep = '.sc-num, .cv-logo'
          break
        case 'answer': {
          if (layout === 'compose') {
            focal = cellOf(['message', 'callout'])
            text = focal && focal.querySelector<HTMLElement>('.bk-msg-t, .bk-call-t')
          } else text = q(layout === 'statement' ? '.st-title' : layout === 'case' ? '.cs-title' : ':scope > .s-head .s-title')
          underline = true
          cam = { kind: 'in', dur: 3200 }
          break
        }
        case 'numbers': {
          const keys: Record<string, string> = {
            kpi: '.kp-item',
            scorecard: '.sk-row.it.is-hl, .sk-row.it',
            bars: '.br-row.is-hl, .br-row',
            share: '.sh-item.is-hl, .sh-item',
            funnel: '.fn-row.is-hl',
            bridge: '.wf-col.wf-total',
            versus: '.vs-col.is-hl, .vs-row.is-hl',
            pricing: '.pr-plan.is-hl',
          }
          focal = layout === 'compose' ? cellOf(['number', 'stat', 'delta', 'goal', 'ring', 'attain', 'meter', 'ratio', 'kpi', 'scorecard', 'bars', 'versus', 'share', 'funnel', 'bridge']) : keys[layout] ? q(keys[layout]) : null
          // 깔때기는 강조가 없으면 마지막 단계(남은 것)가 답, 증감 요인은 마지막 합계
          if (!focal && layout === 'funnel') focal = qa('.fn-row').pop() || null
          if (layout === 'bridge') focal = qa('.wf-col.wf-total').pop() || null
          spotlight = !!focal && cells.length !== 1
          cam = { kind: 'back', dur: 3200 }
          break
        }
        case 'flow': {
          spread = 1.45
          // 단계 흐름(선으로 잇기)과 목차는 제 선이 이미 읽는 차례로 그어진다. 그 위에 선을 하나 더 긋지 않는다
          if (layout === 'points') guide = qa('.pt-item')
          else if (layout === 'process' && variant === 'cards') guide = qa('.pc-step')
          else if (layout === 'compose') guide = cells
          cam = { kind: 'drift', dur: 0 }
          break
        }
        case 'compare': {
          if (layout === 'compose') {
            const two = cells.length === 2 ? cells.map(boxOf) : []
            if (two.length === 2 && two[0] && two[1] && Math.abs(two[0].t - two[1].t) < 4 && two[0].r <= two[1].l + 1) {
              halves = { region: join([two[0], two[1]])!, split: (two[0].r + two[1].l) / 2, right: cells[1] }
            } else {
              const cell = cellOf(['compare'])
              const r = boxOf(cell && cell.querySelector('.cp'))
              if (r) halves = { region: r, split: (r.l + r.r) / 2 }
            }
          } else {
            const r = boxOf(q('.cp'))
            if (r) halves = { region: r, split: (r.l + r.r) / 2 }
          }
          cam = { kind: 'drift', dur: 0 }
          break
        }
        case 'time': {
          spread = 1.25
          const scope2 = layout === 'compose' ? cellOf(['timeline', 'gantt', 'trend', 'progress']) : slide
          if (scope2) now = scope2.querySelector<HTMLElement>('.tl-item.is-now, .tn-pt.is-hl')
          if (layout === 'progress') guide = qa('.ps-row.it')
          cam = { kind: 'drift', dur: 0 }
          break
        }
        case 'picture': {
          if (layout === 'compose') {
            const cell = cellOf(['image'])
            picture = cell && !cell.querySelector('.bk-img.is-fit') ? cell.querySelector<HTMLElement>('.bk-img-i img') : null
          } else {
            picture = slide!.querySelector('.ix:not(.is-contain) .ix-img img') || q('.ix-img img')
            text = q('.ix-title')
          }
          break
        }
        case 'closing':
          text = q('.cl-title')
          guide = qa('.cl-step')
          cam = { kind: 'back', dur: 4200 }
          break
        default:
          return null
      }
      if (text && !(text.textContent || '').trim()) text = null
      if (!focal) focal = text
      lettersFor = text
      // 움직이기 전의 자리
      const textAt = underline ? textBox(text) : null
      const textSize = text ? parseFloat(getComputedStyle(text).fontSize) || 60 : 60
      const focalAt = deepBox(focal)
      const nowAt = deepBox(now)
      // 선은 글이 실제로 그려진 자리에 맞춘다: 컴포넌트 칸은 판에 맞춰 글보다 커서, 칸 위에 그으면 글에서 떨어져 떠 있었다(녹화)
      const guideAt = guide.map((el) => textBox(el) ?? boxOf(el))
      const origin = textAt ?? focalAt
      const center: [number, number] = origin ? [(origin.l + origin.r) / 2, (origin.t + origin.b) / 2] : [W / 2, H / 2]

      return () => {
        const mine = anims.slice()
        const targetOf = (a: Animation) => (a.effect instanceof KeyframeEffect ? a.effect.target : null)
        const delayOf = (a: Animation) => Number(a.effect?.getTiming().delay) || 0
        const endOf = (a: Animation) => Number(a.effect?.getComputedTiming().endTime) || 0
        /** 지연을 by만큼 옮긴다. 시계(빈 움직임, tally)는 지연 대신 시간을 거꾸로 돌려 같이 늦춘다 */
        const shift = (a: Animation, by: number) => {
          if (!by || !(a.effect instanceof KeyframeEffect)) return
          if (!a.effect.getKeyframes().length) a.currentTime = Number(a.currentTime || 0) - by
          else a.effect.updateTiming({ delay: Math.max(0, delayOf(a) + by) })
        }
        const within = (el: Element, list: Element[]) => list.some((x) => x === el || x.contains(el))
        /** 장의 머리, 무대, 아래 띠, 장면이 남겨 두라고 한 것은 연출표의 때 그대로 */
        const kept = (el: Element) => {
          const t = top.find((x) => x === el || x.contains(el))
          if (!t || stage.includes(t) || foot.includes(t) || t.classList.contains('s-head')) return true
          return !!keep && !!el.closest(keep)
        }
        const startOf = (list: Animation[]) => (list.length ? Math.min(...list.map(delayOf)) : Infinity)
        /** 이 안의 것이 처음 움직이는 때 (다시 짠 뒤) */
        const firstIn = (el: Element) => startOf(mine.filter((a) => {
          const t = targetOf(a)
          return !!t && within(t, [el])
        }))

        /**
         * 초점을 먼저: 초점 안의 움직임을 본문이 시작하는 때로 당기고, 초점을 감싼 것(본문 상자가 흐리게 들어오는 것)도 그때까지 당긴다.
         * 나머지(근거)는 돌려준 rest를 moveRest로 옮긴다
         */
        const restage = (focus: Element[]) => {
          const F: Animation[] = []
          const R: Animation[] = []
          for (const a of mine) {
            const t = targetOf(a)
            if (!t) continue
            if (focus.length && within(t, focus)) F.push(a)
            // 초점을 감싼 것(본문 상자)은 아래에서 초점과 같이 당긴다
            else if (focus.some((f) => t.contains(f))) continue
            else if (!kept(t)) R.push(a)
          }
          const rStart = startOf(R)
          const fStart = startOf(F)
          const cue = Math.min(fStart, rStart)
          if (F.length && fStart > cue) F.forEach((a) => shift(a, cue - fStart))
          // 초점을 감싼 것이 늦게 나타나면 초점도 그동안 안 보인다
          for (const a of mine) {
            const t = targetOf(a)
            if (t && focus.some((f) => t !== f && t.contains(f)) && delayOf(a) > cue) shift(a, cue - delayOf(a))
          }
          return { F, R, cue: Number.isFinite(cue) ? cue : 0, fEnd: F.length ? Math.max(...F.map(endOf)) : Number.isFinite(cue) ? cue : 0, rStart }
        }
        /** 근거를 at부터: 서로의 사이는 spread배로 벌린다 */
        const moveRest = (R: Animation[], from: number, at: number, k2 = 1) => {
          if (!Number.isFinite(from)) return
          for (const a of R) shift(a, at + (delayOf(a) - from) * k2 - delayOf(a))
        }
        /** 장면의 움직임: 이름을 붙여 시간표가 따로 그린다 */
        const layer = (el: Element, frames: Keyframe[], at: number, timing: Spring) => {
          const a = run(anims, el, frames, at, timing)
          if (a) a.id = SCENE
          return a
        }
        const add = <E extends HTMLElement>(el: E, parent: Element) => {
          parent.appendChild(el)
          restores.push(() => el.remove())
          return el
        }
        const div = (cls: string) => {
          const el = document.createElement('div')
          el.className = cls
          el.setAttribute('aria-hidden', 'true')
          return el
        }
        // 렌즈: 카메라가 장의 글과 같이 움직이는 빈 층. 선과 장막을 여기에 그려 글에 붙어 다니게 한다
        const lens = add(div('mo-scene'), host)
        const begin = s(0)

        /** 카메라: 장의 글 전체를 한 덩어리로 (각자의 자리에서 같은 점을 중심으로) 조금 당기거나 밀었다가 원래 자리로 */
        const camera = (kind: 'in' | 'back' | 'drift', at: number, dur: number, about: [number, number], dx = 0, dy = 0) => {
          // 이어 움직이기로 옮겨 온 것은 이미 제자리다. 옮기면 짝이 어긋난다
          if (host.querySelector('[data-mo-keep]')) return
          const sc = kind === 'in' ? 0.965 : kind === 'back' ? 1.045 : 1
          for (const { el, at: b } of [...moving, { el: lens, at: { l: 0, t: 0, r: W, b: H } }]) {
            const o = getComputedStyle(el).transformOrigin.split(' ').map(parseFloat)
            const vx = about[0] - b.l - (o[0] || 0)
            const vy = about[1] - b.t - (o[1] || 0)
            const f = (scale: number, x: number, y: number) => `translate(${x}px, ${y}px) translate(${vx}px, ${vy}px) scale(${scale}) translate(${-vx}px, ${-vy}px)`
            layer(el, [{ transform: f(sc, dx, dy), composite: 'add' }, { transform: f(1, 0, 0), composite: 'add' }], at, { easing: CAMERA, duration: dur })
          }
        }
        /** 결 선: 결론 아래를 왼쪽에서 그어 잠깐 머문 뒤 오른쪽으로 빠져나간다. 끝 모습에는 없다 */
        const strokeUnder = (b: Box, at: number) => {
          const ln = add(div('mo-line'), lens)
          const h = Math.max(4, Math.round(textSize * 0.06))
          ln.style.cssText = `left:${b.l}px;top:${b.b + textSize * 0.1}px;width:${b.r - b.l}px;height:${h}px;clip-path:inset(0 0 0 100%)`
          layer(
            ln,
            [
              { clipPath: 'inset(0 100% 0 0)', offset: 0, easing: CARRY },
              { clipPath: 'inset(0 0% 0 0%)', offset: 0.32, easing: 'linear' },
              { clipPath: 'inset(0 0% 0 0%)', offset: 0.7, easing: EASE.sweep },
              { clipPath: 'inset(0 0% 0 100%)', offset: 1 },
            ],
            at,
            { easing: 'linear', duration: d(2600) },
          )
        }
        /**
         * 초점: 장의 바탕색을 옅게 덮어 초점 밖을 물리고, 초점 자리는 비운다(구멍). 다 보이면 걷는다.
         * 덮는 색이 바탕색이라 빈 바탕 위에서는 보이지 않고 글과 면만 옅어진다
         */
        const spot = (holes: Box[], at: number, hold: number, release = 900) => {
          const v = add(div('mo-veil'), host)
          const pad = 28
          const r = 18
          let path = `M0 0H${W}V${H}H0Z`
          for (const h of holes) {
            const x = h.l - pad
            const y = h.t - pad
            const w = h.r - h.l + pad * 2
            const hh = h.b - h.t + pad * 2
            path += `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + hh - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + hh}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + hh - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`
          }
          v.style.clipPath = `path(evenodd, '${path}')`
          const fadeIn = d(420)
          const total = fadeIn + hold + d(release)
          layer(
            v,
            [
              { opacity: 0, offset: 0 },
              { opacity: 0.8, offset: fadeIn / total },
              { opacity: 0.8, offset: (fadeIn + hold) / total },
              { opacity: 0, offset: 1 },
            ],
            at,
            { easing: 'ease-in-out', duration: total },
          )
        }
        /**
         * 읽는 차례를 잇는 선: 항목이 나오는 때에 선 끝이 그 항목에 닿는다. 한 줄에 여럿이면 그 줄 위를 옆으로, 하나씩 쌓였으면 왼쪽을 아래로.
         * 마지막 항목에 닿으면 잠깐 머물렀다가 꼬리가 끝 쪽으로 빠져나간다(끝 모습에는 없다)
         */
        const thread = (els: HTMLElement[], boxes: (Box | null)[]) => {
          const list = els.map((el, i) => ({ el, b: boxes[i], t: firstIn(el) })).filter((x): x is { el: HTMLElement; b: Box; t: number } => !!x.b && Number.isFinite(x.t))
          if (list.length < 2) return null
          const rows: (typeof list)[] = []
          for (const x of list) {
            const row = rows[rows.length - 1]
            if (row && Math.abs(row[0].b.t - x.b.t) < 24) row.push(x)
            else rows.push([x])
          }
          const across = rows.some((r) => r.length > 1)
          const draw = (row: typeof list, vertical: boolean) => {
            const ln = add(div('mo-line is-guide'), lens)
            const first = row[0]
            const last = row[row.length - 1]
            const x0 = vertical ? Math.min(...row.map((x) => x.b.l)) - 32 : first.b.l
            const y0 = vertical ? first.b.t : Math.min(...row.map((x) => x.b.t)) - 30
            const len = vertical ? last.b.b - first.b.t : last.b.r - first.b.l
            if (x0 < 24 || y0 < 24 || len < 40) return
            ln.style.cssText = vertical
              ? `left:${x0}px;top:${y0}px;width:3px;height:${len}px;clip-path:inset(100% 0 0 0)`
              : `left:${x0}px;top:${y0}px;width:${len}px;height:3px;clip-path:inset(0 0 0 100%)`
            const T0 = first.t
            const reach = last.t + d(500)
            const tail = reach + d(450)
            const end = tail + d(700)
            const total = end - T0
            const cut = (p: number) => (vertical ? `inset(0 0 ${100 - p}% 0)` : `inset(0 ${100 - p}% 0 0)`)
            const frames: Keyframe[] = row.map((x) => ({
              clipPath: cut(((vertical ? x.b.t - first.b.t : x.b.l - first.b.l) / len) * 100),
              offset: (x.t - T0) / total,
              easing: CARRY,
            }))
            frames.push({ clipPath: cut(100), offset: (reach - T0) / total, easing: 'linear' })
            frames.push({ clipPath: cut(100), offset: (tail - T0) / total, easing: EASE.sweep })
            frames.push({ clipPath: vertical ? 'inset(100% 0 0 0)' : 'inset(0 0 0 100%)', offset: 1 })
            layer(ln, frames, T0, { easing: 'linear', duration: total })
          }
          if (across) rows.filter((r) => r.length > 1).forEach((r) => draw(r, false))
          else draw(list, true)
          return { across, end: list[list.length - 1].t }
        }
        const lastStart = (list: Animation[]) => (list.length ? Math.max(...list.map(delayOf)) : begin)

        switch (name) {
          case 'opening':
          case 'answer':
          case 'closing':
          case 'picture': {
            const r = restage(focal ? [focal] : [])
            // 결론의 마지막 글자가 내려앉기 시작할 때 선이 떠난다
            const inText = text ? r.F.filter((a) => within(targetOf(a)!, [text!])) : []
            const landed = inText.length ? lastStart(inText) + d(80) : r.fEnd
            if (underline && textAt) strokeUnder(textAt, landed)
            // 근거는 결론이 다 내려앉고(선이 반쯤 갔을 때) 그다음에
            const restAt = name === 'picture' || name === 'closing' ? landed + d(300) : landed + d(700)
            if (r.F.length) moveRest(r.R, r.rStart, restAt)
            if (picture) {
              // 이미지 한 컷: 연출표의 당기기를 걷고 더 천천히, 조금 비스듬히 다가간다
              for (const a of mine) if (targetOf(a) === picture) {
                a.cancel()
                anims.splice(anims.indexOf(a), 1)
              }
              layer(picture, [{ scale: '1.14', translate: '-1.6% 0.8%' }, { scale: '1', translate: '0 0' }], begin, { easing: EASE.drift, duration: d(5200) })
            }
            if (name === 'closing') thread(guide, guideAt)
            if (cam) camera(cam.kind, begin, d(cam.dur), center)
            break
          }
          case 'numbers': {
            const r = restage(focal ? [focal] : [])
            if (r.F.length) {
              // 숫자가 거의 맞춰질 때 나머지가 따라 나오고, 그동안 덮은 것을 천천히 걷는다
              const restAt = r.cue + (r.fEnd - r.cue) * 0.72
              moveRest(r.R, r.rStart, restAt)
              if (spotlight && focalAt) spot([focalAt], Math.max(0, r.cue - d(120)), restAt - r.cue + d(200))
            }
            if (cam) camera(cam.kind, begin, d(cam.dur), center)
            break
          }
          case 'flow':
          case 'time': {
            const r = restage([])
            moveRest(r.R, r.rStart, r.rStart, spread)
            const g = thread(guide, guideAt)
            const span = Math.max(d(1600), lastStart(r.R) - begin + d(700))
            if (now && nowAt) {
              const at = firstIn(now)
              if (Number.isFinite(at)) spot([nowAt], at + d(260), d(1300))
            }
            // 카메라는 읽는 쪽으로 따라간다: 옆으로 흐르면 오른쪽으로, 아래로 쌓였으면 아래로
            const down = g ? !g.across : false
            camera('drift', begin, span, center, down ? 0 : 40, down ? 28 : 0)
            break
          }
          case 'compare': {
            if (!halves) break
            const h = halves
            const side = (a: Animation) => {
              const t = targetOf(a)
              if (!t || kept(t)) return 0
              if (h.right) return within(t, [h.right]) ? 1 : -1
              const b = boxOf(t)
              if (!b) return 0
              if (b.l >= h.split - 16) return 1
              if (b.r <= h.split + 16) return -1
              return 0
            }
            const left = mine.filter((a) => side(a) < 0)
            const right = mine.filter((a) => side(a) > 0)
            const leftEnd = left.length ? Math.max(...left.map(endOf)) : begin + d(900)
            const open = Math.max(begin + d(700), leftEnd - d(200))
            moveRest(right, startOf(right), open + d(120))
            // 장막: 바탕색 면이 가르는 선에서 오른쪽 끝까지 덮었다가 오른쪽으로 걷힌다. 앞 가장자리의 가는 선이 걷히는 자리를 보인다
            const c = add(div('mo-curtain'), lens)
            const ct = h.region.t - 16
            c.style.cssText = `left:${h.split}px;top:${ct}px;width:${W - h.split}px;height:${h.region.b - ct + 16}px`
            // 가는 선은 걷히기 시작할 때 나타난다. 처음부터 있으면 빈 장 가운데에 선 하나가 떠 있는 것처럼 보였다(녹화)
            const seam = getComputedStyle(host).getPropertyValue('--ink-3').trim() || 'currentColor'
            layer(
              c,
              [
                { opacity: 1, translate: '0 0', borderLeftColor: 'transparent' },
                { opacity: 1, translate: '0 0', borderLeftColor: seam, offset: 0.08 },
                { opacity: 1, translate: `${W - h.split + 8}px 0`, borderLeftColor: seam },
              ],
              open,
              { easing: EASE.sweep, duration: d(1300) },
            )
            camera('drift', begin, open - begin + d(1300), center, 36, 0)
            break
          }
        }
      }
    }

    const batches: { anims: Animation[]; stops: (() => void)[]; restore: () => void }[] = []
    /**
     * 움직임 한 묶음을 짜고, 다 움직이면 그 묶음의 뒷정리를 한다.
     * 움직이는 동안은 움직이는 것(root)에 표시를 붙인다. 그동안 글자와 막대는 옮겨지거나(translate) 커지는(scale) 중이고
     * 숫자는 0부터 굴러가는 중이라, 부품 장의 글자 맞추기(slides/fitBlocks.ts)가 이때 재면 끝 모습과 다른 값이 나온다
     * (움직이며 넘긴 장과 뒤로 돌아온 장의 글자 크기가 달랐다). 맞추기는 표시가 있으면 재지 않고 기다렸다가, 표시를 떼며
     * 보내는 mo-end에 다시 잰다. 같은 것을 겹쳐 움직이면(편집기의 미리 보기, 누를 때마다의 묶음) 겹친 수를 적어 마지막이 끝날 때 뗀다
     */
    const batch = (make: () => void) => {
      anims = []
      stops = []
      restores = []
      waits = []
      root.setAttribute('data-mo-play', String(Number(root.getAttribute('data-mo-play') || 0) + 1))
      still = quiet
      const outer = jobs
      jobs = []
      try {
        make()
        flushJobs()
      } finally {
        jobs = outer
        still = false
        pace = 1
      }
      const mine = { anims, stops, restores }
      let restored = false
      const restore = () => {
        if (restored) return
        restored = true
        mine.restores.forEach((f) => f())
        const left = Number(root.getAttribute('data-mo-play') || 1) - 1
        if (left > 0) root.setAttribute('data-mo-play', String(left))
        else {
          root.removeAttribute('data-mo-play')
          root.dispatchEvent(new Event('mo-end'))
        }
      }
      batches.push({ anims: mine.anims, stops: mine.stops, restore })
      // 다 움직이고 나면(숫자도 다 올라가면) 낱말로 나눈 제목을 원래 글자로 되돌린다. 화면을 그린 쪽(React)이 다시 다룰 수 있게.
      // 중간에 멈춘 움직임(거절된 약속)도 끝난 것으로 본다: 끝 표시가 남으면 글자 맞추기가 그 장을 다시 재지 않는다
      Promise.all([...mine.anims.map((a) => a.finished.catch(() => {})), ...waits]).then(restore)
    }

    batch(() => {
      if (cellOnly) return block(cellOnly as HTMLElement, 0)
      // 장면: 움직이기 전에 자리를 재 두고(prepare), 레이아웃의 연출을 건 뒤 그 움직임을 다시 짜고 층을 얹는다
      const after = sceneName && !still ? scene(sceneName) : null
      choreo(layout, slideVariant)
      // 장면은 모아 둔 쓰기를 한 뒤에 다시 짠다: 나눈 낱말이 장 안에 있어야 어느 묶음의 움직임인지 안다
      flushJobs()
      if (after) after()
      // 이어 움직이기로 옮겨 온 짝: 값이 바뀌었으면 앞 장의 값에서 새 값으로
      carried.forEach((was, el) => {
        if (slide.contains(el)) carry(el, was)
      })
      carried.clear()
    })

    /** 누르면: 다음 묶음을 보이고 그 자리에서 움직인다. 장 바꾸기의 기다림 없이 바로 */
    const next = () => {
      const st = steppers.find((x) => x.i < x.marks.length && x.cell.isConnected)
      if (st) {
        stepOn(st)
        return true
      }
      const group = waiting.shift()
      if (!group) return false
      hold(group, false)
      lead = 0
      batch(() => {
        scope = slide
        t0 = 0
        composeGroup(group, 0)
      })
      return true
    }
    const finish = () => {
      shown = true
      // 멈춰 둔 컴포넌트의 움직임은 끝 모습으로 보낸다: 다시 재생만 하면 아직 차례가 오지 않은 항목이 멈춘 자리(안 보임)에 남아
      // 뒤로 돌아온 장에서 대화가 두 마디만 보였다(발표 녹화). 끝없는 움직임(계속 흐르는 조각)은 끝이 없어 거둔다
      for (const st of steppers.splice(0)) {
        cancelAnimationFrame(st.raf)
        for (const a of cellAnims(st)) {
          try {
            a.finish()
          } catch {
            a.cancel()
          }
        }
      }
      waiting.splice(0).forEach((g) => hold(g, false))
      for (const b of batches) {
        b.anims.forEach((a) => a.finish())
        b.stops.forEach((f) => f())
        b.restore()
      }
    }
    // 이어 움직이기로 넘길 때 swap이 앞 장의 값을 읽기 전에 부른다: 움직이던 것을 끝 모습으로 보내 나눈 글자와 굴리던 숫자를 원래 글로
    // 돌려 둔다. 생동감에서 숫자가 아직 구르는 동안 넘기면 숫자가 글자마다 나뉘어 있어서 값을 읽지 못했고, 막대 옆 숫자가 처음에 툭
    // 새 값으로 바뀌었다(필름). '누르면' 나오는 묶음은 감춘 그대로 둔다(떠나는 장이라 보일 까닭이 없다)
    if (!cellOnly && slide)
      settling.set(slide, () => {
        for (const b of batches) {
          b.anims.forEach((a) => a.finish())
          b.stops.forEach((f) => f())
          b.restore()
        }
      })
    return Object.assign(finish, { next, left: () => waiting.length + steppers.reduce((n, st) => n + st.marks.length - st.i, 0) })
  }

  // ---------- 이어 움직이기 ----------
  // 앞 장과 다음 장에 같은 것이 있으면 사라졌다 나타나지 않고 새 자리와 크기로 옮겨 간다(View Transitions의 이름 붙인 요소).
  // 같은 것: 글이 같은 제목(표지 제목이 다음 장의 제목이 되는 것도), 글이 같은 컴포넌트, 숫자만 다른 컴포넌트, 두 장에 하나씩뿐인 같은
  // 종류의 컴포넌트(숫자만 바뀐 차트가 제자리에서 바뀌게). 복제한 장은 id가 새로 나와서 id가 아니라 내용으로 짝을 맞춘다.
  // 짝의 값이 바뀌었으면 앞 장의 값에서 새 값으로 바뀌어 간다(아래 '값 이어 움직이기', play의 carry)

  /** 발표 화면과 내보낸 HTML에서 지금 보이는 장 */
  const CURRENT = ':is(.present-slide, .v-slide.is-current)'
  /** 앞 장에서 이름을 붙인 열쇠 → 이름. 다음 장을 그릴 때(play, 아니면 swap) 짝을 맞추고 비운다 */
  let morphFrom: Map<string, string> | null = null
  /** 이름을 붙인 요소들. 전환이 끝나면 이름을 뗀다 */
  const named: HTMLElement[] = []
  /** 장 바꾸기를 시작할 때마다 하나씩 는다. 앞의 전환이 늦게 끝나도 지금 전환의 표시를 떼지 않게 */
  let turn = 0
  /** 장을 바꾸는 중에 움직이지 않고(움직임 없음) 그린 다음 장. swap이 그 장의 글을 늦게 들인다 */
  let stillSwap: Element | null = null
  /** 앞 장에서 이름을 붙인 것의 값: 이름 → 값. 다음 장의 짝을 맞출 때 짝에게 넘긴다 */
  let morphValues: Map<string, Values> | null = null
  /** 다음 장에서 짝이 된 것 → 앞 장의 값. 다음 장의 play가 값을 옮기고 비운다(움직이지 않는 장은 swap이 비운다) */
  const carried = new Map<HTMLElement, Values>()
  /** 장마다 그 장의 움직임을 끝 모습으로 보내는 것(play가 적는다). 이어 움직이기가 앞 장의 값을 읽기 전에 부른다 */
  const settling = new WeakMap<Element, () => void>()

  // ---------- 값 이어 움직이기 ----------
  // 짝이 된 숫자나 차트의 값이 두 장에서 다르면, 다음 장의 것이 앞 장의 값에서 새 값으로 바뀌어 간다(Keynote의 Magic Move를 데이터에:
  // 같은 대상이 바뀌는 것으로 보이게, Heer & Robertson 2007). 차트는 값을 CSS 변수(--p, --x, --y 같은)와 그림(svg)의 좌표로 그리므로,
  // 그 값을 한 시계로 앞 값에서 새 값까지 옮기면 차트가 그 사이의 모든 값으로 다시 그려진다: 막대는 앞 길이에서 새 길이로, 고리는 앞 몫에서
  // 새 몫으로, 선은 앞 모양에서 새 모양으로, 막대 끝의 숫자와 선 위의 점이 같이 따라간다. 숫자는 앞 값에서 새 값까지 센다.
  // 짝의 새 모습(View Transitions의 new)은 살아 있는 그림이라 바뀌어 가는 값이 그대로 보인다.

  /** 값을 옮길 CSS 변수. 차례나 개수(--n, --i, --k, --cols)는 사이 값이 없어 판이 깨지므로 넣지 않는다 */
  const VALUE_VARS = ['--p', '--t', '--g', '--m', '--a', '--b', '--w', '--pw', '--x', '--y', '--ty', '--lo', '--hi', '--link', '--l', '--s', '--o', 'flex-grow']
  /** 같은 이름이 칸 번호(정수)로도 쓰이는 변수: 소수로 적힌 값만 옮긴다(설문 결과의 --s는 몫, 일정표의 --s는 칸 번호) */
  const SOFT_VARS = ['--s', '--o']
  /** 옮길 그림의 좌표. 숫자를 뺀 꼴이 같을 때만(점과 마디의 수가 같을 때만) 옮긴다 */
  const SVG_VALUES = ['d', 'points', 'cx', 'cy', 'r', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'width', 'height']
  /** 날짜는 세는 수가 아니라서 옮기지 않는다(11월 28일에서 12월 3일로 가며 날을 거꾸로 센다) */
  const NOT_VALUES = '[data-type="date"]'
  /** 점 숫자가 점의 어느 쪽에 서는지(추이, 두 값 비교: slides/fitBlocks.ts가 그려진 자리를 보고 고른다) */
  const SIDES = ['is-below', 'is-after', 'is-before', 'is-mid']
  /**
   * on: 센 몫을 칸마다 칠해 보이는 표시(칸 조립의 칸, 비율의 막대)가 켜져 있었는지(is-on).
   * side: 점 숫자가 섰던 쪽(SIDES)
   */
  type Values = Map<string, { texts: (string | null)[]; vars: Record<string, string>; attrs: Record<string, string>; on?: boolean; side?: string }>
  const sideOf = (el: Element) => SIDES.filter((c) => el.classList.contains(c)).join(' ')

  /** 숫자를 지운 글: 숫자만 바뀐 것끼리 짝을 맞추는 열쇠 */
  const numless = (t: string) => t.replace(/\d[\d,]*(\.\d+)?/g, '#')

  /**
   * 요소 안의 요소마다 자리 이름(꼴과, 같은 꼴 형제 사이의 차례)을 붙여 돈다. 두 장의 같은 컴포넌트는 같은 코드가 그려서 자리 이름이
   * 같다. 상태 class(is-, has-: 강조, 넘음 같은)와 엔진이 붙인 것(mo-)은 꼴에서 뺀다: 값이 바뀌면 상태도 바뀔 수 있다
   */
  function walkPaths(root: Element, visit: (el: Element, path: string) => void) {
    const step = (el: Element, path: string) => {
      visit(el, path)
      const seen: Record<string, number> = {}
      for (const c of Array.prototype.slice.call(el.children) as Element[]) {
        const sig = c.tagName + '.' + Array.prototype.filter.call(c.classList, (k: string) => !/^(is|has|mo)-/.test(k)).join('.')
        seen[sig] = (seen[sig] ?? -1) + 1
        step(c, path + '/' + sig + '#' + seen[sig])
      }
    }
    step(root, '')
  }

  /** 앞 장의 것에서 옮길 수 있는 값을 읽어 둔다: 숫자가 든 글, 값 변수, 그림의 좌표 */
  function readValues(root: Element): Values {
    const out: Values = new Map()
    if (root.matches(NOT_VALUES)) return out
    walkPaths(root, (el, path) => {
      const texts: (string | null)[] = []
      let any = false
      for (const c of Array.prototype.slice.call(el.childNodes) as Node[]) {
        if (c.nodeType !== 3) continue
        const v = /\d/.test(c.nodeValue || '') ? c.nodeValue : null
        texts.push(v)
        if (v) any = true
      }
      const vars: Record<string, string> = {}
      const st = (el as HTMLElement).style
      // 부품 칸(.bk)의 --x, --y, --w, --h는 판의 자리다. 칸째 옮기는 것은 View Transitions가 한다
      if (st && !el.classList.contains('bk'))
        for (const k of VALUE_VARS) {
          const v = st.getPropertyValue(k)
          if (v) {
            vars[k] = v
            any = true
          }
        }
      const attrs: Record<string, string> = {}
      if (el instanceof SVGElement)
        for (const k of SVG_VALUES) {
          const v = el.getAttribute(k)
          if (v) {
            attrs[k] = v
            any = true
          }
        }
      const on = el.classList.contains('is-on')
      const side = sideOf(el)
      if (any || on || side) out.set(path, { texts, vars, attrs, on, side })
    })
    return out
  }

  /** 요소마다 짝을 찾을 열쇠들 (앞의 것일수록 먼저 맞춘다) */
  function morphKeys(slide: Element): { el: HTMLElement; keys: string[] }[] {
    const text = (el: Element) => (el.textContent || '').replace(/\s+/g, ' ').trim()
    const out: { el: HTMLElement; keys: string[] }[] = []
    const titles = Array.prototype.slice.call(slide.querySelectorAll(':scope > .s-head .s-title, .cv-title, .sc-title, .st-title')) as HTMLElement[]
    // 장 머리의 제목은 글이 달라도 장 머리끼리 짝이 된다(두 번째 열쇠): 제자리에서 바꿔 끼우고, 사라졌다가 늦게 다시 나오지 않게(감성 검수)
    for (const el of titles) if (text(el)) out.push({ el, keys: ['title:' + text(el), el.matches('.s-head .s-title') ? 'title*' : ''] })
    // 장 머리의 부제와 아래 띠의 출처도: 글이 같으면 가만히 있고, 다르면 제자리에서 바뀐다. 짝이 없던 때는 두 장에 똑같은 부제와 출처가
    // 앞 장과 함께 사라졌다가 다음 장의 움직임으로 다시 나와 깜빡였다(감성 검수)
    for (const [sel, role] of [
      [':scope > .s-head .s-lead', 'lead'],
      [':scope > .s-foot .s-source', 'src'],
    ]) {
      const el = slide.querySelector(sel) as HTMLElement | null
      if (el && text(el)) out.push({ el, keys: [role + ':' + text(el), role + '*'] })
    }
    const cells = Array.prototype.slice.call(slide.querySelectorAll('.bk-area > .bk')) as HTMLElement[]
    const count: Record<string, number> = {}
    for (const el of cells) count[el.dataset.type || ''] = (count[el.dataset.type || ''] || 0) + 1
    // 글이 같은 것 → 숫자만 다른 것(그 종류 안에서 그 글이 하나뿐일 때) → 그 종류가 하나뿐인 것 차례로 맞춘다
    const nums: Record<string, number> = {}
    for (const el of cells) {
      const k = (el.dataset.type || '') + ':' + numless(text(el))
      nums[k] = (nums[k] || 0) + 1
    }
    for (const el of cells) {
      const type = el.dataset.type || ''
      const loose = type + ':' + numless(text(el))
      const keys = ['bk:' + type + ':' + text(el), nums[loose] === 1 ? 'bkn:' + loose : '']
      if (count[type] === 1) keys.push('bk1:' + type)
      out.push({ el, keys })
    }
    // 레이아웃 장의 항목과 이미지도(reveal.js의 Auto-Animate처럼 글과 그림으로 짝을 짓는다): 목록을 이어 가는 장, 같은 사진을
    // 크게 다시 쓰는 장에서 항목이 사라졌다 나타나지 않고 새 자리로 옮겨 간다. 부품 장은 부품째로 맞추므로 넣지 않는다.
    // 한 장에 같은 글이 둘 이상이면 어느 것이 짝인지 알 수 없어 넣지 않는다
    if (!cells.length) {
      // 같은 레이아웃, 같은 모양에 숫자만 다른 본문(같은 차트의 값만 바꾼 장)은 본문째 짝이 된다: 추이의 선과 점처럼 항목 밖에 그린 것까지
      // 앞 값에서 새 값으로 바뀌어 간다. 그 안의 항목도 항목끼리 짝을 짓고, 값은 본문이 함께 옮긴다(pairUp). 항목이 늘거나 준 장은
      // 본문의 글이 달라 예전처럼 항목마다 맞춘다
      const body = slide.querySelector(':scope > .s-body') as HTMLElement | null
      const layout = (/\bl-([a-zA-Z]+)/.exec(slide.className) || [])[1] || ''
      const variant = (/\bva-([a-zA-Z]+)/.exec(slide.className) || [])[1] || 'base'
      if (body && text(body)) out.push({ el: body, keys: ['body:' + layout + ':' + variant + ':' + numless(text(body))] })
      const seen: Record<string, HTMLElement | null> = {}
      const add = (key: string, el: HTMLElement) => (seen[key] = key in seen ? null : el)
      const its = Array.prototype.slice.call(slide.querySelectorAll(':scope > .s-body .it')) as HTMLElement[]
      for (const el of its)
        if (text(el) && !el.parentElement?.closest('.it')) {
          add('it:' + text(el), el)
          add('itn:' + numless(text(el)), el)
        }
      const imgs = Array.prototype.slice.call(slide.querySelectorAll(':scope > .s-body img, :scope > .ix img')) as HTMLImageElement[]
      // 그림은 data: 주소라 길다: 길이와 앞뒤 조각으로 가린다(같은 그림이면 같고, 다른 그림이 우연히 같을 일은 없다)
      for (const el of imgs) if (el.src) add('img:' + el.src.length + el.src.slice(0, 48) + el.src.slice(-48), el)
      // 항목은 열쇠 둘(글이 같은 것, 숫자만 다른 것)을 차례로. 그 장에 하나뿐인 열쇠만
      const byEl = new Map<HTMLElement, string[]>()
      for (const key in seen) {
        const el = seen[key]
        if (!el) continue
        const keys = byEl.get(el) || ['', '']
        keys[key.indexOf('itn:') === 0 ? 1 : 0] = key
        byEl.set(el, keys)
      }
      byEl.forEach((keys, el) => out.push({ el, keys }))
    }
    return out
  }

  /** 앞 장의 것에 이름을 붙인다 (전환이 앞 장을 찍기 전에) */
  function nameFrom(slide: Element) {
    morphFrom = new Map()
    morphValues = new Map()
    morphKeys(slide).forEach(({ el, keys }, i) => {
      const name = 'mo-k' + i
      el.style.setProperty('view-transition-name', name)
      named.push(el)
      for (const k of keys) if (k && !morphFrom!.has(k)) morphFrom!.set(k, name)
      // 값은 앞 장이 사라지기 전에 읽어 둔다(제목은 글이 같아야 짝이라 옮길 값이 없다)
      if (!keys.some((k) => k.indexOf('title:') === 0)) morphValues!.set(name, readValues(el))
    })
  }

  /** 다음 장에서 짝이 있는 것에 같은 이름을 붙이고, 다시 들이지 않게 표시한다. 글이 같은 짝을 먼저, 종류만 같은 짝은 그다음 */
  function pairUp(slide: Element) {
    const from = morphFrom
    const values = morphValues
    morphFrom = null
    morphValues = null
    carried.clear()
    if (!from) return
    // 앞 장은 이미 찍혔다. 앞 장이 그대로 남는 곳(내보낸 HTML은 모든 장이 문서에 있다)에서 이름이 겹치지 않게 앞 장의 이름을 뗀다
    for (const el of named.splice(0)) el.style.removeProperty('view-transition-name')
    const used = new Set<string>()
    const fresh = morphKeys(slide)
    const taken = new Set<HTMLElement>()
    for (const pass of [0, 1, 2]) {
      for (const { el, keys } of fresh) {
        const name = keys[pass] && from.get(keys[pass])
        if (!name || used.has(name) || taken.has(el)) continue
        used.add(name)
        taken.add(el)
        el.style.setProperty('view-transition-name', name)
        el.setAttribute('data-mo-keep', '')
        named.push(el)
        // 본문째 짝이 되어도 그 안의 항목은 항목끼리 짝을 짓는다(앞 장이 항목마다 따로 찍혀서, 짝이 없으면 항목이 본문보다 먼저 옅어져
        // 막대가 0.1초 남짓 흐려 보였다). 값은 바깥 짝 하나가 옮긴다: 본문의 carry가 그 안의 항목까지 함께 옮긴다
        const was = values && values.get(name)
        const inside = Array.from(carried.keys()).some((c) => c.contains(el) || el.contains(c))
        if (was && was.size && !inside && !el.matches(NOT_VALUES)) carried.set(el, was)
      }
    }
  }

  // ---------- 장 바꾸기 ----------

  /** 장을 바꾼다. kind는 전환 이름(fade, slide, zoom, morph, none). 예전처럼 움직임 정도(calm, lively)를 넘겨도 된다. */
  function swap(update: () => void, kind: string, direction: 1 | -1) {
    type Transition = { finished: Promise<void>; ready: Promise<void>; updateCallbackDone: Promise<void> }
    const doc = document as Document & { startViewTransition?: (cb: () => void) => Transition }
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    const name = kind === 'calm' ? 'fade' : kind === 'lively' ? 'slide' : kind
    if ((name !== 'fade' && name !== 'slide' && name !== 'zoom' && name !== 'morph') || reduced || !doc.startViewTransition) {
      update()
      return
    }
    const html = document.documentElement
    // 앞의 전환이 끝나기 전에 또 넘기면 앞의 이름을 먼저 뗀다 (이름이 겹치면 전환이 멈춘다)
    unname()
    html.dataset.moSwap = name
    html.dataset.moDir = direction > 0 ? 'next' : 'prev'
    if (name === 'morph') {
      const old = document.querySelector(CURRENT + ' .slide')
      if (old) {
        settling.get(old)?.()
        nameFrom(old)
      }
    }
    // 빨리 연달아 넘기면 앞 전환은 건너뛰어지고, 그 끝맺음(finished)은 다음 전환이 시작된 뒤에 온다.
    // 그때 표시를 떼면 다음 전환이 motion.css의 규칙을 잃고 브라우저 기본 흐리게(250ms)로, 다음 장의 움직임은 SWAP_LEAD 없이
    // 바로 시작했다(두 장의 글이 겹치고 밀기가 흐리게로 바뀐다). 마지막에 시작한 전환만 끝맺는다
    const mine = ++turn
    const done = () => {
      if (mine !== turn) return
      delete html.dataset.moSwap
      delete html.dataset.moDir
      unname()
    }
    try {
      const t = doc.startViewTransition(() => {
        update()
        // 다음 장을 움직이지 않으면(앞 장으로 돌아갈 때) play가 짝을 맞추지 않았으니 여기서
        const fresh = morphFrom && document.querySelector(CURRENT + ' .slide')
        if (fresh) pairUp(fresh)
        morphFrom = null
        // 움직이지 않는 장(뒤로 갈 때)은 값을 옮기지 않는다: 다 보인 채로 온다
        carried.clear()
        // 두 장이 함께 옅어지는 동안 뒤로 비치는 바탕을 다음 장의 바탕색으로 (motion.css의 ::view-transition-group(root)).
        // 비워 두면 장 뒤의 바탕이 비쳐서, 장끼리 넘길 때 화면이 잠깐 회색으로 번쩍였다
        const next = document.querySelector(':is(.present-slide, .v-slide.is-current) .slide')
        if (next) {
          const bg = getComputedStyle(next).backgroundColor
          // 장 자리에만 깐다(motion.css의 ::view-transition-group(root)). 장 바깥(발표 화면의 검은 띠)은 찍지 않아 그대로 보인다
          html.style.setProperty('--mo-vt-bg', bg)
        }
        // 다음 장이 움직이지 않으면(뒤로 갈 때, 움직임 없음) 다 그려진 채로 와서, 앞 장이 옅어지는 동안 두 장의 글이 겹쳐 보였다.
        // 앞으로 넘길 때처럼 바탕은 그대로 두고 글만 앞 장이 사라진 뒤(SWAP_LEAD)에 들인다
        if (next && (direction < 0 || stillSwap === next)) reveal(next, SWAP_LEAD[name] || 0)
        stillSwap = null
      })
      // 빨리 연달아 넘기면 앞의 전환은 건너뛴다. 그때 나는 거절은 정상이라 조용히 받는다.
      t.ready.catch(() => {})
      t.updateCallbackDone.catch(() => {})
      t.finished.then(done, done)
    } catch {
      done()
      update()
    }
  }

  /**
   * 움직이지 않는 장을 넘겨받을 때 글만 늦게 들인다. 바탕(장 자체)은 처음부터 있어서 앞 장의 바탕과 이어지고,
   * 장 바깥 띠도 비치지 않는다. 제자리에 있는 것(아래 띠의 단락 지도와 쪽 번호, 이어 움직이기로 옮겨 오는 짝)은 건드리지 않는다:
   * 따로 이름이 붙어 제 길로 옮겨 가는데, 감싼 상자를 옅게 하면 그 안까지 들일 수 없다. 그래서 그런 것을 품은 상자는 열어서 그 아이들을
   */
  function reveal(slide: Element, at: number) {
    const fixed = '[data-mo-keep], .s-mark'
    const fadeIn = (el: Element) => {
      if (el.matches(fixed)) return
      if (el.querySelector(fixed)) {
        for (const c of Array.prototype.slice.call(el.children) as Element[]) fadeIn(c)
        return
      }
      el.animate([{ opacity: 0, offset: 0 }], { delay: at, duration: 320, easing: OUT, fill: 'backwards' })
    }
    for (const c of Array.prototype.slice.call(slide.children) as Element[]) fadeIn(c)
  }

  function unname() {
    morphFrom = null
    morphValues = null
    carried.clear()
    for (const el of named.splice(0)) {
      el.style.removeProperty('view-transition-name')
      el.removeAttribute('data-mo-keep')
    }
  }

  return { play, swap }
}

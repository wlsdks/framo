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
  const OUT = 'cubic-bezier(0.16, 1, 0.3, 1)'

  const LEVELS = {
    calm: { y: 20, step: 60, word: 30, ink: 0, scale: 0.98, move: SPRINGS.quick, grow: SPRINGS.glide, pop: SPRINGS.quick, speed: 0.8 },
    lively: { y: 44, step: 100, word: 50, ink: 5, scale: 0.96, move: SPRINGS.settle, grow: SPRINGS.settle, pop: SPRINGS.firm, speed: 1.1 },
  }

  type Level = (typeof LEVELS)['calm']
  type Spring = { easing: string; duration: number }

  // ---------- 하나하나의 움직임 ----------

  // 움직임을 짜는 동안만 바뀌는 값 (play가 짜는 동안 정하고 끝나면 되돌린다).
  // still: 움직이지 않는 때(움직임 없음, 동작 줄이기). '누르면' 나오는 차례만 지키고 아무것도 움직이지 않는다.
  // pace: 부품마다 고른 빠르기. 걸리는 시간과 부품 안의 차례 사이를 함께 늘이고 줄인다
  let still = false
  let pace = 1

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
    // 나누기 전에 낱말(글자)마다 원래 글에서의 자리를 잰다(아래에서 나눈 뒤의 자리와 맞춘다)
    const range = document.createRange()
    const was: { left: number; top: number }[] = []
    for (const node of texts) {
      let i = 0
      for (const part of (node.nodeValue || '').split(/(\s+)/)) {
        if (part.trim()) {
          let j = i
          for (const piece of pieces(part)) {
            range.setStart(node, j)
            range.setEnd(node, j + piece.length)
            const r = range.getClientRects()[0]
            was.push(r ? { left: r.left, top: r.top } : { left: NaN, top: NaN })
            j += piece.length
          }
        }
        i += part.length
      }
    }
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
    // 낱말 사이를 원래 글과 같게. 낱말을 상자(inline-block)로 감싸면 상자 밖의 띄어쓰기와 짝을 이룬 자간(쉼표 뒤 같은)이
    // 빠져서 낱말이 조금 넓어진다. 녹화해 보니 '사업, 12월'에서 쉼표 뒤가 3px 벌어져 있다가, 움직임이 끝나 원래 글로
    // 돌아올 때 그 뒤의 낱말이 모두 왼쪽으로 튀었다. 같은 줄의 이웃 낱말 사이가 원래와 다르면 앞 낱말의 오른쪽 여백으로 맞춘다.
    // 글자로 나눌 때도 같다: 글자 상자 사이에서는 글꼴의 짝 자간(kerning)이 빠진다
    const box = el.getBoundingClientRect()
    const k = (el as HTMLElement).offsetWidth ? box.width / (el as HTMLElement).offsetWidth : 0
    if (k && was.length === words.length) {
      const now = words.map((o) => o.getBoundingClientRect())
      for (let i = 0; i + 1 < words.length; i++) {
        const a = was[i]
        const b = was[i + 1]
        if (!(Math.abs(a.top - b.top) < 1 && Math.abs(now[i].top - now[i + 1].top) < 1)) continue
        const gap = b.left - a.left - (now[i + 1].left - now[i].left)
        if (Math.abs(gap) > 0.05 * k) boxes[i].style.marginRight = gap / k + 'px'
      }
    }
    // 글자로 나눈 동안 화면 읽기 프로그램은 낱낱의 글자를 읽지 않고 원래 글을 한 번 읽는다
    const label = el.getAttribute('aria-label')
    if (chars && words.length) {
      if (label === null) el.setAttribute('aria-label', (el.textContent || '').replace(/\s+/g, ' ').trim())
      for (const b of boxes) if (b.classList.contains('mo-w')) b.setAttribute('aria-hidden', 'true')
    }
    return {
      words,
      marks,
      restore: () => {
        undo.forEach((u) => u())
        if (chars && label === null) el.removeAttribute('aria-label')
      },
    }
  }

  /**
   * 큰 숫자를 0부터 올린다. 숫자가 하나만 있는 칸만. '3~4개월', 날짜는 그대로 둔다.
   * 다 올라가면 waits에 넣은 약속을 지킨다: 글이 원래 숫자로 돌아와야 움직임이 끝난 것이다(play의 끝 표시)
   */
  function countUp(el: Element, at: number, duration: number, stops: (() => void)[], waits: Promise<void>[]) {
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
    target_node.nodeValue = format(0)
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / duration))
      // 처음엔 빠르게, 끝에서 천천히 멈춘다
      target_node.nodeValue = t >= 1 ? text : format(target * (1 - Math.pow(2, -10 * t)))
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
  function roll(el: Element, at: number, duration: number, lively: boolean, anims: Animation[], restores: (() => void)[]) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    let node = walker.nextNode() as Text | null
    while (node && !/\d/.test(node.nodeValue || '')) node = walker.nextNode() as Text | null
    const parent = node && node.parentElement
    if (!node || !parent) return false
    const text = node.nodeValue || ''
    const all = text.match(/\d[\d,]*(\.\d+)?/g)
    if (!all || all.length !== 1 || all[0].replace(/\D/g, '').length > 9) return false
    const base = parent.getBoundingClientRect()
    // 발표 화면은 장을 줄여 그린다. 잰 값을 장의 px로 되돌린다
    const k = parent.offsetWidth ? base.width / parent.offsetWidth : 0
    if (!k) return false
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
    parent.replaceChild(frag, original)
    const covers: HTMLElement[] = []
    const position = parent.style.position
    // 원래 style 속성이 없었으면 되돌릴 때도 없게 (빈 style=""이 남으면 끝 모습의 DOM이 원래와 달라진다)
    const styled = parent.hasAttribute('style')
    // 나눈 조각과 덮은 창을 걷고 원래 글 하나로
    const undo = () => {
      covers.forEach((c) => c.remove())
      if (parts[0].parentNode === parent) parent.insertBefore(original, parts[0])
      parts.forEach((p) => p.parentNode === parent && parent.removeChild(p))
      parent.style.position = position
      if (!styled && !parent.getAttribute('style')) parent.removeAttribute('style')
    }
    const boxes = cells.map((c) => c.getBoundingClientRect())
    if (boxes.some((b) => !b.width || !b.height)) {
      undo()
      return false
    }
    if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative'
    const n = cells.length
    cells.forEach((c, i) => {
      const b = boxes[i]
      // 창 높이(=띠의 줄 높이)는 글자 상자의 높이 그대로. 잰 높이를 줄인 비율로 되돌리면 127.92처럼 조금 모자라서, 줄 높이가
      // 글자 상자보다 작아지고 글자가 줄 안에서 1px 위로 맞춰졌다. offsetHeight는 줄이기와 상관없는 장의 px다
      const h = c.offsetHeight || b.height / k
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
      cover.style.left = (b.left - base.left) / k - parent.clientLeft + 'px'
      cover.style.top = (b.top - base.top) / k - parent.clientTop + 'px'
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
      run(anims, strip, [{ translate: `0 ${stop * h}px` }], at, { easing: lively ? 'cubic-bezier(0.2, 0.75, 0.1, 1)' : 'cubic-bezier(0.25, 0.8, 0.15, 1)', duration: time })
    })
    restores.push(undo)
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
      run(anims, el, [{ clipPath: inset }, { clipPath: 'inset(0 0 0 0)' }], s(at), { easing: 'cubic-bezier(0.25, 0.8, 0.25, 1)', duration: d(duration) })
    }
    /**
   * 낱말마다 아래에서 올라오는 제목. 생동감은 번진 먹이 가라앉듯 조금 흐린 데서 또렷해지며 선다(L.ink).
   * 예전에는 기울었다가(3도) 바로 섰는데, 낱말마다 고개를 까딱여서 흔한 프레젠테이션 효과처럼 보였다
   */
    const words = (el: Element | null, at: number, gap = L.word, blur = false) => {
      if (!el || still || el.closest('[data-mo-keep]')) return at
      // 장면이 이 글을 초점으로 삼았으면 낱말 대신 한 글자씩 (결론이 한 자씩 내려앉게)
      if (el === lettersFor) return letters(el, at)
      // 편집 중인 칸의 글자는 나누지 않는다 (입력 칸을 건드리지 않게). 통째로 올라온다
      if (el.closest('.m-edit')) {
        rise(el, at, L.y * 0.6)
        return at + 240
      }
      const split = splitWords(el)
      restores.push(split.restore)
      split.words.forEach((w, i) => {
        const frames: Keyframe[] = blur
          ? // 흐림은 먹이 가라앉는 만큼만(6px). 18px이던 때는 녹화해 보니 한 문장 장의 제목이 1초 넘게 뿌연 덩어리로 떠 있어서
            // 흔한 AI 데모처럼 보였다
            [{ opacity: 0, translate: '0 0.2em', filter: 'blur(6px)' }, { opacity: 1, translate: '0 0', filter: 'blur(0px)' }]
          : L.ink
            ? [{ translate: '0 105%', filter: `blur(${L.ink}px)` }, { translate: '0 0', filter: 'blur(0px)' }]
            : [{ translate: '0 105%' }, { translate: '0 0' }]
        run(anims, w, frames, s(at + i * gap), blur ? { easing: OUT, duration: 900 } : L.move)
      })
      // 다음 차례는 마지막 낱말이 반쯤 올라왔을 때
      return at + split.words.length * gap + 160
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
      const from: Keyframe = lively ? { opacity: 0, translate: '0 0.12em', filter: 'blur(1.5px)' } : { opacity: 0, translate: '0 0.12em' }
      const to: Keyframe = lively ? { opacity: 1, translate: '0 0', filter: 'blur(0px)' } : { opacity: 1, translate: '0 0' }
      let t = at
      split.words.forEach((w, i) => {
        if (i > 0 && !split.marks[i]) t += step
        run(anims, w, [from, to], s(t), { easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)', duration: d(lively ? 620 : 520) })
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
      // 편집 중인 칸의 글자는 나누지 않는다 (입력 칸을 건드리지 않게). 통째로 올라온다
      if (el.closest('.m-edit') || el.querySelector('[contenteditable]')) {
        rise(el, at, L.y * 0.6)
        return at + 240
      }
      const split = splitWords(el)
      if (!split.words.length) return at
      restores.push(split.restore)
      // 같은 줄: 낱말 상자(.mo-w)는 줄의 위에 맞춰 서서 한 줄의 상자는 윗변이 같다
      const rows: HTMLElement[][] = []
      let top = NaN
      for (const w of split.words) {
        const b = (w.parentElement ?? w).getBoundingClientRect()
        if (!rows.length || Math.abs(b.top - top) > b.height / 2) {
          rows.push([])
          top = b.top
        }
        rows[rows.length - 1].push(w)
      }
      const lively = levelName === 'lively'
      const gap = Math.min(lively ? 130 : 90, (lively ? 900 : 700) / rows.length)
      const ripple = lively ? 12 : 8
      // 생동감은 먹이 가라앉듯 아주 조금 흐린 데서(한 글자씩과 같은 1.5px). 낱말마다의 제목(5px)만큼 흐리면 긴 글이 뿌옇게 떠 보인다
      const frames: Keyframe[] = lively
        ? [{ translate: '0 105%', filter: 'blur(1.5px)' }, { translate: '0 0', filter: 'blur(0px)' }]
        : [{ translate: '0 105%' }, { translate: '0 0' }]
      rows.forEach((row, k) => row.forEach((w, i) => run(anims, w, frames, s(at + k * gap + Math.min(i, 6) * ripple), L.move)))
      return at + rows.length * gap + 160
    }
    const count = (el: Element | null, at: number) => {
      // 편집 중인 칸의 글자는 바꾸지 않는다 (쓰고 있는 글과 엇갈리지 않게). 옮겨 온 숫자는 다시 굴리지 않는다
      if (!el || still || el.closest('.m-edit, [data-mo-keep]')) return
      // 자리마다 굴린다. 생동감은 조금 더 길게 구른다. 굴릴 수 없는 칸은 0부터 올린다
      const lively = levelName === 'lively'
      // 숫자는 장이 나오고 2초 안에 다 멈춘다(녹화해 보니 1.3초씩 굴리면 다음 장으로 넘길 때까지 굴러가고 있었다)
      if (!roll(el, s(at), lively ? 900 : 800, lively, anims, restores))
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
          { easing: 'cubic-bezier(0.2, 0.6, 0.35, 1)', duration: d(1100) },
        )
      }
    }
    /** 감싼 줄이 따로 나타나지 않는 숫자: 올라가기 시작할 때 함께 나타난다. 아직 차례가 아닌 줄에 0이 미리 보이지 않게 */
    const countIn = (el: Element | null, at: number) => {
      fade(el, at, 240)
      count(el, at)
    }
    const items = (sel: string, at: number, each: (el: HTMLElement, at: number, i: number) => void, step = L.step) => {
      $(sel).forEach((el, i) => each(el, at + i * step, i))
      return at + $(sel).length * step
    }

    // 머리: 제목 낱말 → 부제. 본문은 제목이 거의 다 올라왔을 때부터. 부품 안에서는 머리가 없다.
    // 본문 상자도 그때 함께 나타난다: 따로 움직이지 않는 줄(표의 선, 빈 막대 자리, 단위)이 장이 뜨자마자
    // 제목보다 먼저 보이면 빈 틀이 깔려 있다가 채워지는 것처럼 보인다 (녹화해 보니 그랬다)
    // 장의 머리와 본문 상자는 장 바로 아래의 것만(:scope >). 부품 장에는 본문 상자가 없고 레이아웃 부품마다 제 본문 상자가 있어서,
    // 그냥 찾으면 첫 레이아웃 부품의 본문 상자를 장 머리의 때에 흐리게 들였다(그 부품의 차례보다 먼저)
    const head = () => {
      if (scope !== slide) return 0
      const t = words(one(':scope > .s-head .s-title'), 0)
      rise(one(':scope > .s-head .s-lead'), Math.min(t, 420), L.y * 0.6)
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
        if (variant === 'full') fade(one('.cv-side'), 300, 700)
        else if (levelName === 'lively') wipe(one('.cv-side'), 0, variant === 'band' ? 'bottom' : flipped ? 'left' : 'right', 1100)
        else fade(one('.cv-side'), 0, 700)
        fade(one('.cv-logo'), 200)
        const t = words(one('.cv-title'), 180)
        rise(one('.cv-lead'), t, L.y * 0.6)
        rise(one('.cv-ask'), levelName === 'lively' ? 760 : 420)
        items('.cv-meta > *', levelName === 'lively' ? 980 : 600, (el, at) => rise(el, at, L.y * 0.5), 70)
        break
      }
      case 'section': {
        run(anims, one('.sc-num') ?? scope, [{ opacity: 0, translate: '0 22%' }], s(0), levelName === 'lively' ? SPRINGS.soft : SPRINGS.glide)
        const t = words(one('.sc-title'), 160, L.word * 1.2)
        rise(one('.sc-lead'), t, L.y * 0.6)
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
        const t = words(one('.st-title'), 0, L.word * 1.4, levelName === 'lively')
        rise(one('.st-lead'), t + 80, L.y * 0.6)
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
        rise(one('.cp-headrow'), t + 80, L.y * 0.5)
        items('.cp-row.it', t + 200, (el, at) => {
          rise(el.querySelector('.cp-l'), at, L.y * 0.6)
          nudge(el.querySelector('.cp-arrow'), at + 160)
          rise(el.querySelector('.cp-r'), at + 240, L.y * 0.6)
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
        const end = items('.pr-plan', t, (el, at) => {
          card(el, at)
          count(el.querySelector('.pr-price'), at + 120)
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
        const img = one('.ix-img img')
        if (img) run(anims, img, [{ scale: '1.16' }, { scale: '1' }], s(0), { easing: 'cubic-bezier(0.2, 0.6, 0.2, 1)', duration: 2600 })
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
          // 점과 선: 점은 선 끝을 따라 0에서 제 자리까지 미끄러진다 (선과 같은 걸음)
          const dot = el.querySelector('.br-dot')
          if (dot) run(anims, dot, [{ left: '0%' }], s(at + 120), L.grow)
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
        items('.tn-col', t, (el, at) => fade(el, at, 400), 30)
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
            { easing: 'cubic-bezier(0.45, 0, 0.25, 1)', duration: d(step) },
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
        fade(one('.tb-headrow'), t, 500)
        const end = items('.tb-row.it', t + 120, (el, at) => rise(el, at, L.y * 0.5), L.step * 0.8)
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
        if (plot) run(anims, plot, [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(-40px -40px -40px -40px)' }], s(t), { easing: 'cubic-bezier(0.25, 0.8, 0.25, 1)', duration: d(700) })
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
    const CARRY = 'cubic-bezier(0.45, 0, 0.25, 1)'
    /**
     * 데이터 조각: 길(path, host 안의 캔버스 px 점들)을 따라 건너가는 작은 네모(motion.css의 .mo-pk). 꺾이는 길은 길이대로 나눠
     * 같은 빠르기로 지난다. 떠날 때와 닿을 때 흐려져서 앞 상자에서 나와 다음 상자로 들어가는 것처럼 보인다.
     * 끝 모습에는 없다: 움직이는 동안만 붙였다가 뗀다
     */
    const packet = (host: Element | null, path: [number, number][], at: number, duration: number) => {
      if (!host || path.length < 2) return
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
      run(anims, p, frames, s(at), { easing: CARRY, duration: d(duration) })
      run(anims, p, [{ opacity: 0, scale: '0.5' }, { opacity: 1, scale: '1', offset: 0.14 }, { opacity: 1, scale: '1', offset: 0.86 }, { opacity: 0, scale: '0.5' }], s(at), { easing: 'linear', duration: d(duration) })
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
    const bend = (el: HTMLElement, at: number, duration: number, from: 'top' | 'bottom' | 'none', side: 'left' | 'right', band: number) => {
      const strip = `calc(100% - ${band}px)`
      const keep = side === 'left' ? `0 ${strip} 0 0` : `0 0 0 ${strip}`
      const flat = side === 'left' ? 'inset(0 100% 0 0)' : 'inset(0 0 0 100%)'
      const v = from === 'none' ? 0 : Math.min(0.85, el.offsetHeight / (el.offsetHeight + el.offsetWidth))
      const start = from === 'none' ? flat : side === 'left' ? (from === 'top' ? `inset(0 ${strip} 100% 0)` : `inset(100% ${strip} 0 0)`) : from === 'top' ? `inset(0 0 100% ${strip})` : `inset(100% 0 0 ${strip})`
      const frames: Keyframe[] = [{ clipPath: start }]
      if (v) frames.push({ clipPath: `inset(${keep})`, offset: v })
      frames.push({ clipPath: 'inset(0 0 0 0)' })
      run(anims, el, frames, s(at), { easing: CARRY, duration: d(duration) })
    }
    /** 선 하나를 긋는다(요소나 가짜 요소). 조각과 같은 이징, 같은 시간이라 조각이 그어지는 선 끝을 탄다 */
    const draw = (el: Element | null, at: number, duration: number, origin: string, pseudo?: string) => {
      if (!el) return
      const from = origin.startsWith('center') ? '1 0' : '0 1'
      run(anims, el, [{ scale: from, transformOrigin: origin }, { scale: '1 1', transformOrigin: origin }], s(at), { easing: CARRY, duration: d(duration) }, pseudo)
    }

    /**
     * 합계를 조각이 닿을 때마다 그만큼씩 올린다. marks는 닿는 때(ms)와 그때까지 모인 몫(0~1). 숫자가 하나만 있는 칸만(countUp과
     * 같은 조건). 한 번에 0부터 굴리면 조각이 끼워지는 것과 숫자가 따로 놀아서, 끼워질 때마다 그 몫만큼 짧게 올라가 멈춘다
     */
    const tally = (el: Element | null, marks: { at: number; upto: number }[]) => {
      if (!el || el.closest('.m-edit') || !marks.length) return
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
          fade(one('.bk-dl-l'), 80, 500)
          rise(one('.bk-dl-from'), 140, L.y * 0.4)
          const arrow = one('.bk-dl-arrow')
          if (arrow) run(anims, arrow, [{ opacity: 0, translate: `${-L.y * 0.6}px 0` }], s(320), L.move)
          rise(one('.bk-dl-to'), 420, L.y * 0.5)
          count(one('.bk-dl-to .bk-dl-v'), 440)
          pop(one('.bk-dl-chip'), 900)
          fade(one('.bk-dl-n'), 980, 500)
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
          // 점이 많아도 1초 안에 다 맺히게
          const dots = $('.bk-rt-d')
          const step = Math.min(L.step, 900 / Math.max(1, dots.length))
          dots.forEach((el, i) => (el.classList.contains('is-on') ? pop(el, 240 + i * step) : fade(el, 240 + i * step, 300)))
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
            pop(el.querySelector('.bk-ck-mark'), at + 140)
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
          // 기간 칸과 지금 띠가 먼저 깔리고, 할 일마다 이름이 올라오며 막대가 시작 칸에서 끝 칸으로 그어진다
          lines(one('.bk-h'), 60)
          fade(one('.bk-gt-cols'), 120, 500)
          fade(one('.bk-gt-now'), 160, 800)
          items('.bk-gt-row', 240, (el, at) => {
            ruled(el, at)
            rise(el.querySelector('.bk-gt-label'), at, L.y * 0.4)
            grow(el.querySelector('.bk-gt-bar'), at + 120, 'x')
          })
          break
        case 'people': {
          lines(one('.bk-h'), 60)
          const tree = one('.va-tree .bk-pp-list')
          if (tree) {
            // 체계도: 이끄는 사람이 먼저 올라오고, 그 아래 선이 내려와 가운데에서 양옆으로 퍼진 뒤,
            // 맡은 사람마다 선이 내려오며 글이 올라온다. 선은 칸의 가짜 요소라 칸이 아니라 글만 올린다(칸을 숨기면 선도 숨는다)
            const [lead, ...team] = Array.from(tree.querySelectorAll<HTMLElement>(':scope > .bk-pp-card'))
            rise(lead?.querySelector('.bk-pp-text') ?? null, 160, L.y * 0.5)
            if (team.length) {
              grow(lead, 520, 'down', '::after')
              run(anims, tree, [{ scale: '0 1', transformOrigin: 'center' }, { scale: '1 1', transformOrigin: 'center' }], s(680), L.grow, '::before')
              team.forEach((el, i) => {
                grow(el, 860 + i * L.step, 'down', '::before')
                rise(el.querySelector('.bk-pp-text'), 920 + i * L.step, L.y * 0.4)
              })
            }
            break
          }
          items('.bk-pp-card', 160, (el, at) => {
            // 목록 모양은 줄 사이에 선이 있고, 나란히는 사람마다 위에 선이 있다(왼쪽에서부터 긋는다)
            if (cell.classList.contains('va-list')) ruled(el, at)
            else grow(el, at, 'x', '::before')
            rise(el.querySelector('.bk-pp-text'), at + 100, L.y * 0.4)
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
          const img = one('.bk-img-i img')
          if (img && !fit) run(anims, img, [{ scale: '1.12' }, { scale: '1' }], s(0), { easing: 'cubic-bezier(0.2, 0.6, 0.2, 1)', duration: 2200 })
          fade(one('.bk-img-c'), 600, 500)
          break
        }
        case 'decision':
          fade(one('.bk-dc-label'), 40, 400)
          rise(one('.bk-dc-question'), 100, L.y * 0.5)
          items('.bk-dc-row', 240, (el, at) => rise(el, at, L.y * 0.4))
          break
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
          const hl = one('.bk-fw-node.is-hl')
          // 부풀기는 transform으로: 나타날 때 쓴 scale과 같은 속성이면 늦게 만든 이것이 시작 전(fill backwards)부터 scale을 덮어 나타나기가 사라진다
          if (hl && links.length) run(anims, hl, [{ transform: 'scale(1)' }, { transform: 'scale(1.03)' }, { transform: 'scale(1)' }], s(again - 60), { easing: 'ease-in-out', duration: d(480) })
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
          const step = Math.min(levelName === 'lively' ? 170 : 140, 700 / order.length)
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
            run(anims, bar, [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }], s(60), { easing: 'cubic-bezier(0.65, 0, 0.25, 1)', duration: d(720) })
            run(anims, bar, [{ columnGap: '0px' }], s(open), { easing: 'cubic-bezier(0.3, 0, 0.2, 1)', duration: d(460) })
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
          const step = Math.min(lively ? 130 : 110, 560 / Math.max(1, parts.length))
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
        case 'tiles': {
          // 흩어져 있던 칸이 단마다 왼쪽부터 날아와 한 판으로 맞춰지고(모두 옅은 칸으로), 다 맞춰질 즈음 채운 칸이 차례로(왼쪽 단부터,
          // 단마다 아래에서 위로) 물든다. 숫자는 칸이 물드는 만큼 오른다
          fade(one('.bk-tl-l'), 60, 500)
          rise(one('.bk-tl-v'), 120, L.y * 0.4)
          fade(one('.bk-tl-of'), 200, 500)
          fade(one('.bk-tl-n'), 260, 500)
          const root = one('.bk-tl')
          const grid = one('.bk-tl-grid')
          const sqs = $('.bk-tl-sq')
          if (!root || !grid || !sqs.length) {
            count(one('.bk-tl-v'), 160)
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
          // 눈금이 먼저 깔리고, 범위 띠가 제 가운데에서 양쪽으로 열리며 양 끝 값이 따라 나온다. 표시 고리는 띠가 다 열릴 즈음 위에서 내려앉는다
          fade(one('.bk-rn-l'), 60, 500)
          fade(one('.bk-rn-fig'), 100, 300)
          const band = one('.bk-rn-band')
          if (band) run(anims, band, [{ scale: '0 1', transformOrigin: 'center' }, { scale: '1 1', transformOrigin: 'center' }], s(160), L.grow)
          rise(one('.bk-rn-ends'), 220, L.y * 0.4)
          const mark = one('.bk-rn-mark')
          if (mark) run(anims, mark, [{ opacity: 0, translate: `0 ${-L.y * 0.8}px` }], s(520), L.pop)
          fade(one('.bk-rn-mk'), 640, 400)
          fade(one('.bk-rn-n'), 700, 500)
          break
        }
        case 'status':
          // 상태 표시가 먼저 맺히고(상태가 이 컴포넌트의 답) 이름이 뒤따른다. 할 일은 그 아래에서 올라온다
          pop(one('.bk-ss-mark'), 80)
          fade(one('.bk-ss-name'), 160, 400)
          rise(one('.bk-ss-w'), 220, L.y * 0.4)
          fade(one('.bk-ss-m'), 420, 500)
          break
        case 'steps': {
          // 옅은 선이 왼쪽부터 그어지고, 선이 닿는 차례로 점이 맺힌다. 지난 단계의 글자색 선이 뒤따라 지금 단계까지 가면 그 점이 커지며
          // 들어오고 번호가 굴러 맞춰진다. 단계 이름은 제 점이 맺힌 뒤에
          fade(one('.bk-stp-l'), 0, 500)
          const list = one('.bk-stp-list')
          const span = levelName === 'lively' ? 900 : 760
          draw(list, 60, span, 'left center', '::before')
          const dots = $('.bk-stp-dot')
          const last = Math.max(dots.length - 1, 1)
          const now = $('.bk-stp-it').findIndex((it) => it.classList.contains('is-now'))
          dots.forEach((dot, i) => {
            const at = 60 + (i / last) * span * 0.75
            if (i === now) return
            run(anims, dot, [{ opacity: 0, scale: '0.5' }], s(at), { easing: OUT, duration: d(320) })
          })
          const reach = now < 0 ? 0 : (now / last) * span
          if (now > 0) draw(list, 180, Math.max(reach, 300), 'left center', '::after')
          if (now >= 0) pop(dots[now], 180 + reach * 0.85)
          rise(one('.bk-stp-now'), 120, L.y * 0.4)
          count(one('.bk-stp-k'), 140)
          $('.bk-stp-t').forEach((t, i) => fade(t, 160 + (i / last) * span * 0.75, 400))
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
    /** 카메라: 천천히 떠나 길게 멈춘다. 먹이 가라앉듯 끝에서 오래 머물러서 언제 멈췄는지 눈에 띄지 않는다 */
    const CAMERA = 'cubic-bezier(0.33, 0, 0.12, 1)'

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
              { clipPath: 'inset(0 0% 0 0%)', offset: 0.7, easing: 'cubic-bezier(0.55, 0, 0.3, 1)' },
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
            frames.push({ clipPath: cut(100), offset: (tail - T0) / total, easing: 'cubic-bezier(0.55, 0, 0.3, 1)' })
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
              layer(picture, [{ scale: '1.14', translate: '-1.6% 0.8%' }, { scale: '1', translate: '0 0' }], begin, { easing: 'cubic-bezier(0.25, 0.1, 0.2, 1)', duration: d(5200) })
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
              { easing: 'cubic-bezier(0.55, 0, 0.18, 1)', duration: d(1300) },
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
      try {
        make()
      } finally {
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
      if (after) after()
    })

    /** 누르면: 다음 묶음을 보이고 그 자리에서 움직인다. 장 바꾸기의 기다림 없이 바로 */
    const next = () => {
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
      waiting.splice(0).forEach((g) => hold(g, false))
      for (const b of batches) {
        b.anims.forEach((a) => a.finish())
        b.stops.forEach((f) => f())
        b.restore()
      }
    }
    return Object.assign(finish, { next, left: () => waiting.length })
  }

  // ---------- 이어 움직이기 ----------
  // 앞 장과 다음 장에 같은 것이 있으면 사라졌다 나타나지 않고 새 자리와 크기로 옮겨 간다(View Transitions의 이름 붙인 요소).
  // 같은 것: 글이 같은 제목(표지 제목이 다음 장의 제목이 되는 것도), 글이 같은 컴포넌트, 두 장에 하나씩뿐인 같은 종류의 컴포넌트
  // (숫자만 바뀐 차트가 제자리에서 바뀌게). 복제한 장은 id가 새로 나와서 id가 아니라 내용으로 짝을 맞춘다

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

  /** 요소마다 짝을 찾을 열쇠들 (앞의 것일수록 먼저 맞춘다) */
  function morphKeys(slide: Element): { el: HTMLElement; keys: string[] }[] {
    const text = (el: Element) => (el.textContent || '').replace(/\s+/g, ' ').trim()
    const out: { el: HTMLElement; keys: string[] }[] = []
    const titles = Array.prototype.slice.call(slide.querySelectorAll(':scope > .s-head .s-title, .cv-title, .sc-title, .st-title')) as HTMLElement[]
    for (const el of titles) if (text(el)) out.push({ el, keys: ['title:' + text(el)] })
    const cells = Array.prototype.slice.call(slide.querySelectorAll('.bk-area > .bk')) as HTMLElement[]
    const count: Record<string, number> = {}
    for (const el of cells) count[el.dataset.type || ''] = (count[el.dataset.type || ''] || 0) + 1
    for (const el of cells) {
      const type = el.dataset.type || ''
      const keys = ['bk:' + type + ':' + text(el)]
      if (count[type] === 1) keys.push('bk1:' + type)
      out.push({ el, keys })
    }
    return out
  }

  /** 앞 장의 것에 이름을 붙인다 (전환이 앞 장을 찍기 전에) */
  function nameFrom(slide: Element) {
    morphFrom = new Map()
    morphKeys(slide).forEach(({ el, keys }, i) => {
      const name = 'mo-k' + i
      el.style.setProperty('view-transition-name', name)
      named.push(el)
      for (const k of keys) if (!morphFrom!.has(k)) morphFrom!.set(k, name)
    })
  }

  /** 다음 장에서 짝이 있는 것에 같은 이름을 붙이고, 다시 들이지 않게 표시한다. 글이 같은 짝을 먼저, 종류만 같은 짝은 그다음 */
  function pairUp(slide: Element) {
    const from = morphFrom
    morphFrom = null
    if (!from) return
    // 앞 장은 이미 찍혔다. 앞 장이 그대로 남는 곳(내보낸 HTML은 모든 장이 문서에 있다)에서 이름이 겹치지 않게 앞 장의 이름을 뗀다
    for (const el of named.splice(0)) el.style.removeProperty('view-transition-name')
    const used = new Set<string>()
    const fresh = morphKeys(slide)
    const taken = new Set<HTMLElement>()
    for (const pass of [0, 1]) {
      for (const { el, keys } of fresh) {
        const name = keys[pass] && from.get(keys[pass])
        if (!name || used.has(name) || taken.has(el)) continue
        used.add(name)
        taken.add(el)
        el.style.setProperty('view-transition-name', name)
        el.setAttribute('data-mo-keep', '')
        named.push(el)
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
      if (old) nameFrom(old)
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
    for (const el of named.splice(0)) {
      el.style.removeProperty('view-transition-name')
      el.removeAttribute('data-mo-keep')
    }
  }

  return { play, swap }
}

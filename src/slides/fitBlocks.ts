/**
 * 부품 장에서 칸에 다 들어가지 않는 부품을 잘리지 않게 맞춘다.
 * 부품을 놓을 때는 잘리지 않는 자리만 고르지만, 놓은 뒤에 항목을 더하거나 글을 길게 쓰면 넘칠 수 있다.
 *
 * 칸의 자리는 판(deck/blocks/board.ts)이 부품마다 잘리지 않는 크기로 나눠 두었다. 잰 높이(blockHeights.ts)는 보통 글자 크기라
 * 크게나 명조에서는 모자랄 수 있고, 놓은 뒤에 글을 길게 쓰면 넘칠 수 있다.
 * 3. 그래서 칸 안의 글이 넘치거나 서로 겹치는 부품은 글자를 단계로 줄인다(--bk-fit). 단계라서 같은 장의 비슷한 칸끼리 크기가 같다.
 *    카드와 강조색 면은 안쪽 여백까지 내려간 글도 넘친 것으로 본다.
 * 3-1. 거꾸로 장에 자리가 남으면(넘치는 칸이 하나도 없으면) 모든 칸의 글과 그림을 같은 비율로 단계로 키운다.
 *    내용이 적은 장에서 작은 글이 넓은 칸 한쪽에만 있으면 칸이 비어 보인다. 모든 칸을 같이 키워서 칸끼리 크기는 그대로 맞는다.
 * 3-2. 쌓은 뒤에도 내용이 본문 높이의 60%에 못 미치면(docs/VISUAL-RULES.md 6) 글자와 그림을 한 단계 더(1.44) 키우고, 그래도 비면
 *    줄 사이를 장 안의 모든 칸에 같은 값으로 넓힌다(--bk-air, 12px까지). 칸마다 바닥까지 따로 채우지는 않는다: 줄 사이가 칸마다 달라 보였다.
 *    레이아웃 장도 같다(fitLayout: 본문 .s-body의 --bk-fit, --fill-air. 사례 장은 두 단의 .cs-story, .cs-results).
 *
 * 3-3. 한 줄에 부품이 둘 이상이면 부품마다 위에서부터 그린다(소제목 윗선을 맞춘다, blocks.css). 이음표가 선 줄도 같다. 칸 높이를 다 쓰는
 *    부품(차트, 표) 옆의 숫자 부품만 한두 단계 키운다. 짧은 부품을 가운데로 내리지 않는다: 남는 높이는 3-4가 맨 아래에 모은다.
 *
 * 3-4. 발표 화면과 편집 화면에서는 판을 위아래로 나눈 줄마다 그려진 내용을 앞 줄 내용 바로 아래(--bk-gap, 소제목 아래는 좁게)에 붙이고,
 *    남는 높이는 맨 아래 한곳에 모은다(--bk-shift, 캔버스 px, 칸째 옮긴다). 본문은 장 제목 아래 --body-gap에서 시작하고(docs/VISUAL-RULES.md 6),
 *    제목 없는 한 문장 장만 위아래 가운데에 둔다. 앞 줄 내용이 제 칸보다 길게 그려졌으면 아래 줄을 그만큼 내려 겹치지 않게 한다.
 *
 * 4. 위치 비교의 이름표는 그려진 크기로 서로, 그리고 다른 점과 겹치지 않는 자리를 다시 고른다(labels).
 *
 * 발표할 때 움직이는 중인 장(motion/engine.ts가 data-mo-play를 붙인다)은 재지 않는다. 그동안 글자와 막대는 옮겨지거나 커지는 중이고
 * 숫자는 0부터 굴러가는 중이라, 재면 끝 모습과 다른 값이 나온다: 움직이며 넘긴 장은 글자를 줄이고, 뒤로 돌아온 장(움직이지 않는다)은
 * 키워서 같은 장이 넘긴 길에 따라 달라 보였다. 맞춘 값은 그대로 두고 움직임이 끝나면(mo-end) 다시 맞춘다. 처음 맞추기는
 * 움직임이 걸리기 전이다(BlockArea의 layout effect가 발표 화면의 움직임보다 먼저, 뷰어는 파일을 열 때).
 *
 * 앱과 내보낸 HTML(export/viewer.ts가 blockFitter의 소스를 그대로 넣는다)이 같이 쓴다. 그래서 안에서 바깥의 이름을 쓰지 않는다.
 * 부품의 잘리지 않는 높이를 잴 때(screens/measureBlocks.ts)도 이것으로 맞추고, 글 줄의 자리도 이것으로 본다.
 */
export function blockFitter() {
  // 글자 크기 비율(1.2)의 단계: 한 단계, 두 단계. 칸 크기로 정한 단계(--bk-w, --bk-h)와 같은 값이라 줄여도 크기가 단계 위에 있다
  const steps = [0.84, 0.7]
  // 키울 때도 한 단계만: 더 키우면 내용이 적은 장의 글자가 장 제목보다 커진다
  const ups = [1.2]
  // 쌓은 뒤에도 본문이 60% 넘게 빈 장만 한 단계 더 (fit의 끝)
  const more = 1.44
  // 그래도 빈 장은 줄 사이를 넓힌다: 줄의 위아래에 더하는 캔버스 px. 넘게 벌리면 줄끼리 따로 떨어져 보여서 이만큼까지만
  const airMax = 12
  // 레이아웃 장의 채움(본문 윗선부터 장 틀의 아랫선까지, VISUAL-RULES 6): 60% 밑이면 글자 단계를 올리고, 80% 밑이면 줄 사이를
  // 85%까지 넓히고, 그래도 75% 밑이면 눈높이 가운데로 내린다. 72%가 위에 붙은 비교 장도 아래가 220px 넘게 비어 보였다
  const FILL_MIN = 0.6
  const FILL_EYE = 0.75
  const FILL_AIR = 0.8
  const FILL_MAX = 0.85
  // 넘침 경고(slides/overflow.ts)가 넘쳤는지 보는 상자들. 바깥 이름을 쓰지 못해 따로 적고, 같은 목록인지는 테스트가 본다
  const OVER_BOXES = '.s-body, .ix-text, .cs-main, .cs-side, .cl-main, .cv-main, .ag, .bk-in'
  let range: Range | null = null
  // 잰 글 줄과 그림을 담아 두는 곳. 쓰는 쪽(fitLayout)이 값을 적을 때마다 새로 만들고 다 쓰면 null로 둔다(그 밖에서는 늘 새로 잰다)
  let memo: Map<Node, Map<string, unknown>> | null = null
  function remember<T>(el: Node, key: string, f: () => T): T {
    if (!memo) return f()
    let m = memo.get(el)
    if (!m) memo.set(el, (m = new Map()))
    if (!m.has(key)) m.set(key, f())
    return m.get(key) as T
  }
  let ctx: CanvasRenderingContext2D | null | undefined
  let inks: Record<string, [number, number]> = {}
  // 움직임이 끝나기를 기다리는 본문 상자와 판 (같은 것을 여러 번 기다리지 않게)
  const waiting = new WeakSet<Element>()
  // 점 숫자가 둘 자리를 찾지 못한 추이의 그림 (trendPlace가 적고 crowded가 본다)
  const cramped = new WeakSet<Element>()
  // 편집 화면에서 글을 쓰는 동안 붙잡아 둔 자리 (본문 상자마다, typing의 설명): 판의 짜임, 눈높이로 내린 값, 칸마다 옆으로 옮긴 값,
  // 키운 단계(--bk-fit의 가장 큰 값)
  const held = new WeakMap<HTMLElement, { board: string; eye: number; xs: Map<string, number>; contentXs: Map<string, number>; up: number }>()
  // 편집 화면의 컴포넌트 칸마다 지난번에 맞춘 뒤의 자리 (본문 상자 위에서부터, 캔버스 px). 쓰는 칸이 든 칸을 이 자리에 붙잡는다 (anchor)
  const tops = new WeakMap<Element, number>()

  /**
   * 편집 화면에서 이 본문 상자의 글 칸에 쓰는 중인지. 쓰는 동안에는 장 전체를 옮기는 맞추기(눈높이 가운데, 단의 남는 너비)를 쓰기 전에
   * 맞춘 값 그대로 둔다: 글자마다 다시 맞추면 안내 문구가 글로 바뀌는 첫 글자에 칸이 옆으로 700px 미끄러지거나(숫자 한 줄의 긴 안내),
   * 줄이 늘 때마다 장 전체가 위아래로 출렁여서 쓰는 칸이 손 아래에서 달아났다. 다 쓰고 나가면 다시 맞춘다(BlockArea)
   */
  function typing(area: HTMLElement): boolean {
    const el = document.activeElement
    return !!el && el.classList.contains('ed-input') && area.classList.contains('is-live') && area.contains(el)
  }

  /** 편집 화면에서 이 레이아웃 장의 글 칸에 쓰는 중인지 (fitPart가 눈높이와 키운 단계를 붙잡아 둔다) */
  function typingIn(slide: HTMLElement): boolean {
    const el = document.activeElement
    return !!el && el.classList.contains('ed-input') && slide.classList.contains('m-edit') && slide.contains(el)
  }
  // 레이아웃 장의 본문마다 쓰기 전에 맞춘 눈높이(--eye, 캔버스 px)와 키운 단계(--bk-fit)
  const heldLayout = new WeakMap<HTMLElement, { eye: number; up: number }>()

  /** 판의 짜임 (칸마다 부품과 자리). 붙잡아 둔 자리는 짜임이 그대로일 때만 쓴다 */
  function boardOf(cells: HTMLElement[]): string {
    return cells.map((c) => `${c.dataset.block}@${['--x', '--y', '--w', '--h'].map((v) => c.style.getPropertyValue(v)).join(',')}`).join('|')
  }

  /**
   * 안쪽 상자(.bk-in)의 글 없는 그림: 맨 바깥 svg와 읽지 않는 그림 상자(aria-hidden). 크기가 없는 것은 뺀다.
   * 글 줄만 보면 카드 아래 여백 밖으로 밀려난 차트의 점과 선을 놓쳐서, 맞추기(over)와 잘리지 않는 높이 재기가 같이 본다.
   * 이 함수 밖에 두면 내보낸 HTML에서는 없는 이름이라 맞추기가 처음부터 멈췄다(뷰어는 blockFitter의 소스만 넣는다)
   */
  function figures(inner: HTMLElement): Element[] {
    return remember(inner, 'f', () => figuresNow(inner))
  }
  function figuresNow(inner: HTMLElement): Element[] {
    return Array.from(inner.querySelectorAll(':scope svg, :scope [aria-hidden="true"]')).filter((el) => {
      if (el.parentElement?.closest('svg')) return false
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0
    })
  }

  /** 이것을 움직이는 중인 요소(그 장, 또는 그 안의 부품 하나). 없으면 null */
  function moving(el: Element): Element | null {
    return el.closest('[data-mo-play]') || el.querySelector('[data-mo-play]')
  }

  /**
   * 편집 화면에서 다시 맞춘 자리로 미끄러지는 중인 것(slides/liveMotion.ts, 움직임 이름 'ed-live': 이 함수는 내보낸 HTML에 소스째
   * 들어가 그 파일을 가져오지 못한다)을 끝 시각으로 옮겨 둔다. 움직이는 중의 자리(translate, scale)로 재면 넘침과 쌓기가 엉뚱하게 나온다.
   * 맞춘 뒤에 돌려놓을 시각을 준다(보이는 움직임은 그대로 이어진다)
   */
  function settled(root: Element): { a: Animation; t: CSSNumberish | null }[] {
    const out: { a: Animation; t: CSSNumberish | null }[] = []
    if (typeof root.getAnimations !== 'function') return out
    for (const a of root.getAnimations({ subtree: true })) {
      const end = a.effect?.getComputedTiming().endTime
      if (a.id !== 'ed-live' || a.playState !== 'running' || typeof end !== 'number') continue
      out.push({ a, t: a.currentTime })
      a.currentTime = end
    }
    return out
  }

  /**
   * 움직임이 끝나면 다시 맞춘다. 장을 넘겨서 끝난 움직임이면 그 장은 곧 빠지므로, 끝난 차례에 바로 재지 않고 한 박자 뒤에
   * (빠진 장은 크기가 없어 건너뛴다)
   */
  function later(el: Element, mover: Element, again: () => void): void {
    if (waiting.has(el)) return
    waiting.add(el)
    mover.addEventListener(
      'mo-end',
      () => {
        waiting.delete(el)
        Promise.resolve().then(again)
      },
      { once: true },
    )
  }

  /**
   * 글자 상자(글꼴의 위아래 여백까지 든 높이) 가운데 위와 아래로 비어 있는 몫. 글꼴마다, 글마다 다르다:
   * 한글은 상자를 거의 채우고 숫자는 키가 작으며, 명조는 고딕보다 상자가 크다. 그래서 그 글을 캔버스에 그려 잰다
   */
  function ink(el: Element, text: string): [number, number] {
    const cs = getComputedStyle(el)
    const key = cs.fontFamily + '|' + cs.fontWeight + '|' + text
    const known = inks[key]
    if (known) return known
    let v: [number, number] = /[가-힣]/.test(text) ? [0.12, 0.12] : [0.2, 0.2]
    if (ctx === undefined) ctx = document.createElement('canvas').getContext('2d')
    if (ctx) {
      ctx.font = cs.fontWeight + ' 100px ' + cs.fontFamily
      const m = ctx.measureText(text)
      const box = m.fontBoundingBoxAscent + m.fontBoundingBoxDescent
      if (box > 0) v = [Math.max(0, (m.fontBoundingBoxAscent - m.actualBoundingBoxAscent) / box), Math.max(0, (m.fontBoundingBoxDescent - m.actualBoundingBoxDescent) / box)]
    }
    inks[key] = v
    return v
  }

  /**
   * 칸 안쪽(.bk-in)의 글 줄마다 글자가 그려지는 자리(화면 px). 꾸밈 글자(인용 부호처럼 aria-hidden)는 일부러 글 뒤에 깔아서 뺀다.
   * hints면 편집 화면의 빈칸 안내(.ed-hint)도 글로 센다: 자리를 재는 일(drawn, drawnX, 쌓기의 첫 글줄)이 안내를 빼면 빈 부품은
   * 그려진 것이 없어서 위아래 균형에서 빠졌다가, 첫 글자를 치는 순간 들어와 부품이 수백 px 내려갔다.
   * marks면 읽지 않는 표시 글자(강점과 약점의 S, W, O, T, 걱정과 대책의 머리말 같은 aria-hidden 글)도 센다(편집 표시는 빼고):
   * 그려진 범위(drawn)가 그것을 빼면, 발표 화면에서 칸이 비어 표시 글자만 남은 줄을 쌓기가 없는 것으로 알고 아랫줄 글에 맞춰
   * 부품을 위로 끌어올려서 S, W가 앞 부품의 글 위에 겹쳤다
   */
  function lines(inner: HTMLElement, hints = false, marks = false): { n: Node; t: number; b: number; l: number; r: number }[] {
    return remember(inner, `l${+hints}${+marks}`, () => linesNow(inner, hints, marks))
  }
  function linesNow(inner: HTMLElement, hints: boolean, marks: boolean): { n: Node; t: number; b: number; l: number; r: number }[] {
    const out: { n: Node; t: number; b: number; l: number; r: number }[] = []
    if (!range) range = document.createRange()
    const walk = document.createTreeWalker(inner, NodeFilter.SHOW_TEXT)
    while (walk.nextNode()) {
      const n = walk.currentNode
      const text = (n.textContent || '').trim()
      const el = n.parentElement
      if (!text || !el) continue
      // 꾸밈 글자는 재는 상자 안에서 읽지 않게 둔 것만이다. 장을 통째로 감춘 바깥 상자(PPT 그림을 그리는 화면 밖 상자,
      // 프레임 잡기의 미리 보기)까지 보면 장의 글이 모두 꾸밈 글자가 되어, 그 장에서는 넘침도 채움도 재지 못했다
      const hidden = el.closest('[aria-hidden="true"]')
      if (hidden && hidden !== inner && inner.contains(hidden) && !(hints && hidden.classList.contains('ed-hint')) && !(marks && !el.closest('svg, .ed-halo, .it-remove, .it-grip, .pn-tools, .img-tools, .bk-handle'))) continue
      // 일부러 숨긴 글(쌓은 막대에서 칸보다 큰 칸 안 숫자)은 그려지지 않으니 넘침으로 세지 않는다
      const cs = getComputedStyle(el)
      if (cs.visibility === 'hidden') continue
      const [up, down] = ink(el, text.slice(0, 60))
      range.selectNodeContents(n)
      const rects = range.getClientRects()
      // 편집 칸은 띄어쓰기를 그대로 두는 pre-wrap이라 줄 끝의 띄어쓰기가 칸 밖으로 걸려 있고 줄 상자도 그만큼 넓다.
      // 그것까지 글로 세면 편집 화면에서만 넘친 것으로 보여 글자가 한 단계 작아진다. 그래서 줄 끝의 띄어쓰기 자리를 뺀다
      const spaces: DOMRect[] = []
      const ws = cs.whiteSpace
      if (ws === 'pre-wrap' || ws === 'break-spaces') {
        const raw = n.textContent || ''
        for (let i = 0; i < raw.length; i++) {
          if (raw[i] !== ' ') continue
          range.setStart(n, i)
          range.setEnd(n, i + 1)
          spaces.push(range.getBoundingClientRect())
        }
      }
      for (let i = 0; i < rects.length; i++) {
        const q = rects[i]
        if (!q.width || !q.height) continue
        // 뒤에서부터 보면 줄 끝에 띄어쓰기가 여럿 있어도 한 번에 뺀다
        let right = q.right
        for (let j = spaces.length - 1; j >= 0; j--) {
          const sp = spaces[j]
          if (sp.width && Math.abs(sp.right - right) < 1 && sp.top < q.bottom && sp.bottom > q.top) right = sp.left
        }
        out.push({ n, t: q.top + q.height * up, b: q.bottom - q.height * down, l: q.left, r: right })
      }
    }
    return out
  }

  /**
   * 칸 안의 글이 안쪽 상자를 넘거나 다른 글과 겹치는지. 글이 안쪽 상자의 자식(가운데 맞춘 묶음 같은) 밖으로 넘치면
   * scrollHeight는 안쪽 여백만큼을 넘침으로 세지 않아서, 카드 아래 여백을 먹고 들어간 글을 놓친다. 그래서 글 줄의 자리로도 본다
   */
  function over(inner: HTMLElement, tight = false): boolean {
    // 줄일지 볼 때는 4px까지 봐준다: 명조처럼 글자 윗선·아랫선이 높은 글꼴은 큰 숫자의 줄 상자가 칸 끝에서 몇 px 비어져 나와도
    // 글자는 칸 안에 있다(글자가 넘치는지는 아래에서 글 줄의 자리로 본다). 2px로 두면 핵심 숫자가 칸 높이 한 점(530px)에서만 한 단계 작아졌다.
    // 키울 때(crowded)는 2px로 엄격하게: 4px까지 키우면 칸마다 끝에 닿도록 커진다
    const slackPx = tight ? 2 : 4
    if (inner.scrollHeight > inner.clientHeight + slackPx || inner.scrollWidth > inner.clientWidth + slackPx) return true
    const r = inner.getBoundingClientRect()
    // 편집 화면과 갤러리는 장을 줄여 그려서, 여백(캔버스 px)을 화면 px로 바꾼다
    const k = inner.offsetWidth ? r.width / inner.offsetWidth : 1
    const cs = getComputedStyle(inner)
    // 여백 안으로 8px까지는 봐준다 (그 정도는 여백이 무너져 보이지 않는다)
    const pad = (v: string) => Math.max(0, parseFloat(v) - 8) * k
    // 글 줄이 여백에 걸쳐도 되는 틈도 캔버스 px로(2px, 잘리지 않는 높이를 재는 갤러리의 반 크기 장에서 화면 1px).
    // 화면 px로 두면 장을 그리는 크기마다 기준이 달라서, 내보낸 파일을 열었을 때(줄여 그린다)와 발표할 때(꽉 채운다) 글자 크기가 달랐다.
    // 키울 때(tight)는 틈 없이: 이 틈만큼 키우면 잘림 검사(screens/measureBlocks.ts, 여백 8px까지)보다 1~2px 깊이 들어갔다
    // (숫자 한 줄을 옆 큰 숫자에 맞춰 키우자 카드 아래 설명이 1.3px 넘어 '칸 밖'이 됐다)
    const slack = (tight ? 0 : 2) * k
    const top = r.top + pad(cs.paddingTop) - slack
    const bottom = r.bottom - pad(cs.paddingBottom) + slack
    const left = r.left + pad(cs.paddingLeft) - slack
    const right = r.right - pad(cs.paddingRight) + slack
    const ls = lines(inner)
    for (const q of ls) if (q.t < top || q.b > bottom || q.l < left || q.r > right) return true
    // 글이 없는 그림도 같은 자리 안에: 글자를 키우면 글 아래의 차트가 밀려 내려가 점이 카드 아래 여백 밖으로 나갔는데,
    // 글만 보면 넘치지 않은 것으로 알고 글자를 그대로 두거나 더 키웠다(한 개의 흐름, 몇 중 몇)
    for (const f of figures(inner)) {
      const q = f.getBoundingClientRect()
      if (q.top < top || q.bottom > bottom || q.left < left || q.right > right) return true
    }
    // 칠한 면이 늘어선 것(색 표의 칸들, data-fit-box)은 안쪽 여백에 조금도 들어가지 않게: 글자는 여백에 몇 px 걸쳐도 티가 안 나지만
    // 칠한 칸이 들어가면 그쪽 여백만 좁아 보인다(크게에서 색 표 여덟 줄이 아래 여백을 6px 먹어 위 51, 아래 38)
    // 줄은 묶음 상자 밖으로 넘칠 수 있어서(1fr 줄의 바닥은 내용) 묶음 안의 줄마다 본다
    for (const f of Array.from(inner.querySelectorAll('[data-fit-box] > *'))) {
      const q = f.getBoundingClientRect()
      if (q.top < r.top + parseFloat(cs.paddingTop) * k - slack || q.bottom > r.bottom - parseFloat(cs.paddingBottom) * k + slack) return true
    }
    // 겹침은 캔버스 2px 넘게 (줄여 그린 화면에서도 같은 기준)
    const gap = 2 * k
    const hit = (a: { t: number; b: number; l: number; r: number }, b: { top: number; bottom: number; left: number; right: number }) =>
      Math.min(a.r, b.right) - Math.max(a.l, b.left) > gap && Math.min(a.b, b.bottom) - Math.max(a.t, b.top) > gap
    // 글자를 키우면(크게, 명조) 정한 자리의 이름과 설명이 서로 올라탄다
    for (let i = 0; i < ls.length; i++) {
      for (let j = i + 1; j < ls.length; j++) {
        const b = ls[j]
        if (ls[i].n !== b.n && hit(ls[i], { top: b.t, bottom: b.b, left: b.l, right: b.r })) return true
      }
    }
    // 항목의 글이 옆 항목의 자리로 넘어가는 것: 좁은 칸에서 막대 위 숫자가 옆 막대를 덮거나, 낮은 칸에서 줄이 다음 줄에 올라탄다
    const items = Array.from(inner.querySelectorAll<HTMLElement>('.it'))
    if (items.length > 1) {
      const boxes = items.map((el) => el.getBoundingClientRect())
      for (const q of ls) {
        const own = q.n.parentElement && q.n.parentElement.closest('.it')
        if (!own) continue
        for (let i = 0; i < items.length; i++) {
          const b = boxes[i]
          if (items[i] === own || items[i].contains(own) || own.contains(items[i]) || !b.width || !b.height) continue
          if (hit(q, b)) return true
        }
      }
    }
    return false
  }

  /**
   * 글 칸이 그려진 줄 수 (줄의 윗선이 글자 높이의 반 넘게 다르면 다른 줄). 글 조각만 센다: 편집 화면의 칸 테(.ed-halo)는 글 위아래로
   * 넓어서 상자째 세면 한 줄 칸이 두 줄로 보였다
   */
  function rowsOf(el: Element): number {
    if (!range) range = document.createRange()
    const tops: number[] = []
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    while (walk.nextNode()) {
      range.selectNodeContents(walk.currentNode)
      for (const q of Array.from(range.getClientRects())) if (q.width > 1 && !tops.some((t) => Math.abs(t - q.top) < q.height / 2)) tops.push(q.top)
    }
    return tops.length
  }

  /**
   * 흐름의 단계 이름은 짧은 이름표라 한 줄에 둔다(docs/DESIGN.md '흐름'). 이름이 꺾이면 이름, 번호, 설명을 같이 한 단계(1.2)씩 내려
   * 모든 이름이 한 줄에 드는 가장 큰 단계를 고른다(--fw-fit, flow.css). 판을 혼자 쓰는 흐름은 이름을 52까지 키워서, 다섯 단계면 단계 칸이
   * 좁아 '각자 / 만들기'처럼 두 낱말 이름이 반으로 꺾이고 한 낱말 이름만 한 줄이라 이름과 설명의 윗선이 들쭉날쭉했고 설명도 꺾였다.
   * 이름마다 크기를 따로 두지 않는다(흐름 안의 이름은 한 크기). 번호(이름 한 단계 아래)가 바닥(--fs-min) 밑으로 가지 않는 만큼까지만
   * 내리고, 판을 혼자 쓰는 흐름은 이름이 --fw-least(52에서 두 단계 아래, flow.css) 밑으로 가지 않게: 긴 이름 하나 때문에 흐름 전체가
   * 30으로 작아져 판이 휑했다. 그래도 한 줄에 들지 않는 긴 이름이 있으면 꺾이는 줄이 가장 적어지는 단계 가운데 가장 큰 단계: 긴 이름만 낱말 사이에서
   * 꺾이고(word-break: keep-all) 다른 이름은 한 줄이다. 처음 크기로 두면 짧은 이름까지 모두 반으로 꺾였고, 바닥까지 내리면 덜 꺾이지도
   * 않는데 흐름 전체가 작아졌다. 좁은 칸에서 세로로 쌓은 흐름도 같다(이름이 칸 너비보다 길면 꺾인다).
   * 편집 화면에서 글을 쓰는 동안은 쓰기 전의 단계 그대로(typing): 글자마다 고르면 이름이 꺾이는 글자에서 흐름 전체가 한 단계 작아지고,
   * 지우면 다시 커져 손 아래에서 들썩였다. 다 쓰고 나가면 다시 고른다.
   * 글자 크기가 바뀔 때마다 다시 골라야 해서 place가 부른다(칸을 줄이고 키울 때마다 place를 부른다)
   */
  function flowNames(scope: ParentNode): void {
    const flows = scope instanceof HTMLElement && scope.classList.contains('bk-fw') ? [scope] : Array.from(scope.querySelectorAll<HTMLElement>('.bk-fw'))
    for (const fw of flows) {
      const area = fw.closest<HTMLElement>('.bk-area')
      if (area && typing(area)) continue
      const put = (d: number) => {
        const v = d === 1 ? '' : String(Math.round(d * 1e4) / 1e4)
        if (fw.style.getPropertyValue('--fw-fit') === v) return
        if (v) fw.style.setProperty('--fw-fit', v)
        else fw.style.removeProperty('--fw-fit')
      }
      const cs = getComputedStyle(fw)
      const names = Array.from(fw.querySelectorAll<HTMLElement>('.bk-fw-t')).filter((el) => el.getClientRects().length)
      if (!names.length) {
        put(1)
        continue
      }
      // 고를 수 있는 단계: 처음 크기(1)부터 1.2씩 나눠, 번호가 바닥에 닿기 전까지(판을 혼자 쓰면 이름이 --fw-least에 닿기 전까지)
      const floor = (parseFloat(cs.getPropertyValue('--fs-min')) || 0) - 0.5
      const bottom = (parseFloat(cs.getPropertyValue('--fw-least')) || 0) - 0.5
      let now = Number(fw.style.getPropertyValue('--fw-fit')) || 1
      let fs = parseFloat(getComputedStyle(names[0]).fontSize)
      // 지금 단계에서 이름이 바닥에 걸려 있으면(칸이 줄어 글자가 작아졌다) 처음 크기를 거꾸로 셈할 수 없어 처음 크기로 돌려 잰다
      if (now !== 1 && fs <= floor + 1) {
        put(1)
        now = 1
        fs = parseFloat(getComputedStyle(names[0]).fontSize)
      }
      const base = fs / now
      const ks = [1]
      while ((base * ks[ks.length - 1]) / 1.44 >= floor && (base * ks[ks.length - 1]) / 1.2 >= bottom && ks.length < 6) ks.push(ks[ks.length - 1] / 1.2)
      // 이름들이 그려진 줄 수의 합. 글자가 작을수록 줄지 않으니 가장 작은 단계의 합이 가장 적다
      const rows = () => names.reduce((n, el) => n + rowsOf(el), 0)
      // 지금 단계에서 시작한다: 맞춘 뒤 다시 고를 때(칸을 옮기고 높이를 맞추는 동안 여러 번) 처음부터 내려 보지 않게
      let i = Math.max(0, ks.findIndex((d) => Math.abs(d - now) < 1e-3))
      put(ks[i])
      if (rows() === names.length) {
        while (i > 0) {
          put(ks[i - 1])
          if (rows() > names.length) {
            put(ks[i])
            break
          }
          i--
        }
        continue
      }
      put(ks[ks.length - 1])
      const least = rows()
      for (const d of ks) {
        put(d)
        if (rows() <= least) break
      }
    }
  }

  /**
   * 위치 비교의 이름표 자리를 그려진 크기로 다시 고른다. 그리기 전에 글 길이로 어림한 자리(layouts/Position.tsx의 labelSides)를 먼저 보고,
   * 앞의 점의 이름표나 다른 점을 덮거나 판 밖으로 나가면 오른쪽, 왼쪽, 위, 아래 차례로 겹치지 않는 자리를 찾는다. 없으면 어림한 자리.
   * 흐름의 단계 이름과 추이의 점 숫자(trendPlace)도 여기서 다시 고른다(flowNames)
   */
  function place(scope: ParentNode): void {
    flowNames(scope)
    const plots = scope instanceof HTMLElement && scope.classList.contains('pm-plot') ? [scope] : Array.from(scope.querySelectorAll<HTMLElement>('.pm-plot'))
    const SIDES = ['is-left', 'is-up', 'is-down']
    const tries = [[], ['is-left'], ['is-up'], ['is-down'], ['is-left', 'is-up'], ['is-left', 'is-down']]
    const set = (el: HTMLElement, on: string[]) => SIDES.forEach((c) => el.classList.toggle(c, on.indexOf(c) >= 0))
    for (const plot of plots) {
      if (!plot.clientWidth) continue
      const pts = Array.from(plot.children).filter((c) => c instanceof HTMLElement && c.classList.contains('pm-pt') && !c.classList.contains('is-blank')) as HTMLElement[]
      const P = plot.getBoundingClientRect()
      const k = plot.offsetWidth ? P.width / plot.offsetWidth : 1
      const gap = 6 * k
      // 겹친 넓이 (떨어져야 할 틈까지 넣어서). 0이면 안 겹친다
      const meet = (a: DOMRect, b: DOMRect) =>
        Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left) + gap) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) + gap)
      // 판의 축(왼쪽, 아래 굵은 줄)은 넘지 않고, 위와 오른쪽은 판 둘레의 여백만큼 나가도 된다
      const outside = (r: DOMRect) =>
        Math.max(0, P.left + 4 * k - r.left) + Math.max(0, r.bottom - (P.bottom - 4 * k)) + Math.max(0, r.right - (P.right + 24 * k)) + Math.max(0, P.top - 24 * k - r.top)
      const dots = pts.map((p) => p.querySelector<HTMLElement>('.pm-dot')?.getBoundingClientRect() ?? null)
      // 판을 넷으로 나누는 가운데 선: 이름표가 걸치면 선이 글을 취소선처럼 지나간다(편집할 때 이름표 아래에 붙는 점수 줄이 가운데 가로선에 걸렸다)
      const mids = Array.from(plot.querySelectorAll<HTMLElement>(':scope > .pm-mid')).map((m) => m.getBoundingClientRect()).filter((m) => m.width || m.height)
      // 어림한 자리는 그릴 때 data-pm-side에 적어 둔다: 다시 맞출 때(글꼴이 오거나 글자가 줄 때) 거기서부터 다시 고른다.
      // 겹치지 않는 첫 자리. 어디에 두어도 겹치면 가장 덜 겹치는 자리 (판 밖으로 나간 것은 크게 친다)
      pickSides(pts, '.pm-label', (p) => p.dataset.pmSide, tries, set, (r, i, taken) => {
        let cost = outside(r) * r.height * 4
        for (const t of taken) cost += meet(r, t)
        dots.forEach((d, j) => {
          if (j !== i && d) cost += meet(r, d) * 2
        })
        for (const m of mids) cost += meet(r, m)
        return cost
      })
    }
    // 추이의 점 숫자도: 글자 맞추기가 숫자를 키우거나 줄이면(52px에서 62px) 점과 목표선 사이의 자리가 달라진다. 처음 그린 크기로 한 번만
    // 고르던 때는 키운 강조 숫자가 목표선에 걸친 채 남았다
    for (const canvas of Array.from(scope.querySelectorAll<HTMLElement>('.tn-canvas'))) trendPlace(canvas)
  }

  /**
   * 점마다 이름표(숫자)를 둘 자리를 앞 점부터 차례로 고른다: 그릴 때 어림한 자리(first)부터 tries 차례로 보고 값(cost)이 0인 첫 자리,
   * 없으면 가장 작은 자리. 앞 점이 고른 이름표(taken)는 뒤 점의 값에 든다.
   * 이름표는 저마다 제 점 안에 따로 서서(position: absolute) 한 점의 자리를 바꿔도 다른 점의 이름표는 그대로다. 그래서 같은 차례의 자리를
   * 모든 점에 한꺼번에 놓고 한 번에 잰다: 점마다 자리마다 놓고 재던 때는 그때마다 스타일과 자리를 다시 계산해서(점 여섯에 자리 아홉이면
   * 쉰 번 남짓) 느린 PC에서 추이 그림 하나에 80ms가 들었다. 재는 것은 쓰는 차례가 왔을 때만이라, 모두 첫 자리에 들면 한 번이다
   */
  function pickSides(
    pts: HTMLElement[],
    labelSel: string,
    firstOf: (p: HTMLElement) => string | undefined,
    tries: string[][],
    set: (el: HTMLElement, on: string[]) => void,
    costOf: (r: DOMRect, i: number, taken: DOMRect[]) => number,
  ): void {
    const labels = pts.map((p) => p.querySelector<HTMLElement>(labelSel))
    const options = pts.map((p) => [(firstOf(p) ?? '').split(' ').filter(Boolean), ...tries])
    const table: (DOMRect | null)[][] = []
    const rect = (i: number, o: number) => {
      if (!table[o]) {
        pts.forEach((p, j) => labels[j] && set(p, options[j][o]))
        table[o] = labels.map((l) => (l ? l.getBoundingClientRect() : null))
      }
      return table[o][i]!
    }
    const picks: number[] = []
    const taken: DOMRect[] = []
    pts.forEach((_, i) => {
      if (!labels[i]) return
      let pick = 0
      let best = Infinity
      for (let o = 0; o < options[i].length; o++) {
        const cost = costOf(rect(i, o), i, taken)
        if (cost < best) {
          best = cost
          pick = o
        }
        if (cost === 0) break
      }
      picks[i] = pick
      taken.push(rect(i, pick))
    })
    pts.forEach((p, i) => labels[i] && set(p, options[i][picks[i]]))
  }

  /**
   * 추이의 점 숫자 자리를 그려진 크기로 다시 고른다. 그릴 때 어림한 자리(골짜기는 점 아래, Trend.tsx의 data-tn-side)를 먼저 보고,
   * 숫자가 선(앞뒤 점으로 가는 선)이나 다른 점, 앞의 숫자를 덮거나 그림 밖(위는 숫자 띠까지, 아래는 바닥줄)으로 나가면
   * 위, 점 오른쪽 위, 왼쪽 위, 점 바로 왼쪽과 오른쪽, 아래 차례로 겹치지 않는 자리를 찾는다. 목표선을 건너 점과 다른 쪽에 서는 자리도
   * 겹치는 것으로 본다. 없으면 가장 덜 겹치는 자리.
   * 앞 점보다 한참 낮은 마지막 점은 내리꽂히는 선이 점 위의 숫자를 그대로 지나갔다(바닥에 붙어 아래에 둘 자리도 없다)
   */
  function trendPlace(canvas: HTMLElement): void {
    const plot = canvas.parentElement
    if (!plot || !canvas.clientWidth) return
    const P = plot.getBoundingClientRect()
    const k = canvas.offsetWidth ? canvas.getBoundingClientRect().width / canvas.offsetWidth : 1
    const pts = Array.from(canvas.children).filter((c) => c instanceof HTMLElement && c.classList.contains('tn-pt') && !c.classList.contains('is-blank')) as HTMLElement[]
    const SIDES = ['is-below', 'is-after', 'is-before', 'is-mid']
    // 옆으로 비키기를 아래보다 먼저: 숫자가 모두 선 위에 있어야 읽기 쉽고, 아래는 바닥줄과 시기 이름에 붙기 쉽다.
    // 위로 비킬 자리가 없으면 점의 바로 옆(is-mid). 앞 점보다 한참 낮은 마지막 점은 위로는 내리꽂히는 선이, 아래로는 바닥줄이 지나가서
    // 강조한 큰 숫자가 바닥줄에 걸쳤다
    const tries = [[], ['is-after'], ['is-before'], ['is-mid', 'is-before'], ['is-mid', 'is-after'], ['is-below'], ['is-below', 'is-after'], ['is-below', 'is-before']]
    const set = (el: HTMLElement, on: string[]) => SIDES.forEach((c) => el.classList.toggle(c, on.indexOf(c) >= 0))
    const gap = 8 * k
    const dots = pts.map((p) => p.querySelector<HTMLElement>('.tn-dot')?.getBoundingClientRect() ?? null)
    const mid = dots.map((d) => (d ? { x: (d.left + d.right) / 2, y: (d.top + d.bottom) / 2 } : null))
    // 숫자 상자(떨어져야 할 틈까지)를 지나는 선의 길이를 점 24개로 어림한다
    const crossed = (r: DOMRect) => {
      let n = 0
      for (let j = 1; j < mid.length; j++) {
        const a = mid[j - 1]
        const b = mid[j]
        // 중간 값이 없으면 선도 끊겨 있으므로, 없는 선을 피하느라 숫자를 옮기지 않는다.
        if (!a || !b || Number(pts[j].dataset.index) !== Number(pts[j - 1].dataset.index) + 1) continue
        for (let t = 0; t <= 24; t++) {
          const x = a.x + ((b.x - a.x) * t) / 24
          const y = a.y + ((b.y - a.y) * t) / 24
          if (x > r.left - gap && x < r.right + gap && y > r.top - gap && y < r.bottom + gap) n++
        }
      }
      return n
    }
    const meet = (a: DOMRect, b: DOMRect) =>
      Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left) + gap) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) + gap)
    // 위는 그림 판(숫자 띠까지), 아래는 바닥줄, 양옆은 판 끝까지. 줄 선(바닥줄, 목표선)과는 그려진 글자가 8px 떨어진다: 조합 검사가
    // 글과 줄 선 사이를 6px는 본다(comboChecks.ts의 RULE_GAP, 목표선은 2px 굵기)
    const clear = 8 * k
    // 그려진 글자(잉크)의 위아래: 숫자 상자는 글자 높이로 잘랐지만(trend.css) 둥근 숫자(0, 8, 9)와 명조 숫자는 그보다 몇 px 위아래로
    // 나와서, 상자로만 재면 목표선에 붙은 숫자를 비켰다고 봤다. 자리마다 상자만 옮겨 가므로 상자에서 잉크까지를 점마다 한 번 잰다
    const inkGap = pts.map((p) => {
      const box = p.querySelector('.tn-val')?.getBoundingClientRect()
      const num = p.querySelector('.tn-num')
      const text = (num?.textContent || '').trim()
      if (!box || !num || !text) return [0, 0]
      if (!range) range = document.createRange()
      range.selectNodeContents(num)
      const q = range.getBoundingClientRect()
      const [up, down] = ink(num, text.slice(0, 60))
      return [q.top + q.height * up - box.top, q.bottom - q.height * down - box.bottom]
    })
    const inkTop = (r: DOMRect, i: number) => r.top + Math.min(0, inkGap[i][0])
    const inkBottom = (r: DOMRect, i: number) => r.bottom + Math.max(0, inkGap[i][1])
    const outside = (r: DOMRect, i: number) =>
      Math.max(0, P.top - r.top) + Math.max(0, inkBottom(r, i) - (P.bottom - clear)) + Math.max(0, P.left - r.left) + Math.max(0, r.right - P.right)
    // 목표선: 숫자는 제 점과 같은 쪽에 선다. 목표선에 걸치는 숫자를 선 너머로 비켜 세우던 때는 목표 아래 점들(96, 101, 99)의 숫자가
    // 목표선 위에 한 줄로 서서 '목표를 넘었다'로 읽혔다(감성 검수). 점에서 선 너머로 나간 깊이(px)만큼 친다: 다 건너간 숫자가 선에
    // 조금 걸친 숫자보다 무겁다
    const goal = canvas.querySelector<HTMLElement>(':scope > .tn-target')?.getBoundingClientRect()
    const across = (r: DOMRect, i: number) => {
      const d = mid[i]
      if (!goal || !d) return 0
      const y = goal.top + k
      return d.y < y ? Math.max(0, inkBottom(r, i) - (y - clear)) : Math.max(0, y + clear - inkTop(r, i))
    }
    // 바닥줄 밖(시기 이름 위)으로 나가는 것이 가장 나쁘다: 이름과 겹친다. 목표선에 걸치는 것은 그다음
    pickSides(pts, '.tn-val', (p) => p.dataset.tnSide, tries, set, (r, i, taken) => {
      let cost = (crossed(r) + outside(r, i) * 4 + across(r, i) * 2) * r.height * 40
      for (const t of taken) cost += meet(r, t)
      dots.forEach((d, j) => {
        if (j !== i && d) cost += meet(r, d) * 2
      })
      return cost
    })
    // 어느 자리에도 들지 못해 바닥줄 밖이나 목표선 너머에 선 숫자가 있으면 이 크기에서는 숫자를 키우지 않는다(crowded): 글자 맞추기가
    // 숫자를 1.44배까지 키워 점과 목표선 사이, 점과 바닥줄 사이에 들던 숫자도 자리를 잃었다
    let bad = false
    pts.forEach((p, i) => {
      const r = p.querySelector('.tn-val')?.getBoundingClientRect()
      if (r && (outside(r, i) > 0.5 * k || across(r, i) > 0.5 * k)) bad = true
    })
    if (bad) cramped.add(canvas)
    else cramped.delete(canvas)
  }

  /** 칸 안의 그림 하나와 키우기 전의 크기 (화면 px) */
  type Shape = { el: Element; w: number; h: number }

  /**
   * 칸 안의 그림: 글이 없는 요소(구성비 띠, 막대, 원, 그림 판) 가운데 가로세로 24px는 되는 것과 그 크기. 키우기 전에 잰다.
   * 글이 커지면 같은 칸의 그림이 남는 높이를 내주며 줄어드는데, 글이 없어서 넘침으로 보이지 않는다
   * (구성비 띠가 112px에서 1px 아래로 납작해졌다)
   */
  function shapesOf(inner: HTMLElement): Shape[] {
    const r = inner.getBoundingClientRect()
    const k = inner.offsetWidth ? r.width / inner.offsetWidth : 1
    const out: Shape[] = []
    for (const el of Array.from(inner.querySelectorAll('*'))) {
      if ((el.textContent || '').trim()) continue
      const b = el.getBoundingClientRect()
      if (b.width >= 24 * k && b.height >= 24 * k) out.push({ el, w: b.width, h: b.height })
    }
    return out
  }

  /**
   * 키울 때는 더 엄격하게: 글만이 아니라 항목(줄)의 상자까지 안쪽 여백 안에. 글만 보면 줄의 아래 여백과 선이
   * 카드 가장자리까지 내려가도 넘친 줄 모른다 (시장 규모의 목록이 카드 바닥에 선을 긋던 것).
   * 그림이 키우기 전의 70% 밑으로 줄어도 넘친 것이다: 글자를 키우느라 그래프를 찌그러뜨리지 않는다(반까지 봐주던 때는 크게에서
   * 좁은 카드의 비율 원이 170px에서 89px로 줄었다)
   */
  function crowded(inner: HTMLElement, shapes: Shape[] = []): boolean {
    if (over(inner, true)) return true
    for (const c of Array.from(inner.querySelectorAll('.tn-canvas'))) if (cramped.has(c)) return true
    const r = inner.getBoundingClientRect()
    const k = inner.offsetWidth ? r.width / inner.offsetWidth : 1
    const bottom = r.bottom - parseFloat(getComputedStyle(inner).paddingBottom) * k + 2 * k
    for (const it of inner.querySelectorAll<HTMLElement>('.it')) if (it.getBoundingClientRect().bottom > bottom) return true
    // 면을 깐 항목(핵심 숫자의 카드 같은)은 그 안의 글도 항목의 안쪽 여백 안에. 항목 상자는 칸 높이로 정해져 있어서, 키운 글은
    // 항목 밖으로 넘치지 않고 아래 여백만 먹었다(크게에서 키운 카드가 위 48px, 아래 27px)
    const limit = new Map<Element, number>()
    for (const q of lines(inner)) {
      const own = q.n.parentElement?.closest('.it')
      if (!own || !inner.contains(own)) continue
      let b = limit.get(own)
      if (b === undefined) {
        const pb = parseFloat(getComputedStyle(own).paddingBottom)
        b = pb >= 16 ? own.getBoundingClientRect().bottom - (pb - 8) * k : Infinity
        limit.set(own, b)
      }
      if (q.b > b + 2 * k) return true
    }
    for (const s of shapes) {
      const b = s.el.getBoundingClientRect()
      if (b.width < s.w * 0.7 || b.height < s.h * 0.7) return true
    }
    return false
  }

  /**
   * 칸마다 지난번 맞추기의 첫 단계(넘치는 칸 줄이기와 모든 칸 키우기) 결과: 줄인 단계(fit), 키우기 전 그림의 크기(shapes), 한 단계 키웠을 때
   * 넘쳤는지(crowded), 그때의 조건(key: 줄이는 단계와 칸 안 숫자의 --fs). 칸 안이 그대로이면 다시 재도 같은 값이라 쓴다(fit의 reuse)
   */
  type First = { fit: string; key: string; shapes?: Shape[]; crowded?: boolean }
  const firsts = new WeakMap<HTMLElement, First>()

  /**
   * 자리가 남는 장의 모든 칸을 같은 단계로 키운다. 한 칸이라도 넘치거나 겹치거나 그림이 찌그러지면 그대로. 키우기 전 그림의 크기를 돌려준다.
   * known의 칸(칸 안이 지난번 그대로)은 지난번에 잰 그림 크기와 넘침을 쓴다. 그림 크기가 없으면(지난번에 키워 보지 않았다) null
   */
  function enlarge(cells: HTMLElement[], known: Map<HTMLElement, First>): Map<HTMLElement, Shape[]> | null {
    const pairs = cells.map((c) => [c, c.querySelector<HTMLElement>(':scope > .bk-in')] as const).filter((x): x is readonly [HTMLElement, HTMLElement] => !!x[1])
    if (pairs.some(([c]) => known.has(c) && !known.get(c)!.shapes)) return null
    const shapes = new Map(pairs.map(([c, inner]) => [inner, known.get(c)?.shapes ?? shapesOf(inner)] as const))
    for (const k of ups) {
      // 이미 그 단계인 칸은 적지 않는다(적으면 칸 안 모두의 스타일을 다시 계산한다)
      for (const c of cells) if (c.style.getPropertyValue('--bk-fit') !== String(k)) c.style.setProperty('--bk-fit', String(k))
      for (const [, inner] of pairs) place(inner)
      let full = false
      for (const [c, inner] of pairs) {
        const was = known.get(c)?.crowded
        const hit = was ?? crowded(inner, shapes.get(inner))
        const f = firsts.get(c)
        if (f) f.crowded = hit
        if (hit) {
          full = true
          break
        }
      }
      if (!full) return shapes
    }
    for (const c of cells) c.style.removeProperty('--bk-fit')
    for (const [, inner] of pairs) place(inner)
    return shapes
  }

  /**
   * 칸 안 내용이 차지한 높이와 칸 안쪽 높이 (화면 px). 그리지 않은 칸이면 null.
   * 내용은 보이는 첫 자식: 레이아웃 부품(차트, 표)은 첫 자식이 숨긴 장 제목(높이 0)이라, 첫 자식만 보면 차트가 있는 줄을 통째로 건너뛰었다
   */
  function used(c: HTMLElement): { room: number; used: number; k: number } | null {
    const body = Array.from(c.querySelectorAll<HTMLElement>(':scope > .bk-in > *')).find((el) => el.offsetHeight > 0)
    if (!body) return null
    const r = body.getBoundingClientRect()
    const k = r.height / body.offsetHeight
    const cs = getComputedStyle(body)
    const top = r.top + parseFloat(cs.paddingTop) * k
    let end = top
    for (const el of Array.from(body.children)) {
      const b = el.getBoundingClientRect()
      const es = getComputedStyle(el)
      if (b.height && es.position !== 'absolute' && es.position !== 'fixed') end = Math.max(end, b.bottom + Math.max(0, parseFloat(es.marginBottom)) * k)
    }
    return { room: r.bottom - parseFloat(cs.paddingBottom) * k - top, used: end - top, k }
  }

  /**
   * 차트 옆의 짧은 숫자 부품 키우기 (맨 위 설명 3-3). 줄에 칸 높이를 다 쓰는 차트, 표가 있으면 그 옆의 숫자 부품(큰 숫자, 전과 후,
   * 목표 대비)을 한두 단계 키운다(boosts): 높은 칸에 작은 숫자만 있으면 칸이 비어 보인다. 글 부품은 키우지 않는다(장 제목과 크기가
   * 가까워진다). 예전에는 짧은 부품을 줄 가운데로 내렸는데(--bk-lift), 날짜 하나나 숫자 하나가 높은 칸 가운데에 혼자 떠 옆 칸과
   * 윗선이 어긋났고, 소제목 아래 목록만 내려가 소제목과 사이가 벌어져 내리지 않는다. 이음표가 선 줄과 쌓은 부품은 건너뛴다
   */
  const boosts = [1.44, 1.2]
  const boostable = new Set(['number', 'delta', 'goal'])
  // 자기 큰 숫자가 있는 그림(몇 중 몇, 비율 원) 옆에서는 키우지 않는다: 키우면 나란한 두 숫자가 한 장 안에서 크기가 달라진다
  const figured = new Set(['ratio', 'ring'])
  /** 내용(첫 보이는 자식)이 --bk-lift로 내려가는 부품인지 (blocks.css가 정한다) */
  function liftable(c: HTMLElement): boolean {
    const body = Array.from(c.querySelectorAll<HTMLElement>(':scope > .bk-in > *')).find((el) => el.offsetHeight > 0)
    return !!body && getComputedStyle(body).getPropertyValue('--bk-lifts').trim() === '1'
  }
  function lift(cells: HTMLElement[]): void {
    const rows = new Map<string, HTMLElement[]>()
    for (const c of cells) {
      // 쌓은 부품은 칸 높이를 나눠 쓰므로 가운데로 내리지 않는다
      if (!c.classList.contains('is-shared') || c.classList.contains('lk-row') || c.classList.contains('is-stacked')) continue
      const key = c.dataset.band || '0'
      rows.set(key, (rows.get(key) || []).concat(c))
    }
    // 칸 높이를 다 쓰는지 (캔버스 16px까지는 다 쓴 것으로)
    const fills = (c: HTMLElement) => {
      const m = used(c)
      return !!m && m.used >= m.room - 16 * m.k
    }
    // 칸 높이 가운데 내용이 쓰는 몫
    const share = (c: HTMLElement) => {
      const m = used(c)
      return m && m.room > 0 ? m.used / m.room : 0
    }
    rows.forEach((row) => {
      const all = row.filter(liftable)
      if (!all.length) return
      // 칸 높이를 거의 다(80%) 쓰는 부품. 내릴 수 없는 차트, 표는 칸 높이를 다 쓸 때(fills)만 기준이 된다
      const anchored = (c: HTMLElement) => (liftable(c) ? share(c) >= 0.8 : fills(c))
      const anchors = row.filter(anchored)
      const rest = all.filter((c) => !anchors.includes(c))
      // 칸 높이를 다 쓰는 차트, 표 옆이면 숫자 부품을 먼저 키운다
      const tall = anchors.some((c) => !liftable(c))
      if (tall && !row.some((c) => figured.has(c.dataset.type || ''))) {
        for (const c of rest) {
          if (!boostable.has(c.dataset.type || '')) continue
          const inner = c.querySelector<HTMLElement>(':scope > .bk-in')
          if (!inner) continue
          const was = c.style.getPropertyValue('--bk-fit')
          const now = Number(was || 1)
          const shapes = shapesOf(inner)
          let ok = false
          for (const f of boosts) {
            if (f <= now) break
            c.style.setProperty('--bk-fit', String(f))
            place(inner)
            const m = used(c)
            if (m && m.used <= m.room && !crowded(inner, shapes)) {
              ok = true
              break
            }
          }
          if (!ok) {
            if (was) c.style.setProperty('--bk-fit', was)
            else c.style.removeProperty('--bk-fit')
            place(inner)
          }
        }
      }
      // 짧은 부품은 내리지 않고 위에 둔다: 차트 옆에서 가운데로 내리면 날짜 하나, 숫자 하나가 높은 칸 가운데에 혼자 떠서 옆 칸과
      // 윗선이 어긋나고, 소제목 아래 목록만 내려가 소제목과 목록 사이가 한 칸만큼 벌어졌다(사람이 짠 장은 나란한 칸의 윗선을 맞춘다).
      // 그래서 숫자 부품을 키우는 것(위)만 한다
    })
  }

  /** 칠하지 않은 색: 투명(계산된 값은 rgba(…, 0), 섞은 색은 color(… / 0)) */
  function clearColor(c: string): boolean {
    return !c || c === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(c) || /\/\s*0\)$/.test(c)
  }

  /**
   * 보이는 테두리: 굵기와 선 모양이 있고 색이 투명하지 않은 것. 줄 선 규칙(lines.css)은 첫 항목 위와 끝 항목 아래의 선을 투명하게 두어
   * 높이만 지킨다. 굵기만 보던 때는 이 선도 그려진 것으로 세어, 예상 질문의 그려진 윗선이 첫 글줄보다 10px 위(항목 상자의 위끝)가
   * 되었고 옆 칸과 첫 글줄을 맞추는 일(8px 안만)에서 빠졌다
   */
  function edgeSeen(cs: CSSStyleDeclaration, side: 'Top' | 'Bottom' | 'Left' | 'Right'): boolean {
    return parseFloat(cs[`border${side}Width`]) > 0 && cs[`border${side}Style`] !== 'none' && cs[`border${side}Style`] !== 'hidden' && !clearColor(cs[`border${side}Color`])
  }

  /**
   * 상자에서 그려진 위아래 (화면 px, 상자의 자리 top, bottom과 장의 줄인 비율 k로). 칠한 상자는 상자째, 위아래 선만 그은 상자(목록의
   * 줄 선)는 그 선만, 아무것도 그리지 않으면 null. 상자째 세던 때는 아래 선만 있는 첫 항목의 위 여백(선이 없는 쪽)까지 그려진 것이 되어,
   * 요점 목록의 첫 글줄이 그려진 윗선보다 23px 아래였고 옆 칸과 첫 글줄을 맞추지 못했다(갤러리 combos seed 1의 3번)
   */
  function paintSpan(cs: CSSStyleDeclaration, top: number, bottom: number, k: number): [number, number] | null {
    // 그림자로 긋는 선(위아래 선 모양의 타일, 머리 괘선)도 그려진 것이다: 빼면 타일의 아래 선이 그려진 범위 밖이라 쌓기가 칸을 본문 아래로
    // 밀어 선이 하단 표시 글을 그었다
    if (!clearColor(cs.backgroundColor) || cs.backgroundImage !== 'none' || cs.boxShadow !== 'none') return [top, bottom]
    const up = edgeSeen(cs, 'Top')
    const down = edgeSeen(cs, 'Bottom')
    if (!up && !down) return null
    return [up ? top : bottom - parseFloat(cs.borderBottomWidth) * k, down ? bottom : top + parseFloat(cs.borderTopWidth) * k]
  }

  /**
   * 칸에서 그려진 것의 위아래 (화면 px). 면이 있는 칸은 면째(칸 전체), 없으면 글 줄(글자가 그려진 선)과 그림(svg, 이미지),
   * 바탕이나 테두리를 칠한 상자의 범위. 상자의 자리로 재면 높이를 다 쓰는 격자(몇 중 몇의 점 판 같은)가 칸 바닥까지 잡혀,
   * 그 아래가 비어도 비지 않은 것으로 보았다. 본문이 위에 긋는 선(소제목의 ::before)도 그려진 것이라 그만큼 위로 늘린다.
   * 쌓기(pack)와 개발용 검사(screens/assembly.ts)가 같이 쓴다
   */
  function drawn(c: HTMLElement): { t: number; b: number } | null {
    const r = c.getBoundingClientRect()
    if (!c.classList.contains('bk-look-plain')) return { t: r.top, b: r.bottom }
    const inner = c.querySelector<HTMLElement>(':scope > .bk-in')
    if (!inner) return null
    const k = inner.offsetWidth ? inner.getBoundingClientRect().width / inner.offsetWidth : 1
    let t = Infinity
    let b = -Infinity
    for (const q of lines(inner, true, true)) {
      t = Math.min(t, q.t)
      b = Math.max(b, q.b)
    }
    const els = inner.querySelectorAll<HTMLElement>('*')
    for (let i = 0; i < els.length; i++) {
      const el = els[i]
      if (el.parentElement?.closest('svg')) continue
      // 편집 표시(항목을 끄는 손잡이, 빼기 단추 같은)는 장의 내용이 아니다. 맞추는 동안(is-fitting)은 숨지만 검사(checkAssembly)는
      // 편집 화면 그대로 재서, 소제목 아래 항목의 단추를 그려진 것으로 알고 소제목과 겹친다고 했다
      if (el.closest('.ed-halo, .it-remove, .it-grip, .pn-tools, .img-tools, .bk-handle')) continue
      const e = el.getBoundingClientRect()
      if (!e.width || !e.height) continue
      const tag = el.tagName.toLowerCase()
      let span: [number, number] | null = [e.top, e.bottom]
      if (tag !== 'svg' && tag !== 'img') {
        const cs = getComputedStyle(el)
        if (cs.visibility === 'hidden' || cs.opacity === '0') continue
        span = paintSpan(cs, e.top, e.bottom, k)
      }
      if (!span) continue
      t = Math.min(t, span[0])
      b = Math.max(b, span[1])
    }
    // 칸 밖 위에 긋는 머리 괘선(.bk::before, blocks/base.css)도 그려진 것이다. 안쪽 상자만 보면 이 선을 몰라서, 쌓기가 칸의 글을
    // 앞 줄 소제목 바로 아래(headGap)로 올렸고 칸 위 23px에 선 선이 소제목의 덧붙임 글을 가운데로 그었다(취소선처럼 보였다).
    // 편집 화면의 ::after는 고른 부품의 테두리(edit.css)라 뺀다: 세면 부품을 고를 때와 풀 때 그려진 범위가 달라져 장이 오르내렸다
    const live = !!c.closest('.bk-area.is-live')
    for (const w of live ? ['::before'] : ['::before', '::after']) {
      const ps = getComputedStyle(c, w)
      if (ps.content === 'none' || ps.content === 'normal' || ps.display === 'none' || ps.position !== 'absolute' || ps.visibility === 'hidden') continue
      const h = parseFloat(ps.height) || 0
      const y = parseFloat(ps.top)
      if (h <= 0 || !Number.isFinite(y) || (clearColor(ps.backgroundColor) && ps.backgroundImage === 'none')) continue
      t = Math.min(t, r.top + y * k)
      b = Math.max(b, r.top + (y + h) * k)
    }
    if (t === Infinity) return null
    const body = Array.from(inner.children).find((el) => (el as HTMLElement).offsetHeight > 0)
    if (body) {
      const pb = getComputedStyle(body, '::before')
      if (pb.content !== 'none' && pb.content !== 'normal' && pb.display !== 'none' && pb.position !== 'absolute') t -= ((parseFloat(pb.height) || 0) + (parseFloat(pb.marginBottom) || 0)) * k
    }
    return { t, b }
  }

  /** 면이 있는 칸이 제 내용과 안쪽 여백에 쓰는 높이 (화면 px). 잴 수 없으면 Infinity(줄이지 않는다) */
  function faceNeed(c: HTMLElement, k: number): number {
    const inner = c.querySelector<HTMLElement>(':scope > .bk-in')
    const body = inner && Array.from(inner.children).find((el) => (el as HTMLElement).offsetHeight > 0)
    if (!inner || !body) return Infinity
    const ir = inner.getBoundingClientRect()
    const cs = getComputedStyle(inner)
    const room = ir.height - (parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)) * k
    let t = Infinity
    let b = -Infinity
    for (const el of Array.from(body.children)) {
      const e = el.getBoundingClientRect()
      const es = getComputedStyle(el)
      if (!e.height || es.position === 'absolute' || es.position === 'fixed') continue
      t = Math.min(t, e.top)
      b = Math.max(b, e.bottom)
    }
    if (t === Infinity) return Infinity
    return c.getBoundingClientRect().height - Math.max(0, room - (b - t))
  }

  /**
   * 쌓은 뒤 면의 아래 끝을 옆 칸이 그려진 끝에 맞춘다. hug는 쌓기 전 판의 자리로 재서, 옆에 위아래로 쌓인 바탕 없는 칸(핵심 숫자 아래 추이)이
   * 쌓기로 올라가면 면만 그 아래로 70px 넘게 내려가 있었다. 옆에 이음표가 선 줄(바탕 없는 칸이 가운데에 서는 줄)도 옆 칸이 쌓여 있으면
   * 위에서부터 그려져서 같이 맞춘다. 제 내용보다 짧게는 줄이지 않고, 줄인 뒤 넘치면 되돌린다
   */
  function tail(items: { c: HTMLElement; r: DOMRect; ink: { t: number; b: number } | null }[], dy: Map<HTMLElement, number>, k: number, base: Map<HTMLElement, { r: DOMRect; trim: number }>): void {
    for (const x of items) {
      if (x.c.classList.contains('bk-look-plain') || !x.ink) continue
      const band = x.c.dataset.band
      const near = items.filter((y) => y !== x && y.ink && y.c.dataset.band === band && Math.min(y.r.bottom, x.r.bottom) - Math.max(y.r.top, x.r.top) > 1)
      if (!near.length) continue
      // 가운데에 서는 바탕 없는 칸(이음표 줄에서 혼자 줄 높이를 다 쓰는)이 있으면 hug와 같이 건너뛴다
      if (near.some((y) => y.c.classList.contains('bk-look-plain') && y.c.classList.contains('lk-row') && !y.c.classList.contains('is-stacked'))) continue
      // 처음 자리(hug까지 마친)를 적어 두고 늘 그것에서 잰다: 다시 쌓아 옆 칸이 내려가면 줄였던 만큼 되돌린다
      let o = base.get(x.c)
      if (!o) base.set(x.c, (o = { r: x.r, trim: parseFloat(x.c.style.getPropertyValue('--bk-trim')) || 0 }))
      const top = o.r.top + dy.get(x.c)!
      let end = top + faceNeed(x.c, k)
      for (const y of near) end = Math.max(end, y.c.classList.contains('bk-look-plain') ? y.ink!.b + dy.get(y.c)! : y.r.top + dy.get(y.c)! + faceNeed(y.c, k))
      const cut = Math.max(0, Math.floor((o.r.bottom + dy.get(x.c)! - end) / k))
      if (!Number.isFinite(cut)) continue
      const inner = x.c.querySelector<HTMLElement>(':scope > .bk-in')
      const set = (v: number) => {
        if (v > 0) x.c.style.setProperty('--bk-trim', v + 'px')
        else x.c.style.removeProperty('--bk-trim')
        if (inner) place(inner)
      }
      const was = parseFloat(x.c.style.getPropertyValue('--bk-trim')) || 0
      // 처음에는 24px 밑이면 줄이지 않는다. 이미 줄인 뒤 다시 쟀을 때 남는 몫이 24px보다 작아져도 그 몫만 남긴다:
      // 처음 높이로 되돌리면 다음 맞추기에서 다시 줄고 돌아오는 사이를 반복한다.
      const want = cut < 24 && was === o.trim ? o.trim : o.trim + cut
      if (want === was) continue
      set(want)
      if (inner && over(inner)) {
        set(was)
        continue
      }
      const d = (want - o.trim) * k
      x.ink = { t: x.ink.t, b: o.r.bottom - d }
      x.r = new DOMRect(o.r.left, o.r.top, o.r.width, o.r.height - d)
    }
  }

  /**
   * 면을 내용에 맞춰 줄이기 (맨 위 설명 3-4). 판은 본문을 늘 다 덮고 면(옅은 면, 진한 면)은 남는 높이를 차트 다음으로 받아서,
   * 한두 줄짜리 강조 상자가 700px 높이의 짙은 면이 되어 면 가운데에 글 한 줄만 떠 있었다. 발표 화면에서는 면을
   * 그 줄(나란한 묶음)의 다른 내용이 쓰는 높이까지, 그보다 짧으면 제 내용 높이까지 줄인다(--bk-trim, 칸 높이에서 뺀다).
   * 나란한 면끼리는 같은 높이로. 줄인 뒤 어느 칸이라도 넘치면(칸 높이로 정한 글자 단계가 바뀐다) 그 줄은 그대로 둔다
   */
  function hug(bands: HTMLElement[][], k: number): void {
    for (const cs of bands) {
      const boxes = cs.map((c) => c.getBoundingClientRect())
      const top = Math.min(...boxes.map((x) => x.top))
      const bottom = Math.max(...boxes.map((x) => x.bottom))
      const faced = cs.filter((c) => !c.classList.contains('bk-look-plain'))
      if (!faced.length) continue
      // 줄 안에 위아래로 쌓인 면은 그 둘레가 따로 정해져 있어 건드리지 않는다
      const spans = (c: HTMLElement) => {
        const r = c.getBoundingClientRect()
        return r.top <= top + 1 && r.bottom >= bottom - 1
      }
      if (!faced.every(spans)) continue
      let need = 0
      for (const c of cs) {
        if (faced.includes(c)) {
          need = Math.max(need, faceNeed(c, k))
          if (!Number.isFinite(need)) break
        } else {
          const ink = drawn(c)
          if (!ink) {
            need = Infinity
            break
          }
          need = Math.max(need, ink.b - top)
        }
      }
      if (!Number.isFinite(need)) continue
      const trim = Math.floor((bottom - top - need) / k)
      // 캔버스 24px 밑이면 그대로 (글을 적을 때마다 면이 조금씩 움직이지 않게)
      if (trim < 24) continue
      // 앞서 줄인 만큼에 더한다(아래의 두 번째 줄이기)
      const was = faced.map((c) => c.style.getPropertyValue('--bk-trim'))
      for (const [i, c] of faced.entries()) c.style.setProperty('--bk-trim', (parseFloat(was[i]) || 0) + trim + 'px')
      for (const c of faced) {
        const inner = c.querySelector<HTMLElement>(':scope > .bk-in')
        if (inner) place(inner)
      }
      const spills = (c: HTMLElement) => {
        const inner = c.querySelector<HTMLElement>(':scope > .bk-in')
        return !!inner && over(inner)
      }
      if (faced.some(spills)) {
        for (const [i, c] of faced.entries()) {
          if (was[i]) c.style.setProperty('--bk-trim', was[i])
          else c.style.removeProperty('--bk-trim')
        }
        for (const c of faced) {
          const inner = c.querySelector<HTMLElement>(':scope > .bk-in')
          if (inner) place(inner)
        }
      }
    }
  }

  /**
   * 위에서부터 쌓기 (맨 위 설명 3-4). 판은 늘 본문 상자를 빈틈없이 덮어서, 칸이 내용보다 높으면 그 차이가 칸마다 내용 위아래에
   * 흩어져 부품 사이가 들쭉날쭉 벌어졌다(부제 아래 200px, 핵심 한 줄과 인용 사이 130px). 사람이 짠 장처럼, 판을 위아래로 나눈
   * 줄(나란한 묶음, data-band)마다 그려진 내용을 앞 줄의 내용 바로 아래(줄 사이 --bk-gap, 소제목 아래는 좁게)로 올려 붙이고
   * 남는 높이는 맨 아래 한곳에 모은다. 장 제목이 없는 장(결론 한 장)은 모은 묶음째 위아래 가운데에 둔다.
   * 줄째 같은 만큼 옮겨서 나란한 칸끼리의 윗선은 그대로다. 칸을 옮기므로(--bk-shift, 칸의 top) 면이 있는 칸도 면째 간다.
   * 편집 화면도 같이 쌓는다: 예전에는 판의 칸을 그대로 보이려고 편집 화면에서는 쌓지 않아서, 편집할 때는 부품 사이가 듬성하고
   * 발표하면 갑자기 위로 붙어 편집 화면이 끝 모습과 달랐다. 끄는 동안도 같이 쌓는다: 예전에는 끄는 동안 판의 칸 그대로 두어서
   * 끌기 시작하자마자 장 전체가 판의 칸 자리로 튀었고, 흐리게 미리 보인 자리도 놓은 뒤의 자리와 달랐다. 손 아래는 화면에 보이는
   * 판으로 잰다(BlockEditor의 shownOf, place.ts의 shownTargets). 편집 화면에서는 판을 나누는 선의 손잡이(.bk-line)도
   * 옮긴 칸 사이로 같이 옮긴다.
   * 이음표: 옆 이음표는 그 줄과 같이 옮기고, 줄 사이의 아래 이음표는 그 사이를 이음표가 설 자리만큼 넓히고 가운데에 세운다
   */
  const headGap = 32
  function pack(cells: HTMLElement[], area: HTMLElement): void {
    if (!cells.length) return
    const edit = area.classList.contains('is-live')
    const a = area.getBoundingClientRect()
    const k = a.height / area.offsetHeight
    if (!a.height || !k) return
    const style = getComputedStyle(area)
    // 서로 다른 묶음은 묶음 안의 줄보다 확실히 떨어져야 한다. 공간이 있으면 판 간격의 두 배로 시작하고,
    // 내용이 본문 밖으로 나가지 않도록 필요할 때만 판의 사이까지 단계적으로 좁힌다(settle).
    const gap0 = (parseFloat(style.getPropertyValue('--bk-gap')) || 48) * k
    let gap = gap0 * 2
    const pad = (parseFloat(style.getPropertyValue('--lk-pad')) || 24) * k
    const links = Array.from(area.querySelectorAll<HTMLElement>(':scope > .bk-link'))
    const groups = new Map<string, HTMLElement[]>()
    for (const c of cells) {
      const key = c.dataset.band ?? c.dataset.block ?? ''
      groups.set(key, (groups.get(key) || []).concat(c))
    }
    // 이음표가 있는 줄도 내용은 위에서 시작한다. 면을 내용에 맞춘 뒤 이음표는 쌓기 끝에서 앞 칸의 그려진 것 가운데로 옮긴다.
    // 두 번: 면을 줄이면 칸 높이로 정한 글자 단계(--bk-h, 300px 밑은 한 단계 작게)가 바뀌어 내용이 더 작아질 수 있다. 한 번만 줄이면
    // 결정 요청 면이 줄인 뒤 작아진 글보다 86px 컸다
    const huggable = Array.from(groups.values())
    hug(huggable, k)
    hug(huggable, k)
    // 칸마다 판의 자리(화면 px)와 그려진 범위, 바로 위에 있는 칸들(판에서 이 칸 위 선보다 위에서 끝나고 옆으로 겹친다)
    const side = (p: DOMRect, q: DOMRect) => Math.min(p.right, q.right) - Math.max(p.left, q.left) > 1
    // 편집 화면의 빈 부품은 안내 글(읽지 않는 글이라 drawn이 세지 않는다)만 보여서 그려진 것이 없다. 그러면 장 전체를 쌓지 않아,
    // 컴포넌트를 넣자마자 다른 부품이 판의 칸으로 내려갔다가 글을 쓰면 다시 올라붙었다. 그래서 글 칸(.ed)과 꾸밈 그림이 놓인 자리로 본다.
    // 본문 상자째 보면 높은 칸의 빈 인용 하나가 칸 높이를 다 쓴 것으로 보여 그 아래 줄이 올라붙지 못했다
    const body = (c: HTMLElement) => {
      let t = Infinity
      let b = -Infinity
      for (const el of Array.from(c.querySelectorAll<HTMLElement>(':scope > .bk-in :is(.ed, svg, [aria-hidden="true"])'))) {
        const r = el.getBoundingClientRect()
        if (!r.width || !r.height) continue
        t = Math.min(t, r.top)
        b = Math.max(b, r.bottom)
      }
      const r = c.getBoundingClientRect()
      return t === Infinity ? { t: r.top, b: r.bottom } : { t, b }
    }
    const items = cells.map((c) => ({ c, r: c.getBoundingClientRect(), ink: drawn(c) ?? (edit ? body(c) : null), id: c.dataset.block, above: [] as HTMLElement[] }))
    if (items.some((x) => !x.ink)) return
    // 바로 위의 칸은 판의 자리(--x, --y, --w, --h)로 본다: 칸을 키워 보느라 높이를 더 주면(fit 끝) 그려진 상자로는 윗줄이 아래 줄에 걸쳐
    // 위에 있는 칸으로 보이지 않아, 아래 줄이 본문 맨 위로 올라가 윗줄 글 위에 겹쳐 그려졌다
    const at = (c: HTMLElement, v: string) => Number(c.style.getPropertyValue(v)) || 0
    for (const x of items)
      x.above = items
        .filter((y) => at(y.c, '--y') + at(y.c, '--h') <= at(x.c, '--y') && at(y.c, '--x') < at(x.c, '--x') + at(x.c, '--w') && at(x.c, '--x') < at(y.c, '--x') + at(y.c, '--w'))
        .map((y) => y.c)
    // 같은 묶음에서 같은 줄 선(--y)에 서고 위에 있는 칸도 같은 칸들은 같이 옮긴다: 나란한 칸의 윗선(과 차트 옆에 가운데로 내린
    // 짧은 칸)이 그대로다. 위에 있는 칸이 다르면(소제목 묶음 둘이 나란한 장) 저마다 제 소제목 아래에 붙는다
    const rows = new Map<string, typeof items>()
    for (const x of items) {
      const key = [x.c.dataset.band ?? '', x.c.style.getPropertyValue('--y'), ...x.above.map((c) => c.dataset.block)].join('|')
      rows.set(key, (rows.get(key) || []).concat(x))
    }
    const order = Array.from(rows.values()).sort((p, q) => Math.min(...p.map((x) => x.r.top)) - Math.min(...q.map((x) => x.r.top)))
    // 줄마다 앞 줄 내용 아래 --bk-gap(소제목 아래는 headGap)에 쌓는다. 사이는 늘 같은 값이라 장마다, 묶음마다 같다
    // 같은 줄의 첫 글줄 윗선 (docs/VISUAL-RULES.md 5): 부품마다 첫 글 위의 빈 키(이름표, 소제목, 들여 쓰기의 위 여백)가 달라 한 줄의 윗선이
    // 4~20px 어긋났다. 같은 판의 줄(같은 묶음, 같은 --y)에서 글로 시작하는 칸끼리 쌓은 자리의 가장 낮은 윗선에 맞춰 내린다(칸마다 더 내리는 몫).
    // 한 번 쌓아 자리를 보고 그 몫을 넣어 다시 쌓는다(아래 줄이 내린 만큼 따라 내려간다). 48px 넘게 다르면 짜임이 다른 것(그림 옆의 글)이라 그대로
    const firstTop = new Map<HTMLElement, number>()
    for (const x of items) {
      const inner = x.c.querySelector<HTMLElement>(':scope > .bk-in')
      const ls = inner ? lines(inner, true) : []
      if (!ls.length || !x.c.classList.contains('is-shared') || x.c.classList.contains('lk-row')) continue
      const t = Math.min(...ls.map((q) => q.t))
      if (t - x.ink!.t < 8 * k || x.c.classList.contains('bk-look-card')) firstTop.set(x.c, t)
    }
    const lineUp = new Map<HTMLElement, number>()
    const alignTops = (dy: Map<HTMLElement, number>) => {
      lineUp.clear()
      // 원형 그래프와 글 묶음은 보이는 전체의 가운데를 맞춘다. 윗선만 맞추면
      // 세 줄 목록이 원의 위쪽 절반에 붙어, 서로 다른 줄처럼 보였다.
      const centered = new Set<HTMLElement>()
      for (const row of order) {
        if (row.length !== 2 || !row.every((x) => x.c.classList.contains('bk-look-plain'))) continue
        const chart = row.find((x) => x.c.dataset.type === 'ring')
        const copy = row.find((x) => ['bullets', 'text', 'facts', 'checks'].includes(x.c.dataset.type ?? ''))
        if (!chart || !copy) continue
        const centers = row.map((x) => (x.ink!.t + x.ink!.b) / 2 + dy.get(x.c)!)
        const goal = Math.max(...centers)
        row.forEach((x, i) => {
          centered.add(x.c)
          if (goal - centers[i] >= 1) lineUp.set(x.c, goal - centers[i])
        })
      }
      const groups = new Map<string, typeof items>()
      for (const x of items) {
        if (!firstTop.has(x.c) || centered.has(x.c)) continue
        const key = (x.c.dataset.band ?? '') + '|' + x.c.style.getPropertyValue('--y')
        groups.set(key, (groups.get(key) || []).concat(x))
      }
      groups.forEach((g) => {
        if (g.length < 2) return
        const tops = g.map((x) => firstTop.get(x.c)! + dy.get(x.c)!)
        const goal = Math.max(...tops)
        if (goal - Math.min(...tops) > 48 * k) return
        g.forEach((x, i) => {
          if (goal - tops[i] >= 1) lineUp.set(x.c, goal - tops[i])
        })
      })
    }
    const inkX = new Map(items.map((x) => [x.c, drawnX(x.c)] as const))
    const stack = () => {
      const dy = new Map<HTMLElement, number>()
      for (const row of order) {
        let at = a.top
        for (const x of items) {
          if (!row[0].above.includes(x.c) || !dy.has(x.c)) continue
          // 위 칸의 그려진 것이 이 줄의 그려진 것과 옆으로 멀리 떨어져 있으면(캔버스 24px 넘게) 그 아래에 붙을 까닭이 없다: 판 너비를 다 쓰는
          // 줄의 짧은 날짜 하나가 오른쪽의 긴 준비 상황 아래로 내려가, 왼쪽 진행 막대 아래가 통째로 비고 날짜만 장 아래 구석에 떨어졌다
          const xs = inkX.get(x.c)
          if (xs && row.every((y) => {
            const ys = inkX.get(y.c)
            return !!ys && Math.min(ys.r, xs.r) - Math.max(ys.l, xs.l) < -24 * k
          })) continue
          const below = links.some((l) => l.classList.contains('lk-v') && l.dataset.after === x.id)
          // 아래 이음표가 서면 이음표가 설 자리(양쪽 --lk-pad)만큼 넓게, 소제목 아래는 그 아래 부품과 한 덩어리라 좁게
          const head = x.c.dataset.type === 'heading'
          // 이음표가 선 사이는 이음표가 묶음 사이를 나타내서 판의 사이(gap0)에 이음표 자리만 더한다(1.5배까지 더하면 120px 넘게 벌어졌다)
          const room = below ? gap0 + 2 * pad : head ? headGap * k : gap
          at = Math.max(at, x.ink!.b + dy.get(x.c)! + room)
        }
        // 줄의 윗선은 첫 글줄 맞추기로 내린 뒤의 자리로 잰다: 맞추기 전 자리로 재면 숫자 카드(위 여백이 있다) 옆의 글이 줄의 윗선이 되어 줄을
        // 앞 줄 바로 아래에 붙이고, 그 글을 카드의 첫 글줄까지 다시 내려 두 칸이 앞 줄과 118px 떨어졌다(묶음 사이 72px).
        // 다만 이 줄의 칸이 모두 같이 내려가는 몫(가장 작은 몫)은 빼고 잰다: 위에 있는 칸이 달라 따로 쌓는 줄(소제목 둘 아래처럼)은 내린 칸만으로
        // 한 줄이라, 그 몫까지 넣으면 내린 만큼 도로 올라가 옆 줄과 맞춘 것이 없어졌다
        const downs = row.map((x) => lineUp.get(x.c) ?? 0)
        const t = Math.min(...row.map((x, i) => x.ink!.t + downs[i])) - Math.min(...downs)
        // 앞 줄 내용 바로 아래로: 대개는 올리지만, 앞 줄 내용이 제 칸보다 길게 그려졌으면(소제목의 덧붙임이 칸 아래로 넘친 것 같은)
        // 그만큼 내린다. 올리기만 하면 넘친 글 위에 아래 줄이 그대로 남아 겹쳤다
        const d = at - t
        for (const x of row) dy.set(x.c, d + (lineUp.get(x.c) ?? 0))
      }
      return dy
    }
    // 남는 높이는 맨 아래 한곳에 모은다(docs/VISUAL-RULES.md 6). 예전에는 내용이 적은 장이 위에 몰려 보인다고 남는 높이를 묶음 사이와
    // 장 머리 아래(2 : 3)에 나눴는데, 그러면 장마다 제목과 본문 사이, 묶음 사이가 달라 대충 놓은 것처럼 보였고 혼자 있는 소제목,
    // 상태가 장 세로 가운데에 떴다. 내용이 적은 장은 글자 단계를 올려(3-1) 채운다
    // 그려진 것이 본문 아래로 나가지 않는 가장 넓은 묶음 사이로
    const settle = () => {
      let dy = new Map<HTMLElement, number>()
      for (const f of [2, 1.75, 1.5, 1.25, 1]) {
        gap = gap0 * f
        lineUp.clear()
        alignTops(stack())
        dy = stack()
        // 옮기는 몫은 캔버스 px로 반올림해 넣으니(아래의 --bk-shift) 반올림한 몫으로 잰다: 반올림 전 몫으로 재면 2px 안이라고 본 것이
        // 반올림한 만큼 더 나가, 두 값 비교의 아래 끝이 본문 아래로 2.1px 나갔다
        const end = Math.max(...items.map((x) => (x.c.classList.contains('bk-look-plain') ? x.ink!.b : x.r.bottom) + Math.round(dy.get(x.c)! / k) * k))
        if (end <= a.bottom + 2 * k) return dy
      }
      // 판의 사이로도 본문 아래로 나가면 윗선 맞추기로 내린 것을 거둔다
      lineUp.clear()
      return stack()
    }
    // 쌓은 자리로 면의 아래 끝을 옆 칸에 맞추고(tail), 줄인 면으로 다시 쌓는다: 면 아래의 묶음이 줄인 만큼 올라온다
    const base = new Map<HTMLElement, { r: DOMRect; trim: number }>()
    tail(items, settle(), k, base)
    tail(items, settle(), k, base)
    const dy = settle()
    // 본문 아래가 꽉 차면 settle은 윗선 맞추기를 거둔다. 들여 쓴 칸은 선과 면이 없으므로, 안에 여유가 있으면 아래 끝을 유지한 채
    // 칸의 윗부분을 줄여 글줄을 맞출 수 있다. 글이 넘치거나 줄인 높이에서 글자 단계가 바뀌어 맞지 않으면 원래 자리로 되돌린다.
    if (!lineUp.size) {
      const rows = new Map<string, typeof items>()
      for (const x of items) {
        if (!firstTop.has(x.c)) continue
        const key = (x.c.dataset.band ?? '') + '|' + x.c.style.getPropertyValue('--y')
        rows.set(key, (rows.get(key) || []).concat(x))
      }
      for (const row of rows.values()) {
        if (row.length < 2) continue
        const top = (c: HTMLElement) => {
          const inner = c.querySelector<HTMLElement>(':scope > .bk-in')
          const ls = inner ? lines(inner, true) : []
          return ls.length ? Math.min(...ls.map((q) => q.t)) : Infinity
        }
        const ts = row.map((x) => top(x.c) + dy.get(x.c)!)
        const goal = Math.max(...ts)
        const diff = goal - Math.min(...ts)
        if (!Number.isFinite(diff) || diff <= 4 * k || diff > 32 * k) continue
        const changes = row.flatMap((x, i) => {
          const px = Math.round((goal - ts[i]) / k)
          return px ? [{ x, px, was: x.c.style.getPropertyValue('--bk-trim') }] : []
        })
        if (!changes.length || changes.some(({ x }) => !x.c.classList.contains('bk-look-card'))) continue
        for (const { x, px, was } of changes) {
          x.c.style.setProperty('--bk-trim', (parseFloat(was) || 0) + px + 'px')
          const inner = x.c.querySelector<HTMLElement>(':scope > .bk-in')
          if (inner) place(inner)
        }
        const fits = changes.every(({ x }) => {
          const inner = x.c.querySelector<HTMLElement>(':scope > .bk-in')
          return !!inner && !over(inner)
        })
        const after = row.map((x) => top(x.c) + dy.get(x.c)! + (changes.find((c) => c.x === x)?.px ?? 0) * k)
        if (!fits || Math.max(...after) - Math.min(...after) > 4 * k) {
          for (const { x, was } of changes) {
            if (was) x.c.style.setProperty('--bk-trim', was)
            else x.c.style.removeProperty('--bk-trim')
            const inner = x.c.querySelector<HTMLElement>(':scope > .bk-in')
            if (inner) place(inner)
          }
          continue
        }
        for (const { x, px } of changes) {
          x.r = x.c.getBoundingClientRect()
          x.ink = drawn(x.c)
          dy.set(x.c, dy.get(x.c)! + px * k)
          lineUp.set(x.c, px * k)
        }
      }
    }
    // 위쪽 칸이 다른 나란한 칸들은 각각 쌓이면서 맞춘 첫 글줄이 다시 어긋날 수 있다.
    // 아래 내용과 본문 끝에 여유가 있는 바탕 없는 칸만 마지막으로 내린다. 이음표가 있는 조합은 기존 쌓기를 따른다.
    if (!links.length) {
      const rows = new Map<string, typeof items>()
      for (const x of items) {
        if (!firstTop.has(x.c)) continue
        const key = (x.c.dataset.band ?? '') + '|' + x.c.style.getPropertyValue('--y')
        rows.set(key, (rows.get(key) || []).concat(x))
      }
      for (const row of rows.values()) {
        if (row.length < 2) continue
        const tops = row.map((x) => firstTop.get(x.c)! + dy.get(x.c)!)
        const goal = Math.max(...tops)
        if (goal - Math.min(...tops) <= 4 * k || goal - Math.min(...tops) > 32 * k) continue
        const changes = row.flatMap((x, i) => {
          const move = Math.round((goal - tops[i]) / k) * k
          return move > 0 ? [{ x, move }] : []
        })
        // 아래 끝이 본문에 닿은 칸은 내리는 만큼 높이를 줄여 아래 끝을 그대로 둔다. 그냥 내리면 칸을 다 쓰는 차트와 숫자 칸의 아래가
        // 본문 밖으로 나가 맞추기를 통째로 거뒀고, 숫자 옆 차트 소제목의 첫 글줄이 7px 어긋난 채 남았다
        // 줄일 칸과 줄일 몫(캔버스 px로 잰 몫, k를 곱한 값)
        const trims = new Map<HTMLElement, number>()
        // 아래에 쌓인 칸(같은 단의 다음 줄)은 같이 내린다: 위 칸만 내리면 둘 사이가 묶음 사이보다 좁아져 맞추기를 거뒀다(숫자 한 줄 둘을
        // 쌓은 단 옆의 차트). 같이 내린 칸도 바탕이 없고 본문 안에 남아야 한다
        const carried = new Map<HTMLElement, number>()
        const safe = changes.every(({ x, move }) => {
          // 면이 없는 칸(바탕 없음, 들여 쓰기)만 옮긴다. 강조(칠한 면)는 면째 옮기면 옆 칸과 면의 윗선이 어긋난다
          const bare = !x.c.classList.contains('bk-look-bold')
          if (bare && x.ink!.b + dy.get(x.c)! + move <= a.bottom + k) {
            const under = items.filter((y) => y.above.includes(x.c))
            const tight = under.filter((y) => y.ink!.t + dy.get(y.c)! - (x.ink!.b + dy.get(x.c)! + move) < gap0 - k)
            return tight.every((y) => {
              if (y.c.classList.contains('bk-look-bold')) return false
              // 같이 내린 칸의 아래 끝이 본문 밖으로 나가면 그 칸도 그만큼 줄인다(그 아래에 또 칸이 없을 때만)
              if (y.ink!.b + dy.get(y.c)! + move > a.bottom + k) {
                if (items.some((z) => z.above.includes(y.c))) return false
                trims.set(y.c, move)
              }
              carried.set(y.c, Math.max(carried.get(y.c) ?? 0, move))
              return true
            })
          }
          // 아래 끝이 본문 밖으로 나가면 내리는 만큼 칸 높이를 줄인다(아래 끝은 그대로). 차트와 표(is-stretchy)는 그림이 줄고, 다른 칸은
          // 안에 남는 높이가 있을 때만(줄인 뒤 글이 넘치면 아래에서 되돌린다)
          if (!bare || move > 32 * k) return false
          trims.set(x.c, move)
          return items.every((y) => !y.above.includes(x.c))
        })
        if (!safe) continue
        const was = new Map([...trims.keys()].map((c) => [c, c.style.getPropertyValue('--bk-trim')] as const))
        for (const [c, move] of trims) {
          c.style.setProperty('--bk-trim', (parseFloat(was.get(c)!) || 0) + Math.round(move / k) + 'px')
          const inner = c.querySelector<HTMLElement>(':scope > .bk-in')
          if (inner) place(inner)
        }
        // 줄인 칸의 글이 넘치면 되돌린다
        const fits = [...trims.keys()].every((c) => {
          const inner = c.querySelector<HTMLElement>(':scope > .bk-in')
          return !!inner && !over(inner)
        })
        if (!fits) {
          for (const [c, v] of was) {
            if (v) c.style.setProperty('--bk-trim', v)
            else c.style.removeProperty('--bk-trim')
            const inner = c.querySelector<HTMLElement>(':scope > .bk-in')
            if (inner) place(inner)
          }
          continue
        }
        for (const x of items) {
          if (!trims.has(x.c)) continue
          x.r = x.c.getBoundingClientRect()
          x.ink = drawn(x.c)
        }
        for (const { x, move } of changes) {
          dy.set(x.c, dy.get(x.c)! + move)
          lineUp.set(x.c, move)
        }
        for (const [c, move] of carried) if (!changes.some(({ x }) => x.c === c)) dy.set(c, dy.get(c)! + move)
      }
    }
    const head = area.parentElement?.querySelector<HTMLElement>(':scope > .s-head')
    // 제목 없는 한 문장 장(부품 하나)만 위아래 가운데에: 장 전체가 그 한 문장이다
    if ((!head || !head.getClientRects().length) && items.length === 1) {
      const end = Math.max(...items.map((x) => x.ink!.b + dy.get(x.c)!))
      const spare = a.bottom - end
      if (spare > 0) for (const x of items) dy.set(x.c, dy.get(x.c)! + spare / 2)
    }
    // 모두 캔버스 8px 밑이면 그대로 (글을 적을 때마다 조금씩 움직이지 않게). 다만 한 줄의 첫 글줄 윗선을 맞춘 것(lineUp)은 몇 px라도
    // 옮긴다: 결론 한 줄(44px)과 목차(52px)의 윗선이 15px 어긋났는데, 맞추려 한쪽을 7px 내리고 다른 쪽을 8px 올린 것이 둘 다 8px 밑이라 버려졌다
    // 서로 다른 윗줄 아래에 쌓인 칸은 stack의 작은 이동만으로도 첫 글줄이 맞을 수 있다.
    // lineUp에 별도 보정이 없다는 이유로 그 이동을 버리면 맞추기 전의 어긋난 줄이 그대로 남는다.
    if (!lineUp.size && Math.max(...items.map((x) => Math.abs(dy.get(x.c)!))) / k < 8) {
      const topGroups = new Map<string, typeof items>()
      for (const x of items) {
        if (!firstTop.has(x.c)) continue
        const key = (x.c.dataset.band ?? '') + '|' + x.c.style.getPropertyValue('--y')
        topGroups.set(key, (topGroups.get(key) || []).concat(x))
      }
      const improvesTops = Array.from(topGroups.values()).some((group) => {
        if (group.length < 2) return false
        const spread = (ts: number[]) => Math.max(...ts) - Math.min(...ts)
        const before = spread(group.map((x) => firstTop.get(x.c)!))
        const after = spread(group.map((x) => firstTop.get(x.c)! + dy.get(x.c)!))
        return before > 4 * k && before <= 48 * k && after < before - k
      })
      if (!improvesTops) {
        // 칸은 그대로 두어도 편집 화면의 선은 양옆 칸의 그려진 범위로 줄인다: 한 줄뿐인 장(옆으로 나란한 둘)은 여기서 끝나 선이 판 높이
        // 그대로 남았고, 눈높이로 내린 만큼 장 아래로 길게 나가 '글이 넘쳤어요'가 떴다
        if (edit) gutters(items, new Map(items.map((x) => [x.c, 0])), area, k)
        return
      }
    }
    for (const x of items) {
      const px = Math.round(dy.get(x.c)! / k)
      if (px) x.c.style.setProperty('--bk-shift', px + 'px')
    }
    // 옆 이음표는 옮긴 앞 칸의 그려진 것 가운데 높이로, 아래 이음표는 옮긴 위아래 칸의 그려진 것 사이 가운데로
    for (const l of links) {
      const from = items.find((x) => x.id === l.dataset.after)
      if (!from) continue
      if (l.classList.contains('lk-h')) {
        // 앞 칸의 그려진 것 가운데 높이에: 칸 가운데에 두면 위에 붙은 소제목 옆 이음표가 그 아래로 올려 붙인 부품에 걸쳤다
        const r = l.getBoundingClientRect()
        const mid = (from.ink!.t + from.ink!.b) / 2 + dy.get(from.c)!
        const move = Math.round((mid - (r.top + r.bottom) / 2) / k)
        if (move) l.style.setProperty('--bk-shift', move + 'px')
        continue
      }
      const to = items.filter((x) => x.r.top >= from.r.bottom - 1 && side(x.r, from.r)).sort((p, q) => p.r.top - q.r.top)[0]
      if (!to) continue
      const r = l.getBoundingClientRect()
      const mid = (from.ink!.b + dy.get(from.c)! + to.ink!.t + dy.get(to.c)!) / 2
      const move = Math.round((mid - (r.top + r.bottom) / 2) / k)
      if (move) l.style.setProperty('--bk-shift', move + 'px')
    }
    if (edit) gutters(items, dy, area, k)
  }

  /**
   * 장 제목과 다투는 글이 있는지: 같은 굵기(600 이상)에 제목 ÷ 1.2 이상인 한글 글. 내용이 적은 장의 문장을 키우다 제목만큼 커지면
   * 제목이 여럿으로 읽힌다. 숫자는 답이라 커도 된다. slide는 장(또는 장 머리를 품은 상자).
   * 그림 컴포넌트(PICTURES)에서는 제목과 다른 색의 글(강조색의 답, 버금 글자색)을 견주지 않는다(screens/assembly.ts의 rivals와 같다).
   * 그림의 굵은 이름표는 CSS가 44px(크게면 그 1.2배)에서 멈춰 제목과 다투지 않는다(styles/blocks/base.css). 예전에는 굵은 36px
   * 이름이 1.44배면 51.84px로 제목 ÷ 1.2(51.67)를 0.17px 넘어서, 판을 혼자 쓰는 그림이 늘 1.2배에서 멈추고 작게 남았다
   */
  function rivals(slide: Element | null, scopes: HTMLElement[]): boolean {
    const title = slide?.querySelector<HTMLElement>(':scope > .s-head .s-title, :scope > .cs-main > .cs-title')
    if (!title || !(title.textContent || '').trim()) return false
    const ts = getComputedStyle(title)
    const tf = parseFloat(ts.fontSize)
    for (const scope of scopes)
      for (const q of lines(scope)) {
        const el = q.n.parentElement
        if (!el || !/[가-힣]{2}/.test(q.n.textContent || '')) continue
        const cs = getComputedStyle(el)
        if (parseFloat(cs.fontSize) < tf / 1.2 - 0.5 || Number(cs.fontWeight) < 600) continue
        if (cs.color !== ts.color && PICTURES.has(el.closest<HTMLElement>('.bk')?.dataset.type || '')) continue
        return true
      }
    return false
  }

  /** 칸이 본문 상자 위에서부터 얼마나 내려와 있는지 (캔버스 px) */
  function topIn(el: Element, area: HTMLElement): number {
    const a = area.getBoundingClientRect()
    return (el.getBoundingClientRect().top - a.top) / (a.height / area.offsetHeight)
  }

  /**
   * 쓰는 칸이 든 컴포넌트 칸을 지난번에 보이던 자리에 붙잡는다 (글을 쓰는 동안 fit의 끝). 글자가 들어가며 짜임이 바뀌면(안내 숫자가
   * 지워져 목표 대비의 막대가 바뀌는 것 같은) 쌓기가 칸을 다시 놓아서, 첫 글자에 컴포넌트가 48px 미끄러지거나 숫자를 칠 때마다 오르내렸다.
   * 칸 안의 글 칸 자리는 붙잡지 않는다: 값을 따라 옮겨 가는 칸(막대 위의 값, 위치 비교의 점 이름)이나 제 줄 수만큼 커지는 칸을 붙잡으면
   * 그만큼 컴포넌트 전체가 오르내렸다(두 값 비교에서 값을 치는 동안 차트 전체가 221px 올라갔다).
   * 모든 칸과 선을 같이 옮겨 칸 사이는 그대로이고, 그려진 것이 본문 상자 밖으로 나가게는 옮기지 않는다. 다 쓰고 나가면 다시 맞춘다
   */
  function anchor(cells: HTMLElement[], area: HTMLElement): void {
    const cell = document.activeElement?.closest<HTMLElement>('.bk')
    const was = cell ? tops.get(cell) : undefined
    const a = area.getBoundingClientRect()
    const k = a.height / area.offsetHeight
    if (!cell || was === undefined || !cells.includes(cell) || !k) return
    let t = Infinity
    let b = -Infinity
    for (const c of cells) {
      const d = drawn(c)
      if (!d) return
      t = Math.min(t, d.t)
      b = Math.max(b, d.b)
    }
    const lo = Math.ceil((a.top - t) / k)
    const hi = Math.floor((a.bottom - b) / k)
    const move = Math.max(Math.min(lo, 0), Math.min(Math.max(hi, 0), Math.round(was - topIn(cell, area))))
    if (!move) return
    for (const x of [...cells, ...Array.from(area.querySelectorAll<HTMLElement>(':scope > :is(.bk-link, .bk-line)'))]) {
      const v = parseFloat(x.style.getPropertyValue('--bk-shift')) || 0
      x.style.setProperty('--bk-shift', v + move + 'px')
    }
  }

  /**
   * 위아래 균형 (docs/VISUAL-RULES.md 6): 채움(키우기, 줄 사이)을 마치고도 남는 높이는 내용 위와 아래에 1 : 1.2로 둔다(눈높이 가운데).
   * 맨 아래에만 모으면 덜 찬 장은 위에 붙고 아래만 길게 비었다. 균형은 본문 윗선부터 장 틀의 아랫선까지로 잡는다: 하단 표시(출처,
   * '예시: …')는 오른쪽 아래 구석의 메타라 공백 설계에 넣지 않는다(그 몫까지 비우면 아래가 두 겹으로 빈다). 내용은 본문 상자 안에 둔다.
   * 아래에 묶을 부품이 아직 없는 소제목이 있는 장은 위에 붙인 그대로.
   * 옮긴 장은 data-eye를 붙인다(60%를 못 채운 완결된 장은 'full': 검사가 머리 아래 빈 곳과 채움을 봐준다)
   */
  function eyeLevel(cells: HTMLElement[], area: HTMLElement, hold?: number): number {
    const move = hold ?? eyeMove(cells, area)
    if (!move) return 0
    // 이음표와 편집 화면의 크기 손잡이(.bk-line)도 칸과 같이: 두고 내리면 손잡이가 위 빈 곳에 뜨거나 아래 줄의 글을 가로질렀다
    for (const el of [...cells, ...Array.from(area.querySelectorAll<HTMLElement>(':scope > :is(.bk-link, .bk-line)'))]) {
      const was = parseFloat(el.style.getPropertyValue('--bk-shift')) || 0
      el.style.setProperty('--bk-shift', was + move + 'px')
    }
    area.dataset.eye = fillOf(cells, area) < 0.6 ? 'full' : '1'
    return move
  }

  /** 눈높이 가운데로 내릴 값 (캔버스 px). 내리지 않으면 0 */
  function eyeMove(cells: HTMLElement[], area: HTMLElement): number {
    // 소제목은 그 아래에 묶을 부품이 있으면 완결된 묶음이라 같이 옮긴다. 아래가 빈 소제목(뒤를 기다리는 것)이 있으면 위에 붙인 그대로.
    // 소제목이 든 장을 모두 위에 붙이던 때는 소제목 묶음 둘이 나란한 장이 위 절반에 몰리고 아래 절반이 통째로 비었다
    const num = (c: HTMLElement, v: string) => Number(c.style.getPropertyValue(v)) || 0
    const waits = (h: HTMLElement) =>
      !cells.some((o) => o !== h && num(o, '--y') >= num(h, '--y') + num(h, '--h') && num(o, '--x') < num(h, '--x') + num(h, '--w') && num(h, '--x') < num(o, '--x') + num(o, '--w'))
    if (cells.some((c) => c.dataset.type === 'heading' && waits(c))) return 0
    // 장 제목이 없는 장도 같다(쌓기는 부품 하나뿐인 한 문장 장만 가운데에 둔다): 둘 이상이면 위에 붙고 아래 절반이 비었다
    const slide = area.parentElement
    if (!slide) return 0
    const a = area.getBoundingClientRect()
    const k = a.height / area.offsetHeight
    if (!k) return 0
    let t = Infinity
    let b = -Infinity
    for (const c of cells) {
      const d = drawn(c)
      if (!d) return 0
      t = Math.min(t, d.t)
      b = Math.max(b, d.b)
    }
    // 장 틀의 아랫선: 본문 상자 아래에 비워 둔 하단 표시 몫(아래 여백에서 틀 여백 --pad-y를 뺀 것)을 더한다
    const cs = getComputedStyle(slide)
    const foot = Math.max(0, (parseFloat(cs.paddingBottom) || 0) - (parseFloat(cs.getPropertyValue('--pad-y')) || 0)) * k
    const spare = a.bottom + foot - a.top - (b - t)
    // 위의 빈 곳은 보이는 그대로 장 머리(제목, 부제) 아래부터 센다(레이아웃 장의 fitLayout과 같다): 본문 윗선부터 세면 --body-gap만큼
    // 위가 넓어져, 판을 혼자 쓰는 납작한 흐름(다섯 단계)이 장 제목보다 장 아래 끝에 더 가까이 앉아 제목 아래가 휑했다.
    // (gap + 내린 값) : (아래 - 내린 값) = 1 : 1.2. 내용은 본문 상자 밖으로는 내리지 않는다
    const head = slide.querySelector<HTMLElement>(':scope > .s-head')
    const gap = head?.getClientRects().length ? Math.max(0, a.top - head.getBoundingClientRect().bottom) : 0
    const move = Math.round(Math.min(a.top + (spare - 1.2 * gap) / 2.2 - t, a.bottom - b) / k)
    return move < 8 ? 0 : move
  }

  /**
   * 답 글의 크기 (docs/DESIGN.md '부품끼리의 위계'): 강조 상자의 글(꼭 알아야 할 것, 결정 요청)과 핵심 한 줄은 장의 답이라 옆 컴포넌트의
   * 글보다 작으면 위계가 거꾸로 읽힌다. 강조 상자는 긴 글(30자 넘게)과 좁거나 낮은 칸에서 한 단계씩 줄고, 옆 목록은 넓은 칸과 남는 자리로
   * 키워져서 결정 요청 30px 아래에 준비 상황의 항목이 36px였다. 그래서 답 글을 옆 컴포넌트의 가장 큰 글만큼 키운다. 강조 상자는 본문
   * 단계(--t-body) 밑에서 시작한 글(근거)과 견준다: 소제목처럼 본문보다 큰 단계에서 시작한 글은 묶음의 이름이라 답보다 커도 된다.
   * 핵심 한 줄은 다른 핵심 한 줄 밖의 모든 글(강조 상자까지)과 견준다. 숫자와 그림의 이름표(흐름, 연결도 같은)는 견주지 않는다.
   * 칸이 넘치거나 장 제목과 다투게 되면 그대로 둔다. CSS의 상한(바탕 없는 강조 상자의 44, 핵심 한 줄의 --msg-cap)도 그대로다.
   * 편집 화면의 빈칸 안내도 글로 본다: 안내를 빼면 첫 글자를 치는 순간 답 글이 한 단계 커졌다
   */
  const ANSWERS = [
    { cell: 'bk-callout', text: '.bk-call-t', skip: '.bk-callout, .bk-message', bodyOnly: true },
    { cell: 'bk-message', text: '.bk-msg-t', skip: '.bk-message', bodyOnly: false },
  ] as const
  const ANSWER_TEXT = ANSWERS.map((a) => a.text).join(', ')
  // 글이 문장이 아니라 그림의 이름표인 부품 (screens/assembly.ts의 FIGURE_TYPES와 같다)
  const PICTURES = new Set(['flow', 'network', 'merge', 'split', 'tiles', 'hub', 'gather', 'search', 'layers', 'gate', 'dupes', 'aliases', 'adoption', 'spread', 'rank', 'cine'])
  // 숫자와 단위('2.4조 원', '억 원')는 답이라 견주지 않는다 (screens/assembly.ts의 numeric과 같다)
  const numberish = (s: string) => {
    const words = s.replace(/[\d.,%+\-~()\s]/g, '')
    return words.length <= 2 || (/\d/.test(s) && words.length <= 3)
  }
  function answers(cells: HTMLElement[], area: HTMLElement): void {
    const body = parseFloat(getComputedStyle(area).getPropertyValue('--t-body')) || 30
    const largest = (own: HTMLElement, skip: string, bodyOnly: boolean) => {
      let top = 0
      for (const c of cells) {
        if (c === own || c.matches(skip) || c.classList.contains('bk-layout') || PICTURES.has(c.dataset.type ?? '')) continue
        const inner = c.querySelector<HTMLElement>(':scope > .bk-in')
        if (!inner) continue
        for (const q of lines(inner, true)) {
          const el = q.n.parentElement
          const text = (q.n.textContent || '').trim()
          if (!el || !/[가-힣]/.test(text) || numberish(text)) continue
          const cs = getComputedStyle(el)
          if (bodyOnly && !(parseFloat(cs.getPropertyValue('--fs')) <= body + 0.5)) continue
          top = Math.max(top, parseFloat(cs.fontSize))
        }
      }
      return top
    }
    for (const a of ANSWERS)
      for (const c of cells) {
        if (!c.classList.contains(a.cell)) continue
        const inner = c.querySelector<HTMLElement>(':scope > .bk-in')
        const el = inner?.querySelector<HTMLElement>(a.text)
        if (!inner || !el || !el.offsetHeight) continue
        const top = largest(c, a.skip, a.bodyOnly)
        const cs = getComputedStyle(el)
        const now = parseFloat(cs.fontSize)
        const fs = parseFloat(cs.getPropertyValue('--fs'))
        if (!(top > now + 0.5) || !(fs > 0) || !(now > 0)) continue
        el.style.setProperty('--fs', (fs * top) / now + 'px')
        place(inner)
        if (crowded(inner) || rivals(area.parentElement, [inner])) {
          el.style.removeProperty('--fs')
          place(inner)
        }
      }
  }

  /**
   * 같은 장의 숫자 말투 (docs/VISUAL-RULES.md 5): 큰 숫자, 숫자 한 줄, 숫자와 흐름의 숫자는 한 장에 둘 이상이면 같은 크기로 맞춘다. 큰 숫자는
   * 칸 크기로 108~154, 숫자 한 줄은 62에서 시작해서, 한 장에 둘이 같이 서면 하나는 크게, 하나는 작게 따로 놀았다(로고 모음 아래의 숫자 둘,
   * 추이 옆의 큰 숫자와 숫자 한 줄). 맞추는 크기는 지금 크기들에서 글자 비율(1.2)의 단계로 오르내린 값 가운데, 모든 칸이 넘치지 않는
   * 가장 큰 것. 모든 칸에 자리가 남으면 가장 큰 숫자보다 두 단계까지 더 키운다(숫자는 장의 답이라 크게: 로고 모음 아래의 숫자 둘이
   * 62px로 남아 로고보다 작아 보였다). 숫자 글자 칸의 --fs를 그 크기가 되게 고쳐 쓴다(한 줄 맞추기의 너비 한도는 그대로).
   * 목표 대비의 달성률은 이름과 한 글자선에 서서 넣지 않는다: 키우면 이름이 내려가 옆 칸과 첫 글줄 윗선이 어긋났다
   */
  const TONE = '.bk-num-v, .bk-sl-v, .bk-sp-v'
  // 키울 때의 끝: 큰 칸의 큰 숫자를 한 단계 키운 크기(blocks/number.css). 더 크면 숫자가 장 제목보다 세 배 넘게 커진다
  const toneCap = 185
  function tone(cells: HTMLElement[]): void {
    const vals: { c: HTMLElement; inner: HTMLElement; el: HTMLElement }[] = []
    for (const c of cells) {
      const inner = c.querySelector<HTMLElement>(':scope > .bk-in')
      if (!inner) continue
      for (const el of Array.from(inner.querySelectorAll<HTMLElement>(TONE))) {
        el.style.removeProperty('--fs')
        if (el.offsetHeight) vals.push({ c, inner, el })
      }
    }
    if (new Set(vals.map((v) => v.c)).size < 2) return
    const size = (el: HTMLElement) => parseFloat(getComputedStyle(el).fontSize)
    // 글자 크기는 --fs에 칸의 배율을 곱한 값이지만, 한 줄 맞추기(.one-line)는 칸 너비로 그 값을 자른다. 잘린 크기로 배율을 재면
    // 맞출 크기를 --fs로 되돌릴 때 너무 크게 적어서, 좁은 칸의 큰 숫자는 잘린 크기(86)에 그대로 남고 옆 숫자 한 줄만 72로 줄었다
    // (두 숫자의 크기가 달랐다). 배율은 너비 한도를 잠시 걷고 잰다
    const base = vals.map((v) => {
      const fs = parseFloat(getComputedStyle(v.el).getPropertyValue('--fs'))
      const now = size(v.el)
      v.el.style.setProperty('--line-room', '100000px')
      const free = size(v.el)
      v.el.style.removeProperty('--line-room')
      return { fs, now, k: free / fs }
    })
    if (base.some((b) => !(b.fs > 0) || !(b.now > 0) || !(b.k > 0))) return
    const top = Math.max(...base.map((b) => b.now))
    const low = Math.min(...base.map((b) => b.now))
    const set = (px: number) => {
      vals.forEach((v, i) => v.el.style.setProperty('--fs', px / base[i].k + 'px'))
      for (const v of vals) place(v.inner)
    }
    const tries = Array.from(new Set(base.flatMap((b) => [-2, -1, 0, 1, 2, 3].map((n) => Math.round(b.now * Math.pow(1.2, n))))))
      .filter((px) => px <= Math.max(top, Math.min(top * 1.44, toneCap)) + 0.5 && px >= low - 0.5)
      .sort((p, q) => q - p)
    const inners = Array.from(new Set(vals.map((v) => v.inner)))
    for (const px of tries) {
      set(px)
      // 한 줄 맞추기가 너비로 줄인 칸이 있으면 그 크기가 한도다(모두 그 크기가 되지 않으면 다음 크기로)
      const got = vals.map((v) => size(v.el))
      if (Math.min(...got) < px - 1 || Math.max(...got) > px + 1) continue
      if (!inners.some((inner) => crowded(inner))) return
    }
    set(low)
  }

  /**
   * 칸에서 그려진 것의 왼쪽, 오른쪽 끝 (화면 px). 면이 있는 칸은 칸째, 없으면 글 줄과 그림, 칠하거나 테를 두른 상자(drawn과 같은 것).
   * 글과 그림만 보면 흐름의 단계 상자(그림자로 두른 테)를 몰라서, 옆 맞추기(balance)가 흐름을 글 끝까지만 그려진 것으로 알고 오른쪽으로
   * 92px 옮겨 마지막 상자가 장 틀 밖으로 46px 나갔다
   */
  function drawnX(c: HTMLElement, visibleOnly = false): { l: number; r: number } | null {
    const box = c.getBoundingClientRect()
    if (!visibleOnly && !c.classList.contains('bk-look-plain')) return { l: box.left, r: box.right }
    const inner = c.querySelector<HTMLElement>(':scope > .bk-in')
    if (!inner) return null
    let l = Infinity
    let r = -Infinity
    for (const q of lines(inner, true)) {
      l = Math.min(l, q.l)
      r = Math.max(r, q.r)
    }
    for (const f of figures(inner).concat(Array.from(inner.querySelectorAll('img')))) {
      const q = f.getBoundingClientRect()
      l = Math.min(l, q.left)
      r = Math.max(r, q.right)
    }
    const els = inner.querySelectorAll<HTMLElement>('*')
    for (let i = 0; i < els.length; i++) {
      const el = els[i]
      if (el.parentElement?.closest('svg') || el.closest('.ed-halo, .it-remove, .it-grip, .pn-tools, .img-tools, .bk-handle')) continue
      const cs = getComputedStyle(el)
      if (cs.visibility === 'hidden' || cs.opacity === '0') continue
      if (clearColor(cs.backgroundColor) && cs.backgroundImage === 'none' && cs.boxShadow === 'none' && !(['Top', 'Bottom', 'Left', 'Right'] as const).some((side) => edgeSeen(cs, side))) continue
      const q = el.getBoundingClientRect()
      if (!q.width || !q.height) continue
      l = Math.min(l, q.left)
      r = Math.max(r, q.right)
    }
    // ::before, ::after로 긋는 줄 선(개요의 줄 사이 선처럼 줄 너비를 다 쓰는 선)도 그려진 것이다: 모르면 옆 맞추기가 개요를 글 끝까지만
    // 그려진 것으로 알고 오른쪽으로 113px 옮겨 줄 선이 장 틀 밖으로 나갔다. 자리를 잡은(absolute) 것만 그 자리로 본다
    for (let i = 0; i < els.length; i++) {
      const el = els[i]
      if (el.parentElement?.closest('svg') || el.closest('.ed-halo, .it-remove, .it-grip, .pn-tools, .img-tools, .bk-handle')) continue
      for (const w of ['::before', '::after']) {
        const ps = getComputedStyle(el, w)
        if (ps.content === 'none' || ps.content === 'normal' || ps.display === 'none' || ps.position !== 'absolute' || ps.visibility === 'hidden') continue
        if (clearColor(ps.backgroundColor) && ps.backgroundImage === 'none' && !edgeSeen(ps, 'Top') && !edgeSeen(ps, 'Left')) continue
        const x = parseFloat(ps.left)
        const pw = parseFloat(ps.width)
        if (!Number.isFinite(x) || !(pw > 0)) continue
        const q = el.getBoundingClientRect()
        const k = el.offsetWidth ? q.width / el.offsetWidth : 1
        l = Math.min(l, q.left + x * k)
        r = Math.max(r, q.left + (x + pw) * k)
      }
    }
    return l < r ? { l, r } : null
  }

  /**
   * 이음표의 자리 (docs/VISUAL-RULES.md 5): 잇는 두 컴포넌트의 그려진 것 사이 간격 한가운데, 둘이 함께 선 축 위. 아래 이음표면 아래
   * 컴포넌트가 화살표 바로 아래에 와야 해서, 두 컴포넌트의 그려진 가로 범위가 겹치는 곳의 가운데에 선다. 겹침이 좁은 쪽의 30%도
   * 안 되면(축이 어긋났다) 그리지 않는다(is-apart). 옆 이음표도 같다(세로 범위). 쌓기와 옆 맞추기, 눈높이로 옮긴 뒤 그려진 자리로 잰다
   */
  function linkAxes(cells: HTMLElement[], area: HTMLElement): void {
    const k = area.getBoundingClientRect().width / area.offsetWidth
    if (!k) return
    const num = (c: HTMLElement, v: string) => Number(c.style.getPropertyValue(v)) || 0
    for (const l of Array.from(area.querySelectorAll<HTMLElement>(':scope > .bk-link'))) {
      const from = cells.find((c) => c.dataset.block === l.dataset.after)
      if (!from) continue
      const h = l.classList.contains('lk-h')
      const fx = num(from, '--x')
      const fy = num(from, '--y')
      const fw = num(from, '--w')
      const fh = num(from, '--h')
      const to = cells.filter((c) =>
        h
          ? num(c, '--x') === fx + fw && num(c, '--y') < fy + fh && fy < num(c, '--y') + num(c, '--h')
          : num(c, '--y') === fy + fh && num(c, '--x') < fx + fw && fx < num(c, '--x') + num(c, '--w'),
      )
      const a = drawn(from)
      const ax = drawnX(from)
      const bs = to.map((c) => ({ y: drawn(c), x: drawnX(c) })).filter((b) => b.y && b.x) as { y: { t: number; b: number }; x: { l: number; r: number } }[]
      if (!a || !ax || !bs.length) continue
      const by = { t: Math.min(...bs.map((b) => b.y.t)), b: Math.max(...bs.map((b) => b.y.b)) }
      const bx = { l: Math.min(...bs.map((b) => b.x.l)), r: Math.max(...bs.map((b) => b.x.r)) }
      // 겹치는 축: 옆 이음표는 세로 범위, 아래 이음표는 가로 범위
      const lo = h ? Math.max(a.t, by.t) : Math.max(ax.l, bx.l)
      const hi = h ? Math.min(a.b, by.b) : Math.min(ax.r, bx.r)
      const narrow = h ? Math.min(a.b - a.t, by.b - by.t) : Math.min(ax.r - ax.l, bx.r - bx.l)
      if (hi - lo < 0.3 * narrow) {
        l.classList.add('is-apart')
        continue
      }
      const r = l.getBoundingClientRect()
      const cx = h ? (ax.r + bx.l) / 2 : (lo + hi) / 2
      const cy = h ? (lo + hi) / 2 : (a.b + by.t) / 2
      const sx = (parseFloat(l.style.getPropertyValue('--bk-shift-x')) || 0) + Math.round((cx - (r.left + r.right) / 2) / k)
      const sy = (parseFloat(l.style.getPropertyValue('--bk-shift')) || 0) + Math.round((cy - (r.top + r.bottom) / 2) / k)
      if (sx) l.style.setProperty('--bk-shift-x', sx + 'px')
      else l.style.removeProperty('--bk-shift-x')
      if (sy) l.style.setProperty('--bk-shift', sy + 'px')
      else l.style.removeProperty('--bk-shift')
    }
  }

  /** 본문 높이 가운데 그려진 내용이 쓰는 몫 (쌓은 뒤 맨 위 내용에서 맨 아래 내용까지, 본문 위 끝부터 잰다) */
  function fillOf(cells: HTMLElement[], area: HTMLElement): number {
    const a = area.getBoundingClientRect()
    if (!a.height) return 1
    let b = -Infinity
    for (const c of cells) {
      const d = drawn(c)
      if (d) b = Math.max(b, d.b)
    }
    return b === -Infinity ? 1 : (b - a.top) / a.height
  }

  /**
   * 옆으로 나란한 단의 남는 너비 (docs/VISUAL-RULES.md 6의 가로). 판은 본문 너비를 칸으로 다 나누지만, 글 폭(--measure)이나 내용이
   * 칸보다 좁으면 내용이 칸마다 왼쪽에 붙어 컴포넌트 둘이 본문 왼쪽 70% 안에 몰리고 오른쪽이 통째로 비었다. 줄(data-band)마다
   * 단(어느 칸도 가로지르지 않는 세로 경계로 나눈 묶음)의 그려진 너비를 재어, 남는 너비를 양 끝과 단 사이에 고르게 나눈다
   * 짧은 글 둘은 각 칸 안에서 내용만 옮기고, 그 밖에는 단을 칸째 오른쪽으로 옮긴다(--bk-shift-x). 칸끼리 겹치게 되면 옮기지 않는다.
   * 이음표가 선 줄은 그대로.
   * 바탕(들여 쓰기, 강조)이 있는 칸도 같이 옮긴다: 예전에는 면이 칸 너비라서 뺐는데, 지금은 어느 바탕도 면이나 선을 그리지 않아
   * (looks.css) 강조로 쓴 결정 요청 옆의 목록이 본문 왼쪽 70% 안에 몰리고 오른쪽 30%가 통째로 비었다
   */
  function balance(cells: HTMLElement[], area: HTMLElement, hold?: Map<string, number>, contentHold?: Map<string, number>): void {
    if (hold) {
      const right = area.getBoundingClientRect().right + 2 * (area.getBoundingClientRect().width / (area.offsetWidth || 1))
      const shifted: HTMLElement[] = []
      for (const c of cells) {
        const px = hold.get(c.dataset.block ?? '')
        if (px) {
          c.style.setProperty('--bk-shift-x', px + 'px')
          shifted.push(c)
        }
        const inner = c.querySelector<HTMLElement>(':scope > .bk-in')
        const contentPx = contentHold?.get(c.dataset.block ?? '')
        if (inner && contentPx) {
          const was = over(inner)
          inner.style.setProperty('--bk-content-shift', contentPx + 'px')
          if (contentPx > 0) inner.style.setProperty('--bk-content-limit', contentPx + 'px')
          // 붙잡아 둔 자리에서 넘치게 되면 놓는다(아래에서 새로 옮길 때와 같은 잣대): 짧은 글을 가운데로 옮겨 둔 자리를 쓰는 내내 붙잡으면
          // 안쪽 상자가 옮긴 만큼 좁아진 채라, 결정 요청을 길게 쓰자 글이 그 좁은 폭에서 열세 줄로 꺾여 강조 상자 밖, 장 아래까지 흘러내렸다
          if (!was && over(inner)) {
            inner.style.removeProperty('--bk-content-shift')
            inner.style.removeProperty('--bk-content-limit')
          }
        }
      }
      // 옮겨 둔 단에서 글이 본문 오른쪽 밖으로 나가게 되면 단을 모두 놓는다(새로 옮길 때도 칸끼리 맞지 않으면 모두 그대로 둔다).
      // 단을 옮기면 칸 상자가 본문 밖까지 걸쳐서, 짧던 글을 길게 쓰면 줄이 칸 끝까지 차며 장 밖으로 나가 잘렸다(큰 숫자 옆 글 칸,
      // 칸을 떠나야 제자리로 돌아왔다). 한 단만 놓으면 아직 옮겨 둔 옆 단의 숫자와 겹쳤다
      if (shifted.some((c) => (drawnX(c, true)?.r ?? -Infinity) > right)) for (const c of shifted) c.style.removeProperty('--bk-shift-x')
      return
    }
    const a = area.getBoundingClientRect()
    const k = a.width / area.offsetWidth
    if (!a.width || !k) return
    const num = (c: HTMLElement, v: string) => Number(c.style.getPropertyValue(v)) || 0
    const bands = new Map<string, HTMLElement[]>()
    for (const c of cells) bands.set(c.dataset.band ?? '', (bands.get(c.dataset.band ?? '') || []).concat(c))
    // 짧은 글 둘은 칸 전체가 아닌 그려진 글만 칸 안에서 옮긴다. 다른 줄이 본문 전체를 쓰는 차트처럼 한 칸이면 그 줄과
    // 맞출 단이 없으므로 이 줄만 균형을 잡는다. 다른 줄도 여러 단이면 단 사이 정렬을 지키려고 건드리지 않는다.
    const shortText = new Set(['callout', 'message', 'bullets', 'text', 'quote'])
    // 짧은 값의 큰 숫자('D', '7')도 그려진 너비가 좁아 같이 맞춘다: 칸 왼쪽에 한 글자만 서고 옆 글과의 사이가 660px 비었다(검수)
    const short = (c: HTMLElement) => shortText.has(c.dataset.type ?? '') || (c.dataset.type === 'number' && !!c.querySelector('.bk-num[data-short]'))
    const balanced = new Set<string>()
    bands.forEach((band, key) => {
      if (band.length !== 2 || !band.every((c) => short(c) && !c.classList.contains('lk-row')) || num(band[0], '--y') !== num(band[1], '--y')) return
      if (cells.some((c) => !band.includes(c) && (num(c, '--x') !== 0 || num(c, '--w') !== 12 || c.classList.contains('lk-row')))) return
      const pair = [...band].sort((p, q) => num(p, '--x') - num(q, '--x'))
      const ink = pair.map((c) => drawnX(c, true))
      if (ink.every((x): x is { l: number; r: number } => !!x) && ink[0].r <= ink[1].l) {
        const widths = ink.map((x) => x!.r - x!.l)
        const unit = (a.width - widths[0] - widths[1]) / 3
        // 글이 둘 다 짧으면 남는 폭을 셋으로 똑같이 나눌 때 두 내용 사이가 지나치게 벌어진다.
        // 둘 사이를 본문 간격 두 배까지 두고 나머지는 양쪽 바깥에 나누어 한 묶음으로 읽히게 한다.
        const gap = Math.min(unit, 144 * k)
        const outer = (a.width - widths[0] - widths[1] - gap) / 2
        const targets = [a.left + outer, a.left + outer + widths[0] + gap]
        if (gap >= 72 * k) {
          const inners = pair.map((c) => c.querySelector<HTMLElement>(':scope > .bk-in'))
          const was = inners.map((inner) => !!inner && over(inner))
          pair.forEach((c, i) => {
            const r = c.getBoundingClientRect()
            const inner = inners[i]
            // 오른쪽으로는 칸의 안쪽 여백 안까지만 옮긴다. 안쪽 상자는 옮긴 만큼 좁아져서(--bk-content-limit) 칸 끝까지 옮기면 글 폭이
            // 안쪽 여백만큼 모자라 글이 한 줄 더 꺾였고, 내용에 맞춰 줄여 둔 면(hug) 밖으로 넘쳤다(크게에서 핵심 메시지의 부제가 아래 여백을 12px 먹었다)
            const room = r.right - (inner ? parseFloat(getComputedStyle(inner).paddingRight) * k : 0) - ink[i]!.r
            const d = Math.max(r.left - ink[i]!.l, Math.min(room, targets[i] - ink[i]!.l))
            // 0 쪽으로 버린다: 반올림해 0.5px 더 옮기면 글 끝이 딱 맞던 줄이 꺾일 수 있다
            const px = Math.trunc(d / k)
            if (inner && px) {
              inner.style.setProperty('--bk-content-shift', px + 'px')
              // 옮긴 안쪽 상자의 빈 부분도 원래 칸 밖으로 나가면 옆 입력 칸의 클릭 영역과 겹친다.
              if (px > 0) inner.style.setProperty('--bk-content-limit', px + 'px')
            }
          })
          // 그래도 옮겨서 넘치게 된 칸이 있으면 둘 다 옮기지 않는다(한쪽만 옮기면 두 글 사이가 어긋난다). 아래의 단 옮기기가 대신 본다
          if (inners.some((inner, i) => !!inner && !was[i] && over(inner))) {
            for (const inner of inners) {
              inner?.style.removeProperty('--bk-content-shift')
              inner?.style.removeProperty('--bk-content-limit')
            }
          } else balanced.add(key)
        }
      }
    })
    bands.forEach((band, key) => {
      if (balanced.has(key)) return
      if (band.some((c) => c.classList.contains('lk-row'))) return
      // 다른 줄이 본문 오른쪽까지 그려져 있으면(오른쪽 4분의 1 안까지) 장의 오른쪽은 비지 않았다: 이 줄의 단을 옮기면 판의 칸 선에서 벗어나
      // 그 줄과 어긋나기만 한다. 로고 모음 위의 숫자 둘이 0과 50%가 아니라 0과 70%로 벌어져 양쪽으로 찢어져 보였다
      let others = -Infinity
      for (const c of cells) {
        if (band.includes(c)) continue
        const x = drawnX(c, true)
        if (x) others = Math.max(others, x.r)
      }
      if (others >= a.right - 0.25 * a.width) return
      // 단의 경계: 어느 칸도 가로지르지 않는 판의 세로 선
      const cuts = [0]
      for (let x = 1; x < 12; x++) if (band.some((c) => num(c, '--x') === x) && !band.some((c) => num(c, '--x') < x && x < num(c, '--x') + num(c, '--w'))) cuts.push(x)
      if (cuts.length < 2) return
      const cols = cuts.map((x, i) => band.filter((c) => num(c, '--x') >= x && num(c, '--x') < (cuts[i + 1] ?? 12)))
      const inks = cols.map((col) => {
        let l = Infinity
        let r = -Infinity
        for (const c of col) {
          // 들여 쓰기와 강조도 바탕을 칠하지 않는다. 칸 전체를 내용으로 세면 짧은 글 사이가 실제보다 좁다고 보아 양 끝을 더 비우지 못한다.
          const x = drawnX(c, true)
          if (!x) continue
          l = Math.min(l, x.l)
          r = Math.max(r, x.r)
        }
        return { l, r }
      })
      if (inks.some((x) => !(x.l < x.r))) return
      const widths = inks.map((x) => x.r - x.l)
      const spare = a.width - widths.reduce((s, w) => s + w, 0)
      // 양 끝과 단 사이를 같은 폭으로: 가운데만 넓히면 양쪽 내용이 서로 멀어져 한 장으로 읽히지 않는다.
      const unit = spare / (cols.length + 1)
      // 오른쪽 끝이 이미 그만큼(과 캔버스 24px)보다 좁으면 그대로
      if (a.right - inks[inks.length - 1].r <= unit + 24 * k) return
      let at = a.left + unit
      const dx = inks.map((x, i) => {
        const d = at - x.l
        at += widths[i] + unit
        return d
      })
      // 앞 단보다 덜 옮기는 단이 있으면(칸끼리 겹친다) 그대로
      if (dx.some((d, i) => d < -1 || (i > 0 && d < dx[i - 1] - 1))) return
      cols.forEach((col, i) => {
        const px = Math.round(dx[i] / k)
        if (px > 0) for (const c of col) c.style.setProperty('--bk-shift-x', px + 'px')
      })
    })
    // 오른쪽 개요는 줄 선이 칸 끝까지 그어져 있어 위의 균형 맞추기는 가득 찬 것으로 본다. 그러나 값이 짧으면 글은 왼쪽에 몰린다.
    // 줄을 장 밖으로 밀지 않도록 안쪽 폭을 옮긴 만큼 줄이면서, 내용이 여전히 들어가는 경우에만 조금 오른쪽으로 옮긴다.
    if (cells.length === 2 && cells.every((c) => !c.classList.contains('lk-row')) && num(cells[0], '--y') === num(cells[1], '--y')) {
      const pair = [...cells].sort((p, q) => num(p, '--x') - num(q, '--x'))
      const c = pair[1]
      const inner = c.dataset.type === 'facts' ? c.querySelector<HTMLElement>(':scope > .bk-in') : null
      if (inner && !inner.style.getPropertyValue('--bk-content-shift')) {
        const text = lines(inner, true)
        const right = text.reduce((r, q) => Math.max(r, q.r), -Infinity)
        const want = a.right - a.width * 0.23 - right
        const max = c.getBoundingClientRect().width * 0.12
        const px = Math.round(Math.min(want, max) / k)
        if (want > 0 && px > 0) {
          inner.style.setProperty('--bk-content-shift', `${px}px`)
          inner.style.setProperty('--bk-content-limit', `${px}px`)
          if (crowded(inner)) {
            inner.style.removeProperty('--bk-content-shift')
            inner.style.removeProperty('--bk-content-limit')
          }
        }
      }
    }
  }

  /**
   * 편집 화면에서 판을 나누는 선의 손잡이(blocks.tsx의 Lines)를 쌓은 칸 사이로 옮긴다. 선은 판의 자리(--at, --from, --to)에
   * 그려져서 그대로 두면 올려 붙인 부품 위를 지나거나 빈 아래쪽에 떠 있었다.
   * 줄 사이의 선(is-v)은 위아래 칸의 그려진 것 사이 가운데로, 옆 칸 사이의 선(is-h)은 양옆 칸의 그려진 것의 위아래 범위로.
   * 내보낸 파일에는 이 선이 없다
   */
  function gutters(items: { c: HTMLElement; ink: { t: number; b: number } | null }[], dy: Map<HTMLElement, number>, area: HTMLElement, k: number): void {
    const num = (el: HTMLElement, v: string) => Number(el.style.getPropertyValue(v)) || 0
    // 선의 자리를 먼저 다 재고 옮긴다: 선을 하나 옮길 때마다 다음 선을 재면 그때마다 스타일과 자리를 다시 계산했다(선 수만큼).
    // 선은 저마다 제 자리에만 서서(absolute) 한 선을 옮겨도 다른 선의 자리는 그대로다
    const all = Array.from(area.querySelectorAll<HTMLElement>(':scope > .bk-line'))
    const rects = all.map((l) => l.getBoundingClientRect())
    for (const [i, l] of all.entries()) {
      const at = num(l, '--at')
      const from = num(l, '--from')
      const to = num(l, '--to')
      const r = rects[i]
      if (l.classList.contains('is-v')) {
        // 같은 열 범위에서 이 선 위에서 끝나는 칸과 이 선 아래에서 시작하는 칸
        const across = (x: { c: HTMLElement }) => num(x.c, '--x') < to && from < num(x.c, '--x') + num(x.c, '--w')
        const up = items.filter((x) => across(x) && num(x.c, '--y') + num(x.c, '--h') === at)
        const down = items.filter((x) => across(x) && num(x.c, '--y') === at)
        if (!up.length || !down.length) continue
        const top = Math.max(...up.map((x) => x.ink!.b + dy.get(x.c)!))
        const bottom = Math.min(...down.map((x) => x.ink!.t + dy.get(x.c)!))
        const move = Math.round(((top + bottom) / 2 - (r.top + r.bottom) / 2) / k)
        if (move) l.style.setProperty('--bk-shift', move + 'px')
        continue
      }
      const beside = items.filter((x) => (num(x.c, '--x') + num(x.c, '--w') === at || num(x.c, '--x') === at) && num(x.c, '--y') < to && from < num(x.c, '--y') + num(x.c, '--h'))
      if (!beside.length) continue
      const top = Math.min(...beside.map((x) => x.ink!.t + dy.get(x.c)!))
      const bottom = Math.max(...beside.map((x) => x.ink!.b + dy.get(x.c)!))
      const move = Math.round((top - r.top) / k)
      const trim = Math.round((r.height - (bottom - top)) / k)
      if (move) l.style.setProperty('--bk-shift', move + 'px')
      if (trim > 0) l.style.setProperty('--bk-trim', trim + 'px')
    }
  }

  /**
   * 옆 칸 사이의 크기 손잡이(.bk-line.is-h)를 남는 너비로 옮긴 단(balance의 --bk-shift-x) 사이로. 판의 칸 선에 그대로 두면 오른쪽으로
   * 옮긴 단에서 멀리 떨어진 빈 곳에 서거나, 셋째 단 앞의 선이 옮긴 가운데 단의 글을 가로질렀다. 양옆 칸이 옮긴 값의 가운데만큼 옮긴다
   */
  function linesAcross(cells: HTMLElement[], area: HTMLElement): void {
    const num = (el: HTMLElement, v: string) => Number(el.style.getPropertyValue(v)) || 0
    const shift = (c: HTMLElement) => parseFloat(c.style.getPropertyValue('--bk-shift-x')) || 0
    for (const l of Array.from(area.querySelectorAll<HTMLElement>(':scope > .bk-line.is-h'))) {
      const at = num(l, '--at')
      const rows = (c: HTMLElement) => num(c, '--y') < num(l, '--to') && num(l, '--from') < num(c, '--y') + num(c, '--h')
      const left = cells.filter((c) => rows(c) && num(c, '--x') + num(c, '--w') === at)
      const right = cells.filter((c) => rows(c) && num(c, '--x') === at)
      if (!left.length || !right.length) continue
      const px = Math.round((Math.max(...left.map(shift)) + Math.min(...right.map(shift))) / 2)
      if (px) l.style.setProperty('--bk-shift-x', px + 'px')
    }
  }

  /**
   * dirty를 주면 그 밖의 칸은 지난번 맞추기 뒤로 칸 안이 그대로다(BlockArea가 MutationObserver로 안다). 그 칸은 첫 단계(줄이기, 키우기)를
   * 다시 재지 않고 지난 결과를 쓴다: 글자 하나 칠 때마다 모든 칸의 글자 단계를 지웠다가 다시 적어서, 칸마다 그 안 전체의 스타일을 두 번씩
   * 다시 계산했다. 칸끼리는 서로의 안을 바꾸지 않아(칸 안의 글과 그림은 제 칸 크기와 스타일로만 놓인다) 지난 결과는 다시 잰 값과 같다
   */
  function fit(root: ParentNode, dirty?: ReadonlySet<Element> | null): void {
    // 글꼴이 늦게 오면 그 전에 잰 글자 자리는 대신 쓴 글꼴의 것이라, 맞출 때마다 다시 잰다
    inks = {}
    const areas = root instanceof HTMLElement && root.classList.contains('bk-area') ? [root] : Array.from(root.querySelectorAll<HTMLElement>('.bk-area'))
    for (const area of areas) {
      // 움직이는 중이면 맞춘 값을 그대로 두고 끝나면 다시 (맨 위 설명)
      const mover = moving(area)
      if (mover) {
        later(area, mover, () => fit(area))
        continue
      }
      const cells = Array.from(area.querySelectorAll<HTMLElement>(':scope > .bk'))
      // 안 보이는 장(자리를 재지 못한다)은 맞춘 값을 지우지 않고 건너뛴다. 내보낸 파일은 발표하는 동안 다른 장을 숨겨 두는데,
      // 그때 글꼴이 와서 다시 맞추면 숨긴 장의 값이 모두 지워져 넘겨 보면 글자가 다른 크기였다
      if (!cells.length || !area.clientHeight) continue
      for (const l of Array.from(area.querySelectorAll<HTMLElement>(':scope > :is(.bk-link, .bk-line)'))) {
        l.style.removeProperty('--bk-shift')
        l.style.removeProperty('--bk-shift-x')
        l.style.removeProperty('--bk-trim')
        l.classList.remove('is-apart')
      }
      // 크게(1.2배)의 첫 단계는 1/1.2: 0.84면 보통보다 조금 커서(1.008배) 보통 크기로 잰 높이에 딱 맞는 칸은 또 넘친다
      const large = !!area.closest('.sz-large')
      const ladder = large ? [1 / 1.2, steps[1]] : steps
      const least = large ? ladder[0] : 1
      // 첫 단계의 조건: 줄이는 단계와 칸 안 숫자의 글자 크기(앞 맞추기의 tone이 적은 --fs. 첫 단계는 그것을 둔 채 잰다)
      const keyOf = (c: HTMLElement) => ladder.join(',') + '|' + Array.from(c.querySelectorAll<HTMLElement>(TONE), (el) => el.style.getPropertyValue('--fs')).join(',')
      const keys = new Map(cells.map((c) => [c, keyOf(c)] as const))
      const known = new Map<HTMLElement, First>()
      if (dirty)
        for (const c of cells) {
          const f = firsts.get(c)
          if (!dirty.has(c) && f && f.key === keys.get(c)) known.set(c, f)
        }
      for (const c of cells) {
        if (!known.has(c)) c.style.removeProperty('--bk-fit')
        c.style.removeProperty('--bk-air')
        c.style.removeProperty('--bk-lift')
        c.style.removeProperty('--bk-shift')
        c.style.removeProperty('--bk-shift-x')
        c.style.removeProperty('--bk-trim')
        const inner = c.querySelector<HTMLElement>(':scope > .bk-in')
        inner?.style.removeProperty('--bk-content-shift')
        inner?.style.removeProperty('--bk-content-limit')
        // 답 글을 키운 크기(answers)는 맞출 때마다 처음부터: 첫 단계(줄이기, 키우기)는 CSS가 정한 크기로 잰다
        for (const el of Array.from(c.querySelectorAll<HTMLElement>(ANSWER_TEXT))) el.style.removeProperty('--fs')
      }
      delete area.dataset.eye
      // 편집 화면의 편집 표시(칸 옆으로 나온 단추 같은)는 재는 동안 뺀다 (edit.css)
      area.classList.add('is-fitting')
      // 편집 화면에서 자리를 옮기는 중인 칸(blocks.tsx의 useFlip이 translate로 미끄러뜨린다)은 끝자리로 잰다. 움직이는 중의 자리로 재면
      // 쌓기(pack)가 칸을 엉뚱하게 옮겼다: 컴포넌트 장을 새로 만들며 점 목록을 넣으면 칸이 본문 위로 571px 올라가 화면에서 사라졌고,
      // 움직임이 끝난 뒤에는 다시 맞출 까닭이 없어 그대로 남았다. 움직임을 끝 시각으로 잠깐 옮겨 재고 되돌린다(보이는 움직임은 그대로).
      // 칸 안의 글 칸, 항목, 이음표가 다시 맞춘 자리로 미끄러지는 중(settled)인 것도 같다
      const flips = settled(area)
      for (const c of cells) {
        const list = typeof c.getAnimations === 'function' ? c.getAnimations() : []
        for (const a of list) {
          const end = a.effect?.getComputedTiming().endTime
          if (a.playState !== 'running' || typeof end !== 'number') continue
          flips.push({ a, t: a.currentTime })
          a.currentTime = end
        }
      }
      // 글을 쓰는 중이면 쓰기 전에 맞춘 자리 그대로 (typing). 판의 짜임이 바뀌었으면(되돌리기 같은) 새로 맞춘다
      const board = boardOf(cells)
      const before = typing(area) ? held.get(area) : undefined
      const hold = before?.board === board ? before : undefined
      const shrink = (c: HTMLElement, last: number) => {
        const inner = c.querySelector<HTMLElement>(':scope > .bk-in')
        if (!inner) return
        for (const k of ladder) {
          if (k < last || !over(inner)) break
          if (Number(c.style.getPropertyValue('--bk-fit') || 1) <= k) continue
          c.style.setProperty('--bk-fit', String(k))
          place(inner)
        }
      }
      const fresh = cells.filter((c) => !known.has(c))
      for (const c of fresh) {
        const inner = c.querySelector<HTMLElement>(':scope > .bk-in')
        if (inner) place(inner)
        shrink(c, least)
      }
      for (const c of fresh) shrink(c, 0)
      for (const c of fresh) firsts.set(c, { fit: c.style.getPropertyValue('--bk-fit'), key: keys.get(c)! })
      // 첫 단계에서 칸마다 줄인 단계 (다시 쓰는 칸은 지난번 값. 그 칸의 글자 단계는 아직 앞 맞추기의 끝 값 그대로다)
      const firstFit = (c: HTMLElement) => known.get(c)?.fit ?? c.style.getPropertyValue('--bk-fit')
      // 다시 쓰는 칸을 첫 단계의 모습으로 (키울 때는 enlarge가 놓는다)
      // 위치 비교의 이름표도 그 모습으로 다시 고른다(앞 맞추기의 끝 모습에서 고른 자리일 수 있다)
      const settleKnown = () => {
        for (const [c, f] of known) {
          if (c.style.getPropertyValue('--bk-fit') !== f.fit) {
            if (f.fit) c.style.setProperty('--bk-fit', f.fit)
            else c.style.removeProperty('--bk-fit')
          }
          const inner = c.querySelector<HTMLElement>(':scope > .bk-in')
          if (inner) place(inner)
        }
      }
      // 줄 사이를 넓혀 칸 바닥까지 채우던 것(--bk-air)은 하지 않는다: 줄 높이는 내용에 정해진 사이를 더한 만큼이고(docs/VISUAL-RULES.md 6),
      // 남는 높이로 줄을 늘리면 장마다 줄 사이가 달라 보였다. 남는 높이는 쌓기(pack)가 맨 아래에 모은다
      // 쓰는 동안은 쓰기 전보다 키우지 않는다: 안내 숫자보다 짧은 숫자를 치면 첫 글자에 글자가 1.2배 커지며 컴포넌트가 96px 올라갔다
      // (넘치면 줄이는 것은 그대로)
      const grow = cells.every((c) => !firstFit(c)) && !(hold && hold.up < ups[0])
      if (!grow) settleKnown()
      const shapes = grow ? enlarge(cells, known) : null
      // 다시 쓰는 칸에 지난번 잰 그림 크기가 없으면(지난번에는 키워 보지 않았다) 처음부터 다시 맞춘다
      if (grow && !shapes) {
        area.classList.remove('is-fitting')
        for (const f of flips) f.a.currentTime = f.t
        fit(area)
        continue
      }
      if (shapes) for (const c of fresh) {
        const inner = c.querySelector<HTMLElement>(':scope > .bk-in')
        const f = firsts.get(c)
        if (f && inner) f.shapes = shapes.get(inner)
      }
      // 다섯·여섯 항목은 기본 간격이 좁다. 옆 차트가 높으면 장 전체 채움은 충분하다고 판단해 목록은 좁은 간격 그대로 남는다.
      // 목록 칸을 직접 재어 한 줄 목록과 비슷한 간격까지 넓힌다. 글이 길어 줄이 늘거나 칸이 낮으면 들어가는 만큼만 쓴다.
      for (const c of cells) {
        const inner = c.querySelector<HTMLElement>(':scope > .bk-in')
        if (!inner?.querySelector('.bk-list:is([data-n="5"], [data-n="6"])')) continue
        const fits = (v: number) => {
          if (v) c.style.setProperty('--bk-air', `${v}px`)
          else c.style.removeProperty('--bk-air')
          return !crowded(inner)
        }
        if (!fits(6)) {
          let lo = 0
          let hi = 6
          while (hi - lo > 1) {
            const mid = (lo + hi) >> 1
            if (fits(mid)) lo = mid
            else hi = mid
          }
          fits(lo)
        }
      }
      lift(cells)
      tone(cells)
      answers(cells, area)
      pack(cells, area)
      balance(cells, area, hold?.xs, hold?.contentXs)
      // 키우고 쌓은 뒤에도 내용이 본문 높이의 60%에 못 미치면(docs/VISUAL-RULES.md 6) 한 단계 더 키운다. 사이를 벌려 채우지 않고
      // 글자와 그림의 단계를 올려 딱 맞게. 판은 남는 높이를 맨 아래 칸(내용이 적은 날짜 한 줄 같은)에 주어서 윗줄 칸은 제 내용만큼만
      // 높아, 칸 높이로만 재면 윗줄은 키울 수 없었다. 그래서 키워 볼 때는 칸마다 남는 높이만큼 더 준 채로 재고(--bk-trim을 음수로),
      // 쌓은 뒤 그려진 것이 본문 안에 들면 둔다. 한 칸이라도 넘치거나 그림이 찌그러지거나 본문 아래로 나가면 그대로
      if (shapes && cells.every((c) => c.style.getPropertyValue('--bk-fit') === String(ups[0]))) {
        const a = area.getBoundingClientRect()
        const k = a.height / area.offsetHeight
        const used = fillOf(cells, area)
        if (k && used < 0.6) {
          const spare = Math.floor(((1 - used) * a.height) / k)
          const inners = cells.map((c) => c.querySelector<HTMLElement>(':scope > .bk-in')).filter((el): el is HTMLElement => !!el)
          const reset = () => {
            for (const c of cells) for (const v of ['--bk-lift', '--bk-shift', '--bk-shift-x', '--bk-trim']) c.style.removeProperty(v)
            // 한 단계 더 키울 수 있는지는 CSS가 정한 답 글 크기로 잰다(키운 답 글은 settle의 answers가 다시 맞춘다)
            for (const el of Array.from(area.querySelectorAll<HTMLElement>(ANSWER_TEXT))) el.style.removeProperty('--fs')
            for (const inner of inners) {
              inner.style.removeProperty('--bk-content-shift')
              inner.style.removeProperty('--bk-content-limit')
            }
            for (const l of Array.from(area.querySelectorAll<HTMLElement>(':scope > :is(.bk-link, .bk-line)'))) {
              l.style.removeProperty('--bk-shift')
              l.style.removeProperty('--bk-trim')
            }
          }
          const setFit = (f: number) => {
            for (const c of cells) c.style.setProperty('--bk-fit', String(f))
            for (const inner of inners) place(inner)
          }
          const settle = () => {
            lift(cells)
            tone(cells)
            answers(cells, area)
            pack(cells, area)
            balance(cells, area, hold?.xs, hold?.contentXs)
          }
          reset()
          setFit(more)
          // 칸마다 넘치지 않는 가장 작은 더 준 높이 (캔버스 px, 반씩 나눠 찾는다). 넉넉히 다 주면 줄이 1fr인 부품은 그만큼 줄 사이가 늘었다
          let ok = !hold || hold.up >= more
          for (const c of cells) {
            if (!ok) break
            const inner = c.querySelector<HTMLElement>(':scope > .bk-in')
            if (!inner || !crowded(inner, shapes.get(inner))) continue
            const room = (v: number) => {
              if (v > 0) c.style.setProperty('--bk-trim', -v + 'px')
              else c.style.removeProperty('--bk-trim')
              place(inner)
              return !crowded(inner, shapes.get(inner))
            }
            if (!c.classList.contains('bk-look-plain') || !room(spare)) {
              ok = false
              break
            }
            let lo = 0
            let hi = spare
            while (hi - lo > 4) {
              const mid = (lo + hi) >> 1
              if (room(mid)) hi = mid
              else lo = mid
            }
            room(hi)
          }
          // 장 제목과 다투는 글이 생기면(같은 굵기에 제목 ÷ 1.2 이상) 그대로: 내용이 적은 장의 문장이 제목만큼 커지면 제목이 여럿으로 읽힌다.
          // 숫자는 답이라 커도 된다
          if (ok && rivals(area.parentElement, inners)) ok = false
          if (ok) {
            settle()
            const bottom = Math.max(...cells.map((c) => drawn(c)?.b ?? -Infinity))
            ok = bottom <= a.bottom + 2 * k
          }
          if (!ok) {
            reset()
            setFit(ups[0])
            settle()
          }
          // 글자를 키워도 60%에 못 미치면 줄 사이를 넓힌다(--bk-air, 캔버스 px). 장 안의 모든 칸에 같은 값이라 줄마다, 칸마다 사이가 같다.
          // 줄 사이가 내용 높이의 반을 넘게 벌어지면(줄 높이가 내용의 1.5배를 넘으면) 줄끼리 따로 떨어져 보여 airMax까지만
          if (fillOf(cells, area) < 0.6) {
            const fits = (v: number) => {
              for (const c of cells) {
                if (v > 0) c.style.setProperty('--bk-air', v + 'px')
                else c.style.removeProperty('--bk-air')
              }
              return !inners.some((inner) => crowded(inner, shapes.get(inner)))
            }
            let lo = 0
            let hi = airMax
            if (!fits(hi)) {
              while (hi - lo > 1) {
                const mid = (lo + hi) >> 1
                if (fits(mid)) lo = mid
                else hi = mid
              }
              hi = lo
            }
            fits(hi)
            if (hi > 0) {
              const trims = cells.map((c) => c.style.getPropertyValue('--bk-trim'))
              const again = () => {
                reset()
                cells.forEach((c, i) => {
                  if (trims[i] && parseFloat(trims[i]) < 0) c.style.setProperty('--bk-trim', trims[i])
                })
                settle()
              }
              again()
              // 넓힌 줄 사이로 쌓아 본문 아래로 나가면 넓히지 않는다
              if (Math.max(...cells.map((c) => drawn(c)?.b ?? -Infinity)) > a.bottom + 2 * k) {
                fits(0)
                again()
              }
            }
          }
        }
      }
      linesAcross(cells, area)
      const eye = eyeLevel(cells, area, hold?.eye)
      if (hold) anchor(cells, area)
      else
        held.set(area, {
          board,
          eye,
          xs: new Map(cells.map((c) => [c.dataset.block ?? '', parseFloat(c.style.getPropertyValue('--bk-shift-x')) || 0])),
          contentXs: new Map(cells.map((c) => [c.dataset.block ?? '', parseFloat(c.querySelector<HTMLElement>(':scope > .bk-in')?.style.getPropertyValue('--bk-content-shift') || '') || 0])),
          up: Math.max(1, ...cells.map((c) => Number(c.style.getPropertyValue('--bk-fit') || 1))),
        })
      linkAxes(cells, area)
      if (area.classList.contains('is-live')) for (const c of cells) tops.set(c, topIn(c, area))
      area.classList.remove('is-fitting')
      for (const f of flips) f.a.currentTime = f.t
    }
    // 조건별 흐름의 갈래 곡선: 자리가 다 정해진 뒤에 잰다
    for (const dc of Array.from(root.querySelectorAll<HTMLElement>('.bk-dc'))) forks(dc)
    // 부품 장 밖(한 장을 다 쓰는 위치 비교, 추이)도
    for (const plot of Array.from(root.querySelectorAll<HTMLElement>('.pm-plot, .tn-canvas'))) if (!plot.closest('.bk-area')) labels(plot)
    // 레이아웃 장의 채움 (fitLayout)
    const slides = root instanceof HTMLElement && root.classList.contains('slide') ? [root] : Array.from(root.querySelectorAll<HTMLElement>('.slide'))
    for (const sl of slides) fitLayout(sl)
  }

  /**
   * 넘침 경고(slides/overflow.ts의 overflowAt)가 보는 상자들(장과 OVER_BOXES)이 내용보다 작은 만큼(캔버스 px) 가운데 가장 큰 값.
   * 장 채움 맞추기(fitLayout)는 이 값을 늘리지 않는다: 그려진 글 줄만 보고 눈높이로 내리고 줄 사이를 넓히던 때는, 마지막 줄 상자의
   * 아래 여백(줄 사이 몫)이 본문 상자 밖으로 나가 짧은 줄 셋뿐인 비교 장에도 '글이 넘쳤어요'가 떴다(그려진 글은 본문 안인데)
   */
  function spill(slide: HTMLElement): number {
    let most = Math.max(slide.scrollHeight - slide.clientHeight, slide.scrollWidth - slide.clientWidth)
    for (const el of Array.from(slide.querySelectorAll<HTMLElement>(OVER_BOXES))) most = Math.max(most, el.scrollHeight - el.clientHeight)
    return most
  }

  /**
   * 눈높이로 내릴 몫(캔버스 px)을 넘침 경고가 보는 상자 안으로 줄인다. 본문은 장의 남은 높이를 써서 내린 만큼 상자가 줄어드니,
   * 마지막 줄 상자(아래 여백까지)가 상자 밖으로 나가면 나간 만큼 덜 내린다. 8px도 못 내리거나 덜 내려도 넘치면 내리지 않는다(0).
   * put(m): 그 몫을 적어 본다. over(): 적은 모습에서 넘친 만큼(맞추기 전부터 넘쳐 있던 만큼은 뺀 값, 0 이하면 괜찮다)
   */
  function eyeRoom(move: number, put: (m: number) => void, over: () => number): number {
    put(move)
    const out = over()
    if (out <= 0) return move
    const m = move - out
    if (m < 8) return 0
    put(m)
    return over() <= 0 ? m : 0
  }

  /**
   * 레이아웃 장(요약, 요점, 비교, 가격안, 표 같은)의 채움 (docs/VISUAL-RULES.md 6). 본문이 넘치면 먼저 글자를 한두 단계 줄인다(fitPart의 (0)).
   * 본문(.s-body)의 그려진 내용이 본문 높이의 60%에
   * 못 미치면 (가) 본문의 글자와 그림을 한 단계씩(1.2, 1.44) 키우고 (나) 그래도 비면 줄 사이를 줄마다 같은 값으로 넓힌다(--fill-air,
   * 캔버스 px, airMax까지. 레이아웃 CSS가 줄 사이에 더한다). 넘치거나 겹치거나 그림이 찌그러지거나 장 제목과 다투면 한 단계 앞으로.
   * (다) 그래도 60%에 못 미치면 위에 붙여 아래만 길게 비우지 않고 눈높이 가운데로 내린다(--eye, 위 : 아래 = 1 : 1.2. 부품 장의 eyeLevel과 같다).
   * 내용이 본문의 4분의 1도 안 되는 덜 쓴 장은 내리지 않는다.
   * 장 제목과 다투어 키우지 못하는 세 단 요점, 줄 사이가 없는 가로 일정과 단계 흐름, 숫자 하나 장이 위 절반에 몰리고 아래가 통째로 비었다.
   * 본문 높이는 본문 상자가 아니라 장에서 본문이 쓸 수 있는 자리(본문 윗선부터 하단 표시 몫 위까지)로 잰다: 비교 장은 본문 상자가
   * 내용 높이뿐이라(화살표를 내용 가운데에 두려고) 늘 다 찬 것으로 재어, 줄 셋이 위 절반에 몰려도 키우지도 넓히지도 않았다.
   * 사례 장은 두 단(제목 아래 이야기, 대상 아래 결과 숫자)을 단마다 이렇게 맞춘다(layoutParts).
   * 표지, 단락 장, 마지막 장, 부품 장은 하지 않는다. 움직이는 중이면 끝난 뒤에
   */
  /** 본문마다 지난번 맞추기에서 찾은 줄 사이(--fill-air) 값 */
  const lastAir = new WeakMap<HTMLElement, number>()

  function fitLayout(slide: HTMLElement): void {
    // 한 모습에서 채움, 넘침, 제목과 다툼을 볼 때마다 같은 글 줄을 다섯 번씩 다시 쟀다. 값을 적기 전까지는 잰 것을 같이 쓴다(memo)
    memo = new Map()
    // 편집 화면에서 다시 맞춘 자리로 미끄러지는 중이면 끝자리로 잰다(settled). 부품 장은 판의 맞추기(fit)가 한다
    const flips = slide.classList.contains('l-compose') ? [] : settled(slide)
    try {
      fitLayoutNow(slide)
    } finally {
      memo = null
      for (const f of flips) f.a.currentTime = f.t
    }
  }

  /**
   * 채울 본문(body)과 그 머리(head), 본문이 쓸 수 있는 아래 끝을 정하는 상자(box, 그 아래 여백 위까지), 올려 볼 글자 단계(ups).
   * 보통 장은 장 머리(.s-head) 아래의 본문(.s-body) 하나다. 사례 장은 장 머리와 본문 상자 없이 두 단이라 단마다 맞춘다:
   * 제목 아래 이야기(.cs-main의 .cs-story)와 로고·대상 아래 결과 숫자(.cs-side의 .cs-results). 맞추기가 닿지 않던 때는 짧은 사례면
   * 왼쪽 단의 아래 절반이 통째로 비었다. 사례 장의 한마디는 제목 글꼴이라 두 단계(1.44) 키우면 장 제목만 해져 제목이 둘로 읽혔다: 한 단계까지만
   */
  function layoutParts(slide: HTMLElement): { body: HTMLElement; head: HTMLElement | null; box: HTMLElement; ups: number[] }[] {
    const body = slide.querySelector<HTMLElement>(':scope > .s-body')
    const head = slide.querySelector<HTMLElement>(':scope > .s-head')
    if (body && head) return [{ body, head, box: slide, ups: [ups[0], more] }]
    if (!slide.classList.contains('l-case')) return []
    const out: { body: HTMLElement; head: HTMLElement | null; box: HTMLElement; ups: number[] }[] = []
    const main = slide.querySelector<HTMLElement>(':scope > .cs-main')
    const story = main?.querySelector<HTMLElement>(':scope > .cs-story')
    if (main && story) out.push({ body: story, head: main.querySelector<HTMLElement>(':scope > .cs-title'), box: main, ups: [ups[0]] })
    const side = slide.querySelector<HTMLElement>(':scope > .cs-side')
    const results = side?.querySelector<HTMLElement>(':scope > .cs-results')
    if (side && results) {
      // 결과 숫자의 머리는 그 위의 대상(없으면 로고)
      const heads = Array.from(side.querySelectorAll<HTMLElement>(':scope > .cs-logo, :scope > .cs-client'))
      out.push({ body: results, head: heads[heads.length - 1] ?? null, box: side, ups: [ups[0]] })
    }
    return out
  }

  function fitLayoutNow(slide: HTMLElement): void {
    if (slide.classList.contains('l-compose')) return
    const parts = layoutParts(slide)
    if (!parts.length) return
    const mover = moving(slide)
    if (mover) {
      later(slide, mover, () => fitLayout(slide))
      return
    }
    // 편집 표시(칸 둘레의 면 .ed-halo, 항목 손잡이, 빼기 단추)는 장의 내용이 아니다: 맞추는 동안 숨긴다(edit.css. 부품 장의
    // .bk-area.is-fitting과 같다). 칸 둘레의 면은 글 밖으로 띄운 그림이라 본문 왼쪽으로 19px 나와서, 숨기지 않으면 넘친 것으로 보고
    // 글자를 키우지 않았다: 덜 찬 장의 글자가 편집 화면에서만 발표 화면보다 한 단계 작았다(다섯 단계 흐름의 설명 26px, 발표 화면 31px)
    const was = slide.classList.contains('is-fitting')
    slide.classList.add('is-fitting')
    try {
      for (const part of parts) fitPart(slide, part)
    } finally {
      if (!was) slide.classList.remove('is-fitting')
    }
  }

  function fitPart(slide: HTMLElement, { body, head, box, ups: grows }: ReturnType<typeof layoutParts>[number]): void {
    // 본문에 값을 적으면 잰 것을 비운다
    const setB = (name: string, v: string) => {
      body.style.setProperty(name, v)
      memo = new Map()
    }
    const delB = (name: string) => {
      body.style.removeProperty(name)
      memo = new Map()
    }
    delB('--bk-fit')
    delB('--fs-min')
    delB('--fill-air')
    delB('--eye')
    delete body.dataset.eye
    const b = body.getBoundingClientRect()
    const sr = slide.getBoundingClientRect()
    const k = sr.height / slide.offsetHeight
    if (!b.height || !k) return
    // 본문이 쓸 수 있는 아래 끝(장이나 단의 아래 여백 위)과 장 틀의 아랫선(--pad-y). 그 사이가 하단 표시 몫이다.
    // 채움은 장 틀의 아랫선까지로 잰다(VISUAL-RULES 6: 하단 표시 몫은 공백 설계에 넣지 않는다). 본문 상자 끝까지로 재면
    // 아래 띠 몫이 빈 곳에서 빠져, 아래가 340px 넘게 빈 비교 장도 64% 찬 것으로 보고 아무것도 하지 않았다.
    // 글과 그림은 여전히 본문 상자 안에만 둔다(bad): 출처와 단락 지도에 닿지 않게. 사례 장의 결과 판은 하단 표시가 왼쪽 단 아래에
    // 있어 판의 아래 여백이 곧 장 틀이다
    const cs = getComputedStyle(slide)
    const end = box.getBoundingClientRect().bottom - (parseFloat(getComputedStyle(box).paddingBottom) || 0) * k
    const frame = sr.bottom - (parseFloat(cs.getPropertyValue('--pad-y')) || 0) * k
    const room = frame - b.top
    if (end - b.top <= 0) return
    // (0) 넘치면 본문의 글자와 그림을 단계로 줄인다(부품 장의 칸과 같은 0.84, 0.7: 글자 크기 단계표의 한두 단계). 넘침 알림과 같은
    // 잣대(넘침 알림이 보는 상자가 4px 넘게 넘치거나 글이 본문 아래 하단 표시 자리로 나감)로 보고, 줄여도 넘치면 가장 작은 단계로 둔다
    // (알림은 그대로 뜬다). 출처 글자(22px, 작게면 그만큼 작게)보다는 작아지지 않는다. 예전에는 키우기만 해서, 표의 칸이나 요약의 줄
    // 이름처럼 긴 글을 쓰면 글자는 그대로인 채 '글이 넘쳤어요'만 떴다(긴 글 점검에서 레이아웃 장 칸 137개 가운데 13개).
    // 쓰는 동안에도 줄인다: 붙잡아 두는 것은 키우는 단계뿐이다
    // 넘친 만큼(캔버스 px): 넘침 알림이 보는 상자, 본문 아래 하단 표시 자리로 나간 글
    const overBy = () => Math.max(spill(slide), ...lines(body).map((q) => (q.b - end) / k))
    const first = overBy()
    if (first > 4) {
      setB('--fs-min', 'calc(var(--t-source) * min(1, var(--scale, 1)))')
      // 크게(1.2배)는 첫 단계가 보통 크기다(부품 장의 ladder와 같다)
      for (const f of slide.classList.contains('sz-large') ? [1 / 1.2, steps[1]] : steps) {
        setB('--bk-fit', String(f))
        if (overBy() <= 4) break
      }
      // 줄여도 조금도 덜 넘치지 않으면(본문 밖, 장 제목이 넘친 것) 줄이지 않는다
      if (overBy() >= first - 1) {
        delB('--bk-fit')
        delB('--fs-min')
      }
    }
    // 맞추기 전에 넘침 경고가 보는 상자가 넘쳐 있던 만큼(1px은 반올림 몫). 키우고 넓히고 내려도 이보다 더 넘치게 하지 않는다(spill)
    const allow = Math.max(spill(slide), 1)
    const drawnBottom = () => {
      let bottom = -Infinity
      for (const q of lines(body)) bottom = Math.max(bottom, q.b)
      for (const f of figures(body)) bottom = Math.max(bottom, f.getBoundingClientRect().bottom)
      // 이미지(로고 모음의 로고, 화면 캡처)도 그려진 것이다: 빼면 글 없이 로고만 있는 장을 다 찬 것으로 보고 아무것도 하지 않았다
      for (const im of Array.from(body.querySelectorAll('img'))) {
        const r = im.getBoundingClientRect()
        if (r.width && r.height) bottom = Math.max(bottom, r.bottom)
      }
      for (const it of Array.from(body.querySelectorAll<HTMLElement>('.it'))) {
        // 칠한 항목(막대, 카드)은 상자째 그려진 것
        const cs = getComputedStyle(it)
        if (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent') bottom = Math.max(bottom, it.getBoundingClientRect().bottom)
      }
      return bottom
    }
    const fill = () => {
      const bottom = drawnBottom()
      return bottom === -Infinity ? 1 : (bottom - b.top) / room
    }
    // 편집 화면에서 이 장의 글 칸에 쓰는 동안(typingIn)은 쓰기 전에 맞춘 눈높이와 글자 단계를 붙잡아 둔다(부품 장의 typing과 같다):
    // 줄이 하나 늘 때마다 눈높이 가운데를 다시 잡으면 본문 전체가 17px씩 오르내려 쓰는 줄이 손 아래에서 달아났고, 글을 지우다 글자가
    // 한 단계 커지기도 했다. 줄 사이와 줄이는 단계는 그대로 맞춰서 조립되는 모습은 쓰는 동안에도 보인다. 다 쓰고 나가면 다시 맞춘다
    // (SlideCanvas가 칸을 떠날 때 부른다. 바뀐 자리로는 미끄러진다, liveMotion.ts)
    const hold = typingIn(slide) ? heldLayout.get(body) : undefined
    // (다) 눈높이 가운데로: 위의 빈 곳과 아래(장 틀의 아랫선까지)의 빈 곳이 1 : 1.2. 하단 표시 몫 밖으로는 내리지 않는다.
    // 아직 덜 쓴 장은 위에 둔다: 머리 줄뿐인 얇은 내용(본문의 4분의 1 밑)을 내리면 '지금 → 추진 후' 같은 글자만 가운데에 뜬다.
    // 제목이 없는 완성된 일정도 가운데로 두어 아래가 통째로 비지 않게 한다.
    const eye = () => {
      const f = fill()
      if (!hold && (f >= FILL_EYE || f < 0.25)) return
      const bottom = drawnBottom()
      if (bottom === -Infinity) return
      // 위의 빈 곳은 보이는 그대로 장 머리(제목, 부제) 아래부터 센다: 본문 윗선부터 세면 --body-gap만큼 위가 넓어져
      // 단계 흐름이 가운데보다 아래에 앉았다. (gap + move) : (아래 - move) = 1 : 1.2
      const gap = head?.getClientRects().length ? Math.max(0, b.top - head.getBoundingClientRect().bottom) : 0
      // 붙잡아 둔 값도 하단 표시 몫 밖으로는 내리지 않는다(글이 늘어 아래가 모자라면 그만큼 덜 내린다)
      const move = Math.round(Math.min(hold ? hold.eye * k : (frame - bottom - 1.2 * gap) / 2.2, end - bottom) / k)
      if (move < 8) return
      // 내린 만큼 본문 상자가 줄어 마지막 줄 상자의 아래 여백이 상자 밖으로 나가면 나간 만큼 덜 내린다
      const m = eyeRoom(move, (v) => setB('--eye', v + 'px'), () => spill(slide) - allow)
      if (!m) {
        delB('--eye')
        return
      }
      body.dataset.eye = '1'
    }
    const done = () => {
      eye()
      if (!hold) heldLayout.set(body, { eye: parseFloat(body.style.getPropertyValue('--eye')) || 0, up: Number(body.style.getPropertyValue('--bk-fit')) || 1 })
    }
    if (fill() >= FILL_AIR) return done()
    const shapes = shapesOf(body)
    const bad = () => {
      if (crowded(body, shapes) || rivals(slide, [body])) return true
      // 본문 아래(출처와 하단 표시 자리)로 나간 글
      for (const q of lines(body)) if (q.b > end + 2) return true
      // 넘침 경고가 보는 상자 밖으로 나간 것: 그려지지 않는 줄 상자의 아래 여백이라도 경고는 넘쳤다고 본다
      return spill(slide) > allow
    }
    // (가) 글자 단계는 60%를 못 채울 때만 올린다
    if (fill() < FILL_MIN) {
      for (const [j, f] of grows.entries()) {
        // 쓰는 동안은 쓰기 전보다 키우지 않는다 (줄이는 것은 그대로)
        if (hold && f > hold.up) break
        setB('--bk-fit', String(f))
        if (bad()) {
          if (j === 0) delB('--bk-fit')
          else setB('--bk-fit', String(grows[j - 1]))
          break
        }
        if (fill() >= FILL_MIN) break
      }
    }
    if (fill() >= FILL_AIR) return done()
    // (나) 줄 사이: 바꿔도 그려진 것이 그대로면(이 레이아웃은 --fill-air를 쓰지 않는다) 그만둔다
    const before = fill()
    setB('--fill-air', airMax + 'px')
    const full = fill()
    if (full <= before + 0.001) {
      delB('--fill-air')
      return done()
    }
    // 넘치지 않고 85%를 넘지 않는 가장 넓은 값 (반씩 나눠 찾는다)
    const ok = (v: number) => {
      setB('--fill-air', v + 'px')
      return !bad() && fill() <= FILL_MAX
    }
    // 지난번에 찾은 값부터 본다: 글자 하나를 치는 동안 답은 대개 그대로라, 그 값은 되고 한 칸 넓히면 안 되는지만 보면
    // 반씩 나눠 찾기(여덟 번 남짓 다시 재기)를 건너뛴다. 넓힐수록 넘치거나 85%를 넘으니(ok가 단조) 찾은 값은 같다
    let lo = 0
    let hi = airMax + 1
    const was = lastAir.get(body)
    // 한 칸 넓힌 값을 먼저 본다: 맞으면 답(was)을 마지막에 재어 그 모습 그대로 끝난다(답을 다시 적고 또 재지 않는다)
    if (was !== undefined && was <= airMax && (was === airMax || !ok(was + 1)) && (was === 0 || ok(was))) lo = hi = was
    // 처음 맞추는 본문은 줄 사이를 넓힌 만큼 채움이 거의 고르게 느는 것을 써서, 0과 끝값에서 잰 채움으로 85%가 되는 값을 어림해
    // 하나 위와 그 값만 본다(맞으면 두 번 재기로 끝나고, 답을 마지막에 재어 그 모습 그대로 끝난다). 어림이 틀려도 그 값으로 찾는 범위를
    // 좁힐 뿐이라 찾은 값은 같다
    const probe = (v: number) => {
      if (ok(v)) lo = v
      else hi = v
    }
    if (hi - lo > 1) {
      const guess = Math.max(1, Math.min(airMax, Math.floor(((FILL_MAX - before) / (full - before)) * airMax)))
      if (guess + 1 < hi) probe(guess + 1)
      if (guess > lo && guess < hi) probe(guess)
    }
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1
      if (ok(mid)) lo = mid
      else hi = mid
    }
    lastAir.set(body, lo)
    // 이미 그 값이면 적지 않는다: 적으면 같은 모습을 눈높이 맞추기(eye)에서 다시 잰다
    const now = body.style.getPropertyValue('--fill-air')
    if (lo > 0 && now !== lo + 'px') setB('--fill-air', lo + 'px')
    else if (lo === 0 && now) delB('--fill-air')
    done()
  }

  /**
   * 조건별 흐름의 갈래: 질문 끝에서 갈래마다 조건의 첫 글줄 가운데로 곡선을 긋는다(svg.bk-dc-forks, 칸 안의 px). 옆으로 놓이면 수평으로
   * 떠나 수평으로 닿는 곡선(가운데에서 부드럽게 꺾인다), 질문이 위에 쌓이면 질문 아래에서 내려와 둥글게 꺾여 들어간다.
   * CSS의 괄호 선([)은 글자 크기를 어림해 그어서 가지와 줄기가 글줄과 어긋났다(사용자: 망가져 있다). 그려진 자리를 재어 긋는다
   */
  function forks(dc: HTMLElement): void {
    const svg = dc.querySelector<SVGSVGElement>(':scope > .bk-dc-forks')
    const q = dc.querySelector<HTMLElement>('.bk-dc-question')
    if (!svg) return
    const box = dc.getBoundingClientRect()
    const k = dc.offsetWidth ? box.width / dc.offsetWidth : 1
    const rows = Array.from(dc.querySelectorAll<HTMLElement>('.bk-dc-row'))
    while (svg.firstChild) svg.firstChild.remove()
    if (!q || !rows.length || !k) return
    const qr = q.getBoundingClientRect()
    const local = (x: number, y: number) => [(x - box.left) / k, (y - box.top) / k]
    const stacked = qr.bottom <= rows[0].getBoundingClientRect().top + 1
    const [qx1, qy0] = local(qr.right, qr.top)
    const [qx0, qy1] = local(qr.left, qr.bottom)
    svg.setAttribute('viewBox', `0 0 ${dc.offsetWidth} ${dc.offsetHeight}`)
    const NS = 'http://www.w3.org/2000/svg'
    const r2 = (v: number) => Math.round(v * 10) / 10
    for (const row of rows) {
      const cond = row.querySelector<HTMLElement>('.bk-dc-condition') ?? row
      const cr = cond.getBoundingClientRect()
      const lh = parseFloat(getComputedStyle(cond).lineHeight) * k || cr.height
      const [x1, y1] = local(cr.left, cr.top + Math.min(lh, cr.height) / 2)
      let d: string
      if (stacked) {
        // 질문 아래(왼쪽에서 조금 들어온 자리)에서 내려와 반지름 14로 꺾여 조건 앞까지
        const x0 = qx0 + 10
        const y0 = qy1 + 12
        const r = Math.min(14, Math.max(0, y1 - y0), Math.max(0, x1 - 12 - x0))
        d = `M ${r2(x0)} ${r2(y0)} V ${r2(y1 - r)} Q ${r2(x0)} ${r2(y1)} ${r2(x0 + r)} ${r2(y1)} H ${r2(x1 - 12)}`
      } else {
        const x0 = qx1 + 20
        const y0 = (qy0 + qy1) / 2
        const xe = x1 - 16
        const c = Math.max(12, (xe - x0) * 0.55)
        d = `M ${r2(x0)} ${r2(y0)} C ${r2(x0 + c)} ${r2(y0)} ${r2(xe - c)} ${r2(y1)} ${r2(xe)} ${r2(y1)}`
      }
      const p = document.createElementNS(NS, 'path')
      p.setAttribute('class', 'bk-dc-fork')
      p.setAttribute('d', d)
      // 길이를 1로: 모션이 곡선을 긋는 값(stroke-dashoffset)을 곡선마다 재지 않게
      p.setAttribute('pathLength', '1')
      svg.append(p)
    }
  }

  /** 이름표 자리 고르기의 바깥 입구: 움직이는 중인 판(점이 내려앉는 중이다)은 끝난 뒤에. 추이의 점 숫자도 같다 */
  function labels(scope: ParentNode): void {
    const plots = scope instanceof HTMLElement && scope.classList.contains('pm-plot') ? [scope] : Array.from(scope.querySelectorAll<HTMLElement>('.pm-plot'))
    for (const plot of plots) {
      const mover = moving(plot)
      if (mover) later(plot, mover, () => place(plot))
      else place(plot)
    }
    const canvases = scope instanceof HTMLElement && scope.classList.contains('tn-canvas') ? [scope] : Array.from(scope.querySelectorAll<HTMLElement>('.tn-canvas'))
    for (const canvas of canvases) {
      const mover = moving(canvas)
      if (mover) later(canvas, mover, () => trendPlace(canvas))
      else trendPlace(canvas)
    }
  }

  return { fit, lines, over, labels, figures, drawn, edgeSeen }
}

let fitter: ReturnType<typeof blockFitter> | null = null
const shared = () => (fitter ??= blockFitter())

/** 이 안의 부품 장을 모두 맞춘다 (root가 .bk-area면 그것만) */
export const fitBlocks = (root: ParentNode, dirty?: ReadonlySet<Element> | null) => shared().fit(root, dirty)
/** 칸 안쪽의 글 줄마다 글자가 그려지는 자리 (부품 높이 재기에서 겹침과 잘림을 볼 때) */
export const blockTextLines = (inner: HTMLElement) => shared().lines(inner)
/** 위치 비교의 이름표와 추이의 점 숫자 자리를 그려진 크기로 다시 고른다 (scope 안의 판 모두, scope가 판이면 그것만) */
export const placeLabels = (scope: ParentNode) => shared().labels(scope)
/** 칸 안쪽이 넘치거나 글이 겹치는지 (fitBlocks가 글자를 줄이는 기준. 진단용) */
export const blockOverflows = (inner: HTMLElement) => shared().over(inner)
/** 칸 안쪽의 글 없는 그림 (맞추기와 잘리지 않는 높이 재기가 같이 본다) */
export const blockFigures = (inner: HTMLElement) => shared().figures(inner)
/** 칸에서 그려진 것의 위아래 (쌓기와 개발용 검사 checkAssembly가 같이 본다) */
export const blockDrawn = (cell: HTMLElement) => shared().drawn(cell)
/** 보이는 테두리인지 (투명하게 지운 줄 선은 그려진 것이 아니다. 개발용 검사 checkAssembly도 쌓기와 같게 본다) */
export const blockEdgeSeen = (cs: CSSStyleDeclaration, side: 'Top' | 'Bottom' | 'Left' | 'Right') => shared().edgeSeen(cs, side)

/**
 * 편집기가 '글이 넘쳤어요', '자리가 모자라요'를 띄울지 보는 곳. 편집기(SlideStage.tsx의 useOverflow), 장 목록의 그림,
 * 개발용 점검(screens/checkEdit.ts), AI에게 알리는 넘침(screens/editor/aiOver.ts)이 같이 쓴다: 따로 두면 점검이 통과해도 편집기는 넘쳤다고 알렸다.
 */

/** 글이 넘칠 수 있는 상자: 장 전체와 레이아웃의 본문 칸, 부품의 안쪽. 장 채움 맞추기(fitBlocks.ts의 spill)도 이 상자들을 넘치게 하지 않는다 */
export const OVER_BOXES = '.s-body, .ix-text, .cs-main, .cs-side, .cl-main, .cv-main, .ag, .bk-in'

/** 넘친 칸 하나: 칸의 id(.ed-input의 data-field)와 화면에 보이는 칸 이름 */
export interface OverField {
  id: string
  label: string
}

/** 칸의 글이 한 줄보다 높은 만큼(화면 px). 글이 긴 칸일수록 크다. 빈칸(안내 글)은 0: 안내는 칸에 맞게 써 두었다 */
function grown(input: HTMLElement, r: DOMRect): number {
  if (input.parentElement!.classList.contains('is-empty') || !input.offsetHeight) return 0
  const s = getComputedStyle(input)
  const lh = Number.parseFloat(s.lineHeight) || Number.parseFloat(s.fontSize) * 1.3
  return r.height - lh * (r.height / input.offsetHeight)
}

/**
 * 장의 글이 넘쳤는지와 짚을 칸들. 넘친 상자의 아래 끝(장 전체는 오른쪽 끝도) 밖으로 나간 글 칸을 찾고,
 * 그 상자 안에서 글이 가장 길게 늘어난 칸이 따로 있으면 그 칸을 짚는다(pushed): 진행 현황에서 1번 과제 이름을 세 줄로 쓰면
 * 밖으로 나가는 것은 맨 아래 5번 과제라, 나간 칸만 짚던 때는 '나는 1번을 썼는데?' 하고 헷갈렸다.
 * 같은 높이로 늘어난 칸이 여럿이면 함께 짚고, 한 칸만 늘어났고 그 칸이 나간 칸이기도 하면 넘친 칸으로 짚는다.
 * 예전에는 넘쳤다는 것만 알려서, 어느 칸을 줄여야 하는지 장을 뒤져 찾아야 했다
 */
/**
 * 글이 넘친 상자들: 옆으로 넘친 장(wide)과, 내용이 상자보다 높은 장과 OVER_BOXES(tall). 재는 동안 is-measuring을 단 채로 부른다.
 * 항목 빼기 버튼이 칸 오른쪽으로 살짝 나와 있어서, 가로 넘침은 슬라이드 전체만 본다
 */
function boxesOver(root: HTMLElement): { wide: boolean; tall: HTMLElement[] } {
  const boxes = [root, ...root.querySelectorAll<HTMLElement>(OVER_BOXES)]
  return { wide: root.scrollWidth - root.clientWidth > 4, tall: boxes.filter((el) => el.scrollHeight - el.clientHeight > 4) }
}

/** 장에서 글이 넘친 상자들. AI에게 넘친 장과 컴포넌트를 알릴 때(screens/editor/aiOver.ts) 편집기와 같은 잣대로 잰다 */
export function overBoxes(root: HTMLElement): { wide: boolean; tall: HTMLElement[] } {
  root.classList.add('is-measuring')
  const out = boxesOver(root)
  root.classList.remove('is-measuring')
  return out
}

export function overflowAt(root: HTMLElement): { over: boolean; fields: OverField[]; pushed: boolean } {
  // 빈칸의 옅은 면(.ed-halo)은 글보다 조금 넓게 깔려서 맨 아래 칸이면 상자 밖으로 나온다. 글이 넘친 것이 아니니 재는 동안만 숨긴다
  root.classList.add('is-measuring')
  const { wide, tall } = boxesOver(root)
  let fields: OverField[] = []
  let pushed = false
  if (wide || tall.length) {
    const right = root.getBoundingClientRect().right
    const bottoms = tall.map((b) => [b, b.getBoundingClientRect().bottom] as const)
    const field = (input: HTMLElement): OverField => ({ id: input.dataset.field!, label: input.getAttribute('aria-label') || '' })
    const inputs = [...root.querySelectorAll<HTMLElement>('.ed > .ed-input[data-field]')]
    const out: HTMLElement[] = []
    for (const input of inputs) {
      const r = input.parentElement!.getBoundingClientRect()
      if (!r.width && !r.height) continue
      if ((wide && r.right > right + 1) || bottoms.some(([b, bottom]) => b.contains(input) && r.bottom > bottom + 1)) out.push(input)
    }
    // 밀어낸 칸: 첫 나간 칸이 든 가장 안쪽의 넘친 상자에서, 글이 한 줄의 반 넘게 늘어난 칸 가운데 가장 많이 늘어난 칸들
    const box = out.length ? tall.filter((b) => b.contains(out[0])).sort((x, y) => (x.contains(y) ? 1 : y.contains(x) ? -1 : 0))[0] : undefined
    const grownFields: { input: HTMLElement; by: number }[] = []
    for (const input of box ? inputs.filter((i) => box.contains(i)) : []) {
      const r = input.parentElement!.getBoundingClientRect()
      const by = grown(input, r)
      const half = (Number.parseFloat(getComputedStyle(input).fontSize) || 16) * 0.6 * (r.height / (input.offsetHeight || 1))
      if (by > half) grownFields.push({ input, by })
    }
    // 늘어난 칸이 나간 칸이기도 하면 그 칸 하나만: 그 칸에 밀려 나간 아래 줄까지 짚으면 '7곳'처럼 고칠 곳이 많아 보였다.
    // 늘어난 칸이 없으면(줄 수가 고르게 많은 장) 나간 칸들을 짚는다
    if (grownFields.length) {
      const max = Math.max(...grownFields.map((f) => f.by))
      // 같은 높이로 늘어난 줄이 여럿이면 하나만 고쳐서는 해결되지 않을 수 있다. 화면의 소수점 반올림 차이만 허용한다.
      const longest = grownFields.filter((f) => max - f.by < 1)
      fields = longest.map((f) => field(f.input))
      pushed = longest.length > 1 || !out.includes(longest[0].input)
    } else fields = out.map(field)
  }
  root.classList.remove('is-measuring')
  return { over: wide || tall.length > 0, fields, pushed }
}

export function slideOverflow(root: HTMLElement): 'over' | null {
  return overflowAt(root).over ? 'over' : null
}

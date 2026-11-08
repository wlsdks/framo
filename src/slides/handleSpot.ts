import { frameRect } from './blockFrame'

/**
 * 끌기 이름표(.bk-handle)를 둘 자리: 테두리 왼쪽 위 바깥(기본), 오른쪽 위 바깥, 왼쪽 아래 바깥, 오른쪽 아래 바깥.
 * 이름표는 컴포넌트 테두리 바깥에 붙어서, 위 컴포넌트와의 사이가 좁으면 위 컴포넌트의 마지막 줄(목록의 셋째 줄 같은)을 덮었다.
 * 쓰는 사람의 글을 가리지 않는 첫 자리를 고르고, 어디에 두어도 글을 가리면 숨긴다(none): 그때는 컴포넌트를 눌러 고르고
 * 장 아래 도구 줄의 앞뒤로 단추로 옮긴다. 손을 올릴 때와 컴포넌트를 고를 때 정한다
 */
type HandleAt = 'tl' | 'tr' | 'bl' | 'br' | 'none'

const ORDER: Exclude<HandleAt, 'none'>[] = ['tl', 'tr', 'bl', 'br']

/** 그린 것으로 세지 않는 편집 표시 */
const EDIT_UI = '.bk-handle, .ed-halo, .it-grip, .it-remove, .img-tools, .bk-line'

/** 이 칸 말고 장 안에 그려진 글자 줄과 그림의 네모 (화면 px). 빈칸의 안내 글도 쓰는 사람에게는 글이라 친다 */
function obstacles(cell: HTMLElement): DOMRect[] {
  const slide = cell.closest('.slide')
  if (!slide) return []
  const out: DOMRect[] = []
  const range = document.createRange()
  const walk = document.createTreeWalker(slide, NodeFilter.SHOW_TEXT)
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const el = n.parentElement
    if (!n.nodeValue?.trim() || !el || cell.contains(el) || el.closest(EDIT_UI)) continue
    range.selectNodeContents(n)
    for (const r of range.getClientRects()) if (r.width && r.height) out.push(r)
  }
  for (const g of slide.querySelectorAll('.bk svg, .bk img, .bk-link')) {
    if (cell.contains(g) || g.closest(EDIT_UI)) continue
    const r = g.getBoundingClientRect()
    if (r.width && r.height) out.push(r)
  }
  return out
}

const hits = (a: DOMRect, b: DOMRect) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1

/** 손을 올린 칸의 이름표 자리를 정해 data-at에 적는다 (edit.css가 그 자리에 둔다) */
export function placeHandle(cell: HTMLElement): void {
  const handle = cell.querySelector<HTMLElement>(':scope > .bk-handle')
  if (!handle) return
  delete handle.dataset.at
  // 숨겨 둔(none) 이름표는 크기가 없어 재기 전에 기본 자리로 돌린다.
  // 이름표는 숨은 동안에도 자리를 차지하므로 크기를 잴 수 있다 (화면에서 같은 크기로 줄여 둔 뒤의 크기)
  const { width: w, height: h } = handle.getBoundingClientRect()
  if (!w || !h) return
  const f = frameRect(cell)
  const spot = (at: Exclude<HandleAt, 'none'>) => {
    const x = at === 'tl' || at === 'bl' ? f.left - 1 : f.right + 1 - w
    const y = at === 'tl' || at === 'tr' ? f.top - 1 - h : f.bottom + 1
    return new DOMRect(x, y, w, h)
  }
  const ink = obstacles(cell)
  const at = ORDER.find((a) => {
    const r = spot(a)
    return !ink.some((o) => hits(r, o))
  })
  handle.dataset.at = at ?? 'none'
}

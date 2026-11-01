import { describe, expect, it } from 'vitest'
import { asCompose, autoArranged, autoPlace, boardSig, dropTarget, insertAt, makeBlock, moveAt, movingBase, placeIssue, removeBlock, resizeBlock, type Shown } from '../../deck/blocks'
import { makeSlide } from '../../deck/generate'
import type { Block, Slide } from '../../deck/types'
import { dropBlocks, planDrop, sameBoard, type DropState } from './planDrop'

const block = (type: Block['type'], id: string = type): Block => ({ ...makeBlock(type), id })
/** 1920×1080 장의 본문 상자 (위아래 틀과 제목을 뺀 어림) */
const SIZE = { w: 1680, h: 760 }
/** 차례대로 눌러 넣은 부품 장 */
const compose = (...bs: Block[]): Slide => ({ ...makeSlide('compose'), blocks: bs.reduce<Block[]>((out, b) => autoPlace(out, b, SIZE.h) ?? out, []) })
/** 큰 부품 수(MAX_LARGE)가 찬 장 (높이는 따지지 않고 넣은 것) */
const full = (): Slide => ({ ...makeSlide('compose'), blocks: ['a', 'b', 'c', 'd', 'e', 'f'].reduce<Block[]>((out, id) => autoPlace(out, block('callout', id)) ?? out, []) })
const fresh = (s: Slide, b: Block): DropState => ({ kind: 'new', block: b, base: s.blocks ?? [], moving: null, composed: null, target: null })

describe('컴포넌트를 놓을 판', () => {
  it('부품 장은 그 판, 바꿀 수 있는 장은 바꾼 모습의 판, 표지와 섹션은 없다', () => {
    const s = compose(block('kpi', 'k'))
    expect(dropBlocks(s)).toEqual({ blocks: s.blocks, composed: null })
    const points = makeSlide('points')
    const at = dropBlocks(points)
    expect(at?.composed?.layout).toBe('compose')
    // 바꿀 때마다 새 id를 받으니 무엇이 들었는지로 견준다
    const kinds = (bs?: Block[]) => bs?.map((b) => [b.type, b.at])
    expect(kinds(at?.blocks)).toEqual(kinds(asCompose(points).blocks))
    expect(dropBlocks(makeSlide('cover'))).toBeNull()
    expect(dropBlocks(makeSlide('section'))).toBeNull()
  })

  it('이미 바꿔 둔 모습이 있으면 그것을 쓴다 (끄는 동안 기준이 바뀌지 않게)', () => {
    const points = makeSlide('points')
    const composed = asCompose(points)
    expect(dropBlocks(points, composed)?.composed).toBe(composed)
  })
})

describe('눌러 넣기', () => {
  it('부품 장: 알아서 고른 자리에. 자리가 없으면 넣지 않고 까닭을 남긴다 (새 장은 쓰는 사람이 고를 때만)', () => {
    const s = compose(block('kpi', 'k'))
    const b = block('trend', 't')
    const p = planDrop(s, fresh(s, b), { by: 'auto', h: SIZE.h })
    expect(p).toEqual({ plan: 'place', target: null, result: autoPlace(s.blocks!, b, SIZE.h), blocked: null, composed: null, base: s.blocks, room: SIZE.h, auto: true })

    const f = full()
    expect(f.blocks).toHaveLength(6)
    const q = planDrop(f, fresh(f, b), { by: 'auto', h: SIZE.h })
    expect(q.plan).toBe('next')
    expect(q.result).toBeNull()
    expect(q.blocked).toEqual(placeIssue(f.blocks!, b, SIZE.h))
  })

  it('알아서 짠 표시가 맞는 판은 예전 규칙으로 짠 판이어도 판을 다시 고르고, 그 판을 알아서 짠 판이라고 알린다', () => {
    const now = compose(block('number', 'n'), block('bullets', 'l'), block('trend', 't')).blocks!
    // 숫자 칸을 넓힌 판: 예전 규칙이 골랐을 판. 표시가 없으면 사람이 짠 판으로 보인다
    const old = resizeBlock(now, 'n', 'w', 4, SIZE.h)!
    expect(autoArranged(old, undefined, SIZE.h)).toBe(false)
    const b = block('text', 'x')
    const marked: Slide = { ...makeSlide('compose'), blocks: old, arranged: boardSig(old) }
    const p = planDrop(marked, fresh(marked, b), { by: 'auto', h: SIZE.h })
    expect(p.auto).toBe(true)
    expect(p.result).toEqual(autoPlace(old, b, SIZE.h, true))
    expect(p.result).not.toEqual(autoPlace(old, b, SIZE.h, false))
    const plain: Slide = { ...marked, arranged: undefined }
    const q = planDrop(plain, fresh(plain, b), { by: 'auto', h: SIZE.h })
    expect(q.auto).toBe(false)
    expect(q.result).toEqual(autoPlace(old, b, SIZE.h, false))
    // 장 아래 빈자리로 고른 것은 사람이 고른 자리다
    const one = compose(block('number', 'n'))
    const r = planDrop(one, fresh(one, b), { by: 'auto', h: SIZE.h, bottom: true })
    expect(r.result).toEqual(insertAt(one.blocks!, { at: null, side: 'below' }, b, SIZE.h))
    expect(r.auto).toBeUndefined()
  })

  it('바꿀 수 있는 장: 부품 장으로 바꾼 모습에 넣는다. 아래 빈자리로 고르면 맨 아래 장 너비로', () => {
    const points = makeSlide('points', { items: 1 })
    const b = block('message', 'm')
    const p = planDrop(points, fresh(points, b), { by: 'auto', h: SIZE.h })
    expect(p.plan).toBe('convert')
    expect(p.composed?.layout).toBe('compose')
    expect(p.base).toEqual(p.composed?.blocks)
    expect(p.result).toEqual(autoPlace(p.base, b, SIZE.h))

    const bottom = planDrop(points, fresh(points, b), { by: 'auto', h: SIZE.h, bottom: true })
    const m = bottom.result!.find((x) => x.id === 'm')!.at!
    expect(m.w).toBe(12)
    expect(m.y + m.h).toBe(12)
  })

  it('표지: 넣지 않는다', () => {
    const cover = makeSlide('cover')
    const b = block('kpi', 'k')
    expect(planDrop(cover, fresh(cover, b), { by: 'auto', h: undefined })).toEqual({ plan: 'next', target: null, result: null, blocked: null, composed: null, base: [], room: undefined })
  })
})

describe('끌어 놓기', () => {
  const s = compose(block('kpi', 'k'), block('trend', 't'), block('bullets', 'l'))
  const b = block('callout', 'c')

  it('장 밖이면 할 일이 없다. 지금까지의 높이와 바꾼 모습은 그대로 둔다', () => {
    const d = { ...fresh(s, b), room: 500 }
    expect(planDrop(s, d, { by: 'pointer', over: false, at: null })).toEqual({ plan: null, target: null, result: null, blocked: null, composed: null, base: s.blocks, room: 500 })
  })

  it('부품 장 위: 손 아래 자리에 놓고, 놓은 뒤의 판을 미리 만든다', () => {
    const p = { x: 1500, y: 600 }
    const plan = planDrop(s, fresh(s, b), { by: 'pointer', over: true, at: { p, size: SIZE } })
    expect(plan.plan).toBe('place')
    const t = dropTarget(s.blocks!, b, p, SIZE)!
    expect(plan.target).toEqual(t)
    expect(plan.result).toEqual(t.kind === 'spot' ? insertAt(s.blocks!, t.spot, b, SIZE.h) : null)
    expect(plan.room).toBe(SIZE.h)
  })

  it('경계에서 떨리지 않게: 손 아래 자리가 바뀌어도 30px 옆에서 지금 자리가 나오면 그대로 둔다', () => {
    // 자리가 여럿 나오는 넉넉한 판
    const s = compose(block('kpi', 'k'), block('bullets', 'l'))
    const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
    // 가로로 지나가며 손 아래 자리가 바뀌는 곳을 찾는다
    let checked = 0
    for (let x = 100; x < SIZE.w; x += 10) {
      const before = dropTarget(s.blocks!, b, { x, y: 600 }, SIZE)
      const after = dropTarget(s.blocks!, b, { x: x + 10, y: 600 }, SIZE)
      if (!before || same(before, after)) continue
      const plan = planDrop(s, { ...fresh(s, b), target: before }, { by: 'pointer', over: true, at: { p: { x: x + 10, y: 600 }, size: SIZE } })
      expect(plan.target).toEqual(before)
      checked++
    }
    expect(checked).toBeGreaterThan(0)
  })

  it('옮기기: 처음 자리 안이면 그대로, 밖이면 옮기는 컴포넌트를 뺀 판에서 찾는다', () => {
    const moving = s.blocks![0]
    const d: DropState = { kind: 'move', block: moving, base: removeBlock(s.blocks!, moving.id, SIZE.h), moving: s.blocks!, composed: null, target: { kind: 'stay' } }
    const a = moving.at!
    const home = { x: ((a.x + a.w / 2) * (SIZE.w + 72)) / 12 - 36, y: ((a.y + a.h / 2) * (SIZE.h + 48)) / 12 - 24 }
    const stay = planDrop(s, d, { by: 'pointer', over: true, at: { p: home, size: SIZE } })
    expect(stay.target).toEqual({ kind: 'stay' })
    expect(stay.result).toBe(s.blocks)
    const away = planDrop(s, d, { by: 'pointer', over: true, at: { p: { x: SIZE.w - 40, y: SIZE.h - 40 }, size: SIZE } })
    expect(away.base).toBe(d.base)
    expect(away.plan).toBe('place')
    expect(away.result?.map((x) => x.id).sort()).toEqual(s.blocks!.map((x) => x.id).sort())
    // 잴 수 없으면 자리도 없다
    expect(planDrop(s, d, { by: 'pointer', over: true, at: null }).plan).toBeNull()
  })

  it('바꿀 수 있는 장 위: 바꾼 모습에 놓고, 표지 위에는 넣지 않는다', () => {
    const points = makeSlide('points', { items: 1 })
    const plan = planDrop(points, fresh(points, b), { by: 'pointer', over: true, at: { p: { x: 800, y: 700 }, size: SIZE } })
    expect(plan.plan).toBe('convert')
    expect(plan.composed?.layout).toBe('compose')
    expect(plan.base).toEqual(plan.composed?.blocks)

    const cover = makeSlide('cover')
    expect(planDrop(cover, fresh(cover, b), { by: 'pointer', over: true, at: { p: { x: 800, y: 700 }, size: SIZE } }).plan).toBe('next')
    // 부품 장이 아닌 장에서는 옮길 수 없다
    expect(planDrop(points, { ...fresh(points, b), kind: 'move' }, { by: 'pointer', over: true, at: { p: { x: 800, y: 700 }, size: SIZE } }).plan).toBeNull()
  })

  it('옮기기: 보이는 판으로 재고, 손 아래 둘레에 놓을 수 없으면 제자리에 두며 까닭을 알린다', () => {
    const s = compose(block('message', 'm'), block('number', 'n'), block('bars', 'r'))
    const moving = s.blocks!.find((x) => x.id === 'r')!
    const d: DropState = { kind: 'move', block: moving, base: movingBase(s.blocks!, 'r', SIZE.h), moving: s.blocks!, composed: null, target: { kind: 'stay' } }
    // 보이는 판: 핵심 한 줄이 위, 아래 줄에 큰 숫자와 막대 비교(놓일 자리)
    const cell = (x: number, y: number, w: number, h: number) => ({ cell: { x, y, w, h }, ink: { x: x - 14, y: y - 14, w: w + 28, h: Math.min(h, 220) + 28 } })
    const shown: Shown = { cells: new Map([['m', cell(0, 100, 1680, 120)], ['n', cell(0, 270, 366, 435)]]), slot: cell(438, 270, 1242, 435) }
    let stays = 0
    for (let x = 0; x <= SIZE.w; x += 40)
      for (let y = 0; y <= SIZE.h; y += 40) {
        const plan = planDrop(s, d, { by: 'pointer', over: true, at: { p: { x, y }, size: SIZE, shown } })
        expect(plan.target).not.toBeNull()
        if (plan.target?.kind === 'stay') {
          // 제자리면 판이 그대로이고, 놓일 자리 위가 아니면 까닭이 있다
          expect(plan.result).toBe(s.blocks)
          const onSlot = x >= 424 && x <= 1694 && y >= 256 && y <= 504
          if (!onSlot && plan.blocked === null) expect(plan.result).toBe(s.blocks)
          if (!onSlot) stays++
        } else expect(moveAt(s.blocks!, 'r', plan.target!, SIZE.h)).toEqual(plan.result)
      }
    expect(stays).toBeGreaterThan(0)
    // 놓일 자리 위면 그대로, 까닭 없음
    const home = planDrop(s, d, { by: 'pointer', over: true, at: { p: { x: 900, y: 380 }, size: SIZE, shown } })
    expect(home.target).toEqual({ kind: 'stay' })
    expect(home.blocked).toBeNull()
  })

  it('옮기기: 겹친 칸이 덮은 빈틈은 가장 가까운 테두리의 것 (짧은 글의 칸 안이라고 제자리로 치지 않는다)', () => {
    // 핵심 한 줄(위, 짧은 글) 아래에 큰 숫자 셋. 아래 줄을 글 바로 아래로 올려 붙여, 핵심 한 줄의 칸이 숫자 사이 빈틈까지 덮는다
    const s = compose(block('number', 'a'), block('number', 'b'), block('number', 'c'), block('message', 'm'))
    const m = s.blocks!.find((x) => x.id === 'm')!
    expect(m.at).toMatchObject({ y: 0, w: 12 })
    const d: DropState = { kind: 'move', block: m, base: movingBase(s.blocks!, 'm', SIZE.h), moving: s.blocks!, composed: null, target: { kind: 'stay' } }
    const cell = (x: number) => ({ cell: { x, y: 335, w: 512, h: 391 }, ink: { x: x - 14, y: 322, w: 311, h: 249 } })
    const shown: Shown = { cells: new Map([['a', cell(0)], ['b', cell(615)], ['c', cell(1231)]]), slot: { cell: { x: 0, y: 220, w: 1680, h: 266 }, ink: { x: -14, y: 207, w: 359, h: 81 } } }
    // 첫째와 둘째 숫자 사이: 핵심 한 줄은 장 너비의 절반 이상이 있어야 해서 끼울 수 없다. 그렇다고 알리고, 가까운 자리나 제자리에
    const between = planDrop(s, d, { by: 'pointer', over: true, at: { p: { x: 596, y: 447 }, size: SIZE, shown } })
    expect(between.blocked?.kind).toBe('narrow')
    if (between.target?.kind === 'stay') expect(between.result).toBe(s.blocks)
    else expect(between.result).toEqual(moveAt(s.blocks!, 'm', between.target!, SIZE.h))
    // 글 오른쪽의 빈 곳(제 줄): 판 맨 위 새 줄이라 판이 그대로
    const right = planDrop(s, d, { by: 'pointer', over: true, at: { p: { x: 1000, y: 240 }, size: SIZE, shown } })
    expect(right.result?.map((x) => [x.id, x.at])).toEqual(s.blocks!.map((x) => [x.id, x.at]))
    expect(right.blocked).toBeNull()
    // 글 위는 제자리
    expect(planDrop(s, d, { by: 'pointer', over: true, at: { p: { x: 100, y: 250 }, size: SIZE, shown } }).target).toEqual({ kind: 'stay' })
  })

  it('지금 자리를 그대로 두면 그때 알린 까닭도 그대로 (손 아래가 조금 달라졌다고 다른 까닭이 붙지 않게)', () => {
    const s = compose(block('message', 'm'), block('number', 'n'), block('bars', 'r'))
    const moving = s.blocks!.find((x) => x.id === 'n')!
    const target = { kind: 'spot' as const, spot: { at: 'm', side: 'right' as const } }
    const shown: Shown = {
      cells: new Map([
        ['m', { cell: { x: 0, y: 100, w: 1300, h: 203 }, ink: { x: -14, y: 117, w: 359, h: 81 } }],
        ['r', { cell: { x: 0, y: 320, w: 1680, h: 385 }, ink: { x: -14, y: 313, w: 1708, h: 349 } }],
      ]),
      slot: { cell: { x: 1300, y: 100, w: 380, h: 203 }, ink: { x: 1300, y: 121, w: 224, h: 184 } },
    }
    const d: DropState = { kind: 'move', block: moving, base: movingBase(s.blocks!, 'n', SIZE.h), moving: s.blocks!, composed: null, target, anchor: { x: 471, y: 320 }, blocked: null }
    // 막대 비교의 그린 것 위 끝으로 조금(MIN_TRAVEL 안) 내려와 손 아래 자리가 바뀌어도 자리와 까닭이 그대로
    const plan = planDrop(s, d, { by: 'pointer', over: true, at: { p: { x: 471, y: 330 }, size: SIZE, shown } })
    expect(plan.target).toEqual(target)
    expect(plan.blocked).toBeNull()
    // 많이 움직이면 새로 고른다
    const far = planDrop(s, d, { by: 'pointer', over: true, at: { p: { x: 900, y: 600 }, size: SIZE, shown } })
    expect(far.target).not.toEqual(target)
  })

  it('제자리로 돌아간 뒤에도 손이 조금 움직이는 동안은 제자리 (제자리와 옆자리를 오가지 않게)', () => {
    const s = compose(block('message', 'm'), block('number', 'n'), block('bars', 'r'))
    const moving = s.blocks!.find((x) => x.id === 'n')!
    const shown: Shown = {
      cells: new Map([
        ['m', { cell: { x: 0, y: 100, w: 1680, h: 203 }, ink: { x: -14, y: 117, w: 359, h: 81 } }],
        ['r', { cell: { x: 438, y: 270, w: 1242, h: 435 }, ink: { x: 424, y: 256, w: 1270, h: 280 } }],
      ]),
      slot: { cell: { x: 0, y: 270, w: 366, h: 435 }, ink: { x: -14, y: 256, w: 264, h: 221 } },
    }
    const base = movingBase(s.blocks!, 'n', SIZE.h)
    const d: DropState = { kind: 'move', block: moving, base, moving: s.blocks!, composed: null, target: { kind: 'stay' }, anchor: { x: 690, y: 150 }, blocked: { kind: 'height', need: 800, room: 760 } }
    // 글 오른쪽 빈 곳은 그 글 옆 자리지만, 제자리를 고른 곳에서 10px밖에 움직이지 않았다
    const near = planDrop(s, d, { by: 'pointer', over: true, at: { p: { x: 700, y: 150 }, size: SIZE, shown } })
    expect(near.target).toEqual({ kind: 'stay' })
    expect(near.blocked).toEqual(d.blocked)
    const far = planDrop(s, d, { by: 'pointer', over: true, at: { p: { x: 760, y: 150 }, size: SIZE, shown } })
    expect(far.target).toEqual({ kind: 'spot', spot: { at: 'm', side: 'right' } })
    // 끌기를 막 시작했을 때(고른 곳이 없으면)는 바로 옮긴다
    expect(planDrop(s, { ...d, anchor: null }, { by: 'pointer', over: true, at: { p: { x: 700, y: 150 }, size: SIZE, shown } }).target).toEqual(far.target)
  })

  it('옮겨도 판이 그대로인 자리는 붙들지 않는다: 손 아래에 놓을 수 없으면 그 까닭을 알린다', () => {
    // 표(장 너비를 혼자 쓴다)가 위, 아래 줄에 큰 숫자와 주석. 보이는 판은 덜 찬 장을 눈높이로 내린 자리
    const area = { w: 1680, h: 705 }
    const t = { ...block('table', 't'), at: { x: 0, y: 0, w: 12, h: 7 } }
    const s: Slide = { ...makeSlide('compose'), blocks: [t, { ...block('number', 'n'), at: { x: 0, y: 7, w: 3, h: 5 } }, { ...block('note', 'o'), at: { x: 3, y: 7, w: 9, h: 5 } }] }
    const shown: Shown = {
      cells: new Map([
        ['n', { cell: { x: 0, y: 523, w: 366, h: 266 }, ink: { x: -14, y: 510, w: 224, h: 184 } }],
        ['o', { cell: { x: 438, y: 520, w: 1242, h: 266 }, ink: { x: 424, y: 509, w: 168, h: 59 } }],
      ]),
      slot: { cell: { x: 0, y: 117, w: 1680, h: 391 }, ink: { x: -14, y: 103, w: 1708, h: 372 } },
    }
    // 끌고 내려오는 길에 판 맨 위(표의 원래 자리라 옮겨도 그대로)를 골랐다
    const top = { kind: 'spot' as const, spot: { at: null, side: 'above' as const } }
    expect(sameBoard(moveAt(s.blocks!, 't', top, area.h)!, s.blocks!)).toBe(true)
    const d: DropState = { kind: 'move', block: t, base: movingBase(s.blocks!, 't', area.h), moving: s.blocks!, composed: null, target: top, anchor: { x: 600, y: 480 }, blocked: null }
    // 주석 왼쪽(큰 숫자와 주석 사이)에 놓으려 한다: 표는 옆에 둘 수 없다. 30px 위는 판 맨 위지만 붙들지 않고 그 까닭을 알린다
    const plan = planDrop(s, d, { by: 'pointer', over: true, at: { p: { x: 423, y: 537 }, size: area, shown } })
    expect(sameBoard(plan.result!, s.blocks!)).toBe(true)
    expect(plan.blocked).toEqual({ kind: 'solo', type: 'table' })

    // 같은 판(표의 원래 자리)을 다른 이름으로 가리킨 자리도 지금 자리로 친다: 주석 위쪽 절반에서 고른 자리(주석이 든 줄 위)를, 손이
    // 가운데 선을 넘었다고 표를 판 아래로 뒤집지 않는다. 30px 위는 판 맨 위라는 다른 이름의 같은 판이다
    const above1 = { kind: 'spot' as const, spot: { at: 'o', side: 'above' as const, up: 1 } }
    expect(sameBoard(moveAt(s.blocks!, 't', above1, area.h)!, s.blocks!)).toBe(true)
    const held = planDrop(s, { ...d, target: above1, anchor: { x: 552, y: 510 }, blocked: { kind: 'narrow', span: 12 } }, { by: 'pointer', over: true, at: { p: { x: 507.6, y: 538.6 }, size: area, shown } })
    expect(sameBoard(held.result!, s.blocks!)).toBe(true)
    expect(held.blocked).toEqual({ kind: 'narrow', span: 12 })
  })

  it('옮기기: 다른 컴포넌트 가운데에 놓았는데 맞바꿀 수 없으면 그 까닭을 알린다', () => {
    // 위에 표(장 너비를 혼자 쓴다), 아래 줄에 큰 숫자와 주석. 큰 숫자를 표 가운데로 끌면 맞바꾸려는 것인데, 표는 주석 옆인 큰 숫자
    // 자리에 들어가지 않는다. 말없이 다른 자리나 제자리에 두면 아무 일도 없는 것 같았다
    const n = { ...block('number', 'n'), at: { x: 0, y: 7, w: 3, h: 5 } }
    const s: Slide = { ...makeSlide('compose'), blocks: [{ ...block('table', 't'), at: { x: 0, y: 0, w: 12, h: 7 } }, n, { ...block('note', 'o'), at: { x: 3, y: 7, w: 9, h: 5 } }] }
    expect(moveAt(s.blocks!, 'n', { kind: 'swap', with: 't' }, SIZE.h)).toBeNull()
    const d: DropState = { kind: 'move', block: n, base: movingBase(s.blocks!, 'n', SIZE.h), moving: s.blocks!, composed: null, target: null }
    const plan = planDrop(s, d, { by: 'pointer', over: true, at: { p: { x: 840, y: 220 }, size: SIZE } })
    expect(plan.target?.kind).not.toBe('swap')
    expect(plan.blocked).toEqual({ kind: 'swap', type: 'table' })
  })

  it('옮기기: 낮은 컴포넌트도 가운데에 손을 올리면 맞바꾼다 (30px 옆의 위나 아래로 붙들지 않는다)', () => {
    // 위에 핵심 한 줄, 아래 줄 왼쪽에 높은 숫자 한 줄, 가운데 단에 숫자 한 줄(옮긴다)과 그 아래 주석, 오른쪽에 막대 비교
    const area = { w: 1680, h: 705 }
    const s1 = { ...block('stat', 's'), at: { x: 3, y: 5, w: 3, h: 4 } }
    const s: Slide = {
      ...makeSlide('compose'),
      blocks: [
        { ...block('message', 'm'), at: { x: 0, y: 0, w: 12, h: 5 } },
        { ...block('stat', 'a'), at: { x: 0, y: 5, w: 3, h: 7 } },
        s1,
        { ...block('note', 'o'), at: { x: 3, y: 9, w: 3, h: 3 } },
        { ...block('bars', 'b'), at: { x: 6, y: 5, w: 6, h: 7 } },
      ],
    }
    const shown: Shown = {
      cells: new Map([
        ['m', { cell: { x: 0, y: 163, w: 1680, h: 266 }, ink: { x: -14, y: 150, w: 359, h: 81 } }],
        ['a', { cell: { x: 0, y: 278, w: 366, h: 391 }, ink: { x: -14, y: 265, w: 256, h: 225 } }],
        ['b', { cell: { x: 876, y: 265, w: 804, h: 391 }, ink: { x: 862, y: 254, w: 832, h: 369 } }],
        ['o', { cell: { x: 438, y: 519, w: 366, h: 140 }, ink: { x: 424, y: 508, w: 196, h: 66 } }],
      ]),
      slot: { cell: { x: 438, y: 278, w: 366, h: 203 }, ink: { x: 424, y: 265, w: 256, h: 225 } },
    }
    const swap = { kind: 'swap' as const, with: 'o' }
    expect(moveAt(s.blocks!, 's', swap, area.h)).not.toBeNull()
    // 내려오는 길에 주석 위(제자리)를 골랐고, 손이 주석 글의 한가운데에 왔다
    const d: DropState = {
      kind: 'move',
      block: s1,
      base: movingBase(s.blocks!, 's', area.h),
      moving: s.blocks!,
      composed: null,
      target: { kind: 'spot', spot: { at: 'o', side: 'above' } },
      anchor: { x: 536, y: 500 },
      blocked: null,
    }
    const plan = planDrop(s, d, { by: 'pointer', over: true, at: { p: { x: 522, y: 541 }, size: area, shown } })
    expect(plan.target).toEqual(swap)
  })

  it('장에 자리가 없으면 새 컴포넌트는 넣지 않고, 그 까닭을 남긴다', () => {
    const f = full()
    const plan = planDrop(f, fresh(f, b), { by: 'pointer', over: true, at: { p: { x: 800, y: 300 }, size: SIZE } })
    expect(plan.plan).toBe('next')
    // 강조 상자는 작은 부품이 아니라 큰 부품 수가 찬다
    expect(plan.blocked).toEqual({ kind: 'large' })
  })
})

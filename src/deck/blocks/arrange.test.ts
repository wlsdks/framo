import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { autoPlace, boardFit, boardTight, byReading, composeAreaH, isArranged, makeBlock, moveAt, rearrangeBlocks, removeBlock, tiles } from '../blocks'
import { sampleBlock } from '../blockSamples'
import { KPI_NARROW } from './arrange'
import { aspectOf } from './images'
import type { Block, BlockType, Slide } from '../types'

const H = composeAreaH({ fields: { title: '제목' } } as unknown as Slide)
const block = (type: BlockType, id: string = type): Block => ({ ...makeBlock(type), id })
/** 차례대로 눌러 넣은 판 (편집기의 '넣기') */
const board = (...bs: Block[]): Block[] => bs.reduce<Block[]>((out, b) => autoPlace(out, b, H) ?? out, [])
const at = (bs: Block[], id: string) => bs.find((b) => b.id === id)!.at!

describe('짜임 틀 고르기', () => {
  it('큰 숫자와 짧은 설명은 본문의 양쪽에 나란히 놓는다', () => {
    const number = { ...block('number', 'n'), fields: { label: '평균 처리 시간', value: '2.4일' } }
    const text = { ...block('text', 't'), fields: { body: '접수 경로를 하나로 합쳐 담당자가 요청을 바로 확인해요.' } }
    const bs = board(number, text)
    expect(tiles(bs)).toBe(true)
    expect(at(bs, 'n').y).toBe(at(bs, 't').y)
    expect(at(bs, 't').x).toBeGreaterThan(at(bs, 'n').x)
  })
  it('소제목이 있는 짧은 설명과 목록은 서로 나란히 놓고 오른쪽을 함께 쓴다', () => {
    const text = { ...block('text', 't'), fields: { heading: '먼저 해 볼 일', body: '키보드로 메뉴와 입력란을 이동해 봐요.' } }
    const bullets = { ...sampleBlock('bullets'), id: 'b', fields: { heading: '살펴볼 점' }, items: sampleBlock('bullets').items.slice(0, 3) }
    const bs = board(text, bullets)
    expect(tiles(bs)).toBe(true)
    expect(at(bs, 't').y).toBe(at(bs, 'b').y)
    expect(at(bs, 'b').x).toBe(at(bs, 't').x + at(bs, 't').w)
  })
  it('핵심 문장과 적은 목록 둘은 자동으로 나란히 놓는다', () => {
    const message = { ...sampleBlock('message'), id: 'm', fields: { text: '주간 보고 양식을 하나로 맞춰요', sub: '팀마다 다른 양식을 다시 정리하는 일이 없도록' } }
    for (const n of [2, 3, 4]) {
      const sample = sampleBlock('bullets')
      const bullets = { ...sample, id: 'b', items: Array.from({ length: n }, (_, i) => ({ ...sample.items[i % sample.items.length], id: `item-${i}` })) }
      const bs = board(message, bullets)
      expect(tiles(bs)).toBe(true)
      expect(at(bs, 'm').y, `항목 ${n}개`).toBe(at(bs, 'b').y)
      expect(at(bs, 'b').x).toBe(at(bs, 'm').x + at(bs, 'm').w)
    }
  })
  it('적은 목록과 몇 중 몇은 각각 짧으면 본문 양쪽에 놓는다', () => {
    const list = { ...sampleBlock('bullets'), id: 'b', items: sampleBlock('bullets').items.slice(0, 2) }
    const ratio = { ...sampleBlock('ratio'), id: 'r' }
    for (const size of [undefined, 'large'] as const) {
      const h = composeAreaH({ fields: { title: '제목' }, hints: {} }, { theme: { id: 'white', size } })
      const bs = [list, ratio].reduce<Block[]>((out, b) => autoPlace(out, b, h) ?? out, [])
      expect(tiles(bs)).toBe(true)
      expect(at(bs, 'b').y).toBe(at(bs, 'r').y)
      expect(at(bs, 'r').x).toBeGreaterThan(at(bs, 'b').x)
    }
  })
  it('원을 그리지 않는 비율 원 옆의 주석은 멀리 떨어지지 않게 반씩 나눈다 (8 : 4로 나누면 사이가 340px 비고 주석이 꺾였다)', () => {
    for (const value of ['150%', '10건']) {
      const ring = { ...sampleBlock('ring'), id: 'r', fields: { ...sampleBlock('ring').fields, value, label: '확인할 비율' } }
      const note = { ...block('note', 'c'), fields: { text: '입력한 비율이 표시 범위에 맞는지 확인해요.' } }
      const bs = board(ring, note)
      expect(tiles(bs)).toBe(true)
      expect(at(bs, 'c').y, value).toBe(at(bs, 'r').y)
      expect(at(bs, 'r').w, value).toBe(6)
    }
  })
  it('핵심 숫자를 줄로 쌓는 칸에 너비를 몰아주지 않고 옆 목록과 고르게 나눈다', () => {
    const quote = { ...block('quote', 'q'), fields: { quote: '회의가 짧아지니 오후에 일할 시간이 생겼어요', by: '시범 부서 팀원' } }
    const kpi0 = block('kpi', 'k')
    const kpi = { ...kpi0, items: [['4.8억 원', '한 해 절감액'], ['3년', '회수 기간'], ['22%', '줄인 회의 시간']].map(([value, title], i) => ({ ...kpi0.items[i], value, title })) }
    const list0 = block('bullets', 'l')
    const list = { ...list0, items: ['안건은 하루 전까지 보드에 올리기', '결정이 필요한 것만 회의에서', '나머지는 보드 댓글로 정리'].map((title, i) => ({ ...list0.items[i], title })) }
    const bs = board(quote, kpi, list)
    expect(tiles(bs)).toBe(true)
    // 핵심 숫자는 반 칸이나 3분의 2 칸에서 숫자 옆에 이름을 두는 줄로 쌓여 450px 남짓만 쓴다. 8칸을 주면 오른쪽 절반이 비고
    // 옆 목록은 4칸에 눌려 첫 줄이 꺾였다
    expect(at(bs, 'k').y).toBe(at(bs, 'l').y)
    expect(at(bs, 'l').w).toBeGreaterThanOrEqual(at(bs, 'k').w)
  })
  it('핵심 숫자 셋은 짧은 글 하나와 함께면 판 너비의 한 줄로 선다', () => {
    const kpi0 = block('kpi', 'k')
    const kpi = { ...kpi0, items: [['4.8억 원', '한 해 절감액'], ['3년', '회수 기간'], ['22%', '줄인 회의 시간']].map(([value, title], i) => ({ ...kpi0.items[i], value, title })) }
    const quote = { ...block('quote', 'q'), fields: { quote: '회의가 짧아지니 오후에 일할 시간이 생겼어요', by: '시범 부서 팀원' } }
    const list = { ...sampleBlock('bullets'), id: 'l' }
    // 한 줄로 선 숫자 셋은 칸을 셋으로 나눠 오른쪽 끝까지 그려진다. 반 칸만 쓴다고 어림하던 때는 인용 4칸 옆에 숫자를 8칸 높이 전체로
    // 쌓아 숫자 오른쪽 30%가 비었다
    for (const bs of [board(quote, kpi), board(kpi, list)]) {
      expect(tiles(bs)).toBe(true)
      expect(at(bs, 'k').w).toBe(12)
    }
  })
  it('핵심 숫자가 좁은 칸의 짜임으로 바꾸는 높이는 그리는 쪽(kpi.css)과 같다', () => {
    const css = readFileSync(new URL('../../slides/styles/blocks/kpi.css', import.meta.url), 'utf8')
    const rules = [...css.matchAll(/@container bk \(max-width: 1200px\) and \(min-height: (\d+)px\) \{\s*([^{]+?)\s*\{\s*--kp-(stack|pair): 1;/g)].map((m) => ({ h: Number(m[1]), sel: m[2], kind: m[3] }))
    for (const n of [2, 3, 4] as const)
      for (const variant of ['base', 'cards'] as const)
        for (const body of [0, 1] as const) {
          const sel = `.va-${variant} > .bk-in:has(> .kp[data-n='${n}']${body ? ' .kp-body)' : '):not(:has(.kp-body))'}`
          expect(rules.find((r) => r.sel === sel && r.kind === (n === 4 ? 'pair' : 'stack'))?.h, `${n} ${variant} ${body}`).toBe(KPI_NARROW[n][variant][body])
        }
  })
  it('로고 모음 다음에 넣은 숫자 둘은 한 줄에 나란히, 로고 위에 선다 (숫자가 답)', () => {
    const logos = sampleBlock('logos')
    const bs = board({ ...logos, id: 'l' }, { ...sampleBlock('stat'), id: 's1' }, { ...sampleBlock('stat'), id: 's2' })
    expect(tiles(bs)).toBe(true)
    expect(at(bs, 's1').y).toBe(at(bs, 's2').y)
    expect(at(bs, 's1').h).toBe(at(bs, 's2').h)
    expect(at(bs, 's1').y).toBeLessThan(at(bs, 'l').y)
  })
  it('차트 다음에 숫자만 넣으면 숫자가 차트 위나 옆에 선다: 차트 아래 띠에 혼자 깔리지 않는다 (숫자가 답)', () => {
    // 추이 다음에 큰 숫자를 넣으면 추이가 위를 다 쓰고 숫자가 그 아래 띠의 왼쪽에 각주처럼 혼자 붙어, 아래 오른쪽이 통째로 비었다
    const cases: [BlockType, BlockType[]][] = [['trend', ['number']], ['bars', ['stat', 'stat']], ['trend', ['delta']], ['attain', ['goal']], ['share', ['number']]]
    for (const [chart, nums] of cases) {
      const bs = board({ ...sampleBlock(chart), id: 'c' }, ...nums.map((t, i) => ({ ...sampleBlock(t), id: `n${i}` })))
      const label = bs.map((b) => `${b.type}@${b.at!.x},${b.at!.y},${b.at!.w},${b.at!.h}`).join(' ')
      expect(tiles(bs), label).toBe(true)
      const c = at(bs, 'c')
      for (const i of nums.keys()) expect(at(bs, `n${i}`).y, label).toBeLessThanOrEqual(c.y)
    }
    // 소제목 아래 묶음에서도 같다
    const head = board(block('heading', 'h'), { ...sampleBlock('trend'), id: 'c' }, { ...sampleBlock('number'), id: 'n0' })
    expect(at(head, 'n0').y).toBeLessThanOrEqual(at(head, 'c').y)
    expect(at(head, 'h').y).toBeLessThan(at(head, 'n0').y)
  })
  it('차트 다음에 목록과 숫자를 넣으면 목록과 숫자가 차트 아래 한 줄에 그대로 선다 (숫자만 올리지 않는다)', () => {
    const bs = board({ ...sampleBlock('market'), id: 'c' }, { ...sampleBlock('bullets'), id: 'b' }, { ...sampleBlock('number'), id: 'n' })
    expect(tiles(bs)).toBe(true)
    expect(at(bs, 'n').y).toBe(at(bs, 'b').y)
    expect(at(bs, 'n').y).toBeGreaterThan(at(bs, 'c').y)
  })
  it('짧은 목록이나 글 옆의 숫자를 본문 오른쪽 끝으로 밀지 않는다 (남는 너비를 글 칸에 몰아 가운데가 비지 않게)', () => {
    // 핵심 한 줄 아래 목록 9칸 | 숫자 3칸: 목록 글은 본문의 3분의 1에서 끝나고 숫자는 오른쪽 끝에 붙어, 둘 사이가 본문의 절반 가까이
    // (793px) 비었다. 오른쪽 끝의 빈 곳만 세서, 숫자를 끝으로 밀어 그 빈 곳을 가운데로 옮긴 판이 가장 좋다고 골랐다
    const sample = (type: BlockType, id: string) => ({ ...sampleBlock(type), id })
    const cases = [
      board(sample('message', 'm'), sample('bullets', 'b'), sample('number', 'n')),
      board(sample('bullets', 'b'), sample('number', 'n')),
      board(sample('market', 'c'), sample('bullets', 'b'), sample('number', 'n')),
      board(sample('market', 'c'), sample('text', 'b'), sample('number', 'n')),
    ]
    for (const bs of cases) {
      const label = bs.map((b) => `${b.type}@${b.at!.x},${b.at!.w}`).join(' ')
      expect(tiles(bs), label).toBe(true)
      expect(at(bs, 'b').y, label).toBe(at(bs, 'n').y)
      expect(at(bs, 'b').w, label).toBeLessThanOrEqual(7)
    }
    // 숫자끼리는 사이가 비어도 같은 너비다(같은 말투): 앞 숫자 칸만 좁혀 사이를 줄이지 않는다
    const nums = board(sample('logos', 'l'), sample('stat', 's1'), sample('stat', 's2'))
    expect(at(nums, 's1').w).toBe(at(nums, 's2').w)
  })

  it('들여 쓰기(카드)를 고른 부품 옆에 넣어도 바탕 없는 부품과 같이 나란히 놓는다', () => {
    // 판 너비를 혼자 쓰는 부품은 고른 바탕이 있어도 바탕 없이 그려진다. 그런데 내용이 그려지는 너비를 카드의 높이로 어림해서
    // (좁은 칸은 카드의 안쪽 여백만큼 늘 높다) 판 너비를 다 쓴다고 보았고, 목록을 넣으면 아래에 쌓아 두 내용이 왼쪽 절반에만 그려졌다
    for (const type of ['quote', 'steps', 'status', 'delta', 'goal', 'tiles'] as BlockType[]) {
      for (const look of ['plain', 'card'] as const) {
        const bs = board({ ...sampleBlock(type), id: 'a', look }, { ...sampleBlock('bullets'), id: 'b' })
        const label = `${type} ${look}: ` + bs.map((b) => `${b.type}@${b.at!.x},${b.at!.y},${b.at!.w}`).join(' ')
        expect(tiles(bs), label).toBe(true)
        expect(at(bs, 'b').y, label).toBe(at(bs, 'a').y)
      }
    }
  })

  it('소제목 묶음 둘은 소제목마다 그 아래 부품 위에 선다', () => {
    const bs = board(block('heading', 'h1'), block('points', 'p'), block('heading', 'h2'), block('bullets', 'b'))
    expect(tiles(bs)).toBe(true)
    for (const [h, b] of [
      ['h1', 'p'],
      ['h2', 'b'],
    ]) {
      expect(at(bs, b).y).toBe(at(bs, h).y + at(bs, h).h)
      expect(at(bs, b).x).toBe(at(bs, h).x)
    }
  })

  it('알아서 짠 판은 넣고 빼면 원래 판으로 돌아간다', () => {
    const bs = board(block('number', 'n'), block('bullets', 'l'))
    const added = autoPlace(bs, block('trend', 't'), H)!
    expect(removeBlock(added, 't', H).map((b) => b.at)).toEqual(bs.map((b) => b.at))
  })

  it('사람이 옮긴 판은 다시 고르지 않는다', () => {
    const bs = board(block('number', 'n'), block('bullets', 'l'), block('trend', 't'))
    const fit = boardFit(H, bs)
    expect(isArranged(bs, fit, H, aspectOf)).toBe(true)
    const moved = moveAt(bs, 'n', { kind: 'spot', spot: { at: null, side: 'right' } }, H)!
    expect(isArranged(moved, boardFit(H, moved), H, aspectOf)).toBe(false)
    // 새 부품을 넣어도 옮긴 숫자는 오른쪽 끝 그대로
    const next = autoPlace(moved, block('text', 'x'), H)!
    expect(at(next, 'n').x + at(next, 'n').w).toBe(12)
  })

  it('사람이 요청하면 기존에 쌓아 둔 짧은 내용도 글을 보존하며 다시 배치한다', () => {
    const message = { ...sampleBlock('message'), id: 'm', fields: { text: '가상의 주간 보고를 간결하게 바꿔요', sub: '시범 운영 3개월 기준' }, at: { x: 0, y: 0, w: 12, h: 6 } }
    const list = { ...sampleBlock('bullets'), id: 'b', items: sampleBlock('bullets').items.slice(0, 3), at: { x: 0, y: 6, w: 12, h: 6 } }
    const before = [message, list]
    const after = rearrangeBlocks(before, H)!
    expect(tiles(after)).toBe(true)
    expect(at(after, 'm').y).toBe(at(after, 'b').y)
    expect(at(after, 'b').x).toBeGreaterThan(at(after, 'm').x)
    expect(after.map(({ at: _at, ...b }) => b)).toEqual(before.map(({ at: _at, ...b }) => b))
    expect(before[0].at).toEqual({ x: 0, y: 0, w: 12, h: 6 })
  })

  it.each([
    ['message', 'facts'],
    ['message', 'trend'],
    ['message', 'bars'],
  ] as [BlockType, BlockType][])('본문이 낮아져 %s와 %s가 넘치면 들어가는 배치를 먼저 고른다', (first, second) => {
    const before = board({ ...sampleBlock(first), id: 'a' }, { ...sampleBlock(second), id: 'b' })
    const slide = { layout: 'compose' as const, fields: { title: '가상의 현황과 다음 단계' }, hints: {}, blocks: before }
    const h = Math.floor(H * 0.6)
    expect(boardTight(slide, undefined, h)).toBe(true)
    const after = rearrangeBlocks(before, h)
    expect(after).not.toBeNull()
    expect(boardTight({ ...slide, blocks: after! }, undefined, h)).toBe(false)
    expect(byReading(after!).map((b) => b.id)).toEqual(byReading(before).map((b) => b.id))
    expect(after!.map(({ at: _at, ...b }) => b)).toEqual(before.map(({ at: _at, ...b }) => b))
  })

  it('기존 판도 넘치고 들어갈 후보도 없으면 배치를 찾지 못했다고 알린다', () => {
    const before = board({ ...sampleBlock('message'), id: 'a' }, { ...sampleBlock('facts'), id: 'b' })
    const slide = { layout: 'compose' as const, fields: { title: '가상의 현황' }, hints: {}, blocks: before }
    expect(boardTight(slide, undefined, 20)).toBe(true)
    expect(rearrangeBlocks(before, 20)).toBeNull()
  })

  it('연결 기호와 소제목 묶음은 뜻을 추측해 다시 배치하지 않는다', () => {
    expect(rearrangeBlocks([{ ...block('message'), link: 'arrow' }, block('number')], H)).toBeNull()
    expect(rearrangeBlocks([block('heading'), block('bullets')], H)).toBeNull()
    expect(rearrangeBlocks([block('number')], H)).toBeNull()
    expect(rearrangeBlocks([{ ...block('number', 'same'), at: { x: 0, y: 0, w: 6, h: 12 } }, { ...block('text', 'same'), at: { x: 6, y: 0, w: 6, h: 12 } }], H)).toBeNull()
    expect(rearrangeBlocks([block('number', 'n'), block('text', 't')], H)).toBeNull()
  })

  it('저장 배열 순서가 아니라 지금 화면에서 읽는 차례를 지킨다', () => {
    const first = { ...sampleBlock('bullets'), id: 'first', at: { x: 0, y: 0, w: 12, h: 6 } }
    const second = { ...sampleBlock('message'), id: 'second', at: { x: 0, y: 6, w: 12, h: 6 } }
    const before = [second, first]
    const after = rearrangeBlocks(before, H)!
    expect(tiles(after)).toBe(true)
    expect(byReading(after).map((b) => b.id)).toEqual(['first', 'second'])
  })

  it('네 컴포넌트도 화면의 읽는 순서와 작성한 내용을 보존한다', () => {
    const a = { ...sampleBlock('stat'), id: 'a', at: { x: 0, y: 0, w: 6, h: 6 } }
    const b = { ...sampleBlock('text'), id: 'b', at: { x: 6, y: 0, w: 6, h: 6 } }
    const c = { ...sampleBlock('stat'), id: 'c', at: { x: 0, y: 6, w: 6, h: 6 } }
    const d = { ...sampleBlock('text'), id: 'd', at: { x: 6, y: 6, w: 6, h: 6 } }
    const before = [d, b, c, a]
    const after = rearrangeBlocks(before, H)!
    expect(tiles(after)).toBe(true)
    expect(byReading(after).map((x) => x.id)).toEqual(['a', 'b', 'c', 'd'])
    expect(after.map(({ at: _at, ...x }) => x)).toEqual(before.map(({ at: _at, ...x }) => x))
  })

  it('이미지와 글, 차트가 섞인 유효한 판에서 읽는 차례와 원본을 지킨다', () => {
    const bs = board(
      { ...sampleBlock('image'), id: 'image' },
      { ...sampleBlock('message'), id: 'message' },
      { ...sampleBlock('bars'), id: 'bars' },
      { ...sampleBlock('bullets'), id: 'bullets' },
    )
    expect(bs).toHaveLength(4)
    const original = structuredClone(bs)
    const after = rearrangeBlocks(bs, H)
    expect(after).not.toBeNull()
    expect(byReading(after!).map((b) => b.id)).toEqual(byReading(original).map((b) => b.id))
    expect(after!.map(({ at: _at, ...b }) => b)).toEqual(original.map(({ at: _at, ...b }) => b))
    expect(bs).toEqual(original)
  })

  it('서로 다른 두 컴포넌트를 세 테마와 두 글자 크기에서 안전하게 다시 배치한다', () => {
    const pairs: [BlockType, BlockType][] = [
      ['message', 'bullets'], ['kpi', 'bullets'], ['number', 'facts'], ['pareto', 'number'],
      ['trend', 'text'], ['share', 'quote'], ['funnel', 'note'], ['decision', 'facts'],
      ['ratio', 'bullets'], ['text', 'bullets'], ['image', 'bullets'], ['network', 'facts'],
    ]
    for (const id of ['white', 'navy', 'serif'] as const) for (const size of [undefined, 'large'] as const) {
      const look = { theme: { id, size } }
      const slide = { fields: { title: '가상의 현황과 다음 단계' }, hints: {}, layout: 'compose' as const }
      const h = composeAreaH(slide, look, true)
      for (const [left, right] of pairs) {
        const first = autoPlace([], { ...sampleBlock(left), id: 'first' }, h)!
        const before = autoPlace(first, { ...sampleBlock(right), id: 'second' }, h)
        expect(before, `${id} ${size} ${left} ${right}`).not.toBeNull()
        const after = rearrangeBlocks(before!, h)
        expect(after, `${id} ${size} ${left} ${right}`).not.toBeNull()
        expect(tiles(after!)).toBe(true)
        expect(boardTight({ ...slide, blocks: after! }, look, h)).toBe(false)
        expect(byReading(after!).map((b) => b.id)).toEqual(byReading(before!).map((b) => b.id))
        expect(after!.map(({ at: _at, ...b }) => b)).toEqual(before!.map(({ at: _at, ...b }) => b))
      }
    }
  })
})

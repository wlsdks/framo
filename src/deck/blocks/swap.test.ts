import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { unshownCount } from '../fields'
import { emptyItem, makeSlide } from '../make'
import type { Block, BlockType, ItemKey } from '../types'
import { BLOCKS, CUSTOM_TYPES } from './catalog'
import { blockItems, makeBlock } from './cells'
import { MAX_LARGE } from './rules'
import { composeAreaH } from './sizing'
import { SWAP_GROUPS, swapBlock, swapChoices, swapIn, swapIssue } from './swap'

const KEYS: ItemKey[] = ['title', 'body', 'value', 'meta', 'image']

/** 컴포넌트의 모든 글(칸, 항목의 모든 칸. 보이지 않는 칸까지) */
function texts(b: Block): string[] {
  const out = Object.values(b.fields).filter((v) => v.trim())
  for (const it of b.items) for (const k of KEYS) if (it[k].trim()) out.push(it[k])
  return out.sort()
}

/** 보이는 칸의 글: 그 컴포넌트가 그리는 칸과 항목 */
function shown(b: Block): Record<string, string> {
  const spec = BLOCKS[b.type]
  const out: Record<string, string> = {}
  for (const f of spec.fields) if (b.fields[f.key]?.trim()) out[f.key] = b.fields[f.key]
  blockItems(b).forEach((it, i) => {
    for (const f of spec.items?.fields ?? []) if (it[f.key].trim()) out[`${i}.${f.key}`] = it[f.key]
  })
  return out
}

/** 모든 칸과 최대 수까지의 항목을 서로 다른 글로 채운 컴포넌트. 그리지 않는 항목의 칸도 채운다(앞에서 가려 둔 글) */
function full(type: BlockType, id = type): Block {
  const spec = BLOCKS[type]
  const fields = Object.fromEntries(spec.fields.filter((f) => !f.key.startsWith('$')).map((f) => [f.key, `${type}.${f.key}`]))
  const items = Array.from({ length: spec.items?.max ?? 0 }, (_, i) => ({
    ...emptyItem(),
    ...Object.fromEntries((['title', 'body', 'value', 'meta'] as const).map((k) => [k, `${type}.${i}.${k}`])),
  }))
  return { ...makeBlock(type), id, fields, items }
}

const pairs = SWAP_GROUPS.flatMap((g) => {
  const types = Object.keys(g.types) as BlockType[]
  return types.flatMap((a) => types.filter((b) => b !== a).map((b) => [a, b] as const))
})

describe('다른 컴포넌트로 바꾸기', () => {
  it('묶음의 컴포넌트는 모두 있는 컴포넌트이고 한 묶음에만 있다. 모션 그래픽은 묶지 않는다', () => {
    const all = SWAP_GROUPS.flatMap((g) => Object.keys(g.types))
    expect(new Set(all).size).toBe(all.length)
    for (const t of all) expect(BLOCKS[t as BlockType], t).toBeDefined()
    for (const t of CUSTOM_TYPES) expect(all).not.toContain(t)
    expect(swapChoices('cine')).toEqual([])
    expect(swapChoices('image')).toEqual([])
    expect(swapChoices('number')).not.toContain('number')
    expect(swapChoices('number')).toContain('kpi')
  })

  it('묶음 안의 모든 짝에서 적은 글이 하나도 줄지 않고, 되돌려 바꾸면 보이던 글이 제자리로 돌아온다', () => {
    for (const [a, b] of pairs) {
      const before = full(a)
      const there = swapBlock(before, b)
      expect(there.type).toBe(b)
      expect(texts(there), `${a} → ${b}`).toEqual(texts(before))
      const back = swapBlock(there, a)
      expect(texts(back), `${a} → ${b} → ${a}`).toEqual(texts(before))
      expect(shown(back), `${a} → ${b} → ${a}`).toEqual(shown(before))
      expect(back.fields, `${a} → ${b} → ${a}`).toEqual(before.fields)
    }
  })

  it('묶음을 한 바퀴 돌아도 글이 줄지 않고 처음 컴포넌트의 글이 제자리에 있다', () => {
    for (const g of SWAP_GROUPS) {
      const types = Object.keys(g.types) as BlockType[]
      for (const start of types) {
        const before = full(start)
        let cur = before
        for (const t of [...types.slice(types.indexOf(start) + 1), ...types.slice(0, types.indexOf(start) + 1)]) {
          cur = swapBlock(cur, t)
          expect(texts(cur), `${start}에서 ${t}까지`).toEqual(texts(before))
        }
        expect(shown(cur), `${start} 한 바퀴`).toEqual(shown(before))
      }
    }
  })

  it('같은 역할의 칸으로 옮긴다: 핵심 문장은 글로, 큰 숫자는 핵심 숫자의 첫 숫자로, 단계의 설명은 순환의 설명으로', () => {
    const msg = { ...makeBlock('message'), fields: { text: '한 문장', sub: '덧붙임' } }
    expect(swapBlock(msg, 'text').fields).toMatchObject({ body: '한 문장', sub: '덧붙임' })
    expect(swapBlock(msg, 'quote').fields).toMatchObject({ quote: '한 문장' })
    const num = { ...makeBlock('number'), fields: { label: '줄어드는 전기료', value: '3.6억 원', note: '3년이면 10.8억 원' } }
    const kpi = swapBlock(num, 'kpi')
    expect(kpi.items[0]).toMatchObject({ title: '줄어드는 전기료', value: '3.6억 원', body: '3년이면 10.8억 원' })
    expect(kpi.fields).toEqual({})
    expect(swapBlock(num, 'delta').fields).toMatchObject({ label: '줄어드는 전기료', after: '3.6억 원' })
    const proc = { ...makeBlock('process'), items: [{ ...emptyItem(), title: '신청', meta: '신청자 · 1일', body: '양식을 올려요' }, { ...emptyItem(), title: '검토' }] }
    const cyc = swapBlock(proc, 'cycle')
    expect(cyc.items[0]).toMatchObject({ title: '신청', meta: '양식을 올려요', body: '신청자 · 1일' })
    expect(swapBlock(cyc, 'process').items[0]).toMatchObject(proc.items[0])
    const cmp = { ...makeBlock('compare'), fields: { leftTitle: '지금', rightTitle: '바뀐 뒤' } }
    expect(swapBlock(cmp, 'wipe').fields).toEqual({ from: '지금', to: '바뀐 뒤' })
  })

  it('옮길 칸에 앞에서 가려 둔 글이 있으면 덮지 않는다', () => {
    const msg = { ...makeBlock('message'), fields: { text: '보이는 문장', body: '앞에서 가려 둔 글' } }
    const t = swapBlock(msg, 'text')
    expect(texts(t)).toEqual(texts(msg))
    expect(t.fields.body).toBe('앞에서 가려 둔 글')
    expect(swapBlock(t, 'message').fields).toEqual(msg.fields)
  })

  it('항목이 모자라면 빈 항목을 채우고, 넘치면 지우지 않고 가려 둔다', () => {
    const bars = full('bars')
    const pareto = swapBlock(bars, 'pareto')
    expect(pareto.items.length).toBe(bars.items.length)
    const agenda = { ...makeBlock('agenda'), items: [] }
    expect(swapBlock(agenda, 'points').items.length).toBe(BLOCKS.points.items!.min)
    // 핵심 숫자 넷을 큰 숫자 하나로: 첫 숫자만 보이고 나머지는 가려진 칸
    const kpi = full('kpi')
    const num = swapBlock(kpi, 'number')
    const slide = (b: Block) => ({ ...makeSlide('compose'), blocks: [b] })
    expect(unshownCount(slide(num))).toBeGreaterThan(unshownCount(slide(kpi)))
    expect(unshownCount(slide(swapBlock(num, 'kpi')))).toBe(unshownCount(slide(kpi)))
  })

  it('자리, 이음표, 움직임은 그대로, 모양은 같은 이름이 있을 때만, 바탕은 쓸 수 있을 때만', () => {
    const b: Block = { ...makeBlock('number'), at: { x: 0, y: 0, w: 4, h: 6 }, link: 'arrow', effect: 'fade', when: 'click', look: 'bold' }
    const ring = swapBlock(b, 'ring')
    expect(ring).toMatchObject({ id: b.id, at: b.at, link: 'arrow', effect: 'fade', when: 'click', look: 'bold' })
    // 핵심 숫자는 강조 바탕을 쓰지 않는다
    expect(swapBlock(b, 'kpi').look).toBeUndefined()
    const v = { ...makeBlock('kpi'), variant: 'cards' }
    expect(swapBlock(v, 'number').variant).toBeUndefined()
    const bars = { ...makeBlock('bars'), variant: 'columns' }
    expect(swapBlock(bars, 'share').variant).toBeUndefined()
  })

  it('판에서 바꾸면 같은 자리에서 바뀌고, 넓어야 하는 컴포넌트는 옆이 막혀 있으면 까닭을 알린다', () => {
    const H = composeAreaH({ fields: { title: '제목' } } as never)
    const cyc = { ...makeBlock('cycle'), id: 'c', items: full('cycle').items.slice(0, 4), at: { x: 0, y: 0, w: 6, h: 12 } }
    const blocks = [cyc, { ...makeBlock('text'), id: 't', fields: { body: '옆에 선 글' }, at: { x: 6, y: 0, w: 6, h: 12 } }]
    const next = swapIn(blocks, 'c', 'flow', H)
    expect(next?.find((x) => x.id === 'c')).toMatchObject({ type: 'flow', at: { x: 0, y: 0 } })
    // 단계 흐름은 슬라이드 너비를 혼자 쓴다
    expect(swapIssue(blocks, 'c', 'process', H)).toMatchObject({ kind: 'solo', type: 'process' })
    // 작은 컴포넌트를 큰 컴포넌트로: 큰 컴포넌트가 다 찼으면
    const many = Array.from({ length: MAX_LARGE }, (_, i) => ({ ...makeBlock('number'), id: `n${i}` }))
    const crowded = [...many, { ...makeBlock('heading'), id: 'h' }].map((x, i) => ({ ...x, at: { x: 0, y: i, w: 12, h: 1 } }))
    expect(swapIssue(crowded, 'h', 'message', H)).toEqual({ kind: 'large' })
  })

  it('AI 제안에는 바꾸기를 열지 않는다(사람만)', () => {
    const ops = readFileSync(new URL('../../ai/ops.ts', import.meta.url), 'utf8')
    expect(ops).not.toMatch(/swapBlock|swapIn|swapChoices/)
  })
})

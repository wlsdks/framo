import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { autoPlace, BLOCKS, makeBlock } from '../deck/blocks'
import { makeSlide } from '../deck/generate'
import { createSampleDeck } from '../deck/sample'
import { CYCLE_GAP_EM, CYCLE_LABEL_EM, cycleFit, cycleLabelBoxes, cycleRing } from './blocks/Cycle'
import { cssSource } from './cssSource'
import { SlideCanvas } from './SlideCanvas'

function render(steps: string[], opts: { mode?: 'final' | 'edit'; center?: string; metas?: string[] } = {}): string {
  const block = makeBlock('cycle')
  const items = steps.map((title, i) => ({ ...block.items[i % block.items.length], id: `item-${i}`, title, meta: opts.metas?.[i] ?? '' }))
  const blocks = autoPlace([], { ...block, fields: { ...block.fields, center: opts.center ?? '한 달 마감' }, items })!
  const slide = { ...makeSlide('compose'), blocks }
  return renderToStaticMarkup(createElement(SlideCanvas, { deck: createSampleDeck(), slide, mode: opts.mode ?? 'final' }))
}

/** Cycle.tsx가 만드는 CSS 식(min, max, calc, cqw, cqh, em, var(--cy-r))을 판 크기와 글자 크기로 풀어 본다 */
function solve(expr: string, env: { w: number; h: number; em: number; r?: number }): number {
  const js = expr
    .replace(/var\(--cy-r\)/g, `(${env.r ?? Number.NaN})`)
    .replace(/([\d.]+)cqw/g, (_, v) => `(${v} * ${env.w / 100})`)
    .replace(/([\d.]+)cqh/g, (_, v) => `(${v} * ${env.h / 100})`)
    .replace(/([\d.]+)em/g, (_, v) => `(${v} * ${env.em})`)
    .replace(/\bcalc\(/g, '(')
    .replace(/\bmin\(/g, 'Math.min(')
    .replace(/\bmax\(/g, 'Math.max(')
  return new Function(`return (${js})`)() as number
}

const count = (html: string, text: string) => html.split(text).length - 1

describe('순환', () => {
  it('단계를 차례로 번호를 붙여 늘어놓고, 시계 방향으로 고리 위의 자리를 준다 (짝수면 12시에서 반 칸 돈 곳부터)', () => {
    const html = render(['양식 보내기', '숫자 모으기', '빈 칸 점검', '늦은 이유 고치기'])
    expect(html.indexOf('양식 보내기')).toBeLessThan(html.indexOf('숫자 모으기'))
    expect(html.indexOf('숫자 모으기')).toBeLessThan(html.indexOf('빈 칸 점검'))
    expect(html.indexOf('빈 칸 점검')).toBeLessThan(html.indexOf('늦은 이유 고치기'))
    expect(html).toMatch(/>01<[\s\S]*>02<[\s\S]*>03<[\s\S]*>04</)
    // 넷이면 1시 반부터: 12시와 6시에 이름표가 서면 위아래 이름표의 높이가 고리 지름에 더해져 고리가 작아진다
    expect(html).toMatch(/is-r" style="--a:45deg[\s\S]*is-r" style="--a:135deg[\s\S]*is-l" style="--a:225deg[\s\S]*is-l" style="--a:315deg/)
    expect(html).toContain('한 달 마감')
    // 구간마다 선 하나, 단계 점 하나, 머리 하나
    expect(count(html, 'bk-cy-line')).toBe(4)
    expect(count(html, 'bk-cy-port')).toBe(4)
    expect(count(html, 'bk-cy-tip')).toBe(4)
  })

  it('발표할 때 빈 단계는 건너뛰고, 번호와 고리 자리도 채운 단계로만 나눈다', () => {
    const html = render(['양식 보내기', '', '빈 칸 점검'])
    expect(html).toContain('data-steps="2"')
    expect(html).toMatch(/>01<[\s\S]*양식 보내기[\s\S]*>02<[\s\S]*빈 칸 점검/)
    expect(html).not.toContain('>03<')
    expect(html).toMatch(/--a:90deg[\s\S]*--a:270deg/)
  })

  it('편집할 때는 빈 단계도 안내와 함께 자리를 지킨다', () => {
    const html = render(['양식 보내기', '', ''], { mode: 'edit' })
    expect(html).toContain('data-steps="3"')
    expect(html).toContain('>03<')
  })

  it('편집할 때도 적어 둔 설명은 고리 크기 어림에 넣는다 (설명 칸은 접어 두는 칸이라도 적은 항목은 그려진다)', () => {
    const steps = ['양식 보내기', '숫자 모으기', '빈 칸 점검', '늦은 이유 고치기']
    const metas = ['마감 5일 전에 보내요', '부서마다 3일 안에 채워요', '', '다음 달 양식에 반영해요']
    const fit = (html: string) => html.match(/--cy-fit:([^;"]*)/)?.[1]
    // 발표할 때와 같은 글이 그려지니 어림도 같아야 한다: 편집할 때 설명을 빼고 어림하면 고리가 커져 이름표가 칸 위아래로 넘쳤다
    expect(fit(render(steps, { mode: 'edit', metas }))).toBe(fit(render(steps, { mode: 'final', metas })))
    // 설명을 하나도 적지 않았으면 설명 자리를 어림하지 않는다
    expect(fit(render(steps, { mode: 'edit' }))).toBe(fit(render(steps, { mode: 'final' })))
  })

  it('가운데 이름을 비우고 발표하면 고리 가운데를 비운다', () => {
    expect(render(['양식 보내기', '숫자 모으기', '빈 칸 점검'], { center: '' })).not.toContain('bk-cy-c')
  })

  it('모양은 고르지 않는다: 칸 모양에 따라 고리, 가로, 세로를 스스로 고른다 (세로 모양을 한 줄 전체에 두면 오른쪽이 통째로 비었다)', () => {
    expect(BLOCKS.cycle.variants).toBeUndefined()
    const css = cssSource(new URL('./styles/blocks/cycle.css', import.meta.url)).replace(/\/\*[\s\S]*?\*\//g, '')
    expect(css).not.toContain('is-list')
  })

  it('고리의 구간은 단계 점에서 시작해 다음 단계 조금 앞의 머리까지 그어지고, 마지막 구간은 첫 단계로 돌아온다', () => {
    for (const n of [3, 4, 5, 6]) {
      const { spots, arcs } = cycleRing(n)
      expect(spots).toHaveLength(n)
      expect(spots[0]).toMatchObject({ angle: 0, side: 't' })
      arcs.forEach((a, i) => {
        expect(a.from).toBe(spots[i].angle)
        const next = i === n - 1 ? 360 : spots[i + 1].angle
        expect(a.tip, `${n}단계의 ${i + 1}번째 구간`).toBeLessThan(next)
        expect(a.tip).toBeGreaterThan(next - 10)
        expect(a.d).toMatch(/^M [-\d.]+ [-\d.]+ A 100 100 0 [01] 1 [-\d.]+ [-\d.]+$/)
      })
    }
    expect(cycleRing(4).spots.map((p) => p.side)).toEqual(['t', 'r', 'b', 'l'])
    expect(cycleRing(3).spots.map((p) => p.side)).toEqual(['t', 'r', 'l'])
    // 고리의 위 반에 선 이름표는 점 위로, 아래 반은 점 아래로 걸린다: 다섯 단계의 아래쪽 이름표가 위로 고리를 덮지 않게
    expect(cycleRing(6).spots.map((p) => p.fy)).toEqual([1, 1, 0, 0, 0, 1])
    expect(cycleRing(5).spots.map((p) => p.fy)).toEqual([1, 1, 0, 0, 1])
  })

  it('이름표 크기 어림: 긴 이름은 한도에서 줄을 바꿔 높아지고, 설명이 있으면 그만큼 높다', () => {
    const [short, long, withMeta] = cycleLabelBoxes([
      { title: '계획', meta: '' },
      { title: '부서마다 숫자를 모아 한 양식에 채워요', meta: '' },
      { title: '계획', meta: '목표와 방법을 정해요' },
    ])
    expect(short.w).toBeLessThan(long.w)
    expect(long.w).toBeLessThanOrEqual(CYCLE_LABEL_EM)
    expect(long.h).toBeGreaterThan(short.h)
    expect(withMeta.h).toBeGreaterThan(short.h)
    expect(withMeta.w).toBeGreaterThan(short.w)
  })

  it('고리는 이름표까지 판 안에 드는 가장 큰 크기이고, 그림의 위아래와 좌우 끝이 판 가운데에 온다', () => {
    const em = 30
    const g = CYCLE_GAP_EM * em
    const labels = [
      { title: '양식 보내기', meta: '마감 5일 전에 보내요' },
      { title: '숫자 모으기', meta: '부서마다 3일 안에 채워요' },
      { title: '빈 칸 점검', meta: '' },
      { title: '늦은 이유 고치기', meta: '다음 달 양식에 반영해요' },
      { title: '공유', meta: '배운 것을 나눠요' },
      { title: '정리', meta: '' },
    ]
    for (const n of [3, 4, 5, 6]) {
      for (const [w, h] of [
        [1680, 705],
        [1100, 705],
        [820, 600],
      ]) {
        const { spots } = cycleRing(n)
        const boxes = cycleLabelBoxes(labels.slice(0, n))
        const fit = cycleFit(spots, boxes)
        const r = Math.min(8 * em, Math.max(2.6 * em, solve(fit.fit, { w, h, em })))
        if (r <= 2.6 * em) continue
        const dx = solve(fit.dx, { w, h, em, r })
        const dy = solve(fit.dy, { w, h, em, r })
        const cx = w / 2 + dx
        const cy = h / 2 + dy
        let [top, bottom, left, right] = [cy - r, cy + r, cx - r, cx + r]
        spots.forEach((p, i) => {
          const a = (p.angle * Math.PI) / 180
          const ax = cx + (r + g) * Math.sin(a)
          const ay = cy - (r + g) * Math.cos(a)
          const bw = boxes[i].w * em
          const bh = boxes[i].h * em
          left = Math.min(left, ax - p.fx * bw)
          right = Math.max(right, ax + (1 - p.fx) * bw)
          top = Math.min(top, ay - p.fy * bh)
          bottom = Math.max(bottom, ay + (1 - p.fy) * bh)
        })
        const at = `${n}단계, ${w}×${h}`
        // 판 안에 든다
        expect(top, at).toBeGreaterThanOrEqual(-0.5)
        expect(left, at).toBeGreaterThanOrEqual(-0.5)
        expect(bottom, at).toBeLessThanOrEqual(h + 0.5)
        expect(right, at).toBeLessThanOrEqual(w + 0.5)
        // 그림이 판 가운데에 온다
        expect(Math.abs(top - (h - bottom)), at).toBeLessThan(1)
        expect(Math.abs(left - (w - right)), at).toBeLessThan(1)
        // 가장 큰 크기: 위아래나 좌우 가운데 한쪽은 판에 닿는다(크기 한도 8em에 닿은 때는 빼고)
        if (r < 8 * em) expect(Math.min(top, left), at).toBeLessThan(1)
      }
    }
  })

  it('고리 가운데를 옮기는 식은 반지름을 정하는 판에 둔다 (바깥 상자에 두면 아직 없는 --cy-r을 찾아 식 전체가 무효다)', () => {
    const html = render(['양식 보내기', '숫자 모으기', '빈 칸 점검'])
    expect(html).toMatch(/class="bk-cy-stage" style="--cy-dx:calc\([^"]*var\(--cy-r\)[^"]*;--cy-dy:calc\(/)
    expect(html).toMatch(/class="bk-cy" data-steps="3" style="--cy-fit:min\(/)
    const css = cssSource(new URL('./styles/blocks/cycle.css', import.meta.url)).replace(/\/\*[\s\S]*?\*\//g, '')
    // 반지름은 판(.bk-cy-stage)에서 정한다
    expect(css).toMatch(/\.bk-cy-stage\s*\{[^}]*--cy-r:\s*clamp\(/)
  })

  it('편집 화면에서도 고리의 단계는 판 위의 자리로 찍힌다 (항목을 relative로 두는 edit.css를 이긴다)', () => {
    const css = cssSource(new URL('./styles/blocks/cycle.css', import.meta.url)).replace(/\/\*[\s\S]*?\*\//g, '')
    const ring = css.slice(css.indexOf('@container style(--cy-ring: 1)'))
    expect(ring).toMatch(/\.slide\.m-edit \.bk-cy-step\.it\s*\{\s*position:\s*absolute;/)
  })
})

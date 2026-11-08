// 부품: 순환 (cycle). 모양은 styles/blocks/cycle.css, 움직임은 motion/engine.ts의 nativeAuto

import { Fragment, type CSSProperties } from 'react'
import { BLOCKS } from '../../deck/blocks'
import { isBlankItem, readField } from '../../deck/fields'
import { hintFor } from '../../deck/layouts'
import { cx } from '../../lib/cx'
import { useSlide } from '../context'
import { IT, ItemTools, T } from '../fields'

/** 화살촉 끝과 다음 단계 점(가운데) 사이의 각(도). 반지름 120~240px에서 점 가장자리와 5~15px 떨어진다 */
const TIP_GAP = 5
/** 구간 선은 화살촉 끝보다 이만큼(도) 앞에서 멈춘다: 선 끝이 꽉 찬 머리 밑에 숨어 뾰족한 끝으로 삐져나오지 않게 */
const UNDER = 2
/** 이름표와 고리 사이(이름 글자 em). cycle.css의 --cy-gap과 같다 */
export const CYCLE_GAP_EM = 0.7

const round = (v: number) => Math.round(v * 100) / 100
const rad = (deg: number) => (deg * Math.PI) / 180
/** 12시에서 시계 방향으로 deg도 돈 고리 위의 점 (반지름 100, y는 아래로) */
const at = (deg: number): [number, number] => [round(100 * Math.sin(rad(deg))), round(-100 * Math.cos(rad(deg)))]

export type CycleSide = 't' | 'r' | 'b' | 'l'
/**
 * 고리 위 단계 하나의 자리. 이름표는 점에서 고리 바깥쪽으로 --cy-gap 떨어진 곳(닻)에 서고, fx, fy는 닻이 이름표 상자의 어디에
 * 걸리는지다(0은 왼쪽·위 끝, 1은 오른쪽·아래 끝). 오른쪽 반은 왼쪽 끝이, 왼쪽 반은 오른쪽 끝이 닻에 걸리고(글이 고리에서 멀어지는 쪽으로),
 * 고리의 위 반에 선 이름표는 아래 끝이, 아래 반은 위 끝이 걸린다: 가운데를 걸면 다섯 단계의 아래쪽 이름표가 위로 고리를 덮었다
 */
export type CycleSpot = { angle: number; side: CycleSide; fx: number; fy: number }

/**
 * 고리 위 단계 n개의 자리와 구간: 12시에서 from도 돈 곳에서 시작해 시계 방향으로 같은 간격. 구간은 단계 점(가운데)에서 시작해
 * 다음 단계 점 조금 앞의 화살촉(tip, 도)까지 그어진다. 마지막 구간은 첫 단계로 돌아온다
 */
export function cycleRing(n: number, from = 0): { spots: CycleSpot[]; arcs: { d: string; from: number; tip: number }[] } {
  const step = 360 / Math.max(1, n)
  const spots = Array.from({ length: n }, (_, i): CycleSpot => {
    const angle = round(from + i * step)
    const sin = Math.sin(rad(angle))
    const cos = Math.cos(rad(angle))
    const side: CycleSide = Math.abs(sin) < 0.35 ? (cos > 0 ? 't' : 'b') : sin > 0 ? 'r' : 'l'
    const fx = side === 'r' ? 0 : side === 'l' ? 1 : 0.5
    const fy = side === 't' ? 1 : side === 'b' ? 0 : cos > 0.2 ? 1 : cos < -0.2 ? 0 : 0.5
    return { angle, side, fx, fy }
  })
  const arcs = spots.map((p, i) => {
    const tip = round(from + (i + 1) * step - TIP_GAP)
    const to = tip - UNDER
    const [x1, y1] = at(p.angle)
    const [x2, y2] = at(to)
    const large = to - p.angle > 180 ? 1 : 0
    return { d: `M ${x1} ${y1} A 100 100 0 ${large} 1 ${x2} ${y2}`, from: p.angle, tip }
  })
  return { spots, arcs }
}

/** 글 너비 어림(이름 글자 크기 em): 한글과 전각은 1, 그 밖은 0.58, 띄어쓰기 0.3 */
function widthEm(text: string): number {
  let w = 0
  for (const ch of text) w += ch === ' ' ? 0.3 : /[ᄀ-ᇿ　-鿿가-힯＀-￯]/.test(ch) ? 1 : 0.58
  return w
}

/** 이름표 한 줄의 너비 한도(이름 글자 em). 넘으면 줄을 바꾼다. cycle.css의 고리 이름표 max-width와 같다 */
export const CYCLE_LABEL_EM = 9
/** 설명 글자는 이름보다 한 단계 작다(고리에서 30/36, cycle.css) */
const META_K = 30 / 36
/** 이름 앞의 번호('01', 이름의 26/36인 두 자리)와 번호 뒤 틈(cycle.css의 0.4em) */
const NUM_EM = 1.3

/**
 * 고리 둘레의 이름표마다 차지할 너비와 높이(이름 글자 em) 어림: 번호와 이름(번호는 이름 첫 줄 앞에, 줄 수), 설명(줄 수). 재지 않고 어림하는
 * 것은 반지름이 이 값에 따라 정해지고 이름표 자리는 반지름에 따라 정해져서, 재면 서로를 따라 움직이기 때문이다. 어림이 모자라
 * 넘치거나 겹치면 글자 맞추기(fitBlocks)가 단계로 줄인다
 */
export function cycleLabelBoxes(labels: { title: string; meta: string }[]): { w: number; h: number }[] {
  return labels.map(({ title, meta }) => {
    const tw = widthEm(title)
    const mw = widthEm(meta) * META_K
    const tl = Math.max(1, Math.ceil(tw / (CYCLE_LABEL_EM - NUM_EM)))
    const ml = meta ? Math.ceil(mw / CYCLE_LABEL_EM) : 0
    return { w: round(Math.max(1.2, Math.min(CYCLE_LABEL_EM, Math.max(NUM_EM + tw, mw)))), h: round(tl * 1.35 + (ml ? 0.15 + ml * 1.17 : 0)) }
  })
}

/** 고리 가운데에서 한쪽으로 뻗은 거리: a × 반지름 + b(이름 글자 em) */
type Reach = { a: number; b: number }

/** 같은 쪽으로 뻗은 것 가운데 다른 것보다 반지름에도, 더하는 길이에도 멀지 않은 것은 뺀다 (반지름은 0 이상) */
function farthest(list: Reach[]): Reach[] {
  return list.filter((p, i) => !list.some((q, j) => j !== i && q.a >= p.a - 1e-6 && q.b >= p.b - 1e-6 && (q.a > p.a + 1e-6 || q.b > p.b + 1e-6 || j < i)))
}

const em = (v: number) => `${round(Math.abs(v))}em`
const reachCss = (p: Reach) => {
  const r = Math.abs(p.a - 1) < 1e-6 ? 'var(--cy-r)' : `${round(p.a)} * var(--cy-r)`
  return p.b ? `${r} ${p.b < 0 ? '-' : '+'} ${em(p.b)}` : r
}

/**
 * 고리의 반지름과 가운데 자리를 칸에 맞추는 CSS 식. 단계마다 이름표가 고리 가운데에서 위, 아래, 왼쪽, 오른쪽으로 얼마나 뻗는지
 * (반지름에 따라 늘어나는 몫과 이름표 크기)를 세어, 마주 보는 두 쪽(위와 아래, 왼쪽과 오른쪽)의 합이 판(--cy-stage, 100cqw·100cqh)을
 * 넘지 않는 가장 큰 반지름(fit)을 고른다. 그 반지름에서 그림(고리와 이름표)의 위아래, 좌우 끝이 판 가운데에 오도록 고리 가운데를
 * 옮긴다(dx, dy): 세 단계는 위에 이름표 하나, 아래는 고리 옆에 둘이라 고리를 가운데에 두면 위만 차서 고리를 키우지 못했다
 */
export function cycleFit(spots: CycleSpot[], boxes: { w: number; h: number }[]): { fit: string; dx: string; dy: string } {
  const g = CYCLE_GAP_EM
  const ring: Reach = { a: 1, b: 0 }
  const sides = { right: [ring], left: [ring], up: [ring], down: [ring] }
  spots.forEach((p, i) => {
    const box = boxes[i] ?? { w: 0, h: 0 }
    const s = Math.sin(rad(p.angle))
    const c = Math.cos(rad(p.angle))
    sides.right.push({ a: s, b: s * g + (1 - p.fx) * box.w })
    sides.left.push({ a: -s, b: -s * g + p.fx * box.w })
    sides.up.push({ a: c, b: c * g + p.fy * box.h })
    sides.down.push({ a: -c, b: -c * g + (1 - p.fy) * box.h })
  })
  const right = farthest(sides.right)
  const left = farthest(sides.left)
  const up = farthest(sides.up)
  const down = farthest(sides.down)
  const terms = new Set<string>()
  const pair = (one: Reach[], other: Reach[], room: string) => {
    for (const p of one) {
      for (const q of other) {
        const a = p.a + q.a
        // 반지름에 거의 따라 늘지 않는 짝(위아래 끝의 이름표 둘)은 반지름을 정하지 않는다: 넘치면 글자 맞추기가 줄인다
        if (a < 0.3) continue
        const b = p.b + q.b
        const less = b ? ` ${b < 0 ? '+' : '-'} ${em(b)}` : ''
        terms.add(Math.abs(a - 1) < 1e-6 ? `${room}${less}` : `(${room}${less}) / ${round(a)}`)
      }
    }
  }
  pair(right, left, '100cqw')
  pair(up, down, '100cqh')
  const most = (list: Reach[]) => (list.length > 1 ? `max(${list.map(reachCss).join(', ')})` : reachCss(list[0]))
  return {
    fit: terms.size ? `min(${[...terms].join(', ')})` : '8em',
    // 뺄 쪽은 괄호로 묶는다: 이름표 하나만 남으면 max() 없이 '반지름 + 길이'라서, 묶지 않으면 길이를 빼지 않고 더했다
    dx: `calc((${most(left)} - (${most(right)})) / 2)`,
    dy: `calc((${most(up)} - (${most(down)})) / 2)`,
  }
}

/**
 * 순환: 단계를 차례로 거쳐 처음으로 돌아오는 고리(매달 도는 개선 주기, 운영 절차). 흐름과 달리 끝이 처음에 이어지는 것이 요점이다.
 * 칸에 따라 짜임을 바꾼다(cycle.css): 넓고 높은 칸은 고리 둘레에 단계를 12시부터 시계 방향으로(고리, 기본), 넓고 낮은 칸은 단계를
 * 왼쪽에서 오른쪽으로 놓고 위로 돌아가는 선(가로), 좁은 칸은 위에서 아래로 놓고 왼쪽의 괄호 선(⊏)으로 처음 단계에 돌아간다(세로).
 * 발표할 때 빈 단계는 건너뛴다. 이름표 크기 어림은 발표할 때는 적은 글, 편집할 때는 보이는 안내 문구로 한다
 */
export function Cycle() {
  const { slide, meta, mode, folds } = useSlide()
  const all = slide.items.slice(0, BLOCKS.cycle.items!.max).map((item, i) => ({ item, i }))
  const shown = mode === 'final' ? all.filter(({ item }) => !isBlankItem(item)) : all
  // 설명은 접어 두는 칸이라 적은 항목에만 그려진다(편집기에서 '칸 더하기'로 열면 빈 항목도 안내 문구로). 편집할 때 접혔다고 설명을
  // 통째로 빼고 어림하면, 적어 둔 설명이 그려지는데도 고리가 그만큼 커져 이름표가 칸 위아래로 넘쳤다
  const opened = mode !== 'final' && !folds?.has('items.meta')
  const seen = (k: 'title' | 'meta', i: number) => {
    const typed = (slide.items[i]?.[k] ?? '').trim()
    return typed || mode === 'final' ? typed : hintFor(slide.layout, slide.hints, k, k, i)
  }
  // 단계가 짝수면 12시가 아니라 반 칸 앞(넷이면 10시 반)에서 시작한다: 12시와 6시에 이름표가 서면 위아래 이름표의 높이가 고리 지름에
  // 더해져, 판을 혼자 써도 고리가 높이에 묶여 본문 너비의 절반만 쓰고 작았다(사용자). 비스듬히 서면 이름표가 고리 옆으로 비켜서
  // 같은 높이에 고리가 1.4배쯤 커진다. 첫 단계는 왼쪽 위: 반 칸 뒤(1시 반)에서 시작하면 01이 오른쪽 위, 04가 왼쪽 위라 04부터
  // 읽혔다(검수). 홀수는 맨 위 하나가 아래 둘과 짝을 이뤄 그대로 12시에서
  const { spots, arcs } = cycleRing(shown.length, shown.length % 2 === 0 ? -180 / shown.length : 0)
  const labels = shown.map(({ i }) => ({ title: seen('title', i), meta: opened || slide.items[i]?.meta.trim() ? seen('meta', i) : '' }))
  const fit = cycleFit(spots, cycleLabelBoxes(labels))
  const center = mode !== 'final' || !!readField(slide, meta, 'center').trim()
  const angle = (deg: number) => ({ '--a': `${deg}deg` }) as CSSProperties
  return (
    <div
      className="bk-cy"
      data-steps={shown.length}
      style={{ '--cy-fit': fit.fit } as CSSProperties}
    >
      <T k="heading" as="h3" className="bk-h" fit={[18, 32]} multiline />
      {/* 고리 가운데를 옮기는 식은 반지름(--cy-r)을 정하는 판에 둔다: 사용자 속성 안의 var()는 그 속성을 정한 요소에서 풀려서,
          바깥 상자에 두면 아직 없는 --cy-r을 찾아 식 전체가 무효가 되었다 */}
      <div className="bk-cy-stage" style={{ '--cy-dx': fit.dx, '--cy-dy': fit.dy } as CSSProperties}>
        <svg className="bk-cy-ring" viewBox="-100 -100 200 200" aria-hidden="true">
          {arcs.map((a, n) => (
            <path key={n} className="bk-cy-line" d={a.d} pathLength="100" />
          ))}
        </svg>
        <span className="bk-cy-marks" aria-hidden="true">
          {arcs.map((a, n) => (
            <Fragment key={n}>
              <span className="bk-cy-port" style={angle(a.from)} />
              <span className="bk-cy-tip" style={angle(a.tip)} />
            </Fragment>
          ))}
        </span>
        {center && (
          <div className="bk-cy-mid">
            <T k="center" className="bk-cy-c" multiline />
          </div>
        )}
        <ol className="bk-cy-list">
          {shown.map(({ item, i }, n) => (
            <li
              key={item.id}
              className={cx('it bk-cy-step', `is-${spots[n].side}`)}
              style={{ ...angle(spots[n].angle), '--fx': spots[n].fx, '--fy': spots[n].fy } as CSSProperties}
            >
              <span className="bk-cy-mark">
                <span className="bk-cy-rail" aria-hidden="true" />
                <span className="bk-cy-n">{String(n + 1).padStart(2, '0')}</span>
                <span className="bk-cy-to" aria-hidden="true" />
              </span>
              <div className="bk-cy-text">
                <IT i={i} k="title" className="bk-cy-t" multiline />
                <IT i={i} k="meta" className="bk-cy-m" />
              </div>
              <ItemTools i={i} />
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}

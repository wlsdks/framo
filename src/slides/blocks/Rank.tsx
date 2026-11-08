// 부품: 순위 바뀌기 (rank). 모양은 styles/blocks/rank.css, 움직임은 motion/engine.ts의 nativeAuto

import type { CSSProperties } from 'react'
import { BLOCKS } from '../../deck/blocks'
import { isBlankItem } from '../../deck/fields'
import { rowHint } from '../../deck/layouts'
import { cx } from '../../lib/cx'
import { useSlide } from '../context'
import { IT, ItemTools, T } from '../fields'

/** '3', '3위', ' 3 ' 같은 글에서 순위(1 이상의 정수)를 읽는다. 못 읽으면 null(새로 들어온 항목) */
export function rankOf(text: string): number | null {
  const m = text.match(/\d+/)
  if (!m) return null
  const v = Number(m[0])
  return Number.isInteger(v) && v >= 1 && v <= 999 ? v : null
}

/** 지난 순위에서 지금 순위로 바뀐 만큼의 표시: 오르면 ▲, 내리면 ▼, 같으면 –, 처음이면 '새로' */
export function rankMove(was: number | null, now: number): { text: string; dir: 'up' | 'down' | 'same' | 'new' } {
  if (was === null) return { text: '새로', dir: 'new' }
  if (was === now) return { text: '–', dir: 'same' }
  return was > now ? { text: `▲${was - now}`, dir: 'up' } : { text: `▼${now - was}`, dir: 'down' }
}

/**
 * 지난 순위의 자리: 지금 순서의 항목 k가 지난 목록의 몇째 줄에 있었는지(없으면 null). 지난 순위가 같으면 지금 순서대로.
 * 지난 목록은 적은 순위의 차례로 위에서부터 채운다(빠진 순위가 있어도 줄을 비우지 않는다. 번호는 적은 순위 그대로 보인다)
 */
export function rankSlots(wasRanks: (number | null)[]): (number | null)[] {
  const order = wasRanks
    .map((r, k) => ({ r, k }))
    .filter((x): x is { r: number; k: number } => x.r !== null)
    .sort((a, b) => a.r - b.r || a.k - b.k)
  const slots: (number | null)[] = wasRanks.map(() => null)
  order.forEach((x, a) => (slots[x.k] = a))
  return slots
}

/** 잇는 선의 높이 단위(viewBox): 줄 하나가 10. 줄의 높이가 모두 같아서(rank.css의 1fr 줄) 줄 가운데가 곧 선의 끝이다 */
const ROW = 10

/**
 * 순위 바뀌기: 지난 순위(왼쪽, 옅게)와 지금 순위(오른쪽)를 나란히 두고, 같은 항목을 가는 선으로 잇는다. 선이 기울어진 만큼이
 * 오르내린 만큼이라 표를 읽지 않아도 무엇이 올랐는지 보인다. 강조할 항목(기본은 지금 1위)의 선과 이름만 강조색.
 * 쓰는 사람은 지금 순서대로 이름을 적고 항목마다 지난 순위만 적는다(새로 들어온 항목은 비운다): 순위를 두 번 적거나 줄을 맞출 일이 없다.
 * 좁은 칸에서는 지금 순위 목록 하나에 바뀐 만큼(▲3)만 둔다(rank.css). 발표할 때는 지난 순서로 서 있던 항목이 지금 자리로
 * 옮겨 가며 선이 그어진다(engine.ts): 순위가 바뀌는 움직임 자체가 할 말이다
 */
export function Rank() {
  const { slide, mode } = useSlide()
  const all = slide.items.slice(0, BLOCKS.rank.items!.max).map((it, i) => ({ it, i }))
  const shown = mode === 'final' ? all.filter(({ it }) => !isBlankItem(it)) : all
  const n = shown.length
  // 편집할 때 아직 아무것도 적지 않은 항목은 안내 예시로 그린다(넣자마자 어떤 그림인지 보이게). 이름을 적은 항목의 빈 지난 순위는 '새로 들어온 항목'
  const hinted = (it: (typeof shown)[number]['it'], i: number, k: 'title' | 'meta') =>
    mode !== 'final' && isBlankItem(it) ? rowHint(slide.layout, slide.hints, it, k, i) : it[k]
  const names = shown.map(({ it, i }) => hinted(it, i, 'title').trim())
  const was = shown.map(({ it, i }) => rankOf(hinted(it, i, 'meta')))
  const slots = rankSlots(was)
  const hl = slide.options.highlight === -1 ? -1 : Number.isInteger(slide.options.highlight) ? Math.max(0, Math.min(n - 1, slide.options.highlight as number)) : 0
  // 지난 목록: 지난 순위가 있는 항목을 그 차례로
  const past = shown.map((_, k) => k).filter((k) => slots[k] !== null).sort((a, b) => slots[a]! - slots[b]!)
  const H = Math.max(1, n) * ROW
  return (
    <div className={cx('bk-ra', past.length === 0 && 'is-fresh')} data-n={n} style={{ '--n': n } as CSSProperties}>
      <T k="label" as="p" className="bk-ra-l" />
      <div className="bk-ra-board">
        <T k="from" as="p" className="bk-ra-when is-from" oneLine />
        <T k="to" as="p" className="bk-ra-when is-to" oneLine />
        <ol className="bk-ra-was">
          {past.map((k) => (
            <li key={shown[k].it.id} className={cx('bk-ra-wi', k === hl && 'is-hl')} style={{ gridRow: slots[k]! + 1 }}>
              <span className="bk-ra-wn">{was[k]}</span>
              <span className="bk-ra-wt">{names[k]}</span>
            </li>
          ))}
        </ol>
        <svg className="bk-ra-links" viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" aria-hidden="true">
          {shown.map(({ it }, k) => {
            const a = slots[k]
            if (a === null) return null
            const y0 = a * ROW + ROW / 2
            const y1 = k * ROW + ROW / 2
            return <path key={it.id} className={cx('bk-ra-ln', k === hl && 'is-hl')} d={`M 0 ${y0} C 50 ${y0}, 50 ${y1}, 100 ${y1}`} pathLength="100" data-k={k} />
          })}
        </svg>
        <ol className="bk-ra-now">
          {shown.map(({ it, i }, k) => {
            const move = rankMove(was[k], k + 1)
            return (
              <li key={it.id} className={cx('it bk-ra-it', k === hl && 'is-hl')} data-from={slots[k] ?? ''} style={{ gridRow: k + 1 }}>
                <span className="bk-ra-no">{k + 1}</span>
                <IT i={i} k="title" className="bk-ra-t" />
                {mode === 'edit' ? (
                  // 편집할 때는 바뀐 만큼 대신 지난 순위를 적는 칸. 앞에 '지난'을 붙여 이 숫자가 무엇인지 읽힌다
                  <span className="bk-ra-mv is-input">
                    <span className="bk-ra-mk">지난</span>
                    <IT i={i} k="meta" as="span" className="bk-ra-wv" oneLine />
                  </span>
                ) : (
                  <span className={cx('bk-ra-mv', `is-${move.dir}`)}>{move.text}</span>
                )}
                <ItemTools i={i} />
              </li>
            )
          })}
        </ol>
      </div>
    </div>
  )
}

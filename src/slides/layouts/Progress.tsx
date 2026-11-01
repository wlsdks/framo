// 레이아웃: 진행 현황 (progress). 모양은 styles/progress.css

import { isBlankItem } from '../../deck/fields'
import { hintFor } from '../../deck/layouts'
import { cx } from '../../lib/cx'
import { demoOf, useSlide } from '../context'
import { IT, ItemTools } from '../fields'
import { laneOf, noDelayDoing, type Lane } from '../../deck/status'
import { readPercent } from '../../deck/percent'
import { statusOf, STATUS_NAMES, type Status } from '../numbers'
import { Head, useItems } from './parts'

const STATUS_ORDER: Status[] = ['done', 'doing', 'late', 'todo']
const LANE_ORDER: Lane[] = [...STATUS_ORDER, 'unknown']

/**
 * 진행 현황: 과제마다 진행률 막대와 상태. 위에는 상태별 과제 수를 모아 '지연'이 먼저 눈에 들어오게.
 * 상태 칸을 비우면 발표할 때 진행률로 짐작한 상태(100%는 완료, 0%는 예정)를 보여 준다.
 * 상태별 모양은 과제를 상태마다 한 단에 모은다(있는 상태만, 완료 → 진행 중 → 지연 → 예정).
 */
export function Progress() {
  const { slide, mode } = useSlide()
  const items = useItems()
  const final = mode === 'final'
  const demo = demoOf(mode, items, ['value', 'body'])
  const rows = items.map((it, i) => {
    const valueText = demo ? hintFor(slide.layout, slide.hints, 'value', 'value', i) : it.value
    const stateText = demo ? hintFor(slide.layout, slide.hints, 'body', 'body', i) : it.body
    const pct = readPercent(valueText)
    // 편집할 때 상태 칸이 비어 있으면 색을 짐작하지 않는다. 안내 글과 색이 어긋나 보이지 않게
    const status = !final && !demo && !it.body.trim() ? null : statusOf(stateText, pct)
    return { pct, status, lane: laneOf(stateText, pct) }
  })
  const counts = STATUS_ORDER.map((s) => ({ s, n: rows.filter((r) => r.status === s).length })).filter((c) => c.n > 0)
  // 발표할 때 칸을 하나도 채우지 않은 과제(가장 적은 수를 채우려 남긴 빈 칸)는 단에 넣지 않는다: 단을 짐작하면 예정으로 들어가
  // 빈 줄 하나뿐인 '예정 1' 단이 섰다. 과제가 모두 비었으면 머리줄(과제, 상태)도 두지 않는다
  const blank = items.map((it) => final && isBlankItem(it))
  const allBlank = blank.length > 0 && blank.every(Boolean)
  const row = (it: (typeof items)[number], i: number) => {
    const r = rows[i]
    const derived = final && !it.body.trim()
    return (
      <div key={it.id} className={cx('it ps-row', r.status && `is-${r.status}`, noDelayDoing(it.body) && 'has-detail')} style={{ '--p': String(r.pct ?? 0) }}>
        <div className="ps-name">
          <IT i={i} k="title" className="ps-title" />
          <IT i={i} k="meta" className="ps-meta" />
        </div>
        <div className={cx('ps-track', r.pct === null && 'is-unknown')}>
          <span className="ps-fill" />
        </div>
        <IT i={i} k="value" className="ps-pct" oneLine />
        <div className="ps-state">
          {derived ? r.status && <span className="ps-chip">{STATUS_NAMES[r.status]}</span> : <IT i={i} k="body" as="span" className="ps-chip" oneLine />}
        </div>
        <ItemTools i={i} />
      </div>
    )
  }
  if (slide.variant === 'board') {
    // 읽지 못한 상태는 예정이나 완료로 바꾸지 않고 별도 단에 모은다.
    const lanes = LANE_ORDER.map((s) => ({ s, at: items.map((_, i) => i).filter((i) => !blank[i] && rows[i].lane === s) })).filter((l) => l.at.length > 0)
    // 짜임(줄 사이, 진행률 자리)과 부품 높이는 가장 많이 모인 단의 과제 수로 고른다 (progress.css, blocks/sizing.ts)
    const most = Math.max(1, ...lanes.map((l) => l.at.length))
    return (
      <>
        <Head />
        <div className={cx('s-body ps ps-board', demo && 'is-demo')} data-n={items.length} data-rows={most} style={{ '--cols': lanes.length }}>
          {lanes.map((l) => (
            <section key={l.s} className={`ps-lane is-${l.s}`}>
              <p className="ps-lane-h">
                <span className={`ps-count is-${l.s}`}>
                  {l.s === 'unknown' ? '확인 필요' : STATUS_NAMES[l.s]}
                  <b>{l.at.length}</b>
                </span>
              </p>
              {l.at.map((i) => row(items[i], i))}
            </section>
          ))}
        </div>
      </>
    )
  }
  return (
    <>
      <Head />
      <div className={cx('s-body ps', demo && 'is-demo')} data-n={items.length}>
        {/* 머리줄 오른쪽에 상태별 과제 수. 상태가 한 가지뿐이면 셀 필요가 없어 '상태'라고만 */}
        {!allBlank && (
          <div className="ps-row ps-headrow">
            <span className="ps-h">과제</span>
            {counts.length > 1 ? (
              <p className="ps-sum">
                {counts.map((c) => (
                  <span key={c.s} className={`ps-count is-${c.s}`}>
                    {STATUS_NAMES[c.s]}
                    <b>{c.n}</b>
                  </span>
                ))}
              </p>
            ) : (
              <span className="ps-h ps-h-state">상태</span>
            )}
          </div>
        )}
        {items.map(row)}
      </div>
    </>
  )
}

// 부품: 추진 일정 (gantt). 모양은 styles/blocks/gantt.css

import { BLOCKS } from '../../deck/blocks'
import { readField } from '../../deck/fields'
import { hintFor } from '../../deck/layouts'
import { cx } from '../../lib/cx'
import { useSlide } from '../context'
import { IT, ItemTools, T } from '../fields'
import { colsOf, periodRest, spanIn } from '../numbers'
import { useDemo } from './parts'

/**
 * 추진 일정: 기간 칸을 위에 늘어놓고 할 일마다 그 기간에 막대를 긋는다.
 * 지금 칸을 적으면 지난 일은 흐리게, 하는 일은 강조색, 앞으로 할 일은 옅은 강조색으로 나눠 칠한다
 */
export function Gantt() {
  const { slide, meta, mode } = useSlide()
  const { demo, read } = useDemo(['cols'])
  const cols = colsOf(read('cols'))
  // 지금 칸은 적은 값으로만: 기간 칸이 비어 안내로 그리는 동안 지금 칸의 안내('예: 11월')까지 값으로 읽던 때는 편집할 때만 11월이
  // 강조되고 발표에서는 사라져, 지금을 정해 둔 것처럼 보였다(처음 쓰는 사람 검수)
  const now = spanIn(readField(slide, meta, 'now'), cols)?.[0] ?? -1
  const items = slide.items.slice(0, BLOCKS.gantt.items!.max)
  // 기간이 비어 있으면 편집할 때만 안내 기간으로 흐린 막대를 보인다
  const periodOf = (i: number) => items[i].body.trim() || (mode === 'final' ? '' : hintFor(slide.layout, slide.hints, 'body', 'body', i))
  return (
    <div className={cx('bk-gt', demo && 'is-demo')} style={{ '--n': Math.max(1, cols.length), '--now': now }}>
      <T k="heading" as="h3" className="bk-h" fit={[18, 32]} multiline />
      <div className="bk-gt-grid">
        {now >= 0 && <span className="bk-gt-now" aria-hidden="true" />}
        {/* 편집할 때는 비어 있는 왼쪽 위에 지금 칸을 적고, 기간 칸 이름은 그 자리 위에서 고친다(올리거나 누르면 글이 보인다).
            편집 때만 줄이 늘면 발표 화면과 높이가 달라 글자가 작아진다 */}
        <div className="bk-gt-head">
          {mode === 'edit' ? (
            <div className="bk-gt-nowset">
              <span className="bk-gt-sk">지금</span>
              <T k="now" as="span" className="bk-gt-sv" />
            </div>
          ) : (
            <span />
          )}
          <div className="bk-gt-colwrap">
            <div className="bk-gt-cols">
              {cols.map((c, i) => (
                <span key={i} className={cx('bk-gt-c', i === now && 'is-now')}>
                  {c}
                </span>
              ))}
            </div>
            {mode === 'edit' && <T k="cols" className="bk-gt-sv bk-gt-colsed on-chart" oneLine />}
          </div>
        </div>
        <ul className="bk-gt-list" data-n={items.length}>
          {items.map((it, i) => {
            const period = periodOf(i)
            const span = spanIn(period, cols)
            const state = !span || now < 0 ? null : span[1] < now ? 'done' : span[0] > now ? 'later' : 'now'
            // 막대가 기간을 보여 주므로, 기간 글은 칸 이름 말고 더 적은 것이 있을 때만 ('12월 2주~2월 1주', '내년 상반기')
            const more = !span || periodRest(period, cols) !== ''
            return (
              <li key={it.id} className={cx('it bk-gt-row', state && `is-${state}`, !it.body.trim() && 'is-hint')}>
                <div className="bk-gt-label">
                  <IT i={i} k="title" className="bk-gt-t" />
                  <IT i={i} k="meta" className="bk-gt-m" />
                  {more && (mode === 'edit' ? <span className="bk-gt-p">{period}</span> : <IT i={i} k="body" className="bk-gt-p" />)}
                </div>
                {/* 편집할 때 기간은 막대 자리에서 고친다 (위의 기간 칸 이름과 같이) */}
                <div className="bk-gt-track">
                  {span && <span className="bk-gt-bar" style={{ '--s': span[0], '--e': span[1] + 1 }} />}
                  {mode === 'edit' && <IT i={i} k="body" className="bk-gt-p on-chart" oneLine />}
                </div>
                <ItemTools i={i} />
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

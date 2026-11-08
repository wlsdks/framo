// 레이아웃: 일정 (timeline). 모양은 styles/timeline.css

import { highlightOf } from '../../deck/layouts'
import { cx } from '../../lib/cx'
import { useSlide } from '../context'
import { IT, ItemTools } from '../fields'
import { Head, useItems } from './parts'

export function Timeline() {
  const { slide } = useSlide()
  const items = useItems()
  const now = highlightOf(slide)
  return (
    <>
      <Head lead />
      <ol className={cx('s-body tl', now >= 0 && 'has-now')} data-n={items.length}>
        {items.map((it, i) => (
          <li key={it.id} className={cx('it tl-item', now >= 0 && i < now && 'is-done', i === now && 'is-now')}>
            <IT i={i} k="meta" className="tl-meta" oneLine />
            <span className="tl-dot" />
            <IT i={i} k="title" className="tl-title" fit={[10, 16]} />
            <IT i={i} k="body" className="tl-body" multiline />
            <ItemTools i={i} />
          </li>
        ))}
      </ol>
    </>
  )
}

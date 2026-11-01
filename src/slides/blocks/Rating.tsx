// 부품: 평가표 (rating). 모양은 styles/blocks/rating.css

import { BLOCKS } from '../../deck/blocks'
import { hintFor } from '../../deck/layouts'
import { cx } from '../../lib/cx'
import { useSlide } from '../context'
import { IT, ItemTools, T } from '../fields'
import { colsOf, gradeOf, gradesOf, optionIndex, type Grade } from '../numbers'
import { useDemo } from './parts'

/** 평가표의 표시: 꽉 찬 원(좋음), 반 찬 원(보통), 빈 원(나쁨). 보고서에서 흔히 쓰는 하비 볼 */
function GradeMark({ grade, className = 'bk-ev-mk', label }: { grade: Grade; className?: string; label?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {grade === 'good' ? (
        <circle className="bk-ev-fill" cx="16" cy="16" r="14" />
      ) : (
        <>
          <circle className="bk-ev-ring" cx="16" cy="16" r="12.75" />
          {grade === 'mid' && <path className="bk-ev-fill" d="M16 3.25a12.75 12.75 0 0 1 0 25.5z" />}
        </>
      )}
    </svg>
  )
}

const GRADE_NAMES: [Grade, string][] = [
  ['good', '좋음'],
  ['mid', '보통'],
  ['bad', '나쁨'],
]

/**
 * 평가표: 기준마다 여러 안을 좋음, 보통, 나쁨으로. 안 이름을 위에 늘어놓고 기준마다 평가 글을 안 차례로 읽는다.
 * 추천하는 안을 적으면 그 안의 세로 띠와 표시만 강조색 (추진 일정의 지금 칸처럼)
 */
export function Rating() {
  const { slide, mode } = useSlide()
  const { demo, read } = useDemo(['opts', 'pick'])
  const opts = colsOf(read('opts')).slice(0, 5)
  const pick = optionIndex(read('pick'), opts)
  const items = slide.items.slice(0, BLOCKS.rating.items!.max)
  // 평가가 비어 있으면 편집할 때만 안내 평가로 흐린 표시를 보인다
  const marksOf = (i: number) => gradesOf(items[i].body.trim() || (mode === 'final' ? '' : hintFor(slide.layout, slide.hints, 'body', 'body', i)))
  const graded = items.some((_, i) => marksOf(i).some((g) => gradeOf(g)))
  return (
    <div className={cx('bk-ev', demo && 'is-demo')} style={{ '--n': Math.max(1, opts.length), '--pick': pick }}>
      <div className="bk-ev-top">
        <T k="heading" as="h3" className="bk-h" fit={[18, 32]} multiline />
        {graded && (
          <p className="bk-ev-lg">
            {GRADE_NAMES.map(([g, name]) => (
              <span key={g} className="bk-ev-lk">
                <GradeMark grade={g} className="bk-ev-lm" />
                {name}
              </span>
            ))}
          </p>
        )}
      </div>
      <div className="bk-ev-grid">
        {pick >= 0 && <span className="bk-ev-band" aria-hidden="true" />}
        <div className="bk-ev-head">
          {mode === 'edit' ? (
            <div className="bk-ev-pickset">
              <span className="bk-ev-sk">추천</span>
              <T k="pick" as="span" className="bk-ev-sv" />
            </div>
          ) : (
            <span />
          )}
          <div className="bk-ev-colwrap">
            <div className="bk-ev-cols">
              {opts.map((o, j) => (
                <span key={j} className={cx('bk-ev-c', j === pick && 'is-pick')}>
                  {j === pick && <span className="bk-ev-pk">추천</span>}
                  <span className="bk-ev-cn">{o}</span>
                </span>
              ))}
            </div>
            {mode === 'edit' && <T k="opts" className="bk-ev-sv bk-ev-optsed on-chart" oneLine />}
          </div>
        </div>
        <ul className="bk-ev-list" data-n={items.length}>
          {items.map((it, i) => {
            const marks = marksOf(i)
            return (
              <li key={it.id} className={cx('it bk-ev-row', !it.body.trim() && 'is-hint')}>
                <div className="bk-ev-label">
                  <IT i={i} k="title" className="bk-ev-t" />
                  <IT i={i} k="meta" className="bk-ev-m" />
                </div>
                {/* 편집할 때 평가 글은 표시 자리에서 고친다 (위의 안 이름과 같이) */}
                <div className="bk-ev-track">
                  {opts.map((_, j) => {
                    const g = marks[j] ? gradeOf(marks[j]) : null
                    return (
                      <span key={j} className={cx('bk-ev-cell', j === pick && 'is-pick')}>
                        {g ? <GradeMark grade={g} label={marks[j]} /> : marks[j] ? <span className="bk-ev-x">{marks[j]}</span> : null}
                      </span>
                    )
                  })}
                  {mode === 'edit' && <IT i={i} k="body" className="bk-ev-p on-chart" oneLine />}
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

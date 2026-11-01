// 부품: 색 표 (heat). 모양은 styles/blocks/heat.css

import { BLOCKS } from '../../deck/blocks'
import { readField } from '../../deck/fields'
import { hintFor } from '../../deck/layouts'
import { cx } from '../../lib/cx'
import { demoOf, useSlide } from '../context'
import { IT, ItemTools, numberUnits, T, textUnits } from '../fields'
import { colsOf, seriesIn } from '../numbers'
import { ChartKey, Numeral, tokensOf } from './parts'

/** 색 표의 칸 수: 열두 달까지 */
const HEAT_COLS = 12

/**
 * 색 표(히트맵): 줄(지점)과 칸(월)으로 놓인 값을 강조색의 진하기 하나로 칠한다. 가장 낮은 값이 가장 옅고 가장 높은 값이 강조색 그대로.
 * 칸 안 숫자의 색은 칸의 진하기(--t)로 CSS가 고른다(blocks.css). 표 전체에서 견주면 가장 높은 칸과 낮은 칸에 고리를 두르고
 * 위에 어디인지 적는다. 줄마다 견주면(지표마다 단위가 다를 때) 줄마다 제 눈금이라 고리를 두르지 않는다.
 * 색만으로는 값을 읽지 못해서 칸마다 숫자를 그대로 둔다. 그래서 진하기를 읽는 눈금 띠는 두지 않는다
 */
export function Heat() {
  const { slide, meta, mode } = useSlide()
  const items = slide.items.slice(0, BLOCKS.heat.items!.max)
  const final = mode === 'final'
  const demo = demoOf(mode, items)
  const colsText = readField(slide, meta, 'cols').trim()
  const names = colsOf(colsText || (final ? '' : hintFor(slide.layout, slide.hints, 'cols')))
  const rows = items.map((it, i) => tokensOf(demo ? hintFor(slide.layout, slide.hints, 'value', 'value', i) : it.value).slice(0, HEAT_COLS))
  const c = Math.max(1, Math.min(HEAT_COLS, Math.max(names.length, ...rows.map((r) => r.length))))
  const byRow = slide.variant === 'rows'
  // 표 전체에서 견주면 표 전체를, 줄마다 견주면(지표마다 단위가 다를 때) 줄마다 한 기준으로 읽는다
  const unit = readField(slide, meta, 'unit')
  const cellTexts = rows.map((r) => Array.from({ length: c }, (_, j) => r[j] ?? ''))
  const table = seriesIn(cellTexts.flat(), unit)
  const rowSeries = cellTexts.map((r) => seriesIn(r, unit))
  // 범위에서 견줄 수 없는 단위를 섞으면 숫자를 그대로 두고 색 농담은 그리지 않는다.
  const nums = byRow
    ? rowSeries.map((row) => row.ok ? row.values : row.values.map(() => null))
    : cellTexts.map((_, i) => table.ok ? table.values.slice(i * c, (i + 1) * c) : Array.from({ length: c }, () => null))
  const invalid = byRow ? rowSeries.some((row) => !row.ok) : !table.ok
  const rangeOf = (vs: (number | null)[]) => {
    const k = vs.filter((v): v is number => v !== null)
    return k.length ? { lo: Math.min(...k), hi: Math.max(...k) } : null
  }
  const all = rangeOf(nums.flat())
  // 진하기 0~1. 줄의 값이 모두 같으면 가운데 진하기
  const shade = nums.map((r) => {
    const g = byRow ? rangeOf(r) : all
    return r.map((v) => (v === null || !g ? null : g.hi === g.lo ? 0.5 : (v - g.lo) / (g.hi - g.lo)))
  })
  // 가장 높은 칸과 낮은 칸: 같은 값이 여럿이면 먼저 나온 칸. 값이 다 같거나 확인하지 않은 칸이 있으면 전체 순위를 단정하지 않는다.
  const find = (v: number): [number, number] | null => {
    for (let i = 0; i < nums.length; i++) for (let j = 0; j < c; j++) if (nums[i][j] === v) return [i, j]
    return null
  }
  // 단위가 서로 다른 칸이 섞인 표에서 가장 높은 곳과 낮은 곳은 틀린 말이라 짚지 않는다
  const marks = !byRow && table.ok && table.values.every((v) => v !== null) && !!all && all.hi > all.lo
  const top = marks ? find(all.hi) : null
  const low = marks ? find(all.lo) : null
  const is = (p: [number, number] | null, i: number, j: number) => !!p && p[0] === i && p[1] === j
  const rowName = (i: number) => items[i].title.trim() || (final ? '' : hintFor(slide.layout, slide.hints, 'title', 'title', i))
  const where = (p: [number, number] | null) => (p ? [rowName(p[0]), names[p[1]] ?? ''].filter(Boolean).join(' ') : '')
  const topAt = where(top)
  const lowAt = where(low)
  return (
    <div className={cx('bk-cc bk-hm', demo && 'is-demo')} style={{ '--c': c }}>
      <T k="heading" as="h3" className="bk-h" fit={[18, 32]} multiline />
      <ChartKey
        sum={
          mode === 'edit' && invalid ? '같은 범위의 값은 같은 단위로 적어 주세요.' : topAt && lowAt ? (
            <>
              가장 높은 곳 <b>{topAt}</b>
              <span className="bk-hm-low">가장 낮은 곳 {lowAt}</span>
            </>
          ) : undefined
        }
      />
      <div className="bk-hm-grid">
        {names.length > 0 && (
          <div className={cx('bk-hm-head', !colsText && 'is-hint')}>
            <span />
            {Array.from({ length: c }, (_, j) => (
              <span key={j} className="bk-hm-cn">
                {names[j] && (
                  <span className="bk-hm-ct one-line" style={{ '--units': textUnits(names[j]).toFixed(2) }}>
                    {names[j]}
                  </span>
                )}
              </span>
            ))}
            {/* 칸 이름은 이름 줄 위에서 고친다 (올리거나 누르면 글이 보인다). 편집 때만 줄이 늘면 발표 화면과 높이가 달라진다 */}
            {mode === 'edit' && <T k="cols" className="bk-hm-colsed on-chart" oneLine />}
          </div>
        )}
        <ul className="bk-hm-list" data-n={items.length} data-fit-box="">
          {items.map((it, i) => (
            <li key={it.id} className="it bk-hm-row">
              <IT i={i} k="title" className="bk-hm-name" />
              {shade[i].map((v, j) => {
                const text = rows[i][j] ?? ''
                const mark = is(top, i, j) ? 'is-max' : is(low, i, j) ? 'is-min' : null
                return (
                  <span key={j} className={cx('bk-hm-cell', v === null && 'is-empty', mark)} style={v === null ? undefined : ({ '--t': v.toFixed(3) })}>
                    {text && !/^[-−–—]+$/.test(text) && (
                      <span className="bk-hm-v one-line" style={{ '--units': numberUnits(text).toFixed(2) }}>
                        <Numeral text={text} />
                      </span>
                    )}
                    {mark && <span className="bk-hm-ring" aria-hidden="true" />}
                  </span>
                )
              })}
              {/* 줄의 값은 칸들 위에서 고친다 */}
              {mode === 'edit' && <IT i={i} k="value" className="bk-hm-in on-chart" oneLine />}
              <ItemTools i={i} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

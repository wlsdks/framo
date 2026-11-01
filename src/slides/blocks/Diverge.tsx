// 부품: 항목별 증감 (diverge). 모양은 styles/blocks/diverge.css

import { BLOCKS } from '../../deck/blocks'
import { hintFor } from '../../deck/layouts'
import { cx } from '../../lib/cx'
import { demoOf, useSlide } from '../context'
import { IT, ItemTools, T, textUnits } from '../fields'
import { seriesIn } from '../numbers'
import { ChartKey } from './parts'

/**
 * 항목별 증감: 0을 세로 선으로 두고 늘어난 것은 오른쪽, 줄어든 것은 왼쪽으로 뻗는다. 이름은 막대 반대쪽, 0 선 바로 옆에 둔다:
 * 이름을 칸 왼쪽 끝에 모아 두면 0 선이 가운데쯤이라 늘어난 항목은 이름과 막대 사이가 칸의 반 가까이 비었다.
 * 0 선의 자리와 막대의 눈금은 CSS가 칸 너비로 셈한다(diverge.css): 여기서는 양쪽 몫과 이름, 숫자의 폭(em)만 넘긴다.
 * 늘어난 것이 좋은지(매출) 나쁜지(비용)는 장마다 달라서 강조할 쪽을 고른다
 */
export function Diverge() {
  const { slide, mode } = useSlide()
  const items = slide.items.slice(0, BLOCKS.diverge.items!.max)
  const demo = demoOf(mode, items)
  // 그려지는 글: 비어 있으면 편집할 때는 안내 문구가 그 자리에 보인다
  const shown = (i: number, k: 'title' | 'value') => {
    const own = items[i][k].trim()
    return demo || (!own && mode !== 'final') ? hintFor(slide.layout, slide.hints, k, k, i) : own
  }
  // 막대 길이끼리 견주므로 한 기준으로 ('+1.2억', '−4,000만')
  const series = seriesIn(items.map((_, i) => (demo ? hintFor(slide.layout, slide.hints, 'value', 'value', i) : items[i].value)))
  const values = series.ok ? series.values : items.map(() => null)
  const known = values.filter((v): v is number => v !== null)
  const pos = Math.max(0, ...known)
  const neg = Math.max(0, ...known.map((v) => -v))
  const range = pos + neg || 1
  const down = slide.variant === 'down'
  const sides = values.map((v) => (v === null || v === 0 ? null : v > 0 ? 'pos' : 'neg'))
  // 이름의 폭: 줄어든 항목의 이름은 0 선 오른쪽, 나머지(늘어난 것, 빈 것)는 왼쪽에 선다
  const widest = (pick: (i: number) => boolean, k: 'title' | 'value') => Math.max(0, ...items.map((_, i) => (pick(i) ? textUnits(shown(i, k)) : 0)))
  const left = items.some((_, i) => sides[i] !== 'neg')
  const nf = neg / range
  const pf = pos / range
  const vars = {
    '--nf': nf.toFixed(4),
    '--pf': pf.toFixed(4),
    // 한쪽에 막대가 없으면 그쪽 조건은 셈에서 빠지게 아주 큰 수로
    '--nfi': nf > 0 ? (1 / nf).toFixed(4) : 1000,
    '--pfi': pf > 0 ? (1 / pf).toFixed(4) : 1000,
    '--lp': widest((i) => sides[i] !== 'neg', 'title').toFixed(2),
    '--ln': widest((i) => sides[i] === 'neg', 'title').toFixed(2),
    '--vw': widest(() => true, 'value').toFixed(2),
  }
  return (
    <div className={cx('bk-dv', demo && 'is-demo', neg > 0 && 'has-neg', pos > 0 && 'has-pos', left && 'has-left')} style={vars}>
      <T k="heading" as="h3" className="bk-h" fit={[18, 32]} multiline />
      <ChartKey unitKey="basis" sum={mode === 'edit' && !series.ok ? '같은 단위의 숫자로 적어 주세요.' : undefined} />
      <ul className="bk-dv-list" data-n={items.length}>
        {items.map((it, i) => {
          const v = values[i]
          const side = sides[i]
          const hl = side !== null && (side === 'neg') === down
          return (
            <li
              key={it.id}
              className={cx('it bk-dv-row', side && `is-${side}`, hl && 'is-hl', v === null && 'is-blank')}
              style={{ '--p': v === null ? 0 : (Math.abs(v) / range).toFixed(4) }}
            >
              <IT i={i} k="title" className="bk-dv-name" />
              <span className="bk-dv-axis" aria-hidden="true" />
              {side && <span className="bk-dv-bar" aria-hidden="true" />}
              <span className="bk-dv-v">
                <IT i={i} k="value" as="span" className="bk-dv-num" oneLine />
              </span>
              <ItemTools i={i} />
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// 부품: 쌓은 막대 (stack)

import { BLOCKS } from '../../deck/blocks'
import { isBlankItem, readField } from '../../deck/fields'
import { hintFor } from '../../deck/layouts'
import { cx } from '../../lib/cx'
import { demoOf, useSlide } from '../context'
import { IT, ItemTools, T } from '../fields'
import { formatNumber, seriesIn } from '../numbers'
import { accentTint, TINT_COUNT } from '../tints'
import { ChartKey, pctText, tokensOf } from './parts'

/** 쌓은 막대의 나눈 것 이름. 이름 안에 띄어 쓰기가 있을 수 있어서('제품 A') 쉼표, 가운뎃점, 빗금으로만 나눈다 */
export function partsOf(text: string): string[] {
  return text
    .split(/\s*[,·/|]\s*/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, STACK_PARTS)
}

/** 쌓은 막대에 나눌 수 있는 것의 수. 칸 색은 맨 아래(첫째)가 강조색, 위로 갈수록 옅게(accentTint), 칸 사이는 바탕색 틈 */
const STACK_PARTS = Math.min(5, TINT_COUNT)

/**
 * 쌓은 막대: 기간마다 합계 막대 하나를 나눈 것마다 칸으로 쌓는다. 값 그대로는 합계의 크기를, 100%로는 구성의 변화를 본다.
 * 칸 안의 숫자는 칸이 충분히 클 때만(작은 칸에 넣으면 칸 밖으로 넘친다)
 */
export function Stack() {
  const { slide, meta, mode } = useSlide()
  const items = slide.items.slice(0, BLOCKS.stack.items!.max)
  const final = mode === 'final'
  const demo = demoOf(mode, items)
  const partsText = readField(slide, meta, 'parts').trim() || (final ? '' : hintFor(slide.layout, slide.hints, 'parts'))
  const parts = partsOf(partsText)
  const pct = slide.variant === 'pct'
  const width = parts.length || STACK_PARTS
  // 막대끼리도 키를 견주므로 모든 막대의 값을 한 기준으로 읽는다 ('1.2억, 8,000만'이면 1.2와 0.8)
  const allCells = items.map((it, i) => tokensOf(demo ? hintFor(slide.layout, slide.hints, 'value', 'value', i) : it.value))
  const cells = allCells.map((row) => row.slice(0, width))
  const series = seriesIn(cells.flat(), readField(slide, meta, 'unit'))
  // 비어 있거나 읽을 수 없는 조각을 빼면 뒤의 숫자가 앞 조각의 이름과 색에 붙는다.
  // 항목에 글이 있으면 나눈 것마다 수가 있어야 하고, 서로 다른 단위나 음수도 합치지 않는다.
  const inputsComplete = series.ok && series.values.every((v) => v !== null && v >= 0) &&
    items.every((it, i) => demo || isBlankItem(it) || (cells[i].length > 0 && allCells[i].length === cells[i].length && (!parts.length || cells[i].length === parts.length)))
  let at = 0
  const rows = cells.map((r) => r.map(() => Math.max(0, series.values[at++] ?? 0)))
  const totals = rows.map((r) => r.reduce((a, b) => a + b, 0))
  const comparable = inputsComplete && totals.every(Number.isFinite)
  const top = Math.max(0, ...totals)
  return (
    <div className={cx('bk-cc bk-st', demo && 'is-demo')} style={{ '--n': items.length }}>
      <T k="heading" as="h3" className="bk-h" fit={[18, 32]} multiline />
      <ChartKey
        sum={mode === 'edit' && !demo && !comparable ? '나눈 것마다 0 이상 숫자를 하나씩, 같은 단위로 적어 주세요.' : undefined}
        keys={
          <span className="bk-st-keywrap">
            <span className="bk-st-keys">
              {parts.map((p, j) => (
                <span key={j} className="bk-cc-lk" style={{ '--c': accentTint(j) }}>
                  <i aria-hidden="true" />
                  {p}
                </span>
              ))}
            </span>
            {/* 나눈 것 이름은 표시 줄 위에서 고친다 (올리거나 누르면 글이 보인다). 편집 때만 줄이 늘면 발표 화면과 높이가 달라진다 */}
            {mode === 'edit' && <T k="parts" className="bk-st-partsed on-chart" oneLine />}
          </span>
        }
      />
      <div className="bk-cc-plot">
        {items.map((it, i) => {
          const sum = totals[i]
          const p = comparable ? (pct ? (sum > 0 ? 100 : 0) : top > 0 ? (sum / top) * 100 : 0) : 0
          return (
            <div key={it.id} className="it bk-cc-col" style={{ '--p': p.toFixed(2) }}>
              <div className="bk-cc-bar bk-st-bar">
                <span className="bk-cc-v">
                  {/* 단위는 그래프 위에 한 번만 (막대마다 되풀이하지 않는다). 단위가 서로 다른 값을 더한 합은 보이지 않는다 */}
                  {sum > 0 && comparable && <span className="bk-cc-num">{formatNumber(sum)}</span>}
                </span>
                <span className="bk-cc-fill bk-st-stack">
                  {comparable && rows[i].map((v, j) => {
                    const of = sum > 0 ? (v / sum) * 100 : 0
                    // 칸 안 숫자는 그 칸이 막대 높이에서 차지하는 몫이 충분할 때만. 칸이 숫자보다 낮으면 CSS가 숨긴다
                    const room = (of * p) / 100 >= 6
                    return v > 0 ? (
                      <span key={j} className={cx('bk-st-seg', j === 0 && 'is-base')} style={{ flexGrow: v, background: accentTint(j) }}>
                        {room && <span className="bk-st-n">{pct ? pctText(of) : formatNumber(v)}</span>}
                      </span>
                    ) : null
                  })}
                </span>
                {mode === 'edit' && <IT i={i} k="value" className="bk-st-in on-chart" oneLine />}
              </div>
              <div className="bk-cc-label">
                <IT i={i} k="title" className="bk-cc-name" />
                {final && (!comparable || sum === 0) && <IT i={i} k="value" className="bk-cc-name" />}
              </div>
              {/* 빈 칸도 그 자리의 바닥줄은 남긴다: 감추면 축이 채운 칸 아래에서만 끊겼다 */}
              <ItemTools i={i} keepBlank />
            </div>
          )
        })}
      </div>
    </div>
  )
}

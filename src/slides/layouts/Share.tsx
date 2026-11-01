// 레이아웃: 구성비 (share). 모양은 styles/share.css

import { isBlankItem, readField } from '../../deck/fields'
import { highlightOf, hintFor } from '../../deck/layouts'
import { cx } from '../../lib/cx'
import { demoOf, useSlide } from '../context'
import { IT, ItemTools, T } from '../fields'
import { formatNumber, seriesIn, unitAfter } from '../numbers'
import { accentTint, TINT_COUNT } from '../tints'
import { Head, useItems, useUnitOpen } from './parts'

/** 100칸을 비중대로 나눈다. 내림한 뒤 남는 칸은 소수점 아래가 큰 항목부터 하나씩 (모두 더하면 100, 비중이 0이면 0칸) */
export function unitsOf(pcts: number[]): number[] {
  const out = pcts.map((p) => Math.floor(p))
  let left = 100 - out.reduce((a, b) => a + b, 0)
  const byRest = pcts.map((p, i) => ({ i, rest: p - Math.floor(p) })).sort((a, b) => b.rest - a.rest)
  for (const { i } of byRest) {
    if (left <= 0) break
    if (pcts[i] <= 0) continue
    out[i]++
    left--
  }
  return out
}

/**
 * 구성비: 값을 더한 전체에서 각 항목의 비중. 띠는 한 줄 막대를, 도넛은 고리를, 100칸은 10×10 칸을 나눈다.
 * 모두 %로 적었으면 적은 그대로 보이고, 금액이나 건수로 적었으면 비중을 계산해 크게, 적은 값은 작게.
 */
export function Share() {
  const { slide, meta, mode } = useSlide()
  const items = useItems()
  const final = mode === 'final'
  const highlight = highlightOf(slide)
  const demo = demoOf(mode, items)
  const texts = items.map((it, i) => (demo ? hintFor(slide.layout, slide.hints, 'value', 'value', i) : it.value).trim())
  const unit = readField(slide, meta, 'unit').trim()
  const shownUnits = texts.map((text) => text ? unitAfter(text, unit) : !final ? unit : '')
  const unitOpen = useUnitOpen(unit)
  // 값을 한 기준으로 더한다 ('1.2억'과 '8,000만'). 단위가 서로 다른 값이 섞였으면 비중과 합계는 틀린 숫자라 보이지 않는다
  const series = seriesIn(texts, unit)
  const values = series.values.map((v) => Math.max(0, v ?? 0))
  const sum = values.reduce((a, b) => a + b, 0)
  const typedPct = texts.every((t) => !t || t.includes('%'))
  // 쓴 백분율의 합이 100이 아닌데 전체 띠를 채우면, 적힌 30%가 그림에서는 60%로 보일 수 있다.
  // 단위가 다르거나 숫자가 빠진 경우도 마찬가지로 원래 글은 남기고 비율 그림은 그리지 않는다.
  const percentValues = typedPct || /^(?:%|％|퍼센트|프로)$/.test(series.suffix)
  const complete = series.ok && Number.isFinite(sum) && sum > 0 && items.every((it, i) => demo || isBlankItem(it) || (series.values[i] !== null && series.values[i]! >= 0))
  // 33.3% 셋은 반올림 때문에 99.9%가 될 수 있다. 각 입력의 마지막 자릿수에서 가능한 반올림 오차만 허용한다.
  const rounding = texts.reduce((a, t, i) => {
    if (!t || series.values[i] === null) return a
    const decimals = /\d[\d,]*(?:\.(\d+))?/.exec(t)?.[1]?.length ?? 0
    return a + 0.5 * 10 ** -decimals
  }, 1e-9)
  const comparable = complete && (!percentValues || Math.abs(sum - 100) <= rounding)
  const showTypedPct = typedPct || (percentValues && comparable)
  const pcts = values.map((v) => (comparable ? (v / sum) * 100 : 0))
  const pctText = (p: number) => (!comparable ? '–' : p > 0 && p < 1 ? '1% 미만' : `${formatNumber(p < 10 ? Math.round(p * 10) / 10 : Math.round(p))}%`)
  let grey = 0
  const colors = items.map((_, i) => {
    // 강조할 조각이 없으면 강조색의 농담, 있으면 그 조각만 강조색이고 나머지는 강조색의 옅은 농담(셋째 단계부터, 큰 조각부터 진하게).
    // 회색 농담은 첫 단계가 중간 회색이라 강조색 옆에서 같은 무게의 회색 덩어리로 읽혔다(VISUAL-RULES 3)
    if (highlight < 0) return accentTint(i)
    if (i === highlight) return 'var(--accent)'
    return accentTint(Math.min(2 + grey++, TINT_COUNT - 1))
  })
  let start = 0
  const segs = pcts.map((p) => {
    const s = { start, len: p }
    start += p
    return s
  })
  const donut = slide.variant === 'donut'
  const units = slide.variant === 'units'
  // 100칸: 왼쪽 위에서부터 줄마다 항목 차례대로 칠한다. 칸 하나가 1%
  const cells = units ? unitsOf(pcts).flatMap((n, i) => Array.from({ length: n }, () => i)) : []
  // '131억 원'처럼 숫자와 단위는 붙여 쓴다. 단위 칸이 비었으면 값에 붙여 쓴 자리와 단위('58억'이면 억)
  const totalText = comparable && !percentValues ? `${formatNumber(sum)}${series.suffix}` : ''
  const guidance = mode === 'edit' && !demo && !comparable
    ? complete && percentValues ? '백분율의 합을 100%로 맞춰 주세요.' : '모든 값을 같은 단위의 0 이상 숫자로 채워 주세요. 하나는 0보다 커야 해요.'
    : ''
  return (
    <>
      <Head />
      <div className={cx('s-body sh', demo && 'is-demo')} data-n={items.length} style={{ '--n': items.length }}>
        {/* 띠는 합계를 위에, 도넛은 고리 가운데에, 100칸은 이름표 목록 위에. 단위 칸은 편집할 때만: 띠는 오른쪽 위에, 도넛은 고리 가운데 합계 아래에
            (도넛의 오른쪽 위는 이름표 목록이 차지해서 덮는다) */}
        {!donut && (totalText || (!final && unitOpen)) && (
          <div className="sh-top">
            <span className="sh-sum">{totalText && `합계 ${totalText}`}</span>
            {!final && unitOpen && (
              <span className="sh-unit">
                단위: <T k="unit" as="span" oneLine />
              </span>
            )}
          </div>
        )}
        {donut ? (
          <div className="sh-ring">
            <svg viewBox="0 0 100 100" aria-hidden="true">
              <circle className="sh-ring-track" cx="50" cy="50" r="40" />
              {segs.map((s, i) =>
                s.len > 0 ? (
                  <circle
                    key={items[i].id}
                    className="sh-arc"
                    data-index={i}
                    cx="50"
                    cy="50"
                    r="40"
                    pathLength="100"
                    // 조각 사이를 조금 띄운다. 한 조각뿐이면 고리를 닫는다
                    strokeDasharray={`${Math.max(0.01, s.len - (s.len < 100 ? 0.7 : 0))} 100`}
                    strokeDashoffset={-s.start}
                    style={{ stroke: colors[i] }}
                  />
                ) : null,
              )}
            </svg>
            {(totalText || (!final && unitOpen)) && (
              <div className="sh-total">
                {totalText && <span className="sh-total-k">합계</span>}
                {totalText && <span className="sh-total-v">{totalText}</span>}
                {!final && unitOpen && (
                  <span className="sh-unit">
                    단위: <T k="unit" as="span" oneLine />
                  </span>
                )}
              </div>
            )}
          </div>
        ) : units ? (
          <div className="sh-units" aria-hidden="true">
            {Array.from({ length: 100 }, (_, k) => (
              <span key={k} className="sh-u" style={k < cells.length ? { '--c': colors[cells[k]] } : undefined} />
            ))}
          </div>
        ) : (
          <div className="sh-band" aria-hidden="true">
            {segs.map((s, i) =>
              s.len > 0 ? <span key={items[i].id} className="sh-seg" style={{ flexGrow: s.len, background: colors[i] }} /> : null,
            )}
          </div>
        )}
        <div className="sh-legend">
          {guidance && <p className="sh-unit sh-warning">{guidance}</p>}
          {items.map((it, i) => (
            <div key={it.id} className={cx('it sh-item', i === highlight && 'is-hl')} style={{ '--c': colors[i] }}>
              <span className="sh-pct">
                {showTypedPct ? <><IT i={i} k="value" as="span" oneLine />{shownUnits[i] && <span>{shownUnits[i]}</span>}</> : final && !texts[i] ? '–' : pctText(pcts[i])}
              </span>
              <div className="sh-text">
                <IT i={i} k="title" className="sh-name" />
                {!showTypedPct && (!final || texts[i]) && (
                  <span className="sh-value">
                    <IT i={i} k="value" as="span" oneLine />
                    {shownUnits[i] && <span>{shownUnits[i]}</span>}
                  </span>
                )}
                <IT i={i} k="meta" className="sh-meta" />
              </div>
              <ItemTools i={i} />
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

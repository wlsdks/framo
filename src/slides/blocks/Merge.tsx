// 부품: 모으기 (merge). 모양은 styles/blocks/merge.css, 움직임은 motion/engine.ts의 nativeAuto

import type { CSSProperties } from 'react'
import { BLOCKS } from '../../deck/blocks'
import { isBlankItem, readField } from '../../deck/fields'
import { hintFor } from '../../deck/layouts'
import { cx } from '../../lib/cx'
import { demoOf, useSlide } from '../context'
import { IT, ItemTools, T } from '../fields'
import { formatNumber, seriesIn, unitAfter } from '../numbers'
import { accentTint, TINT_COUNT } from '../tints'
import { Numeral, totalMatches } from './parts'

/**
 * 모으기: 여러 값을 더한 합계. 값마다 한 줄(이름, 값)에 그 값의 조각을 두는데, 조각은 합계 막대에서 그 값이 들어갈 자리에
 * 그대로 놓인다(앞 조각들이 끝난 자리부터). 위에서 내려다보면 합계 막대를 줄마다 풀어 놓은 계단이라, 맨 아래 합계 줄(선 아래)의
 * 막대가 그 조각들을 이어 붙인 것으로 읽힌다. 발표할 때는 조각이 하나씩 제 자리로 내려가 끼워지고, 끼워질 때마다 합계가 그만큼
 * 오른다. 합계 칸을 비우면 값을 더한 값
 */
export function Merge() {
  const { slide, meta, mode, folds } = useSlide()
  const items = slide.items.slice(0, BLOCKS.merge.items!.max)
  const demo = demoOf(mode, items)
  const texts = items.map((it, i) => (demo ? hintFor(slide.layout, slide.hints, 'value', 'value', i) : it.value).trim())
  const unit = readField(slide, meta, 'unit').trim()
  const shownUnits = texts.map((text) => text ? unitAfter(text, unit) : mode !== 'final' ? unit : '')
  // 값을 한 기준으로 더한다('1.2억'과 '8,000만'). 단위가 다른 값이 섞였으면 조각과 합계는 틀린 숫자라 보이지 않는다
  const series = seriesIn(texts, unit)
  const values = series.values.map((v) => Math.max(0, v ?? 0))
  const sum = values.reduce((a, b) => a + b, 0)
  const typedTotal = readField(slide, meta, 'total').trim()
  const complete = series.ok && Number.isFinite(sum) && sum > 0 && items.every((it, i) => demo || isBlankItem(it) || (series.values[i] !== null && series.values[i]! >= 0))
  const ok = complete && totalMatches(texts, typedTotal, unit)
  const shares = values.map((v) => (ok ? v / sum : 0))
  const sumText = ok ? `${formatNumber(sum)}${series.suffix}` : ''
  const totalField = !!typedTotal || (mode !== 'final' && !folds?.has('total'))
  const unitField = !!unit || (mode !== 'final' && !folds?.has('unit'))
  const hl = slide.options.highlight
  const pick = hl !== undefined && hl >= 0 && hl < items.length ? hl : -1
  let grey = 0
  // 강조한 것 밖의 나머지는 구성비(Share.tsx)처럼 옅은 강조색 단계(accentTint 2부터). 회색으로 칠하면 한 그림 안에 색 무리가 둘이 되고
  // 회색 면이 데이터가 아닌 칠처럼 보였다(docs/VISUAL-RULES.md 3, 4)
  const colors = items.map((_, i) => (pick < 0 ? accentTint(i) : i === pick ? 'var(--accent)' : accentTint(Math.min(2 + grey++, TINT_COUNT - 1))))
  // 조각의 자리: 앞의 조각들이 차지한 몫(--o)과 그 앞의 틈 수(--k). 막대와 같은 식이라 줄의 조각이 막대의 조각 바로 위에 선다
  const gaps = Math.max(0, shares.filter((p) => p > 0).length - 1)
  let before = 0
  let k = 0
  const spots = shares.map((p) => {
    const at = { o: before, k }
    before += p
    if (p > 0) k++
    return at
  })
  const piece = (i: number) => ({ '--c': colors[i], '--p': shares[i].toFixed(5), '--o': spots[i].o.toFixed(5), '--k': spots[i].k }) as CSSProperties
  return (
    <div className={cx('bk-mg', demo && 'is-demo', !ok && 'is-blank')} data-n={items.length} style={{ '--mg-n': gaps } as CSSProperties}>
      <div className="bk-mg-grid">
        {mode === 'edit' && !demo && !ok && <p className="bk-mg-unit bk-mg-warning">{complete ? '합계가 각 값의 합과 같도록 확인해 주세요.' : '각 값을 같은 단위의 0 이상 숫자로 채워 주세요.'}</p>}
        {items.map((it, i) => (
          <div key={it.id} className={cx('it bk-mg-part', i === pick && 'is-hl')} style={piece(i)}>
            <IT i={i} k="title" className="bk-mg-name" />
            <p className="bk-mg-num">
              <IT i={i} k="value" as="span" className="bk-mg-v" numeral oneLine />
              {shownUnits[i] && <span className="bk-mg-vu">{shownUnits[i]}</span>}
            </p>
            <span className="bk-mg-track" aria-hidden="true">
              {shares[i] > 0 && <span className="bk-mg-pc" />}
            </span>
            <ItemTools i={i} />
          </div>
        ))}
        {/* 합계 줄: 위의 줄들과 선으로 나눈다(셈의 합계 선) */}
        <div className="bk-mg-sum">
          <div className="bk-mg-head">
            <T k="label" as="p" className="bk-mg-label" />
            {unitField && (
              <span className="bk-mg-unit">
                단위: <T k="unit" as="span" oneLine />
              </span>
            )}
          </div>
          {totalField ? (
            <T k="total" as="p" className="bk-mg-total" numeral />
          ) : (
            <p className="bk-mg-total">{sumText ? <Numeral text={sumText} /> : '–'}</p>
          )}
          <span className="bk-mg-bar" aria-hidden="true">
            {items.map((it, i) => (shares[i] > 0 ? <span key={it.id} className="bk-mg-seg" style={piece(i)} /> : null))}
          </span>
        </div>
      </div>
    </div>
  )
}

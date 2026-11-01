// 부품: 나누기 (split). 모양은 styles/blocks/split.css, 움직임은 motion/engine.ts의 nativeAuto

import type { CSSProperties } from 'react'
import { BLOCKS } from '../../deck/blocks'
import { isBlankItem, readField } from '../../deck/fields'
import { hintFor } from '../../deck/layouts'
import { cx } from '../../lib/cx'
import { demoOf, useSlide } from '../context'
import { IT, ItemTools, numberUnits, T, textUnits } from '../fields'
import { formatNumber, seriesIn, unitAfter } from '../numbers'
import { accentTint, TINT_COUNT } from '../tints'
import { Numeral, pctText, totalMatches } from './parts'

/** 조각 이름표를 조각 바로 아래에 맞춰 둘 수 있는 가장 좁은 칸 너비의 문턱들(split.css의 @container와 같은 값) */
const NEEDS = [560, 720, 880, 1100, 1400, 1680]

/**
 * 이름표를 조각 아래에 맞춰 두려면 칸이 얼마나 넓어야 하는지(문턱 하나로 올림). 조각마다 이름과 값이 들어갈 너비를 글자 수로
 * 어림하고(장의 px, 보통 글자 크기), 그 너비가 조각의 몫이 되는 칸 너비 가운데 가장 큰 것. 가장 넓은 칸으로도 모자라면 'list'
 */
export function splitNeed(names: string[], values: string[], shares: number[], gap = 8): string {
  let need = 0
  shares.forEach((p, i) => {
    if (p <= 0) return
    const w = Math.max(120, textUnits(names[i] || '') * 28, numberUnits(values[i] || '') * 36 + 76) + 12
    need = Math.max(need, w / p)
  })
  need += (shares.length - 1) * gap
  const fit = NEEDS.find((x) => need <= x)
  return fit ? String(fit) : 'list'
}

/**
 * 나누기: 전체(합계)를 크게 두고, 그 아래 막대 하나를 조각의 몫대로 나눈다. 조각마다 이름과 값은 그 조각 바로 아래에 맞춰 둔다
 * (어느 조각이 얼마인지 눈을 옮기지 않고 읽는다). 좁아서 맞출 수 없으면 막대 아래 목록으로. 합계 칸을 비우면 조각을 더한 값.
 * 발표할 때는 막대가 한 덩어리로 펼쳐지는 동안 합계가 올라가고, 조각 사이가 벌어지며 색이 갈린 뒤 이름표가 나온다
 */
export function Split() {
  const { slide, meta, mode, folds } = useSlide()
  const items = slide.items.slice(0, BLOCKS.split.items!.max)
  const demo = demoOf(mode, items)
  const texts = items.map((it, i) => (demo ? hintFor(slide.layout, slide.hints, 'value', 'value', i) : it.value).trim())
  const unit = readField(slide, meta, 'unit').trim()
  const shownUnits = texts.map((text) => text ? unitAfter(text, unit) : mode !== 'final' ? unit : '')
  // 조각을 한 기준으로 더한다('1.2억'과 '8,000만'). 단위가 다른 값이 섞였으면 몫과 합계는 틀린 숫자라 보이지 않는다
  const series = seriesIn(texts, unit)
  const values = series.values.map((v) => Math.max(0, v ?? 0))
  const sum = values.reduce((a, b) => a + b, 0)
  const typedTotal = readField(slide, meta, 'total').trim()
  const complete = series.ok && Number.isFinite(sum) && sum > 0 && items.every((it, i) => demo || isBlankItem(it) || (series.values[i] !== null && series.values[i]! >= 0))
  const ok = complete && totalMatches(texts, typedTotal, unit)
  const shares = values.map((v) => (ok ? v / sum : 0))
  // 편집할 때 값을 아직 적지 않은 조각(빈 조각): 몫이 없다고 이름표까지 숨기면 '+ 조각'을 눌러도 아무것도 보이지 않고 적을 칸도 없었고,
  // 새 나누기에 값 하나를 적으면 나머지 조각의 이름과 값 칸이 한꺼번에 사라졌다. 적힌 조각의 평균 몫만큼 빈 조각을 칠하지 않은 칸 색으로
  // 그리고 그 아래에 이름표(옅은 선 색)를 둔다. 합계와 비율은 적힌 값만으로, 발표 화면에는 그리지 않는다
  const ghost = items.map((_, i) => !demo && mode !== 'final' && shares[i] <= 0)
  const real = shares.filter((p) => p > 0)
  const room = real.length ? real.reduce((a, b) => a + b, 0) / real.length : 1 / Math.max(1, items.length)
  const laid = shares.map((p, i) => (ghost[i] ? room : p))
  const laidSum = laid.reduce((a, b) => a + b, 0) || 1
  const spans = laid.map((p) => p / laidSum)
  const typedPct = texts.every((t) => !t || t.includes('%'))
  const sumText = ok && !typedPct ? `${formatNumber(sum)}${series.suffix}` : ''
  // 합계 칸: 적었으면 그것, 비었으면 조각을 더한 값(계산한 글이라 고칠 수 없다. '칸 더하기'로 열면 직접 적는다)
  const totalField = !!typedTotal || (mode !== 'final' && !folds?.has('total'))
  const unitField = !!unit || (mode !== 'final' && !folds?.has('unit'))
  const hl = slide.options.highlight
  const pick = hl !== undefined && hl >= 0 && hl < items.length ? hl : -1
  let grey = 0
  // 강조할 조각을 고르지 않았으면 강조색의 농담(앞 조각부터 진하게), 골랐으면 그 조각만 강조색이고 나머지는 회색 농담
  // 강조한 것 밖의 나머지는 구성비(Share.tsx)처럼 옅은 강조색 단계(accentTint 2부터). 회색으로 칠하면 한 그림 안에 색 무리가 둘이 되고
  // 회색 면이 데이터가 아닌 칠처럼 보였다(docs/VISUAL-RULES.md 3, 4)
  const colors = items.map((_, i) => (pick < 0 ? accentTint(i) : i === pick ? 'var(--accent)' : accentTint(Math.min(2 + grey++, TINT_COUNT - 1))))
  // 0인 조각에는 막대 폭이 없지만, 사용자가 적은 이름과 값은 숨기지 않는다. 목록으로 두면 0도 읽을 자리가 있다.
  const hasZero = items.some((it, i) => !isBlankItem(it) && !!texts[i] && series.values[i] === 0)
  const need = !ok || hasZero ? 'list' : splitNeed(
    items.map((it, i) => it.title || hintFor(slide.layout, slide.hints, 'title', 'title', i)),
    items.map((it, i) => (it.value || texts[i] || hintFor(slide.layout, slide.hints, 'value', 'value', i)) + (shownUnits[i] ? ` ${shownUnits[i]}` : '')),
    spans,
  )
  const cols = spans.map((p) => `minmax(0, ${Math.max(p, 0.0001).toFixed(4)}fr)`).join(' ')
  return (
    <div className={cx('bk-sg', demo && 'is-demo', !ok && 'is-blank')} data-n={items.length} data-need={need} style={{ '--sg-cols': cols } as CSSProperties}>
      <div className="bk-sg-head">
        <div className="bk-sg-top">
          <T k="label" as="p" className="bk-sg-label" />
          {unitField && (
            <span className="bk-sg-unit">
              단위: <T k="unit" as="span" oneLine />
            </span>
          )}
        </div>
        {totalField ? (
          <T k="total" as="p" className="bk-sg-total" numeral />
        ) : (
          sumText && (
            <p className="bk-sg-total">
              <Numeral text={sumText} />
            </p>
          )
        )}
        {mode === 'edit' && !demo && !ok && <p className="bk-sg-unit">{complete ? '합계가 조각의 합과 같도록 확인해 주세요.' : '조각 값을 같은 단위의 0 이상 숫자로 채워 주세요.'}</p>}
      </div>
      <div className="bk-sg-bar" aria-hidden="true">
        {items.map((it, i) =>
          shares[i] > 0 ? (
            <span key={it.id} className="bk-sg-seg" style={{ flexGrow: spans[i], background: colors[i] } as CSSProperties} />
          ) : ghost[i] ? (
            <span key={it.id} className="bk-sg-seg is-ghost" style={{ flexGrow: spans[i] } as CSSProperties} />
          ) : null,
        )}
      </div>
      <div className="bk-sg-keys">
        {items.map((it, i) => (
          <div
            key={it.id}
            className={cx('it bk-sg-key', i === pick && 'is-hl', ok && shares[i] <= 0 && !ghost[i] && isBlankItem(it) && 'is-none')}
            style={{ '--c': !ok || ghost[i] ? 'var(--line)' : colors[i] } as CSSProperties}
          >
            <IT i={i} k="title" className="bk-sg-name" />
            <p className="bk-sg-line">
              <IT i={i} k="value" as="span" className="bk-sg-v" numeral oneLine />
              {shownUnits[i] && <span className="bk-sg-vu">{shownUnits[i]}</span>}
              {!typedPct && <span className="bk-sg-pct">{ok ? pctText(shares[i] * 100) : '–'}</span>}
            </p>
            <ItemTools i={i} />
          </div>
        ))}
      </div>
    </div>
  )
}

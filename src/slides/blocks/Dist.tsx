// 부품: 분포 (dist). 모양은 styles/blocks/dist.css, 움직임은 motion/engine.ts의 nativeAuto, 셈은 slides/dist.ts

import type { CSSProperties } from 'react'
import { BLOCKS } from '../../deck/blocks'
import { isBlankItem, readField } from '../../deck/fields'
import { hintFor } from '../../deck/layouts'
import { cx } from '../../lib/cx'
import { useSlide } from '../context'
import { cutIndex, distFigure, distPct } from '../dist'
import { IT, ItemTools, T } from '../fields'
import { formatNumber, seriesIn, unfitValues } from '../numbers'
import { Numeral, pctText } from './parts'

/**
 * 분포: 차례가 있는 구간(1일, 2일, 3일 …)마다 막대 하나, 그리고 기준선 하나가 구간을 안과 밖으로 가른다. 이 그림의 답은 막대의 키가
 * 아니라 '기준 안에 든 몫'이라, 그 몫을 값에서 셈해 큰 숫자로 말하고(사람이 적지 않는다) 기준 안의 막대만 강조색, 밖은 강조색의 옅은
 * 농담이다. 막대 비교(항목끼리 견준다)나 원인 순위(많은 것부터 더한다)와 달리 구간의 차례를 그대로 두고, 막대를 붙여 세워 한 덩어리의
 * 모양(어디에 몰렸는지)으로 읽히게 한다. 바닥줄과 눈금은 없다: 붙어 선 막대의 발이 곧 바닥이고, 선은 기준선 하나뿐이다.
 * 기준은 구간 이름으로 적는다('3일'): 구간을 옮기거나 지워도 이름을 따라가고, 고르는 단추 없이 그림 곁에서 바로 고친다.
 * 편집할 때 알리는 글과 틀린 칸의 밑줄은 차트들과 같은 것(edit.css의 .ed-warn, .is-unfit)이라 장의 글과 섞이지 않는다
 */
export function Dist() {
  const { slide, meta, mode } = useSlide()
  const items = slide.items.slice(0, BLOCKS.dist.items!.max)
  const n = items.length
  const from = slide.variant === 'from'
  const hint = (k: 'title' | 'value', i: number) => (mode !== 'final' ? hintFor(slide.layout, slide.hints, k, k, i).trim() : '')
  // 편집할 때 아직 적지 않은 값은 안내의 예시 값으로 그린다(넣자마자 어떤 그림인지 보이게). 예시 값이 섞인 그림은 옅게
  const demo = mode !== 'final' && items.some((it) => !it.value.trim())
  const texts = items.map((it, i) => it.value.trim() || hint('value', i))
  // 통째로 빈 구간만 안내의 이름으로 읽는다: 값만 적고 이름을 비운 구간은 발표할 때도 이름이 없어, 안내의 이름으로 기준을 잡으면
  // 편집할 때만 기준선이 섰다
  const titles = items.map((it, i) => it.title.trim() || (isBlankItem(it) ? hint('title', i) : ''))
  const ownCut = readField(slide, meta, 'cut').trim()
  const cut = cutIndex(ownCut || (demo ? hintFor(slide.layout, slide.hints, 'cut') : ''), titles)
  // 값을 한 잣대로 읽는다: 단위를 붙인 값('58건')도, 하나만 단위가 달라('40%') 더할 수 없는 것도 가려낸다
  const series = seriesIn(texts)
  const figure = series.ok ? distFigure(series.values, cut, from) : null

  // 다 적었는데 그릴 수 없을 때만 알린다(쓰는 중인 칸을 두고 재촉하지 않게). 편집할 때만: 발표할 때는 막대 없이 적은 글만 선다
  const wrong = mode === 'edit' && !demo && !figure
  const unfit = wrong ? unfitValues(texts) : []
  // 기준에 적은 글이 어느 구간도 가리키지 않을 때: 구간 이름을 다 적은 뒤에만 알린다
  const lost = mode === 'edit' && !!ownCut && cut < 0 && items.every((it) => it.title.trim())
  const warning = wrong
    ? unfit.some(Boolean)
      ? '밑줄 친 값을 다른 값과 같은 단위의 0 이상 숫자로 적어 주세요.'
      : series.ok
        ? '구간 가운데 하나는 0보다 크게 적어 주세요.'
        : '값을 모두 같은 단위로 적어 주세요.'
    : lost
      ? `기준에는 구간 이름 하나를 그대로 적어 주세요. (예: ${items[Math.min(n - 1, Math.floor(n / 2))].title.trim()})`
      : ''
  // 틀린 값을 적는 동안에도 그림 자리는 지킨다: 읽힌 값은 그대로 그리고 틀린 구간만 비운다. 하나도 읽히지 않으면 안내의 예시 값으로.
  // 그림을 통째로 지우면 값 하나를 고쳐 치는 사이마다 막대가 모두 사라져 컴포넌트가 망가진 것으로 보인다
  const example = () => {
    const s = seriesIn(items.map((_, i) => hint('value', i)))
    return s.ok ? distFigure(s.values, cut, from) : null
  }
  const sketch = figure || !(wrong || demo) ? null : (wrong && distFigure(series.values.map((v, i) => (unfit[i] || v === null || v < 0 ? 0 : v)), cut, from)) || example()
  const drawn = figure ?? sketch

  // 답: 기준 안에 든 몫. 틀린 값으로 어림한 그림에서는 말하지 않는다
  const pct = figure && distPct(figure)
  // 값의 단위가 %면 '100% 가운데 82%'는 같은 말의 되풀이다. 예시 값으로 셈한 수도 적지 않는다
  const detail =
    figure && pct !== null && !demo && series.suffix.trim() !== '%' ? (
      <>
        {formatNumber(figure.total)}
        {series.suffix} 가운데{' '}
        <b>
          {formatNumber(figure.sum)}
          {series.suffix}
        </b>
      </>
    ) : null
  // 기준 이름을 비워 두면 기준 구간의 이름으로
  const auto = cut >= 0 && titles[cut] ? `${titles[cut]}${from ? '부터' : '까지'}` : undefined
  const answered = mode !== 'final' || cut >= 0 || !!readField(slide, meta, 'label').trim()

  // 기준선이 설 자리(edge)에 가는 칸 하나를 끼운다: 막대는 6px 사이로 붙어 서고, 기준선 양옆만 벌어져 두 무리로 갈린다
  const edge = drawn?.edge ?? null
  const track = (count: number) => (count > 0 ? `repeat(${count}, minmax(0, 1fr))` : '')
  const columns = edge === null ? track(n) : `${track(edge)} var(--ds-split) ${track(n - edge)}`
  const vars = { '--n': n, gridTemplateColumns: columns } as CSSProperties

  return (
    <div className={cx('bk-ds', (demo || !!sketch) && 'is-demo', !drawn && 'is-unknown', !answered && 'is-bare')}>
      <T k="heading" as="h3" className="bk-h" fit={[18, 32]} multiline />
      {warning && <p className="bk-ds-warn ed-warn" role="status">{warning}</p>}
      {answered && (
        <div className="bk-ds-ans">
          <T k="label" className="bk-ds-k" auto={auto} />
          {pct !== null && pct !== undefined && (
            <p className="bk-ds-v">
              <Numeral text={pctText(pct)} />
            </p>
          )}
          {(mode === 'edit' || detail) && (
            <p className="bk-ds-r">
              {/* 기준은 편집할 때만 보인다(평가표의 추천처럼): 발표할 때는 기준선과 기준 이름이 말한다 */}
              {mode === 'edit' && (
                <span className="bk-ds-cut">
                  기준
                  <T k="cut" as="span" className={cx('bk-ds-cv', lost && 'is-unfit')} oneLine />
                  {from ? '부터' : '까지'}
                </span>
              )}
              {detail && <span className="bk-ds-of">{detail}</span>}
            </p>
          )}
        </div>
      )}
      <div className="bk-ds-plot" style={vars}>
        {items.map((it, i) => (
          <div
            key={it.id}
            className={cx('it bk-ds-col', drawn?.inside[i] && 'is-in', i === cut && 'is-cut')}
            // 칸 자리를 적어 둔다: 기준선의 칸을 건너뛰어야 해서
            style={{ '--p': (drawn?.bars[i] ?? 0).toFixed(2), gridColumn: i + 1 + (edge !== null && i >= edge ? 1 : 0) } as CSSProperties}
          >
            <div className="bk-ds-bar">
              <IT i={i} k="value" as="span" className={cx('bk-ds-num', unfit[i] && 'is-unfit')} oneLine />
              {drawn && <span className="bk-ds-fill" aria-hidden="true" />}
            </div>
            <IT i={i} k="title" className="bk-ds-name" />
            <ItemTools i={i} keepBlank />
          </div>
        ))}
        {edge !== null && <span className="bk-ds-line" style={{ gridColumn: edge + 1 }} aria-hidden="true" />}
      </div>
    </div>
  )
}

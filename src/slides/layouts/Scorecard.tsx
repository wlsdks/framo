// 레이아웃: 목표 대비 실적 (scorecard). 모양은 styles/scorecard.css

import { isBlankItem, readField } from '../../deck/fields'
import { highlightOf, hintFor } from '../../deck/layouts'
import { cx } from '../../lib/cx'
import { useSlide } from '../context'
import { IT, ItemTools } from '../fields'
import { scoreOf } from '../numbers'
import { Head, Label, useItems } from './parts'

/**
 * 목표 대비 실적: 지표마다 목표, 실적, 달성률. 막대에 목표 자리를 세로 줄로 표시한다.
 * 표(기본)는 지표마다 한 줄, 나란히는 지표마다 한 단(달성률을 크게, 그 아래 막대와 목표, 실적). 두 모양이 같은 칸을 쓰고 배치만 다르다.
 */
export function Scorecard() {
  const { slide, meta, mode } = useSlide()
  const items = useItems()
  const highlight = highlightOf(slide)
  // 나란히를 편집할 때 목표와 실적의 이름은 첫 단의 이름 자리에서 고친다(다른 단은 같은 이름을 CSS로 붙인다).
  // 머리 줄을 따로 두면 편집할 때만 64px가 늘어, 발표 화면으로 잰 높이에 맞춘 칸에서 글자를 두 단계 줄였다
  const sideEdit = slide.variant === 'side' && mode !== 'final'
  // 발표할 때 지표를 모두 비웠으면(빈 줄은 styles/base.css의 .it-empty가 감춘다) 머리줄도 두지 않는다: 지표, 목표 대비, 달성률만 남았다
  const allBlank = mode === 'final' && items.length > 0 && items.every(isBlankItem)
  // 편집할 때 목표와 실적이 둘 다 비어 있으면 안내 문구의 예시 숫자로 막대를 흐리게 그린다.
  // 한쪽만 적었으면 예시와 섞지 않는다 (엉뚱한 달성률이 보이지 않게).
  const pair = (i: number) => {
    const it = items[i]
    if (it.meta.trim() || it.value.trim() || mode === 'final') return { demo: false, meta: it.meta, value: it.value }
    return { demo: true, meta: hintFor(slide.layout, slide.hints, 'meta', 'meta', i), value: hintFor(slide.layout, slide.hints, 'value', 'value', i) }
  }
  return (
    <>
      <Head />
      {/* 나란히: 단마다 목표와 실적 앞에 붙이는 이름(머리 줄의 이름을 그대로). 따옴표로 묶은 글이라 CSS의 content로 쓴다 */}
      <div
        className="s-body sk"
        data-n={items.length}
        style={slide.variant === 'side' ? { '--sk-kt': JSON.stringify(readField(slide, meta, 'metaTitle').trim() || '목표'), '--sk-kv': JSON.stringify(readField(slide, meta, 'valueTitle').trim() || '실적') } : undefined}
      >
        {!allBlank && (
          <div className="sk-row sk-headrow">
            <span className="sk-h">지표</span>
            <span className="sk-h">목표 대비</span>
            <Label k="metaTitle" fallback="목표" className="sk-h sk-num" />
            <Label k="valueTitle" fallback="실적" className="sk-h sk-num" />
            <span className="sk-h sk-num">달성률</span>
          </div>
        )}
        {items.map((it, i) => {
          const { demo, meta, value } = pair(i)
          // 목표와 실적은 단위까지 읽어 같은 기준으로 견주고, 견줄 수 없으면 달성률과 달성 여부를 말하지 않는다(scoreOf).
          // 음수 실적은 이 막대의 0~목표 축으로 표현할 수 없어 원문만 남긴다. 낮을수록 좋은 지표('7분 이하')는 목표 ÷ 실적
          const { known, met, rate, target, actual } = scoreOf(meta, value)
          const percent = rate === null ? null : rate * 100
          // 목표와 실적 중 큰 쪽이 막대 끝. 목표를 넘으면 목표 줄이 막대 안으로 들어간다.
          const scale = Math.max(target, actual) || 1
          const bar = { '--a': known ? ((actual / scale) * 100).toFixed(2) : '0', '--t': known ? ((target / scale) * 100).toFixed(2) : '0' }
          return (
            <div key={it.id} className={cx('it sk-row', highlight === i && 'is-hl', known && (met ? 'is-met' : 'is-miss'), demo && 'is-demo')}>
              <div className="sk-name">
                <IT i={i} k="title" className="sk-title" />
                <IT i={i} k="body" className="sk-body" />
              </div>
              <div className="sk-bar" style={bar} aria-hidden="true">
                <span className="sk-fill" />
                {/* 목표를 넘은 만큼, 또는 목표까지 모자란 만큼을 목표 줄에 붙여 따로 칠한다 */}
                {known && actual !== target && <span className="sk-diff" />}
                {known && <span className="sk-mark" />}
              </div>
              {sideEdit && i === 0 && (
                <>
                  <Label k="metaTitle" fallback="목표" className="sk-h sk-k sk-kt" />
                  <Label k="valueTitle" fallback="실적" className="sk-h sk-k sk-kv" />
                </>
              )}
              <IT i={i} k="meta" className="sk-target sk-num" />
              <IT i={i} k="value" className="sk-value sk-num" />
              <span className="sk-rate sk-num">{percent !== null && Number.isFinite(percent) ? `${Math.round(percent)}%` : '–'}</span>
              <ItemTools i={i} />
            </div>
          )
        })}
      </div>
    </>
  )
}

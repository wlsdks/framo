// 부품: 설문 결과 (likert). 모양은 styles/blocks/likert.css, 움직임은 motion/engine.ts의 nativeAuto, 셈은 slides/likert.ts

import type { CSSProperties } from 'react'
import { BLOCKS } from '../../deck/blocks'
import { isBlankItem, readField } from '../../deck/fields'
import { hintFor } from '../../deck/layouts'
import { cx } from '../../lib/cx'
import { demoOf, useSlide } from '../context'
import { IT, ItemTools, T, textUnits } from '../fields'
import { likertHead, likertLevels, likertNames, likertRow, likertSides, likertSpan, type LikertSide } from '../likert'
import { accentTint, greyTint } from '../tints'
import { ChartKey, pctText, tokensOf } from './parts'

/** 단계마다 적은 값 하나: 숫자 뒤의 짧은 단위('45%', '56명')는 읽고 넘긴다. 숫자가 아니면 null */
function amountOf(text: string): number | null {
  const m = text.replace(/,/g, '').match(/^\s*\+?(\d+(?:\.\d+)?)\s*[^\d\s.]{0,3}\s*$/)
  return m ? Number(m[1]) : null
}

/**
 * 단계의 색: 강조하는 쪽(긍정 쪽 강조면 그렇다, 매우 그렇다)은 강조색 농담(0 선에서 먼 단계일수록 진하게), 반대쪽은 회색 농담,
 * 보통은 가장 옅은 회색. 강조색은 답에만 쓴다: 부정 쪽까지 강조색이면 어느 쪽이 답인지 흐렸다
 */
function tintOf(side: LikertSide, far: number, hot: LikertSide): string {
  if (side === 'neu') return greyTint(4)
  return side === hot ? accentTint(far) : greyTint(far)
}

/**
 * 설문 결과: 질문마다 답의 비율을 막대 하나에 쌓되, 부정은 가운데 선 왼쪽, 긍정은 오른쪽, 보통은 선에 반씩 걸쳐 둔다(갈라 쌓은 막대).
 * 모든 질문이 같은 가운데 선을 써서 긍정이 많은 질문은 막대가 오른쪽으로 길게 보인다. 줄 끝에 강조하는 쪽의 합계(긍정 합계, 강조색).
 * 값은 단계마다 쉼표로 적는다(비율도 응답 수도 된다: 합 100으로 맞춘다). 단계 이름을 비우면 단계 수에 맞는 흔한 이름
 */
export function Likert() {
  const { slide, meta, mode } = useSlide()
  const items = slide.items.slice(0, BLOCKS.likert.items!.max)
  const demo = demoOf(mode, items)
  const hot: LikertSide = slide.variant === 'neg' ? 'neg' : 'pos'
  const valueText = (i: number) => (demo ? hintFor(slide.layout, slide.hints, 'value', 'value', i) : items[i].value)
  const tokens = items.map((_, i) => tokensOf(valueText(i)))
  const amounts = tokens.map((row) => row.map(amountOf))
  const scaleText = readField(slide, meta, 'scale').trim()
  const levels = likertLevels(scaleText, amounts)
  const names = likertNames(scaleText, levels)
  const sides = likertSides(levels)
  const rows = amounts.map((a) => likertRow(a, levels))
  const span = likertSpan(rows)
  const width = span.left + span.right
  // 0 선에서 먼 차례 (색의 진하기): 부정은 첫 단계가, 긍정은 끝 단계가 가장 멀다
  const far = sides.map((side, j) => (side === 'neg' ? j : side === 'pos' ? levels - 1 - j : 0))
  // 읽을 수 없는 질문: 글이 있는데 단계마다 숫자가 하나씩이 아니면 편집할 때 알린다
  const broken = mode === 'edit' && !demo && items.some((it, i) => !isBlankItem(it) && it.value.trim() && !rows[i])
  // 질문 칸의 너비(em, 가장 긴 질문)와 합계 칸의 너비: CSS가 칸 너비의 일부까지로 셈한다
  const shownTitle = (i: number) => items[i].title.trim() || (mode !== 'final' ? hintFor(slide.layout, slide.hints, 'title', 'title', i) : '')
  const vars = {
    '--lk-x': ((span.left / width) * 100).toFixed(3),
    '--lk-qu': Math.max(4, ...items.map((_, i) => textUnits(shownTitle(i)))).toFixed(2),
  } as CSSProperties
  const head = rows.some(Boolean) ? likertHead(names, hot) : ''
  return (
    <div className={cx('bk-lk', `is-${hot}`, demo && 'is-demo')} style={vars} data-levels={levels}>
      <T k="heading" as="h3" className="bk-h" fit={[18, 32]} multiline />
      {broken && <p className="bk-cc-sum bk-lk-warn">질문마다 숫자를 {levels}개씩 쉼표로 적어 주세요(단계마다 하나).</p>}
      {/* 머리 줄은 질문 줄들과 같은 칸 나눔(grid)에 선다: 응답 수는 질문 칸 위, 단계 색 표시는 막대 칸 위, 합계의 머리는 합계 숫자들 위 */}
      <div className="bk-lk-grid">
        <ChartKey
          unitKey="basis"
          keys={
            <span className="bk-lk-keywrap">
              <span className="bk-lk-keys">
                {names.map((name, j) => (
                  <span key={j} className="bk-cc-lk" style={{ '--c': tintOf(sides[j], far[j], hot) } as CSSProperties}>
                    <i aria-hidden="true" />
                    {name}
                  </span>
                ))}
              </span>
              {/* 단계 이름은 표시 줄 위에서 고친다 (올리거나 누르면 글이 보인다) */}
              {mode === 'edit' && <T k="scale" className="bk-lk-scaleed on-chart" oneLine />}
            </span>
          }
        />
        {head && <p className="bk-lk-th">{head}</p>}
        <ul className="bk-lk-list" data-n={items.length}>
          {items.map((it, i) => {
            const row = rows[i]
            // 막대의 시작: 가운데 선에서 이 질문의 왼쪽 몫(부정과 보통의 반)만큼 왼쪽
            const start = row ? ((span.left - (row.neg + row.neu / 2)) / width) * 100 : 0
            let at = 0
            const total = row ? (hot === 'neg' ? row.neg : row.pos) : null
            return (
              <li key={it.id} className={cx('it bk-lk-row', !row && 'is-blank')}>
                <IT i={i} k="title" className="bk-lk-q" />
                <div className="bk-lk-track">
                  <span className="bk-lk-axis" aria-hidden="true" />
                  {row && (
                    <span className="bk-lk-bar" aria-hidden="true" style={{ '--o': start.toFixed(3), '--w': ((100 / width) * 100).toFixed(3) } as CSSProperties}>
                      {row.shares.map((share, j) => {
                        const left = at
                        at += share
                        const n = pctText(share)
                        return share > 0 ? (
                          <span
                            key={j}
                            className={cx('bk-lk-seg', `is-${sides[j]}`, sides[j] === hot && far[j] === 0 && 'is-strong')}
                            style={{ '--l': left.toFixed(3), '--s': share.toFixed(3), background: tintOf(sides[j], far[j], hot) } as CSSProperties}
                          >
                            {/* 칸 안 숫자는 칸이 숫자보다 넓을 때만: 숫자의 글자 수(is-w2~4)마다 CSS가 칸 너비로 숨긴다. 1% 미만은 적지 않는다 */}
                            {share >= 1 && <span className={cx('bk-lk-n', `is-w${Math.min(4, Math.max(2, n.length))}`)}>{n}</span>}
                          </span>
                        ) : null
                      })}
                    </span>
                  )}
                  {mode === 'edit' && <IT i={i} k="value" className="bk-lk-in on-chart" oneLine />}
                </div>
                <span className="bk-lk-tot">{total !== null && pctText(total)}</span>
                <ItemTools i={i} />
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

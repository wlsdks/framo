// 부품: 계산식 (calc). 모양은 styles/blocks/calc.css, 움직임은 motion/engine.ts의 nativeAuto, 셈은 slides/calc.ts

import type { CSSProperties } from 'react'
import { BLOCKS } from '../../deck/blocks'
import { readField } from '../../deck/fields'
import { hintFor } from '../../deck/layouts'
import { cx } from '../../lib/cx'
import { calcCheck, calcNeed, opOf } from '../calc'
import { demoOf, useSlide } from '../context'
import { IT, ItemTools, numberUnits, T } from '../fields'

/**
 * 계산식: 효과를 셈한 장의 '1,200시간 × 4만 원 × 10명 = 4.8억 원'. 넓으면 한 줄에 값마다 칸 하나(숫자 아래에 이름)를 두고
 * 사이에 셈 기호, 끝에 = 와 결과(강조색, 이름은 '결과의 이름'). 숫자는 모두 같은 크기(모든 숫자가 한 줄에 드는 크기)라 글자
 * 밑줄이 한 줄에 서고, 칸은 제 숫자의 폭만큼이라 기호 양옆이 늘 같다. 칸이 좁아 숫자가 너무 작아지면 영수증처럼 쌓는다: 줄마다 기호, 이름, 오른쪽 끝에 값, 합계 선 아래 = 결과.
 * 셈 기호를 비우면 곱하기. 적은 결과가 셈과 다르면 편집할 때만 알려 준다(결과는 사람이 적은 그대로 보인다)
 */
export function Calc() {
  const { slide, meta, mode, folds } = useSlide()
  const items = slide.items.slice(0, BLOCKS.calc.items!.max)
  const demo = demoOf(mode, items)
  // 편집할 때 빈 값은 안내 글이 그 자리에 보이므로 안내 글의 폭으로 크기를 고른다
  const shown = (i: number) => (items[i].value.trim() || (mode !== 'final' ? hintFor(slide.layout, slide.hints, 'value', 'value', i) : '')).trim()
  const values = items.map((_, i) => shown(i))
  const ops = items.map((it, i) => (i === 0 ? null : opOf(demo ? hintFor(slide.layout, slide.hints, 'meta', 'meta', i) : it.meta)))
  const result = readField(slide, meta, 'result').trim()
  const resultShown = result || (mode !== 'final' ? hintFor(slide.layout, slide.hints, 'result') : '')
  const withResult = !!resultShown
  // 그려지는 숫자들(결과까지)의 폭: 한 줄 꼴은 폭을 더한 것으로 숫자 크기를 정하고, 쌓은 꼴은 값들 가운데 가장 긴 것으로
  // 값 칸의 너비를, 결과는 제 폭으로 결과 칸의 너비를 정한다(결과는 두 단계 커서 값 칸의 너비로 잡으면 이름 칸이 좁아졌다)
  const nums = withResult ? [...values, resultShown] : values
  const widths = nums.map((t) => numberUnits(t || '0'))
  const units = Math.max(...widths.slice(0, values.length))
  const resultUnits = numberUnits(resultShown || '0')
  const sum = widths.reduce((a, b) => a + b, 0)
  const need = calcNeed(nums)
  const check = mode === 'edit' && !demo && result ? calcCheck(items.map((it) => it.value), ops, result) : null
  // 기호 칸: 편집할 때는 적는 칸(비었으면 안내 글 ×), 발표할 때는 읽은 기호(읽을 수 없으면 적은 글 그대로).
  // 기호 칸은 처음에 접혀 있어서(칸 더하기로 연다) 접힌 채 비었으면 편집할 때도 읽은 기호(×)를 그린다: 접힌 빈 칸은 그려지지 않아
  // 값 사이가 비었다. 자리(숫자 줄의 가운데 높이)는 감싼 칸이 잡고, 글자는 그 안에서 크기를 물려받는다
  const symFolded = !!folds?.has('items.meta')
  const op = (i: number) => (
    <span className="bk-ca-op">
      {mode === 'final' || (symFolded && !items[i].meta.trim()) ? (
        <span aria-hidden="true">{ops[i] ?? items[i].meta.trim()}</span>
      ) : (
        <IT i={i} k="meta" as="span" className="bk-ca-sym" />
      )}
    </span>
  )
  const n = nums.length
  return (
    <div
      className={cx('bk-ca', demo && 'is-demo')}
      data-need={need}
      data-n={n}
      style={{ '--ca-units': units.toFixed(2), '--ca-ru': resultUnits.toFixed(2), '--ca-sum': sum.toFixed(2), '--ca-n': n } as CSSProperties}
    >
      <div className="bk-ca-row">
        {items.map((it, i) => (
          <div key={it.id} className={cx('it bk-ca-term', i === 0 && 'is-first')}>
            {i > 0 && op(i)}
            <div className="bk-ca-cell">
              <div className="bk-ca-vbox">
                <IT i={i} k="value" as="p" className="bk-ca-v" numeral oneLine units={units} />
              </div>
              <IT i={i} k="title" as="p" className="bk-ca-name" />
            </div>
            <ItemTools i={i} />
          </div>
        ))}
        {/* 결과: 합계 선(쌓았을 때) 아래 = 와 결과. 이름은 결과의 이름 칸 */}
        {withResult && (
          <div className="bk-ca-term bk-ca-result">
            <span className="bk-ca-op bk-ca-eq" aria-hidden="true">
              =
            </span>
            <div className="bk-ca-cell">
              <div className="bk-ca-vbox">
                <T k="result" as="p" className="bk-ca-v" numeral oneLine units={resultUnits} />
              </div>
              <T k="label" as="p" className="bk-ca-name" />
            </div>
          </div>
        )}
      </div>
      <T k="note" as="p" className="bk-ca-n" multiline />
      {/* 조사(이에요, 예요)가 값의 끝소리에 따라 바뀌어서 괄호로 */}
      {check && !check.ok && <p className="bk-ca-n bk-ca-warn">셈한 값({check.expect})과 결과가 달라요. 값이나 결과를 확인해 주세요.</p>}
    </div>
  )
}

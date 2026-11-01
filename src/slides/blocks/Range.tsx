// 부품: 범위 (range). 모양은 styles/blocks/range.css, 움직임은 motion/engine.ts의 nativeAuto

import type { CSSProperties } from 'react'
import { readField } from '../../deck/fields'
import { cx } from '../../lib/cx'
import { useSlide } from '../context'
import { T } from '../fields'
import { amountPair } from '../numbers'
import { useDemo } from './parts'

/**
 * 범위 양 끝과 표시가 눈금 위 어디인지 (0~100). 양 끝 바깥에 범위 너비의 4분의 1씩 여유를 둬서 띠가 눈금 끝에 붙지 않는다.
 * 여유를 더 두면 띠가 좁아져 3칸 너비에서 양 끝 값이 띠 위 한 줄에 들지 않았다
 */
export function rangeOf(low: string, high: string, mark: string): { lo: number; hi: number; m: number | null } | null {
  const pair = amountPair(low, high)
  if (!pair) return null
  // 시작과 끝을 바꿔 그리면 작성한 왼쪽 값이 오른쪽 값의 자리에 표시된다. 역순이면 원문만 남긴다.
  if (pair.a.base > pair.b.base) return null
  const a = pair.a.base
  const b = pair.b.base
  const mp = mark.trim() ? amountPair(low, mark) : null
  const m = mp ? mp.b.base : null
  const min = Math.min(a, m ?? a)
  const max = Math.max(b, m ?? b)
  const pad = max > min ? (max - min) * 0.25 : Math.abs(max) * 0.5 || 1
  const at = (v: number) => ((v - (min - pad)) / (max - min + pad * 2)) * 100
  const result = { lo: at(a), hi: at(b), m: m === null ? null : at(m) }
  // 값 각각이 유한해도 양 끝의 차이나 여백이 표현 범위를 넘으면 눈금 위치는 계산할 수 없다.
  return Number.isFinite(result.lo) && Number.isFinite(result.hi) && (result.m === null || Number.isFinite(result.m)) ? result : null
}

/**
 * 범위: 이름, 양 끝 값, 가는 눈금 위의 범위 띠(강조색), 지금 값 같은 표시(글자색 고리)와 그 이름.
 * 양 끝 값은 띠의 양 끝 위에, 표시의 이름은 고리 아래에 그 자리를 따라 둔다(range.css). 값을 견줄 수 없으면 그림 없이 글만
 */
export function Range() {
  const { mode, folds, slide, meta } = useSlide()
  const { demo, read } = useDemo(['low', 'high'])
  // 예시로 그리는 것은 양 끝만: 고를 때만 여는 표시까지 안내 문구로 채우면 적지 않은 고리가 그려진다
  const own = (k: string) => readField(slide, meta, k)
  const g = rangeOf(read('low'), read('high'), own('mark'))
  const markOpen = !!own('mark').trim() || !!own('markName').trim() || (mode !== 'final' && (!folds?.has('mark') || !folds?.has('markName')))
  const style = { '--lo': (g?.lo ?? 0).toFixed(2), '--hi': (g?.hi ?? 100).toFixed(2), '--m': (g?.m ?? 0).toFixed(2) } as CSSProperties
  return (
    <div className={cx('bk-rn', demo && 'is-demo', !g && 'is-text')} style={style}>
      <T k="label" className="bk-rn-l" />
      <p className="bk-rn-ends">
        <T k="low" as="span" className="bk-rn-lo" numeral />
        {/* 발표할 때 한쪽 끝을 비웠으면 사이의 '–'도 두지 않는다: '– 24°C'처럼 줄표만 빈 쪽을 가리켰다 */}
        {!g && (mode !== 'final' || (!!read('low').trim() && !!read('high').trim())) && <span className="bk-rn-dash">–</span>}
        <T k="high" as="span" className="bk-rn-hi" numeral />
      </p>
      {g && (
        <div className="bk-rn-fig" aria-hidden="true">
          <span className="bk-rn-band" />
          {g.m !== null && <span className="bk-rn-mark" />}
        </div>
      )}
      {markOpen && (
        <p className={cx('bk-rn-mk', g?.m == null && 'is-free')}>
          <span className="bk-rn-ml">
            <T k="markName" as="span" className="bk-rn-mn" />
            <T k="mark" as="span" className="bk-rn-mv" />
          </span>
        </p>
      )}
      <T k="note" className="bk-rn-n" multiline />
    </div>
  )
}

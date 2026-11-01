// 부품: 목표 대비 (goal). 모양은 styles/blocks/goal.css

import { cx } from '../../lib/cx'
import { useSlide } from '../context'
import { T } from '../fields'
import { amountPair, formatNumber, unitAfter } from '../numbers'
import { useDemo } from './parts'

export function Goal() {
  const { mode } = useSlide()
  const { demo, read } = useDemo(['value', 'target'])
  // 단위 칸('억 원')으로 숫자만 적은 값을 읽고, 따로 적은 자리('7,200만 / 1억')나 단위('50분 / 2시간')는 같은 기준으로 바꿔 나눈다
  const pair = amountPair(read('value'), read('target'), read('unit'))
  const ratio = pair && pair.b.base > 0 && pair.a.base >= 0 ? (pair.a.base / pair.b.base) * 100 : null
  const pct = ratio !== null && Number.isFinite(ratio) ? ratio : null
  // 발표할 때 실적이나 목표를 비웠으면 그 쪽의 표시(단위, '/ 목표')와 채울 수 없는 막대, 비율 자리의 '–'를 두지 않는다:
  // '억 원 / 목표 10억 원', '7.2억 원 / 목표 억 원'처럼 단위와 표시만 남았다
  const final = mode === 'final'
  const has = (k: string) => !final || !!read(k).trim()
  const unit = read('unit').trim()
  return (
    <div className={cx('bk-gl', demo && 'is-demo', pct !== null && pct >= 100 && 'is-met')} style={{ '--p': Math.min(100, Math.max(0, pct ?? 0)).toFixed(1) }}>
      <div className="bk-gl-top">
        <T k="label" className="bk-gl-l" />
        {/* 큰 숫자처럼 단위(%)는 두 단계 작게: 같은 장의 전과 후, 큰 숫자와 꼴이 같다 */}
        <span className="bk-gl-pct">
          {pct === null ? (
            !final && '–'
          ) : (
            <>
              {formatNumber(Math.round(pct))}
              <span className="u">%</span>
            </>
          )}
        </span>
      </div>
      {(pct !== null || !final) && (
        <div className="bk-gl-bar" aria-hidden="true">
          <span className="bk-gl-fill" />
        </div>
      )}
      <p className="bk-gl-of">
        {has('value') && (
          <span className="bk-gl-num">
            <T k="value" as="span" className="bk-gl-v" />
            {/* 단위는 한 번만 적고 실적과 목표에 같이 붙인다 */}
            {mode !== 'edit' && unitAfter(read('value'), unit) && <span className="bk-gl-vu">{unitAfter(read('value'), unit)}</span>}
          </span>
        )}
        {has('target') && (
          <>
            <span className="bk-gl-sep">{has('value') ? '/ 목표' : '목표'}</span>
            <span className="bk-gl-num">
              <T k="target" as="span" className="bk-gl-t" />
              {mode === 'edit' ? <T k="unit" as="span" className="bk-gl-u" /> : unitAfter(read('target'), unit) && <span className="bk-gl-u">{unitAfter(read('target'), unit)}</span>}
            </span>
          </>
        )}
      </p>
      <T k="note" className="bk-gl-n" multiline />
    </div>
  )
}

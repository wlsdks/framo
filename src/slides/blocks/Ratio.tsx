// 부품: 몇 중 몇 (ratio). 모양은 styles/blocks/ratio.css

import { cx } from '../../lib/cx'
import { useSlide } from '../context'
import { T } from '../fields'
import { amountPair, unitAfter } from '../numbers'
import { PersonIcon, useDemo } from './parts'

/** 몇 중 몇: 전체가 20개까지면 점 하나가 하나, 더 많으면 점 100개로 백분율 */
export function Ratio() {
  const { mode } = useSlide()
  const { demo, read } = useDemo(['value', 'total'])
  const unit = read('unit').trim()
  const valueText = read('value').trim()
  const totalText = read('total').trim()
  const valueUnit = unitAfter(valueText, unit)
  const totalUnit = unitAfter(totalText, unit)
  // 몇과 전체를 전체에 적은 단위로 맞춘다('180분 중 3시간'). 자리는 그대로 둬서 '1만 명'의 점은 1개가 아니라 백분율
  const pair = amountPair(valueText, totalText, unit)
  const per = pair ? pair.b.scale / pair.b.place : 1
  const value = pair && pair.a.base / per
  const total = pair && pair.b.base / per
  const ok = value !== null && total !== null && total > 0 && value >= 0 && value <= total
  const exact = ok && total <= 20 && Number.isInteger(total) && Number.isInteger(value)
  const n = !ok ? 0 : exact ? total : 100
  const on = !ok ? 0 : exact ? Math.round(Math.min(Math.max(value, 0), total)) : Math.round(Math.min(1, Math.max(0, value / total)) * 100)
  const cols = n <= 10 ? Math.max(1, n) : n <= 20 ? Math.ceil(n / 2) : 20
  // 높이가 남는 칸에서는 줄을 늘려 점을 키운다 (10개면 다섯씩 두 줄, 100개면 열씩 열 줄)
  const tall = n <= 10 ? Math.max(1, Math.ceil(n / 2)) : n <= 20 ? Math.ceil(n / 4) : 10
  // 한 줄로 늘어놓는 배치(cols)가 줄을 늘린 배치(tall)보다 점이 커지는 칸의 가로세로 비율. 둘 다 칸에 맞춰 점 크기를 정하니
  // (가로 cols개와 사이 0.3) ÷ (세로 줄 수와 사이 0.3)에서 갈린다. 칸의 컨테이너 쿼리가 고르게 0.5 단계로 (blocks.css)
  const flat = Math.min(5.5, Math.max(1, Math.round(((cols * 1.3 - 0.3) / (Math.ceil(n / tall) * 1.3 - 0.3)) * 2) / 2))
  // 사람을 센 것이면 점 대신 사람 모양
  const person = /^(명|분|사람|인)$/.test(unit)
  // 발표할 때 전체나 몇을 비웠으면 그 줄의 단위와 '중'을 두지 않는다: '곳 중', 큰 글자의 '곳'처럼 단위만 남았고, 몇이 없으면
  // '10곳 중'이 뒤에 올 숫자를 기다렸다
  const has = (k: string) => mode !== 'final' || !!read(k).trim()
  return (
    <div
      className={cx('bk-rt', demo && 'is-demo')}
      // 점 칸의 높이(blocks.css의 .bk-rt-box)도 줄 수로 정해서 위에 둔다
      style={{ '--cols': cols, '--rows': Math.ceil(n / cols), '--cols-t': tall, '--rows-t': Math.ceil(n / tall) }}
    >
      <div className="bk-rt-text">
        <T k="label" className="bk-rt-l" />
        {has('total') && (
          <p className="bk-rt-of">
            <span className="bk-rt-num">
              <T k="total" as="span" className="bk-rt-t" />
              {/* 단위는 한 번만 적고 전체와 몇에 같이 붙인다 */}
              {mode === 'edit' ? <T k="unit" as="span" className="bk-rt-u" /> : totalUnit && <span className="bk-rt-u">{totalUnit}</span>}
            </span>
            {has('value') && <span className="bk-rt-sep">중</span>}
          </p>
        )}
        {has('value') && (
          <p className="bk-rt-big">
            <T k="value" as="span" className="bk-rt-v" />
            {mode !== 'edit' && valueUnit && <span className="bk-rt-vu">{valueUnit}</span>}
          </p>
        )}
        <T k="note" className="bk-rt-n" multiline />
        {mode === 'edit' && !demo && !!valueText && !!totalText && !ok && <p className="bk-rt-n">0 이상이고 전체보다 크지 않은 숫자를 적어 주세요.</p>}
      </div>
      {n > 0 && (
        <div className="bk-rt-box" aria-hidden="true">
          <div className={cx('bk-rt-dots', !exact && 'is-pct')} data-kind={person ? 'person' : 'dot'} data-flat={flat}>
            {Array.from({ length: n }, (_, i) => (
              <span key={i} className={cx('bk-rt-d', i < on && 'is-on')}>
                {person && <PersonIcon />}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

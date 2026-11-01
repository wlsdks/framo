// 부품: 비율 원 (ring). 모양은 styles/blocks/ring.css

import { cx } from '../../lib/cx'
import { readPercent } from '../../deck/percent'
import { useSlide } from '../context'
import { T } from '../fields'
import { useDemo } from './parts'

/** 비율 원: 가운데에 비율, 둘레가 그만큼 찬다 */
/** 반원 게이지의 호: 왼쪽 끝(0%)에서 오른쪽 끝(100%)까지. 가운데(50, 52)를 축으로 돈다 */
const GAUGE_ARC = 'M 8 52 A 42 42 0 0 1 92 52'

export function Ring() {
  const { slide } = useSlide()
  const { demo, read } = useDemo(['value'])
  const text = read('value')
  // 비율이 아닌 단위나 범위 밖의 숫자를 잘라 그리면 원문과 다른 뜻이 된다.
  const v = readPercent(text)
  const p = v ?? 0
  if (slide.variant === 'gauge')
    return (
      <div className={cx('bk-rg is-gauge', v === null && 'is-unknown', demo && 'is-demo')} style={{ '--p': String(p) }}>
        <T k="label" className="bk-rg-l" />
        <div className="bk-rg-box">
          <div className="bk-rg-sq">
            {v !== null && (
              <svg viewBox="0 0 100 58" aria-hidden="true">
                <path className="bk-rg-track" d={GAUGE_ARC} pathLength="100" />
                {p > 0 && <path className="bk-rg-arc" d={GAUGE_ARC} pathLength="100" />}
                {/* 호의 끝을 따라가는 손잡이: 왼쪽 끝에 두고 가운데를 축으로 비율만큼 돌린다 */}
                <g className="bk-rg-knob">
                  <circle cx="8" cy="52" r="5.2" />
                </g>
              </svg>
            )}
            <div className="bk-rg-c">
              <T k="value" className="bk-rg-v" oneLine numeral />
            </div>
          </div>
        </div>
        <T k="note" className="bk-rg-n" multiline />
      </div>
    )
  return (
    <div className={cx('bk-rg', v === null && 'is-unknown', demo && 'is-demo')} style={{ '--p': String(p) }}>
      <T k="label" className="bk-rg-l" />
      <div className="bk-rg-box">
        <div className="bk-rg-sq">
          {v !== null && (
            <svg viewBox="0 0 100 100" aria-hidden="true">
              <circle className="bk-rg-track" cx="50" cy="50" r="44" />
              {p > 0 && <circle className="bk-rg-arc" cx="50" cy="50" r="44" pathLength="100" />}
            </svg>
          )}
          <div className="bk-rg-c">
            <T k="value" className="bk-rg-v" oneLine numeral />
          </div>
        </div>
      </div>
      <T k="note" className="bk-rg-n" multiline />
    </div>
  )
}

// 부품: 막대 하나 (meter). 모양은 styles/blocks/meter.css, 움직임은 motion/engine.ts의 nativeAuto

import type { CSSProperties } from 'react'
import { readField } from '../../deck/fields'
import { cx } from '../../lib/cx'
import { useSlide } from '../context'
import { T } from '../fields'
import { amountPair, readAmount } from '../numbers'
import { useDemo } from './parts'

/** 막대 밖의 값은 끝으로 잘라 다른 값처럼 보이지 않게 그리지 않는다. */
const fraction = (x: number) => Number.isFinite(x) && x >= 0 && x <= 1 ? x : null

/**
 * 막대의 길이와 목표 눈금의 자리(0~1). 적은 글은 그대로 두고 모양만 읽는다:
 * 전체를 적었으면 전체에 대한 몫('3.6억 원' / '5억 원'), 아니면 백분율('72%'), 아니면 목표까지 가운데 큰 쪽에 대한 몫.
 * 셋 다 아니면(숫자를 읽을 수 없거나 견줄 것이 없으면) 막대를 그리지 않는다
 */
export function meterOf(value: string, of: string, target: string): { p: number; t: number | null } | null {
  if (of.trim()) {
    const pair = amountPair(value, of)
    if (!pair || pair.b.base <= 0) return null
    const tp = target.trim() ? amountPair(target, of) : null
    const p = fraction(pair.a.base / pair.b.base)
    return p === null ? null : { p, t: tp ? fraction(tp.a.base / tp.b.base) : null }
  }
  const a = readAmount(value)
  if (a?.kind === '%') {
    const t = target.trim() ? readAmount(target) : null
    const p = fraction(a.base / 100)
    return p === null ? null : { p, t: t?.kind === '%' ? fraction(t.base / 100) : null }
  }
  const pair = target.trim() ? amountPair(value, target) : null
  if (!pair) return null
  const top = Math.max(pair.a.base, pair.b.base)
  if (top <= 0) return null
  const p = fraction(pair.a.base / top)
  const t = fraction(pair.b.base / top)
  return p === null || t === null ? null : { p, t }
}

/**
 * 막대 하나: 이름과 숫자 한 줄, 그 아래 가는 막대 하나. 목표가 있으면 막대를 가로지르는 글자색 눈금과 그 이름.
 * 목표 대비(goal)보다 작고 조용하게: 숫자가 답이고 막대는 그 몫을 보이는 그림이다
 */
export function Meter() {
  const { mode, folds, slide, meta } = useSlide()
  const { demo, read } = useDemo(['value'])
  // 예시로 그리는 것은 숫자만: 고를 때만 여는 칸(전체, 목표)까지 안내 문구로 채우면 적지 않은 눈금이 그려진다
  const own = (k: string) => readField(slide, meta, k)
  const m = meterOf(read('value'), own('of'), own('target'))
  const open = (k: string) => !!own(k).trim() || (mode !== 'final' && !folds?.has(k))
  // 발표할 때 숫자를 비웠으면 '/ 전체'도 두지 않는다: 나눌 숫자 없이 '/ 5억 원'만 남았다
  const ofOpen = open('of') && (mode !== 'final' || !!read('value').trim())
  const targetOpen = open('target')
  const nameOpen = !!own('targetName').trim() || (mode === 'edit' && !folds?.has('targetName'))
  const style = { '--p': ((m?.p ?? 0) * 100).toFixed(2), '--t': ((m?.t ?? 0) * 100).toFixed(2) } as CSSProperties
  return (
    <div className={cx('bk-mt', demo && 'is-demo', !m && 'is-text')} style={style}>
      <T k="label" className="bk-mt-l" />
      <p className="bk-mt-fig">
        <T k="value" as="span" className="bk-mt-v" numeral />
        {ofOpen && (
          <span className="bk-mt-of">
            <span className="bk-mt-sep">/</span>
            <T k="of" as="span" className="bk-mt-ofv" />
          </span>
        )}
      </p>
      {m && (
        <div className="bk-mt-bar" aria-hidden="true">
          <span className="bk-mt-fill" />
          {m.t !== null && <span className="bk-mt-tick" />}
        </div>
      )}
      {targetOpen && (
        <p className={cx('bk-mt-tg', m?.t == null && 'is-free')}>
          <span className="bk-mt-tl">
            {nameOpen ? <T k="targetName" as="span" className="bk-mt-tn" /> : <span className="bk-mt-tn">목표</span>}
            <T k="target" as="span" className="bk-mt-tv" />
          </span>
        </p>
      )}
    </div>
  )
}

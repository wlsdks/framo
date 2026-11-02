// 부품: 원인 캐기 (whys). 모양은 styles/blocks/whys.css, 움직임은 motion/engine.ts의 nativeAuto

import type { CSSProperties } from 'react'
import { BLOCKS } from '../../deck/blocks'
import { isBlankItem, readField } from '../../deck/fields'
import { cx } from '../../lib/cx'
import { useSlide } from '../context'
import { IT, ItemTools, T } from '../fields'

/**
 * 원인 캐기: 드러난 문제에서 '왜?'를 거듭해 한 단씩 깊이 내려가고, 마지막 원인을 근본 원인으로 짚는다.
 * 계단(기본)은 단마다 오른쪽으로 들이고 앞 단 아래에서 꺾인 선(└)으로 잇는다: 캐 들어간 깊이가 그대로 보인다.
 * 가로는 같은 차례를 왼쪽에서 오른쪽으로 늘어놓는다(넓고 낮은 칸). 좁은 칸에서는 가로도 계단으로 쌓는다(whys.css).
 * 발표할 때 빈 원인은 건너뛰어 계단에 빈 단이 없고, 채운 것 가운데 마지막이 근본 원인이다. 하나도 채우지 않았으면 문제만
 */
export function Whys() {
  const { slide, meta, mode } = useSlide()
  const all = slide.items.slice(0, BLOCKS.whys.items!.max).map((item, i) => ({ item, i }))
  const shown = mode === 'final' ? all.filter(({ item }) => !isBlankItem(item)) : all
  // 문제를 비우고 발표하면 문제 단을 빼고 첫 원인부터 (잇는 선 없이)
  const lead = mode !== 'final' || readField(slide, meta, 'problem').trim() ? 1 : 0
  return (
    <div className={cx('bk-wy', slide.variant === 'across' && 'is-across')} data-steps={shown.length + lead}>
      <T k="heading" as="h3" className="bk-h" fit={[18, 32]} multiline />
      <ol className="bk-wy-list">
        {lead > 0 && (
          <li className="bk-wy-step is-problem">
            <span className="bk-wy-k">문제</span>
            <T k="problem" className="bk-wy-t" multiline />
          </li>
        )}
        {shown.map(({ item, i }, n) => {
          const depth = n + lead
          const root = n === shown.length - 1
          return (
            <li key={item.id} className={cx('it bk-wy-step', root && 'is-root')} style={{ '--wy-d': depth } as CSSProperties}>
              {depth > 0 && <span className="bk-wy-link" aria-hidden="true" />}
              <span className="bk-wy-k">{root ? '근본 원인' : '왜?'}</span>
              <div className="bk-wy-text">
                <IT i={i} k="title" className="bk-wy-t" multiline />
                <IT i={i} k="meta" className="bk-wy-m" />
              </div>
              <ItemTools i={i} />
            </li>
          )
        })}
      </ol>
    </div>
  )
}

// 부품: 흐름 (flow). 모양은 styles/blocks/flow.css, 움직임은 motion/engine.ts의 nativeAuto

import { Fragment } from 'react'
import { BLOCKS } from '../../deck/blocks'
import { isBlankItem, readField } from '../../deck/fields'
import { cx } from '../../lib/cx'
import { useSlide } from '../context'
import { IT, ItemTools, T } from '../fields'

/** 강조할 단계: 고른 것이 있으면 그것(-1은 강조 없음), 없으면 마지막(흐름이 닿는 곳) */
export function flowHighlight(chosen: number | undefined, n: number): number {
  if (chosen === undefined) return n - 1
  return Number.isInteger(chosen) && chosen >= -1 && chosen < n ? chosen : n - 1
}

/**
 * 흐름: 단계(시스템)를 상자로 나란히 두고, 사이를 잇는 선으로 잇는다. 잇는 선은 보내는 상자 가장자리에 걸친 점에서 나와
 * 받는 상자 가장자리에 끝이 닿는 꽉 찬 머리로 끝난다(flow.css): 예전에는 칸 사이에 떠 있는 가는 선과 꺾쇠라 화살표 글자를
 * 쳐 넣은 것처럼 보였다. 발표할 때는 선이 그어지며 작은 데이터 조각이 선을 따라 건너가고, 닿는 단계가 받아서 나타난다.
 * 오가는 양은 단계마다 상자 아래 끝에 숫자로(나란한 단계끼리 한 줄에 선다).
 * 좁은 칸에서는 상자를 세로로 쌓고 선도 아래로 긋는다(flow.css): 나란히 두면 단계 이름이 두세 글자마다 꺾인다.
 * 단계는 상자로 두르지 않는다: 번호 줄을 잇는 가는 선 하나가 차례를 보여 준다(flow.css의 '상자 걷기')
 */
export function Flow() {
  const { slide, meta, mode, folds } = useSlide()
  const items = slide.items.slice(0, BLOCKS.flow.items!.max)
  // 발표할 때 뒤쪽의 빈 단계(가장 적은 수를 채우려 남긴 칸)는 감추므로, 고르지 않은 강조(흐름이 닿는 곳)는 채운 단계의 마지막에.
  // 그대로 두면 강조가 감춘 단계에 가서 흐름에 닿는 곳이 없었다
  const reach = mode === 'final' ? items.findLastIndex((it) => !isBlankItem(it)) + 1 : items.length
  const hl = flowHighlight(slide.options.highlight, reach)
  // 오가는 것은 비어 있으면 줄째 뺀다 (편집할 때 '칸 더하기'로 열면 보인다)
  const key = !!readField(slide, meta, 'what').trim() || (mode !== 'final' && !folds?.has('what'))
  return (
    <div className="bk-fw" data-n={items.length}>
      {key && (
        <p className="bk-fw-key">
          {/* 범례: 단계 사이의 잇는 선을 줄인 것. '이 선으로 오가는 것'으로 읽힌다 */}
          <span className="bk-fw-kg" aria-hidden="true">
            <span className="bk-fw-wire" />
          </span>
          <T k="what" as="span" className="bk-fw-what" />
        </p>
      )}
      <div className="bk-fw-list">
        {items.map((it, i) => (
          <Fragment key={it.id}>
            {/* 단계 사이의 잇는 선: 점(::before), 선(.bk-fw-wire), 머리(::after). 앞 단계에서 다음 단계로 */}
            {i > 0 && (
              <span className="bk-fw-link" aria-hidden="true">
                <span className="bk-fw-wire" />
              </span>
            )}
            <div className={cx('it bk-fw-node', i === hl && 'is-hl')}>
              {/* 단계 번호: 차례는 화살표 머리가 아니라 번호로 읽는다. 번호 줄에 단계 사이의 선이 이어진다(flow.css) */}
              <span className="bk-fw-i" aria-hidden="true">
                {String(i + 1).padStart(2, '0')}
              </span>
              <div className="bk-fw-text">
                <IT i={i} k="title" className="bk-fw-t" />
                <IT i={i} k="meta" className="bk-fw-m" />
              </div>
              <IT i={i} k="value" className="bk-fw-v" numeral />
              <ItemTools i={i} />
            </div>
          </Fragment>
        ))}
      </div>
    </div>
  )
}

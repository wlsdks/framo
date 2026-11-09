// 부품: 시장 규모 (market). 모양은 styles/blocks/market.css

import { BLOCKS } from '../../deck/blocks'
import { isBlankItem } from '../../deck/fields'
import { cx } from '../../lib/cx'
import { useSlide } from '../context'
import { IT, ItemTools, T } from '../fields'
import { amountPair, readAmount } from '../numbers'

/** 규모를 읽지 못할 때 원의 지름(바깥 원에 견준 몫) */
const FIXED: Record<number, number[]> = { 2: [1, 0.46], 3: [1, 0.64, 0.32] }
/** 가장 안쪽 원의 가장 작은 지름(바깥 원에 견준 몫). 그 바깥 원은 이것의 두 배까지만 줄인다 */
const MIN_D = 0.1

/**
 * 원마다의 지름(바깥 원에 견준 몫). 규모를 단위까지 읽어 견줄 수 있고 바깥부터 작아지면 원의 넓이가 규모에 비례하게(지름은 규모의
 * 제곱근): 크기를 정해 두던 때는 3,200억 원이 2.4조 원의 13%인데 원의 넓이는 21%로 보였다(검수). 목표는 전체 시장의 1%도 안 되기
 * 일쑤라 비례하면 점이 되어서, 안쪽 원은 MIN_D(넓이 1%)까지만 줄인다: 그래도 '아주 작은 몫'으로 읽힌다. 지름 14%(넓이 2%)로 두던
 * 때는 180억 원이 3,200억 원의 5.6%인데 그림은 15%쯤으로 보였다(검수).
 * 하나라도 읽을 수 없거나(비었거나 숫자가 아니면) 단위가 달라 견줄 수 없거나 안쪽이 더 크면 정해 둔 크기
 */
export function marketSizes(values: string[]): number[] {
  const fixed = FIXED[values.length] ?? values.map(() => 1)
  if (values.length < 2) return fixed
  const amounts = values.map((v) => readAmount(v))
  if (amounts.some((a) => !a || !(a.base > 0)) || values.slice(1).some((v) => !amountPair(values[0], v))) return fixed
  const top = amounts[0]!.base
  const ds = amounts.map((a) => Math.sqrt(a!.base / top))
  if (ds.some((d, i) => i > 0 && d > ds[i - 1])) return fixed
  return ds.map((d, i) => (i === 0 ? 1 : Math.max(MIN_D * (values.length - i), Math.round(d * 1000) / 1000)))
}

/**
 * 시장 규모: 전체 시장, 공략할 시장, 목표를 바닥에 맞춰 겹친 원으로. 원의 넓이는 규모에 비례한다(아주 작은 목표는 보일 만큼,
 * marketSizes). 규모는 옆 목록의 큰 숫자로 읽는다
 */
export function Market() {
  const { slide, mode } = useSlide()
  const items = slide.items.slice(0, BLOCKS.market.items!.max)
  // 발표할 때 칸을 하나도 채우지 않은 시장(가장 적은 수를 채우려 남긴 빈 칸)은 원도 감춘다: 목록의 줄만 감추면 이름 없는
  // 강조색 원(목표)이 홀로 남았다. 자리는 그대로 두어 남은 원의 크기와 색이 목록의 표시와 어긋나지 않게 한다
  const blank = items.map((it) => mode === 'final' && isBlankItem(it))
  const sizes = marketSizes(items.map((it) => it.value))
  return (
    <div className="bk-mk" data-n={items.length}>
      <T k="heading" as="h3" className="bk-h" fit={[18, 32]} multiline />
      <div className="bk-mk-body">
        <div className="bk-mk-box" aria-hidden="true">
          <div className="bk-mk-fig">
            {items.map((it, i) => (
              <span key={it.id} className={cx('bk-mk-c', blank[i] && 'is-blank')} style={{ '--i': i, '--mk-d': sizes[i] }} />
            ))}
          </div>
        </div>
        <ol className="bk-mk-list">
          {items.map((it, i) => (
            <li key={it.id} className="it bk-mk-row" style={{ '--i': i }}>
              <span className="bk-mk-sw" aria-hidden="true" />
              <div className="bk-mk-text">
                <IT i={i} k="title" className="bk-mk-t" />
                <IT i={i} k="value" className="bk-mk-v" />
                <IT i={i} k="body" className="bk-mk-b" multiline />
              </div>
              <ItemTools i={i} />
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}

// 항목마다 칸 하나(.bk-cc-col)가 그래프 줄과 이름 줄을 subgrid로 나눠 쓴다. 막대 길이는 --p(0~100)로만 넘기고,
// 막대 위 숫자 자리는 CSS가 칸 높이에서 뺀다. 편집할 때 숫자는 막대 위 그 자리에서 고친다

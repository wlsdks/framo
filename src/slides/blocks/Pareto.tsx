// 부품: 원인 순위 (pareto)

import { BLOCKS } from '../../deck/blocks'
import { isBlankItem, readField } from '../../deck/fields'
import { hintFor } from '../../deck/layouts'
import type { ReactNode } from 'react'
import type { Item } from '../../deck/types'
import { cx } from '../../lib/cx'
import { demoOf, useSlide } from '../context'
import { IT, ItemTools, T } from '../fields'
import { seriesIn } from '../numbers'
import { ChartKey, pctText } from './parts'

/**
 * 원인 순위(파레토): 막대는 전체에서 그 원인이 차지하는 몫, 선은 앞에서부터 더한 몫. 둘이 같은 눈금(전체 = 100)이라
 * 눈금 하나로 읽는다(눈금 둘을 겹치지 않는다). 더한 몫이 80%에 닿기까지의 원인이 먼저 잡을 원인이라 강조색, 나머지는 회색.
 * 원인은 적은 차례 그대로 둔다. 장 위에서 순서를 바꾼 대로 보여야 해서 저절로 줄 세우지 않는다(안내에 '많은 것부터')
 */
export function Pareto() {
  const { slide, meta, mode } = useSlide()
  const items = slide.items.slice(0, BLOCKS.pareto.items!.max)
  const demo = demoOf(mode, items)
  const series = seriesIn(
    items.map((it, i) => (demo ? hintFor(slide.layout, slide.hints, 'value', 'value', i) : it.value)),
    readField(slide, meta, 'unit'),
  )
  const values = series.values.map((v) => Math.max(0, v ?? 0))
  const total = values.reduce((a, b) => a + b, 0)
  // 서로 다른 단위, 비어 있거나 읽을 수 없는 수, 음수를 전체에 더하면 그 비율은 의미가 없다.
  // 쓴 이름과 수는 그대로 보여 주되, 잘못된 막대와 누적 비율을 만들어 발표하지 않는다.
  const comparable = series.ok && Number.isFinite(total) && total > 0 && items.every((it, i) => demo || isBlankItem(it) || (series.values[i] !== null && series.values[i]! >= 0))
  // 입력 순서를 바꾸지는 않는다. 다만 큰 수부터 적지 않았다면 앞쪽 원인을 '상위'나 우선순위로 부를 수 없다.
  const entered = values.filter((_, i) => demo || !isBlankItem(items[i]))
  const ranked = entered.every((v, i) => i === 0 || entered[i - 1] >= v)
  const share = values.map((v) => (comparable ? (v / total) * 100 : 0))
  const cum: number[] = []
  share.forEach((p, i) => cum.push((cum[i - 1] ?? 0) + p))
  // 단위가 서로 다른 값('3건', '40%')을 더한 몫은 틀린 숫자라 먼저 잡을 원인과 몫을 말하지 않는다
  const vital = comparable && ranked ? cum.findIndex((c) => c >= 80) + 1 : 0
  const n = items.length
  // 발표할 때 칸을 하나도 채우지 않은 원인(가장 적은 수를 채우려 남긴 빈 칸, presentable)에는 점을 찍지 않고 선도 그 앞에서
  // 멈춘다: 더한 몫이 그대로라 빈 칸 위에 100% 점이 줄지어 섰다. 요점과 80%를 넘긴 표시도 채운 원인만 세어 말한다
  const blank = items.map((it) => mode === 'final' && isBlankItem(it))
  const filled = items.filter((it) => demo || !isBlankItem(it)).length
  const vitalCount = items.slice(0, vital).filter((it) => demo || !isBlankItem(it)).length
  const end = blank.lastIndexOf(false)
  // 점은 그 칸의 가운데(막대와 이름 바로 위): 그 칸까지 더한 몫. 칸의 오른쪽 끝에 찍던 때는 점이 막대와 막대 사이,
  // 이름과 이름 사이에 떠서 어느 원인까지 더한 몫인지 읽히지 않았다. 첫 점은 첫 막대의 머리에 앉는다(첫 몫이 곧 첫 막대)
  const x = (i: number) => ((i + 0.5) / n) * 100
  const line = cum.flatMap((c, i) => (i > end || blank[i] ? [] : [`${x(i).toFixed(2)},${(100 - c).toFixed(2)}`])).join(' ')
  // 몇 개가 거의 다인지가 요점. 모두가 80% 안이면 몰린 곳이 없어서 말하지 않는다
  const sum =
    vital > 0 && vitalCount < filled ? (
      <>
        {vitalCount === 1 ? '가장 많은 하나가' : `상위 ${vitalCount}개가`} 전체의 <b>{pctText(cum[vital - 1])}</b>
      </>
    ) : undefined
  const guidance = mode === 'edit' && !demo && !comparable
    ? '모든 값을 같은 단위의 0 이상 숫자로 채워 주세요. 하나는 0보다 커야 해요.'
    : mode === 'edit' && !demo && !ranked
      ? '큰 값부터 순서를 바꾸면 먼저 살필 원인을 표시해요.'
      : sum
  if (slide.variant === 'rows') return <ParetoRows items={items} share={share} cum={cum} vital={vital} hasCut={vitalCount < filled} sum={guidance} demo={demo} comparable={comparable} />
  return (
    <div className={cx('bk-cc bk-pa', demo && 'is-demo')} style={{ '--n': n }}>
      <T k="heading" as="h3" className="bk-h" fit={[18, 32]} multiline />
      <ChartKey
        sum={guidance}
        keys={comparable ? (
          <span className="bk-cc-lk is-line">
            <i aria-hidden="true" />
            누적 비율
          </span>
        ) : undefined}
      />
      <div className="bk-cc-plot">
        {comparable && (
          <div className="bk-pa-canvas" aria-hidden="true">
            <svg className="bk-pa-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
              <polyline points={line} />
            </svg>
            {cum.map((c, i) =>
              blank[i] ? null : (
                <span key={items[i].id} className={cx('bk-pa-pt', i === vital - 1 && vitalCount < filled && 'is-cut')} style={{ '--x': x(i).toFixed(2), '--y': c.toFixed(2) }}>
                  {/* 80%를 넘긴 점이 첫 점이면 몫을 적지 않는다: 첫 막대의 숫자 바로 옆이라 겹치고, 같은 몫을 위의 요점이 말한다 */}
                  {i > 0 && i === vital - 1 && vitalCount < filled && <span className="bk-pa-cut">{pctText(c)}</span>}
                </span>
              ),
            )}
          </div>
        )}
        {items.map((it, i) => (
          // 칸 자리를 적어 둔다: 선 그림이 첫 줄 전체를 차지해서, 적지 않으면 막대 칸이 그 옆 새 칸으로 밀려난다
          <div key={it.id} className={cx('it bk-cc-col', i < vital && 'is-hl')} style={{ '--p': share[i].toFixed(2), gridColumn: i + 1 }}>
            <div className="bk-cc-bar">
              <span className="bk-cc-v">
                <IT i={i} k="value" as="span" className="bk-cc-num" oneLine />
              </span>
              {comparable && <span className="bk-cc-fill" />}
            </div>
            <div className="bk-cc-label">
              <IT i={i} k="title" className="bk-cc-name" />
            </div>
            {/* 빈 칸도 그 자리의 바닥줄은 남긴다: 감추면 축이 채운 칸 아래에서만 끊겼다 */}
            <ItemTools i={i} keepBlank />
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * 가로 막대: 원인마다 한 줄. 막대 칸은 전체(100%)이고, 앞 원인들까지 더한 몫은 옅게, 이 원인의 몫은 그 끝에 이어 진하게 그린다.
 * 그래서 위에서 아래로 읽으면 몫이 계단처럼 쌓여 마지막 줄에서 100%가 되고, 어느 줄에서 80%를 넘는지가 80% 줄로 보인다.
 * 원인 이름이 길어도(‘포장재 규격 변경 누락’) 한 줄에 읽힌다. 숫자는 오른쪽에 원인의 수, 그 옆에 더한 몫
 */
function ParetoRows({ items, share, cum, vital, hasCut, sum, demo, comparable }: { items: Item[]; share: number[]; cum: number[]; vital: number; hasCut: boolean; sum: ReactNode; demo: boolean; comparable: boolean }) {
  const n = items.length
  return (
    <div className={cx('bk-cc bk-pa bk-pr', demo && 'is-demo')} data-n={n} style={{ '--n': n }}>
      <T k="heading" as="h3" className="bk-h" fit={[18, 32]} multiline />
      <ChartKey sum={sum} />
      <div className="bk-pr-list">
        {/* 눈금 머리: 80% 줄의 자리와 더한 몫 칸의 이름. 줄과 같은 칸 나눔이라 80%가 막대 칸의 80%에 선다 */}
        <div className="bk-pr-head" aria-hidden="true">
          {comparable && <><span className="bk-pr-mark">80%</span><span className="bk-pr-cumh">누적</span></>}
        </div>
        {comparable && <span className="bk-pr-guide" aria-hidden="true" />}
        {items.map((it, i) => (
          <div
            key={it.id}
            className={cx('it bk-pr-row', i === 0 && 'is-first', i < vital && 'is-hl', i === vital - 1 && hasCut && 'is-cut')}
            // 줄 자리를 적어 둔다: 80% 줄이 막대 칸을 머리 아래부터 끝까지 차지해서, 적지 않으면 줄들이 그 아래 새 줄로 밀려난다
            style={{ '--a': (cum[i] - share[i]).toFixed(2), '--p': share[i].toFixed(2), gridRow: i + 2 }}
          >
            <IT i={i} k="title" className="bk-pr-name" />
            <div className="bk-pr-track" aria-hidden="true">
              {comparable && <><span className="bk-pr-before" /><span className="bk-pr-fill" /></>}
            </div>
            <IT i={i} k="value" as="span" className="bk-pr-num" oneLine />
            <span className="bk-pr-cum">{comparable ? pctText(cum[i]) : null}</span>
            <ItemTools i={i} />
          </div>
        ))}
      </div>
    </div>
  )
}


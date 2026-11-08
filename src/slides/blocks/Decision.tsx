// 부품: 조건에 따라 나뉘는 흐름. 조건과 그때 할 일을 짝지어 보여 주고, 질문에서 갈래마다 곡선이 갈라진다.

import { BLOCKS } from '../../deck/blocks'
import { isBlankItem } from '../../deck/fields'
import { useSlide } from '../context'
import { IT, ItemTools, T } from '../fields'

export function Decision() {
  const { slide, mode } = useSlide()
  const items = slide.items
    .slice(0, BLOCKS.decision.items!.max)
    .map((item, i) => ({ item, i }))
    .filter(({ item }) => mode !== 'final' || !isBlankItem(item))
  return (
    <div className="bk-dc">
      {/* 질문에서 갈래로 갈라지는 곡선. 그려진 자리를 재어 쌓기(fitBlocks.ts의 forks)가 긋는다: 앱과 내보낸 HTML이 같은 코드 */}
      <svg className="bk-dc-forks" aria-hidden="true" />
      <div className="bk-dc-start">
        <T k="label" className="bk-dc-label" />
        <T k="question" as="h3" className="bk-dc-question" multiline />
      </div>
      <ul className="bk-dc-list">
        {items.map(({ item, i }) => (
          <li className="it bk-dc-row" key={item.id}>
            <IT i={i} k="title" className="bk-dc-condition" multiline />
            <IT i={i} k="body" className="bk-dc-action" multiline />
            <ItemTools i={i} />
          </li>
        ))}
      </ul>
    </div>
  )
}

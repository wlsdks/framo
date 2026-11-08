// 부품: 대화 (chat). 모양은 styles/blocks/chat.css, 움직임은 motion/engine.ts의 nativeAuto

import type { CSSProperties } from 'react'
import { BLOCKS } from '../../deck/blocks'
import { isBlankItem } from '../../deck/fields'
import { cx } from '../../lib/cx'
import { useSlide } from '../context'
import { IT, ItemTools, T } from '../fields'

/**
 * 대화: 묻고 답하는 장면을 대본처럼. 말하는 사람은 왼쪽 좁은 단에 작은 이름으로, 한 말은 오른쪽에 크게.
 * 말풍선(둥근 칠한 상자)은 쓰지 않는다: 흔한 채팅 화면 흉내라 지면 말투와 어긋나고 글이 든 칠한 상자가 된다(VISUAL-RULES).
 * 마지막 말이 이 장의 답이라 글자색 그대로, 앞의 말은 한 단계 옅게. 발표할 때 말이 한 글자씩 써진다(engine.ts)
 */
export function Chat() {
  const { slide, mode } = useSlide()
  const all = slide.items.slice(0, BLOCKS.chat.items!.max).map((it, i) => ({ it, i }))
  const shown = mode === 'final' ? all.filter(({ it }) => !isBlankItem(it)) : all
  const last = shown.length - 1
  return (
    <div className="bk-ch" data-n={shown.length}>
      <T k="heading" as="h3" className="bk-h" fit={[18, 32]} multiline />
      <ol className="bk-ch-list">
        {shown.map(({ it, i }, k) => (
          <li key={it.id} className={cx('it bk-ch-turn', k === last && 'is-last')} style={{ '--k': k } as CSSProperties}>
            <IT i={i} k="title" className="bk-ch-who" oneLine />
            <IT i={i} k="body" as="p" className="bk-ch-say" multiline />
            <ItemTools i={i} />
          </li>
        ))}
      </ol>
    </div>
  )
}

// 부품: 겹친 수고 (dupes). 모양은 styles/blocks/dupes.css, 움직임은 motion/engine.ts의 nativeAuto

import type { CSSProperties } from 'react'
import { BLOCKS } from '../../deck/blocks'
import { isBlankItem } from '../../deck/fields'
import { useSlide } from '../context'
import { IT, ItemTools, T } from '../fields'

/**
 * 겹친 수고: 여러 팀이 따로 하던 같은 일을 하나로 합쳐 같이 쓰는 모습. 위에는 팀마다 따로 하던 일(옅게, 가는 취소선), 맨 아래에는
 * 그것을 대신할 하나(강조색 이름과 굵은 글). 다 보인 모습도 '따로 하던 것은 지우고, 하나로'로 읽힌다.
 * 발표할 때는 팀 줄이 차례로 나온 뒤 같은 일들이 동시에 밝아졌다가(다 같은 일), 한꺼번에 줄이 그어지며 옅어지고 아래의 하나가
 * 올라온다(engine.ts)
 */
export function Dupes() {
  const { slide, mode } = useSlide()
  const all = slide.items.slice(0, BLOCKS.dupes.items!.max).map((it, i) => ({ it, i }))
  const shown = mode === 'final' ? all.filter(({ it }) => !isBlankItem(it)) : all
  return (
    <div className="bk-dp" data-n={shown.length}>
      <T k="heading" as="h3" className="bk-h" fit={[18, 32]} multiline />
      <ol className="bk-dp-list">
        {shown.map(({ it, i }, k) => (
          <li key={it.id} className="it bk-dp-row" style={{ '--k': k } as CSSProperties}>
            <IT i={i} k="title" className="bk-dp-who" oneLine />
            <span className="bk-dp-was">
              <IT i={i} k="body" className="bk-dp-what" multiline />
            </span>
            <ItemTools i={i} pair />
          </li>
        ))}
      </ol>
      <div className="bk-dp-one">
        <T k="label" className="bk-dp-l" oneLine />
        <T k="result" className="bk-dp-r" multiline />
      </div>
    </div>
  )
}

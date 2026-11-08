// 부품: 준비 상황 (checks). 모양은 styles/blocks/checks.css

import { BLOCKS } from '../../deck/blocks'
import { cx } from '../../lib/cx'
import { useSlide } from '../context'
import { IT, ItemTools, T } from '../fields'
import { statusOf, type Status } from '../numbers'

/**
 * 상태 표시: 동그라미 안에 넣은 체크, 반쯤 찬 원, 빈 고리는 흔한 아이콘처럼 보였다(사용자). 원 없이 인쇄물의 기호처럼 획만 쓴다.
 * 완료는 체크 한 획, 진행 중은 가는 선 위에 반만 칠한 띠(단계 표시의 지난 구간 띠와 같은 말), 예정은 가는 선만, 지연은 느낌표.
 * 색이 아니라 꼴로 가른다(흑백 인쇄). 길이를 1로 맞춘 획(pathLength)이라 움직임이 획을 그어 나간다(engine.ts)
 */
function StatusMark({ status }: { status: Status | null }) {
  return (
    <span className="bk-ck-mark" aria-hidden="true">
      <svg viewBox="0 0 32 32">
        {status === 'done' ? (
          <path className="bk-ck-glyph" d="M6.5 16.5l6 6L26 9" pathLength={1} />
        ) : status === 'late' ? (
          <path className="bk-ck-glyph" d="M16 6.5v12.5M16 25v.5" pathLength={1} />
        ) : (
          <>
            <path className="bk-ck-track" d="M4 16h24" pathLength={1} />
            {status === 'doing' && <path className="bk-ck-bar" d="M4 16h12" pathLength={1} />}
          </>
        )}
      </svg>
    </span>
  )
}

/** 준비 상황: 할 일마다 상태 표시. 상태 글(완료, 진행 중, 지연, 예정)을 읽어 표시를 고르고, 글은 그대로 보인다 */
export function Checks() {
  const { slide } = useSlide()
  const items = slide.items.slice(0, BLOCKS.checks.items!.max)
  const states = items.map((it) => statusOf(it.body, null))
  const done = states.filter((s) => s === 'done').length
  return (
    <div className="bk-ck">
      <div className="bk-ck-top">
        <T k="heading" as="h3" className="bk-h" fit={[18, 32]} multiline />
        {states.some((s) => s !== null) && (
          <p className="bk-ck-sum">
            {items.length}개 중 <b>{done}개</b> 완료
          </p>
        )}
      </div>
      <ul className="bk-ck-list" data-n={items.length}>
        {items.map((it, i) => (
          <li key={it.id} className={cx('it bk-ck-row', states[i] && `is-${states[i]}`)}>
            <StatusMark status={states[i]} />
            <div className="bk-ck-text">
              <IT i={i} k="title" className="bk-ck-t" />
              <IT i={i} k="meta" className="bk-ck-m" />
            </div>
            <IT i={i} k="body" className="bk-ck-s" />
            <ItemTools i={i} />
          </li>
        ))}
      </ul>
    </div>
  )
}

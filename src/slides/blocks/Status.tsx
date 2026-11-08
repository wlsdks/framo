// 부품: 상태 (status). 모양은 styles/blocks/status.css, 움직임은 motion/engine.ts의 nativeAuto

import { cx } from '../../lib/cx'
import { useSlide } from '../context'
import { T } from '../fields'
import { STATUS_NAMES, type Status as State } from '../numbers'

const STATES: readonly State[] = ['doing', 'done', 'todo', 'late']

/**
 * 상태 표시: 색이 아니라 꼴로 가른다(흑백 인쇄, 강조색을 바꿔도 읽히게). 원(꽉 찬 원, 반 찬 원, 빈 고리, 시계 바늘)은 흔한
 * 아이콘처럼 보여서(사용자) 준비 상황과 같은 획 기호로: 완료는 체크, 진행 중은 가는 선 위에 반만 칠한 띠, 예정은 가는 선만,
 * 지연은 느낌표. 색(강조색)은 예외인 지연에만 쓰고, 빨강 같은 따로 정한 색은 쓰지 않는다
 */
function StateMark({ state }: { state: State }) {
  return (
    <svg className="bk-ss-mark" viewBox="0 0 32 32" aria-hidden="true">
      {state === 'done' ? (
        <path className="bk-ss-hand" d="M6.5 16.5l6 6L26 9" pathLength={1} />
      ) : state === 'late' ? (
        <path className="bk-ss-hand" d="M16 6.5v12.5M16 25v.5" pathLength={1} />
      ) : (
        <>
          <path className="bk-ss-track" d="M4 16h24" pathLength={1} />
          {state === 'doing' && <path className="bk-ss-bar" d="M4 16h12" pathLength={1} />}
        </>
      )}
    </svg>
  )
}

/** 상태: 상태 표시와 이름(완료, 진행 중, 예정, 지연) 아래 할 일과 언제·누가. 상태는 모양(variant)으로 고른다 */
export function Status() {
  const { slide } = useSlide()
  const state = STATES.find((s) => s === slide.variant) ?? STATES[0]
  return (
    <div className={cx('bk-ss', `is-${state}`)}>
      <p className="bk-ss-st">
        <StateMark state={state} />
        <span className="bk-ss-name">{STATUS_NAMES[state]}</span>
      </p>
      <T k="what" className="bk-ss-w" multiline />
      <T k="meta" className="bk-ss-m" />
    </div>
  )
}

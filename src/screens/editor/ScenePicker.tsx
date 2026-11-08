import { memo, useMemo, useRef, useState } from 'react'
import { planScenes, SCENES, sceneOf, scenesFor, sceneSpec, withScenes } from '../../deck/scenes'
import { motionOf } from '../../deck/themes'
import type { Deck, SceneId, Slide } from '../../deck/types'
import { cx } from '../../lib/cx'
import { motionEngine } from '../../motion/engine'
import { ScaledSlide, SlideCanvas } from '../../slides/SlideCanvas'
import { useDeck } from '../../store/deckStore'
import { Info, undoAction, type Toast } from '../ui'
import { useLook, type Look } from './look'

// 움직이는 방식 고르기: 모션 편집의 '슬라이드 전체' 맨 위. 첫 카드는 '자동'(컴포넌트마다 내용에 맞게), 그 뒤로 이 장에 맞는 장면만
// 카드로 보이고, 카드에는 이 장이 그렇게 움직이는 작은 그림이 있다(마우스를 올리거나 초점이 오면 한 번 움직인다). 누르면 바로 입힌다(딸깍).
// '장면'이라는 말만으로는 무엇인지 몰라서, 이름보다 그림이 먼저 말하게 한다. '자동'으로 언제든 끈다

/** 카드의 작은 장 너비. 오른쪽 칸(336px)에 두 장씩 들어간다 */
const THUMB_W = 132

export function ScenePicker({ deck, slide, thumb = THUMB_W }: { deck: Deck; slide: Slide; thumb?: number }) {
  const setOptions = useDeck((s) => s.setOptions)
  const look = useLook(deck)
  const fits = useMemo(() => scenesFor(slide), [slide])
  const now = sceneOf(slide)
  const level = motionOf(deck, slide)
  const pick = (id: SceneId | undefined) => setOptions(slide.id, { scene: id }, 'scene')
  if (!fits.length) {
    return (
      <p className="sp-none">
        이 슬라이드는 자동으로 움직여요
        <Info label="장면이 맞는 슬라이드">슬라이드 전체를 한 장면처럼 짠 움직임(장면)은 표지, 요약, 숫자, 흐름, 비교, 일정, 이미지, 마지막 슬라이드처럼 모양이 뚜렷한 슬라이드에 맞춰 짜 두었어요. 컴포넌트 슬라이드는 들어 있는 컴포넌트로 골라요.</Info>
      </p>
    )
  }
  return (
    <>
      {level === 'none' && <p className="sp-quiet">모션이 ‘없음’이라 발표할 때 움직이지 않아요.</p>}
      <div className="sp-grid" role="group" aria-label="장면">
        <SceneCard deck={look} slide={slide} id={null} on={!now} width={thumb} level={level} onPick={() => pick(undefined)} />
        {fits.map((id) => (
          <SceneCard key={id} deck={look} slide={slide} id={id} on={now === id} width={thumb} level={level} onPick={() => pick(id)} />
        ))}
      </div>
    </>
  )
}

/** 장면 카드 하나: 이 장을 그 장면으로 그린 작은 그림과 이름. 올리면(초점이 오면) 한 번 움직인다 */
const SceneCard = memo(function SceneCard({
  deck,
  slide,
  id,
  on,
  width,
  level,
  onPick,
}: {
  deck: Look
  slide: Slide
  id: SceneId | null
  on: boolean
  width: number
  level: ReturnType<typeof motionOf>
  onPick(): void
}) {
  const ref = useRef<HTMLButtonElement>(null)
  const last = useRef(-1e9)
  const engine = useMemo(() => motionEngine(), [])
  // 그림의 장은 이 장에 그 장면만 바꾼 것 (편집 중인 다른 값은 그대로)
  const shown = useMemo(() => ({ ...slide, options: { ...slide.options, scene: id ?? undefined } }), [slide, id])
  const spec = id ? sceneSpec(id) : null
  const play = () => {
    const el = ref.current?.querySelector('.slide')
    const t = performance.now()
    // 움직이는 중에 다시 올려도 처음부터 다시 하지 않는다
    if (!el || t - last.current < 2600) return
    last.current = t
    engine.play(el, level === 'lively' ? 'lively' : 'calm')
  }
  return (
    <button
      ref={ref}
      type="button"
      className={cx('sp-card', on && 'is-on')}
      aria-pressed={on}
      title={spec?.description ?? '내용에 맞게 컴포넌트마다 알아서 움직여요. 처음 값이에요.'}
      onClick={onPick}
      onPointerEnter={play}
      onFocus={play}
    >
      {/* 그림은 보기만: 화면 읽기 프로그램은 장면 이름만 읽는다 */}
      <span className="sp-thumb-w" aria-hidden="true">
        <ScaledSlide width={width} className="sp-thumb">
          <SlideCanvas deck={deck} slide={shown} mode="final" />
        </ScaledSlide>
      </span>
      <span className="sp-name">{spec?.name ?? '자동'}</span>
    </button>
  )
})

/**
 * 중요한 슬라이드에 장면 넣기(예전 이름 '장면 알아서 고르기'). 발표 설정의 모션 아래. 힘줄 장(처음, 결론, 숫자, 마지막 같은)에만 장면마다 한 번씩 넣는다(planScenes).
 * 누르면 어느 장에 무엇을 넣는지 먼저 보이고, '적용하기'로 한 번에 넣는다(되돌리기 한 번에 돌아온다).
 * 예전 이름 '발표 전체에 장면 입히기'는 모든 장에 넣는 것처럼 들려서 무엇을 하는지 알기 어려웠다.
 * 이미 장면을 골라 둔 장은 그대로 두고, 처음부터 다시 고를지 따로 묻는다
 */
export function SceneAll({ deck, toast }: { deck: Deck; toast?: Toast }) {
  const replaceDeck = useDeck((s) => s.replaceDeck)
  const [open, setOpen] = useState(false)
  const [overwrite, setOverwrite] = useState(false)
  const plan = useMemo(() => planScenes(deck), [deck])
  const rows = overwrite ? plan.all : plan.add
  if (!open) {
    return (
      <button type="button" className="btn btn-ghost btn-sm sp-all" onClick={() => setOpen(true)}>
        중요한 슬라이드에 장면 넣기…
      </button>
    )
  }
  const apply = () => {
    replaceDeck(withScenes(deck, overwrite))
    setOpen(false)
    setOverwrite(false)
    toast?.show(`${rows.length}장에 장면을 넣었어요.`, undoAction(toast))
  }
  return (
    <div className="sp-plan" role="group" aria-label="중요한 슬라이드에 장면 넣기">
      <p className="sp-plan-h">{rows.length ? `중요한 슬라이드 ${rows.length}장에 장면을 넣어요` : '새로 넣을 슬라이드가 없어요'}</p>
      <p className="sp-plan-p">처음, 결론, 숫자, 마지막처럼 힘을 줄 슬라이드에만 넣고 나머지는 차분하게 둬요.</p>
      {rows.length > 0 && (
        <ol className="sp-rows">
          {rows.map((r) => (
            <li key={r.slideId}>
              <span className="sp-page">{r.page}</span>
              <span className="sp-to">
                {r.now && <s>{sceneSpec(r.now).name}</s>}
                {sceneSpec(r.next).name}
              </span>
            </li>
          ))}
        </ol>
      )}
      {plan.kept.length > 0 && (
        <label className="sp-keep">
          <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
          이미 고른 슬라이드까지 처음부터 다시 고르기
        </label>
      )}
      <div className="sp-plan-btns">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
          닫기
        </button>
        <button type="button" className="btn btn-primary btn-sm" disabled={!rows.length} onClick={apply}>
          적용하기
        </button>
      </div>
    </div>
  )
}

/** 장면이 컴포넌트마다의 움직임을 대신하고 있다는 알림과 끄는 단추 */
export function SceneOverride({ slide }: { slide: Slide }) {
  const setOptions = useDeck((s) => s.setOptions)
  const now = sceneOf(slide)
  if (!now) return null
  return (
    <p className="sp-over">
      <span>‘{SCENES.find((s) => s.id === now)?.name}’ 장면이 모션과 빠르기를 정하고 있어요</span>
      <button type="button" className="mp-reset" onClick={() => setOptions(slide.id, { scene: undefined }, 'scene')}>
        장면 끄기
      </button>
    </p>
  )
}

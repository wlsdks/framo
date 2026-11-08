import { useEffect, useMemo, useRef, useState } from 'react'
import { currentPreset, MOTION_PRESETS, type MotionPreset } from '../../../deck/blocks'
import { LAYOUTS } from '../../../deck/layouts'
import { planMotionCopy, withMotionCopy } from '../../../deck/motionCopy'
import { sceneOf, sceneSpec } from '../../../deck/scenes'
import { MOTIONS } from '../../../deck/themes'
import type { Deck, Slide } from '../../../deck/types'
import { useDeck } from '../../../store/deckStore'
import { Info, undoAction, type Toast } from '../../ui'
import { INHERIT, nameOf, SLIDE_TRANSITIONS } from '../MotionPanel'

// 이 장의 움직임을 다른 장에도: 한 장을 공들여 짠 뒤, 모양이 같은 장마다 같은 것을 하나하나 다시 고르지 않게.
// 누르면 무엇을 옮기는지와 옮길 장(모양이 같은 장을 미리 골라 둔다)을 먼저 보이고, '적용하기'로 한 번에 옮긴다
// (되돌리기 한 번에 돌아온다). 옮기는 것은 고르는 값뿐이고 글은 그대로다(deck/motionCopy.ts)

/** prefer: 이 장에서 방금 고른 연출 (같은 결과인 연출이 둘일 때 어느 것을 옮길지, currentPreset) */
export function MotionCopy({ deck, slide, prefer, toast }: { deck: Deck; slide: Slide; prefer: MotionPreset | null; toast?: Toast }) {
  const replaceDeck = useDeck((s) => s.replaceDeck)
  const rows = useMemo(() => planMotionCopy(deck, slide.id), [deck, slide.id])
  const [open, setOpen] = useState(false)
  // 고른 장. 처음에는 모양이 같은 장만 (열 때마다 다시)
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set())
  const titles = useMemo(() => new Map(deck.slides.map((s) => [s.id, s.fields.title?.trim() || LAYOUTS[s.layout]?.name || '슬라이드'])), [deck.slides])
  const same = rows.filter((r) => r.same)
  // 연 것은 옆 칸 맨 아래에 펼쳐져서, 1536×730에서 '옮기는 것' 첫 줄만 보이고 옮길 슬라이드와 적용하기는 화면 밖에 있었다.
  // 열면 펼친 곳이 보이게 옆 칸을 굴린다
  const planRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    planRef.current?.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' })
  }, [open])

  if (!open) {
    return (
      <section className="ms-sec">
        <h2 className="ms-h">
          다른 슬라이드에도
          <Info label="다른 슬라이드에도 옮기는 것">
            이 슬라이드의 움직이는 방식(장면), 화면 전환, 모션을 다른 슬라이드에 그대로 옮겨요. 컴포넌트 슬라이드끼리는 나오는 차례와 같은 종류 컴포넌트의 모션도 옮겨요. 글은 바뀌지 않아요.
          </Info>
        </h2>
        <button
          type="button"
          className="btn btn-ghost btn-sm mc-open"
          disabled={!rows.length}
          title={rows.length ? undefined : '옮길 다른 슬라이드가 없어요'}
          onClick={() => {
            setPicked(new Set(same.map((r) => r.slideId)))
            setOpen(true)
          }}
        >
          이 슬라이드의 모션을 다른 슬라이드에도
        </button>
      </section>
    )
  }

  const scene = sceneOf(slide)
  const preset = slide.layout === 'compose' ? currentPreset(slide, prefer) : null
  const what = [
    `움직이는 방식 ${scene ? sceneSpec(scene).name : '자동'}`,
    `화면 전환 ${nameOf(SLIDE_TRANSITIONS, slide.options.transition ?? undefined)}`,
    `모션 ${slide.options.motion ? nameOf(MOTIONS, slide.options.motion) : INHERIT}`,
    preset && `나오는 차례 ${nameOf(MOTION_PRESETS, preset)}`,
  ].filter(Boolean)
  const toggle = (id: string) =>
    setPicked((p) => {
      const next = new Set(p)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const chosen = rows.filter((r) => picked.has(r.slideId))
  const apply = () => {
    const next = withMotionCopy(deck, slide.id, [...picked], prefer)
    setOpen(false)
    if (next === deck) {
      toast?.show('고른 슬라이드가 이미 이 슬라이드와 같은 모션이에요.')
      return
    }
    replaceDeck(next)
    toast?.show(`${chosen.length}장에 이 슬라이드의 모션을 옮겼어요.`, undoAction(toast))
  }

  return (
    <section className="ms-sec">
      <h2 className="ms-h">다른 슬라이드에도</h2>
      <div ref={planRef} className="sp-plan mc-plan" role="group" aria-label="이 슬라이드의 모션을 다른 슬라이드에도">
        <p className="sp-plan-h">옮기는 것</p>
        <p className="sp-plan-p">
          {what.join(' · ')}
          {slide.layout === 'compose' && ' · 같은 종류 컴포넌트의 모션'}
        </p>
        <div className="mc-quick">
          <span className="sp-plan-h">옮길 슬라이드</span>
          <button type="button" className="mp-reset" disabled={!same.length} onClick={() => setPicked(new Set(same.map((r) => r.slideId)))}>
            모양이 같은 슬라이드만
          </button>
          <button type="button" className="mp-reset" onClick={() => setPicked(new Set(rows.map((r) => r.slideId)))}>
            모두
          </button>
        </div>
        {!same.length && <p className="sp-plan-p">모양이 같은 슬라이드가 없어요. 옮길 슬라이드를 직접 골라 주세요.</p>}
        {/* 모양이 같은 장을 먼저: 장 차례대로 늘어놓으면 골라 둔 장이 목록 아래에 묻혀 무엇을 골랐는지 보이지 않았다 */}
        <ul className="sp-rows mc-rows">
          {[...same, ...rows.filter((r) => !r.same)].map((r, i) => (
            <li key={r.slideId} className={i === same.length && i > 0 ? 'mc-rest' : undefined}>
              <label className="mc-row">
                <input type="checkbox" checked={picked.has(r.slideId)} onChange={() => toggle(r.slideId)} />
                <span className="sp-page">{r.page}</span>
                <span className="mc-name">{titles.get(r.slideId)}</span>
                {r.sceneSkipped && picked.has(r.slideId) && (
                  <span className="mc-note" title="이 슬라이드의 장면이 그 슬라이드에는 맞지 않아서, 그 슬라이드의 장면은 그대로 두고 나머지만 옮겨요.">
                    장면은 그대로
                  </span>
                )}
              </label>
            </li>
          ))}
        </ul>
        <div className="sp-plan-btns">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
            닫기
          </button>
          <button type="button" className="btn btn-primary btn-sm" disabled={!chosen.length} onClick={apply}>
            {chosen.length ? `${chosen.length}장에 적용하기` : '적용하기'}
          </button>
        </div>
      </div>
    </section>
  )
}

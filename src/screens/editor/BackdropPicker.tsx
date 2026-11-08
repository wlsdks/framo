import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { BACKDROP_PLACES, BACKDROP_STRENGTHS, BACKDROPS, backdropOf, backdropSpec, placeOfArea, withBackdropKind } from '../../deck/backdrops'
import { motionOf } from '../../deck/themes'
import type { BackdropId, Deck, Slide } from '../../deck/types'
import { cx } from '../../lib/cx'
import { backdrops } from '../../slides/Backdrop'
import { ScaledSlide, SlideCanvas } from '../../slides/SlideCanvas'
import { useDeck } from '../../store/deckStore'
import { ChevronIcon, Info, Segmented } from '../ui'
import { setBackdropEditing, useBackdropEditing } from './backdropEdit'
import { useLook, type Look } from './look'

// 이 장 설정의 '배경 모션': 장 뒤에서 잔잔히 움직이는 그래픽을 고르고, 자리와 짙기를 정한다.
// 고르기는 그림 카드로(이 장에 그 배경을 깐 작은 그림. 마우스를 올리거나 초점이 오면 한 번 들어온다), 자리는 자주 쓰는 자리를
// 누르거나 슬라이드 위에서 틀을 끌어서(BackdropFrame). 무엇이 어울리는지는 카드 아래 한 줄('어울리는 슬라이드')이 말한다

/** 카드의 작은 장 너비. 오른쪽 칸(336px)에 두 장씩 들어간다(장면 카드와 같다) */
const THUMB_W = 132

export function BackdropSection({ deck, slide }: { deck: Deck; slide: Slide }) {
  const setBackdrop = useDeck((s) => s.setBackdrop)
  const look = useLook(deck)
  const editing = useBackdropEditing(slide.id)
  const now = backdropOf(slide)
  const [open, setOpen] = useState(false)
  // 다른 장을 고르면 고르기를 닫고, 슬라이드 위의 자리 틀도 거둔다
  useEffect(() => {
    setOpen(false)
    setBackdropEditing(null)
  }, [slide.id])
  useEffect(() => () => setBackdropEditing(null), [])
  const pick = (kind: BackdropId | null) => {
    setBackdrop(slide.id, kind ? withBackdropKind(slide, kind) : undefined)
    if (!kind) setBackdropEditing(null)
  }
  const level = motionOf(deck, slide)
  // 이 버전이 모르는 배경(새 버전에서 고른 것)은 그리지 않지만 값은 지우지 않는다
  const unknown = !!slide.backdrop && !now
  const name = now ? backdropSpec(now.kind).name : unknown ? '새 버전의 배경' : '없음'
  return (
    <section className="ins-sec bdp" aria-label="배경 모션">
      <h2 className="ins-h bdp-h">
        배경 모션
        <Info label="배경 모션 도움말" align="start">
          글과 컴포넌트 뒤에 까는 잔잔한 그래픽이에요. 발표할 때 슬라이드와 함께 한 번 들어오고 가라앉아요(모션이 ‘생동감’이면 아주 천천히 이어져요). 글은 늘 그 위에 또렷하게 있어요.
        </Info>
      </h2>
      <button type="button" className="bdp-cur" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="bdp-cur-n">{name}</span>
        {now && <span className="bdp-cur-f">{backdropSpec(now.kind).fits}</span>}
        <span className="ins-cur-go">
          {open ? '접기' : now ? '바꾸기' : '고르기'}
          <ChevronIcon />
        </span>
      </button>
      {unknown && <p className="bdp-note">이 버전에서는 보이지 않는 배경이에요. 그대로 두면 새 버전에서 다시 보여요.</p>}
      {open && (
        <>
          {level === 'none' && <p className="sp-quiet">모션이 ‘없음’이라 발표할 때 배경이 멈춘 그림으로 보여요.</p>}
          <div className="sp-grid bdp-grid" role="group" aria-label="배경 고르기">
            <BackdropCard look={look} slide={slide} kind={null} on={!slide.backdrop} onPick={() => pick(null)} />
            {BACKDROPS.map((b) => (
              <BackdropCard key={b.id} look={look} slide={slide} kind={b.id} on={now?.kind === b.id} onPick={() => pick(b.id)} />
            ))}
          </div>
        </>
      )}
      {now && slide.backdrop && (
        <div className="bdp-opts">
          {/* 이 장 설정의 고르기 줄과 같은 꼴(Inspector의 Opt). Inspector가 이 파일을 가져오므로 되가져오지 않고 같은 class로 */}
          <div className="ins-opt is-wide">
            <span className="ins-opt-l">
              자리
              <Info label="자리 도움말" align="start">
                슬라이드를 가로 12칸, 세로 12칸으로 나눈 자리예요. 글이 적은 쪽에 두면 글이 더 잘 읽혀요.
              </Info>
            </span>
            <Segmented
              className="bdp-places"
              label="배경 자리"
              options={BACKDROP_PLACES.map((p) => ({ id: p.id, name: p.name }))}
              value={placeOfArea(now.at) ?? undefined}
              onPick={(id) => {
                const at = BACKDROP_PLACES.find((p) => p.id === id)?.at
                if (at) setBackdrop(slide.id, { ...slide.backdrop!, at })
              }}
            />
          </div>
          <button type="button" className={cx('btn btn-ghost btn-sm bdp-move', editing && 'is-on')} aria-pressed={editing} onClick={() => setBackdropEditing(editing ? null : slide.id)}>
            {editing ? '옮기기 끝내기' : '슬라이드에서 끌어 옮기기'}
          </button>
          <div className="ins-opt">
            <span className="ins-opt-l">짙기</span>
            <Segmented
              label="배경 짙기"
              options={BACKDROP_STRENGTHS.map((s) => ({ id: s.id, name: s.name, description: s.description }))}
              value={now.strength}
              onPick={(strength) => setBackdrop(slide.id, { ...slide.backdrop!, strength })}
            />
          </div>
        </div>
      )}
    </section>
  )
}

/** 배경 카드 하나: 이 장에 그 배경을 깐 작은 그림, 이름, 어울리는 슬라이드. 올리면(초점이 오면) 배경이 한 번 들어온다 */
const BackdropCard = memo(function BackdropCard({ look, slide, kind, on, onPick }: { look: Look; slide: Slide; kind: BackdropId | null; on: boolean; onPick: () => void }) {
  const ref = useRef<HTMLButtonElement>(null)
  const last = useRef(-1e9)
  const shown = useMemo(() => {
    const { backdrop: _, ...rest } = slide
    return kind ? { ...rest, backdrop: withBackdropKind(slide, kind) } : rest
  }, [slide, kind])
  const spec = kind ? backdropSpec(kind) : null
  const play = () => {
    const el = ref.current?.querySelector<HTMLElement>('.s-bd')
    const t = performance.now()
    // 움직이는 중에 다시 올려도 처음부터 다시 하지 않는다
    if (!el || t - last.current < 2600) return
    last.current = t
    backdrops.play(el, 'calm', 0)
  }
  return (
    <button ref={ref} type="button" className={cx('sp-card', on && 'is-on')} aria-pressed={on} title={spec?.description ?? '배경 없이'} onClick={onPick} onPointerEnter={play} onFocus={play}>
      <span className="sp-thumb-w" aria-hidden="true">
        <ScaledSlide width={THUMB_W} className="sp-thumb">
          <SlideCanvas deck={look} slide={shown} mode="final" />
        </ScaledSlide>
      </span>
      <span className="sp-name">{spec?.name ?? '없음'}</span>
      {spec && <span className="bdp-fits">{spec.fits}</span>}
    </button>
  )
})

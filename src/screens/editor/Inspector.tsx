import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ARRANGE_MAX, arrangeRequest, boardAreaH } from '../../deck/blocks'
import { missingFields, optionalBlanks, unshownCount, visibleItems, type Missing } from '../../deck/fields'
import { emptyItem } from '../../deck/generate'
import { highlightOf, LAYOUTS, LAYOUT_GROUPS, panesOf, placeOf, sideOf, variantOf } from '../../deck/layouts'
import { isDarkLook, PLACES, toneOf, TONES } from '../../deck/themes'
import type { Deck, LayoutId, Slide } from '../../deck/types'
import { cx } from '../../lib/cx'
import { BOLD_LAYOUTS } from '../../slides/layouts'
import { sideName } from '../../slides/panes'
import { ScaledSlide, SlideCanvas } from '../../slides/SlideCanvas'
import { BackdropSection } from './BackdropPicker'
import { useAfterPaint, useLook, type Look } from './look'
import { BackIcon, CheckIcon, ChevronIcon, EyeOffIcon, Info, Segmented, Toggle, useEscape } from '../ui'
import { useDeck } from '../../store/deckStore'

const PREVIEW_SECTIONS = ['섹션 1', '섹션 2', '섹션 3']

const OPEN_LAYOUTS = 'framo:open-layouts'
let pickNext = false

/** '이 장 설정'의 레이아웃 고르기를 연다. 칸이 아직 없으면(움직임 탭, 접힌 좁은 창) 다음에 그릴 때 연다 */
export function openLayoutPicker() {
  pickNext = true
  window.dispatchEvent(new Event(OPEN_LAYOUTS))
}

/**
 * 오른쪽 칸의 '이 장 설정'. 늘 보는 것(지금 레이아웃, 빈칸, 모양, 바탕)만 한 화면에 두고
 * 서른 가지가 넘는 레이아웃 목록은 '바꾸기'를 눌렀을 때만 따로 연다. 예전에는 한 칸에 다 늘어놓아
 * 3천 px 가까이 내려야 했고, 무엇을 고치는 칸인지 한눈에 들어오지 않았다.
 */
export function Inspector({
  deck,
  slide,
  areaHeight,
  onFocusField,
  onGoSlide,
  onPeekLayout,
}: {
  deck: Deck
  slide: Slide
  /** 컴포넌트 편집기에서 잰 현재 본문 높이. 아직 그리지 않았으면 어림값을 쓴다. */
  areaHeight: () => number | undefined
  onFocusField: (m: Missing) => void
  /** 다른 장으로 가서 그 장의 빈칸 m에 커서를 둔다 ('다음 슬라이드 채우기') */
  onGoSlide: (slideId: string, m?: Missing) => void
  /** 레이아웃 그림에 마우스를 올리면 슬라이드 자리에 그 레이아웃으로 미리 보인다 (null이면 그만) */
  onPeekLayout: (layout: LayoutId | null) => void
}) {
  const changeLayout = useDeck((s) => s.changeLayout)
  // 장 아래 '글이 넘쳤어요'의 '레이아웃 바꾸기'가 열어 달라고 했으면 처음부터 연다 (움직임 탭을 보던 중이면 이 칸이 새로 그려진다)
  const [picking, setPicking] = useState(() => {
    const v = pickNext
    pickNext = false
    return v
  })
  useEffect(() => {
    const on = () => {
      pickNext = false
      setPicking(true)
    }
    window.addEventListener(OPEN_LAYOUTS, on)
    return () => window.removeEventListener(OPEN_LAYOUTS, on)
  }, [])
  // 다른 장을 고르면 레이아웃 고르기를 닫는다 (처음 그릴 때는 그대로: 위에서 열어 달라고 했을 수 있다)
  const shownId = useRef(slide.id)
  useEffect(() => {
    if (shownId.current === slide.id) return
    shownId.current = slide.id
    setPicking(false)
  }, [slide.id])
  const look = useLook(deck)
  // 장 그림(지금 레이아웃, 모양 고르기)은 고친 것이 화면에 그려진 다음에 고친다 (look.ts의 useAfterPaint).
  // 다른 장을 골랐을 때는 바로 그 장으로 (앞 장 그림이 잠깐 남지 않게)
  const later = useAfterPaint(slide)
  const shown = later.id === slide.id ? later : slide

  if (picking) {
    const close = () => {
      onPeekLayout(null)
      setPicking(false)
    }
    return (
      <LayoutPicker
        slide={slide}
        shown={shown}
        look={look}
        onPeek={onPeekLayout}
        onPick={(id) => {
          if (id !== slide.layout) changeLayout(slide.id, id)
          close()
        }}
        onBack={close}
      />
    )
  }
  return (
    <div className="ins" role="tabpanel" aria-label="이 슬라이드 설정">
      <section className="ins-sec ins-top">
        <button type="button" className="ins-cur" title="레이아웃 바꾸기" onClick={() => setPicking(true)}>
          <ScaledSlide width={104} decorative>
            <SlideCanvas deck={look} slide={shown} mode="preview" sections={PREVIEW_SECTIONS} sectionIndex={0} />
          </ScaledSlide>
          <span className="ins-cur-t">
            <span className="ins-cur-k">레이아웃</span>
            <span className="ins-cur-n">{LAYOUTS[slide.layout].name}</span>
          </span>
          <span className="ins-cur-go">
            바꾸기
            <ChevronIcon />
          </span>
        </button>
        <Blanks deck={deck} slide={slide} onFocusField={onFocusField} onGoSlide={onGoSlide} />
        <Optional deck={deck} slide={slide} />
        <Unshown slide={slide} />
      </section>
      <ArrangeSection deck={deck} slide={slide} areaHeight={areaHeight} />
      <ShapeSection slide={slide} shown={shown} look={look} />
      <LookSection deck={deck} slide={slide} />
      <BackdropSection deck={deck} slide={slide} />
      <FrameSection slide={slide} />
    </div>
  )
}

/** 사용자가 이미 만든 슬라이드도 글을 지우지 않고 지금 내용에 맞게 다시 놓을 수 있다. */
function ArrangeSection({ deck, slide, areaHeight }: { deck: Deck; slide: Slide; areaHeight: () => number | undefined }) {
  const [message, setMessage] = useState('')
  useEffect(() => setMessage(''), [slide.id])
  const blocks = slide.blocks ?? []
  if (slide.layout !== 'compose' || blocks.length < 2) return null
  const reason = blocks.length > ARRANGE_MAX
    ? `컴포넌트 ${ARRANGE_MAX}개까지 자동으로 배치할 수 있어요.`
    : blocks.some((b) => b.link || b.linkBelow || b.type === 'heading')
      ? '‘소제목’ 컴포넌트나 연결 기호가 있으면 직접 배치해 주세요.'
      : ''
  const arrange = () => {
    const r = arrangeRequest(blocks, slide.arranged, areaHeight() ?? boardAreaH(slide, deck))
    if (!r) {
      setMessage('이 슬라이드에 들어가는 배치를 찾지 못했어요. 컴포넌트를 나누거나 제목을 줄여 주세요.')
      return
    }
    // 알아서 짠 판으로 남긴다: 다음에 컴포넌트를 넣고 뺄 때도 판을 다시 고른다. 판이 그대로여도 사람이 자동 배치를 고른 것이다
    if (r.mark) useDeck.getState().setBlocks(slide.id, r.blocks, undefined, true)
    setMessage(
      r.moved
        ? '자동으로 배치했어요. 되돌리기로 이전 배치로 돌아갈 수 있어요.'
        : r.mark
          ? '지금 배치를 그대로 두었어요. 이제부터 컴포넌트를 넣거나 빼면 자동으로 다시 배치해요.'
          : '지금보다 나은 자동 배치를 찾지 못했어요. 직접 옮길 수도 있어요.',
    )
  }
  return (
    <section className="ins-sec">
      <h2 className="ins-h">컴포넌트 배치</h2>
      <button type="button" className="btn btn-ghost btn-sm" disabled={!!reason} title={reason || '작성한 글과 읽는 순서를 유지하며 다시 배치해요'} onClick={arrange}>자동으로 다시 배치</button>
      <Info label="자동 배치 설명" align="start">지금 내용에 맞춰 위치와 너비를 다시 정해요. 작성한 글과 읽는 순서는 그대로 두며 되돌리기로 이전 배치로 돌아갈 수 있어요.</Info>
      {(reason || message) && <p className="ins-optional" role="status">{reason || message}</p>}
    </section>
  )
}

/**
 * 채워 두었지만 이 레이아웃에 칸이 없어 장에 보이지 않는 곳. 레이아웃을 바꾸면 글이 말없이 사라져 지운 것처럼 보였다.
 * 지우지 않았다는 것과 다시 보이게 하는 법은 (i)에
 */
function Unshown({ slide }: { slide: Slide }) {
  const n = unshownCount(slide)
  if (!n) return null
  return (
    <p className="ins-unshown">
      <EyeOffIcon />
      가려진 칸 {n}곳
      <Info label="가려진 칸 설명" align="start">
        채워 둔 칸 가운데 현재 레이아웃이나 표시 설정에서 보이지 않는 칸이에요. 글은 지우지 않고 남겨 두었으니 레이아웃이나 표시 설정을 바꾸면 다시
        보여요. 발표 파일(HTML), PDF, PPT에는 들어가지 않고 작업 파일에만 남아요.
      </Info>
    </p>
  )
}

/** 슬라이드마다 제목과 아래 띠를 감추되, 적어 둔 글은 다시 켜면 돌아온다. */
function FrameSection({ slide }: { slide: Slide }) {
  const setOptions = useDeck((s) => s.setOptions)
  return (
    <section className="ins-sec">
      <h2 className="ins-h">표시</h2>
      <Toggle label="제목과 부제" on={slide.options.hideHead !== true} onChange={(on) => setOptions(slide.id, { hideHead: on ? undefined : true })} />
      <Toggle label="출처와 아래 표시" on={slide.options.hideFoot !== true} onChange={(on) => setOptions(slide.id, { hideFoot: on ? undefined : true })} />
    </section>
  )
}

/**
 * 비워 둬도 되는 칸 가운데 비어 있는 것. 빈칸으로 세지 않는 칸이라 빈칸 수와 따로 이름만 늘어놓는다.
 * 비워 두면 발표 화면에 나오지 않는다는 것은 (i)에
 */
function Optional({ deck, slide }: { deck: Deck; slide: Slide }) {
  const names = optionalBlanks(slide, deck.meta).map((m) => m.label)
  if (!names.length) return null
  return (
    <p className="ins-optional">
      <span className="ins-optional-t">
        비워 둬도 되는 칸: <span className="ins-optional-n">{names.join(', ')}</span>
      </span>
      <Info label="비워 둬도 되는 칸 설명" align="start">
        빈칸으로 세지 않는 칸이에요. 비워 두면 발표 화면과 발표 파일에 나오지 않아요. 편집할 때는 다른 칸보다 옅게 보여요.
      </Info>
    </p>
  )
}

/** 빈칸: 몇 곳 남았는지와 '다음 빈칸'. 목록은 펼쳐야 보인다 (빈칸이 열 곳이면 목록만으로 칸이 찬다) */
function Blanks({ deck, slide, onFocusField, onGoSlide }: { deck: Deck; slide: Slide; onFocusField: (m: Missing) => void; onGoSlide: (slideId: string, m?: Missing) => void }) {
  const missing = missingFields(slide, deck.meta)
  // 이 장을 다 채웠으면 빈칸이 남은 다음 장으로 이어 간다. 예전에는 '모두 채웠어요'에서 멈춰, 처음 쓰는 분은 다음에 무엇을 하면
  // 되는지 몰랐다(프레임 잡기를 마치면 이미 채운 표지가 열린다). 발표에서 뺀 장은 건너뛴다. 끝까지 없으면 앞에서부터 찾는다
  const nextSlide = useMemo(() => {
    if (missing.length) return null
    const at = deck.slides.findIndex((s) => s.id === slide.id)
    const order = [...deck.slides.slice(at + 1), ...deck.slides.slice(0, Math.max(0, at))]
    return order.find((s) => !s.hidden && missingFields(s, deck.meta).length > 0) ?? null
  }, [deck, slide.id, missing.length])
  const [open, setOpen] = useState(false)
  const [next, setNext] = useState(0)
  useEffect(() => setNext(0), [slide.id])
  // 컴포넌트가 하나도 없는 장은 채울 칸이 없을 뿐이지 다 채운 것이 아니다
  if (slide.layout === 'compose' && !slide.blocks?.length) {
    return <p className="ins-blank">아직 넣은 컴포넌트가 없어요</p>
  }
  if (!missing.length) {
    // 비워 둔 선택 칸이 있으면 '모두 채웠어요'가 틀린 말로 들린다(표지의 부제, 발표자가 비었는데). 꼭 채울 칸만 센 것이라고 밝힌다
    return (
      <div className="ins-blank is-next">
        <p className="ins-blank is-done">
          <CheckIcon />
          {optionalBlanks(slide, deck.meta).length ? '꼭 채울 칸은 모두 채웠어요' : '빈칸을 모두 채웠어요'}
        </p>
        {nextSlide && (
          <button
            type="button"
            className="btn btn-ghost btn-sm ins-blank-go"
            title="빈칸이 남은 다음 슬라이드로 가서 첫 빈칸에 커서를 둬요"
            onClick={() => onGoSlide(nextSlide.id, missingFields(nextSlide, deck.meta)[0])}
          >
            다음 슬라이드 채우기
          </button>
        )}
      </div>
    )
  }
  const go = () => {
    const i = next % missing.length
    onFocusField(missing[i])
    setNext(i + 1)
  }
  return (
    <div className="ins-blank-wrap">
      <div className="ins-blank">
        <button type="button" className="ins-blank-n" aria-expanded={open} title={open ? '빈칸 목록 접기' : '빈칸 목록 보기'} onClick={() => setOpen((v) => !v)}>
          <span className="ins-blank-dot" aria-hidden="true" />
          빈칸 {missing.length}곳
          <span className={cx('ins-blank-chev', open && 'is-open')} aria-hidden="true">
            <ChevronIcon />
          </span>
        </button>
        <button type="button" className="btn btn-ghost btn-sm ins-blank-go" title="비어 있는 칸으로 차례로 옮겨 가요" onClick={go}>
          다음 빈칸
        </button>
      </div>
      {open && (
        <ul className="ins-missing">
          {missing.map((m) => (
            <li key={`${m.block ?? ''}.${m.item ?? ''}.${m.key}`}>
              <button type="button" className="ins-missing-btn" onClick={() => onFocusField(m)}>
                {m.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** 레이아웃 안에서 고르는 것: 모양, 강조할 항목, 두 판의 자리와 너비, 그림 맞추기 */
function ShapeSection({ slide, shown, look }: { slide: Slide; shown: Slide; look: Look }) {
  const setOptions = useDeck((s) => s.setOptions)
  const setVariant = useDeck((s) => s.setVariant)
  const variants = LAYOUTS[slide.layout].variants ?? []
  const current = variantOf(slide)
  const highlight = LAYOUTS[slide.layout].highlight
  const panes = panesOf(slide)
  const side = sideOf(slide)
  const place = placeOf(slide)
  const placeSpec = LAYOUTS[slide.layout].place
  // 판을 반대쪽으로 옮긴(flip) 자리. 처음에 왼쪽에 있는 판(이미지)은 반대쪽이 오른쪽
  const flipAt = panes?.start ? 'right' : 'left'
  const hasOptions = !!highlight || slide.layout === 'imageText' || !!panes || !!place
  if (variants.length < 2 && !hasOptions) return null
  return (
    <section className="ins-sec">
      <h2 className="ins-h">모양</h2>
      {variants.length > 1 && (
        <div className="ins-variants">
          {variants.map((v) => (
            <LayoutChoice
              key={v.id}
              id={slide.layout}
              variant={v.id}
              name={v.name}
              look={look}
              slide={shown}
              width={86}
              on={current === v.id}
              onPick={() => setVariant(slide.id, v.id)}
            />
          ))}
        </div>
      )}
      {highlight && (
        <Opt label={highlight.label} wide={visibleItems(slide).length > 3}>
          <Segmented
            className="seg-fill"
            label={highlight.label}
            options={[-1, ...visibleItems(slide).map((_, i) => i)].map((i) => ({
              id: i,
              name: i < 0 ? '없음' : i + 1,
              description: i < 0 ? '강조하지 않아요' : `${i + 1}번째 항목을 강조해요`,
            }))}
            value={highlightOf(slide)}
            onPick={(i) => {
              // 지금 강조를 다시 누르면 그대로 둔다: 고른 적 없는 기본 강조(추이의 마지막 점 같은)를 번호로 적어 넣어서, 보이는 것은
              // 같은데 되돌리기 단계가 생겼고 항목이 늘어도 마지막을 따라가던 강조가 그 번호에 묶였다
              if (i !== highlightOf(slide)) setOptions(slide.id, { highlight: i })
            }}
          />
        </Opt>
      )}
      {panes && side !== null && (
        <>
          <Opt label={`${panes.name} 위치`} tip={`슬라이드 위에서 ${panes.name}의 이름표를 끌어 반대쪽에 놓아도 돼요.`}>
            <Segmented
              label={`${panes.name} 위치`}
              options={[
                { id: 'left', name: '왼쪽' },
                { id: 'right', name: '오른쪽' },
              ]}
              value={slide.options.flip ? flipAt : flipAt === 'left' ? 'right' : 'left'}
              onPick={(at) => setOptions(slide.id, { flip: at === flipAt || undefined })}
            />
          </Opt>
          <Opt label={`${panes.name} 너비`} wide={panes.sides.length > 3} tip="슬라이드 위에서 두 영역 사이의 경계를 끌어도 돼요.">
            <Segmented
              className={panes.sides.length > 3 ? 'seg-fill' : undefined}
              label={`${panes.name} 너비`}
              options={panes.sides.map((n) => ({ id: n, name: sideName(n, panes.base) }))}
              value={side}
              onPick={(n) => setOptions(slide.id, { pane: n === panes.base ? undefined : n })}
            />
          </Opt>
        </>
      )}
      {place && placeSpec && (
        <Opt label={`${placeSpec.name} 자리`} tip="슬라이드 위에서 제목을 누르고 위쪽 막대의 이름을 위아래로 끌어도 돼요.">
          <Segmented
            label={`${placeSpec.name} 자리`}
            options={PLACES}
            value={place}
            onPick={(p) => setOptions(slide.id, { place: p === placeSpec.base ? undefined : p })}
          />
        </Opt>
      )}
      {slide.layout === 'imageText' && (
        <Toggle label="이미지를 자르지 않고 전체 보이기" on={!!slide.options.contain} onChange={(v) => setOptions(slide.id, { contain: v })} />
      )}
    </section>
  )
}

/** 이 장만의 바탕. 움직임은 '움직임' 탭에 따로 둔다 (MotionPanel) */
function LookSection({ deck, slide }: { deck: Deck; slide: Slide }) {
  const setOptions = useDeck((s) => s.setOptions)
  if (BOLD_LAYOUTS.includes(slide.layout)) return null
  return (
    <section className="ins-sec">
      {/* 구역에 고를 것이 바탕 하나라 구역 제목이 곧 줄 이름이다(예전 '꾸미기' 아래 '바탕' 한 줄은 같은 말을 두 번 했다) */}
      <h2 className="ins-h">바탕</h2>
      <Segmented
        className="seg-fill"
        label="바탕"
        options={TONES.map((t) => ({ ...t, name: t.id === 'base' ? '기본' : t.id === 'invert' ? (isDarkLook(deck.theme) ? '밝게' : '어둡게') : t.name }))}
        value={toneOf(slide)}
        onPick={(t) => setOptions(slide.id, { tone: t === 'base' ? undefined : t })}
      />
    </section>
  )
}

/**
 * 고르기 한 줄: 이름은 왼쪽, 고르는 단추는 오른쪽. 단추가 많으면(wide) 이름 아래 한 줄을 다 쓴다.
 * 고르는 단추는 줄을 바꾸지 않는다 (넷이 두 줄로 꺾이면 무엇끼리 고르는지 헷갈린다)
 */
export function Opt({ label, tip, wide, extra, children }: { label: string; tip?: string; wide?: boolean; extra?: ReactNode; children: ReactNode }) {
  return (
    <div className={cx('ins-opt', wide && 'is-wide')}>
      <span className="ins-opt-l">
        {label}
        {tip && (
          <Info label={`${label} 도움말`} align="start">
            {tip}
          </Info>
        )}
        {extra}
      </span>
      {children}
    </div>
  )
}

/** 레이아웃 바꾸기: 묶음마다 그림으로 고른다. 그림에 올리면 슬라이드 자리에서 미리 보인다 */
function LayoutPicker({
  slide,
  shown,
  look,
  onPeek,
  onPick,
  onBack,
}: {
  slide: Slide
  /** 그림에 그릴 장 (한 박자 늦게 고친다) */
  shown: Slide
  look: Look
  onPeek: (layout: LayoutId | null) => void
  onPick: (layout: LayoutId) => void
  onBack: () => void
}) {
  useEscape(onBack)
  return (
    <div className="ins ins-picker" role="tabpanel" aria-label="레이아웃 바꾸기" onPointerLeave={() => onPeek(null)}>
      <div className="ins-picker-h">
        <button type="button" className="icon-btn" aria-label="이 슬라이드 설정으로 돌아가기" title="돌아가기 (Esc)" onClick={onBack}>
          <BackIcon />
        </button>
        <h2 className="ins-picker-t">레이아웃 바꾸기</h2>
        <Info label="레이아웃 바꾸기 도움말">작성한 글은 그대로 두고 모양만 바뀌어요. 그림에 마우스를 올리면 슬라이드에서 미리 보여요.</Info>
      </div>
      {LAYOUT_GROUPS.map((g) => (
        <div key={g.name} className="ins-group" role="group" aria-label={g.name}>
          <p className="ins-group-h">{g.name}</p>
          <div className="ins-layouts">
            {g.layouts.map((id) => (
              <LayoutChoice
                key={id}
                id={id}
                name={LAYOUTS[id].name}
                look={look}
                slide={shown}
                on={slide.layout === id}
                onPick={() => onPick(id)}
                onPeek={(on) => onPeek(on && id !== slide.layout ? id : null)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/** 이 장을 다른 레이아웃(이나 모양)으로 그린 모습. 항목이 모자라면 미리 보기에서만 빈 항목을 채워 모양을 보인다 */
export function layoutPreview(slide: Slide, id: LayoutId, variant?: string): Slide {
  const spec = LAYOUTS[id].items
  const want = spec ? Math.max(spec.min, slide.items.length || spec.default) : 0
  const items = [...slide.items]
  while (items.length < want) items.push(emptyItem())
  return { ...slide, layout: id, items, variant: variant ?? (id === slide.layout ? slide.variant : undefined) }
}

export function LayoutChoice({
  id,
  variant,
  name,
  look,
  slide,
  on,
  width = 136,
  onPick,
  onPeek,
}: {
  id: LayoutId
  variant?: string
  name: string
  look: Look
  slide: Slide
  on: boolean
  width?: number
  onPick: () => void
  onPeek?: (on: boolean) => void
}) {
  const preview = useMemo(() => layoutPreview(slide, id, variant), [slide, id, variant])
  return (
    <button
      type="button"
      className={cx('ins-layout', on && 'is-on')}
      aria-pressed={on}
      onClick={onPick}
      onPointerEnter={onPeek && (() => onPeek(true))}
      onFocus={onPeek && (() => onPeek(true))}
      onBlur={onPeek && (() => onPeek(false))}
    >
      <ScaledSlide width={width} decorative>
        <SlideCanvas deck={look} slide={preview} mode="preview" sections={PREVIEW_SECTIONS} sectionIndex={0} />
      </ScaledSlide>
      <span>{name}</span>
    </button>
  )
}

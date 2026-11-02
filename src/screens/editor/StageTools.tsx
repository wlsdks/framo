import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import { withLayout } from '../../deck/blocks'
import { LAYOUTS } from '../../deck/layouts'
import { readPercent } from '../../deck/percent'
import { unshownCount, visibleItems } from '../../deck/fields'
import type { Deck, Slide } from '../../deck/types'
import type { OverField } from '../../slides/overflow'
import type { AiAsk } from '../../ai/useAiAsk'
import type { AiShare } from '../../ai/useAiShare'
import { cx } from '../../lib/cx'
import { onMenuKeys } from '../../lib/menuKeys'
import { useDeck } from '../../store/deckStore'
import { AlertIcon, BlocksIcon, CopyIcon, EyeIcon, EyeOffIcon, MoreIcon, PlayIcon, PlusIcon, Popover, ScreenIcon, SlidersIcon, TrashIcon } from '../ui'
import { SlideAsk } from './AiShare'
import { openLayoutPicker } from './Inspector'
import type { Overflow } from './SlideStage'
import type { BlockEditing } from './BlockEditor'
import type { SidePanel } from './sidePanel'

/**
 * 슬라이드 아래 단추줄: 왼쪽과 오른쪽 단추가 한 줄에 다 들어가지 않으면 글자를 숨긴다.
 * 1단계는 오른쪽 단추, 2단계는 왼쪽 단추까지. 왼쪽 단추 수가 장마다(고른 것의 도구도) 달라서 너비 하나로 정하지 않고 잰다.
 * 넘침 알림(.stage-warn)은 재지 않고 남는 자리에 줄여 넣는다: 알림까지 재던 때는 알림이 뜨는 순간 '미리 보기'와 '발표'가
 * 글자 없는 그림으로 바뀌어 줄이 흔들렸다
 */
function useTightTools(ref: RefObject<HTMLDivElement | null>) {
  const check = useCallback(() => {
    const el = ref.current
    if (!el) return
    const need = () => {
      const l = el.querySelector<HTMLElement>('.stage-tools-l')
      const r = el.querySelector<HTMLElement>('.stage-tools-r')
      // 고른 것의 도구는 .stage-sel(display: contents) 안에 있다
      const parts = [...(l?.children ?? [])].flatMap((c) => (c.classList.contains('stage-sel') ? [...c.children] : c.classList.contains('stage-warn') ? [] : [c]))
      const shown = parts.filter((c): c is HTMLElement => c instanceof HTMLElement && c.offsetWidth > 0)
      const left = shown.reduce((a, c) => a + c.scrollWidth, 0) + Math.max(0, shown.length - 1) * 6
      return left + (r?.scrollWidth ?? 0) + 16
    }
    for (const level of ['', '1', '2']) {
      if (level) el.dataset.tight = level
      else delete el.dataset.tight
      if (need() <= el.clientWidth) return
    }
  }, [ref])
  useLayoutEffect(check)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(check)
    ro.observe(el)
    // 장 위에서 고른 것의 도구(SelectionBar가 .stage-sel에 그린다)가 들어오고 나갈 때도 다시 잰다
    const mo = new MutationObserver(check)
    mo.observe(el, { childList: true, subtree: true })
    return () => {
      ro.disconnect()
      mo.disconnect()
    }
  }, [check, ref])
}

/**
 * '레이아웃 바꾸기'에서 그림에 마우스를 올린 동안 장 아래의 말. 바꿨을 때 가려질 칸이 있으면 그 수도 말한다:
 * 미리 보이는 장에서 글이 사라져도 지워지는지 남는지 알 수 없었다
 */
function PeekNote({ slide, layout }: { slide: Slide; layout: Slide['layout'] }) {
  const hides = unshownCount(withLayout(slide, layout))
  const text = `‘${LAYOUTS[layout].name}’ 레이아웃으로 바꾸면 이렇게 보여요. ${hides ? `채워 둔 칸 ${hides}곳은 이 레이아웃에 없어 가려지지만 지우지는 않아요.` : '누르면 바뀌어요.'}`
  return (
    <p className={cx('stage-peek', hides > 0 && 'is-hiding')} title={text}>
      {text}
    </p>
  )
}

/** 넘친 칸에 쓰기 시작한다 (글 끝에 커서를 두고 그 칸이 든 항목을 고른다: SelectionBar가 초점을 보고 고른다) */
function focusOver(id: string) {
  const el = document.querySelector<HTMLElement>(`.ed-canvas .slide .ed-input[data-field="${CSS.escape(id)}"]`)
  if (!el) return
  el.focus({ preventScroll: true })
  const sel = getSelection()
  sel?.selectAllChildren(el)
  sel?.collapseToEnd()
}

/**
 * 장 아래의 '글이 넘쳤어요'. 누르면 어느 칸이 넘쳤는지와 고치는 법(그 칸으로 가서 글 줄이기, 레이아웃 바꾸기)을 보인다.
 * 넘친 칸은 장 위에도 점선으로 보인다(edit.css의 .ed[data-over]). 예전에는 짧은 꼬리표뿐이라 눌러도 아무 일이 없었고
 * 어느 칸이 넘쳤는지 몰랐다
 */
function OverflowNote({ slide, overflow, side }: { slide: Slide; overflow: Overflow; side: SidePanel }) {
  const { kind, fields, pushed } = overflow
  const at = useRef(0)
  const over = kind === 'over'
  const name = (f: OverField) => (f.label ? `‘${f.label}’ 칸` : '이름 없는 칸')
  return (
    <div className="stage-warn">
      <Popover
        align="left"
        flip
        className="pop-warn"
        button={({ open, toggle }) => (
          <button
            type="button"
            className={cx('stage-warn-btn', open && 'is-on')}
            aria-expanded={open}
            aria-haspopup="dialog"
            title={over ? '어느 칸이 넘쳤는지와 고치는 법을 봐요' : '고치는 법을 봐요'}
            onClick={toggle}
          >
            <AlertIcon />
            {/* 짧은 말 하나로: 자리에 따라 긴 말과 짧은 말을 바꾸던 때는 알림이 뜰 때마다 줄의 단추 모양까지 바뀌었다 */}
            <span className="stage-warn-t">{over ? '글이 넘쳤어요' : '자리가 모자라요'}</span>
          </button>
        )}
      >
        {(close) => (
          <div className="warn-pop" role="dialog" aria-label={over ? '글이 넘친 칸' : '자리가 모자란 슬라이드'}>
            {over ? (
              <>
                <p className="warn-pop-h">
                  {pushed && fields.length > 1
                    ? '여러 칸의 글이 길어 내용이 슬라이드 안에 다 들어가지 않아요'
                    : pushed
                      ? `${name(fields[0])}의 글이 길어 아래 칸이 슬라이드 밖으로 밀렸어요`
                      : fields.length > 1
                      ? `${name(fields[0])} 등 ${fields.length}곳이 슬라이드 안에 다 들어가지 않아요`
                      : fields.length
                        ? `${name(fields[0])}의 글이 슬라이드 밖으로 넘쳤어요`
                        : '글이 슬라이드 밖으로 넘쳤어요'}
                </p>
                <p className="warn-pop-p">
                  {slide.layout === 'compose'
                    ? '슬라이드 위에 점선으로 보이는 칸이에요. 컴포넌트 크기를 늘리거나 글을 줄여 보세요.'
                    : pushed && fields.length === 1
                      ? '슬라이드 위에 점선으로 보이는 칸이에요. 그 칸의 글을 줄이거나, 글이 더 들어가는 레이아웃으로 바꿔 보세요.'
                      : '슬라이드 위에 점선으로 보이는 칸이에요. 글을 줄이거나, 글이 더 들어가는 레이아웃으로 바꿔 보세요.'}
                </p>
              </>
            ) : (
              <>
                <p className="warn-pop-h">컴포넌트가 들어갈 높이가 모자라요</p>
                <p className="warn-pop-p">컴포넌트를 줄여서 보이고 있어요. 제목이나 부제를 줄이거나 컴포넌트를 하나 빼 주세요.</p>
              </>
            )}
            <div className="warn-pop-acts">
              {over && slide.layout !== 'compose' && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    close()
                    side.settings()
                    openLayoutPicker()
                  }}
                >
                  레이아웃 바꾸기
                </button>
              )}
              {/* 칸으로 가면 이 창은 닫는다: 장 아래쪽을 덮고 있어서, 열어 둔 채 칸에 쓰면 쓰는 글이 이 창에 가렸다.
                  넘친 칸이 여럿이면 누를 때마다 다음 칸으로 */}
              {fields.length > 0 && (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => {
                    close()
                    focusOver(fields[at.current % fields.length].id)
                    at.current = (at.current + 1) % fields.length
                  }}
                >
                  {fields.length > 1 ? `${pushed ? '긴 칸 살펴보기' : '넘친 칸 고치기'} (${(at.current % fields.length) + 1}/${fields.length})` : pushed ? '그 칸 고치기' : '넘친 칸 고치기'}
                </button>
              )}
            </div>
          </div>
        )}
      </Popover>
    </div>
  )
}

/**
 * 슬라이드 아래 단추줄: 왼쪽은 이 장에 넣고 바꾸는 일, 오른쪽은 이 장 미리 보기와 '더 보기'(복제, 빼기, 지우기).
 * 예전에는 '모양'과 '지금 장부터 발표'도 여기 있었다. 모양은 오른쪽 '이 장 설정'에, 지금 장부터 발표는 위 '발표하기' 옆 메뉴(Shift+F5)에
 * 같은 일이 있어서, 무엇이 다른지 헷갈리고 1280 너비에서는 단추가 그림만 남았다
 */
export function StageTools({
  deck,
  slide,
  ai,
  ask,
  blocks,
  side,
  peekSlide,
  peek,
  overflow,
  onTogglePeek,
  onReplay,
  onRemove,
}: {
  deck: Deck
  slide: Slide
  ai: AiShare
  ask: AiAsk
  blocks: Pick<BlockEditing, 'libraryOpen' | 'selected'>
  side: SidePanel
  /** '레이아웃 바꾸기'에서 그림에 올린 레이아웃으로 바꾼 모습을 보이는 중 */
  peekSlide: Slide | null
  /** 이 장 미리보기 중 */
  peek: boolean
  overflow: Overflow
  onTogglePeek: () => void
  /** 미리보기의 움직임을 한 번 더 */
  onReplay: () => void
  onRemove: (s: Slide) => void
}) {
  // 할 일(액션)만 쓴다
  const store = useDeck.getState()
  const spec = LAYOUTS[slide.layout]
  const canAddItem = !!spec.items && visibleItems(slide).length < spec.items.max
  const selectedBlock = slide.blocks?.find((b) => b.id === blocks.selected)
  const ringValue = selectedBlock?.type === 'ring' ? selectedBlock.fields.value?.trim() : ''
  const ringNeedsValue = !!ringValue && readPercent(ringValue) === null
  const toolsRef = useRef<HTMLDivElement>(null)
  useTightTools(toolsRef)
  return (
    <div ref={toolsRef} className="stage-tools">
      {peekSlide ? (
        <div className="stage-tools-l">
          <PeekNote slide={slide} layout={peekSlide.layout} />
        </div>
      ) : peek ? (
        <div className="stage-tools-l">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onReplay}>
            <PlayIcon />
            모션 다시 보기
          </button>
          <p className="stage-peek" title="빈칸과 편집 표시는 보이지 않아요">발표 화면에서 보이는 모습이에요</p>
        </div>
      ) : (
        <div className="stage-tools-l">
          {/* 장 위에서 항목이나 판을 고르면 그 도구가 여기에 들어오고(SelectionBar), 그동안 이 장의 단추는 숨긴다(editor.css) */}
          <div className="stage-sel" />
          {ringNeedsValue && (
            <div className="stage-warn" role="status">
              <span className="stage-value-note" title="0부터 100까지의 숫자나 %를 입력하면 원이 나타나요.">0~100을 입력하면 원이 나타나요.</span>
            </div>
          )}
          <button
            type="button"
            className={cx('btn btn-sm stage-blocks', blocks.libraryOpen ? 'is-on' : 'btn-ghost')}
            aria-pressed={blocks.libraryOpen}
            title="컴포넌트를 골라 이 슬라이드에 넣어요"
            onClick={side.toggleLibrary}
          >
            <BlocksIcon />
            컴포넌트 넣기
          </button>
          {/* 오른쪽 칸을 접는 좁은 창에서만 보인다. 레이아웃, 모양, 바탕을 여기서 연다 */}
          <button
            type="button"
            className={cx('btn btn-sm stage-side', side.settingsShown ? 'is-on' : 'btn-ghost')}
            aria-pressed={side.settingsShown}
            title="이 슬라이드의 레이아웃, 모양, 바탕, 모션"
            onClick={side.toggleSettings}
          >
            <SlidersIcon />
            <span className="btn-t">이 슬라이드 설정</span>
          </button>
          <SlideAsk deck={deck} slide={slide} ai={ai} ask={ask} />
          {spec.items && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              // 막아 둔 단추는 왜 안 되는지를 말한다
              title={canAddItem ? `${spec.items.label} 추가` : `${spec.items.label} ${spec.items.max}개까지 넣을 수 있어요`}
              disabled={!canAddItem}
              onClick={() => store.addItem(slide.id)}
            >
              <PlusIcon />
              <span className="btn-t">{spec.items.label} 추가</span>
            </button>
          )}
          {overflow.kind && <OverflowNote slide={slide} overflow={overflow} side={side} />}
        </div>
      )}
      {/* 단추가 한 줄에 다 들어가지 않으면 오른쪽부터 글자를 숨기고 그림만 남긴다 (이름은 title로, useTightTools) */}
      <div className="stage-tools-r">
        <button
          type="button"
          className={cx('btn btn-ghost btn-sm', peek && 'is-on')}
          aria-pressed={peek}
          // 발표를 시작하지 않고 이 장만 듣는 분이 볼 모습으로 본다. 발표는 위의 '발표하기'(F5), 지금 장부터는 그 옆 메뉴와 Shift+F5
          title={peek ? '편집으로 돌아가기 (Esc)' : '듣는 분이 볼 모습을 여기서 봐요. 발표는 시작하지 않아요'}
          onClick={onTogglePeek}
        >
          <ScreenIcon />
          <span className="btn-t">{peek ? '편집으로' : '이 슬라이드 미리 보기'}</span>
        </button>
        {/* 복제, 빼기, 지우기는 덜 쓰는 일이라 '더 보기'에 이름과 함께 둔다. 예전에는 그림만 남은 단추 셋이 나란히 있어서
            빗금 친 눈이 '발표에서 빼기'인지 알기 어려웠다(1280 너비에서는 늘 그림만 보였다) */}
        <Popover
          flip
          button={({ open, toggle }) => (
            <button
              type="button"
              className={cx('btn btn-ghost btn-sm stage-more', open && 'is-on')}
              aria-label="이 슬라이드 더 보기"
              aria-expanded={open}
              aria-haspopup="menu"
              title="복제, 발표에서 빼기, 지우기"
              onClick={toggle}
            >
              <MoreIcon />
            </button>
          )}
        >
          {(close) => (
            <div className="menu stage-menu" role="menu" onKeyDown={onMenuKeys}>
              <button
                type="button"
                role="menuitem"
                className="menu-item"
                onClick={() => {
                  close()
                  store.duplicateSlide(slide.id)
                }}
              >
                <CopyIcon />
                복제
              </button>
              <button
                type="button"
                role="menuitem"
                className="menu-item"
                onClick={() => {
                  close()
                  store.setHidden(slide.id, !slide.hidden)
                }}
              >
                {slide.hidden ? <EyeIcon /> : <EyeOffIcon />}
                <span className="menu-item-t">
                  {slide.hidden ? '발표에 다시 넣기' : '발표에서 빼기'}
                  <span className="menu-item-desc">{slide.hidden ? '발표할 때 이 슬라이드를 다시 보여요' : '지우지 않고 발표할 때만 건너뛰어요'}</span>
                </span>
              </button>
              <div className="menu-sep" role="separator" />
              <button
                type="button"
                role="menuitem"
                className="menu-item is-danger"
                // 막아 둔 일은 왜 안 되는지를 말한다
                title={deck.slides.length <= 1 ? '슬라이드가 하나뿐이라 지울 수 없어요' : undefined}
                disabled={deck.slides.length <= 1}
                onClick={() => {
                  close()
                  onRemove(slide)
                }}
              >
                <TrashIcon />
                이 슬라이드 지우기
              </button>
            </div>
          )}
        </Popover>
      </div>
    </div>
  )
}

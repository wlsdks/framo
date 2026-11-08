import { useMemo, useState, type ReactNode } from 'react'
import { makeSlide } from '../../deck/generate'
import { ACCENT_COMBOS, comboName, comboSwatch, FONTS, TEXT_SIZES, THEMES, THEME_ORDER, accentOf, fontOf, fontPreview, localFontOf } from '../../deck/themes'
import type { Deck } from '../../deck/types'
import { cx } from '../../lib/cx'
import { ScaledSlide, SlideCanvas } from '../../slides/SlideCanvas'
import { useDeck } from '../../store/deckStore'
import { keys } from '../../lib/keys'
import { presenterAuto, setPresenterAuto } from '../../present/link'
import { CheckIcon, ChevronIcon, DownloadIcon, Info, PlayIcon, Popover, Segmented, Toggle } from '../ui'
import { canListFonts, familyCss, LocalFontPicker } from './LocalFonts'
import { SHORTCUT } from './shortcuts'

/**
 * 지금 장의 움직임을 발표할 때처럼 한 번 보여 달라는 창(window) 이벤트. 내용 없이 신호만 보낸다 (new Event).
 * 보내는 곳: 발표 설정의 '이 슬라이드에서 보기'(DeckSettings.tsx), 모션 탭의 '미리 보기'(MotionPanel.tsx).
 * 받는 곳: 편집 화면의 무대(SlideStage)가 받아 지금 장에 움직임을 한 번 돌린다.
 * 메뉴와 무대는 화면 나무에서 멀리 떨어져 있어 속성으로 잇지 않고 이벤트로 보낸다. 이 창 안에서만 오가고 저장하지 않는다
 */
export const PREVIEW_MOTION = 'html-maker:preview-motion'

/** 테마 견본 하나의 너비 (메뉴의 고르는 칸을 둘로 나눈 너비, styles/ui.css의 .theme-menu) */
const THEME_THUMB = 226

/**
 * 테마: 생김새만(바탕, 강조색, 글꼴, 글자 크기). 슬라이드 아래쪽, 모션, 화면 전환은 발표 설정(DeckSettings.tsx)에 따로 둔다:
 * 한 메뉴에 다 있던 때는 생김새를 고르러 온 메뉴가 길고 복잡해 보였고, '아래 표시', '모션 세기'가 무엇인지 알기 어려웠다
 */
export function ThemeMenu({ deck }: { deck: Deck }) {
  const accent = accentOf(deck.theme)
  return (
    <Popover
      className="pop-theme"
      button={({ toggle, open }) => (
        <button type="button" className="btn btn-ghost" aria-expanded={open} title={`바탕, 강조색, 글꼴, 글자 크기 (${keys(SHORTCUT.theme)})`} data-shortcut="theme" onClick={toggle}>
          <span className="swatch-dot" style={{ background: accent }} aria-hidden="true" />
          테마
        </button>
      )}
    >
      {() => <ThemeBody deck={deck} />}
    </Popover>
  )
}

/** 테마 메뉴의 안. 내 PC 글꼴을 고르는 동안은 그 목록으로 바뀐다(메뉴를 닫으면 처음으로) */
function ThemeBody({ deck }: { deck: Deck }) {
  const setTheme = useDeck((s) => s.setTheme)
  const setAccent = useDeck((s) => s.setAccent)
  const setLook = useDeck((s) => s.setLook)
  const [picking, setPicking] = useState(false)
  const font = fontOf(deck.theme)
  const local = localFontOf(deck.theme)
  const size = deck.theme.size ?? 'normal'
  // 테마 견본은 이 발표의 표지 모양 그대로, 제목만 넣어서
  const cover = useMemo(() => {
    const real = deck.slides.find((x) => x.layout === 'cover')
    const s = makeSlide('cover', { variant: real?.variant, options: real?.options })
    s.fields.title = real?.fields.title || deck.title
    return s
  }, [deck.slides, deck.title])
  const accent = accentOf(deck.theme)
  // 색 고르기 창은 소문자(#2f55d4)로, 견본은 대문자로 적혀 있어서 대소문자 없이 견준다
  const same = (a?: string, b?: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase()
  const combos = ACCENT_COMBOS.filter((c) => !same(c.accent, THEMES[deck.theme.id].accent))
  const isDefault = !deck.theme.accent || same(deck.theme.accent, THEMES[deck.theme.id].accent)
  // 견본에 없는 색을 직접 골랐으면 '직접 고르기' 칸이 그 색으로 골라진 것처럼 보인다
  const custom = !isDefault && !combos.some((c) => same(c.accent, deck.theme.accent))

  if (picking)
    return (
      <LocalFontPicker
        current={local}
        onPick={(family) => {
          setLook({ localFont: family })
          setPicking(false)
        }}
        onBack={() => setPicking(false)}
      />
    )
  return (
    // 이름은 왼쪽, 고르는 것은 오른쪽에 한 줄씩 (오른쪽 칸의 '이 장 설정'과 같은 꼴)
    <div className="theme-menu">
      <p className="menu-h is-top">테마</p>
      <div className="theme-grid">
        {THEME_ORDER.map((id) => (
          <button
            key={id}
            type="button"
            className={cx('theme-opt', deck.theme.id === id && 'is-on')}
            aria-pressed={deck.theme.id === id}
            onClick={() => setTheme(id)}
          >
            <ScaledSlide width={THEME_THUMB} decorative>
              <SlideCanvas deck={{ ...deck, theme: { ...deck.theme, id } }} slide={cover} mode="final" />
            </ScaledSlide>
            <span>{THEMES[id].name}</span>
          </button>
        ))}
      </div>
      {/* 설명은 늘어놓지 않고 (i)에. 고르는 단추마다의 설명은 마우스를 올리면 보인다 */}
      <p className="menu-h">
        강조색
        <Info label="강조색 설명" align="start">
          숫자와 강조할 항목에만 쓰여요. 바탕과 넓은 면은 늘 흰색이나 검은색이에요. 회사의 대표 색은 맨 끝의 ‘직접 고르기’에서 골라요.
        </Info>
      </p>
      <div className="swatches">
        <button
          type="button"
          className={cx('swatch swatch-default', isDefault && 'is-on')}
          onClick={() => setAccent(undefined)}
          title="테마 기본색"
          aria-label="테마 기본색"
          aria-pressed={isDefault}
          style={{ background: comboSwatch(THEMES[deck.theme.id]) }}
        >
          {isDefault && <CheckIcon />}
        </button>
        {combos.map((c) => (
          <button
            key={c.accent}
            type="button"
            className={cx('swatch', same(deck.theme.accent, c.accent) && 'is-on')}
            // 강조색과 짙은 면을 반씩: 고르면 어떤 짝으로 칠해지는지 보이게
            style={{ background: comboSwatch(c) }}
            title={c.name}
            aria-label={`강조색 ${c.name}`}
            aria-pressed={same(deck.theme.accent, c.accent)}
            onClick={() => setAccent(c.accent)}
          >
            {same(deck.theme.accent, c.accent) && <CheckIcon />}
          </button>
        ))}
        <label className={cx('swatch swatch-custom', custom && 'is-on')} title="직접 고르기" style={custom ? { background: accent } : undefined}>
          <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} aria-label={custom ? `강조색 직접 고르기, 지금 ${accent}` : '강조색 직접 고르기'} />
          {custom && <CheckIcon />}
        </label>
        <span className="swatch-name">{comboName(deck.theme)}</span>
      </div>
      <p className="menu-h is-top">글꼴</p>
      <div className="theme-fonts">
        {/* 제목과 본문을 맞춰 본 짝 하나를 고른다. 단추 이름을 그 글꼴로 써서 고르기 전에 모양이 보이게.
            내 PC 글꼴을 골랐으면 짝은 눌리지 않은 채로 둔다(그 글꼴이 없는 PC에서 보일 글꼴). 짝을 누르면 내 PC 글꼴을 거둔다 */}
        <Segmented
          className="seg-full"
          label="글꼴"
          options={FONTS.map((o) => ({ ...o, style: fontPreview(o.id) }))}
          value={local ? undefined : font}
          onPick={(id) => setLook({ font: id, localFont: undefined })}
        />
        {canListFonts() && (
          <p className="theme-local">
            {local ? (
              <>
                <span className="theme-local-n">
                  내 PC 글꼴: <b style={{ fontFamily: familyCss(local) }}>{local}</b>
                </span>
                <button type="button" className="link-btn" onClick={() => setPicking(true)}>
                  바꾸기
                </button>
              </>
            ) : (
              <button type="button" className="link-btn" onClick={() => setPicking(true)}>
                내 PC 글꼴 고르기…
              </button>
            )}
            <Info label="내 PC 글꼴 설명" align="start">
              이 PC에 깔린 글꼴(회사 글꼴 같은)로 발표 전체의 글자를 바꿔요. 글꼴 파일은 발표에 넣지 않아서, 내보낸 발표 파일(HTML)을 다른 PC에서 열면 그
              PC에 이 글꼴이 있을 때만 이 글꼴로 보이고 없으면 위에서 고른 글꼴로 보여요. 글자가 넓은 글꼴이면 넘치는 슬라이드가 생길 수 있어요(왼쪽 목록에 세모 표시).
            </Info>
          </p>
        )}
      </div>
      <p className="menu-h">글자 크기</p>
      <Segmented className="seg-full" label="글자 크기" options={TEXT_SIZES} value={size} onPick={(id) => setLook({ size: id })} />
    </div>
  )
}

/**
 * 내보내기 메뉴의 한 줄: 이름과 한 줄 설명. 고르기 전에 알아야 할 것(노트가 들어가는지 같은)은 옆의 (i)에.
 * (i)는 고르는 단추 밖에 둔다: 단추 안의 단추는 누를 때 둘 다 눌린다
 */
function ExportItem({ name, label, desc, info, onPick }: { name: ReactNode; label: string; desc: string; info: string; onPick: () => void }) {
  return (
    <div className="menu-row">
      <button type="button" className="menu-item" onClick={onPick}>
        <span className="menu-item-name">{name}</span>
        <span className="menu-item-desc">{desc}</span>
      </button>
      <Info label={`${label} 설명`}>{info}</Info>
    </div>
  )
}

export function ExportMenu({
  onHtml,
  onPdf,
  onPpt,
  onVideo,
  onDeckFile,
}: {
  onHtml: () => void
  onPdf: () => void
  onPpt: () => void
  /** 영상으로 녹화하기. 이 브라우저가 녹화하지 못하면 없다 */
  onVideo?: () => void
  onDeckFile: () => void
}) {
  return (
    <Popover
      button={({ toggle, open }) => (
        <button type="button" className="btn btn-ghost" aria-expanded={open} onClick={toggle}>
          <DownloadIcon />
          내보내기
        </button>
      )}
    >
      {(close) => {
        const pick = (fn: () => void) => () => {
          close()
          fn()
        }
        return (
          <div className="menu menu-export">
            <ExportItem
              name="발표 파일 (HTML)"
              label="발표 파일"
              desc="인터넷 없이 브라우저로 열려요"
              info="미리 보내기 좋아요. 발표자 노트와 숨긴 슬라이드, 레이아웃을 바꿔 가려진 칸의 글은 들어가지 않아요."
              onPick={pick(onHtml)}
            />
            <ExportItem
              name={
                <>
                  PDF <kbd>{keys('mod+P')}</kbd>
                </>
              }
              label="PDF"
              desc="인쇄 창에서 ‘PDF로 저장’을 골라요"
              info="인쇄 창의 대상에서 ‘PDF로 저장’을 고르고 저장해요. 발표자 노트는 들어가지 않아요."
              onPick={pick(onPdf)}
            />
            <ExportItem
              name="PPT (그림)"
              label="PPT"
              // PPT에서 오는 분은 글을 고칠 수 있다고 여기기 쉬워서, 고칠 수 없다는 것을 (i)가 아니라 한 줄 설명에 둔다
              desc="슬라이드마다 그림이라 글은 고칠 수 없어요"
              info="PowerPoint에서 넘기며 발표할 수 있지만, 슬라이드마다 그림 한 장이라 글과 표는 고칠 수 없어요. 고칠 것은 Framo에서 고쳐 다시 내보내세요. 발표자 노트는 PPT의 노트 칸에 들어가니 다른 분께 보내기 전에 확인하세요."
              onPick={pick(onPpt)}
            />
            {/* 영상은 발표 화면의 막대에만 있어서, 내보내기에서 찾던 분은 영상으로 저장할 수 있다는 것을 몰랐다 */}
            {onVideo && (
              <ExportItem
                name="영상 (MP4)"
                label="영상"
                desc="모션까지 발표하는 모습 그대로 녹화해요"
                info="첫 슬라이드부터 모션이 끝나면 다음으로 넘기며 녹화하고, 마지막 슬라이드가 끝나면 파일로 저장해요. 화면 공유를 묻는 창이 뜨면 ‘이 탭’을 골라요. Esc를 누르면 거기까지 저장해요. 녹화는 이 PC 안에서만 해요."
                onPick={pick(onVideo)}
              />
            )}
            <div className="menu-sep" role="separator" />
            <ExportItem
              name="작업 파일"
              label="작업 파일"
              desc="이어서 고칠 원본, 노트까지 담겨요"
              info="다른 PC에서 ‘파일 열기’로 불러와 이어서 고쳐요. 발표자 노트가 들어 있으니 다른 분께는 보내지 마세요."
              onPick={pick(onDeckFile)}
            />
          </div>
        )
      }}
    </Popover>
  )
}

export type PresentHow = 'auto' | 'single' | 'presenter'

/** 발표하기. 옆의 화살표로 발표자 화면을 쓸지 고른다. */
export function PresentButton({ onStart }: { onStart: (how: PresentHow, here: boolean) => void }) {
  const [auto, setAuto] = useState(presenterAuto)
  return (
    <div className="split">
      <button type="button" className="btn btn-primary split-main" title="처음부터 발표 (F5)" onClick={() => onStart('auto', false)}>
        <PlayIcon />
        발표하기
      </button>
      <Popover
        button={({ toggle, open }) => (
          <button type="button" className="btn btn-primary split-more" aria-label="발표 방법 고르기" aria-expanded={open} onClick={toggle}>
            <ChevronIcon />
          </button>
        )}
      >
        {(close) => (
          <div className="menu menu-present">
            <button
              type="button"
              className="menu-item"
              onClick={() => {
                close()
                onStart('presenter', false)
              }}
            >
              <span className="menu-item-name">발표자 화면과 함께 발표 <kbd>{keys('alt+F5')}</kbd></span>
              <span className="menu-item-desc">큰 화면에는 슬라이드만, 이 화면에는 다음 슬라이드, 노트, 시간이 보여요.</span>
            </button>
            <button
              type="button"
              className="menu-item"
              onClick={() => {
                close()
                onStart('single', false)
              }}
            >
              <span className="menu-item-name">슬라이드만 발표</span>
              <span className="menu-item-desc">화면 하나에 슬라이드만 꽉 차게 띄워요.</span>
            </button>
            <button
              type="button"
              className="menu-item"
              onClick={() => {
                close()
                onStart('auto', true)
              }}
            >
              <span className="menu-item-name">이 슬라이드부터 발표 <kbd>{keys('shift+F5')}</kbd></span>
              <span className="menu-item-desc">고치고 있는 슬라이드에서 시작해요.</span>
            </button>
            <div className="menu-sep" role="separator" />
            <div className="menu-toggle">
              <Toggle
                label="화면이 두 개면 발표자 화면 쓰기"
                on={auto}
                onChange={(v) => {
                  setAuto(v)
                  setPresenterAuto(v)
                }}
              />
            </div>
          </div>
        )}
      </Popover>
    </div>
  )
}

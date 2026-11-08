import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { pageInfo } from '../../deck/fields'
import { FOOTERS, MOTIONS, TRANSITIONS, footerOf, themeStyle, transitionOf } from '../../deck/themes'
import type { Deck, FooterMode, Motion, Slide, Transition } from '../../deck/types'
import { cx } from '../../lib/cx'
import { pageProps } from '../../slides/SlideCanvas'
import { useDeck } from '../../store/deckStore'
import { DeckIcon, Info, Popover } from '../ui'
import { PREVIEW_MOTION } from './DeckMenus'

// 발표 설정: 발표 전체에 한 번 정하는 것(슬라이드 아래쪽, 모션, 화면 전환). 예전에는 테마 메뉴 아래에 '아래 표시', '모션 세기',
// '화면 전환'이 이름만 있는 단추 줄로 붙어 있어서 무엇이 바뀌는지 몰랐고(“이거 뭔 말인지도 모르겠는데”), 생김새를 고르러 간
// 테마 메뉴가 복잡해 보였다. 생김새는 테마에, 발표하는 방식은 여기에 나누고, 고르는 것마다 바뀌는 모습을 작게 같이 보인다.
// 처음 값(섹션 이름, 차분하게, 자동)이 대부분의 발표에 맞아서 대개는 열 일이 없다

export function DeckSettings({ deck, slide }: { deck: Deck; slide?: Slide }) {
  const setMotion = useDeck((s) => s.setMotion)
  const setLook = useDeck((s) => s.setLook)
  const footer = footerOf(deck)
  const motion = deck.motion ?? 'calm'
  const transition = deck.theme.transition ?? 'auto'
  // 미리 보기는 이 발표의 색 그대로 (흰 바탕이면 흰 슬라이드, 검은 바탕이면 검은 슬라이드)
  const look = useMemo(() => themeStyle(deck.theme), [deck.theme])
  return (
    <Popover
      className="pop-theme pop-deckset"
      button={({ toggle, open }) => (
        <button type="button" className="btn btn-ghost" aria-expanded={open} title="발표 전체의 슬라이드 아래쪽, 모션, 화면 전환" onClick={toggle}>
          <DeckIcon />
          발표 설정
        </button>
      )}
    >
      {(close) => (
        <div className="ds">
          <section className="ds-sec" aria-labelledby="ds-foot">
            <h3 className="menu-h ds-h" id="ds-foot">
              슬라이드 아래쪽
              <Info label="슬라이드 아래쪽 설명" align="start">
                모든 슬라이드의 오른쪽 아래에 보이는 것이에요. 오른쪽 그림이 지금 슬라이드에서 보일 모습이에요. 슬라이드마다 감추려면 ‘이 슬라이드 설정’에서 꺼요.
              </Info>
            </h3>
            <div className="ds-foots" role="group" aria-label="슬라이드 아래쪽">
              {FOOTERS.map((f) => (
                <button key={f.id} type="button" className={cx('ds-foot', footer === f.id && 'is-on')} aria-pressed={footer === f.id} title={f.description} onClick={() => setLook({ footer: f.id })}>
                  <span className="ds-radio" aria-hidden="true" />
                  <span className="ds-foot-n">{f.name}</span>
                  <FootStrip deck={deck} slide={slide} mode={f.id} look={look} />
                </button>
              ))}
            </div>
          </section>

          <section className="ds-sec" aria-labelledby="ds-motion">
            <div className="ds-h-row">
              <h3 className="menu-h ds-h" id="ds-motion">
                모션
                <Info label="모션 설명" align="start">
                  발표할 때 제목, 숫자, 그림이 나타나는 모습이에요. 그림에 마우스를 올리면 움직여 보여요. 슬라이드마다 다르게 하려면 오른쪽 칸의 ‘모션’에서 골라요.
                </Info>
              </h3>
              {motion !== 'none' && (
                <button
                  type="button"
                  className="link-btn ds-see"
                  onClick={() => {
                    // 메뉴가 슬라이드를 가리지 않게 닫고 보여 준다
                    close()
                    window.dispatchEvent(new Event(PREVIEW_MOTION))
                  }}
                >
                  이 슬라이드에서 보기
                </button>
              )}
            </div>
            <div className="ds-cards ds-motions" role="group" aria-label="모션">
              {MOTIONS.map((m) => (
                <DemoCard key={m.id} name={m.name} title={m.description} on={motion === m.id} onPick={() => setMotion(m.id)}>
                  <MotionDemo level={m.id} look={look} />
                </DemoCard>
              ))}
            </div>
          </section>

          <section className="ds-sec" aria-labelledby="ds-tr">
            <h3 className="menu-h ds-h" id="ds-tr">
              화면 전환
              <Info label="화면 전환 설명" align="start">
                다음 슬라이드로 넘어갈 때의 모습이에요. ‘자동’이면 모션에 맞춰 알아서 골라요. 그림에 마우스를 올리면 넘어가는 모습을 보여요.
              </Info>
            </h3>
            <div className="ds-cards ds-trs" role="group" aria-label="화면 전환">
              {TRANSITIONS.map((t) => (
                <DemoCard
                  key={t.id}
                  name={t.name}
                  // 자동은 지금 모션에 맞춰 무엇이 되는지 같이 (차분하게면 흐리게)
                  sub={t.id === 'auto' ? nameOfTransition(transitionOf({ theme: { ...deck.theme, transition: 'auto' }, motion })) : undefined}
                  title={t.description}
                  on={transition === t.id}
                  onPick={() => setLook({ transition: t.id })}
                >
                  <TransitionDemo id={t.id === 'auto' ? transitionOf({ theme: { ...deck.theme, transition: 'auto' }, motion }) : t.id} look={look} />
                </DemoCard>
              ))}
            </div>
          </section>
        </div>
      )}
    </Popover>
  )
}

const nameOfTransition = (id: Exclude<Transition, 'auto'>) => TRANSITIONS.find((t) => t.id === id)?.name ?? ''

/**
 * 고르는 그림 하나. 고른 것의 그림은 늘 움직이고, 나머지는 움직이는 도중의 한 장면에 멈춰 있다가 마우스를 올리거나
 * 키보드로 오면 움직인다(motion.css를 쓰지 않고 deckset.css의 작은 그림 움직임으로)
 */
function DemoCard({ name, sub, title, on, onPick, children }: { name: string; sub?: string; title: string; on: boolean; onPick(): void; children: ReactNode }) {
  const [play, setPlay] = useState(false)
  return (
    <button
      type="button"
      className={cx('ds-card', on && 'is-on', (play || on) && 'is-play')}
      aria-pressed={on}
      title={title}
      onClick={onPick}
      onPointerEnter={() => setPlay(true)}
      onPointerLeave={() => setPlay(false)}
      onFocus={() => setPlay(true)}
      onBlur={() => setPlay(false)}
    >
      <span className="ds-pic" aria-hidden="true">
        {children}
      </span>
      <span className="ds-name">
        {name}
        {sub && <span className="ds-sub"> · {sub}</span>}
      </span>
    </button>
  )
}

/**
 * 슬라이드 아래쪽의 모습: 이 발표의 지금 슬라이드(섹션이 없는 표지면 섹션이 있는 첫 슬라이드)가 그 값으로 보일 글 그대로.
 * 장 전체를 작게 그리면 아래쪽 글이 읽히지 않아서 아래쪽 띠만 앱 글자 크기로 그린다(slides/styles/frame.css의 .s-foot과 같은 짜임)
 */
function FootStrip({ deck, slide, mode, look }: { deck: Deck; slide?: Slide; mode: FooterMode; look: CSSProperties }) {
  const info = useMemo(() => pageInfo(deck.slides), [deck.slides])
  const shown = slide && info.sectionOf.has(slide.id) ? slide : (deck.slides.find((s) => !s.hidden && info.sectionOf.has(s.id)) ?? slide)
  const p = shown ? pageProps(info, shown.id) : { page: 1, total: info.total, sections: info.sections, sectionIndex: -1 }
  const map = mode !== 'page' && mode !== 'none'
  return (
    <span className="ds-strip" style={look}>
      {map &&
        (p.sections.length > 1 && p.sectionIndex >= 0 ? (
          <span className="ds-map">
            {p.sections.map((name, i) => (
              <span key={i} className={cx(i === p.sectionIndex && 'is-on')}>
                {name}
              </span>
            ))}
          </span>
        ) : (
          <span className="ds-map">{deck.title}</span>
        ))}
      {(mode === 'all' || mode === 'page') && (
        <span className="ds-page">
          {p.page}
          <span> / {p.total}</span>
        </span>
      )}
    </span>
  )
}

/** 모션 정도의 작은 그림: 제목, 큰 숫자, 막대 셋이 그 정도로 나타난다 (없음은 처음부터 다 보인다) */
function MotionDemo({ level, look }: { level: Motion; look: CSSProperties }) {
  return (
    <span className={cx('ds-slide ds-mo', `is-${level}`)} style={look}>
      <i className="ds-mo-t" style={{ '--d': 0 } as CSSProperties} />
      <b className="ds-mo-n" style={{ '--d': 1 } as CSSProperties}>
        72%
      </b>
      <span className="ds-mo-bars">
        {[0.7, 0.45, 0.9].map((w, i) => (
          <i key={i} className={cx(i === 2 && 'is-key')} style={{ '--d': i + 2, '--w': w } as CSSProperties} />
        ))}
      </span>
    </span>
  )
}

/** 화면 전환의 작은 그림: 앞 슬라이드(제목과 줄)에서 다음 슬라이드(큰 숫자)로. 이어지게는 같은 숫자 상자가 새 자리로 옮겨 간다 */
function TransitionDemo({ id, look }: { id: Exclude<Transition, 'auto'>; look: CSSProperties }) {
  return (
    <span className={cx('ds-slide ds-tr', `is-${id}`)} style={look}>
      <span className="ds-tr-a">
        <i className="ds-tr-line is-title" />
        <i className="ds-tr-line" />
        <i className="ds-tr-line is-short" />
        <i className="ds-tr-box" />
      </span>
      <span className="ds-tr-b">
        <i className="ds-tr-line is-title" />
        <i className="ds-tr-bar" />
      </span>
      {/* 두 슬라이드에 같이 있는 상자: 이어지게에서만 따로 옮겨 간다. 다른 전환에서는 앞뒤 슬라이드의 상자가 슬라이드와 함께 바뀐다 */}
      {id === 'morph' && <i className="ds-tr-same" />}
    </span>
  )
}

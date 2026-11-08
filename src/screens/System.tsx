import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { BACKDROPS } from '../deck/backdrops'
import { BLOCK_GROUPS, BLOCK_LINKS, BLOCK_TYPES, BLOCKS } from '../deck/blocks'
import { BLUEPRINTS, DECK_TYPES } from '../deck/blueprints'
import { pageInfo } from '../deck/fields'
import { emptyItem } from '../deck/generate'
import { LAYOUTS, LAYOUT_GROUPS, LAYOUT_ORDER } from '../deck/layouts'
import { createSampleDeck } from '../deck/sample'
import { showcaseSlides } from '../deck/showcase'
import { ACCENT_COMBOS, comboSwatch, FONTS, fontPreview, THEMES, THEME_ORDER, TONES, isDarkLook, themeStyle } from '../deck/themes'
import type { BlockType, Deck, DeckTheme, LayoutId, Slide, ThemeId } from '../deck/types'
import { cx } from '../lib/cx'
import { go } from '../lib/router'
import { motionEngine } from '../motion/engine'
import type { SlideMode } from '../slides/context'
import { pageProps, ScaledSlide, SlideCanvas } from '../slides/SlideCanvas'
import { BlockThumb, LinkThumb } from './editor/BlockLibrary'
import { SystemBackdrops } from './SystemBackdrops'
import type { Look } from './editor/look'
import { BackIcon, Brand, CheckIcon, Segmented } from './ui'

/*
 * 장 모음: 만들 수 있는 모든 장과 모양, 테마의 색과 글자 크기를 한 화면에 늘어놓는다.
 * 쓰는 사람이 어떤 장이 있는지 눈으로 보고 고르게 하고, 만드는 사람에게는 디자인 시스템의 기준이 된다.
 * 예시 내용은 지어낸 것(showcase.ts)이고, 이 화면은 저장된 발표를 읽지 않는다.
 */

type View = 'sample' | 'blank'

const TOKENS: { v: string; name: string; use: string }[] = [
  { v: '--bg', name: '바탕', use: '슬라이드의 바탕' },
  { v: '--ink', name: '글자', use: '제목과 본문' },
  { v: '--ink-2', name: '보조 글자', use: '이끄는 말, 설명' },
  { v: '--ink-3', name: '흐린 글자', use: '출처, 보충, 쪽 번호' },
  { v: '--line', name: '줄', use: '표와 목록의 나눔선' },
  { v: '--surface', name: '면', use: '카드, 막대의 바탕' },
  { v: '--accent', name: '강조', use: '답에만: 숫자, 추천안, 강조한 막대' },
  { v: '--bold-bg', name: '짙은 면', use: '섹션 슬라이드, 표지 옆면. 강조색과 짝인 깊은 색' },
  { v: '--bold-accent', name: '짙은 면 위 강조', use: '짙은 면 안의 숫자와 점. 강조색을 밝힌 색' },
  { v: '--good', name: '좋음', use: '목표 달성, 늘어남 (▲과 함께)' },
  { v: '--bad', name: '나쁨', use: '못 미침, 줄어듦 (▼과 함께)' },
]

// 크기는 1920×1080 장 기준 px. slides.css의 값과 같게 둔다.
const TYPE: { name: string; px: number; text: string; head?: boolean; tone?: 'accent' | 'ink-2' | 'ink-3' }[] = [
  { name: '큰 숫자', px: 154, text: '3시간', head: true, tone: 'accent' },
  { name: '표지 제목', px: 90, text: '주간 회의 줄이기 개선 제안', head: true },
  { name: '슬라이드 제목', px: 62, text: '두 팀이 먼저 해 보는 B안을 추천해요', head: true },
  { name: '이끄는 말', px: 36, text: '지금은 같은 일에 매주 90분 회의를 해요', tone: 'ink-2' },
  { name: '본문', px: 30, text: '진행 상황은 회의 전에 보드에 적어 둬요' },
  { name: '보충', px: 26, text: '일주일 기준, 회의 9시간이 6시간으로', tone: 'ink-3' },
  { name: '출처', px: 22, text: '사내 집계, 9월 말 기준', tone: 'ink-3' },
]

/** 글꼴 견본으로 그리는 장: 제목, 큰 숫자, 이름표, 설명이 한 장에 다 있다 */
const FONT_SAMPLE: LayoutId = 'kpi'

const VARIANT_COUNT = LAYOUT_ORDER.reduce((n, id) => n + (LAYOUTS[id].variants?.length ?? 1), 0)

/** 부품이 가장 좁게 들어가는 너비 (12칸 격자의 칸 수 → 쓰는 사람의 말) */
const NARROWEST: Record<number, string> = { 3: '슬라이드 너비의 4분의 1', 4: '슬라이드 너비의 3분의 1', 6: '슬라이드 너비의 절반', 8: '슬라이드 너비의 3분의 2', 12: '한 줄 전체' }

/** 이 레이아웃이 어느 발표 구성에 들어가는지. 종류가 열셋이라 넷 이상이면 셋만 적고 수를 센다(한 줄을 넘지 않게) */
function usedIn(id: LayoutId): string {
  const names = DECK_TYPES.filter((t) => BLUEPRINTS[t].recipes.some((r) => r.layout === id)).map((t) => BLUEPRINTS[t].name)
  if (names.length === DECK_TYPES.length) return '모든 발표 구성에 들어가요'
  if (!names.length) return '발표 구성에는 없어요. 편집할 때 슬라이드 추가에서 넣어요'
  if (names.length > 3) return `${names.slice(0, 3).join(', ')} 등 ${names.length}가지 구성에 들어가요`
  return `${names.join(', ')} 구성에 들어가요`
}

/** 빈 칸 보기: 내용을 지우고 칸마다 안내만 보이게 */
function blankOf(slide: Slide): Slide {
  return {
    ...slide,
    fields: {},
    items: slide.items.map(() => emptyItem()),
    // 부품 장은 부품의 자리는 두고 부품 안의 글만 비운다
    ...(slide.blocks ? { blocks: slide.blocks.map((b) => ({ ...b, fields: {}, items: b.items.map(() => emptyItem()) })) } : {}),
  }
}

/** 브라우저가 계산한 색(color-mix 포함)을 #RRGGBB로 */
function hexOf(css: string, ctx: CanvasRenderingContext2D): string {
  ctx.clearRect(0, 0, 1, 1)
  ctx.fillStyle = css
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
  return '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase()
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setWidth(el.clientWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width] as const
}

export function System() {
  const [themeId, setThemeId] = useState<ThemeId>('white')
  const [accent, setAccent] = useState<string | undefined>()
  const [view, setView] = useState<View>('sample')
  const [active, setActive] = useState('sys-tokens')
  const [mainRef, width] = useWidth<HTMLDivElement>()

  const base = useMemo(() => createSampleDeck(), [])
  const all = useMemo(() => showcaseSlides(), [])
  // 단락 번호와 목차는 예시 발표 전체의 순서로 센다
  const info = useMemo(() => pageInfo(all), [all])
  const examples = useMemo(() => {
    const map = new Map<LayoutId, Slide>()
    for (const s of all) if (!map.has(s.layout)) map.set(s.layout, view === 'blank' ? blankOf(s) : s)
    return map
  }, [all, view])

  const deckTheme: DeckTheme = { id: themeId, ...(accent ? { accent } : {}) }
  const deck: Deck = { ...base, theme: deckTheme, slides: all }
  const mode: SlideMode = view === 'blank' ? 'preview' : 'final'

  // 넓으면 셋, 좁으면 둘씩. 1280 화면에서도 장 안의 글이 읽히는 크기
  const gap = 20
  const cols = width >= 1100 ? 3 : 2
  const thumbW = width ? Math.floor((width - gap * (cols - 1)) / cols) : 0

  const sections = useMemo(
    () => [
      { id: 'sys-tokens', name: '색과 글자' },
      ...LAYOUT_GROUPS.map((g, i) => ({ id: `sys-g${i}`, name: g.name, count: g.layouts.length })),
      { id: 'sys-parts', name: '컴포넌트', count: BLOCK_TYPES.length },
      { id: 'sys-backdrops', name: '배경 모션', count: BACKDROPS.length },
    ],
    [],
  )
  // 부품은 작게 넷씩(좁으면 셋). 카드에 마우스를 올리면 발표할 때의 움직임을 한 번
  const partCols = width >= 1100 ? 4 : 3
  const look = useMemo<Look>(() => ({ meta: base.meta, theme: deckTheme, title: base.title }), [base, themeId, accent])

  // 지금 보고 있는 묶음을 목차에 표시한다
  useEffect(() => {
    const els = sections.map((s) => document.getElementById(s.id)).filter((x): x is HTMLElement => !!x)
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (hit) setActive(hit.target.id)
      },
      { rootMargin: '-96px 0px -55% 0px' },
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [sections, thumbW])

  const pickTheme = (id: ThemeId) => {
    setThemeId(id)
    setAccent(undefined)
  }

  return (
    <div className="sys">
      <header className="sys-top">
        <div className="sys-top-l">
          <Brand />
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => go({ name: 'home' })}>
            <BackIcon />내 발표
          </button>
        </div>
        <div className="sys-controls">
          <div className="sys-control">
            <span className="sys-control-k">테마</span>
            <Segmented label="테마" options={THEME_ORDER.map((id) => ({ id, name: THEMES[id].name }))} value={themeId} onPick={pickTheme} />
          </div>
          <div className="sys-control">
            <span className="sys-control-k">강조색</span>
            <div className="swatches sys-swatches">
              <button
                type="button"
                className={cx('swatch', !accent && 'is-on')}
                style={{ background: comboSwatch(THEMES[themeId]) }}
                title="테마 기본색"
                aria-label="테마 기본색"
                aria-pressed={!accent}
                onClick={() => setAccent(undefined)}
              >
                {!accent && <CheckIcon />}
              </button>
              {ACCENT_COMBOS.filter((c) => c.accent !== THEMES[themeId].accent).map((c) => (
                <button
                  key={c.accent}
                  type="button"
                  className={cx('swatch', accent === c.accent && 'is-on')}
                  // 강조색과 짙은 면을 반씩: 고르면 어떤 짝으로 칠해지는지 보이게
                  style={{ background: comboSwatch(c) }}
                  title={c.name}
                  aria-label={`강조색 ${c.name}`}
                  aria-pressed={accent === c.accent}
                  onClick={() => setAccent(c.accent)}
                >
                  {accent === c.accent && <CheckIcon />}
                </button>
              ))}
            </div>
          </div>
          <div className="sys-control">
            <span className="sys-control-k">보기</span>
            <Segmented
              label="보기"
              options={[
                { id: 'sample', name: '예시 내용' },
                { id: 'blank', name: '빈 칸' },
              ]}
              value={view}
              onPick={setView}
            />
          </div>
        </div>
      </header>

      <div className="sys-body">
        <nav className="sys-nav" aria-label="슬라이드 모음 목차">
          {sections.map((s) => (
            <button
              key={s.id}
              type="button"
              className={cx('sys-nav-item', active === s.id && 'is-on')}
              aria-current={active === s.id || undefined}
              onClick={() => document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            >
              <span>{s.name}</span>
              {'count' in s && <span className="sys-nav-n">{s.count}</span>}
            </button>
          ))}
        </nav>

        <main className="sys-main" ref={mainRef}>
          <div className="sys-intro">
            <h1 className="sys-h1">슬라이드 모음</h1>
            <p className="sys-lead">
              만들 수 있는 슬라이드 {LAYOUT_ORDER.length}가지와 모양 {VARIANT_COUNT}가지, 컴포넌트 슬라이드에 넣는 컴포넌트 {BLOCK_TYPES.length}가지를 모았어요. 위에서 테마와
              강조색을 바꾸면 모두 함께 바뀌어요. 발표를 편집할 때 ‘슬라이드 추가’와 ‘컴포넌트 넣기’에서 넣을 수 있어요.
            </p>
          </div>

          <section id="sys-tokens" className="sys-group">
            <h2 className="sys-h2">색과 글자</h2>
            <p className="sys-group-desc">슬라이드마다 같은 색과 글자 크기를 써요. 강조색은 답에만 써서 보는 분의 눈이 한곳에 모이게 해요.</p>
            <Tokens deckTheme={deckTheme} />
            {thumbW > 0 && (
              <div className="sys-thumbs" style={{ '--cols': cols, '--gap': `${gap}px` }}>
                <figure className="sys-thumb sys-thumb-wide">
                  <TypeScale deckTheme={deckTheme} width={thumbW * 2 + gap} />
                  <figcaption>
                    <b>글자 크기</b>
                    <span>회의실 뒷자리에서도 읽히는 크기예요. 가장 작은 출처도 22로 둬요.</span>
                  </figcaption>
                </figure>
              </div>
            )}
            <h3 className="sys-h3 sys-tones-h">글꼴</h3>
            <p className="sys-group-desc">테마 메뉴에서 제목과 본문의 글꼴 짝 하나를 골라요. 모두 앱과 내보낸 파일에 들어 있어서 어느 PC에서 열어도 같아요.</p>
            {/* 넷을 둘씩: 셋씩 놓으면 하나가 혼자 남고, 글꼴은 크게 봐야 차이가 보인다 */}
            {width > 0 && examples.get(FONT_SAMPLE) && (
              <div className="sys-thumbs" style={{ '--cols': 2, '--gap': `${gap}px` }}>
                {FONTS.map((f) => {
                  const s = examples.get(FONT_SAMPLE)!
                  return (
                    <figure key={f.id} className="sys-thumb">
                      <ScaledSlide width={Math.floor((width - gap) / 2)}>
                        <SlideCanvas deck={{ ...deck, theme: { ...deckTheme, font: f.id } }} slide={s} mode={mode} {...pageProps(info, s.id)} />
                      </ScaledSlide>
                      <figcaption>
                        <b style={fontPreview(f.id)}>{f.name}</b>
                        <span>{f.description}</span>
                      </figcaption>
                    </figure>
                  )
                })}
              </div>
            )}
            <h3 className="sys-h3 sys-tones-h">슬라이드의 바탕</h3>
            {width > 0 && examples.get('statement') && (
              <div className="sys-thumbs" style={{ '--cols': 3, '--gap': `${gap}px` }}>
                {TONES.map((t) => {
                  const s = examples.get('statement')!
                  return (
                    <figure key={t.id} className="sys-thumb">
                      <ScaledSlide width={Math.floor((width - gap * 2) / 3)}>
                        <SlideCanvas deck={deck} slide={{ ...s, options: { ...s.options, tone: t.id } }} mode={mode} {...pageProps(info, s.id)} />
                      </ScaledSlide>
                      <figcaption>
                        <b>{t.name}</b>
                        <span>{t.description}</span>
                      </figcaption>
                    </figure>
                  )
                })}
              </div>
            )}
          </section>

          {LAYOUT_GROUPS.map((g, gi) => (
            <section key={g.name} id={`sys-g${gi}`} className="sys-group">
              <h2 className="sys-h2">{g.name}</h2>
              <p className="sys-group-desc">{g.description}</p>
              {g.layouts.map((id) => {
                const spec = LAYOUTS[id]
                const slide = examples.get(id)
                const variants = spec.variants ?? [{ id: 'base', name: '' }]
                return (
                  <article key={id} className="sys-layout">
                    <div className="sys-layout-head">
                      <h3 className="sys-h3">{spec.name}</h3>
                      {variants.length > 1 && <span className="sys-tag">모양 {variants.length}가지</span>}
                    </div>
                    <p className="sys-layout-desc">{spec.description}</p>
                    <p className="sys-layout-use">{usedIn(id)}</p>
                    {slide && thumbW > 0 && (
                      <div className="sys-thumbs" style={{ '--cols': cols, '--gap': `${gap}px` }}>
                        {variants.map((v) => (
                          <figure key={v.id} className="sys-thumb">
                            <ScaledSlide width={thumbW}>
                              <SlideCanvas deck={deck} slide={{ ...slide, variant: v.id }} mode={mode} {...pageProps(info, slide.id)} />
                            </ScaledSlide>
                            {variants.length > 1 && (
                              <figcaption>
                                <b>{v.name}</b>
                              </figcaption>
                            )}
                          </figure>
                        ))}
                      </div>
                    )}
                  </article>
                )
              })}
            </section>
          ))}

          <section id="sys-parts" className="sys-group">
            <h2 className="sys-h2">컴포넌트</h2>
            <p className="sys-group-desc">
              컴포넌트 슬라이드에 끌어다 놓는 컴포넌트예요. 정해진 줄과 너비에만 들어가서 대충 놓아도 반듯해요. 마우스를 올리면 발표할 때의 모션을 보여 줘요.
            </p>
            {width > 0 &&
              BLOCK_GROUPS.map((g) => (
                <div key={g.name} className="sys-parts">
                  <h3 className="sys-h3">{g.name}</h3>
                  <div className="sys-thumbs" style={{ '--cols': partCols, '--gap': `${gap}px` }}>
                    {g.types.map((type) => (
                      <PartCard key={type} look={look} type={type} blank={view === 'blank'} />
                    ))}
                  </div>
                </div>
              ))}
            {width > 0 && (
              <div className="sys-parts">
                <h3 className="sys-h3">연결 기호</h3>
                <p className="sys-group-desc">컴포넌트 사이에 끼워 둘이 어떻게 이어지는지 보여 줘요. 컴포넌트 사이의 빈자리에 혼자 서서 컴포넌트를 가리지 않아요.</p>
                <div className="sys-thumbs" style={{ '--cols': partCols, '--gap': `${gap}px` }}>
                  {BLOCK_LINKS.map((l) => (
                    <figure key={l.id} className="sys-thumb sys-part">
                      <LinkThumb deck={look} link={l.id} mode="final" />
                      <figcaption>
                        <b>{l.name}</b>
                        <span>{l.description}</span>
                      </figcaption>
                    </figure>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section id="sys-backdrops" className="sys-group">
            <h2 className="sys-h2">배경 모션</h2>
            <p className="sys-group-desc">
              글과 컴포넌트 뒤에 까는 잔잔한 그래픽이에요. 슬라이드의 말에 맞는 분위기를 골라요. 발표할 때 슬라이드와 함께 한 번 들어오고 가라앉아요. 마우스를 올리면 들어오는 모습을 보여 줘요.
            </p>
            {thumbW > 0 && <SystemBackdrops deck={deck} examples={examples} mode={mode} width={thumbW} cols={cols} gap={gap} />}
          </section>
        </main>
      </div>
    </div>
  )
}

const engine = motionEngine()
const played = new WeakMap<Element, number>()

/** 부품 하나: 예시 그림과 이름, 하는 일, 움직임, 가장 좁은 너비 */
function PartCard({ look, type, blank }: { look: Look; type: BlockType; blank: boolean }) {
  const spec = BLOCKS[type]
  const play = (card: HTMLElement) => {
    const cell = card.querySelector<HTMLElement>('.bk')
    const now = performance.now()
    // 움직이는 중에 다시 올려도 처음부터 다시 하지 않는다
    if (!cell || now - (played.get(cell) ?? -1e9) < 1400) return
    played.set(cell, now)
    engine.play(cell, 'calm')
  }
  return (
    <figure className="sys-thumb sys-part" onPointerEnter={(e) => play(e.currentTarget)}>
      <BlockThumb deck={look} type={type} blank={blank} mode={blank ? 'preview' : 'final'} />
      <figcaption>
        <b>{spec.name}</b>
        <span>{spec.description}</span>
        <span className="sys-part-meta">모션: {spec.motion}</span>
        <span className="sys-part-meta">{NARROWEST[spec.minSpan] ?? ''}까지 좁아져요</span>
      </figcaption>
    </figure>
  )
}

/** 테마의 색. 짙은 면처럼 장 안에서 섞어 만드는 색도 있어서, 실제 장과 같은 조건의 숨은 장에서 읽는다. */
function Tokens({ deckTheme }: { deckTheme: DeckTheme }) {
  const probe = useRef<HTMLDivElement>(null)
  const [hex, setHex] = useState<string[]>([])
  const dark = isDarkLook(deckTheme)
  const key = `${deckTheme.id}${deckTheme.accent ?? ''}`
  useLayoutEffect(() => {
    const el = probe.current
    const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
    if (!el || !ctx) return
    setHex([...el.children].map((c) => hexOf(getComputedStyle(c).backgroundColor, ctx)))
  }, [key])
  return (
    <>
      <div ref={probe} className={cx('slide sys-probe', dark && 'is-dark')} style={themeStyle(deckTheme)} aria-hidden="true">
        {TOKENS.map((t) => (
          <i key={t.v} style={{ background: `var(${t.v})` }} />
        ))}
      </div>
      <ul className="sys-tokens">
        {TOKENS.map((t, i) => (
          <li key={t.v} className="sys-token">
            <span className="sys-chip" style={{ background: hex[i] }} />
            <b>{t.name}</b>
            <span className="sys-token-hex">{hex[i]}</span>
            <span className="sys-token-use">{t.use}</span>
          </li>
        ))}
      </ul>
    </>
  )
}

/** 글자 크기 견본. 실제 장과 같은 서체와 색으로, 너비 1920 기준 크기를 장 미리보기와 같은 비율로 줄여 그린다. */
function TypeScale({ deckTheme, width }: { deckTheme: DeckTheme; width: number }) {
  return (
    <div className="sys-type" style={{ ...themeStyle(deckTheme), zoom: width / 1920 }}>
      {TYPE.map((t) => (
        <div key={t.name} className="sys-type-row">
          <span className="sys-type-k">
            {t.name}
            <span className="sys-type-px">{t.px}</span>
          </span>
          <span
            className={cx('sys-type-v', t.head && 'is-head')}
            style={{ fontSize: t.px, color: t.tone ? `var(--${t.tone})` : undefined }}
          >
            {t.text}
          </span>
        </div>
      ))}
    </div>
  )
}

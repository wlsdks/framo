import { memo, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { LAYOUTS, PANE_UNIT, panesOf, placeOf, sideOf, variantOf } from '../deck/layouts'
import { fontOf, footerOf, isDarkLook, motionOf, themeStyle, toneOf, transitionOf } from '../deck/themes'
import { presentable, type PageInfo } from '../deck/fields'
import { sceneOf } from '../deck/scenes'
import type { Deck, Slide } from '../deck/types'
import { cx } from '../lib/cx'
import { Backdrop } from './Backdrop'
import { Compose } from './blocks'
import { fitBlocks } from './fitBlocks'
import { T } from './fields'
import { SlideContext, type SlideActions, type SlideMode } from './context'
import { useHalos } from './halos'
import { BOLD_LAYOUTS, LAYOUT_VIEWS } from './layouts'
import { liveAfter, liveBefore } from './liveMotion'
import { PaneTools } from './panes'
import { sharedScales, type Scale } from './sharedScale'

export const SLIDE_W = 1920
export const SLIDE_H = 1080

interface SlideCanvasProps {
  deck: Pick<Deck, 'meta' | 'theme' | 'title' | 'motion'>
  slide: Slide
  mode: SlideMode
  actions?: SlideActions
  /** 화면에 보이는 장 기준 번호 (1부터). 0이면 표시하지 않는다. */
  page?: number
  total?: number
  /** 발표의 단락 이름들과 이 장이 속한 단락 (0부터) */
  sections?: readonly string[]
  sectionIndex?: number
  /** 부품 하나만 이 크기(캔버스 px)로: 부품 고르기 카드, 끌고 있는 부품 */
  solo?: { w: number; h: number }
  /** 이어 움직이는 이웃 장과 같이 쓰는 차트의 잣대(차트 자리 → 잣대, sharedScale.ts). pageProps가 넘긴다 */
  scales?: ReadonlyMap<string, Scale>
}

const NO_SECTIONS: readonly string[] = []

/** 덱 전체 정보에서 한 장에 필요한 쪽 번호와 단락 정보를 꺼낸다 */
export function pageProps(info: PageInfo, slideId: string) {
  return {
    page: info.page.get(slideId) ?? 0,
    total: info.total,
    sections: info.sections,
    sectionIndex: info.sectionOf.get(slideId) ?? -1,
    scales: sharedScales(info).get(slideId),
  }
}

/** 단락 이름이 그대로면 같은 배열을 돌려준다. 축소 목록이 글자 하나 칠 때마다 다시 그려지지 않게. */
export function useStableSections(info: PageInfo): readonly string[] {
  const key = info.sections.join('\n')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => info.sections, [key])
}

/** 다 받은 글꼴 묶음의 수. 글꼴 조각이 새로 오면 는다 (그린 장을 다시 맞출 때를 알려고. 글꼴을 하나씩 세면 장마다 수백 개를 센다) */
let fontBatches = 0
if (typeof document !== 'undefined') document.fonts?.addEventListener?.('loadingdone', () => fontBatches++)
const fontsLoaded = () => fontBatches

/**
 * 글꼴이 온 뒤 다시 맞출 장들. 기다리던 장(고치는 장, 목록 그림, 미리 보기)이 한꺼번에 다시 맞추면 한 일이 길어져(느린 PC에서 장을 더한 뒤
 * 0.1초 넘게) 그 사이 손을 받지 못했다. 한 일에 12ms까지만 맞추고 나머지는 다음 일로 넘긴다
 */
const refits: (() => void)[] = []
function afterFonts(refit: () => void) {
  refits.push(refit)
  if (refits.length > 1) return
  const pump = () => {
    const t0 = performance.now()
    while (refits.length && performance.now() - t0 < 12) refits.shift()!()
    if (refits.length) window.setTimeout(pump)
  }
  window.setTimeout(pump)
}

/** 1920×1080 슬라이드 한 장. 크기 맞춤은 바깥 프레임이 한다. */
export const SlideCanvas = memo(function SlideCanvas({
  deck,
  slide: given,
  mode,
  actions,
  page = 0,
  total = 0,
  sections = NO_SECTIONS,
  sectionIndex = -1,
  solo,
  scales,
}: SlideCanvasProps) {
  // 발표 모습(발표, 미리 보기, 내보낸 파일)에서는 하나도 채우지 않은 항목을 그리지 않는다
  const slide = useMemo(() => (mode === 'final' ? presentable(given) : given), [given, mode])
  const View = slide.layout === 'compose' ? Compose : LAYOUT_VIEWS[slide.layout]
  const spec = LAYOUTS[slide.layout]
  const bold = BOLD_LAYOUTS.includes(slide.layout)
  const canRemoveItem = !!spec.items && slide.items.length > spec.items.min
  const density = deck.meta.method === 'send' ? 'd-read' : 'd-present'
  // 표지, 단락 장, 마지막 장은 모양(색 면, 바탕)으로 면을 고르므로 장의 바탕은 바꾸지 않는다
  const tone = bold ? 'base' : toneOf(slide)
  const size = deck.theme.size === 'small' || deck.theme.size === 'large' ? `sz-${deck.theme.size}` : null
  const footer = footerOf(deck)
  // 아래 띠 한 줄: 왼쪽에 이 장의 출처(숫자 장), 오른쪽에 단락 지도와 쪽 번호. 예전에는 출처를 단락 지도 바로 위에
  // 따로 얹어서 작은 회색 글 두 줄이 왼쪽 아래에 쌓였다
  const source = spec.fields.some((f) => f.key === 'source')
  const mark = !bold && page > 0 && footer !== 'none'
  const ref = useRef<HTMLDivElement>(null)
  useHalos(ref, mode === 'edit')
  // 편집 화면에서 다시 맞춘 자리로 부드럽게 (liveMotion.ts): 레이아웃 장은 여기서, 부품 장의 판은 BlockArea(useFlip)가 한다.
  // 그리기 전에(아직 옛 모습일 때) 보이는 자리를 재 둔다. 잰 장이 그린 장과 다르면(다른 장으로 넘어갔으면) 움직이지 않는다
  const live = mode === 'edit' && !solo
  const compose = given.layout === 'compose'
  const shown = useRef(given.id)
  if (live && !compose) liveBefore(ref.current, shown.current)
  useEffect(() => {
    const el = ref.current
    if (!live || !el) return
    // 글을 쓴 키는 그리기 전에 이미 글이 늘어 아래 항목이 밀려 있다(레이아웃 장은 흐름으로 놓인다). 그래서 키가 들어가기 직전에 잰다.
    // 부품 장은 판(본문 상자)을 잰다: 장 제목이 두 줄이 되어 판이 낮아질 때도 칸이 옛 자리에서 미끄러진다
    const before = () => liveBefore(el.querySelector(':scope > .bk-area') ?? el, shown.current)
    el.addEventListener('beforeinput', before, true)
    return () => el.removeEventListener('beforeinput', before, true)
  }, [live])
  // 쓰는 동안 붙잡아 둔 눈높이와 글자 단계(fitBlocks.ts의 typingIn)는 이 장의 글 칸을 떠나면 놓는다: 다시 맞추고, 바뀐 자리로는
  // 미끄러진다. Enter나 Esc로 쓰기를 끝내면 바뀐 것이 없어 다시 그리지 않으니 여기서 부른다(부품 장은 BlockArea가 같은 일을 한다)
  const [, release] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    const el = ref.current
    if (!live || compose || !el) return
    const out = () =>
      requestAnimationFrame(() => {
        const a = document.activeElement
        if (!ref.current || (a?.classList.contains('ed-input') && ref.current.contains(a))) return
        if (watch.current) watch.current.changed = true
        release()
      })
    el.addEventListener('focusout', out)
    return () => el.removeEventListener('focusout', out)
  }, [live, compose])
  // 레이아웃 장의 채움(fitBlocks.ts의 fitLayout): 내용이 본문의 60%에 못 미치면 글자를 단계로 키우고 줄 사이를 넓힌다.
  // 부품 장은 판(BlockArea)이 맞춘다. 글꼴이 늦게 오면 그 전에 잰 값은 대신 쓴 글꼴의 것이라 한 번 더
  // 그릴 때마다 맞추던 때는 쪽 번호만 바뀐 그림(장을 더하거나 빼면 목록의 모든 그림)도 장마다 다시 맞춰서, 느린 PC에서 장 하나를
  // 더하는 데 0.2초 넘게 걸렸다. 맞추기는 앞의 값을 지우고 처음부터 재므로, 장 안(아래 띠 밖)의 글, 칸, 클래스, 스타일과 장의 크기,
  // 받은 글꼴이 그대로면 다시 맞춰도 같은 값이다. 그래서 그것이 바뀐 때만 맞춘다. 장 안이 바뀐 것은 MutationObserver로 안다:
  // 무엇이 바뀌는지 값으로 늘어놓으면(글, 레이아웃, 테마, 글꼴, 글자 크기 …) 새 값을 더할 때 빠뜨리기 쉽다
  const watch = useRef<{ mo: MutationObserver; changed: boolean; sign: string } | null>(null)
  // 글꼴을 기다리는 중인지 (같은 기다림을 여러 번 걸지 않게)
  const waiting = useRef(false)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || given.layout === 'compose' || solo) return
    // 아래 띠(쪽 번호, 단락 지도, 출처)는 장의 틀 밖에 따로 서서(position: absolute) 본문 맞추기에 닿지 않는다
    const counts = (records: MutationRecord[]) => records.some((r) => !(r.target instanceof Element ? r.target : r.target.parentElement)?.closest('.s-foot'))
    // 장을 줄여 그리는 배율(감싼 상자의 transform)과 받은 글꼴도 맞추기에 닿는다
    const signOf = (el: HTMLElement) => `${el.parentElement?.getAttribute('style') ?? ''}|${fontsLoaded()}`
    const fit = (el: HTMLElement) => {
      fitBlocks(el)
      if (typeof MutationObserver === 'undefined') return
      const mo =
        watch.current?.mo ??
        new MutationObserver((records) => {
          if (watch.current && counts(records)) watch.current.changed = true
        })
      if (!watch.current) mo.observe(el, { subtree: true, childList: true, characterData: true, attributes: true })
      // 맞추며 바꾼 값은 바뀐 것으로 세지 않는다
      mo.takeRecords()
      watch.current = { mo, changed: false, sign: signOf(el) }
    }
    const w = watch.current
    if (!w || counts(w.mo.takeRecords()) || w.changed || w.sign !== signOf(el)) fit(el)
    // 글꼴을 받는 중이면 다 온 뒤에 한 번 더. 맞추기가 글을 재면서 새로 쓸 글자의 글꼴 조각을 부르므로 그 뒤에 본다.
    // 예전에는 그릴 때마다 물어서, 글꼴이 다 왔어도 바로 이어서 한 번 더 맞췄고(그림마다 두 번) fonts.ready를 읽는 것만으로 스타일을 다시 계산했다.
    // 다음 그림에서 건너뛰어도 기다림은 그대로 둔다(그 사이에 다시 그리지 않으면 글꼴이 와도 맞추지 않게 된다)
    if (document.fonts?.status !== 'loading' || waiting.current) return
    waiting.current = true
    document.fonts.ready.then(() =>
      afterFonts(() => {
        waiting.current = false
        const now = ref.current
        if (now?.isConnected && !now.classList.contains('l-compose') && !now.classList.contains('is-solo')) fit(now)
      }),
    )
  })
  // 맞춘 뒤: 재 둔 옛 자리에서 새 자리로
  useLayoutEffect(() => {
    if (live && !compose) liveAfter(ref.current, given.id)
    shown.current = given.id
  })
  useLayoutEffect(
    () => () => {
      watch.current?.mo.disconnect()
      watch.current = null
    },
    [],
  )
  // 두 판으로 나뉜 장: 옆 판의 자리(왼쪽, 오른쪽)와 너비. 레이아웃 CSS가 --side-w를 쓴다
  // (편집할 때 너비가 부드럽게 바뀌도록 등록한 값이라 CSS의 기본값이 먹지 않는다. 판이 있는 장은 늘 적는다)
  const panes = panesOf(slide)
  const place = placeOf(slide)
  const side = sideOf(slide)
  const themed = themeStyle(deck.theme, tone)
  const style: CSSProperties = side !== null ? { ...themed, '--side-w': `${side * PANE_UNIT}px` } : themed

  return (
    <SlideContext.Provider value={{ slide, meta: deck.meta, mode, actions, canRemoveItem, sections, sectionIndex, scale: scales?.get(''), scales }}>
      <div
        ref={ref}
        className={cx(
          'slide',
          `l-${slide.layout}`,
          `t-${deck.theme.id}`,
          `f-${fontOf(deck.theme)}`,
          density,
          bold && 'is-bold',
          `m-${mode}`,
          // 움직임과 전환은 클래스로 남겨 내보낸 파일의 뷰어도 같은 값을 읽게 한다
          `mo-${motionOf(deck, slide)}`,
          `tr-${transitionOf(deck, slide)}`,
          `va-${variantOf(slide)}`,
          size,
          slide.options.hideHead === true && 'hide-head',
          slide.options.hideFoot === true && 'hide-foot',
          tone !== 'base' && `tone-${tone}`,
          isDarkLook(deck.theme, tone) && 'is-dark',
          solo && 'is-solo',
          panes && slide.options.flip && 'is-flip',
          // 제목 덩어리의 자리: 레이아웃 기본 자리면 붙이지 않는다
          place && place !== spec.place?.base && `pl-${place}`,
        )}
        style={solo ? { ...themed, width: solo.w, height: solo.h } : style}
        // 장면도 슬라이드에 남겨 내보낸 파일의 뷰어가 같은 컷으로 움직이게 한다. 지금 레이아웃에 맞을 때만(sceneOf)
        data-scene={sceneOf(slide) ?? undefined}
      >
        {/* 배경: 글과 컴포넌트 뒤의 그래픽 (Backdrop.tsx). 컴포넌트 하나만 그릴 때는 없다 */}
        {!solo && <Backdrop value={slide.backdrop} />}
        <View />
        {mode === 'edit' && spec.panes && !solo && <PaneTools />}
        {!solo && slide.options.hideFoot !== true && (source || mark) && (
          <footer className="s-foot">
            {source ? <T k="source" className="s-source" /> : <span />}
            {mark && (
              <div className="s-mark">
                {footer === 'page' ? null : sections.length > 1 && sectionIndex >= 0 ? (
                  <ol className="s-map">
                    {sections.map((name, i) => (
                      <li key={i} className={cx(i === sectionIndex && 'is-on')}>
                        {name}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <span className="s-deck">{deck.title}</span>
                )}
                {footer !== 'section' && (
                  <span className="s-page">
                    {page}
                    <span className="s-total"> / {total}</span>
                  </span>
                )}
              </div>
            )}
          </footer>
        )}
      </div>
    </SlideContext.Provider>
  )
})

/** 정해진 너비로 축소한 슬라이드 (목록, 미리보기) */
/**
 * 작게 줄인 슬라이드. decorative면 화면 읽기 프로그램에서 뺀다: 장 목록이나 장 고르기의 단추 안에 그대로 두면
 * 단추 이름이 장 안의 모든 글이 되어 '3번 장' 하나를 듣는 데 수십 줄을 들어야 했다. 이름은 단추가 따로 짧게 단다
 */
export function ScaledSlide({ width, children, className, decorative }: { width: number; children: ReactNode; className?: string; decorative?: boolean }) {
  const scale = width / SLIDE_W
  return (
    <div className={cx('slide-frame', className)} style={{ width, height: (width * SLIDE_H) / SLIDE_W }} aria-hidden={decorative || undefined}>
      <div className="slide-scale" style={{ transform: `scale(${scale})` }}>
        {children}
      </div>
    </div>
  )
}

/** 부모 영역 안에 최대한 크게 맞추는 슬라이드. `below`는 슬라이드 바로 아래에 같은 너비로 붙는다. */
export function FitSlide({
  children,
  className,
  padding = 0,
  below,
  belowHeight = 0,
}: {
  children: ReactNode
  className?: string
  padding?: number
  below?: ReactNode
  belowHeight?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setBox({ w: el.clientWidth, h: el.clientHeight })
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const scale = Math.max(0.05, Math.min((box.w - padding * 2) / SLIDE_W, (box.h - padding * 2 - belowHeight) / SLIDE_H))
  const w = SLIDE_W * scale
  const h = SLIDE_H * scale
  const frame = (
    <div className="slide-frame" style={{ width: w, height: h }}>
      {/* --vs: 슬라이드 안의 편집 도구(부품 도구)가 축소와 상관없이 같은 크기로 보이게 */}
      <div className="slide-scale" style={{ transform: `scale(${scale})`, '--vs': scale }}>
        {children}
      </div>
    </div>
  )
  return (
    <div ref={ref} className={cx('fit-area', className)}>
      {box.w > 0 &&
        (below ? (
          <div className="fit-group" style={{ width: w }}>
            {frame}
            <div className="fit-below" style={{ height: belowHeight }}>
              {below}
            </div>
          </div>
        ) : (
          frame
        ))}
    </div>
  )
}

// 개발용 갤러리의 배경 장(#/gallery?set=backdrops). 배경마다 그 뜻에 어울리는 장 하나에 처음 고를 때의 자리로 깐다.
// &bd=diffuse처럼 주면 다른 갤러리의 모든 장에 그 배경을, &bdat=right(자리 id), &bds=soft|strong(짙기)으로 자리와 짙기를 바꿔 본다.
// set=bdsheet&kinds=diffuse&t=0,300,600 은 그 배경의 장을 들어오기의 때마다(ms, 끝을 지나면 잔잔한 반복) 멈춰 늘어놓는다(움직임을 한눈에)

import { useLayoutEffect, useRef } from 'react'
import { BACKDROP_PLACES, BACKDROPS, baseBackdrop, isBackdropKind, isBackdropStrength } from '../deck/backdrops'
import { pageInfo, type PageInfo } from '../deck/fields'
import { showcaseSlides } from '../deck/showcase'
import type { Deck, Slide } from '../deck/types'
import { backdrops } from '../slides/Backdrop'
import { pageProps, ScaledSlide, SlideCanvas } from '../slides/SlideCanvas'

/** 장에 배경을 깐다. 자리(place id)와 짙기를 주면 그것으로 */
export function withBackdrop(slide: Slide, kind: string | null, place?: string | null, strength?: string | null): Slide {
  if (!isBackdropKind(kind)) return slide
  const at = BACKDROP_PLACES.find((p) => p.id === place)?.at
  return { ...slide, backdrop: { ...baseBackdrop(slide, kind), ...(at ? { at } : {}), ...(isBackdropStrength(strength) ? { strength } : {}) } }
}

export function backdropSlides(params: URLSearchParams): Slide[] {
  const pool = showcaseSlides()
  const only = params.get('kinds')?.split(',')
  return BACKDROPS.filter((b) => !only || only.includes(b.id)).map((b) => {
    const base = pool.find((s) => s.layout === b.showOn) ?? pool[0]
    return withBackdrop({ ...base, id: `bd-${b.id}` }, b.id, params.get('bdat'), params.get('bds'))
  })
}

/** 한 장을 정한 때의 배경으로: 그린 뒤 배경 SVG만 그 순간의 그림으로 바꾼다 */
function Moment({ deck, info, slide, t, width }: { deck: Deck; info: PageInfo; slide: Slide; t: number; width: number }) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>('.s-bd')
    if (el) backdrops.frame(el, t)
  })
  return (
    <figure ref={ref} style={{ margin: 0 }}>
      <ScaledSlide width={width}>
        {/* 쪽과 단락 정보도 넘긴다: 빠뜨리면 섹션 장의 큰 번호가 그려지지 않는다(되풀이 띠에서 번호가 사라진 것은 이 때문이었다) */}
        <SlideCanvas deck={deck} slide={slide} mode="final" {...pageProps(info, slide.id)} />
      </ScaledSlide>
      <figcaption style={{ font: '13px sans-serif', color: '#fff', padding: '4px 0' }}>{(t / 1000).toFixed(2)}s</figcaption>
    </figure>
  )
}

export function BackdropSheet({ deck, params }: { deck: Deck; params: URLSearchParams }) {
  const times = (params.get('t') ?? '0,250,500,750,1000,1500,2000,2500,3000,3500,8000,14000').split(',').map(Number)
  const width = Number(params.get('w')) || 480
  const info = pageInfo(deck.slides, deck)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Number(params.get('cols')) || 4}, ${width}px)`, gap: 8, padding: 8, background: '#777' }}>
      {deck.slides.flatMap((slide) => times.map((t) => <Moment key={`${slide.id}-${t}`} deck={deck} info={info} slide={slide} t={t} width={width} />))}
    </div>
  )
}

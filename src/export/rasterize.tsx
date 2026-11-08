// 장을 발표할 때 모습 그대로 그림(PNG)으로. PPT로 내보내기(그림)가 쓴다. 서버 없이 이 화면 안에서만 그린다.
//
// 1. 진짜 SlideCanvas를 화면 밖 1920×1080 상자에 발표 모드로 그린다. 부품 장의 글자 맞추기(fitBlocks)와 위치 비교의
//    이름표 자리는 그려진 크기를 재서 정하므로, HTML 문자열이 아니라 실제로 그린 DOM이 있어야 한다.
// 2. 쓰인 글꼴 조각을 받아 두고(document.fonts) 다시 맞춘 뒤, 맞춘 값(칸마다 붙은 style의 CSS 변수, 이름표 클래스)이
//    든 DOM을 XML로 옮겨 SVG <foreignObject>에 넣는다. CSS(slides.css, blocks.css)와 글꼴(data: 주소)도 같이 넣는다.
//    SVG 그림은 바깥 것을 하나도 읽지 못해서(보안상 브라우저가 막는다) 필요한 것을 모두 안에 넣어야 한다.
// 3. 그 SVG를 그림으로 읽어 캔버스에 그리고 PNG로 받는다.
//
// 움직임: 발표할 때의 움직임은 엔진(motion/engine.ts)이 장을 띄울 때 걸고, 끝 모습은 CSS 그대로다(fill: backwards).
// 여기서는 엔진을 부르지 않으므로 처음부터 다 보인 끝 모습이다. motion.css는 엔진이 움직이는 동안만 붙이는 요소의
// 모양이라 넣지 않는다.
//
// 콘솔에서 그림만 볼 때: 편집 화면에서 `await pptPreview()` (exposePptDebug).

import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { pageInfo } from '../deck/fields'
import type { Deck, Slide } from '../deck/types'
import { fitBlocks } from '../slides/fitBlocks'
import { pageProps, SLIDE_H, SLIDE_W, SlideCanvas } from '../slides/SlideCanvas'
import slidesCss from '../slides/slides.css?inline'
import blocksCss from '../slides/blocks.css?inline'
import { codePointsOf, cssGlyphs, embedFonts, fontFamiliesOf, rangeHits } from './fonts'
import { pptxSlidesOf, xmlChars } from './pptx'

const XHTML = 'http://www.w3.org/1999/xhtml'
const SLIDE_CSS = `${slidesCss}\n${blocksCss}`

const CSS_TEXT = cssGlyphs(SLIDE_CSS)

function escapeXml(text: string): string {
  return text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)
}

/**
 * 한 박자 쉬기: 다른 일(알림 다시 그리기, 누른 키)이 끼어들 틈을 준다. 장이 많으면 만드는 동안 다른 탭으로 가기 쉬운데,
 * 뒤로 간 탭에서는 requestAnimationFrame이 멈추고 setTimeout은 1초, 5분이 지나면 1분에 한 번으로 늦춰진다.
 * MessageChannel의 메시지는 늦추지 않아서 이것으로 쉰다
 */
function yieldTask(): Promise<void> {
  return new Promise((resolve) => {
    const ch = new MessageChannel()
    ch.port1.onmessage = () => {
      ch.port1.close()
      resolve()
    }
    ch.port2.postMessage(null)
  })
}

/** 장에 쓰인 글자가 든 글꼴 조각을 받는다. 화면 밖 상자는 그려지지 않아서 브라우저가 알아서 받지 않을 수 있다 */
async function loadFonts(text: string, families: RegExp): Promise<void> {
  if (!document.fonts) return
  const used = codePointsOf(text)
  const faces: FontFace[] = []
  document.fonts.forEach((f) => {
    if (f.status === 'unloaded' && families.test(f.family) && rangeHits(f.unicodeRange, used)) faces.push(f)
  })
  await Promise.all(faces.map((f) => f.load().catch(() => undefined)))
  await document.fonts.ready
}

/** 이 안의 장들에 쓰인 글자(CSS가 그리는 글자까지)가 든 글꼴 조각을 받는다. PDF로 내보내기(인쇄)도 인쇄 전에 쓴다 */
export function loadSlideFonts(root: Element, deck: Deck): Promise<void> {
  return loadFonts((root.textContent ?? '') + CSS_TEXT, fontFamiliesOf(deck.theme))
}

/** 장 안의 그림 가운데 data: 주소가 아닌 것(blob: 같은)은 SVG 안에서 읽히지 않아서 data: 주소로 바꾼다 */
async function inlineImages(root: Element): Promise<void> {
  const imgs = Array.from(root.querySelectorAll('img'))
  await Promise.all(
    imgs.map(async (img) => {
      const src = img.getAttribute('src') ?? ''
      if (src && !src.startsWith('data:')) {
        try {
          const blob = await (await fetch(src)).blob()
          img.setAttribute(
            'src',
            await new Promise<string>((resolve, reject) => {
              const reader = new FileReader()
              reader.onload = () => resolve(reader.result as string)
              reader.onerror = () => reject(reader.error)
              reader.readAsDataURL(blob)
            }),
          )
        } catch {
          // 읽지 못한 그림은 비워 둔다 (SVG 안에서 어차피 그려지지 않는다)
        }
      }
      await img.decode().catch(() => undefined)
    }),
  )
}

function svgOf(slide: HTMLElement, css: string): string {
  // HTML로 옮기면(outerHTML) <br>, <img>처럼 닫지 않은 태그가 남아 XML로 읽히지 않는다. XMLSerializer는 XHTML로 옮긴다.
  // XMLSerializer는 XML에 쓸 수 없는 글자(붙여 넣은 세로 탭 같은)를 그대로 두어서, 글에 하나만 있어도 장 그림이 그려지지 않고
  // PPT 내보내기가 늘 실패했다. 그 글자만 뺀다
  const body = xmlChars(new XMLSerializer().serializeToString(slide))
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SLIDE_W}" height="${SLIDE_H}" viewBox="0 0 ${SLIDE_W} ${SLIDE_H}">` +
    `<foreignObject x="0" y="0" width="${SLIDE_W}" height="${SLIDE_H}">` +
    `<div xmlns="${XHTML}" style="width:${SLIDE_W}px;height:${SLIDE_H}px;margin:0;overflow:hidden"><style>${escapeXml(css)}</style>${body}</div>` +
    `</foreignObject></svg>`
  )
}

function loadImage(src: string): Promise<HTMLImageElement> {
  const img = new Image()
  img.src = src
  return img.decode().then(() => img)
}

function tainted(ctx: CanvasRenderingContext2D): boolean {
  try {
    ctx.getImageData(0, 0, 1, 1)
    return false
  } catch {
    return true
  }
}

/** SVG를 캔버스에 그린다. 바탕색을 먼저 깔아 PNG에 비치는 곳이 없게 */
async function paint(src: string, background: string, scale: number): Promise<HTMLCanvasElement> {
  const img = await loadImage(src)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(SLIDE_W * scale)
  canvas.height = Math.round(SLIDE_H * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('rasterize: no 2d context')
  const draw = () => {
    ctx.fillStyle = background
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  }
  draw()
  // SVG 그림 안의 글꼴이 첫 그리기까지 다 풀리지 않으면 대신 쓴 글꼴로 그려진다. 한 박자 쉬고 다시 그린다
  await yieldTask()
  draw()
  return canvas
}

async function toPng(svg: string, background: string, scale: number): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  let canvas: HTMLCanvasElement
  try {
    canvas = await paint(url, background, scale)
  } finally {
    URL.revokeObjectURL(url)
  }
  // foreignObject가 든 SVG를 blob: 주소로 그리면 캔버스를 '오염'으로 보는 브라우저가 있다. 그러면 data: 주소로 다시
  if (tainted(canvas.getContext('2d')!)) canvas = await paint(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, background, scale)
  const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('rasterize: toBlob'))), 'image/png'))
  canvas.width = canvas.height = 0
  return png
}

interface SlideRasterizer {
  /** 한 장을 PNG로. 한 번에 한 장씩 부른다 */
  shoot(slide: Slide): Promise<Blob>
  close(): void
}

/**
 * 장 그림을 만드는 도구. 화면 밖 상자 하나를 만들어 두고 장마다 다시 그린다. 다 쓰면 close.
 * scale: 1이면 1920×1080. 2면 3840×2160 (파일이 네 배쯤 커진다)
 */
export function createSlideRasterizer(deck: Deck, { scale = 1 }: { scale?: number } = {}): SlideRasterizer {
  const info = pageInfo(deck.slides, deck)
  const families = fontFamiliesOf(deck.theme)
  const host = document.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  host.inert = true
  // 화면 밖에 실제 크기로 둔다. display:none이나 크기 0이면 부품 맞추기가 자리를 재지 못한다
  host.style.cssText = `position:fixed;left:${-SLIDE_W * 3}px;top:0;width:${SLIDE_W}px;height:${SLIDE_H}px;overflow:hidden;pointer-events:none;contain:strict`
  document.body.appendChild(host)
  const root = createRoot(host)

  return {
    async shoot(slide) {
      // 장마다 새로 붙인다(key). 앞 장의 맞춘 값이나 효과가 남지 않게
      flushSync(() => root.render(<SlideCanvas key={slide.id} deck={deck} slide={slide} mode="final" {...pageProps(info, slide.id)} />))
      const el = host.querySelector<HTMLElement>(':scope > .slide')
      if (!el) throw new Error('rasterize: no slide')
      const text = (el.textContent ?? '') + CSS_TEXT
      await loadFonts(text, families)
      await inlineImages(el)
      // 글꼴이 온 뒤의 크기로 다시 맞춘다. 장의 효과(fonts.ready, ResizeObserver)도 맞추지만 언제 끝났는지 알 수 없고,
      // 뒤로 간 탭에서는 ResizeObserver가 오지 않는다. 그래서 한 박자 쉰 뒤 여기서 직접 맞춘다(몇 번 맞춰도 결과는 같다)
      await yieldTask()
      fitBlocks(el)
      const css = `${await embedFonts(text, families)}\n${SLIDE_CSS}`
      return toPng(svgOf(el, css), getComputedStyle(el).backgroundColor || '#fff', scale)
    },
    close() {
      root.unmount()
      host.remove()
    },
  }
}

/** 발표에서 PPT에 들어갈 장(숨긴 장 빼고)을 모두 그림으로. only는 1부터 센 장 번호 */
async function rasterizeDeck(
  deck: Deck,
  { scale = 1, only, onProgress }: { scale?: number; only?: number[]; onProgress?: (done: number, total: number) => void } = {},
): Promise<Blob[]> {
  const shown = pptxSlidesOf(deck).filter((_, i) => !only || only.includes(i + 1))
  const r = createSlideRasterizer(deck, { scale })
  const out: Blob[] = []
  try {
    for (let i = 0; i < shown.length; i++) {
      onProgress?.(i + 1, shown.length)
      out.push(await r.shoot(shown[i]))
    }
  } finally {
    r.close()
  }
  return out
}

/** 그림들을 화면 위에 늘어놓는다(점검용). 누르거나 Esc로 닫는다 */
function showShots(shots: Blob[]): void {
  const urls = shots.map((b) => URL.createObjectURL(b))
  const box = document.createElement('div')
  box.className = 'ppt-preview'
  box.style.cssText =
    'position:fixed;inset:0;z-index:2147483647;display:grid;justify-items:center;align-content:start;gap:24px;padding:24px;overflow:auto;background:#1b1c1f;cursor:zoom-out'
  urls.forEach((url, i) => {
    const fig = document.createElement('figure')
    fig.style.cssText = 'margin:0;width:min(100%,1280px);color:#c9cbd1;font:600 13px/1.4 sans-serif'
    const img = new Image()
    img.src = url
    img.alt = `슬라이드 ${i + 1}`
    img.style.cssText = 'display:block;width:100%;height:auto;box-shadow:0 2px 16px rgb(0 0 0/.5)'
    const cap = document.createElement('figcaption')
    cap.textContent = `${i + 1} / ${urls.length}`
    cap.style.marginTop = '6px'
    fig.append(img, cap)
    box.append(fig)
  })
  const close = () => {
    box.remove()
    urls.forEach((u) => URL.revokeObjectURL(u))
    window.removeEventListener('keydown', onKey)
  }
  const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
  box.addEventListener('click', close)
  window.addEventListener('keydown', onKey)
  document.body.append(box)
}

type PptDebugOptions = { scale?: number; only?: number[] }

/**
 * 편집 화면의 콘솔에서 PPT의 장 그림을 바로 보게 한다. 돌려받은 함수를 부르면 걷는다.
 * - `await pptSlides({ only: [1, 3] })`: 그림(Blob) 배열
 * - `await pptPreview({ only: [2] })`: 화면 위에 늘어놓고 그림 배열을 돌려준다. 누르거나 Esc로 닫는다
 */
export function exposePptDebug(getDeck: () => Deck | null): () => void {
  const need = () => {
    const deck = getDeck()
    if (!deck) throw new Error('열린 발표가 없어요')
    return deck
  }
  const api = {
    pptSlides: (o: PptDebugOptions = {}) => rasterizeDeck(need(), o),
    pptPreview: async (o: PptDebugOptions = {}) => {
      const shots = await rasterizeDeck(need(), o)
      showShots(shots)
      return shots
    },
  }
  Object.assign(window, api)
  return () => {
    for (const k of Object.keys(api)) delete (window as unknown as Record<string, unknown>)[k]
  }
}

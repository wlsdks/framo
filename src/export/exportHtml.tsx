import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { pageInfo, shownMeta, shownOnly } from '../deck/fields'
import { uid } from '../deck/generate'
import type { Deck } from '../deck/types'
import { pageProps, SlideCanvas } from '../slides/SlideCanvas'
import { isDeck, safeFileName } from '../store/deckFile'
import motionCss from '../motion/motion.css?inline'
import slidesCss from '../slides/slides.css?inline'
import blocksCss from '../slides/blocks.css?inline'
import { cssGlyphs, embedFonts, fontFamiliesOf } from './fonts'
import { VIEWER_CSS, VIEWER_JS, VIEWER_TEXT } from './viewer'

const DATA_ID = 'html-maker-deck'

function ExportSlides({ deck }: { deck: Deck }) {
  const info = pageInfo(deck.slides, deck)
  return (
    <>
      {deck.slides
        .filter((s) => !s.hidden)
        .map((s) => (
          <section key={s.id} className="v-slide">
            <div className="v-frame">
              <div className="v-scale">
                <SlideCanvas deck={deck} slide={s} mode="final" {...pageProps(info, s.id)} />
              </div>
            </div>
          </section>
        ))}
    </>
  )
}

function renderSlides(deck: Deck): { html: string; pictures: string[] } {
  const host = document.createElement('div')
  const root = createRoot(host)
  flushSync(() => root.render(<ExportSlides deck={deck} />))
  const html = host.innerHTML
  const pictures = picturesIn(host)
  root.unmount()
  return { html, pictures }
}

/**
 * 장 그림에 든 이미지들. 처음 나온 차례로 한 번씩. 내보낼 때(그린 장)와 다시 열 때(파일의 장)가 이 함수로 모아 차례가 같다
 */
export function picturesIn(root: ParentNode): string[] {
  const seen = new Set<string>()
  for (const img of Array.from(root.querySelectorAll('img'))) {
    const src = img.getAttribute('src')
    if (src?.startsWith('data:')) seen.add(src)
  }
  return [...seen]
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
}

/**
 * 다시 열어 편집할 수 있게 덱을 넣어 둔다. 듣는 분께 보이지 않는 글은 빼서 다른 사람에게 보내도 안전하다: 발표자 노트,
 * 숨긴 장, 레이아웃을 바꿔 가려진 칸, 보내는 장에 나오지 않는 발표 전체의 값(연락처, 로고 같은. 장에서는 보이지 않아도
 * 파일을 열거나 소스를 보면 읽혔다). 이어서 고칠 원본은 작업 파일이다
 */
export function deckData(deck: Deck, pictures: readonly string[] = []): string {
  const slides = deck.slides.filter((s) => !s.hidden)
  const safe: Deck = { ...deck, meta: shownMeta(deck.meta, slides), slides: slides.map((s) => ({ ...shownOnly(s), notes: '' })) }
  const images: [Path, number][] = []
  const lean = pluck(safe, new Map(pictures.map((src, n) => [src, n])), [], images) as Deck
  // 장 그림에 든 이미지가 없으면 예전 꼴(덱 그대로)로 둔다: 예전 버전도 연다
  const data: HtmlDeckData | Deck = images.length ? { format: HTML_DECK, version: 1, deck: lean, images } : safe
  return JSON.stringify(data).replace(/</g, '\\u003c')
}

/**
 * 이미지를 뺀 다시 열기용 데이터의 꼴. 이미지는 장 그림(<img>)에 이미 들어 있어서, 데이터에도 통째로 넣던 때는 사진이 든 발표의
 * 파일이 두 배로 컸다(메일에 붙이기 어렵다). 데이터에는 덱의 어느 자리에 장 그림의 몇 번째 이미지가 들어가는지만 적는다.
 * 덱을 감싸 두어 예전 버전은 이 데이터를 덱으로 보지 않는다: 그림이 빈 채로 열지 않고 열 수 없다고 알린다
 */
const HTML_DECK = 'html-maker/html-deck'
type Path = (string | number)[]
interface HtmlDeckData {
  format: typeof HTML_DECK
  version: 1
  deck: Deck
  /** [덱 안의 자리, 장 그림의 몇 번째 이미지(picturesIn의 차례)] */
  images: [Path, number][]
}

/** 덱을 훑어 장 그림에 있는 이미지 값을 비우고 그 자리를 적는다 */
function pluck(value: unknown, at: ReadonlyMap<string, number>, path: Path, out: [Path, number][]): unknown {
  if (typeof value === 'string') {
    const n = at.get(value)
    if (n === undefined) return value
    out.push([path, n])
    return ''
  }
  if (Array.isArray(value)) return value.map((v, i) => pluck(v, at, [...path, i], out))
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, pluck(v, at, [...path, k], out)]))
  return value
}

/**
 * 받은 파일의 자리에 이미지를 되돌려 넣는다. 받은 값이라 아무 자리나 적혀 있을 수 있어서, 덱에 이미 있는 글 자리(내보낼 때
 * 비운 자리)에만 넣고 새 자리를 만들거나 덱 밖(__proto__ 같은)으로 가지 않는다
 */
function putAt(root: unknown, path: unknown, src: string): void {
  if (!Array.isArray(path) || !path.length) return
  let at = root
  for (const [i, k] of path.entries()) {
    if (!at || typeof at !== 'object' || (typeof k !== 'string' && typeof k !== 'number') || k === '__proto__') return
    if (!Object.prototype.hasOwnProperty.call(at, k)) return
    const box = at as Record<string | number, unknown>
    if (i < path.length - 1) at = box[k]
    else if (typeof box[k] === 'string') box[k] = src
  }
}

/** 이미지를 뺀 데이터면 장 그림의 이미지를 제자리에 넣은 덱. 모르는 꼴(더 새 버전)이면 null */
function withPictures(data: Partial<HtmlDeckData>, pictures: readonly string[]): unknown {
  if (data.version !== 1 || !Array.isArray(data.images)) return null
  for (const entry of data.images as unknown[]) {
    if (!Array.isArray(entry)) continue
    const [path, n] = entry as [unknown, unknown]
    const src = typeof n === 'number' && Number.isInteger(n) ? pictures[n] : undefined
    if (typeof src === 'string' && src.startsWith('data:')) putAt(data.deck, path, src)
  }
  return data.deck
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
}

/**
 * 내보낸 파일은 메일로 오가며 어디서 열릴지 모른다. 어떤 주소로도 연결하지 못하게 막고,
 * 스크립트는 들어 있는 뷰어 하나만 돌게 한다.
 */
export async function exportCsp(): Promise<string> {
  return [
    "default-src 'none'",
    `script-src 'sha256-${await sha256(VIEWER_JS)}'`,
    "style-src 'unsafe-inline'",
    'img-src data: blob:',
    'font-src data:',
    'media-src data: blob:',
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ')
}

const CSS_TEXT = cssGlyphs(`${slidesCss}\n${blocksCss}`)

/**
 * 넣을 글꼴 조각을 고르는 글자: 장의 글, 발표 이름, 뷰어 단추, CSS가 content로 그리는 글자(퍼널 전환율의 ↓ 같은).
 * CSS의 글자를 빼면 그 글자만 든 조각이 빠져, 내보낸 파일에서 ↓가 다른 글꼴(윈도우는 맑은 고딕)로 그려지고 전환율 칸이 앱보다 3px 좁았다
 */
export function fontText(slides: string, title: string): string {
  return (slides.replace(/<[^>]+>/g, ' ') + title + VIEWER_TEXT + CSS_TEXT).replace(/&[a-z]+;/g, ' ')
}

export async function buildHtml(deck: Deck): Promise<string> {
  const { html: slides, pictures } = renderSlides(deck)
  const families = fontFamiliesOf(deck.theme)
  const fonts = await embedFonts(fontText(slides, deck.title), families)
  const csp = await exportCsp()
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="gyeol">
<title>${escapeHtml(deck.title)}</title>
<style>
${fonts}
${slidesCss}
${blocksCss}
${motionCss}
${VIEWER_CSS}
</style>
</head>
<body>
<header class="v-bar">
  <span class="v-title">${escapeHtml(deck.title)}</span>
  <span class="v-actions">
    <button type="button" class="v-btn" id="v-print">PDF로 저장</button>
    <button type="button" class="v-btn v-btn-primary" id="v-present">발표 시작</button>
  </span>
</header>
<main class="v-deck">
${slides}
</main>
<div class="v-count" aria-live="polite"></div>
<div class="v-blank" hidden></div>
<script type="application/json" id="${DATA_ID}">${deckData(deck, pictures)}</script>
<script>${VIEWER_JS}</script>
</body>
</html>`
}

function fileName(title: string): string {
  return `${safeFileName(title, '발표')}.html`
}

export async function downloadHtml(deck: Deck): Promise<void> {
  const html = await buildHtml(deck)
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = fileName(deck.title)
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 2000)
}

/**
 * HTML 파일에 넣어 둔 덱 데이터를 확인한다. 받은 파일이라 아무 값이나 있을 수 있어서 .deck 파일과 같은 isDeck을 쓴다.
 * 예전에는 `as Deck`으로 받고 따로 몇 칸만 봐서, 같은 덱이라도 어느 파일로 여느냐에 따라 확인이 달랐다.
 */
export function parseDeckData(raw: string, pictures: readonly string[] = []): Deck | null {
  try {
    const data: unknown = JSON.parse(raw)
    // 이미지를 뺀 데이터(지금 꼴)면 장 그림의 이미지를 되돌려 넣는다. 아니면 예전에 내보낸 파일(덱 그대로)
    const lean = !!data && typeof data === 'object' && (data as Partial<HtmlDeckData>).format === HTML_DECK
    const deck = lean ? withPictures(data as Partial<HtmlDeckData>, pictures) : data
    return isDeck(deck) ? { ...deck, id: uid(), updatedAt: Date.now() } : null
  } catch {
    return null
  }
}

/** 내보낸 HTML 파일에서 덱을 되살린다. 새 발표로 저장된다. */
export function readDeckFromHtml(html: string): Deck | null {
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const raw = doc.getElementById(DATA_ID)?.textContent
    const slides = doc.querySelector('.v-deck')
    return raw ? parseDeckData(raw, slides ? picturesIn(slides) : []) : null
  } catch {
    return null
  }
}

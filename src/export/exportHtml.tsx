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
  const info = pageInfo(deck.slides)
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

function renderSlides(deck: Deck): string {
  const host = document.createElement('div')
  const root = createRoot(host)
  flushSync(() => root.render(<ExportSlides deck={deck} />))
  const html = host.innerHTML
  root.unmount()
  return html
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
}

/**
 * 다시 열어 편집할 수 있게 덱을 넣어 둔다. 듣는 분께 보이지 않는 글은 빼서 다른 사람에게 보내도 안전하다: 발표자 노트,
 * 숨긴 장, 레이아웃을 바꿔 가려진 칸, 보내는 장에 나오지 않는 발표 전체의 값(연락처, 로고 같은. 장에서는 보이지 않아도
 * 파일을 열거나 소스를 보면 읽혔다). 이어서 고칠 원본은 작업 파일이다
 */
export function deckData(deck: Deck): string {
  const slides = deck.slides.filter((s) => !s.hidden)
  const safe: Deck = { ...deck, meta: shownMeta(deck.meta, slides), slides: slides.map((s) => ({ ...shownOnly(s), notes: '' })) }
  return JSON.stringify(safe).replace(/</g, '\\u003c')
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
  const slides = renderSlides(deck)
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
<script type="application/json" id="${DATA_ID}">${deckData(deck)}</script>
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
export function parseDeckData(raw: string): Deck | null {
  try {
    const deck: unknown = JSON.parse(raw)
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
    return raw ? parseDeckData(raw) : null
  } catch {
    return null
  }
}

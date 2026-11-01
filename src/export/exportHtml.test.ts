import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { autoPlace, makeBlock, withLayout } from '../deck/blocks'
import { emptyItem, makeSlide } from '../deck/generate'
import { createSampleDeck } from '../deck/sample'
import { deckData, exportCsp, fontText, parseDeckData } from './exportHtml'
import { VIEWER_JS } from './viewer'

// 시험에서는 CSS를 읽지 않아(빈 글) 장 CSS 대신 content로 글자를 그리는 규칙 하나를 둔다
vi.mock('../slides/blocks.css?inline', () => ({ default: ".fn-rate::before { content: '↓'; } .qt::before { content: '\\201C'; }" }))

describe('내보낸 HTML의 CSP', () => {
  it('어떤 주소로도 연결하지 못하고, 스크립트는 들어 있는 뷰어 하나만 돈다', async () => {
    const csp = await exportCsp()
    const rules = new Map(csp.split('; ').map((r) => [r.split(' ')[0], r.split(' ').slice(1)]))
    expect(rules.get('default-src')).toEqual(["'none'"])
    const hash = createHash('sha256').update(VIEWER_JS).digest('base64')
    expect(rules.get('script-src')).toEqual([`'sha256-${hash}'`])
    expect(rules.get('base-uri')).toEqual(["'none'"])
    expect(rules.get('form-action')).toEqual(["'none'"])
    // 연결(connect-src)은 따로 열지 않아 default-src 'none'을 따른다
    expect(rules.has('connect-src')).toBe(false)
    // 그림, 글꼴, 영상은 파일 안에 든 것만
    for (const r of ['img-src', 'font-src', 'media-src']) expect(rules.get(r)!.every((s) => s === 'data:' || s === 'blob:'), r).toBe(true)
    expect(csp).not.toMatch(/https?:|\*|'unsafe-eval'|'self'/)
    expect(rules.get('script-src')).not.toContain("'unsafe-inline'")
  })
})

describe('HTML 파일에 넣는 덱', () => {
  it('숨긴 제목과 출처는 작업 파일에 남고 듣는 분에게 보내는 데이터에서는 빠진다', () => {
    const deck = createSampleDeck()
    const slide = { ...makeSlide('compose'), fields: { title: '숨긴 제목', lead: '숨긴 부제', source: '숨긴 출처' }, options: { hideHead: true, hideFoot: true } }
    deck.slides = [slide]
    const data = deckData(deck)
    for (const text of Object.values(slide.fields)) expect(data).not.toContain(text)
    expect(slide.fields.title).toBe('숨긴 제목')
  })
  it('조건별 흐름의 보이는 글은 HTML에서 되살리고 발표자 노트와 감춘 제목은 제외한다', () => {
    const deck = createSampleDeck()
    const base = makeBlock('decision')
    const block = {
      ...base,
      fields: { label: '확인할 시점', question: '재고가 준비됐나요?' },
      items: [
        { ...emptyItem(), title: '준비됐어요', body: '출고해요' },
        { ...emptyItem(), title: '아직 없어요', body: '입고 날짜를 알려요' },
      ],
    }
    const blocks = autoPlace([], block)!
    deck.slides = [{ ...makeSlide('compose'), fields: { title: '숨긴 제목' }, options: { hideHead: true }, notes: '내부 노트', blocks }]
    const data = deckData(deck)
    expect(data).not.toContain('숨긴 제목')
    expect(data).not.toContain('내부 노트')
    const back = parseDeckData(data)!
    expect(back.slides[0].blocks![0].fields).toEqual(block.fields)
    expect(back.slides[0].blocks![0].items.map(({ title, body }) => ({ title, body }))).toEqual(block.items.map(({ title, body }) => ({ title, body })))
  })
  it('듣는 분께 보이지 않는 글(발표자 노트, 숨긴 장, 레이아웃을 바꿔 가려진 칸)은 넣지 않는다', () => {
    const deck = createSampleDeck()
    const item = (title: string, body: string) => ({ ...emptyItem(), title, body })
    const points = { ...makeSlide('points'), fields: { title: '보이는 제목' }, items: [item('보이는 항목', '가려진설명비밀'), item('둘째 항목', '')] }
    const leftover = { ...makeSlide('points'), fields: { title: '단락 제목' }, items: [item('남은부품비밀', ''), item('남은부품둘째', '')] }
    deck.slides = [
      { ...deck.slides[0], notes: '노트비밀' },
      withLayout(points, 'bars'),
      withLayout(withLayout(leftover, 'compose'), 'statement'),
      { ...makeSlide('statement'), hidden: true, fields: { title: '숨긴장비밀' } },
    ]
    const data = deckData(deck)
    for (const secret of ['노트비밀', '가려진설명비밀', '남은부품비밀', '남은부품둘째', '숨긴장비밀']) expect(data, secret).not.toContain(secret)
    // 보이는 글은 그대로 두어 다시 열면 이어서 고칠 수 있다
    const back = parseDeckData(data)!
    expect(back.slides.map((s) => s.fields.title)).toEqual([deck.slides[0].fields.title, '보이는 제목', '단락 제목'])
    expect(back.slides[1].items.map((it) => it.title)).toEqual(['보이는 항목', '둘째 항목'])
  })
})

describe('HTML 파일에서 덱 되살리기', () => {
  it('내보낸 덱은 새 발표로 되살린다', () => {
    const deck = createSampleDeck()
    const back = parseDeckData(JSON.stringify(deck))
    expect(back?.slides).toEqual(deck.slides)
    expect(back?.id).not.toBe(deck.id)
  })

  it('.deck 파일과 같은 꼴이 아니면 받지 않는다', () => {
    const deck = createSampleDeck()
    for (const raw of ['', '{', 'null', '5', '"deck"', '[]', '{}', JSON.stringify({ ...deck, slides: {} }), JSON.stringify({ ...deck, meta: null }), JSON.stringify({ ...deck, theme: undefined }), JSON.stringify({ ...deck, id: 7 })]) {
      expect(parseDeckData(raw), raw.slice(0, 40)).toBeNull()
    }
  })
})

describe('내보낸 HTML의 글꼴', () => {
  it('CSS가 그리는 글자(퍼널 전환율의 ↓)가 든 조각도 고른다', () => {
    // 글에는 없고 CSS의 content로만 그리는 글자: 빼면 그 글자만 든 조각이 빠져 내보낸 파일에서 다른 글꼴로 그려졌다
    const text = fontText('<div class="fn-rate">40%</div>', '발표')
    for (const ch of ['↓', '“', '40%', '발표']) expect(text).toContain(ch)
    expect(text).not.toContain('<')
  })
})

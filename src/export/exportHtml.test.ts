import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { autoPlace, makeBlock, withLayout } from '../deck/blocks'
import { emptyItem, makeSlide } from '../deck/generate'
import { createSampleDeck } from '../deck/sample'
import type { Deck } from '../deck/types'
import { isDeck } from '../store/deckFile'
import { deckData, exportCsp, fontText, parseDeckData, picturesIn } from './exportHtml'
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
  it('발표 전체의 값(소속, 발표자, 날짜, 연락처, 로고)은 보내는 장에 나올 때만 넣는다', () => {
    const deck = createSampleDeck()
    const logo = 'data:image/png;base64,bG9nb1NlY3JldA=='
    deck.meta = { ...deck.meta, org: '소속비밀', presenter: '발표자이름', date: '날짜비밀', contact: '연락처비밀', logo }
    const before = structuredClone(deck.meta)
    // 표지를 숨기고 마지막 장만 보내면 듣는 분께 보이는 값은 마지막 장의 발표자와 연락처뿐이다
    deck.slides = [{ ...makeSlide('cover'), hidden: true }, makeSlide('closing')]
    const data = deckData(deck)
    for (const secret of ['소속비밀', '날짜비밀', 'bG9nb1NlY3JldA==']) expect(data, secret).not.toContain(secret)
    const back = parseDeckData(data)!
    expect(back.meta).toEqual({ ...before, org: '', date: '', logo: '' })
    // 표지만 보내면 연락처가 빠지고 로고와 소속은 남는다
    deck.slides = [makeSlide('cover')]
    expect(parseDeckData(deckData(deck))!.meta).toEqual({ ...before, contact: '' })
    // 작업 중인 발표의 값은 그대로
    expect(deck.meta).toEqual(before)
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

describe('내보낸 HTML의 이미지는 한 번만', () => {
  // 이미지는 장 그림(<img>)에 이미 들어 있다. 다시 열기용 데이터에도 통째로 넣던 때는 사진이 든 발표의 파일이 두 배로 컸다
  const png = (text: string) => `data:image/png;base64,${btoa(text)}`
  const LOGO = png('logo-bytes')
  const PHOTO = png('photo-bytes')
  const SHOT = png('screen-bytes')
  const withImages = () => {
    const deck = createSampleDeck()
    deck.meta = { ...deck.meta, logo: LOGO }
    const picture = { ...makeBlock('image'), fields: { image: SHOT, caption: '화면' } }
    const logos = { ...makeSlide('logos'), fields: { title: '함께하는 곳' }, items: [{ ...emptyItem(), title: '가', image: LOGO }, { ...emptyItem(), title: '나', image: PHOTO }] }
    deck.slides = [makeSlide('cover'), { ...makeSlide('imageText'), fields: { title: '사진', image: PHOTO } }, logos, { ...makeSlide('compose'), fields: { title: '화면' }, blocks: autoPlace([], picture)! }]
    return deck
  }
  /** 장 그림에 든 이미지: 처음 나온 차례로 한 번씩 */
  const pictures = [LOGO, PHOTO, SHOT]
  const same = (d: Deck | null) => d && { ...d, id: '', updatedAt: 0 }

  it('데이터에는 장 그림의 몇 번째 이미지인지만 적고, 다시 열면 그 자리에 되살린다', () => {
    const deck = withImages()
    const data = deckData(deck, pictures)
    for (const bytes of ['bG9nby1ieXRlcw', 'cGhvdG8tYnl0ZXM', 'c2NyZWVuLWJ5dGVz']) expect(data, bytes).not.toContain(bytes)
    expect(same(parseDeckData(data, pictures))).toEqual(same(parseDeckData(deckData(deck))))
    expect(parseDeckData(data, pictures)!.slides[3].blocks![0].fields.image).toBe(SHOT)
  })

  it('예전 버전은 이미지를 뺀 데이터를 열지 않는다 (그림이 빈 채로 열리지 않게). 이미지가 없으면 예전 꼴 그대로', () => {
    // 예전 버전의 parseDeckData는 데이터가 곧 덱인지(isDeck)만 본다
    expect(isDeck(JSON.parse(deckData(withImages(), pictures)))).toBe(false)
    const plain = createSampleDeck()
    plain.slides = plain.slides.filter((s) => !JSON.stringify(s).includes('data:'))
    plain.meta = { ...plain.meta, logo: '' }
    expect(isDeck(JSON.parse(deckData(plain, pictures)))).toBe(true)
    // 장 그림에 없는 이미지(그려지지 않는 자리)는 데이터에 그대로 둔다
    expect(deckData(withImages(), [PHOTO])).toContain('bG9nby1ieXRlcw')
  })

  it('받은 파일의 자리 목록이 이상해도 덱 밖을 건드리지 않고, 장 그림이 모자라면 빈 그림으로 연다', () => {
    const plain = parseDeckData(deckData(createSampleDeck()))!
    const bad = [[['__proto__', 'polluted'], 0], [['constructor', 'prototype', 'polluted'], 0], [['slides', 0, 'fields'], 0], [[], 0], ['meta', 0], [['meta', 'logo'], -1], [['meta', 'logo'], 0.5], [['meta', 'logo'], 7], [['meta', 'nope'], 0], null, 5]
    const raw = JSON.stringify({ format: 'html-maker/html-deck', version: 1, deck: { ...plain, meta: { ...plain.meta, logo: '' } }, images: bad })
    const back = parseDeckData(raw, [LOGO])!
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect(back.slides[0].fields).toEqual(plain.slides[0].fields)
    expect(back.meta.logo).toBe('')
    expect('nope' in back.meta).toBe(false)
    // 장 그림이 없으면(누가 HTML을 고쳐 지웠으면) 그 자리는 빈 그림
    expect(parseDeckData(deckData(withImages(), pictures), [])!.meta.logo).toBe('')
    // 더 새 꼴은 열지 않는다
    expect(parseDeckData(raw.replace('"version":1', '"version":2'), [LOGO])).toBeNull()
  })

  it('장 그림의 이미지를 처음 나온 차례로 한 번씩 모은다 (내보낼 때와 다시 열 때가 같은 함수)', () => {
    const imgs = [LOGO, PHOTO, LOGO, 'blob:x', SHOT, PHOTO].map((src) => ({ getAttribute: () => src }))
    expect(picturesIn({ querySelectorAll: () => imgs } as unknown as ParentNode)).toEqual([LOGO, PHOTO, SHOT])
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

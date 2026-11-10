import { describe, expect, it } from 'vitest'
import {
  bareShows,
  bareSlide,
  bareSlides,
  deckBlanks,
  dropIndex,
  isBlankItem,
  leaveOut,
  looksOptional,
  missingFields,
  optionalBlanks,
  pageInfo,
  presentable,
  sendable,
  shownChars,
  shownOnly,
  unshownCount,
  withUnsent,
} from './fields'
import { createDeck, emptyItem, makeSlide } from './generate'
import { BLOCKS, makeBlock, withLayout } from './blocks'
import { labelIn, LAYOUT_ORDER, LAYOUTS } from './layouts'
import type { Deck, Item, Slide } from './types'

const item = (title: string): Item => ({ ...emptyItem(), title })

describe('발표 화면에 그릴 장 (presentable)', () => {
  it('하나도 채우지 않은 항목을 빼고, 다 채웠으면 받은 장 그대로', () => {
    const slide = { ...makeSlide('closing'), items: [item('예산 승인'), item(''), item('일정 확보')] }
    expect(presentable(slide).items.map((it) => it.title)).toEqual(['예산 승인', '일정 확보'])
    const full = { ...slide, items: [item('예산 승인'), item('일정 확보')] }
    expect(presentable(full)).toBe(full)
  })

  it('이미지나 숫자만 채운 항목은 남긴다', () => {
    const slide = { ...makeSlide('kpi'), items: [{ ...emptyItem(), value: '4시간' }, emptyItem(), { ...emptyItem(), image: 'data:image/png;base64,AA' }] }
    expect(presentable(slide).items).toHaveLength(2)
  })

  it('레이아웃의 가장 적은 수 밑으로는 빼지 않는다', () => {
    const slide = { ...makeSlide('matrix'), items: [item('가'), emptyItem(), emptyItem(), emptyItem()] }
    expect(presentable(slide).items).toHaveLength(4)
  })

  it('숨긴 항목은 앞의 빈 항목이 빠져도 끌려 올라오지 않는다', () => {
    const max = LAYOUTS.closing.items!.max
    const items = [item('가'), ...Array.from({ length: max - 1 }, () => emptyItem()), item('숨긴 항목')]
    const shown = presentable({ ...makeSlide('closing'), items }).items.map((it) => it.title)
    expect(shown).toEqual(['가'])
  })

  it('가장 적은 수를 채우려 남긴 항목은 빈 항목(isBlankItem)으로 알아볼 수 있다', () => {
    // 그리는 쪽(fields.tsx의 ItemTools)이 이것으로 빈 사분면, 단계의 표시 글자(S, 번호, 화살표)를 같이 감춘다
    const slide = { ...makeSlide('matrix'), items: [item('가'), emptyItem(), emptyItem(), emptyItem()] }
    expect(presentable(slide).items.map(isBlankItem)).toEqual([false, true, true, true])
    expect(isBlankItem({ ...emptyItem(), image: 'data:image/png;base64,AA' })).toBe(false)
  })

  it('강조는 같은 항목을 따라가고, 빈 항목을 강조했으면 강조하지 않는다', () => {
    const slide = { ...makeSlide('kpi'), items: [emptyItem(), item('가'), item('나')] }
    expect(presentable({ ...slide, options: { highlight: 2 } }).options.highlight).toBe(1)
    expect(presentable({ ...slide, options: { highlight: 0 } }).options.highlight).toBe(-1)
  })
})

describe('레이아웃에 없어 가려진 칸 (unshownCount)', () => {
  const points = () => ({
    ...makeSlide('points'),
    fields: { title: '다음 주 할 일', lead: '' },
    items: [
      { ...item('양식 배포'), body: '모든 팀에 새 양식을 보내요' },
      { ...item('사용법 안내'), body: '짧은 안내 글을 붙여요' },
      { ...item('의견 모으기'), body: '두 주 뒤에 설문을 해요' },
    ],
  })

  it('레이아웃이 그리는 칸만 채웠으면 0', () => {
    expect(unshownCount(points())).toBe(0)
  })

  it('항목이 없는 레이아웃으로 바꾸면 항목의 칸이 모두, 설명을 그리지 않는 레이아웃이면 설명만 가려진다', () => {
    expect(unshownCount(withLayout(points(), 'statement'))).toBe(6)
    expect(unshownCount(withLayout(points(), 'bars'))).toBe(3)
    // 되돌리면 다시 보인다 (지우지 않았다)
    expect(unshownCount(withLayout(withLayout(points(), 'statement'), 'points'))).toBe(0)
  })

  it('컴포넌트 장으로 바꾸면 글을 컴포넌트로 옮겨 가려지는 칸이 없다', () => {
    expect(unshownCount(withLayout(points(), 'compose'))).toBe(0)
  })

  it('컴포넌트 장을 다른 레이아웃으로 바꾸면 남겨 둔 컴포넌트의 칸이 모두 가려진다', () => {
    const composed = withLayout(points(), 'compose')
    // 핵심 포인트 부품 하나뿐이면 그 레이아웃으로 되돌려서 가려지는 칸이 없다
    expect(unshownCount(withLayout(composed, 'points'))).toBe(0)
    // 다른 레이아웃이면 부품이 남아 그 안의 글 여섯 곳이 가려진다
    expect(unshownCount(withLayout(composed, 'statement'))).toBe(6)
  })

  it('최대 수 너머의 항목과, 컴포넌트 장이 아닌 장에 남은 컴포넌트의 칸도 센다', () => {
    const five = { ...points(), items: [...points().items, item('넷째'), item('다섯째')] }
    // 핵심 포인트는 넷까지: 다섯째 항목의 이름이 가려진다
    expect(unshownCount(five)).toBe(1)
    const composed = withLayout(points(), 'compose')
    const back = { ...composed, layout: 'points' as const, blocks: [...composed.blocks!, { ...composed.blocks![0], id: 'b2' }] }
    expect(unshownCount(back)).toBeGreaterThanOrEqual(6)
  })

  it('표지의 소속, 발표자처럼 발표 전체의 값은 세지 않는다', () => {
    const cover = { ...makeSlide('cover'), fields: { title: '분기 보고', $org: '품질팀' } }
    expect(unshownCount(cover)).toBe(0)
  })
})

describe('그리는 칸만 남긴 장 (shownOnly)', () => {
  // 레이아웃이 그리는 칸만 모두 채운 장
  const filled = (id: (typeof LAYOUT_ORDER)[number]) => {
    const spec = LAYOUTS[id]
    const fields = Object.fromEntries(spec.fields.filter((f) => !f.key.startsWith('$')).map((f) => [f.key, `${f.label} 글`]))
    const items = spec.items ? Array.from({ length: spec.items.max }, (_, i) => ({ ...emptyItem(), ...Object.fromEntries(spec.items!.fields.map((f) => [f.key, `${f.label} ${i + 1}`])) })) : []
    return { ...makeSlide(id), fields, items }
  }

  it('그리는 칸만 채운 장은 그대로 둔다', () => {
    for (const id of LAYOUT_ORDER) {
      const slide = filled(id)
      expect(shownOnly(slide), id).toEqual(slide)
    }
  })

  it('가려진 칸은 빼고 보이는 칸은 남긴다', () => {
    const bars = shownOnly(withLayout(filled('points'), 'bars'))
    expect(bars.items.map((it) => it.title)).toEqual(['이름 1', '이름 2', '이름 3', '이름 4'])
    expect(bars.items.every((it) => !it.body)).toBe(true)
    // 컴포넌트 장이었던 장에 남겨 둔 컴포넌트는 뺀다
    const statement = shownOnly(withLayout(withLayout(filled('points'), 'compose'), 'statement'))
    expect(statement.blocks).toBeUndefined()
    expect(statement.fields.title).toBe('제목 글')
    for (const id of LAYOUT_ORDER) for (const to of LAYOUT_ORDER) expect(unshownCount(shownOnly(withLayout(filled(id), to))), `${id}→${to}`).toBe(0)
  })

  it('숨긴 제목과 출처는 빈칸으로 세지 않고 발표 파일에서만 빼며 원래 글은 보존한다', () => {
    const slide = { ...makeSlide('compose'), fields: { title: '제목', lead: '부제', source: '출처' }, options: { hideHead: true, hideFoot: true } }
    const shown = shownOnly(slide)
    expect(shown.fields).toEqual({})
    expect(slide.fields).toEqual({ title: '제목', lead: '부제', source: '출처' })
    const blank = { ...slide, fields: { title: '', lead: '', source: '' } }
    const meta = createDeck({ type: 'weekly', audience: 'practitioner', minutes: 10, method: 'live', title: '주간 업무 보고', org: '', presenter: '', theme: 'white' }).meta
    expect(missingFields(blank, meta).some((m) => m.key === 'title')).toBe(false)
    expect(optionalBlanks(blank, meta).some((m) => m.key === 'lead' || m.key === 'source')).toBe(false)
  })
})

describe('장에 보이는 글자 수 (shownChars)', () => {
  const meta = createDeck({ type: 'weekly', audience: 'practitioner', minutes: 10, method: 'live', title: '', org: '영업 2팀', presenter: '', theme: 'white' }).meta

  it('보이는 칸과 항목의 글자를 빈칸 빼고 센다. 노트는 듣는 분께 보이지 않아 세지 않는다', () => {
    const slide = { ...makeSlide('points'), fields: { title: '세 가지 바꿀 점' }, items: [{ ...item('회의 줄이기'), body: '진행 공유는 보드로' }, item('')], notes: '말할 내용' }
    expect(shownChars(slide, meta)).toBe('세가지바꿀점'.length + '회의줄이기'.length + '진행공유는보드로'.length)
  })

  it('이미지, 숨긴 제목, 최대 수 너머의 항목, 레이아웃이 그리지 않는 칸은 세지 않는다', () => {
    const max = LAYOUTS.points.items!.max
    const items = [...Array.from({ length: max }, () => item('가')), item('숨긴 항목')]
    const slide = { ...makeSlide('points'), fields: { title: '제목', nope: '그리지 않는 칸' }, items, options: { hideHead: true } }
    expect(shownChars(slide, meta)).toBe(max)
    const image = { ...makeSlide('kpi'), fields: {}, items: [{ ...emptyItem(), value: '4시간', image: 'data:image/png;base64,AA' }] }
    expect(shownChars(image, meta)).toBe('4시간'.length)
  })

  it('표지의 소속처럼 발표 전체의 값은 발표에 적힌 값으로 센다', () => {
    const cover = { ...makeSlide('cover'), fields: { title: '제목' } }
    expect(shownChars(cover, { ...meta, date: '' })).toBe('제목'.length + '영업2팀'.length)
    expect(shownChars(cover, { ...meta, date: '2026. 11. 8.' })).toBe('제목'.length + '영업2팀'.length + '2026.11.8.'.length)
  })

  it('컴포넌트 장은 컴포넌트마다 그리는 칸을 센다', () => {
    const slide = withLayout({ ...makeSlide('points'), fields: { title: '제목' }, items: [item('하나'), item('둘')] }, 'compose')
    expect(shownChars(slide, meta)).toBe('제목하나둘'.length)
  })
})

describe('칸의 이름 (labelIn)', () => {
  it('항목 칸은 몇째 항목인지까지, 안내 문구(예시)는 쓰지 않는다', () => {
    expect(labelIn(LAYOUTS.kpi, 'title')).toBe('제목')
    expect(labelIn(LAYOUTS.kpi, 'title', 'title', 1)).toBe('숫자 2 이름')
    expect(labelIn(LAYOUTS.kpi, 'value', 'value', 0)).toBe('숫자 1')
  })

  it('모든 레이아웃의 모든 칸에 이름이 있다', () => {
    for (const spec of Object.values(LAYOUTS)) {
      for (const f of spec.fields) expect(labelIn(spec, f.key), `${spec.id}.${f.key}`).not.toBe('')
      for (const f of spec.items?.fields ?? []) expect(labelIn(spec, f.key, f.key, 0), `${spec.id}.items.${f.key}`).not.toBe('')
    }
  })

  it('컴포넌트 장의 모든 컴포넌트의 칸에도 이름이 있다', () => {
    for (const spec of Object.values(BLOCKS)) {
      for (const f of spec.fields) expect(labelIn(spec, f.key), `${spec.type}.${f.key}`).not.toBe('')
      for (const f of spec.items?.fields ?? []) expect(labelIn(spec, f.key, f.key, 0), `${spec.type}.items.${f.key}`).not.toBe('')
    }
    expect(labelIn(BLOCKS.bullets, 'title', 'title', 1)).toBe('줄 2 요점')
  })
})

describe('빈칸과 비워 둬도 되는 칸', () => {
  const deck = createDeck({ type: 'weekly', audience: 'practitioner', minutes: 10, method: 'live', title: '주간 업무 보고', org: '', presenter: '', theme: 'white' })
  const cover = deck.slides.find((s) => s.layout === 'cover')!

  it('표지의 부제, 발표자, 소속, 로고는 빈칸으로 세지 않고 따로 알린다', () => {
    expect(missingFields(cover, deck.meta)).toEqual([])
    const keys = optionalBlanks(cover, deck.meta).map((m) => m.key)
    expect(keys).toEqual(expect.arrayContaining(['lead', '$presenter', '$org', '$logo']))
  })

  it('결정을 받지 않는 발표의 표지에는 그리지 않는 결정 요청을 늘어놓지 않는다', () => {
    expect(optionalBlanks(cover, deck.meta).map((m) => m.key)).not.toContain('ask')
    const biz = createDeck({ type: 'business', audience: 'exec', minutes: 20, method: 'live', title: '제안', org: '', presenter: '', theme: 'white' })
    expect(optionalBlanks(biz.slides[0], biz.meta).map((m) => m.key)).toContain('ask')
  })

  it('컴포넌트 장의 제목은 프레임 잡기가 그 장의 말을 정해 준 장에서만 빈칸으로 센다', () => {
    const improve = createDeck({ type: 'improve', audience: 'practitioner', minutes: 10, method: 'live', title: '개선 제안', org: '', presenter: '', theme: 'white' })
    // 장의 칸만 (컴포넌트 안의 칸은 m.block이 있다)
    const own = (s: Slide) => missingFields(s, improve.meta).filter((m) => !m.block).map((m) => m.key)
    const made = improve.slides.find((s) => s.layout === 'compose' && s.hints.title)!
    expect(own(made)).toContain('title')
    expect(optionalBlanks(made, improve.meta).map((m) => m.key)).not.toContain('title')
    // 채우면 빈칸이 아니다
    expect(own({ ...made, fields: { ...made.fields, title: '결론 한 줄' } })).not.toContain('title')
    // 쓰는 사람이 더한 컴포넌트 장은 제목 안내가 없어 비워 둬도 된다
    const added = makeSlide('compose')
    expect(own(added)).not.toContain('title')
    expect(optionalBlanks(added, improve.meta).map((m) => m.key)).toContain('title')
    // 편집 화면의 옅은 안내(비워도 되는 칸)도 같은 규칙으로 그린다
    expect(looksOptional(made, 'title')).toBe(false)
    expect(looksOptional(added, 'title')).toBe(true)
  })

  it('발표의 빈칸 수는 장마다 센 빈칸을 더한 것 (숨긴 장은 빼고)', () => {
    const hidden = { ...deck, slides: deck.slides.map((s, i) => (i === 1 ? { ...s, hidden: true } : s)) }
    const sum = hidden.slides.filter((s) => !s.hidden).reduce((n, s) => n + missingFields(s, hidden.meta).length, 0)
    expect(deckBlanks(hidden).reduce((n, b) => n + b.missing.length, 0)).toBe(sum)
    expect(deckBlanks(hidden).every((b) => !b.slide.hidden && b.missing.length > 0)).toBe(true)
  })
})

describe('항목을 뺀 뒤 강조 (dropIndex)', () => {
  it('고른 강조는 그 항목을 따라 당겨지고, 강조한 항목을 빼면 없어진다. 고르지 않은 강조는 자리로 정한 것이라 그대로', () => {
    expect(dropIndex(2, 0)).toBe(1)
    expect(dropIndex(2, 2)).toBe(-1)
    expect(dropIndex(2, 3)).toBe(2)
    expect(dropIndex(undefined, 0)).toBeUndefined()
    expect(dropIndex(-1, 0)).toBe(-1)
  })
})

describe('발표 파일(HTML)에 담는 발표와 다시 열 때 이어받기 (sendable, withUnsent)', () => {
  // 레이아웃이 그리는 칸과 그 레이아웃이 그리지 않는 칸(다른 레이아웃에서 쓴 글), 최대 수보다 많은 항목, 노트까지 채운 장
  const rich = (id: (typeof LAYOUT_ORDER)[number], n: number): Slide => {
    const spec = LAYOUTS[id]
    const fields = { ...Object.fromEntries(spec.fields.filter((f) => !f.key.startsWith('$')).map((f) => [f.key, `${f.label} ${n}`])), oldCell: `남겨 둔 칸 ${n}` }
    const count = (spec.items?.max ?? 0) + 2
    const items = Array.from({ length: count }, (_, i) => ({ ...emptyItem(), title: `이름 ${n}.${i}`, body: `설명 ${n}.${i}`, value: `${i}`, meta: `메모 ${n}.${i}` }))
    return { ...makeSlide(id), fields, items, notes: `대본 ${n}` }
  }
  const deckOf = (): Deck => {
    const deck = createDeck({ type: 'weekly', audience: 'practitioner', minutes: 10, method: 'live', title: '주간 보고', org: '품질팀', presenter: '발표자', theme: 'white' })
    deck.meta = { ...deck.meta, contact: '연락처', logo: 'data:image/png;base64,AA' }
    const slides = LAYOUT_ORDER.filter((id) => id !== 'compose').map((id, n) => rich(id, n))
    // 부품 장이었던 장(남겨 둔 부품), 제목과 아래 띠를 숨긴 장, 숨긴 장(맨 앞, 가운데에 이어서 둘, 맨 끝)
    slides.push(withLayout(withLayout(rich('points', 90), 'compose'), 'statement'))
    slides.push({ ...rich('summary', 91), options: { hideHead: true, hideFoot: true } })
    slides.splice(0, 0, { ...rich('closing', 92), hidden: true })
    slides.splice(5, 0, { ...rich('kpi', 93), hidden: true }, { ...rich('bars', 94), hidden: true })
    slides.push({ ...rich('closing', 95), hidden: true })
    return { ...deck, slides }
  }
  const viaFile = (d: Deck) => JSON.parse(JSON.stringify(sendable(d))) as Deck

  it('파일에는 노트, 숨긴 장, 가려진 칸이 없다', () => {
    const sent = viaFile(deckOf())
    expect(sent.slides.some((s) => s.hidden || s.notes)).toBe(false)
    expect(JSON.stringify(sent)).not.toContain('남겨 둔 칸')
    expect(JSON.stringify(sent)).not.toContain('대본')
  })

  it('이 PC의 발표를 보낸 파일 그대로 열면 이 PC의 발표와 키의 차례까지 똑같다', () => {
    const d = deckOf()
    const again = withUnsent(viaFile(d), d)
    expect(again).toEqual(d)
    expect(JSON.stringify(again)).toBe(JSON.stringify(d))
  })

  it('파일에 담긴 것(보이는 글, 차례)은 파일 그대로 두고, 같은 장의 노트와 가려진 칸만 이어받는다', () => {
    const d = deckOf()
    const sent = viaFile(d)
    const [first, second, ...rest] = sent.slides
    // 다른 곳에서 고친 파일: 보이는 제목을 바꾸고, 장 둘의 차례를 바꾸고, 새 장을 더했다
    const edited = { ...sent, slides: [second, { ...first, fields: { ...first.fields, title: '파일에서 고친 제목' } }, ...rest, { ...makeSlide('statement'), fields: { title: '새 장' } }] }
    const again = withUnsent(edited, d)
    const byId = new Map(again.slides.map((s) => [s.id, s]))
    expect(byId.get(first.id)!.fields.title).toBe('파일에서 고친 제목')
    expect(byId.get(first.id)!.fields.oldCell).toBe(d.slides.find((s) => s.id === first.id)!.fields.oldCell)
    for (const s of d.slides) expect(byId.get(s.id)?.notes, s.id).toBe(s.notes)
    // 파일에만 있는 장은 파일 그대로(노트 없음)
    expect(again.slides.at(-1)!.fields.title).toBe('새 장')
    expect(again.slides.at(-1)!.notes).toBe('')
    // 숨긴 장은 이 PC에서 바로 앞에 있던 장 뒤에: 맨 앞의 숨긴 장은 맨 앞, 이어서 숨긴 두 장은 함께
    expect(again.slides[0].id).toBe(d.slides[0].id)
    const at = (id: string) => again.slides.findIndex((s) => s.id === id)
    expect(at(d.slides[5].id)).toBe(at(d.slides[4].id) + 1)
    expect(at(d.slides[6].id)).toBe(at(d.slides[5].id) + 1)
    expect(at(d.slides.at(-1)!.id)).toBe(at(d.slides.at(-2)!.id) + 1)
    expect(again.slides).toHaveLength(d.slides.length + 1)
  })

  it('최대 수 너머의 항목은 파일의 장이 최대 수까지 찼을 때만 되찾는다(덜 찬 장에 붙이면 숨어 있던 항목이 장에 나온다)', () => {
    const d = deckOf()
    const sent = viaFile(d)
    const i = sent.slides.findIndex((s) => s.layout === 'points')
    const id = sent.slides[i].id
    expect(withUnsent(sent, d).slides.find((s) => s.id === id)!.items).toHaveLength(LAYOUTS.points.items!.max + 2)
    const fewer = { ...sent, slides: sent.slides.map((s, j) => (j === i ? { ...s, items: s.items.slice(0, 2) } : s)) }
    expect(withUnsent(fewer, d).slides.find((s) => s.id === id)!.items).toHaveLength(2)
  })

  it('발표 전체의 값은 파일의 장에 나오지 않는 것만 되찾는다', () => {
    // 연락처는 숨긴 마지막 장에만 나온다: 파일에는 빈 값, 다시 열면 이 PC의 값
    const all = deckOf()
    const d = { ...all, slides: all.slides.filter((s) => s.hidden || !LAYOUTS[s.layout].fields.some((f) => f.key === '$contact')) }
    const sent = viaFile(d)
    expect(sent.meta.contact).toBe('')
    expect(withUnsent(sent, d).meta.contact).toBe('연락처')
    // 파일의 장에 나오는 값을 비웠으면 지운 것이다
    expect(withUnsent({ ...sent, meta: { ...sent.meta, org: '' } }, d).meta.org).toBe('')
  })
})

describe('빈칸 때문에 제목만 남는 장 (bareSlide)', () => {
  const deck = createDeck({ type: 'weekly', audience: 'practitioner', minutes: 10, method: 'live', title: '주간 업무 보고', org: '운영팀', presenter: '발표자', theme: 'white' })
  const meta = deck.meta
  const titled = (slide: Slide, title = '제목 한 줄'): Slide => ({ ...slide, fields: { ...slide.fields, title } })
  const fill = (slide: Slide, k: 'title' | 'body' | 'value' | 'image', v: string): Slide => ({ ...slide, items: slide.items.map((it, i) => (i === 0 ? { ...it, [k]: v } : it)) })

  it('요청을 비운 마지막 장은 제목만 남는다: 프레임 잡기가 만든 주간 보고의 ‘도움이 필요한 것’', () => {
    const closing = deck.slides.find((s) => s.layout === 'closing')!
    expect(closing.fields.title).toBeTruthy()
    expect(bareSlide(closing, meta)).toBe(true)
    expect(bareShows(closing)).toBe('title')
    // 요청 하나라도 채우면 빈 장이 아니다
    expect(bareSlide(fill(closing, 'title', '옆 팀 일손 요청'), meta)).toBe(false)
  })

  it('꼭 채울 칸이 없는 장은 그 모습이 뜻한 것이라 세지 않는다 (요청 없이 인사하는 마지막 장, 제목만 둔 컴포넌트 장)', () => {
    expect(bareSlide({ ...titled(makeSlide('closing'), '감사합니다'), items: [] }, meta)).toBe(false)
    expect(bareSlide(titled(makeSlide('compose')), meta)).toBe(false)
  })

  it('표지, 섹션 구분, 메시지는 제목이 곧 내용이라 제목까지 비었을 때만 센다', () => {
    for (const id of ['cover', 'section', 'statement'] as const) {
      expect(bareSlide(titled(makeSlide(id)), meta), id).toBe(false)
      expect(bareSlide(makeSlide(id), meta), id).toBe(true)
      expect(bareShows(makeSlide(id)), id).toBe('nothing')
    }
    // 발표자 이름처럼 여러 장에 되풀이되는 발표 전체의 값은 내용으로 치지 않는다
    expect(bareSlide(makeSlide('cover'), { ...meta, presenter: '발표자', org: '운영팀' })).toBe(true)
  })

  it('항목을 비운 목차와 내용 장은 빈 장이고, 숫자나 이미지 하나라도 채우면 아니다', () => {
    for (const id of ['agenda', 'summary', 'kpi', 'points', 'timeline', 'logos'] as const) {
      const slide = titled(makeSlide(id))
      expect(bareSlide(slide, meta), id).toBe(true)
    }
    expect(bareSlide(fill(titled(makeSlide('kpi')), 'value', '40%'), meta)).toBe(false)
    expect(bareSlide(fill(titled(makeSlide('logos')), 'image', 'data:image/png;base64,AA'), meta)).toBe(false)
  })

  it('틀의 글(표의 열 이름, 비교의 양쪽 이름, 축 이름, 단위, 출처)만 채운 장은 듣는 분께 빈 틀이라 센다', () => {
    const frame = (id: Parameters<typeof makeSlide>[0], fields: Record<string, string>) => ({ ...titled(makeSlide(id)), fields: { title: '제목', ...fields } })
    expect(bareSlide(frame('table', { h1: '과제', h2: '담당', h3: '기한' }), meta)).toBe(true)
    expect(bareSlide(frame('compare', { leftTitle: '지금', rightTitle: '바뀐 뒤' }), meta)).toBe(true)
    expect(bareSlide(frame('matrix', { xAxis: '효과', yAxis: '쉬움' }), meta)).toBe(true)
    expect(bareSlide(frame('trend', { unit: '%', target: '120', lead: '부제' }), meta)).toBe(true)
    expect(bareSlide(frame('kpi', { source: '사내 집계' }), meta)).toBe(true)
  })

  it('머리 밖의 칸(사례의 대상, 이미지 설명, 증감의 처음 값)은 내용이라 채우면 빈 장이 아니다', () => {
    expect(bareSlide({ ...titled(makeSlide('case')), fields: { title: '결과', client: '물류센터' } }, meta)).toBe(false)
    expect(bareSlide({ ...titled(makeSlide('imageText')), fields: { title: '화면', body: '새 화면이에요' } }, meta)).toBe(false)
    expect(bareSlide({ ...titled(makeSlide('bridge')), fields: { title: '증감', startValue: '117' } }, meta)).toBe(false)
  })

  it('제목을 숨긴 장은 제목이 있어도 아무것도 보이지 않는다', () => {
    const closing = deck.slides.find((s) => s.layout === 'closing')!
    expect(bareShows({ ...closing, options: { ...closing.options, hideHead: true } })).toBe('nothing')
  })

  it('컴포넌트 장: 비운 컴포넌트만 있으면 빈 장, 글을 채우거나 글 없이도 그려지는 모션 그래픽이 있으면 아니다', () => {
    const blank = { ...titled(makeSlide('compose')), blocks: [makeBlock('message')] }
    expect(bareSlide(blank, meta)).toBe(true)
    // 비운 컴포넌트가 남아 빈칸이 있어도, 다른 컴포넌트에 글이 있으면 빈 장이 아니다
    const filled = { ...blank, blocks: [...blank.blocks, { ...makeBlock('message'), fields: { text: '한 문장' } }] }
    expect(missingFields(filled, meta).length).toBeGreaterThan(0)
    expect(bareSlide(filled, meta)).toBe(false)
    expect(bareSlide({ ...blank, blocks: [...blank.blocks, makeBlock('cine')] }, meta)).toBe(false)
  })

  it('줄이 있는 컴포넌트는 줄을 비우면 머리 글(양쪽 이름, 소제목, 가운데 이름)만 채워도 빈 장이고, 줄 하나라도 채우면 아니다', () => {
    const wipe = { ...makeBlock('wipe'), fields: { from: '예전에는', to: '이렇게 하면' } }
    const slide = { ...titled(makeSlide('compose')), blocks: [wipe] }
    expect(bareSlide(slide, meta)).toBe(true)
    const one = { ...wipe, items: wipe.items.map((it, i) => (i === 0 ? { ...it, title: '종이에 붙여요' } : it)) }
    expect(bareSlide({ ...slide, blocks: [one] }, meta)).toBe(false)
    // 줄 없는 컴포넌트의 글은 그대로 내용이다
    expect(bareSlide({ ...slide, blocks: [{ ...makeBlock('message'), fields: { text: '한 문장' } }] }, meta)).toBe(false)
  })

  it('발표하는 장 가운데 빈 장만 권하고, 빼면 남는 장이 없으면 권하지 않는다', () => {
    const closing = deck.slides.find((s) => s.layout === 'closing')!
    expect(bareSlides(deck)).toContain(closing.id)
    expect(bareSlides({ ...deck, slides: deck.slides.map((s) => (s === closing ? { ...s, hidden: true } : s)) })).not.toContain(closing.id)
    expect(bareSlides({ ...deck, slides: [closing, makeSlide('section')] })).toEqual([])
  })
})

describe('이번에만 빼고 발표하기와 내보내기 (leaveOut)', () => {
  const deck = createDeck({ type: 'weekly', audience: 'practitioner', minutes: 10, method: 'live', title: '주간 업무 보고', org: '운영팀', presenter: '발표자', theme: 'white' })
  const skip = bareSlides(deck)
  const out = leaveOut(deck, skip)

  it('뺀 장은 사본에서만 발표에서 숨기고, 고치는 발표는 바꾸지 않는다 (지우지도, 숨기기를 켜지도 않는다)', () => {
    expect(skip.length).toBeGreaterThan(0)
    const before = JSON.stringify(deck)
    leaveOut(deck, skip)
    expect(JSON.stringify(deck)).toBe(before)
    expect(deck.slides.some((s) => s.hidden)).toBe(false)
    expect(out.slides.filter((s) => s.hidden).map((s) => s.id)).toEqual(skip)
    // 글은 그대로 (숨김 표시만 다르다)
    expect(out.slides.map(({ hidden: _, ...s }) => s)).toEqual(deck.slides)
    expect(leaveOut(deck, [])).toBe(deck)
  })

  it('발표 화면과 발표자 화면의 쪽 번호는 뺀 장 없이 1부터 이어 매긴다', () => {
    const info = pageInfo(out.slides, out)
    expect(info.total).toBe(deck.slides.length - skip.length)
    expect(skip.every((id) => !info.page.has(id))).toBe(true)
    expect([...info.page.values()]).toEqual(Array.from({ length: info.total }, (_, i) => i + 1))
  })

  it('발표 파일에서 빠지고, 그 파일을 이 PC에서 다시 열면 뺀 장이 제자리에 돌아와 이 PC의 발표와 같다', () => {
    const sent = JSON.parse(JSON.stringify(sendable(out))) as Deck
    expect(sent.slides.some((s) => skip.includes(s.id))).toBe(false)
    expect(JSON.stringify(withUnsent(sent, deck))).toBe(JSON.stringify(deck))
  })
})

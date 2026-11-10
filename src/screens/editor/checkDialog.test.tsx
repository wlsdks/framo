import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { bareSlides, missingFields } from '../../deck/fields'
import { createDeck } from '../../deck/generate'
import type { Deck } from '../../deck/types'
import { CheckDialog, type PresentCheck } from './presentLaunch'

// 지어낸 주간 보고: 마지막 장(요청 사항)의 요청을 비워 두었다
const deck: Deck = createDeck({ type: 'weekly', audience: 'practitioner', minutes: 10, method: 'live', title: '주간 업무 보고', org: '운영팀', presenter: '발표자', theme: 'white' })
const closing = deck.slides.find((s) => s.layout === 'closing')!

const draw = (check: PresentCheck, verb = '발표하기') =>
  renderToStaticMarkup(createElement(CheckDialog, { deck, check, what: '발표 화면', verb, onProceed: () => {}, onClose: () => {}, onGoTo: () => {} }))

const row = { id: closing.id, page: 7, name: '요청 사항', missing: missingFields(closing, deck.meta), over: false }

describe('발표하기 전 확인 창 (CheckDialog)', () => {
  it('제목만 보이는 장이 있으면 그 장에 적고, 건너뛰고 발표하는 단추를 권한다 (그대로 발표하기도 남긴다)', () => {
    const html = draw({ rows: [{ ...row, bare: 'title' }], missing: row.missing.length, over: 0, bare: bareSlides(deck).filter((id) => id === closing.id) })
    expect(html).toContain('제목만 보여요')
    expect(html).toMatch(/class="btn btn-primary"[^>]*>1장 건너뛰고 발표하기</)
    expect(html).toContain('그대로 발표하기')
    expect(html).toContain('지우지 않아요')
  })

  it('건너뛸 장이 발표의 절반을 넘으면(아직 만드는 중) 건너뛰기 대신 빈칸 채우기를 권한다', () => {
    const shown = deck.slides.length
    const many = deck.slides.slice(0, Math.floor(shown / 2) + 1).map((s) => s.id)
    const html = draw({ rows: [{ ...row, bare: 'title' }], missing: row.missing.length, over: 0, bare: many })
    expect(html).toMatch(/class="btn btn-primary"[^>]*>빈칸 채우기</)
    expect(html).toContain(`${many.length}장 건너뛰고 발표하기`)
    expect(html).not.toMatch(/class="btn btn-primary"[^>]*>[^<]*건너뛰고/)
  })

  it('내보내기와 녹화도 같은 말로 묻는다', () => {
    const check = { rows: [{ ...row, bare: 'title' as const }], missing: row.missing.length, over: 0, bare: [closing.id] }
    expect(draw(check, '내보내기')).toContain('1장 건너뛰고 내보내기')
    expect(draw(check, '녹화하기')).toContain('1장 건너뛰고 녹화하기')
  })

  it('뺄 장이 없으면 예전처럼 그대로 발표하기만 묻는다', () => {
    const html = draw({ rows: [row], missing: row.missing.length, over: 0, bare: [] })
    expect(html).not.toContain('건너뛰고')
    expect(html).not.toContain('제목만 보여요')
    expect(html).toMatch(/class="btn btn-primary"[^>]*>그대로 발표하기</)
    expect(html).toContain('그대로 발표하기')
  })

  it('예시 글이 그대로인 칸은 빈칸과 달리 발표에 나온다고 알린다', () => {
    const example = { block: 'b1', key: 'value', label: '모션 그래픽의 숫자 (예시 그대로)', example: true as const }
    const html = draw({ rows: [{ ...row, missing: [example] }], missing: 1, over: 0, bare: [] })
    expect(html).toContain('예시 글은 그대로 나가요')
    expect(html).toContain('예시 글이 보여요')
    expect(draw({ rows: [row], missing: row.missing.length, over: 0, bare: [] })).not.toContain('예시 글')
  })
})

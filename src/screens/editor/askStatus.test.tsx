import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createSampleDeck } from '../../deck/sample'
import { AskStatus } from './AiShare'

describe('AI 부탁 진행 표시', () => {
  it('연결을 잃으면 부탁이 끝났다고 단정하지 않고 다시 확인 중이라고 말한다', () => {
    const job = { id: 'a123', state: 'running', step: 'looking', ask: 'deck_flow', slideId: null, connectionLost: true } as const
    const html = renderToStaticMarkup(createElement(AskStatus, { deck: createSampleDeck(), job, onCancel: () => {} }))
    expect(html).toContain('진행 상태를 확인하지 못했어요')
    expect(html).toContain('다시 확인하고 있어요')
    expect(html).toContain('중단을 요청해도 부탁이 계속될 수 있어요')
    expect(html).toContain('중단 요청')
  })

  it('연결된 상태에서는 맡긴 부탁과 그만두기를 보여 준다', () => {
    const job = { id: 'a123', state: 'running', step: 'looking', ask: 'deck_flow', slideId: null } as const
    const html = renderToStaticMarkup(createElement(AskStatus, { deck: createSampleDeck(), job, onCancel: () => {} }))
    expect(html).toContain('맡겼어요')
    expect(html).toContain('그만두기')
    expect(html).not.toContain('진행 상태를 확인하지 못했어요')
  })
})

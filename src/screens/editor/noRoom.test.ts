import { describe, expect, it } from 'vitest'
import { narrowText, noRoomText } from './noRoom'

describe('넣을 수 없는 까닭의 말', () => {
  it('기존 연결을 지킬 수 없을 때 조정하거나 새 슬라이드에 넣도록 안내한다', () => {
    const text = noRoomText({ kind: 'link' }, 'image', 'slide')
    expect(text.why).toContain('기존 연결')
    expect(text.fix).toContain('새 슬라이드')
  })
  it('너비: 장 너비의 몫으로, 장 너비를 다 쓰는 것은 다 써야 한다고', () => {
    expect(noRoomText({ kind: 'narrow', span: 6 }, 'message', 'here').why).toBe('핵심 한 줄은 슬라이드 너비의 절반 이상이 있어야 해서, 여기에 끼우면 너무 좁아져요.')
    expect(noRoomText({ kind: 'narrow', span: 12 }, 'table', 'move').why).toBe('표는 슬라이드 너비를 다 써야 해서, 여기에 끼우면 너무 좁아져요.')
    expect(narrowText({ kind: 'block', type: 'table', minSpan: 12 })).toBe('표는 슬라이드 너비를 다 써야 해서 더 좁힐 수 없어요.')
    expect(narrowText({ kind: 'block', type: 'bars', minSpan: 4 })).toContain('슬라이드 너비의 3분의 1 이상이 있어야 해서')
  })

  it('높이: 넣기 전부터 넘친 장이면 넣어서 넘는다고 하지 않는다', () => {
    const noBody = noRoomText({ kind: 'height', need: 1, room: 0, noBody: true }, 'number', 'slide')
    expect(noBody.why).toContain('본문')
    expect(noBody.fix).toContain('제목이나 부제')
    expect(noRoomText({ kind: 'height', need: 800, room: 700 }, 'table', 'here').why).toBe('표를 넣으면 이 슬라이드의 컴포넌트들이 슬라이드 높이를 넘어서 글이 잘려요.')
    const already = noRoomText({ kind: 'height', need: 900, room: 700, already: true }, 'table', 'here')
    expect(already.why).toBe('이 슬라이드의 컴포넌트들이 이미 슬라이드 높이를 넘었어요.')
    expect(already.fix).toBe('항목을 줄이거나 컴포넌트를 지우면 들어가요.')
    expect(noRoomText({ kind: 'height', need: 900, room: 700, already: true }, 'bullets', 'change').fix).toBe('항목을 줄이거나 컴포넌트를 지우면 바꿀 수 있어요.')
  })

  it('맞바꾸기: 두 컴포넌트를 이름으로, 같은 컴포넌트끼리면 두', () => {
    expect(noRoomText({ kind: 'swap', type: 'table' }, 'number', 'move').why).toBe('큰 숫자와 표는 크기가 맞지 않아 자리를 맞바꿀 수 없어요.')
    expect(noRoomText({ kind: 'swap', type: 'number' }, 'number', 'move').why).toBe('두 큰 숫자는 크기가 맞지 않아 자리를 맞바꿀 수 없어요.')
  })
})

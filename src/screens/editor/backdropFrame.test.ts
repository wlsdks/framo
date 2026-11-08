import { describe, expect, it } from 'vitest'
import { dragArea } from './BackdropFrame'

describe('배경 자리 끌기', () => {
  const at = { x: 2, y: 2, w: 6, h: 6 }

  it('옮기면 크기는 그대로, 장 밖으로 나가지 않는다', () => {
    expect(dragArea(at, 'move', 3, -1)).toEqual({ x: 5, y: 1, w: 6, h: 6 })
    expect(dragArea(at, 'move', 20, 20)).toEqual({ x: 6, y: 6, w: 6, h: 6 })
    expect(dragArea(at, 'move', -9, -9)).toEqual({ x: 0, y: 0, w: 6, h: 6 })
  })

  it('가장자리를 끌면 맞은편은 제자리이고, 가장 작은 크기(3칸)보다 작아지지 않는다', () => {
    expect(dragArea(at, 'e', 2, 0)).toEqual({ x: 2, y: 2, w: 8, h: 6 })
    expect(dragArea(at, 'w', -2, 0)).toEqual({ x: 0, y: 2, w: 8, h: 6 })
    expect(dragArea(at, 'w', 9, 0)).toEqual({ x: 5, y: 2, w: 3, h: 6 })
    expect(dragArea(at, 'nw', -5, -5)).toEqual({ x: 0, y: 0, w: 8, h: 8 })
    expect(dragArea(at, 'se', 9, 9)).toEqual({ x: 2, y: 2, w: 10, h: 10 })
    expect(dragArea(at, 's', 0, -9)).toEqual({ x: 2, y: 2, w: 6, h: 3 })
  })
})

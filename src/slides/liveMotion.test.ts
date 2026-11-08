import { describe, expect, it } from 'vitest'
import { cssSource } from './cssSource'
import { blockFitter } from './fitBlocks'
import { LIVE_EASING, LIVE_ID, liveStep } from './liveMotion'

const rect = (x: number, y: number, w: number, h: number, fs = 0) => ({ x, y, w, h, fs })
const still = { dx: 0, dy: 0 }

describe('쓰는 동안 다시 맞춘 자리로 미끄러지기', () => {
  it('왼쪽 위 끝을 옛 자리로 옮겨 놓고 시작한다 (화면 px를 캔버스 px로)', () => {
    // 장을 반으로 줄여 그린 편집 화면: 화면에서 20px 아래로 밀린 항목은 캔버스 40px 위에서 시작한다
    expect(liveStep(rect(100, 200, 300, 40), rect(100, 220, 300, 40), still, 0.5, [150, 20])).toEqual({ tx: 0, ty: -40, s: 1 })
  })

  it('감싼 것과 함께 옮겨지면 감싼 것에 대한 몫만 옮긴다', () => {
    // 항목이 화면 10px 내려갔고 그 안의 글 칸은 15px 내려갔다: 글 칸은 항목 안에서 5px만
    expect(liveStep(rect(0, 100, 50, 20), rect(0, 115, 50, 20), { dx: 0, dy: -10 }, 1, [0, 0])).toEqual({ tx: 0, ty: -5, s: 1 })
  })

  it('글자 단계가 바뀐 글 칸은 옛 크기에서 시작하고, 크기를 바꾸는 축만큼 자리를 고쳐 왼쪽 위 끝이 곧게 간다', () => {
    // 글자 36px → 30px(한 단계 작게). 축은 상자 가운데(100, 40)
    const b = rect(10, 10, 200, 96, 36)
    const f = rect(10, 10, 200, 80, 30)
    const { tx, ty, s } = liveStep(b, f, still, 1, [100, 40])
    expect(s).toBeCloseTo(1.2)
    // 축(o)을 두고 s배 하면 왼쪽 위 끝은 o(1 - s)만큼 옮겨진다. translate가 그것을 되돌려 옛 자리에 둔다
    expect(tx + 100 * (1 - s)).toBeCloseTo(0)
    expect(ty + 40 * (1 - s)).toBeCloseTo(0)
  })

  it('그림은 가로세로가 같은 비율로 바뀔 때만 크기를 바꾼다 (다르게 늘이면 찌그러진다)', () => {
    expect(liveStep(rect(0, 0, 120, 60), rect(0, 0, 100, 50), still, 1, [0, 0]).s).toBeCloseTo(1.2)
    expect(liveStep(rect(0, 0, 120, 60), rect(0, 0, 100, 80), still, 1, [0, 0]).s).toBe(1)
  })

  it('맞추기는 내보낸 HTML에 소스째 들어가 이 움직임의 이름을 따로 적는다: 같은 이름이다', () => {
    expect(blockFitter.toString()).toContain(`'${LIVE_ID}'`)
  })

  it('곡선은 앱의 움직임 곡선(--ease-out) 하나다', () => {
    const css = cssSource(new URL('../styles/base.css', import.meta.url))
    expect(css).toContain(`--ease-out: ${LIVE_EASING};`)
  })
})

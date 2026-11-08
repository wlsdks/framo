import { describe, expect, it } from 'vitest'
import { cineScript, presetRecipe, withKnob } from '../deck/cine'
import { cineMotion } from './cine'
import { drawKit } from './draw'

const cines = cineMotion(drawKit())

describe('모션 그래픽 엔진', () => {
  it('바깥의 아무것도 참조하지 않아서 소스만으로 다시 만들 수 있다 (내보낸 HTML에 소스가 그대로 들어간다)', () => {
    const kit = (new Function(`return (${drawKit.toString()})`)() as typeof drawKit)()
    const rebuilt = (new Function(`return (${cineMotion.toString()})`)() as typeof cineMotion)(kit)
    expect(Object.keys(rebuilt)).toEqual(Object.keys(cines))
    const s = cineScript(presetRecipe('stroke', 'l1'))
    expect(rebuilt.still(s)).toBe(cines.still(s))
  })

  it('멈춘 그림(끝 모습)에는 남는 선만: 선 틀은 칸 너비를 건너는 선, 나머지는 아무것도 남지 않는다', () => {
    const line = cines.still(cineScript(presetRecipe('stroke', 'l1')))
    // 칸을 0~1000으로 늘린 좌표에 굵기를 지켜 긋는다(편집 화면, PDF, PPT가 같은 선)
    expect(line).toMatch(/^<path d="M0 600L1000 600"/)
    expect(line).toContain('vector-effect="non-scaling-stroke"')
    expect(line).toContain('stroke="currentColor"')
    const wave = cines.still(cineScript(withKnob(presetRecipe('stroke', 'l1'), 'shape', 'wave')))
    expect(wave.match(/L/g)!.length).toBeGreaterThan(50)
    for (const id of ['light', 'diffuse', 'gather'] as const) expect(cines.still(cineScript(presetRecipe(id, 'l1')))).toBe('')
    expect(cines.still(null)).toBe('')
  })

  it('움직이지 않는 세기(없음)나 대본이 없는 칸은 아무것도 걸지 않는다', () => {
    const anims: Animation[] = []
    const el = { dataset: {}, animate: () => ({}) } as unknown as HTMLElement
    const stop = cines.play(el, { level: 'none', anims })
    stop()
    expect(anims).toHaveLength(0)
    cines.play(el, { level: 'lively', anims })
    expect(anims).toHaveLength(0)
  })
})

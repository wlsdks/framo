import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { guardFileDrop } from './dropGuard'

/** 끌어 온 것: types는 브라우저처럼 'Files'(파일)나 'text/plain'(글) */
function drag(types: string[], prevented = false) {
  return {
    dataTransfer: { types, dropEffect: 'copy' as DataTransfer['dropEffect'] },
    defaultPrevented: prevented,
    preventDefault() {
      this.defaultPrevented = true
    },
  }
}
const run = (e: ReturnType<typeof drag>) => guardFileDrop(e as unknown as DragEvent)

describe('받는 곳이 없는 데 떨어뜨린 파일', () => {
  it('창이 그 파일로 넘어가지 않게 막고, 놓을 수 없다고 보인다', () => {
    // 홈, 프레임 잡기, 발표 화면에 파일을 떨어뜨리면 앱 창이 그 파일(.deck, 이미지)로 넘어가 화면이 사라졌다
    const e = drag(['Files'])
    run(e)
    expect(e.defaultPrevented).toBe(true)
    expect(e.dataTransfer.dropEffect).toBe('none')
  })

  it('먼저 받은 곳(이미지 칸)과 파일이 아닌 끌기(글)는 그대로 둔다', () => {
    const taken = drag(['Files'], true)
    run(taken)
    expect(taken.dataTransfer.dropEffect).toBe('copy')
    const text = drag(['text/plain'])
    run(text)
    expect(text.defaultPrevented).toBe(false)
    expect(text.dataTransfer.dropEffect).toBe('copy')
  })

  it('앱을 켤 때 창 전체에 건다 (편집기의 장처럼 받는 곳은 그 뒤에 걸려 제 값을 다시 정한다)', () => {
    const main = readFileSync(join(__dirname, '..', 'main.tsx'), 'utf8')
    expect(main).toMatch(/\bwatchFileDrop\(\)/)
  })
})

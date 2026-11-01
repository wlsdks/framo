// 검수(CI)의 점검이 스스로를 속이지 않는지 본다. 점검 스크립트와 워크플로는 윈도우 검수에서만 돌아서,
// 빈틈(브라우저가 하나도 없는데 통과, 아무 오류나 통과)이 생겨도 늘 초록불이라 아무도 모른다
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(import.meta.dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

describe('검수의 점검', () => {
  it('엣지나 크롬을 열지 못하면 화면 점검이 실패한다 (건너뛰고 통과하지 않는다)', () => {
    const smoke = read('scripts/ci-smoke.mjs')
    const launch = smoke.slice(smoke.indexOf('chromium.launch('))
    const handler = launch.slice(launch.indexOf('} catch'), launch.indexOf('continue'))
    expect(handler).toMatch(/failed = true/)
    expect(smoke).toMatch(/\['msedge', 'chrome'\]/)
  })
})

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

  it('배포본이 바깥 Host를 받지 않는지는 403으로 확인한다 (아무 오류나 통과로 보지 않는다)', () => {
    // 오류를 모두 통과로 보면 머리글을 바꾸지 못하거나(윈도우 PowerShell 5.1은 Host를 못 바꿔 오류를 낸다) 연결이 끊겨도 통과한다
    const checks = read('.github/workflows/ci.yml')
      .split('\n')
      .filter((line) => line.includes("Host = 'evil.example'"))
    expect(checks.length).toBe(2)
    for (const line of checks) {
      expect(line).not.toMatch(/catch/)
      expect(line).toMatch(/-SkipHttpErrorCheck/)
      expect(line).toMatch(/StatusCode -ne 403/)
    }
  })
})

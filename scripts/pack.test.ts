// 배포본 묶기(scripts/pack.mjs)는 nodejs.org에서 Node.js와 체크섬 목록을 받아 .cache/에 둔다.
// 받은 응답이 오류 쪽(404, 5xx의 안내 글)이면 그 글을 그대로 캐시에 두어, 지우기 전까지 묶기가 엉뚱한 까닭으로 멈춘다
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const pack = readFileSync(join(import.meta.dirname, 'pack.mjs'), 'utf8')

describe('배포본 묶기', () => {
  it('받은 응답마다 성공인지(res.ok) 보고 나서 읽는다', () => {
    // 받자마자 읽는 꼴((await fetch(…)).text())이 없고, 받는 곳마다 ok를 본다
    expect(pack).not.toMatch(/\(await fetch\([^)]*\)\)\./)
    const fetches = pack.match(/await fetch\(/g) ?? []
    const checks = pack.match(/if \(!res\.ok\)/g) ?? []
    expect(fetches.length).toBeGreaterThan(1)
    expect(checks.length).toBe(fetches.length)
  })
})

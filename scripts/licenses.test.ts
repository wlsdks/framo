// 라이선스 확인(scripts/licenses.mjs)이 묶여 나가는 패키지를 빠짐없이 고르는지.
// 예전에는 npm ls가 알려 준 경로로 골랐는데, npm은 UUID처럼 생긴 폴더 이름을 ***로 가려서 그런 폴더에서는 하나도 고르지 못했다.
// 그러면 모든 패키지를 만들 때만 쓰는 도구로 보아 더 넓은 허용 목록으로 확인했고, 배포본의 '오픈소스 라이선스.txt'는 비었다

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { prodPackages, scan } from './licenses.mjs'

const root = join(import.meta.dirname, '..')

describe('라이선스 확인', () => {
  it('묶여 나가는 패키지는 npm ls가 알려 준 이름과 버전으로 고른다 (경로를 쓰지 않는다)', () => {
    const tree = {
      name: 'gyeol',
      version: '0.5.3',
      dependencies: {
        a: { version: '1.0.0', dependencies: { b: { version: '2.0.0' }, a: { version: '1.0.0' } } },
        '@s/c': { version: '3.0.0' },
        // 설치되지 않은 것(버전 없음)은 세지 않는다
        d: { missing: true },
      },
    }
    expect([...prodPackages(tree)].sort()).toEqual(['@s/c@3.0.0', 'a@1.0.0', 'b@2.0.0'])
  })

  it('package.json의 dependencies는 모두 묶여 나가는 패키지로 센다', () => {
    const { dependencies } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
    const prod = new Set(scan().filter((p) => p.prod).map((p) => p.name))
    for (const name of Object.keys(dependencies)) expect(prod.has(name), name).toBe(true)
  })
})

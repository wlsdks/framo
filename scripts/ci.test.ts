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

  it('릴리스는 태그 커밋에서 검수를 다 돌리고, 켜 본 윈도우 zip을 그대로 붙인다', () => {
    // 예전 릴리스는 윈도우 zip을 따로 묶어 파일 정보만 읽고(켜 보지 않음), 검사도 리눅스 Node 24에서만 돌렸다
    const ci = read('.github/workflows/ci.yml')
    const release = read('.github/workflows/release.yml')
    expect(ci).toMatch(/^ {2}workflow_call:/m)
    expect(release).toMatch(/uses: \.\/\.github\/workflows\/ci\.yml/)
    expect(release).not.toMatch(/--only windows/)
    // 켜 보기를 다 마친 뒤에 릴리스로 부를 때만 zip을 남긴다
    const pkg = ci.slice(ci.indexOf('windows-package:'))
    const keep = pkg.indexOf('name: gyeol-windows')
    expect(keep).toBeGreaterThan(pkg.indexOf('시작 .bat로 켜기'))
    expect(pkg.slice(pkg.lastIndexOf('- name:', keep), keep)).toMatch(/if: inputs\.release/)
    // 불린 검수가 부른 쪽과 같은 묶음 이름이면 서로를 기다리다 멈춘다: 묶음 이름에 워크플로 이름을 넣는다
    expect(ci).toMatch(/group: ci-\$\{\{ github\.workflow \}\}-/)
  })

  it('릴리스의 쓰기 권한은 릴리스를 만드는 일 하나만 받고, 그 일은 npm 꾸러미를 돌리지 않는다', () => {
    const release = read('.github/workflows/release.yml')
    expect(release).toMatch(/^permissions:\n {2}contents: read$/m)
    const writes = release.split('\n').filter((l) => /contents: write/.test(l))
    expect(writes.length).toBe(1)
    const job = release.slice(release.lastIndexOf('\n  publish:', release.indexOf('contents: write')))
    expect(job).toMatch(/gh release create/)
    expect(job).not.toMatch(/npm |actions\/checkout|actions\/setup-node/)
    // 연습(PR)에서는 릴리스를 만들지 않는다
    expect(job.slice(job.lastIndexOf('- name:', job.indexOf('gh release create')))).toMatch(/if: github\.event_name == 'push'/)
  })

  it('워크플로의 액션은 Node 24로 도는 판 이상이고, 두 파일이 같은 판을 쓴다', () => {
    // v4는 Node 20으로 돈다(GitHub이 거두는 중). 올리고 받는 아티팩트는 판이 맞아야 한다
    const least: Record<string, number> = { checkout: 5, 'setup-node': 5, 'upload-artifact': 6, 'download-artifact': 7 }
    const seen = new Map<string, Set<string>>()
    for (const file of ['.github/workflows/ci.yml', '.github/workflows/release.yml']) {
      for (const [, name, major] of read(file).matchAll(/uses: actions\/([\w-]+)@v(\d+)/g)) {
        expect(least[name], name).toBeDefined()
        expect(Number(major), `${file} ${name}`).toBeGreaterThanOrEqual(least[name])
        seen.set(name, (seen.get(name) ?? new Set()).add(major))
      }
    }
    for (const [name, majors] of seen) expect([...majors], name).toHaveLength(1)
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

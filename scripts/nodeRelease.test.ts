import { describe, expect, it } from 'vitest'
import { compareVersions, nodeReleaseCheck } from './nodeRelease.mjs'

// nodejs.org/dist/index.json의 꼴(새 판이 앞)
const index: { version: string; lts: string | false; security: boolean }[] = [
  { version: 'v26.1.0', lts: false, security: false },
  { version: 'v24.22.2', lts: 'Krypton', security: false },
  { version: 'v24.22.1', lts: 'Krypton', security: true },
  { version: 'v24.22.0', lts: 'Krypton', security: false },
  { version: 'v24.9.0', lts: 'Krypton', security: true },
  { version: 'v22.23.4', lts: 'Jod', security: true },
]

describe('배포본에 넣는 Node.js 판 확인', () => {
  it('판을 숫자로 견준다(24.9 < 24.22)', () => {
    expect(compareVersions('v24.22.0', 'v24.9.0')).toBeGreaterThan(0)
    expect(compareVersions('v24.22.2', 'v24.22.2')).toBe(0)
  })

  it('보안 수정판 뒤의 최신 LTS면 통과한다', () => {
    expect(nodeReleaseCheck(index, 'v24.22.2')).toEqual({ known: true, lts: true, newerSecurity: null })
  })

  it('같은 주 버전에 더 새 보안 수정판이 있으면 알려 준다', () => {
    expect(nodeReleaseCheck(index, 'v24.22.0').newerSecurity).toBe('v24.22.1')
    expect(nodeReleaseCheck(index, 'v24.9.0').newerSecurity).toBe('v24.22.1')
  })

  it('다른 주 버전의 보안 수정판은 세지 않고, LTS가 아니면 가린다', () => {
    expect(nodeReleaseCheck(index, 'v26.1.0')).toEqual({ known: true, lts: false, newerSecurity: null })
    expect(nodeReleaseCheck(index, 'v24.30.0').known).toBe(false)
  })
})

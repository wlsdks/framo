// 버전 폴더 고르기: 시작 프로그램과 MCP 서버가 켤 버전, 로컬 서버가 아는 앱 폴더.

import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { appHome, FAILED_FILE, listVersions, nodeIn, READY_FILE, READY_FORMAT, readyVersions, requiredFiles } from './versions'

const P = 'win32'
const A = 'x64'

/** 앱 폴더 하나와, 그 안에 버전 폴더를 만드는 도구 */
function home() {
  const dir = mkdtempSync(join(tmpdir(), 'gyeol-versions-'))
  mkdirSync(join(dir, 'versions'))
  return dir
}

function put(h: string, name: string, { ready = true, mark = name, missing = '', failed = false } = {}) {
  const dir = join(h, 'versions', name)
  for (const f of requiredFiles(P, A)) {
    if (f === missing) continue
    mkdirSync(join(dir, ...f.split('/').slice(0, -1)), { recursive: true })
    writeFileSync(join(dir, ...f.split('/')), 'x')
  }
  if (ready) writeFileSync(join(dir, READY_FILE), JSON.stringify({ format: READY_FORMAT, version: mark }))
  if (failed) writeFileSync(join(dir, FAILED_FILE), '{}')
  return dir
}

describe('앱 폴더', () => {
  it('versions/X.Y.Z 안에서 돌면 그 위의 위, 아니면 그 폴더 자신', () => {
    const h = join('/apps', 'Framo')
    expect(appHome(join(h, 'versions', '0.9.0'))).toBe(h)
    expect(appHome(h)).toBe(h)
    expect(appHome(join(h, 'versions', 'latest'))).toBe(join(h, 'versions', 'latest'))
    expect(appHome(join(h, 'other', '0.9.0'))).toBe(join(h, 'other', '0.9.0'))
    expect(appHome(join(h, 'versions', '01.2.3'))).toBe(join(h, 'versions', '01.2.3'))
  })

  it('OS마다 함께 든 node', () => {
    expect(nodeIn('/a', 'win32', 'x64')).toBe(join('/a', 'node', 'node.exe'))
    expect(nodeIn('/a', 'darwin', 'arm64')).toBe(join('/a', 'node', 'arm64', 'node'))
    expect(nodeIn('/a', 'darwin', 'x64')).toBe(join('/a', 'node', 'x64', 'node'))
    expect(nodeIn('/a', 'linux', 'x64')).toBeNull()
    expect(requiredFiles('darwin', 'arm64')).toContain('node/arm64/node')
  })
})

describe('켤 버전 고르기', () => {
  it('다 풀고 확인을 마친 것 가운데 앱 폴더의 버전보다 새것만, 새것부터', () => {
    const h = home()
    put(h, '0.9.0')
    put(h, '0.10.0')
    put(h, '0.8.0')
    put(h, '0.7.0')
    expect(readyVersions(h, '0.8.0', P, A).map((v) => v.version)).toEqual(['0.10.0', '0.9.0'])
  })

  it('표시가 없거나, 표시가 다른 버전을 말하거나, 켜는 데 쓸 파일이 빠진 폴더는 고르지 않는다', () => {
    const h = home()
    put(h, '1.0.0', { ready: false })
    put(h, '1.1.0', { mark: '9.9.9' })
    put(h, '1.2.0', { missing: 'dist-node/serve.mjs' })
    put(h, '1.3.0', { missing: 'node/node.exe' })
    put(h, '0.9.0')
    expect(readyVersions(h, '0.8.0', P, A).map((v) => v.version)).toEqual(['0.9.0'])
  })

  it('켜지지 않았던 버전은 건너뛰고 바로 앞 버전을 고른다', () => {
    const h = home()
    put(h, '0.10.0', { failed: true })
    put(h, '0.9.0')
    expect(readyVersions(h, '0.8.0', P, A).map((v) => v.version)).toEqual(['0.9.0'])
    expect(listVersions(h, P, A).find((v) => v.version === '0.10.0')).toMatchObject({ ready: true, failed: true })
  })

  it('버전 이름 꼴이 아닌 폴더(푸는 중, 지우는 중, 앞에 0)는 보지 않는다', () => {
    const h = home()
    put(h, '.part-0.9.0-abcd')
    put(h, '.trash-1234')
    put(h, '0.09.0')
    put(h, 'v0.9.0')
    expect(listVersions(h, P, A)).toEqual([])
  })

  it('링크인 버전 폴더, 링크인 versions 폴더는 따라가지 않는다', () => {
    if (process.platform === 'win32') return
    const h = home()
    const elsewhere = mkdtempSync(join(tmpdir(), 'gyeol-elsewhere-'))
    mkdirSync(join(elsewhere, 'versions'))
    const real = put(elsewhere, '0.9.0')
    symlinkSync(real, join(h, 'versions', '0.9.0'))
    expect(readyVersions(h, '0.8.0', P, A)).toEqual([])
    const h2 = mkdtempSync(join(tmpdir(), 'gyeol-versions-'))
    symlinkSync(join(elsewhere, 'versions'), join(h2, 'versions'))
    expect(readyVersions(h2, '0.8.0', P, A)).toEqual([])
  })

  it('versions 폴더가 없거나 배포본이 없는 OS면 빈 목록', () => {
    expect(readyVersions(mkdtempSync(join(tmpdir(), 'gyeol-versions-')), '0.8.0', P, A)).toEqual([])
    const h = home()
    put(h, '0.9.0')
    expect(readyVersions(h, '0.8.0', 'linux', 'x64')).toEqual([])
  })
})

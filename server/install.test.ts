// 받은 새 버전을 versions/X.Y.Z에 풀고 확인하기, 쓰지 않을 버전 폴더 치우기.

import { createHash } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { cleanVersions, installVersion, newerVersion, PACKAGE_TOP } from './install'
import { FAILED_FILE, READY_FILE, READY_FORMAT, readyVersions, requiredFiles } from './versions'
import { fakePackage, makeZip } from './zipFixture'

function setup(zip: Buffer) {
  const home = mkdtempSync(join(tmpdir(), 'gyeol-install-'))
  mkdirSync(join(home, '새 버전'))
  const file = join(home, '새 버전', 'gyeol-windows.zip')
  writeFileSync(file, zip)
  return { home, file, size: zip.length, sha256: createHash('sha256').update(zip).digest('hex') }
}

const install = (s: ReturnType<typeof setup>, over: Partial<Parameters<typeof installVersion>[0]> = {}) =>
  installVersion({ zip: s.file, size: s.size, sha256: s.sha256, home: s.home, version: '0.9.0', platform: 'win32', arch: 'x64', ...over })

/** versions 안에 남은 것(푸는 중, 지우는 중 폴더가 남지 않았는지) */
const leftovers = (home: string) => (existsSync(join(home, 'versions')) ? readdirSync(join(home, 'versions')) : [])

describe('새 버전 풀기', () => {
  it('지문이 맞는 배포본을 versions/<버전>에 풀고 준비 표시를 남긴다. 시작 프로그램이 이 버전을 고른다', async () => {
    const s = setup(fakePackage('0.9.0', 'win32'))
    const progress: number[] = []
    expect(await install(s, { onProgress: (done) => progress.push(done) })).toBe('ok')
    const dir = join(s.home, 'versions', '0.9.0')
    expect(JSON.parse(readFileSync(join(dir, READY_FILE), 'utf8'))).toEqual({ format: READY_FORMAT, version: '0.9.0' })
    expect(readFileSync(join(dir, 'dist', 'index.html'), 'utf8')).toContain('Framo')
    expect(readyVersions(s.home, '0.8.0', 'win32', 'x64').map((v) => v.version)).toEqual(['0.9.0'])
    expect(leftovers(s.home)).toEqual(['0.9.0'])
    expect(progress.at(-1)).toBeGreaterThan(0)
    // 한 번 더 불러도 다시 풀지 않는다
    expect(await install(s)).toBe('ok')
  })

  it('맥: 이 맥의 node에 실행 권한이 남는다', async () => {
    if (process.platform === 'win32') return
    const s = setup(fakePackage('0.9.0', 'darwin'))
    expect(await install(s, { platform: 'darwin', arch: 'arm64' })).toBe('ok')
    expect(statSync(join(s.home, 'versions', '0.9.0', 'node', 'arm64', 'node')).mode & 0o111).toBe(0o111)
  })

  it('맥: node에 실행 권한이 없는 zip은 준비됨으로 두지 않는다', async () => {
    if (process.platform === 'win32') return
    const zip = makeZip([
      ...['package.json', 'dist/index.html', 'dist-node/serve.mjs', 'dist-node/gyeol-mcp.mjs', 'node/arm64/node'].map((f) => ({
        name: `gyeol-0.9.0/${f}`,
        data: f === 'package.json' ? JSON.stringify({ name: 'gyeol', version: '0.9.0' }) : 'x',
      })),
    ])
    const s = setup(zip)
    expect(await install(s, { platform: 'darwin', arch: 'arm64' })).toBe('layout')
    expect(leftovers(s.home)).toEqual([])
  })

  it('받은 뒤 zip이 바뀌었으면(지문이 다르면) 풀지 않는다', async () => {
    const s = setup(fakePackage('0.9.0', 'win32'))
    expect(await install(s, { sha256: '0'.repeat(64) })).toBe('verify')
    expect(await install(s, { size: s.size + 1 })).toBe('verify')
    expect(leftovers(s.home)).toEqual([])
  })

  it('배포본과 꼴이 다르면(다른 버전의 폴더, 모르는 이름, 빠진 파일, 다른 버전의 package.json) 준비됨으로 두지 않는다', async () => {
    const cases = [
      fakePackage('0.8.0', 'win32'),
      fakePackage('0.9.0', 'win32', { 'evil.exe': 'MZ' }),
      fakePackage('0.9.0', 'win32', { 'dist-node/serve.mjs': null }),
      fakePackage('0.9.0', 'win32', { 'node/node.exe': null }),
      fakePackage('0.9.0', 'win32', { 'package.json': JSON.stringify({ name: 'gyeol', version: '1.0.0' }) }),
      makeZip([{ name: 'gyeol-0.9.0/../evil.txt', data: 'x' }]),
    ]
    for (const zip of cases) {
      const s = setup(zip)
      expect(await install(s)).toBe('layout')
      expect(leftovers(s.home)).toEqual([])
    }
  })

  it('versions가 앱 폴더 밖을 가리키는 링크면 쓰지 않는다', async () => {
    if (process.platform === 'win32') return
    const s = setup(fakePackage('0.9.0', 'win32'))
    const outside = mkdtempSync(join(tmpdir(), 'gyeol-outside-'))
    symlinkSync(outside, join(s.home, 'versions'))
    expect(await install(s)).toBe('write')
    expect(readdirSync(outside)).toEqual([])
  })

  it('쓰지 못하는 앱 폴더면 write', async () => {
    if (process.platform === 'win32' || process.getuid?.() === 0) return
    const s = setup(fakePackage('0.9.0', 'win32'))
    chmodSync(s.home, 0o500)
    try {
      expect(await install(s)).toBe('write')
    } finally {
      chmodSync(s.home, 0o700)
    }
  })

  it('다 풀지 못하고 남은 같은 버전 폴더(표시 없음)는 치우고 다시 푼다', async () => {
    const s = setup(fakePackage('0.9.0', 'win32'))
    mkdirSync(join(s.home, 'versions', '0.9.0', 'dist'), { recursive: true })
    writeFileSync(join(s.home, 'versions', '0.9.0', 'dist', 'stale.txt'), '지난번 것')
    expect(await install(s)).toBe('ok')
    expect(existsSync(join(s.home, 'versions', '0.9.0', 'dist', 'stale.txt'))).toBe(false)
    expect(leftovers(s.home)).toEqual(['0.9.0'])
  })

  it('배포본 맨 위의 이름 목록은 줄이거나 바꾸지 않는다(이미 깔린 버전이 새 zip을 풀지 못하게 된다)', () => {
    expect([...PACKAGE_TOP]).toEqual(['Framo.exe', 'Framo 시작.bat', 'Framo 시작.command', '사용법.txt', '오픈소스 라이선스.txt', 'package.json', 'dist', 'dist-node', 'node'])
  })
})

describe('버전 폴더 치우기', () => {
  function put(home: string, version: string, { failed = false } = {}) {
    const dir = join(home, 'versions', version)
    for (const f of requiredFiles('win32', 'x64')) {
      mkdirSync(join(dir, ...f.split('/').slice(0, -1)), { recursive: true })
      writeFileSync(join(dir, ...f.split('/')), 'x')
    }
    writeFileSync(join(dir, READY_FILE), JSON.stringify({ format: READY_FORMAT, version }))
    if (failed) writeFileSync(join(dir, FAILED_FILE), '{}')
  }

  it('지금 버전, 바로 앞 버전, 받아 둔 가장 새 버전만 남기고, 풀다 만 것과 지우다 만 것을 치운다', async () => {
    const home = mkdtempSync(join(tmpdir(), 'gyeol-clean-'))
    for (const v of ['0.6.0', '0.8.1', '0.9.0', '0.9.1', '0.10.0', '0.11.0', '0.12.0']) put(home, v)
    mkdirSync(join(home, 'versions', '.part-0.12.0-abcd'))
    mkdirSync(join(home, 'versions', '.trash-1234'))
    await cleanVersions(home, '0.10.0', '0.8.0', 'win32', 'x64')
    expect(readdirSync(join(home, 'versions')).sort()).toEqual(['0.10.0', '0.12.0', '0.9.1'])
  })

  it('앱 폴더의 버전으로 돌 때는 그보다 오래된 버전 폴더를 남기지 않는다', async () => {
    const home = mkdtempSync(join(tmpdir(), 'gyeol-clean-'))
    put(home, '0.7.0')
    put(home, '0.9.0', { failed: true })
    await cleanVersions(home, '0.8.0', '0.8.0', 'win32', 'x64')
    // 켜지지 않았던 0.9.0은 표시를 남겨 두려고 그대로 둔다(다시 풀어 켜지 않게)
    expect(readdirSync(join(home, 'versions'))).toEqual(['0.9.0'])
    expect(newerVersion(home, '0.8.0', 'win32', 'x64')).toMatchObject({ version: '0.9.0', failed: true })
  })
})

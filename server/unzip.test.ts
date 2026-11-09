// 받은 zip 읽기와 풀기. 나쁜 zip(위로 올라가는 이름, 링크, 폭탄, 겹치는 항목, 틀린 CRC)을 직접 만들어 넣는다.

import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { extractZip, readZip, safeName, type ZipEntry, type ZipLimits } from './unzip'
import { makeZip, type FixtureEntry } from './zipFixture'

const LIMITS: ZipLimits = { entries: 100, entryBytes: 1024 * 1024, totalBytes: 4 * 1024 * 1024 }

function tmp() {
  return mkdtempSync(join(tmpdir(), 'gyeol-unzip-'))
}

/** zip 파일을 쓰고 목록을 읽는다 */
async function read(entries: FixtureEntry[] | Buffer, limits = LIMITS) {
  const dir = tmp()
  const file = join(dir, 'a.zip')
  writeFileSync(file, Buffer.isBuffer(entries) ? entries : makeZip(entries))
  return { file, dir, list: await readZip(file, limits) }
}

/** 읽고, 읽혔으면 dir/out에 다 푼다 */
async function unzip(entries: FixtureEntry[] | Buffer, limits = LIMITS) {
  const { file, dir, list } = await read(entries, limits)
  if (typeof list === 'string') return { dir, result: list }
  const out = join(dir, 'out')
  mkdirSync(out)
  const result = await extractZip(file, out, list.map((entry: ZipEntry) => ({ entry, to: entry.name })))
  return { dir, out, result }
}

describe('zip 안의 이름', () => {
  it('정한 폴더 안의 한 자리만 가리키는 이름만 받는다', () => {
    for (const ok of ['gyeol-1.0.0/dist/index.html', '사용법.txt', 'node/arm64/node', 'a/', 'Framo 시작.bat', 'console.log']) expect(safeName(ok)).toBe(true)
    const bad = [
      '',
      '../evil.txt',
      'a/../../evil',
      'a/./b',
      '/etc/passwd',
      'C:/Windows/x',
      'C:x',
      'a\\..\\b',
      'a\\b',
      'a//b',
      'CON',
      'con.txt',
      'a/NUL.json',
      'a/com1',
      'a/LPT¹',
      'a/b.',
      'a/b ',
      'a/b\u0000c',
      'a/b\nc',
      'a/b:stream',
      'a/b?',
      'DIST-N~1/serve.mjs',
      // 대소문자 접기가 OS마다 다른 글자: 긴 s, 점 없는 i, 켈빈 기호, 폭 없는 빈칸, 전각 글자
      'a\u017F',
      'd\u017F/x',
      '\u0131',
      '\u212A',
      'a\u200B',
      '\uFF41.txt',
      'CON .txt',
      'nul.tar.gz',
      ' a.txt',
      'a+b.txt',
      'a@b.txt',
      '\uD55C\u3131.txt',
      '사용법.txt'.normalize('NFD'),
      'x'.repeat(241),
    ]
    for (const name of bad) expect([name, safeName(name)]).toEqual([name, false])
  })
})

describe('zip 읽고 풀기', () => {
  it('보통의 zip: 한글 이름, 압축과 그대로, 빈 파일, 실행 권한까지 그대로 푼다', async () => {
    const big = Buffer.from('지어낸 내용 '.repeat(5000))
    const { out, result } = await unzip([
      { name: 'gyeol-1.0.0/사용법.txt', data: '안내' },
      { name: 'gyeol-1.0.0/dist/app.js', data: big },
      { name: 'gyeol-1.0.0/dist/empty.txt', data: '' },
      { name: 'gyeol-1.0.0/node/arm64/node', data: 'bin', method: 0, mode: 0o100755 },
    ])
    expect(result).toBe('ok')
    expect(readFileSync(join(out!, 'gyeol-1.0.0', '사용법.txt'), 'utf8')).toBe('안내')
    expect(readFileSync(join(out!, 'gyeol-1.0.0', 'dist', 'app.js')).equals(big)).toBe(true)
    expect(readFileSync(join(out!, 'gyeol-1.0.0', 'dist', 'empty.txt')).length).toBe(0)
    if (process.platform !== 'win32') {
      expect(statSync(join(out!, 'gyeol-1.0.0', 'node', 'arm64', 'node')).mode & 0o111).toBe(0o111)
      expect(statSync(join(out!, 'gyeol-1.0.0', '사용법.txt')).mode & 0o111).toBe(0)
    }
  })

  it('zip 끝의 설명 글이 있어도 읽는다', async () => {
    const { list } = await read(makeZip([{ name: 'a.txt', data: 'x' }], { comment: '지어낸 설명' }))
    expect(Array.isArray(list) && list.map((e) => e.name)).toEqual(['a.txt'])
  })

  it('zip-slip: 위로 올라가거나 절대 경로, 드라이브, 역슬래시 이름이 하나라도 있으면 아무것도 풀지 않는다', async () => {
    for (const name of ['../evil.txt', 'gyeol/../../evil.txt', '/tmp/evil.txt', 'C:/evil.txt', 'C:\\evil.txt', 'a\\..\\..\\evil.txt']) {
      const { dir, result } = await unzip([
        { name: 'ok.txt', data: '괜찮은 것' },
        { name, data: '밖으로' },
      ])
      expect([name, result]).toEqual([name, 'unsafe'])
      // 아무 데에도 쓰지 않았다: 시험 폴더에는 zip 하나뿐
      expect(readdirSync(dir)).toEqual(['a.zip'])
    }
  })

  it('푸는 자리도 다시 본다: 위로 올라가는 자리를 넘기면 쓰지 않는다', async () => {
    const { file, dir, list } = await read([{ name: 'a.txt', data: 'x' }])
    if (typeof list === 'string') throw new Error(list)
    mkdirSync(join(dir, 'out'))
    expect(await extractZip(file, join(dir, 'out'), [{ entry: list[0], to: '../escaped.txt' }])).toBe('unsafe')
    expect(existsSync(join(dir, 'escaped.txt'))).toBe(false)
  })

  it('심볼릭 링크, 장치 같은 항목, 윈도우의 재분석 지점은 받지 않는다', async () => {
    expect((await read([{ name: 'link', data: '/etc/passwd', mode: 0o120777 }])).list).toBe('unsafe')
    expect((await read([{ name: 'fifo', data: '', mode: 0o010644 }])).list).toBe('unsafe')
    expect((await read([{ name: 'link', data: 'x', host: 0, external: 0x400 }])).list).toBe('unsafe')
    // 종류와 이름이 서로 다른 말을 하는 것
    expect((await read([{ name: 'a', data: '', mode: 0o040755 }])).list).toBe('unsafe')
  })

  it('대소문자만 다른 같은 이름, 파일 이름이 다른 항목의 폴더 자리인 것은 받지 않는다', async () => {
    expect((await read([{ name: 'a/B.txt', data: '1' }, { name: 'a/b.txt', data: '2' }])).list).toBe('unsafe')
    expect((await read([{ name: 'a', data: '1' }, { name: 'a/b', data: '2' }])).list).toBe('unsafe')
    expect((await read([{ name: 'A', data: '1' }, { name: 'a/b', data: '2' }])).list).toBe('unsafe')
    // 폴더 항목과 그 안의 파일은 괜찮다
    expect(Array.isArray((await read([{ name: 'a/' }, { name: 'a/b', data: '2' }])).list)).toBe(true)
  })

  it('폭탄: 항목 수, 항목 하나, 풀린 전체가 상한을 넘으면 풀기 전에 멈춘다', async () => {
    const many = Array.from({ length: 101 }, (_, i) => ({ name: `f${i}.txt`, data: 'x' }))
    expect((await read(many)).list).toBe('too_big')
    expect((await read([{ name: 'big.bin', data: Buffer.alloc(LIMITS.entryBytes + 1) }])).list).toBe('too_big')
    const parts = Array.from({ length: 5 }, (_, i) => ({ name: `p${i}.bin`, data: Buffer.alloc(LIMITS.entryBytes) }))
    expect((await read(parts)).list).toBe('too_big')
  })

  it('폭탄: 알려 준 크기보다 많이 풀려 나오면 그 순간 멈춘다', async () => {
    // 32MB의 0을 1KB라고 적었다(압축하면 몇십 KB)
    const zeros = Buffer.alloc(32 * 1024 * 1024)
    const { out, result } = await unzip([{ name: 'bomb.bin', data: zeros, size: 1024, crc: 0 }])
    expect(result).toBe('too_big')
    // 상한을 조금 넘긴 데서 멈췄다(zlib 한 조각 안)
    const written = existsSync(join(out!, 'bomb.bin')) ? statSync(join(out!, 'bomb.bin')).size : 0
    expect(written).toBeLessThanOrEqual(1024)
  })

  it('겹치는 항목: 한 항목의 내용 안에 다른 항목의 머리를 숨긴 zip은 받지 않는다', async () => {
    // b의 앞 머리와 내용을 a의 내용으로 넣고, 목록에서 b가 그 안을 가리키게 한다(같은 바이트를 두 번 풀게 하는 꼴)
    const inner = makeZip([{ name: 'b', data: 'BBBB', method: 0 }])
    const innerLocal = inner.subarray(0, 30 + 1 + 4)
    const zip = makeZip([
      { name: 'a', data: innerLocal, method: 0 },
      { name: 'b', data: 'BBBB', method: 0, offset: 30 + 1 },
    ])
    expect((await read(zip)).list).toBe('format')
  })

  it('CRC나 크기가 맞지 않으면 실패로 알린다', async () => {
    expect((await unzip([{ name: 'a.txt', data: '내용', crc: 12345 }])).result).toBe('format')
    expect((await unzip([{ name: 'a.txt', data: '내용이 긴 글', size: 3, method: 8 }])).result).toBe('too_big')
    expect((await unzip([{ name: 'a.txt', data: '짧음', size: 100, method: 8 }])).result).toBe('format')
  })

  it('암호, 모르는 압축 방식, ZIP64, 앞 머리가 목록과 다른 zip, zip이 아닌 파일은 읽지 않는다', async () => {
    expect((await read([{ name: 'a.txt', data: 'x', flags: (1 << 11) | 1 }])).list).toBe('format')
    expect((await read([{ name: 'a.txt', data: 'x', method: 12, raw: Buffer.from('x') }])).list).toBe('format')
    expect((await read([{ name: 'a.txt', data: 'x', size: 0xffffffff }])).list).toBe('format')
    expect((await read([{ name: 'a.txt', data: 'x', localName: 'b.txt' }])).list).toBe('format')
    expect((await read(Buffer.from('zip이 아니에요'))).list).toBe('format')
    const ok = makeZip([{ name: 'a.txt', data: 'x' }])
    expect((await read(ok.subarray(0, ok.length - 5))).list).toBe('format')
    // UTF-8 표시 없이 영문이 아닌 이름(옛 코드 페이지)
    expect((await read([{ name: '한글.txt', data: 'x', flags: 0 }])).list).toBe('format')
  })

  it('쓰지 못하는 폴더면 write로 알린다', async () => {
    if (process.platform === 'win32' || process.getuid?.() === 0) return
    const { file, dir, list } = await read([{ name: 'a/b.txt', data: 'x' }])
    if (typeof list === 'string') throw new Error(list)
    const out = join(dir, 'locked')
    mkdirSync(out)
    chmodSync(out, 0o500)
    try {
      expect(await extractZip(file, out, [{ entry: list[0], to: 'a/b.txt' }])).toBe('write')
    } finally {
      chmodSync(out, 0o700)
    }
  })
})

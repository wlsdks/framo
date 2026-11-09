// 시험용 zip 만들기. 배포본 zip(scripts/zip.mjs)과 같은 꼴을 기본으로, 항목마다 머리를 일부러 비틀 수 있다(나쁜 zip을 만들려고).
// 새 버전 풀기 시험(unzip, install, updateRoutes)이 같이 쓴다. 배포본에는 들어가지 않는다.

import { generateKeyPairSync, sign } from 'node:crypto'
import { lstatSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { crc32, deflateRawSync } from 'node:zlib'
import { FAILED_FILE, READY_FILE, writeReady } from './versions'

const UTF8 = 1 << 11

export interface FixtureEntry {
  name: string
  data?: Buffer | string
  /** 0 그대로, 8 압축(기본) */
  method?: number
  /** 유닉스 종류와 권한. 기본은 일반 파일 0o100644, 이름이 /로 끝나면 폴더 */
  mode?: number
  /** 만든 곳: 3 유닉스(기본), 0 윈도우 */
  host?: number
  /** 바깥 속성을 통째로 */
  external?: number
  flags?: number
  /** 목록에 적을 크기, CRC를 비튼다 */
  size?: number
  crc?: number
  /** 앞 머리에 적을 이름(목록과 다르게) */
  localName?: string
  /** 앞 머리 자리를 통째로 다른 곳으로(겹치는 항목) */
  offset?: number
  /** 내용을 이것으로 바꿔 넣는다(압축하지 않고 그대로) */
  raw?: Buffer
}

/** 항목들로 zip 하나. 목록 차례는 항목 차례 */
export function makeZip(entries: FixtureEntry[], { comment = '' } = {}): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  for (const e of entries) {
    const data = typeof e.data === 'string' ? Buffer.from(e.data) : (e.data ?? Buffer.alloc(0))
    const method = e.method ?? (data.length ? 8 : 0)
    const body = e.raw ?? (method === 8 ? deflateRawSync(data) : data)
    const name = Buffer.from(e.name, 'utf8')
    const localName = Buffer.from(e.localName ?? e.name, 'utf8')
    const crc = e.crc ?? crc32(data)
    const size = e.size ?? data.length
    const flags = e.flags ?? UTF8
    const dir = e.name.endsWith('/')
    const mode = e.mode ?? (dir ? 0o040755 : 0o100644)
    const host = e.host ?? 3
    const external = e.external ?? (host === 3 ? (mode << 16) >>> 0 : dir ? 0x10 : 0)

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(flags, 6)
    local.writeUInt16LE(method, 8)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(body.length, 18)
    local.writeUInt32LE(size, 22)
    local.writeUInt16LE(localName.length, 26)
    const at = e.offset ?? offset
    if (e.offset === undefined) {
      locals.push(local, localName, body)
      offset += 30 + localName.length + body.length
    }

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE((host << 8) | 20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(flags, 8)
    central.writeUInt16LE(method, 10)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(body.length, 20)
    central.writeUInt32LE(size, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE(external, 38)
    central.writeUInt32LE(at, 42)
    centrals.push(central, name)
  }
  const cd = Buffer.concat(centrals)
  const note = Buffer.from(comment)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(cd.length, 12)
  end.writeUInt32LE(offset, 16)
  end.writeUInt16LE(note.length, 20)
  return Buffer.concat([...locals, cd, end, note])
}

/**
 * 지어낸 배포본 zip(맨 위 gyeol-<버전>/). 켜는 데 쓸 파일은 다 있고 내용은 짧은 글이다.
 * 맥이면 node에 실행 권한을 붙인다. over로 항목을 더하거나(이름이 같으면 바꾸고) 뺀다(null)
 */
export function fakePackage(version: string, platform: 'win32' | 'darwin', over: Record<string, string | null> = {}): Buffer {
  const files: Record<string, string | null> = {
    'package.json': JSON.stringify({ name: 'gyeol', version, private: true, type: 'module' }),
    'dist/index.html': '<!doctype html><title>Framo</title>',
    'dist/assets/app.js': 'console.log("지어낸 화면")\n'.repeat(50),
    'dist-node/serve.mjs': 'export {}\n',
    'dist-node/gyeol-mcp.mjs': 'export {}\n',
    'dist-node/launch.mjs': 'export {}\n',
    '사용법.txt': '지어낸 안내',
    ...(platform === 'win32'
      ? { 'Framo.exe': 'MZ지어낸 실행 파일', 'Framo 시작.bat': '@echo off', 'node/node.exe': 'MZ지어낸 node' }
      : { 'Framo 시작.command': '#!/bin/bash', 'node/arm64/node': '지어낸 node', 'node/x64/node': '지어낸 node' }),
    ...over,
  }
  const entries: FixtureEntry[] = Object.entries(files)
    .filter((e): e is [string, string] => e[1] !== null)
    .map(([name, data]) => ({ name: `gyeol-${version}/${name}`, data, mode: /node\/(arm64|x64)\/node$|\.command$/.test(name) ? 0o100755 : 0o100644 }))
  return makeZip(entries)
}

/** 손으로 만든 버전 폴더에 준비 표시를 쓴다. 폴더 안의 파일(표시 파일은 빼고)마다의 크기를 적는다 */
export function markReady(dir: string, version: string) {
  const files: Record<string, number> = {}
  const walk = (at: string) => {
    for (const n of readdirSync(at)) {
      const p = join(at, n)
      if (lstatSync(p).isDirectory()) walk(p)
      else if (n !== READY_FILE && n !== FAILED_FILE) files[relative(dir, p).split(sep).join('/')] = lstatSync(p).size
    }
  }
  walk(dir)
  writeReady(dir, version, files)
}

/** 시험용 서명 키: 앱에 넣을 꼴의 공개 키와, 지문 목록에 서명(SHA256SUMS.txt.sig의 꼴)하는 함수 */
export function testKey() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  return {
    pub: Buffer.from(publicKey.export({ format: 'jwk' }).x as string, 'base64url').toString('base64'),
    pem: privateKey.export({ type: 'pkcs8', format: 'pem' }) as string,
    sign: (data: Buffer | string) => `${sign(null, Buffer.from(data), privateKey).toString('base64')}\n`,
  }
}

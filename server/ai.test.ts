import { existsSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { REQUEST_FORMAT, REQUEST_VERSION } from '../src/ai/protocol'
import { ensureShareDir, pendingRequests, pruneResults, writeResult, type ShareDirs } from './ai'
import { readJson } from './shareFiles'

// 'AI 공유' 폴더는 AI(Claude Code, Codex)도 쓰는 곳이다. 누가 그 안에 폴더 밖으로 가는 링크를 만들어 두어도
// 로컬 서버가 링크를 따라가 밖의 파일을 읽거나 지우면 안 된다. 서버는 꼴이 맞지 않는 제안과 지난 결과를 지운다.

let base: string
let root: string
let dirs: ShareDirs
/** 'AI 공유' 폴더 밖. 사용자의 다른 파일이 있는 곳 */
let outside: string

const DECK = 'd0123abcd'
const request = (id: string) => ({ format: REQUEST_FORMAT, version: REQUEST_VERSION, id, deck: DECK, createdAt: 1, note: '', ops: [{ op: 'set_hidden', slide: 's0123abcd', hidden: true }] })
const json = (v: unknown) => JSON.stringify(v)
/** 폴더를 가리키는 링크. 윈도우에서는 관리자 권한이 없어도 되는 정션으로 만든다 */
const linkDir = (target: string, path: string) => {
  rmSync(path, { recursive: true, force: true })
  symlinkSync(target, path, 'junction')
}

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'gyeol-ai-'))
  root = join(base, 'AI 공유')
  dirs = ensureShareDir(root)
  outside = join(base, '내 문서')
  mkdirSync(outside)
  // 이레 넘게 지난 파일과, 제안의 꼴이 아닌 JSON
  writeFileSync(join(outside, '지난 보고.txt'), '지어낸 내용')
  const old = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  utimesSync(join(outside, '지난 보고.txt'), old, old)
  writeFileSync(join(outside, '설정.json'), json({ a: 1 }))
})

afterEach(() => rmSync(base, { recursive: true, force: true }))

describe("'AI 공유' 폴더 안의 링크", () => {
  it('하위 폴더가 링크면 따라가 밖의 파일을 지우지 않는다', () => {
    linkDir(outside, dirs.results)
    pruneResults(dirs)
    linkDir(outside, dirs.requests)
    expect(pendingRequests(dirs)).toEqual([])
    expect(readdirSync(outside).sort()).toEqual(['설정.json', '지난 보고.txt'])
  })

  it('하위 폴더가 링크면 밖에 쓰지 않고, 링크만 지운 뒤 진짜 폴더를 만들어 쓴다', () => {
    linkDir(outside, dirs.results)
    writeResult(dirs, 'r0123456789ab', 'rejected', [])
    expect(readdirSync(outside).sort()).toEqual(['설정.json', '지난 보고.txt'])
    expect(lstatSync(dirs.results).isSymbolicLink()).toBe(false)
    expect(readdirSync(dirs.results)).toEqual(['r0123456789ab.json'])

    linkDir(outside, dirs.decks)
    ensureShareDir(root)
    expect(lstatSync(dirs.decks).isDirectory()).toBe(true)
    expect(readdirSync(outside).sort()).toEqual(['설정.json', '지난 보고.txt'])
  })

  it('링크인 폴더 안의 파일은 읽지 않는다 (MCP 서버도 같은 것으로 읽는다)', () => {
    // 파일의 실제 위치는 폴더(가 가리키는 곳) 안이라 실제 위치 확인만으로는 걸리지 않는다
    expect(readJson(join(outside, '설정.json'))).toEqual({ a: 1 })
    linkDir(outside, dirs.decks)
    expect(readJson(join(dirs.decks, '설정.json'))).toBeUndefined()
  })

  it('제안은 폴더 안의 진짜 파일만 읽고, 링크는 링크만 지운다', () => {
    // 심볼릭 링크, 하드 링크(다른 이름이 또 있는 파일), 너무 큰 파일은 꼴이 맞아도 읽지 않는다
    writeFileSync(join(outside, 'a.json'), json(request('r0123456789ab')))
    symlinkSync(join(outside, 'a.json'), join(dirs.requests, 'r0123456789ab.json'))
    writeFileSync(join(outside, 'b.json'), json(request('r111111111111')))
    linkSync(join(outside, 'b.json'), join(dirs.requests, 'r111111111111.json'))
    writeFileSync(join(dirs.requests, 'r222222222222.json'), json(request('r222222222222')) + ' '.repeat(2 * 1024 * 1024))
    // 같은 이름의 폴더는 지우지 못한다. 예전에는 여기서 던져 제안 목록이 늘 500이었다
    mkdirSync(join(dirs.requests, 'r333333333333.json'))
    writeFileSync(join(dirs.requests, 'r444444444444.json'), json(request('r444444444444')))

    expect(pendingRequests(dirs).map((r) => r.id)).toEqual(['r444444444444'])
    expect(readdirSync(dirs.requests).sort()).toEqual(['r333333333333.json', 'r444444444444.json'])
    expect(existsSync(join(outside, 'a.json')) && existsSync(join(outside, 'b.json'))).toBe(true)
  })
})

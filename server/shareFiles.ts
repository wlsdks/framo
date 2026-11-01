// 'AI 공유' 폴더의 파일을 읽기 전에 보는 것. 로컬 서버(server/ai.ts)와 MCP 서버(mcp/server.ts)가 같이 쓴다.
//
// 그 폴더는 AI(Claude Code, Codex)도 쓰는 곳이라, 누가 폴더 밖으로 가는 링크를 만들어 둘 수 있다.
// 링크를 따라가면 MCP 서버는 밖의 파일을 AI에게 보이게 되고, 로컬 서버는 밖의 파일을 지우게 된다
// (꼴이 맞지 않는 제안과 지난 결과를 지운다). Node 권한 모델도 링크를 따라가 버리므로 여기서 막는다.

import { lstatSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, sep } from 'node:path'

/** 모양, 제안, 결과 파일은 이보다 훨씬 작다. 큰 파일을 통째로 읽어 서버가 멈추지 않게 */
export const MAX_SHARE_FILE = 2 * 1024 * 1024

/** 링크가 아닌 진짜 폴더인지 */
export function realDir(dir: string): boolean {
  try {
    return lstatSync(dir).isDirectory()
  } catch {
    return false
  }
}

/**
 * 진짜 폴더 안의 진짜 파일만 JSON으로 읽는다. 읽지 않으면 undefined.
 * 폴더가 링크인 것, 심볼릭 링크, 하드 링크(다른 이름이 또 있는 파일), 실제 위치가 폴더 밖인 것,
 * 너무 큰 것, 파일이 아닌 것(이름 붙은 파이프는 읽는 동안 서버를 멈춘다)은 읽지 않는다.
 */
export function readJson(file: string): unknown {
  try {
    if (!realDir(dirname(file))) return undefined
    const st = lstatSync(file)
    if (!st.isFile() || st.nlink > 1 || st.size > MAX_SHARE_FILE) return undefined
    if (!realpathSync.native(file).startsWith(realpathSync.native(dirname(file)) + sep)) return undefined
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return undefined
  }
}

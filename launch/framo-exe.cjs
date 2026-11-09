// Framo.exe의 몸통. scripts/exe.mjs가 Node.js 단일 실행 파일(SEA)로 공식 node.exe에 넣는다.
//
// 서버 코드는 넣지 않고, 옆에 같이 든 시작 프로그램(dist-node/launch.mjs)을 불러 켠다. 시작 프로그램이 켤 버전을 고르고
// (받아서 풀어 둔 새 버전이 있으면 그것, 없으면 이 폴더의 것) 그 버전의 node로 서버를 띄운다.
// - 'Framo 시작.bat'과 맥의 .command도 같은 시작 프로그램을 node로 켜므로, 어느 쪽으로 켜도 같은 길로 같은 서버 하나만 돈다.
// - 화면(dist), MCP 서버(dist-node/gyeol-mcp.mjs)는 어차피 폴더에 있어야 해서 exe에 넣어도 줄어드는 것이 없다.
// - 서버와 AI(MCP) 서버는 이 exe가 아니라 같이 든 node\node.exe로 띄운다. MCP 서버는 스스로를 Node 권한 모델(--permission)
//   안에서 다시 띄우는데, 그 길을 그대로 두려고 시작 프로그램에 node.exe 경로를 넘긴다.
//
// 이 코드는 한 번 나눠 주면 바꿀 수 없다(새 버전은 versions\ 안에 풀리고, 처음 푼 Framo.exe를 계속 누른다).
// 그래서 시작 프로그램을 부르는 일만 하고, 버전 고르기와 다시 켜기는 시작 프로그램에 둔다.
//
// 창은 콘솔 창 그대로 둔다. 켜져 있다는 것, 닫으면 꺼진다는 것, 켜지 못한 이유를 보여 주는 곳이라서다.
// SEA의 첫 파일은 CommonJS여야 하고, require는 내장 모듈만 부른다. 그래서 createRequire로 옆의 파일을 부른다.

'use strict'

const { existsSync } = require('node:fs')
const { createRequire } = require('node:module')
const { dirname, join } = require('node:path')

const root = dirname(process.execPath)
const launch = join(root, 'dist-node', 'launch.mjs')

/** 켜지 못한 이유를 보여 주고, 키를 누를 때까지 창을 남긴다 (launch.ts의 pause와 같게) */
function fail(message) {
  console.error(`\n  ${message}\n`)
  if (process.stdin.isTTY) {
    console.error('  아무 키나 누르면 이 창이 닫혀요.')
    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdin.once('data', () => process.exit(1))
    return
  }
  process.exit(1)
}

function start() {
  // 인자를 받는 실행 파일이 아니다. 누가 이 exe를 MCP 서버 자리에 적으면 서버를 켜는 대신 끝낸다
  // (stdout에는 쓰지 않는다. MCP는 stdout을 말로 읽는다)
  if (process.argv.length > 2) {
    process.stderr.write('Framo.exe는 인자 없이 두 번 눌러 켜요.\n')
    process.exit(1)
  }
  process.title = 'Framo - 이 창을 닫으면 꺼져요'
  // 탐색기에서 zip을 풀지 않고 안의 exe를 누르면 exe 하나만 임시 폴더로 꺼내져 실행된다
  if (!existsSync(launch)) return fail('화면 파일이 없어요. zip 파일 안에서 바로 실행하지 말고, 먼저 "압축 풀기"를 한 다음 풀린 폴더에서 다시 실행해 주세요.')
  let app
  try {
    app = createRequire(launch)(launch)
  } catch {
    return fail('Framo를 켜지 못했어요. 받은 zip 파일을 통째로 다시 풀어 주세요.')
  }
  app.main({ node: join(root, 'node', 'node.exe') })
}

start()

#!/usr/bin/env node
// Claude Code 훅(PreToolUse, Bash): git commit이나 git push 전에, 저장소에 올리면 안 되는 파일이 섞이지 않았는지 본다.
// 부탁받아 만든 발표(.deck, 내보낸 발표, 'Framo 발표' 폴더)와 AI 공유 폴더, 브라우저 자동화의 결과물은 실제 업무 자료일 수 있다
// (AGENTS.md '꼭 지킬 것' 5). 걸리면 2로 끝내 그 명령을 막고, 까닭을 stderr로 알린다.

import { execFileSync } from 'node:child_process'

let input = ''
for await (const chunk of process.stdin) input += chunk
let command = ''
try {
  command = JSON.parse(input).tool_input?.command ?? ''
} catch {
  process.exit(0)
}
const commit = /\bgit\b[^\n;&|]*\bcommit\b/.test(command)
const push = /\bgit\b[^\n;&|]*\bpush\b/.test(command)
if (!commit && !push) process.exit(0)

const git = (...args) => {
  try {
    return execFileSync('git', args, { cwd: process.env.CLAUDE_PROJECT_DIR || process.cwd(), encoding: 'utf8' })
  } catch {
    return ''
  }
}

/** 올리면 안 되는 경로와 그 까닭 */
const FORBIDDEN = [
  [/\.deck$/i, '발표 작업 파일(.deck)'],
  [/Framo 발표\//, "부탁받아 만든 발표('Framo 발표' 폴더)"],
  [/(^|\/)AI 공유\//, 'AI 공유 폴더'],
  [/(^|\/)\.playwright-mcp\//, '브라우저 자동화 결과물'],
  [/(^|\/)(release|새 버전)\//, '배포본이나 받은 새 버전'],
  [/(^|\/)\.claude\/(worktrees\/|settings\.local\.json)/, '개인 하네스 설정이나 에이전트 작업 폴더'],
]

// commit은 올릴 차례에 든 파일(-a면 고친 파일 전부), push는 원격에 없는 커밋들의 파일
const files = new Set()
if (commit) {
  for (const f of git('diff', '--cached', '--name-only').split('\n')) if (f) files.add(f)
  if (/\scommit\b[^\n]*\s-(a|[a-zA-Z]*a[a-zA-Z]*)\b|--all\b/.test(command)) for (const f of git('diff', '--name-only').split('\n')) if (f) files.add(f)
}
if (push) for (const f of git('log', '@{upstream}..HEAD', '--name-only', '--format=').split('\n')) if (f) files.add(f)

const bad = [...files].flatMap((f) => FORBIDDEN.filter(([re]) => re.test(f)).map(([, why]) => `${f} — ${why}`))
if (bad.length) {
  process.stderr.write(`저장소에 올리면 안 되는 파일이 있어요(AGENTS.md '꼭 지킬 것' 5):\n${bad.join('\n')}\n올릴 차례에서 빼고(git restore --staged <파일>) 다시 해 주세요.\n`)
  process.exit(2)
}

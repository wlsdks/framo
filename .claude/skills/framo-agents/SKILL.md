---
name: framo-agents
description: Framo 작업을 서브 에이전트에게 나눠 맡기고 결과를 검토해 합치는 법. 각자 worktree에서 일하게 하는 브리프 틀, 겹치지 않게 나누는 법, 브라우저 쓰는 법, 감성 검수 리뷰어, 합치기 순서. "에이전트로 나눠서", "병렬로", "서브 에이전트"에 쓴다.
---

# 서브 에이전트로 나눠 일하기

## 나누는 법

- 서로 다른 파일을 고치는 일끼리만 동시에 돌린다. 겹치면 한쪽에 "이 경로는 건드리지 말고 보고만" 목록을 준다. 자주 겹치는 곳은 `src/motion/engine.ts`, `src/slides/blocks/**`, `src/slides/styles/blocks/**`, `src/deck/blocks/**`, `src/screens/**`, `src/styles/**`다.
- 고치는 에이전트는 `isolation: worktree`로 띄우고, **원격에 올리거나 main에 합치지 말라고** 적는다. 합치기는 내가 검토한 뒤에 한다.
- 조사나 설계만 하는 일은 코드를 고치지 않는 에이전트(Plan 같은)로 띄운다.
- 감성 검수는 만든 에이전트가 아닌 `framo-reviewer`에게 그림만 주고 맡긴다(`/framo-review`).

## 브리프에 꼭 넣을 것

1. 목표와 쓰는 사람의 말(그대로), 우선순위.
2. 먼저 읽을 것: `AGENTS.md`(맨 앞의 가치, 꼭 지킬 것, 디자인, 커밋), 일에 맞는 `docs/*.md`, 관련 스킬(`.claude/skills/`).
3. 쓰는 사람의 취향 요약(싫다고 한 것들). `/framo-review`의 목록을 가리켜도 된다.
4. 환경:
   - worktree에서 **`npm ci`를 먼저**. node_modules를 심볼릭 링크로 걸면 Vite가 worktree 밖의 글꼴을 내주지 않아 스크린샷과 검사가 모두 틀린다.
   - 개발 서버는 에이전트마다 다른 포트: `npx vite --port 52xx --strictPort`. 주소는 `http://localhost:52xx/`(127.0.0.1이 아니라).
   - 브라우저는 **`npm run look -- … --base http://localhost:52xx`**(창 없는 크롬, 매번 빈 임시 프로필)만 쓴다. MCP 브라우저 도구(Playwright, chrome-devtools, claude-in-chrome)는 다른 에이전트, 나와 겹치거나 쓰는 사람의 화면에 창을 띄우므로 쓰지 않는다. 쓰는 사람의 모니터, 개인 크롬은 절대 찍지 않는다.
   - 임시 파일은 `/private/tmp/claude-501/-Users-stark-dev-gyeol/agent-<이름>/` 같은 저장소 밖 폴더에.
5. 규칙: 새 의존성 금지, 바깥 코드 옮기기 금지, 예시는 지어낸 것, 실제 업무 자료 금지, 쓰지 않게 된 것은 지우기.
6. 커밋: `/framo-commit`의 꼴(한국어, 한 가지, 끝 두 줄), worktree 브랜치에만.
7. 돌려받을 것: 브랜치, 커밋 목록(해시와 한 줄), 전후 그림 경로, 남은 문제(순서대로), 쓰는 사람이 정할 것.

## 돌아온 뒤 합치기

1. 커밋마다 diff를 읽고, 그림을 직접 열어 보고, 필요하면 `framo-reviewer`에게 감성 검수를 맡긴다. 대표 장만 보지 않는다.
2. 겹치는 파일이 많은 쪽을 나중에 합친다. 합칠 때마다 `npm run typecheck && npm test`와 해당 `npm run look -- check/frame`.
3. 정리 에이전트가 남긴 '정리 대기' 허용 목록은 다른 작업을 다 합친 뒤에 지운다.
4. 합친 뒤 올리고(`/framo-commit`), CI를 끝까지 본다. worktree는 정리한다.

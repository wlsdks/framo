---
name: framo-commit
description: Framo의 커밋과 올리기. 한 커밋에 한 가지, 한국어 '종류: 무엇을 했는지', 본문에 왜, 검수를 마친 것만, 부탁받은 발표 자료는 절대 올리지 않기. 커밋하거나 원격(origin main)에 올릴 때 쓴다.
---

# 커밋하고 올리기

## 전에

1. `/framo-verify`를 통과했는지 본다. 통과하지 않은 것은 커밋하지 않는다.
2. `git status --short`로 올릴 파일을 본다. **부탁받아 만든 발표(.deck, 내보낸 발표 HTML, `~/Documents/Framo 발표/`)와 실제 업무 자료는 절대 올리지 않는다.** 훅(`.claude/hooks/guard-commit.mjs`)이 한 번 더 막지만 훅에 기대지 않는다.
3. 여러 일을 같이 했으면 파일이나 덩어리 단위로 나눠 각각 커밋한다. 그 일의 문서(DESIGN.md, MOTION.md 같은)는 같은 커밋에 넣는다.

## 메시지

- 첫 줄: `종류: 무엇을 했는지`. 한국어, 50자 안팎, 마침표 없이. 종류는 feat, fix, refactor, perf, test, docs, chore(AGENTS.md '커밋' 표).
  - 좋은 예: `fix: 사례 장의 대상 이름이 작고 숫자 없는 사례의 판이 비던 것`
- 본문: 무엇이 문제였고 왜 이렇게 고쳤는지. 어떻게는 코드에 있다. 실제 업무 자료(회사, 사람, 숫자)를 넣지 않는다.
- 끝에 붙이는 두 줄(세션이 정해 주는 대로):

```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: <이 세션의 주소>
```

여러 줄 메시지는 `git commit -F -`와 heredoc으로 넘긴다.

## 올리기

- 검수를 마친 커밋은 쌓아 두지 않고 `git push origin main`으로 올린다. 강제로 올리지 않는다(`--force` 금지).
- 워크플로(.github)나 배포에 닿는 것을 바꿨으면 `gh run list`로 검수(CI)를 끝까지 본다. 실패하면 그것부터 고친다(`gh run view <id> --log-failed`).
- 홍보 페이지(`site/`)를 바꿨으면 `git subtree push --prefix site origin gh-pages`.

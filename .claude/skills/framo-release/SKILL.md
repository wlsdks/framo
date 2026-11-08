---
name: framo-release
description: Framo의 새 버전 내놓기(태그, GitHub 릴리스, 예전 버전 견본 파일, 홍보 페이지 갱신)와 홍보 페이지만 고쳐 올리기. "릴리스", "새 버전 내기", "배포", "홍보 페이지 올리기"에 쓴다.
---

# 새 버전 내놓기

## 1. 내놓기 전

1. `/framo-verify`를 모두 통과했고 main이 원격과 같다(`git status`, `git log origin/main..HEAD`가 비어 있음). 최근 검수(CI)가 초록인지 `gh run list --limit 3`.
2. **Node.js 판:** 묶기(`npm run pack`)가 nodejs.org 릴리스 목록을 보고, 같은 주 버전에 더 새 보안 수정판이 있으면 멈춘다. 멈추면 `scripts/pack.mjs`의 `NODE_VERSION`을 그 판 이상(LTS)으로 올리고 `docs/OPEN-SOURCE.md`도 고친다.
3. `npm audit`가 0인지, 새 패키지를 넣었으면 `npm run licenses`와 `docs/OPEN-SOURCE.md`.

## 2. 버전 올리기와 태그

1. `package.json`의 `version`을 올린다(`npm version`을 쓰지 말고 직접 고쳐 lockfile과 같이). 커밋: `chore: 0.X.Y 내놓기`.
2. **예전 버전 견본 파일:** 이번 버전으로 만든 발표를 `src/deck/fixtures/deck-v<버전>.json`으로 더한다. 들어갈 것: 예시 발표, 장 모음, 컴포넌트마다 한 장, 발표 종류마다 프레임 잡기로 만든 발표, 고를 수 있는 값을 모두 고른 발표(`chosen`). 이미지는 1px로 바꾼다. 앞 버전의 파일과 같은 꼴로 만든다(만드는 일회용 vitest 파일로 만들고 지운다). `src/deck/oldDecks.test.ts`가 지금 버전이 그대로 여는지 본다.
3. `git tag vX.Y.Z && git push origin vX.Y.Z` → `.github/workflows/release.yml`이 검수를 다시 다 돌리고, 윈도우에서 켜 본 zip 둘과 `SHA256SUMS.txt`를 릴리스에 올린다. `gh run watch`로 끝까지 본다.

## 3. 홍보 페이지

- 다운로드 구역의 버전, 날짜, 파일 크기를 고친다(`scripts/site.test.ts`가 버전을 확인).
- 화면 그림을 바꿨으면 지금 앱으로 다시 찍는다. 예시 발표(지어낸 회사와 숫자)만 쓴다. 맨 위 그림은 2400×1500(1280×800을 1.875배), 휴대폰 그림은 슬라이드만 1000×579. `npm run look -- shot`이나 브라우저 자동화로 찍고 `framo-reviewer`에게 사람의 눈으로 보인다.
- 올리기: `git subtree push --prefix site origin gh-pages` → https://wlsdks.github.io/framo/ 가 200인지 본다.

## 이름에 대해

화면, 홍보 페이지, 안내 글의 이름은 **Framo**, 저장소는 `wlsdks/framo`다. 기계가 읽는 이름(패키지 `gyeol`, MCP id `gyeol`, `release/gyeol-*.zip`, 저장 형식)은 바꾸지 않는다. 바꾸면 이미 연결한 AI 설정과 받기 주소가 끊긴다.

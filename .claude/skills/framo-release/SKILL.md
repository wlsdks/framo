---
name: framo-release
description: Framo의 새 버전 내놓기(태그, GitHub 릴리스, 예전 버전 견본 파일, 홍보 페이지 갱신)와 홍보 페이지만 고쳐 올리기. "릴리스", "새 버전 내기", "배포", "홍보 페이지 올리기"에 쓴다.
---

# 새 버전 내놓기

## 1. 내놓기 전

1. `/framo-verify`를 모두 통과했고 main이 원격과 같다(`git status`, `git log origin/main..HEAD`가 비어 있음). 최근 검수(CI)가 초록인지 `gh run list --limit 3`.
2. **Node.js 판:** 묶기(`npm run pack`)가 nodejs.org 릴리스 목록을 보고, 같은 주 버전에 더 새 보안 수정판이 있으면 멈춘다. 멈추면 `scripts/pack.mjs`의 `NODE_VERSION`을 그 판 이상(LTS)으로 올리고 `docs/OPEN-SOURCE.md`도 고친다.
3. `npm audit`가 0인지, 새 패키지를 넣었으면 `npm run licenses`와 `docs/OPEN-SOURCE.md`.

## 처음 한 번: 릴리스 서명 키

앱은 받은 새 버전을 자동으로 풀기 전에 `SHA256SUMS.txt`의 Ed25519 서명을 앱에 든 공개 키로 확인한다(`server/signature.ts`). GitHub의 지문은 올라온 파일로 셈한 값이라, 릴리스 권한이 털려도 이 서명은 흉내 낼 수 없다.

1. 관리하는 PC에서 `npm run release-key` → 비밀 키가 `~/.config/framo/release-signing-key.pem`(권한 600, 저장소 밖)에 생기고 공개 키가 보인다. 이미 있으면 덮지 않는다.
2. 그 공개 키를 `server/releaseKey.ts`의 `RELEASE_KEYS`에 넣어 커밋한다(`feat: 릴리스 서명 공개 키 넣기`). 비어 있으면 릴리스 워크플로가 멈춘다.
3. 비밀 키는 GitHub Actions의 비밀 값에도, 저장소에도, 다른 PC에도 넣지 않는다. 안전한 곳에 따로 백업한다(잃으면 이미 깔린 버전은 새 서명을 믿지 못해 사람이 직접 풀어야 한다).
4. 키를 바꿀 때: 새 공개 키를 `RELEASE_KEYS`에 더한 버전을 옛 키로 서명해 내놓고, 충분히 퍼진 뒤에 옛 키를 뺀다.

## 2. 버전 올리기와 태그

1. `package.json`의 `version`을 올린다(`npm version`을 쓰지 말고 직접 고쳐 lockfile과 같이). 커밋: `chore: 0.X.Y 내놓기`.
2. **예전 버전 견본 파일:** 이번 버전으로 만든 발표를 `src/deck/fixtures/deck-v<버전>.json`으로 더한다. 들어갈 것: 예시 발표, 장 모음, 컴포넌트마다 한 장, 발표 종류마다 프레임 잡기로 만든 발표, 고를 수 있는 값을 모두 고른 발표(`chosen`). 이미지는 1px로 바꾼다. 앞 버전의 파일과 같은 꼴로 만든다(만드는 일회용 vitest 파일로 만들고 지운다). `src/deck/oldDecks.test.ts`가 지금 버전이 그대로 여는지 본다.
3. `git tag vX.Y.Z && git push origin vX.Y.Z` → `.github/workflows/release.yml`이 검수를 다시 다 돌리고, 윈도우에서 켜 본 zip 둘과 `SHA256SUMS.txt`를 릴리스에 올린다. `gh run watch`로 끝까지 본다.
4. **서명:** 릴리스가 끝나면 바로 이 PC에서 `npm run release-sign -- vX.Y.Z`. 릴리스의 `SHA256SUMS.txt`를 받아 zip 둘의 GitHub 지문과 같은지 보고, 비밀 키의 공개 키가 앱에 든 키인지 본 뒤 서명해 `SHA256SUMS.txt.sig`를 올린다. 서명을 올리기 전에는 앱이 이 버전을 자동으로 풀지 않고 사람이 푸는 안내로 돌아간다(그사이 확인한 분은 하루 안에 다시 확인한다). `gh release view vX.Y.Z`에 `.sig`가 있는지 본다.

## 3. 홍보 페이지

- 다운로드 구역의 버전, 날짜, 파일 크기를 고친다(`scripts/site.test.ts`가 버전을 확인).
- 화면 그림을 바꿨으면 지금 앱으로 다시 찍는다. 예시 발표(지어낸 회사와 숫자)만 쓴다. 맨 위 그림은 2400×1500(1280×800을 1.875배), 휴대폰 그림은 슬라이드만 1000×579. `npm run look -- shot`이나 브라우저 자동화로 찍고 `framo-reviewer`에게 사람의 눈으로 보인다.
- 올리기: `git subtree push --prefix site origin gh-pages` → https://wlsdks.github.io/framo/ 가 200인지 본다.

## 이름에 대해

화면, 홍보 페이지, 안내 글의 이름은 **Framo**, 저장소는 `wlsdks/framo`다. 기계가 읽는 이름(패키지 `gyeol`, MCP id `gyeol`, `release/gyeol-*.zip`, 저장 형식)은 바꾸지 않는다. 바꾸면 이미 연결한 AI 설정과 받기 주소가 끊긴다.

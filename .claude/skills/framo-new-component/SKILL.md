---
name: framo-new-component
description: Framo에 새 컴포넌트(부품 장의 부품, BlockType)를 더하거나 있는 컴포넌트의 짜임을 크게 바꿀 때의 순서와 체크리스트. 데이터 꼴, 그리기, CSS, 글자 칸 등록, 움직임, 높이 재기, 검수까지. "컴포넌트 만들기", "부품 추가", "새 그래픽"에 쓴다.
---

# 새 컴포넌트 만들기

먼저 AGENTS.md '디자인'(특히 '지향은 큰 무대의 발표', 부품 장 문단), `docs/VISUAL-RULES.md`, `docs/DESIGN.md`의 '짜임 바꾸기', `docs/MOTION.md`를 읽는다. 바깥 자료는 기법만 보고 처음부터 짠다(`docs/OPEN-SOURCE.md` '공개 자료를 참고할 때의 원칙', 코드는 라이선스와 상관없이 옮기지 않는다).

## 0. 만들기 전에 판단

- 이미 있는 컴포넌트(`src/deck/blocks/catalog.ts`의 `BLOCK_GROUPS`)의 모양(variant)으로 될 일인지 먼저 본다. 고르기 목록이 불어나면 쓰는 사람이 못 찾는다.
- 정지 화면만으로도 읽혀야 하고(PDF, 편집 화면), 발표 모션은 **내용을 말해야** 한다(건너가고, 갈라지고, 모이고, 맞춰진다).
- 꾸밈 표시(항목 앞 막대, 축·눈금, 선 끝 원, 화살촉, 칠한 글 상자, 알약)는 쓰지 않는다. 강조색은 답 하나에만.
- 어느 한 직무에 치우치지 않는 예시, 지어낸 내용, 출처 없는 효과 수치 금지.

## 1. 손대는 곳 (새 타입 `foo`, 컴포넌트 `Foo`)

| 파일 | 할 일 |
|---|---|
| `src/deck/types.ts` | `BlockType`에 `'foo'` |
| `src/deck/blocks/native.ts` | 명세: 이름, 칸(fields), 항목(items: 이름표, min/max, 칸, 안내 hints), `minSpan`, 예시 값 |
| `src/deck/blocks/catalog.ts` | `BLOCK_GROUPS`의 알맞은 묶음(설명 글에도 이름) |
| `src/deck/blocks/cells.ts` | 접어 둘 칸(fold)이 있으면 |
| `src/deck/blocks/sizing.ts` | 남는 높이를 받는 그림이면 `STRETCHY` |
| `src/slides/blocks/Foo.tsx` | 그리기(React). 글 칸은 `T`/`IT`, 항목 도구는 `ItemTools` |
| `src/slides/blocks.tsx` | import와 타입→컴포넌트 표 |
| `src/slides/styles/blocks/foo.css` + `src/slides/blocks.css` | CSS 파일과 `@import`(차례가 곧 덮어쓰는 차례). 클래스 머리말은 다른 부품과 겹치지 않게(예: spark가 `bk-sp-`라 spread는 `bk-spr-`) |
| `src/slides/styles/base.css` | 새 글자 칸 클래스를 글자 칸 목록(`--fs` 규칙)에 (`css.test.ts`가 확인) |
| `src/screens/assembly.ts`, `src/slides/fitBlocks.ts` | 글이 아닌 그림이 주인 부품이면 그림 부품 목록에 |
| `src/motion/engine.ts` | `nativeAuto`에 `case 'foo'`. 이 부품의 말에 맞는 움직임 하나를 큐 시트로 먼저 적고(`/framo-motion`), 이징은 `EASE` 표에서, 차례는 `stagger`로. 글은 제자리에서 나타나게 |
| `src/deck/showcase.ts`(장 모음 예시) | 예시가 필요하면(테스트가 알려 준다) |

글자 크기는 `base.css` 맨 위의 단계(22, 26, 30, 36, 44, 52, 62 …)에서만 고른다. 색은 테마 변수만 쓰고, 섞을 때는 `color-mix(in srgb, …)`를 쓴다. 좁은 칸에서는 글자를 줄이지 말고 짜임을 바꾼다(여러 단, 눕히기, 쌓기). 글자 단계는 `--bk-w`, `--bk-h` 가운데 작은 쪽 하나만 쓴다.

## 2. 높이 재기

`#/gallery?set=blocks`의 콘솔에서 잰다. 방법은 `src/screens/measureBlocks.ts` 맨 위에 있다. 새 부품만 재서 지금 표와 합칠 때는 새 값이 0인 곳에서 예전 값을 지키며 `mergeHeights` → `heightsSource` → `src/deck/blockHeights.ts`.

## 3. 검수 (`/framo-verify`, `/framo-review`)

- 기능: `npm run typecheck && npm test`, `npm run look -- check`와 `--large`(seed 1~4 × 세 테마)가 빈 목록.
- 감성: 정지 화면을 두 테마, 명조, 강조색 두셋, 좁은 칸·넓은 칸, 혼자일 때와 옆에 다른 부품이 있을 때 찍고, 모션은 `npm run look -- film "http://localhost:5199/#/gallery?set=blocks&types=foo" --slide 0`으로 필름 띠를 만든다. 이 그림들을 `framo-reviewer`에게 맡겨 사람의 눈으로 본다.
- 예전 버전 호환: 새 부품은 `src/deck/compat.ts`의 검사가 알아서 잡는다(예전 버전은 열지 않고 알림). 새 칸 같은 다른 것을 더하면 `unknownParts`가 세게 한다.
- AI에게 보이는 꼴: 새 값은 enum, 숫자, 불리언, 해시 id, 카탈로그 말만. AI op로 부품 안의 글을 쓰게 만들지 않는다(AGENTS.md '꼭 지킬 것' 2, 3).

## 4. 문서

`docs/DESIGN.md`(모양과 규칙), `docs/MOTION.md`(움직임)에 그 부품의 문단을 더하고 같은 커밋에 넣는다(`/framo-commit`).

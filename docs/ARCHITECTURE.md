# 구조

코드를 어디에 두고, 무엇이 무엇에 기대는지 정한 문서다. 계속 고쳐 나갈 수 있게, 한 가지 규칙은 한 곳에만 두고 그 약속을 테스트로 지킨다.
지킬 보안 규칙은 [AGENTS.md](../AGENTS.md)의 ‘꼭 지킬 것’, 슬라이드와 화면의 디자인은 [DESIGN.md](DESIGN.md), 움직임은 [MOTION.md](MOTION.md)에 있다.

## 1. 세 프로그램

| 프로그램 | 소스 | 빌드 결과 | 기대는 것 |
|---|---|---|---|
| 화면(브라우저 앱) | `src/` | `dist/` | React, zustand, idb-keyval, dnd-kit, 글꼴 패키지 |
| 로컬 서버 | `server/` | `dist-node/serve.mjs` | Node 내장만. `src/ai`, `src/deck`의 일부를 함께 묶는다 |
| MCP 서버 | `mcp/server.ts` | `dist-node/gyeol-mcp.mjs` | Node 내장만. 위와 같다 |

- 로컬 서버는 `dist/`를 `127.0.0.1`로 내주고, ‘AI 공유’ 창구(`server/ai.ts`)와 ‘AI에게 부탁’(`server/agent.ts`)을 연다. 개발 서버(`npm run dev`)는 같은 창구를 Vite 안에서 연다(`vite.config.ts`).
- 서버와 MCP 서버는 모양 확인(`checkShape`), 제안 읽기(`parseRequest`), 부탁 목록, 부품과 테마의 목록을 화면과 같은 소스에서 가져간다. 그래서 그 파일들은 React, DOM, 바깥 패키지 없이 돌아야 한다(`architecture.test.ts`가 확인).
- 나눠 줄 폴더는 `scripts/pack.mjs`가, 더블클릭 실행 파일은 `launch/`가 맡는다.

## 2. 층

이 구조는 **클린 아키텍처**의 의존성 규칙을 따른다: 기대는 방향은 늘 안쪽(발표 모델 `deck`, 도구 `lib`)으로만 가고, 가운데의 모델은 화면(React, DOM), 저장(IndexedDB, 폴더), 바깥(서버, AI)을 모른다. 바깥쪽의 저장(`store`), AI 공유(`ai`), 내보내기(`export`)는 모델을 바깥 세계에 잇는 어댑터이고, 화면(`screens`)은 가장 바깥이다. 가운데는 순수한 함수(같은 입력에 같은 출력)로 두고 부수 효과는 바깥에서만 낸다(함수형 코어, 명령형 셸). 그래서 모델을 브라우저 없이 시험하고, 로컬 서버와 MCP 서버가 화면과 같은 규칙 소스를 그대로 묶어 쓴다.

`src`의 폴더는 아래 방향으로만 기댄다. 아래쪽(발표 모델)이 위쪽(화면)을 가져오면 모델만 따로 시험하거나 서버에 넣을 수 없고, 한 곳을 고쳤을 때 어디까지 번지는지 알기 어렵다.

```
 screens/, App.tsx  ─────────────── 무엇이든
     │
 export/ ──▶ store/ ──▶ ai/ ──┐
     │                        ▼
     └────▶ slides/ ──▶ deck/ ──▶ lib/
               │                  ▲
               └──▶ motion/ ──────┘
 present/ ──▶ deck/, lib/
 update/ ──▶ ai/
```

| 폴더 | 하는 일 | 가져와도 되는 것 |
|---|---|---|
| `lib/` | 어디에도 기대지 않는 작은 도구: 단축키 표기, 발표 중의 키(`presentKeys`), 끄는 동안의 처리기(`pointerSession`), 조사 고르기(`josa`), 주소, 이미지 크기 읽기, 앱 버전 | 없음 |
| `deck/` | 발표 모델: 꼴(`types.ts`), 구성(`blueprints.ts`와 발표 종류마다의 `blueprints/<id>.ts`, `generate.ts`), 새 id·항목·장(`make.ts`: 부품 장도 쓰는 가장 아래의 만들기라 구성 만들기와 나눴다. 구성 만들기가 부품 장을 짜려고 `blocks`를 가져오면, 둘이 한 파일일 때 순환이다), 레이아웃과 부품의 정의와 규칙, 테마 값, 예전 파일 읽기. 화면 없이 돈다 | `lib` |
| `motion/` | 발표할 때의 움직임 엔진. 내보낸 HTML에 소스째 들어간다 | `lib` |
| `present/` | 발표 화면과 발표자 화면 잇기 | `deck`, `lib` |
| `slides/` | 장 그리기(React), 글자 칸, 숫자 읽기, 부품 장 맞추기 | `deck`, `lib`, `motion` |
| `ai/` | AI에게 보이는 모양, 제안, 부탁, 로컬 서버와 이야기하기 | `deck`, `lib` |
| `store/` | 편집 상태, 저장(브라우저와 보관 폴더), 버전 | `deck`, `lib`, `ai` |
| `export/` | HTML, PPT(그림) 내보내기 | `deck`, `lib`, `motion`, `slides`, `store` |
| `update/` | 새 버전 확인과 받기를 로컬 서버에 부탁하기(약속은 `protocol.ts`, 바깥 연결은 서버의 `server/update.ts`만) | `ai`(서버가 받는 머리글 `AI_HEADER`) |
| `screens/`, `App.tsx` | 화면. 홈, 프레임 잡기, 편집기, 발표, 장 모음, 개발용 갤러리 | 무엇이든 |

- 파일끼리 서로를 가져오지 않는다(순환). 순환이 있으면 불러오는 차례에 따라 아직 없는 값을 읽는다.
- `import type`은 세지 않는다. 실행할 때 불러오지 않기 때문이다.
- 방향을 바꿔야 하면 `src/architecture.test.ts`의 `ALLOWED`와 이 표를 같이 고치고, 까닭을 주석으로 남긴다(예: `store`가 `ai`를 가져오는 것은 발표를 지울 때 AI 공유도 끄기 때문). 새 폴더도 `ALLOWED`에 넣어야 한다: 넣지 않은 폴더는 방향 검사를 건너뛰어서, 테스트가 모르는 폴더를 알린다.

## 3. 한 곳에서만 정하는 것

같은 규칙을 두 곳에 적으면 한쪽만 바뀐다. 아래는 그 한 곳이다.

| 무엇 | 어디 |
|---|---|
| 앱, 로컬 서버, MCP 서버, 부탁 사이의 약속(폴더 이름, 파일 형식, 머리글, id 꼴, 도구 이름, 항목 수 한도) | `src/ai/protocol.ts` |
| 받은 값의 꼴 확인 도구 | `src/ai/guards.ts` |
| 사용자가 고르는 값(글꼴, 글자 크기, 아래 표시, 장 넘기기, 바탕, 움직임 …) | `src/deck/themes.ts`. AI 카탈로그, 모양, 제안이 이 목록을 같이 쓴다 |
| 장면 목록과 맞는 장(`SCENES`, `sceneFits`) | `src/deck/scenes.ts`. 편집기, 예전 버전 검사, AI 카탈로그(`scenes`), 모양(`options.scene`), 제안(`set_options`의 `scene`)이 같이 쓴다 |
| 항목 수와 레이아웃 바꾸기(편집기와 AI 제안이 같은 규칙으로) | `src/deck/edits.ts` |
| 구성의 장 하나 만들기(부품 장이면 레시피의 컴포넌트를 판이 알아서 짠다). 프레임 잡기, 미리 보기, AI 제안의 역할로 장 넣기가 같이 쓴다 | `src/deck/generate.ts`의 `recipeSlide` |
| 예전에 저장한 발표 읽기 | `src/deck/migrate.ts`의 `migrateDeck` |
| 새 버전에서 만든 발표 알아보기 | `src/deck/compat.ts` |
| 브라우저와 보관 폴더 중 어느 쪽을 남길지 | `src/store/reconcile.ts` |
| 장의 틀(여백, 제목 크기, 글자 크기 배율) | `src/deck/frame.ts`. CSS와 같은 값인지 `frame.test.ts`가 본다 |
| 부품 장의 판(12×12칸을 자른 조각, 넣기·빼기·옮기기·맞바꾸기·선 끌기, 다시 맞추기) | `src/deck/blocks/board.ts`. 부품마다의 크기 규칙(`boardFit`)은 `sizing.ts`, 부품 수와 면은 `rules.ts`, 놓을 자리는 `place.ts` |
| 다른 컴포넌트로 바꾸기: 바꿀 수 있는 묶음과 칸의 역할, 글을 옮기는 규칙 | `src/deck/blocks/swap.ts`(`SWAP_GROUPS`, `swapBlock`). 편집기의 '바꾸기'만 쓴다(AI 제안에는 없다) |
| 부품이 잘리지 않는 높이 | `src/deck/blockHeights.ts`(갤러리에서 잰 값, 손으로 고치지 않는다) |
| 칸의 글에서 숫자 읽기, 선 그래프의 축 | `src/slides/numbers.ts`(`seriesIn`, `amountPair`, `lineAxis`) |
| 조각 색의 단계(구성비, 쌓은 막대) | `src/slides/tints.ts` |
| 이어 움직이는 이웃 장이 같이 쓰는 차트의 잣대(막대 비교, 추이)와 묶지 않는 문턱 | `src/slides/sharedScale.ts`의 `sharedScales`. 장 차례 정보(`pageInfo`)에서 한 번 셈하고 `pageProps`가 넘겨, 편집 화면, 발표, 내보낸 HTML, PDF와 PPT, 목록 그림이 같이 쓴다 |
| 빈 차트를 예시 값으로 옅게 그릴지 | `src/slides/context.ts`의 `demoOf` |
| 발표할 때의 움직임 | `src/motion/engine.ts` |
| 장의 배경: 목록, 이름, 어울리는 장, 자주 쓰는 자리, 처음 자리(`BACKDROPS`, `backdropOf`, `baseBackdrop`) | `src/deck/backdrops.ts`. 편집기, 장 모음, AI 카탈로그(`backdrops`), 모양(`backdrop`), 제안(`set_backdrop`)이 같이 쓴다 |
| 배경의 그림과 움직임(끝 모습 SVG와 발표할 때의 캔버스가 같은 함수) | `src/motion/backdrop.ts`. 엔진은 `mo-backdrop` 알림 하나만 보낸다. 내보낸 HTML에 소스째 들어간다 |
| 모션 그래픽을 그리는 도구(시간의 순수 함수, 이징, 정해진 씨앗의 난수, 점과 선만 그리는 SVG·캔버스 그리기, 캔버스 재생기) | `src/motion/draw.ts`의 `drawKit`. 배경과 모션 그래픽 엔진이 인자로 받아 쓴다(배경은 같은 그림 `Scene`: 때 e의 모습을 그리는 순수 함수). 내보낸 HTML에 소스째 들어간다(뷰어는 하나를 만들어 둘에 넘긴다) |
| 모션 그래픽(cine)의 레시피: 틀 여섯, 값의 범위와 기본값, 버전 id(내용 해시), 쉬운 손잡이, 시간표, 받은 레시피 바로잡기 | `src/deck/cine.ts`. 엔진에는 레시피가 아니라 아는 것만 채운 대본(`cineScript`)을 넘긴다(칸의 `data-script`). 발표를 열 때(`migrateDeck`)와 고칠 때(`deckStore.commit`) 쓰지 않는 버전을 뺀다(`tidyCines`) |
| 모션 그래픽의 그리기와 움직임(빛, 먹, 입자, 카메라, 글의 들어오기, WebGL2와 Canvas2D, 성능 단계) | `src/motion/cine.ts`. 엔진은 `mo-cine` 알림 하나만 보내고, 시계(Web Animations 하나)를 끝맺음(`anims`)과 건너뛰기(`skips`)로 받는다. 내보낸 HTML에 소스째 들어간다 |
| 내 모션 그래픽(갈래와 버전, 이름) | `src/store/cines.ts`(브라우저와 보관 폴더의 `내 모션 그래픽.cines`), 파일 꼴은 `src/store/cinesFile.ts`. 편집기에서 넣기, 손잡이, 봉인은 `screens/editor/cineEdit.ts` |
| 편집 화면에서 다시 맞춘 자리로 미끄러지기(쓰는 동안의 조립. 부품 칸의 FLIP도 같은 시간과 곡선) | `src/slides/liveMotion.ts` |
| 영상으로 저장할 때 장마다 머무는 시간과 걸리는 시간 어림 | `src/present/pace.ts`. 녹화(`Present.tsx`)와 묻는 창이 같이 쓴다 |
| 단축키 표기 | `src/lib/keys.ts` |
| 발표 중의 키(앱의 발표 화면, 발표자 화면, 내보낸 HTML) | `src/lib/presentKeys.ts`의 `presentAction`. 내보낸 HTML에는 소스째 들어간다 |
| 발표의 사본(복제, 버전 꺼내기): 새 id, AI 공유 끄기 | `src/store/copy.ts`의 `copyDeck` |
| 컴포넌트를 놓을 자리(끌어 놓기, 눌러 넣기, 넣을 수 없음) | `src/screens/editor/planDrop.ts`의 `planDrop` |
| 파일 이름 | `src/store/deckFile.ts`의 `safeFileName` |
| 발표 파일(HTML)에 담는 것(듣는 분께 보이는 것만)과, 그 파일을 열 때 이 PC의 같은 발표에서 이어받는 것(노트, 숨긴 장, 가려진 칸) | `src/deck/fields.ts`의 `sendable`, `withUnsent`. 내보내기(`deckData`)와 파일 열기(`store/persist.ts`의 `importDeck`)가 같이 쓴다 |
| CSP | `server/csp.ts`, 내보낸 HTML은 `src/export/exportHtml.tsx`의 `exportCsp` |
| ‘AI 공유’ 폴더의 파일 읽기(링크, 하드 링크, 큰 파일, 링크인 하위 폴더 거르기) | `server/shareFiles.ts`. 로컬 서버와 MCP 서버가 같이 쓴다 |

## 4. 파일 나누기

한 파일에는 한 가지를 둔다. 레이아웃 하나, 부품 하나를 고칠 때 그 파일 둘(그리기와 CSS)만 열면 되게 한다.

**레이아웃 하나**

| 무엇 | 어디 |
|---|---|
| 정의(칸, 항목, 모양, 안내 문구) | `src/deck/layouts.ts`의 `LAYOUTS` |
| 그리기 | `src/slides/layouts/<이름>.tsx`. 표는 `slides/layouts.tsx`의 `LAYOUT_VIEWS` |
| 모양 | `src/slides/styles/<id>.css`. `slides.css`에 `@import`로 더한다 |
| 예시 장, 묶음 | `src/deck/showcase.ts`, `LAYOUT_GROUPS` |
| 연출 | `src/motion/engine.ts`의 연출표 |

**부품 장만의 부품 하나**

| 무엇 | 어디 |
|---|---|
| 정의, 예시 | `src/deck/blocks/native.ts` |
| 그리기 | `src/slides/blocks/<이름>.tsx`. 표는 `slides/blocks.tsx`의 `NATIVE_VIEWS` |
| 모양 | `src/slides/styles/blocks/<id>.css`. `blocks.css`에 `@import`로 더한다 |
| 묶음 | `BLOCK_GROUPS`(모션 그래픽처럼 내 컴포넌트에서 넣는 부품은 `CUSTOM_TYPES`) |
| 움직임 | `engine.ts`의 `nativeAuto` |
| 높이 | 갤러리에서 다시 잰다(`screens/measureBlocks.ts`) |

**그 밖의 약속**

- 여러 레이아웃이나 부품이 같이 쓰는 조각은 같은 폴더의 `parts.tsx`에 두고, 한 곳에서만 쓰는 도우미는 그 파일 안에 둔다.
- `src/deck/blocks.ts`는 `deck/blocks/`의 창구다. 밖에서는 `deck/blocks`로만 가져온다.
- CSS 파일의 `@import` 차례가 곧 덮어쓰는 차례다. 글자 칸 목록(`--fs` 규칙)은 `styles/base.css`에 있다.
- 개발용 도구(갤러리, `checkFrame`, `checkEdit`, `checkCombos`, `measureBlocks`)는 `screens/`에 두고 `#/gallery`에서만 부른다. `App.tsx`가 `import.meta.env.DEV`일 때만 불러오므로 배포본에는 들어가지 않는다.

**화면**

| 무엇 | 어디 |
|---|---|
| 편집기의 틀(위 막대, 세 칸, 메뉴) | `screens/editor/Editor.tsx` |
| 고치는 장(무대)과 그 위에 뜨는 것, 아래 단추줄 | `SlideStage.tsx`, `StageTools.tsx`, `SelectionBar.tsx`(레이아웃 장의 고른 것, 도구는 아래 단추줄에), `BlockTools.tsx`(컴포넌트 장의 고른 것) |
| 컴포넌트 끌기, 눌러 넣기, 칸 너비, 줄 높이 | `BlockEditor.tsx`(다루기), `planDrop.ts`(어디에 놓을지), `RoomZone.tsx`(장 아래 빈자리) |
| 띄운 것을 장 안의 것에 맞춰 두기 | `useTrackRect.ts`. 바뀔 만한 때만 잰다(매 프레임 재지 않는다) |
| 발표 시작, 단축키, 내보내기, 오른쪽 칸 | `presentLaunch.tsx`, `shortcuts.ts`, `exports.tsx`, `sidePanel.ts`(탭과 좁은 창) |
| 오른쪽 칸의 탭 | `Inspector.tsx`(이 장 설정), `MotionPanel.tsx`(움직임: 장 넘기기, 나오는 차례와 때), `BlockLibrary.tsx`(컴포넌트: 기본 컴포넌트), `SavedParts.tsx`(내 컴포넌트) |
| 움직임 편집 | `studio/MotionStudio.tsx`(편집기 안의 한 모습: 가운데 무대와 시간표, 오른쪽 칸에 슬라이드 전체나 고른 컴포넌트의 값), `studio/Timeline.tsx`(시간표), `studio/player.ts`(엔진이 건 움직임을 읽어 시간표를 만들고 멈추기, 끌어 보기). 연출 묶음은 `deck/blocks/presets.ts` |
| 내 컴포넌트 | 떼어 내고 다시 넣기는 `deck/blocks/saved.ts`, 두는 곳은 `store/saved.ts`(브라우저와 보관 폴더), 파일은 `store/partsFile.ts` |
| 모션 그래픽 | 내 컴포넌트의 묶음과 틀 고르기는 `CineLibrary.tsx`, 넣기·손잡이·봉인은 `cineEdit.ts`, 모션 편집의 손잡이는 `studio/CineKnobs.tsx`. 레시피와 부품은 한 고침에 같이 들어간다(`deckStore.stageCine`) |
| 고칠 때마다 저장, 자동 버전 | `src/store/autosave.ts` |
| 화면 곳곳의 작은 부품(아이콘, 툴팁 `Info`, `Toggle`, 고르는 단추 줄 `Segmented`, 알림) | `screens/ui.tsx` |
| 화면의 모양 | `src/styles/<화면>.css`. `app.css`는 `@import` 차례만 둔다. 마우스를 올린 회색은 `--hover`, `--hover-2` 둘 |

## 5. 약속을 지키는 테스트

| 테스트 | 지키는 것 |
|---|---|
| `src/architecture.test.ts` | 층의 방향, 파일 순환, 서버가 가져가는 파일이 브라우저와 패키지 없이 도는지 |
| `src/ai/share.test.ts` | 모양에 사람이 적은 글이 한 글자도 없다(비밀 심기). 장 역할 이름이 몰래 바뀌지 않는다(스냅숏, 바꾸면 `migrate.ts`) |
| `src/ai/ops.test.ts` | 칸의 글을 쓰는 제안이 없다. 내용이 있는 장, 항목, 부품은 지우지 못한다 |
| `mcp/server.test.ts` | MCP 서버를 실제로 띄워 도구, 권한 모델, 내보내는 글자가 정해진 말뿐인지 본다 |
| `server/serve.test.ts`, `server/agent.test.ts`, `server/ai.test.ts` | `127.0.0.1`, Host 검사, CSP, AI 창구, Claude Code를 띄우는 인자. ‘AI 공유’ 폴더 안의 링크를 따라가 밖의 파일을 읽거나 지우지 않는다 |
| `src/export/exportHtml.test.ts` | 내보낸 HTML의 CSP, 다시 열기 |
| `src/deck/blocks.test.ts`, `src/deck/blocks/board.test.ts` | 부품 장으로 바꿔도 글을 잃지 않는다. 판이 늘 빈틈없이 덮이고 넣고 빼고 옮겨도 잘리지 않는다. 모든 부품의 높이를 쟀다 |
| `src/deck/blocks/swap.test.ts` | 다른 컴포넌트로 바꿔도, 되돌려 바꾸거나 묶음을 한 바퀴 돌아도 적은 글이 하나도 줄지 않고 제자리로 돌아온다 |
| `src/deck/frame.test.ts`, `src/slides/css.test.ts` | TS의 값과 CSS의 값이 같다(틀, 글자 칸 목록, 부품 간격) |
| `src/motion/engine.test.ts`, `src/slides/fitBlocks.test.ts` | 레이아웃과 부품마다 연출이 있고, 고를 수 있는 때, 빠르기, 쪽, 장 넘기기를 엔진이 안다. 엔진과 글자 맞추기가 바깥 이름 없이 소스만으로 다시 만들어진다(내보낸 HTML에 소스째 들어간다) |
| `src/deck/generate.test.ts` | 구성 규칙(결론부터, 시간에 맞는 장 수, 듣는 사람). 레이아웃 묶음과 예시 |
| `src/deck/saved.test.ts`, `src/store/partsFile.test.ts` | 내 컴포넌트: 저장한 것이 장과 따로 놀고, 넣을 때마다 새 id, 자리가 없으면 넣지 않는다. 파일에서는 아는 것만 읽는다 |
| `src/deck/cine.test.ts`, `src/motion/cine.test.ts`, `src/store/cines.test.ts` | 모션 그래픽: 레시피에 사람의 글이 없고, 새 엔진의 레시피도 아는 층만 그리며, 버전 id가 내용 해시다. 엔진이 소스만으로 다시 만들어진다. 라이브러리는 고친 것을 새 버전으로 쌓고 새 버전이 있을 때만 알린다 |
| `compat`, `migrate`, `storage`, `deckStore` | 예전 파일과 새 파일, 두 벌 맞추기, 되돌리기 |
| `scripts/unused.test.ts`, `scripts/readSource.test.ts` | 쓰지 않는 파일, 내보내기, 패키지가 없다. 그 검사가 소스를 바르게 읽는다(아래 6장) |

테스트로 볼 수 없는 것은 갤러리의 콘솔에서 본다. 장의 틀은 `await checkFrame()`, 부품 조합은 `await checkCombos()`, 편집 화면의 칸은 `await checkEdit()`로 본다. `checkCombos()`는 잘리거나 겹친 글에 더해 칸 안이 깨진 곳도 찾는다(`screens/comboChecks.ts`): 글이 줄 선에 닿거나 걸친 곳, 항목의 글이 줄 밖(옆 항목의 자리)으로 나간 곳, 그림이나 면에 가려진 글, 면(옅은 면, 진한 면, 레이아웃 안의 카드) 안에서 내용의 위 여백과 아래 여백이 다르거나 면 끝에 붙은 곳. 여백은 글자가 그려진 선(잉크)에서 면 끝까지로 잰다. 부품의 잘리지 않는 높이를 잴 때도 같은 검사(칸이 높을수록 늘 더 비는 것은 빼고)를 써서, 조합 검사가 깨졌다고 볼 높이를 편집기가 허락하지 않는다. 코드만 정리할 때는 정리 전과 후의 갤러리를 장마다 찍어 화소로 견준다.

## 6. 쓰지 않는 것 찾기

쓰지 않는 코드와 의존성은 0에 가깝게 둔다. 남겨 두면 읽는 사람이 쓰는 줄 알고 지키고, 고칠 때 번지는 곳을 넓게 보게 된다. `scripts/unused.mjs`가 저장소 전체(`src`, `server`, `mcp`, `scripts`, `launch`, `.claude`의 훅, Vite 설정, `index.html`)를 읽어 찾고, `npm test`의 `scripts/unused.test.ts`가 찾은 것이 없는지 본다. 그것만 돌릴 때는 `npx vitest run scripts/unused.test.ts`.

**찾는 것**

| 종류 | 뜻 | 고치는 법 |
|---|---|---|
| 쓰지 않는 파일 | 입구에서 닿지 않는 코드, CSS, `launch/`의 파일 | 지운다 |
| 시험에서만 쓰는 파일 | 시험만 가져가는 파일 | 기능이 죽었으면 시험과 같이 지운다. 시험 도우미면 허락 목록 |
| 쓰지 않는 내보내기 | 아무도 가져가지 않고 제 파일에서도 쓰지 않는다 | 지운다 |
| 파일 안에서만 쓰는 내보내기 | 제 파일에서만 쓴다 | `export`만 뗀다 |
| 시험에서만 쓰는 내보내기 | 시험만 가져가고 제 파일에서도 쓰지 않는다(시험만 하는 죽은 코드) | 시험과 같이 지우거나, 시험이 쓰는 함수로 바꾼다 |
| 쓰지 않는 패키지, package.json에 없는 패키지 | `dependencies`, `devDependencies`와 코드가 어긋난다 | 패키지를 빼거나 적는다(`npm run licenses`, [OPEN-SOURCE.md](OPEN-SOURCE.md)) |
| `dependencies`로, `devDependencies`로 옮길 패키지 | 나눠 주는 프로그램(화면, 로컬 서버, MCP 서버)이 가져가는 패키지만 `dependencies`다. `licenses.mjs`가 그것만 배포본의 라이선스 전문에 넣는다 | 옮긴다 |
| 찾지 못한 파일, 허락 목록이 낡음 | 가리키는 파일이 없다. 허락한 것을 이제 쓰거나 없어졌다 | 고치거나 목록에서 뺀다 |

- **입구:** `index.html`(화면), 서버 빌드의 입력(`vite.node.config.ts`), 두 Vite 설정, `package.json`의 scripts와 `.github/workflows`와 `.claude/settings.json`의 훅이 `node`로 돌리는 파일, `.d.ts`, 시험 파일. 손으로 돌리는 스크립트는 허락 목록의 `manualRoots`에 넣는다. 에이전트의 작업 폴더(`.claude/worktrees`)는 보지 않는다.
- **가져오기로 세는 것:** `import`, `export … from`, `export *`(창구 파일을 따라간다), `import()`, `require()`, 개발 서버의 `ssrLoadModule()`, `new URL('…', import.meta.url)`, CSS의 `@import`와 `url()`, `?inline` 같은 꼬리, 패키지의 실행 이름(`tsc` → typescript), tsconfig의 `types`, `/// <reference types>`. 모듈을 통째로 받으면(`import * as ns`, `const m = await import()`) `ns.이름`으로 쓴 것만 센다. 가져온 이름을 `export { a }`로 다시 내보내는 것은 원래 파일의 것이라, 가져가는 쪽이 원래 파일에서 가져오게 한다.
- **읽는 법:** TypeScript 7에는 JavaScript로 부르는 컴파일러 API가 없어서 `scripts/readSource.mjs`가 소스를 직접 낱말로 나눈다(주석, 문자열, 템플릿, 정규식, JSX의 글을 거른다). 이 읽기가 새 꼴의 코드에서 어긋나지 않게, `readSource.test.ts`가 저장소의 모든 소스에서 Vite의 파서(oxc)가 읽은 import, export와 견준다.
- **허락 목록:** `unused.mjs`의 `ALLOW`에 까닭과 함께 넣는다. 소스로는 아무도 가져가지 않지만 바깥에서 쓰는 내보내기(빌드한 `serve.mjs`에서 `Framo.exe`가 부르는 `main`), 시험 도우미 파일, 검수만 받는 패키지 같은 것이다. 까닭을 댈 수 없으면 넣지 말고 지운다. 다른 작업과 겹쳐 지금 지울 수 없는 것은 `pending`에 `// 정리 대기` 주석과 함께 잠시 두고, 겹친 작업을 합친 뒤 지운다.

## 7. 고칠 때

- **사용자가 고르는 값을 새로 연다:** `themes.ts`에 값 목록을 넣는다. 그다음 `share.ts`의 `toShape`와 `checkShape`, MCP 서버의 `PROTOCOL_WORDS`, `ops.ts`에 같이 넣는다.
- **저장 형식을 바꾼다:** `version`을 올리고 예전 파일 읽기를 `migrate.ts`에 넣는다. 예전 버전이 버리게 되는 것을 더했으면 `compat.ts`의 `unknownParts`가 알게 한다.
- **이름:** 코드와 문서는 ‘부품’, 화면은 ‘컴포넌트’다. 코드의 이름은 영어, 주석은 한국어로 왜를 쓴다.

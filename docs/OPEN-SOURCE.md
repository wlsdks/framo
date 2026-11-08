# 쓰는 오픈소스와 라이선스

조사한 날: 2026-11-02. `npm run licenses`로 `node_modules`의 패키지 62개를 모두 읽어 확인했습니다(인터넷 없이 각 패키지의 `package.json`과 라이선스 파일을 읽습니다).

## 결론

- **Framo 자체는 MIT 라이선스입니다**([LICENSE](../LICENSE)). 회사에서 고쳐 쓰고 다시 나눠도 되고, 저작권 표시만 남기면 됩니다.
- **모두 오픈소스이고, 사내에서 써도 문제없는 라이선스입니다.** MIT, Apache-2.0, BSD, ISC, 0BSD, 글꼴은 SIL OFL 1.1입니다.
- 강한 카피레프트(GPL, LGPL, AGPL)나 사용 제한 라이선스(SSPL, BUSL, Elastic, 비상업 CC)는 **하나도 없습니다**.
- 약한 카피레프트인 MPL-2.0이 하나 있지만(lightningcss와 그 운영체제별 파일), **만들 때만 쓰는 도구**이고 나눠 주는 파일에는 들어가지 않습니다.
- 로컬 서버와 MCP 서버는 외부 패키지 없이 **Node.js 내장 기능만** 씁니다.
- 윈도우용과 맥용 배포본에는 Node.js(MIT) 공식 실행 파일을 같이 넣어서, 받는 사람이 아무것도 설치하지 않아도 됩니다.

## 나눠 주는 파일에 들어가는 것 (16개)

| 패키지 | 버전 | 라이선스 | 쓰는 곳 |
|---|---|---|---|
| react, react-dom | 19.3.1 | MIT | 화면 |
| scheduler | 0.28.0 | MIT | React 내부 |
| zustand | 5.0.16 | MIT | 편집 상태 |
| idb-keyval | 6.3.0 | Apache-2.0 | 브라우저 안 저장(IndexedDB) |
| @dnd-kit/core, sortable, utilities, accessibility | 6.3.1 외 | MIT | 장 순서 끌어 옮기기 |
| tslib | 2.8.1 | 0BSD | dnd-kit이 쓰는 도우미 |
| pretendard | 1.3.9 | OFL-1.1 | 기본 글꼴 (제목과 본문). 다른 글꼴에 없는 글자도 이것으로 그림 |
| @sun-typeface/suit | 2.0.5 | OFL-1.1 | 글꼴 'SUIT' (고를 때만). 만든 이(SUNN)가 직접 올린 패키지. 굵기마다 나뉜 woff2 다섯 개, 850KB 남짓 |
| @fontsource-variable/hahmlet | 5.3.0 | OFL-1.1 | 글꼴 '명조 제목'의 제목 (고를 때만) |
| @fontsource-variable/noto-serif-kr | 5.3.1 | OFL-1.1 | 글꼴 '본명조 제목'의 제목 (고를 때만). Google Fonts의 Noto Serif KR, unicode-range 조각 6.2MB |
| @types/react, csstype | 19.3.0, 3.2.3 | MIT | 타입 정보만. 실행 파일에는 들어가지 않음 |

## 만들 때만 쓰는 것 (46개)

| 패키지 | 라이선스 | 비고 |
|---|---|---|
| vite 8, rolldown, @vitejs/plugin-react | MIT | 빌드 |
| typescript 7 | Apache-2.0 | 타입 검사 |
| vitest 5 | MIT | 테스트 |
| lightningcss 1.33 | MPL-2.0 | Vite가 CSS를 줄일 때 씀. lightningcss 파일 자체를 고쳐서 배포할 때만 그 파일을 공개할 의무가 생김. 고치지도, 배포하지도 않음 |
| postject 1.0.0-alpha.6 | MIT | `npm run pack`이 `Framo.exe`를 만들 때 SEA 덩어리를 `node.exe`에 넣음(Node.js 문서가 안내하는 도구). 배포본에는 들어가지 않음 |
| resedit 3 (pe-library 2) | MIT | `npm run pack`이 `Framo.exe`의 아이콘과 파일 정보를 바꿈. 순수 JavaScript라 맥에서 묶어도 들어감. 배포본에는 들어가지 않음 |
| @types/node 외 나머지 | MIT, ISC, BSD-3-Clause, Apache-2.0 | |

## 실행 환경과 연결하는 도구

| 이름 | 라이선스 | 비고 |
|---|---|---|
| Node.js 24 (윈도우 `node\node.exe`, 맥 `node/arm64/node`·`node/x64/node`) | MIT | 배포본에 공식 배포 파일을 고치지 않고 넣음. Node.js에 들어 있는 OpenSSL(Apache-2.0), ICU, libuv 등의 라이선스는 함께 넣는 `node/LICENSE.txt`에 모두 있음 |
| 윈도우 `Framo.exe` | MIT (Node.js) | 공식 `node.exe`를 고친 것: Node.js의 서명을 걷고, 아이콘과 파일 정보를 Framo로 바꾸고, 시작 코드(`launch/framo-exe.cjs`)를 Node.js의 단일 실행 파일(SEA) 기능으로 넣음. MIT는 고쳐서 나눠 주는 것을 허락하고, 저작권 표시와 라이선스 전문은 파일 정보와 `node\LICENSE.txt`에 남김 |
| 크롬, 엣지 | 각 회사 약관 | 사용자가 이미 쓰는 브라우저. 이 저장소가 나눠 주지 않음 |
| Codex CLI | Apache-2.0 (오픈소스) | MCP로 붙는 AI 도구. 이 저장소에 들어 있지 않음 |
| Claude Code | Anthropic 상용 약관 (오픈소스 아님) | MCP로 붙는 AI 도구. 이 저장소에 들어 있지 않음. 회사의 AI 도구 사용 정책을 따름 |

Framo는 MCP를 공개된 규격(JSON-RPC)대로 직접 구현했고, AI 회사의 SDK나 패키지를 쓰지 않습니다.

## 공개 자료를 참고할 때의 원칙

Framo는 오픈소스라 누구나 코드를 봅니다. 저작권과 라이선스에 걸릴 일이 없게, 디자인과 모션, 컴포넌트를 만들 때 바깥 자료는 아래처럼만 씁니다. 애매하면 쓰지 않습니다.

1. **가져오는 것은 기법과 원리(아이디어)뿐입니다.** 저작권은 표현을 지키고 아이디어는 지키지 않습니다. 숫자를 자리마다 굴리기, 선을 그으며 잇기, 흩어진 것이 한곳에 모이기, 차례로 나오기처럼 이름으로 말할 수 있는 일반적인 기법은 보고 배워 우리 식으로 처음부터 만듭니다.
2. **표현은 가져오지 않습니다.** 코드, 데모, 프롬프트와 설명 글, 영상과 그림, 글꼴, 소리, 수치 표(곡선 값, 색 값)를 옮기지 않습니다. 저장소에 라이선스가 붙어 있어도, 그 라이선스가 담긴 것 전부를 덮는지 따로 확인합니다(목록은 MIT인데 실린 영상과 프롬프트는 만든 사람의 것인 경우가 있다).
3. **한 작품을 다시 만들지 않습니다.** 영상이나 데모 하나의 장면 구성을 따라 그대로 만들면 아이디어가 아니라 표현을 베낀 것(2차적 저작물)이 될 수 있습니다. 여러 곳에서 본 기법을 우리 컴포넌트의 내용(보고의 숫자, 흐름, 비교)에 맞게 새로 짭니다.
4. **다른 제품의 모양을 옮기지 않습니다.** 브랜드, 로고, 그 제품만의 화면 모양은 상표나 디자인권에 걸릴 수 있습니다([VISUAL-RULES.md](VISUAL-RULES.md)는 공개된 디자인 원칙만 근거로 삼는다).
5. **남의 코드를 옆에 띄워 두고 짜지 않습니다.** 개념을 우리 말로 적고(문서나 주석), 그것만 보고 만듭니다.
6. **라이선스나 이용 약관이 없으면 권리가 그대로 있는 것으로 봅니다.** 그런 자료는 기법의 이름만 봅니다. 특허를 주장한다고 밝힌 기법은 쓰지 않습니다.
7. **다른 프로젝트의 코드는 가져다 쓰지 않습니다.** MIT, Apache-2.0처럼 허용하는 라이선스여도 코드 조각을 저장소에 옮기지 않고 모두 직접 짭니다. 패키지(의존성)는 코드를 옮기는 것과 다른 일이라 따로 다룹니다: 넣기 전에 `npm run licenses`로 확인하고 이 문서에 적으며, 되도록 늘리지 않습니다(AGENTS.md '꼭 지킬 것' 6).
8. **참고한 자료는 기록합니다.** 아래 표나 [MOTION.md](MOTION.md)의 '참고한 것과 라이선스'에 자료, 라이선스나 약관, 참고한 것(개념)을 남깁니다.

## 참고한 공개 자료 (코드나 값을 옮기지 않음)

| 자료 | 라이선스 | 참고한 것 |
|---|---|---|
| [Radix Colors](https://www.radix-ui.com/colors/docs/palette-composition/composing-a-palette) | MIT | 강조색과 같은 계열의 회색을 짝짓는 원칙. 색 값은 우리가 따로 골랐음 |
| [Datawrapper 블로그: 색으로 강조하기](https://www.datawrapper.de/blog/emphasize-with-color-in-data-visualizations) | 공개 글 | 맥락은 회색, 말하려는 곳만 색 |
| [Android Developers: Adapt layout](https://developer.android.com/design/ui/mobile/guides/layout-and-content/adapt-layout) | 문서 Apache-2.0 | 자리가 바뀌면 글자를 줄이기 전에 짜임을 바꾼다(여러 단으로 흘리기, 모양 바꾸기). 너비로 먼저, 그다음 높이로 고른다 |
| [GOV.UK Design System: Summary list](https://design-system.service.gov.uk/components/summary-list/) | OGL v3.0 | 좁으면 이름을 값 위로 쌓는다 |
| [U.S. Web Design System: Table](https://designsystem.digital.gov/components/table/) | 퍼블릭 도메인, CC0 1.0 | 좁은 자리의 표 쌓기, 숫자 표는 쌓지 않는다 |
| [IBM Carbon: Data table, Legends](https://carbondesignsystem.com/components/data-table/style/) | Apache-2.0 | 줄 높이를 정한 단계로만 줄인다, 범례는 줄 수를 정해 둔다 |
| [Apache ECharts 문서: Media query](https://apache.googlesource.com/echarts-doc/+/refs/heads/v4/en/tutorial/media-query.md) | Apache-2.0 | 차트 자리의 너비, 높이, 가로세로비로 조건을 나눠 범례 자리와 방향을 바꾼다 |
| [ONS Service Manual: Data visualisation](https://service-manual.ons.gov.uk/data-visualisation/guidance/chart-text) | OGL v3.0 | 제목은 요점을 먼저, 범례는 차트 위 한 줄 |
| [ONS Service Manual: Bar charts](https://service-manual.ons.gov.uk/data-visualisation/chart-types/bar-charts) | OGL v3.0 | 항목 비교는 가로 막대, 세로 막대는 시간 순서에, 막대는 0에서 시작(깔때기를 가로 막대로) |
| [ECMA-376 Office Open XML](https://ecma-international.org/publications-and-standards/standards/ecma-376/) (ISO/IEC 29500) | Ecma 표준: 누구나 무료로 받아 보고 구현할 수 있음. Microsoft는 Open Specification Promise로 이 규격을 구현하는 것에 특허를 주장하지 않기로 함 | PPT로 내보내기(그림)의 .pptx 짜임(부분, 관계, 장·틀·노트 XML). 다른 라이브러리의 코드는 옮기지 않고 규격을 보고 직접 씀 |
| [PKWARE APPNOTE (ZIP 형식)](https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT) | 공개 문서. 기본 기능(그대로 두기, deflate)만 쓰고, 특허가 걸린 강한 암호화 기능은 쓰지 않음 | .pptx를 묶는 ZIP(로컬 머리, 중앙 목록, CRC-32). 직접 씀 |

## 나눠 줄 때 지킬 것

- **MIT, BSD, ISC, 0BSD, Apache-2.0:** 저작권 표시와 라이선스 전문을 함께 둡니다. `npm run pack`이 `오픈소스 라이선스.txt`에 묶여 나가는 패키지의 라이선스 전문을 모아 넣고, Node.js의 `LICENSE`는 `node/LICENSE.txt`로 넣습니다. Apache-2.0 패키지(idb-keyval)에는 따로 둘 NOTICE 파일이 없습니다.
- **글꼴(OFL-1.1):** 글꼴만 따로 팔 수 없고, 문서에 넣는 것은 자유입니다. 내보낸 HTML에는 글꼴 원작자가 미리 나눠 둔 부분 파일(unicode-range 조각)이나 굵기마다 나뉜 파일을 **고치지 않고** 넣으므로 수정본이 아니며, 'Pretendard', 'SUIT' 같은 예약 글꼴 이름 조항에 걸리지 않습니다. SUIT는 CSS에서 굵기마다 한 단계 굵은 파일을 이어 쓰는데(`src/fonts/suit.css`), 글꼴 파일은 그대로라 수정본이 아닙니다. 글꼴 파일 안의 저작권 정보도 그대로 남습니다. PPT(그림)에는 글꼴 파일이 들어가지 않고 글꼴로 그린 그림만 들어갑니다.
- **글꼴을 고를 때 본 것:** 패키지와 글꼴 모두 OFL-1.1이고, 만든 곳이 직접 올렸거나(Pretendard, SUIT) Fontsource(Google Fonts 원본)인 것, woff2라 묶음이 크지 않은 것. 보고 자료에 어울리는지는 같은 장을 글꼴마다 그려 보고 골랐습니다. 보고 뺀 것: Wanted Sans(OFL, 프리텐다드와 거의 같아 보임), IBM Plex Sans KR(OFL, Fontsource 패키지가 woff를 함께 묶어 굵기 넷에 10MB가 넘고 글꼴 높이가 달라 틀 맞춤을 따로 해야 함), Noto Sans KR(OFL, 한글이 프리텐다드와 같은 바탕), 나눔스퀘어(OFL이지만 npm에는 만든 곳이 아닌 사람이 올린 패키지뿐), Spoqa Han Sans Neo(OFL이지만 npm 패키지의 라이선스 표시가 없어 `npm run licenses`를 통과하지 못함).
- **Node.js는 보안 수정판을 놓치지 않습니다.** 배포본에 넣는 판(`scripts/pack.mjs`의 `NODE_VERSION`)은 LTS여야 하고, 같은 주 버전에 더 새 보안 수정판이 나와 있으면 묶기가 멈춥니다(`scripts/nodeRelease.mjs`가 nodejs.org의 릴리스 목록을 봅니다). 검수(CI)는 지원하는 두 LTS의 최신 판에서 돌고, GitHub Actions는 이름표가 아니라 커밋(SHA)으로 고정합니다.

## 새 패키지를 넣을 때

1. 꼭 필요한지 먼저 봅니다. 서버와 MCP 서버에는 넣지 않습니다(Node 내장만).
2. `npm run licenses`가 통과해야 합니다. `npm run pack`도 통과하지 않으면 멈춥니다.
   - 묶여 나가는 패키지: MIT, ISC, BSD-2/3-Clause, 0BSD, Apache-2.0, OFL-1.1, Zlib, CC0-1.0, BlueOak-1.0.0
   - 만들 때만 쓰는 도구: 위에 더해 MPL-2.0, CC-BY-4.0, Python-2.0, Unlicense
   - 그 밖(GPL, LGPL, AGPL, SSPL, BUSL, 비상업, 라이선스 없음)은 넣지 않습니다.
3. 화면에 들어가는 패키지는 바깥 주소로 연결하지 않아야 합니다(CSP가 막지만, 막히는 기능은 쓰지 않습니다).
4. 이 문서의 표를 고칩니다.

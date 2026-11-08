---
name: framo-verify
description: Framo에서 작업을 끝내거나 커밋하기 전의 검수 묶음. 바꾼 것의 종류(슬라이드·부품 CSS, 레이아웃, 모션, 화면, 저장, 서버·AI·MCP, 배포)에 따라 돌릴 검사와 볼 화면을 고른다. "검수", "끝내기 전에", "커밋 전에", "다 됐어?"에 쓴다.
---

# 끝내기 전 검수

순서는 늘 **사람의 눈 → 기계 검사**다. 사람의 눈은 `/framo-review`를 따른다. 아래 표는 그 뒤에 반드시 통과해야 하는 바닥선이다.

## 늘 하는 것

```bash
npm run typecheck && npm test
```

- 이번 작업으로 쓰지 않게 된 코드, 내보내기, 파일, CSS, 패키지를 남기지 않았는지 본다(AGENTS.md '유지보수하기 쉽게'). `npm test`의 `scripts/unused.test.ts`가 찾고, 그것만 돌릴 때는 `npx vitest run scripts/unused.test.ts`. 남겨야 하면 까닭과 함께 허락 목록에(docs/ARCHITECTURE.md '쓰지 않는 것 찾기').
- 보안에 닿는 변경(저장, 내보내기, 서버, AI 공유, MCP)은 AGENTS.md '꼭 지킬 것'을 다시 읽는다.

## 바꾼 것에 따라

개발 서버가 떠 있어야 한다(`npm run dev`, 기본 http://localhost:5199). 다른 포트면 `--base`를 붙인다.

| 바꾼 것 | 사람의 눈(`/framo-review`) | 기계 검사 |
|---|---|---|
| 부품(컴포넌트)이나 그 CSS, `fitBlocks.ts` | 조합 seed 1~4의 모든 장을 두 테마, 명조, 큰 글자로. 바꾼 부품은 혼자일 때와 옆에 다른 부품이 있을 때 | `npm run look -- check` (기본: seed 1~4 × white·navy·serif), `npm run look -- check --large`. 높이를 바꿨으면 `#/gallery?set=blocks`에서 다시 잰다(`src/screens/measureBlocks.ts` 맨 위) |
| 레이아웃 | 모든 모양(`&variants=1`)을 두 테마와 명조로 | `npm run look -- frame --only <레이아웃 id>` |
| 모션(`src/motion/`) | 바꾼 장의 필름 띠: `npm run look -- film "<갤러리 주소>" --slide N --level lively`, 차분하게도. 내보낸 HTML에서도 한 번 | `npx vitest run src/motion` |
| 화면(`src/screens/`, `src/styles/`) | 1280×600, 1366×650, 1536×730(`--scrollbars`), 1920×1080. 처음 쓰는 사람의 흐름을 끝까지 | 가로 스크롤 없음 |
| 내보내기(PDF, `print.css`, 내보낸 HTML의 인쇄) | 쪽마다 그림(`--pages`)을 열어 모든 장이 끝난 모습인지(세는 숫자는 마지막 값, 누르면 나오는 것까지), 두 테마로 | `npm run look -- pdf`(예시 발표), `npm run look -- pdf --deck <작업 파일>`: 쪽 수 = 장 수, 16:9 한 가지, 글꼴이 들었는지 |
| 저장, 버전 | 만들다 탭을 닫고 다시 열기, 버전 되돌리기를 직접 | `npx vitest run src/store` |
| AI 공유, 제안, MCP | AI가 보는 모양에 사람이 쓴 글이 없는지 | `npx vitest run src/ai mcp` (빌드 후 MCP 서버를 실제로 띄운다) |
| 배포, 의존성 | — | `npm run build`, `npm run licenses`, 배포본은 `/framo-release` |

## 모두 통과한 뒤

`/framo-commit`으로 커밋하고 올린다. 통과하지 않은 것은 커밋하지 않는다. 한 번 실패한 검사를 "아마 괜찮다"로 넘기지 않는다.

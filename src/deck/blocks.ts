// 부품(블록)으로 꾸미는 장. 사람이 부품을 고르고 끌어다 놓으면, 놓을 자리와 크기는 시스템이 정한다.
//
// 판: 본문 상자를 가로 12칸, 세로 12칸으로 나누고 부품은 그 가운데 네모꼴 자리를 차지한다(blocks/board.ts).
// 부품들은 늘 판 전체를 빈틈없이 덮는다. 넣으면 옆 부품의 자리를 나눠 받고, 빼면 옆 부품이 넓어져 덮는다.
// 크기는 부품마다 잘리지 않는 크기(갤러리에서 잰 높이, blockHeights.ts) 밑으로 내려가지 않고, 남는 자리는 차트처럼
// 커지는 부품이 먼저 받는다. 그래서 어디에 대충 놓아도 칸이 줄과 간격에 딱 맞고, 빈 곳이나 삐뚤빼뚤한 곳이 생기지 않는다.
// 한 장에 부품은 열까지(차트나 표 같은 큰 부품은 여섯까지).
//
// 부품의 자리는 측정하지 않고 계산한다. 같은 계산을 CSS calc()로 써서 편집 화면, 발표, 내보낸 HTML이
// 똑같이 그리고, 끌어다 놓는 동안 놓일 자리를 찾을 때도 이 계산을 쓴다(움직이는 중인 화면을 재지 않는다).
//
// 부품 장의 코드는 blocks/ 폴더에 일마다 나눠 두고, 여기서 한꺼번에 내보낸다(가져다 쓰는 곳은 이 파일만 본다).

export * from './blocks/board'
export * from './blocks/catalog'
export * from './blocks/native'
export * from './blocks/links'
export * from './blocks/rules'
export * from './blocks/cells'
export * from './blocks/names'
export * from './blocks/convert'
export * from './blocks/sizing'
export * from './blocks/images'
export * from './blocks/arrange'
export * from './blocks/place'
export * from './blocks/clean'
export * from './blocks/saved'
export * from './blocks/legacy'
export * from './blocks/presets'
export * from './blocks/suggest'
export * from './blocks/swap'

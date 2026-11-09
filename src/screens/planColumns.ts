// 프레임 잡기 2단계의 구성 미리 보기: 작은 장 그림을 몇 단으로 늘어놓을지

/** 늘어놓을 칸의 크기(안쪽 여백을 뺀 너비와 높이), 칸 사이, 그림 아래 장 이름 줄의 높이 */
interface PlanBox {
  width: number
  height: number
  gapX: number
  gapY: number
  label: number
}

const MIN = 2
const MAX = 6

/**
 * 단 수: 장이 모두 온전히 칸 높이에 드는 가장 적은 단(그림이 가장 큰). 가장 많은 단으로도 다 들지 않을 때만 칸 안에서 스크롤한다
 * (아래가 옅게 흐려 더 있는 것이 보인다). 구성이 한눈에 잡히는 것이 이 칸의 일이라 끝 줄을 가리지 않는다: 그림을 키우려고 끝 줄이
 * 반쯤 가려지게 두었더니 처음 쓰는 사람에게는 잘린 것으로 읽혔다. 장 수만으로 정하던 때는(일곱 장부터 넷, 열세 장부터 다섯)
 * 1920×1080에서 열다섯 장이 다섯 단의 작은 그림으로 칸 아래 절반 가까이를 비웠다
 */
export function planColumns(n: number, box: PlanBox): number {
  if (n <= 0 || box.width <= 0 || box.height <= 0) return MIN
  const total = (c: number) => {
    const w = (box.width - box.gapX * (c - 1)) / c
    const rows = Math.ceil(n / c)
    return rows * ((w * 9) / 16 + box.label) + (rows - 1) * box.gapY
  }
  for (let c = MIN; c < MAX; c++) if (total(c) <= box.height) return c
  return MAX
}

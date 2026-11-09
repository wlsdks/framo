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
/** 한 단 줄여 그림을 키울 때 칸에 보여야 하는 몫. 넘친 끝 줄은 칸 안에서 스크롤한다(아래가 옅게 흐려 더 있는 것이 보인다) */
const SHOWN = 0.85

/**
 * 단 수: 장이 모두 칸 높이에 드는 가장 적은 단(그림이 가장 큰)을 고르고, 한 단 더 적게 해도 85% 넘게 보이면 그쪽을 고른다.
 * 장 수만으로 정하던 때는(일곱 장부터 넷, 열세 장부터 다섯) 1920×1080에서 열한 장이 260px 그림 세 줄로 칸 아래 3분의 1을 비웠고,
 * 그 크기에서는 일정 막대, 원인 캐기 같은 컴포넌트가 옅은 선 몇 가닥으로만 보였다
 */
export function planColumns(n: number, box: PlanBox): number {
  if (n <= 0 || box.width <= 0 || box.height <= 0) return MIN
  const total = (c: number) => {
    const w = (box.width - box.gapX * (c - 1)) / c
    const rows = Math.ceil(n / c)
    return rows * ((w * 9) / 16 + box.label) + (rows - 1) * box.gapY
  }
  let fit = MAX
  for (let c = MIN; c <= MAX; c++) {
    if (total(c) <= box.height) {
      fit = c
      break
    }
  }
  return fit > MIN && box.height / total(fit - 1) >= SHOWN ? fit - 1 : fit
}

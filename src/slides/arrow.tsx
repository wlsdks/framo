// 잇는 표시 하나: 두 쪽을 잇는 표시(비교, 전과 후, 걱정과 대책)와 컴포넌트 사이의 이음표가 모두 이것을 그린다

/**
 * 가는 줄기와 끝의 세로 눈금(—|). 화살 머리는 쓰지 않는다: 점·선·세모 머리, 가는 꺾쇠(›), 줄기와 꺾인 머리(→)를 차례로 써 봤지만
 * 모두 흔한 다이어그램 화살표로 보였다(사용자, docs/VISUAL-RULES.md 5). 방향은 끝의 눈금이 말한다: 줄기는 옅게(가는 획 1.5) 흘러
 * 나가고, 닿는 쪽에 굵은 눈금(2.5)이 선다. 모이고 퍼지기의 끝점, 흐름의 머리 없는 선과 같은 말투(가는 선과 눈금)다.
 * 칸마다 그림 크기(CSS의 width, height)만 정하고 굵기와 모양은 여기서 정한다. 정사각형이라 세로로 돌려 써도 자리가 같다
 */
export function ArrowMark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M6 24H38" fill="none" stroke="currentColor" strokeOpacity="0.6" strokeWidth="1.5" />
      <path d="M39 15V33" fill="none" stroke="currentColor" strokeLinecap="square" strokeWidth="2.5" />
    </svg>
  )
}

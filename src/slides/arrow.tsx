// 잇는 표시 하나: 두 쪽을 잇는 표시(비교, 전과 후, 걱정과 대책)와 컴포넌트 사이의 이음표가 모두 이것을 그린다

/**
 * 가는 줄기 하나(—). 머리도 끝 눈금도 쓰지 않는다: 점·선·세모 머리, 가는 꺾쇠(›), 줄기와 꺾인 머리(→), 줄기와 끝의 세로 눈금(—|)을
 * 차례로 써 봤지만 모두 다이어그램 기호처럼 보였다(사용자, docs/VISUAL-RULES.md 5). 차례는 읽는 방향(왼쪽에서 오른쪽, 위에서 아래)이
 * 말하고, 이 선은 두 쪽이 이어진다는 것만 보인다(글의 줄표와 같은 말). 옅은 가는 획 하나라 장식이 되지 않는다.
 * 칸마다 그림 크기(CSS의 width, height)만 정하고 굵기와 모양은 여기서 정한다. 정사각형이라 세로로 돌려 써도 자리가 같다
 */
export function ArrowMark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M8 24H40" fill="none" stroke="currentColor" strokeOpacity="0.6" strokeWidth="1.5" />
    </svg>
  )
}

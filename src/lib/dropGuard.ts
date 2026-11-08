// 받는 곳이 없는 데 떨어뜨린 파일. 브라우저에 맡기면 앱 창이 그 파일(.deck, 이미지)로 넘어가 화면이 사라졌다(앱 창이라
// 뒤로 가기 단추도 보이지 않는다). 편집기는 장 위에 떨어뜨린 이미지를 받아 이미 막았지만, 홈, 프레임 잡기, 발표 화면은 그대로였다.
// 받는 곳(이미지 칸, 편집기의 장)은 이것보다 먼저 받거나(React의 onDrop) 뒤에 걸려 놓을 수 있는지를 다시 정한다

const hasFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files')

/** 아무도 받지 않은 파일 끌기를 막는다: 놓을 수 없다고 보이고(dropEffect none), 떨어뜨려도 창이 넘어가지 않는다 */
export function guardFileDrop(e: DragEvent) {
  if (!hasFiles(e) || e.defaultPrevented) return
  e.preventDefault()
  e.dataTransfer!.dropEffect = 'none'
}

/** 앱을 켤 때 한 번 창 전체에 건다 */
export function watchFileDrop() {
  window.addEventListener('dragover', guardFileDrop)
  window.addEventListener('drop', guardFileDrop)
}

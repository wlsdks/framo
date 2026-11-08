import { useSyncExternalStore } from 'react'

// 배경 자리를 슬라이드 위에서 끌어 고치는 중인 장. 이 장 설정(BackdropPicker)이 켜고, 무대(BackdropFrame)가 그 장 위에 틀을 띄운다.
// 둘이 편집기의 다른 곳에 있어서 작은 공용 값 하나로 잇는다(편집 상태 저장소에 넣으면 되돌리기 기록과 섞인다)

let editing: string | null = null
const listeners = new Set<() => void>()

export function setBackdropEditing(slideId: string | null) {
  if (editing === slideId) return
  editing = slideId
  listeners.forEach((f) => f())
}

/** 이 장의 배경 자리를 고치는 중인지 */
export function useBackdropEditing(slideId: string): boolean {
  return useSyncExternalStore(
    (f) => {
      listeners.add(f)
      return () => listeners.delete(f)
    },
    () => editing === slideId,
  )
}

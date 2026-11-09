import { blockFieldPrefix } from '../../deck/blocks'
import type { Missing } from '../../deck/fields'

export const FOCUS_FIELD = 'framo:focus-field'
export interface FieldFocus { slideId: string; key: string }

/** 입력칸은 편집 화면에만 있다. 무대가 미리 보기를 끝내고 다시 그린 뒤 초점을 옮기게 한다. */
export function focusField(slideId: string, m: Missing) {
  const key = (m.block ? blockFieldPrefix(m.block) : '') + (m.item !== undefined ? `${m.item}.${m.key}` : m.key)
  window.dispatchEvent(new CustomEvent<FieldFocus>(FOCUS_FIELD, { detail: { slideId, key } }))
}

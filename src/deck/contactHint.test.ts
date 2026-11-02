import { describe, expect, it } from 'vitest'
import { LAYOUTS } from './layouts'

describe('마지막 장의 연락처 안내', () => {
  it('사내 사람만 쓸 수 있는 내선 번호를 예로 들지 않는다', () => {
    // 대외 제안처럼 사외 참석자 앞에서 하는 발표에도 같은 안내가 '이메일이나 내선 번호'로 나와, 바깥 사람이 걸 수 없는 번호를 적으라고 했다
    const contact = LAYOUTS.closing.fields.find((f) => f.key === '$contact')!
    expect(contact.hint).not.toContain('내선')
    expect(contact.hint).toBe('이메일이나 전화번호')
  })
})

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('../styles/wizard.css', import.meta.url), 'utf8')
/** 미디어 쿼리 밖(줄 맨 앞에서 시작하는) 규칙의 본문 */
const topRule = (selector: string) => css.match(new RegExp(`^${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`, 'm'))?.[1] ?? ''

describe('새 발표 마법사', () => {
  it('2단계 오른쪽 구성은 칸 높이를 정하지 않고, 장이 많으면 칸 안에서 스크롤한다', () => {
    // 틀은 머리줄과 아래 줄 사이 가운데에 선다. 발표 시간을 바꿔 구성이 한 줄 늘 때마다 칸이 자라면 묻는 말과 고르는 것이 통째로
    // 30~100px 올라가, 이어서 누르려던 자리(발표 방식, 다음)가 비켜 갔다(1440×723에서 10분 → 30분, 묻는 말 168 → 99px)
    const rule = topRule('.wz-split-plan .wz-plan')
    expect(rule).toMatch(/contain:\s*size/)
    expect(rule).toMatch(/overflow-y:\s*auto/)
  })
})

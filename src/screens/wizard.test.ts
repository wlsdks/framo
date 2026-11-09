import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BLUEPRINTS, DECK_TYPES } from '../deck/blueprints'
import { planColumns } from './planColumns'

const css = readFileSync(new URL('../styles/wizard.css', import.meta.url), 'utf8')
/** 미디어 쿼리 밖(줄 맨 앞에서 시작하는) 규칙의 본문 */
const topRule = (selector: string) => css.match(new RegExp(`^${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`, 'm'))?.[1] ?? ''

describe('새 발표: 프레임 잡기', () => {
  it('2단계 구성은 장 수에 따라 높이가 바뀌지 않고, 장이 많으면 칸 안에서 스크롤한다', () => {
    // 틀은 머리줄과 아래 줄 사이 가운데에 선다. 발표 시간을 바꿔 구성이 한 줄 늘 때마다 칸이 자라면 묻는 말과 고르는 것이 통째로
    // 30~100px 올라가, 이어서 누르려던 자리(발표 방식, 다음)가 비켜 갔다(1440×723에서 10분 → 30분, 묻는 말 168 → 99px)
    const rule = topRule('.wzp-grid')
    expect(rule).toMatch(/height:\s*calc\(100vh/)
    expect(rule).toMatch(/overflow-y:\s*auto/)
  })

  it('2단계 구성 미리 보기는 칸을 비우지 않고 작은 장 그림을 가장 크게 늘어놓는다', () => {
    // 칸의 크기는 1920×1080과 1280×600(윈도우 150%)에서 잰 것(안쪽 여백을 뺀 너비와 높이, 칸 사이, 장 이름 줄)
    const big = { width: 1074, height: 796, gapX: 12, gapY: 16, label: 23 }
    const small = { width: 719, height: 401, gapX: 12, gapY: 16, label: 22 }
    // 장 수만으로 넷, 다섯 단을 정하던 때는 1920에서 열다섯 장이 다섯 단의 작은 그림으로 칸 아래 절반 가까이를 비웠다
    expect([5, 7, 11, 15].map((n) => planColumns(n, big))).toEqual([3, 3, 4, 4])
    expect([5, 7, 11, 15].map((n) => planColumns(n, small))).toEqual([3, 4, 4, 5])
    // 끝 줄을 가리지 않는다: 세 단이면 열한 장의 끝 줄이 반쯤 가려져 잘린 것으로 읽혔다. 고른 단 수에서는 모든 장이 칸에 온전히 든다
    const rows = (n: number, box: typeof big) => {
      const c = planColumns(n, box)
      const w = (box.width - box.gapX * (c - 1)) / c
      const k = Math.ceil(n / c)
      return k * ((w * 9) / 16 + box.label) + (k - 1) * box.gapY
    }
    for (const box of [big, small]) for (let n = 1; n <= 20; n++) if (planColumns(n, box) < 6) expect(rows(n, box), `${n}장`).toBeLessThanOrEqual(box.height)
    // 작은 장 그림은 96px(FitSlide의 가장 작은 크기)보다 좁아지지 않는다
    for (const box of [big, small]) for (let n = 1; n <= 20; n++) expect((box.width - box.gapX * (planColumns(n, box) - 1)) / planColumns(n, box)).toBeGreaterThanOrEqual(96)
  })

  it('작은 장 그림을 담는 목록의 규칙은 그림 안의 목록과 글을 잡지 않는다', () => {
    // '.wzp-grid li'가 구성 미리 보기 안의 추진 일정 줄(li)까지 세로로 쌓아, 막대가 이름 아래로 흩어지고 기간 칸과 어긋났다.
    // 장 그림을 담는 상자 아래의 태그는 바로 아래(>)만 잡는다
    const holders = 'wzp-grid|wzx-strip|wz-strip|wz-shot|wzx-big|wz-real'
    const loose = css.match(new RegExp(`\\.(?:${holders})(?:\\.[\\w-]+)*\\s+(?:li|ol|ul|span|div|p|h[1-6]|svg)\\b`, 'g')) ?? []
    expect(loose).toEqual([])
  })

  it('1단계 종류 설명은 1280×600의 좁은 단에서도 한 줄로 선다 (24자까지)', () => {
    // 대외 제안의 설명(28자)만 두 줄로 꺾여, 여섯 종류가 든 첫 묶음의 끝 '연간·반기 계획'이 아래 줄(다음 단추)에 가렸다.
    // 24자(개선 제안, 조사·분석 보고)는 1280에서 한 줄에 든다
    for (const type of DECK_TYPES) expect([...BLUEPRINTS[type].description].length, type).toBeLessThanOrEqual(24)
  })
})

// 부품: 개요 (facts). 모양은 styles/blocks/facts.css

import { BLOCKS } from '../../deck/blocks'
import { useSlide } from '../context'
import { IT, ItemTools, T, textUnits } from '../fields'

/**
 * 넓은 칸(한 줄을 다 쓰는 1680px)에서 단 수마다 내용 한 줄이 들어가는 너비(내용 글자의 em, 단 사이 72px를 빼고). 높은 칸은 내용이
 * 52px(36의 1.44배)까지, 낮은 칸은 43px(30의 1.44배)까지 커진다. 크게(글자 1.2배)는 그만큼 좁다
 */
const ROOM = { t: [0, 32.3, 15.46, 9.85], l: [0, 38.9, 18.6, 11.85, 8.47] } as const
/** 항목 수마다 펼 수 있는 단 수(큰 쪽부터). 넷은 셋과 하나로 펴지 않는다(둘씩). 셋, 다섯은 둘씩 펴면 마지막 줄이 하나다 */
const COLS: Record<'t' | 'l', Record<number, number[]>> = {
  t: { 2: [2], 3: [3, 2], 4: [2], 5: [3, 2], 6: [3, 2] },
  l: { 2: [2], 3: [3, 2], 4: [4, 2], 5: [3, 2], 6: [3, 2] },
}

/**
 * 넓은 칸에서 짝을 몇 단으로 펼지(facts.css): 가장 긴 내용이 한 줄에 드는 가장 많은 단. 높은 칸(t), 낮은 칸(l)과 크게(T, L)마다
 * 'l2 t2 L2 T1'처럼 적는다(1은 단을 펴지 않고 이름 | 내용 줄로). 단을 늘 셋으로 펴던 때는 '2.4억 원 (공사 1.6억, 이사 0.8억)'이
 * 괄호 안에서 꺾여 단마다 높이가 들쭉날쭉했고, 맞추기가 글자를 한 단계 줄였다(검수)
 */
function factsColumns(n: number, longest: number): string {
  const pick = (h: 't' | 'l', scale: number) => (COLS[h][n] ?? []).find((c) => longest * scale <= ROOM[h][c]) ?? 1
  return `t${pick('t', 1)} l${pick('l', 1)} T${pick('t', 1.2)} L${pick('l', 1.2)}`
}

/** 개요: 항목과 내용을 짝지은 줄 */
export function Facts() {
  const { slide } = useSlide()
  const items = slide.items.slice(0, BLOCKS.facts.items!.max)
  // 가장 긴 내용(줄을 바꿔 적은 내용은 가장 긴 줄)의 너비. 편집할 때 빈 내용의 안내('내용 한 줄')는 짧아 세지 않는다
  const longest = Math.max(0, ...items.flatMap((it) => it.body.split('\n').map((line) => (line.trim() ? textUnits(line.trim()) : 0))))
  return (
    <div className="bk-fc">
      <T k="heading" as="h3" className="bk-h" fit={[18, 32]} multiline />
      <dl className="bk-fc-list" data-n={items.length} data-cols={factsColumns(items.length, longest)}>
        {items.map((it, i) => (
          <div key={it.id} className="it bk-fc-row">
            <IT i={i} k="title" as="dt" className="bk-fc-k" />
            <IT i={i} k="body" as="dd" className="bk-fc-v" multiline keepParens />
            <ItemTools i={i} />
          </div>
        ))}
      </dl>
    </div>
  )
}

// 사람이 부를 이름: 부품마다(같은 부품이 둘이면 자리를 붙여), 장마다(장 목록, 버전 기록, 제안 미리 보기)

import { LAYOUTS } from '../layouts'
import type { Block, Slide } from '../types'
import { BLOCKS } from './catalog'
import { allBlocks } from './cells'

/**
 * 부품마다 사람이 부를 이름. 같은 장에 같은 부품이 둘 이상이면 자리를 붙인다('왼쪽 예상 질문', '아래 숫자 강조').
 * 빈칸 목록에 '예상 질문 1의 질문'이 두 번 나오면 어느 부품의 칸인지 알 수 없다
 */
export function blockNames(blocks: Block[]): Map<string, string> {
  // 같은 부품끼리 견준 자리로 부른다 (위아래로 둘이면 위·아래, 셋이면 가운데 줄까지). 판을 셋으로 나눠 부품 가운데가 드는 곳으로
  // 부르던 때는, 남는 높이를 맨 아래 부품이 다 받으면(board.ts의 share) 위아래로 둘인데 아래 것이 '가운데 줄'이 되었다
  const row = (b: Block, others: Block[]) => {
    const c = b.at!.y + b.at!.h / 2
    const cs = others.map((o) => o.at!.y + o.at!.h / 2)
    return cs.every((x) => x > c) ? '위' : cs.every((x) => x < c) ? '아래' : '가운데 줄'
  }
  const col = (b: Block, others: Block[]) => {
    const c = b.at!.x + b.at!.w / 2
    const cs = others.map((o) => o.at!.x + o.at!.w / 2)
    return cs.every((x) => x > c) ? '왼쪽' : cs.every((x) => x < c) ? '오른쪽' : '가운데'
  }
  const overlapY = (a: Block, b: Block) => a.at!.y < b.at!.y + b.at!.h && b.at!.y < a.at!.y + a.at!.h
  const out = new Map<string, string>()
  for (const b of blocks) {
    const name = BLOCKS[b.type]?.name ?? b.type
    const same = blocks.filter((o) => o !== b && o.type === b.type && o.at)
    if (!b.at || !same.length) {
      out.set(b.id, name)
      continue
    }
    const apart = same.filter((o) => !overlapY(o, b))
    const beside = same.filter((o) => overlapY(o, b))
    const where = [apart.length > 0 && row(b, apart), beside.length > 0 && col(b, beside)].filter(Boolean)
    out.set(b.id, where.length ? `${where.join(' ')} ${name}` : name)
  }
  return out
}

/**
 * 장 목록, 버전 기록, 제안 미리 보기에 쓰는 장 이름. 보고 종류가 정해 준 이름(주요 숫자, 다음 할 일)은 그대로 두고, 섹션 장은 지금의 섹션 제목으로,
 * '장 추가'로 만든 컴포넌트 장은 모두 '컴포넌트로 꾸미기'라 서로 구별되지 않아서 넣은 컴포넌트의 이름으로 부른다
 */
export function slideName(slide: Slide): string {
  // 섹션 장은 지금 적힌 섹션 제목으로: 만들 때의 이름('섹션: 시장')은 사람이 섹션 제목을 바꾸면 낡는다(장 아래의 섹션 표시는
  // 제목을 따르는데 목록만 옛 이름으로 남았다). 이 이름은 이 PC의 화면에만 쓴다(AI에게 가는 모양은 만들 때의 이름, share.ts)
  if (slide.layout === 'section') {
    const title = (slide.fields.title ?? '').replace(/\s+/g, ' ').trim()
    return title ? `섹션: ${title}` : slide.purpose
  }
  if (slide.layout !== 'compose' || slide.purpose !== LAYOUTS.compose.name) return slide.purpose
  const names = [...new Set(allBlocks(slide.blocks ?? []).map((b) => BLOCKS[b.type].name))]
  if (!names.length) return slide.purpose
  return names.length > 2 ? `${names.slice(0, 2).join(', ')} 외 ${names.length - 2}` : names.join(', ')
}

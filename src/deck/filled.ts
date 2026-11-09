// 안내대로 채운 장: 구성(발표 종류)이 칸마다 단 안내를 그 칸의 글로 넣은 모습. 프레임 잡기의 미리 보기(쓰는 사람이 채웠을 때의 모습)와
// 개발용 갤러리의 &filled=1(채운 끝 모습의 짜임 검사)이 같이 쓴다

import { BLOCKS } from './blocks'
import { DROP_ROW, hintFor, LAYOUTS } from './layouts'
import type { Slide } from './types'

/** '(예: …)'나 '예: …'인 안내는 그 예시를, 아니면 안내 그대로 */
const exampleOf = (hint: string) => /\(예: ([^)]+)\)/.exec(hint)?.[1] ?? /^예: (.+)$/.exec(hint)?.[1] ?? hint

/** 받침의 번호(가 = 0). 한글 음절이 아니면 -1 */
const finalOf = (ch: string) => {
  const c = ch.charCodeAt(0) - 0xac00
  return c >= 0 && c < 11172 ? c % 28 : -1
}

/**
 * 무엇을 적는지 말하는 안내(설명)인지: '언제까지, 왜 필요한지', '누구와 무엇을 정할지'처럼 '-ㄴ지/-ㄹ지'로 끝나거나 '한 줄 설명',
 * '한 줄에 하나씩', '한 문장으로'로 끝난다. 줄마다 다는 안내도 이렇게 설명일 때가 있다('4가지'처럼 받침 없는 '지'는 예시다)
 */
function describes(hint: string): boolean {
  const t = hint.trim()
  if (/(한 줄 설명|한 줄에 하나씩|한 문장으로)$/.test(t)) return true
  return t.endsWith('지') && t.length > 1 && [4, 8].includes(finalOf(t[t.length - 2]))
}

/**
 * 구성이 단 안내(줄마다의 예시)가 있는 칸과 꼭 채울 칸만 채우고, 기본 안내뿐인 접는 칸(출처, 덧붙임, 설명)은 비워 둔다: 발표 모습(final)으로
 * 그리면 빈 칸은 보이지 않는다. 그림 칸은 채우지 않는다.
 * examplesOnly면 예시인 안내만 채운다: 줄마다의 예시, 칸에 단 구성의 예시, '(예: …)'. 줄 모두에 같은 설명('왜 잘됐는지', '언제까지, 왜
 * 필요한지', '어떻게 잰 숫자인지')과 칸의 기본 설명은 비운다. 프레임 잡기의 미리 보기가 쓴다: 설명을 채우면 예시 값 대신 '짧은 설명이나
 * 원인' 같은 안내 문구가 채운 글처럼 섞였다. 갤러리의 검사는 꼭 채울 칸을 다 채운 짜임을 봐야 해서 설명도 채운다
 */
export function filledFromHints(slide: Slide, examplesOnly = false): Slide {
  /** 안내로 채울 글. example은 이 안내가 예시인지(설명이 아닌지) */
  const take = (hint: string, example: boolean) =>
    !examplesOnly ? exampleOf(hint) : /예: /.test(hint) ? exampleOf(hint) : hint === DROP_ROW || !example || describes(hint) ? '' : hint
  const spec = LAYOUTS[slide.layout]
  const h = slide.hints
  // 줄마다 예시를 단 구성이면 레이아웃의 줄마다 예시는 섞지 않는다(hintFor)
  const own = Object.keys(h).some((k) => /^items\.\d+\./.test(k))
  // 한 장 요약과 결정 요청의 줄 설명은 구성 도우미(blueprints/recipes.ts의 summary, closing)가 다는 쓸 거리 안내다('매출과 이익률',
  // '결정해 주실 것 (가격, 인력)'): 줄마다 달려 있어도 예시가 아니다. '(예: …)'만 예시로 채운다
  const guideBody = slide.layout === 'summary' || slide.layout === 'closing'
  const fields = { ...slide.fields }
  for (const f of spec.fields) if (!f.image && !fields[f.key]?.trim() && (h[f.key] || !f.optional)) fields[f.key] = take(hintFor(slide.layout, h, f.key), !!h[f.key] || (!own && !!f.example))
  const items = slide.items.map((it, i) => {
    const next = { ...it }
    // 지워도 되는 줄('없으면 이 줄을 지워요')은 예시로 채우지 않는다: 그 줄의 이름('그 밖의 요청')만 덩그러니 남았다
    if (examplesOnly && (spec.items?.fields ?? []).some((f) => h[`items.${i}.${f.key}`] === DROP_ROW)) return next
    for (const f of spec.items?.fields ?? []) {
      if (!f.image && !next[f.key].trim() && (h[`items.${i}.${f.key}`] || h[`items.${f.key}`] || !f.optional))
        next[f.key] = take(hintFor(slide.layout, h, f.key, f.key, i), !(guideBody && f.key === 'body') && (!!h[`items.${i}.${f.key}`] || (!h[`items.${f.key}`] && !own && !!f.hints?.[i])))
    }
    return next
  })
  const blocks = slide.blocks?.map((b) => {
    const bs = BLOCKS[b.type]
    const bh = b.hints ?? {}
    const bf = { ...b.fields }
    // 컴포넌트 칸의 안내는 편집할 때의 예시 칸이기도 해서(기간 칸 '11월, 12월, 1월') 예시로 본다
    for (const f of bs.fields) if (!f.image && !bf[f.key]?.trim() && (bh[f.key] || !f.optional)) bf[f.key] = take(bh[f.key] ?? f.hint, true)
    const bi = b.items.map((it, i) => {
      const next = { ...it }
      for (const f of bs.items?.fields ?? []) {
        const row = bh[`items.${i}.${f.key}`]
        if (!f.image && !next[f.key].trim() && (row || !f.optional)) next[f.key] = take(row ?? bh[`items.${f.key}`] ?? f.hints?.[i] ?? f.hint, !!row || (!bh[`items.${f.key}`] && !!f.hints?.[i]))
      }
      return next
    })
    return { ...b, fields: bf, items: bi }
  })
  return { ...slide, fields, items, ...(blocks ? { blocks } : {}) }
}

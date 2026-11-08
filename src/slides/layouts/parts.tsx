// 여러 레이아웃이 같이 쓰는 조각: 장 머리, 이름표, 항목, 단위

import { readField, visibleItems } from '../../deck/fields'
import { hintFor } from '../../deck/layouts'
import { useSlide } from '../context'
import { numberUnits, T } from '../fields'
import { readNumber } from '../numbers'

export function Head({ lead = false }: { lead?: boolean }) {
  return (
    <header className="s-head">
      <T k="title" as="h2" className="s-title" fit={[24, 40]} multiline />
      {lead && <T k="lead" as="p" className="s-lead" multiline />}
    </header>
  )
}

/** 표 머리말처럼 비워 두면 기본 말을 쓰는 칸. 편집할 때는 그 기본 말이 안내로 보인다. */
export function Label({ k, fallback, className }: { k: string; fallback: string; className?: string }) {
  const { slide, meta, mode } = useSlide()
  if (mode === 'final' && !readField(slide, meta, k).trim()) return <span className={className}>{fallback}</span>
  return <T k={k} as="span" className={className} />
}

export function useItems() {
  const { slide } = useSlide()
  return visibleItems(slide)
}

/**
 * 나란히 놓인 숫자들이 한 크기로 보이게, 가장 긴 값의 폭을 함께 쓴다(가장 작게 줄어야 하는 숫자에 모두 맞춘다).
 * 숫자마다 제 칸에 맞춰 줄이면 '40%', '3.6시간', '1,200시간'이 세 크기로 보여 깨져 보인다.
 * 편집할 때는 빈 칸의 안내 숫자까지 넣어 잰다(채우는 동안 크기가 들쭉날쭉하지 않게). skip은 같이 재지 않는 항목(하나 크게의 첫 숫자)
 */
export function useSharedUnits(key: 'value', skip?: (i: number) => boolean) {
  const { slide, mode } = useSlide()
  const items = visibleItems(slide)
  const texts = items
    .map((it, i) => (skip?.(i) ? '' : it[key].trim() || (mode === 'final' ? '' : hintFor(slide.layout, slide.hints, key, key, i))))
    .filter(Boolean)
  return texts.length ? Math.max(...texts.map(numberUnits)) : undefined
}

/** '단위:' 줄을 그릴지: 적었으면 늘, 비었으면 편집할 때만. 부품에서 비어 접힌 단위 칸이면 '단위:'만 남지 않게 뺀다 ('칸 더하기'로 열면 보인다) */
export function useUnitOpen(unit: string): boolean {
  const { mode, folds } = useSlide()
  return !!unit || (mode !== 'final' && !folds?.has('unit'))
}

/**
 * 숫자 칸 하나를 읽는다(진행률, 점수처럼 칸 하나로 그리는 값). 비었거나 숫자가 없으면 null. '△3', '-2%'처럼 줄어든 값은 음수로.
 * 칸 여럿을 견주거나 더하는 곳은 단위까지 읽는 seriesIn, amountPair를 쓴다
 */
export const numberOrNull = readNumber

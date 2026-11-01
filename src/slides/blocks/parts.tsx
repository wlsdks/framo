// 여러 부품이 같이 쓰는 조각: 빈 칸의 예시 값, 사람 모양, 차트 범례, 값 나누기, 숫자 글자

import type { ReactNode } from 'react'
import { readField } from '../../deck/fields'
import { hintFor } from '../../deck/layouts'
import { useSlide } from '../context'
import { minusSigns, splitNumber, T } from '../fields'
import { formatNumber, seriesIn } from '../numbers'

/** 편집할 때 비어 있으면 안내 문구의 예시 숫자로 흐리게 그린다. 발표할 때는 적은 값만 */
export function useDemo(keys: string[]) {
  const { slide, meta, mode } = useSlide()
  const demo = mode !== 'final' && keys.every((k) => !readField(slide, meta, k).trim())
  const read = (k: string) => (demo ? hintFor(slide.layout, slide.hints, k) : readField(slide, meta, k))
  return { demo, read }
}

export function PersonIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="7" r="4.6" />
      <path d="M3.2 22c0-5 3.9-8.6 8.8-8.6s8.8 3.6 8.8 8.6z" />
    </svg>
  )
}

/** 몫을 보이는 꼴: 10% 밑은 소수 한 자리, 1% 밑은 '1% 미만' */
export function pctText(p: number): string {
  if (p > 0 && p < 1) return '1% 미만'
  return `${formatNumber(p < 10 ? Math.round(p * 10) / 10 : Math.round(p))}%`
}

/** 직접 적은 합계도 조각의 단위와 합에 맞을 때만 하나의 전체로 그린다. 빈 합계는 자동 합산을 쓴다. */
export function totalMatches(texts: string[], total: string, unit: string): boolean {
  if (!total) return true
  const series = seriesIn([...texts, total], unit)
  const end = series.values.at(-1)
  if (!series.ok || end == null || end < 0) return false
  const sum = series.values.slice(0, -1).reduce<number>((a, n) => a + (n ?? 0), 0)
  if (!Number.isFinite(sum)) return false
  return Math.abs(sum - end) <= Math.max(1e-8, Math.abs(end) * 1e-9)
}

/** 칸 위의 한 줄: 요점(계산한 말), 표시 설명, 단위. 단위 칸은 편집할 때만 비어 있어도 보인다 */
export function ChartKey({ sum, keys, unitKey = 'unit' }: { sum?: ReactNode; keys?: ReactNode; unitKey?: string }) {
  const { slide, meta, mode, folds } = useSlide()
  const unit = readField(slide, meta, unitKey).trim()
  // 비어서 접힌 칸이면 '단위:'만 남지 않게 줄째 뺀다 ('칸 더하기'로 열면 보인다)
  const showUnit = !!unit || (mode !== 'final' && !folds?.has(unitKey))
  if (!sum && !keys && !showUnit) return null
  return (
    <div className="bk-cc-key">
      {sum && <p className="bk-cc-sum">{sum}</p>}
      {keys}
      {showUnit && (
        <span className="bk-cc-u">
          {unitKey === 'unit' ? '단위: ' : ''}
          <T k={unitKey} as="span" oneLine />
        </span>
      )}
    </div>
  )
}

/**
 * 칸마다의 값 글. 흐름 칸(seriesOf)처럼 나누되, 숫자가 없는 칸('-', '없음')도 제자리를 지켜 그 칸을 비운다.
 * 숫자 뒤에 띄어 쓴 단위('42 억')는 앞 숫자에 붙인다
 */
export function tokensOf(text: string): string[] {
  const out: string[] = []
  // 천 단위 쉼표는 남기고 나머지 쉼표와 슬래시는 칸 경계로 지킨다. '10, 확인 중, 20'에서 글을 앞 숫자의 단위로 합치면
  // 세 번째 값이 두 번째 칸으로 당겨져 다른 기간의 값처럼 보였다. 쉼표 뒤에 띄어 쓰지 않아도 같다.
  const thousands = new Set<number>()
  for (const m of text.matchAll(/(?<![\d,])[-−–△▼+]?\d{1,3}(?:,\d{3})+(?:\.\d+)?(?!\d|,\d)/g)) {
    for (let i = 0; i < m[0].length; i++) if (m[0][i] === ',') thousands.add(m.index + i)
  }
  const groups: string[] = []
  let start = 0
  for (let i = 0; i < text.length; i++) {
    if ((text[i] === ',' && !thousands.has(i)) || /[/·|]/.test(text[i])) {
      groups.push(text.slice(start, i))
      start = i + 1
    }
  }
  groups.push(text.slice(start))
  for (const group of groups) {
    const cells: string[] = []
    for (const tok of group.split(/\s+/)) {
      if (!tok) continue
      if (/\d/.test(tok) || /^([-−–—.x×?]+|없음)$/.test(tok) || !cells.length) cells.push(tok)
      else cells[cells.length - 1] += ` ${tok}`
    }
    // 구분 기호 사이가 비어 있어도 그 칸을 남겨 뒤의 값이 앞으로 밀리지 않게 한다.
    if (cells.length) out.push(...cells)
    else if (groups.length > 1) out.push('')
  }
  return out
}

/** 숫자 글: 빼기 기호로 바꾸고, 붙여 쓴 단위('58억')는 두 단계 작은 글자로 뗀다 (fields.tsx의 Shown과 같은 꼴) */
export function Numeral({ text }: { text: string }) {
  const t = minusSigns(text)
  const p = splitNumber(t)
  if (!p) return <>{t}</>
  return (
    <>
      {p.pre && <span className="u u-pre">{p.pre}</span>}
      {p.num}
      {p.unit && <span className="u">{p.unit}</span>}
    </>
  )
}

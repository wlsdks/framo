import { Fragment, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ElementType } from 'react'
import { listLines } from '../deck/edits'
import { isBlankItem, looksOptional, readField } from '../deck/fields'
import { hintFor, labelIn, LAYOUTS, rowHint } from '../deck/layouts'
import type { ItemKey } from '../deck/types'
import { cx } from '../lib/cx'
import { imageToDataUrl, pickImage } from '../lib/imageFile'
import { keys } from '../lib/keys'
import { frameRect } from './blockFrame'
import { useSlide } from './context'
import { startItemDrag } from './itemDrag'
import { liveRewrap } from './liveMotion'

/** [a, b]: 글자 수가 a를 넘으면 한 단계, b를 넘으면 두 단계 작게. 길이 기준이라 내보낸 파일에서도 같다. */
type Fit = [number, number]

function fitClass(text: string, fit?: Fit): string {
  if (!fit) return ''
  const n = [...text].length
  return n > fit[1] ? 'fit-2' : n > fit[0] ? 'fit-1' : ''
}

/** 굵은 Pretendard 기준으로 어림한 글자 폭(em). 고정폭 숫자로 재어서 비례폭 숫자(큰 숫자)에는 조금 넉넉하다 */
function glyphWidth(text: string): number {
  let w = 0
  for (const ch of text) {
    // 고딕 굵은 글씨, 고정폭 숫자(tabular-nums)를 재어 본 폭 (em)
    if (/[㄰-㆏가-힣一-鿿]/.test(ch)) w += 0.86
    else if (/[0-9]/.test(ch)) w += 0.64
    else if (/[A-Z%]/.test(ch)) w += ch === '%' ? 0.96 : 0.66
    else if (/[a-z]/.test(ch)) w += 0.54
    else if (/[.,:;'!|]/.test(ch)) w += 0.26
    else if (/\s/.test(ch)) w += 0.26
    else w += 0.6
  }
  return w * 1.04
}

/** 한 줄짜리 숫자 칸이 칸 너비를 넘지 않게 글자 크기를 정하는 데 쓰는 폭(em) */
export function textUnits(text: string): number {
  return Math.max(1, glyphWidth(text))
}

/*
 * 숫자의 꼴. 저장한 글은 그대로 두고 그릴 때만 바꾼다 (docs/DESIGN.md '숫자의 꼴').
 * - 큰 숫자(핵심 숫자, 사례의 성과, 안 비교의 비용)는 숫자와 단위를 나눠 단위를 글자 크기 두 단계 작게.
 *   '1,200시간'의 '시간'처럼 한글 단위는 숫자만큼 넓고 무거워서, 같은 크기면 답(숫자)보다 단위가 먼저 읽힌다.
 * - '-3%'의 붙임표(-)는 빼기 기호(−)로. 붙임표는 소문자 높이에 맞춘 짧은 선이라 숫자 옆에서 낮고 짧아 보인다.
 */

/** 단위 글자의 크기: 숫자보다 두 단계(1.2²) 작게. slides.css의 `.slide .u`와 같은 값이다 (fields.test.ts가 본다) */
export const UNIT_K = 1 / 1.44

/** 글 처음이나 띄어쓰기, 여는 괄호, 물결 뒤에서 숫자 바로 앞에 붙은 붙임표(-)와 줄표(–)를 빼기 기호(U+2212)로. '2026-10-25', 'A-1'은 그대로 */
export function minusSigns(text: string): string {
  return text.replace(/(^|[\s(~∼/])[-–](?=\d)/g, '$1−')
}

/**
 * 숫자 하나(범위 '2~3'까지)와 그 뒤의 짧은 단위. 앞에는 부호나 화폐 기호, 또는 띄어 쓴 짧은 한글 덧말('약', '하루', '월')만.
 * 이 꼴이 아니면 나누지 않고 그대로 그린다
 */
const NUMBER_PARTS = /^([가-힣]{1,3} )?([+\-−–±▲▼△▽$₩€£¥]?\s?\d[\d,]*(?:\.\d+)?(?:\s?[~∼–-]\s?[+\-−]?\d[\d,]*(?:\.\d+)?)?)(\D{0,8})$/

/**
 * '1,200시간' → 숫자 '1,200', 단위 '시간'. '하루 10분' → 앞말 '하루 ', 숫자 '10', 단위 '분'.
 * 앞말도 단위도 없거나 숫자 하나의 꼴이 아니면 null
 */
export function splitNumber(text: string): { pre?: string; num: string; unit: string } | null {
  const m = NUMBER_PARTS.exec(text)
  if (!m || (!m[1] && !m[3].trim())) return null
  return m[1] ? { pre: m[1], num: m[2], unit: m[3] } : { num: m[2], unit: m[3] }
}

/** 숫자 하나와 그 뒤의 단위 */
interface NumberRun {
  num: string
  unit: string
}

const NUM = String.raw`\d[\d,]*(?:\.\d+)?`
/**
 * 숫자가 둘 이상인 값: 숫자마다 짧은 한글 단위가 붙어 이어지는 꼴('6분 30초', '3억 5,000만 원', '1시간 30분', '3년 6개월').
 * 앞에는 숫자 하나의 꼴과 같은 덧말과 부호만
 */
const COMPOUND = new RegExp(`^([가-힣]{1,3} )?([+\\-−–±▲▼△▽$₩€£¥]?\\s?)((?:${NUM}[가-힣]{1,2} ?)+)(${NUM})(\\D{1,8})$`)
const RUN = new RegExp(`(${NUM})([가-힣]{1,2} ?)`, 'g')

/**
 * 큰 숫자를 앞말과 '숫자, 단위' 묶음들로 나눈다. 숫자 하나면 splitNumber와 같고, 숫자가 둘 이상인 값('6분 30초', '3억 5,000만 원')은
 * 숫자마다 단위를 뗀다: 나누지 않던 때는 단위가 숫자와 같은 크기로 그려져, 옆의 '62%'와 한 장에서 말투가 달랐다.
 * 글자는 하나도 바꾸지 않는다(앞말과 묶음을 이으면 원래 글). 둘 다 아니면 null
 */
export function numberRuns(text: string): { pre?: string; runs: NumberRun[] } | null {
  const one = splitNumber(text)
  if (one) return one.pre ? { pre: one.pre, runs: [{ num: one.num, unit: one.unit }] } : { runs: [{ num: one.num, unit: one.unit }] }
  const m = COMPOUND.exec(text)
  if (!m) return null
  const runs = [...m[3].matchAll(RUN)].map((r) => ({ num: r[1], unit: r[2] }))
  runs[0] = { num: m[2] + runs[0].num, unit: runs[0].unit }
  runs.push({ num: m[4], unit: m[5] })
  return m[1] ? { pre: m[1], runs } : { runs }
}

/** 단위를 작게 그리는 큰 숫자의 폭(em). 나란한 숫자들이 같은 크기를 고를 때 쓴다 */
export function numberUnits(text: string): number {
  const t = text.trim()
  const parts = numberRuns(t)
  if (!parts) return textUnits(t)
  const small = (parts.pre ?? '') + parts.runs.map((r) => r.unit).join('')
  return Math.max(1, glyphWidth(parts.runs.map((r) => r.num).join('')) + glyphWidth(small) * UNIT_K)
}

interface TextProps {
  as?: ElementType
  className?: string
  fit?: Fit
  multiline?: boolean
  /** 줄바꿈 없이 한 줄로 두고, 길면 칸 너비에 맞게 줄인다 */
  oneLine?: boolean
  /** 한 장 안의 숫자들을 같은 크기로 맞출 때 가장 긴 값의 폭 */
  units?: number
  /** 큰 숫자: 숫자 뒤의 단위('시간', '억 원', '%')를 두 단계 작게 그린다. 편집할 때도 같은 꼴로 보인다 */
  numeral?: boolean
  /**
   * 여러 줄 칸이어도 Enter는 다음 항목으로 (줄바꿈은 Shift+Enter). 점 목록의 요점처럼 항목 하나가 한 줄인 목록에. 한 줄 칸의 항목은 늘 그렇다.
   * 강점 칸(SWOT)처럼 한 항목 안에 여러 줄을 쓰는 칸은 Enter가 줄바꿈이다
   */
  enterNext?: boolean
  /**
   * 괄호 묶음('(공사 1.6억, 이사 0.8억)')을 줄 끝에서 가르지 않는다: 꺾여야 하면 괄호 앞에서 통째로 다음 줄로. 짧은 값을 늘어놓는 칸(개요의
   * 내용)에서 괄호 안이 갈리면 '2.4억 원 (공사 1.6억, / 이사 0.8억)'처럼 끊겨 읽혔고, 단마다 높이가 들쭉날쭉했다
   */
  keepParens?: boolean
}

function oneLineProps(text: string, oneLine?: boolean, units?: number, numeral?: boolean) {
  if (!oneLine) return { cls: '', style: undefined }
  return { cls: 'one-line', style: { '--units': (units ?? (numeral ? numberUnits(text) : textUnits(text))).toFixed(2) } }
}

/**
 * 숫자 뒤의 기호(%, ℃ 같은)와 거기 붙은 조사가 줄 끝에서 갈리지 않게 묶을 낱말: '18%보다', '3℃나'.
 * 브라우저는 줄을 낱말 단위로 꺾어도(keep-all) '%' 같은 뒤붙이 기호 다음은 꺾을 수 있는 자리로 보아서,
 * 좁은 칸이나 크게, 명조에서 '본부 평균 18% / 보다 높아요'처럼 숫자와 조사가 두 줄로 갈렸다
 */
const GLUED = /[^\s]*[%‰℃℉°][가-힣]+|[^\s]*[가-힣A-Za-z0-9][&+/·・][가-힣A-Za-z0-9][^\s]*/g
/** 괄호 묶음까지(keepParens): 스물네 글자까지의 괄호와 거기 붙은 글. 더 길면 칸보다 넓어질 수 있어 묶지 않는다 */
const GLUED_PARENS = /\([^()\n]{1,24}\)[^\s]*|[^\s]*[%‰℃℉°][가-힣]+|[^\s]*[가-힣A-Za-z0-9][&+/·・][가-힣A-Za-z0-9][^\s]*/g
/** 기호로 이은 낱말('사진&영상,', '기획·개발', 'R&D팀')은 이 길이까지만 묶는다: 주소처럼 긴 것은 칸보다 넓어질 수 있다 */
const JOINED_MAX = 24

/** 글을 그대로 둔 채 묶을 낱말만 떼어 낸 조각들. 묶을 것이 없으면 null */
export function gluedParts(text: string, parens = false): (string | { nb: string })[] | null {
  const found = [...text.matchAll(parens ? GLUED_PARENS : GLUED)]
  if (!found.length) return null
  const out: (string | { nb: string })[] = []
  let at = 0
  for (const m of found) {
    if (m[0].length > JOINED_MAX && !/[%‰℃℉°][가-힣]+$/.test(m[0]) && !m[0].startsWith('(')) continue
    if (m.index! > at) out.push(text.slice(at, m.index))
    out.push({ nb: m[0] })
    at = m.index! + m[0].length
  }
  if (at < text.length) out.push(text.slice(at))
  return out.length === 1 && typeof out[0] === 'string' ? null : out
}

/** 묶을 낱말은 줄을 꺾지 않는 조각(.nb)에. 글자는 하나도 바꾸지 않는다 */
function Glued({ text, parens }: { text: string; parens?: boolean }) {
  const parts = gluedParts(text, parens)
  if (!parts) return <>{text}</>
  return <>{parts.map((p, i) => (typeof p === 'string' ? p : <span key={i} className="nb">{p.nb}</span>))}</>
}

/** 발표 화면의 글: 빼기 기호를 바로 쓰고, 큰 숫자면 단위를 작은 글자로 떼어 낸다 */
function Shown({ text, numeral, parens }: { text: string; numeral?: boolean; parens?: boolean }) {
  const t = minusSigns(text)
  const parts = numeral ? numberRuns(t) : null
  if (!parts) return <Glued text={t} parens={parens} />
  return (
    <>
      {parts.pre && <span className="u u-pre">{parts.pre}</span>}
      {parts.runs.map((r, i) => (
        <Fragment key={i}>
          {r.num}
          {r.unit && <span className="u">{r.unit}</span>}
        </Fragment>
      ))}
    </>
  )
}

/** 큰 숫자의 앞말, 숫자, 단위를 칸에 넣을 조각으로 (앞말과 단위는 작은 글자) */
function numberNodes(parts: { pre?: string; runs: NumberRun[] }): (Node | string)[] {
  const span = (text: string, cls: string) => {
    const el = document.createElement('span')
    el.className = cls
    el.textContent = text
    return el
  }
  return [...(parts.pre ? [span(parts.pre, 'u u-pre')] : []), ...parts.runs.flatMap((r) => [r.num, ...(r.unit ? [span(r.unit, 'u')] : [])])]
}

/**
 * 편집 칸에 글을 넣는다. 큰 숫자면 단위를 작은 글자(span)로 떼어 발표 화면과 같은 꼴로 보인다.
 * 글자는 하나도 바꾸지 않아서(빼기 기호도 그대로) 칸의 innerText가 적은 글과 같다
 */
function paint(el: HTMLElement, value: string, numeral?: boolean, parens?: boolean) {
  const parts = numeral ? numberRuns(value) : null
  // 숫자와 조사를 묶을 낱말이 있으면 발표 화면처럼 줄을 꺾지 않는 조각(.nb)에 (Glued)
  const glued = parts ? null : gluedParts(value, parens)
  if (glued) {
    const next = glued.map((p) => {
      if (typeof p === 'string') return p
      const nb = document.createElement('span')
      nb.className = 'nb'
      nb.textContent = p.nb
      return nb
    })
    if (!sameNodes(el, next)) el.replaceChildren(...next)
    return
  }
  if (!parts) {
    // 처음 그리는 칸(아직 빈 칸)은 innerText를 읽지 않고 바로 넣는다. innerText는 읽을 때마다 화면을 다시 재야 해서(강제 레이아웃),
    // 장을 고를 때 칸마다 읽고 쓰기를 번갈아 하면 칸 수만큼 레이아웃이 돌았다. 빈 칸의 innerText는 ''이라 결과는 같다
    if (!el.firstChild) {
      if (value) el.innerText = value
      return
    }
    if (el.innerText !== value || el.querySelector(':scope > :is(.u, .nb)')) el.innerText = value
    return
  }
  const next = numberNodes(parts)
  if (sameNodes(el, next)) return
  el.replaceChildren(...next)
}

/** 칸의 조각이 이미 이 조각들과 같은지 (같으면 다시 넣지 않는다: 커서와 고른 글이 그대로) */
function sameNodes(el: HTMLElement, next: (Node | string)[]): boolean {
  return (
    el.childNodes.length === next.length &&
    next.every((n, i) => {
      const c = el.childNodes[i]
      return typeof n === 'string' ? c.nodeType === Node.TEXT_NODE && c.nodeValue === n : c instanceof HTMLElement && c.className === (n as HTMLElement).className && c.textContent === n.textContent
    })
  )
}

interface FieldProps extends TextProps {
  value: string
  hint: string
  /** 스크린 리더가 읽는 칸 이름 (labelIn). 없으면 빈칸일 때 안내 문구를 이름으로 */
  label?: string
  fieldId: string
  onChange?: (value: string) => void
  /** 비어 있으면 편집할 때도 그리지 않는 칸 (부품 안의 채우지 않아도 되는 칸) */
  fold?: boolean
  /** 글자 수 단계(fit)를 이 글로 고른다: 목록의 칸은 가장 긴 항목의 글 (IT) */
  fitText?: string
  /** 비워 둬도 되는 칸. 편집할 때 빈 안내를 한 단계 옅게 그려 꼭 채울 칸과 구분한다 (빈칸으로 세지 않는 칸) */
  optional?: boolean
  /** 항목 칸: 여러 줄을 붙여 넣으면 줄마다 다음 항목으로 (IT). 나눌 수 없으면 false라서 칸 하나에 붙인다 */
  onPasteLines?: (lines: string[]) => boolean
  /** 아직 예시 글인 칸: 안내 색으로 그리고, 누르면 글 전체를 골라 처음 친 글자가 예시를 덮어 쓰게 한다 */
  example?: boolean
  /**
   * 비워 두면 셈해 보이는 값(계산식의 결과). 발표 모습에는 적은 글처럼 그리고, 편집할 때는 안내 자리에 옅게 그려 직접 적으면 적은 글이
   * 이기는 것을 보인다. 마우스를 올리면 '자동 계산'이라고 알린다
   */
  auto?: string
}

/** 셈해 보이는 칸의 말풍선 */
const AUTO_TIP = '자동 계산: 값들을 셈한 결과예요. 값을 고치면 따라 바뀌고, 직접 적으면 적은 대로 보여요.'

/**
 * 줄을 나누는 제어 문자(PowerPoint와 Word에서 Shift+Enter로 나눈 줄인 세로 탭 U+000B, 쪽 나눔, 줄 구분 문자)는 줄바꿈으로,
 * 그 밖의 제어 문자는 뺀다. 세로 탭이 그대로 들어가면 줄이 붙어 보였고, 장 그림(SVG)이 XML로 읽히지 않아 PPT 내보내기가 늘 실패했다
 */
function plainLines(text: string): string {
  return text.replace(/\r\n?|[\v\f\u0085\u2028\u2029]/g, '\n').replace(/[\u0000-\u0008\u000e-\u001f\u007f-\u009f]/g, '')
}

/** 칸에서 읽은 글: 붙여 넣기를 거치지 않고 끌어다 놓은 글에도 제어 문자가 있을 수 있다 */
function clean(text: string, multiline?: boolean): string {
  const t = plainLines(text).replace(/\u00a0/g, ' ')
  if (!t.trim()) return ''
  return multiline ? t : t.replace(/\s*\n\s*/g, ' ')
}

function Field({ value, hint, label, fieldId, onChange, as: Tag = 'div', className, fit, multiline, oneLine, units, numeral, fold, fitText, enterNext, optional, onPasteLines, keepParens, example, auto }: FieldProps) {
  const { mode } = useSlide()
  if (mode === 'final') {
    const text = value.trim() || auto?.trim() || ''
    if (!text) return null
    const one = oneLineProps(text, oneLine, units, numeral)
    return (
      <Tag className={cx(className, fitClass(fitText ?? text, fit), one.cls)} style={one.style}>
        <Shown text={text} numeral={numeral} parens={keepParens} />
      </Tag>
    )
  }
  // 접어 둔 빈칸은 발표할 때처럼 자리를 차지하지 않는다. 고른 부품의 '칸 더하기'로 연다
  if (fold && !value) return null
  const shown = value || auto || hint
  const one = oneLineProps(shown, oneLine, units, numeral)
  if (mode === 'preview' || !onChange) {
    return (
      <Tag className={cx(className, fitClass(fitText ?? shown, fit), one.cls, !value && !auto && 'is-hint')} style={one.style}>
        <Shown text={shown} numeral={numeral} parens={keepParens} />
      </Tag>
    )
  }
  return (
    <Editable
      value={value}
      hint={(!value && auto) || hint}
      auto={!value && !!auto}
      label={label}
      fieldId={fieldId}
      onChange={onChange}
      as={Tag}
      className={cx(className, fitClass(fitText ?? shown, fit), one.cls)}
      style={one.style}
      multiline={multiline}
      numeral={numeral}
      enterNext={enterNext}
      optional={optional}
      onPasteLines={onPasteLines}
      keepParens={keepParens}
      example={example && !!value}
    />
  )
}

function Editable({
  value,
  hint,
  label,
  fieldId,
  onChange,
  as: Tag = 'div',
  className,
  style,
  multiline,
  numeral,
  enterNext,
  optional,
  onPasteLines,
  keepParens,
  example,
  auto,
}: Omit<FieldProps, 'auto'> & { style?: CSSProperties; auto?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null)
  // 이 칸이 마지막으로 저장소에 보낸 값. 쓰는 동안 값이 이것과 다르게 바뀌면 바깥에서 바꾼 것이다(쓰다가 누른 되돌리기)
  const sent = useRef(value)

  // 입력 중에는 DOM을 건드리지 않는다. 되돌리기 같은 바깥 변경만 반영한다.
  // 쓰는 중이어도 바깥에서 값을 바꾸면 그 값으로 다시 그리고 커서를 글 끝에 둔다: 그대로 두면 화면의 글과 저장된 값이 달라서
  // 이어 친 글자가 되돌린 것을 도로 덮어썼다. 되돌린 글 뒤에 치던 빈칸은 남긴다(저장소에는 앞뒤 빈칸을 빼고 보내서, 빼면 이어 친 낱말이 붙는다)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    if (document.activeElement !== el) {
      sent.current = value
      paint(el, value, numeral, keepParens)
      return
    }
    if (value === sent.current) return
    sent.current = value
    const was = clean(el.innerText, multiline)
    const keep = !numeral && value && was.startsWith(value) ? /^[ \n]*/.exec(was.slice(value.length))![0] : ''
    paint(el, value + keep, numeral, keepParens)
    const sel = getSelection()
    sel?.selectAllChildren(el)
    sel?.collapseToEnd()
  }, [value, numeral, multiline, keepParens])

  return (
    <Tag className={cx(className, 'ed', !value && 'is-empty', optional && 'is-optional', example && 'is-example', auto && 'is-auto')} style={style} title={auto ? AUTO_TIP : undefined}>
      {/* 칸에 두르는 면과 점선. 넓이는 이웃한 칸과의 틈에 맞춘다 (halos.ts) */}
      <span className="ed-halo" aria-hidden="true" />
      <span className="ed-hint" aria-hidden="true">
        {numeral ? <Shown text={hint} numeral /> : hint}
      </span>
      <span
        ref={ref}
        className="ed-input"
        data-field={fieldId}
        contentEditable="plaintext-only"
        suppressContentEditableWarning
        role="textbox"
        // 안내 문구는 예시라서 채운 칸의 이름으로 쓰면 틀린 말을 읽는다(한 일을 채운 칸을 '배경'으로).
        // 이름은 칸의 이름('숫자 2 이름'), 예시는 aria-placeholder로 따로 준다
        aria-label={label || (value ? undefined : hint)}
        aria-placeholder={hint}
        aria-multiline={multiline || undefined}
        spellCheck={false}
        onInput={(e) => {
          // 앞뒤 빈칸은 빼고 보낸다(칸을 떠날 때도 뺀다). 빈칸째 보내면 쉬었다가 떠날 때 빈칸만 뺀 것이 되돌리기 한 단계로 따로 남아,
          // 떠난 뒤 누른 Ctrl+Z 한 번이 화면에서 아무것도 바꾸지 않았다. 빈칸만 쳐서 값이 그대로면 보내지 않는다.
          // 줄바꿈은 그대로 보낸다: 줄이 하나 늘어 장이 넘치는지를 저장된 값으로 다시 재서(SlideStage의 useOverflow), 빼면 Enter로
          // 늘었다가 떠날 때 지워진 빈 줄의 '글이 넘쳤어요'가 남았다
          const v = clean(e.currentTarget.innerText, multiline).replace(/^ +| +$/g, '')
          if (v === sent.current) return
          sent.current = v
          onChange!(v)
        }}
        onBlur={(e) => {
          const el = e.currentTarget
          const v = clean(el.innerText, multiline).trim()
          if (v !== value) {
            sent.current = v
            onChange!(v)
          }
          // 쓰는 동안 단위 칸(span) 안팎으로 들어간 글자를 다시 나눈다
          paint(el, v, numeral, keepParens)
          // 쓰는 동안 고르게 나누지 않던 줄이 다시 나뉘는 한 번은 겹쳐 바뀌게 (edit.css의 .ed-input:focus)
          liveRewrap(el)
          // 쓰기를 끝내면 칸 안의 커서와 고른 글을 놓는다. 그대로 두면 쓰지 않는 글 위에 파란 칠이 남고, 이어 친 글자가 초점 없는
          // 그 칸에 들어갔다(Esc나 Enter로 끝낸 뒤 한글로 친 글이 그 칸 끝에 붙어 저장됐다). 창을 떠날 때(다른 프로그램으로)는 두어야 돌아왔을 때 이어 쓴다
          const sel = getSelection()
          if (document.hasFocus() && sel?.anchorNode && el.contains(sel.anchorNode)) sel.removeAllRanges()
        }}
        onKeyDown={(e) => {
          // 한글을 조합하는 중의 Enter와 Esc는 조합을 끝내는 키다: 브라우저가 조합을 마친 뒤 같은 키를 한 번 더 보낸다. 그때 받는다
          // (조합 중에 다른 칸으로 옮기면 마지막 글자가 옮긴 칸에 한 번 더 들어가기도 한다. 조합 중의 Esc로 칸을 떠나면 마지막 글자가
          // 한 번 더 붙었고(괜찮아요요), 이어 온 Esc가 컴포넌트 고르기까지 끝냈다)
          if ((e.key === 'Enter' || e.key === 'Escape') && (e.nativeEvent.isComposing || e.keyCode === 229)) return
          if (e.key === 'Enter' && (!multiline || (enterNext && !e.shiftKey)) && focusNextItem(e.currentTarget)) {
            e.preventDefault()
            return
          }
          if ((e.key === 'Enter' && (!multiline || (enterNext && !e.shiftKey))) || e.key === 'Escape') {
            e.preventDefault()
            e.currentTarget.blur()
          }
          if (e.key === 'Tab' && !e.nativeEvent.isComposing && focusNextField(e.currentTarget, e.shiftKey ? -1 : 1)) e.preventDefault()
        }}
        onDoubleClick={(e) => selectWord(e.currentTarget, e.clientX, e.clientY)}
        // 예시 글은 누르면 전체를 고른다: 처음 친 글자가 예시를 덮어 쓴다(지우고 쓰지 않아도 된다)
        onFocus={example ? (e) => getSelection()?.selectAllChildren(e.currentTarget) : undefined}
        onMouseUp={
          example
            ? (e) => {
                const sel = getSelection()
                if (sel?.isCollapsed) sel.selectAllChildren(e.currentTarget)
              }
            : undefined
        }
        onPaste={(e) => {
          e.preventDefault()
          const raw = e.clipboardData.getData('text/plain')
          // 빈 항목 칸에 여러 줄(메일, 메모의 목록)을 붙이면 줄마다 다음 항목으로 나눈다. 글이 있는 칸에 붙이거나
          // 나눌 수 없으면(채울 칸에 글이 있거나 항목 수를 넘으면) 예전처럼 칸 하나에
          if (onPasteLines && !clean(e.currentTarget.innerText, multiline).trim() && onPasteLines(listLines(raw))) return
          document.execCommand('insertText', false, pastedText(raw, !!multiline))
        }}
      />
    </Tag>
  )
}

/**
 * 칸에 붙여 넣을 글. 서식 없이 글만 받고, 윈도우의 줄 끝(\r\n), 엑셀 칸 사이의 탭, 붙지 않는 빈칸은 보통 글로 바꾸고 앞뒤의
 * 빈 줄은 뺀다: 탭은 칸에서 넓은 빈칸으로 벌어졌고, 엑셀 칸 하나를 복사하면 끝에 줄바꿈이 붙어 와서 글 가운데에 붙이면 거기서
 * 줄이 갈렸다. 제어 문자는 plainLines가 줄바꿈으로 바꾸거나 뺀다. 한 줄 칸이면 줄바꿈을 빈칸으로
 */
export function pastedText(raw: string, multiline: boolean): string {
  const text = plainLines(raw)
    .replace(/[\t\u00a0]/g, ' ')
    .replace(/^\n+|\n+$/g, '')
  return multiline ? text : text.replace(/\s*\n\s*/g, ' ')
}

/**
 * 두 번 눌러 고른 낱말을 띄어 쓴 말 하나(어절)로 넓힌다(파워포인트처럼). 크롬은 숫자와 한글 사이도 낱말 경계로 봐서 '20분'을
 * 두 번 누르면 20만 골라 '30분'을 치면 '30분분'이 됐고, 칸의 마지막 글자 오른쪽 반을 두 번 누르면 아무것도 고르지 않아 친 글이
 * 뒤에 붙었다. 괄호, 따옴표, 문장 부호에서는 끊는다(숫자 사이의 쉼표, 점, 쌍점, 빗금은 숫자의 일부: 1,200명, 4.8억, 10:30).
 * 빈칸 위를 두 번 누른 것은 그대로 둔다.
 * 크롬은 낱말의 끝 글자 오른쪽 반을 두 번 누르면 낱말 대신 뒤의 빈칸 하나를 고른다(글자 커서가 낱말 끝에 서고, 거기서 다음 '낱말'인 빈칸을 잡는다).
 * 그래서 빈칸만 골랐으면 누른 자리(x, y)의 글자를 보고, 빈칸이 아닌 글자 위였으면 그 글자의 어절을 고른다. 예전에는 '상담 챗봇'의 '담'을
 * 두 번 누르면 빈칸이 골라져, 이어 친 글이 낱말을 바꾸지 않고 빈칸 자리에 들어갔다.
 * outside면 칸 밖을 두 번 누른 것(SlideStage): 누른 자리가 이 칸의 글자 위일 때만 고른다
 */
export function selectWord(el: HTMLElement, x?: number, y?: number, outside = false) {
  const sel = getSelection()
  if (!sel?.rangeCount || !sel.anchorNode || !el.contains(sel.anchorNode)) return
  const r = sel.getRangeAt(0)
  const marks = /[\s()[\]{}<>«»"'“”‘’,.!?;:…·/]/
  // 칸의 글에서 몇째 글자인지 (숫자 칸은 단위 칸(span)으로 나뉘어 글 마디가 여럿이다)
  const at = (node: Node, offset: number) => {
    const pre = document.createRange()
    pre.setStart(el, 0)
    pre.setEnd(node, offset)
    return pre.toString().length
  }
  const point = (n: number): [Node, number] => {
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    for (let t = walk.nextNode(); t; t = walk.nextNode()) {
      const len = (t as Text).length
      if (n <= len) return [t, n]
      n -= len
    }
    return [el, el.childNodes.length]
  }
  const text = el.textContent ?? ''
  const cut = (i: number) => marks.test(text[i]) && !(/[,.:/]/.test(text[i]) && /\d/.test(text[i - 1] ?? '') && /\d/.test(text[i + 1] ?? ''))
  let s = at(r.startContainer, r.startOffset)
  let e = at(r.endContainer, r.endOffset)
  // 빈칸이나 문장 부호만 골랐으면: 누른 자리가 그 앞뒤 글자 위였는지 본다. 정말 빈칸 위를 두 번 누른 것이면 그대로 둔다
  const picked = r.toString()
  // outside: 칸 밖(글자가 칸 상자 위아래로 나온 곳)을 두 번 누른 것. 크롬이 고른 것은 믿지 않고 누른 자리의 글자로만
  if (outside || (picked && [...picked].every((c) => marks.test(c)))) {
    // 고른 빈칸의 앞뒤 글자부터, 없으면 칸의 모든 글자에서
    const near = [s - 1, e, ...text.split('').map((_, i) => i)]
    const hit = x === undefined || y === undefined ? -1 : near.find((i) => i >= 0 && i < text.length && !cut(i) && charHas(point(i), point(i + 1), x, y))
    if (hit === undefined || hit < 0) return
    s = hit
    e = hit + 1
  }
  // 윈도우의 크롬은 낱말 뒤의 빈칸까지 고른다. 끊는 글자를 먼저 빼고 넓힌다
  while (s < e && cut(s)) s++
  while (e > s && cut(e - 1)) e--
  while (s > 0 && !cut(s - 1)) s--
  while (e < text.length && !cut(e)) e++
  if (s >= e) return
  sel.setBaseAndExtent(...point(s), ...point(e))
}

/** 글자 하나(from~to)가 그려진 네모에 (x, y)가 드는지. 줄 높이 안이면 위아래는 너그럽게 */
function charHas(from: [Node, number], to: [Node, number], x: number, y: number): boolean {
  const r = document.createRange()
  r.setStart(...from)
  r.setEnd(...to)
  return [...r.getClientRects()].some((q) => x >= q.left - 1 && x <= q.right + 1 && y >= q.top - 2 && y <= q.bottom + 2)
}

/**
 * 항목 칸의 Enter는 다음 항목의 같은 칸으로 (점 목록을 파워포인트처럼 Enter로 이어 쓰게). 예전에는 Enter가 쓰기를 끝내기만 해서
 * 이어 친 글이 들어갈 데 없이 사라졌다. 글 끝에 두어 채운 칸은 이어 쓴다. 마지막 항목이면 false(쓰기를 끝낸다).
 * 항목 칸의 id는 '앞머리 + 차례.키'다(IT, 부품 안이면 앞머리가 b.부품id.)
 */
function focusNextItem(from: HTMLElement): boolean {
  const m = /^((?:.*\.)?)(\d+)\.([^.]+)$/.exec(from.dataset.field ?? '')
  if (!m) return false
  const id = `${m[1]}${Number(m[2]) + 1}.${m[3]}`
  const next = from.closest('.slide')?.querySelector<HTMLElement>(`.ed-input[data-field="${CSS.escape(id)}"]`)
  if (!next || !next.getClientRects().length) return false
  next.focus()
  const sel = window.getSelection()
  if (sel) {
    sel.selectAllChildren(next)
    sel.collapseToEnd()
  }
  return true
}

/**
 * Tab, Shift+Tab으로 같은 장의 다음(앞) 글 칸으로. 표에서 다음 칸으로 가듯 이어 쓸 수 있게.
 * 그대로 두면 칸 사이의 항목 손잡이, 빼기 단추에 초점이 멈춰서, 이어 친 글이 엉뚱한 칸에 들어갔다(추이의 기간 이름).
 * 옮긴 칸에서는 커서를 글 끝에 둔다(Enter로 다음 항목에 갈 때와 같다). 예전에는 글을 모두 골라서, 이미 적힌 줄 이름('지금의 문제')에
 * Tab으로 들어간 채 치면 그 이름이 통째로 지워졌다. 통째로 바꾸려면 Ctrl+A. 장의 첫 칸, 마지막 칸에서는 브라우저에 맡긴다
 */
function focusNextField(from: HTMLElement, dir: 1 | -1): boolean {
  const slide = from.closest('.slide')
  if (!slide) return false
  const all = [...slide.querySelectorAll<HTMLElement>('.ed-input')].filter((el) => el.getClientRects().length > 0)
  const next = all[all.indexOf(from) + dir]
  // 컴포넌트의 글을 다 돈 다음에는 크기 조절선도 키보드로 찾을 수 있어야 한다. 글 칸 사이는 그대로 건너뛴다.
  const area = slide.querySelector<HTMLElement>('.bk-area.is-live')
  const lines = area ? [...area.querySelectorAll<HTMLElement>('.bk-line[tabindex="0"]')].filter((el) => el.getClientRects().length > 0) : []
  if (area && lines.length && (dir === 1 ? area.contains(from) && !area.contains(next ?? null) : !area.contains(from) && !!next && area.contains(next))) {
    lines[dir === 1 ? 0 : lines.length - 1].focus()
    return true
  }
  if (!next) return false
  next.focus()
  const sel = window.getSelection()
  if (sel) {
    sel.selectAllChildren(next)
    sel.collapseToEnd()
  }
  return true
}

/** 비워 둬도 되는 칸인지. 비워 두면 정해진 이름(목표, 실적)으로 보이는 칸은 그 이름이 글처럼 보여야 해서 옅게 하지 않는다 */
function isOptional(spec: { fields: { key: string; optional?: boolean; named?: boolean }[] }, k: string): boolean {
  const f = spec.fields.find((x) => x.key === k)
  return !!f?.optional && !f.named
}

/** 슬라이드 칸 또는 덱 단위 값(`$org` 등) */
export function T({ k, auto, ...props }: TextProps & { k: string; auto?: string }) {
  const { slide, meta, actions, fieldPrefix = '', folds, labels, examples } = useSlide()
  if (!fieldPrefix && slide.options.hideHead === true && (k === 'title' || k === 'lead')) return null
  return (
    <Field
      value={readField(slide, meta, k)}
      hint={hintFor(slide.layout, slide.hints, k)}
      label={labelIn(labels ?? LAYOUTS[slide.layout], k)}
      // 장의 칸은 빈칸을 세는 규칙(deck/fields.ts)으로: 프레임 잡기가 안내를 정해 준 컴포넌트 장의 제목은 이제 빈칸으로 세는데도 '비워도 되는
      // 칸'의 옅은 회색으로 그려졌다(처음 쓰는 사람 검수). 컴포넌트의 칸은 그 컴포넌트의 칸 목록으로
      optional={fieldPrefix ? isOptional(labels ?? LAYOUTS[slide.layout], k) : looksOptional(slide, k)}
      fieldId={fieldPrefix + k}
      onChange={actions && ((v) => actions.setField(k, v))}
      fold={folds?.has(k)}
      example={!!fieldPrefix && !!examples?.includes(k)}
      auto={auto}
      {...props}
    />
  )
}

/** 항목 칸 */
export function IT({ i, k, ...props }: TextProps & { i: number; k: ItemKey }) {
  const { slide, mode, actions, fieldPrefix = '', folds, labels } = useSlide()
  // 글자 수 단계는 목록에서 가장 긴 항목으로 모두 같이 고른다: 항목마다 고르면 긴 이름만 한 단계 작아져
  // 나란한 항목의 제목 크기가 줄마다 달랐다(핵심 포인트의 세 제목이 44, 44, 52px)
  const fitText = props.fit
    ? slide.items
        .map((it, j) => (mode === 'final' ? (it[k] ?? '').trim() : it[k] || rowHint(slide.layout, slide.hints, it, k, j)))
        .reduce((a, t) => ([...t].length > [...a].length ? t : a), '')
    : undefined
  return (
    <Field
      value={slide.items[i]?.[k] ?? ''}
      hint={rowHint(slide.layout, slide.hints, slide.items[i], k, i)}
      label={labelIn(labels ?? LAYOUTS[slide.layout], k, k, i)}
      optional={!!(labels ?? LAYOUTS[slide.layout]).items?.fields.find((f) => f.key === k)?.optional}
      fieldId={`${fieldPrefix}${i}.${k}`}
      onChange={actions && ((v) => actions.setItem(i, k, v))}
      onPasteLines={actions?.pasteItems && k !== 'image' ? (lines) => actions.pasteItems!(i, k, lines) : undefined}
      fold={folds?.has(`items.${k}`)}
      fitText={fitText}
      {...props}
    />
  )
}

/** 이름표가 붙은 덱 단위 값. 발표 때 비어 있으면 줄째로 숨긴다. */
export function MetaRow({ label, k }: { label: string; k: string }) {
  const { slide, meta, mode } = useSlide()
  if (mode === 'final' && !readField(slide, meta, k).trim()) return null
  return (
    <div className="meta-row">
      <dt>{label}</dt>
      <dd>
        <T k={k} as="span" />
      </dd>
    </div>
  )
}

interface ImageProps {
  k?: string
  i?: number
  className?: string
  contain?: boolean
  optional?: boolean
}

export function ImageSlot({ k = 'image', i, className, contain, optional }: ImageProps) {
  const { slide, meta, mode, actions } = useSlide()
  const value = i === undefined ? readField(slide, meta, k) : (slide.items[i]?.image ?? '')
  const hint = i === undefined ? hintFor(slide.layout, slide.hints, k) : hintFor(slide.layout, slide.hints, 'image', 'image', i)
  const fitCls = contain ? 'is-contain' : 'is-cover'

  if (mode !== 'edit' || !actions) {
    if (value)
      return (
        <div className={cx('img', fitCls, className)}>
          <img src={value} alt="" />
        </div>
      )
    // 비워 둬도 되는 그림 칸(표지와 사례의 로고)은 미리 보기에서도 발표 화면처럼 그리지 않는다.
    // 회색 면에 '회사 로고'가 늘 깔리면 채워야 하는 칸처럼 보였고, 장 목록의 작은 그림과 발표 화면이 달랐다
    if (optional) return null
    return <div className={cx('img img-empty', className)}>{mode === 'preview' && <span>{hint}</span>}</div>
  }

  const set = (v: string) => (i === undefined ? actions.setField(k, v) : actions.setItem(i, 'image', v))
  return <EditableImage value={value} hint={hint} set={set} className={cx(fitCls, className)} optional={optional} />
}

function EditableImage({ value, hint, set, className, optional }: { value: string; hint: string; set: (v: string) => void; className?: string; optional?: boolean }) {
  const [over, setOver] = useState(false)
  const choose = async () => {
    const file = await pickImage()
    if (file) set(await imageToDataUrl(file))
  }
  return (
    <div
      className={cx('img img-ed', className, !value && 'img-empty', !value && optional && 'is-optional', over && 'is-over')}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={async (e) => {
        e.preventDefault()
        setOver(false)
        const file = e.dataTransfer.files[0]
        if (file?.type.startsWith('image/')) set(await imageToDataUrl(file))
      }}
    >
      {value ? (
        <>
          <img src={value} alt="" />
          <div className="img-tools">
            <button type="button" onClick={choose}>
              바꾸기
            </button>
            <button type="button" onClick={() => set('')}>
              지우기
            </button>
          </div>
        </>
      ) : (
        <button type="button" className="img-drop" onClick={choose}>
          <svg className="img-drop-i" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 5h16v14H4zM4 16l5-5 4 4 2-2 5 5M15.5 7.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3z" />
          </svg>
          <span className="img-drop-t">{hint}</span>
          <span className="img-drop-s">눌러서 고르거나 끌어다 놓아요. {keys('mod+V')}로 붙여 넣어도 돼요</span>
        </button>
      )}
    </div>
  )
}

/** 컴포넌트 안 항목의 도구를 항목 끝에서 띄우는 너비 (화면 px, edit.css의 6px / --vs와 같다) */
const TOOL_PAD = 6

/**
 * 항목 안 글자가 그려진 네모들 (화면 px). 도구가 덮으면 그 글을 눌러 고칠 수 없다.
 * 글자 줄의 상자는 글자보다 위아래로 크다(숫자는 위아래 5분의 1이 빈다): 상자 그대로 피하면 큰 숫자 위의 빈 곳에도 도구를 두지 못해
 * 막대 위로 밀려났다. 위아래를 높이의 12%씩 줄여 한글 글자의 끝에 맞춘다
 */
function textLines(root: Element): DOMRect[] {
  const out: DOMRect[] = []
  const range = document.createRange()
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    // 숨은 편집 표시(항목 도구, 칸 왼쪽 위의 끌기 이름표)의 글은 그려진 글이 아니다
    if (!n.nodeValue?.trim() || n.parentElement?.closest('.it-grip, .it-remove, .bk-handle')) continue
    range.selectNodeContents(n)
    for (const r of range.getClientRects()) if (r.width && r.height) out.push(new DOMRect(r.left, r.top + r.height * 0.12, r.width, r.height * 0.76))
  }
  return out
}

/** 항목 안에 칠한 그림(막대, 점, 칸)의 네모들 (화면 px). 항목 자신의 옅은 면(손을 올렸을 때)과 도구는 뺀다 */
function figureRects(item: HTMLElement): DOMRect[] {
  const out: DOMRect[] = []
  for (const el of item.querySelectorAll<HTMLElement | SVGElement>('*')) {
    if (el.closest('.it-grip, .it-remove, .ed-halo') || (el instanceof SVGElement && el.ownerSVGElement)) continue
    const s = getComputedStyle(el)
    const painted = el.matches('svg, img, canvas') || (s.backgroundColor !== 'transparent' && !/rgba\(.*,\s*0\)$/.test(s.backgroundColor)) || s.backgroundImage !== 'none'
    if (!painted) continue
    const r = el.getBoundingClientRect()
    if (r.width && r.height) out.push(r)
  }
  return out
}

/** 항목 도구 묶음(손잡이와 빼기)의 너비와 높이 (화면 px). 숨어 있어도(투명) 자리는 잡혀 있다 */
function toolsSize(item: HTMLElement): { w: number; h: number } | null {
  const tools = [...item.querySelectorAll<HTMLElement>(':scope > :is(.it-grip, .it-remove)')]
  if (!tools.length) return null
  const sizes = tools.map((t) => t.getBoundingClientRect())
  return { w: sizes.reduce((s, r) => s + r.width, 0) + (tools.length - 1) * 4, h: Math.max(...sizes.map((r) => r.height)) }
}

/** 고른 컴포넌트의 끌기 이름표 자리 (화면 px). 그 밑에 깔린 항목 도구는 보여도 누를 수 없다 (도구 막대는 장 아래 도구 줄에 있다) */
const barRect = () => document.querySelector('.ed-canvas .bk.is-selected > .bk-handle:not([data-at="none"])')?.getBoundingClientRect()

/**
 * 컴포넌트 안 항목의 도구(↕, ✕)를 둘 자리 (캔버스 px): 항목 오른쪽 끝에서 도구 묶음 오른쪽 끝까지(right, 항목 밖이면 음수), 항목 위 끝에서
 * 도구 위 끝까지(top), 그리고 항목 상자가 컴포넌트 테두리 오른쪽 밖으로 나간 너비(out).
 * 항목 오른쪽 위에 그대로 두면 막대 비교의 값(96)처럼 줄 끝에 선 글을 덮어 그 글을 눌러 고칠 수 없었고, 남는 너비만큼 옮긴
 * 단(fitBlocks의 balance)의 항목은 상자가 장 오른쪽 밖까지 걸쳐 도구가 장 밖에 그려져 보이지 않았다(점 목록의 항목을 뺄 수 없었다).
 * 그래서 항목 상자 안(칸과 장 안)에서, 글과 도구 막대를 덮지 않는 곳 가운데 그린 것의 오른쪽 위 끝에 가장 가까운 곳을 찾는다.
 * 막대 같은 그림도 되도록 피한다(글처럼 막지는 않는다). 상자 안에 자리가 없으면 항목 바로 옆이나 위아래 밖의 빈 곳에
 * 붙여 둔다: 손이 항목을 떠나면 도구가 숨으므로 항목과 도구 사이를 띄우지 않는다.
 * 그런 곳이 없으면 테두리 안 오른쪽 위 (clear가 거짓)
 */
function toolsSpot(item: HTMLElement): { right: number; top: number; out: number; clear: boolean } | null {
  const cell = item.closest<HTMLElement>('.bk')
  const size = toolsSize(item)
  if (!cell || !size) return null
  const { w, h } = size
  const ir = item.getBoundingClientRect()
  const k = item.offsetWidth ? ir.width / item.offsetWidth : 1
  const frame = frameRect(cell)
  // 도구보다 조금 큰 낮은 항목은 위아래 가운데에: 6px씩 띄우면 도구가 항목 아래로 삐져나와 아랫줄 글에 걸쳤다
  const pad = Math.min(TOOL_PAD, Math.max(0, (ir.height - h) / 2))
  // 항목 상자 가운데 칸과 장 안인 곳만: 남는 너비만큼 옮긴 단의 항목은 상자가 장 밖까지 걸쳤다
  const box = cell.getBoundingClientRect()
  const page = item.closest('.slide')?.getBoundingClientRect() ?? box
  const right = Math.min(ir.right, box.right, page.right) - TOOL_PAD
  const left = Math.max(ir.left, box.left, page.left) + TOOL_PAD
  // 테두리 안 오른쪽 끝에 가까울수록 싸다. 글이 꽉 찬 한 줄 항목(좁은 점 목록)은 테두리 바로 밖, 항목 상자 안의 빈 곳에 선다
  // (테두리에 걸치지 않게, 안쪽 자리보다 조금 비싸게)
  const anchor = Math.min(right, frame.right - TOOL_PAD)
  const top = ir.top + pad
  const bottom = Math.max(top, ir.bottom - pad - h)
  const bar = barRect()
  const lines = [...textLines(item), ...(bar ? [bar] : [])]
  const figures = figureRects(item)
  const hits = (list: DOMRect[], x: number, y: number) => list.some((r) => r.left < x + 2 && r.right > x - w - 2 && r.top < y + h + 2 && r.bottom > y - 2)
  const spot = (x: number, y: number, clear = true) => ({
    right: (ir.right - x) / k,
    top: (y - ir.top) / k,
    out: Math.max(0, (ir.right - frame.right) / k),
    clear,
  })
  // 오른쪽 위에서 멀어질수록 비싸다. 아래로 내려가는 것을 옆으로 가는 것보다 비싸게 (같은 줄 끝에 있어야 그 항목의 도구로 읽힌다)
  let best = { x: anchor, y: top, cost: Infinity }
  for (let y = top; y <= bottom; y += 4)
    for (let x = right; x - w >= left; x -= 4) {
      if (x > anchor && x - w < frame.right + TOOL_PAD) continue
      const cost = (x > anchor ? x - anchor + 30 : anchor - x) + 3 * (y - top) + (hits(figures, x, y) ? 400 : 0)
      if (cost < best.cost && !hits(lines, x, y)) best = { x, y, cost }
    }
  if (Number.isFinite(best.cost)) return spot(best.x, best.y)
  // 상자 안에 자리가 없으면(좁은 단의 예상 질문처럼 첫 줄이 꽉 찬 항목) 항목 바로 오른쪽, 왼쪽, 그다음 바로 위, 아래(오른쪽 끝에 맞춰).
  // 장 안이고 장의 다른 글(이웃 컴포넌트의 글도)과 도구 막대를 덮지 않는 곳에. 장만 넘친 것을 자르고 칸은 자르지 않는다
  const ink = [...textLines(item.closest('.slide') ?? cell), ...(bar ? [bar] : [])]
  const end = Math.min(ir.right, frame.right) - TOOL_PAD
  const near = [
    [ir.right + w, top],
    [ir.left, top],
    [end, ir.top - h],
    [end, ir.bottom],
  ]
  for (const [x, y] of near)
    if (x - w >= page.left && x <= page.right && y >= page.top && y + h <= page.bottom && !hits(ink, x, y)) return spot(x, y)
  return spot(end, top, false)
}

/**
 * 가로로 놓인 낮은 항목의 도구를 항목 바로 위(above)나 아래(below)에 둘 수 있는지: 그 자리에 글과 도구 막대가 없고, 위라면 테두리 안이면.
 * 아래로 내면 고른 컴포넌트 바로 아래에 뜨는 도구 막대와 겹쳐(단계 표시의 단계 이름, 추이의 기간) 도구를 누를 수 없었다
 */
function roomBeside(item: HTMLElement, side: 'above' | 'below'): boolean {
  const cell = item.closest<HTMLElement>('.bk')
  const size = toolsSize(item)
  if (!cell || !size) return false
  const ir = item.getBoundingClientRect()
  const spot = new DOMRect(ir.left + (ir.width - size.w) / 2, side === 'above' ? ir.top - size.h : ir.bottom, size.w, size.h)
  if (side === 'above' && spot.top < frameRect(cell).top) return false
  const bar = barRect()
  return ![...textLines(cell), ...(bar ? [bar] : [])].some((r) => r.left < spot.right && r.right > spot.left && r.top < spot.bottom && r.bottom > spot.top)
}

/** 이 항목이 든 목록이 가로로 놓였는지 (앞의 두 항목이 옆으로 놓였으면) */
function itemsAcross(item: HTMLElement): boolean {
  const list = [...(item.parentElement?.children ?? [])].filter((c) => c.classList.contains('it'))
  if (list.length < 2) return false
  const a = list[0].getBoundingClientRect()
  const b = list[1].getBoundingClientRect()
  return Math.abs(b.left - a.left) > Math.abs(b.top - a.top)
}

/**
 * 항목 위에 올리면 보이는 도구: 왼쪽 위의 손잡이(끌어 순서 바꾸기), 오른쪽 위의 빼기.
 * 컴포넌트 안에서는 둘 다 항목 안쪽 오른쪽 위에 모은다 (edit.css).
 * 자리가 값으로 정해지는 항목(위치 비교의 점)은 순서가 보이지 않아 손잡이를 두지 않는다.
 * keepBlank면 발표할 때 칸이 빈 항목도 감추지 않는다: 단계 표시의 점, 막대 차트의 빈 칸(축)처럼 빈 항목의 자리도 뜻이 있는 부품
 */
export function ItemTools({ i, sort = true, keepBlank = false }: { i: number; sort?: boolean; keepBlank?: boolean }) {
  const { mode, actions, canRemoveItem, slide } = useSlide()
  const move = actions?.moveItem
  const grip = mode === 'edit' && sort && !!move && slide.items.length > 1
  const gripRef = useRef<HTMLButtonElement>(null)
  const removeRef = useRef<HTMLButtonElement>(null)
  // 손잡이 그림은 항목이 놓인 쪽으로: 세로로 쌓인 목록은 위아래, 가로로 놓인 목록은 좌우 화살표.
  // 좁은 칸에서는 같은 목록이 가로에서 세로로 짜임을 바꾸므로, 그릴 때마다 재지 않고 항목에 올리거나 도구로 들어올 때 잰다.
  // 손잡이가 없는 항목(하나만 남은 목록)도 빼기 단추의 자리는 잰다
  useEffect(() => {
    const el = gripRef.current
    const item = (el ?? removeRef.current)?.closest<HTMLElement>('.it')
    if (!item) return
    const look = (e?: Event) => {
      const axis = itemsAcross(item) ? 'x' : 'y'
      if (el && el.dataset.axis !== axis) el.dataset.axis = axis
      // 손으로 누를 때 받는 초점(focus)에서는 자리를 다시 재지 않는다: 손을 올릴 때 잰 뒤에 테두리나 도구 막대가 바뀌어 있으면
      // 누르는 순간 ✕가 옆으로 옮겨 가서, 손을 뗄 때는 ✕ 밖이라 눌리지 않았다. 키보드로 들어올 때(손이 항목 밖)만 잰다
      if (e?.type === 'focus' && item.matches(':hover')) return
      // 컴포넌트 안에서는 글을 덮지 않고 테두리 안에 서는 자리로 (toolsSpot)
      const spot = item.closest('.bk') ? toolsSpot(item) : null
      // 가로로 놓인 낮은 항목(차트 아래의 기간 이름 같은)에 그런 자리가 없으면 도구를 항목 밖 가운데로 낸다: 항목이 도구보다
      // 낮으면 안쪽 오른쪽 위의 도구가 글을 덮어 이름을 눌러 고칠 수 없었다(화면 px로 잰다, 도구는 22px).
      // 위에 자리가 있으면 위로, 없으면 아래로, 둘 다 막혔으면 안쪽 그대로 (roomBeside)
      const low = axis === 'x' && item.getBoundingClientRect().height < 48
      const side = !low || spot?.clear ? '' : roomBeside(item, 'above') ? 'above' : roomBeside(item, 'below') ? 'below' : ''
      if ((item.dataset.tools ?? '') !== side) {
        if (side) item.dataset.tools = side
        else delete item.dataset.tools
      }
      // 값이 그대로면 쓰지 않는다: 항목의 스타일을 바꾸면 장을 다시 맞춘다(blocks.tsx의 BlockArea가 본문 상자 안의 바뀜을 지켜본다)
      const at = side ? null : spot
      for (const [name, v] of [
        ['--it-tools-r', at?.right],
        ['--it-tools-t', at?.top],
        ['--it-out-r', at?.out],
      ] as const) {
        const value = v === undefined ? '' : `${Math.round(v)}px`
        if (item.style.getPropertyValue(name) === value) continue
        if (value) item.style.setProperty(name, value)
        else item.style.removeProperty(name)
      }
    }
    const tools = [el, removeRef.current].filter((t): t is HTMLButtonElement => !!t)
    // 항목의 칸에 쓰기를 끝내면 다시 잰다: 쓰는 동안은 도구를 숨기는데(edit.css), 손을 올릴 때 잰 자리 그대로 다시 띄우면
    // 방금 쓴 긴 글 위에 서서 글을 고치려고 누르면 빼기가 눌렸다. 본문 상자가 붙잡아 둔 자리를 놓고 다시 맞춘 뒤(blocks.tsx의
    // BlockArea가 다음 프레임에 다시 그린다) 잰다
    const done = (e: FocusEvent) => {
      if ((e.target as HTMLElement).classList?.contains('ed-input')) requestAnimationFrame(() => requestAnimationFrame(() => look()))
    }
    item.addEventListener('pointerenter', look)
    item.addEventListener('focusout', done)
    tools.forEach((t) => t.addEventListener('focus', look))
    return () => {
      item.removeEventListener('pointerenter', look)
      item.removeEventListener('focusout', done)
      tools.forEach((t) => t.removeEventListener('focus', look))
    }
  }, [grip, canRemoveItem])
  // 발표할 때는 도구 대신, 칸을 하나도 채우지 않은 항목에 표시를 둔다. 그런 항목은 가장 적은 항목 수를 채우려고 남긴 자리라
  // (deck/fields.ts의 presentable) 빈 칸이 다 빠지고 번호, 글머리, 점, 꺾쇠 같은 표시만 덩그러니 남았다.
  // 표시가 든 항목은 자리만 남기고 감춘다(styles/base.css의 .it-empty)
  if (mode === 'final') return !keepBlank && slide.items[i] && isBlankItem(slide.items[i]) ? <i className="it-empty" hidden /> : null
  if (mode !== 'edit' || !actions) return null
  if (!grip && !canRemoveItem) return null
  return (
    <>
      {grip && move && (
        <button
          ref={gripRef}
          type="button"
          className="it-grip"
          data-i={i}
          aria-label={`${i + 1}번째 항목. 끌거나 화살표 키로 순서를 바꿔요`}
          title="끌어서 순서 바꾸기"
          onPointerDown={(e) => {
            if (e.button !== 0) return
            e.preventDefault()
            e.stopPropagation()
            // 누르기를 막으면 초점이 그대로 남아서, 누른 뒤 화살표 키(손잡이의 설명대로)가 듣지 않고 쓰던 칸에 글이 들어갔다
            e.currentTarget.focus({ preventScroll: true })
            startItemDrag(e.nativeEvent, e.currentTarget, i, move)
          }}
          onKeyDown={(e) => {
            const d = e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : 0
            const list = e.currentTarget.closest('.it')?.parentElement
            const n = list?.querySelectorAll(':scope > .it > .it-grip').length ?? 0
            if (!d || i + d < 0 || i + d >= n) return
            e.preventDefault()
            move(i, i + d)
            // 옮긴 항목의 손잡이에 초점을 둬서 화살표를 이어 누를 수 있게
            requestAnimationFrame(() => list?.querySelector<HTMLElement>(`:scope > .it > .it-grip[data-i="${i + d}"]`)?.focus())
          }}
        >
          {/* 컴포넌트나 판을 옮기는 손잡이(점 여섯)와 같은 그림이면 무엇을 옮기는지 헷갈려서, 순서를 바꾸는 화살표로 */}
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 4.5v15M8.5 8L12 4.5 15.5 8M8.5 16l3.5 3.5 3.5-3.5" />
          </svg>
        </button>
      )}
      {canRemoveItem && (
        <button
          ref={removeRef}
          type="button"
          className="it-remove"
          aria-label="이 항목 지우기"
          title="이 항목 지우기"
          onClick={(e) => {
            // 두 번 누르기의 둘째 누름은 받지 않는다: 고르지 않은 컴포넌트를 누르면 골라지면서 손 아래에 ✕가 뜨는데, 그 자리를
            // 두 번 누르면 둘째 누름이 ✕를 눌러 항목이 빠졌다. ✕를 두 번 눌러도 한 항목만 빠진다(빠진 자리로 올라온 다음 항목의 ✕가 눌리지 않게)
            if (e.detail > 1) return
            actions.removeItem(i)
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      )}
    </>
  )
}

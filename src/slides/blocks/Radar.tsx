// 부품: 방사형 비교 (radar). 모양은 styles/blocks/radar.css, 움직임은 motion/engine.ts의 nativeAuto, 셈은 slides/radar.ts

import type { CSSProperties } from 'react'
import { BLOCKS } from '../../deck/blocks'
import { readField } from '../../deck/fields'
import { rowHint } from '../../deck/layouts'
import { cx } from '../../lib/cx'
import { useSlide } from '../context'
import { IT, ItemTools, numberUnits, T, textUnits } from '../fields'
import { formatNumber, readNumber, seriesIn } from '../numbers'
import { RADAR_R, radarAxes, radarBox, radarMax, radarPick, radarPoints, radarRatio } from '../radar'
import { Label } from '../layouts/parts'
import { Numeral } from './parts'

/** 견줄 대상의 이름을 비웠을 때의 이름: 점수를 견주는 흔한 짝 */
const BASE_NAME = '목표'
/** 옆에 서는 이름표의 글 폭(em): 이보다 긴 기준 이름은 꺾인다. radar.css의 이름표 max-width와 같은 값 */
const SIDE_EM = 7
/** 위아래 꼭짓점의 이름표(이름과 값이 한 줄)의 글 폭(em). radar.css의 위아래 이름표 max-width와 같은 값 */
const POLE_EM = 12
/** 이름표의 줄 높이 (radar.css의 .bk-rdr-plot) */
const LINE = 1.3
/** 강조한 기준의 값은 한 단계 큰 글자(radar.css: 본문 글자 ÷ 작은 글자, 30 ÷ 26): 그 이름표의 폭과 높이를 이만큼 더 센다 */
const HL = 1.16

/**
 * 방사형 비교: 기준마다 가운데에서 바깥으로 뻗은 축에 값을 찍고 이은 다각형. 어느 쪽이 부풀고 어느 쪽이 꺼졌는지가 모양으로 보여서,
 * 기준이 넷에서 여덟인 진단(팀, 서비스, 안 하나의 여러 면)을 막대 여럿보다 한눈에 읽는다. 답은 꺼진 곳(또는 부푼 곳) 하나라, 그 축과
 * 이름표만 강조색이고, 한 줄을 다 쓰는 넓은 칸에서는 소제목 아래에 그 기준을 큰 숫자로 한 번 더 말하고 그림은 오른쪽에서 칸 높이를 다 쓴다.
 * 견줄 값(목표, 지난 분기)을 적으면 채우지 않은 점선 다각형으로 겹친다: 둘 다 칠하면 겹친 곳의 색이 셋이 되어 어느 쪽이 지금인지 흐렸다.
 * 그림 상자는 바깥 틀에 딱 맞추고(셋이면 아래로 반지름의 반만 쓴다) 이름표는 축 끝 바깥에 선다. 반지름은 칸의 너비와 높이에서
 * 이름표의 자리를 뺀 만큼(radar.css의 --rdr-r): 이름표의 폭은 여기서 글자 수로 어림해 넘긴다(--rdr-rx)
 */
export function Radar() {
  const { slide, meta, mode, folds } = useSlide()
  const items = slide.items.slice(0, BLOCKS.radar.items!.max)
  const n = items.length
  // 편집할 때 아직 적지 않은 이름과 값은 안내 예시로 그린다(넣자마자 어떤 그림인지 보이게). 기준째 비었을 때만 예시로 그리면, 이름을
  // 하나 적는 순간 그 기준의 값이 없어 다각형이 통째로 사라졌다
  const hintOf = (i: number, k: 'title' | 'value' | 'meta') => (mode !== 'final' ? rowHint(slide.layout, slide.hints, items[i], k, i) : '')
  // 견줄 값 칸은 '칸 더하기'로 열었거나 이미 적은 값이 있을 때만 (비어서 접힌 칸은 발표할 때처럼 자리를 차지하지 않는다)
  const metaOpen = mode === 'edit' && (!folds?.has('items.meta') || items.some((it) => it.meta.trim()))
  const text = (i: number, k: 'title' | 'value' | 'meta') => (items[i][k].trim() || (k !== 'meta' || metaOpen ? hintOf(i, k) : '')).trim()
  // 예시 값이 섞인 그림은 옅게 그린다
  const demo = mode !== 'final' && items.some((it) => !it.value.trim())
  const names = items.map((_, i) => text(i, 'title'))
  const valueTexts = items.map((_, i) => text(i, 'value'))
  const metaTexts = items.map((_, i) => text(i, 'meta'))
  const maxText = readField(slide, meta, 'max').trim()
  // 값, 견줄 값, 만점을 한 잣대로 읽는다: 하나만 단위가 달라도('4.2'와 '80%') 한 그림에 놓을 수 없다
  const series = seriesIn([...valueTexts, ...metaTexts, maxText])
  const values = series.values.slice(0, n)
  const metas = series.values.slice(n, 2 * n)
  const fit = (v: number | null): v is number => v !== null && v >= 0
  const wrong = !series.ok || [...valueTexts, ...metaTexts].some((t, j) => !!t && !fit(series.values[j])) || (!!maxText && !((readNumber(maxText) ?? 0) > 0))
  const drawn = n >= 3 && !wrong && values.every(fit)
  const compared = drawn && metas.every(fit)
  const max = radarMax([...values, ...metas].filter(fit), maxText ? (series.values[2 * n] ?? null) : null)
  const axes = radarAxes(n)
  const { xm, ym } = radarBox(axes)
  const pick = drawn ? radarPick(values, slide.variant === 'high' ? 'high' : 'low', slide.options.highlight) : -1
  const auto = pick >= 0 && !Number.isInteger(slide.options.highlight)
  const cx0 = xm * RADAR_R
  const ratios = values.map((v) => (fit(v) ? radarRatio(v, max) : 0))

  // 이름표의 폭과 높이(em)를 글자 수로 어림한다: 옆의 이름표는 이름 아래 값, 위아래 꼭짓점은 이름과 값이 한 줄
  const baseName = readField(slide, meta, 'base').trim() || BASE_NAME
  const nameW = names.map((t) => textUnits(t || '기준'))
  const valueW = valueTexts.map((t, i) => numberUnits(t || '0') * (i === pick ? HL : 1))
  const extra = metaOpen ? 1 : 0
  const pole = axes.map((a) => Math.abs(a.x) < 0.02)
  const sideW = (i: number) => Math.max(Math.min(SIDE_EM, nameW[i]), valueW[i], metaOpen ? textUnits(baseName) + 3 : 0) * 1.05 + 0.3
  const sideLines = (i: number) => Math.min(3, Math.ceil(nameW[i] / SIDE_EM)) + (i === pick ? HL : 1) + extra
  // 기준이 일곱 이상이면 위아래 꼭짓점도 이름 아래 값으로 쌓는다: 바로 옆 축이 45도 안쪽이라 한 줄로 눕힌 이름표가 옆 이름표와 겹쳤다
  const stacked = n >= 7
  const poleLines = (i: number) => (stacked ? sideLines(i) : (nameW[i] + 0.4 + valueW[i] <= POLE_EM - 0.5 ? (i === pick ? HL : 1) : Math.min(3, Math.ceil(nameW[i] / POLE_EM)) + (i === pick ? HL : 1)) + extra)
  // 반지름의 가로 한계: 옆 이름표마다 '가운데에서 이름표 끝까지'가 칸 너비의 반에 들어야 한다
  const rx = axes.flatMap((a, i) => (pole[i] ? [] : [`(50cqw - ${sideW(i).toFixed(2)}em) / ${Math.abs(a.x).toFixed(4)} - var(--rdr-gap)`]))
  // 위아래로 이름표가 쓰는 높이: 위는 첫 기준의 이름표. 아래는 맨 아래 꼭짓점의 이름표, 꼭짓점이 없으면(홀수) 가장 아래 두 이름표가 걸친 만큼
  const low = axes.map((a, i) => (a.y > ym - 0.02 ? i : -1)).filter((i) => i >= 0)
  const below = Math.max(...low.map((i) => (pole[i] ? poleLines(i) : sideLines(i) * (0.5 + 0.5 * ym)))) * LINE
  const vars = {
    '--rdr-xm': xm.toFixed(4),
    '--rdr-ym': ym.toFixed(4),
    '--rdr-rx': `min(${rx.join(', ')})`,
    '--rdr-v': (poleLines(0) * LINE + below).toFixed(2),
    '--rdr-top': (poleLines(0) * LINE).toFixed(2),
    '--rdr-bot': below.toFixed(2),
  } as CSSProperties

  const showMax = !!maxText || drawn || (mode === 'edit' && !folds?.has('max'))
  const showBase = compared || metaOpen
  const origin: CSSProperties = { transformBox: 'view-box', transformOrigin: `${cx0.toFixed(3)}px ${RADAR_R}px` }
  const end = (i: number, r: number) => ({ x: cx0 + axes[i].x * RADAR_R * r, y: RADAR_R + axes[i].y * RADAR_R * r })
  return (
    <div className={cx('bk-rdr', demo && 'is-demo', stacked && 'is-stacked')} data-n={n} style={vars}>
      <T k="heading" as="h3" className="bk-h" fit={[18, 32]} multiline />
      {(showMax || showBase) && (
        <div className="bk-cc-key bk-rdr-key">
          {showBase && (
            <span className="bk-cc-lk bk-rdr-lk">
              <i aria-hidden="true" />
              <Label k="base" fallback={BASE_NAME} />
            </span>
          )}
          {showMax && (
            <span className="bk-cc-u">
              만점 <T k="max" as="span" oneLine auto={drawn ? formatNumber(max) + series.suffix : undefined} />
            </span>
          )}
        </div>
      )}
      {mode === 'edit' && wrong && <p className="bk-cc-sum bk-rdr-warn">값은 같은 단위의 0 이상인 숫자로 적어 주세요 (예: 4.2, 80%).</p>}
      {n >= 3 && (
        <div className="bk-rdr-body">
          <div className="bk-rdr-stage">
            <div className="bk-rdr-plot">
              <svg className="bk-rdr-svg" viewBox={`0 0 ${(2 * cx0).toFixed(3)} ${((1 + ym) * RADAR_R).toFixed(3)}`} aria-hidden="true">
                <polygon className="bk-rdr-ring is-mid" points={radarPoints(axes, axes.map(() => 0.5), xm)} />
                <polygon className="bk-rdr-ring" points={radarPoints(axes, axes.map(() => 1), xm)} />
                {axes.map((_, i) => (
                  <line key={i} className="bk-rdr-spoke" x1={cx0} y1={RADAR_R} x2={end(i, 1).x} y2={end(i, 1).y} />
                ))}
                {compared && <polygon className="bk-rdr-base" points={radarPoints(axes, metas.map((v) => radarRatio(v as number, max)), xm)} />}
                {/* 발표할 때 가운데에서 펼쳐진다(engine.ts): 그림의 가운데를 축으로 */}
                {drawn && <polygon className="bk-rdr-area" points={radarPoints(axes, ratios, xm)} style={origin} />}
                {pick >= 0 && <line className="bk-rdr-hl" x1={cx0} y1={RADAR_R} x2={end(pick, ratios[pick]).x} y2={end(pick, ratios[pick]).y} style={origin} />}
              </svg>
              <ol className="bk-rdr-list">
                {items.map((it, i) => (
                  <li
                    key={it.id}
                    className={cx('it bk-rdr-it', pole[i] ? (axes[i].y < 0 ? 'is-top' : 'is-bot') : axes[i].x > 0 ? 'is-right' : 'is-left', i === pick && 'is-hl')}
                    style={{ '--ux': axes[i].x.toFixed(4), '--uy': axes[i].y.toFixed(4) } as CSSProperties}
                  >
                    <IT i={i} k="title" as="span" className="bk-rdr-t" />
                    <IT i={i} k="value" as="span" className="bk-rdr-v" oneLine numeral />
                    {metaOpen && (
                      // 견줄 값은 편집할 때만 적는 칸: 발표할 때는 점선 다각형이 말한다. 앞에 견줄 대상의 이름을 붙여 이 숫자가 무엇인지 읽힌다
                      <span className="bk-rdr-m">
                        <span className="bk-rdr-mk">{baseName}</span>
                        <IT i={i} k="meta" as="span" className="bk-rdr-mv" oneLine />
                      </span>
                    )}
                    <ItemTools i={i} />
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      )}
      {pick >= 0 && (
        // 넓은 칸에서만 보인다(radar.css): 소제목 아래, 그림 왼쪽에 이 그림의 답(가장 낮거나 높은 기준)을 큰 숫자로
        <div className="bk-rdr-ans">
          {auto && <p className="bk-rdr-ak">{slide.variant === 'high' ? '가장 높은 기준' : '가장 낮은 기준'}</p>}
          <p className="bk-rdr-an">{names[pick]}</p>
          <p className="bk-rdr-av">
            <Numeral text={valueTexts[pick]} />
          </p>
          {compared && metaTexts[pick] && (
            <p className="bk-rdr-am">
              {baseName} {metaTexts[pick]}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

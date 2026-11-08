// 부품: 모션 그래픽 (cine). 모양은 styles/blocks/cine.css, 움직임은 motion/cine.ts(엔진의 nativeAuto가 mo-cine으로 알린다).
// 늘 끝 모습을 그려 둔다: 칸의 글(DOM 그대로)과 남는 선(SVG). 편집 화면, 목록, PDF, PPT, 내보낸 HTML의 처음 모습이 이것이다.
// 발표할 때는 엔진이 같은 자리에 캔버스를 얹어 장면을 그리고, 끝나면 걷어 이 모습으로 돌아온다

import { useMemo } from 'react'
import { cineScript, presetRecipe, type CineScript } from '../../deck/cine'
import type { CineFieldKey } from '../../deck/types'
import { cx } from '../../lib/cx'
import { cineMotion } from '../../motion/cine'
import { drawKit } from '../../motion/draw'
import { SlideContext, useSlide } from '../context'
import { T } from '../fields'

export const cines = cineMotion(drawKit())
if (typeof document !== 'undefined') cines.listen(document)

/** 레시피가 없거나 꼴이 아닐 때(지운 레시피를 가리키는 파일): 글은 첫 틀의 짜임으로 그리고 움직이지 않는다 */
const FALLBACK = cineScript(presetRecipe('light', 'fallback'))!

/** 여러 줄로 쓰는 칸 */
const MULTI: readonly CineFieldKey[] = ['title', 'lead', 'text', 'sub']

/** 짜임마다 큰 글(주인공): 모양을 딴 칸, 없으면 숫자, 없으면 제목 */
function heroOf(s: CineScript): CineFieldKey | null {
  if (s.frame === 'line') return null
  if (s.frame === 'mark') return 'glyph'
  const keys = s.texts.map((t) => t.key)
  return s.field && keys.includes(s.field) ? s.field : keys.includes('value') ? 'value' : keys.includes('title') ? 'title' : null
}

function Field({ k, hero, answer }: { k: CineFieldKey; hero: boolean; answer: CineFieldKey | undefined }) {
  return (
    <div className={cx('bk-cn-f', `f-${k}`, hero && 'is-hero', k === answer && 'is-answer')} data-cn={k}>
      <T k={k} className={`bk-cn-${k}`} multiline={MULTI.includes(k)} />
    </div>
  )
}

export function Cine() {
  const ctx = useSlide()
  const recipe = ctx.cineId ? ctx.cines?.[ctx.cineId] : undefined
  const live = useMemo(() => (recipe ? cineScript(recipe) : null), [recipe])
  const script = live ?? FALLBACK
  const json = useMemo(() => (live ? JSON.stringify(live) : undefined), [live])
  const still = useMemo(() => cines.still(script), [script])
  const keys = script.texts.map((t) => t.key)
  const hero = heroOf(script)
  // 장의 답(강조색 글자)
  const answer = script.texts.find((t) => t.accent !== undefined)?.key
  const words = keys.filter((k) => k !== hero)
  // 레시피가 쓰는 칸은 비어 있어도 편집할 때 늘 보인다(접어 두지 않는다): 장면의 짜임이 글 칸으로 정해지므로
  const value = useMemo(() => ({ ...ctx, folds: undefined }), [ctx])
  return (
    <SlideContext.Provider value={value}>
      <div className={cx('bk-cn', `fr-${script.frame}`, script.bleed && 'is-bleed')} data-script={json} data-head-after={script.headAfter ? '' : undefined}>
        <div className="bk-cn-cam">
          <svg className="bk-cn-still" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true" dangerouslySetInnerHTML={{ __html: still }} />
          <div className="bk-cn-txt">
            {hero && keys.includes(hero) && script.frame === 'mark' && <Field k={hero} hero answer={answer} />}
            {script.frame === 'mark' ? (
              <div className="bk-cn-words">
                {words.map((k) => (
                  <Field key={k} k={k} hero={false} answer={answer} />
                ))}
              </div>
            ) : (
              keys.map((k) => <Field key={k} k={k} hero={k === hero} answer={answer} />)
            )}
          </div>
        </div>
      </div>
    </SlideContext.Provider>
  )
}

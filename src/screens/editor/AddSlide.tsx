import { memo, useMemo, useState } from 'react'
import { CINE_PRESETS, presetRecipe, presetSpec } from '../../deck/cine'
import { LAYOUTS, LAYOUT_GROUPS } from '../../deck/layouts'
import { showcaseSlides } from '../../deck/showcase'
import { motionOf } from '../../deck/themes'
import type { CinePresetId, LayoutId, Slide } from '../../deck/types'
import { cx } from '../../lib/cx'
import { hashOf } from '../../lib/router'
import { onTabListKeys } from '../../lib/tabList'
import { ScaledSlide, SlideCanvas } from '../../slides/SlideCanvas'
import { useDrawSoon } from '../drawSoon'
import { cineCardSlide, usePlayOnHover } from './CineLibrary'
import type { Look } from './look'

/*
 * 장 추가: 레이아웃(과 모션 그래픽 틀)을 그림으로 고른다. 왼쪽에서 묶음을 고르면 오른쪽에 그 묶음의 장이 예시 내용을 채운 그림으로 보인다.
 * 예전에는 레이아웃 스물일곱 가지의 이름과 설명을 한 줄씩 늘어놓은 긴 목록이라, 어느 것이 어떻게 생겼는지 모르고
 * 글만 읽으며 스크롤해야 했다. 처음에는 가장 자주 쓰는 아홉 가지만 보이고, 설명은 그림에 마우스를 올리면 나온다.
 */

/** 처음 보이는 묶음: 보고에서 가장 자주 쓰는 장. 컴포넌트로 꾸미는 빈 장이 맨 앞 */
const OFTEN: LayoutId[] = ['compose', 'summary', 'points', 'kpi', 'bars', 'trend', 'timeline', 'compare', 'table']

/**
 * 묶음: 레이아웃 장이나 모션 그래픽 틀. 모션 그래픽은 슬라이드 한 장을 통째로 쓰는 장면이라 슬라이드를 더할 때도 고르게 둔다:
 * 컴포넌트에서만 넣을 수 있던 때는 빈 슬라이드를 더하고 컴포넌트 탭을 열어 찾아야 했다. 자주 쓰는 슬라이드 바로 다음에 둔다
 */
type Group = { name: string; layouts: LayoutId[]; cines?: undefined } | { name: string; cines: CinePresetId[]; layouts?: undefined }

const GROUPS: Group[] = [
  { name: '자주 쓰는 슬라이드', layouts: OFTEN },
  { name: '모션 그래픽', cines: CINE_PRESETS.map((p) => p.id) },
  ...LAYOUT_GROUPS.filter((g) => !g.layouts.every((id) => OFTEN.includes(id))),
]

/** 그림 안 아래 띠의 단락 지도 (예시) */
const SECTIONS = ['섹션 1', '섹션 2', '섹션 3']

/** 그림 한 장의 너비 (화면 px). 셋이 한 줄 */
const THUMB_W = 176

export function AddSlide({ look, onPick, onPickCine }: { look: Look; onPick: (layout: LayoutId) => void; onPickCine: (preset: CinePresetId) => void }) {
  const [group, setGroup] = useState(0)
  // 레이아웃마다 예시 내용을 채운 장 하나 (장 모음과 같은 예시)
  const examples = useMemo(() => {
    const map = new Map<LayoutId, Slide>()
    for (const s of showcaseSlides()) if (!map.has(s.layout)) map.set(s.layout, s)
    return map
  }, [])
  const g = GROUPS[group]
  return (
    <div className="add-slide" role="dialog" aria-label="슬라이드 추가">
      <div className="add-slide-nav" role="tablist" aria-label="슬라이드 묶음" aria-orientation="vertical" onKeyDown={onTabListKeys}>
        {GROUPS.map((x, i) => (
          <button key={x.name} type="button" role="tab" aria-selected={i === group} tabIndex={i === group ? 0 : -1} className={cx('add-slide-tab', i === group && 'is-on')} onClick={() => setGroup(i)}>
            {x.name}
            <span className="add-slide-n">{(x.layouts ?? x.cines).length}</span>
          </button>
        ))}
        {/* 편집하던 화면은 그대로 두고 새 탭에서 모든 장을 크게 본다 */}
        <a className="add-slide-all" href={hashOf({ name: 'system' })} target="_blank" rel="noopener">
          슬라이드 모음 보기
        </a>
      </div>
      <div className="add-slide-grid" role="tabpanel" aria-label={g.name}>
        {g.layouts?.map((id) => (
          <Choice key={id} id={id} look={look} slide={examples.get(id)} onPick={() => onPick(id)} />
        ))}
        {g.cines?.map((id) => (
          <CineChoice key={id} preset={id} look={look} onPick={() => onPickCine(id)} />
        ))}
      </div>
    </div>
  )
}

const Choice = memo(function Choice({ id, look, slide, onPick }: { id: LayoutId; look: Look; slide?: Slide; onPick: () => void }) {
  const spec = LAYOUTS[id]
  // 창은 바로 열고 그림은 그 뒤에 차례로 (drawSoon.ts의 useDrawSoon)
  const ready = useDrawSoon()
  return (
    <button type="button" className="add-slide-card" title={spec.description} onClick={onPick}>
      <span className="add-slide-pic">
        {slide && (
          <ScaledSlide width={THUMB_W} decorative>
            {ready && <SlideCanvas deck={look} slide={slide} mode="final" sections={SECTIONS} sectionIndex={0} />}
          </ScaledSlide>
        )}
      </span>
      <span className="add-slide-name">{spec.name}</span>
    </button>
  )
})

/**
 * 모션 그래픽 틀 하나: 그 장면의 끝 모습(틀의 지어낸 예시 글)을 레이아웃 그림과 같은 크기로. 올리면 한 번 움직인다(컴포넌트의 모션 그래픽 카드와 같게).
 * 누르면 고른 슬라이드 다음에 새 슬라이드로 넣고 모션 편집을 연다(cineEdit.ts의 addCineSlide). 마우스를 올렸을 때의 설명은 어울리는 쓰임 한 줄:
 * 움직임을 다 풀어 쓴 설명(네 줄)은 아래 카드를 덮었다(감성 검수)
 */
const CineChoice = memo(function CineChoice({ preset, look, onPick }: { preset: CinePresetId; look: Look; onPick: () => void }) {
  const ready = useDrawSoon()
  const hover = usePlayOnHover(motionOf(look))
  const p = presetSpec(preset)
  const { slide, deck } = useMemo(() => cineCardSlide(look, presetRecipe(preset, `preset-${preset}`)), [look, preset])
  return (
    <button
      type="button"
      className="add-slide-card"
      title={`${p.fits}에 어울려요`}
      onPointerEnter={(e) => hover(e.currentTarget)}
      onFocus={(e) => hover(e.currentTarget)}
      onClick={onPick}
    >
      <span className="add-slide-pic">
        <ScaledSlide width={THUMB_W} decorative>
          {ready && <SlideCanvas deck={deck} slide={slide} mode="final" />}
        </ScaledSlide>
      </span>
      <span className="add-slide-name">{p.name}</span>
    </button>
  )
})

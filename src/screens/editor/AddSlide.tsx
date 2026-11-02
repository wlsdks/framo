import { memo, useMemo, useState } from 'react'
import { LAYOUTS, LAYOUT_GROUPS } from '../../deck/layouts'
import { showcaseSlides } from '../../deck/showcase'
import type { LayoutId, Slide } from '../../deck/types'
import { cx } from '../../lib/cx'
import { hashOf } from '../../lib/router'
import { onTabListKeys } from '../../lib/tabList'
import { ScaledSlide, SlideCanvas } from '../../slides/SlideCanvas'
import { useDrawSoon } from '../drawSoon'
import type { Look } from './look'

/*
 * 장 추가: 레이아웃을 그림으로 고른다. 왼쪽에서 묶음을 고르면 오른쪽에 그 묶음의 장이 예시 내용을 채운 그림으로 보인다.
 * 예전에는 레이아웃 스물일곱 가지의 이름과 설명을 한 줄씩 늘어놓은 긴 목록이라, 어느 것이 어떻게 생겼는지 모르고
 * 글만 읽으며 스크롤해야 했다. 처음에는 가장 자주 쓰는 아홉 가지만 보이고, 설명은 그림에 마우스를 올리면 나온다.
 */

/** 처음 보이는 묶음: 보고에서 가장 자주 쓰는 장. 컴포넌트로 꾸미는 빈 장이 맨 앞 */
const OFTEN: LayoutId[] = ['compose', 'summary', 'points', 'kpi', 'bars', 'trend', 'timeline', 'compare', 'table']

const GROUPS = [{ name: '자주 쓰는 슬라이드', layouts: OFTEN }, ...LAYOUT_GROUPS.filter((g) => !g.layouts.every((id) => OFTEN.includes(id)))]

/** 그림 안 아래 띠의 단락 지도 (예시) */
const SECTIONS = ['섹션 1', '섹션 2', '섹션 3']

/** 그림 한 장의 너비 (화면 px). 셋이 한 줄 */
const THUMB_W = 176

export function AddSlide({ look, onPick }: { look: Look; onPick: (layout: LayoutId) => void }) {
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
            <span className="add-slide-n">{x.layouts.length}</span>
          </button>
        ))}
        {/* 편집하던 화면은 그대로 두고 새 탭에서 모든 장을 크게 본다 */}
        <a className="add-slide-all" href={hashOf({ name: 'system' })} target="_blank" rel="noopener">
          슬라이드 모음 보기
        </a>
      </div>
      <div className="add-slide-grid" role="tabpanel" aria-label={g.name}>
        {g.layouts.map((id) => (
          <Choice key={id} id={id} look={look} slide={examples.get(id)} onPick={() => onPick(id)} />
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

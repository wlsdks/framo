// 레이아웃: 비교 (compare). 모양은 styles/compare.css

import { ArrowMark } from '../arrow'
import { IT, ItemTools, T } from '../fields'
import { Head, useItems } from './parts'

function Arrow() {
  return (
    <span className="cp-arrow" aria-hidden="true">
      {/* 컴포넌트 사이의 화살표 이음표(blocks.tsx의 LinkGlyph)와 같은 그림 */}
      <ArrowMark />
    </span>
  )
}

export function Compare() {
  const items = useItems()
  return (
    <>
      <Head />
      <div className="s-body cp" data-n={items.length}>
        <div className="cp-row cp-headrow">
          <T k="leftTitle" className="cp-h cp-hl" />
          <T k="rightTitle" className="cp-h cp-hr" />
        </div>
        {items.map((it, i) => (
          <div key={it.id} className="it cp-row">
            <IT i={i} k="title" className="cp-l" multiline />
            <IT i={i} k="body" className="cp-r" multiline />
            <Arrow />
            <ItemTools i={i} pair />
          </div>
        ))}
        {/* 두 면 사이의 화살표 하나 (표 모양은 줄마다의 화살표를 쓴다) */}
        <Arrow />
      </div>
    </>
  )
}

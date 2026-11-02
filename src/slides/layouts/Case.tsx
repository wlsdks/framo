// 레이아웃: 사례 (case). 모양은 styles/case.css

import { IT, ImageSlot, ItemTools, T } from '../fields'
import { useItems, useSharedUnits } from './parts'

export function Case() {
  const items = useItems()
  const units = useSharedUnits('value')
  return (
    <>
      {/* 대상(고객사, 부서)은 결과 판의 로고 아래에: 제목 위에 두면 이 장만 제목이 한 줄 내려가 장을 넘길 때 제목이 뛰었고,
          로고가 없으면 결과 판 위쪽이 통째로 비었다 */}
      {/* 제목 아래 이야기(내용, 한마디)는 한 묶음: 장 채움 맞추기(fitBlocks.ts의 fitLayout)가 묶음째 키우고, 그래도 단을 덜 채우면
          눈높이 가운데로 내린다. 단에 바로 놓였을 때는 맞추기가 닿지 않아 짧은 사례면 왼쪽 단의 아래 절반이 통째로 비었다 */}
      <div className="cs-main">
        <T k="title" as="h2" className="cs-title" fit={[22, 36]} multiline />
        <div className="cs-story">
          <T k="body" className="cs-body" multiline />
          <T k="quote" as="blockquote" className="cs-quote" multiline />
        </div>
      </div>
      <aside className="cs-side">
        <ImageSlot k="image" className="cs-logo" contain optional />
        <T k="client" className="cs-client" />
        <div className="cs-results">
          {items.map((it, i) => (
            <div key={it.id} className="it cs-res">
              <IT i={i} k="value" className="cs-value" oneLine numeral units={units} />
              <IT i={i} k="title" className="cs-label" />
              <ItemTools i={i} />
            </div>
          ))}
        </div>
      </aside>
    </>
  )
}

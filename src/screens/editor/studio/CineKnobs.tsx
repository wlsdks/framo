import { useEffect, useState } from 'react'
import { BLOCK_WHENS, whenOf } from '../../../deck/blocks'
import {
  CINE_AMOUNTS,
  CINE_CAMERAS,
  CINE_ENTERS,
  CINE_PACES,
  CINE_SHAPES,
  CINE_SPREADS,
  cineKnown,
  entersFor,
  knobsFor,
  knobValue,
  mainText,
  presetSpec,
  type CineKnob,
} from '../../../deck/cine'
import type { Block, BlockWhen, CineEnter, Slide } from '../../../deck/types'
import { loadCines, newerFor, useCines, versionNumber } from '../../../store/cines'
import { useDeck } from '../../../store/deckStore'
import { PlayIcon, Segmented, Toggle } from '../../ui'
import { setKnob, switchVersion } from '../cineEdit'
import { Opt } from '../Inspector'

// 모션 편집의 오른쪽 칸: 모션 그래픽을 고르면 쉬운 손잡이가 보인다. 손잡이 하나가 레시피의 몇 군데를 함께 바꾼다(deck/cine.ts의 withKnob).
// 저장 단추는 없다: 고친 것은 이 발표에 바로 들어가고, 모션 편집을 닫거나 장을 옮기면 내 라이브러리에 새 버전으로 남는다

/** 짜임마다 고를 수 있는 모일 모양: 글자를 두는 짜임은 글자, 고리, 한 점. 선 짜임은 선과 물결 */
const SHAPES_FOR = { mark: ['glyph', 'ring', 'point'], center: ['glyph', 'ring', 'point'], line: ['line', 'wave'] } as const

export function CineKnobs({ slide, block, n, disabled, onWhen, onPlay }: { slide: Slide; block: Block; n: number; disabled: boolean; onWhen(w: BlockWhen): void; onPlay(): void }) {
  const cines = useDeck((s) => s.deck?.cines)
  const entries = useCines((s) => s.entries)
  useEffect(() => void loadCines(), [])
  const r = block.cine ? cines?.[block.cine] : undefined
  // 새 버전 알림을 '그대로 두기'로 닫으면 그 버전에 대해서는 다시 묻지 않는다(이 창을 여는 동안)
  const [kept, setKept] = useState<string | null>(null)
  if (!r)
    return (
      <section className="ms-sec cn-knobs">
        <p className="ms-none">이 모션 그래픽의 장면 정보를 찾지 못했어요. 내 컴포넌트의 모션 그래픽에서 다시 넣어 주세요.</p>
      </section>
    )
  const entry = entries.find((e) => e.lineage === r.lineage)
  const number = entry && block.cine ? versionNumber(entry, block.cine) : 0
  const newer = newerFor(entries, r, block.cine)
  const known = cineKnown(r)
  const set = (k: CineKnob, v: string | boolean) => setKnob(slide.id, block, r, k, v)
  const knobs = knobsFor(r)
  const main = mainText(r)
  const shapes = CINE_SHAPES.filter((s) => (SHAPES_FOR[r.frame] as readonly string[]).includes(s.id))
  const on = (k: CineKnob) => knobValue(r, k) as string
  return (
    <section className="ms-sec ms-block cn-knobs">
      <div className="ms-block-h">
        <span className="ms-n is-on">{n}</span>
        <h2 className="ms-h">{entry?.name ?? presetSpec(r.preset).name}</h2>
        <button type="button" className="btn btn-ghost btn-sm ms-one" disabled={disabled} title="이 모션 그래픽만 한 번 움직여요" onClick={onPlay}>
          <PlayIcon />
          이것만 보기
        </button>
      </div>
      <p className="cn-ver">{number ? `버전 ${number} · 이 발표는 이 버전으로 고정돼요` : '고친 것은 모션 편집을 닫으면 내 모션 그래픽에 새 버전으로 남아요'}</p>
      {newer && newer.entry.versions[newer.number - 1].id !== kept && (
        <div className="cn-newer" role="status">
          <span>새 버전 {newer.number}이 있어요</span>
          <button type="button" className="btn btn-sm" onClick={() => switchVersion(slide.id, block, newer.entry.versions[newer.number - 1].recipe)}>
            바꾸기
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setKept(newer.entry.versions[newer.number - 1].id)}>
            그대로 두기
          </button>
        </div>
      )}
      {!known && <p className="ms-none">새 버전의 Framo에서 만든 모션 그래픽이에요. 이 버전은 아는 부분만 그리고, 손잡이는 새 버전에서 바꿀 수 있어요.</p>}
      <fieldset className="cn-fs" disabled={!known}>
        <Opt label="언제" wide>
          <Segmented<BlockWhen> className="seg-fill" label="언제 나오는지" options={BLOCK_WHENS} value={whenOf(block)} onPick={onWhen} />
        </Opt>
        <Opt label="모일 모양" wide>
          <Segmented className="seg-fill" label="모일 모양" options={shapes} value={on('shape')} onPick={(v) => set('shape', v)} />
        </Opt>
        <Opt label="입자" wide>
          <Segmented className="seg-fill" label="입자" options={CINE_AMOUNTS} value={on('amount')} onPick={(v) => set('amount', v)} />
        </Opt>
        {knobs.includes('spread') && (
          <Opt label="번지는 모양" wide>
            <Segmented className="seg-fill" label="번지는 모양" options={CINE_SPREADS} value={on('spread')} onPick={(v) => set('spread', v)} />
          </Opt>
        )}
        <Opt label="카메라" wide>
          <Segmented className="seg-fill" label="카메라" options={CINE_CAMERAS} value={on('camera')} onPick={(v) => set('camera', v)} />
        </Opt>
        <Opt label="빠르기" wide>
          <Segmented className="seg-fill" label="빠르기" options={CINE_PACES} value={on('pace')} onPick={(v) => set('pace', v)} />
        </Opt>
        {main && (
          <Opt label="글 들어오기" wide>
            <Segmented<CineEnter> className="seg-fill" label="글 들어오기" options={CINE_ENTERS.filter((x) => entersFor(main.key).includes(x.id))} value={main.enter} onPick={(v) => set('enter', v)} />
          </Opt>
        )}
        <div className="cn-toggles">
          <Toggle label="한 점의 빛 (밝은 바탕에서는 번지는 먹)" on={knobValue(r, 'light') === true} onChange={(v) => set('light', v)} />
          <Toggle label="잔상" on={knobValue(r, 'trail') === true} onChange={(v) => set('trail', v)} />
          <Toggle label="슬라이드 전체로 번지기" on={knobValue(r, 'bleed') === true} onChange={(v) => set('bleed', v)} />
          <Toggle label="생동감에서 가끔 다시 빛나기" on={knobValue(r, 'loop') === true} onChange={(v) => set('loop', v)} />
        </div>
      </fieldset>
    </section>
  )
}

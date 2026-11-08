import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { makeBlock } from '../../deck/blocks'
import { CINE_PRESETS, cineId, presetRecipe, presetSpec } from '../../deck/cine'
import { makeSlide, uid } from '../../deck/generate'
import { motionOf } from '../../deck/themes'
import type { CinePresetId, CineRecipe, Deck, Slide } from '../../deck/types'
import { particle } from '../../lib/josa'
import { cines } from '../../slides/blocks/Cine'
import { ScaledSlide, SlideCanvas } from '../../slides/SlideCanvas'
import { CINE_NAME_MAX, type CineEntry } from '../../store/cinesFile'
import { loadCines, removeCine, renameCine, restoreCine, useCines } from '../../store/cines'
import { BackIcon, Info, MoreIcon, PlusIcon, Popover, type Toast } from '../ui'
import type { BlockEditing } from './BlockEditor'
import { insertCine } from './cineEdit'
import { useLook, type Look } from './look'

// 내 컴포넌트의 '모션 그래픽': 내가 만든 모션 그래픽(갈래마다 가장 새 버전)과 '새 모션 그래픽'(틀 넷 가운데 고르기).
// 카드에 마우스를 올리면 그 장면이 작게 한 번 움직인다(카드는 여럿이라 GPU 없이 캔버스로. 장면은 발표할 때와 같은 엔진).
// 누르면 이 장에 넣고 모션 편집이 열린다: 장면을 바로 보이고 손잡이로 고치게. 카드의 글은 틀의 지어낸 예시다(라이브러리에는 글이 없다)

/** 카드 그림: 제목을 숨긴 컴포넌트 장에 그 모션 그래픽 하나를 판 가득 */
const CineThumb = memo(function CineThumb({ look, recipe }: { look: Look; recipe: CineRecipe }) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const { slide, deck } = useMemo(() => {
    const id = cineId(recipe)
    const s = makeSlide('compose')
    const slide: Slide = {
      ...s,
      id: `cine-thumb-${id}`,
      options: { ...s.options, hideHead: true, hideFoot: true },
      blocks: [{ ...makeBlock('cine'), id: `cine-thumb-b-${id}`, fields: presetSpec(recipe.preset).sample as Record<string, string>, cine: id, at: { x: 0, y: 0, w: 12, h: 12 } }],
    }
    return { slide, deck: { ...look, cines: { [id]: recipe } } }
  }, [look, recipe])
  return (
    <div ref={ref} className="cn-thumb">
      {width > 0 && (
        <ScaledSlide width={width} decorative>
          <SlideCanvas deck={deck} slide={slide} mode="final" />
        </ScaledSlide>
      )}
    </div>
  )
})

/** 카드에 올리면 한 번 움직인다(움직이는 동안 다시 올려도 처음부터 다시 하지 않는다) */
function usePlayOnHover(level: string) {
  const last = useRef(new WeakMap<Element, number>())
  return (card: HTMLElement) => {
    const el = card.querySelector<HTMLElement>('.bk-cn')
    const t = performance.now()
    if (!el || t - (last.current.get(el) ?? -1e9) < 4000) return
    last.current.set(el, t)
    // 여럿이 함께 움직이는 작은 그림이라 GPU(WebGL)를 쓰지 않는다
    cines.play(el, { level: level === 'none' ? 'calm' : level, gl: false })
  }
}

export function CineSection({ deck, slide, blocks, toast }: { deck: Deck; slide: Slide; blocks: BlockEditing; toast: Toast }) {
  const entries = useCines((s) => s.entries)
  const look = useLook(deck)
  const [picking, setPicking] = useState(false)
  const [renaming, setRenaming] = useState<string | null>(null)
  const hover = usePlayOnHover(motionOf(deck, slide))
  useEffect(() => void loadCines(), [])

  const pick = (id: CinePresetId) => {
    setPicking(false)
    insertCine(presetRecipe(id, uid()), blocks, slide, true)
  }
  const use = (e: CineEntry) => insertCine(e.versions[e.versions.length - 1].recipe, blocks, slide, false)
  const remove = async (e: CineEntry) => {
    const gone = await removeCine(e.lineage)
    if (gone) toast.show(`‘${e.name}’${particle(e.name, '을', '를')} 지웠어요. 이미 넣은 발표에서는 그대로 보여요`, { label: '되돌리기', run: () => void restoreCine(gone.entry, gone.index) }, 6000)
  }

  if (picking)
    return (
      <section className="cn-lib" aria-label="새 모션 그래픽">
        <div className="cn-lib-h">
          <button type="button" className="mine-head-btn" onClick={() => setPicking(false)}>
            <BackIcon />
            내 컴포넌트
          </button>
        </div>
        <h3 className="lib-group">틀 고르기</h3>
        <p className="lib-group-d">누르면 이 슬라이드에 넣고 모션 편집에서 고쳐요</p>
        <ul className="cn-grid">
          {CINE_PRESETS.map((p) => (
            <li key={p.id}>
              <button type="button" className="lib-card cn-card" title={p.description} onPointerEnter={(e) => hover(e.currentTarget)} onFocus={(e) => hover(e.currentTarget)} onClick={() => pick(p.id)}>
                <CineThumb look={look} recipe={presetRecipe(p.id, `preset-${p.id}`)} />
                <span className="cn-card-n">{p.name}</span>
                <span className="cn-card-d">{p.fits}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    )

  return (
    <section className="cn-lib" aria-label="모션 그래픽">
      <div className="cn-lib-h">
        <h3 className="lib-group">
          모션 그래픽<span className="lib-group-n">{entries.length || ''}</span>
        </h3>
        <Info label="모션 그래픽 도움말">
          영화 타이틀처럼 한 장면을 짠 컴포넌트예요. 틀을 골라 넣고 모션 편집에서 고치면 여기에 버전이 남아요. 넣은 발표는 그때의 버전 그대로 보여요.
        </Info>
        <button type="button" className="mine-head-btn cn-new" onClick={() => setPicking(true)}>
          <PlusIcon />
          새 모션 그래픽
        </button>
      </div>
      {entries.length > 0 && (
        <ul className="cn-grid">
          {entries.map((e) => {
            const latest = e.versions[e.versions.length - 1]
            return (
              <li key={e.lineage} className="mine-item">
                <button type="button" className="lib-card cn-card" title={`${e.name}: 눌러서 이 슬라이드에 넣어요`} onPointerEnter={(ev) => hover(ev.currentTarget)} onFocus={(ev) => hover(ev.currentTarget)} onClick={() => use(e)}>
                  <CineThumb look={look} recipe={latest.recipe} />
                </button>
                <div className="mine-meta">
                  {renaming === e.lineage ? (
                    <input
                      className="mine-rename"
                      defaultValue={e.name}
                      aria-label="이름"
                      maxLength={CINE_NAME_MAX}
                      autoFocus
                      onFocus={(x) => x.currentTarget.select()}
                      onBlur={(x) => {
                        void renameCine(e.lineage, x.currentTarget.value)
                        setRenaming(null)
                      }}
                      onKeyDown={(x) => {
                        if (x.key === 'Enter') x.currentTarget.blur()
                        else if (x.key === 'Escape') {
                          x.preventDefault()
                          setRenaming(null)
                        }
                      }}
                    />
                  ) : (
                    <span className="mine-name" onDoubleClick={() => setRenaming(e.lineage)}>
                      {e.name}
                    </span>
                  )}
                  <span className="mine-kind">
                    버전 {e.versions.length}
                    {e.name !== presetSpec(latest.recipe.preset).name && ` · ${presetSpec(latest.recipe.preset).name}`}
                  </span>
                  <Popover
                    flip
                    className="mine-menu"
                    button={({ open, toggle }) => (
                      <button type="button" className="icon-btn mine-more" aria-label={`${e.name} 메뉴`} aria-expanded={open} onClick={toggle}>
                        <MoreIcon />
                      </button>
                    )}
                  >
                    {(close) => (
                      <>
                        <button
                          type="button"
                          className="menu-item"
                          onClick={() => {
                            close()
                            setRenaming(e.lineage)
                          }}
                        >
                          이름 바꾸기
                        </button>
                        <button
                          type="button"
                          className="menu-item is-danger"
                          onClick={() => {
                            close()
                            void remove(e)
                          }}
                        >
                          지우기
                        </button>
                      </>
                    )}
                  </Popover>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

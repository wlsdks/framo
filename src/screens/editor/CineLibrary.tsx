import { memo, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { makeBlock } from '../../deck/blocks'
import { cineId, presetRecipe, presetSpec } from '../../deck/cine'
import { makeSlide, uid } from '../../deck/generate'
import { motionOf, themeStyle } from '../../deck/themes'
import type { CinePresetId, CineRecipe, Deck, Slide } from '../../deck/types'
import { particle } from '../../lib/josa'
import { cines } from '../../slides/blocks/Cine'
import { ScaledSlide, SlideCanvas } from '../../slides/SlideCanvas'
import { CINE_NAME_MAX, CINES_EXT, decodeCinesFile, encodeCinesFile, type CineEntry } from '../../store/cinesFile'
import { importCines, loadCines, removeCine, renameCine, restoreCine, useCines } from '../../store/cines'
import { downloadText } from '../../store/deckFile'
import { DownloadIcon, Info, MoreIcon, PlusIcon, Popover, UploadIcon, type Toast } from '../ui'
import { cineGoesNext, insertCine } from './cineEdit'
import { useLook, type Look } from './look'

// 모션 그래픽 카드: 컴포넌트 고르기의 '모션 그래픽' 묶음(틀 여섯)과 내 컴포넌트의 '모션 그래픽'(내가 고친 모션 그래픽, 갈래마다 가장 새 버전).
// '슬라이드 추가'의 모션 그래픽 묶음(AddSlide.tsx)도 같은 그림(cineCardSlide)과 올리면 움직이기(usePlayOnHover)를 쓴다.
// 카드에 마우스를 올리면 그 장면이 작게 한 번 움직인다(카드는 여럿이라 GPU 없이 캔버스로. 장면은 발표할 때와 같은 엔진).
// 누르면 넣고(cineEdit.ts의 insertCine) 모션 편집이 열린다: 장면을 바로 보이고 손잡이로 고치게. 카드의 글은 틀의 지어낸 예시다(라이브러리에는 글이 없다)

/** 카드 그림의 장: 제목을 숨긴 컴포넌트 장에 그 모션 그래픽 하나를 판 가득(틀의 지어낸 예시 글로). '슬라이드 추가'의 모션 그래픽 카드도 쓴다 */
export function cineCardSlide(look: Look, recipe: CineRecipe): { slide: Slide; deck: Look } {
  const id = cineId(recipe)
  const s = makeSlide('compose')
  const slide: Slide = {
    ...s,
    id: `cine-thumb-${id}`,
    options: { ...s.options, hideHead: true, hideFoot: true },
    blocks: [{ ...makeBlock('cine'), id: `cine-thumb-b-${id}`, fields: presetSpec(recipe.preset).sample as Record<string, string>, cine: id, at: { x: 0, y: 0, w: 12, h: 12 } }],
  }
  return { slide, deck: { ...look, cines: { [id]: recipe } } }
}

/**
 * 카드 그림: 제목을 숨긴 컴포넌트 장에 그 모션 그래픽 하나를 판 가득. fit이면 컴포넌트 카드와 같은 3:2 그림에 장(16:9)을 가운데 두고
 * 위아래는 장의 바탕색으로 잇는다(컴포넌트 카드와 한 줄에 서도 이름의 높이가 맞게. 장면의 비율은 바꾸지 않는다)
 */
const CineThumb = memo(function CineThumb({ look, recipe, fit }: { look: Look; recipe: CineRecipe; fit?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const { slide, deck } = useMemo(() => cineCardSlide(look, recipe), [look, recipe])
  const bg = fit ? (themeStyle(look.theme) as Record<string, string>)['--bg'] : undefined
  return (
    <div ref={ref} className={fit ? 'lib-thumb cn-fit' : 'cn-thumb'} style={bg ? { background: bg } : undefined}>
      {width > 0 && (
        <ScaledSlide width={width} decorative>
          <SlideCanvas deck={deck} slide={slide} mode="final" />
        </ScaledSlide>
      )}
    </div>
  )
})

/** 카드에 올리면 한 번 움직인다(움직이는 동안 다시 올려도 처음부터 다시 하지 않는다) */
export function usePlayOnHover(level: string) {
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

/**
 * 틀 카드 하나(컴포넌트 고르기의 '모션 그래픽' 묶음, 어울리는 것, 찾은 것). 누르면 그 틀을 넣는다: 장에 다른 내용이 있으면 다음에 새
 * 슬라이드를 만들어 판 가득(insertCine). 그림은 컴포넌트 카드와 같은 3:2
 */
export function CinePresetCard({ deck, slide, toast, preset }: { deck: Deck; slide: Slide; toast: Toast; preset: CinePresetId }) {
  const look = useLook(deck)
  const hover = usePlayOnHover(motionOf(deck, slide))
  const p = presetSpec(preset)
  const recipe = useMemo(() => presetRecipe(preset, `preset-${preset}`), [preset])
  const where = cineGoesNext(slide) ? '슬라이드 한 장을 다 쓰는 장면이라 이 슬라이드 바로 뒤에 새 슬라이드를 만들어 넣어요' : '이 슬라이드에 넣어요'
  return (
    <button
      type="button"
      className="lib-card cn-card"
      title={`${p.name}: ${p.description}\n${where}. 넣으면 모션 편집에서 고쳐요`}
      onPointerEnter={(e) => hover(e.currentTarget)}
      onFocus={(e) => hover(e.currentTarget)}
      onClick={() => insertCine(presetRecipe(preset, uid()), slide, true, toast)}
    >
      <CineThumb look={look} recipe={recipe} fit />
      <span className="lib-name">{p.name}</span>
      <span className="lib-desc">{p.fits}</span>
    </button>
  )
}

export function CineSection({ deck, slide, toast, onNew }: { deck: Deck; slide: Slide; toast: Toast; onNew: () => void }) {
  const entries = useCines((s) => s.entries)
  const look = useLook(deck)
  const [renaming, setRenaming] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const hover = usePlayOnHover(motionOf(deck, slide))
  useEffect(() => void loadCines(), [])

  const use = (e: CineEntry) => insertCine(e.versions[e.versions.length - 1].recipe, slide, false, toast)
  const remove = async (e: CineEntry) => {
    const gone = await removeCine(e.lineage)
    if (gone) toast.show(`‘${e.name}’${particle(e.name, '을', '를')} 지웠어요. 이미 넣은 발표에서는 그대로 보여요`, { label: '되돌리기', run: () => void restoreCine(gone.entry, gone.index) }, 6000)
  }

  // 파일로 주고받기: 다른 사람과 나누거나 다른 PC로 옮길 때. 파일에는 레시피(정해진 값)와 이름만 들어간다
  const exportAll = () => downloadText(encodeCinesFile(entries), `내 모션 그래픽${CINES_EXT}`, 'application/json')
  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const read = decodeCinesFile(await file.text().catch(() => ''))
    if (!read || !read.entries.length) {
      toast.show(`모션 그래픽 파일을 읽지 못했어요. Framo에서 저장한 ${CINES_EXT} 파일을 골라 주세요.`, undefined, 6000)
      return
    }
    const n = await importCines(read.entries)
    toast.show(n ? `모션 그래픽 ${n}개를 가져왔어요` : '이미 모두 있는 모션 그래픽이에요', undefined, 5000)
  }

  return (
    <section className="cn-lib" aria-label="모션 그래픽">
      <input ref={fileRef} type="file" accept={`${CINES_EXT},application/json`} hidden onChange={(e) => void onFile(e)} />
      <div className="cn-lib-h">
        <h3 className="lib-group">
          모션 그래픽<span className="lib-group-n">{entries.length || ''}</span>
        </h3>
        <Info label="모션 그래픽 도움말">
          영화 타이틀처럼 움직이는 한 장면이에요. 틀은 컴포넌트의 ‘모션 그래픽’에 있어요. 넣고 모션 편집에서 고치면 여기에 버전이 남아요. 넣은 발표는 그때의 버전 그대로 보여요.
        </Info>
        <button type="button" className="mine-head-btn cn-new" title="틀 여섯 가운데 골라요" onClick={onNew}>
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
      <div className="cn-lib-f">
        <button type="button" className="mine-head-btn" title={`${CINES_EXT} 파일의 모션 그래픽을 더해요`} onClick={() => fileRef.current?.click()}>
          <UploadIcon />
          가져오기
        </button>
        {entries.length > 0 && (
          <button type="button" className="mine-head-btn" title="모두 한 파일로 저장해요. 다른 사람과 주고받거나 다른 PC로 옮길 때 써요" onClick={exportAll}>
            <DownloadIcon />
            파일로 저장
          </button>
        )}
      </div>
    </section>
  )
}

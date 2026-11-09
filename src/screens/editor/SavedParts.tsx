import { memo, useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties } from 'react'
import {
  BLOCK_COL_GAP,
  BLOCKS,
  blockPrefH,
  canCompose,
  freshBlocks,
  groupIssue,
  insertParts,
  MAX_BLOCKS,
  MAX_LARGE,
  slideFromPart,
  type NoRoom,
  type SavedPart,
} from '../../deck/blocks'
import { motionOf } from '../../deck/themes'
import type { Block, Deck, Slide } from '../../deck/types'
import { cx } from '../../lib/cx'
import { josa, particle } from '../../lib/josa'
import { motionEngine } from '../../motion/engine'
import { SlideCanvas } from '../../slides/SlideCanvas'
import { downloadText, safeFileName } from '../../store/deckFile'
import { useDeck } from '../../store/deckStore'
import { decodePartsFile, encodePartsFile, PARTS_EXT } from '../../store/partsFile'
import { addManySaved, removeSaved, renameSaved, restoreSaved, useSaved } from '../../store/saved'
import { DownloadIcon, MoreIcon, NewSlideIcon, Popover, UploadIcon, undoAction, type Toast } from '../ui'
import { soloSlide, type BlockEditing } from './BlockEditor'
import { CineSection } from './CineLibrary'
import { CANVAS, COL_W } from './canvas'
import { useLook, type Look } from './look'
import { noRoomText, type NoRoomText } from './noRoom'
import { dropBlocks } from './planDrop'

// 컴포넌트 고르기의 '내 컴포넌트': 저장해 둔 컴포넌트 하나, 한 줄, 장 하나를 다시 넣는다.
// 컴포넌트 하나는 기본 컴포넌트처럼 끌어다 놓거나 누르면 알맞은 자리에, 한 줄은 이 장 맨 아래에(자리가 없으면 까닭과
// '새 장에 넣기'), 장 하나는 이 장 다음에 새 장으로 넣는다. 넣는 것마다 새 id라 같은 것을 여러 번 넣어도 된다.

/** 카드 그림의 가로세로 비율 범위 (한 줄은 넓적하고, 장은 16:9). 더 넓적하면 그림이 너무 낮아 읽히지 않는다 */
const MIN_RATIO = 1.2
const MAX_RATIO = 4
/** 한 줄 전체의 너비 (본문 너비와 그림 둘레의 여백) */
const ROW_W = 12 * (COL_W + BLOCK_COL_GAP) - BLOCK_COL_GAP + 80

const KIND_NAMES: Record<SavedPart['kind'], string> = { block: '컴포넌트', row: '한 줄', slide: '슬라이드 하나' }

/** 카드 밑의 한 줄: 무엇을 저장했는지와 든 컴포넌트 수 (컴포넌트 하나는 이름을 바꿨을 때만 무슨 컴포넌트인지) */
function kindText(p: SavedPart): string {
  if (p.kind !== 'block') return `${KIND_NAMES[p.kind]}, 컴포넌트 ${p.blocks.length}개`
  const type = BLOCKS[p.blocks[0].type].name
  return p.name === type ? '컴포넌트 하나' : type
}

/** 저장한 것을 그린 작은 그림. 장 하나는 장 전체를, 컴포넌트와 줄은 놓인 비율 그대로 */
const SavedThumb = memo(function SavedThumb({ deck, part }: { deck: Look; part: SavedPart }) {
  const { slide, canvas, padY, padX } = useMemo(() => {
    if (part.kind === 'slide') return { slide: slideFromPart(part), canvas: null, padY: 0, padX: 0 }
    const first = part.blocks[0]
    // 묶음 안의 자리를 그림 전체에 펼친다 (묶음 안의 짜임과 몫은 그대로)
    const solo: Slide = { ...soloSlide(first), id: `saved-${part.id}`, blocks: insertParts([], { at: null, side: 'below' }, part.blocks) ?? [] }
    // 저장할 때의 크기가 있으면 그대로 (없으면 가져온 파일: 보기 좋은 너비와 잘리지 않는 높이로)
    const w0 = (part.size?.w ?? (part.kind === 'block' ? BLOCKS[first.type].prefSpan * (COL_W + BLOCK_COL_GAP) - BLOCK_COL_GAP : ROW_W - 80)) + 80
    const h0 = (part.size?.h ?? Math.max(...part.blocks.map(blockPrefH))) + 80
    // 너무 넓적하면 정한 비율 안으로. 줄 높이는 그대로 두고 위아래 여백만 늘린다
    // (줄이 높아지면 높이에 따라 짜임을 바꾸는 컴포넌트가 저장한 모습과 다르게 그려진다)
    const h = Math.max(h0, Math.round(w0 / MAX_RATIO))
    const w = Math.max(w0, Math.round(h * MIN_RATIO))
    return { slide: solo, canvas: { w, h }, padY: 40 + (h - h0) / 2, padX: 40 + (w - w0) / 2 }
  }, [part])
  const size = canvas ?? CANVAS
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return (
    <div ref={ref} className="lib-thumb" style={{ aspectRatio: `${size.w} / ${size.h}` }}>
      {width > 0 && (
        <div
          className="lib-thumb-scale"
          style={{ width: size.w, height: size.h, transform: `scale(${width / size.w})`, ...(canvas && { '--solo-py': `${padY}px`, '--solo-px': `${padX}px` }) } as CSSProperties}
        >
          <SlideCanvas deck={deck} slide={slide} mode="preview" solo={canvas ?? undefined} />
        </div>
      )}
    </div>
  )
})

/** 한 줄이나 장 하나를 이 장에 넣을 수 없는 까닭을 읽는 말로 */
function rowsNoRoomText(r: NoRoom, part: SavedPart, slide: Slide): NoRoomText {
  const blocks = dropBlocks(slide)?.blocks ?? []
  const fix = '새 슬라이드에 넣거나, 이 슬라이드의 컴포넌트를 줄여 주세요.'
  if (r.kind === 'height' && r.noBody) return noRoomText(r, part.blocks[0]?.type ?? 'number', 'slide')
  if (r.kind === 'full') return { why: `이 슬라이드의 컴포넌트 ${blocks.length}개에 ${part.blocks.length}개를 더하면 슬라이드 하나에 넣는 ${MAX_BLOCKS}개를 넘어요.`, fix }
  if (r.kind === 'large') return { why: `차트나 표 같은 큰 컴포넌트는 슬라이드 하나에 ${MAX_LARGE}개까지 넣어요.`, fix }
  return { why: '넣으면 컴포넌트들이 슬라이드보다 높아져서 글이 잘려요.', fix }
}

export function SavedParts({ deck, slide, blocks, toast }: { deck: Deck; slide: Slide; blocks: BlockEditing; toast: Toast }) {
  const parts = useSaved((s) => s.parts)
  const loaded = useSaved((s) => s.loaded)
  const look = useLook(deck)
  const [why, setWhy] = useState<{ id: string; card: HTMLElement } | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const engine = useMemo(() => motionEngine(), [])

  /** 넣을 때마다 새 id로 (컴포넌트 하나는 그 컴포넌트) */
  const freshBlock = (part: SavedPart): Block => {
    const { link: _, linkBelow: __, at: ___, ...b } = freshBlocks(part.blocks).blocks[0]
    return b
  }

  /** 이 장에 넣을 수 없는 까닭. 장 하나는 늘 이 장 다음에 새 장으로 넣으니 없다 */
  const issueOf = (part: SavedPart): NoRoom | null => {
    if (part.kind === 'slide') return null
    if (part.kind === 'block') return blocks.issueFor(freshBlock(part))
    const at = dropBlocks(slide)
    return at && groupIssue(at.blocks, part.blocks, blocks.areaHeight())
  }

  // 표지와 섹션처럼 컴포넌트를 넣지 않는 장(기본 컴포넌트 목록과 같다)에서는 장 하나 말고 모두 잠근다.
  // 잠그지 않던 때는 한 줄을 누르면 묻지 않고 다음 장을 새로 만들어 넣었다
  const closed = slide.layout !== 'compose' && !canCompose(slide.layout)
  const lockedOf = (part: SavedPart) => part.kind !== 'slide' && (closed || !!issueOf(part))

  /** 새로 들어온 컴포넌트가 제자리에서 한 번 움직여 들어온다 (끌어다 놓은 컴포넌트가 날아 들어가는 것처럼) */
  const playIn = (ids: string[]) => {
    const level = motionOf(deck, slide)
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        for (const id of ids) {
          const cell = document.querySelector<HTMLElement>(`.ed-canvas .bk[data-block="${CSS.escape(id)}"]`)
          if (cell) engine.play(cell, level === 'none' ? 'calm' : level)
        }
      }),
    )
  }

  const insert = (part: SavedPart, card: HTMLElement | null, next = false) => {
    const store = useDeck.getState()
    setWhy(null)
    if (part.kind === 'block') {
      // 기본 컴포넌트와 같은 길: 알아서 고른 자리에, 까닭을 보고 '새 장에 넣기'를 골랐으면 새 컴포넌트 장에.
      // 넣는 길(insertBlock)로 보내면 자리가 없어 다시 넣지 않고 까닭을 알려서, '새 장에 넣기'를 두 번 눌러야 했다
      if (next) blocks.insertNew(freshBlock(part))
      else blocks.insertBlock(freshBlock(part), card)
      return
    }
    if (part.kind === 'slide') {
      store.insertSlide(slideFromPart(part), slide.id)
      toast.show(`‘${part.name}’${particle(part.name, '을', '를')} 이 슬라이드 다음에 새 슬라이드로 넣었어요`, undoAction(toast), 6000)
      return
    }
    const fresh = freshBlocks(part.blocks).blocks
    const ids = fresh.map((b) => b.id)
    const at = next ? null : dropBlocks(slide)
    const placed = at && insertParts(at.blocks, { at: null, side: 'below' }, fresh, blocks.areaHeight())
    if (at && placed) {
      if (at.composed) {
        store.replaceSlide(slide.id, { ...at.composed, blocks: placed })
        toast.show('이 슬라이드를 컴포넌트 슬라이드로 바꿔 맨 아래에 넣었어요', undoAction(toast), 6000)
      } else store.setBlocks(slide.id, placed)
      blocks.select(ids[0])
      playIn(ids)
      return
    }
    store.addComposeSlide(insertParts([], { at: null, side: 'below' }, fresh) ?? fresh, slide.id)
    toast.show(`새 컴포넌트 슬라이드를 만들어 ‘${part.name}’${particle(part.name, '을', '를')} 넣었어요`, undoAction(toast), 6000)
  }

  const tap = (part: SavedPart, card: HTMLElement) => (lockedOf(part) ? setWhy(why?.id === part.id ? null : { id: part.id, card }) : insert(part, card))

  const remove = async (part: SavedPart) => {
    const gone = await removeSaved(part.id)
    if (gone) toast.show(`‘${part.name}’${particle(part.name, '을', '를')} 지웠어요`, { label: '되돌리기', run: () => void restoreSaved(gone.part, gone.index) }, 6000)
  }

  const exportAll = () => downloadText(encodePartsFile(parts), `내 컴포넌트${PARTS_EXT}`, 'application/json')
  const exportOne = (part: SavedPart) => downloadText(encodePartsFile([part]), `${safeFileName(part.name, '내 컴포넌트')}${PARTS_EXT}`, 'application/json')
  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const read = decodePartsFile(await file.text().catch(() => ''))
    if (!read || !read.parts.length) {
      toast.show(`내 컴포넌트 파일을 읽지 못했어요. Framo에서 내보낸 ${PARTS_EXT} 파일을 골라 주세요.`, undefined, 6000)
      return
    }
    await addManySaved(read.parts)
    toast.show(
      `${read.parts.length}개를 가져왔어요${read.lost ? `. 이 버전에 없는 컴포넌트와 값 ${read.lost}개는 빼고 넣었어요` : ''}`,
      undefined,
      6000,
    )
  }

  const shownWhy = (() => {
    const part = why && parts.find((p) => p.id === why.id)
    if (!part || !lockedOf(part)) return null
    if (closed) return { part, card: why.card, text: { why: '표지와 섹션 슬라이드에는 컴포넌트를 넣지 않아요.', fix: '새 슬라이드에 넣으면 이 슬라이드 다음에 컴포넌트 슬라이드를 만들어 넣어요.' } }
    const r = issueOf(part)!
    return { part, card: why.card, text: part.kind === 'block' ? noRoomText(r, part.blocks[0].type, 'slide') : rowsNoRoomText(r, part, slide) }
  })()

  return (
    <>
      <input ref={fileRef} type="file" accept={`${PARTS_EXT},application/json`} hidden onChange={(e) => void onFile(e)} />
      <div className="lib-list mine-list">
        {/* 모션 그래픽: 내가 만든 장면들과 새로 만들기(틀 고르기). 저장한 컴포넌트와 같은 목록에서 스크롤된다(CineLibrary.tsx) */}
        <CineSection deck={deck} slide={slide} toast={toast} />
        {loaded && !parts.length ? (
          <div className="mine-empty">
            <p className="mine-empty-t">자주 쓰는 조합을 저장해 두세요</p>
            <p className="mine-empty-p">
              슬라이드 위에서 컴포넌트를 고르고, 슬라이드 아래 도구에서 컴포넌트 이름을 눌러 '내 컴포넌트로 저장'을 고르면 그 컴포넌트, 그 줄, 슬라이드 전체를 저장해요. 어느 발표에서든 다시 넣을 수 있어요.
            </p>
            <button type="button" className="btn btn-sm" onClick={() => fileRef.current?.click()}>
              <UploadIcon />
              파일에서 가져오기
            </button>
          </div>
        ) : (
          <>
            <div className="mine-head">
              <span className="lib-group-n">{parts.length}개</span>
              <button type="button" className="mine-head-btn" title={`${PARTS_EXT} 파일의 컴포넌트를 더해요`} onClick={() => fileRef.current?.click()}>
                <UploadIcon />
                가져오기
              </button>
              <button type="button" className="mine-head-btn" title="모두 한 파일로 저장해요. 다른 사람과 주고받거나 다른 PC로 옮길 때 써요" onClick={exportAll}>
                <DownloadIcon />
                파일로 저장
              </button>
            </div>
            <ul className="mine-grid">
              {parts.map((part) => {
                const locked = lockedOf(part)
                const drag = part.kind === 'block'
                return (
                  <li key={part.id} className="mine-item">
                    <button
                      type="button"
                      className={cx('lib-card', !drag && 'is-tap', locked && 'is-blocked', why?.id === part.id && 'is-why')}
                      title={
                        locked
                          ? `${part.name}: 이 슬라이드에 ${closed ? '넣지 않아요' : '함께 넣을 수 없어요'}. 눌러서 이유를 보세요`
                          : part.kind === 'slide'
                            ? `${part.name}: 눌러서 이 슬라이드 다음에 새 슬라이드로 넣어요`
                            : part.kind === 'row'
                              ? `${part.name}: 눌러서 이 슬라이드 맨 아래에 넣어요`
                              : `${part.name}: 끌어다 놓거나 눌러서 넣어요`
                      }
                      onPointerDown={(e) => {
                        if (!drag) return
                        const card = e.currentTarget
                        blocks.pressCard(e, freshBlock(part), () => tap(part, card))
                      }}
                      // 끌 수 있는 카드는 위의 누르기에서 끌기와 나눠 다루고, 키보드로 누를 때만 여기서
                      onClick={(e) => (!drag || e.detail === 0) && tap(part, e.currentTarget)}
                    >
                      <SavedThumb deck={look} part={part} />
                    </button>
                    <div className="mine-meta">
                      {renaming === part.id ? (
                        <input
                          className="mine-rename"
                          defaultValue={part.name}
                          aria-label="이름"
                          maxLength={40}
                          autoFocus
                          onFocus={(e) => e.currentTarget.select()}
                          onBlur={(e) => {
                            void renameSaved(part.id, e.currentTarget.value)
                            setRenaming(null)
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') e.currentTarget.blur()
                            else if (e.key === 'Escape') {
                              e.preventDefault()
                              setRenaming(null)
                            }
                          }}
                        />
                      ) : (
                        <span className="mine-name" onDoubleClick={() => setRenaming(part.id)}>
                          {part.name}
                        </span>
                      )}
                      {/* 기본 컴포넌트의 넣을 수 없는 카드와 같은 말과 표시 (자물쇠는 'AI에게 숨기기'의 표시라 쓰지 않는다) */}
                      <span className="mine-kind">
                        {locked ? (
                          <>
                            <NewSlideIcon />
                            새 슬라이드에 넣을 수 있어요
                          </>
                        ) : (
                          kindText(part)
                        )}
                      </span>
                      <Popover
                        flip
                        className="mine-menu"
                        button={({ open, toggle }) => (
                          <button type="button" className="icon-btn mine-more" aria-label={`${part.name} 메뉴`} aria-expanded={open} onClick={toggle}>
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
                                setRenaming(part.id)
                              }}
                            >
                              이름 바꾸기
                            </button>
                            <button
                              type="button"
                              className="menu-item"
                              onClick={() => {
                                close()
                                exportOne(part)
                              }}
                            >
                              파일로 저장
                            </button>
                            <button
                              type="button"
                              className="menu-item is-danger"
                              onClick={() => {
                                close()
                                void remove(part)
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
          </>
        )}
      </div>

      {shownWhy && (
        <div className="lib-why" role="dialog" aria-label={`${josa(shownWhy.part.name, '을', '를')} 넣을 수 없는 이유`}>
          <p className="lib-why-t">{josa(shownWhy.part.name, '은', '는')} 이 슬라이드에 {closed ? '넣지 않아요' : '함께 넣을 수 없어요'}</p>
          <p className="lib-why-p">{shownWhy.text.why}</p>
          <p className="lib-why-p is-fix">{shownWhy.text.fix}</p>
          <div className="lib-why-actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setWhy(null)}>
              닫기
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => insert(shownWhy.part, shownWhy.card, true)}>
              새 슬라이드에 넣기
            </button>
          </div>
        </div>
      )}
    </>
  )
}

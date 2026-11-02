import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { BLOCK_EFFECTS, BLOCK_LOOKS, BLOCKS, blockItems, effectOf, isAlone, shownLook, variantOfBlock, type NoRoom, type SavedKind } from '../../deck/blocks'
import { sceneOf } from '../../deck/scenes'
import type { Block, BlockEffect, Slide } from '../../deck/types'
import { cx } from '../../lib/cx'
import { onMenuKeys } from '../../lib/menuKeys'
import { Icon, MotionIcon, PlusIcon, ShapesIcon, TrashIcon } from '../ui'
import { noRoomText } from './noRoom'
import { SceneOverride } from './ScenePicker'

// 고른 컴포넌트의 도구 (바탕, 움직임, 모양, 항목 더하기, 빼기, 그리고 이름을 누르면 복제, 앞뒤로, 칸 더하기, 저장). 레이아웃 슬라이드의 항목 도구처럼 슬라이드 아래 도구 줄에
// 그린다(SlideStage가 .stage-sel에 넣는다). 슬라이드 위에는 고른 테와 끌어 옮기는 이름표(.bk-handle)만 남는다

/** 내 컴포넌트로 저장하는 것의 이름 */
const SAVE_NAMES: Record<SavedKind, string> = { block: '이 컴포넌트', row: '이 줄', slide: '이 슬라이드 전체' }

/** 바탕 메뉴의 설명 */
const LOOK_NOTES: Record<Block['look'] & string, string> = {
  plain: '슬라이드 바탕 위에 바로 놓여요. 가장 가벼워요.',
  card: '안쪽으로 들여 놓여 옆 컴포넌트와 갈려 보여요.',
  bold: '답을 강조색 글자로 써서 가장 눈에 띄어요. 슬라이드 하나에 하나만 써요.',
}

export function BlockTools({
  slide,
  block,
  itemIssue,
  variantIssue,
  lookIssue,
  onBlocked,
  onShift,
  shiftIssue,
  onLook,
  onEffect,
  onPreview,
  onVariant,
  onAddItem,
  adds,
  onOpenField,
  onDuplicate,
  onRemove,
  saves,
  onSave,
}: {
  /** 이 부품이 있는 장. 장면을 골랐으면 움직임 메뉴가 장면 알림이 된다 */
  slide: Slide
  block: Block
  /** 항목을 더하거나 모양, 바탕을 바꾸면 장에 들어가지 않을 때 그 까닭 */
  itemIssue: NoRoom | null
  variantIssue(variant: string): NoRoom | null
  lookIssue(look: Block['look']): NoRoom | null
  /** 그런 단추를 눌렀을 때 (막아 두되, 누르면 까닭을 보여 준다) */
  onBlocked(r: NoRoom): void
  onShift(dir: -1 | 1): void
  /** 앞(뒤)으로 옮길 수 없는 까닭. 메뉴를 열 때만 묻는다(판을 다시 맞춰 봐야 해서) */
  shiftIssue(dir: -1 | 1): 'first' | 'last' | 'stuck' | null
  onLook(look: Block['look']): void
  onEffect(effect: BlockEffect): void
  onPreview(effect: BlockEffect): void
  onVariant(variant: string): void
  onAddItem(): void
  /** 비어 있어서 접어 둔 칸. '칸 더하기'로 연다 */
  adds: { key: string; label: string; item: boolean; use: string }[]
  onOpenField(key: string): void
  onDuplicate(): void
  onRemove(): void
  /** 내 컴포넌트로 저장할 수 있는 것과 든 컴포넌트 수 */
  saves: { kind: SavedKind; count: number }[]
  onSave(kind: SavedKind): void
}) {
  const spec = BLOCKS[block.type]
  const [menu, setMenu] = useState<'look' | 'motion' | 'variant' | 'more' | null>(null)
  const menuRef = useRef<HTMLUListElement>(null)
  // 메뉴는 도구 아래로 연다. 고른 부품이 장 아래쪽이라 아래에 자리가 모자라면 위로 (위 끝은 머리 띠 아래).
  // 남은 높이만큼만 쓰고 나머지는 메뉴 안에서 스크롤 (노트북의 낮은 창에서 잘리지 않게)
  useLayoutEffect(() => {
    const el = menuRef.current
    const at = el?.parentElement?.getBoundingClientRect()
    if (!el || !at) return
    // 메뉴는 단추에서 8px 떨어져 열리므로 그 8px과 끝의 여백 8px을 뺀다. 위로 열 때 머리 띠(56px) 몫만 빼서
    // 메뉴 위 끝이 머리 띠 아랫선에 딱 붙어 보였다 (1280×600에서 아래쪽 컴포넌트의 움직임 메뉴)
    const below = innerHeight - at.bottom - 16
    const above = at.top - 56 - 16
    const up = below < 260 && above > below
    el.classList.toggle('is-up', up)
    el.style.maxHeight = `${Math.max(160, Math.min(520, up ? above : below))}px`
  }, [menu])
  // 메뉴 밖을 누르면 닫는다. Esc는 메뉴만 닫는다 (먼저 받아서 부품 고르기 닫기, 부품 고르기 끝내기로 넘기지 않는다)
  useEffect(() => {
    if (!menu) return
    const close = (e: PointerEvent) => !(e.target as Element).closest?.('.bk-tool-menu') && setMenu(null)
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      setMenu(null)
    }
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [menu])
  // 그려지는 면을 보인다: 혼자 장 너비를 다 쓰는 작은 부품은 고른 면이 있어도 바탕 없이 그려진다
  const look = shownLook(block, isAlone(block))
  const effect = effectOf(block)
  // 장면을 고른 동안은 장면이 움직임을 정한다 (움직임 탭, 스튜디오와 같게). 고른 값은 남아 장면을 끄면 돌아온다
  const scened = !!sceneOf(slide)
  const variants = spec.variants ?? []
  const variant = variantOfBlock(block)
  const canAdd = !!spec.items && blockItems(block).length < spec.items.max
  const tip = (r: NoRoom | null, ok: string) => (r ? noRoomText(r, block.type, 'change').why : ok)
  const B = 'btn btn-ghost btn-sm'
  return (
    // 장 밖을 누르면 고르기를 끝내는 편집기의 처리(SlideStage)로 넘기지 않는다
    <div className="sel-tools" role="toolbar" aria-label={`${spec.name} 도구`} onPointerDown={(e) => e.stopPropagation()}>
      {/* 이름을 누르면 덜 쓰는 것: 복제, 앞뒤로 한 칸씩(끌어 옮기기는 슬라이드 위 이름표로), 숨긴 칸 꺼내기, 내 컴포넌트로 저장.
          다 늘어놓으면 1280×600의 도구 줄에 들어가지 않아 모든 단추가 글자 없는 그림이 되었다. 줄 끝의 ⋯에 두던 때는 슬라이드의 ⋯와
          나란히 서서 어느 것이 무엇의 메뉴인지 알 수 없었다. 이름에 붙여 '이 컴포넌트의 메뉴'로 읽히게 한다 */}
      <div className="bk-tool-menu">
        <button
          type="button"
          className={cx('sel-name sel-name-btn', menu === 'more' && 'is-on')}
          aria-expanded={menu === 'more'}
          aria-haspopup="menu"
          title={`${spec.name}: 복제, 앞뒤로 옮기기, 칸 더하기, 내 컴포넌트로 저장`}
          onClick={() => setMenu(menu === 'more' ? null : 'more')}
        >
          {spec.name}
          <Icon d="M6 9l6 6 6-6" />
        </button>
        {menu === 'more' && (
          <ul ref={menuRef} className="bk-menu is-more" role="menu" onKeyDown={onMenuKeys} aria-label={`${spec.name} 더 보기`}>
            <li>
              <button
                type="button"
                role="menuitem"
                className="bk-menu-item"
                onClick={() => {
                  onDuplicate()
                  setMenu(null)
                }}
              >
                <b>복제</b>
                <span className="bk-menu-d">바로 뒤에 같은 컴포넌트를 하나 더 넣어요</span>
              </button>
            </li>
            {([-1, 1] as const).map((dir) => {
              // 옮길 수 없으면 잠그고 까닭을 보인다. 예전에는 눌러도 아무 일 없이 메뉴만 닫혀서 고장 난 것처럼 보였다
              const r = shiftIssue(dir)
              return (
                <li key={dir}>
                  <button
                    type="button"
                    role="menuitem"
                    aria-disabled={!!r}
                    className={cx('bk-menu-item', r && 'is-blocked')}
                    onClick={() => {
                      if (r) return
                      onShift(dir)
                      setMenu(null)
                    }}
                  >
                    <b>{dir < 0 ? '앞으로 옮기기' : '뒤로 옮기기'}</b>
                    <span className="bk-menu-d">
                      {r === 'first'
                        ? '읽는 차례로 맨 앞이에요'
                        : r === 'last'
                          ? '읽는 차례로 맨 뒤예요'
                          : r
                            ? `${dir < 0 ? '앞' : '뒤'} 컴포넌트와 자리를 바꿀 수 없어요. 끌어서 옮겨 보세요`
                            : dir < 0
                              ? '읽는 차례로 한 칸 앞 자리와 바꿔요'
                              : '읽는 차례로 한 칸 뒤 자리와 바꿔요'}
                    </span>
                  </button>
                </li>
              )
            })}
            {adds.map((f) => (
              <li key={f.key}>
                <button
                  type="button"
                  role="menuitem"
                  className="bk-menu-item"
                  onClick={() => {
                    onOpenField(f.key)
                    setMenu(null)
                  }}
                >
                  <b>칸 더하기: {f.label}</b>
                  <span className="bk-menu-d">{f.use}</span>
                </button>
              </li>
            ))}
            {saves.map((x) => (
              <li key={x.kind}>
                <button
                  type="button"
                  role="menuitem"
                  className="bk-menu-item"
                  onClick={() => {
                    onSave(x.kind)
                    setMenu(null)
                  }}
                >
                  <b>내 컴포넌트로 저장: {SAVE_NAMES[x.kind]}</b>
                  <span className="bk-menu-d">{x.kind === 'block' ? `${spec.name}, 글과 바탕, 모션까지` : x.kind === 'row' ? `컴포넌트 ${x.count}개를 놓인 비율 그대로` : `제목과 컴포넌트 ${x.count}개, 바탕과 모션까지`}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {/* 바탕: 견본만 늘어놓으면 무엇을 고르는지 알 수 없어서, 지금 바탕의 이름을 보이고 누르면 설명과 함께 고른다 */}
      <div className="bk-tool-menu">
        <button type="button" className={cx(B, menu === 'look' && 'is-on')} aria-expanded={menu === 'look'} title="컴포넌트의 바탕" onClick={() => setMenu(menu === 'look' ? null : 'look')}>
          <span className={cx('bk-look', `is-${look}`)} aria-hidden="true" />
          <span className="btn-t">{BLOCK_LOOKS.find((l) => l.id === look)?.name}</span>
        </button>
        {menu === 'look' && (
          <ul ref={menuRef} className="bk-menu is-looks" role="menu" onKeyDown={onMenuKeys}>
            {BLOCK_LOOKS.map((l) => {
              // 들여 쓰기와 강조는 안쪽 여백만큼 높아져서, 장이 꽉 찼으면 바꿀 수 없다
              const r = look === l.id ? null : lookIssue(l.id)
              return (
                <li key={l.id}>
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={look === l.id}
                    aria-disabled={!!r}
                    className={cx('bk-menu-item', look === l.id && 'is-on', r && 'is-blocked')}
                    onClick={() => {
                      if (r) onBlocked(r)
                      else onLook(l.id)
                      setMenu(null)
                    }}
                  >
                    <span className={cx('bk-look', `is-${l.id}`)} aria-hidden="true" />
                    <b>{l.name}</b>
                    <span className="bk-menu-d">{r ? noRoomText(r, block.type, 'change').why : LOOK_NOTES[l.id]}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
      <div className="bk-tool-menu">
        <button
          type="button"
          className={cx(B, menu === 'motion' && 'is-on')}
          aria-expanded={menu === 'motion'}
          title="발표할 때의 모션"
          onClick={() => setMenu(menu === 'motion' ? null : 'motion')}
        >
          <MotionIcon />
          {/* 기본이면 무엇을 하는 단추인지를, 고른 것이 있으면 그 이름을 ('기본'만 보이면 무엇의 기본인지 모른다) */}
          <span className="btn-t">{scened ? '장면대로' : effect === 'auto' ? '모션' : BLOCK_EFFECTS.find((x) => x.id === effect)?.name}</span>
        </button>
        {menu === 'motion' && scened && (
          // 움직임을 고르게 두면 골라도 발표에서 달라지지 않아 고장 난 것처럼 보였다. 까닭과 끄는 단추만 둔다
          <ul ref={menuRef} className="bk-menu bk-scene">
            <li>
              <SceneOverride slide={slide} />
            </li>
          </ul>
        )}
        {menu === 'motion' && !scened && (
          <ul ref={menuRef} className="bk-menu" role="menu" onKeyDown={onMenuKeys}>
            {BLOCK_EFFECTS.map((x) => (
              <li key={x.id}>
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={effect === x.id}
                  className={cx('bk-menu-item', effect === x.id && 'is-on')}
                  onMouseEnter={() => onPreview(x.id)}
                  onFocus={() => onPreview(x.id)}
                  onClick={() => {
                    onEffect(x.id)
                    setMenu(null)
                  }}
                >
                  {/* 작은 그림: 마우스를 올리면 그 움직임을 되풀이한다 */}
                  <span className={cx('fx-demo', `is-${x.id}`)} aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                  <b>{x.name}</b>
                  <span className="bk-menu-d">{x.id === 'auto' ? spec.motion : x.description}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {/* 모양: 누를 때마다 다음 모양으로 넘기면 무엇이 나올지 몰라서, 이름을 늘어놓고 고른다 */}
      {variants.length > 1 && (
        <div className="bk-tool-menu">
          <button
            type="button"
            className={cx(B, menu === 'variant' && 'is-on')}
            aria-expanded={menu === 'variant'}
            title="컴포넌트의 모양"
            onClick={() => setMenu(menu === 'variant' ? null : 'variant')}
          >
            <ShapesIcon />
            <span className="btn-t">{variants.find((v) => v.id === variant)?.name}</span>
          </button>
          {menu === 'variant' && (
            <ul ref={menuRef} className="bk-menu is-variants" role="menu" onKeyDown={onMenuKeys}>
              {variants.map((v) => {
                const r = v.id === variant ? null : variantIssue(v.id)
                return (
                  <li key={v.id}>
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={v.id === variant}
                      aria-disabled={!!r}
                      className={cx('bk-menu-item', v.id === variant && 'is-on', r && 'is-blocked')}
                      onClick={() => {
                        if (r) onBlocked(r)
                        else onVariant(v.id)
                        setMenu(null)
                      }}
                    >
                      <b>{v.name}</b>
                      {r && <span className="bk-menu-d">{tip(r, '')}</span>}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
      {spec.items && (
        <button
          type="button"
          className={cx(B, canAdd && itemIssue && 'is-blocked')}
          disabled={!canAdd}
          aria-disabled={!canAdd || !!itemIssue}
          title={!canAdd ? `${spec.items.label} ${spec.items.max}개까지 넣을 수 있어요` : tip(itemIssue, `${spec.items.label} 추가`)}
          onClick={() => (itemIssue ? onBlocked(itemIssue) : onAddItem())}
        >
          <PlusIcon />
          <span className="btn-t">{spec.items.label}</span>
        </button>
      )}
      <button type="button" className={B} title="빼기 (Delete)" onClick={onRemove}>
        <TrashIcon />
        <span className="btn-t">빼기</span>
      </button>
    </div>
  )
}

import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent, type UniqueIdentifier } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { slideName } from '../../deck/blocks'
import { missingFields, pageInfo } from '../../deck/fields'
import type { Deck, Slide } from '../../deck/types'
import { cx } from '../../lib/cx'
import { listAccessibility, movedSay, useListDrag } from '../../lib/listDrag'
import { slideOverflow } from '../../slides/overflow'
import { ScaledSlide, SlideCanvas, useStableSections } from '../../slides/SlideCanvas'
import { useDeck } from '../../store/deckStore'
import { AlertIcon, EyeOffIcon, PlusIcon, Popover } from '../ui'
import { AddSlide } from './AddSlide'
import { useDrawSoon } from '../drawSoon'
import { useAfterPaint, useLook } from './look'

export function SlideList({ deck, selectedId }: { deck: Deck; selectedId: string | null }) {
  const select = useDeck((s) => s.select)
  const moveSlide = useDeck((s) => s.moveSlide)
  const addSlide = useDeck((s) => s.addSlide)
  const look = useLook(deck)
  const info = pageInfo(deck.slides)
  const sections = useStableSections(info)
  // 목록을 처음 그린 뒤에 생긴 목록 그림(새로 더하거나 복제한 장)은 고치는 장이 먼저 보이게 그 뒤에 그린다 (Thumb)
  const later = useRef(false)
  useEffect(() => {
    later.current = true
  }, [])
  // 끌기는 마우스로만. dnd-kit의 키보드 끌기는 Space와 Enter로 시작해서, 장을 고르려고 Enter를 누르면 끌기가 시작됐다.
  // 키보드로는 Alt+위아래 화살표로 한 칸씩 옮긴다 (아래 onKeyDown)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const drag = useListDrag()
  // 화면 읽기 프로그램에 들려줄 말. dnd-kit의 기본 안내는 영어라 한국어로 바꾼다
  const [said, setSaid] = useState('')
  // 고른 장이 목록 밖에 있으면 보이는 곳으로 (장을 더하거나 장 위에서 넘겼을 때. 목록 안에서 고르면 이미 보인다)
  useEffect(() => {
    if (selectedId) document.getElementById(`thumb-${selectedId}`)?.scrollIntoView({ block: 'nearest' })
  }, [selectedId])

  const nameOf = (id: UniqueIdentifier) => {
    const i = deck.slides.findIndex((s) => s.id === id)
    return i < 0 ? '슬라이드' : `${i + 1}번째 슬라이드 ‘${slideName(deck.slides[i])}’`
  }
  const placeOf = (id: UniqueIdentifier) => deck.slides.findIndex((s) => s.id === id) + 1
  const accessibility = listAccessibility(nameOf, placeOf)

  const onDragEnd = (e: DragEndEvent) => {
    drag.end()
    if (!e.over || e.active.id === e.over.id) return
    const from = deck.slides.findIndex((s) => s.id === e.active.id)
    const to = deck.slides.findIndex((s) => s.id === e.over!.id)
    moveSlide(from, to)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    if (e.ctrlKey || e.metaKey || e.shiftKey) return
    const i = deck.slides.findIndex((s) => s.id === selectedId)
    const to = i + (e.key === 'ArrowDown' ? 1 : -1)
    if (i < 0 || to < 0 || to >= deck.slides.length) return
    e.preventDefault()
    const id = deck.slides[i].id
    if (e.altKey) {
      // 고른 장을 한 칸 옮긴다. 옮기면서 단추가 다시 붙어 초점이 빠지므로 다시 둔다
      setSaid(movedSay(nameOf(id), to + 1))
      moveSlide(i, to)
      requestAnimationFrame(() => document.getElementById(`thumb-${id}`)?.focus())
      return
    }
    const next = deck.slides[to]
    select(next.id)
    document.getElementById(`thumb-${next.id}`)?.focus()
  }

  return (
    <nav className="sl" aria-label="슬라이드 목록">
      <p className="sr-only" aria-live="polite">
        {said}
      </p>
      <div className="sl-scroll" onKeyDown={onKeyDown}>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={drag.modifiers}
          autoScroll={drag.autoScroll}
          onDragStart={drag.start}
          onDragEnd={onDragEnd}
          onDragCancel={drag.end}
          accessibility={accessibility}
        >
          <SortableContext items={deck.slides.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            {deck.slides.map((slide) => (
              <Thumb
                key={slide.id}
                meta={deck.meta}
                theme={deck.theme}
                title={deck.title}
                slide={slide}
                page={info.page.get(slide.id) ?? 0}
                total={info.total}
                sections={sections}
                sectionIndex={info.sectionOf.get(slide.id) ?? -1}
                selected={slide.id === selectedId}
                missing={missingFields(slide, deck.meta).length}
                onSelect={select}
                later={later}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>
      <Popover
        align="left"
        className="sl-add-pop"
        button={({ toggle, open }) => (
          <button type="button" className="btn btn-ghost sl-add" aria-expanded={open} onClick={toggle}>
            <PlusIcon />
            슬라이드 추가
          </button>
        )}
      >
        {(close) => (
          <AddSlide
            look={look}
            onPick={(id) => {
              addSlide(id, selectedId ?? undefined)
              close()
            }}
          />
        )}
      </Popover>
    </nav>
  )
}

interface ThumbProps {
  meta: Deck['meta']
  theme: Deck['theme']
  title: string
  slide: Slide
  page: number
  total: number
  sections: readonly string[]
  sectionIndex: number
  selected: boolean
  missing: number
  onSelect: (id: string) => void
  /** 목록을 처음 그린 뒤인지 (늘 같은 상자라 바뀌어도 다시 그리지 않는다) */
  later: { readonly current: boolean }
}

const Thumb = memo(function Thumb(props: ThumbProps) {
  const { meta, theme, title, slide, page, total, sections, sectionIndex, selected, missing, onSelect, later } = props
  const look = useMemo(() => ({ meta, theme, title }), [meta, theme, title])
  // 장 그림은 고친 것이 화면에 그려진 다음에 고친다 (look.ts의 useAfterPaint)
  const shown = useAfterPaint(slide)
  const btnRef = useRef<HTMLButtonElement>(null)
  // 장 그림은 화면이 한 번 그려진 뒤에 차례로 그린다 (drawSoon.ts의 useDrawSoon). 그림도 글을 맞춰서 한꺼번에 그리면 느린 PC에서
  // 장을 더할 때(새 그림과 고치는 장) 0.2초, 편집기를 열 때(발표에서 돌아올 때도) 목록 그림 열일곱 장에 0.1초 넘게 멈췄다.
  // 편집기를 열 때 목록에 보이는 그림은 처음부터 그린다. 새로 더한 장의 그림은 고치는 장이 먼저 보이게 늘 뒤에
  const [fresh] = useState(() => later.current)
  const ready = useDrawSoon(false, fresh ? undefined : btnRef)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: slide.id, attributes: { roleDescription: '옮길 수 있는 슬라이드' } })
  // 글이 넘친 장: 다른 장을 고치는 동안에도 보이게 그림을 잰다 (편집기의 '글이 넘쳤어요'와 같은 잣대, slides/overflow.ts)
  const [over, setOver] = useState(false)
  useEffect(() => {
    const root = btnRef.current?.querySelector<HTMLElement>('.slide')
    if (!root) return
    const check = () => setOver(slideOverflow(root) === 'over')
    check()
    if (document.fonts?.status === 'loading') void document.fonts.ready.then(check)
  }, [shown, look, ready])
  return (
    <div
      ref={setNodeRef}
      className={cx('thumb', selected && 'is-on', slide.hidden && 'is-hidden', isDragging && 'is-drag')}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <span className="thumb-n">{slide.hidden ? <EyeOffIcon /> : page}</span>
      <button
        type="button"
        ref={btnRef}
        id={`thumb-${slide.id}`}
        className="thumb-btn"
        aria-current={selected || undefined}
        // 이름은 짧게: 몇 번 장, 장 이름, 빈칸 수. 장 그림과 아래 이름은 이 이름과 겹치니 읽지 않는다
        aria-label={`${page ? `슬라이드 ${page}` : '숨긴 슬라이드'}, ${slideName(slide)}${missing ? `, 빈칸 ${missing}곳` : ''}`}
        onClick={() => onSelect(slide.id)}
        {...attributes}
        {...listeners}
        role="button"
      >
        <ScaledSlide width={170} decorative>
          {ready && <SlideCanvas deck={look} slide={shown} mode="preview" page={page} total={total} sections={sections} sectionIndex={sectionIndex} />}
        </ScaledSlide>
        {/* 이 장에 무엇을 쓰면 되는지는 이름에 마우스를 올리면 (오른쪽 칸에 늘 펼쳐 두지 않는다) */}
        <span className="thumb-label" title={slide.guide || undefined} aria-hidden="true">
          {missing > 0 && <span className="thumb-dot" aria-hidden="true" />}
          {over && (
            <span className="thumb-over" title="글이 슬라이드 밖으로 넘쳤어요">
              <AlertIcon />
            </span>
          )}
          {slideName(slide)}
        </span>
      </button>
    </div>
  )
})

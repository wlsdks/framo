import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS as DndCss } from '@dnd-kit/utilities'
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { cx } from '../../../lib/cx'
import { keys } from '../../../lib/keys'
import { listAccessibility, movedSay, useListDrag } from '../../../lib/listDrag'
import { GripIcon, Icon, Info, PlayIcon } from '../../ui'
import type { Lane, Player } from './player'

// 움직임 편집 아래의 시간표. 줄마다 그 컴포넌트가 움직이는 동안을 막대로 보이고, 바늘을 끌어 그때의 모습을 본다.
// 막대를 끌어 시간을 바꾸지는 않는다(고르는 방식): 줄을 위아래로 끌어 차례를 바꾸고, 때와 움직임은 오른쪽에서 고른다

/** 눈금 사이(ms). 시간표가 길면 1초마다 */
const tickStep = (span: number) => (span > 6000 ? 1000 : 500)

const sec = (ms: number) => `${(ms / 1000).toFixed(1)}초`

export function Timeline({
  player,
  order,
  selected,
  hot,
  onSelect,
  onHot,
  onMove,
  quiet = null,
  onEnter = null,
}: {
  player: Player
  /** 앞 장에서 이 장으로 넘어오는 모습부터 보기. 첫 장이거나 움직이지 않으면 null */
  onEnter?: (() => void) | null
  /** 움직이지 않는 까닭: 컴퓨터의 '동작 줄이기'(reduced)나 이 장의 움직임 정도 '없음'(none) */
  quiet?: 'reduced' | 'none' | null
  /** 줄을 끌어 바꿀 수 있는 컴포넌트 id들 (나오는 차례) */
  order: string[]
  selected: string | null
  hot: string | null
  onSelect(block: string): void
  onHot(block: string | null): void
  onMove(from: number, to: number): void
}) {
  const { plan } = player
  // 시간표는 0.5초 단위로 끊어서 끝 눈금이 꼭 붙게. 움직임이 없어도 1초는 그린다
  const span = Math.max(1000, Math.ceil(plan.total / 500) * 500)
  const gridRef = useRef<HTMLDivElement>(null)
  const timeRef = useRef<HTMLSpanElement>(null)
  const scrubRef = useRef<HTMLDivElement>(null)

  // 바늘과 막대의 지난 부분은 한 프레임마다 CSS 변수 하나(--p)만 고친다 (줄마다 다시 그리지 않게)
  useEffect(
    () =>
      player.subscribe((t) => {
        gridRef.current?.style.setProperty('--p', String(Math.min(1, t / span)))
        if (timeRef.current) timeRef.current.textContent = sec(t)
        scrubRef.current?.setAttribute('aria-valuenow', String(Math.round(t)))
        scrubRef.current?.setAttribute('aria-valuetext', sec(t))
      }),
    [player, span],
  )

  const at = (e: { clientX: number }) => {
    const r = scrubRef.current?.getBoundingClientRect()
    if (!r || !r.width) return 0
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * span
  }
  const onScrub = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    // 글이 골라지지 않게 기본 동작을 막으면 초점도 오지 않는다. 바늘로 옮겨 둔다: 누른 뒤의 ←, →가 바늘 대신 장을 넘겼다
    e.preventDefault()
    const el = e.currentTarget
    el.focus({ preventScroll: true })
    el.setPointerCapture(e.pointerId)
    player.seek(at(e))
    const move = (ev: PointerEvent) => player.seek(at(ev))
    const up = () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
  }
  const now = () => Number(scrubRef.current?.getAttribute('aria-valuenow') ?? 0)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))
  const drag = useListDrag()
  const onDragEnd = (e: DragEndEvent) => {
    drag.end()
    if (!e.over || e.active.id === e.over.id) return
    onMove(order.indexOf(String(e.active.id)), order.indexOf(String(e.over.id)))
  }

  const ticks: number[] = []
  for (let t = 0; t <= span; t += tickStep(span)) ticks.push(t)
  const head = plan.lanes.filter((l) => !l.block)
  const lanes = order.map((id) => plan.lanes.find((l) => l.block === id)).filter((l): l is Lane => !!l)
  const accessibility = listAccessibility(
    (id) => lanes.find((l) => l.block === id)?.name ?? '컴포넌트',
    (id) => order.indexOf(String(id)) + 1,
  )
  const none = !plan.lanes.length
  // 키보드로 옮긴 것은 여기서 읽는다(끌어 놓은 것은 dnd-kit이 accessibility의 문장으로). 예전에는 Alt+화살표로 줄을 옮겨도
  // 아무것도 읽지 않아, 화면을 보지 않으면 옮겨졌는지 알 수 없었다
  const [said, setSaid] = useState('')
  const keyMove = (i: number, to: number) => {
    if (to < 0 || to >= order.length) return
    onMove(i, to)
    setSaid(movedSay(lanes[i].name, to + 1))
  }

  return (
    <section className={cx('ms-tl', player.solo && 'is-solo', quiet && 'is-quiet')} aria-label="시간표">
      <p className="sr-only" aria-live="polite">
        {said}
      </p>
      <div className="ms-tl-bar">
        <button type="button" className="ms-play" disabled={!!quiet} aria-label={player.playing ? '멈추기' : '재생'} title={`${player.playing ? '멈추기' : '재생'} (Space)`} onClick={player.toggle}>
          {player.playing ? <PauseIcon /> : <PlayIcon />}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={!!quiet} onClick={player.restart}>
          <RestartIcon />
          처음부터
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={!onEnter}
          title={onEnter ? '앞 슬라이드에서 이 슬라이드로 넘어오는 모습부터 보여요' : '앞 슬라이드가 없거나 움직이지 않아서 볼 수 없어요'}
          onClick={onEnter ?? undefined}
        >
          <EnterIcon />앞 슬라이드에서 넘어오기
        </button>
        <p className="ms-time">
          <span ref={timeRef}>0.0초</span>
          <span className="ms-total"> / {sec(plan.total)}</span>
        </p>
        {plan.clicks.length > 0 && (
          <p className="ms-tl-note" title="발표할 때는 이 자리에서 누를 때까지 기다려요. 여기서는 잠깐 쉬었다 이어서 보여요.">
            <ClickIcon />
            누르면 나오는 차례 {plan.clicks.length}번
          </p>
        )}
      </div>

      <div ref={gridRef} className="ms-tl-grid" style={{ '--p': 0 } as CSSProperties}>
        <div className="ms-tl-row ms-tl-ruler">
          <span className="ms-lane-l ms-ruler-l">나오는 차례</span>
          <div
            ref={scrubRef}
            className="ms-track ms-scrub"
            role="slider"
            tabIndex={0}
            aria-label={`재생 위치. ${keys('←')}, ${keys('→')}로 옮겨요`}
            aria-valuemin={0}
            aria-valuemax={Math.round(plan.total)}
            aria-valuenow={0}
            onPointerDown={onScrub}
            onKeyDown={(e) => {
              const step = e.shiftKey ? 500 : 100
              const to = e.key === 'ArrowRight' ? now() + step : e.key === 'ArrowLeft' ? now() - step : e.key === 'Home' ? 0 : e.key === 'End' ? plan.total : null
              if (to === null) return
              e.preventDefault()
              player.seek(to)
            }}
          >
            {ticks.map((t) => (
              <span key={t} className={cx('ms-tick', t === span && 'is-end')} style={{ left: `${(t / span) * 100}%` }}>
                {t % 1000 === 0 && t < span ? `${t / 1000}초` : ''}
              </span>
            ))}
            {plan.clicks.map((c) => (
              <span key={c.step} className="ms-click" style={{ left: `${(c.at / span) * 100}%` }} title="발표할 때는 여기서 누를 때까지 기다려요">
                <ClickIcon />
                {c.step}
              </span>
            ))}
            <span className="ms-head" aria-hidden="true" />
          </div>
        </div>

        <div className="ms-tl-body">
          {quiet === 'reduced' ? (
            <p className="ms-tl-empty">
              컴퓨터에서 ‘동작 줄이기’를 켜 두어서 움직이지 않아요. 이 컴퓨터로 발표할 때도 바로 다 보여요.
              <Info label="동작 줄이기 끄는 법" align="start">
                윈도우는 설정 › 접근성 › 시각 효과에서 ‘애니메이션 효과’를 켜요. 맥은 시스템 설정 › 손쉬운 사용 › 디스플레이에서 ‘동작 줄이기’를 꺼요.
              </Info>
            </p>
          ) : quiet === 'none' ? (
            <p className="ms-tl-empty">모션 세기가 ‘없음’이라 움직이지 않아요. 오른쪽 ‘이 슬라이드’에서 모션 세기를 골라 보세요.</p>
          ) : (
            none && <p className="ms-tl-empty">이 슬라이드에는 움직이는 것이 없어요.</p>
          )}
          {head.filter((l) => l.id === 'head').map((l) => (
            <Row key={l.id} lane={l} span={span} />
          ))}
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
            <SortableContext items={order} strategy={verticalListSortingStrategy}>
              {lanes.map((l, i) => (
                <SortRow
                  key={l.id}
                  lane={l}
                  span={span}
                  n={i + 1}
                  on={selected === l.block}
                  hot={hot === l.block}
                  solo={player.solo === l.block}
                  onSelect={() => onSelect(l.block!)}
                  onHot={onHot}
                  onMove={(d) => keyMove(i, i + d)}
                />
              ))}
            </SortableContext>
          </DndContext>
          {head.filter((l) => l.id !== 'head').map((l) => (
            <Row key={l.id} lane={l} span={span} />
          ))}
          {/* 누르는 때와 바늘은 줄 전체에 걸쳐 한 줄씩 */}
          {plan.clicks.map((c) => (
            <span key={c.step} className="ms-cut" style={{ '--x': c.at / span } as CSSProperties} aria-hidden="true" />
          ))}
          <span className="ms-needle" aria-hidden="true" />
        </div>
      </div>
    </section>
  )
}

function Bar({ lane, span }: { lane: Lane; span: number }) {
  if (lane.start < 0) return <span className="ms-still">모션 없음</span>
  const s = lane.start / span
  const e = Math.max(lane.end, lane.start + 60) / span
  return <span className="ms-bar" style={{ left: `${s * 100}%`, width: `${(e - s) * 100}%`, '--s': s, '--e': e } as CSSProperties} />
}

/** 제목, 출처처럼 차례를 바꿀 수 없는 줄 */
function Row({ lane, span }: { lane: Lane; span: number }) {
  return (
    <div className="ms-tl-row is-fixed" title="이 줄은 나오는 차례가 정해져 있어요">
      <span className="ms-lane-l">
        <span className="ms-name">{lane.name}</span>
      </span>
      <div className="ms-track">
        <Bar lane={lane} span={span} />
      </div>
    </div>
  )
}

function SortRow({
  lane,
  span,
  n,
  on,
  hot,
  solo,
  onSelect,
  onHot,
  onMove,
}: {
  lane: Lane
  span: number
  n: number
  on: boolean
  hot: boolean
  /** 이 줄 하나만 움직이는 중 */
  solo: boolean
  onSelect(): void
  onHot(block: string | null): void
  onMove(d: 1 | -1): void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: lane.block! })
  return (
    <div
      ref={setNodeRef}
      className={cx('ms-tl-row', on && 'is-on', hot && 'is-hot', isDragging && 'is-dragging', solo && 'is-solo')}
      style={{ transform: DndCss.Translate.toString(transform), transition }}
      onPointerEnter={() => onHot(lane.block!)}
      onPointerLeave={() => onHot(null)}
    >
      {/* 줄 이름 전체를 잡고 끈다: 손잡이만 잡게 했더니 18px짜리라 잡기 어려웠고, 이름을 끌어도 아무 일이 없었다.
          4px 넘게 움직여야 끌기라서 눌렀다 떼면 예전처럼 고르기다 */}
      <span className="ms-lane-l" {...listeners}>
        <span className="ms-grip" aria-hidden="true">
          <GripIcon />
        </span>
        <button
          type="button"
          className="ms-lane-btn"
          {...attributes}
          aria-pressed={on}
          aria-roledescription="끌어서 차례를 바꾸는 줄"
          onClick={onSelect}
          onKeyDown={(e) => {
            if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return
            e.preventDefault()
            onMove(e.key === 'ArrowUp' ? -1 : 1)
          }}
        >
          <span className="ms-n">{n}</span>
          <span className="ms-name">{lane.name}</span>
        </button>
      </span>
      <div className="ms-track" onClick={onSelect}>
        <Bar lane={lane} span={span} />
      </div>
    </div>
  )
}

const PauseIcon = () => <Icon className="icon-fill" d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" />
/** 앞 장에서 넘어오기: 뒤 장 앞에 비켜 선 앞 장 */
const EnterIcon = () => <Icon d="M3.5 7.5h9v9h-9zM9 4.5h11.5v13" />
const RestartIcon = () => <Icon d="M4.5 12a7.5 7.5 0 102.2-5.3M4.5 4.5v4h4" />
/** 누르는 때: 화살표 끝과 퍼지는 금 */
export const ClickIcon = () => <Icon d="M9 9l10 4-4.2 1.6L13 19zM6.5 3.5l1 2.2M3.5 6.5l2.2 1M3.5 11l2-.6M11 3.5l-.6 2" />

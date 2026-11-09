import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { BLOCKS, blockItems, blockNames, blockSlide } from '../../deck/blocks'
import { hintFor } from '../../deck/layouts'
import type { Block, Slide } from '../../deck/types'
import { useDeck } from '../../store/deckStore'
import { Info, Modal } from '../ui'

/** 선 위의 숨은 입력칸을 찾지 않아도, 흐름 차트의 숫자를 보통 입력칸에서 고친다. */
export function ChartData({ slide }: { slide: Slide }) {
  const [open, setOpen] = useState(false)
  const charts = slide.layout === 'compose' ? (slide.blocks ?? []).filter((b) => b.type === 'spark' || b.type === 'sparks') : []
  if (!charts.length) return null
  return (
    <>
      <button type="button" className="btn btn-ghost btn-sm chart-data-open" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        차트 데이터 편집
      </button>
      {open && createPortal(
        <ChartDataDialog slide={slide} charts={charts} onClose={() => setOpen(false)} />,
        document.body,
      )}
    </>
  )
}

function ChartDataDialog({ slide, charts, onClose }: { slide: Slide; charts: Block[]; onClose: () => void }) {
  const content = useRef<HTMLDivElement>(null)
  const [scroll, setScroll] = useState({ needed: false, more: false })
  useLayoutEffect(() => {
    const inner = content.current
    const body = inner?.parentElement
    if (!inner || !body) return
    const check = () => {
      const needed = body.scrollHeight > body.clientHeight + 2
      const more = body.scrollTop + body.clientHeight < body.scrollHeight - 2
      setScroll((prev) => prev.needed === needed && prev.more === more ? prev : { needed, more })
    }
    check()
    const observer = new ResizeObserver(check)
    observer.observe(body)
    observer.observe(inner)
    body.addEventListener('scroll', check, { passive: true })
    return () => {
      observer.disconnect()
      body.removeEventListener('scroll', check)
    }
  }, [])
  return (
    <Modal
      title="차트 데이터 편집"
      className="chart-data"
      onClose={onClose}
      actions={
        <>
          {scroll.needed && (
            <button type="button" className="btn btn-ghost chart-data-more" disabled={!scroll.more} onClick={() => {
              const body = content.current?.parentElement
              if (body) body.scrollBy({ top: body.clientHeight * 0.75 })
            }}>
              아래 입력칸 보기
            </button>
          )}
          <button type="button" className="btn btn-primary" onClick={onClose}>닫기</button>
        </>
      }
    >
      <div ref={content}>
        <p className="chart-data-note">고칠 때마다 저장돼요. 예시는 안내이며 발표에 들어가지 않아요.</p>
        <ChartDataFields slide={slide} charts={charts} />
      </div>
    </Modal>
  )
}

/** 안내를 실제 값으로 채우지 않는다. 새 창에서도 비운 칸과 사람이 쓴 글을 그대로 유지한다. */
function ChartDataFields({ slide, charts }: { slide: Slide; charts: Block[] }) {
  const updateBlock = useDeck((s) => s.updateBlock)
  const names = blockNames(charts)
  return (
    <div className="chart-data-sections">
      {charts.map((block, chartIndex) => {
        const spec = BLOCKS[block.type]
        const own = blockSlide(slide, block)
        const name = names.get(block.id)!
        return (
          <section key={block.id} className="chart-data-section" aria-label={name}>
            <h3>
              {name}
              {spec.items && <small>{spec.items.label} {blockItems(block).length}개</small>}
              <Info label="차트 숫자 입력 방법">
                시간 순서대로 숫자를 쉼표와 공백으로 나눠 적어요. 예: 10, 20, 30. 천 단위 쉼표가 있으면 1,200, 1,500처럼 숫자 사이를 띄워 주세요.
                {block.type === 'spark' && ' 지금 숫자와 흐름은 따로 입력해요. 같은 지표를 보여 주려면 지금 숫자를 흐름의 마지막 값에 맞춰 주세요.'}
              </Info>
            </h3>
            <div className="chart-data-fields">
              {spec.fields.map((field) => (
                <label key={field.key}>
                  <span>{field.label}{field.optional && <small> (선택)</small>}</span>
                  <input
                    className="input"
                    aria-label={`${name} ${field.label}`}
                    value={block.fields[field.key] ?? ''}
                    placeholder={hintFor(own.layout, own.hints, field.key)}
                    data-autofocus={chartIndex === 0 && field.key === 'series' || undefined}
                    onChange={(e) => {
                      const value = e.target.value
                      updateBlock(slide.id, block.id, (b) => ({ ...b, fields: { ...b.fields, [field.key]: value } }), `${slide.id}.chart.${block.id}.${field.key}`)
                    }}
                  />
                </label>
              ))}
            </div>
            {spec.items && (
              <ol className="chart-data-rows">
                {blockItems(block).map((item, i) => (
                  <li key={item.id}>
                    <h4>{spec.items!.label} {i + 1}</h4>
                    <div className="chart-data-row">
                      {spec.items!.fields.map((field) => (
                        <label key={field.key}>
                          <span>{field.key === 'value' ? '차례대로 숫자' : field.label}{field.optional && <small> (선택)</small>}</span>
                          <input
                            className="input"
                            aria-label={`${name} ${i + 1} ${field.key === 'value' ? '차례대로 숫자' : field.label}`}
                            value={item[field.key] ?? ''}
                            placeholder={hintFor(own.layout, own.hints, field.key, field.key, i)}
                            data-autofocus={chartIndex === 0 && i === 0 && field.key === 'value' || undefined}
                            onChange={(e) => {
                              const value = e.target.value
                              // 줄 번호가 아니라 id로 고친다. 다른 줄의 내용과 숨겨 둔 칸은 건드리지 않는다.
                              updateBlock(slide.id, block.id, (b) => ({ ...b, items: b.items.map((it) => it.id === item.id ? { ...it, [field.key]: value } : it) }), `${slide.id}.chart.${block.id}.${item.id}.${field.key}`)
                            }}
                          />
                        </label>
                      ))}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        )
      })}
    </div>
  )
}

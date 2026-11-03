import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import { asksDecision, AUDIENCES, BLUEPRINTS, DECK_GROUPS, DURATIONS, METHODS } from '../deck/blueprints'
import { pageInfo } from '../deck/fields'
import { createDeck, formatDate, makeSlide } from '../deck/generate'
import { LAYOUTS } from '../deck/layouts'
import { THEMES, THEME_ORDER } from '../deck/themes'
import type { Audience, Deck, DeckMeta, DeckType, Method, Slide, ThemeId } from '../deck/types'
import { cx } from '../lib/cx'
import { go } from '../lib/router'
import { FitSlide, pageProps, SlideCanvas } from '../slides/SlideCanvas'
import { persistNow } from '../store/persist'
import { useDrawSoon } from './drawSoon'
import { BackIcon, Brand, CheckIcon, ChevronIcon, Info, SAVE_HELP, Segmented, useToast } from './ui'

// 발표 상황: 누구에게, 얼마나, 어떻게 발표하는지. 표지: 제목, 결정 요청(또는 부제), 발표자와 테마
const STEPS = ['발표 종류', '발표 상황', '표지']

/**
 * 3단계의 표지 아래에 작게 보일 다음 장 수. 넘으면 마지막 칸에 남은 장 수를 적는다.
 * 작은 장 그림은 너비 96px 아래로 줄지 않아서(FitSlide), 칸이 좁은 낮은 화면에서는 셋으로 줄인다
 */
const STRIP = 4
const STRIP_LOW = 3
const LOW = '(max-height: 760px)'

/** 화면 조건(media query)이 맞는지. 창 크기를 바꾸면 따라 바뀐다 */
function useMedia(query: string) {
  return useSyncExternalStore(
    (on) => {
      const m = matchMedia(query)
      m.addEventListener('change', on)
      return () => m.removeEventListener('change', on)
    },
    () => matchMedia(query).matches,
  )
}

/** 발표 종류 미리 보기의 작은 그림들: 이야기 흐름의 차례마다 그 구성에서 만들어지는 장 하나 (blueprints의 showcase) */
function filmOf(type: DeckType): { deck: Deck; slides: Slide[] } {
  const bp = BLUEPRINTS[type]
  const deck = createDeck({
    type,
    ...bp.defaults,
    method: 'live',
    title: '',
    org: '',
    presenter: '',
    theme: 'white',
  })
  const slides = (bp.showcase ?? []).flatMap((purpose) => {
    const recipe = bp.recipes.find((r) => r.purpose === purpose)
    return recipe ? [makeSlide(recipe.layout, recipe)] : []
  })
  return { deck: { ...deck, slides }, slides }
}

export function Wizard() {
  const [step, setStepNow] = useState(0)
  // 앞으로 가면 오른쪽에서, 뒤로 가면 왼쪽에서 들어온다. 어느 쪽으로 움직였는지 몸으로 알게
  const [dir, setDir] = useState<1 | -1>(1)
  const setStep = (next: number) => {
    setDir(next < step ? -1 : 1)
    setStepNow(next)
  }
  const [type, setTypeNow] = useState<DeckType>('business')
  const [audience, setAudienceNow] = useState<Audience>(BLUEPRINTS.business.defaults.audience)
  const [minutes, setMinutesNow] = useState(BLUEPRINTS.business.defaults.minutes)
  // 듣는 사람과 시간은 종류마다 흔한 값(blueprints의 defaults)으로 먼저 골라 둔다. 사람이 고른 값은 종류를 바꿔도 덮지 않는다
  const [picked, setPicked] = useState({ audience: false, minutes: false })
  const setType = (t: DeckType) => {
    setTypeNow(t)
    const d = BLUEPRINTS[t].defaults
    if (!picked.audience) setAudienceNow(d.audience)
    if (!picked.minutes) setMinutesNow(d.minutes)
  }
  const setAudience = (a: Audience) => {
    setPicked((p) => ({ ...p, audience: true }))
    setAudienceNow(a)
  }
  const setMinutes = (m: number) => {
    setPicked((p) => ({ ...p, minutes: true }))
    setMinutesNow(m)
  }
  const [method, setMethod] = useState<Method>('live')
  const [title, setTitle] = useState('')
  // 소속과 발표자는 지난번 마법사에서 적은 것으로 먼저 채운다. 주간 보고처럼 자주 만드는 발표는 매번 같은 것을 다시 쳐야 했다.
  // 이 브라우저에만 두고, 비워서 만들면 다음에도 비운다
  const [org, setOrg] = useState(() => lastAuthor().org)
  const [presenter, setPresenter] = useState(() => lastAuthor().presenter)
  const [ask, setAsk] = useState('')
  const [lead, setLead] = useState('')
  const [theme, setTheme] = useState<ThemeId>('white')
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  const blueprint = BLUEPRINTS[type]
  // 결정을 받는 자리가 아닌 발표(나누고 알리는 발표)는 결정 요청 대신 부제를 묻는다. 다른 종류에서 적어 둔 것은 넣지 않는다
  const askOn = asksDecision(type)
  const strip = useMedia(LOW) ? STRIP_LOW : STRIP
  // 2단계 오른쪽에 보여 줄 구성. 고르는 대로 바로 바뀐다
  const preview = useMemo(
    () =>
      createDeck({
        type,
        audience,
        minutes,
        method,
        title: '',
        org: '',
        presenter: '',
        theme,
      }),
    [type, audience, minutes, method, theme],
  )
  const previewInfo = useMemo(() => pageInfo(preview.slides), [preview])

  // 단계를 넘기면 맨 위부터 보이게. 앞 단계에서 내려 둔 스크롤이 남으면 제목과 단계 표시가 가려진다
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [step])

  // 빈 발표를 골랐다가 '이전'으로 돌아오면 그 전에 골라 둔 종류로 되돌린다.
  // 빈 발표인 채로 두면 1단계에 골라진 것이 없고, '다음'이 구성이 빈 2단계를 연다
  const [typeBefore, setTypeBefore] = useState<DeckType>('business')
  const startBlank = () => {
    if (type !== 'blank') setTypeBefore(type)
    setType('blank')
    setStep(2)
  }
  const back = () => {
    if (type === 'blank' && step === 2) {
      setType(typeBefore)
      setStep(0)
    } else setStep(step - 1)
  }
  // 지나온 단계는 단계 표시에서 눌러 바로 돌아간다. 빈 발표는 앞 두 단계를 건너뛰었으니 '이전'과 같이 처음으로
  const backTo = (i: number) => {
    if (i >= step) return
    if (type === 'blank') back()
    else setStep(i)
  }

  const create = async () => {
    setBusy(true)
    try {
      const deck = createDeck({
        type,
        audience,
        minutes,
        method,
        title,
        org,
        presenter,
        ask: askOn ? ask : '',
        lead: askOn ? '' : lead,
        theme,
      })
      // 저장하지 못한 채 편집기로 가면 '찾을 수 없는 발표'로 보인다. 여기 머물러 다시 누를 수 있게
      if (await persistNow(deck)) {
        rememberAuthor(org, presenter)
        go({ name: 'edit', id: deck.id })
      }
      else toast.show(`발표를 만들지 못했어요. ${SAVE_HELP}`, undefined, 8000)
    } catch {
      toast.show(`발표를 만들지 못했어요. ${SAVE_HELP}`, undefined, 8000)
    } finally {
      setBusy(false)
    }
  }

  const rest = preview.slides.slice(1)

  return (
    <div className="wz">
      <header className="wz-top">
        <Brand />
        <ol className="wz-steps" aria-label="진행 단계">
          {STEPS.map((name, i) => (
            <li key={name} className={cx(i === step && 'is-current', i < step && 'is-done')} aria-current={i === step ? 'step' : undefined}>
              {i < step ? (
                <button type="button" className="wz-step" onClick={() => backTo(i)} aria-label={`${name} 단계로 돌아가기`}>
                  <span className="wz-step-n">
                    <CheckIcon />
                  </span>
                  {name}
                </button>
              ) : (
                <span className="wz-step">
                  <span className="wz-step-n">{i + 1}</span>
                  {name}
                </span>
              )}
            </li>
          ))}
        </ol>
        <button type="button" className="btn btn-ghost" onClick={() => go({ name: 'home' })}>
          취소
        </button>
      </header>

      <main className="wz-main" style={{ '--wz-dir': dir }}>
        {step === 0 && (
          <section className="wz-sec wz-split wz-split-types">
            <div className="wz-head">
              <h1 className="wz-h">어떤 발표인가요?</h1>
              <p className="wz-sub">고르면 그에 맞는 순서로 슬라이드를 만들어 드려요.</p>
            </div>
            <div className="wz-form">
              {/* 열셋을 한 줄로 늘어놓으면 찾기 어려워서, 회사에서 PPT를 만드는 자리 셋으로 나눠 나란히 둔다 */}
              <div className="wz-kinds">
                {DECK_GROUPS.map((g) => (
                  <div key={g.name} className="wz-kind" role="group" aria-label={g.name}>
                    <h2 className="wz-kind-h">{g.name}</h2>
                    {g.types.map((t) => (
                      <button
                        key={t}
                        type="button"
                        className={cx('wz-type', type === t && 'is-on')}
                        aria-pressed={type === t}
                        onClick={() => setType(t)}
                        // 두 번 누르면 바로 다음 단계로 (고르고 '다음'을 누르는 것과 같다)
                        onDoubleClick={() => {
                          setType(t)
                          setStep(1)
                        }}
                      >
                        <span className="wz-type-name">
                          {BLUEPRINTS[t].name}
                          <CheckIcon />
                        </span>
                        <span className="wz-type-desc">{BLUEPRINTS[t].description}</span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            {/* 고른 종류로 만들어지는 장. 글로 된 흐름(배경 > 제안 > …)보다 무엇이 만들어지는지 바로 보인다 */}
            <aside className="wz-plan wz-pick" aria-live="polite">
              <p className="wz-plan-k">이렇게 만들어져요</p>
              <p className="wz-plan-h">{blueprint.name}</p>
              <Film key={type} type={type} label={blueprint.storyline} />
            </aside>
          </section>
        )}

        {step === 1 && (
          <section className="wz-sec wz-split wz-split-plan">
            <div className="wz-head">
              <h1 className="wz-h">누구에게, 얼마나 발표하나요?</h1>
              <p className="wz-sub">고르는 대로 오른쪽 구성이 바뀌어요.</p>
            </div>
            <div className="wz-form">
              <Choice
                legend="듣는 사람"
                options={AUDIENCES}
                value={audience}
                onChange={setAudience}
                note={AUDIENCES.find((a) => a.id === audience)?.description}
              />
              <Choice legend="발표 시간" options={DURATIONS.map((d) => ({ id: d.minutes, name: d.name }))} value={minutes} onChange={setMinutes} />
              <Choice legend="발표 방식" options={METHODS} value={method} onChange={setMethod} note={METHODS.find((m) => m.id === method)?.description} />
            </div>

            <aside className="wz-plan">
              <p className="wz-plan-k">{blueprint.name}</p>
              <p className="wz-plan-h" aria-live="polite">
                슬라이드 {preview.slides.length}장으로 만들어요
              </p>
              {/* 실제로 만들어질 장을 작게 그린다. 칸마다 들어갈 예시가 보이고, 편집기에서는 이 자리에 회색 안내로 남는다 */}
              <ol className="wz-plan-grid wz-real">
                {planKeys(preview.slides).map(([key, s], i) => (
                  <li key={key} className={cx(s.layout === 'section' && 'is-section')} title={LAYOUTS[s.layout].name}>
                    <span className="wz-shot" aria-hidden="true">
                      <FitSlide>
                        <Later><SlideCanvas deck={preview} slide={s} mode="preview" {...pageProps(previewInfo, s.id)} /></Later>
                      </FitSlide>
                    </span>
                    <span className="wz-plan-name">
                      <span className="wz-plan-n">{i + 1}</span>
                      {s.layout === 'section' ? s.section : s.purpose}
                    </span>
                  </li>
                ))}
              </ol>
            </aside>
          </section>
        )}

        {step === 2 && (
          <section className="wz-sec wz-split wz-split-cover">
            <div className="wz-head">
              <h1 className="wz-h">표지를 채워 주세요</h1>
              <p className="wz-sub">비워 두고 나중에 채워도 돼요.</p>
            </div>
            <div className="wz-form">
              <div
                className="wz-fields"
                // 칸을 채우고 Enter를 누르면 다음 칸으로, 마지막 칸에서는 발표를 만든다. 예전에는 Enter에 아무 일이 없어 눌러 보고 멈칫했다
                onKeyDown={(e) => {
                  if (e.key !== 'Enter' || e.nativeEvent.isComposing || !(e.target instanceof HTMLInputElement)) return
                  e.preventDefault()
                  const inputs = [...e.currentTarget.querySelectorAll('input')]
                  const next = inputs[inputs.indexOf(e.target) + 1]
                  if (next) next.focus()
                  else if (!busy) void create()
                }}
              >
                <label className="field">
                  <span className="field-label">발표 제목</span>
                  <input className="input" value={title} placeholder={`예: ${blueprint.examples.title}`} onChange={(e) => setTitle(e.target.value)} autoFocus />
                </label>
                {askOn && (
                  <div className="field">
                    <span className="field-label">
                      <label htmlFor="wz-ask">결정받고 싶은 것</label>
                      <Info label="결정받고 싶은 것 설명" align="start">
                        표지에 크게 보여서, 듣는 분이 처음부터 무엇을 판단할지 알고 들어요. 없으면 비워 두세요.
                      </Info>
                    </span>
                    <input id="wz-ask" className="input" value={ask} placeholder={`예: ${blueprint.examples.ask}`} onChange={(e) => setAsk(e.target.value)} />
                  </div>
                )}
                {!askOn && (
                  <label className="field">
                    <span className="field-label">부제</span>
                    <input
                      className="input"
                      value={lead}
                      placeholder={`예: ${blueprint.examples.lead ?? '한 줄 부제'}`}
                      onChange={(e) => setLead(e.target.value)}
                    />
                  </label>
                )}
                <div className="wz-pair">
                  <label className="field">
                    <span className="field-label">소속</span>
                    <input className="input" value={org} placeholder="예: 경영지원팀" onChange={(e) => setOrg(e.target.value)} />
                  </label>
                  <label className="field">
                    <span className="field-label">발표자</span>
                    <input className="input" value={presenter} placeholder="예: 김민준 매니저" onChange={(e) => setPresenter(e.target.value)} />
                  </label>
                </div>
              </div>

              <fieldset className="wz-group">
                <legend>테마</legend>
                <div className="wz-options wz-options-2">
                  {THEME_ORDER.map((id) => (
                    <Option key={id} on={theme === id} onClick={() => setTheme(id)} name={THEMES[id].name} desc={THEMES[id].description} swatch={id} />
                  ))}
                </div>
              </fieldset>
            </div>

            <aside className="wz-plan wz-cover" aria-label="표지 미리 보기">
              <p className="wz-plan-k">표지 미리 보기</p>
              <span className="wz-shot wz-cover-shot" aria-hidden="true">
                <FitSlide>
                  <CoverPreview
                    id={theme}
                    type={type}
                    title={title || blueprint.defaultTitle}
                    org={org}
                    presenter={presenter}
                    ask={askOn ? ask : ''}
                    lead={askOn ? '' : lead}
                    // 결정 요청을 묻지 않는 발표는 그 칸의 안내 없이, 발표할 때의 모습으로
                    mode={askOn ? 'preview' : 'final'}
                  />
                </FitSlide>
              </span>
              {/* 표지 뒤에 이어질 장을 작게: 표지만 크게 두면 칸 아래가 비고, 무엇이 더 만들어지는지도 보인다 */}
              {rest.length > 0 && (
                <ol className="wz-strip wz-real" style={{ '--n': strip }} aria-label={`표지 뒤에 ${rest.length}장이 더 만들어져요`}>
                  {rest.slice(0, rest.length > strip ? strip - 1 : strip).map((s) => (
                    <li key={s.id} className="wz-shot" aria-hidden="true">
                      <FitSlide>
                        <Later><SlideCanvas deck={preview} slide={s} mode="preview" {...pageProps(previewInfo, s.id)} /></Later>
                      </FitSlide>
                    </li>
                  ))}
                  {rest.length > strip && <li className="wz-strip-more">외 {rest.length - strip + 1}장</li>}
                </ol>
              )}
            </aside>
          </section>
        )}
      </main>

      <footer className="wz-bottom">
        {/* 빈 발표는 고르는 목록 밖의 다른 길이라 아래 줄 왼쪽에 */}
        {step > 0 ? (
          <button type="button" className="btn btn-ghost btn-lg wz-back" onClick={back}>
            <BackIcon />
            이전
          </button>
        ) : (
          <button type="button" className="btn-link wz-blank" onClick={startBlank}>
            빈 발표로 시작하기
          </button>
        )}
        {step < 2 && (
          <button type="button" className="btn btn-primary btn-lg wz-next" onClick={() => setStep(step + 1)}>
            다음
            <ChevronIcon />
          </button>
        )}
        {/* 낮은 화면에서도 가리지 않게, 만들기 단추 바로 옆에 */}
        {step === 2 && <p className="wz-privacy">작성한 내용은 이 PC 밖으로 나가지 않아요.</p>}
        {step === 2 && (
          <button type="button" className="btn btn-primary btn-lg" disabled={busy} onClick={create}>
            발표 만들기
          </button>
        )}
      </footer>
      {toast.node}
    </div>
  )
}

/** 같은 장이 두 번 나와도(단락 장 같은) 고를 때마다 다시 그려지지 않게, 장의 역할과 차례로 이름을 붙인다 */
function planKeys(slides: Slide[]): [string, Slide][] {
  const seen = new Map<string, number>()
  return slides.map((s) => {
    const base = `${s.layout}:${s.layout === 'section' ? s.section : s.purpose}`
    const n = seen.get(base) ?? 0
    seen.set(base, n + 1)
    return [`${base}:${n}`, s]
  })
}

/**
 * 작은 장 그림은 단계가 바뀐 화면이 먼저 그려진 뒤에 차례로 그린다 (drawSoon.ts). 구성 미리 보기는 장 열 장 남짓을 그리고 글을 맞춰서,
 * 한꺼번에 그리면 느린 PC에서 '다음'을 누른 뒤 0.1초 넘게 멈췄다
 */
function Later({ children }: { children: ReactNode }) {
  return useDrawSoon() ? <>{children}</> : null
}

/** 발표 종류 미리 보기의 작은 그림들. 그림 아래에 이야기 흐름의 이름 */
function Film({ type, label }: { type: DeckType; label: string[] }) {
  const film = useMemo(() => filmOf(type), [type])
  const info = useMemo(() => pageInfo(film.slides), [film])
  if (!film.slides.length) return null
  return (
    <ol className="wz-film wz-real" aria-label={`이야기 흐름: ${label.join(', ')}`}>
      {film.slides.map((s, i) => (
        <li key={s.id} className="wz-film-item">
          <span className="wz-shot" aria-hidden="true">
            <FitSlide>
              <Later><SlideCanvas deck={film.deck} slide={s} mode="preview" {...pageProps(info, s.id)} /></Later>
            </FitSlide>
          </span>
          <span className="wz-film-cap">
            <span className="wz-plan-n">{i + 1}</span>
            {label[i]}
          </span>
        </li>
      ))}
    </ol>
  )
}

/**
 * 하나를 고르는 줄. 단추에는 이름만 두고, 고른 것이 무엇을 바꾸는지는 아래 한 줄에.
 * 설명을 단추마다 넣으면 다섯 개가 한 줄에 들어가지 않고, 낮은 노트북 화면에서 한 화면을 넘는다
 */
function Choice<T extends string | number>({
  legend,
  options,
  value,
  onChange,
  note,
}: {
  legend: string
  options: { id: T; name: string }[]
  value: T
  onChange: (v: T) => void
  note?: string
}) {
  return (
    <fieldset className="wz-group">
      <legend>{legend}</legend>
      {/* 설명은 단추의 말풍선이 아니라 아래 한 줄에: 이름만 넘긴다 */}
      <Segmented chips className="wz-chips" options={options.map((o) => ({ id: o.id, name: o.name }))} value={value} onPick={onChange} />
      {note && <p className="wz-note">{note}</p>}
    </fieldset>
  )
}

function Option({ on, onClick, name, desc, swatch }: { on: boolean; onClick: () => void; name: string; desc: string; swatch?: ThemeId }) {
  return (
    <button type="button" className={cx('opt', on && 'is-on')} aria-pressed={on} onClick={onClick}>
      <span className="opt-radio" aria-hidden="true" />
      {swatch && <span className={cx('wz-swatch', `wz-swatch-${swatch}`)} aria-hidden="true" />}
      <span className="opt-text">
        <span className="opt-name">{name}</span>
        <span className="opt-desc">{desc}</span>
      </span>
    </button>
  )
}

function CoverPreview(props: {
  id: ThemeId
  type: DeckType
  title: string
  org: string
  presenter: string
  ask: string
  lead: string
  mode: 'preview' | 'final'
}) {
  const { id, type, title, org, presenter, ask, lead, mode } = props
  // 만들어질 표지와 같은 모양으로 (나누고 알리는 발표는 아래 띠)
  const slide = useMemo(() => {
    const s = makeSlide('cover', { variant: BLUEPRINTS[type].recipes.find((r) => r.layout === 'cover')?.variant })
    s.fields.title = title
    s.fields.ask = ask
    s.fields.lead = lead
    return s
  }, [type, title, ask, lead])
  const meta: DeckMeta = {
    type,
    audience: BLUEPRINTS[type].defaults.audience,
    duration: BLUEPRINTS[type].defaults.minutes,
    method: 'live',
    org,
    presenter,
    date: formatDate(),
    contact: '',
    logo: '',
  }
  return <SlideCanvas deck={{ meta, theme: { id }, title }} slide={slide} mode={mode} />
}

/** 마법사에서 마지막으로 적은 소속과 발표자 (이 브라우저에만) */
const AUTHOR_KEY = 'html-maker:last-author'

function lastAuthor(): { org: string; presenter: string } {
  try {
    const v = JSON.parse(localStorage.getItem(AUTHOR_KEY) ?? '{}') as { org?: unknown; presenter?: unknown }
    return { org: typeof v.org === 'string' ? v.org : '', presenter: typeof v.presenter === 'string' ? v.presenter : '' }
  } catch {
    return { org: '', presenter: '' }
  }
}

function rememberAuthor(org: string, presenter: string) {
  try {
    localStorage.setItem(AUTHOR_KEY, JSON.stringify({ org: org.trim(), presenter: presenter.trim() }))
  } catch {
    /* 기억하지 못하면 다음에 빈칸으로 */
  }
}

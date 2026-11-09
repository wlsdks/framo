import { useCallback, useMemo, useState } from 'react'
import { flushSync } from 'react-dom'
import { slideName } from '../../deck/blocks'
import { bareShows, bareSlide, bareSlides, deckBlanks, leaveOut, pageInfo, type Missing } from '../../deck/fields'
import type { Deck } from '../../deck/types'
import { cx } from '../../lib/cx'
import { slideOverflow } from '../../slides/overflow'
import { ScaledSlide, SlideCanvas } from '../../slides/SlideCanvas'
import { enterFullscreen, findPlacement, hasSecondScreen, openPresenterWindow, presenterAuto, screensPermission, type Placement } from '../../present/link'
import type { VersionReason } from '../../store/versions'
import { Modal, type Toast } from '../ui'
import type { PresentHow } from './DeckMenus'

/** 이번 발표: 어느 장부터, 이번에만 빼는 장(확인 창에서 '빈 슬라이드 빼고 발표하기'를 골랐을 때) */
interface Run {
  startId?: string
  skip?: string[]
}

const NO_SKIP: string[] = []

/**
 * 편집기에서 발표 시작하기. 빈칸이 남았으면 먼저 묻고, 발표자 화면을 쓸 때는 화면 두 개를 다뤄도 되는지 브라우저의 허락을 받는다.
 * 물어볼 창은 PresentDialogs가 그린다
 */
export function usePresentLaunch(deck: Deck, markVersion: (reason: VersionReason) => void, toast: Toast) {
  // entering: 이 창을 전체 화면으로 바꾸는 중이면 그 약속. 발표 화면은 창이 다 커진 뒤에 첫 장을 움직인다 (Present.tsx)
  // record: 내보내기의 '영상'으로 시작했으면 발표 화면이 열리자마자 녹화한다
  const [presenting, setPresenting] = useState<(Run & { entering?: Promise<boolean>; record?: boolean }) | null>(null)
  const [confirm, setConfirm] = useState<{ startId?: string; how: PresentHow; check: PresentCheck; record?: boolean } | null>(null)
  // 발표자 화면을 처음 쓸 때: 화면 두 개를 다뤄도 되는지 브라우저가 묻는다
  const [askScreens, setAskScreens] = useState<(Run & { placement?: Placement }) | null>(null)
  // 발표 화면에 넘기는 발표: 이번에만 뺀 장은 숨긴 장처럼 건너뛴다(leaveOut). 고치는 발표는 그대로다.
  // 같은 발표면 같은 사본을 넘긴다: 그릴 때마다 새로 만들면 발표 화면이 장 목록을 통째로 다시 만든다
  const skip = presenting?.skip ?? NO_SKIP
  const shown = useMemo(() => leaveOut(deck, skip), [deck, skip])

  /** 발표자 화면과 함께: 큰 화면에 발표 화면을 꽉 채우고, 이 화면에 발표자 화면 창을 연다 */
  const launchWithPresenter = useCallback(
    async ({ startId, skip }: Run, placement: Placement | null) => {
      // 같은 클릭 안에서 전체 화면 다음에 창을 열어야 크롬·엣지가 둘 다 허락한다
      if (placement) {
        // 전체 화면을 부르고, 같은 순간(브라우저가 화면을 그리기 전)에 발표 화면(검은 바탕)을 깐다. 전체 화면이 다 들어온 뒤에
        // 발표 화면을 그리던 때는, 창이 큰 화면으로 옮겨 가 커지는 동안 편집 화면이 그 크기로 비쳤다(늦은 전체 화면을 흉내 내 0.7초).
        // 첫 장은 전체 화면이 다 들어온 뒤에 들인다(Present.tsx의 entering)
        const entering = enterFullscreen(placement.audience)
        flushSync(() => setPresenting({ startId, skip, entering }))
        if (!(await entering)) {
          setPresenting(null)
          return false
        }
      }
      // 화면이 하나면 연습용: 발표자 화면은 보통 창으로, 발표 화면은 이 창에
      const win = placement ? openPresenterWindow(deck.id, placement.presenter) : openPresenterWindow(deck.id)
      setAskScreens(null)
      if (!win) {
        // 팝업 차단: 발표자 화면 없이 시작하면 노트도 다음 장도 볼 수 없다. 시작하지 않고 허용하는 법을 알린다.
        // 전체 화면을 빠져나와야 주소창의 차단 아이콘이 보인다
        setPresenting(null)
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
        toast.show('브라우저가 발표자 화면 창을 막았어요. 주소창의 팝업 차단 아이콘에서 허용한 뒤 다시 발표해 주세요.', undefined, 10000)
        return true
      }
      if (!placement) setPresenting({ startId, skip })
      return true
    },
    [deck.id, toast.show],
  )

  const start = useCallback(
    /** skip: 이번에만 빼는 장. 확인 창에서 고른 것이라 늘 force와 같이 온다 */
    async (startId?: string, force = false, how: PresentHow = 'auto', record = false, skip?: string[]) => {
      // 모든 장을 발표에서 빼 두었으면 빈 전체 화면만 뜬다
      if (!deck.slides.some((s) => !s.hidden)) {
        toast.show('모든 슬라이드가 발표에서 빠져 있어서 발표할 슬라이드가 없어요. 슬라이드를 골라 ‘발표에 다시 넣기’를 눌러 주세요.', undefined, 6000)
        return
      }
      if (!force) {
        const check = presentCheck(deck)
        if (check.rows.length) {
          setConfirm({ startId, how, check, record })
          return
        }
      }
      setConfirm(null)
      // 영상은 이 창 하나에서 첫 슬라이드부터 녹화한다 (발표자 화면을 띄우지 않는다)
      if (record) {
        setPresenting({ skip, entering: enterFullscreen(), record: true })
        return
      }
      markVersion('present')
      const presenter = how === 'presenter' || (how === 'auto' && presenterAuto() && hasSecondScreen())
      if (presenter) {
        const permission = await screensPermission()
        if (permission === 'granted') {
          if (await launchWithPresenter({ startId, skip }, await findPlacement())) return
        } else if (permission === 'prompt' && hasSecondScreen()) {
          setAskScreens({ startId, skip })
          return
        } else if (how === 'presenter') {
          await launchWithPresenter({ startId, skip }, null)
          return
        }
      }
      setPresenting({ startId, skip, entering: enterFullscreen() })
    },
    [deck, markVersion, launchWithPresenter],
  )

  const allowScreens = async () => {
    if (!askScreens) return
    // 허락 창에서 시간을 쓰면 클릭의 효력이 끝나서 전체 화면이 거절될 수 있다. 그러면 한 번 더 누르게 한다.
    const placement = askScreens.placement ?? (await findPlacement())
    if (!placement) {
      setAskScreens(null)
      setPresenting({ startId: askScreens.startId, skip: askScreens.skip, entering: enterFullscreen() })
      return
    }
    if (!(await launchWithPresenter(askScreens, placement))) setAskScreens({ ...askScreens, placement })
  }

  /** 화면 두 개를 허락하지 않고 이 창에서 슬라이드만 */
  const slidesOnly = () => {
    if (!askScreens) return
    setAskScreens(null)
    setPresenting({ startId: askScreens.startId, skip: askScreens.skip, entering: enterFullscreen() })
  }

  return {
    /** 발표 중이면 어느 장부터 시작했는지 */
    presenting,
    /** 발표 화면에 넘길 발표 (이번에만 뺀 장은 숨긴 장으로) */
    shown,
    start,
    exit: () => setPresenting(null),
    /** 빈칸이 남아 그대로 발표할지 묻는 중 */
    confirm,
    closeConfirm: () => setConfirm(null),
    /** 화면 두 개를 다뤄도 되는지 묻는 중 (placement가 있으면 허락을 받았고 한 번 더 누르면 시작) */
    askScreens,
    closeAskScreens: () => setAskScreens(null),
    allowScreens,
    slidesOnly,
  }
}

export type PresentLaunch = ReturnType<typeof usePresentLaunch>

/** 발표 전에 알릴 장 하나: 쪽 번호, 이름, 남은 빈칸, 글이 넘쳤는지, 빈칸 때문에 제목만 남는지(또는 아무것도 없는지) */
export interface CheckRow {
  id: string
  page: number
  name: string
  missing: Missing[]
  over: boolean
  bare?: 'title' | 'nothing'
}

export interface PresentCheck {
  rows: CheckRow[]
  /** 모든 장의 빈칸 수 */
  missing: number
  /** 글이 넘친 장 수 */
  over: number
  /** 이번에만 빼고 갈 수 있는 빈 장의 id (bareSlides. 빼면 발표할 장이 남지 않으면 빈 목록) */
  bare: string[]
}

/**
 * 발표하기 전에 알릴 것: 장마다 남은 빈칸(편집기의 빈칸 세기 deckBlanks 그대로)과 글이 넘친 장.
 * 예전에는 '빈칸이 49곳'만 알려서 어느 장을 고치면 되는지 몰랐고, 넘친 글은 묻지도 않았다.
 * 넘침은 장 목록의 작은 그림(실제 크기로 그린 장을 줄여 보인 것)을 편집기의 넘침 표시와 같은 잣대(slideOverflow)로 잰다:
 * 따로 그려 재면 시간이 걸려 전체 화면을 여는 클릭의 효력이 끝날 수 있다. 그림이 없으면(목록을 접은 화면) 넘침은 건너뛴다.
 * 빈칸 때문에 제목만 남는 장(bareSlide)은 그렇다고 적고, 이번에만 빼고 갈 수 있게 모은다(bareSlides)
 */
export function presentCheck(deck: Deck): PresentCheck {
  const info = pageInfo(deck.slides, deck)
  const blanks = new Map(deckBlanks(deck).map((b) => [b.slide.id, b.missing]))
  const rows: CheckRow[] = deck.slides
    .filter((s) => !s.hidden)
    .map((s) => {
      const el = document.getElementById(`thumb-${s.id}`)?.querySelector<HTMLElement>('.slide')
      const bare = bareSlide(s, deck.meta) ? bareShows(s) : undefined
      return { id: s.id, page: info.page.get(s.id) ?? 0, name: slideName(s), missing: blanks.get(s.id) ?? [], over: !!el && slideOverflow(el) === 'over', bare }
    })
    .filter((r) => r.missing.length || r.over)
  return { rows, missing: rows.reduce((n, r) => n + r.missing.length, 0), over: rows.filter((r) => r.over).length, bare: bareSlides(deck) }
}

/** 바둑판의 작은 슬라이드 너비. 창 600px에 셋 */
const PCK_THUMB = 172

function checkTitle({ missing, over }: PresentCheck): string {
  if (missing && over) return `빈칸 ${missing}곳, 글이 넘친 슬라이드 ${over}장이 있어요`
  if (over) return `글이 넘친 슬라이드가 ${over}장 있어요`
  return `빈칸이 ${missing}곳 남았어요`
}

/** 빈 장이 발표에서 어떻게 보이는지 카드 아래 한 줄로 */
const BARE_SAYS: Record<NonNullable<CheckRow['bare']>, string> = { title: '제목만 보여요', nothing: '보일 내용이 없어요' }

/**
 * 남은 빈칸과 넘친 글을 알리고 그대로 갈지 묻는 창. 발표하기와 내보내기(발표 파일, PDF, PPT)가 같이 쓴다.
 * what: 빈칸이 나오지 않는 곳 ('발표 화면', '파일'), verb: 하려던 일 ('발표하기', '내보내기', '녹화하기').
 * 빈칸 때문에 제목만 보이는 장이 있으면 그 장을 이번에만 건너뛰는 단추를 주된 단추로 둔다: '그대로 발표하기'밖에 없던 때는 주간 보고의 마지막 장
 * '도움이 필요한 것'이 제목과 발표자 이름만 남은 채 듣는 분 앞에 떴다. 건너뛰는 것은 이번 한 번뿐이고 지우거나 숨기지 않는다(onProceed의 skip).
 * '빼고'라고 쓰던 때는 지운다는 뜻으로 읽힐 수 있었고, 그림에 제목이 보이는 장을 '빈 슬라이드'라고 불러 어긋났다(감성 검수).
 * 건너뛸 장이 발표의 절반을 넘으면(아직 만드는 중인 발표) 건너뛰기를 권하지 않고 빈칸 채우기를 권한다: 표지 한 장짜리 파일을 권하게 된다
 */
export function CheckDialog({
  deck,
  check,
  what,
  verb,
  onProceed,
  onClose,
  onGoTo,
}: {
  deck: Deck
  check: PresentCheck
  what: string
  verb: string
  /** skip: 이번에만 빼는 장 (그대로 가면 빈 목록) */
  onProceed: (skip: string[]) => void
  onClose: () => void
  onGoTo: (slideId: string, m?: Missing) => void
}) {
  const first = check.rows[0]
  const bare = check.bare.length
  // 무엇을 권하는지(검은 단추): 건너뛰기, 빈칸 채우기(건너뛸 장이 절반을 넘을 때), 그대로
  const lead = !bare ? 'proceed' : bare * 2 <= deck.slides.filter((s) => !s.hidden).length ? 'skip' : 'fill'
  const info = useMemo(() => pageInfo(deck.slides, deck), [deck.slides, deck.theme, deck.motion])
  const byId = useMemo(() => new Map(deck.slides.map((s) => [s.id, s])), [deck.slides])
  if (!first) return null
  return (
    // 초점은 창 자체에 둔다. 검은 '그대로 …' 단추에 두면 그 위에 파란 초점 테가 둘려 테가 두 겹으로 보였고,
    // Enter 한 번에 빈칸을 남긴 채 넘어갈 수도 있었다. Esc는 창을 닫고, Tab을 누르면 단추로 간다
    <Modal
      title={checkTitle(check)}
      onClose={onClose}
      focusSelf
      className="pck"
      actions={
        <>
          <button type="button" className={cx('btn', lead === 'fill' ? 'btn-primary' : 'btn-ghost')} onClick={() => onGoTo(first.id, first.missing[0])}>
            {check.missing ? '빈칸 채우기' : '고치러 가기'}
          </button>
          <button type="button" className={cx('btn', lead === 'proceed' ? 'btn-primary' : 'btn-ghost')} onClick={() => onProceed([])}>
            그대로 {verb}
          </button>
          {bare > 0 && (
            <button
              type="button"
              className={cx('btn', lead === 'skip' ? 'btn-primary' : 'btn-ghost')}
              title="표시한 슬라이드를 이번에만 건너뛰어요. 지우지 않아요."
              onClick={() => onProceed(check.bare)}
            >
              {bare}장 건너뛰고 {verb}
            </button>
          )}
        </>
      }
    >
      {/*
        줄 목록(번호, 이름, 노란 점, '빈칸 5곳')만 늘어놓던 때는 어느 슬라이드인지 이름으로만 알아봐야 했고, 같은 점이 줄마다 되풀이됐다.
        지금은 그 슬라이드가 듣는 분께 실제로 보일 모습(빈칸은 빠진)을 작게 그려 바둑판으로 둔다: 비어 보이는 장이 한눈에 보인다
      */}
      <p>
        {check.missing ? `빈칸은 ${what}에 나오지 않아요. ` : ''}
        {check.over ? '넘친 글은 잘려 보일 수 있어요. ' : ''}
        {/* '그 / 슬라이드로'로 갈라지지 않게 (\u00a0) */}
        누르면 그{'\u00a0'}슬라이드로 가요.
      </p>
      <ul className="pck-grid">
        {check.rows.map((r) => {
          const s = byId.get(r.id)
          return (
            <li key={r.id}>
              <button
                type="button"
                className="pck-card"
                aria-label={`슬라이드 ${r.page}, ${r.name}${r.missing.length ? `, 빈칸 ${r.missing.length}곳` : ''}${r.bare ? `, ${BARE_SAYS[r.bare]}` : ''}${r.over ? ', 글이 넘침' : ''}`}
                onClick={() => onGoTo(r.id, r.missing[0])}
              >
                <ScaledSlide width={PCK_THUMB} decorative>
                  {s && <SlideCanvas deck={deck} slide={s} mode="final" page={r.page} total={info.page.size} />}
                </ScaledSlide>
                <span className="pck-name" aria-hidden="true">
                  <span className="pck-n">{r.page}</span>
                  {r.name}
                </span>
                <span className="pck-what" aria-hidden="true">
                  {[
                    r.missing.length > 0 && `빈칸 ${r.missing.length}곳`,
                    r.bare && <b key="bare" className="pck-bare">{BARE_SAYS[r.bare]}</b>,
                    r.over && <span key="over" className="pck-over">글이 넘쳤어요</span>,
                  ]
                    .filter(Boolean)
                    .flatMap((x, i) => (i ? [' · ', x] : [x]))}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </Modal>
  )
}

/** 발표를 시작하기 전에 묻는 창: 남은 빈칸, 발표자 화면의 허락 */
export function PresentDialogs({ deck, launch, onGoTo }: { deck: Deck; launch: PresentLaunch; onGoTo: (slideId: string, m?: Missing) => void }) {
  const { confirm, askScreens } = launch
  const check = confirm?.check
  return (
    <>
      {confirm && check && (
        <CheckDialog
          deck={deck}
          check={check}
          what={confirm.record ? '영상' : '발표 화면'}
          verb={confirm.record ? '녹화하기' : '발표하기'}
          onProceed={(skip) => void launch.start(confirm.startId, true, confirm.how, confirm.record, skip)}
          onClose={launch.closeConfirm}
          onGoTo={onGoTo}
        />
      )}
      {askScreens && (
        <Modal
          title={askScreens.placement ? '준비됐어요' : '발표자 화면을 따로 띄울게요'}
          onClose={launch.closeAskScreens}
          actions={
            <>
              <button type="button" className="btn btn-ghost" onClick={launch.slidesOnly}>
                슬라이드만 발표
              </button>
              <button type="button" className="btn btn-primary" data-autofocus onClick={() => void launch.allowScreens()}>
                {askScreens.placement ? '발표 시작하기' : '허용하고 발표하기'}
              </button>
            </>
          }
        >
          {askScreens.placement ? (
            <p>큰 화면에 슬라이드를, 이 화면에 다음 슬라이드와 노트를 띄워요.</p>
          ) : (
            <p>
              화면이 두 개 연결돼 있어요. 큰 화면에는 슬라이드만, 이 화면에는 다음 슬라이드, 노트, 시간이 보여요.
              <br />
              브라우저가 ‘창 관리’를 물으면 <b>허용</b>을 눌러 주세요. 처음 한 번만 물어요.
            </p>
          )}
        </Modal>
      )}
    </>
  )
}

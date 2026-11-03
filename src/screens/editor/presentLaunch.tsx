import { useCallback, useState } from 'react'
import { flushSync } from 'react-dom'
import { slideName } from '../../deck/blocks'
import { deckBlanks, pageInfo, type Missing } from '../../deck/fields'
import type { Deck } from '../../deck/types'
import { slideOverflow } from '../../slides/overflow'
import { enterFullscreen, findPlacement, hasSecondScreen, openPresenterWindow, presenterAuto, screensPermission, type Placement } from '../../present/link'
import type { VersionReason } from '../../store/versions'
import { Modal, type Toast } from '../ui'
import type { PresentHow } from './DeckMenus'

/**
 * 편집기에서 발표 시작하기. 빈칸이 남았으면 먼저 묻고, 발표자 화면을 쓸 때는 화면 두 개를 다뤄도 되는지 브라우저의 허락을 받는다.
 * 물어볼 창은 PresentDialogs가 그린다
 */
export function usePresentLaunch(deck: Deck, markVersion: (reason: VersionReason) => void, toast: Toast) {
  // entering: 이 창을 전체 화면으로 바꾸는 중이면 그 약속. 발표 화면은 창이 다 커진 뒤에 첫 장을 움직인다 (Present.tsx)
  const [presenting, setPresenting] = useState<{ startId?: string; entering?: Promise<boolean> } | null>(null)
  const [confirm, setConfirm] = useState<{ startId?: string; how: PresentHow; check: PresentCheck } | null>(null)
  // 발표자 화면을 처음 쓸 때: 화면 두 개를 다뤄도 되는지 브라우저가 묻는다
  const [askScreens, setAskScreens] = useState<{ startId?: string; placement?: Placement } | null>(null)

  /** 발표자 화면과 함께: 큰 화면에 발표 화면을 꽉 채우고, 이 화면에 발표자 화면 창을 연다 */
  const launchWithPresenter = useCallback(
    async (startId: string | undefined, placement: Placement | null) => {
      // 같은 클릭 안에서 전체 화면 다음에 창을 열어야 크롬·엣지가 둘 다 허락한다
      if (placement) {
        // 전체 화면을 부르고, 같은 순간(브라우저가 화면을 그리기 전)에 발표 화면(검은 바탕)을 깐다. 전체 화면이 다 들어온 뒤에
        // 발표 화면을 그리던 때는, 창이 큰 화면으로 옮겨 가 커지는 동안 편집 화면이 그 크기로 비쳤다(늦은 전체 화면을 흉내 내 0.7초).
        // 첫 장은 전체 화면이 다 들어온 뒤에 들인다(Present.tsx의 entering)
        const entering = enterFullscreen(placement.audience)
        flushSync(() => setPresenting({ startId, entering }))
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
      if (!placement) setPresenting({ startId })
      return true
    },
    [deck.id, toast.show],
  )

  const start = useCallback(
    async (startId?: string, force = false, how: PresentHow = 'auto') => {
      // 모든 장을 발표에서 빼 두었으면 빈 전체 화면만 뜬다
      if (!deck.slides.some((s) => !s.hidden)) {
        toast.show('모든 슬라이드가 발표에서 빠져 있어서 발표할 슬라이드가 없어요. 슬라이드를 골라 ‘발표에 다시 넣기’를 눌러 주세요.', undefined, 6000)
        return
      }
      if (!force) {
        const check = presentCheck(deck)
        if (check.rows.length) {
          setConfirm({ startId, how, check })
          return
        }
      }
      setConfirm(null)
      markVersion('present')
      const presenter = how === 'presenter' || (how === 'auto' && presenterAuto() && hasSecondScreen())
      if (presenter) {
        const permission = await screensPermission()
        if (permission === 'granted') {
          if (await launchWithPresenter(startId, await findPlacement())) return
        } else if (permission === 'prompt' && hasSecondScreen()) {
          setAskScreens({ startId })
          return
        } else if (how === 'presenter') {
          await launchWithPresenter(startId, null)
          return
        }
      }
      setPresenting({ startId, entering: enterFullscreen() })
    },
    [deck, markVersion, launchWithPresenter],
  )

  const allowScreens = async () => {
    if (!askScreens) return
    // 허락 창에서 시간을 쓰면 클릭의 효력이 끝나서 전체 화면이 거절될 수 있다. 그러면 한 번 더 누르게 한다.
    const placement = askScreens.placement ?? (await findPlacement())
    if (!placement) {
      setAskScreens(null)
      setPresenting({ startId: askScreens.startId, entering: enterFullscreen() })
      return
    }
    if (!(await launchWithPresenter(askScreens.startId, placement))) setAskScreens({ ...askScreens, placement })
  }

  /** 화면 두 개를 허락하지 않고 이 창에서 슬라이드만 */
  const slidesOnly = () => {
    if (!askScreens) return
    setAskScreens(null)
    setPresenting({ startId: askScreens.startId, entering: enterFullscreen() })
  }

  return {
    /** 발표 중이면 어느 장부터 시작했는지 */
    presenting,
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

/** 발표 전에 알릴 장 하나: 쪽 번호, 이름, 남은 빈칸, 글이 넘쳤는지 */
export interface CheckRow {
  id: string
  page: number
  name: string
  missing: Missing[]
  over: boolean
}

export interface PresentCheck {
  rows: CheckRow[]
  /** 모든 장의 빈칸 수 */
  missing: number
  /** 글이 넘친 장 수 */
  over: number
}

/**
 * 발표하기 전에 알릴 것: 장마다 남은 빈칸(편집기의 빈칸 세기 deckBlanks 그대로)과 글이 넘친 장.
 * 예전에는 '빈칸이 49곳'만 알려서 어느 장을 고치면 되는지 몰랐고, 넘친 글은 묻지도 않았다.
 * 넘침은 장 목록의 작은 그림(실제 크기로 그린 장을 줄여 보인 것)을 편집기의 넘침 표시와 같은 잣대(slideOverflow)로 잰다:
 * 따로 그려 재면 시간이 걸려 전체 화면을 여는 클릭의 효력이 끝날 수 있다. 그림이 없으면(목록을 접은 화면) 넘침은 건너뛴다
 */
export function presentCheck(deck: Deck): PresentCheck {
  const info = pageInfo(deck.slides)
  const blanks = new Map(deckBlanks(deck).map((b) => [b.slide.id, b.missing]))
  const rows = deck.slides
    .filter((s) => !s.hidden)
    .map((s) => {
      const el = document.getElementById(`thumb-${s.id}`)?.querySelector<HTMLElement>('.slide')
      return { id: s.id, page: info.page.get(s.id) ?? 0, name: slideName(s), missing: blanks.get(s.id) ?? [], over: !!el && slideOverflow(el) === 'over' }
    })
    .filter((r) => r.missing.length || r.over)
  return { rows, missing: rows.reduce((n, r) => n + r.missing.length, 0), over: rows.filter((r) => r.over).length }
}

function checkTitle({ missing, over }: PresentCheck): string {
  if (missing && over) return `빈칸 ${missing}곳, 글이 넘친 슬라이드 ${over}장이 있어요`
  if (over) return `글이 넘친 슬라이드가 ${over}장 있어요`
  return `빈칸이 ${missing}곳 남았어요`
}

/**
 * 남은 빈칸과 넘친 글을 알리고 그대로 갈지 묻는 창. 발표하기와 내보내기(발표 파일, PDF, PPT)가 같이 쓴다.
 * what: 빈칸이 나오지 않는 곳 ('발표 화면', '파일')
 */
export function CheckDialog({
  check,
  what,
  proceed,
  onProceed,
  onClose,
  onGoTo,
}: {
  check: PresentCheck
  what: string
  proceed: string
  onProceed: () => void
  onClose: () => void
  onGoTo: (slideId: string, m?: Missing) => void
}) {
  const first = check.rows[0]
  if (!first) return null
  return (
    <Modal
      title={checkTitle(check)}
      onClose={onClose}
      actions={
        <>
          <button type="button" className="btn btn-ghost" onClick={() => onGoTo(first.id, first.missing[0])}>
            {check.missing ? '빈칸 채우기' : '고치러 가기'}
          </button>
          <button type="button" className="btn btn-primary" data-autofocus onClick={onProceed}>
            {proceed}
          </button>
        </>
      }
    >
      <p>
        {check.missing ? `빈칸은 ${what}에 나오지 않아요. ` : ''}
        {check.over ? '넘친 글은 잘려 보일 수 있어요. ' : ''}슬라이드를 누르면 그 자리로 가요.
      </p>
      <ul className="pck-list">
        {check.rows.map((r) => (
          <li key={r.id}>
            <button type="button" className="pck-row" onClick={() => onGoTo(r.id, r.missing[0])}>
              <span className="pck-n">{r.page}</span>
              <span className="pck-name">{r.name}</span>
              <span className="pck-what">
                {r.over && <span className="pck-over">글이 넘쳤어요</span>}
                {r.missing.length > 0 && <span className="pck-blank">빈칸 {r.missing.length}곳</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  )
}

/** 발표를 시작하기 전에 묻는 창: 남은 빈칸, 발표자 화면의 허락 */
export function PresentDialogs({ launch, onGoTo }: { launch: PresentLaunch; onGoTo: (slideId: string, m?: Missing) => void }) {
  const { confirm, askScreens } = launch
  const check = confirm?.check
  return (
    <>
      {confirm && check && (
        <CheckDialog
          check={check}
          what="발표 화면"
          proceed="그대로 발표하기"
          onProceed={() => void launch.start(confirm.startId, true, confirm.how)}
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

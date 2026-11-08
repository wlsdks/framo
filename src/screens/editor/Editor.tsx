import { useEffect, useState } from 'react'
import { applyOps, type ChangeRequest } from '../../ai/ops'
import { useAiAsk } from '../../ai/useAiAsk'
import { useAiShare } from '../../ai/useAiShare'
import { blockFieldPrefix } from '../../deck/blocks'
import { knownOnly, unknownParts } from '../../deck/compat'
import type { Missing } from '../../deck/fields'
import type { Deck, LayoutId, Slide } from '../../deck/types'
import { cx } from '../../lib/cx'
import { particle } from '../../lib/josa'
import { isMac, keys } from '../../lib/keys'
import { go } from '../../lib/router'
import { onTabListKeys } from '../../lib/tabList'
import { APP_VERSION } from '../../lib/version'
import { useAutosave } from '../../store/autosave'
import { copyDeck } from '../../store/copy'
import { useDeck, useSelectedSlide } from '../../store/deckStore'
import { loadBestDeck, persistNow } from '../../store/persist'
import { useEditLock } from '../../store/useEditLock'
import { canRecord } from '../../present/record'
import { Present, type RecordResult } from '../Present'
import { BackIcon, CloseIcon, HistoryIcon, Info, RedoIcon, SAVE_HELP, takeNotice, undoAction, UndoIcon, useToast } from '../ui'
import { ASK_ERROR, AiInbox, AiMenu, AiReview, AskStatus } from './AiShare'
import { useBlockEditing } from './BlockEditor'
import { BlockLibrary } from './BlockLibrary'
import { ExportMenu, PresentButton, ThemeMenu } from './DeckMenus'
import { useExports } from './exports'
import { Inspector } from './Inspector'
import { MotionPanel } from './MotionPanel'
import { MotionStudio } from './studio/MotionStudio'
import { CheckDialog, PresentDialogs, usePresentLaunch } from './presentLaunch'
import { SaveStatus } from './SaveStatus'
import { useEditorShortcuts } from './shortcuts'
import { useSidePanel } from './sidePanel'
import { SlideList } from './SlideList'
import { SlideStage } from './SlideStage'
import { useImageInput } from './useImageInput'
import { VersionPanel } from './Versions'

/** 영상 녹화가 끝나 발표를 닫은 뒤 편집기에 띄우는 말 (시작하지 못한 것은 발표 화면의 묻는 창이 다시 묻는다) */
function recordedText(result: Exclude<RecordResult, 'failed'>, file: string): string {
  // 파일 이름까지: 다운로드 폴더에서 무엇을 찾으면 되는지 바로 알게
  if (result === 'saved') return `‘${file}’${particle(file, '을', '를')} 다운로드 폴더에 저장했어요.`
  return '녹화된 장면이 없어요. 내보내기에서 ‘영상 (MP4)’을 다시 눌러 주세요.'
}

export function Editor({ id }: { id: string }) {
  const deck = useDeck((s) => s.deck)
  const newer = useDeck((s) => s.newer)
  const open = useDeck((s) => s.open)
  const [notFound, setNotFound] = useState(false)
  // 한 발표는 한 창에서만 고친다 (store/deckLock.ts). 다른 창에서 넘겨받으면 저장소가 비워져 아래에서 다시 읽는다
  const lock = useEditLock(id)

  useEffect(() => {
    if (lock.state !== 'mine') return
    const now = useDeck.getState()
    if (now.deck?.id === id || now.newer?.id === id) return
    loadBestDeck(id).then((d) => (d ? open(d) : setNotFound(true)))
  }, [id, open, lock.state, lock.taken])

  if (lock.state === 'other' || lock.state === 'lost') return <Elsewhere lost={lock.state === 'lost'} onTake={lock.take} />
  if (notFound) {
    return (
      <div className="center-msg newer-deck">
        <h1 className="newer-h">이 발표를 찾을 수 없어요</h1>
        <p>다른 브라우저에서 만들었거나 지운 발표일 수 있어요. 작업 파일(.deck)이 있으면 내 발표에서 ‘파일 열기’로 불러오세요.</p>
        <button type="button" className="btn btn-primary" onClick={() => go({ name: 'home' })}>
          내 발표로 가기
        </button>
      </div>
    )
  }
  if (newer?.id === id) return <NewerDeck deck={newer} />
  if (lock.state !== 'mine' || !deck || deck.id !== id) return <div className="center-msg">불러오는 중</div>
  return <EditorBody deck={deck} />
}

/**
 * 같은 발표를 다른 창에서 고치는 중. 두 창에서 같이 고치면 나중에 저장한 창이 다른 창에서 고친 글을 말없이 덮어서
 * 한 창에서만 고친다. '이 창에서 고치기'를 누르면 고치던 창은 고친 것을 저장하고 이 화면으로 바뀐다
 */
function Elsewhere({ lost, onTake }: { lost: boolean; onTake: () => void }) {
  const [asking, setAsking] = useState(false)
  return (
    <div className="center-msg newer-deck">
      <h1 className="newer-h">{lost ? '다른 창에서 이 발표를 이어서 고치고 있어요' : '다른 창에서 이 발표를 고치고 있어요'}</h1>
      <p>
        {lost ? '이 창에서 고친 것은 저장했어요. ' : ''}한 발표는 한 창에서만 고칠 수 있어요. 두 창에서 같이 고치면 나중에 저장한 창이 다른
        창에서 고친 글을 덮어써요.
      </p>
      <div className="newer-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={asking}
          onClick={() => {
            setAsking(true)
            onTake()
          }}
        >
          {asking ? '가져오는 중' : '이 창에서 고치기'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => go({ name: 'home' })}>
          내 발표로 가기
        </button>
      </div>
    </div>
  )
}

/**
 * 새 버전에서 만든 발표. 여기서 고치면 이 버전이 모르는 부품과 그 안의 글이 빠지므로 열지 않는다.
 * 원래 발표는 건드리지 않고, 급하면 아는 것만 남긴 사본을 만들어 고친다.
 */
function NewerDeck({ deck }: { deck: Deck }) {
  const count = unknownParts(deck)
  const known = knownOnly(deck)
  const toast = useToast()
  const openCopy = async () => {
    const copy = copyDeck(known, `${deck.title} 사본`)
    if (!(await persistNow(copy))) {
      toast.show(`사본을 만들지 못했어요. ${SAVE_HELP}`, undefined, 8000)
      return
    }
    go({ name: 'edit', id: copy.id })
  }
  return (
    <div className="center-msg newer-deck">
      <h1 className="newer-h">새 버전에서 만든 발표예요</h1>
      <p>
        이 버전의 Framo에는 없는 컴포넌트나 모양이 {count}개 들어 있어요. 여기서 고치면 그것과 안에 적은 글이 빠져서 열지 않았어요. 원래 발표는 그대로
        있어요.
      </p>
      <p>
        Framo를 새 버전으로 바꾼 뒤 열어 주세요(지금은 {APP_VERSION} 버전). 지금 꼭 고쳐야 하면, 없는 것만 뺀 사본을 만들어 고칠 수
        있어요.
      </p>
      <div className="newer-actions">
        <button type="button" className="btn btn-primary" onClick={() => go({ name: 'home' })}>
          내 발표로 가기
        </button>
        {known.slides.length > 0 && (
          <button type="button" className="btn btn-ghost" onClick={openCopy}>
            없는 {count}개를 뺀 사본 만들기
          </button>
        )}
      </div>
      {toast.node}
    </div>
  )
}

function EditorBody({ deck }: { deck: Deck }) {
  const slide = useSelectedSlide() ?? deck.slides[0]
  // 상태는 쓰는 것만 골라 구독하고, 할 일(액션)은 꺼내 쓴다 (예전에는 저장소 전체를 구독해서 무엇이 바뀌어도 다시 그렸다)
  const store = useDeck.getState()
  const canUndo = useDeck((s) => s.past.length > 0)
  const canRedo = useDeck((s) => s.future.length > 0)
  const { markVersion, saveNow } = useAutosave(deck)
  const [versionsOpen, setVersionsOpen] = useState(false)
  // 움직임 편집: 편집기 위에 덮어 연다. 발표하고 돌아오면 다시 그 자리
  const [studio, setStudio] = useState<{ from: string | null } | null>(null)
  // '레이아웃 바꾸기'에서 그림에 올린 레이아웃. 슬라이드 자리에 그 모습으로 미리 보인다
  const [layoutPeek, setLayoutPeek] = useState<LayoutId | null>(null)
  useEffect(() => setLayoutPeek(null), [slide?.id])
  const [reviewing, setReviewing] = useState<ChangeRequest | null>(null)
  const toast = useToast()
  const launch = usePresentLaunch(deck, markVersion, toast)
  const exporting = useExports(deck, markVersion, toast)
  const ai = useAiShare(deck)
  const ask = useAiAsk(deck, () => useDeck.getState().setAiShare(true))
  const blocks = useBlockEditing(deck, slide, toast)
  const fileOver = useImageInput(blocks, toast)
  const side = useSidePanel(blocks)

  // 내 발표에서 파일을 열고 왔을 때의 알림 (있던 발표를 파일 내용으로 바꿨는지, 사본으로 열었는지)
  useEffect(() => {
    const text = takeNotice()
    if (text) toast.show(text, undefined, 8000)
    // 처음 열 때 한 번만 (show는 늘 같은 함수다)
  }, [toast.show])

  // 부탁이 끝나면: 제안이 왔으면 미리 보기를 바로 열고, 아니면 왜인지 알려 준다.
  // 바꿀 게 없다고 하면 AI가 말한 까닭을 읽을 수 있게 오른쪽 아래 카드를 남겨 둔다.
  const job = ask.job
  useEffect(() => {
    if (!job || job.state === 'running' || job.state === 'no_change') return
    if (job.state === 'done') {
      const request = ai.requests.find((r) => r.id === job.request)
      if (!request) {
        ai.refresh()
        return
      }
      setReviewing(request)
    } else if (job.state === 'failed') {
      toast.show(ASK_ERROR[job.error ?? 'failed'], undefined, 8000)
    }
    ask.dismiss()
  }, [job, ai.requests, toast.show])

  const applyAi = async (request: ChangeRequest) => {
    // 적용 전 상태를 버전으로 남긴다. 미리 본 뒤에 덱이 바뀌었을 수 있으니 지금 덱에 다시 적용한다.
    markVersion('ai')
    const current = useDeck.getState().deck ?? deck
    const result = applyOps(current, request.ops)
    store.replaceDeck(result.deck)
    setReviewing(null)
    toast.show('AI 제안을 적용했어요', undoAction(toast))
    await ai.resolve(request, 'applied', result.results)
  }

  const rejectAi = async (request: ChangeRequest) => {
    setReviewing(null)
    toast.show('AI 제안을 거절했어요')
    await ai.resolve(request, 'rejected', [])
  }

  /** 발표 전 확인 창에서 고른 장으로. 빈칸이 있으면 그 장의 첫 빈칸에 커서를 둔다 */
  const goToSlide = (slideId: string, m?: Missing) => {
    launch.closeConfirm()
    exporting.closeConfirm()
    store.select(slideId)
    if (m) window.setTimeout(() => focusField(slideId, m), 60)
  }

  useEditorShortcuts({
    paused: !!launch.presenting,
    present: (here, how) => void launch.start(here ? slide?.id : undefined, false, how),
    saveNow,
    print: () => exporting.printPdf(),
    toast,
  })

  const removeSlide = (s: Slide) => {
    store.removeSlide(s.id)
    toast.show('슬라이드를 지웠어요', undoAction(toast))
  }

  // 발표를 끝내면 마지막으로 보던 장을 고른다(발표를 시작한 장이 아니라). 영상만 만들었으면 고치던 장 그대로
  const endPresent = (lastId?: string) => {
    const recorded = launch.presenting?.record
    launch.exit()
    if (lastId && !recorded) store.select(lastId)
  }

  if (launch.presenting)
    return (
      <Present
        deck={deck}
        startId={launch.presenting.startId}
        entering={launch.presenting.entering}
        onExit={endPresent}
        record={launch.presenting.record}
        onRecorded={(result, file) => toast.show(recordedText(result, file), undefined, result === 'saved' ? 6000 : 8000)}
      />
    )

  return (
    <div className="ed-app">
      <header className="ed-top">
        <div className="ed-top-l">
          <button type="button" className="icon-btn" aria-label="내 발표로" title="내 발표로" onClick={() => go({ name: 'home' })}>
            <BackIcon />
          </button>
          <input
            className="ed-title"
            value={deck.title}
            aria-label="발표 이름"
            onChange={(e) => store.setTitle(e.target.value)}
            onBlur={(e) => !e.target.value.trim() && store.setTitle('제목 없는 발표')}
          />
          <SaveStatus deck={deck} onOpenVersions={() => setVersionsOpen(true)} />
        </div>

        <div className="ed-top-r">
          <button type="button" className="icon-btn" aria-label="되돌리기" title={`되돌리기 (${keys('mod+Z')})`} disabled={!canUndo} onClick={store.undo}>
            <UndoIcon />
          </button>
          <button type="button" className="icon-btn" aria-label="다시 하기" title={`다시 하기 (${isMac ? keys('mod+shift+Z') : keys('mod+Y')})`} disabled={!canRedo} onClick={store.redo}>
            <RedoIcon />
          </button>
          <button
            type="button"
            className={cx('icon-btn', versionsOpen && 'is-on')}
            aria-label="버전 기록"
            title="버전 기록"
            aria-pressed={versionsOpen}
            onClick={() => setVersionsOpen((o) => !o)}
          >
            <HistoryIcon />
          </button>
          {/* 되돌리기와 버전 기록(고친 것을 다루는 것)과 발표 전체의 메뉴를 가는 선 하나로 나눈다 */}
          <span className="ed-top-sep" aria-hidden="true" />
          <AiMenu deck={deck} ai={ai} ask={ask} />
          <ThemeMenu deck={deck} />
          <ExportMenu
            onHtml={() => void exporting.exportHtml()}
            onPdf={() => exporting.printPdf()}
            onPpt={() => void exporting.exportPpt()}
            onVideo={canRecord() ? () => void launch.start(undefined, false, 'single', true) : undefined}
            onDeckFile={exporting.saveDeckFile}
          />
          <PresentButton onStart={(how, here) => void launch.start(here ? slide?.id : undefined, false, how)} />
        </div>
      </header>

      <div className={cx('ed-body', versionsOpen && 'has-versions', side.shown && !versionsOpen && 'has-side')}>
        <SlideList deck={deck} selectedId={slide?.id ?? null} onRemove={removeSlide} />
        {slide && <SlideStage deck={deck} slide={slide} ai={ai} ask={ask} blocks={blocks} fileOver={fileOver} side={side} layoutPeek={layoutPeek} onRemove={removeSlide} />}
        {versionsOpen ? (
          <VersionPanel deck={deck} onClose={() => setVersionsOpen(false)} notify={(text) => toast.show(text, undefined, 6000)} />
        ) : (
          slide && (
            // 오른쪽 칸은 탭 셋: 이 장 설정, 움직임, 컴포넌트. 컴포넌트를 고르는 동안에도 어디로 돌아가는지 보인다
            <aside className="side" aria-label="오른쪽 칸">
              <div className="side-tabs" role="tablist" onKeyDown={onTabListKeys}>
                <button type="button" role="tab" className="side-tab" aria-selected={side.tab === 'settings'} tabIndex={side.tab === 'settings' ? 0 : -1} onClick={side.settings}>
                  이 슬라이드 설정
                </button>
                <button type="button" role="tab" className="side-tab" aria-selected={side.tab === 'motion'} tabIndex={side.tab === 'motion' ? 0 : -1} onClick={side.motion}>
                  모션
                </button>
                <button type="button" role="tab" className="side-tab" aria-selected={side.tab === 'library'} tabIndex={side.tab === 'library' ? 0 : -1} onClick={() => blocks.setLibraryOpen(true)}>
                  컴포넌트
                </button>
                {blocks.libraryOpen && (
                  <Info label="컴포넌트 넣는 법">
                    슬라이드로 끌어다 놓거나 눌러서 넣어요. 아무 데나 놓아도 알맞은 자리에 맞춰져요. 그림에 마우스를 올리면 발표할 때의 모션을 보여 줘요.
                  </Info>
                )}
                {/* 좁은 창에서 슬라이드 위에 띄웠을 때만 보인다 */}
                <button type="button" className="icon-btn side-close" aria-label="오른쪽 칸 닫기" title="닫기 (Esc)" onClick={side.close}>
                  <CloseIcon />
                </button>
              </div>
              {side.tab === 'library' ? (
                <BlockLibrary deck={deck} slide={slide} blocks={blocks} toast={toast} />
              ) : side.tab === 'motion' ? (
                <MotionPanel
                  deck={deck}
                  slide={slide}
                  blocks={blocks}
                  toast={toast}
                  onOpenStudio={() => {
                    // 편집기에서 고른 것은 스튜디오가 이어받는다. 편집기 쪽 고르기는 끈다(지우기 키가 그 컴포넌트를 지우지 않게)
                    setStudio({ from: blocks.selected })
                    blocks.select(null)
                  }}
                />
              ) : (
                <Inspector deck={deck} slide={slide} areaHeight={blocks.areaHeight} onFocusField={(m) => focusField(slide.id, m)} onGoSlide={goToSlide} onPeekLayout={setLayoutPeek} />
              )}
            </aside>
          )
        )}
      </div>

      {studio && slide && (
        <MotionStudio
          deck={deck}
          slide={slide}
          initial={studio.from}
          onClose={() => setStudio(null)}
          onConvert={blocks.convert}
          onPresent={(id) => void launch.start(id)}
          toast={toast}
        />
      )}
      <PresentDialogs deck={deck} launch={launch} onGoTo={goToSlide} />
      {exporting.confirm && (
        <CheckDialog
          deck={deck}
          check={exporting.confirm}
          what="파일"
          proceed="그대로 내보내기"
          onProceed={exporting.proceed}
          onClose={exporting.closeConfirm}
          onGoTo={goToSlide}
        />
      )}
      {exporting.print}
      {!reviewing && (job ? <AskStatus deck={deck} job={job} onCancel={ask.cancel} /> : <AiInbox ai={ai} onOpen={setReviewing} />)}
      {reviewing && (
        <AiReview
          deck={deck}
          request={reviewing}
          onClose={() => setReviewing(null)}
          onApply={() => applyAi(reviewing)}
          onReject={() => rejectAi(reviewing)}
        />
      )}
      {toast.node}
    </div>
  )
}

function focusField(slideId: string, m: Missing) {
  const key = (m.block ? blockFieldPrefix(m.block) : '') + (m.item !== undefined ? `${m.item}.${m.key}` : m.key)
  const inCanvas = document.querySelector<HTMLElement>(`.ed-canvas [data-field="${CSS.escape(key)}"]`)
  const inDoc = document.querySelector<HTMLElement>(`[data-doc-field="${CSS.escape(`${slideId}:${key}`)}"]`)
  const el = inCanvas ?? inDoc
  if (!el) return
  el.focus()
  el.scrollIntoView({ block: 'nearest' })
}

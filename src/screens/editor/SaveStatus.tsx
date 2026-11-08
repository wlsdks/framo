import { useEffect, useRef, useState } from 'react'
import type { Deck } from '../../deck/types'
import { cx } from '../../lib/cx'
import { keys } from '../../lib/keys'
import { downloadDeckFile } from '../../store/deckFile'
import { useDeck } from '../../store/deckStore'
import { saveToBrowser, saveToFolder, useStorage } from '../../store/persist'
import { AlertIcon, CheckIcon, FOLDER_TIP, FOLDER_WHY, FolderIcon, Popover, dialogOpen, useEscape } from '../ui'

/** local: 이 브라우저에만 저장했다. 잘못된 것이 아니라 칠하지 않는다 (폴더를 정하는 단추를 옆에 둔다) */
type Tone = 'ok' | 'local' | 'bad' | 'busy'

function useSaveSummary(): { tone: Tone; label: string } {
  const { folder, browser, folderWrite } = useStorage()
  if (browser === 'failed' && folderWrite !== 'saved') return { tone: 'bad', label: '저장하지 못했어요' }
  if (folder?.kind === 'ready') {
    if (folderWrite === 'failed') return { tone: 'bad', label: '폴더에 저장하지 못했어요' }
    if (browser === 'saving' || folderWrite === 'saving') return { tone: 'busy', label: '저장 중' }
    return { tone: 'ok', label: '폴더에 저장됨' }
  }
  if (browser === 'saving') return { tone: 'busy', label: '저장 중' }
  return { tone: 'local', label: '이 브라우저에 저장됨' }
}

/** 보관 폴더를 정하라고 저절로 물은 적이 있는지. 한 번만 묻고, 그 뒤로는 옆의 단추로 정한다 */
const ASKED_KEY = 'html-maker:folder-asked'
function folderAsked(): boolean {
  try {
    return localStorage.getItem(ASKED_KEY) === '1'
  } catch {
    return true
  }
}
function markFolderAsked() {
  try {
    localStorage.setItem(ASKED_KEY, '1')
  } catch {
    /* 저장이 안 되면 이번에만 */
  }
}

/** 마지막으로 고친 뒤 이만큼 손을 쉬면 묻는다 */
const ASK_QUIET = 4000
/** 글 칸에 커서를 둔 채면 이만큼 */
const ASK_QUIET_TYPING = 15000
function isTypingIn(el: Element | null): boolean {
  return !!el?.closest('input, textarea, [contenteditable]')
}

/**
 * 편집기 위쪽의 저장 상태. 누르면 어디에 저장되는지와 할 일을 알려 준다.
 * 보관 폴더를 정하지 않았으면 옆에 '보관 폴더 정하기'를 두고, 이 발표를 처음 고친 뒤 손이 멈춘 때 까닭과 함께 묻는다(답하면 다시 묻지 않는다).
 * 예전에는 노란 꼬리표(이 브라우저에만 저장됨)가 편집하는 내내 떠 있어 겁만 주고 무엇을 하면 되는지 알기 어려웠다
 */
export function SaveStatus({ deck, onOpenVersions }: { deck: Deck; onOpenVersions: () => void }) {
  const { tone, label } = useSaveSummary()
  const { folder, choose, allow } = useStorage()
  const [asking, setAsking] = useState(false)
  // 연 뒤에 처음 고친 다음, 손이 멈춘 때 묻는다: 막 연 발표는 아직 지킬 것이 없고, 예시는 다시 만들 수 있다.
  // 처음 고친 바로 그때 묻던 때는 첫 글자를 쓰는 중에 떠서 발표 이름과 쓰던 칸을 가렸고, 아무 데나 누르면 닫혀 다시 묻지 않았다
  const opened = useRef(deck.updatedAt)
  const due = deck.updatedAt !== opened.current && deck.id !== 'sample' && folder?.kind === 'none'
  // 이번에 한 번 띄웠으면 이 편집기에서는 다시 띄우지 않는다 (답하지 않고 닫았으면 다음에 발표를 열 때 다시 묻는다)
  const shown = useRef(false)
  useEffect(() => {
    if (!due || shown.current || folderAsked()) return
    // 고칠 때마다 다시 잰다: 마지막으로 고친 뒤 ASK_QUIET 동안 고치지 않으면 묻는다.
    // 글 칸에 커서가 있으면 생각하며 쉬는 중일 수 있어 더 오래 기다린다. 대화 창이 떠 있으면 그 뒤로 미룬다
    const since = Date.now()
    const timer = window.setInterval(() => {
      const quiet = Date.now() - since
      const typing = isTypingIn(document.activeElement)
      if (quiet < ASK_QUIET || (typing && quiet < ASK_QUIET_TYPING) || dialogOpen()) return
      window.clearInterval(timer)
      shown.current = true
      setAsking(true)
    }, 500)
    return () => window.clearInterval(timer)
  }, [due, deck.updatedAt])
  /** 답했으면(고르기, 나중에, Esc) 다시 묻지 않는다 */
  const answer = () => {
    markFolderAsked()
    setAsking(false)
  }
  // 바깥을 누르면 접기만 한다 (머리줄의 '보관 폴더 정하기'는 남는다). 다른 일을 하다 무심코 누른 것일 수 있어 답으로 치지 않는다.
  // 누를 때까지 떠 있으면 장 목록의 첫 장을 가렸다
  const askRef = useRef<HTMLDivElement>(null)
  // 글 칸에서 누른 Esc는 쓰기를 마치는 키라서 답으로 치지 않는다
  useEscape(answer, { active: asking, typing: false })
  useEffect(() => {
    if (!asking) return
    const onDown = (e: PointerEvent) => {
      if (!askRef.current?.contains(e.target as Node)) setAsking(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [asking])
  // 다른 곳(저장 상태 창)에서 폴더를 정했으면 물음을 닫는다
  useEffect(() => {
    if (folder?.kind !== 'none') setAsking(false)
  }, [folder?.kind])

  const pick = async () => {
    if (asking) answer()
    if ((await choose()).kind === 'ready') await saveToFolder(useDeck.getState().deck ?? deck)
  }
  const reconnect = async () => {
    if ((await allow()).kind === 'ready') await saveToFolder(useDeck.getState().deck ?? deck)
  }
  // 저장하지 못한 때는 저장 상태 창이 할 일을 말하므로 옆 단추는 감춘다
  const fix = tone === 'local' || tone === 'busy' ? (folder?.kind === 'none' ? 'pick' : folder?.kind === 'locked' ? 'allow' : null) : null

  return (
    <div className="save-wrap">
      <Popover
        align="left"
        className="pop-save"
        button={({ toggle, open }) => (
          <button
            type="button"
            className={cx('save', `is-${tone}`)}
            aria-expanded={open}
            // 따로 저장하지 않아도 된다는 것을 마우스만 올려도 알 수 있게
            title={`고칠 때마다 저장돼요. 바로 저장하려면 ${keys('mod+S')}`}
            onClick={() => {
              setAsking(false)
              toggle()
            }}
          >
            {tone === 'bad' ? <AlertIcon /> : tone === 'busy' ? <span className="save-dot" /> : <CheckIcon />}
            {label}
          </button>
        )}
      >
        {(close) => <SaveDetails deck={deck} close={close} onOpenVersions={onOpenVersions} />}
      </Popover>
      {/* 화면 읽기 프로그램에는 저장하지 못한 때만 알린다. 저장 단추 자체를 알림 칸(aria-live)으로 두었더니 글을 쓰는 동안
          고칠 때마다 '저장 중'과 '이 브라우저에 저장됨'을 번갈아 읽어 쓰는 글을 듣기 어려웠다. 저장된 상태는 단추 이름으로 읽힌다 */}
      <p className="sr-only" role="alert">
        {tone === 'bad' ? label : ''}
      </p>
      {fix === 'pick' && (
        <button type="button" className="save-fix" onClick={() => void pick()}>
          보관 폴더 정하기
        </button>
      )}
      {fix === 'allow' && folder?.kind === 'locked' && (
        <button type="button" className="save-fix" title={`‘${folder.name}’ 폴더에 다시 저장하려면 한 번 더 허용해야 해요`} onClick={() => void reconnect()}>
          폴더 다시 연결하기
        </button>
      )}
      {asking && (
        // 쓰는 중에 뜨므로 초점을 가져가지 않는다. 화면 읽기 프로그램에는 한 번 읽어 준다
        <div ref={askRef} className="save-ask" role="region" aria-label="보관 폴더 정하기">
          <p className="save-pop-h" aria-live="polite">
            <FolderIcon />
            PC 폴더에도 저장해 둘까요?
          </p>
          <p className="save-pop-p">
            지금은 이 브라우저 안에만 저장돼요. {FOLDER_WHY} 폴더를 정하면 고칠 때마다 그 폴더에 파일로도 저장돼요. {FOLDER_TIP}
          </p>
          <div className="save-pop-actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => void pick()}>
              <FolderIcon />
              보관 폴더 고르기
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={answer}>
              나중에
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function SaveDetails({ deck, close, onOpenVersions }: { deck: Deck; close: () => void; onOpenVersions?: () => void }) {
  const { folder, browser, folderWrite, choose, allow } = useStorage()
  const [busy, setBusy] = useState(false)
  // 위쪽 단추가 '저장하지 못했어요'라고 할 때와 같은 조건 (useSaveSummary)
  const browserFailed = browser === 'failed' && folderWrite !== 'saved'
  const folderFailed = folder?.kind === 'ready' && folderWrite === 'failed'
  // 다시 저장할 때는 열려 있는 지금 발표를 쓴다 (이 창을 연 뒤에 더 고쳤을 수 있다)
  const current = () => useDeck.getState().deck ?? deck
  const download = () => {
    downloadDeckFile(current())
    close()
  }
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }
  // 폴더에 못 쓴 까닭이 허용이 풀린 것이면 다시 묻는다 (단추를 누른 지금만 물을 수 있다). 이미 허용돼 있으면 묻지 않고 넘어간다
  const retryFolder = () =>
    run(async () => {
      if ((await allow()).kind === 'ready') await saveToFolder(current())
    })
  const pickFolder = () =>
    run(async () => {
      if ((await choose()).kind === 'ready') await saveToFolder(current())
    })

  if (browserFailed) {
    return (
      <div className="save-pop">
        <p className="save-pop-h">
          <AlertIcon />이 브라우저에 저장하지 못했어요
        </p>
        <p className="save-pop-p">
          브라우저 저장 공간이 모자라면 저장되지 않아요. 고친 내용을 잃지 않게 먼저 작업 파일을 다운로드해 두고, 쓰지 않는 발표를 지우거나 큰 이미지를 줄인 뒤 다시
          저장해 주세요.
        </p>
        <div className="save-pop-actions">
          <button type="button" className="btn btn-primary btn-sm" onClick={download}>
            작업 파일 다운로드
          </button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => run(() => saveToBrowser(current()))}>
            다시 저장하기
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="save-pop">
      {folder?.kind === 'ready' && folderFailed && (
        <>
          <p className="save-pop-h">
            <AlertIcon />‘{folder.name}’ 폴더에 저장하지 못했어요
          </p>
          <p className="save-pop-p">
            폴더를 옮기거나 지웠거나, 공유 드라이브 연결이 끊겼거나, 폴더 허용이 풀렸을 수 있어요. 고친 내용은 이 브라우저에는 저장돼 있어요.
          </p>
          <div className="save-pop-actions">
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={retryFolder}>
              다시 허용하고 저장하기
            </button>
            <button type="button" className="btn-link" disabled={busy} onClick={pickFolder}>
              다른 폴더 고르기
            </button>
          </div>
        </>
      )}

      {folder?.kind === 'ready' && !folderFailed && (
        <>
          <p className="save-pop-h">
            <FolderIcon />‘{folder.name}’ 폴더에 저장하고 있어요
          </p>
          <p className="save-pop-p">고칠 때마다 이 폴더의 작업 파일에 바로 저장되고, 이 브라우저에도 같이 저장돼요. 브라우저 기록을 지워도 파일은 남아요.</p>
          <div className="save-pop-actions">
            {onOpenVersions && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  close()
                  onOpenVersions()
                }}
              >
                버전 기록 보기
              </button>
            )}
            <button type="button" className="btn-link" onClick={() => choose()}>
              다른 폴더로 바꾸기
            </button>
          </div>
        </>
      )}

      {folder?.kind === 'locked' && (
        <>
          <p className="save-pop-h">‘{folder.name}’ 폴더에 저장하려면 허용이 필요해요</p>
          <p className="save-pop-p">브라우저를 다시 열면 한 번 더 허용해야 해요. 허용하기 전까지는 이 브라우저에만 저장돼요.</p>
          <div className="save-pop-actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => allow()}>
              허용하기
            </button>
          </div>
        </>
      )}

      {folder?.kind === 'none' && (
        <>
          <p className="save-pop-h">지금은 이 브라우저 안에만 저장돼요</p>
          <p className="save-pop-p">
            {FOLDER_WHY} 다른 PC에서도 열 수 없어요. PC나 팀 공유 드라이브의 폴더를 골라 두면 고칠 때마다 그 폴더에도 자동으로 저장돼요. {FOLDER_TIP}
          </p>
          <div className="save-pop-actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => choose()}>
              <FolderIcon />
              보관 폴더 고르기
            </button>
          </div>
        </>
      )}

      {(!folder || folder.kind === 'unsupported') && (
        <>
          <p className="save-pop-h">지금은 이 브라우저에만 저장돼요</p>
          <p className="save-pop-p">
            이 브라우저는 폴더 저장을 지원하지 않아요. 크롬이나 엣지에서 열면 PC 폴더에 자동으로 보관돼요. 그 전까지는 작업 파일을 다운로드해 두세요.
          </p>
          <div className="save-pop-actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={download}>
              작업 파일 다운로드
            </button>
          </div>
        </>
      )}

      <p className="save-pop-keys">
        <kbd>{keys('mod+S')}</kbd>
        <span>지금 바로 저장해요. 따로 누르지 않아도 고칠 때마다 저장돼요.</span>
      </p>
      {folder && folder.kind !== 'unsupported' && (
        <p className="save-pop-foot">
          <button type="button" className="btn-link" onClick={download}>
            작업 파일 다운로드
          </button>
          <span>발표자 노트까지 들어 있어요. 다른 분께 보낼 때는 ‘내보내기’의 발표 파일을 쓰세요.</span>
        </p>
      )}
    </div>
  )
}

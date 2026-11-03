import { useEffect, useState } from 'react'
import { BLUEPRINTS } from '../deck/blueprints'
import { knownOnly, unknownParts } from '../deck/compat'
import { missingFields } from '../deck/fields'
import { createSampleDeck } from '../deck/sample'
import type { Deck } from '../deck/types'
import { readDeckFromHtml } from '../export/exportHtml'
import { particle } from '../lib/josa'
import { go, timeAgo } from '../lib/router'
import { FitSlide, SlideCanvas } from '../slides/SlideCanvas'
import { copyDeck } from '../store/copy'
import { decodeDeckFile, DECK_EXT } from '../store/deckFile'
import { useDeck } from '../store/deckStore'
import { listDecks } from '../store/library'
import { importDeck, persistNow, removeDeck, syncWithFolder, useStorage } from '../store/persist'
import { Brand, FOLDER_WHY, FolderIcon, Info, Modal, MoreIcon, noticeAfterGo, PlusIcon, Popover, SAVE_HELP, UploadIcon, useToast } from './ui'
import { UpdateNote } from './UpdateNote'

const SAMPLE_ID = 'sample'

/** 빈 홈에 보이는 새 발표의 차례. 마법사의 세 단계와 이름을 맞춘다 */
const EMPTY_STEPS: [string, string][] = [
  ['발표 종류', '사업 제안, 주간 업무 보고처럼 어떤 자리인지 골라요'],
  ['발표 상황', '듣는 사람과 시간에 맞춰 슬라이드 수가 정해져요'],
  ['표지', '제목만 적으면 바로 채우기 시작해요'],
]

/** 로고의 뷰파인더(네 귀퉁이와 가운데 줄)를 옅게. 빈 화면에 장식 그림 대신 Framo의 표시 하나만 둔다 */
function Waves() {
  return (
    <svg className="home-waves" viewBox="2 2 20 20" aria-hidden="true">
      <path d="M6 9.5v-2A1.5 1.5 0 0 1 7.5 6h2M14.5 6h2A1.5 1.5 0 0 1 18 7.5v2M18 14.5v2a1.5 1.5 0 0 1-1.5 1.5h-2M9.5 18h-2A1.5 1.5 0 0 1 6 16.5v-2" />
      <path d="M9.5 12h5" />
    </svg>
  )
}

export function Home() {
  const [decks, setDecks] = useState<Deck[] | null>(null)
  const [toDelete, setToDelete] = useState<Deck | null>(null)
  const folder = useStorage((s) => s.folder)
  const toast = useToast()

  const refresh = () => listDecks().then(setDecks)
  useEffect(() => {
    // 편집기에 들고 있던 발표는 놓는다. 폴더에서 더 새것이 들어올 수 있다.
    useDeck.getState().close()
    refresh()
    useStorage
      .getState()
      .refresh()
      .then(async (status) => {
        if (status.kind !== 'ready') return
        await syncWithFolder()
        refresh()
      })
  }, [])

  const duplicate = async (deck: Deck) => {
    const copy = copyDeck(deck, `${deck.title} 사본`)
    if (!(await persistNow(copy))) toast.show(`사본을 만들지 못했어요. ${SAVE_HELP}`, undefined, 8000)
    refresh()
  }

  // 예시는 하나만 둔다. 누를 때마다 새로 만들면 같은 예시가 목록에 쌓인다. 지웠으면 다시 만든다.
  const openSample = async () => {
    const existing = (await listDecks()).find((d) => d.id === SAMPLE_ID)
    const fresh = { ...createSampleDeck(), id: SAMPLE_ID }
    // 예시를 바꾼 새 버전에서도 예전에 만들어 둔 예시가 그대로 열려 새 예시를 볼 길이 없었다.
    // 손대지 않은(만든 뒤 고친 적 없는) 예전 예시만 새 예시로 바꾸고, 고친 예시는 그 사람의 것이라 그대로 연다
    if (existing && (existing.updatedAt !== existing.createdAt || existing.title === fresh.title)) {
      go({ name: 'edit', id: existing.id })
      return
    }
    const deck = fresh
    // 저장하지 못한 채 편집기로 가면 '찾을 수 없는 발표'로 보인다
    if (!(await persistNow(deck))) {
      toast.show(`예시를 열지 못했어요. ${SAVE_HELP}`, undefined, 8000)
      return
    }
    go({ name: 'edit', id: deck.id })
  }

  const openFile = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = `${DECK_EXT},.html,text/html`
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      const text = await file.text()
      // 작업 파일인지는 확장자가 아니라 내용으로 가린다. 'X.DECK'처럼 확장자가 대문자이거나(윈도우는 대소문자를 가리지 않는다)
      // 이름을 바꾼 작업 파일을 HTML로 읽어 열 수 없는 파일이라고 했다
      const deck = decodeDeckFile(text) ?? readDeckFromHtml(text)
      if (!deck) {
        toast.show('Framo에서 저장한 작업 파일이나 내보낸 발표 파일(HTML)만 열 수 있어요.')
        return
      }
      const opened = await importDeck(deck)
      if (!opened.saved) {
        toast.show(`파일을 열지 못했어요. ${SAVE_HELP}`, undefined, 8000)
        refresh()
        return
      }
      // 같은 발표를 말없이 덮어쓰지 않았다는 것을 편집기에서 알린다
      if (opened.replaced) noticeAfterGo('있던 발표를 파일 내용으로 바꿨어요. 바뀌기 전 모습은 버전 기록에 있어요.')
      else if (opened.copied) noticeAfterGo('같은 발표가 이미 있어서 사본으로 열었어요. 있던 발표는 그대로예요.')
      go({ name: 'edit', id: opened.deck.id })
    }
    input.click()
  }

  return (
    <div className="home">
      <header className="home-top">
        <div className="home-brand">
          <Brand />
          <UpdateNote />
        </div>
        <button type="button" className="btn btn-ghost" onClick={openFile}>
          <UploadIcon />
          파일 열기
        </button>
      </header>

      <main className="home-main">
        <div className="home-head">
          <h1 className="home-h">
            내 발표
            {decks && decks.length > 0 && <span className="home-count">{decks.length}개</span>}
          </h1>
          <div className="home-links">
            <button type="button" className="btn-link" onClick={() => go({ name: 'system' })}>
              슬라이드 모음 보기
            </button>
            {decks && decks.length > 0 && (
              <button type="button" className="btn-link" onClick={openSample}>
                완성된 예시 보기
              </button>
            )}
            {/* 발표가 있으면 만들기는 머리말 오른쪽 단추 하나로. 예전에는 목록 맨 앞에 테만 두른 빈 카드(+ 새 발표 만들기)를 두어
                흔한 템플릿의 카드 판처럼 보였고, 발표 그림 사이에서 빈칸처럼 읽혔다 */}
            {decks && decks.length > 0 && (
              <button type="button" className="btn btn-primary" onClick={() => go({ name: 'new' })}>
                <PlusIcon />새 발표 만들기
              </button>
            )}
          </div>
        </div>

        {/* 발표가 없으면 지킬 것이 없어 보관 폴더 이야기를 꺼내지 않는다 (다시 연결할 폴더가 있을 때만) */}
        <StorageNote hasDecks={!!decks && decks.length > 0} onSynced={refresh} />

        {decks && decks.length === 0 && (
          <div className="home-empty">
            <div className="home-empty-lead">
              <Waves />
              <h2 className="home-empty-h">첫 발표를 만들어 볼까요?</h2>
              <p className="home-empty-p">발표 종류를 고르면 슬라이드 구성을 잡아 드려요. 내용만 채우면 돼요.</p>
              <div className="home-empty-actions">
                <button type="button" className="btn btn-primary btn-lg" onClick={() => go({ name: 'new' })}>
                  <PlusIcon />새 발표 만들기
                </button>
                <button type="button" className="btn btn-ghost btn-lg" onClick={openSample}>
                  완성된 예시 보기
                </button>
              </div>
            </div>
            {/* 무엇을 고르게 되는지 먼저 보여 준다. 처음 쓰는 분이 '새 발표 만들기'를 누르기 전에 겁먹지 않게 */}
            <ol className="home-steps" aria-label="새 발표를 만드는 차례">
              {EMPTY_STEPS.map(([name, desc], i) => (
                <li key={name}>
                  <span className="home-step-n">{String(i + 1).padStart(2, '0')}</span>
                  <span className="home-step-name">{name}</span>
                  <span className="home-step-desc">{desc}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {decks && decks.length > 0 && (
          <div className="home-grid">
            {decks.map((deck) => (
              <DeckCard key={deck.id} deck={deck} onDuplicate={() => duplicate(deck)} onDelete={() => setToDelete(deck)} />
            ))}
          </div>
        )}
      </main>

      {toDelete && (
        <Modal
          title="이 발표를 지울까요?"
          onClose={() => setToDelete(null)}
          actions={
            <>
              <button type="button" className="btn btn-ghost" data-autofocus onClick={() => setToDelete(null)}>
                취소
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={async () => {
                  await removeDeck(toDelete)
                  setToDelete(null)
                  refresh()
                }}
              >
                지우기
              </button>
            </>
          }
        >
          <p>
            {folder?.kind === 'ready'
              ? `‘${toDelete.title}’${particle(toDelete.title, '을', '를')} 목록에서 지워요. 보관 폴더의 작업 파일은 ‘지운 발표’ 폴더로 옮겨 두니, 필요하면 파일 열기로 다시 불러올 수 있어요.`
              : `‘${toDelete.title}’${particle(toDelete.title, '을', '를')} 지우면 되돌릴 수 없어요. 버전 기록도 함께 지워지고, 내보낸 파일은 그대로 남아요.`}
          </p>
        </Modal>
      )}
      {toast.node}
    </div>
  )
}

function DeckCard({ deck, onDuplicate, onDelete }: { deck: Deck; onDuplicate: () => void; onDelete: () => void }) {
  // 새 버전에서 만든 발표면 이 버전이 그릴 수 있는 것만으로 작은 그림을 그린다
  const shown = unknownParts(deck) ? knownOnly(deck) : deck
  const first = shown.slides.find((s) => !s.hidden) ?? shown.slides[0]
  const typeName = BLUEPRINTS[deck.meta.type]?.name ?? ''
  // 아직 채울 칸이 남은 발표는 슬라이드 수 대신 남은 빈칸 수를: 어느 발표를 이어서 하면 되는지 들어가 보지 않아도 보이게.
  // 발표에서 뺀 장은 세지 않는다(발표 전 확인과 같다). 다 채운 발표는 예전처럼 슬라이드 수
  const blanks = deck.slides.reduce((n, s) => (s.hidden ? n : n + missingFields(s, deck.meta).length), 0)
  return (
    <article className="card">
      <a className="card-link" href={`#/edit/${deck.id}`} aria-label={`${deck.title} 열기`}>
        <div className="card-thumb" aria-hidden="true">
          <FitSlide>{first && <SlideCanvas deck={shown} slide={first} mode="final" />}</FitSlide>
        </div>
      </a>
      <div className="card-info">
        <div className="card-text">
          <h2 className="card-title">{deck.title}</h2>
          {/* 한 줄로: 두 줄이면 카드마다 글이 길어져 그림보다 글이 먼저 읽힌다 */}
          <p className="card-meta">
            {typeName && <span>{typeName}</span>}
            {blanks > 0 ? (
              <span className="card-blanks">
                <span className="card-blanks-dot" aria-hidden="true" />
                빈칸 {blanks}곳
              </span>
            ) : (
              <span>슬라이드 {deck.slides.length}장</span>
            )}
            <span>{timeAgo(deck.updatedAt)} 수정</span>
          </p>
        </div>
        <Popover
          button={({ toggle, open }) => (
            <button type="button" className="icon-btn" aria-label={`${deck.title} 더 보기`} aria-expanded={open} onClick={toggle}>
              <MoreIcon />
            </button>
          )}
        >
          {(close) => (
            <div className="menu">
              <button
                type="button"
                className="menu-item"
                onClick={() => {
                  close()
                  onDuplicate()
                }}
              >
                사본 만들기
              </button>
              <button
                type="button"
                className="menu-item is-danger"
                onClick={() => {
                  close()
                  onDelete()
                }}
              >
                지우기
              </button>
            </div>
          )}
        </Popover>
      </div>
    </article>
  )
}

/**
 * 발표가 어디에 보관되는지 한 줄로. 칠한 띠를 두지 않는다: 이 브라우저에만 저장하는 것은 잘못이 아니라서,
 * 늘 떠 있는 노란 띠는 겁만 주고 무엇을 하면 되는지 알기 어려웠다. 정하는 것은 줄 끝의 글자 단추 하나로.
 * 편집기에서 처음 고칠 때 한 번 까닭과 함께 묻는다 (SaveStatus)
 */
function StorageNote({ hasDecks, onSynced }: { hasDecks: boolean; onSynced: () => void }) {
  const { folder, choose, allow } = useStorage()
  if (!folder) return null

  const run = async (fn: () => Promise<{ kind: string }>) => {
    const next = await fn()
    if (next.kind === 'ready') onSynced()
  }

  if (folder.kind === 'ready') {
    return (
      <p className="store-note">
        <FolderIcon />
        <span>
          ‘<b>{folder.name}</b>’ 폴더에 자동으로 보관해요
          <Info label="보관 폴더 설명" align="start">
            고칠 때마다 저장되고, 버전 기록도 이 폴더에 남아요.
          </Info>
        </span>
        <button type="button" className="btn-link" onClick={() => run(choose)}>
          폴더 바꾸기
        </button>
      </p>
    )
  }

  if (folder.kind === 'locked') {
    return (
      <p className="store-note">
        <FolderIcon />
        <span>
          ‘<b>{folder.name}</b>’ 폴더와 다시 연결해야 해요
          <Info label="다시 연결하는 이유" align="start">
            브라우저를 새로 열면 한 번 더 허용해야 해요. 허용하기 전까지는 이 브라우저에만 저장돼요.
          </Info>
        </span>
        <button type="button" className="btn-link" onClick={() => run(allow)}>
          다시 연결하기
        </button>
      </p>
    )
  }

  if (!hasDecks) return null

  if (folder.kind === 'none') {
    return (
      <p className="store-note">
        <FolderIcon />
        <span>
          지금은 이 브라우저 안에만 저장해요
          <Info label="보관 폴더 설명" align="start">
            {FOLDER_WHY} 보관 폴더를 정하면 고칠 때마다 그 폴더에 파일로도 저장되고, 버전 기록도 함께 남아요.
          </Info>
        </span>
        <button type="button" className="btn-link" onClick={() => run(choose)}>
          보관 폴더 정하기
        </button>
      </p>
    )
  }

  return (
    <p className="store-note">
      <FolderIcon />
      <span>
        지금은 이 브라우저 안에만 저장해요
        <Info label="보관 설명" align="start">
          크롬이나 엣지에서 열면 PC 폴더에 보관할 수 있어요. 그 전까지는 편집 화면의 저장 상태를 눌러 작업 파일을 다운로드해 두세요.
        </Info>
      </span>
    </p>
  )
}

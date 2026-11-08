import { useEffect, useRef, useState } from 'react'
import { slideName } from '../../deck/blocks'
import { pageInfo } from '../../deck/fields'
import type { Deck } from '../../deck/types'
import { cx } from '../../lib/cx'
import { particle } from '../../lib/josa'
import { go } from '../../lib/router'
import { pageProps, ScaledSlide, SlideCanvas } from '../../slides/SlideCanvas'
import { useDeck } from '../../store/deckStore'
import { copyDeck } from '../../store/copy'
import { persistNow, useStorage } from '../../store/persist'
import {
  deckSignature,
  deleteVersion,
  keepVersion,
  listVersions,
  loadVersionDeck,
  onVersionsChange,
  REASON_LABEL,
  renameVersion,
  saveVersion,
  slideAfterRestore,
  versionChanges,
  type DeckVersion,
} from '../../store/versions'
import { CloseIcon, HistoryIcon, Info, Modal, MoreIcon, Popover, SAVE_HELP, useDialog, useEscape } from '../ui'

const timeFmt = new Intl.DateTimeFormat('ko-KR', { hour: 'numeric', minute: '2-digit' })
const dayFmt = new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })
const fullFmt = new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })

function dayLabel(ts: number): string {
  const d = new Date(ts)
  const today = new Date()
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diff = Math.round((start(today) - start(d)) / 86400000)
  if (diff === 0) return '오늘'
  if (diff === 1) return '어제'
  return dayFmt.format(d)
}

function versionTitle(v: DeckVersion): string {
  return v.named ? v.name : '자동 저장'
}

function changeText(v: DeckVersion, older?: DeckVersion): string {
  if (!older) return '처음 남긴 버전'
  if (v.signature === older.signature) return '앞 버전과 내용이 같아요'
  const c = versionChanges(v, older)
  const parts: string[] = []
  // 장 이름은 ‘ ’로 묶는다(장 목록, AI 공유와 같다): 컴포넌트 장의 이름(‘핵심 한 줄, 점 목록 외 1’)에도 쉼표와 '외'가 있어서,
  // 묶지 않으면 장 하나만 고쳐도 '고친 장: 핵심 한 줄, 점 목록 외 1'처럼 여러 장을 고친 것으로 읽혔다
  const list = (names: string[]) => {
    const q = names.map((n) => `‘${n}’`)
    return q.length > 3 ? `${q.slice(0, 3).join(', ')} 외 ${q.length - 3}장` : q.join(', ')
  }
  if (c.changed.length) parts.push(`고친 슬라이드: ${list(c.changed)}`)
  if (c.added.length) parts.push(`더한 슬라이드: ${list(c.added)}`)
  if (c.removed.length) parts.push(`뺀 슬라이드: ${list(c.removed)}`)
  return parts.join(' · ') || '발표 이름, 테마, 발표 정보가 바뀜'
}

/** 편집기 오른쪽에서 열리는 버전 기록 */
export function VersionPanel({ deck, onClose, notify }: { deck: Deck; onClose: () => void; notify: (text: string) => void }) {
  const [versions, setVersions] = useState<DeckVersion[] | null>(null)
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const [preview, setPreview] = useState<{ version: DeckVersion; deck: Deck } | null>(null)
  const [restoring, setRestoring] = useState<DeckVersion | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [removing, setRemoving] = useState<DeckVersion | null>(null)
  const folder = useStorage((s) => s.folder)
  const current = deckSignature(deck)

  useEffect(() => {
    const load = () => {
      listVersions(deck.id).then(setVersions)
    }
    load()
    return onVersionsChange(load)
  }, [deck.id])

  // 미리 보기나 되돌릴지 묻는 창이 떠 있으면 그 창의 Esc다. 버전 안의 ⋯ 메뉴는 뒤에 열려서 먼저 닫힌다 (useEscape)
  useEscape(onClose, { active: !preview && !restoring })

  const saveNamed = async () => {
    const label = name.trim() || `${fullFmt.format(Date.now())} 버전`
    const v = await saveVersion(deck, { name: label })
    setNaming(false)
    setName('')
    notify(v ? `‘${label}’ 버전을 남겼어요` : `버전을 남기지 못했어요. ${SAVE_HELP}`)
  }

  // 버전 내용을 읽지 못했을 때: 다른 창에서 지웠거나 브라우저 저장소가 지워졌을 수 있다. 보관 폴더에 같은 때의 파일이 있으면 그것으로 연다
  const loadFailed = () =>
    folder?.kind === 'ready'
      ? `이 버전을 불러오지 못했어요. ‘${folder.name}/버전 기록’ 폴더에 같은 때의 파일이 있으면 내 발표에서 ‘파일 열기’로 열어 주세요.`
      : '이 버전을 불러오지 못했어요. 기록에서 지워졌을 수 있어요. 다른 버전을 골라 주세요.'

  const openPreview = async (version: DeckVersion) => {
    const d = await loadVersionDeck(version.id)
    if (d) setPreview({ version, deck: d })
    else notify(loadFailed())
  }

  const restore = async (version: DeckVersion) => {
    const d = await loadVersionDeck(version.id)
    setRestoring(null)
    setPreview(null)
    if (!d) {
      notify(loadFailed())
      return
    }
    // 되돌리기 전 상태를 기록에 남기지 못하면 되돌리지 않는다: 남기지 못한 채 되돌리면 지금 발표로 돌아갈 길이 없다
    if (!(await keepVersion(deck, { reason: 'restore' }))) {
      notify(`지금 발표를 버전 기록에 남기지 못해서 되돌리지 않았어요. ${SAVE_HELP}`)
      return
    }
    // AI 공유는 버전에 딸린 내용이 아니라 지금 켜 둔 설정이다. 예전 버전이 켜져 있었다고 꺼 둔 공유를 다시 켜지 않는다
    const next: Deck = { ...d, id: deck.id, updatedAt: Date.now(), aiShare: useDeck.getState().deck?.aiShare ?? deck.aiShare }
    const was = useDeck.getState().selectedId
    useDeck.getState().open(next)
    // 여는 것은 첫 장을 고른다. 보던 장이나 되돌려서 바뀐 장을 보여 준다
    const opened = useDeck.getState().deck
    const show = opened && slideAfterRestore(deck, opened, was)
    if (show) useDeck.getState().select(show)
    const saved = await persistNow(next)
    // 이름 붙인 버전은 이름으로 (되돌릴지 묻는 창과 같게). 날짜로만 알리면 이름을 붙여 둔 버전으로 돌아왔는지 알기 어려웠다
    const which = version.named ? `‘${version.name}’${particle(version.name, '으로', '로')}` : `${fullFmt.format(version.createdAt)} 버전으로`
    notify(saved ? `${which} 되돌렸어요. 되돌리기 전 상태도 기록에 남겨 뒀어요.` : `${which} 되돌렸지만 저장하지 못했어요. ${SAVE_HELP}`)
  }

  const openCopy = async (version: DeckVersion) => {
    const d = await loadVersionDeck(version.id)
    if (!d) return notify(loadFailed())
    // 새 발표는 AI 공유를 끈 채로 시작한다 (공유는 발표마다 사람이 켠다)
    const copy = copyDeck(d, `${d.title} (${fullFmt.format(version.createdAt)})`)
    // 저장하지 못한 채 가면 편집기가 '찾을 수 없는 발표'로 보인다
    if (!(await persistNow(copy))) return notify(`새 발표로 꺼내지 못했어요. ${SAVE_HELP}`)
    go({ name: 'edit', id: copy.id })
  }

  const rename = async (version: DeckVersion, next: string) => {
    setRenaming(null)
    if (next.trim() && next.trim() !== version.name) await renameVersion(version, next)
  }

  const remove = async (version: DeckVersion) => {
    await deleteVersion(version.id)
  }

  const groups: { day: string; items: { v: DeckVersion; older?: DeckVersion }[] }[] = []
  versions?.forEach((v, i) => {
    const day = dayLabel(v.createdAt)
    const last = groups[groups.length - 1]
    const entry = { v, older: versions[i + 1] }
    if (last?.day === day) last.items.push(entry)
    else groups.push({ day, items: [entry] })
  })

  return (
    <aside className="vp" aria-label="버전 기록">
      <header className="vp-head">
        <h2 className="vp-title">
          <HistoryIcon />
          버전 기록
          {/* 늘 보이는 설명 대신 (i)에: 목록을 위로 끌어올린다 */}
          <Info label="버전 기록 설명">
            버전을 누르면 그때 모습을 보고 되돌릴 수 있어요. 이름 붙인 버전은 지우기 전까지 보관되고, 자동 저장은 고치는 중 10분마다, 발표하거나 내보내기 전에 남아요.
            {folder?.kind === 'ready' && ` ‘${folder.name}/버전 기록’ 폴더에도 같이 저장돼요.`}
          </Info>
        </h2>
        <button type="button" className="icon-btn" aria-label="닫기" onClick={onClose}>
          <CloseIcon />
        </button>
      </header>

      <div className="vp-save">
        {naming ? (
          <form
            className="vp-name-form"
            onSubmit={(e) => {
              e.preventDefault()
              saveNamed()
            }}
          >
            <input
              className="input"
              autoFocus
              value={name}
              placeholder="예: 본부장 보고본, 팀장 검토 반영"
              aria-label="버전 이름"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), setNaming(false))}
            />
            <div className="vp-name-actions">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setNaming(false)}>
                취소
              </button>
              <button type="submit" className="btn btn-primary btn-sm">
                남기기
              </button>
            </div>
          </form>
        ) : (
          <button type="button" className="btn btn-primary vp-save-btn" onClick={() => setNaming(true)}>
            지금 상태를 버전으로 남기기
          </button>
        )}
      </div>

      <div className="vp-list">
        {versions && versions.length === 0 && <p className="vp-empty">아직 남긴 버전이 없어요.</p>}
        {groups.map((g) => (
          <section key={g.day} className="vp-group">
            <h3 className="vp-day">{g.day}</h3>
            <ol>
              {g.items.map(({ v, older }) => (
                <li key={v.id} className={cx('vp-item', v.named && 'is-named', v.signature === current && 'is-current')}>
                  {renaming === v.id ? (
                    <form
                      className="vp-rename"
                      onSubmit={(e) => {
                        e.preventDefault()
                        rename(v, new FormData(e.currentTarget).get('name') as string)
                      }}
                    >
                      <input
                        className="input"
                        name="name"
                        autoFocus
                        defaultValue={v.named ? v.name : ''}
                        placeholder="예: 본부장 보고본"
                        aria-label="버전 이름"
                        onBlur={(e) => rename(v, e.target.value)}
                        onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), setRenaming(null))}
                      />
                    </form>
                  ) : (
                    <button type="button" className="vp-open" onClick={() => openPreview(v)}>
                      <span className="vp-item-top">
                        <span className="vp-name">
                          {versionTitle(v)}
                          {!v.named && v.reason && <span className="vp-reason">{REASON_LABEL[v.reason]}</span>}
                        </span>
                        <span className="vp-time">{timeFmt.format(v.createdAt)}</span>
                      </span>
                      <span className="vp-changes">
                        {v.signature === current ? <span className="vp-same">지금 화면과 같아요</span> : changeText(v, older)}
                      </span>
                    </button>
                  )}
                  <Popover
                    className="vp-menu"
                    flip
                    button={({ toggle, open }) => (
                      <button type="button" className="icon-btn vp-more" aria-label={`${versionTitle(v)} 더 보기`} aria-expanded={open} onClick={toggle}>
                        <MoreIcon />
                      </button>
                    )}
                  >
                    {(close) => (
                      <div className="menu">
                        <button type="button" className="menu-item" disabled={v.signature === current} onClick={() => (close(), setRestoring(v))}>
                          이 버전으로 되돌리기
                        </button>
                        <button type="button" className="menu-item" onClick={() => (close(), openCopy(v))}>
                          새 발표로 꺼내기
                        </button>
                        <button type="button" className="menu-item" onClick={() => (close(), setRenaming(v.id))}>
                          {v.named ? '이름 바꾸기' : '이름 붙여 보관하기'}
                        </button>
                        <div className="menu-sep" role="separator" />
                        {/* 이름 붙여 보관한 버전은 되돌릴 수 없으니 한 번 묻는다. 자동 저장은 어차피 30개만 남아서 바로 지운다 */}
                        <button type="button" className="menu-item is-danger" onClick={() => (close(), v.named ? setRemoving(v) : remove(v))}>
                          이 버전 지우기
                        </button>
                      </div>
                    )}
                  </Popover>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>

      {preview && (
        <VersionPreview
          version={preview.version}
          deck={preview.deck}
          current={deck}
          isCurrent={preview.version.signature === current}
          onClose={() => setPreview(null)}
          onRestore={() => setRestoring(preview.version)}
        />
      )}

      {removing && (
        <Modal
          title="이 버전을 지울까요?"
          onClose={() => setRemoving(null)}
          actions={
            <>
              <button type="button" className="btn btn-ghost" data-autofocus onClick={() => setRemoving(null)}>
                취소
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  setRemoving(null)
                  void remove(removing)
                }}
              >
                지우기
              </button>
            </>
          }
        >
          <p>
            이름 붙여 보관한 ‘{removing.name}’ 버전을 버전 기록에서 지워요. 지우면 되돌릴 수 없어요.
            {folder?.kind === 'ready' && ` ‘${folder.name}/버전 기록’ 폴더에 남긴 파일은 그대로 있어요.`}
          </p>
        </Modal>
      )}

      {restoring && (
        <Modal
          title="이 버전으로 되돌릴까요?"
          onClose={() => setRestoring(null)}
          actions={
            <>
              <button type="button" className="btn btn-ghost" data-autofocus onClick={() => setRestoring(null)}>
                취소
              </button>
              <button type="button" className="btn btn-primary" onClick={() => restore(restoring)}>
                되돌리기
              </button>
            </>
          }
        >
          <p>
            {fullFmt.format(restoring.createdAt)}에 남긴 ‘{versionTitle(restoring)}’{particle(versionTitle(restoring), '으로', '로')} 되돌려요. 지금 상태는 버전 기록에 남겨 두니 언제든 다시 돌아올 수 있어요.
          </p>
        </Modal>
      )}
    </aside>
  )
}

function VersionPreview({
  version,
  deck,
  current,
  isCurrent,
  onClose,
  onRestore,
}: {
  version: DeckVersion
  deck: Deck
  current: Deck
  isCurrent: boolean
  onClose: () => void
  onRestore: () => void
}) {
  const info = pageInfo(deck.slides, deck)
  const now = new Map(current.slides.map((s) => [s.id, JSON.stringify(s)]))
  const diff = (s: Deck['slides'][number]) => (!now.has(s.id) ? '지금은 없는 슬라이드' : now.get(s.id) !== JSON.stringify(s) ? '지금과 달라요' : null)
  const visible = deck.slides.filter((s) => !s.hidden)
  const differs = visible.filter((s) => diff(s)).length
  const ref = useRef<HTMLDivElement>(null)
  useDialog(ref, onClose)
  return (
    <div className="vpp" role="dialog" aria-modal="true" aria-label="버전 미리 보기" ref={ref} tabIndex={-1}>
      <header className="vpp-head">
        <div>
          <p className="vpp-title">{versionTitle(version)}</p>
          <p className="vpp-sub">
            {fullFmt.format(version.createdAt)}에 남김, 슬라이드 {version.slideCount}장
            {isCurrent ? ', 지금 화면과 같아요' : differs > 0 ? `, 지금과 다른 슬라이드 ${differs}개` : ''}
          </p>
        </div>
        <div className="vpp-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            닫기
          </button>
          <button type="button" className="btn btn-primary" disabled={isCurrent} onClick={onRestore}>
            이 버전으로 되돌리기
          </button>
        </div>
      </header>
      <div className="vpp-body">
        {visible.map((s, i) => {
          const note = diff(s)
          return (
            <figure key={s.id} className={cx('vpp-item', note && 'is-diff')}>
              <ScaledSlide width={640} className="vpp-slide">
                <SlideCanvas deck={deck} slide={s} mode="final" {...pageProps(info, s.id)} />
              </ScaledSlide>
              <figcaption className="vpp-cap">
                <span>{i + 1}</span>
                {slideName(s)}
                {note && <em>{note}</em>}
              </figcaption>
            </figure>
          )
        })}
      </div>
    </div>
  )
}

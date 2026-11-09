import { useEffect, useRef, useState, type ReactNode } from 'react'
import { particle } from '../lib/josa'
import { APP_VERSION } from '../lib/version'
import { setUpdateCheck, updateCheckOn } from '../store/settings'
import { checkUpdate, checkUpdateNow, loadUpdate, restartApp, revealDownload, startDownload, updateStatus } from '../update/client'
import type { DownloadError, InstallError, UpdateStatus } from '../update/protocol'
import { Info, Modal, Popover, Toggle, type Toast } from './ui'

/** 바뀐 점을 보는 주소. 서버가 확인한 것이지만, 화면도 이 저장소의 릴리스 페이지가 아니면 열지 않는다 */
// 저장소 이름을 framo로 바꿀 때를 위해 두 이름을 받는다(server/update.ts의 REPOS)
const RELEASE_PAGE = /^https:\/\/github\.com\/wlsdks\/(gyeol|framo)\/releases\/tag\/v\d+\.\d+\.\d+$/

const DOWNLOAD_HELP: Record<DownloadError, string> = {
  network: '인터넷 연결이 끊겼거나 회사 네트워크가 막았어요. 연결을 확인하고 다시 받아 보세요.',
  verify: 'GitHub이 알려 준 파일과 달라서 받은 것을 지웠어요. 다시 받아 보세요.',
  write: 'Framo 폴더에 파일을 쓰지 못했어요. 바탕 화면이나 문서 폴더에 푼 Framo에서 다시 받아 보세요.',
  start: '받아 둔 새 버전이 켜지지 않아서 지금 버전으로 켰어요. 회사 백신 같은 프로그램이 막았을 수 있어요. 받기를 누르면 zip 파일을 받아 폴더를 열어 드려요. 직접 풀어서 쓸 수 있어요.',
}

/** 받기는 했지만 저절로 바꾸지 못한 까닭. 사람이 zip을 직접 푸는 안내 앞에 붙인다 */
const MANUAL_WHY: Record<InstallError, string> = {
  verify: '받은 파일이 GitHub이 알려 준 것과 달라서 자동으로 바꾸지 않았어요.',
  layout: '받은 파일이 예상한 모습과 달라서 자동으로 바꾸지 않았어요.',
  space: '디스크 공간이 모자라서 새 버전을 풀지 못했어요. 공간을 비운 뒤에 풀어 주세요.',
  write: '이 Framo 폴더에는 새 버전을 풀 수 없어요(쓰기가 막힌 폴더예요).',
  blocked: '회사 백신 같은 프로그램이 새 버전 파일을 막아서 풀지 못했어요.',
  start: '받아 둔 새 버전이 켜지지 않아서 자동으로 바꾸지 않았어요.',
}

/** 새 서버가 뜰 때까지 기다리는 시간. 보통 몇 초, 백신이 새 파일을 들여다보는 PC는 더 걸린다 */
const RESTART_WAIT_MS = 90_000

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** 다시 시작하며 바꿀 버전. 다시 연 화면이 바뀐 것을 한 번 알린다(이 탭에서만, 못 쓰는 브라우저면 알리지 않고 넘어간다) */
const UPDATED_KEY = 'html-maker-updated-to'

type Restart = 'idle' | 'running' | 'failed'

/** 홈의 버전 표시와 새 버전 알림이 같이 쓰는 상태. 화면은 로컬 서버에만 묻는다. GitHub에 묻고 받는 것은 서버가 한다 */
export function useUpdate(toast: Toast) {
  const [on, setOn] = useState<boolean | null>(null)
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  const [doneOpen, setDoneOpen] = useState(false)
  const [restart, setRestart] = useState<Restart>('idle')
  const poll = useRef(0)

  useEffect(() => {
    let live = true
    updateCheckOn().then(async (v) => {
      if (!live) return
      setOn(v)
      const s = await loadUpdate(v)
      if (!live) return
      setStatus(s)
      try {
        const to = sessionStorage.getItem(UPDATED_KEY)
        sessionStorage.removeItem(UPDATED_KEY)
        // 새 버전이 켜지지 않아 앞 버전으로 돌아왔으면 알리지 않는다(알림 자리가 까닭을 보인다)
        if (to && s?.current === to) toast.show(`${to} 버전으로 바꿨어요. 만든 발표는 그대로 있어요.`, undefined, 6000)
      } catch {
        // 알림만 건너뛴다
      }
    })
    return () => {
      live = false
      clearTimeout(poll.current)
    }
  }, [])

  // 받고 푸는 동안 진행을 따라간다. 사람이 풀어야 하게 끝나면 안내 창을 띄운다
  const busy = status?.download.state === 'downloading' || status?.download.state === 'preparing'
  useEffect(() => {
    if (!busy) return
    poll.current = window.setTimeout(async () => {
      const next = await updateStatus()
      if (!next) return
      setStatus(next)
      if (next.download.state === 'done') setDoneOpen(true)
    }, 400)
    return () => clearTimeout(poll.current)
  }, [status, busy])

  const toggle = async (v: boolean) => {
    setOn(v)
    await setUpdateCheck(v)
    if (v) setStatus(await checkUpdate())
  }

  const recheck = async () => {
    setStatus((s) => (s ? { ...s, check: { state: 'checking' } } : s))
    setStatus(await checkUpdateNow())
  }

  const download = async () => {
    const s = await startDownload()
    if (s) setStatus(s)
  }

  /**
   * 새 버전으로 다시 켠다. 발표는 이 브라우저에 저장되어 있어 서버가 바뀌어도 그대로다.
   * 서버가 끝나고 시작 프로그램이 새 버전을 띄우면(켤 때마다 바뀌는 boot로 알아본다) 새 화면을 받으려고 다시 연다
   */
  const restartNow = async () => {
    const before = status?.boot
    const to = status?.download.state === 'ready' ? status.download.version : null
    setRestart('running')
    if (!(await restartApp())) return setRestart('failed')
    const deadline = Date.now() + RESTART_WAIT_MS
    while (Date.now() < deadline) {
      await sleep(700)
      const s = await updateStatus()
      if (s && s.boot !== before) {
        try {
          if (to) sessionStorage.setItem(UPDATED_KEY, to)
        } catch {
          // 알림만 건너뛴다
        }
        return location.reload()
      }
    }
    setRestart('failed')
  }

  return { on, status, toggle, recheck, download, restart, restartNow, doneOpen, closeDone: () => setDoneOpen(false) }
}

type Update = ReturnType<typeof useUpdate>

/** 이름 옆의 버전. 누르면 알림을 켜고 끄고, 다시 확인할 수 있다 */
export function UpdateVersion({ u }: { u: Update }) {
  const { on, status } = u
  const check = status?.check
  const dl = status?.download
  return (
    <Popover
      align="left"
      button={({ toggle: open, open: isOpen }) => (
        <button type="button" className="home-ver" aria-expanded={isOpen} onClick={open}>
          {APP_VERSION} 버전
        </button>
      )}
    >
      {() => (
        <div className="update-pop">
          <p className="update-pop-state">{stateLine(on, status)}</p>
          <div className="update-pop-row">
            <Toggle label="새 버전 알림" on={!!on} onChange={u.toggle} />
            <Info label="새 버전 알림이 보내는 것" align="start">
              켜 두면 처음 화면을 열 때(하루에 한 번까지) GitHub의 Framo 저장소(github.com/wlsdks/gyeol)에 가장 최근 버전이 무엇인지만 물어요. 함께 가는 것은 지금 쓰는 Framo
              버전뿐이고, 발표 내용, 파일 이름, 이 PC의 정보는 보내지 않아요. ‘업데이트’를 누르면 그 버전의 zip 파일을 같은 곳에서 받아, 파일이 맞는지 확인한 뒤 Framo
              폴더 안에 풀어 둬요.
            </Info>
          </div>
          {on && status && (
            // 받는 동안에는 다시 확인하지 않는다(서버도 묻지 않는다). 누르면 알림이 잠깐 사라졌다 돌아온다
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={check?.state === 'checking' || dl?.state === 'downloading' || dl?.state === 'preparing'}
              onClick={u.recheck}
            >
              다시 확인
            </button>
          )}
        </div>
      )}
    </Popover>
  )
}

const percent = (done: number, total: number) => (total ? Math.floor((done / total) * 100) : 0)

/**
 * 머리말 오른쪽의 새 버전 알림: 나왔다 → 업데이트(받기와 풀기는 뒤에서, 쓰는 동안) → 다시 시작하면 바뀐다.
 * 홈에만 둔다(발표하는 화면에는 띄우지 않는다). 다시 시작하지 않으면 다음에 켤 때 새 버전으로 켜진다
 */
export function UpdateNotice({ u }: { u: Update }) {
  const { on, status, restart } = u
  if (!status) return null
  const check = status.check
  const dl = status.download
  const available = check.state === 'available' ? check : null
  const page = on && available && RELEASE_PAGE.test(available.page) ? available.page : null
  const canGet = !!available?.download
  const changes = page && (
    <a className="btn-link" href={page} target="_blank" rel="noopener noreferrer">
      바뀐 점 보기
    </a>
  )

  let body: ReactNode = null
  if (restart === 'running') body = <span className="home-update-t">새 버전으로 다시 켜는 중이에요</span>
  else if (dl.state === 'ready')
    body = (
      <>
        <span className="home-update-t">다시 시작하면 {dl.version} 버전이 돼요</span>
        <button type="button" className="btn-link home-update-go" onClick={u.restartNow}>
          지금 다시 시작
        </button>
        <Info label="다시 시작" align="end">
          {restart === 'failed'
            ? '다시 켜지 못했어요. Framo 창(검은 창)을 닫고 Framo를 다시 실행하면 새 버전으로 켜져요.'
            : '만든 발표는 이 브라우저에 그대로 있어요. 잠깐 끊겼다가 이 창이 새 버전으로 다시 열려요. 지금 하지 않으면 다음에 Framo를 켤 때 새 버전으로 켜져요.'}
        </Info>
      </>
    )
  else if (dl.state === 'downloading')
    body = (
      <>
        <span className="home-update-t">새 버전 받는 중</span>
        <span className="home-update-progress">{percent(dl.received, dl.total)}%</span>
      </>
    )
  else if (dl.state === 'preparing')
    body = (
      <>
        <span className="home-update-t">새 버전 준비하는 중</span>
        <span className="home-update-progress">{percent(dl.done, dl.total)}%</span>
      </>
    )
  else if (dl.state === 'done')
    body = (
      <>
        <span className="home-update-t">새 버전을 받았어요</span>
        <button type="button" className="btn-link" onClick={() => revealDownload()}>
          받은 폴더 열기
        </button>
      </>
    )
  else if (dl.state === 'failed' && dl.reason === 'start')
    body = (
      <>
        <span className="home-update-t">새 버전을 켜지 못했어요</span>
        {canGet && (
          <button type="button" className="btn-link" onClick={u.download}>
            받기
          </button>
        )}
        <Info label="켜지 못한 이유" align="end">
          {DOWNLOAD_HELP.start}
        </Info>
      </>
    )
  else if (on && available)
    body = (
      <>
        <span className="home-update-t">새 버전 {available.version}{particle(available.version, '이', '가')} 나왔어요</span>
        {canGet && (
          <button type="button" className="btn-link home-update-go" onClick={u.download}>
            {dl.state === 'failed' ? '다시 받기' : status.auto ? '업데이트' : '받기'}
          </button>
        )}
        {canGet && dl.state === 'failed' && (
          <Info label="받지 못한 이유" align="end">
            {DOWNLOAD_HELP[dl.reason]}
          </Info>
        )}
        {changes}
      </>
    )
  if (!body) return null

  return (
    <>
      <p className="home-update" role="status">
        {body}
      </p>
      {u.doneOpen && (
        <Modal
          title="새 버전을 받았어요"
          onClose={u.closeDone}
          actions={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => revealDownload()}>
                폴더 다시 열기
              </button>
              <button type="button" className="btn btn-primary" data-autofocus onClick={u.closeDone}>
                확인
              </button>
            </>
          }
        >
          {dl.state === 'done' && dl.why && <p>{MANUAL_WHY[dl.why]}</p>}
          <p>
            새 버전 폴더를 열었어요. 지금 Framo를 닫고, 받은 zip 파일을 바탕 화면 같은 곳에 풀어 새 폴더의 Framo.exe(맥은 ‘Framo 시작’)를 실행하세요. 만든 발표는 그대로 있어요.
          </p>
        </Modal>
      )}
    </>
  )
}

function stateLine(on: boolean | null, status: UpdateStatus | null): string {
  if (status?.download.state === 'ready') return `다시 시작하면 ${status.download.version} 버전이 돼요`
  if (on === false) return '새 버전 알림이 꺼져 있어요'
  if (!status) return '이렇게 열면 새 버전을 확인할 수 없어요'
  switch (status.check.state) {
    case 'checking':
      return '확인하는 중이에요'
    case 'latest':
      return '최신 버전이에요'
    case 'available':
      return `새 버전 ${status.check.version}${particle(status.check.version, '이', '가')} 나왔어요`
    case 'failed':
      return '확인하지 못했어요'
    default:
      return '아직 확인하지 않았어요'
  }
}

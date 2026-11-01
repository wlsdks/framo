import { useEffect, useRef, useState } from 'react'
import { particle } from '../lib/josa'
import { APP_VERSION } from '../lib/version'
import { setUpdateCheck, updateCheckOn } from '../store/settings'
import { checkUpdate, checkUpdateNow, loadUpdate, revealDownload, startDownload, updateStatus } from '../update/client'
import type { DownloadError, UpdateStatus } from '../update/protocol'
import { Info, Modal, Popover, Toggle } from './ui'

/** 바뀐 점을 보는 주소. 서버가 확인한 것이지만, 화면도 이 저장소의 릴리스 페이지가 아니면 열지 않는다 */
const RELEASE_PAGE = /^https:\/\/github\.com\/wlsdks\/gyeol\/releases\/tag\/v\d+\.\d+\.\d+$/

const DOWNLOAD_HELP: Record<DownloadError, string> = {
  network: '인터넷 연결이 끊겼거나 회사 네트워크가 막았어요. 연결을 확인하고 다시 받아 보세요.',
  verify: 'GitHub이 알려 준 파일과 달라서 받은 것을 지웠어요. 다시 받아 보세요.',
  write: 'Framo 폴더에 파일을 쓰지 못했어요. 바탕 화면이나 문서 폴더에 푼 Framo에서 다시 받아 보세요.',
}

/**
 * 홈의 버전 표시와 새 버전 알림. 버전을 누르면 알림을 켜고 끄고, 다시 확인할 수 있다.
 * 화면은 로컬 서버에만 묻는다. GitHub에 묻고 받는 것은 서버가 한다.
 */
export function UpdateNote() {
  const [on, setOn] = useState<boolean | null>(null)
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  const [doneOpen, setDoneOpen] = useState(false)
  const poll = useRef(0)

  useEffect(() => {
    let live = true
    updateCheckOn().then(async (v) => {
      if (!live) return
      setOn(v)
      const s = await loadUpdate(v)
      if (live) setStatus(s)
    })
    return () => {
      live = false
      clearTimeout(poll.current)
    }
  }, [])

  // 받는 동안 진행을 따라간다. 다 받으면 안내 창을 띄운다
  useEffect(() => {
    if (status?.download.state !== 'downloading') return
    poll.current = window.setTimeout(async () => {
      const next = await updateStatus()
      if (!next) return
      setStatus(next)
      if (next.download.state === 'done') setDoneOpen(true)
    }, 400)
    return () => clearTimeout(poll.current)
  }, [status])

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

  const check = status?.check
  const available = on && check?.state === 'available' ? check : null
  const page = available && RELEASE_PAGE.test(available.page) ? available.page : null
  const dl = status?.download

  return (
    <>
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
              <Toggle label="새 버전 알림" on={!!on} onChange={toggle} />
              <Info label="새 버전 알림이 보내는 것" align="start">
                켜 두면 처음 화면을 열 때(하루에 한 번까지) GitHub의 Framo 저장소(github.com/wlsdks/gyeol)에 가장 최근 버전이 무엇인지만 물어요. 함께 가는 것은 지금 쓰는 Framo
                버전뿐이고, 발표 내용, 파일 이름, 이 PC의 정보는 보내지 않아요. ‘받기’를 누르면 그 버전의 zip 파일을 같은 곳에서 받아요.
              </Info>
            </div>
            {on && status && (
              // 받는 동안에는 다시 확인하지 않는다(서버도 묻지 않는다). 누르면 알림이 잠깐 사라졌다 돌아온다
              <button type="button" className="btn btn-ghost btn-sm" disabled={check?.state === 'checking' || dl?.state === 'downloading'} onClick={recheck}>
                다시 확인
              </button>
            )}
          </div>
        )}
      </Popover>

      {available && (
        <p className="home-update" role="status">
          <span className="home-update-t">새 버전 {available.version}{particle(available.version, '이', '가')} 나왔어요</span>
          {available.download && dl?.state === 'downloading' && (
            <span className="home-update-progress">받는 중 {dl.total ? Math.floor((dl.received / dl.total) * 100) : 0}%</span>
          )}
          {available.download && dl?.state === 'done' && (
            <button type="button" className="btn-link" onClick={() => revealDownload()}>
              받은 폴더 열기
            </button>
          )}
          {available.download && (dl?.state === 'idle' || dl?.state === 'failed') && (
            <button type="button" className="btn-link" onClick={download}>
              {dl.state === 'failed' ? '다시 받기' : '받기'}
            </button>
          )}
          {available.download && dl?.state === 'failed' && (
            <Info label="받지 못한 이유" align="start">
              {DOWNLOAD_HELP[dl.reason]}
            </Info>
          )}
          {page && (
            <a className="btn-link" href={page} target="_blank" rel="noopener noreferrer">
              바뀐 점 보기
            </a>
          )}
        </p>
      )}

      {doneOpen && (
        <Modal
          title="새 버전을 받았어요"
          onClose={() => setDoneOpen(false)}
          actions={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => revealDownload()}>
                폴더 다시 열기
              </button>
              <button type="button" className="btn btn-primary" data-autofocus onClick={() => setDoneOpen(false)}>
                확인
              </button>
            </>
          }
        >
          <p>
            새 버전 폴더를 열었어요. 지금 Framo를 닫고, 받은 zip 파일을 바탕 화면 같은 곳에 풀어 새 폴더의 Framo.exe(맥은 ‘Framo 시작’)를 실행하세요. 만든 발표는 그대로 있어요.
          </p>
        </Modal>
      )}
    </>
  )
}

function stateLine(on: boolean | null, status: UpdateStatus | null): string {
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

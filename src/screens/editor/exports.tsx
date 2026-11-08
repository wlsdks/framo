import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { pageInfo } from '../../deck/fields'
import type { Deck } from '../../deck/types'
import { downloadHtml } from '../../export/exportHtml'
import { downloadPptx } from '../../export/exportPptx'
import { exposePptDebug, loadSlideFonts } from '../../export/rasterize'
import { fitBlocks } from '../../slides/fitBlocks'
import { pageProps, SlideCanvas } from '../../slides/SlideCanvas'
import { downloadDeckFile } from '../../store/deckFile'
import { useDeck } from '../../store/deckStore'
import type { VersionReason } from '../../store/versions'
import type { Toast } from '../ui'
import { presentCheck, type PresentCheck } from './presentLaunch'

type ExportKind = 'html' | 'pdf' | 'ppt'

/**
 * 내보내기 메뉴(HTML, PDF, PPT, 작업 파일)의 할 일. 내보내기 전에는 버전을 남긴다.
 * 발표 파일(HTML, PDF, PPT)은 빈칸이나 넘친 글이 남았으면 발표하기처럼 먼저 묻는다(CheckDialog). 예전에는 바로 내보내서
 * 빈칸이 많은 발표가 거의 빈 슬라이드로 파일에 담겼다. 작업 파일은 이어서 고칠 원본이라 묻지 않는다
 */
export function useExports(deck: Deck, markVersion: (reason: VersionReason) => void, toast: Toast) {
  const [printing, setPrinting] = useState(false)
  const [confirm, setConfirm] = useState<{ kind: ExportKind; check: PresentCheck } | null>(null)

  /** 빈칸이 남았으면 묻고 멈춘다. 물었으면 true */
  const asked = (kind: ExportKind, force: boolean) => {
    setConfirm(null)
    if (force) return false
    const check = presentCheck(deck)
    if (!check.rows.length) return false
    setConfirm({ kind, check })
    return true
  }

  const printPdf = useCallback(
    (force = false) => {
      if (asked('pdf', force)) return
      markVersion('export')
      setPrinting(true)
    },
    // asked는 deck만 쓴다
    [markVersion, deck],
  )

  const exportHtml = async (force = false) => {
    if (asked('html', force)) return
    markVersion('export')
    toast.show('발표 파일을 만들고 있어요')
    try {
      await downloadHtml(deck)
      toast.show('발표 파일을 저장했어요. 다운로드 폴더를 확인해 주세요.')
    } catch {
      toast.show('발표 파일을 만들지 못했어요. 다시 시도해 주세요.')
    }
  }

  // PPT는 장마다 그림을 그려서 장이 많으면 오래 걸린다. 지금 몇 장째인지 보이고, 두 번 눌러도 한 번만 만든다
  const pptBusy = useRef(false)
  const exportPpt = async (force = false) => {
    if (pptBusy.current) {
      toast.show('PPT를 만들고 있어요. 다 되면 알려 드릴게요.')
      return
    }
    const total = deck.slides.filter((s) => !s.hidden).length
    if (!total) {
      toast.show('모든 슬라이드를 숨겨서 PPT에 넣을 슬라이드가 없어요. 슬라이드 하나 이상의 숨기기를 풀어 주세요.')
      return
    }
    if (asked('ppt', force)) return
    pptBusy.current = true
    markVersion('export')
    try {
      await downloadPptx(deck, (done, all) => toast.show(`PPT를 만드는 중이에요 (${done}/${all})`, undefined, 60000))
      toast.show('PPT 파일을 저장했어요. 다운로드 폴더를 확인해 주세요.')
    } catch {
      toast.show('PPT 파일을 만들지 못했어요. 다시 시도해 주세요.')
    } finally {
      pptBusy.current = false
    }
  }
  // 콘솔에서 PPT의 장 그림만 볼 수 있게 (그림 점검용. rasterize.tsx의 exposePptDebug).
  // 개발 서버에서만: 배포본의 window에 점검 함수를 걸어 두지 않고, 빌드에서는 함수째 빠진다
  useEffect(() => {
    if (import.meta.env.DEV) return exposePptDebug(() => useDeck.getState().deck)
  }, [])

  const saveDeckFile = () => {
    downloadDeckFile(deck)
    toast.show('작업 파일을 저장했어요. 다운로드 폴더를 확인해 주세요.')
  }

  const proceed = () => {
    if (!confirm) return
    if (confirm.kind === 'html') void exportHtml(true)
    else if (confirm.kind === 'pdf') printPdf(true)
    else void exportPpt(true)
  }

  return {
    exportHtml,
    exportPpt,
    printPdf,
    saveDeckFile,
    /** 빈칸이 남아 그대로 내보낼지 묻는 중 */
    confirm: confirm?.check ?? null,
    proceed,
    closeConfirm: () => setConfirm(null),
    /** PDF로 내보내는 동안 인쇄할 장들 (body에 붙는다) */
    print: printing ? <PrintDeck deck={deck} onDone={() => setPrinting(false)} /> : null,
  }
}

function PrintDeck({ deck, onDone }: { deck: Deck; onDone: () => void }) {
  const info = pageInfo(deck.slides, deck)
  const doneRef = useRef(onDone)
  doneRef.current = onDone
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    let done = false
    const finish = () => {
      if (done) return
      done = true
      doneRef.current()
    }
    window.addEventListener('afterprint', finish)
    const run = async () => {
      const root = rootRef.current
      if (!root) return
      await loadSlideFonts(root, deck)
      await Promise.all([...root.querySelectorAll('img')].map((img) => img.decode().catch(() => {})))
      if (cancelled) return
      // 글꼴이 온 뒤의 크기로 맞춘 다음 인쇄한다. 장의 효과도 맞추지만 언제 끝났는지 알 수 없고, 인쇄하는 동안에는 다시 맞추지 않는다
      // (rasterize.tsx의 shoot와 같다)
      await new Promise((r) => window.setTimeout(r))
      fitBlocks(root)
      window.print()
      // 일부 브라우저는 afterprint를 보내지 않는다
      window.setTimeout(finish, 1000)
    }
    run()
    return () => {
      cancelled = true
      window.removeEventListener('afterprint', finish)
    }
  }, [])

  return createPortal(
    // 화면 밖에 실제 크기로 그린다(print.css). inert가 화면 읽기 프로그램과 키보드에서 뺀다
    <div ref={rootRef} className="print-root" inert>
      {deck.slides
        .filter((s) => !s.hidden)
        .map((s) => (
          <div key={s.id} className="print-page">
            <SlideCanvas deck={deck} slide={s} mode="final" {...pageProps(info, s.id)} />
          </div>
        ))}
    </div>,
    document.body,
  )
}

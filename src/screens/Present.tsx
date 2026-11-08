import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { pageInfo } from '../deck/fields'
import type { Deck } from '../deck/types'
import { cx } from '../lib/cx'
import { presentAction, presentKey, slideNumber } from '../lib/presentKeys'
import { motionOf, transitionOf } from '../deck/themes'
import { motionEngine, type MotionPlay } from '../motion/engine'
import { presentChannel, type Blank, type PresentMessage } from '../present/link'
import { canRecord, motionSettled, saveBlob, startRecording, type Recording } from '../present/record'
import { safeFileName } from '../store/deckFile'
import { FitSlide, pageProps, SlideCanvas } from '../slides/SlideCanvas'
import { Modal } from './ui'

/** 발표를 시작할 장. 발표에서 뺀 장을 골랐으면 그 뒤의 첫 장부터 (뒤에 없으면 바로 앞 장) */
export function startIndex(deck: Deck, shown: Deck['slides'], startId?: string): number {
  const at = startId ? deck.slides.findIndex((s) => s.id === startId) : -1
  if (at < 0) return 0
  const from = deck.slides.slice(at).find((s) => !s.hidden) ?? deck.slides.slice(0, at).reverse().find((s) => !s.hidden)
  return Math.max(0, shown.findIndex((s) => s.id === from?.id))
}

/**
 * 발표를 끝내면 편집기가 고를 장: 마지막으로 보던 장. 시작한 장으로 돌아가면 발표하다 고칠 곳을 본 장(열 번째 장)을 다시 찾아
 * 넘겨야 했다. PowerPoint, 구글 슬라이드도 끝낸 장을 고른다. shown은 발표하는 장들(뺀 장 빼고), index는 보던 장의 차례
 */
export function endSlideId(shown: Deck['slides'], index: number): string | undefined {
  if (!shown.length) return undefined
  return shown[Math.min(Math.max(index, 0), shown.length - 1)].id
}

/** 장 밖에 남는 검은 여백 가운데 발표 막대(쪽 번호, 발표 끝내기)를 둘 곳. 막대 너비와 높이에 여유를 더한 값 */
const SIDE_ROOM = 104
const TOP_ROOM = 44
export type BarRoom = 'side' | 'top' | 'over'

/**
 * 발표 막대를 어디에 둘지. 창이 장보다 넓으면 오른쪽 여백에 세로로, 높으면 위 여백에 둔다.
 * 둘 다 모자라면(16:9 전체 화면) 장 위에 겹치므로 마우스를 움직일 때만 잠깐 보인다.
 * 1280×600 창에서 장 오른쪽 위에 늘 겹쳐 그려져 장 제목과 쪽 번호를 가렸다
 */
export function barRoom(w: number, h: number): BarRoom {
  const side = (w - (h * 16) / 9) / 2
  const top = (h - (w * 9) / 16) / 2
  return side >= SIDE_ROOM ? 'side' : top >= TOP_ROOM ? 'top' : 'over'
}

/**
 * 전체 화면 발표. 클리커가 보내는 PageUp/PageDown도 받는다.
 * 발표자 화면(Presenter)이 열려 있으면 같이 움직인다. 어느 창에서 넘겨도 된다.
 */
/** 녹화가 어떻게 끝났는지: 파일로 저장함, 담긴 장면이 없음, 시작하지 못함(화면 고르기를 거절했거나 막혔다) */
export type RecordResult = 'saved' | 'empty' | 'failed'

/** 장 하나를 녹화하는 데 드는 어림 시간(초). 예시 발표 17장이 모션과 '누르면' 단계까지 1분 남짓 걸렸다 */
const SECONDS_PER_SLIDE = 3.5

/** 녹화에 걸리는 시간을 말로: 40초, 1분, 3분 */
export function recordTime(slides: number): string {
  const s = slides * SECONDS_PER_SLIDE
  return s < 55 ? `${Math.max(10, Math.round(s / 10) * 10)}초` : `${Math.max(1, Math.round(s / 60))}분`
}

/**
 * 요소 녹화(RestrictionTarget, 크롬·엣지 132+)가 되는지. 되면 슬라이드 상자와 그 안만 담기므로 상자 밖의 '녹화 중' 표시는
 * 장 위에 겹쳐도 영상에 들어가지 않는다. 안 되면(잘라 내기나 탭 전체로 녹화) 표시가 영상에 담기므로 띄우지 않는다:
 * 그때는 브라우저가 띄우는 '이 탭을 공유 중' 막대가 녹화 중임을 알린다
 */
const elementCapture = typeof window !== 'undefined' && 'RestrictionTarget' in window

export function Present({
  deck,
  startId,
  entering,
  onExit,
  record: recordOnStart,
  onRecorded,
}: {
  deck: Deck
  startId?: string
  entering?: Promise<unknown>
  onExit: (lastId?: string) => void
  /** 열자마자 영상으로 저장할지 묻는다 (편집기 내보내기의 '영상'). 묻는 창에서 취소하면 발표를 닫는다 */
  record?: boolean
  /** 녹화가 끝나 발표를 닫을 때 (편집기가 결과를 알린다) */
  onRecorded?: (result: Exclude<RecordResult, 'failed'>) => void
}) {
  const slides = useMemo(() => deck.slides.filter((s) => !s.hidden), [deck.slides])
  // 장마다 넘기는 쪽 번호와 단락. 그릴 때마다 새로 만들면 단락 목록이 새 배열이라, 마우스를 움직이거나 멈출 때마다(아래 표시를
  // 보이고 숨긴다) 지금 장을 통째로 다시 그렸다
  const info = useMemo(() => pageInfo(deck.slides), [deck.slides])
  const engine = useMemo(() => motionEngine(), [])
  // play: 이 장을 움직일지 (앞으로 넘겨 온 장). 움직임이 없는 장도 엔진에 맡긴다: '누르면' 나오는 컴포넌트는 누를 때까지 감춘다
  const [view, setView] = useState(() => ({ index: startIndex(deck, slides, startId), play: true }))
  /** 지금 장의 움직임. 누르면 나오는 컴포넌트가 남았으면 다음 키에 그것부터 보인다 */
  const playing = useRef<MotionPlay | null>(null)
  const [idle, setIdle] = useState(true)
  const [room, setRoom] = useState<BarRoom>(() => barRoom(window.innerWidth, window.innerHeight))
  const [blank, setBlankState] = useState<Blank>(null)
  const idleTimer = useRef(0)
  const stageRef = useRef<HTMLDivElement | null>(null)
  // FitSlide는 크기를 잰 다음에야 슬라이드를 그린다. 첫 장도 움직이도록 붙는 때를 알아 둔다.
  const [ready, setReady] = useState(false)
  const attachStage = useCallback((el: HTMLDivElement | null) => {
    stageRef.current = el
    if (el) setReady(true)
  }, [])
  /**
   * 미리 그려 둔 다음 장. 넘길 때 새 장을 처음 그리고 컴포넌트를 맞추는 일이 전환을 시작하기 전에 몰려 있어서(컴포넌트 장은
   * 느린 PC에서 0.1초 넘게), 키를 누르고 장이 넘어가기 시작할 때까지 앞 장이 그만큼 멈춰 있었다. 지금 장의 움직임이 끝나고
   * 한가할 때 다음 장을 보이지 않게 그려 두고, 넘기면 그것을 보이게만 한다 (React가 같은 key의 것을 그대로 옮긴다)
   */
  const [ahead, setAhead] = useState<string | null>(null)
  /**
   * 창이 전체 화면으로 다 커졌는지. 전체 화면은 누른 뒤 조금 지나서(윈도우는 몇 프레임, 맥은 창이 커지는 0.5초 남짓) 들어오는데,
   * 그 전에 첫 장을 움직이면 작은 창 크기로 제목이 올라오다가 전체 화면이 되는 순간 장이 한 번에 커졌다(창 크기가 바뀌는 것을
   * 흉내 내 녹화). 커질 때까지는 검은 화면으로 두고, 다 커진 다음 프레임에 첫 장을 들인다. 전체 화면이 거절되거나 늦으면 0.8초에서 그친다
   */
  const [settled, setSettled] = useState(!entering)
  useEffect(() => {
    if (!entering) return
    let on = true
    const limit = new Promise((r) => window.setTimeout(r, 800))
    void Promise.race([entering.catch(() => {}), limit]).then(() => requestAnimationFrame(() => on && setSettled(true)))
    return () => {
      on = false
    }
  }, [entering])
  /**
   * 영상으로 저장하는 중인지. 녹화는 첫 장부터 실제 발표처럼 움직임이 끝나기를 기다렸다 넘기며 화면을 그대로 담는다(present/record.ts).
   * 녹화하는 동안은 아래 막대와 커서를 감추고, Esc나 브라우저의 '공유 중지'로 멈추면 거기까지를 파일로 저장한다
   */
  const [recording, setRecording] = useState(false)
  // 녹화가 실제로 시작됐는지 (화면 고르기를 마친 뒤). 이때부터 '녹화 중' 표시를 띄운다
  const [recLive, setRecLive] = useState(false)
  const recStop = useRef<(() => void) | null>(null)
  // 화면 고르기 창이 떠 있는 동안, 녹화가 시작된 때. 그 창이나 공유 시작이 전체 화면을 풀어도 발표를 끝내지 않는다
  const recStarting = useRef(false)
  const recSince = useRef(0)
  /**
   * 녹화하기 전에 묻는 창. 브라우저의 공유 창이 아무 말 없이 먼저 뜨면 처음 쓰는 분은 무엇을 골라야 하는지, 영상이 어디로
   * 가는지 몰랐다. 이 창의 '녹화 시작'을 누르는 그 순간에 브라우저가 공유할 화면을 묻는다(누름 안에서 불러야 묻는다).
   * failed: 공유가 시작되지 않아 다시 묻는 중
   */
  const [recIntro, setRecIntro] = useState<{ failed?: boolean } | null>(null)
  const introOpen = useRef(false)
  introOpen.current = !!recIntro
  const startedAt = useRef(Date.now())
  const now = useRef({ index: view.index, blank })
  now.current = { index: view.index, blank }
  const link = useRef<ReturnType<typeof presentChannel> | null>(null)

  const goTo = useCallback(
    (next: number) => {
      const to = Math.max(0, Math.min(slides.length - 1, next))
      const from = now.current.index
      if (to === from) return
      const dir = to > from ? 1 : -1
      // 앞으로 넘길 때만 움직인다. 이전 장으로 돌아가면 다 보인 상태로 (PowerPoint와 같게).
      // 전환은 넘어가는 장에 정한 것 (앞으로 가든 뒤로 가든 그 두 장 사이의 전환이 같게, 뒤로 갈 때는 떠나는 장의 것)
      const transition = transitionOf(deck, slides[dir > 0 ? to : from])
      engine.swap(
        () => {
          flushSync(() => {
            setView({ index: to, play: dir > 0 })
            // 한 장 뒤로 가면 떠나는 장이 그대로 다음 장이 된다 (다시 넘길 때 새로 그리지 않게)
            setAhead(to + 1 === from ? slides[from].id : null)
          })
          // 새 장이 그려지고 움직임이 걸린 뒤에 알린다: 남은 차례 수는 그 장의 움직임이 정한다.
          // 발표자 화면에서 넘긴 것도 알린다. 발표자 화면은 이 수를 모른다
          link.current?.post({ type: 'state', index: to, blank: now.current.blank, left: playing.current?.left() ?? 0 })
        },
        transition,
        dir,
      )
    },
    [slides, deck, engine],
  )

  /** 다음으로: '누르면' 나오는 컴포넌트가 남았으면 그것을, 아니면 다음 장 */
  const forward = useCallback(() => {
    if (playing.current?.next()) {
      // 발표자 화면에서 눌렀어도 알린다: 남은 차례는 이 창만 안다
      link.current?.post({ type: 'state', index: now.current.index, blank: now.current.blank, left: playing.current.left() })
      return
    }
    goTo(now.current.index + 1)
  }, [goTo])

  const setBlank = useCallback((next: Blank, fromLink = false) => {
    setBlankState(next)
    if (!fromLink) link.current?.post({ type: 'state', index: now.current.index, blank: next, left: playing.current?.left() ?? 0 })
  }, [])

  const exit = useCallback(
    (fromLink = false) => {
      if (!fromLink) link.current?.post({ type: 'end' })
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
      onExit(endSlideId(slides, now.current.index))
    },
    [onExit, slides],
  )

  // 발표자 화면과 잇기
  const handlers = useRef<(m: PresentMessage) => void>(() => {})
  handlers.current = (m) => {
    if (m.type === 'hello') {
      link.current?.post({ type: 'deck', deck, index: now.current.index, blank: now.current.blank, startedAt: startedAt.current, left: playing.current?.left() ?? 0 })
    } else if (m.type === 'go') {
      // 발표자 화면에서 다음으로 넘기면 여기서처럼 '누르면' 나오는 컴포넌트부터
      if (m.index === now.current.index + 1) forward()
      else goTo(m.index)
    }
    else if (m.type === 'blank') setBlank(m.blank, true)
    else if (m.type === 'end') exit(true)
  }
  useEffect(() => {
    const l = presentChannel(deck.id, (m) => handlers.current(m))
    link.current = l
    return () => {
      link.current = null
      l.close()
    }
  }, [deck.id])

  useEffect(() => {
    // 번호를 치고 Enter면 그 장으로 (PowerPoint와 같게)
    const num = slideNumber()
    const onKey = (e: KeyboardEvent) => {
      // 발표를 시작한 F5(Shift+F5)를 발표 중에 또 누르면 브라우저가 페이지를 새로 고쳐 발표가 끊긴다
      if (e.key === 'F5') {
        e.preventDefault()
        return
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return
      // 녹화할지 묻는 창이 떠 있으면 키는 그 창의 것 (Esc는 창이 닫는다)
      if (introOpen.current) return
      // 녹화하는 동안 Esc는 녹화를 멈춘다. 다른 키는 듣지 않는다: 녹화가 장을 넘긴다
      if (recStop.current) {
        e.preventDefault()
        if (e.key === 'Escape') recStop.current()
        return
      }
      const { index, blank: b } = now.current
      const k = presentKey(e)
      if (num.push(k, e.timeStamp)) {
        e.preventDefault()
        return
      }
      const act = presentAction(k, b, index, slides.length - 1, num.take(e.timeStamp))
      if (!act) return
      e.preventDefault()
      if (act.kind === 'blank') setBlank(act.blank)
      else if (act.kind === 'go' && act.index === index + 1 && !act.jump) forward()
      else if (act.kind === 'go') goTo(act.index)
      else exit()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goTo, forward, exit, setBlank, slides.length])

  // 전체 화면을 Esc로 빠져나오면 발표도 끝낸다
  useEffect(() => {
    const onChange = () => {
      if (document.fullscreenElement) return
      // 화면 고르기 창이 뜨며, 또는 공유가 막 시작되며 전체 화면이 풀려도 녹화는 이어 간다
      if (recStarting.current) return
      if (recStop.current) {
        // 녹화하는 중에 전체 화면을 나왔으면 멈추고 거기까지 저장한다. 전체 화면에서 누른 Esc는 브라우저가 전체 화면을 푸는 데
        // 쓰고 화면에 보내지 않아서, 키로는 녹화를 멈출 수 없었다(녹화가 끝까지 이어지고 발표만 작은 창이 됐다)
        if (Date.now() - recSince.current > 1500) recStop.current()
        return
      }
      exit()
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [exit])

  const wake = () => {
    setIdle(false)
    window.clearTimeout(idleTimer.current)
    idleTimer.current = window.setTimeout(() => setIdle(true), 2200)
  }
  useEffect(() => {
    const onResize = () => {
      const next = barRoom(window.innerWidth, window.innerHeight)
      setRoom(next)
      // 전체 화면이 되어 여백이 없어지면 장 위에 떠 있던 막대를 바로 거둔다
      if (next === 'over') {
        window.clearTimeout(idleTimer.current)
        setIdle(true)
      }
    }
    window.addEventListener('resize', onResize)
    // 처음에는 막대가 장을 가리지 않는 자리에 있을 때만 잠깐 보인다 (끝내는 곳을 알 수 있게)
    if (barRoom(window.innerWidth, window.innerHeight) !== 'over') wake()
    return () => {
      window.removeEventListener('resize', onResize)
      window.clearTimeout(idleTimer.current)
    }
  }, [])

  // 장이 화면에 붙자마자(그리기 전에) 움직임을 건다. 그래야 다 보인 모습이 한 번 번쩍이지 않는다.
  const level = motionOf(deck, slides[view.index])
  useLayoutEffect(() => {
    if (!ready || !settled || !view.play || !stageRef.current) return
    const p = engine.play(stageRef.current, level)
    playing.current = p
    return () => {
      playing.current = null
      p()
    }
  }, [view, ready, settled, engine, level])

  // 다음 장은 지금 장의 움직임이 끝나고(mo-end) 한가할 때 그린다. 움직이는 중에 그리면 굴러가는 숫자가 끊긴다
  useEffect(() => {
    const next = slides[view.index + 1]
    const stage = stageRef.current
    if (!ready || !next || next.id === ahead) return
    let idle = 0
    const draw = () => {
      idle = requestIdleCallback(() => setAhead(next.id), { timeout: 3000 })
    }
    if (stage?.hasAttribute('data-mo-play')) stage.addEventListener('mo-end', draw, { once: true })
    else draw()
    return () => {
      stage?.removeEventListener('mo-end', draw)
      cancelIdleCallback(idle)
    }
  }, [view, slides, ahead, ready])

  const record = async (): Promise<RecordResult | null> => {
    const frame = stageRef.current?.closest<HTMLElement>('.slide-frame')
    if (!frame || recStop.current) return null
    flushSync(() => setRecording(true))
    // 여기까지 기다림 없이 와야 브라우저가 누름 안에서 공유할 화면을 묻는다 (startRecording이 바로 getDisplayMedia를 부른다)
    recStarting.current = true
    let rec: Recording
    try {
      rec = await startRecording(frame)
    } catch {
      recStarting.current = false
      setRecording(false)
      return 'failed'
    }
    recStarting.current = false
    recSince.current = Date.now()
    // 고르는 창이 전체 화면을 풀었으면 다시 들어가 본다(누른 지 얼마 안 됐으면 된다). 안 되면 이 창 크기로 녹화한다
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.().catch(() => {})
    setRecLive(true)
    let stopped = false
    recStop.current = () => {
      stopped = true
    }
    void rec.ended.then(() => {
      stopped = true
    })
    const wait = (ms: number) => new Promise((r) => window.setTimeout(r, ms))
    // 첫 장부터 움직이며 시작한다
    flushSync(() => {
      setAhead(null)
      setView({ index: 0, play: true })
    })
    await wait(400)
    while (!stopped) {
      await motionSettled(() => stageRef.current)
      if (stopped) break
      const left = playing.current?.left() ?? 0
      // 다 보인 모습을 잠깐 보여 준다: 단계 사이는 짧게, 장 끝은 읽을 만큼
      await wait(left > 0 ? 900 : 1800)
      if (stopped) break
      if (left <= 0 && now.current.index >= slides.length - 1) break
      forward()
      await wait(left > 0 ? 120 : 500)
    }
    recStop.current = null
    setRecLive(false)
    const blob = await rec.stop()
    setRecording(false)
    if (blob) saveBlob(blob, `${safeFileName(deck.title, '발표')}.${rec.ext}`)
    return blob ? 'saved' : 'empty'
  }

  /**
   * 묻는 창의 '녹화 시작'. 공유가 시작되지 않았으면(거절했거나 다른 것을 골라 막혔으면) 같은 창으로 다시 묻는다.
   * 다 되면(Esc로 멈춰도) 발표를 닫고 편집기로 돌아가 결과를 알린다: 영상만 만들려던 분이 발표 화면에 남아 무엇을 할지 몰랐다
   */
  const startRecord = async () => {
    setRecIntro(null)
    const result = await record()
    if (!result) return
    if (result === 'failed') {
      setRecIntro({ failed: true })
      return
    }
    onRecorded?.(result)
    exit()
  }
  /** 묻는 창을 닫으면: 내보내기에서 왔으면 편집기로, 발표하다 눌렀으면 발표를 이어 간다 */
  const cancelRecord = () => {
    setRecIntro(null)
    if (recordOnStart) exit()
  }

  // 내보내기에서 '영상'을 골랐으면 창이 다 커지고 첫 장이 그려진 뒤 녹화할지 묻는다
  const asked = useRef(false)
  useEffect(() => {
    if (!recordOnStart || !ready || !settled || asked.current) return
    asked.current = true
    setRecIntro({})
  }, [recordOnStart, ready, settled])

  const slide = slides[view.index]
  if (!slide) return null
  const after = slides[view.index + 1]
  const early = after && after.id === ahead ? after : null

  return (
    <div
      className={cx('present', idle && !recIntro && 'is-idle', !settled && 'is-entering', recording && 'is-recording')}
      onMouseMove={wake}
      onClick={(e) => (recIntro || recording ? undefined : blank ? setBlank(null) : e.clientX < window.innerWidth * 0.3 ? goTo(view.index - 1) : forward())}
    >
      <FitSlide className="present-stage">
        <div key={slide.id} ref={attachStage} className="present-slide">
          <SlideCanvas deck={deck} slide={slide} mode="final" {...pageProps(info, slide.id)} />
        </div>
        {/* 움직임 엔진과 전환은 .present-slide만 지금 장으로 본다 (engine.ts의 CURRENT).
            aria-hidden은 붙이지 않는다: 그 안의 글은 컴포넌트 맞추기가 꾸밈 글자로 보고 넘침으로 세지 않는다 (fitBlocks.ts의 lines).
            inert가 화면 읽기 프로그램과 키보드에서 뺀다 */}
        {early && (
          <div key={early.id} className="present-ahead" inert>
            <SlideCanvas deck={deck} slide={early} mode="final" {...pageProps(info, early.id)} />
          </div>
        )}
      </FitSlide>
      {blank && <div className={cx('present-blank', `is-${blank}`)} />}
      <div className={cx('present-bar', `is-${room}`)} onClick={(e) => e.stopPropagation()}>
        <span className="present-count">
          {view.index + 1} / {slides.length}
        </span>
        {canRecord() && (
          <button type="button" className="present-exit" onClick={() => setRecIntro({})}>
            영상으로 저장
          </button>
        )}
        <button type="button" className="present-exit" onClick={() => exit()}>
          발표 끝내기
        </button>
      </div>
      {/* 녹화 중 표시는 슬라이드 상자(.slide-frame) 밖의 형제로 둔다: 요소 녹화는 그 상자와 안쪽만 담아서, 장 위에 겹쳐도
          영상에는 들어가지 않는다 (위 elementCapture) */}
      {recLive && elementCapture && (
        <div className={cx('present-rec', `is-${room}`)} role="status">
          <span className="present-rec-dot" aria-hidden="true" />
          <span>녹화 중</span>
          <span className="present-rec-sep" aria-hidden="true">
            ·
          </span>
          <span className="present-rec-n">
            {view.index + 1} / {slides.length}
          </span>
          <span className="present-rec-sep" aria-hidden="true">
            ·
          </span>
          <span>Esc로 멈추고 저장</span>
        </div>
      )}
      {recIntro && (
        <Modal
          title={recIntro.failed ? '녹화하지 못했어요' : '영상으로 저장할게요'}
          onClose={cancelRecord}
          className="rec-intro"
          actions={
            <>
              <button type="button" className="btn btn-ghost" onClick={cancelRecord}>
                취소
              </button>
              <button type="button" className="btn btn-primary" data-autofocus onClick={() => void startRecord()}>
                {recIntro.failed ? '다시 녹화하기' : '녹화 시작'}
              </button>
            </>
          }
        >
          <p>
            {recIntro.failed ? '화면 공유가 시작되지 않았어요. ‘다시 녹화하기’를' : '‘녹화 시작’을'} 누르면 브라우저가 공유할 화면을 물어요. <b>이 탭</b>을
            고르고 공유를 눌러 주세요.
          </p>
          <p>
            모션이 끝날 때마다 다음 슬라이드로 넘기며 녹화해요. 슬라이드 {slides.length}장이라 {recordTime(slides.length)}쯤 걸리고, Esc를 누르면 거기까지 저장해요.
          </p>
          <p className="rec-intro-local">영상은 이 PC의 다운로드 폴더에만 저장돼요.</p>
        </Modal>
      )}
    </div>
  )
}

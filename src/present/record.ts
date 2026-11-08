// 발표를 영상으로 녹화하기. 브라우저에 든 기능만 쓴다(의존성 없음, 바깥 연결 없음):
// - 화면 공유(getDisplayMedia): 사람이 '이 탭'을 골라야 시작한다(브라우저가 묻는다). 고른 화면은 이 PC 안에서만 쓴다.
// - 잘라 내기(CropTarget): 탭에서 슬라이드 상자의 자리만 잘라 녹화한다. 없으면 요소 녹화(RestrictionTarget), 그것도 없으면 탭 전체.
//   요소 녹화를 먼저 쓰던 때는 장을 넘길 때마다(View Transition 동안) 그 요소가 그려지지 않아 영상에 0.5초씩 검은 장면이 들어갔다.
//   잘라 내기는 화면에 그려진 그대로 담아 장 넘기기 연출까지 들어간다. 대신 그 자리에 겹친 것도 담기므로, 녹화하는 동안 발표 화면은
//   장 밖(위 띠)에만 표시를 둔다(Present.tsx의 recordBox).
// - MediaRecorder: MP4(H.264)를 되면 MP4로, 아니면 WebM으로.
// 실제 발표 화면을 그대로 녹화하므로 모든 모션(숫자 굴리기, 글자 써지기 포함)이 화면에서 보이는 그대로 담긴다.
// 장을 그림으로 굽는 길(export/rasterize.tsx)은 움직이는 도중의 모습(WAAPI, 프레임마다 바꾸는 글자)을 담지 못한다.

/** 녹화 파일 꼴: 고른 순서대로 되는 첫 것 */
const TYPES = [
  { mime: 'video/mp4;codecs=avc1.640028', ext: 'mp4' },
  { mime: 'video/mp4', ext: 'mp4' },
  { mime: 'video/webm;codecs=vp9', ext: 'webm' },
  { mime: 'video/webm', ext: 'webm' },
] as const

export function recordType(): { mime: string; ext: string } | null {
  if (typeof MediaRecorder === 'undefined') return null
  return TYPES.find((t) => MediaRecorder.isTypeSupported(t.mime)) ?? null
}

/** 이 브라우저에서 녹화할 수 있는지(크롬, 엣지) */
export function canRecord(): boolean {
  return !!navigator.mediaDevices?.getDisplayMedia && recordType() !== null
}

type Restrictable = MediaStreamTrack & {
  restrictTo?: (target: unknown) => Promise<void>
  cropTo?: (target: unknown) => Promise<void>
}
type TargetMaker = { fromElement: (el: Element) => Promise<unknown> }

/** 어떻게 잘라 녹화하는지: 슬라이드 상자의 자리만(crop), 그 요소만(element), 탭 전체(tab) */
export type RecordMode = 'crop' | 'element' | 'tab'

export type Recording = {
  ext: string
  /** 탭 전체를 녹화하면(tab) 화면의 어떤 표시도 영상에 담긴다 */
  mode: RecordMode
  /**
   * 파일에 담기 시작한다. 창 크기가 다 바뀐 뒤에 부른다(sizeSettled): 공유를 시작하면 브라우저가 전체 화면을 풀거나 '공유 중' 막대를
   * 띄워 창이, 그래서 잘라 내는 슬라이드 상자가 커지거나 작아진다. 담는 도중에 장면 크기가 바뀌면 MP4는 그 뒤가 깨졌다
   * (영상 프로그램에서 엉뚱한 색 줄로 보였다)
   */
  begin: () => void
  /** 녹화를 멈추고 파일을 돌려준다. 이미 멈췄으면 그때의 파일. 담기 시작하기 전이면 없음 */
  stop: () => Promise<Blob | null>
  /** 사람이 브라우저의 '공유 중지'를 눌렀을 때 */
  ended: Promise<void>
}

/**
 * el(슬라이드 상자)만 녹화하기 시작한다. 사람이 화면 고르기를 거절하면 오류를 던진다.
 * el은 쌓임 맥락(isolation)이 있어야 요소 녹화가 프레임을 보낸다(present.css의 .is-recording).
 * 잘라 내는 자리는 기기 픽셀에 딱 맞아야 가장자리에 검은 줄이 들지 않는다(Present.tsx의 recordBox가 맞춘다)
 */
export async function startRecording(el: HTMLElement): Promise<Recording> {
  const type = recordType()
  if (!type) throw new Error('unsupported')
  const options = {
    // 마우스 화살표는 담지 않는다 (발표 화면도 녹화하는 동안 감춘다)
    video: { frameRate: { ideal: 60 }, displaySurface: 'browser', cursor: 'never' },
    audio: false,
    // 크롬: 고르기 창에 이 탭을 먼저 보인다
    preferCurrentTab: true,
    selfBrowserSurface: 'include',
  } as DisplayMediaStreamOptions
  const stream = await navigator.mediaDevices.getDisplayMedia(options)
  const track = stream.getVideoTracks()[0] as Restrictable | undefined
  if (!track) {
    stream.getTracks().forEach((t) => t.stop())
    throw new Error('no-track')
  }
  const w = window as unknown as { RestrictionTarget?: TargetMaker; CropTarget?: TargetMaker }
  let mode: RecordMode = 'tab'
  try {
    if (w.CropTarget && track.cropTo) {
      await track.cropTo(await w.CropTarget.fromElement(el))
      mode = 'crop'
    } else if (w.RestrictionTarget && track.restrictTo) {
      await track.restrictTo(await w.RestrictionTarget.fromElement(el))
      mode = 'element'
    }
  } catch {
    // 잘라 내지 못하면(다른 탭이나 창을 골랐을 때) 고른 화면 그대로 녹화한다
  }
  const recorder = new MediaRecorder(stream, { mimeType: type.mime, videoBitsPerSecond: 16_000_000 })
  const chunks: Blob[] = []
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data)
  }
  let file: Blob | null = null
  const finished = new Promise<Blob | null>((resolve) => {
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop())
      file = chunks.length ? new Blob(chunks, { type: type.mime.split(';')[0] }) : null
      resolve(file)
    }
  })
  const ended = new Promise<void>((resolve) => track.addEventListener('ended', () => resolve(), { once: true }))
  void ended.then(() => {
    if (recorder.state !== 'inactive') recorder.stop()
  })
  let began = false
  return {
    ext: type.ext,
    mode,
    ended,
    begin: () => {
      if (began || track.readyState === 'ended') return
      began = true
      // 1초마다 조각을 받아 둔다: 녹화가 길어도 마지막에 한 번에 받느라 멈추지 않게
      recorder.start(1000)
    },
    stop: () => {
      if (!began) {
        stream.getTracks().forEach((t) => t.stop())
        return Promise.resolve(null)
      }
      if (recorder.state !== 'inactive') recorder.stop()
      return file ? Promise.resolve(file) : finished
    },
  }
}

/**
 * 창 크기가 그대로 있을 때까지 기다린다: quiet 동안 바뀌지 않으면 끝(limit을 넘으면 그만), 그다음 바뀐 크기로 다시 그린 프레임까지.
 * 녹화를 시작한 직후에 전체 화면으로 다시 들어가거나 '공유 중' 막대가 뜨는 것을 기다린다(Recording.begin)
 */
export async function sizeSettled(quiet = 300, limit = 2500): Promise<void> {
  const t0 = performance.now()
  let size = `${window.innerWidth}×${window.innerHeight}`
  let since = t0
  while (performance.now() - t0 < limit) {
    await new Promise((r) => window.setTimeout(r, 50))
    const now = `${window.innerWidth}×${window.innerHeight}`
    if (now !== size) {
      size = now
      since = performance.now()
    } else if (performance.now() - since >= quiet) break
  }
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
}

/** 파일을 내려받게 한다 */
export function saveBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.append(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

/**
 * 장의 움직임이 끝날 때까지 기다린다: 장 안에서 도는 유한한 움직임이 두 번 잰 동안(0.2초) 하나도 없으면 끝. '하나씩'으로 멈춘
 * 움직임(paused)과 끝없이 도는 생동감(무한)은 끝난 것으로 본다. limit을 넘으면 그만 기다린다
 */
export async function motionSettled(stage: () => HTMLElement | null, limit = 15_000): Promise<void> {
  const t0 = performance.now()
  let quiet = 0
  while (performance.now() - t0 < limit) {
    await new Promise((r) => window.setTimeout(r, 100))
    const el = stage()
    const busy = !!el && el.getAnimations({ subtree: true }).some((a) => a.playState === 'running' && Number.isFinite(Number(a.effect?.getComputedTiming().endTime)))
    quiet = busy ? 0 : quiet + 1
    if (quiet >= 2) return
  }
}

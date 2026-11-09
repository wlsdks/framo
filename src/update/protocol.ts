// 앱과 로컬 서버의 '새 버전' 창구가 같이 쓰는 약속. 다른 파일을 가져오지 않는다(vite 설정, 서버, 화면 어디서 가져와도 되게).
// 주소는 저장소와 주소의 예전 이름(html-maker)을 그대로 따른다.

export const UPDATE_PREFIX = '/__html-maker/update/'

/** 확인한 결과. 정해진 말만 쓴다. 네트워크 오류 글, 주소, 경로는 넣지 않는다 */
export type UpdateCheck =
  /** 이번에 켠 뒤로 아직 확인하지 않았다 */
  | { state: 'unknown' }
  | { state: 'checking' }
  /** 인터넷이 없거나 회사 네트워크가 막았거나 GitHub의 답이 약속과 달랐다 */
  | { state: 'failed'; checkedAt: number }
  | { state: 'latest'; checkedAt: number }
  | {
      state: 'available'
      checkedAt: number
      /** 새 버전 (X.Y.Z) */
      version: string
      /** 바뀐 점을 보는 GitHub 릴리스 주소. 서버가 https://github.com/wlsdks/gyeol(또는 framo)/releases/tag/vX.Y.Z 꼴인지 확인한 것 */
      page: string
      /** 이 PC에서 받을 수 있는지. 받을 파일이 없거나, 지문(SHA-256)이 없거나, 개발 서버면 false */
      download: boolean
    }

export type DownloadState =
  | { state: 'idle' }
  | { state: 'downloading'; received: number; total: number }
  /** 받은 zip을 앱 폴더 안(versions/)에 풀고 확인하는 중. done, total은 풀린 바이트 */
  | { state: 'preparing'; done: number; total: number }
  /** 새 버전을 다 풀고 확인했다. 다시 켜면(‘지금 다시 시작’, 또는 다음에 켤 때) 이 버전이 켜진다 */
  | { state: 'ready'; version: string }
  /**
   * 받아서 지문까지 맞춰 봤고, 폴더를 열었다. 사람이 zip을 직접 푼다.
   * why: 저절로 바꾸지 못한 까닭. 없으면 이렇게 켠 Framo(시작 파일이 아니라 서버를 바로 켠 것)는 저절로 바꾸지 않는다
   */
  | { state: 'done'; why?: InstallError }
  | { state: 'failed'; reason: DownloadError }

/** 받기가 안 된 까닭. 화면은 이 말에 맞춰 안내한다. start: 받아 둔 새 버전이 켜지지 않아 시작 프로그램이 이 버전으로 켰다 */
export type DownloadError = 'network' | 'verify' | 'write' | 'start'

/**
 * 받은 새 버전을 저절로 바꾸지 못한 까닭(server/install.ts). start는 그 버전이 예전에 켜지지 않았던 것,
 * unsigned는 릴리스 서명(SHA256SUMS.txt.sig)이 없거나 앱에 든 키로 맞지 않거나, 서명된 지문이 받은 zip과 다른 것
 */
export type InstallError = 'verify' | 'layout' | 'space' | 'write' | 'blocked' | 'start' | 'unsigned'

export interface UpdateStatus {
  /** 지금 이 앱의 버전 */
  current: string
  /** 이 서버를 켤 때마다 새로 정하는 표시. 다시 켠 뒤 화면이 새 서버가 떴는지 알아본다 */
  boot: string
  /** 받은 새 버전을 서버가 풀어 두고 다시 켤 수 있는지(시작 파일로 켠 Framo이고, 릴리스에 서명이 있다). 아니면 받기만 하고 사람이 푼다 */
  auto: boolean
  check: UpdateCheck
  download: DownloadState
}

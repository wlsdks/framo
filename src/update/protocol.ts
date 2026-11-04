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
  /** 받아서 지문까지 맞춰 봤고, 폴더를 열었다 */
  | { state: 'done' }
  | { state: 'failed'; reason: DownloadError }

/** 받기가 안 된 까닭. 화면은 이 말에 맞춰 안내한다 */
export type DownloadError = 'network' | 'verify' | 'write'

export interface UpdateStatus {
  /** 지금 이 앱의 버전 */
  current: string
  check: UpdateCheck
  download: DownloadState
}

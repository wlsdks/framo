// 화면이 로컬 서버의 '새 버전' 창구와 이야기하는 곳. 브라우저는 127.0.0.1의 이 서버로만 가고(CSP connect-src 'self'),
// GitHub에 묻고 받는 것은 서버(server/update.ts)가 한다.

import { AI_HEADER } from '../ai/protocol'
import { UPDATE_PREFIX, type UpdateStatus } from './protocol'

async function call(path: string, method: 'GET' | 'POST'): Promise<UpdateStatus | null> {
  try {
    const res = await fetch(UPDATE_PREFIX + path, { method, headers: { [AI_HEADER]: '1' }, cache: 'no-store' })
    if (!res.ok && res.status !== 202) return null
    const body = (await res.json()) as UpdateStatus
    return body && typeof body.current === 'string' && typeof body.boot === 'string' && typeof body.auto === 'boolean' && body.check && body.download ? body : null
  } catch {
    return null
  }
}

/** 서버가 아는 것. ‘Framo 시작’으로 켠 서버나 개발 서버가 아니면(파일로 열었으면) null */
export const updateStatus = () => call('status', 'GET')
/** 확인한다. 24시간 안에 확인했으면 서버가 그 결과를 돌려준다 */
export const checkUpdate = () => call('check', 'POST')
/** '다시 확인' */
export const checkUpdateNow = () => call('check/now', 'POST')
/** 홈을 열 때. 알림을 꺼 두었으면 확인을 시키지 않고 서버가 아는 것만 본다(GitHub에 아무것도 묻지 않는다) */
export const loadUpdate = (on: boolean) => (on ? checkUpdate() : updateStatus())
/** 받는다. 시작 프로그램으로 켠 Framo면 받은 뒤 풀어 두기까지 서버가 한다 */
export const startDownload = () => call('download', 'POST')
export const revealDownload = () => call('reveal', 'POST')
/** 풀어 둔 새 버전으로 다시 켠다. 서버가 답한 뒤 끝나고 시작 프로그램이 새 버전을 켠다 */
export const restartApp = () => call('restart', 'POST')

import type { AskError, AskId, AskRun } from './asks'
import { cancelAsk, publishShape, startAsk } from './client'
import type { ShapeDeck } from './share'

/** 공유와 실행 사이에도 취소를 확인한다. 이미 서버가 시작한 뒤의 취소는 실행 id로 서버에도 전한다. */
export async function startSharedAsk(shape: ShapeDeck, ask: AskId, slide: string | null, current: () => boolean): Promise<AskRun | AskError | null> {
  const shared = await publishShape(shape)
  if (!current()) return null
  if (!shared) return 'not_shared'
  const run = await startAsk(ask, shape.deck, slide)
  if (!current()) {
    if (typeof run !== 'string') void cancelAsk(run.id)
    return null
  }
  return run
}

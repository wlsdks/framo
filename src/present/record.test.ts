import { afterEach, describe, expect, it, vi } from 'vitest'
import { canRecord, recordType } from './record'

describe('영상으로 저장', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('MP4(H.264)가 되면 MP4로, 아니면 WebM으로 녹화한다', () => {
    vi.stubGlobal('MediaRecorder', { isTypeSupported: (t: string) => t.startsWith('video/mp4') })
    expect(recordType()?.ext).toBe('mp4')
    vi.stubGlobal('MediaRecorder', { isTypeSupported: (t: string) => t.startsWith('video/webm') })
    expect(recordType()?.ext).toBe('webm')
  })

  it('녹화 기능이 없는 브라우저에서는 단추를 내지 않는다', () => {
    vi.stubGlobal('MediaRecorder', undefined)
    expect(recordType()).toBeNull()
    expect(canRecord()).toBe(false)
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { canRecord, captureScale, recordType } from './record'

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

  it('장이 작게 그려지는 창에서는 탭을 2배로 촘촘하게 그려 받는다: 1280×600 창(100%)의 장 992px', () => {
    expect(captureScale(992)).toBe(2)
    expect(captureScale(1280)).toBe(2)
    // 1920 전체 화면(1856), 150% 배율 노트북의 전체 화면(1824)은 그대로: 2배로 그리면 느린 PC에서 모션이 끊길 수 있다
    expect(captureScale(1856)).toBe(1)
    expect(captureScale(1824)).toBe(1)
    expect(captureScale(0)).toBe(1)
  })
})

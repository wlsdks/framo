// 홍보 페이지(site/)는 손으로 고치는 정적 파일이라, 새 버전을 올릴 때 잊기 쉬운 것과 지켜야 할 것만 본다
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(import.meta.dirname, '..')
const html = readFileSync(join(ROOT, 'site', 'index.html'), 'utf8')
const { version } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version: string }

describe('홍보 페이지', () => {
  it('다운로드에 적힌 버전이 지금 버전과 같다', () => {
    const shown = html.match(/data-version="([^"]+)"/)?.[1]
    expect(shown).toBe(version)
    expect(html).toContain(`>최신 버전 ${version}<`)
  })

  it('다운로드 단추는 늘 최신 버전의 두 파일을 가리킨다', () => {
    const links = [...html.matchAll(/href="([^"]*releases[^"]*\.zip)"/g)].map((m) => m[1])
    expect(new Set(links)).toEqual(
      new Set(['https://github.com/wlsdks/framo/releases/latest/download/gyeol-windows.zip', 'https://github.com/wlsdks/framo/releases/latest/download/gyeol-mac.zip']),
    )
  })

  it('바깥 주소에서 아무것도 불러오지 않는다', () => {
    expect(html).toContain(`default-src 'none'`)
    // 링크(<a href>)는 눌렀을 때만 가는 곳이라 괜찮다. 불러오는 src, link href, srcset만 본다
    const loads = [
      ...html.matchAll(/\ssrc(?:set)?="([^"]+)"/g),
      ...html.matchAll(/<link\b[^>]*\shref="([^"]+)"/g),
    ].map((m) => m[1])
    expect(loads.length).toBeGreaterThan(0)
    expect(loads.filter((u) => /^(https?:)?\/\//.test(u))).toEqual([])
  })
})

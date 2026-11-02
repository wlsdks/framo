import { describe, expect, it } from 'vitest'
import { cssSource } from './cssSource'
import * as fit from './fitBlocks'

describe('부품 장 글자 맞추기', () => {
  it('바깥의 이름을 쓰지 않는다 (내보낸 HTML에 blockFitter의 소스만 들어간다)', () => {
    const src = fit.blockFitter.toString()
    // 이 파일이 내보내는 다른 이름을 안에서 부르면 내보낸 HTML에서는 없는 이름이라 맞추기가 멈춘다
    for (const name of Object.keys(fit).filter((k) => k !== 'blockFitter')) expect(src, name).not.toMatch(new RegExp(`\\b${name}\\b`))
    const rebuilt = new Function(`return (${src})`)() as typeof fit.blockFitter
    expect(Object.keys(rebuilt())).toEqual(['fit', 'lines', 'over', 'labels', 'figures', 'drawn', 'edgeSeen'])
  })

  it('테두리는 보이는 선만 그려진 것으로 센다 (줄 선 규칙이 지운 첫 항목 위, 끝 항목 아래의 선과 선 없는 쪽의 여백은 빼고)', () => {
    // 줄 선 규칙(lines.css)은 첫 항목 위와 끝 항목 아래의 선을 투명하게 두어 높이만 지킨다. 굵기만 보던 때는 이 선도 그려진 것으로 세어
    // 예상 질문의 그려진 윗선이 첫 글줄보다 10px 위(항목 상자의 위끝)가 되었고, 옆 칸과 첫 글줄을 맞추는 일(8px 안만)에서 빠졌다
    const src = fit.blockFitter.toString()
    // 함수 하나의 소스: 다음 도움 함수의 설명 주석(/**) 전까지
    const fn = (name: string) => {
      const i = src.indexOf(`function ${name}(`)
      expect(i, name).toBeGreaterThan(0)
      return src.slice(i, src.indexOf('/**', i))
    }
    const edgeSeen = new Function(`${fn('clearColor')}\n${fn('edgeSeen')}\nreturn edgeSeen`)() as (cs: object, side: string) => boolean
    const top = (width: string, style: string, color: string) => ({ borderTopWidth: width, borderTopStyle: style, borderTopColor: color })
    expect(edgeSeen(top('1px', 'solid', 'rgba(0, 0, 0, 0)'), 'Top')).toBe(false)
    expect(edgeSeen(top('1px', 'solid', 'transparent'), 'Top')).toBe(false)
    expect(edgeSeen(top('1px', 'solid', 'color(srgb 0.1 0.1 0.1 / 0)'), 'Top')).toBe(false)
    expect(edgeSeen(top('0px', 'solid', 'rgb(17, 17, 17)'), 'Top')).toBe(false)
    expect(edgeSeen(top('1px', 'none', 'rgb(17, 17, 17)'), 'Top')).toBe(false)
    expect(edgeSeen(top('1px', 'solid', 'rgba(17, 17, 17, 0.12)'), 'Top')).toBe(true)
    expect(edgeSeen(top('1px', 'solid', 'color(srgb 0.1 0.1 0.1 / 0.12)'), 'Top')).toBe(true)
    // 위아래 선만 그은 상자(목록의 줄 선)는 그 선만 그려진 것이다: 상자째 세면 아래 선만 있는 첫 항목의 위 여백까지 그려진 것이 되어,
    // 요점 목록의 첫 글줄이 그려진 윗선보다 23px 아래였고 옆 칸과 첫 글줄을 맞추지 못했다(갤러리 combos seed 1의 3번, 89번)
    const paintSpan = new Function(`${fn('clearColor')}\n${fn('edgeSeen')}\n${fn('paintSpan')}\nreturn paintSpan`)() as (cs: object, top: number, bottom: number, k: number) => [number, number] | null
    const ink = 'rgb(17, 17, 17)'
    const box = (o: object) => ({ backgroundColor: 'rgba(0, 0, 0, 0)', backgroundImage: 'none', boxShadow: 'none', borderTopWidth: '0px', borderTopStyle: 'none', borderTopColor: ink, borderBottomWidth: '0px', borderBottomStyle: 'none', borderBottomColor: ink, ...o })
    const under = { borderBottomWidth: '1px', borderBottomStyle: 'solid', borderBottomColor: 'rgb(230, 231, 234)' }
    expect(paintSpan(box({}), 100, 160, 0.5)).toBeNull()
    expect(paintSpan(box(under), 100, 160, 0.5)).toEqual([159.5, 160])
    expect(paintSpan(box({ ...under, borderTopWidth: '1px', borderTopStyle: 'solid', borderTopColor: 'rgba(0, 0, 0, 0)' }), 100, 160, 0.5)).toEqual([159.5, 160])
    expect(paintSpan(box({ ...under, borderBottomColor: 'transparent' }), 100, 160, 0.5)).toBeNull()
    expect(paintSpan(box({ borderTopWidth: '2px', borderTopStyle: 'solid' }), 100, 160, 0.5)).toEqual([100, 101])
    expect(paintSpan(box({ ...under, borderTopWidth: '1px', borderTopStyle: 'solid' }), 100, 160, 0.5)).toEqual([100, 160])
    expect(paintSpan(box({ backgroundColor: 'rgb(240, 242, 250)' }), 100, 160, 0.5)).toEqual([100, 160])
    expect(paintSpan(box({ boxShadow: 'rgb(230, 231, 234) 0px -1px 0px 0px inset' }), 100, 160, 0.5)).toEqual([100, 160])
    // 그려진 위아래(drawn)와 왼쪽 오른쪽(drawnX) 모두 테두리를 이것으로 본다: 굵기만 보는 곳이 남지 않는다
    for (const [name, use] of [['drawn', /paintSpan\(/], ['drawnX', /edgeSeen\(/]] as const) {
      const body = fn(name)
      expect(body, name).toMatch(use)
      expect(body, name).not.toMatch(/parseFloat\(\w+\.border(?:Top|Bottom|Left|Right)Width\) > 0/)
    }
  })

  it('짧은 글 둘을 칸 안에서 옮길 때 글이 다시 꺾이지 않게 안쪽 여백 안까지만 옮기고, 그래도 넘치면 되돌린다', () => {
    // 칸 끝까지 옮기면 그만큼 안쪽 폭(--bk-content-limit)이 글보다 좁아져 글이 한 줄 더 꺾이고, 내용에 맞춰 줄여 둔 면(hug) 밖으로 넘쳤다
    // (크게에서 핵심 메시지의 부제가 아래 여백을 12px 먹었다. 갤러리 combos seed 5의 85번)
    const src = fit.blockFitter.toString()
    const balance = src.slice(src.indexOf('function balance'), src.indexOf('function gutters'))
    const short = balance.slice(balance.indexOf('shortText.has'), balance.indexOf('balanced.add'))
    expect(short).toMatch(/paddingRight/)
    expect(short).toMatch(/over\(inner\)/)
  })

  it('레이아웃 장을 맞추는 동안 편집 표시를 숨긴다: 편집 화면과 발표 화면의 글자 크기가 같다', () => {
    // 칸 둘레의 면(.ed-halo)은 글 밖으로 띄운 그림이라 본문 왼쪽으로 19px 나온다. 맞추는 동안 그대로 두면 넘친 것으로 보고 글자를 키우지 않아,
    // 덜 찬 장(다섯 단계 흐름, 짧은 사례)의 글자가 편집 화면에서만 발표 화면보다 한 단계 작았다(설명 26px, 발표 화면 31px).
    // 부품 장은 이미 맞추는 동안 숨긴다(.bk-area.is-fitting)
    const src = fit.blockFitter.toString()
    const i = src.indexOf('function fitLayoutNow(')
    expect(i).toBeGreaterThan(0)
    const now = src.slice(i, src.indexOf('function fitPart(', i))
    expect(now).toMatch(/slide\.classList\.add\(['"]is-fitting['"]\)/)
    expect(now).toMatch(/finally\s*\{[^}]*slide\.classList\.remove\(['"]is-fitting['"]\)/)
    const css = cssSource(new URL('./edit.css', import.meta.url))
    expect(css).toMatch(/:is\([^)]*\.slide\.is-fitting[^)]*\)\s*:is\(\.ed-halo[^)]*\)\s*\{\s*display:\s*none/)
  })
})

import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createSampleDeck } from '../deck/sample'
import { showcaseSlides } from '../deck/showcase'
import { cssSource } from './cssSource'
import * as fit from './fitBlocks'
import { SlideCanvas } from './SlideCanvas'

const css = cssSource(new URL('./styles/case.css', import.meta.url))

/** 선택자 하나의 규칙 본문 (주석은 cssSource가 뺀다) */
function rule(sel: string): string {
  const i = css.indexOf(`${sel} {`)
  return i < 0 ? '' : css.slice(i, css.indexOf('}', i))
}

/** from에서 연 div가 닫히는 곳까지 (가운데 div는 열고 닫는 수를 맞춰 건넌다) */
function divAt(html: string, from: number): string {
  let depth = 0
  const tag = /<div\b|<\/div>/g
  tag.lastIndex = from
  for (let m = tag.exec(html); m; m = tag.exec(html)) {
    depth += m[0] === '</div>' ? -1 : 1
    if (depth === 0) return html.slice(from, m.index)
  }
  return ''
}

function caseHtml(mode: 'final' | 'edit') {
  const deck = createSampleDeck()
  const slide = showcaseSlides().find((s) => s.layout === 'case')
  expect(slide).toBeTruthy()
  return renderToStaticMarkup(createElement(SlideCanvas, { deck, slide: slide!, mode }))
}

describe('사례 장의 위아래 균형 (VISUAL-RULES 6)', () => {
  it('제목 아래 이야기(내용, 한마디)를 한 묶음으로 그린다: 장 채움 맞추기가 묶음째 키우고 눈높이로 내린다', () => {
    // 내용과 한마디가 제목과 나란히 단에 바로 놓였을 때는 장 채움 맞추기(fitLayout)가 닿지 않아(장 머리와 본문 상자가 없는 두 단),
    // 짧은 사례면 왼쪽 단의 아래 절반이 통째로 비었다(장 모음의 사례 장: 이야기가 526px에서 끝나고 아래 480px 빔)
    for (const mode of ['final', 'edit'] as const) {
      const html = caseHtml(mode)
      const at = html.indexOf('<div class="cs-story"')
      expect(at, mode).toBeGreaterThan(html.indexOf('cs-title'))
      const story = divAt(html, at)
      expect(story, mode).toMatch(/cs-body/)
      expect(story, mode).toMatch(/cs-quote/)
      expect(story, mode).not.toMatch(/cs-title|cs-side/)
    }
  })

  it('이야기와 결과 숫자는 머리(제목, 대상) 아래 띄운 자리에 장 채움 맞추기가 준 몫(--eye)을 더해 내려간다', () => {
    expect(rule('.cs-story')).toMatch(/margin-top:\s*calc\([^;]*var\(--eye, 0px\)/)
    expect(rule('.cs-results')).toMatch(/margin-top:\s*calc\(var\(--body-gap\)\s*\+\s*var\(--eye, 0px\)\)/)
    // 이야기 안의 첫 칸은 위 여백 없이: 띄우는 몫은 묶음 상자 밖(머리와 묶음 사이)에 있어야 장 채움 맞추기가 머리와의 사이로 잰다
    expect(rule('.cs-story > :first-child')).toMatch(/margin-top:\s*0/)
  })

  it('장 채움 맞추기가 사례 장의 두 단(제목 아래 이야기, 대상 아래 결과 숫자)을 단마다 맞춘다', () => {
    const src = fit.blockFitter.toString()
    const i = src.indexOf('function layoutParts(')
    expect(i).toBeGreaterThan(0)
    const parts = src.slice(i, src.indexOf('/**', i))
    expect(parts).toMatch(/\.cs-story/)
    expect(parts).toMatch(/\.cs-results/)
    expect(parts).toMatch(/\.cs-main/)
    expect(parts).toMatch(/\.cs-side/)
    // 사례 장의 한마디는 제목 글꼴이라, 두 단계(1.44) 키우면 장 제목(62px)만 해져 제목이 둘로 읽혔다: 한 단계까지만
    expect(parts).toMatch(/ups:\s*\[ups\[0\]\]|steps:\s*\[ups\[0\]\]/)
  })

  it('개발용 검사(checkAssembly)도 사례 장의 두 단이 위에 붙은 채 비었는지 본다', () => {
    const src = readFileSync(new URL('../screens/assembly.ts', import.meta.url), 'utf8')
    const i = src.indexOf('function layoutFill(')
    const body = src.slice(i, src.indexOf('\n}\n', i))
    expect(body).toMatch(/cs-story/)
    expect(body).toMatch(/cs-results/)
  })
})

import { writeFileSync } from 'node:fs'
import { posix } from 'node:path'
import { deflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { createDeck } from '../deck/generate'
import { buildPptx, deckToPptx, notesParagraphs, pptxParts, relsPathOf, xmlChars, xmlText, type PptxInput } from './pptx'
import { crc32 } from './zip'
import { readZip } from './zipReader'

/** 시험용 PNG (한 가지 색, 가운데 띠). 장 그림 자리에 넣는다 */
function png(width: number, height: number, rgb: [number, number, number]): Uint8Array {
  const row = 1 + width * 3
  const raw = new Uint8Array(row * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const band = y > height * 0.4 && y < height * 0.6
      raw.set(band ? [255 - rgb[0], 255 - rgb[1], 255 - rgb[2]] : rgb, y * row + 1 + x * 3)
    }
  }
  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length)
    const view = new DataView(out.buffer)
    view.setUint32(0, data.length)
    out.set(new TextEncoder().encode(type), 4)
    out.set(data, 8)
    view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))
    return out
  }
  const ihdr = new Uint8Array(13)
  new DataView(ihdr.buffer).setUint32(0, width)
  new DataView(ihdr.buffer).setUint32(4, height)
  ihdr.set([8, 2, 0, 0, 0], 8)
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', new Uint8Array(deflateSync(raw))), chunk('IEND', new Uint8Array())]
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

/**
 * 가벼운 XML 꼴 확인: 여는 태그와 닫는 태그가 짝이 맞고, &는 알려진 이름이나 숫자 참조로만 쓰이고, 쓸 수 없는 글자가 없다.
 * 우리가 만드는 XML에는 주석, CDATA, 처리 명령(맨 앞의 선언 말고)이 없어서 이 정도로 본다. 실제 파서로는 sample.pptx를 xmllint로 본다
 */
function checkXml(name: string, xml: string): void {
  expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'), name).toBe(true)
  // eslint-disable-next-line no-control-regex
  expect(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/.test(xml), `${name}: 쓸 수 없는 글자`).toBe(false)
  expect(/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);)/i.test(xml), `${name}: 바꾸지 않은 &`).toBe(false)
  const body = xml.replace(/^<\?xml[^>]*\?>\s*/, '')
  const stack: string[] = []
  let roots = 0
  for (const m of body.matchAll(/<(\/?)([A-Za-z_][\w.:-]*)((?:\s+[\w:.-]+="[^"<]*")*)\s*(\/?)>|<|>/g)) {
    if (m[0] === '<') throw new Error(`${name}: 태그가 아닌 <`)
    if (m[0] === '>') throw new Error(`${name}: 태그 밖의 >`)
    const [, close, tag, , self] = m
    if (close) {
      expect(stack.pop(), `${name}: </${tag}>`).toBe(tag)
    } else if (!self) {
      if (!stack.length) roots++
      stack.push(tag)
    } else if (!stack.length) roots++
  }
  expect(stack, name).toEqual([])
  expect(roots, `${name}: 맨 바깥 요소`).toBe(1)
}

const input = (n: number, notes: (i: number) => string = () => ''): PptxInput => ({
  title: '품질 관리 & 원가 <절감> 제안',
  date: new Date(Date.UTC(2026, 9, 25, 5, 0, 0)),
  slides: Array.from({ length: n }, (_, i) => ({ png: png(16, 9, [i * 60, 120, 200]), notes: notes(i) })),
})

const text = (data: string | Uint8Array) => (typeof data === 'string' ? data : new TextDecoder().decode(data))

describe('PPT 파일의 부분들', () => {
  const parts = pptxParts(input(3, (i) => (i === 1 ? '' : `노트 ${i + 1}`)))
  const names = parts.map((p) => p.name)
  const byName = new Map(parts.map((p) => [p.name, p]))

  it('꼭 있어야 하는 부분이 모두 있고 이름이 겹치지 않는다', () => {
    for (const need of [
      '[Content_Types].xml',
      '_rels/.rels',
      'docProps/core.xml',
      'docProps/app.xml',
      'ppt/presentation.xml',
      'ppt/_rels/presentation.xml.rels',
      'ppt/presProps.xml',
      'ppt/viewProps.xml',
      'ppt/tableStyles.xml',
      'ppt/slideMasters/slideMaster1.xml',
      'ppt/slideMasters/_rels/slideMaster1.xml.rels',
      'ppt/slideLayouts/slideLayout1.xml',
      'ppt/slideLayouts/_rels/slideLayout1.xml.rels',
      'ppt/theme/theme1.xml',
      'ppt/notesMasters/notesMaster1.xml',
      'ppt/notesMasters/_rels/notesMaster1.xml.rels',
      'ppt/theme/theme2.xml',
      'ppt/slides/slide1.xml',
      'ppt/slides/slide3.xml',
      'ppt/slides/_rels/slide2.xml.rels',
      'ppt/media/image1.png',
      'ppt/media/image3.png',
      'ppt/notesSlides/notesSlide1.xml',
      'ppt/notesSlides/_rels/notesSlide3.xml.rels',
    ])
      expect(names, need).toContain(need)
    // 노트가 빈 장은 노트 쪽이 없다
    expect(names).not.toContain('ppt/notesSlides/notesSlide2.xml')
    // OPC: 부분 이름은 대소문자를 가리지 않고 겹치면 안 된다
    expect(new Set(names.map((n) => n.toLowerCase())).size).toBe(names.length)
    expect(names[0]).toBe('[Content_Types].xml')
  })

  it('모든 XML의 꼴이 맞다', () => {
    for (const p of parts) if (/\.(xml|rels)$/.test(p.name)) checkXml(p.name, text(p.data))
  })

  it('모든 관계의 대상이 있고, XML이 가리키는 rId는 모두 관계 파일에 있다', () => {
    for (const p of parts) {
      if (p.name.endsWith('.rels') || p.name === '[Content_Types].xml') continue
      const relsName = relsPathOf(p.name)
      const rels = byName.get(relsName)
      const ids = new Map<string, string>()
      if (rels) {
        for (const m of text(rels.data).matchAll(/<Relationship Id="([^"]+)" Type="([^"]+)" Target="([^"]+)"\/>/g)) {
          expect(ids.has(m[1]), `${relsName}: ${m[1]} 겹침`).toBe(false)
          const target = posix.normalize(posix.join(posix.dirname(p.name), m[3]))
          expect(names, `${relsName} → ${m[3]}`).toContain(target)
          ids.set(m[1], target)
        }
      }
      if (!/\.xml$/.test(p.name)) continue
      for (const m of text(p.data).matchAll(/r:(?:id|embed)="([^"]+)"/g)) expect(ids.has(m[1]), `${p.name}: ${m[1]}`).toBe(true)
    }
    // 묶음 맨 위의 관계
    for (const m of text(byName.get('_rels/.rels')!.data).matchAll(/Target="([^"]+)"/g)) expect(names).toContain(m[1])
  })

  it('장마다 그림, 틀, 노트가 짝지어 있다', () => {
    const rels = (n: string) => text(byName.get(n)!.data)
    expect(rels('ppt/slides/_rels/slide1.xml.rels')).toContain('Target="../media/image1.png"')
    expect(rels('ppt/slides/_rels/slide1.xml.rels')).toContain('Target="../notesSlides/notesSlide1.xml"')
    expect(rels('ppt/slides/_rels/slide2.xml.rels')).not.toContain('notesSlide')
    expect(rels('ppt/notesSlides/_rels/notesSlide3.xml.rels')).toContain('Target="../slides/slide3.xml"')
    expect(rels('ppt/slides/_rels/slide3.xml.rels')).toContain('Target="../slideLayouts/slideLayout1.xml"')
  })

  it('[Content_Types]가 모든 부분의 종류를 알려 준다', () => {
    const types = text(byName.get('[Content_Types].xml')!.data)
    const defaults = new Set([...types.matchAll(/<Default Extension="([^"]+)"/g)].map((m) => m[1]))
    const overrides = new Set([...types.matchAll(/<Override PartName="\/([^"]+)"/g)].map((m) => m[1]))
    for (const o of overrides) expect(names, o).toContain(o)
    for (const n of names) {
      if (n === '[Content_Types].xml') continue
      expect(overrides.has(n) || defaults.has(n.split('.').pop()!), n).toBe(true)
    }
    // application/xml로만 알려진 PowerPoint 부분이 있으면 PowerPoint가 열지 못한다
    for (const n of names) if (n.startsWith('ppt/') && n.endsWith('.xml')) expect(overrides.has(n), n).toBe(true)
  })

  it('장 크기는 16:9, 장 id는 256부터 겹치지 않게', () => {
    const pres = text(byName.get('ppt/presentation.xml')!.data)
    expect(pres).toContain('<p:sldSz cx="12192000" cy="6858000"/>')
    const ids = [...pres.matchAll(/<p:sldId id="(\d+)"/g)].map((m) => Number(m[1]))
    expect(ids).toEqual([256, 257, 258])
    // 그림은 장을 꽉 채운다
    expect(text(byName.get('ppt/slides/slide2.xml')!.data)).toContain('<a:off x="0" y="0"/><a:ext cx="12192000" cy="6858000"/>')
    expect(text(byName.get('docProps/app.xml')!.data)).toContain('<Slides>3</Slides><Notes>2</Notes>')
    expect(text(byName.get('docProps/core.xml')!.data)).toContain('<dc:title>품질 관리 &amp; 원가 &lt;절감&gt; 제안</dc:title>')
  })
})

describe('발표자 노트', () => {
  it('XML에 쓸 수 없는 글자는 빼고 &, <, >는 바꾼다', () => {
    expect(xmlText('A < B & C > D "E"')).toBe('A &lt; B &amp; C &gt; D &quot;E&quot;')
    expect(xmlText('제어\u0000\u0001\u0008\u000b\u000c\u001f문자￾￿')).toBe('제어문자')
    // 짝 없는 서로게이트는 빼고, 짝이 맞는 것(그림 문자)은 둔다
    expect(xmlText('a\ud800b\udc00c 👍')).toBe('abc 👍')
    expect(xmlText('탭\t그대로')).toBe('탭\t그대로')
  })

  it('XML에 쓸 수 없는 글자만 빼는 것(xmlChars)은 이미 XML로 옮긴 글에도 쓴다: 그림이 든 큰 글도 빠르게', () => {
    expect(xmlChars('<p class="a">제어\u000b\u000c\u0000글 &amp; 👍\ud800</p>')).toBe('<p class="a">제어글 &amp; 👍</p>')
    const big = `<img src="data:image/png;base64,${'A'.repeat(4_000_000)}"/>`
    const t = performance.now()
    expect(xmlChars(big)).toBe(big)
    expect(performance.now() - t).toBeLessThan(500)
  })

  it('노트의 PowerPoint 줄 나눔(세로 탭)도 줄로 나눈다', () => {
    const paras = [...notesParagraphs('첫 줄\u000b둘째 줄').matchAll(/<a:p>(.*?)<\/a:p>/g)].map((m) => m[1])
    expect(paras).toHaveLength(2)
    expect(paras[1]).toContain('<a:t>둘째 줄</a:t>')
  })

  it('줄마다 문단, 빈 줄은 빈 문단, 끝의 빈 줄은 뺀다', () => {
    const xml = notesParagraphs('첫 줄 <중요>\r\n\r\n셋째 & 넷째\r마지막\n\n\n')
    const paras = [...xml.matchAll(/<a:p>(.*?)<\/a:p>/g)].map((m) => m[1])
    expect(paras).toHaveLength(4)
    expect(paras[0]).toContain('<a:t>첫 줄 &lt;중요&gt;</a:t>')
    expect(paras[1]).not.toContain('<a:t>')
    expect(paras[2]).toContain('<a:t>셋째 &amp; 넷째</a:t>')
    expect(paras[3]).toContain('<a:t>마지막</a:t>')
  })

  it('노트 쪽의 노트 칸에 글로 들어간다', async () => {
    const entries = readZip(await buildPptx(input(1, () => '고객 이름을 꼭\n부른다\u0007')))
    const notes = new TextDecoder().decode(entries.find((e) => e.name === 'ppt/notesSlides/notesSlide1.xml')!.data)
    expect(notes).toContain('<p:ph type="body" idx="1"/>')
    expect(notes).toContain('<a:t>고객 이름을 꼭</a:t>')
    expect(notes).toContain('<a:t>부른다</a:t>')
  })
})

describe('발표를 PPT로', () => {
  it('숨긴 장은 빼고 차례대로 그림과 노트를 넣는다', async () => {
    const deck = createDeck({ type: 'deal', audience: 'mixed', minutes: 20, method: 'live', title: '예시: 한빛/제조 제안', org: '영업 2팀', presenter: '김민준', theme: 'white' })
    deck.slides.forEach((s, i) => {
      s.notes = `노트 ${i + 1}`
      s.hidden = i % 3 === 1
    })
    const shown = deck.slides.filter((s) => !s.hidden)
    const seen: string[] = []
    const bytes = await deckToPptx(deck, async (slide, i, total) => {
      expect(total).toBe(shown.length)
      expect(slide.id).toBe(shown[i].id)
      seen.push(slide.id)
      return png(16, 9, [i * 10, 0, 0])
    })
    expect(seen).toEqual(shown.map((s) => s.id))
    const entries = readZip(bytes)
    const slides = entries.filter((e) => /^ppt\/slides\/slide\d+\.xml$/.test(e.name))
    expect(slides).toHaveLength(shown.length)
    expect(entries.filter((e) => /^ppt\/media\/image\d+\.png$/.test(e.name))).toHaveLength(shown.length)
    // 숨긴 장의 노트는 들어가지 않는다
    const allNotes = entries
      .filter((e) => e.name.startsWith('ppt/notesSlides/notesSlide'))
      .map((e) => /<a:t>(.*?)<\/a:t>/.exec(new TextDecoder().decode(e.data))?.[1])
    expect(allNotes.sort()).toEqual(shown.map((s) => s.notes).sort())
    // PNG는 다시 줄이지 않고 그대로 둔다, XML은 줄인다
    expect(entries.find((e) => e.name === 'ppt/media/image1.png')!.method).toBe(0)
    expect(entries.find((e) => e.name === 'ppt/presentation.xml')!.method).toBe(8)
  })
})

// PowerPoint, Keynote에서 직접 열어 볼 견본: PPTX_SAMPLE_OUT=/어딘가/sample.pptx npx vitest run src/export/pptx.test.ts
const SAMPLE_OUT = process.env.PPTX_SAMPLE_OUT
describe.runIf(!!SAMPLE_OUT)('견본 파일', () => {
  it('1920×1080 그림 세 장과 노트로 sample.pptx를 쓴다', async () => {
    const colors: [number, number, number][] = [
      [255, 255, 255],
      [22, 23, 26],
      [47, 85, 212],
    ]
    const notes = ['첫 장: 결론부터 말한다.\n두 번째 줄 & <특수 문자>\n\n빈 줄 다음 줄', '', '마지막 장 노트 👍\t탭']
    const bytes = await buildPptx({ title: '견본 발표 & 테스트', slides: colors.map((c, i) => ({ png: png(1920, 1080, c), notes: notes[i] })) })
    writeFileSync(SAMPLE_OUT!, bytes)
  })
})

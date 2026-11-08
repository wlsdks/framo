// 장마다 그림 한 장을 꽉 채운 PPT 파일(.pptx). 글은 그림이라 고칠 수 없고, 발표자 노트는 PowerPoint의 노트 칸에 글로 들어간다.
//
// 파일의 짜임은 공개 규격 ECMA-376(ISO/IEC 29500) Office Open XML의 PresentationML을 보고 직접 썼다. 다른 라이브러리의 코드를 옮기지 않았다.
// PowerPoint는 빠진 부분이나 어긋난 관계(rId)가 있으면 '복구'를 묻는다. 그래서 꼭 있어야 하는 부분을 모두 넣고,
// 관계와 [Content_Types]는 아래의 parts 목록 하나에서 만들어 서로 어긋나지 않게 한다(pptx.test.ts가 모든 관계의 대상이 있는지 본다).
//
//   presentation ─┬─ slideMaster1 ─┬─ slideLayout1 (빈 장)
//                 │                └─ theme1
//                 ├─ notesMaster1 ── theme2
//                 └─ slideN ─┬─ slideLayout1
//                            ├─ media/imageN.png
//                            └─ notesSlideN ─┬─ notesMaster1
//                                            └─ slideN

import type { Deck, Slide } from '../deck/types'
import { zip, type ZipEntry } from './zip'

/** 16:9 장 크기 (EMU, 1인치 = 914400). PowerPoint의 와이드스크린(13.333 × 7.5인치)과 같다 */
const SLIDE_CX = 12192000
const SLIDE_CY = 6858000
/** 노트 쪽은 세로 7.5 × 10인치 */
const NOTES_CX = 6858000
const NOTES_CY = 9144000

export const PPTX_TYPE = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'

interface PptxSlide {
  /** 장 그림 (16:9 PNG) */
  png: Uint8Array
  notes: string
}

export interface PptxInput {
  title: string
  slides: PptxSlide[]
  /** 파일의 만든 때 (없으면 지금) */
  date?: Date
}

// ---------- XML 글 ----------

/** XML 1.0에 쓸 수 없는 글자: 탭과 줄바꿈 말고의 제어 문자, U+FFFE/FFFF, 짝 없는 서로게이트(u 플래그라 하나짜리로 걸린다) */
const NOT_XML = /[^\t\n\r\u0020-\ud7ff\ue000-\ufffd\u{10000}-\u{10ffff}]/gu

/**
 * XML에 쓸 수 없는 글자만 뺀다. 사람이 적은 글은 무엇이든 들어올 수 있어서(PowerPoint에서 복사한 세로 탭 같은) 하나라도 남으면
 * PowerPoint가 파일 전체를 열지 못하고, 장 그림(SVG)은 그려지지 않는다. 이미 XML로 옮긴 글(rasterize.tsx의 장 그림)에도 쓴다
 */
export const xmlChars = (text: string) => text.replace(NOT_XML, '')

/** XML 1.0에 넣을 수 있는 글로: 쓸 수 없는 글자는 빼고(xmlChars) &, <, >, "는 바꾼다 */
export function xmlText(text: string): string {
  return xmlChars(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
}

const RUN_PR = '<a:rPr lang="ko-KR" altLang="en-US" dirty="0"/>'
const END_PR = '<a:endParaRPr lang="ko-KR" altLang="en-US" dirty="0"/>'

/**
 * 노트 글을 문단으로. 줄마다 한 문단이고, 빈 줄은 빈 문단이다. 끝의 빈 줄은 뺀다.
 * PowerPoint와 Word에서 Shift+Enter로 나눈 줄(세로 탭), 쪽 나눔, 줄 구분 문자도 줄로 나눈다 (빼면 두 줄이 붙었다)
 */
export function notesParagraphs(notes: string): string {
  const lines = notes.replace(/\r\n?|[\v\f\u0085\u2028\u2029]/g, '\n').replace(/\s+$/, '').split('\n')
  return lines
    .map((line) => {
      const t = xmlText(line)
      return t ? `<a:p><a:r>${RUN_PR}<a:t>${t}</a:t></a:r></a:p>` : `<a:p>${END_PR}</a:p>`
    })
    .join('')
}

// ---------- 부분들 ----------

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n'
const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const NS_P = 'http://schemas.openxmlformats.org/presentationml/2006/main'
const NS = `xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"`

const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/'
const REL_TYPE = {
  officeDocument: `${REL}officeDocument`,
  core: 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties',
  app: `${REL}extended-properties`,
  slideMaster: `${REL}slideMaster`,
  slideLayout: `${REL}slideLayout`,
  slide: `${REL}slide`,
  notesMaster: `${REL}notesMaster`,
  notesSlide: `${REL}notesSlide`,
  theme: `${REL}theme`,
  image: `${REL}image`,
  presProps: `${REL}presProps`,
  viewProps: `${REL}viewProps`,
  tableStyles: `${REL}tableStyles`,
}

const PML = 'application/vnd.openxmlformats-officedocument.presentationml.'
const CONTENT_TYPE = {
  presentation: `${PML}presentation.main+xml`,
  slideMaster: `${PML}slideMaster+xml`,
  slideLayout: `${PML}slideLayout+xml`,
  slide: `${PML}slide+xml`,
  notesMaster: `${PML}notesMaster+xml`,
  notesSlide: `${PML}notesSlide+xml`,
  presProps: `${PML}presProps+xml`,
  viewProps: `${PML}viewProps+xml`,
  tableStyles: `${PML}tableStyles+xml`,
  theme: 'application/vnd.openxmlformats-officedocument.theme+xml',
  core: 'application/vnd.openxmlformats-package.core-properties+xml',
  app: 'application/vnd.openxmlformats-officedocument.extended-properties+xml',
}

interface Rel {
  id: string
  type: string
  /** 이 부분이 있는 폴더에서 본 상대 경로 */
  target: string
}

interface PptxPart {
  /** 묶음 안의 경로 (앞의 / 없이) */
  name: string
  data: string | Uint8Array
  /** [Content_Types]의 Override. 없으면 확장자의 Default(.xml, .rels, .png)를 쓴다 */
  contentType?: string
}

function relsXml(rels: Rel[]): string {
  return (
    XML_HEAD +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    rels.map((r) => `<Relationship Id="${r.id}" Type="${r.type}" Target="${r.target}"/>`).join('') +
    '</Relationships>'
  )
}

/** a/b/c.xml의 관계 파일 a/b/_rels/c.xml.rels */
export function relsPathOf(name: string): string {
  const i = name.lastIndexOf('/')
  return `${name.slice(0, i + 1)}_rels/${name.slice(i + 1)}.rels`
}

/** 도형 묶음의 머리. 모든 장, 틀, 노트의 도형 목록이 이것으로 시작한다 */
const TREE_HEAD =
  '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
  '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>'

const CLR_MAP =
  '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>'

const xfrm = (x: number, y: number, cx: number, cy: number) => `<a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>`
const RECT = '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>'

/** 글자 단계의 기본 모양. 장에는 글이 없고 노트에만 쓰이지만, 틀에는 있어야 PowerPoint가 새 글상자를 만들 때 헤매지 않는다 */
function levelStyle(sz: number, font: 'mj' | 'mn'): string {
  return (
    `<a:lvl1pPr marL="0" algn="l" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1">` +
    `<a:defRPr sz="${sz}" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill>` +
    `<a:latin typeface="+${font}-lt"/><a:ea typeface="+${font}-ea"/><a:cs typeface="+${font}-cs"/></a:defRPr></a:lvl1pPr>`
  )
}

/** 테마: 색 12가지, 글꼴 짝, 채우기·선·효과·바탕 모양 각 세 가지는 규격이 꼭 두라고 한 것이다. 장이 그림이라 값은 쓰이지 않는다 */
function themeXml(name: string): string {
  const color = (tag: string, hex: string) => `<a:${tag}><a:srgbClr val="${hex}"/></a:${tag}>`
  const fill = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>'
  const font = '<a:latin typeface="맑은 고딕"/><a:ea typeface="맑은 고딕"/><a:cs typeface=""/><a:font script="Hang" typeface="맑은 고딕"/>'
  return (
    XML_HEAD +
    `<a:theme xmlns:a="${NS_A}" name="${name}"><a:themeElements>` +
    `<a:clrScheme name="gyeol">` +
    color('dk1', '16171A') +
    color('lt1', 'FFFFFF') +
    color('dk2', '2B2D33') +
    color('lt2', 'F4F4F6') +
    color('accent1', '2F55D4') +
    color('accent2', '137A56') +
    color('accent3', 'C93A2E') +
    color('accent4', 'B7791F') +
    color('accent5', '6B4FBB') +
    color('accent6', '4A4C52') +
    color('hlink', '2F55D4') +
    color('folHlink', '6B4FBB') +
    `</a:clrScheme>` +
    `<a:fontScheme name="gyeol"><a:majorFont>${font}</a:majorFont><a:minorFont>${font}</a:minorFont></a:fontScheme>` +
    `<a:fmtScheme name="gyeol">` +
    `<a:fillStyleLst>${fill.repeat(3)}</a:fillStyleLst>` +
    `<a:lnStyleLst>${[6350, 12700, 19050].map((w) => `<a:ln w="${w}">${fill}</a:ln>`).join('')}</a:lnStyleLst>` +
    `<a:effectStyleLst>${'<a:effectStyle><a:effectLst/></a:effectStyle>'.repeat(3)}</a:effectStyleLst>` +
    `<a:bgFillStyleLst>${fill.repeat(3)}</a:bgFillStyleLst>` +
    `</a:fmtScheme>` +
    `</a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>`
  )
}

// 노트 쪽: 위에 장 그림 자리, 아래에 노트 글 자리. 노트 틀과 노트마다 같은 자리를 적어 둔다(Keynote, 구글 프레젠테이션은 틀에서 물려받지 않기도 한다)
const NOTE_MARGIN = 685800
const NOTE_IMG = { x: NOTE_MARGIN, y: NOTE_MARGIN, cx: NOTES_CX - NOTE_MARGIN * 2, cy: Math.round(((NOTES_CX - NOTE_MARGIN * 2) * SLIDE_CY) / SLIDE_CX) }
const NOTE_BODY_Y = NOTE_IMG.y + NOTE_IMG.cy + 457200
const NOTE_BODY = { x: NOTE_MARGIN, y: NOTE_BODY_Y, cx: NOTE_IMG.cx, cy: NOTES_CY - NOTE_BODY_Y - NOTE_MARGIN }

function noteImageShape(ph: string): string {
  return (
    `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Slide Image"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr>` +
    `<p:nvPr>${ph}</p:nvPr></p:nvSpPr>` +
    `<p:spPr>${xfrm(NOTE_IMG.x, NOTE_IMG.y, NOTE_IMG.cx, NOTE_IMG.cy)}${RECT}</p:spPr></p:sp>`
  )
}

function noteBodyShape(ph: string, paragraphs: string): string {
  return (
    `<p:sp><p:nvSpPr><p:cNvPr id="3" name="Notes"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>` +
    `<p:nvPr>${ph}</p:nvPr></p:nvSpPr>` +
    `<p:spPr>${xfrm(NOTE_BODY.x, NOTE_BODY.y, NOTE_BODY.cx, NOTE_BODY.cy)}${RECT}</p:spPr>` +
    `<p:txBody><a:bodyPr wrap="square" lIns="91440" tIns="45720" rIns="91440" bIns="45720"/><a:lstStyle/>${paragraphs}</p:txBody></p:sp>`
  )
}

function slideXml(index: number): string {
  return (
    XML_HEAD +
    `<p:sld ${NS}><p:cSld><p:spTree>${TREE_HEAD}` +
    `<p:pic><p:nvPicPr><p:cNvPr id="2" name="슬라이드 ${index}"/><p:cNvPicPr><a:picLocks noGrp="1" noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>` +
    `<p:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>` +
    `<p:spPr>${xfrm(0, 0, SLIDE_CX, SLIDE_CY)}${RECT}</p:spPr></p:pic>` +
    `</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`
  )
}

function notesSlideXml(notes: string): string {
  return (
    XML_HEAD +
    `<p:notes ${NS}><p:cSld><p:spTree>${TREE_HEAD}` +
    noteImageShape('<p:ph type="sldImg"/>') +
    noteBodyShape('<p:ph type="body" idx="1"/>', notesParagraphs(notes)) +
    `</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>`
  )
}

/** W3CDTF (초까지, UTC) */
function w3cdtf(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

/** PPT 파일을 이루는 부분들. 관계 파일과 [Content_Types].xml까지 모두 들어 있다 */
export function pptxParts({ title, slides, date = new Date() }: PptxInput): PptxPart[] {
  const parts: PptxPart[] = []
  const withRels = (part: PptxPart, rels: Rel[]) => {
    parts.push(part)
    if (rels.length) parts.push({ name: relsPathOf(part.name), data: relsXml(rels) })
  }
  const notesCount = slides.filter((s) => s.notes.trim()).length

  parts.push({
    name: '_rels/.rels',
    data: relsXml([
      { id: 'rId1', type: REL_TYPE.officeDocument, target: 'ppt/presentation.xml' },
      { id: 'rId2', type: REL_TYPE.core, target: 'docProps/core.xml' },
      { id: 'rId3', type: REL_TYPE.app, target: 'docProps/app.xml' },
    ]),
  })

  parts.push({
    name: 'docProps/core.xml',
    contentType: CONTENT_TYPE.core,
    data:
      XML_HEAD +
      '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
      `<dc:title>${xmlText(title)}</dc:title>` +
      `<dcterms:created xsi:type="dcterms:W3CDTF">${w3cdtf(date)}</dcterms:created>` +
      `<dcterms:modified xsi:type="dcterms:W3CDTF">${w3cdtf(date)}</dcterms:modified>` +
      '</cp:coreProperties>',
  })

  parts.push({
    name: 'docProps/app.xml',
    contentType: CONTENT_TYPE.app,
    data:
      XML_HEAD +
      '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">' +
      `<Application>Framo</Application><Slides>${slides.length}</Slides><Notes>${notesCount}</Notes>` +
      '</Properties>',
  })

  // 발표: 틀, 노트 틀, 장들. 장 id는 256부터, 틀 id는 2147483648부터(규격이 정한 범위)
  const slideRel = (i: number) => `rId${7 + i}`
  withRels(
    {
      name: 'ppt/presentation.xml',
      contentType: CONTENT_TYPE.presentation,
      data:
        XML_HEAD +
        `<p:presentation ${NS}>` +
        '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>' +
        '<p:notesMasterIdLst><p:notesMasterId r:id="rId2"/></p:notesMasterIdLst>' +
        (slides.length ? `<p:sldIdLst>${slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="${slideRel(i)}"/>`).join('')}</p:sldIdLst>` : '') +
        `<p:sldSz cx="${SLIDE_CX}" cy="${SLIDE_CY}"/><p:notesSz cx="${NOTES_CX}" cy="${NOTES_CY}"/>` +
        '</p:presentation>',
    },
    [
      { id: 'rId1', type: REL_TYPE.slideMaster, target: 'slideMasters/slideMaster1.xml' },
      { id: 'rId2', type: REL_TYPE.notesMaster, target: 'notesMasters/notesMaster1.xml' },
      { id: 'rId3', type: REL_TYPE.theme, target: 'theme/theme1.xml' },
      { id: 'rId4', type: REL_TYPE.presProps, target: 'presProps.xml' },
      { id: 'rId5', type: REL_TYPE.viewProps, target: 'viewProps.xml' },
      { id: 'rId6', type: REL_TYPE.tableStyles, target: 'tableStyles.xml' },
      ...slides.map((_, i) => ({ id: slideRel(i), type: REL_TYPE.slide, target: `slides/slide${i + 1}.xml` })),
    ],
  )

  parts.push({ name: 'ppt/presProps.xml', contentType: CONTENT_TYPE.presProps, data: XML_HEAD + `<p:presentationPr ${NS}/>` })
  // 노트 칸이 보이게: 장 쪽을 창 높이의 80%로
  parts.push({
    name: 'ppt/viewProps.xml',
    contentType: CONTENT_TYPE.viewProps,
    data: XML_HEAD + `<p:viewPr ${NS}><p:normalViewPr><p:restoredLeft sz="15000"/><p:restoredTop sz="80000"/></p:normalViewPr></p:viewPr>`,
  })
  // 표 모양 목록은 비어 있어도 된다. def는 꼭 있어야 해서 PowerPoint에 들어 있는 기본 표 모양의 id를 적는다
  parts.push({
    name: 'ppt/tableStyles.xml',
    contentType: CONTENT_TYPE.tableStyles,
    data: XML_HEAD + `<a:tblStyleLst xmlns:a="${NS_A}" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>`,
  })

  withRels(
    {
      name: 'ppt/slideMasters/slideMaster1.xml',
      contentType: CONTENT_TYPE.slideMaster,
      data:
        XML_HEAD +
        `<p:sldMaster ${NS}><p:cSld>` +
        '<p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>' +
        `<p:spTree>${TREE_HEAD}</p:spTree></p:cSld>` +
        CLR_MAP +
        '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>' +
        `<p:txStyles><p:titleStyle>${levelStyle(4400, 'mj')}</p:titleStyle><p:bodyStyle>${levelStyle(2800, 'mn')}</p:bodyStyle><p:otherStyle>${levelStyle(1800, 'mn')}</p:otherStyle></p:txStyles>` +
        '</p:sldMaster>',
    },
    [
      { id: 'rId1', type: REL_TYPE.slideLayout, target: '../slideLayouts/slideLayout1.xml' },
      { id: 'rId2', type: REL_TYPE.theme, target: '../theme/theme1.xml' },
    ],
  )

  withRels(
    {
      name: 'ppt/slideLayouts/slideLayout1.xml',
      contentType: CONTENT_TYPE.slideLayout,
      data:
        XML_HEAD +
        `<p:sldLayout ${NS} type="blank" preserve="1"><p:cSld name="빈 화면"><p:spTree>${TREE_HEAD}</p:spTree></p:cSld>` +
        '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>',
    },
    [{ id: 'rId1', type: REL_TYPE.slideMaster, target: '../slideMasters/slideMaster1.xml' }],
  )

  parts.push({ name: 'ppt/theme/theme1.xml', contentType: CONTENT_TYPE.theme, data: themeXml('gyeol') })

  withRels(
    {
      name: 'ppt/notesMasters/notesMaster1.xml',
      contentType: CONTENT_TYPE.notesMaster,
      data:
        XML_HEAD +
        `<p:notesMaster ${NS}><p:cSld><p:spTree>${TREE_HEAD}` +
        noteImageShape('<p:ph type="sldImg" idx="2"/>') +
        noteBodyShape('<p:ph type="body" sz="quarter" idx="3"/>', `<a:p>${END_PR}</a:p>`) +
        `</p:spTree></p:cSld>${CLR_MAP}<p:notesStyle>${levelStyle(1200, 'mn')}</p:notesStyle></p:notesMaster>`,
    },
    [{ id: 'rId1', type: REL_TYPE.theme, target: '../theme/theme2.xml' }],
  )
  parts.push({ name: 'ppt/theme/theme2.xml', contentType: CONTENT_TYPE.theme, data: themeXml('Framo notes') })

  slides.forEach((s, i) => {
    const n = i + 1
    const hasNotes = !!s.notes.trim()
    withRels({ name: `ppt/slides/slide${n}.xml`, contentType: CONTENT_TYPE.slide, data: slideXml(n) }, [
      { id: 'rId1', type: REL_TYPE.slideLayout, target: '../slideLayouts/slideLayout1.xml' },
      { id: 'rId2', type: REL_TYPE.image, target: `../media/image${n}.png` },
      ...(hasNotes ? [{ id: 'rId3', type: REL_TYPE.notesSlide, target: `../notesSlides/notesSlide${n}.xml` }] : []),
    ])
    parts.push({ name: `ppt/media/image${n}.png`, data: s.png })
    // 노트가 없는 장은 노트 쪽을 만들지 않는다 (PowerPoint도 노트를 적을 때 만든다)
    if (hasNotes)
      withRels({ name: `ppt/notesSlides/notesSlide${n}.xml`, contentType: CONTENT_TYPE.notesSlide, data: notesSlideXml(s.notes) }, [
        { id: 'rId1', type: REL_TYPE.notesMaster, target: '../notesMasters/notesMaster1.xml' },
        { id: 'rId2', type: REL_TYPE.slide, target: `../slides/slide${n}.xml` },
      ])
  })

  // [Content_Types].xml은 맨 앞에 둔다 (규격은 차례를 정하지 않지만 다른 프로그램이 대개 그렇게 둔다)
  const types =
    XML_HEAD +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Default Extension="png" ContentType="image/png"/>' +
    parts
      .filter((p) => p.contentType)
      .map((p) => `<Override PartName="/${p.name}" ContentType="${p.contentType}"/>`)
      .join('') +
    '</Types>'
  return [{ name: '[Content_Types].xml', data: types }, ...parts]
}

const utf8 = new TextEncoder()

/** PPT 파일 한 개의 바이트 */
export async function buildPptx(input: PptxInput): Promise<Uint8Array<ArrayBuffer>> {
  const entries: ZipEntry[] = pptxParts(input).map((p) =>
    typeof p.data === 'string' ? { name: p.name, data: utf8.encode(p.data), deflate: true } : { name: p.name, data: p.data },
  )
  return zip(entries, input.date)
}

/** PPT에 들어갈 장: 숨긴 장은 빼고, 발표할 때의 차례대로 */
export function pptxSlidesOf(deck: Pick<Deck, 'slides'>): Slide[] {
  return deck.slides.filter((s) => !s.hidden)
}

/**
 * 발표를 PPT 파일로. 장 그림은 render가 만든다(화면에서는 export/rasterize.tsx). 그림을 다 만든 뒤에 묶는다.
 * render는 차례대로 한 장씩 부른다: 한꺼번에 그리면 화면이 멈추고 메모리를 많이 쓴다
 */
export async function deckToPptx(
  deck: Pick<Deck, 'slides' | 'title'>,
  render: (slide: Slide, index: number, total: number) => Promise<Uint8Array>,
): Promise<Uint8Array<ArrayBuffer>> {
  const shown = pptxSlidesOf(deck)
  const slides: PptxSlide[] = []
  for (let i = 0; i < shown.length; i++) slides.push({ png: await render(shown[i], i, shown.length), notes: shown[i].notes ?? '' })
  return buildPptx({ title: deck.title, slides })
}

// Framo MCP 서버(id는 예전 이름 gyeol). Claude Code, Codex가 발표의 '모양'만 보고 바꾸자고 제안할 수 있게 한다.
//
// 내용이 새지 않게 세 겹으로 막는다.
// 1. 볼 수 있는 곳: 'AI 공유' 폴더뿐. 스스로를 Node 권한 모델(--permission) 안에서 다시 띄워서
//    그 폴더 밖의 파일(.deck 작업 파일 등)은 Node 수준에서 읽기 자체가 막힌다. 다른 프로그램 실행도 막힌다.
//    권한 모델은 심볼릭 링크를 따라가 버리므로, 링크와 하드 링크는 아예 읽지 않고 실제 위치도 확인한다.
// 2. 읽는 것: 모양 파일도 checkShape로 다시 확인하고, 어긋나면 통째로 버린다.
// 3. 내보내는 것: 응답 안의 모든 글자가 카탈로그, 정해진 말, 해시 id 중 하나인지 마지막으로 확인한다.
//    하나라도 아니면 응답 대신 정해진 오류만 보낸다. 오류 메시지에도 받은 값이나 경로를 넣지 않는다.
//
// 바꾸는 것은 제안(requests)으로만 남기고, 사람이 앱에서 보고 적용하거나 거절한다.

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, realpathSync, renameSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, parse, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { version } from '../package.json'
import { isObj } from '../src/ai/guards'
import { askOf, ASKS, mcpPrompt, PAGE_MAX } from '../src/ai/asks'
import { checkOps } from '../src/ai/check'
import { cleanNote, MAX_OPS, NOTE_MAX, OP_CODES, OP_KEYS, OP_NAMES, parseRequest, ROLE_MAX, requestId, type ChangeRequest, type OpCode } from '../src/ai/ops'
import {
  deckOfFile,
  DECK_ID,
  HIGHLIGHT_MAX,
  HIGHLIGHT_MIN,
  MAX_ITEMS,
  MCP_SERVER_NAME,
  REQUEST_FORMAT,
  REQUEST_ID,
  REQUEST_VERSION,
  RESULT_STATUSES,
  SHAPE_FORMAT,
  SHARE_DIR_NAME,
  SHARE_SUBDIRS,
  type ShareSubdir,
} from '../src/ai/protocol'
import { catalog, checkShape, onlyKnownStrings, type ShapeDeck } from '../src/ai/share'
import { BLOCK_EFFECT_IDS, BLOCK_FROM_IDS, BLOCK_LINK_IDS, BLOCK_LOOK_IDS, BLOCK_REVEAL_IDS, BLOCK_SPEED_IDS, BLOCK_TYPES, BLOCK_WHEN_IDS, BOARD_COLS, BOARD_ROWS, MAX_BLOCKS } from '../src/deck/blocks'
import { DURATIONS } from '../src/deck/blueprints'
import { targetCount } from '../src/deck/generate'
import { LAYOUT_ORDER } from '../src/deck/layouts'
import { SCENE_IDS } from '../src/deck/scenes'
import { FONTS, FOOTERS, MOTIONS, PLACES, TEXT_SIZES, THEME_ORDER, TONES, TRANSITIONS } from '../src/deck/themes'
import { readJson, realDir } from '../server/shareFiles'

// 판 번호는 package.json에서 빌드할 때 넣는다. 예전에는 따로 적어 두어 0.1.0에 멈춰 있었다
const VERSION = version
const PROTOCOLS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05']
const MAX_PENDING_PER_DECK = 5

// ---------- 정해진 말: 응답에 나가도 되는 글자 ----------

const MESSAGES = {
  noDeck: '공유된 발표가 아니에요. list_decks로 확인하세요.',
  badShape: '모양 파일을 읽을 수 없어요. 앱에서 발표를 다시 열면 새로 만들어져요.',
  badRequest: '제안의 꼴이 맞지 않아요. check_changes로 보내면 어느 op의 어느 키가 틀렸는지 알려 줘요.',
  tooMany: '이 발표에 아직 보지 않은 제안이 많아요. 사람이 앱에서 확인한 뒤에 다시 보내세요.',
  unknownRequest: '모르는 제안 id예요. propose_changes가 돌려준 request(r로 시작)를 그대로 쓰세요. 오래된 결과는 지워져요.',
  blocked: '응답에 내보낼 수 없는 값이 있어서 막았어요.',
  unknownTool: '모르는 도구예요.',
  pending:
    '사용자가 Framo 편집 화면에서 이 발표를 열면 제안이 떠요. 사람이 미리 보고 적용하거나 거절한 뒤에 get_result로 결과를 볼 수 있어요. ' +
    '되풀이해 묻지 말고 사용자에게 그렇게 알리세요.',
  checked:
    '미리 돌려 보기만 했고 아무것도 보내지 않았어요. ok가 false인 op는 help의 그 코드 풀이대로 고치거나 빼고 propose_changes로 보내세요. ' +
    '노트나 제목의 실제 길이처럼 모양에 없는 것 때문에 앱에서 조금 다를 수 있어요.',
  internal: '처리하지 못했어요. 한 번만 다시 해 보고, 또 안 되면 Framo를 껐다 켜 달라고 사용자에게 알리세요.',
} as const

/**
 * 결과 코드마다 AI가 무엇을 고치면 되는지. 정해진 말이라 응답에 나가도 된다.
 * Record라서 OpCode에 코드를 더하면 여기도 채워야 컴파일된다 (예전에는 코드만 보고 AI가 같은 op를 다시 보냈다)
 */
const CODE_HELP: Record<Exclude<OpCode, 'applied'> | 'invalid', string> = {
  no_slide: '그 장이 이 발표에 없어요. get_shape의 slides[].id나 같은 제안에서 add_slide의 as로 붙인 이름을 쓰세요.',
  has_content: '사람이 적은 글이 있어서 지우거나 줄일 수 없어요. 장은 set_hidden으로 발표에서 빼고, 항목과 부품은 그대로 두세요.',
  out_of_range: '고를 수 있는 범위 밖이에요. 카탈로그의 항목 수(items.min, max), 옆 판 너비(panes.sides), 지금 항목 수, 판 끝(이음표)을 확인하세요.',
  not_for_layout: '이 장이나 부품의 레이아웃에서는 쓸 수 없는 값이에요. 카탈로그 layouts[]나 blocks[]에 그 값(highlight, panes, place, variants, fields)이 있는지 보세요. 표지, 섹션, 결정 요청 장은 바탕(tone)을 바꿀 수 없어요.',
  last_slide: '남은 장이 하나뿐이라 지울 수 없어요.',
  unknown_role: '카탈로그 deckTypes[].roles[].role에 있는 역할 이름이 아니에요. 그 이름을 그대로 쓰거나 layout을 같이 주세요.',
  no_change: '이미 그 값이라 바뀌는 것이 없어요. 이 op는 빼세요.',
  not_reviewed: '사람이 제안을 보기 전에 이 발표의 AI 공유를 꺼서 적용되지 않았어요. 사용자가 다시 켜기 전에는 같은 제안을 보내지 마세요.',
  no_block: '그 부품이 이 장에 없어요. get_shape의 blocks[].id나 같은 제안에서 add_block의 as로 붙인 이름을 쓰세요.',
  no_room: '장에 자리가 모자라요. 부품 수를 줄이거나 다른 자리에 넣고, 부품의 가장 좁은 너비(blocks[].minSpan)를 확인하세요.',
  look_clash: '한 장에는 면 한 가지만 써요: 들여 쓰기(card)끼리, 또는 강조(bold) 하나와 바탕 없는(plain) 부품들. 혼자 장 너비를 다 쓰는 부품은 바탕 없이 그려져요.',
  link_clash: '이음표가 잇는 두 부품의 갈래(blocks[].kind)가 맞지 않아요. 더하기와 견주기는 같은 갈래끼리, 결과는 숫자나 한마디로 맺을 때만 써요.',
  scene_unfit: '이 장에 맞지 않는 장면이에요. 카탈로그 scenes[].layouts와 blocks를 보고 맞는 장면을 고르거나 빼세요.',
  invalid: '꼴이 맞지 않아요: 그 op에 없는 키, 목록에 없는 값, 빠진 값, 너무 긴 글. key가 있으면 그 키를 고치세요. 이런 op가 하나라도 있으면 propose_changes는 제안을 통째로 받지 않아요.',
}
/** 빠진 op들의 코드마다 풀이 하나씩. op마다 붙이면 같은 글이 되풀이되어 AI가 읽을 것만 늘었다 */
function helpFor(results: { ok: boolean; code: string }[]): Record<string, string> {
  const codes = results.filter((r) => !r.ok && Object.hasOwn(CODE_HELP, r.code)).map((r) => r.code as keyof typeof CODE_HELP)
  return Object.fromEntries([...new Set(codes)].map((c) => [c, CODE_HELP[c]]))
}

const PROTOCOL_WORDS = [
  // 모양 파일
  SHAPE_FORMAT, 'format', 'version', 'deck', 'type', 'audience', 'duration', 'method', 'theme', 'accent', 'motion', 'font', 'size', 'footer', 'transition', 'tone', 'updatedAt', 'slides',
  'id', 'layout', 'role', 'section', 'hidden', 'hiddenItems', 'fields', 'items', 'options', 'highlight', 'flip', 'pane', 'contain', 'place', 'variant', 'variants', 'base',
  'empty', 'filled', 'long',
  // 장면 (장의 options.scene). id는 카탈로그에도 있지만 모양의 값이라 여기에도 적어 둔다
  'scene', ...SCENE_IDS,
  // 부품 장
  'blocks', 'x', 'y', 'w', 'h', 'look', 'effect', 'when', 'speed', 'reveal', 'each', 'all', 'from', 'order', 'link', 'linkBelow',
  // 목록과 결과
  'decks', 'slideCount', 'visibleSlides', 'request', 'status', 'results', 'ok', 'code', 'message', 'pending', 'applied', 'rejected', 'invalid', 'unknown',
  'no_slide', 'has_content', 'out_of_range', 'not_for_layout', 'last_slide', 'unknown_role', 'no_change', 'not_reviewed', 'no_block', 'no_room', 'look_clash', 'link_clash', 'scene_unfit',
  ...OP_NAMES,
  ...Object.values(MESSAGES),
  // 미리 돌려 보기(check_changes)와 결과의 풀이
  'help', 'key', 'accepted', 'skipped', 'note', ...new Set(Object.values(OP_KEYS).flat()), ...OP_CODES, ...Object.values(CODE_HELP),
]

// ---------- 'AI 공유' 폴더 ----------

type Dirs = Record<ShareSubdir, string>

// 파일은 readJson(server/shareFiles.ts)으로만 읽는다. 링크, 하드 링크, 실제 위치가 폴더 밖인 파일은
// 읽지 않는다. 권한 모델이 링크를 따라가는 것을 거기서 막는다. 로컬 서버도 같은 규칙으로 읽는다.

/** 공유 폴더의 하위 폴더가 링크면 다른 곳을 읽고 쓰게 되므로 시작하지 않는다 */
function checkDirs(dirs: Dirs): boolean {
  return Object.values(dirs).every(realDir)
}

function readShape(dirs: Dirs, deck: string): ShapeDeck | null {
  if (!DECK_ID.test(deck)) return null
  const shape = readJson(join(dirs.decks, `${deck}.json`))
  return checkShape(shape) && shape.deck === deck ? shape : null
}

function listShapes(dirs: Dirs): ShapeDeck[] {
  if (!existsSync(dirs.decks)) return []
  return readdirSync(dirs.decks)
    .map(deckOfFile)
    .map((d) => (d ? readShape(dirs, d) : null))
    .filter((s): s is ShapeDeck => !!s)
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

function pendingFor(dirs: Dirs, deck: string): ChangeRequest[] {
  if (!existsSync(dirs.requests)) return []
  return readdirSync(dirs.requests)
    .filter((n) => n.endsWith('.json'))
    .map((n) => parseRequest(readJson(join(dirs.requests, n))))
    .filter((r): r is ChangeRequest => !!r && r.deck === deck)
}

// ---------- 도구 ----------

class ToolError extends Error {}

const refSchema = { type: 'string', description: '장 id(s로 시작하는 9글자) 또는 같은 제안에서 add_slide의 as로 붙인 이름(n1, n2...)' }
const blockRefSchema = { type: 'string', description: '부품 id(get_shape의 blocks[].id, b로 시작하는 9글자) 또는 같은 제안에서 add_block의 as로 붙인 이름(p1, p2...)' }

/** 제안의 꼴. propose_changes와 check_changes가 같이 쓴다 */
const CHANGES_SCHEMA = {
  type: 'object',
  properties: {
    deck: { type: 'string' },
    note: { type: 'string', maxLength: NOTE_MAX, description: '무엇을 왜 바꾸는지 사용자에게 보여 줄 짧은 설명' },
    ops: {
      type: 'array',
      minItems: 1,
      maxItems: MAX_OPS,
      items: {
        type: 'object',
        properties: {
          op: { type: 'string', enum: OP_NAMES },
          slide: refSchema,
          after: { anyOf: [refSchema, { type: 'null' }] },
          layout: { type: 'string', enum: LAYOUT_ORDER },
          role: { type: 'string', maxLength: ROLE_MAX },
          as: { type: 'string', pattern: '^[np][0-9]{1,2}$' },
          hidden: { type: 'boolean' },
          count: { type: 'integer', minimum: 0, maximum: MAX_ITEMS },
          highlight: { type: 'integer', minimum: HIGHLIGHT_MIN, maximum: HIGHLIGHT_MAX },
          flip: { type: 'boolean' },
          pane: { anyOf: [{ type: 'integer', minimum: 1, maximum: 12 }, { type: 'null' }] },
          contain: { type: 'boolean' },
          hideHead: { type: 'boolean' },
          hideFoot: { type: 'boolean' },
          variant: { type: 'string', maxLength: 24 },
          theme: { type: 'string', enum: THEME_ORDER },
          accent: { anyOf: [{ type: 'string', pattern: '^#[0-9a-fA-F]{6}$' }, { type: 'null' }] },
          motion: { anyOf: [{ type: 'string', enum: MOTIONS.map((m) => m.id) }, { type: 'null' }] },
          tone: { type: 'string', enum: TONES.map((m) => m.id) },
          place: { anyOf: [{ type: 'string', enum: PLACES.map((m) => m.id) }, { type: 'null' }] },
          font: { anyOf: [{ type: 'string', enum: FONTS.map((m) => m.id) }, { type: 'null' }] },
          size: { type: 'string', enum: TEXT_SIZES.map((m) => m.id) },
          footer: { type: 'string', enum: FOOTERS.map((m) => m.id) },
          transition: { anyOf: [{ type: 'string', enum: TRANSITIONS.map((m) => m.id) }, { type: 'null' }] },
          scene: { anyOf: [{ type: 'string', enum: SCENE_IDS }, { type: 'null' }] },
          field: { type: 'string' },
          item: { type: 'integer', minimum: 0, maximum: MAX_ITEMS - 1 },
          text: { type: 'string' },
          block: blockRefSchema,
          type: { type: 'string', enum: BLOCK_TYPES },
          look: { type: 'string', enum: BLOCK_LOOK_IDS },
          effect: { type: 'string', enum: BLOCK_EFFECT_IDS },
          when: { type: 'string', enum: BLOCK_WHEN_IDS },
          speed: { type: 'string', enum: BLOCK_SPEED_IDS },
          reveal: { type: 'string', enum: BLOCK_REVEAL_IDS },
          from: { type: 'string', enum: BLOCK_FROM_IDS },
          order: { type: 'array', maxItems: MAX_BLOCKS, items: blockRefSchema },
          beside: blockRefSchema,
          side: { type: 'string', enum: ['before', 'after', 'above', 'below', 'right'] },
          edge: { type: 'string', enum: ['top', 'bottom'] },
          swap: blockRefSchema,
          w: { type: 'integer', minimum: 1, maximum: BOARD_COLS },
          h: { type: 'integer', minimum: 1, maximum: BOARD_ROWS },
          link: { anyOf: [{ type: 'string', enum: BLOCK_LINK_IDS }, { type: 'null' }] },
        },
        required: ['op'],
        additionalProperties: false,
      },
    },
  },
  required: ['deck', 'ops'],
  additionalProperties: false,
}

const TOOLS = [
  {
    name: 'list_decks',
    description:
      '사용자가 앱에서 AI 공유를 켠 발표 목록. 제목은 없고 해시 id(d로 시작)로 구분한다. 발표 종류, 장 수, 듣는 사람, 시간이 나온다. ' +
      '최근에 고친 순서라서, 여러 개면 맨 앞이 지금 고치고 있는 발표일 가능성이 크다. 목록이 비었으면 Framo 편집 화면 위쪽 ‘AI 다듬기’를 열고 아래 ‘보이는 것, 직접 연결’에서 ‘이 발표를 AI에게 보여 주기’를 켜 달라고 안내한다.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'get_catalog',
    description:
      '쓸 수 있는 레이아웃(칸과 항목 수 범위 포함), 발표 종류별 장 역할(role)과 순서, 듣는 사람, 시간, 방식, 테마, 부품 장에 쓰이는 부품(blocks). ' +
      '제안을 만들기 전에 한 번 읽는다. add_slide의 role에 여기 나온 역할 이름을 쓰면 그 장의 안내와 이름표까지 같이 들어간다. ' +
      '거짓(false)과 없음(null)인 값은 빠진다: 예를 들어 highlight가 없는 레이아웃은 강조할 항목을 고를 수 없다. ' +
      '크니까 deck을 주어 그 발표 종류의 역할만 받고, 부품 장(layout compose)을 만들거나 고치지 않을 때는 blocks를 false로 해서 부품 목록을 뺀다. ' +
      'roles[].priority는 1이 늘 넣는 장이고, 시간이 짧아 장을 줄일 때는 3, 2 차례로 뒤쪽부터 뺀다(듣는 사람에 따라 2와 3이 한 단계 오르내린다). ' +
      `시간마다 맞추는 장 수: ${DURATIONS.map((d) => `${d.name} ${targetCount(d.minutes)}장`).join(', ')}.`,
    inputSchema: {
      type: 'object',
      properties: {
        deck: { type: 'string', description: '이 발표(list_decks의 deck)의 종류에 맞는 역할만 받기' },
        blocks: { type: 'boolean', description: 'false면 부품 장의 부품과 그 고르는 값(blocks, blockRules, blockLooks, blockEffects, blockWhens, blockSpeeds, blockReveals, blockFroms, blockLinks)을 뺀다. 기본 true' },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'get_shape',
    description:
      '발표 하나의 모양: 장 순서, 장마다 레이아웃과 역할, 숨김 여부, 칸마다 비었는지(empty)/채웠는지(filled)/길어서 넘칠 수 있는지(long), 항목 수, 옵션, 테마. ' +
      '부품 장(layout compose)은 가로 12칸, 세로 12칸의 판을 부품들이 빈틈없이 나눠 덮은 장으로, blocks에 부품마다 id(b로 시작), 종류, 자리(x, y는 왼쪽 위 칸, w, h는 너비와 높이의 칸 수), 모양, 바탕, 움직임, 이음표(link는 오른쪽 선, linkBelow는 아래 선), 칸 상태가 읽는 차례로 나온다. ' +
        '부품의 when/speed/reveal/from은 기본값이 아닐 때만 나오고, 장의 options.order는 부품이 나오는 차례를 정했을 때만 나온다. ' +
        '장의 options.scene은 골라 둔 장면(카탈로그 scenes)이고, 그 장에 맞을 때만 나온다. ' +
      '사람이 적은 글은 이 서버에 없다. 글의 내용을 추측하거나 사용자에게 붙여 달라고 하지 말고 모양만으로 판단한다.',
    inputSchema: {
      type: 'object',
      properties: { deck: { type: 'string', description: 'list_decks의 deck (d로 시작하는 9글자)' } },
      required: ['deck'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'check_changes',
    description:
      'propose_changes와 같은 인자를 받아 미리 돌려 보기만 한다. 아무것도 보내지 않고 사용자에게도 보이지 않는다. ' +
      'op마다 앱에서 적용하면 어떻게 될지(ok, code)가 나오고, 안 되는 op에는 까닭이 된 키(key)가 붙는다. help에는 나온 코드마다 무엇을 고치면 되는지 나온다. ' +
      'ops는 차례로, 앞의 op가 적용된 위에서 본다(add_slide, add_block의 as 이름도 쓸 수 있다). code가 invalid인 op가 있으면 propose_changes가 제안을 통째로 받지 않으니(accepted가 false) 고치거나 뺀다. ' +
      'propose_changes를 부르기 전에 한 번 부르고, ok가 false인 op를 고치거나 빼서 보낸다. 모양에 없는 것(노트, 제목의 실제 길이) 때문에 앱의 결과와 조금 다를 수 있다.',
    inputSchema: CHANGES_SCHEMA,
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'propose_changes',
    description: [
      '발표의 모양을 바꾸자는 제안을 보낸다. 바로 바뀌지 않고, 사용자가 앱에서 미리 보고 적용하거나 거절한다. 적용 전 상태는 버전으로 남는다.',
      '사람이 적은 글은 쓸 수도 지울 수도 없다. 쓸 수 있는 글은 note(사용자에게 보이는 제안 설명), set_guide(장 안내), set_hint(칸의 회색 안내 문구)뿐이고 모두 안내다. 내용처럼 보이는 문장(숫자, 회사명, 결론)을 안내 문구에 넣지 않는다.',
      'ops는 차례로 적용되고, 되지 않는 것은 건너뛴다. 한 op에 고르는 값을 여럿 담으면 하나만 안 돼도 그 op가 통째로 빠지니, 될지 모르는 값(장면, 강조, 바탕)은 따로 담는다. 보내기 전에 check_changes로 같은 인자를 미리 돌려 본다.',
      '- add_slide {after: 장 id 또는 null(맨 앞), role?: 카탈로그의 역할 이름, layout?: 레이아웃 id, as?: "n1"} role이나 layout 중 하나는 있어야 한다.',
      '- remove_slide {slide} 빈 장만 지운다. 내용이 있으면 has_content로 실패하니 set_hidden을 쓴다.',
      '- move_slide {slide, after: 장 id 또는 null(맨 앞)}',
      '- set_layout {slide, layout, variant?} 내용은 그대로 두고 모양만 바꾼다. variant는 카탈로그 layouts[].variants의 id. 넘치는 항목은 숨겨질 뿐 지워지지 않는다. ' +
        'layout을 compose로 하면 같은 내용의 부품 장이 되고(표지, 섹션 장은 안 됨), 부품 장은 그 레이아웃의 부품 하나뿐일 때만 다른 레이아웃으로 되돌릴 수 있다.',
      '- set_hidden {slide, hidden} 발표에서 빼거나 다시 넣는다.',
      '- set_item_count {slide, count} 항목 수. 줄일 때는 끝의 빈 항목만 지운다.',
      '- set_options {slide, highlight?: 강조할 항목 번호(0부터, -1은 없음; 카탈로그 layouts[].highlight가 있는 레이아웃만), flip?: 옆 판을 반대쪽에, pane?: 옆 판 너비(layouts[].panes.sides 중 하나, null은 기본; 둘 다 panes가 있는 레이아웃의 panes.variants 모양에서만), contain?: 이미지와 설명의 이미지를 자르지 않기, hideHead?: 제목과 부제 숨기기, hideFoot?: 출처와 아래 표시 숨기기(글은 지우지 않음), motion?: 이 장만 다른 움직임(카탈로그 motions, null은 발표 전체 설정대로), tone?: 이 장의 바탕(카탈로그 tones; 표지, 섹션, 결정 요청은 안 됨), place?: 제목 덩어리의 자리(카탈로그 places, null은 기본; layouts[].place가 있는 레이아웃만), transition?: 이 장으로 넘어올 때(카탈로그 transitions, null은 발표 전체 설정대로; morph는 앞 장과 같은 제목이나 부품이 새 자리로 옮겨 간다), scene?: 장면(카탈로그 scenes의 id, null은 장면 끄기; 그 장에 맞는 것만, 아니면 scene_unfit)}',
      '장면(scene)은 장 하나를 영화의 한 컷처럼 처음부터 끝까지 짠 움직임이다. 맞는 장: scenes[].layouts의 레이아웃, 또는 부품 장에 scenes[].blocks의 부품이 하나라도 있을 때(compare는 나란히 선 두 부품뿐인 부품 장에도). ' +
        '장면을 고른 장은 부품마다의 effect, speed, from 대신 장면대로 움직이고, when과 나오는 차례(order)는 그대로다. 움직임 정도(motion)가 none이면 장면도 쉰다.',
      '- set_theme {theme?: 테마 id, accent?: "#rrggbb"(카탈로그 accents의 강조색에서 고르기) 또는 null(테마 기본색), motion?: 발표할 때 움직임(카탈로그 motions), font?: 제목 글꼴(카탈로그 fonts, null은 테마 글꼴), size?: 글자 크기(textSizes), footer?: 아래 표시(footers), transition?: 장 넘기기(transitions)}. null은 accent와 font만 받는다(테마 기본으로). 나머지는 장마다의 set_options와 달리 null을 받지 않는다',
      '바탕(tone)은 흐름을 끊고 눈길을 모을 장 한두 곳에만 쓴다. 모든 장을 바꾸면 오히려 아무것도 눈에 띄지 않는다.',
      '- set_guide {slide, text} 이 장을 어떻게 채우면 좋은지 (200자 이내)',
      '- set_hint {slide, block?, field, item?, text} 칸의 안내 문구 (80자 이내, 한 줄). item을 빼면 장의 칸, 장에 없는 칸이면 모든 항목의 그 칸. block이 있으면 부품 장의 그 부품 칸(카탈로그 blocks[].fields, items.fields).',
      '부품 장(compose): 본문은 가로 12칸, 세로 12칸의 판이고 부품들이 빈틈없이 나눠 덮는다(빈 칸은 없다). 부품을 넣으면 옆이나 위아래 부품이 자리를 나눠 주고, 빼면 이웃이 그 자리를 덮는다. ' +
        '높이는 앱이 글이 잘리지 않게 맞추고, 넓은 부품은 남는 높이를 받는다. 한 장의 부품 수와 작은 부품(blocks[].small)이 아닌 부품 수는 카탈로그 blockRules. ' +
        '부품마다 가장 좁은 너비는 blocks[].minSpan(12면 그 부품은 장 너비를 혼자 쓴다). 장에 자리가 모자라면 no_room으로 건너뛴다. ' +
        '면(look)은 부품마다 고를 수 있는 것(blocks[].looks)에서, 한 장에 한 가지만: 들여 쓰기(card)끼리, 또는 강조(bold) 하나와 바탕 없는(plain) 부품들. ' +
        '들여 쓰기는 나란한 부품이 함께 바뀌고, 혼자 장 너비를 다 쓰는 부품은 면 없이 그려진다. 어긋나면 look_clash로 건너뛴다. ' +
        '뜻이 이어지는 것끼리 둔다: 숫자 옆에 그 숫자의 추이 차트, 목록 옆에 그 결론 한마디처럼. 서로 관계없는 차트 둘을 나란히 두지 않는다.',
      '- add_block {slide, type, variant?, look?, effect?, as?: "p1", 자리} 빈 부품을 넣는다. 자리: beside(그 부품)와 side(before는 왼쪽, after는 오른쪽, above는 위, below는 아래; 기본 after. 그 부품이 자리를 나눠 준다) 또는 edge(top은 판 맨 위, bottom은 맨 아래에 장 너비로). 자리를 빼면 앱의 넣기처럼 알아서 놓는다.',
      '- remove_block {slide, block} 빈 부품만 뺀다. 내용이 있으면 has_content.',
      '- move_block {slide, block, 자리 또는 swap} 부품을 옮긴다. 글은 부품과 함께 간다. 자리는 옮기는 부품을 뺀 판에서 센다. swap(부품 id)이면 두 부품이 자리를 맞바꾼다(이음표는 자리에 남는다).',
      '- set_block {slide, block, variant?: 카탈로그 blocks[].variants, look?: blockLooks, effect?: blockEffects, when?: 언제 나오는지(blockWhens), speed?: blockSpeeds, reveal?: 항목이 나오는 때(blockReveals; 항목이 있는 부품만. each면 발표할 때 누를 때마다 항목 하나씩), from?: 들어오는 쪽(blockFroms; effect가 rise, slide, wipe일 때만), count?: 항목 수(줄일 때는 끝의 빈 항목만), highlight?: 강조할 항목(blocks[].highlight가 있는 부품만, -1은 없음)}',
      '- set_order {slide, order} 부품 장의 부품이 나오는 차례. 먼저 나올 부품의 id부터 적고, 빠진 부품은 그 뒤에 놓인 차례대로 나온다. 빈 배열이면 놓인 차례(위에서 아래, 왼쪽에서 오른쪽)로. ' +
        'when이 click인 부품은 발표하는 사람이 누를 때 나오니, 짚어 가며 말할 부품에만 쓴다. 모든 부품을 click으로 하면 발표가 느려진다.',
      '- set_size {slide, block, w?, h?} 부품의 너비와 높이(칸 수, 1~12). 그 부품에 닿은 선을 옮겨 옆 부품과 크기를 주고받는다. 그 크기가 되지 않으면(어느 부품이 잘리면) no_room.',
      '- set_link {slide, block, side, link} 이음표(카탈로그 blockLinks)를 부품 사이의 선에 끼운다. side가 right면 그 부품의 오른쪽 선, below면 아래 선에 서서 선 건너편 부품과 잇는다. link가 null이면 뺀다. 지금 이음표는 모양의 blocks[].link와 linkBelow. ' +
        '두 부품이 이어지거나(화살표), 함께이거나(더하기), 모여 결과가 되거나(결과), 견줄 때(견주기)만 쓴다. 더하기와 견주기는 같은 갈래(blocks[].kind)끼리, 화살표는 같은 갈래끼리이거나 숫자(number)나 한마디(words)로 맺을 때, 결과는 숫자나 한마디로 맺을 때만. 어긋나면 link_clash. 이음표는 높이가 더 들어서 모자라면 no_room.',
    ].join('\n'),
    inputSchema: CHANGES_SCHEMA,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: 'get_result',
    description: '보낸 제안을 사용자가 어떻게 했는지: pending(아직 안 봄), applied(적용), rejected(거절), invalid(꼴이 맞지 않음). 적용했으면 op마다 결과 코드가 보낸 ops와 같은 차례로 나오고, help에 빠진 코드마다 무엇을 고치면 되는지 나온다. pending이면 사람이 아직 보지 않은 것이니 되풀이해 묻지 않는다.',
    inputSchema: {
      type: 'object',
      properties: { request: { type: 'string', description: 'propose_changes가 돌려준 request (r로 시작)' } },
      required: ['request'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
]

/**
 * 거짓과 없음인 값을 뺀다. 카탈로그가 Claude Code가 한 번에 받는 도구 응답(약 2만 5천 토큰)에 가까워져서,
 * 되풀이되는 "optional":false, "image":false, "highlight":null 같은 값부터 덜었다
 */
function slim(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(slim)
  if (!isObj(v)) return v
  return Object.fromEntries(Object.entries(v).flatMap(([k, x]) => (x === false || x === null ? [] : [[k, slim(x)]])))
}

function callTool(dirs: Dirs, name: string, args: Record<string, unknown>): unknown {
  switch (name) {
    case 'list_decks':
      return {
        decks: listShapes(dirs).map((s) => ({
          deck: s.deck,
          type: s.type,
          audience: s.audience,
          duration: s.duration,
          method: s.method,
          slideCount: s.slides.length,
          visibleSlides: s.slides.filter((x) => !x.hidden).length,
          updatedAt: s.updatedAt,
        })),
      }
    case 'get_catalog': {
      const all = catalog()
      let out: Record<string, unknown> = all
      if (args.deck !== undefined) {
        const shape = typeof args.deck === 'string' ? readShape(dirs, args.deck) : null
        if (!shape) throw new ToolError(MESSAGES.noDeck)
        out = { ...out, deckTypes: all.deckTypes.filter((t) => t.id === shape.type) }
      }
      if (args.blocks === false) out = Object.fromEntries(Object.entries(out).filter(([k]) => !k.startsWith('block')))
      return slim(out)
    }
    case 'get_shape': {
      const shape = typeof args.deck === 'string' ? readShape(dirs, args.deck) : null
      if (!shape) throw new ToolError(MESSAGES.noDeck)
      return shape
    }
    case 'check_changes': {
      const shape = typeof args.deck === 'string' ? readShape(dirs, args.deck) : null
      if (!shape) throw new ToolError(MESSAGES.noDeck)
      if (!Array.isArray(args.ops) || !args.ops.length || args.ops.length > MAX_OPS) throw new ToolError(MESSAGES.badRequest)
      const results = checkOps(shape, args.ops).map((r) => ({ op: r.op ?? 'unknown', ok: r.ok, code: r.code, ...(r.key ? { key: r.key } : {}) }))
      const noteOk = args.note === undefined || cleanNote(args.note) !== null
      return {
        deck: shape.deck,
        accepted: noteOk && results.every((r) => r.code !== 'invalid'),
        ...(noteOk ? {} : { note: 'invalid' }),
        applied: results.filter((r) => r.ok).length,
        skipped: results.filter((r) => !r.ok).length,
        results,
        help: helpFor(results),
        message: MESSAGES.checked,
      }
    }
    case 'propose_changes': {
      const deck = typeof args.deck === 'string' ? args.deck : ''
      if (!readShape(dirs, deck)) throw new ToolError(MESSAGES.noDeck)
      if (pendingFor(dirs, deck).length >= MAX_PENDING_PER_DECK) throw new ToolError(MESSAGES.tooMany)
      const id = requestId()
      const request = parseRequest({ format: REQUEST_FORMAT, version: REQUEST_VERSION, id, deck, createdAt: Date.now(), note: args.note ?? '', ops: args.ops })
      if (!request) throw new ToolError(MESSAGES.badRequest)
      const file = join(dirs.requests, `${id}.json`)
      const tmp = join(dirs.requests, `.${id}.tmp`)
      writeFileSync(tmp, JSON.stringify(request, null, 2))
      renameSync(tmp, file)
      return { request: id, status: 'pending', message: MESSAGES.pending }
    }
    case 'get_result': {
      const id = typeof args.request === 'string' && REQUEST_ID.test(args.request) ? args.request : null
      if (!id) throw new ToolError(MESSAGES.unknownRequest)
      const result = readJson(join(dirs.results, `${id}.json`)) as { status?: unknown; results?: unknown } | undefined
      if (result && typeof result === 'object') {
        const status = (RESULT_STATUSES as readonly unknown[]).includes(result.status) ? result.status : 'invalid'
        const results = Array.isArray(result.results)
          ? result.results.map((r: { ok?: unknown; code?: unknown }) => ({ ok: r?.ok === true, code: typeof r?.code === 'string' ? r.code : 'unknown' }))
          : []
        // 빠진 op의 코드마다 무엇을 고치면 되는지. 다음 제안에서 같은 op를 다시 보내지 않게
        const help = helpFor(results)
        return { request: id, status, results, ...(Object.keys(help).length ? { help } : {}) }
      }
      if (existsSync(join(dirs.requests, `${id}.json`))) return { request: id, status: 'pending', results: [], message: MESSAGES.pending }
      throw new ToolError(MESSAGES.unknownRequest)
    }
    default:
      throw new ToolError(MESSAGES.unknownTool)
  }
}

// ---------- 프롬프트: 앱의 'AI에게 부탁'과 같은 부탁을 Claude Desktop, Claude Code에서 골라 쓰게 ----------

const deckArg = { name: 'deck', description: '발표 id(d로 시작하는 9글자). 비우면 가장 최근에 고친 공유 발표', required: false }
const pageArg = { name: 'page', description: '다듬을 슬라이드 번호(1부터, 발표에서 뺀 슬라이드도 센다)', required: true }

const PROMPTS = ASKS.map((a) => ({
  name: a.id,
  title: a.name,
  description: a.description,
  arguments: a.scope === 'slide' ? [pageArg, deckArg] : [deckArg],
}))

/**
 * 고른 프롬프트의 문장. 받은 값은 발표 id와 장 번호뿐이고, 꼴이 맞을 때만 정해진 말 사이에 넣는다.
 * 틀리면 받은 값을 되풀이하지 않고 정해진 오류만 돌려준다(null)
 */
function getPrompt(params: Record<string, unknown>): object | null {
  const a = askOf(params.name)
  const args = isObj(params.arguments) ? params.arguments : {}
  if (!a) return null
  // 클라이언트는 인자를 글자로 보낸다. 빈 글자는 고르지 않은 것
  const deck = args.deck === undefined || args.deck === '' ? null : args.deck
  if (deck !== null && !(typeof deck === 'string' && DECK_ID.test(deck))) return null
  let page: number | null = null
  if (a.scope === 'slide') {
    const raw = typeof args.page === 'number' ? String(args.page) : args.page
    if (typeof raw !== 'string' || !/^[1-9][0-9]{0,2}$/.test(raw.trim()) || Number(raw) > PAGE_MAX) return null
    page = Number(raw)
  } else if (args.page !== undefined && args.page !== '') return null
  return {
    description: a.description,
    messages: [{ role: 'user', content: { type: 'text', text: mcpPrompt(a.id, deck, page) } }],
  }
}

// ---------- JSON-RPC (MCP stdio) ----------

type Message = { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: unknown }

const INSTRUCTIONS =
  'Framo(gyeol)는 보고, 제안, 지식 공유 같은 발표를 만드는 앱이다. 이 서버로는 발표의 모양(장 구성, 레이아웃, 테마, 안내 문구)만 보고 바꾸자고 제안할 수 있다. ' +
  '사람이 적은 글은 보안 때문에 이 서버에 없고, 사용자에게 붙여 달라고 하지도 않는다. ' +
  '순서: list_decks → get_shape → get_catalog(deck을 주고, 부품 장이 없으면 blocks: false) → check_changes(미리 돌려 보고 고치기) → propose_changes → (사용자가 앱에서 적용) → get_result.'

function toolText(value: unknown, isError = false) {
  return { content: [{ type: 'text', text: JSON.stringify(value) }], isError }
}

const INVALID = { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request' } }

function handleMessage(dirs: Dirs, value: unknown): object | null {
  // null이나 숫자 같은 줄도 JSON으로는 맞다. 예전에는 null에서 msg.id를 읽다가 서버가 죽었다
  if (!isObj(value)) return INVALID
  const msg = value as Message
  const id = typeof msg.id === 'string' || typeof msg.id === 'number' ? msg.id : null
  const reply = (result: unknown) => ({ jsonrpc: '2.0', id, result })
  const fail = (code: number, message: string) => ({ jsonrpc: '2.0', id, error: { code, message } })
  if (msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return id === null ? null : fail(-32600, 'Invalid Request')
  const params = (msg.params && typeof msg.params === 'object' ? msg.params : {}) as Record<string, unknown>

  // 알림(id 없음)에는 답하지 않는다
  if (id === null) return null

  switch (msg.method) {
    case 'initialize': {
      const asked = typeof params.protocolVersion === 'string' ? params.protocolVersion : ''
      return reply({
        protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[0],
        capabilities: { tools: { listChanged: false }, prompts: { listChanged: false } },
        serverInfo: { name: MCP_SERVER_NAME, version: VERSION },
        instructions: INSTRUCTIONS,
      })
    }
    case 'ping':
      return reply({})
    case 'tools/list':
      return reply({ tools: TOOLS })
    case 'prompts/list':
      return reply({ prompts: PROMPTS })
    case 'prompts/get': {
      const prompt = getPrompt(params)
      return prompt ? reply(prompt) : fail(-32602, 'Invalid params')
    }
    case 'tools/call': {
      const name = typeof params.name === 'string' ? params.name : ''
      const args = (params.arguments && typeof params.arguments === 'object' ? params.arguments : {}) as Record<string, unknown>
      let value: unknown
      try {
        value = callTool(dirs, name, args)
      } catch (e) {
        // 정해진 말만 돌려준다. 예외 메시지에는 경로나 받은 값이 들어 있을 수 있다.
        return reply(toolText({ message: e instanceof ToolError ? e.message : MESSAGES.internal }, true))
      }
      if (!onlyKnownStrings(value, PROTOCOL_WORDS)) return reply(toolText({ message: MESSAGES.blocked }, true))
      return reply(toolText(value))
    }
    default:
      return fail(-32601, 'Method not found')
  }
}

function serve(shareRoot: string) {
  const dirs = Object.fromEntries(SHARE_SUBDIRS.map((d) => [d, join(shareRoot, d)])) as Dirs
  if (!checkDirs(dirs)) {
    process.stderr.write('Framo: AI 공유 폴더를 쓸 수 없어요.\n')
    process.exit(1)
  }
  const write = (out: unknown) => process.stdout.write(JSON.stringify(out) + '\n')
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity })
  rl.on('line', (line) => {
    if (!line.trim()) return
    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch {
      return write({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })
    }
    try {
      if (Array.isArray(parsed)) {
        // 빈 묶음은 그 자체가 틀린 요청이다 (JSON-RPC 2.0)
        if (!parsed.length) return write(INVALID)
        const out = parsed.map((m) => handleMessage(dirs, m)).filter(Boolean)
        if (out.length) write(out)
        return
      }
      const out = handleMessage(dirs, parsed)
      if (out) write(out)
    } catch {
      // 한 줄 때문에 서버가 꺼지면 AI는 그 뒤로 아무것도 못 한다. 받은 값은 다시 내보내지 않는다
      write({ jsonrpc: '2.0', id: null, error: { code: -32603, message: 'Internal error' } })
    }
  })
  rl.on('close', () => process.exit(0))
}

/**
 * 권한 모델 안에서 다시 띄울 때의 node 인자. 읽기는 'AI 공유' 폴더와 이 서버 코드, 쓰기는 'AI 공유' 폴더뿐이다.
 * 다른 프로그램 실행(--allow-child-process), worker, 네이티브 애드온, WASI는 열지 않는다. 시험이 이 인자를 확인한다.
 */
export function sandboxArgs(share: string, here: string, entry: string): string[] {
  return ['--permission', `--allow-fs-read=${share}`, `--allow-fs-write=${share}`, `--allow-fs-read=${here}`, entry]
}

/**
 * 권한 모델이 정말 좁게 걸렸는지 스스로 확인한다. 누가 이 파일을 넓은 권한으로 띄웠으면 'AI 공유' 폴더 밖
 * (.deck 작업 파일이 있는 곳)을 읽을 수 있게 되므로 돌지 않는다.
 * - 넓게 연 것(--allow-fs-read=* 같은): 공유 폴더와 서버 코드의 위, 드라이브 맨 위, 홈, 임시 폴더를 읽거나 쓸 수 있는지 묻는다.
 * - 다른 것을 연 것: 다른 프로그램, worker, 네이티브 애드온, WASI, 디버거.
 * - 좁게 더 연 것(--allow-fs-read=문서 폴더): 묻는 것으로는 알 수 없으니 받은 권한 인자가 sandboxArgs의 것뿐인지 본다.
 *   NODE_OPTIONS로 준 권한 인자는 execArgv에 보이지 않으므로 아예 받지 않는다.
 */
export function sandboxTight(
  permission: Pick<NodeJS.ProcessPermission, 'has'>,
  share: string,
  here: string,
  execArgv: readonly string[] = process.execArgv,
  nodeOptions: string = process.env.NODE_OPTIONS ?? '',
): boolean {
  // 이 Node가 모르는 범위는 열 수도 없다
  const open = (scope: string, reference?: string) => {
    try {
      return permission.has(scope, reference)
    } catch {
      return false
    }
  }
  const at = resolve(share)
  const above = [dirname(at), dirname(resolve(here)), parse(at).root, homedir(), tmpdir()]
  if (above.some((p) => open('fs.read', p) || open('fs.write', p))) return false
  if (['child', 'worker', 'addon', 'wasi', 'inspector'].some((scope) => open(scope))) return false
  const own = new Set(sandboxArgs(share, here, '').filter((a) => a.startsWith('--allow-')))
  return execArgv.every((a) => !a.startsWith('--allow-') || own.has(a)) && !nodeOptions.includes('--allow-')
}

/** 권한 모델 밖에서 시작했으면, 'AI 공유' 폴더와 이 서버 코드만 읽을 수 있게 스스로를 다시 띄운다. */
function launch() {
  const here = dirname(fileURLToPath(import.meta.url))
  const share = process.env.GYEOL_SHARE || join(here, '..', SHARE_DIR_NAME)
  const permission = (process as { permission?: NodeJS.ProcessPermission }).permission

  if (permission) {
    if (sandboxTight(permission, share, here)) return serve(share)
    // 정해진 말만 쓴다. 경로는 내보내지 않는다
    process.stderr.write('Framo: 권한이 넓게 열린 채로 띄워서 시작하지 않았어요. node에 권한 인자를 붙이지 말고 띄워 주세요.\n')
    process.exit(1)
  }

  for (const d of SHARE_SUBDIRS) mkdirSync(join(share, d), { recursive: true })
  const child = spawn(process.execPath, sandboxArgs(share, here, fileURLToPath(import.meta.url)), {
    stdio: 'inherit',
    env: { ...process.env, GYEOL_SHARE: share },
  })
  for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => child.kill(sig))
  child.on('exit', (code) => process.exit(code ?? 0))
}

function isMain(): boolean {
  try {
    return !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}

if (isMain()) launch()

// 앱, 로컬 서버, MCP 서버, 'AI에게 부탁'이 같이 쓰는 약속. 예전에는 여러 파일에 따로 적어서 한쪽만 바뀌곤 했다
// (MCP 서버의 판 번호, 결과 코드 목록 등). 그래서 한곳에 둔다.
//
// 다른 파일을 가져오지 않는다. vite 설정, 화면, 서버 어디서 가져와도 발표 모델이 딸려 오지 않게.
// 저장 형식의 이름(html-maker/...)과 폴더 이름은 예전에 만든 파일을 읽어야 해서 바꾸지 않는다.

/** 앱 폴더 옆의 공유 폴더. 쓰는 사람이 보는 이름이라 한국어다 */
export const SHARE_DIR_NAME = 'AI 공유'
/** 공유 폴더 안의 폴더. decks: 앱 → AI 모양, requests: AI → 앱 제안, results: 앱 → AI 결과 */
export const SHARE_SUBDIRS = ['decks', 'requests', 'results'] as const
export type ShareSubdir = (typeof SHARE_SUBDIRS)[number]

export const SHAPE_FORMAT = 'html-maker/shape'
export const REQUEST_FORMAT = 'html-maker/request'
export const RESULT_FORMAT = 'html-maker/result'
/**
 * 모양과 제안의 판 번호. 2판부터 부품 장이 줄과 칸이 아니라 12×12 판의 자리(x, y, w, h)다.
 * 모양 3판부터 칸의 상태가 세 단계(empty, filled, long)가 아니라 글자 수의 구간이다(제안의 꼴은 그대로라 제안은 2판).
 * 모양 파일은 앱이 발표를 열 때와 고칠 때마다 다시 쓰고, 제안은 그 모양을 보고 바로 만드는 것이라 예전 판은 읽지 않는다
 */
export const SHAPE_VERSION = 3
export const REQUEST_VERSION = 2

/** 앱이 로컬 서버의 AI 창구로 가는 주소와, 다른 웹사이트가 붙일 수 없는 머리글 */
export const AI_PREFIX = '/__html-maker/ai/'
export const AI_HEADER = 'X-HTML-Maker'

/** 해시 id: 발표(d), 장(s), 부품(b)은 8자리, 제안(r)은 12자리 */
export const DECK_ID = /^d[0-9a-f]{8}$/
export const SLIDE_ID = /^s[0-9a-f]{8}$/
export const OPAQUE_ID = /^[sdb][0-9a-f]{8}$/
export const REQUEST_ID = /^r[0-9a-f]{12}$/

/** 모양 파일 이름(<발표 해시 id>.json)이면 그 발표 id, 아니면 null */
export function deckOfFile(name: string): string | null {
  const deck = name.endsWith('.json') ? name.slice(0, -5) : ''
  return DECK_ID.test(deck) ? deck : null
}

/** 결과 파일의 상태. 앱이 남기는 것은 applied, rejected이고, invalid는 꼴이 맞지 않아 서버가 버린 제안 */
export const RESULT_STATUSES = ['applied', 'rejected', 'invalid'] as const
export type ResultStatus = (typeof RESULT_STATUSES)[number]

/** MCP 서버의 이름과 도구. 'AI에게 부탁'은 이 도구만 허락해 Claude Code를 띄운다 */
export const MCP_SERVER_NAME = 'gyeol'
export const MCP_TOOLS = ['list_decks', 'get_catalog', 'get_shape', 'check_changes', 'propose_changes', 'get_result'] as const

/** 한 장, 한 부품의 항목 수 상한. 제안의 항목 수, 칸 번호, 강조할 항목 번호의 범위가 여기서 나온다 */
export const MAX_ITEMS = 20
/** 강조할 항목 번호. -1은 강조 없음 */
export const HIGHLIGHT_MIN = -1
export const HIGHLIGHT_MAX = MAX_ITEMS - 1

// Framo를 이 PC 안에서만 띄우는 작은 서버. 외부 패키지 없이 Node만으로 돈다.
//
// - 127.0.0.1에만 묶는다. 같은 네트워크의 다른 PC에서는 접속할 수 없다.
// - 포트를 고정한다. 브라우저 저장소는 주소(포트 포함)마다 따로라서, 포트가 바뀌면 저장한 발표가 안 보인다.
// - 화면 파일(dist)을 내주고, 'AI 공유' 폴더에 발표의 모양(글 없음)만 주고받는다. 발표 내용은 받지 않는다.
// - CSP로 브라우저가 이 PC 밖으로 연결하지 못하게 막는다.
// - 새 버전 확인과 받기는 이 서버가 한다(updateRoutes.ts, 바깥 연결은 update.ts 하나). 브라우저는 바깥으로 연결하지 않는다.

import { spawn } from 'node:child_process'
import { createReadStream, existsSync, realpathSync, statSync } from 'node:fs'
import { createServer, get, type IncomingMessage, type ServerResponse } from 'node:http'
import { dirname, extname, join, normalize, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SHARE_DIR_NAME } from '../src/ai/protocol'
import { createAiHandler } from './ai'
import { browserTries, windowsBrowsers } from './browser'
import { CSP, CSP_META } from './csp'
import { createUpdateHandler, UPDATE_DIR_NAME, type UpdateSetup } from './updateRoutes'
import { version } from '../package.json'

// 묶는 스크립트(scripts/pack.mjs)가 빌드한 index.html의 CSP를 이것과 견준다(빌드한 dist-node/serve.mjs에서 읽는다)
export { CSP_META }
export const HOST = '127.0.0.1'
const PORT = Number(process.env.GYEOL_PORT) || 41580
const ORIGIN = `http://${HOST}:${PORT}`
const HERE = dirname(fileURLToPath(import.meta.url))
/** 빌드하면 dist-node/ 안에 들어가므로 한 단계 위가 앱 폴더다 */
const APP_ROOT = join(HERE, '..')
const HEALTH = '/__html-maker'

const SECURITY_HEADERS = {
  'Content-Security-Policy': CSP,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
}

function send(res: ServerResponse, status: number, body: string, headers: Record<string, string> = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8', ...headers })
  res.end(body)
}

interface ServerOptions {
  /** 화면 파일 폴더 */
  root?: string
  /** 'AI 공유' 폴더 */
  share?: string
  /** 새 버전 창구. 시험에서 네트워크 대신 흉내 낸 것을 넣는다 */
  update?: Partial<UpdateSetup>
  /** MCP 서버를 띄울 node. 없으면 이 서버를 돌리는 node (Framo.exe로 켰을 때는 옆의 node\node.exe) */
  nodePath?: string
}

export function createAppServer({ root = join(APP_ROOT, 'dist'), share = join(APP_ROOT, SHARE_DIR_NAME), update = {}, nodePath }: ServerOptions = {}) {
  root = normalize(root)
  const ai = createAiHandler(share, { mcpPath: join(HERE, 'gyeol-mcp.mjs'), nodePath })
  // 받은 새 배포본은 앱 폴더 안의 고정된 폴더에 둔다
  const updates = createUpdateHandler({ version, downloadDir: join(APP_ROOT, UPDATE_DIR_NAME), ...update })

  const handle = async (req: IncomingMessage, res: ServerResponse) => {
    // 다른 이름으로 들어온 요청은 받지 않는다 (DNS 리바인딩 방어).
    // localhost로 들어오면 127.0.0.1로 모은다. 주소가 다르면 브라우저 저장소도 달라서 발표가 안 보인다.
    const port = req.socket.localPort
    const origin = `http://${HOST}:${port}`
    const host = req.headers.host ?? ''
    if (host === `localhost:${port}`) return send(res, 302, '', { Location: `${origin}${req.url ?? '/'}` })
    if (host !== `${HOST}:${port}`) return send(res, 403, 'forbidden')

    let url: URL
    try {
      url = new URL(req.url ?? '/', origin)
      decodeURIComponent(url.pathname)
    } catch {
      return send(res, 400, 'bad request')
    }

    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v)
    if (await ai(req, res)) return
    if (await updates(req, res)) return

    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'method not allowed', { Allow: 'GET, HEAD' })
    if (url.pathname === HEALTH) return send(res, 200, 'html-maker')

    const rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)
    const file = normalize(join(root, rel))
    if (!file.startsWith(root + sep)) return send(res, 403, 'forbidden')
    if (!existsSync(file) || !statSync(file).isFile()) return send(res, 404, 'not found')

    const type = TYPES[extname(file)] ?? 'application/octet-stream'
    // 화면 파일 이름에 해시가 붙어 있어 오래 캐시해도 된다. index.html만 매번 새로.
    const cache = file.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable'
    res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': type, 'Cache-Control': cache })
    if (req.method === 'HEAD') return res.end()
    // 읽다가 실패하면(그새 지웠거나 막혔으면) 오류 이벤트를 받을 곳이 없어 서버가 꺼졌다
    createReadStream(file)
      .on('error', () => res.destroy())
      .pipe(res)
  }

  return createServer((req: IncomingMessage, res: ServerResponse) => {
    // 처리하다 던진 예외가 그대로 나가면 처리되지 않은 거부로 서버가 꺼진다. 정해진 말로만 답한다(경로를 내보내지 않게)
    handle(req, res).catch(() => {
      if (!res.headersSent) send(res, 500, 'internal error')
      else res.destroy()
    })
  })
}

/** 이미 이 PC에서 Framo가 떠 있는지. 답하는 말은 예전 이름 그대로 둔다 (예전 판이 떠 있어도 알아보게) */
function alreadyRunning(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = get({ host: HOST, port: PORT, path: HEALTH, headers: { Host: `${HOST}:${PORT}` }, timeout: 800 }, (res) => {
      let body = ''
      res.on('data', (c) => (body += c))
      res.on('end', () => resolve(body === 'html-maker'))
    })
    req.on('error', () => resolve(false))
    req.on('timeout', () => (req.destroy(), resolve(false)))
  })
}

/** 크롬이나 엣지의 앱 창으로 연다. 둘 다 없으면 기본 브라우저로 (server/browser.ts) */
function openBrowser(url: string) {
  if (process.env.GYEOL_NO_OPEN) return
  const tries = browserTries(url, process.platform, process.platform === 'win32' ? windowsBrowsers() : [])
  const next = (i: number) => {
    if (i >= tries.length) return
    const [cmd, args] = tries[i]
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true, windowsHide: true })
    child.on('error', () => next(i + 1))
    // explorer는 잘 열어도 1을 돌려준다
    child.on('exit', (code) => code !== 0 && cmd !== 'explorer' && next(i + 1))
    child.unref()
  }
  next(0)
}

/**
 * 켜지 못한 이유를 보여 주고 끝낸다. 윈도우에서는 작게 내린 창에서 돌기 때문에
 * 바로 닫히면 이유를 볼 수 없어서, 키를 누를 때까지 창을 남긴다. 그때는 돌아오므로 부르는 곳은 return fail(...)로 끝낸다.
 */
function fail(message: string): never {
  console.error(`\n  ${message}\n`)
  if (process.platform === 'win32' && process.stdin.isTTY) {
    console.error('  아무 키나 누르면 이 창이 닫혀요.')
    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdin.once('data', () => process.exit(1))
    return undefined as never
  }
  process.exit(1)
}

interface MainOptions {
  /**
   * MCP 서버를 띄울 node. Framo.exe(launch/framo-exe.cjs)가 이 파일을 불러 켤 때 옆의 node\node.exe를 넘긴다.
   * Framo.exe는 명령줄 인자를 node 인자로 읽지 않아서, MCP 서버가 스스로를 권한 모델(--permission) 안에서 다시 띄우는 길이
   * node와 달라진다. 그 길을 새로 만들지 않고 검수해 온 node.exe 길을 그대로 쓴다.
   */
  nodePath?: string
}

export async function main({ nodePath }: MainOptions = {}) {
  if (!existsSync(join(APP_ROOT, 'dist', 'index.html'))) return fail('화면 파일이 없어요. 받은 zip 파일을 통째로 다시 풀어 주세요.')
  if (await alreadyRunning()) {
    console.log(`Framo가 이미 켜져 있어요. 브라우저에서 엽니다: ${ORIGIN}`)
    openBrowser(ORIGIN)
    return
  }
  let server: ReturnType<typeof createAppServer>
  try {
    server = createAppServer({ nodePath })
  } catch {
    // 'AI 공유' 폴더를 만들지 못했을 때. 읽기만 되는 곳(압축 파일 안, 막힌 폴더)에서 켜면 그렇다
    return fail("'AI 공유' 폴더를 만들지 못했어요. 받은 zip 파일을 바탕 화면이나 문서 폴더에 풀고 그 안에서 다시 실행해 주세요.")
  }
  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') return fail(`${PORT}번 포트를 다른 프로그램이 쓰고 있어요. 그 프로그램을 끄고 다시 실행해 주세요.`)
    // 윈도우는 Hyper-V, WSL, Docker가 포트 묶음을 미리 잡아 두면 EACCES가 난다
    if (err.code === 'EACCES') return fail(`이 PC가 ${PORT}번 포트를 쓰지 못하게 막고 있어요. 회사 IT 담당자에게 이 메시지를 보여 주세요.`)
    fail(err.message)
  })
  server.listen(PORT, HOST, () => {
    console.log(`\n  Framo가 켜져 있어요: ${ORIGIN}`)
    console.log('  이 창을 닫으면 꺼져요. 발표를 만드는 동안에는 닫지 말고 내려 두세요.')
    console.log('  이 PC 안에서만 열리고, 발표 내용은 어디로도 보내지 않아요.\n')
    openBrowser(ORIGIN)
  })
}

function isMain(): boolean {
  try {
    return !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}

if (isMain()) main()

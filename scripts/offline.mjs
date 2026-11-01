// 빌드 결과(dist/, dist-node/)에 바깥 주소가 섞였는지 본다. 나눠 줄 zip을 만들 때(pack.mjs)와 검수(CI)가 같이 쓴다.
//
//   node scripts/offline.mjs     npm run build 뒤에. 허락하지 않은 주소가 있으면 늘어놓고 1로 끝난다
//
// 허락하는 것은 연결이 아닌 이름표(XML 이름공간, 문서 주소), 로컬 서버 자기 주소, 사람이 복사해 쓰는 설치 명령,
// 그리고 새 버전 확인(server/update.ts)이 가는 GitHub 주소 셋뿐이다. GitHub 주소는 저장소까지 글자 그대로 맞아야 한다.

import { readdirSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ALLOWED = [
  /^http:\/\/www\.w3\.org\//,
  // PPT 파일(.pptx)의 XML 이름공간(export/pptx.ts). 이름표일 뿐 PowerPoint도 이 주소로 연결하지 않는다
  /^http:\/\/schemas\.openxmlformats\.org\//,
  /^http:\/\/purl\.org\/dc\//,
  /^https?:\/\/(reactjs\.org|react\.dev)\//,
  // 로컬 서버가 자기 주소(127.0.0.1)를 만드는 곳. 이름 뒤에는 포트와 경로만 온다:
  // 127.0.0.1.다른곳, 127.0.0.1@다른곳은 127.0.0.1로 시작해도 다른 곳으로 간다
  /^http:\/\/(127\.0\.0\.1|\$\{HOST\}|\$\{req\.headers\.host\})(:(\d+|\$\{\w+\}))?([/?#]|$)/,
  // 'AI 다듬기' 창이 보여 주는 Claude Code 설치 명령(사람이 복사해 자기 터미널에서 실행하는 글). 앱이 연결하지 않는다(CSP)
  /^https:\/\/claude\.ai\/install\.(sh|ps1)$/,
  // 새 버전 확인과 받기(server/update.ts). 로컬 서버만 이 주소로 가고 브라우저는 가지 않는다(CSP connect-src 'self').
  // 받을 때 넘겨받는 파일 보관소(release-assets.githubusercontent.com 등)는 주소가 아니라 이름 목록으로만 코드에 있다
  /^https:\/\/api\.github\.com\/repos\/wlsdks\/gyeol\/releases\/latest$/,
  /^https:\/\/github\.com\/wlsdks\/gyeol\/releases\/(tag|download)\/$/,
]

/** 허락하지 않은 주소를 '파일: 주소'로 */
export function externalUrls(root) {
  const out = new Set()
  // find는 윈도우에 없어서 Node로 훑는다
  const built = ['dist', 'dist-node'].flatMap((dir) =>
    readdirSync(join(root, dir), { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => join(e.parentPath, e.name)),
  )
  for (const file of built) {
    if (!/\.(m?js|css|html)$/.test(file)) continue
    for (const [url] of readFileSync(file, 'utf8').matchAll(/https?:\/\/[^\s"'`)<>\\]+/g)) {
      if (!ALLOWED.some((re) => re.test(url))) out.add(`${relative(root, file)}: ${url}`)
    }
  }
  return [...out]
}

function isMain() {
  try {
    return !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}

if (isMain()) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const external = externalUrls(root)
  if (external.length) {
    console.error('빌드 결과에 바깥 주소가 있어요. 확인해 주세요:\n' + external.join('\n'))
    process.exit(1)
  }
  console.log('빌드 결과에 허락하지 않은 바깥 주소가 없어요.')
}

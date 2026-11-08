// 배포본에 넣는 Node.js가 보안 수정판을 놓치지 않았는지 본다. nodejs.org의 릴리스 목록(dist/index.json)을 읽어서
// 고른 판이 LTS인지, 같은 주 버전(v24 같은)에 그보다 새 보안 수정판(security: true)이 나왔는지 가린다.
// 묶기(pack.mjs)가 Node.js를 받기 전에 부르고, 걸리면 묶지 않는다. 판을 손으로만 맞추면 보안 수정판이 나와도 모르고 지나간다

/** 'v24.22.2' → [24, 22, 2] */
const parts = (v) => v.replace(/^v/, '').split('.').map(Number)

/** a가 b보다 새 판이면 양수 */
export function compareVersions(a, b) {
  const x = parts(a)
  const y = parts(b)
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]
  return 0
}

/**
 * @param {{ version: string, lts: string | false, security: boolean }[]} index nodejs.org/dist/index.json
 * @param {string} version 배포본에 넣는 판(v24.22.2 꼴)
 * @returns {{ known: boolean, lts: boolean, newerSecurity: string | null }}
 */
export function nodeReleaseCheck(index, version) {
  const self = index.find((r) => r.version === version)
  const major = parts(version)[0]
  const newer = index
    .filter((r) => r.security && parts(r.version)[0] === major && compareVersions(r.version, version) > 0)
    .sort((a, b) => compareVersions(b.version, a.version))
  return { known: !!self, lts: !!self?.lts, newerSecurity: newer[0]?.version ?? null }
}

// 릴리스 서명을 확인하는 공개 키. 받은 새 버전을 자동으로 푸는 것은 이 키로 SHA256SUMS.txt의 서명이 맞을 때만이다(signature.ts).
//
// - 값은 Ed25519 공개 키 32바이트를 base64로 적은 것(44자). 만드는 법: `npm run release-key`(scripts/release-key.mjs)가
//   이 PC에 비밀 키(~/.config/framo/release-signing-key.pem, 권한 600)를 만들고 여기에 넣을 공개 키를 보여 준다.
// - 비밀 키는 GitHub Actions에도 저장소에도 두지 않는다. 릴리스가 끝난 뒤 이 PC에서 `npm run release-sign -- vX.Y.Z`로 서명한다.
// - 키를 바꿀 때는 새 키를 더한 버전을 먼저 내놓고(옛 키로 서명), 충분히 퍼진 뒤에 옛 키를 뺀다. 이미 깔린 버전은 자기가 아는 키만 믿는다.
// - 비어 있으면 서명을 확인할 수 없어 자동으로 풀지 않는다(받은 폴더를 열어 사람이 푸는 안내로). 릴리스(release.yml)는 비어 있으면 멈춘다.

export const RELEASE_KEYS: readonly string[] = []

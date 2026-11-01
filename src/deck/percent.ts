/** 백분율로 그릴 수 있는 값만 읽는다. 다른 단위나 범위 밖의 숫자는 뜻을 바꾸지 않는다. */
export function readPercent(text: string): number | null {
  const match = /^\s*([+\-−–]?(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+))\s*%?\s*$/.exec(text)
  if (!match) return null
  const n = Number(match[1].replace(/,/g, '').replace(/[−–]/g, '-'))
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null
}

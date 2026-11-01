import { describe, expect, it } from 'vitest'
import * as fit from './fitBlocks'

describe('부품 장 글자 맞추기', () => {
  it('바깥의 이름을 쓰지 않는다 (내보낸 HTML에 blockFitter의 소스만 들어간다)', () => {
    const src = fit.blockFitter.toString()
    // 이 파일이 내보내는 다른 이름을 안에서 부르면 내보낸 HTML에서는 없는 이름이라 맞추기가 멈춘다
    for (const name of Object.keys(fit).filter((k) => k !== 'blockFitter')) expect(src, name).not.toMatch(new RegExp(`\\b${name}\\b`))
    const rebuilt = new Function(`return (${src})`)() as typeof fit.blockFitter
    expect(Object.keys(rebuilt())).toEqual(['fit', 'lines', 'over', 'labels', 'figures', 'drawn'])
  })

  it('짧은 글 둘을 칸 안에서 옮길 때 글이 다시 꺾이지 않게 안쪽 여백 안까지만 옮기고, 그래도 넘치면 되돌린다', () => {
    // 칸 끝까지 옮기면 그만큼 안쪽 폭(--bk-content-limit)이 글보다 좁아져 글이 한 줄 더 꺾이고, 내용에 맞춰 줄여 둔 면(hug) 밖으로 넘쳤다
    // (크게에서 핵심 메시지의 부제가 아래 여백을 12px 먹었다. 갤러리 combos seed 5의 85번)
    const src = fit.blockFitter.toString()
    const balance = src.slice(src.indexOf('function balance'), src.indexOf('function gutters'))
    const short = balance.slice(balance.indexOf('shortText.has'), balance.indexOf('balanced.add'))
    expect(short).toMatch(/paddingRight/)
    expect(short).toMatch(/over\(inner\)/)
  })
})

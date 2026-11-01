import { describe, expect, it } from 'vitest'
import { BLOCK_EFFECT_IDS, BLOCK_FROM_IDS, BLOCK_SPEED_IDS, BLOCK_TYPES, BLOCK_WHEN_IDS, isLayoutBlock } from '../deck/blocks'
import { LAYOUTS } from '../deck/layouts'
import { SCENE_IDS } from '../deck/scenes'
import { TRANSITIONS } from '../deck/themes'
import { motionEngine } from './engine'

describe('움직임 엔진', () => {
  it('바깥의 아무것도 참조하지 않아서 소스만으로 다시 만들 수 있다 (내보낸 HTML에 소스가 그대로 들어간다)', () => {
    const rebuilt = new Function(`return (${motionEngine.toString()})`)() as typeof motionEngine
    const engine = rebuilt()
    expect(typeof engine.play).toBe('function')
    expect(typeof engine.swap).toBe('function')
  })

  it('부품 장만의 부품마다 짠 움직임이 있고, 고를 수 있는 움직임은 모두 엔진이 안다', () => {
    const src = motionEngine.toString()
    // 부품마다 짠 움직임은 nativeAuto의 case로, 고르는 움직임은 block()의 effect 비교로 들어 있다
    // (변환을 거친 소스라 따옴표 꼴은 가리지 않는다)
    for (const type of BLOCK_TYPES.filter((t) => !isLayoutBlock(t))) expect(src, type).toMatch(new RegExp(`case ["']${type}["']`))
    for (const id of BLOCK_EFFECT_IDS.filter((e) => e !== 'auto' && e !== 'none')) expect(src, id).toMatch(new RegExp(`effect === ["']${id}["']`))
  })

  it('고를 수 있는 나오는 때, 빠르기, 들어오는 쪽, 장 넘기기를 엔진이 안다', () => {
    const src = motionEngine.toString()
    // 칸에 붙인 data-when, data-speed, data-from을 읽는다 (slides/blocks.tsx)
    for (const id of BLOCK_WHEN_IDS.filter((w) => w !== 'after')) expect(src, id).toMatch(new RegExp(`dataset\\.when [!=]== ["']${id}["']`))
    for (const id of BLOCK_SPEED_IDS.filter((w) => w !== 'normal')) expect(src, id).toMatch(new RegExp(`dataset\\.speed === ["']${id}["']`))
    for (const id of BLOCK_FROM_IDS) expect(src, id).toMatch(new RegExp(`["']${id}["']`))
    for (const t of TRANSITIONS.filter((t) => t.id !== 'auto' && t.id !== 'none')) expect(src, t.id).toMatch(new RegExp(`name !== ["']${t.id}["']`))
  })

  it('컴포넌트의 소제목과 목록 글은 상자째 띄우지 않고 줄마다 가림막 뒤에서 올린다', () => {
    const src = motionEngine.toString()
    const native = src.slice(src.indexOf('function nativeAuto'))
    // 상자째 올리면 몇 줄인지, 어디서 끊기는지가 움직임에 드러나지 않는다 (docs/MOTION.md의 '줄 올라오기')
    expect(native).not.toMatch(/rise\(one\(["']\.bk-h["']\)/)
    expect(native).not.toMatch(/rise\(el\.querySelector\(["']\.bk-li-text["']\)/)
    expect(native).toMatch(/lines\(one\(["']\.bk-h["']\)/)
  })

  it('표, 비교, 가격안은 줄 선이 왼쪽부터 그어지며 칸의 글이 차례로 가림막 뒤에서 올라온다 (머리줄을 흐리게 먼저 깔지 않는다)', () => {
    const src = motionEngine.toString()
    const choreo = src.slice(src.indexOf('function choreo'), src.indexOf('function nativeAuto'))
    const caseOf = (id: string) => {
      const i = choreo.search(new RegExp(`case ["']${id}["']`))
      return choreo.slice(i, choreo.indexOf('break', i))
    }
    const table = caseOf('table')
    expect(table).not.toMatch(/fade\(one\(["']\.tb-headrow["']\)/)
    expect(table).toMatch(/sweep\(/)
    expect(table).toMatch(/lines\(/)
    expect(caseOf('compare')).toMatch(/sweep\(/)
    expect(caseOf('compare')).toMatch(/lines\(/)
    expect(caseOf('pricing')).toMatch(/lines\(/)
  })

  it('담당자는 사람마다 이름이 가림막 뒤에서 올라오고 역할과 맡은 일이 뒤따른다 (글 묶음째 떠오르지 않는다)', () => {
    const src = motionEngine.toString()
    const native = src.slice(src.indexOf('function nativeAuto'))
    const people = native.slice(native.search(/case ["']people["']/), native.search(/case ["']rating["']/))
    expect(people).not.toMatch(/rise\([^)]*["']\.bk-pp-text["']/)
    for (const sel of ['.bk-pp-name', '.bk-pp-role', '.bk-pp-b']) expect(people, sel).toMatch(new RegExp(`lines\\([^)]*["']\\${sel}["']`))
    // 나란히 모양은 사람마다 위에 긋던 선을 걷었다(people.css): 없는 선을 긋지 않는다
    expect(people).not.toMatch(/grow\(el, at, ["']x["'], ["']::before["']\)/)
  })

  it('추이는 바닥줄이 왼쪽부터 그어지고 달 이름은 선이 그 달에 닿을 때 하나씩 나온다 (빈 축과 달 이름을 먼저 깔지 않는다)', () => {
    const src = motionEngine.toString()
    const choreo = src.slice(src.indexOf('function choreo'), src.indexOf('function nativeAuto'))
    const i = choreo.search(/case ["']trend["']/)
    const trend = choreo.slice(i, choreo.indexOf('break', i))
    // 달 이름을 한꺼번에(30ms 차이로) 흐리게 들이면 선이 그려지기 전에 빈 축 아래 달 이름이 다 깔려 있었다
    expect(trend).not.toMatch(/items\(["']\.tn-col["']/)
    // 바닥줄은 그림 상자(.tn-plot)의 아래 선이라 상자를 표의 줄 선처럼 왼쪽부터 걷어 연다
    expect(trend).toMatch(/sweep\(one\(["']\.tn-plot["']\)/)
    // 달마다의 때는 점과 같은 칸 가운데((i + 0.5) / n)에 선이 닿는 때에서 잰다
    expect(trend).toMatch(/\$\(["']\.tn-col["']\)/)
    expect(trend).toMatch(/\(i \+ 0?\.5\) \/ \w+\.length\)? \* draw/)
  })

  it('이미지는 걷히는 쪽에서 당겨지고 차분하게면 더 옅게 더 오래, 설명은 줄마다 가림막 뒤에서 올라온다', () => {
    // 차분하게도 생동감과 똑같이 1.12배에서 2.2초에 당겨져 두 단계가 다르지 않았고(단계 표는 생동감만 '천천히 당겨짐'), 설명은 흐리게만 들어왔다
    const src = motionEngine.toString()
    const native = src.slice(src.indexOf('function nativeAuto'))
    const image = native.slice(native.search(/case ["']image["']/), native.search(/case ["']decision["']/))
    expect(image).not.toMatch(/fade\(one\(["']\.bk-img-c["']\)/)
    expect(image).toMatch(/lines\(one\(["']\.bk-img-c["']\)/)
    // 이미지 컴포넌트와 이미지 장이 같은 당기기를 쓴다: 단계마다의 크기와 시간을 한 곳에서 정한다
    expect(image).toMatch(/pull\(/)
    const choreo = src.slice(src.indexOf('function choreo'), src.indexOf('function nativeAuto'))
    const i = choreo.search(/case ["']imageText["']/)
    expect(choreo.slice(i, choreo.indexOf('break', i))).toMatch(/pull\(/)
    const j = src.search(/const pull = /)
    expect(j).toBeGreaterThan(0)
    // 당기기의 몸(다음 도움 함수의 설명 주석 전까지)이 단계를 본다
    expect(src.slice(j, src.indexOf('/**', j))).toMatch(/levelName === ["']lively["']/)
  })

  it('레이아웃마다 짠 연출이 있다 (없으면 소리 없이 기본 연출로 떨어진다)', () => {
    const src = motionEngine.toString()
    const choreo = src.slice(src.indexOf('function choreo'), src.indexOf('function nativeAuto'))
    for (const id of Object.keys(LAYOUTS)) expect(choreo, id).toMatch(new RegExp(`case ["']${id}["']`))
  })

  it('고를 수 있는 장면마다 엔진이 짠 컷이 있다 (없으면 장면을 골라도 소리 없이 연출표만 움직인다)', () => {
    const src = motionEngine.toString()
    const scene = src.slice(src.indexOf('function scene('), src.indexOf('const batches'))
    for (const id of SCENE_IDS) expect(scene, id).toMatch(new RegExp(`case ["']${id}["']`))
  })
})

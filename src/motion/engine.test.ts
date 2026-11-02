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

  it('설문 결과는 가운데 선이 서고 막대가 그 선 자리에서 양쪽으로 열린다 (한쪽 끝에서 자라지 않는다)', () => {
    const src = motionEngine.toString()
    const native = src.slice(src.indexOf('function nativeAuto'))
    const i = native.search(/case ["']likert["']/)
    const likert = native.slice(i, native.indexOf('break', i))
    expect(likert).toMatch(/["']\.bk-lk-axis["']/)
    // 막대 안의 가운데 선 자리(c%)에서 양쪽으로 여는 창: 갈라 쌓은 막대는 가운데 선이 0이라 거기서 열려야 몫이 0에서 자라는 것으로 읽힌다
    expect(likert).toMatch(/inset\(-2px \$\{100 - c\}% -2px \$\{c\}%\)/)
    expect(likert).toMatch(/count(In)?\(el\.querySelector\(["']\.bk-lk-tot["']\)/)
  })

  it('원인 캐기는 단마다 앞 단 아래에서 선이 내려와 꺾여 들어오고(└), 근본 원인은 흐릿하다 또렷하게 맺힌다', () => {
    const src = motionEngine.toString()
    const native = src.slice(src.indexOf('function nativeAuto'))
    const i = native.search(/case ["']whys["']/)
    expect(i).toBeGreaterThan(0)
    const whys = native.slice(i, native.indexOf('break', i))
    // 앞 단의 아래로 내려가는 조각(::after)을 위에서 긋고, 이 단의 갈고리는 세로를 먼저 연 다음 가로로 연다
    expect(whys).toMatch(/["']center top["'],\s*["']::after["']/)
    expect(whys).toMatch(/["']\.bk-wy-link["']/)
    expect(whys).toMatch(/inset\(0 calc\(100% - 3px\) 0 0\)/)
    expect(whys).toMatch(/blur\(/)
    // 가로 모양은 앞 이름표에서 이 이름표까지의 곧은 선을 왼쪽부터
    expect(whys).toMatch(/["']left center["'],\s*["']::after["']/)
  })

  it('순환은 마지막 단계에서 처음 단계로 돌아오는 길까지 긋고, 데이터 조각이 그 길을 탄다', () => {
    const src = motionEngine.toString()
    const native = src.slice(src.indexOf('function nativeAuto'))
    const i = native.search(/case ["']cycle["']/)
    expect(i).toBeGreaterThan(0)
    const cycle = native.slice(i, native.search(/case ["']flow["']/))
    // 고리: 구간마다 선이 그어지고(stroke-dasharray) 조각이 그 구간을 탄다. 마지막 구간도 첫 점까지 다른 구간과 같이
    expect(cycle).toMatch(/strokeDasharray/)
    expect(cycle).toMatch(/packet\(stage, legs\[n\]/)
    // 가로: 윗길(::before)을 오른쪽에서 왼쪽으로 열고, 가운데의 머리(::after)가 그 자리를 지날 때 맺힌다
    expect(cycle).toMatch(/inset\(-12px 0 -12px 100%\)["'],\s*per\(lens\[2\]\),\s*["']::before["']/)
    expect(cycle).toMatch(/pop\(list,[^;\n]*["']::after["']\)/)
    // 한 바퀴를 받으며 부푸는 것은 transform으로: 나타날 때 쓴 scale과 같은 속성이면 늦게 만든 것이 나타나기를 덮는다
    expect(cycle).toMatch(/transform: ["']scale\(1\.6\)["']/)
    expect(cycle).not.toMatch(/scale: ["']1\.6["']/)
  })

  it('순환 가로의 돌아오는 길은 선 끝과 데이터 조각이 같은 빠르기로 간다 (조각만 곡선이면 윗길 가운데에서 선보다 앞서 달렸다)', () => {
    const src = motionEngine.toString()
    const native = src.slice(src.indexOf('function nativeAuto'))
    const cycle = native.slice(native.search(/case ["']cycle["']/), native.search(/case ["']flow["']/))
    const flat = cycle.slice(cycle.indexOf('--cy-flat'))
    // 선의 토막은 곡선 없이(linear) 열리니 조각도, 처음 단계로 내려오는 꺾인 선도 곡선 없이
    expect(flat).toMatch(/packet\(stage, path, at, T, ["']linear["']\)/)
    expect(flat).toMatch(/bend\(down, [^;\n]*["']linear["']\)/)
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

  it('낱말 나누기와 숫자 굴리기는 칸마다 장에 쓰지 않고 모았다가 한 번에 쓴다 (쓰고 바로 재면 칸마다 장 전체를 다시 배치했다)', () => {
    // 장을 넘기는 순간 한 프레임이 42~77ms였다: 칸마다 낱말 상자를 넣고 바로 그 자리를 다시 재서, 잴 때마다 장 전체를 다시 배치했다
    const src = motionEngine.toString()
    const fn = (name: string, next: string) => src.slice(src.indexOf(`function ${name}(`), src.indexOf(`function ${next}(`))
    for (const [name, body, put] of [
      ['splitWords', fn('splitWords', 'countUp'), /insertBefore/],
      ['roll', fn('roll', 'play'), /replaceChild/],
    ] as const) {
      // 장에 넣는 일은 모아 둘 일(write) 안에서만
      const w = body.search(/write\s*[:(]/)
      expect(w, name).toBeGreaterThan(0)
      expect(body.slice(0, w), name).not.toMatch(put)
      expect(body, name).toMatch(/defer\(job\)/)
    }
    // 줄 올라오기는 나눈 낱말을 다시 재지 않고 나누기 전에 잰 자리로 줄을 가른다
    const lines = src.slice(src.search(/const lines = /), src.search(/const count = /))
    expect(lines).not.toMatch(/getBoundingClientRect|getClientRects/)
    // 묶음을 다 짠 뒤에 쓰고, 장면은 쓴 뒤에 다시 짠다(나눈 낱말이 장 안에 있어야 어느 묶음의 움직임인지 안다)
    const batch = src.slice(src.search(/const batch = /), src.indexOf('const mine = {'))
    expect(batch).toMatch(/make\(\);?\s*flushJobs\(\)/)
    const c = src.indexOf('choreo(layout, slideVariant)')
    const f = src.indexOf('flushJobs()', c)
    expect(c).toBeGreaterThan(0)
    expect(f).toBeGreaterThan(c)
    expect(src.indexOf('after()', c)).toBeGreaterThan(f)
  })

  it('움직임 없음과 동작 줄이기에서는 숫자도 올리지 않는다: 합계를 조각마다 올리는 시계도 멈춘 때(still)를 지킨다', () => {
    // 합계 올리기(tally)만 멈춘 때를 보지 않아서, 움직임 없음이나 윈도우의 '애니메이션 효과 끄기'에서도 합계가 0부터 올라갔다
    const src = motionEngine.toString()
    for (const name of ['count', 'pulse', 'tally']) {
      const at = src.indexOf(`const ${name} = (`)
      expect(at, name).toBeGreaterThan(0)
      const guard = /if \(([^)]*\)?)*?\) return/.exec(src.slice(at))
      expect(guard?.[0], name).toMatch(/\bstill\b/)
    }
  })

  it('고를 수 있는 장면마다 엔진이 짠 컷이 있다 (없으면 장면을 골라도 소리 없이 연출표만 움직인다)', () => {
    const src = motionEngine.toString()
    const scene = src.slice(src.indexOf('function scene('), src.indexOf('const batches'))
    for (const id of SCENE_IDS) expect(scene, id).toMatch(new RegExp(`case ["']${id}["']`))
  })
})

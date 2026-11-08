import { describe, expect, it } from 'vitest'
import { asksDecision, AUDIENCES, BLUEPRINTS, DECK_GROUPS, DECK_TYPES, DURATIONS } from './blueprints'
import { createDeck, planRecipes, priorityFor, targetCount } from './generate'
import { DROP_ROW, hintFor, LAYOUT_GROUPS, LAYOUT_ORDER, LAYOUTS, logoColumns, rowHint } from './layouts'
import { showcaseSlides } from './showcase'
import { scoreOf, seriesIn } from '../slides/numbers'

describe('planRecipes', () => {
  it('발표 시간에 맞는 장 수를 넘지 않는다', () => {
    for (const type of DECK_TYPES) {
      for (const { id: audience } of AUDIENCES) {
        for (const { minutes } of DURATIONS) {
          const plan = planRecipes(type, audience, minutes)
          const required = BLUEPRINTS[type].recipes.filter(
            (r) => r.priority === 1 && (!r.audience || r.audience.includes(audience)),
          ).length
          expect(plan.length).toBeLessThanOrEqual(Math.max(targetCount(minutes), required))
        }
      }
    }
  })

  it('우선순위 1인 장은 빼지 않는다', () => {
    const plan = planRecipes('business', 'exec', 5)
    expect(plan.map((r) => r.purpose)).toEqual(['표지', '한 장 요약', '추진 배경', '제안 내용', '기대 효과', '결정 요청'])
  })

  it('어느 보고든 한 장 요약이 표지 바로 뒤에 오고 결정 요청으로 끝난다', () => {
    for (const type of ['business', 'deal', 'improve', 'decide', 'plan'] as const) {
      const plan = planRecipes(type, 'mixed', 20)
      expect(plan[1].purpose).toBe('한 장 요약')
      expect(plan[plan.length - 1].purpose).toBe('결정 요청')
    }
  })

  it('어느 발표든 결론부터: 표지 다음에 요약이나 결론 한 장, 마지막 장(받을 것이나 남길 것)은 맨 끝', () => {
    for (const type of DECK_TYPES) {
      const closing = BLUEPRINTS[type].recipes.filter((r) => r.layout === 'closing')
      expect(closing, type).toHaveLength(1)
      for (const { id: audience } of AUDIENCES) {
        for (const { minutes } of DURATIONS) {
          const plan = planRecipes(type, audience, minutes)
          const at = `${type} ${audience} ${minutes}`
          expect(plan[0].layout, at).toBe('cover')
          expect(['summary', 'statement', 'kpi'], at).toContain(plan[1].layout)
          // 요청이 없을 수도 있는 보고(주간 보고, 문제 보고 같은)는 짧을 때 마지막 장을 뺀다. 넣으면 늘 맨 끝
          if (closing[0].priority === 1 || plan.includes(closing[0])) expect(plan[plan.length - 1], at).toBe(closing[0])
        }
      }
    }
  })

  it('듣는 사람에 따라 챙기는 장이 달라진다', () => {
    const roles = (audience: (typeof AUDIENCES)[number]['id']) => planRecipes('business', audience, 20).map((r) => r.purpose)
    // 임원은 숫자 장을 더 챙기고 일정 같은 세부 장을 먼저 뺀다. 동료는 그 반대
    expect(roles('exec')).toContain('매출 전망')
    expect(roles('exec')).not.toContain('추진 일정')
    expect(roles('peers')).toContain('추진 일정')
    expect(roles('peers')).not.toContain('매출 전망')
    // 다른 부서는 배경 장을 챙긴다
    expect(planRecipes('plan', 'partners', 20).map((r) => r.purpose)).toContain('올해 배운 점')
    expect(planRecipes('plan', 'mixed', 20).map((r) => r.purpose)).not.toContain('올해 배운 점')
  })

  it('우선순위 1인 장은 듣는 사람이 누구든 빠지지 않는다', () => {
    for (const type of DECK_TYPES) {
      for (const { id: audience } of AUDIENCES) {
        const plan = planRecipes(type, audience, 5)
        for (const r of BLUEPRINTS[type].recipes) {
          if (r.priority === 1 && (!r.audience || r.audience.includes(audience))) expect(plan, `${type} ${r.purpose}`).toContain(r)
          expect(priorityFor(r, audience) === 1).toBe(r.priority === 1)
        }
      }
    }
  })

  it('본부장·임원 대상이면 목차와 세부 화면을 뺀다', () => {
    const exec = planRecipes('deal', 'exec', 30)
    const manager = planRecipes('deal', 'practitioner', 30)
    expect(exec.some((r) => r.layout === 'agenda')).toBe(false)
    expect(exec.some((r) => r.purpose === '제안할 솔루션')).toBe(false)
    expect(manager.some((r) => r.purpose === '제안할 솔루션')).toBe(true)
  })

  it('대외 제안은 짧아도 상대를 위한 제안과 범위, 다음 단계를 담는다', () => {
    for (const { minutes } of DURATIONS) {
      const plan = planRecipes('proposal', 'external', minutes)
      expect(plan.map((r) => r.purpose)).toEqual(expect.arrayContaining(['표지', '한 장 요약', '제안 내용', '제공 범위', '다음 단계']))
      expect(plan.at(-1)?.purpose).toBe('다음 단계')
      expect(JSON.stringify(plan)).not.toMatch(/이익률|수주|내부 승인/)
    }
    expect(asksDecision('proposal')).toBe(false)
    expect(BLUEPRINTS.proposal.defaults.audience).toBe('external')
  })

  it('섹션 구분 장은 모두 들어가거나 모두 빠진다', () => {
    for (const type of DECK_TYPES) {
      const total = BLUEPRINTS[type].recipes.filter((r) => r.layout === 'section').length
      for (const { minutes } of DURATIONS) {
        for (const { id: audience } of AUDIENCES) {
          const count = planRecipes(type, audience, minutes).filter((r) => r.layout === 'section').length
          expect([0, total]).toContain(count)
        }
      }
    }
  })
})

describe('createDeck', () => {
  const input = {
    type: 'business' as const,
    audience: 'mixed' as const,
    minutes: 30,
    method: 'live' as const,
    title: '  구독형 품질 관리 사업 제안  ',
    org: '영업 2팀',
    presenter: '',
    ask: '시범 사업 예산 1.2억 원 승인',
    theme: 'white' as const,
  }

  it('발표 종류 미리 보기에 보일 장은 이야기 흐름마다 하나씩, 그 보고의 구성에 있는 장이다', () => {
    // 프레임 잡기(Wizard.tsx)는 구성(recipes)에서 이 장들을 찾아 그린다
    for (const type of DECK_TYPES) {
      const bp = BLUEPRINTS[type]
      expect(bp.type).toBe(type)
      expect(bp.showcase, type).toHaveLength(4)
      expect(bp.storyline).toHaveLength(bp.showcase!.length)
      for (const purpose of bp.showcase!) expect(bp.recipes.some((r) => r.purpose === purpose), `${type}: ${purpose}`).toBe(true)
    }
  })

  it('2×2 우선순위는 미리 채운 두 축과 함께 네 칸의 이름도 채운다 (안내로만 두면 발표할 때 칸 이름이 빠진다)', () => {
    const matrices = DECK_TYPES.flatMap((type) => BLUEPRINTS[type].recipes.filter((r) => r.layout === 'matrix'))
    expect(matrices.length).toBeGreaterThan(0)
    for (const r of matrices) {
      expect(r.fields?.yAxis && r.fields?.xAxis).toBeTruthy()
      expect(r.prefill?.map((it) => it.title?.trim())).toEqual(['틈틈이 하기', '바로 하기', '미루기', '계획해서 하기'])
    }
  })

  it('프레임 잡기의 묶음은 빈 발표를 뺀 모든 종류를 한 번씩 담는다', () => {
    const grouped = DECK_GROUPS.flatMap((g) => g.types)
    expect(new Set(grouped).size).toBe(grouped.length)
    expect([...grouped].sort()).toEqual(Object.keys(BLUEPRINTS).filter((t) => t !== 'blank').sort())
  })

  it('한 구성 안에서 장 역할 이름이 겹치지 않는다 (AI 제안과 미리 보기가 역할 이름으로 장을 찾는다)', () => {
    for (const bp of Object.values(BLUEPRINTS)) {
      const roles = bp.recipes.map((r) => r.purpose)
      expect(new Set(roles).size, bp.type).toBe(roles.length)
    }
  })

  it('표지 제목, 결정 요청, 목차를 미리 채운다', () => {
    const deck = createDeck(input)
    expect(deck.title).toBe('구독형 품질 관리 사업 제안')
    expect(deck.slides[0].fields.title).toBe('구독형 품질 관리 사업 제안')
    expect(deck.slides[0].fields.ask).toBe('시범 사업 예산 1.2억 원 승인')
    expect(deck.meta.org).toBe('영업 2팀')
    const agenda = deck.slides.find((s) => s.layout === 'agenda')
    expect(agenda?.items.map((i) => i.title)).toEqual(['배경', '제안', '효과와 비용', '실행 계획'])
  })

  it('결정을 받지 않는 발표의 표지는 결정 요청 자리가 없는 아래 띠 모양으로 만든다', () => {
    const plain = DECK_TYPES.filter((t) => !asksDecision(t))
    expect(plain).toEqual(['proposal', 'weekly', 'kickoff', 'study', 'intro'])
    for (const type of DECK_TYPES) {
      const cover = createDeck({ ...input, type, ask: '', lead: '' }).slides[0]
      expect(cover.variant, type).toBe(asksDecision(type) ? undefined : 'band')
      // 결정 요청 칸이 없는데 그 칸의 안내만 남지 않게
      if (!asksDecision(type)) expect(cover.hints.ask, type).toBeUndefined()
    }
  })

  it('한 장 요약은 줄 이름을 미리 넣고 줄마다 다른 안내를 단다', () => {
    const summary = createDeck(input).slides[1]
    expect(summary.items.map((i) => i.title)).toEqual(['배경', '제안', '기대 효과', '요청 사항'])
    expect(summary.items.every((i) => i.body === '')).toBe(true)
    expect(hintFor(summary.layout, summary.hints, 'body', 'body', 0)).toBe('왜 지금 이 사업을 해야 하는지')
    expect(hintFor(summary.layout, summary.hints, 'body', 'body', 3)).toBe('결정해 주실 것 (예산, 인력)')
  })

  it('줄마다 다른 예시는 만드는 항목 수만큼 있다 (모자라면 남은 줄에 다른 장의 예시가 섞인다)', () => {
    const wrong: string[] = []
    for (const [type, bp] of Object.entries(BLUEPRINTS)) {
      for (const r of bp.recipes) {
        const spec = LAYOUTS[r.layout]
        if (!spec.items) continue
        const count = r.items ?? spec.items.default
        const rows: Record<string, number> = {}
        for (const key of Object.keys(r.hints ?? {})) {
          const m = /^items\.(\d+)\.(\w+)$/.exec(key)
          if (m) rows[m[2]] = Math.max(rows[m[2]] ?? 0, Number(m[1]) + 1)
        }
        for (const [key, n] of Object.entries(rows)) if (n !== count) wrong.push(`${type} ${r.purpose} ${key}: 예시 ${n}줄, 항목 ${count}개`)
      }
    }
    expect(wrong).toEqual([])
  })

  it('줄마다 다른 예시를 준 장은 레이아웃이 줄마다 예시를 두는 칸도 모두 제 이야기로 채운다 (빠진 칸에는 다른 이야기의 예시가 섞인다)', () => {
    // 결과 보고의 후속 과제 표가 과제·담당·기한만 줘서 비고 칸에 표 레이아웃의 예시(결재 절차 개선)가 들어가
    // '결과 공유회 · 경영지원본부 · 11월 · 처리 시간을 다시 잼'처럼 앞뒤가 맞지 않는 줄을 보여 줬다
    const wrong: string[] = []
    for (const [type, bp] of Object.entries(BLUEPRINTS)) {
      for (const r of bp.recipes) {
        const spec = LAYOUTS[r.layout]
        const hints = r.hints ?? {}
        if (!spec.items || !Object.keys(hints).some((key) => /^items\.\d+\./.test(key))) continue
        const count = r.items ?? spec.items.default
        for (const field of spec.items.fields) {
          if (!field.hints?.length || hints[`items.${field.key}`]) continue
          const missing = Array.from({ length: count }, (_, i) => i).filter((i) => !hints[`items.${i}.${field.key}`] && !r.prefill?.[i]?.[field.key])
          if (missing.length) wrong.push(`${type} ${r.purpose} ${field.key}: ${missing.map((i) => i + 1).join(',')}째 줄`)
        }
      }
    }
    expect(wrong).toEqual([])
  })

  it('줄마다 다른 예시가 있는 장의 빈 칸은 레이아웃의 다른 이야기 대신 칸의 안내를 보인다 (예전에 만든 발표)', () => {
    // 고치기 전에 만든 발표는 비고 예시 없이 저장돼 있다. 레이아웃의 줄마다 예시(결재 절차 개선)를 섞지 않고 칸의 안내로
    const saved = { title: '네 가지가 남았어요', 'items.0.title': '전사로 넓히기', 'items.0.meta': '인사팀', 'items.0.value': '1월' }
    expect(hintFor('table', saved, 'body', 'body', 0)).toBe('짧은 설명')
    expect(hintFor('table', saved, 'title', 'title', 0)).toBe('전사로 넓히기')
    // 줄마다 예시가 없는 장(빈 발표에 더한 표)은 레이아웃의 예시가 한 이야기라 그대로 쓴다
    expect(hintFor('table', {}, 'body', 'body', 0)).toBe('팀마다 다른 양식을 하나로')
  })

  it('목표 대비 실적 예시는 제목대로 셈된다: 결과 보고는 네 목표 중 셋을 이룬다', () => {
    // 적응 기간과 비용은 낮을수록 좋은 지표라 목표에 '이하'가 있어야 한다. 없던 때는 6주(목표 6.5주)와 1,850만 원(목표 2,000만 원)이
    // 못 미친 것(92%, 93%)으로 그려져, 제목은 셋을 이뤘다는데 장에는 하나만 달성이었다
    const recipe = BLUEPRINTS.result.recipes.find((r) => r.layout === 'scorecard')!
    expect(recipe.hints?.title).toBe('네 목표 중 세 개를 이뤘어요')
    const scores = [0, 1, 2, 3].map((i) => scoreOf(recipe.hints![`items.${i}.meta`], recipe.hints![`items.${i}.value`]))
    expect(scores.every((s) => s.known)).toBe(true)
    expect(scores.filter((s) => s.met)).toHaveLength(3)
  })

  it('예시 제목이 세는 수와 장의 줄 수가 같다', () => {
    // 주간 업무 보고의 '이슈와 대응'은 제목 예시가 '두 가지가 막혀 있어요'인데 예시 줄은 셋이었다.
    // 예시가 어긋나 있으면 쓰는 사람도 제목과 줄 수가 맞지 않는 채로 따라 적는다
    const NUM: Record<string, number> = { 두: 2, 세: 3, 네: 4, 다섯: 5, 여섯: 6 }
    const wrong = new Set<string>()
    for (const type of DECK_TYPES) {
      for (const a of AUDIENCES) {
        for (const d of DURATIONS) {
          for (const s of createDeck({ ...input, type, audience: a.id, minutes: d.minutes }).slides) {
            const m = (s.hints.title ?? '').match(/(두|세|네|다섯|여섯) ?(가지|과제|단계|팀|목표|지표)/)
            if (m && s.items.length !== NUM[m[1]]) wrong.add(`${type} ${s.layout} '${s.hints.title}' 줄 ${s.items.length}`)
          }
        }
      }
    }
    expect([...wrong]).toEqual([])
  })

  it('줄을 지워도 된다는 안내는 빈 줄에만 보인다: 줄의 다른 칸을 채우면 그 칸의 안내로 바뀐다', () => {
    // 결정 요청의 셋째 줄은 설명 칸의 안내가 '없으면 이 줄을 지워요'뿐이라, 제목을 채워도 설명 칸에 그 말이 남아
    // '썼는데 지우라는 건가'로 읽혔다
    let rows = 0
    const wrong: string[] = []
    for (const type of DECK_TYPES) {
      for (const s of createDeck({ ...input, type }).slides) {
        s.items.forEach((it, i) => {
          for (const k of ['title', 'body'] as const) {
            const own = hintFor(s.layout, s.hints, k, k, i)
            if (!own.includes(DROP_ROW)) continue
            const where = `${type} ${s.layout} ${i + 1}번 줄 ${k}`
            // 아무것도 쓰지 않은 줄에는 그대로 보인다
            if (rowHint(s.layout, s.hints, it, k, i) !== own) wrong.push(`${where}: 빈 줄에 안내가 없어요`)
            // 칸 자신의 안내 끝에 붙은 말은 그 칸을 채우면 안내째로 사라진다
            if (own !== DROP_ROW) continue
            rows++
            const filled = rowHint(s.layout, s.hints, { ...it, [k === 'title' ? 'body' : 'title']: '채운 글' }, k, i)
            if (filled.includes(DROP_ROW) || !filled.trim()) wrong.push(`${where}: '${filled}'`)
          }
        })
      }
    }
    expect(rows).toBeGreaterThan(5)
    expect(wrong).toEqual([])
    // 줄의 이야기와 맞는 안내로: 제안의 셋째 줄(연락 또는 다음 일정)에 첫 줄의 안내(무엇을 확인하고 싶은지)가 보이지 않게
    const next = createDeck({ ...input, type: 'proposal' }).slides.find((s) => s.layout === 'closing')!
    expect(rowHint(next.layout, next.hints, { ...next.items[2], title: '다음 주 화요일 다시 만나요' }, 'body', 2)).toBe('언제, 누구와 이어 갈지')
  })

  it('추이 예시의 목표선은 예시 숫자와 같은 크기다: 동떨어진 목표선이 그래프 바닥에 그어지지 않게', () => {
    // 조사·분석 보고의 시장 추이는 값 예시(600~1,200억 원)만 주고 목표 예시를 주지 않아, 레이아웃의 예시 목표(120)가 그래프 바닥에
    // '목표 120'으로 그어졌다(주간 업무 보고의 문의 240~380건도). 목표가 어울리지 않는 이야기는 숫자 아닌 안내로 둔다(선을 긋지 않는다)
    const wrong: string[] = []
    for (const [type, bp] of Object.entries(BLUEPRINTS)) {
      for (const r of bp.recipes) {
        const spec = LAYOUTS[r.layout]
        if (!spec.items || !spec.fields.some((f) => f.key === 'target')) continue
        const hints = r.hints ?? {}
        const unit = hintFor(r.layout, hints, 'unit')
        const count = r.items ?? spec.items.default
        const values = seriesIn(Array.from({ length: count }, (_, i) => hintFor(r.layout, hints, 'value', 'value', i)), unit).values.filter((v): v is number => v !== null)
        const target = seriesIn([hintFor(r.layout, hints, 'target')], unit).values[0]
        if (target == null || !values.length) continue
        const [lo, hi] = [Math.min(...values), Math.max(...values)]
        // 축은 목표까지 담아 그리니, 값 범위에서 멀면 예시 선이 납작해지고 목표선은 바닥이나 천장에 붙는다
        if (target < lo * 0.75 || target > hi * 1.25) wrong.push(`${type} ${r.purpose}: 목표 ${target}, 값 ${lo}~${hi}`)
      }
    }
    expect(wrong).toEqual([])
    // 예전에 만든 발표(장에 저장된 예시)도 같다: 항목 예시를 따로 준 장에는 레이아웃 이야기의 목표(120)를 섞지 않는다
    const market = { title: '5년 동안 시장이 두 배가 됐어요', 'items.0.value': '600', 'items.5.value': '1,200' }
    expect(seriesIn([hintFor('trend', market, 'target')]).values[0]).toBeNull()
    // 레이아웃의 예시 그대로인 장(빈 발표에 더한 추이, 장 모음)은 그 이야기의 목표로 예시 선을 긋는다
    expect(hintFor('trend', {}, 'target')).toBe('120')
  })

  it('실적 보고의 깔때기 예시는 제목대로 제안까지 간 다섯 곳 중 한 곳이 계약한다', () => {
    // 줄마다 예시가 없어 레이아웃의 예시(지원, 서류 통과, 면접, 최종 합격)가 보였다: 제목은 고객과 계약인데 줄은 채용 이야기였고, 단위는 '곳'이었다
    const recipe = BLUEPRINTS.report.recipes.find((r) => r.layout === 'funnel')!
    expect(recipe.hints?.title).toBe('제안까지 간 고객 다섯 중 한 곳이 계약했어요')
    const rows = [0, 1, 2, 3].map((i) => ({ title: hintFor('funnel', recipe.hints!, 'title', 'title', i), value: Number(hintFor('funnel', recipe.hints!, 'value', 'value', i)) }))
    expect(rows.map((r) => r.title)).toEqual(['문의', '미팅', '제안', '계약'])
    expect(rows[2].value / rows[3].value).toBe(5)
  })

  it('제목을 비우면 보고 종류의 기본 제목을 쓴다', () => {
    const deck = createDeck({ ...input, type: 'report', title: '', ask: '' })
    expect(deck.title).toBe('실적 보고')
    expect(deck.slides[0].fields.ask).toBeUndefined()
  })
})

describe('프레임 잡기에서 먼저 골라 둘 값 (defaults)', () => {
  it('종류마다 고를 수 있는 듣는 사람과 시간이고, 모두 같은 값은 아니다', () => {
    for (const bp of Object.values(BLUEPRINTS)) {
      expect(AUDIENCES.map((a) => a.id)).toContain(bp.defaults.audience)
      expect(DURATIONS.map((d) => d.minutes)).toContain(bp.defaults.minutes)
    }
    expect(BLUEPRINTS.weekly.defaults).toEqual({ audience: 'practitioner', minutes: 10 })
    expect(new Set(DECK_TYPES.map((t) => `${BLUEPRINTS[t].defaults.audience}/${BLUEPRINTS[t].defaults.minutes}`)).size).toBeGreaterThan(3)
  })
})

describe('레이아웃 묶음과 예시', () => {
  it('모든 레이아웃이 묶음에 한 번씩 들어간다', () => {
    const grouped = LAYOUT_GROUPS.flatMap((g) => g.layouts)
    expect([...grouped].sort()).toEqual([...LAYOUT_ORDER].sort())
  })

  it('모든 레이아웃에 내용을 채운 예시 장이 있다 (장 모음 화면)', () => {
    const shown = new Set(showcaseSlides().map((s) => s.layout))
    expect(LAYOUT_ORDER.filter((id) => !shown.has(id))).toEqual([])
  })

  it('로고 모음은 두 줄까지, 마지막 줄이 윗줄보다 하나 넘게 모자라지 않는다 (5개가 4·1로 남던 것)', () => {
    const { min, max } = LAYOUTS.logos.items!
    for (let n = min; n <= max; n++) {
      const cols = logoColumns(n)
      const rows = Math.ceil(n / cols)
      expect(rows).toBeLessThanOrEqual(2)
      expect(cols - (n - (rows - 1) * cols)).toBeLessThanOrEqual(1)
    }
  })
})

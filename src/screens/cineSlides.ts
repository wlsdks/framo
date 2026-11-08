// 개발용 갤러리의 모션 그래픽 장(#/gallery?set=cine). 틀마다 한 장: 장 제목을 숨기고 판을 다 쓰는 장면(영화 타이틀처럼)과,
// &head=1이면 장 제목(이름표) 아래에 놓은 장면. &presets=light,stroke 처럼 틀을 고르고, &glyph=AI, &title=… 처럼 큰 글자와 제목을(&empty=glyph는 비운다), &knob=shape:ring 처럼
// 손잡이를 바꿔 본다(쉼표로 여럿). &bare=1은 모양을 딴 칸 하나만 채운다. 필름 띠는 npm run look -- film … --exact(시계를 멈춰 정한 때마다 찍는다)

import { CINE_PRESETS, cineId, isPresetId, presetRecipe, withKnob, type CineKnob } from '../deck/cine'
import { makeSlide } from '../deck/generate'
import type { CineRecipe, Slide } from '../deck/types'

export function cineSlides(params: URLSearchParams): { slides: Slide[]; cines: Record<string, CineRecipe> } {
  const only = params.get('presets')?.split(',').filter(isPresetId)
  const head = params.get('head') === '1'
  const knobs = (params.get('knob') ?? '')
    .split(',')
    .filter(Boolean)
    .map((k) => k.split(':') as [CineKnob, string])
  const cines: Record<string, CineRecipe> = {}
  const slides = CINE_PRESETS.filter((p) => !only || only.includes(p.id)).map((p) => {
    let recipe = presetRecipe(p.id, `gallery-${p.id}`)
    for (const [k, v] of knobs) recipe = withKnob(recipe, k, v === 'on' ? true : v === 'off' ? false : v)
    const id = cineId(recipe)
    cines[id] = recipe
    const fields: Record<string, string> = { ...(p.sample as Record<string, string>) }
    for (const k of ['glyph', 'title']) if (params.get(k)) fields[k] = params.get(k)!
    // &empty=glyph,lead: 그 칸을 비운다(큰 글자를 비운 장면 같은)
    for (const k of (params.get('empty') ?? '').split(',').filter(Boolean)) delete fields[k]
    // &bare=1: 모양을 딴 칸 하나만 채운다(큰 글자 하나뿐인 장면)
    if (params.get('bare') === '1') for (const k of Object.keys(fields)) if (k !== (p.recipe.shape.field ?? 'glyph')) delete fields[k]
    const slide = makeSlide('compose')
    return {
      ...slide,
      id: `cine-${p.id}`,
      fields: { ...slide.fields, title: head ? `${p.name}: 장 제목` : '' },
      options: { ...slide.options, ...(head ? {} : { hideHead: true }) },
      blocks: [{ id: `cine-${p.id}-b`, type: 'cine' as const, fields, items: [], cine: id, at: { x: 0, y: 0, w: 12, h: 12 } }],
    }
  })
  return { slides, cines }
}

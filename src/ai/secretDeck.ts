// 비밀 심기 시험에 쓰는 발표. 모양(share.test.ts)과 MCP 서버(mcp/server.test.ts)의 시험이 같이 쓴다.
// 시험 파일에서 가져오면 그 파일의 시험까지 한 번 더 돌아서 따로 둔다

import { createSampleDeck } from '../deck/sample'
import type { Block, Deck } from '../deck/types'

export const SECRET = '기밀7731'

/** 사람이 글을 적을 수 있는 모든 곳, 그리고 가져온 파일이라면 아무 글이나 들어 있을 수 있는 곳에 비밀을 심는다 */
export function secretDeck(): Deck {
  const deck = createSampleDeck()
  const s = (k: string) => `${SECRET}-${k}`
  return {
    ...deck,
    id: s('deck-id'),
    title: s('title'),
    // 발표 종류, 듣는 사람, 방식도 고르는 값이지만 가져온 파일(또는 새 버전이 더한 값)이면 아무 글이나 있을 수 있다
    meta: {
      ...deck.meta,
      type: s('type'),
      audience: s('audience'),
      method: s('method'),
      org: s('org'),
      presenter: s('presenter'),
      date: s('date'),
      contact: s('contact'),
      logo: `data:image/png;base64,${SECRET}`,
    } as unknown as Deck['meta'],
    // 가져온 파일이면 고르는 값 자리에도 아무 글이나 들어 있을 수 있다
    theme: { id: deck.theme.id, accent: s('accent'), font: s('font'), size: s('size'), footer: s('footer'), transition: s('transition') } as unknown as Deck['theme'],
    slides: (deck.slides.map((slide, i) => ({
      ...slide,
      id: s(`slide-${i}`),
      purpose: s('purpose'),
      section: s('section'),
      guide: s('guide'),
      notes: s('notes'),
      hints: { title: s('hint') },
      // 장면: 표지에는 맞는 장면(나가도 되는 값), 한 장 요약에는 목록에 있지만 맞지 않는 장면, 나머지는 비밀
      options: { ...slide.options, motion: s('motion'), tone: s('tone'), transition: s('transition'), order: [s('order')], hideHead: s('hideHead'), hideFoot: s('hideFoot'), scene: i === 0 ? 'opening' : i === 1 ? 'numbers' : s('scene') } as unknown as Deck['slides'][number]['options'],
      fields: Object.fromEntries([...Object.keys(slide.fields), 'title', 'lead', 'body'].map((k) => [k, s(`field-${k}`)])),
      items: slide.items.map((it, j) => ({ ...it, id: s(`item-${j}`), title: s('t'), body: s('b'), value: s('v'), meta: s('m'), image: s('img') })),
      // 배경: 표지는 아는 배경에 비밀이 든 짙기와 자리(나가면 안 된다), 둘째 장은 비밀이 든 종류, 나머지는 맞는 값(나가도 되는 값)
      backdrop: (i === 0
        ? { kind: 'diffuse', at: { x: s('bx'), y: 0, w: 6, h: 6 }, strength: s('strength'), [s('bdkey')]: s('bd') }
        : i === 1
          ? { kind: s('backdrop'), at: { x: 0, y: 0, w: 6, h: 6 } }
          : { kind: 'gather', at: { x: 6, y: 0, w: 6, h: 12 }, strength: 'soft' }) as unknown as Deck['slides'][number]['backdrop'],
    })) as Deck['slides']).concat(composeSecret(s)),
  }
}

/** 부품 장: 부품의 칸, 항목, 안내, id, 그리고 고르는 값 자리(바탕, 움직임, 나오는 때와 차례, 모양, 너비)에도 비밀을 심는다 */
function composeSecret(s: (k: string) => string): Deck['slides'] {
  const it = (j: number) => ({ id: s(`bi-${j}`), title: s('bt'), body: s('bb'), value: s('bv'), meta: s('bm'), image: s('bimg') })
  const block = (type: string, j: number) =>
    ({ id: s(`block-${j}`), type, fields: { text: s('bf'), body: s('bf'), label: s('bf'), [s('key')]: s('bf') }, items: [it(0), it(1)], hints: { body: s('bh') }, look: s('look'), effect: s('fx'), when: s('when'), speed: s('speed'), from: s('from'), variant: s('va'), highlight: 1 }) as unknown as Block
  return [
    {
      id: s('compose'),
      layout: 'compose',
      purpose: s('purpose'),
      section: s('section'),
      guide: s('guide'),
      notes: s('notes'),
      hints: { title: s('hint') },
      // 나오는 차례: 없는 id(비밀)는 빠지고, 있는 부품의 원래 id는 해시 id로만 나가야 한다
      options: { transition: s('transition'), order: [s('order'), s('block-3'), s('block-1')], scene: s('scene') } as unknown as Deck['slides'][number]['options'],
      fields: { title: s('ct'), lead: s('cl') },
      items: [],
      // 판의 자리와 이음표 자리에도: 첫 부품은 맞는 자리와 이음표, 나머지는 비밀이 든 자리, 이음표, 모르는 종류.
      // 예전 꼴의 줄(rows)도 남겨 둔다: 열어 바꾸기 전의 파일을 모양으로 읽어도 그 안의 글이 나가면 안 된다
      blocks: [
        { ...block('message', 1), at: { x: 0, y: 0, w: 6, h: 6 }, link: 'arrow', linkBelow: 'plus' },
        { ...block('number', 5), at: { x: 6, y: 0, w: 6, h: 6 }, link: s('link'), linkBelow: s('below') } as unknown as Block,
        { ...block('bullets', 2), at: { x: s('x'), y: 6, w: 4, h: 6 }, stack: [block('ring', 7)] } as unknown as Block,
        { ...block('kpi', 3), at: { x: 4, y: 6, w: 4, h: s('h') }, link: s('link') } as unknown as Block,
        { ...block(s('type'), 4), at: { x: 8, y: 6, w: 4, h: 6 } },
      ],
      ...({ rows: [{ id: s('row-1'), spans: [s('span')], blocks: [block('delta', 6)], link: s('rowlink') }] } as object),
    },
  ]
}

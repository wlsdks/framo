import { BLOCKS, BOARD_COLS, MAX_BLOCKS, MAX_LARGE, type NoRoom, type SpanLimit } from '../../deck/blocks'
import type { Block, BlockType } from '../../deck/types'
import { josa } from '../../lib/josa'

// 부품을 넣을 수 없는 까닭(deck/blocks.ts의 NoRoom)을 쓰는 사람이 읽는 말로.
// 무엇이 안 되는지(why)와 어떻게 하면 되는지(fix)를 나눠서, 끄는 동안에는 짧게, 눌러서 볼 때는 둘 다 보인다.

/** 12칸 가운데 몇 칸인지를 장 너비의 몫으로 (딱 떨어지지 않으면 가까운 쪽보다 조금 넓게 읽히는 말) */
function widthText(span: number): string {
  const named: Record<number, string> = { 3: '4분의 1', 4: '3분의 1', 6: '절반', 8: '3분의 2', 9: '4분의 3' }
  return named[span] ?? (span < 6 ? '3분의 1' : span < 8 ? '절반' : '3분의 2')
}

/** 그 너비가 있어야 한다는 말. 장 너비를 다 쓰는 것은 따로: '장 너비의 전체 이상이 있어야'는 말이 되지 않았다 */
const needWidth = (span: number) => (span >= 12 ? '슬라이드 너비를 다 써야' : `슬라이드 너비의 ${widthText(span)} 이상이 있어야`)

/** 판의 선을 더 끌 수 없을 때 (deck/blocks/place.ts의 gutterLimit) */
export function narrowText(limit: SpanLimit): string {
  const name = josa(BLOCKS[limit.type].name, '은', '는')
  return limit.minSpan
    ? `${name} ${needWidth(limit.minSpan)} 해서 더 좁힐 수 없어요.`
    : `${name} 더 낮으면 글이 잘려서 더 줄일 수 없어요.`
}

/**
 * 컴포넌트 테두리의 옆 끝을 끌었는데 그쪽이 슬라이드 끝이라 넓힐 수 없을 때 (BlockEditor의 widenAt).
 * 혼자 슬라이드 너비를 다 쓰면 더 넓어질 데가 없고 긴 글은 칸 안에서 줄이 바뀐다는 것을, 옆에 컴포넌트가 있으면 그쪽 끝을 끌면 된다는 것을
 */
export function edgeText(b: Block): string {
  return (b.at?.w ?? BOARD_COLS) >= BOARD_COLS
    ? `‘${BLOCKS[b.type].name}’ 컴포넌트는 이미 슬라이드 너비를 다 써서 더 넓힐 수 없어요. 긴 글은 칸 안에서 줄이 바뀌어요.`
    : '이쪽은 슬라이드 끝이라 더 넓힐 수 없어요. 옆 컴포넌트 쪽 끝을 끌면 너비가 바뀌어요.'
}

export interface NoRoomText {
  /** 무엇이 안 되는지 */
  why: string
  /** 어떻게 하면 되는지 */
  fix: string
}

/**
 * where: 'here'는 끌고 있는 그 자리, 'move'는 장 안의 컴포넌트를 끌어 옮기는 그 자리, 'slide'는 이 장 어디에도,
 * 'change'는 고른 부품을 바꿀 때(항목 더하기, 모양, 바탕)
 */
export function noRoomText(r: NoRoom, type: BlockType, where: 'here' | 'move' | 'slide' | 'change'): NoRoomText {
  const name = BLOCKS[type].name
  switch (r.kind) {
    case 'full':
      return { why: `슬라이드 하나에는 컴포넌트를 ${MAX_BLOCKS}개까지 넣어요.`, fix: '컴포넌트를 하나 지우거나 새 슬라이드에 넣어 주세요.' }
    case 'large':
      return {
        why: `작은 컴포넌트가 아닌 것은 슬라이드 하나에 ${MAX_LARGE}개까지 넣어요. 더 많으면 어디를 봐야 할지 흐려져요.`,
        fix: '컴포넌트를 하나 지우거나 새 슬라이드에 넣어 주세요. 소제목, 숫자 한 줄 같은 작은 컴포넌트는 더 넣을 수 있어요.',
      }
    case 'link':
      return { why: '기존 연결 기호의 대상을 유지하며 컴포넌트를 넣을 자리가 없어요.', fix: '연결 기호를 조정하거나 새 슬라이드에 넣어 주세요.' }
    case 'narrow':
      return {
        why: `${josa(name, '은', '는')} ${needWidth(r.span)} 해서, 여기에 끼우면 너무 좁아져요.`,
        fix: '위나 아래에 새 줄로 놓아 보세요.',
      }
    case 'solo': {
      const solo = BLOCKS[r.type].name
      return {
        why: `${josa(solo, '은', '는')} 슬라이드 너비를 혼자 써요. 옆에 다른 컴포넌트를 두면 둘 다 좁아져 읽기 어려워요.`,
        fix: '위나 아래에 새 줄로 놓아 보세요.',
      }
    }
    case 'look':
      return r.why === 'one-bold'
        ? { why: '강조는 슬라이드 하나에 하나만 써요. 둘이면 어느 쪽이 결론인지 흐려져요.', fix: '다른 컴포넌트의 강조를 먼저 바꿔 주세요.' }
        : r.why === 'mix'
          ? { why: '들여 쓰기와 강조는 한 슬라이드에 같이 쓰지 않아요. 묶는 방식 두 가지가 눈길을 나눠 가져요.', fix: '이 슬라이드의 다른 컴포넌트와 같은 바탕을 골라 주세요.' }
          : r.why === 'alone'
            ? { why: '슬라이드 너비를 혼자 다 쓰는 컴포넌트는 바탕 없이 써요. 넓은 칸 안에 글이 한쪽에만 있어 비어 보여요.', fix: '옆에 컴포넌트를 하나 더 놓으면 둘 다 고를 수 있어요.' }
            : r.why === 'no-bold'
              ? { why: '강조는 숫자나 강조할 말 하나에만 써요. 목록이나 그림까지 강조하면 어디가 결론인지 흐려져요.', fix: '들여 쓰기를 골라 보세요.' }
              : { why: '이 컴포넌트는 바탕 없이 써요. 안에 이미 칸과 줄이 있어요.', fix: '강조할 것은 큰 숫자나 강조 상자에 강조를 골라 보세요.' }
    case 'swap': {
      // 같은 컴포넌트끼리면 '큰 숫자와 큰 숫자'가 아니라 '두 큰 숫자'
      const other = BLOCKS[r.type].name
      const pair = other === name ? `두 ${name}` : `${josa(name, '과', '와')} ${other}`
      return { why: `${josa(pair, '은', '는')} 크기가 맞지 않아 자리를 맞바꿀 수 없어요.`, fix: '옆이나 위아래에 놓아 보세요.' }
    }
    case 'height': {
      if (r.noBody)
        return { why: '이 슬라이드에는 본문을 넣을 높이가 없어요.', fix: '제목이나 부제를 줄이거나 새 슬라이드에 넣어 주세요.' }
      // 넣기 전부터 넘친 장: '넣으면 장 높이를 넘어서'라고 하면 지금은 들어가는 줄 안다
      if (r.already)
        return {
          why: '이 슬라이드의 컴포넌트들이 이미 슬라이드 높이를 넘었어요.',
          fix: where === 'change' ? '항목을 줄이거나 컴포넌트를 지우면 바꿀 수 있어요.' : '항목을 줄이거나 컴포넌트를 지우면 들어가요.',
        }
      // 몇 %인지는 쓰는 사람에게 뜻이 없다. 조금 넘치는지만 알려 주면 항목 하나만 빼도 되는지 가늠한다
      const over = r.need / Math.max(1, r.room) <= 1.1 ? '슬라이드 높이를 조금 넘어서' : '슬라이드 높이를 넘어서'
      return {
        why:
          where === 'change'
            ? `이렇게 바꾸면 이 슬라이드의 컴포넌트들이 ${over} 글이 잘려요.`
            : where === 'move'
              ? `${josa(name, '을', '를')} 여기로 옮기면 이 슬라이드의 컴포넌트들이 ${over} 글이 잘려요.`
              : `${josa(name, '을', '를')} 넣으면 이 슬라이드의 컴포넌트들이 ${over} 글이 잘려요.`,
        fix: where === 'change' ? '다른 컴포넌트를 지우거나 항목을 줄이면 바꿀 수 있어요.' : '다른 컴포넌트를 지우거나 항목을 줄이면 들어가요.',
      }
    }
  }
}

/**
 * 이 장에 넣지 않을 때 알리는 말: 무엇을, 왜. composable이 거짓이면 표지와 섹션처럼 컴포넌트를 넣지 않는 장.
 * 넣지 못하면 저절로 다음 장을 만들지 않고 이 말과 '새 장에 넣기'를 보인다
 */
export function refuseText(r: NoRoom | null, type: BlockType, composable: boolean): string {
  if (!composable) return '표지와 섹션 슬라이드에는 컴포넌트를 넣지 않아요.'
  const name = josa(BLOCKS[type].name, '은', '는')
  return r ? `${name} 이 슬라이드에 함께 넣을 수 없어요. ${noRoomText(r, type, 'slide').why}` : `${name} 이 슬라이드에 함께 넣을 수 없어요. 자리가 모자라요.`
}

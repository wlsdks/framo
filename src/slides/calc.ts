// 계산식(calc) 부품을 한 줄로 둘 수 있는 칸 너비. 셈(셈 기호 읽기, 결과 확인)은 deck/calc.ts, 그리기는 blocks/Calc.tsx

import { numberUnits } from './fields'

/** 칸 너비의 문턱들(calc.css의 @container와 같은 값) */
const NEEDS = [560, 720, 880, 1100, 1400, 1680]
/** 한 줄 꼴에서 숫자가 이 글자 크기보다 작아지면 한 줄로 두지 않는다(글자 크기 단계의 52) */
const ROW_MIN = 52
/** 숫자 사이 셈 기호 칸의 너비(기호와 양옆 틈) */
const OP_W = 84
/** 숫자 칸 하나의 가장 좁은 너비: 짧은 숫자('3%') 아래의 이름이 두 줄 안에 들게(이름은 기호 아래 틈까지 쓴다) */
const CELL_MIN = 124

/**
 * 계산식을 한 줄(값 기호 값 = 결과)로 둘 수 있는 가장 좁은 칸 너비(문턱 하나로 올림). 숫자는 모두 같은 크기이고 칸은 제 숫자의
 * 폭만큼이라, 숫자들의 폭을 더한 것에 기호 칸들. 가장 넓은 칸으로도 모자라면 'stack'(영수증처럼 쌓기). nums는 결과까지 그려지는 숫자들
 */
export function calcNeed(nums: string[]): string {
  const need = nums.reduce((w, t) => w + Math.max(CELL_MIN, numberUnits(t || '0') * ROW_MIN), 0) + (nums.length - 1) * OP_W
  const fit = NEEDS.find((x) => need <= x)
  return fit ? String(fit) : 'stack'
}

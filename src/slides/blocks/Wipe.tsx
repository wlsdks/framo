// 부품: 바뀌기 (wipe). 모양은 styles/blocks/wipe.css, 움직임은 motion/engine.ts의 nativeAuto

import type { CSSProperties } from "react";
import { BLOCKS } from "../../deck/blocks";
import { isBlankItem } from "../../deck/fields";
import { rowHint } from "../../deck/layouts";
import { cx } from "../../lib/cx";
import { useSlide } from "../context";
import { IT, ItemTools, T, textUnits } from "../fields";

/**
 * 넓은 칸에서 짝마다 한 단으로 세울 수 있는 바뀐 뒤 글의 가장 긴 폭(글자 크기 em, 짝 수마다). 한 단은 칸 너비를 짝 수로 나눈 만큼이라
 * 판을 혼자 쓰는 칸(1680px)에서 바뀐 뒤 글이 키운 크기(52px)로 한 줄에 드는 폭이다. 넘으면 짝마다 한 줄(지금 | 바뀐 뒤)로 둔다:
 * 짝 넷에 18자 남짓한 글을 한 단씩 세우던 때는 칸마다 서너 줄로 꺾이고 끝 줄에 낱말 하나가 남았다(검수). 지금 글은 작고 두 줄까지
 * 괜찮아서 1.6배까지
 */
const ACROSS_EM = [0, 24, 12, 8.5];

/**
 * 바뀌기: 지금의 모습이 바뀐 뒤의 모습으로 넘어가는 장면. 짝마다 지금(옅은 글, 가는 취소선)과 바뀐 뒤(크고 굵게)를 둔다: 넓은 칸은 짝마다
 * 한 단(위에 지금, 아래에 바뀐 뒤)으로 칸 너비를 나눠 쓰고, 보통 칸은 짝마다 한 줄(왼쪽에 지금, 오른쪽에 바뀐 뒤)로(wipe.css).
 * 비교(두 단의 표)와 달리 '넘어간다'가 주인공이라, 발표할 때 세로 선 하나가 왼쪽에서 오른쪽으로 훑고 지나가며 지금에 줄을 긋고
 * 바뀐 뒤를 드러낸다(engine.ts). 다 보인 모습에서도 취소선과 크기로 앞뒤가 읽힌다
 */
export function Wipe() {
  const { slide, mode } = useSlide();
  const all = slide.items
    .slice(0, BLOCKS.wipe.items!.max)
    .map((it, i) => ({ it, i }));
  const shown =
    mode === "final" ? all.filter(({ it }) => !isBlankItem(it)) : all;
  // 보이는 글(편집할 때 빈칸은 안내)의 폭으로 짜임을 고른다
  const seen = (it: (typeof all)[number]["it"], i: number, k: "title" | "body") =>
    it[k].trim() || (mode === "final" ? "" : rowHint(slide.layout, slide.hints, it, k, i));
  const limit = ACROSS_EM[shown.length] ?? 0;
  const across =
    limit > 0 &&
    shown.every(({ it, i }) => textUnits(seen(it, i, "body")) <= limit && textUnits(seen(it, i, "title")) <= limit * 1.6);
  return (
    <div className={cx("bk-wp", !across && "is-rows")} data-n={shown.length} style={{ "--wp-n": shown.length } as CSSProperties}>
      <div className="bk-wp-frame">
        <div className="bk-wp-head">
          <T k="from" className="bk-wp-hf" oneLine />
          <T k="to" className="bk-wp-ht" oneLine />
        </div>
        <ol className="bk-wp-list">
          {shown.map(({ it, i }, k) => (
            <li
              key={it.id}
              className="it bk-wp-row"
              style={{ "--k": k } as CSSProperties}
            >
              {/* 지금과 바뀐 뒤는 한 문장씩: Enter는 다음 짝으로(줄바꿈은 Shift+Enter). Enter가 줄바꿈이던 때는 처음 쓰는 사람이 다음 줄을
                  쓰려고 Enter를 눌러 한 칸에 두 문장을 썼다(처음 쓰는 사람 검수). 길면 칸 너비에서 저절로 꺾인다 */}
              <span className="bk-wp-was">
                <IT i={i} k="title" className="bk-wp-old" multiline enterNext />
              </span>
              <IT i={i} k="body" className="bk-wp-new" multiline enterNext />
              <ItemTools i={i} />
            </li>
          ))}
        </ol>
      </div>
      <span className="bk-wp-bar" aria-hidden="true" />
    </div>
  );
}

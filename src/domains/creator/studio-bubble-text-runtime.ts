import {
  BUBBLE_AUTO_SHRINK_MIN_FONT_DEFAULT,
  createCanvasBubbleTextMeasurer,
  fitBubbleFontSize,
} from "./studio-bubble-text-fit";

import type { BubbleEl } from "./studio-element-model";

// 말풍선 자동 축소(studio-bubble-text-fit) 실측 캔버스 측정기 — 모듈 스코프에 1회만 생성한다
// (내부 공유 <canvas>를 감싸는 얇은 래퍼라 element/렌더별로 새로 만들 이유가 없다).
export const BUBBLE_TEXT_MEASURER = createCanvasBubbleTextMeasurer();

export function formatVerticalText(text: string): string {
  const lines = text.split("\n");
  const maxLen = Math.max(...lines.map((line) => line.length));
  const resultLines: string[] = [];
  for (let charIdx = 0; charIdx < maxLen; charIdx++) {
    const rowChars: string[] = [];
    for (let lineIdx = lines.length - 1; lineIdx >= 0; lineIdx--) {
      const char = lines[lineIdx]?.[charIdx] ?? "　";
      rowChars.push(char);
    }
    resultLines.push(rowChars.join("  "));
  }
  return resultLines.join("\n");
}

// 말풍선 "크기 고정" 미리보기 — 인스펙터가 StudioBubbleAutoShrinkPanel에 넘길 계산된 폰트 크기/
// 오버플로 여부. autoShrinkText가 꺼져 있으면 계산 자체를 하지 않는다(null).
//
// lineHeight를 인자로 받는 이유: webtoonTheme(컴포넌트 useState)에 접근할 수 없는 공유 모듈이므로
// 실제 렌더가 쓰는 bubbleLineHeight와 정확히 같은 값을 호출부가 계산해 넘겨야 한다.
export function bubbleAutoShrinkPreview(
  el: BubbleEl,
  lineHeight: number
): { fontSize: number; overflow: boolean } | null {
  if (!el.autoShrinkText) return null;
  return fitBubbleFontSize(
    {
      text: el.vertical ? formatVerticalText(el.text) : el.text,
      boxWidth: el.width,
      boxHeight: el.height,
      maxFontSize: el.fontSize ?? 24,
      minFontSize: el.autoShrinkMinFontSize ?? BUBBLE_AUTO_SHRINK_MIN_FONT_DEFAULT,
      fontFamily: el.font ?? "Pretendard, sans-serif",
      fontStyle: el.fontStyle ?? "bold",
      lineHeight,
    },
    BUBBLE_TEXT_MEASURER
  );
}

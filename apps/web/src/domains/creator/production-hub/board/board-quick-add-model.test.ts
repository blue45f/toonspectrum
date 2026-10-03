import { describe, expect, it } from "vitest";

import { QUICK_ADD_MAX_CARDS, QUICK_ADD_MAX_TITLE, splitQuickAddTitles } from "./board-quick-add-model";

describe("빠른 추가 입력", () => {
  it("줄마다 카드 한 장으로 나누고 빈 줄과 앞뒤 공백을 버린다", () => {
    expect(splitQuickAddTitles("  첫 카드 \r\n\n둘째 카드\n   \n")).toEqual(["첫 카드", "둘째 카드"]);
    expect(splitQuickAddTitles("   ")).toEqual([]);
  });

  it("한 번에 만드는 카드 수와 제목 길이를 제한한다", () => {
    expect(splitQuickAddTitles(Array.from({ length: 30 }, (_, index) => `카드 ${index}`).join("\n"))).toHaveLength(QUICK_ADD_MAX_CARDS);
    expect(splitQuickAddTitles("가".repeat(QUICK_ADD_MAX_TITLE + 50))[0]).toHaveLength(QUICK_ADD_MAX_TITLE);
  });
});

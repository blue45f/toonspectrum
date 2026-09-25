import { describe, expect, it } from "vitest";

import { resolveStudioTouchTapAction, studioTouchGestureHint } from "./studio-touch-gesture-policy";

import type { StudioTouchTapPreferences } from "./studio-touch-gesture-policy";

const CASES: readonly StudioTouchTapPreferences[] = [
  { twoFinger: "pan-zoom", threeFinger: "undo" },
  { twoFinger: "pan-zoom", threeFinger: "toggle-ui" },
  { twoFinger: "pan-zoom", threeFinger: "none" },
  { twoFinger: "undo-redo", threeFinger: "undo" },
  { twoFinger: "undo-redo", threeFinger: "toggle-ui" },
  { twoFinger: "undo-redo", threeFinger: "none" },
];

describe("Studio 터치 제스처 설정과 안내", () => {
  it.each(CASES)("두/세 손가락 설정을 실행과 안내에 동일하게 적용한다: %j", (preferences) => {
    const hint = studioTouchGestureHint(preferences);
    expect(resolveStudioTouchTapAction(2, preferences)).toBe(preferences.twoFinger === "undo-redo" ? "undo" : null);
    expect(resolveStudioTouchTapAction(3, preferences)).toBe(preferences.threeFinger === "none" ? null : preferences.threeFinger);
    expect(resolveStudioTouchTapAction(4, preferences)).toBe("toggle-ui");
    expect(hint).not.toContain("다시 실행");
    expect(hint.includes("두 손가락으로 캔버스를 이동·확대해요.")).toBe(preferences.twoFinger === "pan-zoom");
    expect(hint.includes("두 손가락을 짧게 탭하면 실행 취소해요.")).toBe(preferences.twoFinger === "undo-redo");
    expect(hint.includes("세 손가락을 짧게 탭하면 실행 취소해요.")).toBe(preferences.threeFinger === "undo");
    expect(hint.includes("세 손가락 탭으로 도구막대를 숨기거나 표시해요.")).toBe(preferences.threeFinger === "toggle-ui");
    expect(hint).toContain("네 손가락 탭으로 도구막대를 숨기거나 표시해요.");
  });

  it.each([0, 1, 5, -1, 2.5, Number.NaN])("지원하지 않는 손가락 수 %s는 명령을 실행하지 않는다", (count) => {
    expect(resolveStudioTouchTapAction(count, { twoFinger: "pan-zoom", threeFinger: "undo" })).toBeNull();
  });
});

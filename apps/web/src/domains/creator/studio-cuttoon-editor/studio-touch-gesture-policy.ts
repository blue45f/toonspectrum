import type { StudioAppSettings } from "../studio-app-settings";

export type StudioTouchTapPreferences = Pick<StudioAppSettings["touch"], "twoFinger" | "threeFinger">;
export type StudioTouchTapAction = "undo" | "toggle-ui";

/** 실행기와 도크 안내가 같은 사용자 설정을 해석한다. */
export function resolveStudioTouchTapAction(
  count: number,
  preferences: StudioTouchTapPreferences,
): StudioTouchTapAction | null {
  if (count === 2) return preferences.twoFinger === "undo-redo" ? "undo" : null;
  if (count === 3) return preferences.threeFinger === "none" ? null : preferences.threeFinger;
  return count === 4 ? "toggle-ui" : null;
}

/** 화면 이동 설정에서 두 손가락 실행 취소나 세 손가락 다시 실행을 안내하지 않는다. */
export function studioTouchGestureHint(preferences: StudioTouchTapPreferences): string {
  const hints = [preferences.twoFinger === "pan-zoom"
    ? "두 손가락으로 캔버스를 이동·확대해요."
    : "두 손가락을 짧게 탭하면 실행 취소해요."];
  const threeFingerAction = resolveStudioTouchTapAction(3, preferences);
  if (threeFingerAction === "undo") hints.push("세 손가락을 짧게 탭하면 실행 취소해요.");
  else if (threeFingerAction === "toggle-ui") hints.push("세 손가락 탭으로 도구막대를 숨기거나 표시해요.");
  hints.push("네 손가락 탭으로 도구막대를 숨기거나 표시해요.");
  return hints.join(" ");
}

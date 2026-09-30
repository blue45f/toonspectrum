/** 포즈 첫 실행 가이드의 "다시 보지 않기" 상태를 localStorage에 저장/읽기. 컴포넌트 파일에서 분리해 Fast Refresh 규칙을 만족한다. */

function guideStorageKey(scope: string): string {
  return `toonstudio.pose-first-run-guide.dismissed.${scope}.v1`;
}

/** 이 scope의 가이드를 사용자가 닫았는지(다시 보지 않기) 읽는다. */
export function readStudioPoseGuideDismissed(scope: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(guideStorageKey(scope)) === "1";
  } catch {
    return false;
  }
}

/** 이 scope의 가이드 닫힘 상태를 기록한다. */
export function writeStudioPoseGuideDismissed(scope: string, dismissed: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (dismissed) {
      window.localStorage.setItem(guideStorageKey(scope), "1");
    } else {
      window.localStorage.removeItem(guideStorageKey(scope));
    }
  } catch {
    // 저장 실패는 무시하고 이번 세션 상태만 유지한다.
  }
}

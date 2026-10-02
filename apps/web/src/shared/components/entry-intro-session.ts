/**
 * 진입 인트로의 세션 정책 단일 출처.
 *
 * 과거에는 스플래시 컴포넌트 세 개가 같은 키를 각자 읽고 써서 정책이 흩어져
 * 있었다. 이제 표시 여부 판단과 기록은 이 모듈만 담당한다.
 */
export const ENTRY_INTRO_SESSION_KEY = "toonstudio-intro-shown";

/** 이미 본 세션인지. 저장소가 차단된 환경에서는 본 것으로 취급해 본문 진입을 보장한다. */
export function hasSeenEntryIntro(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.sessionStorage.getItem(ENTRY_INTRO_SESSION_KEY) !== null;
  } catch {
    return true;
  }
}

/** 본 것으로 기록한다. 기록 실패는 무시한다 — 장식용 인트로가 앱 진입을 막지 않는다. */
export function markEntryIntroSeen(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(ENTRY_INTRO_SESSION_KEY, "true");
  } catch {
    // 저장소 차단 환경 — 다음 마운트에서도 hasSeenEntryIntro가 본 것으로 취급한다.
  }
}

/**
 * 이번 마운트에서 인트로를 재생할지.
 * - SSR(window 없음)에서는 재생하지 않는다 — 본문이 먼저 그려지는 것이 원칙이다.
 * - once=false면 세션과 무관하게 매 마운트 재생(스토리·테스트용).
 */
export function shouldPlayEntryIntro(once: boolean | undefined): boolean {
  if (typeof window === "undefined") return false;
  if (once === false) return true;
  return !hasSeenEntryIntro();
}

import { useCallback, useSyncExternalStore } from "react";

/** HUD가 데스크톱 배치(비모달 우측 패널·한 줄 도크)를 쓰는 최소 폭. */
export const SPACE_HUD_DESKTOP_QUERY = "(min-width: 1024px)";
export const SPACE_HUD_REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function readMedia(query: string, fallback: boolean): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return fallback;
  return window.matchMedia(query).matches;
}

/**
 * 미디어 쿼리 구독. matchMedia가 없는 환경(서버·테스트)에서는 fallback을 쓴다.
 * 데스크톱 배치는 fallback true라서 테스트에서도 비모달 패널 계약을 그대로 검증한다.
 */
export function useSpaceMediaQuery(query: string, fallback: boolean): boolean {
  const subscribe = useCallback((notify: () => void) => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => undefined;
    const media = window.matchMedia(query);
    media.addEventListener("change", notify);
    return () => media.removeEventListener("change", notify);
  }, [query]);
  const snapshot = useCallback(() => readMedia(query, fallback), [query, fallback]);
  const serverSnapshot = useCallback(() => fallback, [fallback]);
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}

export function useSpaceDesktop(): boolean {
  return useSpaceMediaQuery(SPACE_HUD_DESKTOP_QUERY, true);
}

export function useSpaceReducedMotion(): boolean {
  return useSpaceMediaQuery(SPACE_HUD_REDUCED_MOTION_QUERY, false);
}

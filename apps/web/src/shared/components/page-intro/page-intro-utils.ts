/**
 * 페이지 진입 인트로 유틸 — PageIntro.tsx(컴포넌트 전용)와 분리된 모듈.
 * react-refresh/only-export-components 규칙을 지키기 위해 상수·함수는 여기에 둔다.
 */
import type { CSSProperties } from "react";

export type PageIntroVariant =
  | "market"
  | "community"
  | "play"
  | "pencafe"
  | "promote"
  | "default";

/** 인트로 재생 시간(ms). 베일 페이드아웃 200ms 포함. */
export const PAGE_INTRO_DURATION_MS = 950;

const SESSION_KEY_PREFIX = "ts-page-intro:v1:";

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function alreadySeen(pathname: string): boolean {
  try {
    return typeof window !== "undefined"
      && window.sessionStorage.getItem(SESSION_KEY_PREFIX + pathname) === "1";
  } catch {
    return false;
  }
}

export function markSeen(pathname: string): void {
  try {
    window.sessionStorage.setItem(SESSION_KEY_PREFIX + pathname, "1");
  } catch {
    /* 저장 실패는 무시하고 다음 방문에 다시 재생 */
  }
}

/**
 * 스태거 등장용 props. 카드 그리드의 li 등에 `{...introItemProps(index)}`로 붙인다.
 * index가 커져도 전체 연출이 1초를 넘지 않도록 내부에서 상한을 둔다.
 */
export function introItemProps(index: number): {
  "data-intro-item": string;
  style: CSSProperties;
} {
  const clamped = Math.min(Math.max(Math.floor(index), 0), 12);
  return {
    "data-intro-item": "",
    style: { "--intro-index": clamped } as CSSProperties,
  };
}

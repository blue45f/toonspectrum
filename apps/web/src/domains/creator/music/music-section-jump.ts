import type { MouseEvent } from "react";

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/** 같은 화면 안의 영역으로 이동하고 초점을 옮긴다. 영역이 없으면 기본 링크 동작을 그대로 둔다. */
export function jumpToMusicSection(event: MouseEvent<HTMLAnchorElement>, anchor: string): void {
  const target = document.getElementById(anchor);
  if (!target) return;
  event.preventDefault();
  target.scrollIntoView({ block: "start", behavior: prefersReducedMotion() ? "auto" : "smooth" });
  target.focus({ preventScroll: true });
}

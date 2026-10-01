import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * Studio 경로는 앱 셸이 해시(#섹션)로 스크롤하지 않으므로, 다른 화면에서 `/경로#섹션`으로 들어왔을 때
 * 화면이 그린 뒤 해당 섹션으로 이동한다. 알려진 id만 허용해 임의 요소로 초점을 옮기지 않는다.
 */
export function useHashAnchorScroll(knownIds: readonly string[]): void {
  const { hash } = useLocation();
  useEffect(() => {
    let anchor: string;
    try {
      anchor = decodeURIComponent(hash.slice(1));
    } catch {
      return;
    }
    if (!anchor || !knownIds.includes(anchor)) return;
    const frame = requestAnimationFrame(() => {
      const target = document.getElementById(anchor);
      if (!target) return;
      target.scrollIntoView({ block: "start" });
      if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
      target.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [hash, knownIds]);
}

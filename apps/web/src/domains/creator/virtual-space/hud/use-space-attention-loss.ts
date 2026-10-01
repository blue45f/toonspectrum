import { useEffect, useRef } from "react";

/**
 * 창이 초점을 잃거나(blur) 탭이 숨겨지면(visibilitychange → hidden) 콜백을 부른다.
 * 따라가기·NPC 둘러보기처럼 사용자가 보고 있을 때만 이어가야 하는 동작을 멈출 때 쓴다.
 * 초점이 돌아와도 자동으로 다시 시작하지 않는다.
 */
export function useSpaceAttentionLoss(onLoss: () => void): void {
  const latest = useRef(onLoss);
  latest.current = onLoss;
  useEffect(() => {
    const blur = () => latest.current();
    const visibility = () => { if (document.visibilityState === "hidden") latest.current(); };
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
}

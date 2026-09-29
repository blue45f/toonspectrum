import { useEffect, useRef, useState } from "react";

import { prefersReducedMotion } from "./material-search-ux";

/**
 * 숫자가 0에서 목표값까지 ease-out으로 올라가는 카운트업 훅.
 * reduced-motion 선호 시 애니메이션 없이 목표값을 바로 표시한다.
 */
export function useCountUp(target: number, durationMs = 1200): number {
  const [value, setValue] = useState(0);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (prefersReducedMotion()) { setValue(target); return; }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(target * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs]);
  return value;
}

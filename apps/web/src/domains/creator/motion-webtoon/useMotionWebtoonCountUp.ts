/**
 * 시네마틱 숫자 카운트업 훅.
 *
 * reduced-motion이 켜져 있거나 값이 바뀌지 않으면 즉시 값을 반환한다.
 */

import { useEffect, useRef, useState } from "react";

export function useMotionWebtoonCountUp(target: number, durationMs = 900): number {
  const [value, setValue] = useState(target);
  const rafRef = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined") {
      setValue(target);
      return;
    }
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (reduced || durationMs <= 0) {
      setValue(target);
      return;
    }
    const start = performance.now();
    const from = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs);
      // easeOutCubic — 빠르게 올라가다 부드럽게 정착.
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(from + (target - from) * eased);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, durationMs]);

  return value;
}

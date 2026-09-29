import { useEffect, useState } from "react";

import { clampProcessCompareBlinkMs } from "./process-compare-model";

export interface ProcessCompareBlink {
  /** 현재 보이는 레이어가 B(after)인지. */
  readonly phase: boolean;
  readonly togglePhase: () => void;
}

/**
 * 깜빡임 비교 모드의 자동 전환 타이머.
 * prefers-reduced-motion 환경에서는 자동 전환을 시작하지 않고 수동 전환만 제공한다.
 */
export function useProcessCompareBlink(
  active: boolean,
  enabled: boolean,
  intervalMs: number,
): ProcessCompareBlink {
  const [phase, setPhase] = useState(false);

  useEffect(() => {
    if (!active || !enabled) return;
    if (
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    const id = window.setInterval(() => setPhase((prev) => !prev), clampProcessCompareBlinkMs(intervalMs));
    return () => window.clearInterval(id);
  }, [active, enabled, intervalMs]);

  return {
    phase,
    togglePhase: () => setPhase((prev) => !prev),
  };
}

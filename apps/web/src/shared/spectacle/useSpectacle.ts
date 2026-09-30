import { useCallback, useEffect, useState } from "react";

import {
  canRunSpectacle,
  readSpectacleLevel,
  SPECTACLE_INTENSITY_EVENT,
  type SpectacleLevel,
} from "./spectacle-engine";

export interface SpectacleState {
  /** 현재 스펙터클 수준. */
  readonly level: SpectacleLevel;
  /** 움직임 연출 실행 가능 (light 이상). */
  readonly motion: boolean;
  /** 무거운 연출 실행 가능 (full 전용). */
  readonly heavy: boolean;
  /** 수준 다시 읽기. */
  refresh(): void;
}

/**
 * 스펙터클 수준 구독 훅.
 * 앰비언트 강도 변경(설정 페이지·다른 탭)을 실시간 반영한다.
 */
export function useSpectacle(): SpectacleState {
  const [level, setLevel] = useState<SpectacleLevel>(() => readSpectacleLevel());

  useEffect(() => {
    const sync = () => setLevel(readSpectacleLevel());
    window.addEventListener(SPECTACLE_INTENSITY_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(SPECTACLE_INTENSITY_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const refresh = useCallback(() => setLevel(readSpectacleLevel()), []);

  return {
    level,
    motion: canRunSpectacle(level, "motion"),
    heavy: canRunSpectacle(level, "heavy"),
    refresh,
  };
}

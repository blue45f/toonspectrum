import { useCallback } from "react";

import { launchSpectacleConfetti, type SpectacleConfettiOptions } from "./spectacle-confetti";
import {
  launchSpectacleFireworks,
  type SpectacleFireworksOptions,
} from "./spectacle-fireworks";

export interface SpectacleCelebration {
  /** 축하 컨페티 발사. 스펙터클 full 수준에서만 실제 연출된다. */
  celebrate(options?: SpectacleConfettiOptions): void;
  /** 폭죽 발사. 스펙터클 full 수준에서만 실제 연출된다. */
  fireworks(options?: SpectacleFireworksOptions): void;
}

/**
 * 축하 연출 훅.
 *
 * 작업 완료·배지 획득 등에서 celebrate()/fireworks()를 호출하면 된다.
 * 스펙터클 수준이 full이 아니면 조용히 넘어간다 (로직은 그대로 진행).
 */
export function useSpectacleCelebration(): SpectacleCelebration {
  const celebrate = useCallback((options?: SpectacleConfettiOptions) => {
    launchSpectacleConfetti(options);
  }, []);
  const fireworks = useCallback((options?: SpectacleFireworksOptions) => {
    launchSpectacleFireworks(options);
  }, []);
  return { celebrate, fireworks };
}

import { useCallback, useEffect, useState } from "react";

import { useI18n } from "@/shared/lib/i18n";

import {
  AMBIENT_INTENSITIES,
  prefersReducedMotion,
  readAmbientPreferences,
  writeAmbientIntensity,
  type AmbientIntensity,
} from "./ambient-engine";
import { getAmbientLabels, type AmbientLabels } from "./ambient-labels";

export interface AmbientExperience {
  /** 현재 강도. */
  readonly intensity: AmbientIntensity;
  /** 강도 변경 (저장 + 전역 알림). */
  setIntensity(intensity: AmbientIntensity): void;
  /** prefers-reduced-motion 사용자인지. */
  readonly reducedMotion: boolean;
  /** 현재 언어의 라벨. */
  readonly labels: AmbientLabels;
  /** 사용 가능한 강도 목록. */
  readonly intensities: readonly AmbientIntensity[];
}

/**
 * 앰비언트 연출 설정 훅.
 * 설정 페이지·호스트에서 공유한다.
 */
export function useAmbientExperience(): AmbientExperience {
  const lang = useI18n((state) => state.lang);
  const labels = getAmbientLabels(lang);
  const [intensity, setIntensityState] = useState<AmbientIntensity>(
    () => readAmbientPreferences().intensity,
  );
  const [reducedMotion] = useState(() => prefersReducedMotion());

  // 다른 곳에서 바뀐 강도 반영
  useEffect(() => {
    const sync = () => setIntensityState(readAmbientPreferences().intensity);
    window.addEventListener("storage", sync);
    window.addEventListener("toonstudio:ambient-intensity", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("toonstudio:ambient-intensity", sync);
    };
  }, []);

  const setIntensity = useCallback((next: AmbientIntensity) => {
    writeAmbientIntensity(next);
    setIntensityState(next);
    // 호스트에 알림 (같은 탭)
    window.dispatchEvent(new CustomEvent("toonstudio:ambient-intensity"));
  }, []);

  return {
    intensity,
    setIntensity,
    reducedMotion,
    labels,
    intensities: AMBIENT_INTENSITIES,
  };
}

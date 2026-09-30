import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

import { useI18n } from "@/shared/lib/i18n";

import {
  bgmEngine,
  isBgmSupported,
  moodForPath,
  prefersReducedMotion,
  readBgmPreferences,
  writeBgmEnabled,
  writeBgmVolume,
  type BgmEngineState,
  type BgmMood,
} from "./bgm-engine";
import { getBgmLabels, type BgmLabels } from "./bgm-labels";

export interface PageBgm {
  /** 브라우저가 Web Audio BGM을 지원하는지. */
  readonly supported: boolean;
  /** 현재 재생 중인지. */
  readonly playing: boolean;
  /** 현재 경로의 무드 (재생 여부와 무관). */
  readonly mood: BgmMood;
  /** 볼륨 0~1. */
  readonly volume: number;
  /** BGM 마스터 on/off (설정 저장). */
  readonly enabled: boolean;
  /** `prefers-reduced-motion` 사용자인지. */
  readonly reducedMotion: boolean;
  /** 현재 언어의 UI 라벨. */
  readonly labels: BgmLabels;
  /** BGM 시작 — 반드시 사용자 제스처(클릭/탭)에서 호출할 것. */
  start: () => boolean;
  /** BGM 정지. */
  stop: () => void;
  /** 볼륨 변경. */
  setVolume: (volume: number) => void;
  /** 마스터 on/off 변경. */
  setEnabled: (enabled: boolean) => void;
}

/**
 * 페이지별 BGM 훅.
 *
 * - 라우트가 바뀌면 재생 중일 때만 무드를 크로스페이드로 전환한다.
 * - 자동 시작은 `useBgmFirstInteractionStart`가 담당한다: 첫 사용자 인터랙
 *   (클릭/탭/키 입력)이 제스처 컨텍스트가 되므로 자동재생 정책을 만족한다.
 *   사용자가 끄거나 움직임 줄이기 설정이면 시작하지 않는다.
 * - 페이지를 떠나도 BGM은 유지된다 (전역 싱글톤).
 */
export function usePageBgm(): PageBgm {
  const { pathname } = useLocation();
  const lang = useI18n((state) => state.lang);
  const labels = getBgmLabels(lang);
  const mood = moodForPath(pathname);

  const [playing, setPlaying] = useState(bgmEngine.playing);
  const [currentMood, setCurrentMood] = useState<BgmMood>(bgmEngine.currentMood);
  const [volume, setVolumeState] = useState(() => readBgmPreferences().volume);
  const [enabled, setEnabledState] = useState(() => readBgmPreferences().enabled);
  const [reducedMotion] = useState(() => prefersReducedMotion());

  useEffect(() => {
    const unsubscribe = bgmEngine.onStateChange((state: BgmEngineState, nextMood: BgmMood) => {
      setPlaying(state === "playing");
      setCurrentMood(nextMood);
    });
    return unsubscribe;
  }, []);

  // 라우트 변경 → 재생 중이면 무드 전환 (크로스페이드).
  useEffect(() => {
    if (bgmEngine.playing) {
      bgmEngine.setMood(mood);
    }
    setCurrentMood(mood);
  }, [pathname, mood]);

  const start = useCallback(() => {
    const ok = bgmEngine.start(mood);
    if (ok) {
      bgmEngine.setVolume(readBgmPreferences().volume);
      writeBgmEnabled(true);
      setEnabledState(true);
    }
    return ok;
  }, [mood]);

  const stop = useCallback(() => {
    bgmEngine.stop();
  }, []);

  const setVolume = useCallback((next: number) => {
    bgmEngine.setVolume(next);
    writeBgmVolume(next);
    setVolumeState(bgmEngine.currentVolume);
  }, []);

  const setEnabled = useCallback((next: boolean) => {
    writeBgmEnabled(next);
    setEnabledState(next);
    if (!next) {
      bgmEngine.stop();
    }
  }, []);

  return {
    supported: isBgmSupported(),
    playing,
    mood: currentMood,
    volume,
    enabled,
    reducedMotion,
    labels,
    start,
    stop,
    setVolume,
    setEnabled,
  };
}

/** 라벨 접근용 (컴포넌트에서 사용). */
export { getBgmLabels };

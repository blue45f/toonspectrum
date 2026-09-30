/**
 * 모션 웹툰 재생 React 훅.
 *
 * MotionPlaybackController(순수 상태 머신)를 React 상태와 연결한다.
 * reduced-motion이 켜져 있으면 카메라 애니메이션만 끄고 오디오는 유지한다.
 */

import { useEffect, useMemo, useRef, useState } from "react";

import {
  createRealMotionPlaybackDeps,
  MotionPlaybackController,
  type MotionPlaybackDeps,
  type MotionPlaybackState,
} from "./motion-webtoon-playback";
import type { DialogueLine, MotionCut, MotionEpisode } from "./motion-webtoon-model";

export interface UseMotionWebtoonPlayerOptions {
  readonly episode: MotionEpisode;
  /** BGM on/off — 기본 true. */
  readonly bgmEnabled?: boolean;
  /** 대사 음성 on/off — 기본 true. */
  readonly voiceEnabled?: boolean;
  /** 테스트 주입용 deps. */
  readonly deps?: MotionPlaybackDeps;
}

export interface UseMotionWebtoonPlayer {
  readonly state: MotionPlaybackState;
  readonly cutIndex: number;
  readonly cut: MotionCut | null;
  readonly cutCount: number;
  readonly activeDialogue: DialogueLine | null;
  readonly reducedMotion: boolean;
  play(): void;
  pause(): void;
  stop(): void;
  nextCut(): void;
  prevCut(): void;
  seekCut(index: number): void;
}

function detectReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function useMotionWebtoonPlayer(
  options: UseMotionWebtoonPlayerOptions,
): UseMotionWebtoonPlayer {
  const { episode, bgmEnabled = true, voiceEnabled = true, deps: injectedDeps } = options;
  // refs를 useMemo보다 먼저 선언: deps 팩토리가 참조하므로 TDZ를 피한다.
  const bgmEnabledRef = useRef(bgmEnabled);
  const voiceEnabledRef = useRef(voiceEnabled);
  bgmEnabledRef.current = bgmEnabled;
  voiceEnabledRef.current = voiceEnabled;

  const deps = useMemo<MotionPlaybackDeps>(
    () =>
      injectedDeps ??
      createRealMotionPlaybackDeps({
        bgmEnabled: () => bgmEnabledRef.current,
        voiceEnabled: () => voiceEnabledRef.current,
      }),
    [injectedDeps],
  );

  const controllerRef = useRef<MotionPlaybackController | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = new MotionPlaybackController(deps);
  }
  const controller = controllerRef.current;

  const [state, setState] = useState<MotionPlaybackState>("idle");
  const [cutIndex, setCutIndex] = useState(0);
  const [activeDialogue, setActiveDialogue] = useState<DialogueLine | null>(null);
  const [reducedMotion, setReducedMotion] = useState(detectReducedMotion);

  // OS reduced-motion 설정을 재생 중에도 따라간다.
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleChange = (): void => setReducedMotion(query.matches);
    query.addEventListener("change", handleChange);
    return () => query.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    controller.load(options.episode);
    setCutIndex(0);
    setActiveDialogue(null);
  }, [controller, options.episode]);

  useEffect(() => {
    return controller.onEvent((event) => {
      switch (event.type) {
        case "state-change":
          setState(event.state);
          if (event.state === "idle") {
            setCutIndex(0);
            setActiveDialogue(null);
          }
          break;
        case "cut-change":
          setCutIndex(event.cutIndex);
          setActiveDialogue(null);
          break;
        case "dialogue-start":
          setActiveDialogue(event.dialogue);
          break;
        case "dialogue-end":
          setActiveDialogue((current) =>
            current?.id === event.dialogueId ? null : current,
          );
          break;
        case "ended":
          break;
      }
    });
  }, [controller]);

  useEffect(() => {
    return () => {
      controller.stop();
    };
  }, [controller]);

  return {
    state,
    cutIndex,
    cut: episode.cuts[cutIndex] ?? null,
    cutCount: episode.cuts.length,
    activeDialogue,
    reducedMotion,
    play: () => controller.play(),
    pause: () => controller.pause(),
    stop: () => controller.stop(),
    nextCut: () => controller.nextCut(),
    prevCut: () => controller.prevCut(),
    seekCut: (index: number) => controller.seekCut(index),
  };
}

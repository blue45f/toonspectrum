import { useEffect, useRef, useState } from "react";

import {
  chooseNaturalKoreanVoice,
  speakNaturalBrowserSpeech,
  type NaturalBrowserSpeechSession,
  type NaturalVoiceGender,
} from "../../shared/lib/natural-browser-speech";
import { buildSteps } from "./fortune-types";

import type { FortunePanel, PlaybackStep } from "./fortune-types";

// 운세 웹툰의 "재생"을 총괄하는 오케스트레이터.
// 패널을 스텝(대사/나레이션) 시퀀스로 펼쳐, 스텝마다
//   ① 활성 컷 포커스 ② 무료 시스템 음성 낭독 ③ 진행률에 맞춘 말풍선 타이핑
// 을 동기화해 모션코믹처럼 연출한다.
//
// 별도 TTS API를 호출하지 않는다. 브라우저/운영체제에 설치된 한국어 음성을 품질·화자
// 성향에 따라 자동 선택하고, 로컬 음성 감독이 문장을 호흡 단위로 나누어 속도와 피치를
// 미세하게 변화시킨다. 특정 음성이 없어도 어떤 캐릭터도 강제로 무음 처리하지 않는다.

type PlaybackStatus = "idle" | "playing" | "paused";

const VOICE_GENDER: Record<string, NaturalVoiceGender> = {
  ara: "female",
  leona: "female",
  danwoo: "male",
  gaon: "male",
  _narration: "neutral",
};

// 같은 시스템 음성을 사용하더라도 화자의 인상을 조금씩 구분한다.
const VOICE_PITCH: Record<string, number> = {
  ara: 1.055,
  leona: 0.99,
  danwoo: 0.94,
  gaon: 0.9,
  _narration: 1,
};

const SEGMENT_GAP_MS = 220;

export interface FortunePlayback {
  supported: boolean;
  status: PlaybackStatus;
  steps: PlaybackStep[];
  activeStep: number;
  activePanel: number;
  typed: number;
  speed: number;
  play: () => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  next: () => void;
  prev: () => void;
  setSpeed: (s: number) => void;
}

export function useFortunePlayback(panels: FortunePanel[] | undefined): FortunePlayback {
  const supported =
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    "SpeechSynthesisUtterance" in window;

  const steps = panels ? buildSteps(panels) : [];

  const [status, setStatus] = useState<PlaybackStatus>("idle");
  const [activeStep, setActiveStep] = useState(-1);
  const [typed, setTyped] = useState(0);
  const [speed, setSpeedState] = useState(1);

  const stepsRef = useRef<PlaybackStep[]>(steps);
  stepsRef.current = steps;
  const tokenRef = useRef(0);
  const speedRef = useRef(1);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);
  const speechSessionRef = useRef<NaturalBrowserSpeechSession | null>(null);

  useEffect(() => {
    if (!supported) return;
    const synth = window.speechSynthesis;
    const load = () => {
      try {
        voicesRef.current = synth.getVoices();
      } catch {
        voicesRef.current = [];
      }
    };
    load();
    synth.addEventListener("voiceschanged", load);
    return () => {
      synth.removeEventListener("voiceschanged", load);
      speechSessionRef.current?.cancel();
      speechSessionRef.current = null;
      try { synth.cancel(); } catch { /* capability disappeared */ }
    };
  }, [supported]);

  useEffect(() => {
    return () => {
      tokenRef.current += 1;
      clearTimers();
      cancelRef.current?.();
      speechSessionRef.current?.cancel();
      speechSessionRef.current = null;
      try { window.speechSynthesis?.cancel(); } catch { /* noop */ }
    };
  }, []);

  function clearTimers() {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (timerRef.current != null) clearTimeout(timerRef.current);
    timerRef.current = null;
  }

  function timedTypingStep(
    text: string,
    onProgress: (chars: number) => void,
    onEnd: () => void
  ): () => void {
    let cancelled = false;
    const started = performance.now();
    const cps = 12 * speedRef.current;
    const tick = () => {
      if (cancelled) return;
      const chars = Math.floor(((performance.now() - started) / 1000) * cps);
      onProgress(Math.min(text.length, chars));
      if (chars >= text.length) {
        timerRef.current = setTimeout(onEnd, 250);
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }

  // 한 스텝 낭독 + 진행률(타이핑) 콜백. cancel 함수를 반환한다.
  function speakStep(
    step: PlaybackStep,
    onProgress: (chars: number) => void,
    onEnd: () => void
  ): () => void {
    const text = step.text;
    if (!supported) return timedTypingStep(text, onProgress, onEnd);

    const speakerKey = step.characterId ?? "_narration";
    const voice = chooseNaturalKoreanVoice(voicesRef.current, {
      gender: VOICE_GENDER[speakerKey] ?? "neutral",
      // 온라인/뉴럴 OS 음성도 사용자가 설치·활성화한 시스템 보이스일 때만 후보가 된다.
      // 제품의 유료 TTS API를 호출하지 않으며 자연스러움을 우선한다.
      preferLocal: false,
    });

    let cancelled = false;
    let session: NaturalBrowserSpeechSession | null = null;
    const finish = () => {
      if (cancelled) return;
      if (speechSessionRef.current === session) speechSessionRef.current = null;
      onProgress(text.length);
      onEnd();
    };

    session = speakNaturalBrowserSpeech({
      text,
      voice,
      style: step.characterId ? "dialogue" : "fortune",
      rate: speedRef.current,
      pitch: VOICE_PITCH[speakerKey] ?? 1,
      maxSegmentChars: step.characterId ? 48 : 64,
      onProgress: (chars) => {
        if (!cancelled) onProgress(Math.min(text.length, chars));
      },
      onEnd: finish,
      // 한 문장의 시스템 음성 오류가 전체 운세 재생을 멈추게 하지 않는다.
      onError: finish,
    });

    if (!session) return timedTypingStep(text, onProgress, onEnd);
    speechSessionRef.current = session;
    return () => {
      cancelled = true;
      session?.cancel();
      if (speechSessionRef.current === session) speechSessionRef.current = null;
    };
  }

  function runStep(i: number) {
    const list = stepsRef.current;
    const token = tokenRef.current;
    if (i < 0 || i >= list.length) {
      setStatus("idle");
      setActiveStep(-1);
      speechSessionRef.current = null;
      return;
    }
    setActiveStep(i);
    setTyped(0);
    cancelRef.current?.();
    cancelRef.current = speakStep(
      list[i],
      (chars) => {
        if (tokenRef.current === token) setTyped(chars);
      },
      () => {
        if (tokenRef.current !== token) return;
        timerRef.current = setTimeout(() => {
          if (tokenRef.current !== token) return;
          runStep(i + 1);
        }, SEGMENT_GAP_MS);
      }
    );
  }

  function startFrom(i: number) {
    if (stepsRef.current.length === 0) return;
    tokenRef.current += 1;
    clearTimers();
    cancelRef.current?.();
    speechSessionRef.current?.cancel();
    speechSessionRef.current = null;
    setStatus("playing");
    runStep(Math.max(0, Math.min(i, stepsRef.current.length - 1)));
  }

  const play = () => {
    if (status === "paused") {
      resume();
      return;
    }
    startFrom(0);
  };

  const stop = () => {
    tokenRef.current += 1;
    clearTimers();
    cancelRef.current?.();
    cancelRef.current = null;
    speechSessionRef.current?.cancel();
    speechSessionRef.current = null;
    try { window.speechSynthesis?.cancel(); } catch { /* noop */ }
    setStatus("idle");
    setActiveStep(-1);
    setTyped(0);
  };

  const pause = () => {
    if (status !== "playing") return;
    if (!speechSessionRef.current?.pause()) {
      try { window.speechSynthesis?.pause(); } catch { /* noop */ }
    }
    setStatus("paused");
  };

  const resume = () => {
    if (status !== "paused") return;
    if (!speechSessionRef.current?.resume()) {
      try { window.speechSynthesis?.resume(); } catch { /* noop */ }
    }
    setStatus("playing");
  };

  const next = () => {
    const target = activeStep < 0 ? 0 : activeStep + 1;
    if (target >= stepsRef.current.length) {
      stop();
      return;
    }
    startFrom(target);
  };

  const prev = () => {
    const target = Math.max(0, activeStep < 0 ? 0 : activeStep - 1);
    startFrom(target);
  };

  const setSpeed = (value: number) => {
    speedRef.current = value;
    setSpeedState(value);
  };

  const activePanel = activeStep >= 0 && steps[activeStep] ? steps[activeStep].panel : -1;

  return {
    supported,
    status,
    steps,
    activeStep,
    activePanel,
    typed,
    speed,
    play,
    pause,
    resume,
    stop,
    next,
    prev,
    setSpeed,
  };
}

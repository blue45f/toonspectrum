/**
 * 컷츠 내레이션 — 브라우저 내장 Web Speech API(무료)로 샷별 대본을 읽는다.
 *
 * 클라우드 TTS(유료)는 쓰지 않는다. `cuts-clip-builder`가 만든
 * `narrationPlain`(감정 마크업 제거된 순수 텍스트)을 utterance 단위로 재생하고,
 * 감정 세그먼트의 rate/pitch는 발화 파라미터에 그대로 반영한다.
 */

import { useEffect, useRef } from "react";

import type { CutsShot } from "./cuts-types";

function pickKoreanVoice(voices: readonly SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const koVoices = voices.filter((voice) => voice.lang.toLowerCase().startsWith("ko"));
  if (koVoices.length === 0) return null;
  const preferred = koVoices.find((voice) =>
    /natural|neural|google|samsung/i.test(voice.name),
  );
  return preferred ?? koVoices[0];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export interface CutsNarrationControls {
  /** 샷 내레이션 재생 시작. */
  speakShot: (shot: CutsShot) => void;
  /** 재생 중지. */
  stop: () => void;
}

/**
 * 내레이션 컨트롤을 반환한다. 마운트 해제 시 항상 speech를 취소한다.
 * Web Speech 미지원 환경에서는 no-op이다.
 */
export function useCutsNarration(): CutsNarrationControls {
  const supported = useRef(
    typeof window !== "undefined" && "speechSynthesis" in window,
  );

  useEffect(() => {
    const isSupported = supported.current;
    return () => {
      if (isSupported) window.speechSynthesis.cancel();
    };
  }, []);

  const api = useRef<CutsNarrationControls | null>(null);
  if (!api.current) {
    api.current = {
      speakShot: (shot) => {
        if (!supported.current) return;
        const synth = window.speechSynthesis;
        synth.cancel();
        const plain = shot.narrationPlain.trim();
        if (!plain) return;
        // 감정 세그먼트별 억양을 살리기 위해 세그먼트 단위로 발화한다.
        const voices = synth.getVoices();
        const voice = pickKoreanVoice(voices);
        shot.narrationSegments.forEach((segment) => {
          const text = segment.text.trim();
          if (!text) return;
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.lang = "ko-KR";
          utterance.rate = clamp(segment.rate, 0.5, 1.5);
          utterance.pitch = clamp(segment.pitch, 0, 2);
          if (voice) utterance.voice = voice;
          synth.speak(utterance);
        });
      },
      stop: () => {
        if (supported.current) window.speechSynthesis.cancel();
      },
    };
  }
  return api.current;
}

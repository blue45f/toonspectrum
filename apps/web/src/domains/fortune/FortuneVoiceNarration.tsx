import { useCallback, useEffect, useRef, useState } from "react";

import {
  chooseNaturalKoreanVoice,
  isNaturalBrowserSpeechSupported,
  speakNaturalBrowserSpeech,
  type NaturalBrowserSpeechSession,
  type NaturalVoiceGender,
} from "@/shared/lib/natural-browser-speech";
import { getCurrentUiLocale, translateAuthoredSourceText } from "@/shared/lib/i18n-bilingual-copy";

// 운세 결과를 음성으로 읽어주는 버튼.
// 브라우저 내장 TTS만 사용(외부 API·비용 없음). 캐릭터별 성우 디렉션을 적용한다.

const VOICE_GENDER: Record<string, NaturalVoiceGender> = {
  ara: "female",
  leona: "female",
  danwoo: "male",
  gaon: "male",
  _narration: "neutral",
};

const VOICE_PITCH: Record<string, number> = {
  ara: 1.055,
  leona: 0.99,
  danwoo: 0.94,
  gaon: 0.9,
  _narration: 1,
};

export interface FortuneVoiceNarrationProps {
  /** 읽을 텍스트 (운세 결과 요약 등) */
  text: string;
  /** 캐릭터 id (없으면 나레이션 톤) */
  characterId?: string;
  className?: string;
}

export function FortuneVoiceNarration({ text, characterId, className }: FortuneVoiceNarrationProps) {
  const locale = getCurrentUiLocale();
  const tx = (source: string) => translateAuthoredSourceText(locale, "ko", "FortuneVoiceNarration", source);
  const supported = typeof window !== "undefined" && isNaturalBrowserSpeechSupported();
  const [speaking, setSpeaking] = useState(false);
  const sessionRef = useRef<NaturalBrowserSpeechSession | null>(null);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);

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
      sessionRef.current?.cancel();
      sessionRef.current = null;
      try {
        synth.cancel();
      } catch {
        /* noop */
      }
    };
  }, [supported]);

  const stop = useCallback(() => {
    sessionRef.current?.cancel();
    sessionRef.current = null;
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* noop */
    }
    setSpeaking(false);
  }, []);

  useEffect(() => stop, [stop]);

  const speak = useCallback(() => {
    if (!supported || speaking) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    const key = characterId && VOICE_GENDER[characterId] ? characterId : "_narration";
    const voice = chooseNaturalKoreanVoice(voicesRef.current, { gender: VOICE_GENDER[key] });
    const session = speakNaturalBrowserSpeech({
      text: trimmed,
      voice,
      pitch: VOICE_PITCH[key] ?? 1,
      rate: 0.98,
      style: "fortune",
      onEnd: () => {
        sessionRef.current = null;
        setSpeaking(false);
      },
      onError: () => {
        sessionRef.current = null;
        setSpeaking(false);
      },
    });
    if (session) {
      sessionRef.current = session;
      setSpeaking(true);
    }
  }, [supported, speaking, text, characterId]);

  if (!supported) return null;

  return (
    <button
      type="button"
      className={className}
      onClick={speaking ? stop : speak}
      aria-pressed={speaking}
      aria-label={speaking ? tx("음성 낭독 중지") : tx("음성으로 듣기")}
      title={speaking ? tx("음성 낭독 중지") : tx("음성으로 듣기")}
    >
      <span aria-hidden="true">{speaking ? "⏹" : "🔊"}</span>
      <span>{speaking ? tx("낭독 중지") : tx("음성으로 듣기")}</span>
    </button>
  );
}

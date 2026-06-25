// 가위바위보 음성(Web Speech, 무료 브라우저 내장 TTS). ko-KR 보이스로 구호·결과를 읽는다.
// fortune(useFortunePlayback)의 보이스 선택 패턴과 동일하게 한국어·여성 우선.

import { useCallback, useEffect, useRef } from "react";

function pickKoVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const ko = voices.filter((v) => v.lang?.toLowerCase().startsWith("ko"));
  if (!ko.length) return null;
  const female = ko.find((v) => /yuna|유나|sora|heami|선희|female|여성/i.test(`${v.name} ${v.voiceURI}`));
  return female ?? ko[0];
}

export interface RpsVoice {
  speak: (text: string) => void;
  supported: boolean;
}

/** enabled일 때만 발화. speak는 직전 발화를 끊고 새로 읽는다. */
export function useRpsVoice(enabled: boolean): RpsVoice {
  const supported =
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    "SpeechSynthesisUtterance" in window;
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    if (!supported) return;
    const synth = window.speechSynthesis;
    const load = () => {
      voicesRef.current = synth.getVoices();
    };
    load();
    synth.addEventListener("voiceschanged", load);
    return () => synth.removeEventListener("voiceschanged", load);
  }, [supported]);

  // 비활성화되면 진행 중인 발화를 즉시 중단.
  useEffect(() => {
    if (!enabled && supported) window.speechSynthesis.cancel();
  }, [enabled, supported]);

  const speak = useCallback(
    (text: string) => {
      if (!enabled || !supported) return;
      const synth = window.speechSynthesis;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "ko-KR";
      const v = pickKoVoice(voicesRef.current);
      if (v) u.voice = v;
      u.rate = 1.18;
      u.pitch = 1.06;
      synth.speak(u);
    },
    [enabled, supported],
  );

  return { speak, supported };
}

import { useCallback, useEffect, useState } from "react";

import { useI18n } from "@/shared/lib/i18n";

import {
  isVoiceGuideSupported,
  readVoiceGuidePreferences,
  voiceGuideEngine,
  type VoiceGuideState,
} from "./voice-guide";
import { readVoiceCharacterPreset } from "./voice-character-presets";
import { getVoiceGuideScript, type VoiceGuideScriptId } from "./voice-guide-texts";
import { wireVoiceBgmDucking } from "./voice-bgm-ducking";

export interface PageVoiceGuide {
  /** 브라우저가 음성 안내를 지원하는지. */
  readonly supported: boolean;
  /** 현재 안내 재생 중인지. */
  readonly speaking: boolean;
  /** 현재 언어의 안내 문구 (자막 표시용). */
  readonly script: string;
  /** 안내 재생 (사용자 제스처에서 호출). */
  speak: () => boolean;
  /** 재생 중단. */
  stop: () => void;
}

/**
 * 페이지별 음성 안내 훅.
 *
 * - `autoGuide` 설정이 켜져 있을 때만 페이지 진입 시 자동 재생한다 (기본 off).
 * - 버튼 클릭 등 사용자 제스처에서는 `speak()`을 직접 호출한다.
 */
export function usePageVoiceGuide(scriptId: VoiceGuideScriptId): PageVoiceGuide {
  const lang = useI18n((state) => state.lang);
  const script = getVoiceGuideScript(scriptId, lang);
  const [speaking, setSpeaking] = useState(voiceGuideEngine.speaking);

  // 음성 안내 중에는 BGM 볼륨을 자동으로 낮춘다 (앱 생명주기 동안 유지).
  useEffect(() => {
    wireVoiceBgmDucking();
  }, []);

  useEffect(() => {
    const unsubscribe = voiceGuideEngine.onStateChange((state: VoiceGuideState) => {
      setSpeaking(state === "speaking");
    });
    return unsubscribe;
  }, []);

  const speak = useCallback(() => {
    // 저장된 음성 캐릭터 프리셋으로 성우처럼 읽는다.
    // 감정 마크업이 없어도 문장 단위 세그먼트 + 고품질 음성 선택이 적용된다.
    return voiceGuideEngine.speakWithCharacter(script, {
      presetId: readVoiceCharacterPreset(),
      lang: lang.startsWith("ko") ? "ko-KR" : "en-US",
    });
  }, [script, lang]);

  const stop = useCallback(() => {
    voiceGuideEngine.stop();
  }, []);

  // 자동 안내: 사용자가 설정에서 명시적으로 켠 경우에만.
  useEffect(() => {
    if (!isVoiceGuideSupported()) return;
    const prefs = readVoiceGuidePreferences();
    if (!prefs.autoGuide || !prefs.enabled) return;
    const timer = window.setTimeout(() => {
      voiceGuideEngine.speakWithCharacter(script, {
        presetId: readVoiceCharacterPreset(),
        lang: lang.startsWith("ko") ? "ko-KR" : "en-US",
      });
    }, 600);
    return () => window.clearTimeout(timer);
  }, [scriptId, script, lang]);

  // 페이지를 떠나면 안내를 중단한다.
  useEffect(() => {
    return () => {
      voiceGuideEngine.stop();
    };
  }, []);

  return {
    supported: isVoiceGuideSupported(),
    speaking,
    script,
    speak,
    stop,
  };
}

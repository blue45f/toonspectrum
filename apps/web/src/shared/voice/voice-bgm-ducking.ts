/**
 * 음성 안내와 BGM의 충돌 방지 브릿지.
 *
 * 음성 안내가 재생되는 동안에는 재생 중인 BGM의 볼륨을 낮추고(덕킹),
 * 안내가 끝나면 원래 볼륨으로 복원한다. BGM이 재생 중이 아닐 때는
 * 아무 일도 하지 않는다.
 *
 * 사용법: 앱에서 한 번만 `wireVoiceBgmDucking()`을 호출한다.
 * `usePageVoiceGuide`와 `VoiceGuideSettingsSection`이 자동으로 호출하므로
 * 별도 호출은 선택 사항이다.
 */

import { bgmEngine } from "@/shared/bgm";

import { voiceGuideEngine } from "./voice-guide";

/** 덕킹 중 BGM 볼륨 비율 (원래 볼륨의 25%). */
export const VOICE_BGM_DUCK_RATIO = 0.25;

let unwire: (() => void) | null = null;

/**
 * 음성 안내 상태 변경을 BGM 볼륨에 연결한다.
 * 여러 번 호출해도 한 번만 연결되며, 반환된 함수로 해제할 수 있다.
 */
export function wireVoiceBgmDucking(): () => void {
  if (unwire) return unwire;

  let savedVolume: number | null = null;
  let duckedVolume: number | null = null;

  unwire = voiceGuideEngine.onStateChange((state) => {
    if (state === "speaking") {
      // 이미 덕킹 중이거나 BGM이 재생 중이 아니면 건드리지 않는다.
      if (savedVolume !== null || !bgmEngine.playing) return;
      savedVolume = bgmEngine.currentVolume;
      duckedVolume = savedVolume * VOICE_BGM_DUCK_RATIO;
      bgmEngine.setVolume(duckedVolume);
    } else {
      if (savedVolume === null) return;
      const restore = savedVolume;
      const ducked = duckedVolume;
      savedVolume = null;
      duckedVolume = null;
      // 덕킹 중에 사용자가 볼륨을 직접 바꿨으면 그 선택을 존중한다.
      if (ducked !== null && bgmEngine.currentVolume === ducked) {
        bgmEngine.setVolume(restore);
      }
    }
  });

  return unwire;
}

/** 덕킹 연결을 해제한다 (주로 테스트용). */
export function unwireVoiceBgmDucking(): void {
  if (unwire) {
    unwire();
    unwire = null;
  }
}

/**
 * BGM 컨트롤 UI 문구 (한/영).
 *
 * 작성 원칙: 짧고 명확하게. 음악 용어 대신 일상 언어를 사용한다.
 */

import type { BgmMood } from "./bgm-engine";

export interface BgmLabels {
  readonly enable: string;
  readonly enableHint: string;
  readonly disable: string;
  readonly volume: string;
  readonly nowPlaying: string;
  readonly close: string;
  readonly reducedMotionHint: string;
  moodName(mood: BgmMood): string;
  moodDescription(mood: BgmMood): string;
}

const MOOD_NAMES_KO: Record<BgmMood, string> = {
  home: "환영",
  studio: "집중",
  draw: "창작",
  virtual: "활기",
  pricing: "신뢰",
  material: "탐색",
};

const MOOD_NAMES_EN: Record<BgmMood, string> = {
  home: "Welcome",
  studio: "Focus",
  draw: "Create",
  virtual: "Lively",
  pricing: "Trust",
  material: "Explore",
};

const MOOD_DESCRIPTIONS_KO: Record<BgmMood, string> = {
  home: "따뜻하고 편안한 분위기",
  studio: "작업에 집중되는 잔잔한 선율",
  draw: "상상력을 자극하는 몽환적인 사운드",
  virtual: "함께하는 공간의 경쾌한 리듬",
  pricing: "깔끔하고 신뢰감 있는 톤",
  material: "새로운 소재를 찾는 호기심",
};

const MOOD_DESCRIPTIONS_EN: Record<BgmMood, string> = {
  home: "Warm and welcoming ambience",
  studio: "Calm melody for deep focus",
  draw: "Dreamy sounds to spark imagination",
  virtual: "Upbeat rhythm for shared spaces",
  pricing: "Clean and trustworthy tone",
  material: "Curiosity for discovering materials",
};

function makeLabels(ko: boolean): BgmLabels {
  return {
    enable: ko ? "🎵 배경음악 켜기" : "🎵 Turn on background music",
    enableHint: ko
      ? "페이지 분위기에 맞는 음악이 흘러나옵니다"
      : "Music matching the page mood will play",
    disable: ko ? "배경음악 끄기" : "Turn off background music",
    volume: ko ? "음량" : "Volume",
    nowPlaying: ko ? "지금 흐르는 분위기" : "Now playing",
    close: ko ? "닫기" : "Close",
    reducedMotionHint: ko
      ? "움직임 줄이기 설정이 켜져 있어 배경음악은 기본적으로 꺼져 있습니다"
      : "Background music is off by default with reduced motion enabled",
    moodName: (mood) => (ko ? MOOD_NAMES_KO[mood] : MOOD_NAMES_EN[mood]),
    moodDescription: (mood) => (ko ? MOOD_DESCRIPTIONS_KO[mood] : MOOD_DESCRIPTIONS_EN[mood]),
  };
}

export const BGM_LABELS_KO = makeLabels(true);
export const BGM_LABELS_EN = makeLabels(false);

/** 현재 언어에 맞는 라벨을 반환한다. */
export function getBgmLabels(lang: string): BgmLabels {
  return lang.startsWith("ko") ? BGM_LABELS_KO : BGM_LABELS_EN;
}

/**
 * 음성 품질 스코어링 — 고품질(neural/natural) 음성 우선 선택.
 *
 * 브라우저마다 내장 TTS 음성의 품질 편차가 크다. 이 모듈은 음성 이름·URI의
 * 힌트를 보고 품질을 점수화해, 같은 언어 안에서는 가장 좋은 음성을 고른다.
 * 순수 함수라 테스트 가능하다.
 */

import type { VoiceCandidate } from "./voice-guide";

export type { VoiceCandidate };

/** 품질 힌트: 이름에 포함되면 고품질일 가능성이 높다 (가중치 순). */
const QUALITY_HINTS: ReadonlyArray<readonly [string, number]> = [
  // Neural 계열 (최상)
  ["neural", 50],
  ["natural", 45],
  ["wavenet", 40],
  ["premium", 35],
  // 벤더별 고품질 엔진
  ["google", 25],
  ["samsung", 22],
  ["microsoft", 20],
  // 온라인 고품질
  ["online", 10],
  ["cloud", 8],
];

/** 저품질 힌트: 구형 합성 엔진. */
const LOW_QUALITY_HINTS: ReadonlyArray<readonly [string, number]> = [
  ["espeak", -40],
  ["festival", -35],
  ["pico", -30],
  ["robot", -25],
  ["compact", -15],
];

/** 언어 매칭 점수. */
const LANG_SCORE_EXACT = 100;
const LANG_SCORE_PREFIX = 60;
const LANG_SCORE_NAME_HINT = 40;

/**
 * 음성 하나의 품질 점수를 계산한다.
 * 점수가 높을수록 고품질일 가능성이 높다. 음수일 수도 있다.
 */
export function scoreVoiceQuality(voice: VoiceCandidate): number {
  const name = voice.name.toLowerCase();
  // SpeechSynthesisVoice에는 voiceURI가 있지만 VoiceCandidate에는 없으므로 이름만 사용.
  let score = 0;
  for (const [hint, weight] of QUALITY_HINTS) {
    if (name.includes(hint)) score += weight;
  }
  for (const [hint, weight] of LOW_QUALITY_HINTS) {
    if (name.includes(hint)) score += weight;
  }
  // 기본 음성은 OS가 추천하는 것이므로 약간 가산.
  if (voice.default) score += 5;
  return score;
}

/**
 * 언어 매칭 점수 (기존 pickKoreanVoice 로직을 일반화).
 */
export function scoreVoiceLanguage(voice: VoiceCandidate, lang: string): number {
  const target = lang.toLowerCase().replace("_", "-");
  const voiceLang = voice.lang.toLowerCase().replace("_", "-");
  const name = voice.name.toLowerCase();
  if (voiceLang === target) return LANG_SCORE_EXACT;
  const targetPrefix = target.split("-")[0];
  if (voiceLang === targetPrefix || voiceLang.startsWith(`${targetPrefix}-`)) {
    return LANG_SCORE_PREFIX;
  }
  if (targetPrefix === "ko" && (name.includes("한국") || name.includes("korean") || name.includes("korea"))) {
    return LANG_SCORE_NAME_HINT;
  }
  if (targetPrefix === "en" && (name.includes("english") || name.includes("영어"))) {
    return LANG_SCORE_NAME_HINT;
  }
  return 0;
}

export interface PickBestVoiceOptions {
  /** 선호 음성 이름 힌트 (프리셋의 voiceHints). 먼저 매칭되는 것을 우선. */
  readonly hints?: readonly string[];
  /** 품질 점수 가중치 (기본 1). 0이면 품질 무시. */
  readonly qualityWeight?: number;
}

/**
 * 언어 + 품질 + 힌트를 종합해 최적의 음성을 선택한다.
 * 언어 매칭이 전혀 안 되면 null (엉뚱한 언어 음성 방지).
 */
export function pickBestVoice<T extends VoiceCandidate>(
  voices: readonly T[],
  lang: string,
  options: PickBestVoiceOptions = {},
): T | null {
  if (voices.length === 0) return null;
  const qualityWeight = options.qualityWeight ?? 1;
  const hints = (options.hints ?? []).map((h) => h.toLowerCase());

  const scored = voices.map((voice) => {
    const langScore = scoreVoiceLanguage(voice, lang);
    const qualityScore = scoreVoiceQuality(voice) * qualityWeight;
    let hintScore = 0;
    if (hints.length > 0) {
      const name = voice.name.toLowerCase();
      const matchedIndex = hints.findIndex((hint) => name.includes(hint));
      if (matchedIndex >= 0) hintScore = (hints.length - matchedIndex) * 15;
    }
    return { voice, total: langScore * 10 + qualityScore + hintScore, langScore };
  });

  scored.sort((a, b) => b.total - a.total);
  const best = scored[0];
  // 언어 매칭이 전혀 없으면 선택하지 않는다.
  if (!best || best.langScore === 0) return null;
  return best.voice;
}

/**
 * 사용 가능한 음성 목록의 품질 요약을 반환한다 (설정 UI 표시용).
 */
export function describeVoiceQuality(voice: VoiceCandidate): "high" | "medium" | "low" {
  const score = scoreVoiceQuality(voice);
  if (score >= 40) return "high";
  if (score >= 0) return "medium";
  return "low";
}

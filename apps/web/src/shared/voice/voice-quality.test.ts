import { describe, expect, it } from "vitest";

import {
  describeVoiceQuality,
  pickBestVoice,
  scoreVoiceLanguage,
  scoreVoiceQuality,
  type VoiceCandidate,
} from "./voice-quality";

const voice = (name: string, lang: string, isDefault = false): VoiceCandidate => ({
  name,
  lang,
  default: isDefault,
});

describe("voice-quality", () => {
  it("neural 음성이 높은 점수를 받는다", () => {
    const neural = scoreVoiceQuality(voice("Microsoft SunHi Online (Natural) - Korean", "ko-KR"));
    const basic = scoreVoiceQuality(voice("Korean Voice", "ko-KR"));
    expect(neural).toBeGreaterThan(basic);
  });

  it("espeak 같은 구형 엔진은 감점된다", () => {
    const espeak = scoreVoiceQuality(voice("Korean espeak", "ko"));
    const normal = scoreVoiceQuality(voice("Korean", "ko"));
    expect(espeak).toBeLessThan(normal);
  });

  it("Google 한국어 음성이 가산점을 받는다", () => {
    const google = scoreVoiceQuality(voice("Google 한국의", "ko-KR"));
    const other = scoreVoiceQuality(voice("Some Voice", "ko-KR"));
    expect(google).toBeGreaterThan(other);
  });

  it("언어 정확 일치가 접두사 일치보다 높다", () => {
    expect(scoreVoiceLanguage(voice("V", "ko-KR"), "ko-KR")).toBeGreaterThan(
      scoreVoiceLanguage(voice("V", "ko"), "ko-KR"),
    );
  });

  it("pickBestVoice는 언어+품질을 종합해 고품질 한국어 음성을 고른다", () => {
    const voices = [
      voice("English Voice", "en-US"),
      voice("한국어 기본", "ko-KR"),
      voice("Google 한국의", "ko-KR"),
    ];
    const best = pickBestVoice(voices, "ko-KR");
    expect(best?.name).toBe("Google 한국의");
  });

  it("프리셋 힌트가 반영된다", () => {
    const voices = [voice("Google 한국의", "ko-KR"), voice("Samsung Korean", "ko-KR")];
    const best = pickBestVoice(voices, "ko-KR", { hints: ["samsung", "google"] });
    expect(best?.name).toBe("Samsung Korean");
  });

  it("언어 매칭이 없으면 null을 반환한다", () => {
    const voices = [voice("English Voice", "en-US")];
    expect(pickBestVoice(voices, "ko-KR")).toBeNull();
  });

  it("빈 목록은 null이다", () => {
    expect(pickBestVoice([], "ko-KR")).toBeNull();
  });

  it("describeVoiceQuality가 등급을 반환한다", () => {
    expect(describeVoiceQuality(voice("Microsoft SunHi Neural", "ko-KR"))).toBe("high");
    expect(describeVoiceQuality(voice("Korean espeak", "ko"))).toBe("low");
  });
});

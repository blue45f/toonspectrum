import { describe, expect, it } from "vitest";

import { getVoiceCharacterPreset } from "./voice-character-presets";
import { parseEmotionMarkup } from "./voice-emotion-markup";
import { buildSsml, isSsmlSupportedByWebSpeech, ssmlToPlainText } from "./voice-ssml";

const narrator = getVoiceCharacterPreset("narrator");

describe("voice-ssml", () => {
  it("세그먼트를 speak/prosody/break 구조로 변환한다", () => {
    const segments = parseEmotionMarkup("안녕하세요. 반갑습니다.", narrator);
    const ssml = buildSsml(segments);
    expect(ssml.startsWith("<speak")).toBe(true);
    expect(ssml).toContain("<prosody");
    expect(ssml).toContain('rate="95%"');
    expect(ssml).toContain("<break");
    expect(ssml.endsWith("</speak>")).toBe(true);
  });

  it("강조 구간은 emphasis 태그로 감싼다", () => {
    const segments = parseEmotionMarkup("[강조]중요합니다[/강조]", narrator);
    const ssml = buildSsml(segments);
    expect(ssml).toContain('<emphasis level="strong">');
  });

  it("XML 특수문자를 이스케이프한다", () => {
    const segments = parseEmotionMarkup("A&B <test>", narrator);
    const ssml = buildSsml(segments);
    expect(ssml).toContain("A&amp;B");
    expect(ssml).toContain("&lt;test&gt;");
  });

  it("pitch를 semitone으로 변환한다", () => {
    const segments = parseEmotionMarkup("[신비]속삭임[/신비]", narrator);
    const ssml = buildSsml(segments);
    // mystic pitch(0.86 - 0.12 = 0.74) → 음수 semitone
    expect(ssml).toMatch(/pitch="-[\d.]+st"/);
  });

  it("Web Speech API는 SSML을 지원하지 않는다", () => {
    expect(isSsmlSupportedByWebSpeech()).toBe(false);
  });

  it("ssmlToPlainText가 태그를 제거한다", () => {
    const plain = ssmlToPlainText('<speak><prosody rate="95%">안녕</prosody><break time="300ms"/></speak>');
    expect(plain).toBe("안녕");
  });
});

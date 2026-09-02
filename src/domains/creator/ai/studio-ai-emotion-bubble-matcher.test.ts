import { describe, expect, it } from "vitest";

import { StudioAiEmotionBubbleMatcher } from "./studio-ai-emotion-bubble-matcher";

describe("StudioAiEmotionBubbleMatcher", () => {
  const matcher = new StudioAiEmotionBubbleMatcher();

  it("recommends spiky shout bubble for rage/shout dialogues", () => {
    const res = matcher.match("닥쳐!! 절대 용서 못 해!!");
    expect(res.detectedEmotion).toBe("rage-shout");
    expect(res.recommendedBubbleShape).toBe("shout-spiky");
    expect(res.strokeWidthPx).toBeGreaterThanOrEqual(3.0);
    expect(res.recommendedFontWeight).toBe("black");
  });

  it("recommends dashed border bubble for whisper dialogues", () => {
    const res = matcher.match("쉿... 들키면 안 되니까 조용히 해...");
    expect(res.detectedEmotion).toBe("whisper-secret");
    expect(res.recommendedBubbleShape).toBe("whisper-dashed");
    expect(res.isDashedBorder).toBe(true);
  });

  it("recommends blush pink bubble for romance dialogues", () => {
    const res = matcher.match("너를 처음 본 순간부터 좋아했어.");
    expect(res.detectedEmotion).toBe("romance-blush");
    expect(res.recommendedBubbleShape).toBe("soft-blush");
    expect(res.fillColor).toBe("#fff1f2");
  });

  it("recommends cloud bubble for thought/monologue dialogues", () => {
    const res = matcher.match("(과연 내가 해낼 수 있을까...?)");
    expect(res.detectedEmotion).toBe("thought-monologue");
    expect(res.recommendedBubbleShape).toBe("cloud-thought");
  });

  it("falls back to standard oval for calm neutral speech", () => {
    const res = matcher.match("오늘 점심은 구내식당에서 먹자.");
    expect(res.detectedEmotion).toBe("neutral-calm");
    expect(res.recommendedBubbleShape).toBe("standard-oval");
  });
});

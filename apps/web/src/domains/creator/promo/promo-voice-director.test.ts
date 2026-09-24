import { describe, expect, it } from "vitest";

import { emptyPromoProject, type PromoProject } from "./promo-model";
import {
  buildPromoNarrationScript,
  buildPromoVoicePlan,
  promoVoicePreset,
} from "./promo-voice-director";

function project(overrides: Partial<PromoProject> = {}): PromoProject {
  return {
    ...emptyPromoProject(),
    title: "달빛 검객",
    cta: "지금 첫 화를 만나보세요",
    panels: [
      { id: "a", src: "data:image/png;base64,AAAA", description: "비 내리는 골목", caption: "검은 밤, 운명이 깨어난다", motion: "still", fit: "cover", weight: 1 },
      { id: "b", src: "data:image/png;base64,AAAA", description: "주인공이 검을 든다", caption: "", motion: "still", fit: "cover", weight: 1 },
    ],
    ...overrides,
  };
}

describe("promo local voice director", () => {
  it("builds an editable script from existing author copy without inventing story facts", () => {
    expect(buildPromoNarrationScript(project())).toBe(
      "달빛 검객.\n검은 밤, 운명이 깨어난다.\n주인공이 검을 든다.\n지금 첫 화를 만나보세요."
    );
  });

  it("deduplicates repeated copy and skips the placeholder title", () => {
    const value = project({
      title: "나의 웹툰",
      cta: "다시 만나요",
      panels: [
        { id: "a", src: "data:image/png;base64,AAAA", description: "다시 만나요", caption: "다시 만나요", motion: "still", fit: "cover", weight: 1 },
      ],
    });
    expect(buildPromoNarrationScript(value)).toBe("다시 만나요.");
  });

  it("conservatively increases delivery speed for long copy but keeps the cap natural", () => {
    const longText = "긴 이야기를 자연스럽고 또렷하게 소개합니다. ".repeat(18);
    const fitted = buildPromoVoicePlan(longText, "natural", 15, true);
    const unfitted = buildPromoVoicePlan(longText, "natural", 15, false);

    expect(fitted.rate).toBeGreaterThan(1);
    expect(fitted.rate).toBeLessThanOrEqual(1.24);
    expect(fitted.durationMs).toBeLessThan(unfitted.durationMs);
    expect(fitted.overrunMs).toBeGreaterThanOrEqual(0);
  });

  it("maps every public preset to a supported local speech style", () => {
    expect(promoVoicePreset("cinematic").style).toBe("promo-cinematic");
    expect(promoVoicePreset("calm").style).toBe("calm");
    expect(promoVoicePreset("energetic").style).toBe("energetic");
  });
});

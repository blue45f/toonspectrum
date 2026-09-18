import { describe, expect, it } from "vitest";

import { creatorRoleAiRecommendations } from "./creator-role-ai-recommendations";

describe("creator role AI recommendations", () => {
  it("uses only tools supported by the existing AI assist hub", () => {
    const tools = new Set(["background", "character", "composition", "dialogue", "palette"]);
    for (const role of ["story", "line-art", "background", "color", "producer"] as const) {
      for (const recommendation of creatorRoleAiRecommendations(role)) {
        expect(tools.has(recommendation.tool)).toBe(true);
        expect(recommendation.prompt.length).toBeGreaterThan(10);
      }
    }
  });

  it("returns role-specific starting points without auto-executing anything", () => {
    expect(creatorRoleAiRecommendations("story").map((item) => item.id))
      .toEqual(["story-dialogue", "story-composition"]);
    expect(creatorRoleAiRecommendations("reviewer").map((item) => item.id))
      .toEqual(["review-dialogue", "review-composition"]);
    expect(creatorRoleAiRecommendations(null)).toEqual([]);
  });
});

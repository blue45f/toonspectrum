import { describe, expect, it } from "vitest";

import {
  createStudioStaffingBrief,
  rankStudioStaffingPools,
} from "./studio-staffing";

describe("studio staffing matching", () => {
  it("prioritizes role, region and contract-compatible pools", () => {
    const brief = {
      ...createStudioStaffingBrief("project-1"),
      role: "background" as const,
      preferredRegion: "southeast-asia" as const,
      language: "en",
      monthlyBudgetUsd: 1800,
      timezoneOverlapHours: 4,
    };
    const matches = rankStudioStaffingPools(brief);

    expect(matches[0]?.pool.id).toBe("sea-webtoon-art-pool");
    expect(matches[0]?.reasons).toContain("role-match");
    expect(matches[0]?.reasons).toContain("region-match");
    expect(matches[0]?.score).toBeGreaterThan(matches.at(-1)?.score ?? 0);
  });
});

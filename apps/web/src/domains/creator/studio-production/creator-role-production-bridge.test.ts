import { describe, expect, it } from "vitest";

import { creatorProfileProductionRoleRecommendations } from "./creator-role-production-bridge";

import { normalizeCreatorRoleProfile } from "@/shared/lib/creator-role-contract";

describe("creator role to production role bridge", () => {
  it("puts the active role first and supplements recommendations from specialties", () => {
    const profile = normalizeCreatorRoleProfile({
      primaryRole: "producer",
      secondaryRoles: ["story", "color"],
      activeRole: "color",
      specialties: ["proofing", "background-3d"],
    });

    expect(creatorProfileProductionRoleRecommendations(profile)).toEqual([
      "color",
      "director",
      "publisher",
      "story",
      "reviewer",
      "background",
    ]);
  });

  it("deduplicates overlapping role and specialty recommendations", () => {
    const profile = normalizeCreatorRoleProfile({
      primaryRole: "story",
      secondaryRoles: ["planner"],
      specialties: ["plot", "dialogue", "episode-planning"],
    });

    expect(creatorProfileProductionRoleRecommendations(profile)).toEqual([
      "story",
      "director",
    ]);
  });

  it("returns no recommendations for an incomplete profile", () => {
    expect(creatorProfileProductionRoleRecommendations(null)).toEqual([]);
    expect(creatorProfileProductionRoleRecommendations(
      normalizeCreatorRoleProfile({ primaryRole: null }),
    )).toEqual([]);
  });
});

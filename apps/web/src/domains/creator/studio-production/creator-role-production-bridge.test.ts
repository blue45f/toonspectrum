import { describe, expect, it } from "vitest";

import {
  creatorProfileProductionRoleRecommendations,
  publicCreatorProfileProductionRoleRecommendations,
} from "./creator-role-production-bridge";

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

  it("puts a project-specific role before the global workspace role", () => {
    const profile = normalizeCreatorRoleProfile({
      version: 2,
      primaryRole: "producer",
      secondaryRoles: ["story", "color"],
      activeRole: "story",
      projectRolePreferences: [{ projectKey: "work:episode-12", activeRole: "color" }],
    });

    expect(creatorProfileProductionRoleRecommendations(profile, "work:episode-12")).toEqual([
      "color",
      "director",
      "publisher",
      "story",
    ]);
  });

  it("derives recommendations for other team members from privacy-safe public profiles", () => {
    expect(publicCreatorProfileProductionRoleRecommendations({
      version: 1,
      primaryRole: "background",
      secondaryRoles: ["reviewer"],
      specialties: ["background-3d", "quality-control"],
      experienceLevel: null,
      collaborationStatus: null,
    })).toEqual(["background", "reviewer"]);
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

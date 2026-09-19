import { describe, expect, it } from "vitest";

import {
  creatorProfileProductionRoleRecommendations,
  publicCreatorProfileProductionRoleRecommendations,
} from "./creator-role-production-bridge";

import {
  normalizeCreatorRoleProfile,
  normalizePublicCreatorRoleProfile,
  publicCreatorRoleProfile,
} from "@/shared/lib/creator-role-contract";

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
      version: 2,
      primaryRole: "background",
      secondaryRoles: ["reviewer"],
      specialties: ["background-3d", "quality-control"],
      experienceLevel: null,
      collaborationStatus: null,
      roleAliases: [],
    })).toEqual(["background", "reviewer"]);
  });

  it("preserves primary, secondary, and specialty recommendation order for public profiles", () => {
    const profile = normalizePublicCreatorRoleProfile({
      version: 2,
      primaryRole: "producer",
      secondaryRoles: ["story", "color"],
      specialties: ["proofing", "background-3d", "budget"],
      roleAliases: [{ role: "producer", label: "Production lead" }],
    });

    expect(publicCreatorProfileProductionRoleRecommendations(profile)).toEqual([
      "director",
      "publisher",
      "story",
      "color",
      "reviewer",
      "background",
    ]);
  });

  it("recommends public secondary roles and specialties without inventing a primary role", () => {
    const profile = normalizePublicCreatorRoleProfile({
      version: 2,
      primaryRole: null,
      secondaryRoles: ["color", "background"],
      specialties: ["rendering", "quality-control"],
      roleAliases: [{ role: "color", label: "Color artist" }],
    });

    expect(profile?.primaryRole).toBeNull();
    expect(publicCreatorProfileProductionRoleRecommendations(profile)).toEqual([
      "color",
      "background",
      "reviewer",
    ]);
    expect(profile?.primaryRole).toBeNull();
  });

  it("recommends from specialty-only public profiles", () => {
    const profile = normalizePublicCreatorRoleProfile({
      version: 2,
      primaryRole: null,
      secondaryRoles: [],
      specialties: ["background-3d", "quality-control", "editing"],
      roleAliases: [],
    });

    expect(publicCreatorProfileProductionRoleRecommendations(profile)).toEqual([
      "background",
      "reviewer",
      "director",
    ]);
  });

  it("uses only visible public specialties when roles and private preferences are hidden", () => {
    const profile = publicCreatorRoleProfile({
      primaryRole: "producer",
      secondaryRoles: ["story"],
      activeRole: "producer",
      roleAliases: [{ role: "producer", label: "Private lead" }],
      specialties: ["background-3d"],
      visibility: {
        roles: false,
        specialties: true,
        experienceLevel: false,
        collaborationStatus: false,
      },
      projectRolePreferences: [{ projectKey: "work:private", activeRole: "story" }],
    });

    expect(profile).toMatchObject({ primaryRole: null, secondaryRoles: [], roleAliases: [] });
    expect(profile).not.toHaveProperty("activeRole");
    expect(profile).not.toHaveProperty("projectRolePreferences");
    expect(publicCreatorProfileProductionRoleRecommendations(profile)).toEqual(["background"]);
  });

  it("uses valid personal secondary roles and their project preference without a primary role", () => {
    const profile = normalizeCreatorRoleProfile({
      primaryRole: null,
      secondaryRoles: ["color", "producer"],
      activeRole: "color",
      specialties: ["quality-control"],
      projectRolePreferences: [{ projectKey: "work:episode-12", activeRole: "producer" }],
    });

    expect(creatorProfileProductionRoleRecommendations(profile)).toEqual([
      "color",
      "director",
      "publisher",
      "reviewer",
    ]);
    expect(creatorProfileProductionRoleRecommendations(profile, "work:episode-12")).toEqual([
      "director",
      "publisher",
      "color",
      "reviewer",
    ]);
  });

  it("recommends from personal specialties without selected roles", () => {
    const profile = normalizeCreatorRoleProfile({
      primaryRole: null,
      specialties: ["background-3d", "quality-control"],
    });

    expect(creatorProfileProductionRoleRecommendations(profile)).toEqual(["background", "reviewer"]);
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
    expect(creatorProfileProductionRoleRecommendations(undefined)).toEqual([]);
    expect(publicCreatorProfileProductionRoleRecommendations(null)).toEqual([]);
    expect(publicCreatorProfileProductionRoleRecommendations(undefined)).toEqual([]);
    expect(creatorProfileProductionRoleRecommendations(
      normalizeCreatorRoleProfile({ primaryRole: null }),
    )).toEqual([]);
  });

  it.each([
    { experienceLevel: "professional" },
    { collaborationStatus: "available" },
  ])("does not infer production roles from public status data alone: %j", (status) => {
    const profile = normalizePublicCreatorRoleProfile({
      version: 2,
      primaryRole: null,
      roleAliases: [],
      ...status,
    });

    expect(profile).not.toBeNull();
    expect(publicCreatorProfileProductionRoleRecommendations(profile)).toEqual([]);
  });
});

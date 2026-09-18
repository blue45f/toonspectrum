import { describe, expect, it } from "vitest";

import {
  CREATOR_ROLE_MAX_SECONDARY,
  creatorRoleLens,
  creatorRoleSelection,
  normalizeCreatorRoleProfile,
  parseCreatorRoleProfileInput,
  publicCreatorRoleProfile,
  recommendedCreatorSpecialties,
} from "./creator-role-contract";

describe("creator role profile contract", () => {
  it("legacy or malformed reads fall back to a safe empty profile", () => {
    expect(normalizeCreatorRoleProfile(null)).toEqual({
      version: 1,
      primaryRole: null,
      secondaryRoles: [],
      specialties: [],
      creatorStage: null,
      experienceLevel: null,
      collaborationStatus: null,
      roleVisibility: true,
      activeRole: null,
    });

    expect(normalizeCreatorRoleProfile({
      primaryRole: "story",
      secondaryRoles: ["story", "assistant", "assistant", "unknown"],
      specialties: ["dialogue", "dialogue", "invalid"],
      activeRole: "unknown",
      roleVisibility: false,
    })).toEqual({
      version: 1,
      primaryRole: "story",
      secondaryRoles: ["assistant"],
      specialties: ["dialogue"],
      creatorStage: null,
      experienceLevel: null,
      collaborationStatus: null,
      roleVisibility: false,
      activeRole: "story",
    });
  });

  it("accepts a complete valid write payload and preserves role order", () => {
    const profile = parseCreatorRoleProfileInput({
      version: 1,
      primaryRole: "line-art",
      secondaryRoles: ["assistant", "background"],
      specialties: ["line-art", "inking", "background-2d"],
      creatorStage: "professional",
      experienceLevel: "professional",
      collaborationStatus: "limited",
      roleVisibility: true,
      activeRole: "assistant",
    });

    expect(profile).not.toBeNull();
    expect(profile && creatorRoleSelection(profile)).toEqual([
      "line-art",
      "assistant",
      "background",
    ]);
  });

  it("rejects invalid, oversized, or unselected active roles at the write boundary", () => {
    expect(parseCreatorRoleProfileInput({ primaryRole: "unknown" })).toBeNull();
    expect(parseCreatorRoleProfileInput({
      primaryRole: "story",
      secondaryRoles: Array.from({ length: CREATOR_ROLE_MAX_SECONDARY + 1 }, () => "assistant"),
    })).toBeNull();
    expect(parseCreatorRoleProfileInput({
      primaryRole: "story",
      secondaryRoles: [],
      activeRole: "producer",
    })).toBeNull();
    expect(parseCreatorRoleProfileInput({
      primaryRole: null,
      secondaryRoles: ["assistant"],
    })).toBeNull();
  });

  it("removes hidden or incomplete role profiles at the public boundary", () => {
    expect(publicCreatorRoleProfile({
      primaryRole: "story",
      roleVisibility: false,
    })).toBeNull();
    expect(publicCreatorRoleProfile({
      primaryRole: null,
      roleVisibility: true,
    })).toBeNull();
    const publicProfile = publicCreatorRoleProfile({
      primaryRole: "producer",
      creatorStage: "professional",
      roleVisibility: true,
      activeRole: "producer",
    });
    expect(publicProfile).toMatchObject({ primaryRole: "producer" });
    expect(publicProfile).not.toHaveProperty("roleVisibility");
    expect(publicProfile).not.toHaveProperty("activeRole");
    expect(publicProfile).not.toHaveProperty("creatorStage");
  });

  it("maps detailed jobs to production lenses and deduplicates recommendations", () => {
    expect(creatorRoleLens("story")).toBe("story");
    expect(creatorRoleLens("line-art")).toBe("art");
    expect(creatorRoleLens("producer")).toBe("producer");
    expect(recommendedCreatorSpecialties(["story", "planner"]))
      .toEqual(expect.arrayContaining(["world-building", "plot", "dialogue", "episode-planning"]));
    expect(new Set(recommendedCreatorSpecialties(["story", "planner"])).size)
      .toBe(recommendedCreatorSpecialties(["story", "planner"]).length);
  });
});

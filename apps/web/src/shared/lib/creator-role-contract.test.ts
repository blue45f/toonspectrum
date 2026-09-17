import { describe, expect, it } from "vitest";

import {
  CREATOR_ROLE_MAX_PROJECT_PREFERENCES,
  CREATOR_ROLE_MAX_SECONDARY,
  creatorProjectRolePreference,
  creatorRoleAlias,
  creatorRoleLens,
  creatorRoleOperationalLens,
  creatorRoleSelection,
  normalizeCreatorRoleProfile,
  normalizePublicCreatorRoleProfile,
  parseCreatorRoleProfileInput,
  publicCreatorRoleProfile,
  recommendedCreatorSpecialties,
  resolveCreatorActiveRole,
  withCreatorProjectNotificationPreference,
  withCreatorProjectRolePreference,
  withCreatorRoleOnboarding,
} from "./creator-role-contract";

describe("creator role profile contract", () => {
  it("uses private-safe v2 defaults for malformed or new profiles", () => {
    expect(normalizeCreatorRoleProfile(null)).toEqual({
      version: 2,
      primaryRole: null,
      secondaryRoles: [],
      specialties: [],
      experienceLevel: null,
      collaborationStatus: null,
      visibility: {
        roles: false,
        specialties: false,
        experienceLevel: false,
        collaborationStatus: false,
      },
      activeRole: null,
      usagePurposes: [],
      roleAliases: [],
      workCapacity: {
        weeklyHours: null,
        maxConcurrentTasks: null,
        availabilityNote: "",
      },
      defaultNotificationLevel: "standard",
      onboarding: {
        status: "not-started",
        step: 1,
        completedAt: null,
        updatedAt: null,
      },
      projectRolePreferences: [],
    });
  });

  it("migrates a legacy v1 profile without exposing workspace-only preferences", () => {
    expect(normalizeCreatorRoleProfile({
      version: 1,
      primaryRole: "story",
      secondaryRoles: ["story", "assistant", "assistant", "unknown"],
      specialties: ["dialogue", "dialogue", "invalid"],
      activeRole: "unknown",
      roleVisibility: true,
    })).toEqual({
      version: 2,
      primaryRole: "story",
      secondaryRoles: ["assistant"],
      specialties: ["dialogue"],
      experienceLevel: null,
      collaborationStatus: null,
      visibility: {
        roles: true,
        specialties: true,
        experienceLevel: true,
        collaborationStatus: true,
      },
      activeRole: "story",
      usagePurposes: [],
      roleAliases: [],
      workCapacity: {
        weeklyHours: null,
        maxConcurrentTasks: null,
        availabilityNote: "",
      },
      defaultNotificationLevel: "standard",
      onboarding: {
        status: "completed",
        step: 4,
        completedAt: null,
        updatedAt: null,
      },
      projectRolePreferences: [],
    });
  });

  it("accepts a complete v2 payload and resolves a project-specific role before the global role", () => {
    const profile = parseCreatorRoleProfileInput({
      version: 2,
      primaryRole: "line-art",
      secondaryRoles: ["assistant", "background"],
      specialties: ["line-art", "inking", "background-2d"],
      experienceLevel: "professional",
      collaborationStatus: "limited",
      visibility: {
        roles: true,
        specialties: true,
        experienceLevel: false,
        collaborationStatus: true,
      },
      activeRole: "assistant",
      usagePurposes: ["team-production", "serialization"],
      onboarding: {
        status: "completed",
        step: 4,
        completedAt: "2026-09-17T10:00:00.000Z",
        updatedAt: "2026-09-17T10:00:00.000Z",
      },
      projectRolePreferences: [{
        projectKey: "work:episode-12",
        activeRole: "background",
        updatedAt: "2026-09-17T11:00:00.000Z",
      }],
    });

    expect(profile).not.toBeNull();
    expect(profile && creatorRoleSelection(profile)).toEqual([
      "line-art",
      "assistant",
      "background",
    ]);
    expect(profile && resolveCreatorActiveRole(profile, "work:episode-12")).toBe("background");
    expect(profile && resolveCreatorActiveRole(profile, "work:other")).toBe("assistant");
  });

  it("accepts v1 writes during a rolling deployment and normalizes them to v2", () => {
    expect(parseCreatorRoleProfileInput({
      version: 1,
      primaryRole: "story",
      secondaryRoles: [],
      specialties: ["dialogue"],
      roleVisibility: false,
      activeRole: "story",
    })).toMatchObject({
      version: 2,
      primaryRole: "story",
      visibility: {
        roles: false,
        specialties: false,
      },
    });
  });

  it("rejects invalid, oversized, or unselected role preferences at the write boundary", () => {
    expect(parseCreatorRoleProfileInput({ version: 2, primaryRole: "unknown" })).toBeNull();
    expect(parseCreatorRoleProfileInput({
      version: 2,
      primaryRole: "story",
      secondaryRoles: Array.from({ length: CREATOR_ROLE_MAX_SECONDARY + 1 }, () => "assistant"),
    })).toBeNull();
    expect(parseCreatorRoleProfileInput({
      version: 2,
      primaryRole: "story",
      secondaryRoles: [],
      activeRole: "producer",
    })).toBeNull();
    expect(parseCreatorRoleProfileInput({
      version: 2,
      primaryRole: null,
      secondaryRoles: ["assistant"],
    })).toBeNull();
    expect(parseCreatorRoleProfileInput({
      version: 2,
      primaryRole: "story",
      projectRolePreferences: [{ projectKey: "project-1", activeRole: "producer" }],
    })).toBeNull();
    expect(parseCreatorRoleProfileInput({
      version: 2,
      primaryRole: "story",
      projectRolePreferences: Array.from(
        { length: CREATOR_ROLE_MAX_PROJECT_PREFERENCES + 1 },
        (_, index) => ({ projectKey: `project-${index}`, activeRole: "story" }),
      ),
    })).toBeNull();
  });

  it("projects only fields that the creator explicitly made public", () => {
    expect(publicCreatorRoleProfile({
      version: 2,
      primaryRole: "story",
      specialties: ["dialogue"],
      visibility: {
        roles: false,
        specialties: false,
        experienceLevel: false,
        collaborationStatus: false,
      },
    })).toBeNull();

    expect(publicCreatorRoleProfile({
      version: 2,
      primaryRole: "story",
      specialties: ["dialogue"],
      experienceLevel: "professional",
      collaborationStatus: "available",
      visibility: {
        roles: false,
        specialties: true,
        experienceLevel: false,
        collaborationStatus: true,
      },
      activeRole: "story",
      projectRolePreferences: [{ projectKey: "secret", activeRole: "story" }],
    })).toEqual({
      version: 2,
      primaryRole: null,
      secondaryRoles: [],
      specialties: ["dialogue"],
      experienceLevel: null,
      collaborationStatus: "available",
      roleAliases: [],
    });

    expect(normalizePublicCreatorRoleProfile({
      version: 1,
      primaryRole: "producer",
      specialties: ["budget"],
    })).toMatchObject({
      version: 2,
      primaryRole: "producer",
      specialties: ["budget"],
    });
  });

  it("updates one project role without changing global preferences or permissions", () => {
    const base = normalizeCreatorRoleProfile({
      version: 2,
      primaryRole: "producer",
      secondaryRoles: ["story", "color"],
      activeRole: "story",
    });
    const first = withCreatorProjectRolePreference(
      base,
      "project:a",
      "color",
      "2026-09-17T12:00:00.000Z",
    );
    const second = withCreatorProjectRolePreference(
      first,
      "project:b",
      "producer",
      "2026-09-17T13:00:00.000Z",
    );

    expect(resolveCreatorActiveRole(second, "project:a")).toBe("color");
    expect(resolveCreatorActiveRole(second, "project:b")).toBe("producer");
    expect(resolveCreatorActiveRole(second)).toBe("story");
    expect(creatorProjectRolePreference(second, "project:a")?.updatedAt)
      .toBe("2026-09-17T12:00:00.000Z");
    expect(withCreatorProjectRolePreference(second, "project:a", "reviewer")).toBe(second);
  });

  it("records resumable onboarding progress independently from the role selection", () => {
    const base = normalizeCreatorRoleProfile(null);
    const started = withCreatorRoleOnboarding(
      base,
      { status: "in-progress", step: 2 },
      "2026-09-17T08:00:00.000Z",
    );
    expect(started.onboarding).toEqual({
      status: "in-progress",
      step: 2,
      completedAt: null,
      updatedAt: "2026-09-17T08:00:00.000Z",
    });
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
  it("keeps role aliases, capacity, project alerts, and detailed work lenses independent", () => {
    const base = normalizeCreatorRoleProfile({
      version: 2,
      primaryRole: "producer",
      secondaryRoles: ["color"],
      roleAliases: [{ role: "producer", label: "연출 PD" }],
      workCapacity: {
        weeklyHours: 24,
        maxConcurrentTasks: 4,
        availabilityNote: "평일 저녁 가능",
      },
      defaultNotificationLevel: "essential",
    });
    const project = withCreatorProjectNotificationPreference(
      withCreatorProjectRolePreference(base, "project:webtoon", "color"),
      "project:webtoon",
      "all",
      "2026-09-17T14:00:00.000Z",
    );

    expect(creatorRoleAlias(project, "producer")).toBe("연출 PD");
    expect(project.workCapacity).toMatchObject({ weeklyHours: 24, maxConcurrentTasks: 4 });
    expect(creatorProjectRolePreference(project, "project:webtoon")).toMatchObject({
      activeRole: "color",
      notificationLevel: "all",
    });
    expect(creatorRoleOperationalLens("storyboard")).toBe("storyboard");
    expect(creatorRoleOperationalLens("background")).toBe("background");
    expect(creatorRoleOperationalLens("reviewer")).toBe("review");
  });

});

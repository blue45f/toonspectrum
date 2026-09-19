import { describe, expect, it } from "vitest";
import {
  CREATOR_ROLE_ALIAS_MAX_LENGTH as CORE_ALIAS_MAX_LENGTH,
  CREATOR_ROLE_MAX_ALIASES as CORE_MAX_ALIASES,
  CREATOR_ROLE_PROFILE_VERSION as CORE_PROFILE_VERSION,
  normalizeCreatorRoleProfile as normalizeCoreProfile,
  normalizePublicCreatorRoleProfile as normalizeCorePublicProfile,
  publicCreatorRoleProfile as corePublicProfile,
} from "@toonspectrum/core/creator-role";

import {
  CREATOR_PUBLIC_ROLE_PROFILE_VERSION,
  CREATOR_ROLE_ALIAS_MAX_LENGTH,
  CREATOR_ROLE_MAX_ALIASES,
  CREATOR_ROLE_MAX_SECONDARY,
  CREATOR_ROLE_PROFILE_VERSION,
  EMPTY_CREATOR_ROLE_PROFILE,
  creatorRoleAlias,
  creatorRoleDefinition,
  creatorRoleLens,
  creatorRoleSelection,
  creatorText,
  normalizeCreatorRoleProfile,
  normalizePublicCreatorRoleProfile,
  parseCreatorRoleProfileInput,
  publicCreatorRoleProfile,
  recommendedCreatorSpecialties,
  resolveCreatorActiveRole,
  resolveCreatorNotificationLevel,
  withCreatorProjectPreference,
  withCreatorRoleOnboarding,
} from "./creator-role-contract";

describe("creator role profile contract", () => {
  it("legacy or malformed reads fall back to a safe empty profile", () => {
    expect(normalizeCreatorRoleProfile(null)).toEqual(EMPTY_CREATOR_ROLE_PROFILE);

    expect(normalizeCreatorRoleProfile({
      primaryRole: "story",
      secondaryRoles: ["story", "assistant", "assistant", "unknown"],
      specialties: ["dialogue", "dialogue", "invalid"],
      activeRole: "unknown",
      roleVisibility: false,
    })).toEqual({
      ...EMPTY_CREATOR_ROLE_PROFILE,
      primaryRole: "story",
      secondaryRoles: ["assistant"],
      specialties: ["dialogue"],
      roleVisibility: false,
      activeRole: "story",
      onboarding: {
        ...EMPTY_CREATOR_ROLE_PROFILE.onboarding,
        status: "completed",
        step: 4,
      },
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

describe("creator role public v2 compatibility", () => {
  const sharedProfile = {
    primaryRole: "story",
    secondaryRoles: ["assistant"],
    specialties: ["dialogue"],
    experienceLevel: "professional",
    collaborationStatus: "available",
    roleAliases: [
      { role: "story", label: "  Lead\n\t writer  ", privateNote: "discard" },
      { role: "assistant", label: "Story assistant" },
    ],
  };
  const aliases = [
    { role: "story", label: "Lead writer" },
    { role: "assistant", label: "Story assistant" },
  ] as const;
  const emptyPublic = {
    version: 2,
    primaryRole: null,
    secondaryRoles: [],
    specialties: [],
    experienceLevel: null,
    collaborationStatus: null,
    roleAliases: [],
  };

  it("shares core public and alias constants while retaining the web v1 write contract", () => {
    expect(CREATOR_PUBLIC_ROLE_PROFILE_VERSION).toBe(CORE_PROFILE_VERSION);
    expect(CREATOR_PUBLIC_ROLE_PROFILE_VERSION).toBe(2);
    expect(CREATOR_ROLE_ALIAS_MAX_LENGTH).toBe(CORE_ALIAS_MAX_LENGTH);
    expect(CREATOR_ROLE_MAX_ALIASES).toBe(CORE_MAX_ALIASES);
    expect(CREATOR_ROLE_PROFILE_VERSION).toBe(1);
    expect(parseCreatorRoleProfileInput({ version: 1, ...sharedProfile }))
      .toMatchObject({ version: 1, roleAliases: aliases });
    expect(parseCreatorRoleProfileInput({ version: 2, ...sharedProfile })).toBeNull();
  });

  it.each([1, 2])("retains allowed aliases from version %i reads without private or unknown fields", (version) => {
    const input = {
      version,
      ...sharedProfile,
      creatorStage: "educator",
      roleVisibility: true,
      visibility: { roles: true, specialties: true, experienceLevel: true, collaborationStatus: true },
      activeRole: "assistant",
      usagePurposes: ["portfolio"],
      workCapacity: { weeklyHours: 12, availabilityNote: "private note" },
      defaultNotificationLevel: "all",
      onboarding: { status: "in-progress", step: 2 },
      projectRolePreferences: [{ projectKey: "private project", activeRole: "assistant" }],
      unknownField: "private unknown",
    };
    const expected = { version: 2, ...sharedProfile, roleAliases: aliases };
    const internal = normalizeCreatorRoleProfile(input);
    expect(internal.roleAliases).toEqual(aliases);
    expect(internal).not.toHaveProperty("unknownField");
    expect(normalizePublicCreatorRoleProfile(input)).toEqual(expected);
    expect(publicCreatorRoleProfile(input)).toEqual(expected);
    expect(publicCreatorRoleProfile(internal)).toEqual(expected);
    expect(normalizePublicCreatorRoleProfile(input)).toEqual(normalizeCorePublicProfile(input));
    expect(creatorRoleAlias(internal, "story")).toBe("Lead writer");
    expect(creatorRoleAlias(expected, "assistant")).toBe("Story assistant");
    expect(creatorRoleAlias(internal, "producer")).toBeNull();
    expect(creatorRoleAlias(internal, null)).toBeNull();
    expect(parseCreatorRoleProfileInput(input)).toBeNull();
  });

  it("ignores malformed, blank, oversized, unselected and duplicate aliases like current core", () => {
    const input = {
      ...sharedProfile,
      roleVisibility: true,
      roleAliases: [
        null, false, [], "story", {},
        { role: "unknown", label: "Unknown" },
        { role: "producer", label: "Unselected" },
        { role: "story", label: 12 },
        { role: "story", label: " \n\t " },
        { role: "story", label: "x".repeat(CREATOR_ROLE_ALIAS_MAX_LENGTH + 1) },
        ...Array.from({ length: CREATOR_ROLE_MAX_ALIASES + 1 }, () => ({ role: "assistant", label: null })),
        { role: "story", label: "  Lead\n\t writer  " },
        { role: "story", label: "Duplicate loses" },
        { role: "assistant", label: ` ${"a".repeat(CREATOR_ROLE_ALIAS_MAX_LENGTH)} ` },
      ],
    };
    const expected = [aliases[0], { role: "assistant", label: "a".repeat(CREATOR_ROLE_ALIAS_MAX_LENGTH) }];
    expect(normalizeCreatorRoleProfile(input).roleAliases).toEqual(expected);
    expect(normalizeCreatorRoleProfile(input).roleAliases).toEqual(normalizeCoreProfile(input).roleAliases);
    expect(normalizePublicCreatorRoleProfile(input)?.roleAliases).toEqual(expected);
    expect(publicCreatorRoleProfile(input)).toEqual(corePublicProfile(input));
  });

  it.each([undefined, null, "alias", { story: "Writer" }])("ignores non-array alias containers: %j", (roleAliases) => {
    const input = { ...sharedProfile, roleAliases };
    expect(normalizeCreatorRoleProfile(input).roleAliases).toEqual([]);
    expect(normalizePublicCreatorRoleProfile(input)?.roleAliases).toEqual([]);
    expect(normalizePublicCreatorRoleProfile(input)).toEqual(normalizeCorePublicProfile(input));
  });

  it("limits aliases to normalized selected roles and preserves core role ordering and caps", () => {
    const roles = ["story", "assistant", "background", "color", "editor", "producer", "reviewer", "planner", "character"];
    const input = {
      primaryRole: "story",
      secondaryRoles: ["unknown", "story", "assistant", "assistant", ...roles.slice(2)],
      roleAliases: roles.map((role) => ({ role, label: `${role} alias` })),
    };
    const internal = normalizeCreatorRoleProfile(input);
    expect(internal.secondaryRoles).toEqual(["assistant", "background", "color", "editor"]);
    expect(internal.roleAliases.map(({ role }) => role)).toEqual(["story", ...internal.secondaryRoles]);
    expect(internal.roleAliases.length).toBeLessThanOrEqual(CREATOR_ROLE_MAX_ALIASES);
    expect(internal.roleAliases).toEqual(normalizeCoreProfile(input).roleAliases);
    expect(normalizePublicCreatorRoleProfile(input)).toEqual(normalizeCorePublicProfile(input));
  });

  it.each([
    { specialties: ["dialogue"] },
    { collaborationStatus: "limited" },
    { experienceLevel: "experienced" },
    { secondaryRoles: ["assistant"], roleAliases: [{ role: "assistant", label: "Helper" }] },
  ])("retains useful public data without a primary role: %j", (fields) => {
    const input = { primaryRole: null, ...fields };
    const expected = { ...emptyPublic, ...fields };
    expect(normalizePublicCreatorRoleProfile(input)).toEqual(expected);
    expect(normalizePublicCreatorRoleProfile(input)).toEqual(normalizeCorePublicProfile(input));
    expect(publicCreatorRoleProfile({ ...input, roleVisibility: true })).toEqual(expected);
  });

  it.each(Array.from({ length: 16 }, (_, mask) => mask))("masks each public field independently (visibility mask %i)", (mask) => {
    const visibility = {
      roles: Boolean(mask & 1),
      specialties: Boolean(mask & 2),
      experienceLevel: Boolean(mask & 4),
      collaborationStatus: Boolean(mask & 8),
    };
    // The explicit field flags take precedence over the legacy all-fields toggle.
    const input = { ...sharedProfile, visibility, roleVisibility: !visibility.roles };
    const expected = mask === 0 ? null : {
      ...emptyPublic,
      primaryRole: visibility.roles ? "story" : null,
      secondaryRoles: visibility.roles ? ["assistant"] : [],
      specialties: visibility.specialties ? ["dialogue"] : [],
      experienceLevel: visibility.experienceLevel ? "professional" : null,
      collaborationStatus: visibility.collaborationStatus ? "available" : null,
      roleAliases: visibility.roles ? aliases : [],
    };
    expect(publicCreatorRoleProfile(input)).toEqual(expected);
    expect(publicCreatorRoleProfile(input)).toEqual(corePublicProfile(input));
  });

  it("defaults missing or non-boolean visibility flags to private and retains legacy opt-in", () => {
    expect(publicCreatorRoleProfile(sharedProfile)).toBeNull();
    expect(publicCreatorRoleProfile({ ...sharedProfile, roleVisibility: false })).toBeNull();
    expect(publicCreatorRoleProfile({ ...sharedProfile, roleVisibility: true }))
      .toEqual({ version: 2, ...sharedProfile, roleAliases: aliases });
    const input = {
      ...sharedProfile,
      roleVisibility: true,
      visibility: { roles: "true", specialties: true, experienceLevel: 1 },
    };
    expect(publicCreatorRoleProfile(input)).toEqual({ ...emptyPublic, specialties: ["dialogue"] });
    expect(publicCreatorRoleProfile(input)).toEqual(corePublicProfile(input));
  });

  it.each([
    null, [], {},
    { primaryRole: null },
    { primaryRole: "unknown", specialties: ["unknown"], collaborationStatus: "unknown" },
    { roleAliases: [{ role: "story", label: "No selected role" }] },
    { creatorStage: "professional", activeRole: "story", unknownField: "not public" },
  ])("returns null for an empty public projection: %j", (input) => {
    expect(normalizePublicCreatorRoleProfile(input)).toBeNull();
    expect(normalizePublicCreatorRoleProfile(input)).toEqual(normalizeCorePublicProfile(input));
    expect(publicCreatorRoleProfile(input)).toBeNull();
  });

  it("retains educator, locale, stage, workspace, onboarding and project preference compatibility", () => {
    const input = {
      version: 1,
      primaryRole: "educator",
      secondaryRoles: ["story"],
      creatorStage: "educator",
      activeRole: "story",
      roleVisibility: true,
      roleAliases: [{ role: "educator", label: "  Comics\n teacher  " }],
      usagePurposes: ["portfolio", "studio-operations"],
      workCapacity: { weeklyHours: "12", maxConcurrentTasks: "2", availabilityNote: "  After class  " },
      defaultNotificationLevel: "all",
      onboarding: { status: "in-progress", step: 3, updatedAt: "2026-09-19T00:00:00Z" },
      projectRolePreferences: [{
        projectKey: " class/한글 ", activeRole: "educator", notificationLevel: "essential",
        workspacePresetId: " teaching ", updatedAt: "2026-09-19T00:00:00Z",
      }],
    };
    const profile = normalizeCreatorRoleProfile(input);
    expect(parseCreatorRoleProfileInput(input)).toEqual(profile);
    expect(profile).toMatchObject({
      version: 1, primaryRole: "educator", creatorStage: "educator", activeRole: "story",
      usagePurposes: ["portfolio", "studio-operations"],
      roleAliases: [{ role: "educator", label: "Comics teacher" }],
      workCapacity: { weeklyHours: 12, maxConcurrentTasks: 2, availabilityNote: "After class" },
      defaultNotificationLevel: "all",
      onboarding: { status: "in-progress", step: 3, completedAt: null, updatedAt: "2026-09-19T00:00:00.000Z" },
      projectRolePreferences: [{
        projectKey: "class/한글", activeRole: "educator", notificationLevel: "essential",
        workspacePresetId: "teaching", updatedAt: "2026-09-19T00:00:00.000Z",
      }],
    });
    expect(resolveCreatorActiveRole(profile, " class/한글 ")).toBe("educator");
    expect(resolveCreatorNotificationLevel(profile, "class/한글")).toBe("essential");
    const updated = withCreatorProjectPreference(profile, "class/한글", { workspacePresetId: "classroom" }, null);
    expect(updated.projectRolePreferences[0]?.workspacePresetId).toBe("classroom");
    expect(updated.roleAliases).toEqual(profile.roleAliases);
    expect(withCreatorRoleOnboarding(profile, { status: "completed" }, "2026-09-20T00:00:00Z"))
      .toMatchObject({ creatorStage: "educator", roleAliases: profile.roleAliases, onboarding: { status: "completed", step: 4 } });
    const label = creatorRoleDefinition("educator")!.label;
    expect(creatorText(label, "ko")).toBe(label.ko);
    expect(creatorText(label, "ja-JP")).toBe(label.en);
    expect(publicCreatorRoleProfile(input)).toEqual({
      ...emptyPublic, primaryRole: "educator", secondaryRoles: ["story"], roleAliases: profile.roleAliases,
    });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  batchPublicCreatorRoleProfiles,
  searchPublicCreatorRoles,
} from "./creator-role-workspace-client";

import { publicCreatorRoleProfile } from "@/shared/lib/creator-role-contract";

const { apiGet, apiPost } = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}));

vi.mock("@/infrastructure/api", () => ({
  api: { get: apiGet, post: apiPost },
  isHttpError: () => false,
  toApiError: async (error: unknown) => error,
}));

const emptyPublicProfile = {
  version: 2,
  primaryRole: null,
  secondaryRoles: [],
  specialties: [],
  experienceLevel: null,
  collaborationStatus: null,
  roleAliases: [],
} as const;

const endpoints = [
  {
    name: "batch",
    respond: (items: unknown[]) => apiPost.mockResolvedValue({ items }),
    load: () => batchPublicCreatorRoleProfiles(["candidate"]),
  },
  {
    name: "directory",
    respond: (items: unknown[]) => apiGet.mockResolvedValue({ items, total: items.length }),
    load: async () => (await searchPublicCreatorRoles({})).items,
  },
];

describe.each(endpoints)("public role workspace $name", ({ respond, load }) => {
  beforeEach(() => {
    apiGet.mockReset();
    apiPost.mockReset();
  });

  it("retains specialty-only and secondary-role alias API candidates without visibility flags", async () => {
    respond([
      {
        userId: "specialist",
        name: "  배경 전문가  ",
        roleProfile: { ...emptyPublicProfile, specialties: ["background-3d"] },
      },
      {
        userId: "alias",
        roleProfile: {
          ...emptyPublicProfile,
          secondaryRoles: ["line-art", "line-art", "invalid"],
          roleAliases: [
            { role: "line-art", label: "  선화   전문가  " },
            { role: "line-art", label: "중복" },
            { role: "story", label: "선택하지 않은 직무" },
          ],
        },
      },
    ]);

    expect(await load()).toEqual([
      {
        userId: "specialist",
        name: "배경 전문가",
        roleProfile: { ...emptyPublicProfile, specialties: ["background-3d"] },
        capacity: null,
        customRoleLabel: null,
      },
      {
        userId: "alias",
        name: "익명 창작자",
        roleProfile: {
          ...emptyPublicProfile,
          secondaryRoles: ["line-art"],
          roleAliases: [{ role: "line-art", label: "선화 전문가" }],
        },
        capacity: null,
        customRoleLabel: null,
      },
    ]);
  });

  it("retains experience/collaboration-only candidates and rejects empty public profiles", async () => {
    respond([
      { userId: "experience", roleProfile: { experienceLevel: "professional" } },
      { userId: "collaboration", roleProfile: { collaborationStatus: "available" } },
      { userId: "empty", roleProfile: emptyPublicProfile },
      { userId: "null", roleProfile: null },
      {
        userId: "invalid",
        roleProfile: {
          primaryRole: "invalid",
          specialties: ["invalid"],
          roleAliases: [{ role: "story", label: "직무를 만들면 안 됨" }],
          activeRole: "story",
        },
      },
    ]);

    expect((await load()).map(({ userId, roleProfile }) => ({ userId, roleProfile }))).toEqual([
      {
        userId: "experience",
        roleProfile: { ...emptyPublicProfile, experienceLevel: "professional" },
      },
      {
        userId: "collaboration",
        roleProfile: { ...emptyPublicProfile, collaborationStatus: "available" },
      },
    ]);
  });

  it.each([1, undefined])("normalizes legacy API version %s to strict public v2", async (version) => {
    respond([{
      userId: "legacy",
      roleProfile: {
        version,
        primaryRole: "story",
        secondaryRoles: ["story", "planner", "invalid"],
        specialties: ["plot", "plot", "invalid"],
        experienceLevel: "invalid",
        collaborationStatus: "available",
        roleVisibility: false,
        visibility: { roles: false },
        activeRole: "planner",
        creatorStage: "professional",
        usagePurposes: ["team-production"],
        workCapacity: { weeklyHours: 35, availabilityNote: "private note" },
        projectRolePreferences: [{ projectKey: "work:private", activeRole: "planner" }],
        onboarding: { status: "completed" },
        defaultNotificationLevel: "all",
        privateField: "private value",
      },
    }]);

    expect(await load()).toEqual([{
      userId: "legacy",
      name: "익명 창작자",
      roleProfile: {
        ...emptyPublicProfile,
        primaryRole: "story",
        secondaryRoles: ["planner"],
        specialties: ["plot"],
        collaborationStatus: "available",
      },
      capacity: null,
      customRoleLabel: null,
    }]);
  });

  it("preserves the server visibility projection without restoring private roles or aliases", async () => {
    const projected = publicCreatorRoleProfile({
      primaryRole: "story",
      secondaryRoles: ["planner"],
      specialties: ["plot"],
      roleAliases: [{ role: "story", label: "비공개 직무 별칭" }],
      experienceLevel: "professional",
      collaborationStatus: "available",
      visibility: {
        roles: false,
        specialties: true,
        experienceLevel: false,
        collaborationStatus: false,
      },
    });
    expect(projected).toEqual({ ...emptyPublicProfile, specialties: ["plot"] });
    respond([{
      userId: "private-roles",
      roleProfile: {
        ...projected,
        activeRole: "story",
        roleAliases: [{ role: "story", label: "비공개 직무 별칭" }],
        projectRolePreferences: [{ projectKey: "work:private", activeRole: "planner" }],
      },
    }]);

    expect(await load()).toEqual([{
      userId: "private-roles",
      name: "익명 창작자",
      roleProfile: { ...emptyPublicProfile, specialties: ["plot"] },
      capacity: null,
      customRoleLabel: null,
    }]);
  });
});

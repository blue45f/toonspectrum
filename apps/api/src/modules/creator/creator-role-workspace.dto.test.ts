import { describe, expect, it } from "vitest";

import {
  BatchCreatorRoleProfilesSchema,
  CreatorRoleDirectoryQuerySchema,
  CreatorRoleWorkspaceDocumentSchema,
  CreatorRoleWorkspaceParamsSchema,
  UpdateCreatorRoleWorkspaceSchema,
} from "./creator-role-workspace.dto";

const validDocument = {
  version: 1 as const,
  activeRole: "line-art" as const,
  detailedLens: "drawing" as const,
  workspacePreset: "lineart" as const,
  notificationPreset: "balanced" as const,
  notificationOverrides: {
    assignment: true,
    "deadline-risk": false,
  },
  usageGoals: ["team-production" as const],
  workspaceMode: "creator" as const,
  collaborationMode: "team" as const,
  capacity: {
    weeklyCapacityHours: 20,
    currentAssignedHours: 8,
    concurrentTaskLimit: 3,
    unavailableUntil: null,
  },
  visibility: {
    roles: true,
    specialties: true,
    experienceLevel: false,
    collaborationStatus: true,
  },
  customRoleLabel: "메인 작화",
  onboardingComplete: true,
  checklistStates: {
    "drawing-file": true,
  },
};

describe("creator role workspace DTO", () => {
  it("accepts a complete project-specific preference document", () => {
    expect(CreatorRoleWorkspaceDocumentSchema.parse(validDocument)).toEqual(
      validDocument,
    );
    expect(UpdateCreatorRoleWorkspaceSchema.parse({
      baseRevision: 2,
      document: validDocument,
    }).baseRevision).toBe(2);
  });

  it("defaults older workspace documents to solo collaboration", () => {
    const { collaborationMode: _ignored, ...legacyDocument } = validDocument;
    expect(
      CreatorRoleWorkspaceDocumentSchema.parse(legacyDocument).collaborationMode,
    ).toBe("solo");
  });

  it("rejects unknown role, unsafe project key and oversized team scans", () => {
    expect(() => CreatorRoleWorkspaceDocumentSchema.parse({
      ...validDocument,
      activeRole: "administrator",
    })).toThrow();
    expect(() => CreatorRoleWorkspaceParamsSchema.parse({
      projectKey: "../private",
    })).toThrow();
    expect(() => BatchCreatorRoleProfilesSchema.parse({
      userIds: Array.from({ length: 101 }, (_, index) => `user-${index}`),
    })).toThrow();
  });

  it("coerces directory pagination while keeping filters closed", () => {
    expect(CreatorRoleDirectoryQuerySchema.parse({
      role: "background",
      specialty: "background-3d",
      collaborationStatus: "available",
      limit: "24",
      offset: "12",
    })).toMatchObject({
      role: "background",
      specialty: "background-3d",
      collaborationStatus: "available",
      limit: 24,
      offset: 12,
    });
    expect(() => CreatorRoleDirectoryQuerySchema.parse({
      role: "owner",
    })).toThrow();
  });
});

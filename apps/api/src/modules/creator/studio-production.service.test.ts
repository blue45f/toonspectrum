import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import {
  StudioProductionForbiddenError,
  StudioProductionInvalidPageError,
  StudioProductionRevisionConflictError,
  StudioProductionReviewReferenceError,
  type StudioProductionRepository,
} from "./studio-production.repository";
import { StudioProductionService } from "./studio-production.service";

function repository(overrides: Partial<StudioProductionRepository>): StudioProductionRepository {
  return {
    getWorkspace: vi.fn(),
    saveWorkspace: vi.fn(),
    getPersonalKit: vi.fn(),
    savePersonalKit: vi.fn(),
    listReviewLinks: vi.fn(),
    createReviewLink: vi.fn(),
    revokeReviewLink: vi.fn(),
    getExternalReview: vi.fn(),
    addExternalReviewFeedback: vi.fn(),
    ...overrides,
  } as StudioProductionRepository;
}


const workspaceDocument = {
  schemaVersion: 3 as const,
  revision: 0,
  scopeKey: "work:work-1",
  title: "제작 운영",
  updatedAt: "2026-09-15T00:00:00.000Z",
  tasks: [],
  reviews: [],
  hierarchy: [],
  roleAssignments: [],
  handoffs: [],
  versions: [],
  slides: [],
  members: [],
  inviteToken: null,
};
const personalKitDocument = {
  schemaVersion: 1 as const,
  updatedAt: "2026-09-15T00:00:00.000Z",
  workspaceProfiles: [],
  quickAccess: {},
  gestureMap: {},
  penButtonMap: {},
  touchPolicy: "pen-draw-touch-pan" as const,
  favoriteRefs: [],
};

const reviewLinkInput = {
  role: "commenter" as const,
  pageIds: ["page-1"],
  watermark: true,
  allowDownload: false,
  expiresInHours: 24,
};

describe("StudioProductionService error boundary", () => {
  it.each(["reference", "assignees"] as const)("maps invalid review %s to a stable error without private identities", async (reason) => {
    const service = new StudioProductionService(repository({
      saveWorkspace: vi.fn().mockRejectedValue(new StudioProductionReviewReferenceError(reason)),
    }));
    try {
      await service.saveWorkspace("private-user", "private-work", 0, workspaceDocument);
      throw new Error("expected rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      const response = (error as BadRequestException).getResponse();
      expect(response).toMatchObject({ code: `studio_production_review_${reason}_invalid` });
      expect(JSON.stringify(response)).not.toContain("private-");
    }
  });
  it("maps invalid review pages to a stable client error without exposing identifiers", async () => {
    const service = new StudioProductionService(repository({
      createReviewLink: vi.fn().mockRejectedValue(new StudioProductionInvalidPageError("private-page")),
    }));
    await expect(service.createReviewLink("user-1", "work-1", reviewLinkInput))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(service.createReviewLink("user-1", "work-1", reviewLinkInput))
      .rejects.not.toThrow(/private-page/);
  });

  it.each([
    ["manage-roles", "제작 역할"],
    ["approve", "승인 단계"],
    ["publish", "게시 준비"],
  ] as const)("maps %s authority failures to a forbidden response", async (operation, message) => {
    const service = new StudioProductionService(repository({
      saveWorkspace: vi.fn().mockRejectedValue(new StudioProductionForbiddenError(operation)),
    }));
    await expect(service.saveWorkspace("user-1", "work-1", 0, workspaceDocument))
      .rejects.toMatchObject<ForbiddenException>({ message: expect.stringContaining(message) });
  });

  it("returns the current revision on optimistic concurrency conflicts", async () => {
    const service = new StudioProductionService(repository({
      savePersonalKit: vi.fn().mockRejectedValue(new StudioProductionRevisionConflictError(8)),
    }));
    try {
      await service.savePersonalKit("user-1", 7, personalKitDocument);
      throw new Error("expected conflict");
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({ currentRevision: 8 });
    }
  });
});

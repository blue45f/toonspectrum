import {
  BadRequestException,
  ForbiddenException,
  HttpException,
} from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ZodValidationPipe } from "../../platform/http/zod-validation.pipe";

import {
  authenticatedStudioUserId,
  parseStudioIfMatch,
  requireStudioIdempotencyKey,
  StudioProjectGraphController,
} from "./studio-project-graph.controller";
import { CreateStudioArtifactDto } from "./studio-project-graph.dto";
import { StudioProjectGraphService } from "./studio-project-graph.service";

const HASH = "a".repeat(64);
const service = {
  approveCompatibilityReport: vi.fn(),
  commitRevision: vi.fn(),
  createArtifact: vi.fn(),
  createCompatibilityReport: vi.fn(),
  createProject: vi.fn(),
  createReview: vi.fn(),
  createReviewComment: vi.fn(),
  decideReview: vi.fn(),
  getReview: vi.fn(),
  listCompatibilityReports: vi.fn(),
  listReviews: vi.fn(),
  reopenReviewComment: vi.fn(),
  restoreRevision: vi.fn(),
  resolveReviewComment: vi.fn(),
  getProject: vi.fn(),
  getProjectByWork: vi.fn(),
  listRevisions: vi.fn(),
  registerBlob: vi.fn(),
};
function controller(): StudioProjectGraphController {
  return new StudioProjectGraphController(
    service as unknown as StudioProjectGraphService,
  );
}

const artifactInput = {
  workspaceId: "workspace-1",
  artifact: {
    id: "artifact-2d-1",
    kind: "canvas-2d" as const,
    title: "12화 원고",
    scope: {
      projectId: "project-1",
      episodeId: "episode-12",
    },
  },
  initialRevision: {
    id: "revision-1",
    rootGraphHash: HASH,
    deviceId: "device-1",
    createdAt: "2026-09-17T00:00:00.000Z",
    blobRefs: [],
  },
};

describe("Studio ProjectGraph request contracts", () => {
  beforeEach(() => {
    for (const mock of Object.values(service)) mock.mockReset();
  });
  it("accepts one strong revision identifier and rejects unsafe If-Match forms", () => {
    expect(parseStudioIfMatch("revision-1")).toBe("revision-1");
    expect(parseStudioIfMatch('"revision-1"')).toBe("revision-1");
    expect(() => parseStudioIfMatch(undefined)).toThrow(HttpException);
    expect(() => parseStudioIfMatch("*")).toThrow(BadRequestException);
    expect(() => parseStudioIfMatch('W/"revision-1"')).toThrow(BadRequestException);
    expect(() => parseStudioIfMatch('"revision-1", "revision-2"'))
      .toThrow(BadRequestException);
  });

  it("requires an authenticated user and a bounded idempotency key", () => {
    expect(authenticatedStudioUserId(" editor-1 ")).toBe("editor-1");
    expect(() => authenticatedStudioUserId(undefined))
      .toThrow(ForbiddenException);
    expect(requireStudioIdempotencyKey("request-1234")).toBe("request-1234");
    expect(() => requireStudioIdempotencyKey("short"))
      .toThrow(BadRequestException);
  });

  it("validates a complete artifact bootstrap request", () => {
    const pipe = new ZodValidationPipe(CreateStudioArtifactDto);
    expect(pipe.transform(
      artifactInput,
      { type: "body", metatype: undefined, data: undefined },
    )).toEqual(artifactInput);
    expect(() => pipe.transform(
      { ...artifactInput, unexpected: true },
      { type: "body", metatype: undefined, data: undefined },
    )).toThrow(BadRequestException);
  });
  it("forwards artifact creation with exact user, project and retry key", async () => {
    service.createArtifact.mockResolvedValue({
      projectId: "project-1",
      artifactId: "artifact-2d-1",
      revisionId: "revision-1",
      replayed: false,
    });

    await expect(controller().createArtifact(
      { projectId: "project-1" },
      artifactInput,
      "request-1234",
      "editor-1",
    )).resolves.toMatchObject({ artifactId: "artifact-2d-1" });
    expect(service.createArtifact).toHaveBeenCalledWith(
      "editor-1",
      "project-1",
      artifactInput,
      "request-1234",
    );
  });

  it("rejects unauthenticated access before reaching the service", () => {
    expect(() => controller().getProject({ projectId: "project-1" }))
      .toThrow(ForbiddenException);
    expect(service.getProject).not.toHaveBeenCalled();
  });

  it("forwards compatibility history and non-destructive revision restore", async () => {
    service.listCompatibilityReports.mockResolvedValue([]);
    service.restoreRevision.mockResolvedValue({
      artifactId: "artifact-1",
      revisionId: "revision-restored",
      headRevisionId: "revision-restored",
      approvedRevisionId: "revision-approved",
      sequence: 8,
      replayed: false,
    });
    const restore = {
      revisionId: "revision-restored",
      commandId: "command-restore-1",
      deviceId: "device-1",
      createdAt: "2026-09-17T05:30:00.000Z",
      message: "검수 전 상태 복원",
    };

    await expect(controller().listCompatibilityReports(
      { projectId: "project-1" },
      "editor-1",
    )).resolves.toEqual([]);
    await expect(controller().restoreRevision(
      { artifactId: "artifact-1", revisionId: "revision-old" },
      restore,
      '"revision-head"',
      "restore-request-1",
      "editor-1",
    )).resolves.toMatchObject({ headRevisionId: "revision-restored" });

    expect(service.listCompatibilityReports).toHaveBeenCalledWith(
      "editor-1",
      "project-1",
    );
    expect(service.restoreRevision).toHaveBeenCalledWith(
      "editor-1",
      "artifact-1",
      "revision-old",
      "revision-head",
      "restore-request-1",
      restore,
    );
  });

  it("forwards review list and detail reads with the authenticated user", async () => {
    service.listReviews.mockResolvedValue([]);
    service.getReview.mockResolvedValue({ id: "review-1", comments: [] });

    await expect(controller().listReviews(
      { artifactId: "artifact-1" },
      "reviewer-1",
    )).resolves.toEqual([]);
    await expect(controller().getReview(
      { reviewId: "review-1" },
      "reviewer-1",
    )).resolves.toMatchObject({ id: "review-1" });
    expect(service.listReviews).toHaveBeenCalledWith(
      "reviewer-1",
      "artifact-1",
    );
    expect(service.getReview).toHaveBeenCalledWith(
      "reviewer-1",
      "review-1",
    );
  });

  it("forwards review decisions and comment resolution lifecycle", async () => {
    service.decideReview.mockResolvedValue({ status: "approved" });
    service.resolveReviewComment.mockResolvedValue({ status: "resolved" });
    service.reopenReviewComment.mockResolvedValue({ status: "reopened" });

    await expect(controller().decideReview(
      { reviewId: "review-1" },
      { status: "approved" },
      "reviewer-1",
    )).resolves.toMatchObject({ status: "approved" });
    await expect(controller().resolveReviewComment(
      { commentId: "comment-1" },
      { resolutionRevisionId: "revision-2", status: "resolved" },
      "editor-1",
    )).resolves.toMatchObject({ status: "resolved" });
    await expect(controller().reopenReviewComment(
      { commentId: "comment-1" },
      "editor-1",
    )).resolves.toMatchObject({ status: "reopened" });

    expect(service.decideReview).toHaveBeenCalledWith(
      "reviewer-1",
      "review-1",
      { status: "approved" },
    );
    expect(service.resolveReviewComment).toHaveBeenCalledWith(
      "editor-1",
      "comment-1",
      { resolutionRevisionId: "revision-2", status: "resolved" },
    );
    expect(service.reopenReviewComment).toHaveBeenCalledWith(
      "editor-1",
      "comment-1",
    );
  });
});

import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  PreconditionFailedException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  StudioBlobNotReadyError,
  StudioCompatibilityApprovalRequiredError,
  StudioProjectForbiddenError,
  StudioProjectGraphRepository,
  StudioProjectNotFoundError,
  StudioRepositoryInvariantError,
  StudioRevisionConflictError,
} from "./studio-project-graph.repository";
import { StudioProjectGraphService } from "./studio-project-graph.service";

const repository = {
  commitRevision: vi.fn(),
  createArtifact: vi.fn(),
  createCompatibilityReport: vi.fn(),
  createProject: vi.fn(),
  createReview: vi.fn(),
  createReviewComment: vi.fn(),
  getProject: vi.fn(),
  getProjectByWork: vi.fn(),
  listCompatibilityReports: vi.fn(),
  listRevisions: vi.fn(),
  registerBlob: vi.fn(),
  restoreRevision: vi.fn(),
  approveCompatibilityReport: vi.fn(),
};
function service(): StudioProjectGraphService {
  return new StudioProjectGraphService(
    repository as unknown as StudioProjectGraphRepository,
  );
}

describe("StudioProjectGraphService error boundary", () => {
  beforeEach(() => {
    for (const mock of Object.values(repository)) mock.mockReset();
  });

  it("maps hidden project and access failures without leaking storage details", async () => {
    repository.getProject.mockRejectedValueOnce(
      new StudioProjectNotFoundError("project"),
    );
    await expect(service().getProject("user-1", "project-1"))
      .rejects.toBeInstanceOf(NotFoundException);

    repository.getProject.mockRejectedValueOnce(
      new StudioProjectForbiddenError("view"),
    );
    await expect(service().getProject("user-1", "project-1"))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it("maps stale heads to a conflict containing the current revision", async () => {
    repository.commitRevision.mockRejectedValueOnce(
      new StudioRevisionConflictError("revision-current"),
    );
    await expect(service().commitRevision(
      "user-1",
      "artifact-1",
      "revision-old",
      "request-1234",
      {} as never,
    )).rejects.toBeInstanceOf(ConflictException);
  });
  it("applies the same stale-head conflict boundary to restore", async () => {
    repository.restoreRevision.mockRejectedValueOnce(
      new StudioRevisionConflictError("revision-current"),
    );
    await expect(service().restoreRevision(
      "user-1",
      "artifact-1",
      "revision-target",
      "revision-old",
      "restore-request-1",
      {} as never,
    )).rejects.toBeInstanceOf(ConflictException);
  });

  it("maps blob and compatibility gates to explicit preconditions", async () => {
    repository.commitRevision.mockRejectedValueOnce(
      new StudioBlobNotReadyError(["a".repeat(64)]),
    );
    await expect(service().commitRevision(
      "user-1",
      "artifact-1",
      "revision-1",
      "request-1234",
      {} as never,
    )).rejects.toBeInstanceOf(PreconditionFailedException);

    repository.commitRevision.mockRejectedValueOnce(
      new StudioCompatibilityApprovalRequiredError("report-1"),
    );
    await expect(service().commitRevision(
      "user-1",
      "artifact-1",
      "revision-1",
      "request-1235",
      {} as never,
    )).rejects.toBeInstanceOf(PreconditionFailedException);
  });

  it("maps invariant failures to a safe validation response", async () => {
    repository.createArtifact.mockRejectedValueOnce(
      new StudioRepositoryInvariantError(
        "scope_outside_artifact",
        "internal detail",
      ),
    );
    await expect(service().createArtifact(
      "user-1",
      "project-1",
      {} as never,
      "request-1234",
    )).rejects.toBeInstanceOf(UnprocessableEntityException);
  });
});

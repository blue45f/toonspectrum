import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getStudioProjectByWork,
  listStudioArtifactRevisions,
  newStudioMutationKey,
  newStudioProjectGraphId,
  restoreStudioRevision,
} from "./studio-project-graph-client";

const http = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock("@/infrastructure/api", () => ({ api: http }));

const HASH = "a".repeat(64);
const NOW = "2026-09-17T05:30:00.000Z";

function projectRecord() {
  return {
    id: "project-1",
    workId: "work-1",
    schemaVersion: 3,
    authorityVersion: "project-graph-v3",
    ownerUserId: "owner-1",
    createdAt: NOW,
    updatedAt: NOW,
    access: {
      view: true,
      comment: true,
      edit: true,
      manageMembers: true,
      respondInvite: false,
      owner: true,
      role: "owner",
    },
    artifacts: [{
      id: "artifact-1",
      projectId: "project-1",
      kind: "canvas-2d",
      title: "1화 원고",
      scope: {
        projectId: "project-1",
        kind: "project",
        id: "project-1",
        ancestors: [],
      },
      headRevisionId: "revision-head",
      approvedRevisionId: null,
      ownerWorkspaceId: "workspace-1",
      createdAt: NOW,
      updatedAt: NOW,
    }],
  };
}

function revisionRecord() {
  return {
    id: "revision-head",
    artifactId: "artifact-1",
    kind: "checkpoint",
    parentIds: [],
    rootGraphHash: HASH,
    operationFirst: null,
    operationLast: null,
    createdBy: "owner-1",
    deviceId: "device-1",
    createdAt: NOW,
    message: "첫 체크포인트",
    compatibilityReportId: null,
    provenanceManifestId: null,
    blobRefs: [],
  };
}

describe("Studio ProjectGraph browser client", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads a project through the work identity and validates the complete authority record", async () => {
    http.get.mockResolvedValueOnce(projectRecord());

    await expect(getStudioProjectByWork("work / 1")).resolves.toMatchObject({
      id: "project-1",
      artifacts: [{ id: "artifact-1", kind: "canvas-2d" }],
    });
    expect(http.get).toHaveBeenCalledWith(
      "/studio-project-graph/works/work%20%2F%201/project",
    );
  });

  it("rejects incomplete server records instead of silently treating them as synced", async () => {
    const invalid = projectRecord();
    delete (invalid.access as Partial<typeof invalid.access>).edit;
    http.get.mockResolvedValueOnce(invalid);

    await expect(getStudioProjectByWork("work-1")).rejects.toThrow();
  });

  it("lists immutable revisions with strict blob and timestamp contracts", async () => {
    http.get.mockResolvedValueOnce([revisionRecord()]);
    await expect(listStudioArtifactRevisions("artifact-1")).resolves.toEqual([
      revisionRecord(),
    ]);
    expect(http.get).toHaveBeenCalledWith(
      "/studio-project-graph/artifacts/artifact-1/revisions",
    );
  });

  it("restores as a new checkpoint with strong concurrency and retry headers", async () => {
    http.post.mockResolvedValueOnce({
      artifactId: "artifact-1",
      revisionId: "revision-restored",
      headRevisionId: "revision-restored",
      approvedRevisionId: null,
      sequence: 7,
      replayed: false,
    });
    const input = {
      revisionId: "revision-restored",
      commandId: "command-restore-1",
      deviceId: "device-1",
      createdAt: NOW,
      message: "검수 전 상태 복원",
    };

    await expect(restoreStudioRevision(
      "artifact-1",
      "revision-old",
      "revision-head",
      input,
      "restore-request-1234",
    )).resolves.toMatchObject({ headRevisionId: "revision-restored" });

    expect(http.post).toHaveBeenCalledWith(
      "/studio-project-graph/artifacts/artifact-1/revisions/revision-old/restore",
      input,
      {
        headers: {
          "Idempotency-Key": "restore-request-1234",
          "If-Match": '"revision-head"',
        },
      },
    );
    const options = http.post.mock.calls[0]?.[2] as { headers: Record<string, string> };
    expect(options.headers).not.toHaveProperty("x-user-id");
  });

  it("generates bounded identifiers that satisfy the shared entity grammar", () => {
    const id = newStudioProjectGraphId("Revision Restore");
    const key = newStudioMutationKey("Revision Restore");
    expect(id).toMatch(/^revision-restore-[a-z0-9-]+$/u);
    expect(id.length).toBeLessThanOrEqual(160);
    expect(key).toMatch(/^revision-restore:/u);
    expect(key.length).toBeGreaterThanOrEqual(8);
    expect(key.length).toBeLessThanOrEqual(240);
  });
});

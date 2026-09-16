import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  commitStudioProjectRevision,
  createStudioExternalFileBinding,
  listStudioExternalFileBindings,
  loadStudioProjectGraph,
  removeStudioExternalFileBinding,
  StudioProjectGraphConflictError,
  StudioProjectGraphContractError,
  updateStudioExternalFileBinding,
} from "./studio-project-graph-client";

const http = vi.hoisted(() => ({
  delete: vi.fn(),
  get: vi.fn(),
  patch: vi.fn(),
  post: vi.fn(),
}));
const httpState = vi.hoisted(() => ({ conflict: false }));

vi.mock("@/infrastructure/api", () => ({
  api: http,
  isHttpError: () => httpState.conflict,
  toApiError: async (error: unknown, fallback: string) =>
    error instanceof Error ? error : new Error(fallback),
}));

const NOW = "2026-09-17T00:00:00.000Z";
const HASH = "a".repeat(64);

function projectResponse() {
  return {
    id: "project-1",
    workId: "work-1",
    schemaVersion: 3 as const,
    authorityVersion: "project-graph-v3" as const,
    ownerUserId: "user-1",
    createdAt: NOW,
    updatedAt: NOW,
    access: {
      view: true,
      comment: true,
      edit: true,
      manage: true,
      owner: true,
      role: "owner" as const,
    },
    artifacts: [{
      id: "artifact-1",
      projectId: "project-1",
      kind: "canvas-2d" as const,
      title: "1화 원고",
      scope: { projectId: "project-1", episodeId: "episode-1" },
      headRevisionId: "revision-1",
      approvedRevisionId: null,
      ownerWorkspaceId: "workspace-1",
      createdAt: NOW,
      updatedAt: NOW,
    }],
  };
}

function bindingResponse() {
  return {
    id: "binding-1",
    artifactId: "artifact-1",
    provider: "dropbox" as const,
    providerAccountId: "dropbox-account-1",
    remoteFileId: "remote-file-1",
    displayPath: "/작품/1화.psd",
    syncMode: "bidirectional" as const,
    remoteVersion: null,
    remoteEtag: null,
    contentHash: null,
    lastSyncedRevisionId: null,
    lastSyncedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  httpState.conflict = false;
});

describe("Studio ProjectGraph web client", () => {
  it("loads and validates the project envelope", async () => {
    http.get.mockResolvedValueOnce(projectResponse());
    await expect(loadStudioProjectGraph("project-1")).resolves.toMatchObject({
      id: "project-1",
      artifacts: [{ id: "artifact-1", headRevisionId: "revision-1" }],
    });
    expect(http.get).toHaveBeenCalledWith(
      "/studio-project-graph/projects/project-1",
      { signal: undefined },
    );
  });

  it("fails closed when a project response omits authority evidence", async () => {
    const invalid = projectResponse() as Record<string, unknown>;
    delete invalid.authorityVersion;
    http.get.mockResolvedValueOnce(invalid);
    await expect(loadStudioProjectGraph("project-1")).rejects.toThrow(
      StudioProjectGraphContractError,
    );
  });

  it("commits a revision with strong head and idempotency headers", async () => {
    http.post.mockResolvedValueOnce({
      artifactId: "artifact-1",
      revisionId: "revision-2",
      headRevisionId: "revision-2",
      approvedRevisionId: null,
      sequence: 2,
      replayed: false,
    });
    const input = {
      revisionId: "revision-2",
      kind: "checkpoint" as const,
      parentIds: ["revision-1"],
      rootGraphHash: HASH,
      deviceId: "device-1",
      createdAt: NOW,
      command: {
        id: "command-2",
        type: "document.checkpoint",
        scope: { projectId: "project-1" },
        payloadHash: HASH,
        issuedAt: NOW,
      },
    };
    await expect(commitStudioProjectRevision(
      "artifact-1",
      "revision-1",
      "mutation-0001",
      input,
    )).resolves.toMatchObject({ headRevisionId: "revision-2" });
    expect(http.post).toHaveBeenCalledWith(
      "/studio-project-graph/artifacts/artifact-1/revisions",
      input,
      {
        signal: undefined,
        headers: {
          "If-Match": '"revision-1"',
          "Idempotency-Key": "mutation-0001",
        },
      },
    );
  });

  it("surfaces the current server head on a conflict", async () => {
    httpState.conflict = true;
    http.post.mockRejectedValueOnce({
      response: { status: 409 },
      data: { currentRevisionId: "revision-9" },
    });
    await expect(commitStudioProjectRevision(
      "artifact-1",
      "revision-1",
      "mutation-0002",
      {
        revisionId: "revision-2",
        kind: "checkpoint",
        parentIds: ["revision-1"],
        rootGraphHash: HASH,
        deviceId: "device-1",
        createdAt: NOW,
        command: {
          id: "command-2",
          type: "document.checkpoint",
          scope: { projectId: "project-1" },
          payloadHash: HASH,
          issuedAt: NOW,
        },
      },
    )).rejects.toMatchObject({
      name: StudioProjectGraphConflictError.name,
      currentRevisionId: "revision-9",
    });
  });

  it("lists, creates, updates, and removes external file bindings", async () => {
    const binding = bindingResponse();
    http.get.mockResolvedValueOnce([binding]);
    http.post.mockResolvedValueOnce(binding);
    http.patch.mockResolvedValueOnce({
      ...binding,
      contentHash: HASH,
      lastSyncedRevisionId: "revision-2",
      lastSyncedAt: NOW,
    });
    http.delete.mockResolvedValueOnce(undefined);

    await expect(listStudioExternalFileBindings("artifact-1")).resolves.toHaveLength(1);
    await expect(createStudioExternalFileBinding("artifact-1", {
      id: "binding-1",
      provider: "dropbox",
      providerAccountId: "dropbox-account-1",
      remoteFileId: "remote-file-1",
      displayPath: "/작품/1화.psd",
      syncMode: "bidirectional",
    })).resolves.toMatchObject({ provider: "dropbox" });
    await expect(updateStudioExternalFileBinding("binding-1", {
      contentHash: HASH,
      lastSyncedRevisionId: "revision-2",
      lastSyncedAt: NOW,
    })).resolves.toMatchObject({
      contentHash: HASH,
      lastSyncedRevisionId: "revision-2",
    });
    await expect(removeStudioExternalFileBinding("binding-1")).resolves.toBeUndefined();

    expect(http.get).toHaveBeenCalledWith(
      "/studio-project-graph/artifacts/artifact-1/external-bindings",
      { signal: undefined },
    );
    expect(http.patch).toHaveBeenCalledWith(
      "/studio-project-graph/external-bindings/binding-1",
      expect.objectContaining({ lastSyncedRevisionId: "revision-2" }),
      { signal: undefined },
    );
    expect(http.delete).toHaveBeenCalledWith(
      "/studio-project-graph/external-bindings/binding-1",
      { signal: undefined },
    );
  });
});

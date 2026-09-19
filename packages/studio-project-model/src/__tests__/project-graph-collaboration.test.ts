import { describe, expect, it } from "vitest";

import { externalFileBindingSchema } from "../graph/external-file-binding";
import { reviewAnchorSchema, reviewCommentSchema } from "../graph/review";
import { revisionCommitRequestSchema, syncOutboxEntrySchema } from "../graph/sync";

const time = "2026-09-17T02:00:00.000Z";

describe("review anchors", () => {
  it("requires the coordinates that match each anchor kind", () => {
    const base = {
      artifactId: "artifact-1",
      revisionId: "revision-1",
      scope: { projectId: "project-1", episodeId: "episode-1", panelId: "panel-2" },
    };
    expect(reviewAnchorSchema.parse({ ...base, kind: "region", x: 1, y: 2, width: 3, height: 4 })).toMatchObject({ kind: "region" });
    expect(() => reviewAnchorSchema.parse({ ...base, kind: "region", x: 1, y: 2 })).toThrow(/region anchor/u);
  });

  it.each(["sequenceId", "sceneId", "panelId"] as const)(
    "requires an episode parent for a review anchor with %s",
    (scopeField) => {
      const anchor = {
        artifactId: "artifact-1",
        revisionId: "revision-1",
        scope: { projectId: "project-1", [scopeField]: "child-1" },
        kind: "region",
        x: 1,
        y: 2,
        width: 3,
        height: 4,
      };
      expect(reviewAnchorSchema.safeParse(anchor)).toMatchObject({
        success: false,
        error: { issues: [{ code: "custom", path: ["scope", "episodeId"] }] },
      });
      const validScope = { ...anchor.scope, episodeId: "episode-1" };
      expect(reviewAnchorSchema.parse({ ...anchor, scope: validScope }))
        .toMatchObject({ kind: "region", scope: validScope });
    },
  );

  it("does not allow an open comment to pretend it has a resolution revision", () => {
    expect(() => reviewCommentSchema.parse({
      id: "comment-1",
      reviewId: "review-1",
      anchor: {
        artifactId: "artifact-1",
        revisionId: "revision-1",
        scope: { projectId: "project-1" },
        kind: "artifact",
      },
      authorId: "user-1",
      body: "수정 필요",
      severity: "required",
      status: "open",
      assigneeIds: ["user-2"],
      createdAt: time,
      updatedAt: time,
      resolutionRevisionId: "revision-2",
    })).toThrow(/open comments/u);
  });
});

describe("external bindings and sync outbox", () => {
  it("requires a provider account for cloud bindings but never stores OAuth tokens", () => {
    const binding = externalFileBindingSchema.parse({
      id: "binding-1",
      artifactId: "artifact-1",
      provider: "dropbox",
      providerAccountId: "account-1",
      remoteFileId: "remote-1",
      displayPath: "/Series/001.psd",
      syncMode: "bidirectional",
      createdAt: time,
      updatedAt: time,
    });
    expect(binding).not.toHaveProperty("accessToken");
    expect(() => externalFileBindingSchema.parse({ ...binding, providerAccountId: undefined })).toThrow(/providerAccountId/u);
  });

  it("requires an explicit retry time only while an outbox entry is waiting", () => {
    const entry = {
      id: "outbox-1",
      projectId: "project-1",
      artifactId: "artifact-1",
      localSequence: 1,
      baseRevisionId: "revision-1",
      proposedRevisionId: "revision-2",
      operationHash: "a".repeat(64),
      requiredBlobHashes: ["b".repeat(64)],
      state: "retry-wait",
      attempts: 1,
      createdAt: time,
      updatedAt: time,
    };
    expect(() => syncOutboxEntrySchema.parse(entry)).toThrow(/nextRetryAt/u);
    expect(syncOutboxEntrySchema.parse({ ...entry, nextRetryAt: time }).state).toBe("retry-wait");
  });

  it("validates optimistic revision commits", () => {
    expect(revisionCommitRequestSchema.parse({
      artifactId: "artifact-1",
      expectedHeadRevisionId: "revision-1",
      revisionId: "revision-2",
      operationHash: "c".repeat(64),
      requiredBlobHashes: ["d".repeat(64)],
      idempotencyKey: "commit-key-0001",
    }).revisionId).toBe("revision-2");
  });
});

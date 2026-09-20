import { describe, expect, it } from "vitest";

import {
  CreateStudioExternalFileBindingSchema,
  UpdateStudioExternalFileBindingSchema,
  CreateStudioReviewCommentSchema,
} from "./studio-project-graph.dto";

const cloudBinding = {
  id: "binding-google-1",
  provider: "google-drive" as const,
  providerAccountId: "google-account-1",
  remoteFileId: "drive-file-1",
  displayPath: "/작품/1화.psd",
  syncMode: "bidirectional" as const,
};

describe("Studio external file binding DTOs", () => {
  it("accepts a connected cloud account binding", () => {
    expect(CreateStudioExternalFileBindingSchema.parse(cloudBinding)).toEqual(
      cloudBinding,
    );
  });

  it("requires a provider account for cloud bindings", () => {
    const { providerAccountId: _, ...withoutAccount } = cloudBinding;
    expect(CreateStudioExternalFileBindingSchema.safeParse(withoutAccount).success)
      .toBe(false);
  });

  it("keeps local bindings independent from cloud account identities", () => {
    expect(CreateStudioExternalFileBindingSchema.safeParse({
      ...cloudBinding,
      provider: "filesystem-handle",
      providerAccountId: undefined,
    }).success).toBe(true);
    expect(CreateStudioExternalFileBindingSchema.safeParse({
      ...cloudBinding,
      provider: "filesystem-handle",
    }).success).toBe(false);
  });

  it("updates a complete sync point atomically", () => {
    expect(UpdateStudioExternalFileBindingSchema.safeParse({
      contentHash: "a".repeat(64),
      lastSyncedRevisionId: "revision-2",
      lastSyncedAt: "2026-09-17T00:00:00.000Z",
    }).success).toBe(true);
    expect(UpdateStudioExternalFileBindingSchema.safeParse({
      lastSyncedRevisionId: "revision-2",
    }).success).toBe(false);
  });

  it("rejects empty or half-cleared binding patches", () => {
    expect(UpdateStudioExternalFileBindingSchema.safeParse({}).success).toBe(false);
    expect(UpdateStudioExternalFileBindingSchema.safeParse({
      lastSyncedRevisionId: null,
      lastSyncedAt: "2026-09-17T00:00:00.000Z",
    }).success).toBe(false);
  });
});

describe("Studio review comment mutation normalization", () => {
  const input = { id: " note-1 ", body: "  Correct this panel.\n ", severity: "required", assigneeIds: [" user-editor ", "user-owner"],
    dueAt: "2026-10-21T14:30:00+09:00", anchor: { kind: "artifact", artifactId: "artifact-a", revisionId: "snapshot-a", scope: { projectId: "graph-a" } } };
  it("normalizes real HTTP body and user IDs without changing deadline instant or severity", () => {
    expect(CreateStudioReviewCommentSchema.parse(input)).toEqual({ ...input, id: "note-1", body: "Correct this panel.", assigneeIds: ["user-editor", "user-owner"] });
    const { assigneeIds: _ids, dueAt: _due, ...minimal } = input;
    expect(CreateStudioReviewCommentSchema.parse(minimal).assigneeIds).toEqual([]);
  });
  it("rejects duplicate user IDs after trimming, malformed timestamps, and assignment metadata passed as a user", () => {
    for (const assigneeIds of [["user-a", " user-a "], [{ userId: "user-a", roleAssignmentId: "role-1" }]])
      expect(CreateStudioReviewCommentSchema.safeParse({ ...input, assigneeIds }).success).toBe(false);
    expect(CreateStudioReviewCommentSchema.safeParse({ ...input, dueAt: "tomorrow" }).success).toBe(false);
    expect(CreateStudioReviewCommentSchema.safeParse({ ...input, severity: "critical" }).success).toBe(false);
  });
});

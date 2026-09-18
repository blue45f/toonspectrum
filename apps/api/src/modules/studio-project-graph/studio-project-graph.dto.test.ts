import { describe, expect, it } from "vitest";

import {
  CreateStudioExternalFileBindingSchema,
  UpdateStudioExternalFileBindingSchema,
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

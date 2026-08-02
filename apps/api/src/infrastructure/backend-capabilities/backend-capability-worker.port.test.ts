import { describe, expect, it } from "vitest";

import {
  BackendCapabilityWorkerCommandSchema,
  BackendCapabilityWorkerSubmissionSchema,
} from "./backend-capability-worker.port";

const sourceObject = {
  contractVersion: "toonspectrum.supabase-object-storage.v1",
  purpose: "source",
  digest: `sha256:${"a".repeat(64)}`,
  objectPath: `sha256/aa/${"a".repeat(64)}`,
  byteLength: 128,
  contentType: "image/png",
} as const;

describe("backend capability worker contract", () => {
  it("accepts a strict immutable thumbnail command", () => {
    expect(
      BackendCapabilityWorkerCommandSchema.parse({
        operation: "thumbnail.render",
        tenantId: "tenant-1",
        idempotencyKey: "thumbnail-command-1",
        sourceAssetId: "asset-1",
        sourceObject,
        format: "png",
        maxWidth: 512,
        maxHeight: 512,
      }),
    ).toMatchObject({ operation: "thumbnail.render", sourceObject });
  });

  it("rejects generated objects as thumbnail source authority", () => {
    expect(
      BackendCapabilityWorkerCommandSchema.safeParse({
        operation: "thumbnail.render",
        tenantId: "tenant-1",
        idempotencyKey: "thumbnail-command-1",
        sourceAssetId: "asset-1",
        sourceObject: { ...sourceObject, purpose: "derived" },
        format: "png",
        maxWidth: 512,
        maxHeight: 512,
      }).success,
    ).toBe(false);
  });

  it("keeps worker results canonical and strips no hidden execution data", () => {
    expect(
      BackendCapabilityWorkerSubmissionSchema.safeParse({
        outcome: "accepted",
        jobId: "job-1",
        providerToken: "forbidden",
      }).success,
    ).toBe(false);
  });
});

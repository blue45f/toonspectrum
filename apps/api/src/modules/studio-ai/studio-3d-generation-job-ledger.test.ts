import { describe, expect, it } from "vitest";

import {
  InMemoryStudio3dGenerationJobStore,
  Studio3dGenerationJobLedger,
  type Studio3dGenerationJobRequestSummary,
} from "./studio-3d-generation-job-ledger";

const request: Studio3dGenerationJobRequestSummary = {
  mode: "text-to-3d",
  promptHash: "a".repeat(64),
  inputContentHashes: [],
  provider: "hyper3d-rodin",
  model: "Rodin Gen-2.5",
  tier: "Gen-2.5-Medium",
  meshMode: "Raw",
  targetFaceCount: 20_000,
  material: "PBR",
  textureMode: "Standard",
  textureResolution: 2048,
  seed: 42,
  symmetry: true,
  transport: "server",
};

function fixture(nowMs = 1_000) {
  let now = nowMs;
  const store = new InMemoryStudio3dGenerationJobStore();
  const ledger = new Studio3dGenerationJobLedger(
    store,
    async () => ({
      maxConcurrentJobs: 2,
      dailyCreditBudget: 10,
      monthlyCreditBudget: 100,
    }),
    () => now,
  );
  return { ledger, store, setNow: (value: number) => { now = value; } };
}

describe("Studio 3D generation job ledger", () => {
  it("deduplicates an identical idempotent submission and rejects key reuse", async () => {
    const { ledger } = fixture();
    const first = await ledger.create({
      userId: "user-1",
      idempotencyKey: "request-1",
      request,
      estimatedCredits: 1,
    });
    const duplicate = await ledger.create({
      userId: "user-1",
      idempotencyKey: "request-1",
      request,
      estimatedCredits: 1,
    });
    expect(first.duplicate).toBe(false);
    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.record.id).toBe(first.record.id);
    await expect(
      ledger.create({
        userId: "user-1",
        idempotencyKey: "request-1",
        request: { ...request, seed: 43 },
        estimatedCredits: 1,
      }),
    ).rejects.toThrow(/different 3D request/u);
  });

  it("enforces concurrent and credit budgets under a user lock", async () => {
    const { ledger } = fixture();
    await ledger.create({ userId: "user-1", idempotencyKey: "a", request, estimatedCredits: 4 });
    await ledger.create({ userId: "user-1", idempotencyKey: "b", request, estimatedCredits: 4 });
    await expect(
      ledger.create({ userId: "user-1", idempotencyKey: "c", request, estimatedCredits: 1 }),
    ).rejects.toThrow(/concurrency/u);
  });

  it("keeps subscription identity separate from provider task identity", async () => {
    const { ledger } = fixture();
    const created = await ledger.create({
      userId: "user-1",
      idempotencyKey: "identity",
      request,
      estimatedCredits: 1,
    });
    const record = await ledger.recordProviderIdentity({
      jobId: created.record.id,
      expectedGeneration: 0,
      subscriptionKey: "secret-subscription-key",
      taskId: "task-uuid",
      requestId: "provider-request-id",
    });
    expect(record.providerTaskId).toBe("task-uuid");
    expect(record.providerSubscriptionKeyHash).not.toBe("secret-subscription-key");
    expect(record.providerRequestIdHash).not.toBe("provider-request-id");
  });

  it("fences stale transitions and rejects late artifacts after cancellation", async () => {
    const { ledger } = fixture();
    const created = await ledger.create({
      userId: "user-1",
      idempotencyKey: "cancel",
      request,
      estimatedCredits: 1,
    });
    const uploading = await ledger.transition({
      jobId: created.record.id,
      expectedGeneration: 0,
      state: "uploading",
    });
    await expect(
      ledger.transition({
        jobId: created.record.id,
        expectedGeneration: 0,
        state: "generating-geometry",
      }),
    ).rejects.toThrow(/stale/u);
    const cancellation = await ledger.requestCancellation(uploading.id);
    await expect(
      ledger.transition({
        jobId: cancellation.id,
        expectedGeneration: cancellation.generation,
        state: "generating-geometry",
      }),
    ).rejects.toThrow(/cannot advance/u);
  });

  it("internalizes validated bytes as an immutable revision and records actual cost", async () => {
    const { ledger } = fixture();
    let record = (
      await ledger.create({
        userId: "user-1",
        idempotencyKey: "ready",
        request,
        estimatedCredits: 2,
      })
    ).record;
    for (const state of [
      "uploading",
      "generating-geometry",
      "downloading",
      "validating",
      "importing",
    ] as const) {
      record = await ledger.transition({
        jobId: record.id,
        expectedGeneration: record.generation,
        state,
      });
    }
    const ready = await ledger.internalizeArtifact({
      jobId: record.id,
      expectedGeneration: record.generation,
      bytes: new Uint8Array(32).fill(7),
      mimeType: "model/gltf-binary",
      objectKey: "studio-3d/user-1/model.glb",
      validationVersion: "glb-validator-v2",
      modelId: "model-1",
      actualCredits: 1.75,
    });
    expect(ready.state).toBe("ready");
    expect(ready.actualCredits).toBe(1.75);
    expect(ready.artifactRevision?.contentHashSha256).toHaveLength(64);
  });

  it("expires overdue non-terminal jobs", async () => {
    const { ledger, setNow } = fixture(1_000);
    const created = await ledger.create({
      userId: "user-1",
      idempotencyKey: "expire",
      request,
      estimatedCredits: 1,
      deadlineMs: 60_000,
    });
    setNow(70_000);
    const expired = await ledger.expireOverdueJobs("user-1");
    expect(expired.map((record) => record.id)).toEqual([created.record.id]);
    expect(expired[0]?.state).toBe("expired");
  });
});

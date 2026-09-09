import { describe, expect, it, vi } from "vitest";

import {
  InMemoryStudio3dGenerationJobStore,
  Studio3dGenerationJobLedger,
} from "./studio-3d-generation-job-ledger";

describe("Studio 3D generation artifact atomicity", () => {
  it("does not expose ready before immutable artifact persistence succeeds", async () => {
    const store = new InMemoryStudio3dGenerationJobStore();
    const ledger = new Studio3dGenerationJobLedger(
      store,
      async () => ({
        maxConcurrentJobs: 2,
        dailyCreditBudget: 10,
        monthlyCreditBudget: 20,
      }),
      () => 1_000,
    );
    let record = (
      await ledger.create({
        userId: "user-1",
        idempotencyKey: "atomic",
        request: {
          mode: "text-to-3d",
          promptHash: "a".repeat(64),
          inputContentHashes: [],
          provider: "hyper3d-rodin",
          model: "Rodin Gen-2.5",
          tier: "Gen-2.5-Medium",
          transport: "server",
        },
        estimatedCredits: 1,
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
    const persistArtifact = vi.fn().mockRejectedValue(new Error("object store unavailable"));
    await expect(
      ledger.internalizeArtifact({
        jobId: record.id,
        expectedGeneration: record.generation,
        bytes: new Uint8Array(32).fill(1),
        mimeType: "model/gltf-binary",
        objectKey: "objects/model.glb",
        validationVersion: "v1",
        modelId: "model-1",
        actualCredits: 1,
        persistArtifact,
      }),
    ).rejects.toThrow("object store unavailable");
    expect((await ledger.require(record.id)).state).toBe("importing");
    expect(persistArtifact).toHaveBeenCalledTimes(1);
  });
});

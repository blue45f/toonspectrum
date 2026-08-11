import { describe, expect, it, vi } from "vitest";

import {
  StudioBg3dAtomicSpecialistError,
  runStudioBg3dAtomicSpecialist,
} from "./studio-bg3d-atomic-specialist-failover";
import { StudioBg3dBabylonSpecialistError } from
  "./studio-bg3d-babylon-specialist-runtime";
import {
  StudioBg3dRuntimeBoundaryError,
  StudioBg3dRuntimeAdapterRegistry,
  createStudioBg3dRuntimeSnapshot,
  type StudioBg3dRuntimeSnapshot,
  type StudioBg3dSpecialistRequest,
  type StudioBg3dSpecialistResult,
} from "./studio-bg3d-runtime-adapter";
import { DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT } from "./studio-bg3d-scene-document";

import type { StudioBg3dRuntimeId } from "./studio-bg3d-runtime-topology";

const snapshot = createStudioBg3dRuntimeSnapshot(
  DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
  new Map(),
);
const request = Object.freeze({ kind: "runtime-metrics" }) satisfies
  StudioBg3dSpecialistRequest;
const metrics = Object.freeze({
  kind: "metrics",
  values: Object.freeze({ ready: true }),
}) satisfies StudioBg3dSpecialistResult;
const invalidCandidatePlans: readonly (
  readonly { readonly runtimeId: StudioBg3dRuntimeId }[]
)[] = [
  [],
  [
    { runtimeId: "babylon-webgl-lab" },
    { runtimeId: "babylon-webgl-lab" },
  ],
  [
    { runtimeId: "three-webgl" },
    { runtimeId: "babylon-webgl-lab" },
    { runtimeId: "babylon-webgpu-lab" },
    { runtimeId: "playcanvas-webgl-lab" },
    { runtimeId: "playcanvas-webgpu-lab" },
  ],
  [{ runtimeId: "not-a-runtime" as StudioBg3dRuntimeId }],
];
const invalidCandidateCases = invalidCandidatePlans.map((candidates) => [candidates] as const);

function inputFor(
  run: (
    runtimeId: StudioBg3dRuntimeId,
    id: string,
    value: StudioBg3dRuntimeSnapshot,
    valueRequest: StudioBg3dSpecialistRequest,
    signal?: AbortSignal,
  ) => Promise<StudioBg3dSpecialistResult>,
  candidateIds: readonly StudioBg3dRuntimeId[] = [
    "babylon-webgpu-lab",
    "babylon-webgl-lab",
  ],
  requestValue: StudioBg3dSpecialistRequest = request,
) {
  const registry = new StudioBg3dRuntimeAdapterRegistry();
  for (const runtimeId of candidateIds) {
    registry.register({
      runtimeId,
      capabilities: new Set(),
      runIsolated: (job) =>
        run(runtimeId, job.id, job.snapshot, job.request, job.signal),
      dispose: () => undefined,
    });
  }
  return {
    registry,
    jobId: "capture-1",
    snapshot,
    request: requestValue,
    candidates: candidateIds.map((runtimeId) => ({ runtimeId })),
  } as const;
}

describe("Studio BG3D atomic specialist failover", () => {
  it("returns the first complete result without touching later candidates", async () => {
    const run = vi.fn().mockResolvedValue(metrics);

    const result = await runStudioBg3dAtomicSpecialist(inputFor(run));

    expect(run).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      runtimeId: "babylon-webgpu-lab",
      result: metrics,
      fallbackUsed: false,
      attempts: [{ runtimeId: "babylon-webgpu-lab", outcome: "succeeded" }],
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.attempts)).toBe(true);
  });

  it("uses a truthful sequential WebGPU to WebGL fallback after initialization failure", async () => {
    let firstAttemptSettled = false;
    const run = vi.fn(async (runtimeId: StudioBg3dRuntimeId) => {
      if (runtimeId === "babylon-webgpu-lab") {
        await Promise.resolve();
        firstAttemptSettled = true;
        throw new StudioBg3dBabylonSpecialistError("engine-init-failed");
      }
      expect(firstAttemptSettled).toBe(true);
      return metrics;
    });

    const result = await runStudioBg3dAtomicSpecialist(inputFor(run));

    expect(result.runtimeId).toBe("babylon-webgl-lab");
    expect(result.fallbackUsed).toBe(true);
    expect(result.attempts).toEqual([
      {
        runtimeId: "babylon-webgpu-lab",
        outcome: "failed",
        errorCode: "engine-init-failed",
      },
      { runtimeId: "babylon-webgl-lab", outcome: "succeeded" },
    ]);
    expect(run.mock.calls.map(([runtimeId]) => runtimeId)).toEqual([
      "babylon-webgpu-lab",
      "babylon-webgl-lab",
    ]);
  });

  it("keeps an authoritative WebGPU device loss eligible for isolated fallback", async () => {
    const run = vi.fn()
      .mockRejectedValueOnce(new StudioBg3dBabylonSpecialistError("device-lost"))
      .mockResolvedValueOnce(metrics);

    const result = await runStudioBg3dAtomicSpecialist(inputFor(run));

    expect(result.runtimeId).toBe("babylon-webgl-lab");
    expect(result.fallbackUsed).toBe(true);
    expect(result.attempts).toEqual([
      {
        errorCode: "device-lost",
        outcome: "failed",
        runtimeId: "babylon-webgpu-lab",
      },
      { outcome: "succeeded", runtimeId: "babylon-webgl-lab" },
    ]);
  });

  it.each([
    "adapter-not-registered",
    "capability-unavailable",
  ] as const)("falls back when the registry reports %s", async (code) => {
    const run = vi.fn()
      .mockRejectedValueOnce(new StudioBg3dRuntimeBoundaryError(code))
      .mockResolvedValueOnce(metrics);

    const result = await runStudioBg3dAtomicSpecialist(inputFor(run));

    expect(result.fallbackUsed).toBe(true);
    expect(result.attempts[0]).toMatchObject({ errorCode: code });
  });

  it.each([
    "renderer-unavailable",
    "unsupported-artifact",
    "unsupported-scene-feature",
  ] as const)("can advance to an equivalent engine after %s", async (code) => {
    const run = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error(code), { code }))
      .mockResolvedValueOnce(metrics);

    const result = await runStudioBg3dAtomicSpecialist(inputFor(run));

    expect(result.runtimeId).toBe("babylon-webgl-lab");
    expect(result.attempts[0]).toMatchObject({ errorCode: code });
  });

  it("never retries an invalid result and exposes no partial result", async () => {
    const partialResult = {
      kind: "capture",
      width: 1,
      height: 1,
      rgba: new Uint8Array([255]),
    };
    const run = vi.fn()
      .mockResolvedValueOnce(partialResult as unknown as StudioBg3dSpecialistResult)
      .mockResolvedValueOnce(metrics);

    await expect(runStudioBg3dAtomicSpecialist(inputFor(run))).rejects.toMatchObject({
      code: "terminal-attempt-failed",
      attempts: [{
        runtimeId: "babylon-webgpu-lab",
        outcome: "failed",
        errorCode: "unknown",
      }],
    });
    expect(run).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(partialResult)).not.toContain("ready");
  });

  it("treats caller abort as terminal and does not start another engine", async () => {
    const controller = new AbortController();
    const run = vi.fn(async () => {
      controller.abort();
      throw new StudioBg3dRuntimeBoundaryError("aborted");
    });

    await expect(runStudioBg3dAtomicSpecialist({
      ...inputFor(run),
      signal: controller.signal,
    })).rejects.toMatchObject({
      code: "aborted",
      attempts: [{
        runtimeId: "babylon-webgpu-lab",
        outcome: "aborted",
      }],
    });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("reports a pre-abort without invoking an engine", async () => {
    const controller = new AbortController();
    controller.abort();
    const run = vi.fn().mockResolvedValue(metrics);

    await expect(runStudioBg3dAtomicSpecialist({
      ...inputFor(run),
      signal: controller.signal,
    })).rejects.toMatchObject({
      code: "aborted",
      attempts: [],
    });
    expect(run).not.toHaveBeenCalled();
  });

  it("reports every unavailable candidate without relabeling the failed backend", async () => {
    const run = vi.fn()
      .mockRejectedValueOnce(new StudioBg3dBabylonSpecialistError("context-lost"))
      .mockRejectedValueOnce(new StudioBg3dBabylonSpecialistError("binding-load-failed"));

    let captured: unknown;
    try {
      await runStudioBg3dAtomicSpecialist(inputFor(run));
    } catch (error) {
      captured = error;
    }

    expect(captured).toBeInstanceOf(StudioBg3dAtomicSpecialistError);
    expect(captured).toMatchObject({
      code: "all-candidates-failed",
      attempts: [
        {
          runtimeId: "babylon-webgpu-lab",
          outcome: "failed",
          errorCode: "context-lost",
        },
        {
          runtimeId: "babylon-webgl-lab",
          outcome: "failed",
          errorCode: "binding-load-failed",
        },
      ],
    });
  });

  it.each(invalidCandidateCases)(
    "rejects invalid candidate plans before running an adapter",
    async (candidates) => {
      const run = vi.fn().mockResolvedValue(metrics);

      await expect(runStudioBg3dAtomicSpecialist({
        ...inputFor(run),
        candidates,
      })).rejects.toMatchObject({ code: "invalid-candidates" });
      expect(run).not.toHaveBeenCalled();
    },
  );

  it("rejects a candidate whose runtimeId is exposed through a getter", async () => {
    const run = vi.fn().mockResolvedValue(metrics);
    const candidate = Object.defineProperty({}, "runtimeId", {
      enumerable: true,
      get: () => {
        throw new Error("must not execute");
      },
    });

    await expect(runStudioBg3dAtomicSpecialist({
      ...inputFor(run),
      candidates: [candidate] as unknown as readonly [{
        readonly runtimeId: StudioBg3dRuntimeId;
      }],
    })).rejects.toMatchObject({ code: "invalid-candidates" });
    expect(run).not.toHaveBeenCalled();
  });

  it("classifies a throwing error-code getter as an unknown terminal failure", async () => {
    const failure = Object.defineProperty(new Error("opaque"), "code", {
      get: () => {
        throw new Error("must not escape");
      },
    });
    const run = vi.fn().mockRejectedValue(failure);

    await expect(runStudioBg3dAtomicSpecialist(inputFor(run))).rejects.toMatchObject({
      code: "terminal-attempt-failed",
      attempts: [{
        runtimeId: "babylon-webgpu-lab",
        outcome: "failed",
        errorCode: "unknown",
      }],
    });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("snapshots one immutable request before any fallback attempt", async () => {
    const mutableRequest = { kind: "runtime-metrics" } as
      StudioBg3dSpecialistRequest & { kind: string };
    const observedKinds: string[] = [];
    const run = vi.fn(async (
      runtimeId: StudioBg3dRuntimeId,
      _id: string,
      _snapshot: StudioBg3dRuntimeSnapshot,
      valueRequest: StudioBg3dSpecialistRequest,
    ) => {
      observedKinds.push(valueRequest.kind);
      if (runtimeId === "babylon-webgpu-lab") {
        mutableRequest.kind = "capture";
        throw new StudioBg3dBabylonSpecialistError("engine-init-failed");
      }
      return metrics;
    });

    const result = await runStudioBg3dAtomicSpecialist(
      inputFor(run, undefined, mutableRequest),
    );

    expect(result.runtimeId).toBe("babylon-webgl-lab");
    expect(observedKinds).toEqual(["runtime-metrics", "runtime-metrics"]);
  });

  it("settles three failed attempts sequentially before the fourth succeeds", async () => {
    const candidateIds = [
      "babylon-webgpu-lab",
      "babylon-webgl-lab",
      "playcanvas-webgpu-lab",
      "playcanvas-webgl-lab",
    ] as const;
    const settled: StudioBg3dRuntimeId[] = [];
    const run = vi.fn(async (runtimeId: StudioBg3dRuntimeId) => {
      expect(settled).toEqual(candidateIds.slice(0, settled.length));
      if (runtimeId !== candidateIds[3]) {
        await Promise.resolve();
        settled.push(runtimeId);
        throw Object.assign(new Error("renderer-unavailable"), {
          code: "renderer-unavailable",
        });
      }
      return metrics;
    });

    const result = await runStudioBg3dAtomicSpecialist(
      inputFor(run, candidateIds),
    );

    expect(result.runtimeId).toBe(candidateIds[3]);
    expect(result.attempts).toHaveLength(4);
    expect(result.fallbackUsed).toBe(true);
  });
});

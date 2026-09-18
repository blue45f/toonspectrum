import { describe, expect, it } from "vitest";

import {
  evaluateStudioScene3dSoak,
  planStudioScene3dRuntimeRecovery,
} from "./studio-scene3d-runtime-recovery";

const SOURCE_HASH = `sha256:${"a".repeat(64)}` as const;

function failure(
  patch: Partial<Parameters<typeof planStudioScene3dRuntimeRecovery>[0]> = {},
): Parameters<typeof planStudioScene3dRuntimeRecovery>[0] {
  return {
    kind: "webgpu-device-lost",
    selectedRuntime: "three-webgpu",
    attempt: 0,
    documentId: "scene-a",
    documentRevision: 4,
    documentSourceHash: SOURCE_HASH,
    recoverable: true,
    ...patch,
  };
}

describe("Studio Scene3D runtime recovery", () => {
  it("retries the exact WebGPU authority once, then requires explicit WebGL2 consent", () => {
    expect(planStudioScene3dRuntimeRecovery(failure())).toMatchObject({
      action: "retry-selected-runtime",
      preservesDocumentAuthority: true,
      requiresUserConfirmation: false,
      mayChangeSelectedRuntime: false,
    });
    expect(planStudioScene3dRuntimeRecovery(failure({ attempt: 1 }))).toMatchObject({
      action: "offer-explicit-webgl2-switch",
      preservesDocumentAuthority: true,
      requiresUserConfirmation: true,
      mayChangeSelectedRuntime: true,
    });
  });

  it("isolates Babylon and WebGL context failures from document ownership", () => {
    expect(planStudioScene3dRuntimeRecovery(failure({
      kind: "babylon-specialist",
    }))).toMatchObject({
      action: "disable-specialist-and-continue",
      preservesDocumentAuthority: true,
      mayChangeSelectedRuntime: false,
    });
    expect(planStudioScene3dRuntimeRecovery(failure({
      kind: "webgl-context-lost",
      selectedRuntime: "three-webgl2",
      contextRestored: false,
    }))).toMatchObject({
      action: "await-webgl-context-restore",
      retryAfterMs: 250,
    });
    expect(planStudioScene3dRuntimeRecovery(failure({
      kind: "webgl-context-lost",
      selectedRuntime: "three-webgl2",
      contextRestored: true,
    }))).toMatchObject({
      action: "recreate-webgl-runtime",
      retryAfterMs: 0,
    });
  });

  it("passes a stable 30 minute soak and reports each regression gate", () => {
    const stable = evaluateStudioScene3dSoak({
      samples: Array.from({ length: 31 }, (_, index) => ({
        elapsedMs: index * 60_000,
        frameTimeMs: index === 30 ? 22 : 14 + (index % 3),
        jsHeapBytes: 100_000_000 + index * 100_000,
        gpuResourceCount: 120 + Math.floor(index / 15),
        documentRevision: 8 + Math.floor(index / 10),
      })),
    });
    expect(stable).toMatchObject({
      passed: true,
      durationMs: 1_800_000,
      revisionMovedBackwards: false,
    });

    const regressed = evaluateStudioScene3dSoak({
      samples: [
        { elapsedMs: 0, frameTimeMs: 60, jsHeapBytes: 0, gpuResourceCount: 0, documentRevision: 5 },
        { elapsedMs: 1_000, frameTimeMs: 80, jsHeapBytes: 50_000_000, gpuResourceCount: 20, documentRevision: 4 },
      ],
    });
    expect(regressed.passed).toBe(false);
    expect(regressed.failures).toEqual(expect.arrayContaining([
      "soak-duration-too-short",
      "frame-p95-exceeded",
      "heap-growth-exceeded",
      "gpu-resource-growth-exceeded",
      "document-revision-moved-backwards",
    ]));
  });
});

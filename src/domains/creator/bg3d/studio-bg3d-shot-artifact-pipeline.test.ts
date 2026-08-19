import { describe, expect, it, vi } from "vitest";

import { StudioBg3dLtRenderWorkerError } from "./studio-bg3d-lt-render-worker-client";
import { DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT } from "./studio-bg3d-scene-document";
import {
  buildStudioBg3dShotArtifacts,
  type StudioBg3dShotArtifactPipelineDependencies,
  type StudioBg3dShotArtifactPipelineInput,
} from "./studio-bg3d-shot-artifact-pipeline";
import { STUDIO_BG3D_SHOT_BATCH_PASSES } from "./studio-bg3d-shot-batch-pass-catalog";
import { StudioBg3dShotPngWorkerError } from "./studio-bg3d-shot-png-worker-client";

import type {
  StudioBg3dLtRasterLayer,
  StudioBg3dLtRenderResult,
} from "./studio-bg3d-lt-render";
import type { StudioBg3dShotBatchPlannedShot } from "./studio-bg3d-shot-batch-plan";

function pngBlob(size: number): Blob {
  return new Blob([new Uint8Array(size)], { type: "image/png" });
}

function psdBlob(size: number): Blob {
  return new Blob([new Uint8Array(size)], { type: "image/vnd.adobe.photoshop" });
}

function rasterLayer(
  role: StudioBg3dLtRasterLayer["role"],
  value: number,
  width = 1,
  height = 1,
): StudioBg3dLtRasterLayer {
  const data = new Uint8ClampedArray(width * height * 4);
  data.fill(value);
  return { role, width, height, data };
}

function plannedShot(width = 1, height = 1): StudioBg3dShotBatchPlannedShot {
  return {
    shotId: "shot-1",
    shotName: "첫 컷",
    shotIndex: 0,
    capture: {
      width,
      height,
      requestedHeight: height * 2,
      wasReduced: true,
      includeDepth: true,
      shadows: false,
      shadowMapSize: 0,
      background: { color: "#ffffff", alpha: 1 },
    },
    files: [],
  };
}

function renderedResult(
  layers: readonly StudioBg3dLtRasterLayer[] = [rasterLayer("color", 80)],
  width = 1,
  height = 1,
): StudioBg3dLtRenderResult {
  return { width, height, layers };
}

function dependencies(
  overrides: Partial<StudioBg3dShotArtifactPipelineDependencies> = {},
): StudioBg3dShotArtifactPipelineDependencies {
  return {
    renderLtInWorker: vi.fn(async () => renderedResult()),
    renderLtSynchronously: vi.fn(() => renderedResult()),
    createDepthLayer: vi.fn((width, height) => rasterLayer("color", 160, width, height)),
    encodePngInWorker: vi.fn(async () => pngBlob(1)),
    encodePngOnMainThread: vi.fn(async () => pngBlob(1)),
    admitPsdLayers: vi.fn(() => ({ ok: true, width: 1, height: 1 } as const)),
    buildLayeredPsdInWorker: vi.fn(async () => psdBlob(1)),
    workersAvailable: vi.fn(() => true),
    maxImageBytes: 1_000,
    maxTotalBytes: 10_000,
    ...overrides,
  };
}

function pipelineInput(
  overrides: Partial<StudioBg3dShotArtifactPipelineInput> = {},
): StudioBg3dShotArtifactPipelineInput {
  return {
    shot: plannedShot(),
    captured: {
      width: 1,
      height: 1,
      rgba: new Uint8Array([10, 20, 30, 255]),
      depth: new Float32Array([0.5]),
    },
    settings: {
      line: DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.output.line,
      tone: DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.output.tone,
    },
    passes: STUDIO_BG3D_SHOT_BATCH_PASSES,
    includeLayeredPsd: false,
    committedArtifactBytes: 0,
    ...overrides,
  };
}

describe("Studio BG3D shot artifact pipeline", () => {
  it("stages PNG passes in frozen plan order without mutating captured beauty pixels", async () => {
    const renderedLayers = [
      rasterLayer("color", 60),
      rasterLayer("texture-line", 120),
      rasterLayer("main-line", 180),
    ] as const;
    const encodedLayers: Array<readonly StudioBg3dLtRasterLayer[]> = [];
    const deps = dependencies({
      renderLtInWorker: vi.fn(async () => renderedResult(renderedLayers)),
      encodePngInWorker: vi.fn(async (layers) => {
        encodedLayers.push(layers);
        return pngBlob(1);
      }),
    });
    const capturedRgba = new Uint8Array([10, 20, 30, 255]);

    const result = await buildStudioBg3dShotArtifacts(
      pipelineInput({
        captured: {
          width: 1,
          height: 1,
          rgba: capturedRgba,
          depth: new Float32Array([0.5]),
        },
      }),
      deps,
    );

    expect(result.images.map((image) => image.pass)).toEqual([
      "beauty",
      "lt-composite",
      "color",
      "texture-line",
      "main-line",
      "depth",
    ]);
    expect(result.skippedArtifacts).toEqual([{
      shotId: "shot-1",
      shotName: "첫 컷",
      pass: "tone",
      reason: "disabled",
    }]);
    expect(result.artifactBytes).toBe(6);
    expect(result.images.every((image) => image.requestedHeight === 2)).toBe(true);
    expect(result.images.every((image) => image.wasReduced === true)).toBe(true);
    expect(encodedLayers[0]?.[0]?.data).toEqual(new Uint8ClampedArray(capturedRgba));
    expect(encodedLayers[0]?.[0]?.data).not.toBe(capturedRgba);
    expect(capturedRgba).toEqual(new Uint8Array([10, 20, 30, 255]));
  });

  it("distinguishes disabled outputs from configured outputs that are unavailable", async () => {
    const deps = dependencies({
      renderLtInWorker: vi.fn(async () => renderedResult([])),
    });
    const passes = [
      "lt-composite",
      "color",
      "tone",
      "texture-line",
      "main-line",
      "depth",
    ] as const;

    const configured = await buildStudioBg3dShotArtifacts(
      pipelineInput({
        captured: { width: 1, height: 1, rgba: new Uint8Array(4) },
        passes,
      }),
      deps,
    );
    expect(configured.skippedArtifacts.map(({ pass, reason }) => [pass, reason])).toEqual([
      ["lt-composite", "unavailable"],
      ["color", "unavailable"],
      ["tone", "disabled"],
      ["texture-line", "unavailable"],
      ["main-line", "unavailable"],
      ["depth", "unavailable"],
    ]);

    const disabled = await buildStudioBg3dShotArtifacts(
      pipelineInput({
        captured: { width: 1, height: 1, rgba: new Uint8Array(4) },
        settings: {
          line: {
            ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.output.line,
            enabled: false,
          },
          tone: {
            ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.output.tone,
            mode: "none",
          },
        },
        passes,
      }),
      deps,
    );
    expect(disabled.skippedArtifacts.map(({ pass, reason }) => [pass, reason])).toEqual([
      ["lt-composite", "disabled"],
      ["color", "disabled"],
      ["tone", "disabled"],
      ["texture-line", "disabled"],
      ["main-line", "disabled"],
      ["depth", "unavailable"],
    ]);
  });

  it("uses the bounded sync LT fallback only for an unavailable worker", async () => {
    const workerUnavailable = new StudioBg3dLtRenderWorkerError("worker-unavailable");
    const renderLtSynchronously = vi.fn(() => renderedResult());
    const deps = dependencies({
      renderLtInWorker: vi.fn(async () => { throw workerUnavailable; }),
      renderLtSynchronously,
    });

    await expect(buildStudioBg3dShotArtifacts(
      pipelineInput({ passes: ["beauty"] }),
      deps,
    )).resolves.toMatchObject({ artifactBytes: 1 });
    expect(renderLtSynchronously).toHaveBeenCalledOnce();

    const timeout = new StudioBg3dLtRenderWorkerError("timeout");
    const timeoutDeps = dependencies({
      renderLtInWorker: vi.fn(async () => { throw timeout; }),
      renderLtSynchronously: vi.fn(() => renderedResult()),
    });
    await expect(buildStudioBg3dShotArtifacts(
      pipelineInput({ passes: ["beauty"] }),
      timeoutDeps,
    )).rejects.toBe(timeout);
    expect(timeoutDeps.renderLtSynchronously).not.toHaveBeenCalled();
  });

  it("does not run the sync LT fallback above its pixel budget", async () => {
    const width = 1_025;
    const height = 1_024;
    const workerUnavailable = new StudioBg3dLtRenderWorkerError("worker-unavailable");
    const deps = dependencies({
      renderLtInWorker: vi.fn(async () => { throw workerUnavailable; }),
      renderLtSynchronously: vi.fn(() => renderedResult([], width, height)),
    });

    await expect(buildStudioBg3dShotArtifacts(
      pipelineInput({
        shot: plannedShot(width, height),
        captured: {
          width,
          height,
          rgba: new Uint8Array(width * height * 4),
        },
        passes: ["beauty"],
      }),
      deps,
    )).rejects.toBe(workerUnavailable);
    expect(deps.renderLtSynchronously).not.toHaveBeenCalled();
  });

  it("uses the bounded main-thread PNG fallback only for Worker or OffscreenCanvas creation unavailability", async () => {
    for (const code of ["worker-unavailable", "offscreen-unavailable"] as const) {
      const unavailable = new StudioBg3dShotPngWorkerError(code);
      const encodePngOnMainThread = vi.fn(async () => pngBlob(3));
      const deps = dependencies({
        encodePngInWorker: vi.fn(async () => { throw unavailable; }),
        encodePngOnMainThread,
      });

      const result = await buildStudioBg3dShotArtifacts(
        pipelineInput({ passes: ["beauty"] }),
        deps,
      );

      expect(result.artifactBytes).toBe(3);
      expect(encodePngOnMainThread).toHaveBeenCalledOnce();
      expect(encodePngOnMainThread).toHaveBeenCalledWith(
        expect.any(Array),
        { signal: undefined, timeoutMs: 20_000 },
      );
    }
  });

  it("keeps PNG protocol, runtime, timeout, and cancellation failures terminal", async () => {
    for (const code of [
      "invalid-request",
      "protocol",
      "encode-failed",
      "timeout",
      "worker-failed",
      "aborted",
    ] as const) {
      const failure = new StudioBg3dShotPngWorkerError(code);
      const encodePngOnMainThread = vi.fn(async () => pngBlob(1));
      const deps = dependencies({
        encodePngInWorker: vi.fn(async () => { throw failure; }),
        encodePngOnMainThread,
      });

      await expect(buildStudioBg3dShotArtifacts(
        pipelineInput({ passes: ["beauty"] }),
        deps,
      )).rejects.toBe(failure);
      expect(encodePngOnMainThread).not.toHaveBeenCalled();
    }
  });

  it("does not enter the PNG main-thread fallback above its pixel budget", async () => {
    const width = 1_025;
    const height = 1_024;
    const unavailable = new StudioBg3dShotPngWorkerError("worker-unavailable");
    const deps = dependencies({
      renderLtInWorker: vi.fn(async () => renderedResult([], width, height)),
      encodePngInWorker: vi.fn(async () => { throw unavailable; }),
      encodePngOnMainThread: vi.fn(async () => pngBlob(1)),
    });

    await expect(buildStudioBg3dShotArtifacts(
      pipelineInput({
        shot: plannedShot(width, height),
        captured: {
          width,
          height,
          rgba: new Uint8Array(width * height * 4),
        },
        passes: ["beauty"],
      }),
      deps,
    )).rejects.toBe(unavailable);
    expect(deps.encodePngOnMainThread).not.toHaveBeenCalled();
  });

  it("rejects PNG budget overflow before a shot can be committed", async () => {
    const perImageDeps = dependencies({
      encodePngInWorker: vi.fn(async () => pngBlob(4)),
      maxImageBytes: 3,
    });
    await expect(buildStudioBg3dShotArtifacts(
      pipelineInput({ passes: ["beauty"] }),
      perImageDeps,
    )).rejects.toBeInstanceOf(RangeError);

    const aggregateDeps = dependencies({
      encodePngInWorker: vi.fn(async () => pngBlob(2)),
      maxTotalBytes: 5,
    });
    await expect(buildStudioBg3dShotArtifacts(
      pipelineInput({
        passes: ["beauty"],
        committedArtifactBytes: 4,
      }),
      aggregateDeps,
    )).rejects.toBeInstanceOf(RangeError);
  });

  it("reserves required PNG bytes before degrading an optional PSD on budget", async () => {
    const deps = dependencies({
      encodePngInWorker: vi.fn(async () => pngBlob(4)),
      buildLayeredPsdInWorker: vi.fn(async () => psdBlob(2)),
      maxTotalBytes: 5,
    });

    const result = await buildStudioBg3dShotArtifacts(
      pipelineInput({ passes: ["beauty"], includeLayeredPsd: true }),
      deps,
    );

    expect(result.images).toHaveLength(1);
    expect(result.layeredPsds).toEqual([]);
    expect(result.psdFallbacks).toEqual([{
      shotId: "shot-1",
      shotName: "첫 컷",
      reason: "budget",
    }]);
    expect(result.artifactBytes).toBe(4);
  });

  it("propagates PSD aborts while converting other worker failures to a fallback", async () => {
    const abort = Object.assign(new Error("cancelled"), { name: "AbortError" });
    const abortDeps = dependencies({
      buildLayeredPsdInWorker: vi.fn(async () => { throw abort; }),
    });
    await expect(buildStudioBg3dShotArtifacts(
      pipelineInput({ passes: ["beauty"], includeLayeredPsd: true }),
      abortDeps,
    )).rejects.toBe(abort);

    const failureDeps = dependencies({
      buildLayeredPsdInWorker: vi.fn(async () => { throw new Error("worker failed"); }),
    });
    const failed = await buildStudioBg3dShotArtifacts(
      pipelineInput({ passes: ["beauty"], includeLayeredPsd: true }),
      failureDeps,
    );
    expect(failed.psdFallbacks).toEqual([{
      shotId: "shot-1",
      shotName: "첫 컷",
      reason: "worker-failed",
    }]);

    const unavailableDeps = dependencies({ workersAvailable: vi.fn(() => false) });
    const unavailable = await buildStudioBg3dShotArtifacts(
      pipelineInput({ passes: ["beauty"], includeLayeredPsd: true }),
      unavailableDeps,
    );
    expect(unavailable.psdFallbacks[0]?.reason).toBe("unavailable");
    expect(unavailableDeps.buildLayeredPsdInWorker).not.toHaveBeenCalled();
  });
});

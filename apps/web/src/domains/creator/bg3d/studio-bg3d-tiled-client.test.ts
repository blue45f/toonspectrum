import { afterEach, describe, expect, it, vi } from "vitest";
import { buildStudioBg3dTiledImages } from "./studio-bg3d-tiled-artifact-client";
import { StudioBg3dTiledArtifactProcessor } from "./studio-bg3d-tiled-artifact-processor";
import {
  STUDIO_BG3D_CAPTURE_PROFILE_RGBA8_DEPTH_V1,
  STUDIO_BG3D_CAPTURE_NORMAL_PROFILE_V1,
} from "./studio-bg3d-capture-adapter";
import { DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT } from "./studio-bg3d-scene-document";
import { STUDIO_BG3D_TILE_PROFILE } from "./studio-bg3d-tile-plan";
import {
  resolveStudioBg3dBatchTileShape,
  studioBg3dBatchNeedsTiles,
  studioBg3dBatchOutputPixelBudget,
  studioBg3dTilePipelineId,
} from "./studio-bg3d-tiled-batch-policy";
import type { StudioBg3dTiledRequest } from "./studio-bg3d-tiled-artifact-contract";
import type { StudioBg3dTiledWorkerLike } from "./studio-bg3d-tiled-artifact-client";
import type {
  StudioBg3dCaptureAdapter,
  StudioBg3dCaptureRequest,
  StudioBg3dCapturedRaster,
} from "./studio-bg3d-capture-adapter";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { resolve, promise };
}
class WorkerFixture implements StudioBg3dTiledWorkerLike {
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent<unknown>) => void) | null = null;
  processor: StudioBg3dTiledArtifactProcessor | undefined;
  terminated = false;
  requests: StudioBg3dTiledRequest[] = [];
  intercept: ((request: StudioBg3dTiledRequest) => boolean) | undefined;
  terminate = vi.fn(() => {
    this.terminated = true;
    void this.processor?.abort();
  });
  send(value: unknown) {
    if (!this.terminated)
      this.onmessage?.({ data: value } as MessageEvent<unknown>);
  }
  postMessage(value: StudioBg3dTiledRequest) {
    this.requests.push(value);
    if (this.intercept?.(value)) return;
    void Promise.resolve()
      .then(async () => {
        if (this.terminated) return;
        if (value.kind === "init") {
          this.processor = new StudioBg3dTiledArtifactProcessor(value.options);
          this.send({ version: 1, id: value.id, kind: "ready" });
        } else if (value.kind === "tile") {
          await this.processor!.append(value.index, value.raster);
          this.send({
            version: 1,
            id: value.id,
            kind: "ack",
            index: value.index,
          });
        } else
          this.send({
            version: 1,
            id: value.id,
            kind: "result",
            result: await this.processor!.finish(),
          });
      })
      .catch((error: unknown) =>
        this.send({
          version: 1,
          id: value.id,
          kind: "error",
          message: String(error),
        }),
      );
  }
}
function fixture() {
  const worker = new WorkerFixture();
  const dispose = vi.fn();
  const rgba = (
    request: StudioBg3dCaptureRequest,
  ): StudioBg3dCapturedRaster => ({
    width: request.width,
    height: request.height,
    rgba: new Uint8Array(request.width * request.height * 4).fill(255),
  });
  const capture = vi.fn(async (request: StudioBg3dCaptureRequest) =>
    rgba(request),
  );
  const adapter: StudioBg3dCaptureAdapter = {
    backend: "three-webgl",
    engineId: "three",
    engineVersion: "184",
    implementationRevision: "fixture-v1",
    graphicsApi: "webgl2",
    profileId: STUDIO_BG3D_CAPTURE_PROFILE_RGBA8_DEPTH_V1,
    getSourceSize: () => ({ width: 51, height: 43 }),
    capture: async () => {
      throw new Error("Unexpected untiled path");
    },
    createTiledCapture: () => ({
      profile: STUDIO_BG3D_TILE_PROFILE,
      capture,
      dispose,
    }),
  };
  const input = {
    adapter,
    options: {
      width: 51,
      height: 43,
      tileWidth: 31,
      bandHeight: 31,
      settings: {
        line: {
          ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.output.line,
          enabled: false,
        },
        tone: {
          ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.output.tone,
          mode: "none" as const,
        },
      },
      passes: ["beauty"] as const,
    },
    background: { color: "#000000", alpha: 0 },
    includeDepth: false,
    includeNormals: false,
    workerFactory: () => worker,
  };
  return { input, worker, dispose, capture, rgba };
}
afterEach(() => vi.useRealTimers());
describe("tiled capture and encoder ownership", () => {
  it("uses one sequential capture and acknowledgement per tile, then releases the session", async () => {
    const f = fixture();
    const progress: number[] = [];
    const result = await buildStudioBg3dTiledImages({
      ...f.input,
      onProgress: (n) => progress.push(n),
    });
    expect(result.images).toHaveLength(1);
    expect(progress).toEqual([1, 2, 3, 4]);
    expect(f.capture).toHaveBeenCalledTimes(4);
    expect(f.worker.requests.map((r) => r.kind)).toEqual([
      "init",
      "tile",
      "tile",
      "tile",
      "tile",
      "finish",
    ]);
    expect(f.dispose).toHaveBeenCalled();
    expect(f.worker.terminate).toHaveBeenCalled();
  });
  it("does not issue another GPU readback before the prior tile is acknowledged", async () => {
    const f = fixture();
    const controller = new AbortController();
    f.worker.intercept = (request) => request.kind === "tile";
    const job = buildStudioBg3dTiledImages({
      ...f.input,
      signal: controller.signal,
    });
    const rejected = expect(job).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() =>
      expect(f.worker.requests.some((r) => r.kind === "tile")).toBe(true),
    );
    expect(f.capture).toHaveBeenCalledTimes(1);
    controller.abort();
    await rejected;
    expect(f.worker.requests.some((r) => r.kind === "finish")).toBe(false);
  });
  it("cancels during GPU work without publishing or submitting more tiles", async () => {
    const f = fixture();
    const pending = deferred<StudioBg3dCapturedRaster>();
    f.capture.mockImplementationOnce(() => pending.promise);
    const controller = new AbortController();
    const job = buildStudioBg3dTiledImages({
      ...f.input,
      signal: controller.signal,
    });
    const rejected = expect(job).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(f.capture).toHaveBeenCalled());
    controller.abort();
    await rejected;
    pending.resolve(f.rgba(f.capture.mock.calls[0]![0]));
    await Promise.resolve();
    expect(f.dispose).toHaveBeenCalled();
    expect(f.worker.requests).toHaveLength(1);
  });
  it("refuses stale owner checkpoints instead of partially publishing a PNG", async () => {
    const f = fixture();
    let current = true;
    await expect(
      buildStudioBg3dTiledImages({
        ...f.input,
        assertCurrent: () => {
          if (!current) throw new Error("Owner changed");
        },
        onProgress: () => {
          current = false;
        },
      }),
    ).rejects.toThrow("Owner changed");
    expect(f.capture).toHaveBeenCalledTimes(1);
    expect(f.worker.requests.some((r) => r.kind === "finish")).toBe(false);
    expect(f.dispose).toHaveBeenCalled();
  });
  it.each(["wrong-id", "wrong-version", "wrong-kind", "wrong-index"])(
    "rejects %s Worker replies",
    async (reason) => {
      const f = fixture();
      f.worker.intercept = (r) => {
        if (r.kind !== "tile") return false;
        queueMicrotask(() =>
          f.worker.send({
            version: reason === "wrong-version" ? 2 : 1,
            id: reason === "wrong-id" ? r.id + 1 : r.id,
            kind: reason === "wrong-kind" ? "result" : "ack",
            index: reason === "wrong-index" ? r.index + 1 : r.index,
          }),
        );
        return true;
      };
      await expect(buildStudioBg3dTiledImages(f.input)).rejects.toThrow(
        /response/,
      );
      expect(f.worker.terminate).toHaveBeenCalled();
      expect(f.capture).toHaveBeenCalledTimes(1);
    },
  );
  it("times out a silent startup without allocating a capture tile", async () => {
    vi.useFakeTimers();
    const f = fixture();
    f.worker.intercept = () => true;
    const job = buildStudioBg3dTiledImages({ ...f.input, timeoutMs: 100 });
    const rejected = expect(job).rejects.toMatchObject({
      name: "TimeoutError",
    });
    await vi.advanceTimersByTimeAsync(100);
    await rejected;
    expect(f.capture).not.toHaveBeenCalled();
    expect(f.dispose).toHaveBeenCalled();
  });
  it("keeps caller options immutable while awaiting GPU/Worker work", async () => {
    const f = fixture();
    const gate = deferred<void>();
    const job = buildStudioBg3dTiledImages({
      ...f.input,
      assertCurrent: () => gate.promise,
    });
    f.input.options.settings.line.color = "#ffffff";
    f.input.background.color = "#ffffff";
    gate.resolve();
    await job;
    const request = f.worker.requests[0];
    expect(request.kind).toBe("init");
    if (request.kind === "init")
      expect(request.options.settings.line.color).not.toBe("#ffffff");
    expect(f.capture.mock.calls[0]![0].background.color).toBe("#000000");
  });
  it("rejects malformed completed PNGs before callers can commit artifacts", async () => {
    const f = fixture();
    f.worker.intercept = (r) => {
      if (r.kind !== "finish") return false;
      queueMicrotask(() =>
        f.worker.send({
          version: 1,
          id: r.id,
          kind: "result",
          result: {
            images: [
              {
                pass: "beauty",
                png: new Blob([new Uint8Array(80)], { type: "image/png" }),
              },
            ],
            skipped: [],
          },
        }),
      );
      return true;
    };
    await expect(buildStudioBg3dTiledImages(f.input)).rejects.toThrow(
      "PNG header",
    );
  });
  it("does not acquire a renderer or Worker for an already cancelled job", async () => {
    const f = fixture();
    const controller = new AbortController();
    controller.abort();
    await expect(
      buildStudioBg3dTiledImages({ ...f.input, signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(f.capture).not.toHaveBeenCalled();
    expect(f.worker.requests).toHaveLength(0);
  });
});
describe("separate output and per-tile device budgets", () => {
  it("admits 4K output without raising a normal-inclusive single-raster budget", () => {
    const f = fixture();
    f.input.adapter = {
      ...f.input.adapter,
      normalProfile: STUDIO_BG3D_CAPTURE_NORMAL_PROFILE_V1,
    };
    expect(studioBg3dBatchOutputPixelBudget(f.input.adapter, 76800)).toBe(
      4096 ** 2,
    );
    expect(
      studioBg3dBatchNeedsTiles(f.input.adapter, 4096 ** 2, 76800, true),
    ).toBe(true);
    const legacy = { ...f.input.adapter, createTiledCapture: undefined };
    expect(studioBg3dBatchOutputPixelBudget(legacy, 16_777_216)).toBe(
      4_194_304,
    );
  });
  it.each([76800, 100000, 1000000, 4194304])(
    "fits guarded tile area within actual profile %i",
    (budget) => {
      const shape = resolveStudioBg3dBatchTileShape(budget);
      expect(
        (shape.tileWidth + 24) * (shape.bandHeight + 24),
      ).toBeLessThanOrEqual(budget);
      expect(studioBg3dTilePipelineId(budget)).toContain(
        `${shape.tileWidth}x${shape.bandHeight}`,
      );
    },
  );
});

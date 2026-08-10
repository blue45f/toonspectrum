import { describe, expect, it, vi } from "vitest";

import {
  STUDIO_BG3D_ARTIFACT_CAPTURE_KIND,
  STUDIO_BG3D_ARTIFACT_CAPTURE_PROFILE,
  STUDIO_BG3D_ARTIFACT_CAPTURE_VERSION,
  STUDIO_BG3D_BEAUTY_RGBA8_PROFILE,
  STUDIO_BG3D_DEPTH_FLOAT32_PROFILE,
} from "./studio-bg3d-artifact-capture-v2";
import {
  STUDIO_BG3D_BABYLON_DEVICE_LOSS_SIGNAL,
  StudioBg3dBabylonSpecialistError,
  createStudioBg3dBabylonSpecialistRuntime,
  sanitizeStudioBg3dBabylonSpecialistResult,
  type StudioBg3dBabylonEngineHandle,
  type StudioBg3dBabylonObservableLike,
  type StudioBg3dBabylonRuntimeBindings,
  type StudioBg3dBabylonSceneHandle,
} from "./studio-bg3d-babylon-specialist-runtime";
import {
  createStudioBg3dRuntimeSnapshot,
  type StudioBg3dRuntimeAdapterJob,
  type StudioBg3dSpecialistRequest,
} from "./studio-bg3d-runtime-adapter";
import { DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT } from "./studio-bg3d-scene-document";

class FakeCanvas extends EventTarget {
  width = 64;
  height = 64;
}

class FakeObservable implements StudioBg3dBabylonObservableLike {
  readonly callbacks = new Set<() => void>();

  add(callback: () => void): unknown {
    this.callbacks.add(callback);
    return callback;
  }

  remove(observer: unknown): unknown {
    return this.callbacks.delete(observer as () => void);
  }

  emit(): void {
    for (const callback of [...this.callbacks]) callback();
  }
}

class FakeEngine implements StudioBg3dBabylonEngineHandle {
  readonly deviceLoss = deferred<unknown>();
  readonly [STUDIO_BG3D_BABYLON_DEVICE_LOSS_SIGNAL] = this.deviceLoss.promise;
  readonly onContextLostObservable = new FakeObservable();
  readonly onContextRestoredObservable = new FakeObservable();
  readonly dispose = vi.fn();
}

class FakeScene implements StudioBg3dBabylonSceneHandle {
  readonly dispose = vi.fn();
}

interface BindingHarness {
  readonly bindings: StudioBg3dBabylonRuntimeBindings;
  readonly engines: FakeEngine[];
  readonly scenes: FakeScene[];
  readonly webGl: ReturnType<typeof vi.fn>;
  readonly webGpu: ReturnType<typeof vi.fn>;
}

function bindingHarness(): BindingHarness {
  const engines: FakeEngine[] = [];
  const scenes: FakeScene[] = [];
  const webGl = vi.fn(() => {
    const engine = new FakeEngine();
    engines.push(engine);
    return engine;
  });
  const webGpu = vi.fn(async () => {
    const engine = new FakeEngine();
    engines.push(engine);
    return engine;
  });
  return {
    engines,
    scenes,
    webGl,
    webGpu,
    bindings: {
      createWebGlEngine: webGl,
      createWebGpuEngine: webGpu,
      createScene() {
        const scene = new FakeScene();
        scenes.push(scene);
        return scene;
      },
    },
  };
}

const snapshot = createStudioBg3dRuntimeSnapshot(
  DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
  new Map(),
);

function job(
  id: string,
  request: StudioBg3dSpecialistRequest = { kind: "runtime-metrics" },
  signal: AbortSignal = new AbortController().signal,
): StudioBg3dRuntimeAdapterJob {
  return { id, request, signal, snapshot };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

describe("Studio Babylon isolated specialist runtime", () => {
  it("loads bindings and creates its WebGL engine only on the first serialized job", async () => {
    const harness = bindingHarness();
    const loadBindings = vi.fn(async () => harness.bindings);
    const runtime = createStudioBg3dBabylonSpecialistRuntime({
      canvas: new FakeCanvas() as unknown as HTMLCanvasElement,
      loadBindings,
    });

    expect(runtime.runtimeId).toBe("babylon-webgl-lab");
    expect(loadBindings).not.toHaveBeenCalled();
    expect(runtime.getState()).toMatchObject({
      engineInitialized: false,
      epoch: 0,
      status: "idle",
    });

    await expect(runtime.runIsolated(job("first"))).resolves.toEqual({
      kind: "metrics",
      values: {
        backend: "webgl2",
        engine: "babylon",
        epoch: 1,
        initialized: true,
      },
    });
    await expect(runtime.runIsolated(job("second"))).resolves.toMatchObject({
      kind: "metrics",
      values: { epoch: 2 },
    });

    expect(loadBindings).toHaveBeenCalledOnce();
    expect(harness.webGl).toHaveBeenCalledOnce();
    expect(harness.webGl).toHaveBeenCalledWith(
      expect.any(FakeCanvas),
      expect.objectContaining({ failIfMajorPerformanceCaveat: true }),
    );
    expect(harness.webGpu).not.toHaveBeenCalled();
    expect(harness.scenes).toHaveLength(2);
    expect(harness.scenes.every((scene) => scene.dispose.mock.calls.length === 1)).toBe(true);

    await runtime.dispose();
    expect(harness.engines[0]?.dispose).toHaveBeenCalledOnce();
  });

  it("allows only an explicit caller to relax the major-performance-caveat diagnostic gate", async () => {
    const harness = bindingHarness();
    const canvas = new FakeCanvas() as unknown as HTMLCanvasElement;
    const runtime = createStudioBg3dBabylonSpecialistRuntime({
      canvas,
      loadBindings: async () => harness.bindings,
      settings: { failIfMajorPerformanceCaveat: false },
    });

    await runtime.runIsolated(job("software-diagnostic"));

    expect(harness.webGl).toHaveBeenCalledWith(
      canvas,
      expect.objectContaining({ failIfMajorPerformanceCaveat: false }),
    );
    await runtime.dispose();
  });

  it("uses the separately identified WebGPU initialization path only when explicitly requested", async () => {
    const harness = bindingHarness();
    const runtime = createStudioBg3dBabylonSpecialistRuntime({
      backend: "webgpu",
      canvas: new FakeCanvas() as unknown as HTMLCanvasElement,
      loadBindings: async () => harness.bindings,
    });

    expect(runtime.runtimeId).toBe("babylon-webgpu-lab");
    await expect(runtime.runIsolated(job("webgpu"))).resolves.toMatchObject({
      kind: "metrics",
      values: { backend: "webgpu" },
    });
    expect(harness.webGpu).toHaveBeenCalledOnce();
    expect(harness.webGl).not.toHaveBeenCalled();
    await runtime.dispose();
  });

  it("fails closed when a WebGPU binding omits the direct GPUDevice.lost signal", async () => {
    const harness = bindingHarness();
    const engine: StudioBg3dBabylonEngineHandle = {
      onContextLostObservable: new FakeObservable(),
      onContextRestoredObservable: new FakeObservable(),
      dispose: vi.fn(),
    };
    const runtime = createStudioBg3dBabylonSpecialistRuntime({
      backend: "webgpu",
      canvas: new FakeCanvas() as unknown as HTMLCanvasElement,
      loadBindings: async () => ({
        ...harness.bindings,
        createWebGpuEngine: async () => engine,
      }),
    });

    await expect(runtime.runIsolated(job("missing-device-loss-signal"))).rejects.toMatchObject({
      cause: { message: "Babylon WebGPU binding did not expose GPUDevice.lost." },
      code: "engine-init-failed",
    });
    expect(engine.dispose).toHaveBeenCalledOnce();
    expect(runtime.getState()).toMatchObject({ engineInitialized: false, status: "idle" });
    await runtime.dispose();
    expect(engine.dispose).toHaveBeenCalledOnce();
  });

  it("aborts a pending WebGPU initialization and disposes a late engine result", async () => {
    const harness = bindingHarness();
    const initialization = deferred<StudioBg3dBabylonEngineHandle>();
    harness.webGpu.mockImplementationOnce(() => initialization.promise);
    const controller = new AbortController();
    const runtime = createStudioBg3dBabylonSpecialistRuntime({
      backend: "webgpu",
      canvas: new FakeCanvas() as unknown as HTMLCanvasElement,
      loadBindings: async () => harness.bindings,
    });

    const pending = runtime.runIsolated(job(
      "webgpu-abort",
      { kind: "runtime-metrics" },
      controller.signal,
    ));
    await vi.waitFor(() => expect(harness.webGpu).toHaveBeenCalledOnce());
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: "aborted" });

    const lateEngine = new FakeEngine();
    initialization.resolve(lateEngine);
    await vi.waitFor(() => expect(lateEngine.dispose).toHaveBeenCalledOnce());
    expect(runtime.getState().engineInitialized).toBe(false);
    await runtime.dispose();
  });

  it("bounds an explicit engine initialization budget and disposes a result that arrives late", async () => {
    const harness = bindingHarness();
    const initialization = deferred<StudioBg3dBabylonEngineHandle>();
    harness.webGpu.mockImplementationOnce(() => initialization.promise);

    expect(() => createStudioBg3dBabylonSpecialistRuntime({
      backend: "webgpu",
      canvas: new FakeCanvas() as unknown as HTMLCanvasElement,
      engineInitializationTimeoutMs: 999,
      loadBindings: async () => harness.bindings,
    })).toThrow(RangeError);
    expect(() => createStudioBg3dBabylonSpecialistRuntime({
      backend: "webgpu",
      canvas: new FakeCanvas() as unknown as HTMLCanvasElement,
      engineInitializationTimeoutMs: 60_001,
      loadBindings: async () => harness.bindings,
    })).toThrow(RangeError);

    vi.useFakeTimers();
    try {
      const runtime = createStudioBg3dBabylonSpecialistRuntime({
        backend: "webgpu",
        canvas: new FakeCanvas() as unknown as HTMLCanvasElement,
        engineInitializationTimeoutMs: 1_000,
        loadBindings: async () => harness.bindings,
      });
      const pending = runtime.runIsolated(job("bounded-webgpu-initialization"));
      await vi.advanceTimersByTimeAsync(999);
      expect(harness.webGpu).toHaveBeenCalledOnce();

      const rejection = expect(pending).rejects.toMatchObject({
        code: "engine-init-failed",
        cause: {
          message: "Babylon engine initialization exceeded 1000 milliseconds.",
          name: "TimeoutError",
        },
      });
      await vi.advanceTimersByTimeAsync(1);
      await rejection;
      expect(runtime.getState()).toMatchObject({
        engineInitialized: false,
        status: "idle",
      });

      const lateEngine = new FakeEngine();
      initialization.resolve(lateEngine);
      await vi.advanceTimersByTimeAsync(0);
      expect(lateEngine.dispose).toHaveBeenCalledOnce();
      await runtime.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("serializes direct adapter calls and gives each fresh scene a monotonic epoch", async () => {
    const harness = bindingHarness();
    const firstRelease = deferred<void>();
    const epochs: number[] = [];
    let active = 0;
    let maximumActive = 0;
    const runtime = createStudioBg3dBabylonSpecialistRuntime({
      canvas: new FakeCanvas() as unknown as HTMLCanvasElement,
      loadBindings: async () => harness.bindings,
      async execute(context) {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        epochs.push(context.epoch);
        if (context.job.id === "first") await firstRelease.promise;
        active -= 1;
        return { kind: "metrics", values: { id: context.job.id } };
      },
    });

    const first = runtime.runIsolated(job("first"));
    const second = runtime.runIsolated(job("second"));
    await vi.waitFor(() => expect(runtime.getState().activeJobId).toBe("first"));
    expect(runtime.getState().queuedJobs).toBe(2);
    expect(harness.scenes).toHaveLength(1);

    firstRelease.resolve();
    await expect(first).resolves.toMatchObject({ values: { id: "first" } });
    await expect(second).resolves.toMatchObject({ values: { id: "second" } });
    expect(maximumActive).toBe(1);
    expect(epochs).toEqual([1, 2]);
    expect(harness.scenes).toHaveLength(2);
    await runtime.dispose();
  });

  it("does not initialize for pre-aborted work and aborts an active scene without leaking it", async () => {
    const harness = bindingHarness();
    const loadBindings = vi.fn(async () => harness.bindings);
    const started = deferred<void>();
    const runtime = createStudioBg3dBabylonSpecialistRuntime({
      canvas: new FakeCanvas() as unknown as HTMLCanvasElement,
      loadBindings,
      execute(context) {
        started.resolve();
        return new Promise((_resolve, reject) => {
          context.signal.addEventListener(
            "abort",
            () => reject(new DOMException("aborted", "AbortError")),
            { once: true },
          );
        });
      },
    });
    const preAborted = new AbortController();
    preAborted.abort();

    await expect(runtime.runIsolated(job(
      "pre-aborted",
      { kind: "runtime-metrics" },
      preAborted.signal,
    ))).rejects.toMatchObject({ code: "aborted" });
    expect(loadBindings).not.toHaveBeenCalled();

    const controller = new AbortController();
    const pending = runtime.runIsolated(job(
      "active",
      { kind: "runtime-metrics" },
      controller.signal,
    ));
    await started.promise;
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: "aborted" });
    expect(harness.scenes[0]?.dispose).toHaveBeenCalledOnce();
    await runtime.dispose();
  });

  it("blocks WebGL work after canvas loss, disposes the invalid engine, and recreates after restore", async () => {
    const canvas = new FakeCanvas();
    const harness = bindingHarness();
    const started = deferred<void>();
    const runtime = createStudioBg3dBabylonSpecialistRuntime({
      canvas: canvas as unknown as HTMLCanvasElement,
      loadBindings: async () => harness.bindings,
      execute(context) {
        if (context.job.id === "after-restore") {
          return { kind: "metrics", values: { restored: true } };
        }
        started.resolve();
        return new Promise((_resolve, reject) => {
          context.signal.addEventListener(
            "abort",
            () => reject(new DOMException("context lost", "AbortError")),
            { once: true },
          );
        });
      },
    });

    const pending = runtime.runIsolated(job("during-loss"));
    await started.promise;
    const lost = new Event("webglcontextlost", { cancelable: true });
    canvas.dispatchEvent(lost);
    expect(lost.defaultPrevented).toBe(true);
    await expect(pending).rejects.toMatchObject({ code: "context-lost" });
    expect(harness.engines[0]?.dispose).toHaveBeenCalledOnce();
    expect(runtime.getState()).toMatchObject({
      contextLost: true,
      engineInitialized: false,
      status: "context-lost",
    });
    await expect(runtime.runIsolated(job("blocked"))).rejects.toMatchObject({
      code: "context-lost",
    });

    canvas.dispatchEvent(new Event("webglcontextrestored"));
    await expect(runtime.runIsolated(job("after-restore"))).resolves.toMatchObject({
      values: { restored: true },
    });
    expect(harness.webGl).toHaveBeenCalledTimes(2);
    await runtime.dispose();
  });

  it("defers lost WebGPU disposal until active work settles and recreates exactly once", async () => {
    const harness = bindingHarness();
    const started = deferred<void>();
    const observedAbort = deferred<void>();
    const releaseAfterLoss = deferred<void>();
    const runtime = createStudioBg3dBabylonSpecialistRuntime({
      backend: "webgpu",
      canvas: new FakeCanvas() as unknown as HTMLCanvasElement,
      loadBindings: async () => harness.bindings,
      async execute(context) {
        if (context.job.id === "retry") {
          return { kind: "metrics", values: { retried: true } };
        }
        started.resolve();
        context.signal.addEventListener("abort", () => observedAbort.resolve(), { once: true });
        await releaseAfterLoss.promise;
        throw new DOMException("device lost", "AbortError");
      },
    });

    const first = runtime.runIsolated(job("device-loss"));
    await started.promise;
    harness.engines[0]?.deviceLoss.resolve({ reason: "unknown" });
    await observedAbort.promise;
    const stateAtLoss = runtime.getState();
    expect(stateAtLoss).toMatchObject({
      activeJobId: "device-loss",
      contextLost: true,
      engineInitialized: false,
      status: "context-lost",
    });
    expect(harness.engines[0]?.dispose).not.toHaveBeenCalled();
    harness.engines[0]?.onContextLostObservable.emit();
    expect(runtime.getState().epoch).toBe(stateAtLoss.epoch);

    releaseAfterLoss.resolve();
    await expect(first).rejects.toMatchObject({ code: "context-lost" });
    expect(harness.engines[0]?.dispose).toHaveBeenCalledOnce();
    expect(runtime.getState()).toMatchObject({
      contextLost: false,
      engineInitialized: false,
      status: "idle",
    });

    await expect(runtime.runIsolated(job("retry"))).resolves.toMatchObject({
      values: { retried: true },
    });
    expect(harness.webGpu).toHaveBeenCalledTimes(2);
    await runtime.dispose();
    expect(harness.engines[0]?.dispose).toHaveBeenCalledOnce();
    expect(harness.engines[1]?.dispose).toHaveBeenCalledOnce();

    const epochAfterDispose = runtime.getState().epoch;
    harness.engines[1]?.deviceLoss.resolve({ reason: "destroyed" });
    await Promise.resolve();
    expect(runtime.getState()).toMatchObject({
      disposed: true,
      epoch: epochAfterDispose,
      status: "disposed",
    });
    expect(harness.engines[1]?.dispose).toHaveBeenCalledOnce();
  });

  it("aborts active work on idempotent disposal and rejects every later job", async () => {
    const harness = bindingHarness();
    const started = deferred<void>();
    const runtime = createStudioBg3dBabylonSpecialistRuntime({
      canvas: new FakeCanvas() as unknown as HTMLCanvasElement,
      loadBindings: async () => harness.bindings,
      execute(context) {
        started.resolve();
        return new Promise((_resolve, reject) => {
          context.signal.addEventListener(
            "abort",
            () => reject(new DOMException("disposed", "AbortError")),
            { once: true },
          );
        });
      },
    });

    const pending = runtime.runIsolated(job("active"));
    await started.promise;
    const firstDispose = runtime.dispose();
    const secondDispose = runtime.dispose();
    expect(secondDispose).toBe(firstDispose);
    await expect(pending).rejects.toMatchObject({ code: "disposed" });
    await firstDispose;
    expect(runtime.getState()).toMatchObject({ disposed: true, status: "disposed" });
    expect(harness.scenes[0]?.dispose).toHaveBeenCalledOnce();
    expect(harness.engines[0]?.dispose).toHaveBeenCalledOnce();
    await expect(runtime.runIsolated(job("late"))).rejects.toMatchObject({ code: "disposed" });
  });
});

describe("Studio Babylon portable result sanitizer", () => {
  it("admits only the exact requested v2 artifact set and returns defensive owned buffers", () => {
    const source = Uint8Array.from([1, 2, 3, 4]);
    const request = {
      kind: "artifact-capture-v2",
      version: STUDIO_BG3D_ARTIFACT_CAPTURE_VERSION,
      width: 1,
      height: 1,
      artifacts: [{ kind: "beauty", profile: STUDIO_BG3D_BEAUTY_RGBA8_PROFILE }],
    } as const;
    const value = {
      kind: STUDIO_BG3D_ARTIFACT_CAPTURE_KIND,
      version: STUDIO_BG3D_ARTIFACT_CAPTURE_VERSION,
      profile: STUDIO_BG3D_ARTIFACT_CAPTURE_PROFILE,
      width: 1,
      height: 1,
      artifacts: [{
        kind: "beauty",
        profile: STUDIO_BG3D_BEAUTY_RGBA8_PROFILE,
        width: 1,
        height: 1,
        data: source,
      }],
    } as const;
    const result = sanitizeStudioBg3dBabylonSpecialistResult(value, request);
    source[0] = 255;

    expect(result).toMatchObject({
      kind: STUDIO_BG3D_ARTIFACT_CAPTURE_KIND,
      width: 1,
      height: 1,
      artifacts: [{ kind: "beauty", data: Uint8Array.from([1, 2, 3, 4]) }],
    });
    expect(() => sanitizeStudioBg3dBabylonSpecialistResult(
      value,
      {
        ...request,
        artifacts: [{ kind: "depth", profile: STUDIO_BG3D_DEPTH_FLOAT32_PROFILE }],
      },
    )).toThrow(StudioBg3dBabylonSpecialistError);
    expect(() => sanitizeStudioBg3dBabylonSpecialistResult(
      { ...value, width: 2 },
      request,
    )).toThrow(StudioBg3dBabylonSpecialistError);
  });

  it("copies capture buffers, validates depth, and normalizes transform quaternions", () => {
    const rgba = Uint8Array.from([1, 2, 3, 4]);
    const depth = Float32Array.from([0.25]);
    const capture = sanitizeStudioBg3dBabylonSpecialistResult(
      { kind: "capture", width: 1, height: 1, rgba, depthFloat32: depth },
      { kind: "capture", width: 1, height: 1 },
    );
    rgba[0] = 255;
    depth[0] = 1;

    expect(capture).toEqual({
      kind: "capture",
      width: 1,
      height: 1,
      rgba: Uint8Array.from([1, 2, 3, 4]),
      depthFloat32: Float32Array.from([0.25]),
    });
    expect(sanitizeStudioBg3dBabylonSpecialistResult(
      {
        kind: "transforms",
        samples: [{ nodeId: "prop", position: [1, 2, 3], rotation: [0, 0, 0, 2] }],
      },
      {
        kind: "physics-preview",
        durationSeconds: 1,
        stepSeconds: 1 / 60,
        gravity: [0, -9.8, 0],
      },
    )).toEqual({
      kind: "transforms",
      samples: [{ nodeId: "prop", position: [1, 2, 3], rotation: [0, 0, 0, 1] }],
    });
  });

  it("rejects aliased, mismatched, non-finite, accessor-backed, and unknown results", () => {
    const request = { kind: "capture", width: 1, height: 1 } as const;
    const mismatched = () => sanitizeStudioBg3dBabylonSpecialistResult(
      { kind: "capture", width: 2, height: 1, rgba: new Uint8Array(8) },
      request,
    );
    const badDepth = () => sanitizeStudioBg3dBabylonSpecialistResult(
      {
        kind: "capture",
        width: 1,
        height: 1,
        rgba: new Uint8Array(4),
        depthFloat32: Float32Array.from([Number.NaN]),
      },
      request,
    );
    const accessor = Object.defineProperty({}, "kind", {
      enumerable: true,
      get() {
        return "metrics";
      },
    });

    expect(mismatched).toThrow(StudioBg3dBabylonSpecialistError);
    expect(badDepth).toThrow(StudioBg3dBabylonSpecialistError);
    expect(() => sanitizeStudioBg3dBabylonSpecialistResult(accessor, request))
      .toThrow(StudioBg3dBabylonSpecialistError);
    expect(() => sanitizeStudioBg3dBabylonSpecialistResult({ kind: "other" }, request))
      .toThrow(StudioBg3dBabylonSpecialistError);
  });
});
